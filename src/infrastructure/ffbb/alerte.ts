import type { ResumeSynchronisation } from "./synchronisation";

/**
 * Alerte d'échec de la synchronisation FFBB.
 *
 * `synchroniser()` appelle son crochet `alerter` dès que le statut n'est pas
 * `succes`. Ce module en fournit l'implémentation par défaut : un message court
 * poussé sur un webhook quand `WEBHOOK_ALERTE` est configurée, sinon écrit sur la
 * sortie d'erreur — qui est, sur Vercel comme sur GitHub Actions, un journal
 * consultable.
 *
 * ## La règle qui commande tout ce fichier
 *
 * **Une alerte qui plante ne doit jamais faire échouer la synchronisation.** Un
 * `partiel` où 240 matchs sur 241 ont été importés reste un `partiel`, même si le
 * webhook est injoignable : perdre l'import à cause du messager serait absurde.
 *
 * La fonction renvoyée ne rejette donc **jamais**. Ce n'est pas une erreur avalée
 * pour autant : chaque échec d'envoi part sur la sortie d'erreur, accompagné du
 * message d'alerte d'origine. Sinon le webhook en panne effacerait précisément
 * l'information qu'il était chargé de transmettre.
 *
 * Cette garantie est portée ici, et pas dans `synchronisation.ts` : celui-ci
 * `await`-e le crochet sans filet, à dessein — un crochet fourni par un appelant
 * est sous la responsabilité de cet appelant.
 */

/** Nom de la variable d'environnement portant l'URL du webhook. Facultative. */
export const NOM_VARIABLE_WEBHOOK = "WEBHOOK_ALERTE";

/**
 * Délai d'expiration de l'envoi. Court : l'alerte est appelée à la toute fin
 * d'une fonction Vercel bornée à 60 s, un webhook lent ne doit pas emporter la
 * réponse HTTP avec lui.
 */
export const DELAI_WEBHOOK_MS = 5_000;

/**
 * Longueur du message d'erreur recopiée dans l'alerte. Le message complet peut
 * énumérer des dizaines de documents écartés ; l'intégralité vit dans
 * `journal_synchronisation`, que `journalId` permet d'aller lire.
 */
export const LONGUEUR_MESSAGE_ERREUR = 300;

export interface DependancesAlerte {
  /** Environnement à lire ; injectable pour ne pas muter `process.env` en test. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Transport HTTP. Par défaut le `fetch` global ; en test, MSW l'intercepte. */
  readonly envoyer?: typeof fetch;
  /** Sortie d'erreur. Par défaut `console.error`, donc stderr. */
  readonly journaliserErreur?: (message: string) => void;
}

function tronquer(message: string): string {
  return message.length <= LONGUEUR_MESSAGE_ERREUR
    ? message
    : `${message.slice(0, LONGUEUR_MESSAGE_ERREUR)}…`;
}

/**
 * Le texte lu par un humain dans Slack, Discord ou le journal. Quatre lignes :
 * ce qui s'est passé, combien, pourquoi, et où aller lire la suite.
 */
export function composerMessageAlerte(resume: ResumeSynchronisation): string {
  const compteurs = Object.entries(resume.compteurs)
    .map(([nom, valeur]) => `${nom}=${String(valeur)}`)
    .join(", ");
  const erreur =
    resume.messageErreur === null
      ? "aucun message d'erreur enregistré"
      : tronquer(resume.messageErreur);

  return [
    `[SOCL] Synchronisation FFBB : ${resume.statut} (${String(resume.dureeMs)} ms)`,
    `Compteurs : ${compteurs}`,
    `Erreur : ${erreur}`,
    `Journal : ${resume.journalId}`,
  ].join("\n");
}

/**
 * Corps envoyé au webhook.
 *
 * `text` et `content` portent le même message : c'est la clé attendue
 * respectivement par Slack / Mattermost et par Discord. Envoyer les deux évite
 * d'avoir à configurer le projet en fonction de l'outil choisi par l'équipe, et
 * les deux services ignorent les clés qu'ils ne connaissent pas. Les champs
 * structurés suivants servent à un webhook maison.
 */
function corpsWebhook(resume: ResumeSynchronisation, message: string): string {
  return JSON.stringify({
    text: message,
    content: message,
    statut: resume.statut,
    journalId: resume.journalId,
    compteurs: resume.compteurs,
  });
}

/**
 * Construit l'implémentation par défaut du crochet `alerter`.
 *
 * @returns une fonction qui **ne rejette jamais** — voir l'en-tête du module.
 */
export function creerAlerte(
  dependances: DependancesAlerte = {},
): (resume: ResumeSynchronisation) => Promise<void> {
  const env = dependances.env ?? process.env;
  const envoyer = dependances.envoyer ?? fetch;
  const journaliserErreur =
    dependances.journaliserErreur ??
    ((message: string) => {
      console.error(message);
    });

  return async (resume: ResumeSynchronisation): Promise<void> => {
    const message = composerMessageAlerte(resume);
    const url = env[NOM_VARIABLE_WEBHOOK];

    // Webhook non configuré : ce n'est pas une panne, c'est le mode par défaut
    // documenté dans `.env.example`. L'alerte part alors sur la sortie d'erreur,
    // où Vercel et GitHub Actions la conservent.
    if (url === undefined || url.trim() === "") {
      journaliserErreur(
        `${message}\n(${NOM_VARIABLE_WEBHOOK} non configurée : alerte écrite sur la sortie d'erreur uniquement.)`,
      );
      return;
    }

    try {
      const reponse = await envoyer(url.trim(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: corpsWebhook(resume, message),
        signal: AbortSignal.timeout(DELAI_WEBHOOK_MS),
      });
      if (!reponse.ok) {
        journaliserErreur(
          `Alerte non délivrée : le webhook ${NOM_VARIABLE_WEBHOOK} a répondu ` +
            `${String(reponse.status)} ${reponse.statusText}. Message qui n'est pas parti :\n${message}`,
        );
      }
    } catch (erreur) {
      // Volontairement large, et c'est le seul endroit du lot où ça l'est : tout
      // ce que peut lever un `fetch` (DNS, TLS, expiration du délai, URL
      // invalide) doit finir en trace lisible plutôt qu'en exception qui
      // remonterait jusqu'à `synchroniser()` et transformerait un `partiel` en
      // `echec`. Rien n'est perdu : l'erreur et le message partent tous deux.
      journaliserErreur(
        `Alerte non délivrée : le webhook ${NOM_VARIABLE_WEBHOOK} est injoignable ` +
          `(${String(erreur)}). Message qui n'est pas parti :\n${message}`,
      );
    }
  };
}

/**
 * Instance par défaut, branchée sur `process.env` et le `fetch` global. C'est
 * elle que la route de synchronisation passe à `synchroniser()`.
 */
export const alerterEquipe = creerAlerte();
