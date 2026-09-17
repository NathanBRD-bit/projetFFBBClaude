import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Authentification des appels de tâches planifiées.
 *
 * Trois appelants légitimes tapent la route de synchronisation : le cron Vercel,
 * le workflow GitHub Actions et le bouton « Synchroniser maintenant » du
 * back-office. Tous présentent le **même** secret partagé, dans un en-tête
 * `Authorization: Bearer <CRON_SECRET>` — c'est le protocole imposé par Vercel
 * Cron, on ne le choisit pas.
 *
 * Ce module ne fait que répondre à « cet en-tête vaut-il le secret ? ». Il ne lit
 * pas `process.env` de lui-même sans qu'on le lui demande, ne journalise pas et
 * ne fabrique pas de réponse HTTP : c'est la route qui décide quoi en faire. On
 * peut donc le tester entièrement, sans serveur ni requête.
 *
 * ## Pourquoi une comparaison en temps constant
 *
 * `enTete === secret` s'arrête au premier octet différent. Le temps de réponse
 * renseigne alors sur le nombre de caractères devinés, et un attaquant peut
 * reconstruire le secret octet par octet. `timingSafeEqual` compare toute la
 * longueur, quoi qu'il arrive.
 *
 * ## Pourquoi on compare des empreintes et non les chaînes elles-mêmes
 *
 * `timingSafeEqual` **lève** si les deux tampons n'ont pas la même longueur : une
 * comparaison naïve planterait sur un secret de longueur différente, c'est-à-dire
 * sur le cas le plus courant. Le réflexe habituel est de comparer les longueurs
 * avant — mais ce test-là n'est pas en temps constant et divulgue la longueur du
 * secret.
 *
 * Passer les deux valeurs par SHA-256 règle les deux problèmes d'un coup : deux
 * empreintes font **toujours** 32 octets, donc `timingSafeEqual` ne peut plus
 * lever, aucune branche ne dépend de la longueur, et rien n'en transpire.
 */

/**
 * Le motif exact d'un refus.
 *
 * Il part au journal du serveur et **jamais** dans la réponse HTTP : dire à
 * l'appelant laquelle des trois causes s'applique lui apprendrait si le secret
 * est configuré et si son format est le bon. Côté serveur en revanche, la
 * distinction est indispensable — `secret_non_configure` est une panne de
 * déploiement, les autres sont des appels illégitimes.
 */
export type MotifRefusCron =
  "secret_non_configure" | "en_tete_absent" | "schema_inattendu" | "secret_invalide";

export type VerificationCron =
  | { readonly autorise: true }
  | {
      readonly autorise: false;
      readonly motif: MotifRefusCron;
      /** Phrase destinée au journal du serveur, jamais à la réponse HTTP. */
      readonly explication: string;
    };

/** Nom de la variable d'environnement portant le secret partagé. */
export const NOM_VARIABLE_SECRET = "CRON_SECRET";

/**
 * Le schéma d'authentification, en minuscules : les noms de schéma HTTP sont
 * insensibles à la casse (RFC 9110 §11.1), et refuser `bearer` parce qu'il n'est
 * pas `Bearer` produirait un 401 incompréhensible.
 */
const SCHEMA_BEARER = "bearer ";

/**
 * Message de la panne de déploiement la plus probable de cette route. Exporté
 * pour être asserté tel quel en test : une erreur qu'on ne sait pas reconnaître
 * est une erreur qu'on ne saura pas diagnostiquer en production.
 */
export const MESSAGE_SECRET_NON_CONFIGURE =
  `${NOM_VARIABLE_SECRET} est absente ou vide dans l'environnement du serveur. ` +
  `Tant qu'elle n'est pas déclarée (dashboard Vercel > Settings > Environment Variables, ` +
  `ou \`.env\` en local), la route de synchronisation refuse **tous** les appels, y compris ` +
  `ceux du cron. Ce n'est pas un problème d'appelant : c'est une variable manquante.`;

function refuser(motif: MotifRefusCron, explication: string): VerificationCron {
  return { autorise: false, motif, explication };
}

/**
 * Compare deux chaînes sans que la durée de la comparaison ne renseigne sur leur
 * contenu ni sur leur longueur. Voir l'en-tête du module pour le raisonnement.
 */
export function egalEnTempsConstant(presentee: string, attendue: string): boolean {
  return timingSafeEqual(empreinte(presentee), empreinte(attendue));
}

function empreinte(valeur: string): Buffer {
  return createHash("sha256").update(valeur, "utf8").digest();
}

/**
 * Vérifie l'en-tête `Authorization` d'un appel de tâche planifiée.
 *
 * L'ordre des contrôles est délibéré : le secret manquant côté serveur est testé
 * **en premier**, parce que c'est le seul des quatre motifs qui accuse notre
 * déploiement et non l'appelant. Le confondre avec un mauvais secret enverrait
 * l'équipe chercher un bug chez GitHub Actions pendant qu'une variable
 * d'environnement manque sur Vercel.
 *
 * @param enTeteAutorisation valeur brute de l'en-tête `Authorization`, `null` s'il est absent.
 * @param env environnement à lire ; injectable pour que les tests n'aient pas à muter `process.env`.
 */
export function verifierSecretCron(
  enTeteAutorisation: string | null,
  env: Readonly<Record<string, string | undefined>> = process.env,
): VerificationCron {
  const secret = env[NOM_VARIABLE_SECRET];
  // Une chaîne vide est traitée comme une absence : une variable déclarée sans
  // valeur n'authentifie personne, et la confondre avec un secret valide
  // ouvrirait la route à qui enverrait `Authorization: Bearer `.
  if (secret === undefined || secret.trim() === "") {
    return refuser("secret_non_configure", MESSAGE_SECRET_NON_CONFIGURE);
  }

  if (enTeteAutorisation === null) {
    return refuser(
      "en_tete_absent",
      "Appel sans en-tête Authorization. Un cron Vercel ou un workflow correctement " +
        "configuré en envoie toujours un.",
    );
  }

  if (!enTeteAutorisation.toLowerCase().startsWith(SCHEMA_BEARER)) {
    return refuser(
      "schema_inattendu",
      "En-tête Authorization présent mais hors schéma `Bearer <secret>`.",
    );
  }

  const presentee = enTeteAutorisation.slice(SCHEMA_BEARER.length);
  if (!egalEnTempsConstant(presentee, secret)) {
    return refuser(
      "secret_invalide",
      `Secret présenté incorrect (${String(presentee.length)} caractère(s) reçu(s)). ` +
        `Vérifier que le secret du dépôt GitHub et la variable ${NOM_VARIABLE_SECRET} ` +
        `de Vercel portent bien la même valeur.`,
    );
  }

  return { autorise: true };
}
