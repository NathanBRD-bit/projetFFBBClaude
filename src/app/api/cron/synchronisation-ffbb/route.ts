import { verifierSecretCron } from "@/auth/secret-cron";
import { obtenirBase } from "@/infrastructure/bdd/client";
import { alerterEquipe, alerterPanne } from "@/infrastructure/ffbb/alerte";
import { assainirMessage } from "@/infrastructure/ffbb/assainissement";
import {
  synchroniser,
  type DeclencheurSynchronisation,
  type ResumeSynchronisation,
} from "@/infrastructure/ffbb/synchronisation";

/**
 * Route de déclenchement de la synchronisation FFBB.
 *
 * Elle ne contient **aucune logique métier** : elle authentifie, appelle
 * `synchroniser()` et traduit son statut en code HTTP. Tout ce qui décide se
 * trouve en amont (T04 à T06) ; tout ce qui authentifie se trouve dans
 * `src/auth/secret-cron.ts`. Ce qui reste ici est la frontière HTTP, et elle est
 * volontairement mince.
 *
 * ## Codes de retour, et pourquoi ils comptent
 *
 * | Statut de la synchronisation | HTTP |
 * |---|---|
 * | `succes`  | 200 |
 * | `partiel` | 200 |
 * | `echec`   | 500 |
 *
 * Le workflow GitHub Actions n'inspecte **que** le code HTTP : c'est lui qui doit
 * rougir et envoyer le mail d'alerte de secours. Un `echec` renvoyé en 200 avec
 * un joli message d'erreur dans le corps serait exactement le bug silencieux que
 * ce projet refuse — personne ne lit le corps d'une réponse d'un cron qui passe.
 *
 * `partiel` reste en 200 à dessein : quelques documents écartés sur plusieurs
 * centaines, c'est la dégradation prévue par le plan, pas une panne. L'équipe en
 * est prévenue par l'alerte, pas par un workflow rouge toutes les deux heures —
 * une alerte qui crie sans arrêt finit par n'être plus lue.
 *
 * ## Ce que la réponse ne contient pas
 *
 * Ni secret, ni URL, ni nom d'hôte, ni trace d'exécution. Cette route est
 * publiquement joignable : le 401 ne dit pas pourquoi il refuse, et le 500 ne
 * décrit pas l'infrastructure. Le diagnostic complet vit dans
 * `journal_synchronisation`, que `journalId` permet d'aller lire, et dans les
 * journaux du serveur.
 */

// Node et non Edge : `synchroniser()` ouvre une transaction Postgres et
// `secret-cron.ts` utilise `node:crypto`.
export const runtime = "nodejs";

// Le client FFBB s'accorde déjà un budget total de 45 s (BUDGET_TOTAL_MS) ; 60 s
// est le plafond du plan Hobby, et laisse la marge d'écriture en base.
export const maxDuration = 60;

// Jamais de mise en cache : chaque appel doit réellement synchroniser.
export const dynamic = "force-dynamic";

/**
 * Code FFBB du club. Constante locale et non variable d'environnement : ce n'est
 * ni un secret ni un réglage d'environnement, c'est l'identité du club, et une
 * variable mal renseignée synchroniserait silencieusement le calendrier d'un
 * autre club.
 */
const CODE_CLUB_FFBB = "PDL0049077";

/** En-tête par lequel un appelant s'annonce. Voir `declencheurDe`. */
const EN_TETE_DECLENCHEUR = "x-declencheur";

/** Posé par Vercel Cron sur les requêtes qu'il émet. */
const EN_TETE_CRON_VERCEL = "x-vercel-cron";

/**
 * Corps unique de tous les refus. Le motif exact part au journal du serveur et
 * jamais ici : distinguer « secret absent » de « secret faux » apprendrait à un
 * inconnu l'état de notre configuration.
 */
const CORPS_REFUS = { erreur: "Non autorisé." };

/** Longueur du message d'erreur recopiée dans la réponse. */

/**
 * Qui a déclenché cette exécution, tel qu'il sera écrit au journal.
 *
 * Vercel Cron s'annonce par son propre en-tête ; GitHub Actions et le
 * back-office posent `x-declencheur` explicitement. Un appel qui ne s'annonce pas
 * — un `curl` lancé à la main — est un déclenchement manuel : ce n'est pas une
 * valeur par défaut qui masque une absence, c'est la bonne réponse.
 */
function declencheurDe(requete: Request): DeclencheurSynchronisation {
  // Deux signatures pour le cron Vercel, et non une. L'en-tête `x-vercel-cron`
  // n'est pas garanti par la documentation ; l'agent utilisateur `vercel-cron`,
  // lui, est observable. Se fier au seul en-tête ferait journaliser chaque
  // exécution nocturne comme un déclenchement « manuel », et la colonne
  // `declencheur` ne distinguerait plus rien — une donnée fausse et silencieuse.
  const agent = requete.headers.get("user-agent") ?? "";
  if (requete.headers.get(EN_TETE_CRON_VERCEL) !== null || /vercel-cron/i.test(agent)) {
    return "cron_vercel";
  }
  const annonce = requete.headers.get(EN_TETE_DECLENCHEUR);
  if (annonce === "cron_vercel" || annonce === "github_actions" || annonce === "manuel") {
    return annonce;
  }
  return "manuel";
}

function reponseJson(corps: unknown, statut: number): Response {
  return Response.json(corps, {
    status: statut,
    headers: { "cache-control": "no-store" },
  });
}

/** Le résumé, amputé de tout ce qui ne regarde pas l'appelant. */
function corpsDeReponse(resume: ResumeSynchronisation): Record<string, unknown> {
  return {
    statut: resume.statut,
    journalId: resume.journalId,
    dureeMs: resume.dureeMs,
    compteurs: resume.compteurs,
    messageErreur: assainirMessage(resume.messageErreur),
  };
}

async function traiter(requete: Request): Promise<Response> {
  const verification = verifierSecretCron(requete.headers.get("authorization"));
  if (!verification.autorise) {
    // `error` et non `warn` pour la variable manquante : c'est une panne de
    // déploiement, pas un appelant fautif, et elle doit se repérer dans les
    // journaux Vercel sans être filtrée avec le bruit des scanners.
    if (verification.motif === "secret_non_configure") {
      console.error(`[cron synchronisation-ffbb] ${verification.explication}`);
    } else {
      console.warn(
        `[cron synchronisation-ffbb] appel refusé (${verification.motif}) : ${verification.explication}`,
      );
    }
    return reponseJson(CORPS_REFUS, 401);
  }

  // Constat de review : `synchroniser()` ne lève **pas toujours**. Il ouvre le
  // journal en base *avant* son propre `try`, et `obtenirBase()` lève si
  // `DATABASE_URL` manque. Autrement dit, la panne qui échappait à cette route
  // était précisément la plus grave : base injoignable ou non configurée.
  //
  // Sans ce `try`, Next répondait son propre 500 en HTML, sans `cache-control`,
  // sans identifiant de journal — et surtout **sans déclencher l'alerte**. Une
  // coupure totale de la base restait donc muette côté Slack, ce qui est le
  // contraire de ce qu'on attend d'une alerte.
  try {
    const resume = await synchroniser({
      base: obtenirBase(),
      codeClubFfbb: CODE_CLUB_FFBB,
      declencheur: declencheurDe(requete),
      alerter: alerterEquipe,
    });

    return reponseJson(corpsDeReponse(resume), resume.statut === "echec" ? 500 : 200);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    console.error(`[cron synchronisation-ffbb] panne avant journalisation : ${message}`);

    // On n'invente pas de faux résumé pour faire semblant d'avoir un journal :
    // `alerterPanne` dit ce qu'on sait, et rien de plus. Elle ne rejette jamais,
    // donc elle ne peut pas masquer la panne d'origine.
    await alerterPanne(message);

    return reponseJson(
      {
        statut: "echec",
        journalId: null,
        messageErreur: assainirMessage(message),
      },
      500,
    );
  }
}

/** Vercel Cron et GitHub Actions appellent en GET. */
export async function GET(requete: Request): Promise<Response> {
  return await traiter(requete);
}

/** POST pour le déclenchement manuel (back-office, `curl`). */
export async function POST(requete: Request): Promise<Response> {
  return await traiter(requete);
}
