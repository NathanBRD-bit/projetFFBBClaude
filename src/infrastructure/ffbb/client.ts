import type { z } from "zod";

import {
  schemaConfigurationFfbb,
  schemaReponseOrganismes,
  schemaReponseRencontres,
  validerFfbb,
  type JetonsFfbb,
  type OrganismeFfbb,
  type RencontreFfbb,
} from "./schemas";

/**
 * Client HTTP de l'API FFBB.
 *
 * Ce module ne connaît **ni la base de données ni l'environnement** : il reçoit
 * un fournisseur de jetons et fait des requêtes. C'est ce qui le rend testable
 * intégralement avec MSW, sans réseau ni Postgres.
 *
 * Deux points d'entrée, aucun n'ayant de clé d'API à nous :
 * - `GET https://api.ffbb.com/items/configuration` → les jetons publics ;
 * - `POST https://meilisearch-prod.ffbb.app/indexes/<index>/search` → les données.
 */

/* ------------------------------------------------------------------ *
 * Constantes du protocole
 * ------------------------------------------------------------------ */

/**
 * **Requis.** `api.ffbb.com` répond `403 FORBIDDEN` à toute requête dont le
 * `User-Agent` n'est pas celui d'un navigateur — vérifié en requête réelle le
 * 15/09/2026 : la même requête sans cet en-tête renvoie 403, avec lui 200.
 *
 * Ne pas le retirer en croyant nettoyer du code inutile : la synchronisation
 * s'arrête net, et l'erreur ne dit pas d'elle-même que l'en-tête manquait.
 */
export const USER_AGENT_NAVIGATEUR =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/140.0.0.0 Safari/537.36";

export const URL_CONFIGURATION = "https://api.ffbb.com/items/configuration";
export const URL_MEILISEARCH = "https://meilisearch-prod.ffbb.app";
export const INDEX_RENCONTRES = "ffbbserver_rencontres";
export const INDEX_ORGANISMES = "ffbbserver_organismes";

/** Taille de page demandée à Meilisearch. 200 : un club en joue ~250 par saison. */
export const TAILLE_PAGE = 200;

/**
 * Garde-fou dur. Au-delà, on considère que la condition d'arrêt ne fonctionne
 * plus (`limit` renvoyé à 0, curseur qui n'avance pas…) et on **lève** plutôt
 * que de boucler : 20 pages × 200 = 4 000 rencontres, largement au-dessus de ce
 * qu'un club peut jouer en une saison.
 */
export const MAX_PAGES = 20;

/** Délai d'expiration par requête. */
export const DELAI_EXPIRATION_MS = 10_000;

/**
 * Budget **total** d'une pagination, reprises comprises.
 *
 * Le délai par requête ne borne rien à l'échelle de l'appel : 20 pages × 3
 * tentatives × 10 s, plus les attentes de reprise, dépassent les vingt minutes.
 * Or une fonction Vercel est tuée à 60 s (300 s en plan Pro) — la synchronisation
 * serait alors interrompue en vol, sans erreur enregistrée nulle part, ce qui est
 * exactement le genre de panne muette que ce projet refuse. Mieux vaut échouer
 * franchement avant, en disant pourquoi.
 */
export const BUDGET_TOTAL_MS = 45_000;

/**
 * Reprises sur 429 et 5xx **uniquement** : ce sont les seuls statuts où
 * réessayer a un sens. Un 4xx métier ne deviendra pas vrai en insistant.
 */
export const NOMBRE_TENTATIVES = 3;

/**
 * Attente exponentielle 1 s, 2 s, 4 s. Avec `NOMBRE_TENTATIVES = 3`, seules les
 * deux premières marches sont atteintes (la troisième tentative est la dernière,
 * on n'attend pas après elle) ; monter à 4 tentatives activerait le palier 4 s
 * sans autre changement.
 */
export const DELAI_REPRISE_INITIAL_MS = 1_000;

function delaiDeReprise(tentative: number): number {
  return DELAI_REPRISE_INITIAL_MS * 2 ** (tentative - 1);
}

/** Longueur du corps de réponse recopié dans les erreurs. Assez pour diagnostiquer. */
const LONGUEUR_CORPS_JOURNALISE = 500;

/** Code d'organisme FFBB : trois lettres de ligue puis sept chiffres (`PDL0049077`). */
const FORMAT_CODE_ORGANISME = /^[A-Z]{3}\d{7}$/;

/* ------------------------------------------------------------------ *
 * Erreurs
 * ------------------------------------------------------------------ */

export interface ContexteErreurFfbb {
  readonly url: string;
  readonly methode: string;
  readonly statut?: number;
  readonly corps?: string;
}

/**
 * Toute erreur du client porte son contexte : URL, méthode, statut et corps
 * tronqué. Une erreur FFBB qui dirait seulement « échec » obligerait à rejouer
 * la requête à la main pour comprendre.
 */
export class ErreurFfbb extends Error {
  override readonly name = "ErreurFfbb";

  constructor(
    resume: string,
    readonly contexte: ContexteErreurFfbb,
    options?: { cause?: unknown },
  ) {
    const details = [
      `${contexte.methode} ${contexte.url}`,
      contexte.statut === undefined ? undefined : `statut ${String(contexte.statut)}`,
      contexte.corps === undefined ? undefined : `corps « ${contexte.corps} »`,
    ].filter((element): element is string => element !== undefined);
    super(`${resume} — ${details.join(", ")}`, options);
  }
}

function tronquer(corps: string): string {
  return corps.length <= LONGUEUR_CORPS_JOURNALISE
    ? corps
    : `${corps.slice(0, LONGUEUR_CORPS_JOURNALISE)}… (${String(corps.length)} caractères au total)`;
}

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

export interface OptionsTransportFfbb {
  /** Injecté par les tests (MSW l'intercepte de toute façon). */
  readonly fetch?: typeof globalThis.fetch;
  /**
   * Attente entre deux reprises, **injectable**. Les tests passent une fonction
   * qui n'attend pas : personne ne doit patienter 3 s pour vérifier un backoff.
   */
  readonly attendre?: (millisecondes: number) => Promise<void>;
  readonly delaiExpirationMs?: number;
  readonly taillePage?: number;
  /**
   * Budget **total** de l'appel, toutes pages et toutes reprises confondues.
   * Injectable pour les tests.
   */
  readonly budgetTotalMs?: number;
  /** Horloge, injectable pour rendre le budget testable sans attendre. */
  readonly maintenant?: () => number;
}

interface Transport {
  readonly fetch: typeof globalThis.fetch;
  readonly attendre: (millisecondes: number) => Promise<void>;
  readonly delaiExpirationMs: number;
  readonly taillePage: number;
  readonly budgetTotalMs: number;
  readonly maintenant: () => number;
}

/**
 * Attente par défaut. Exportée pour être testable seule, avec les horloges
 * factices de Vitest : aucun test ne doit patienter trois secondes pour vérifier
 * un backoff. Partout ailleurs les tests injectent une attente instantanée et
 * vérifient les **durées demandées**.
 */
export const attendreReellement = (millisecondes: number): Promise<void> =>
  new Promise((resoudre) => setTimeout(resoudre, millisecondes));

function normaliserTransport(options: OptionsTransportFfbb): Transport {
  return {
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    attendre: options.attendre ?? attendreReellement,
    delaiExpirationMs: options.delaiExpirationMs ?? DELAI_EXPIRATION_MS,
    taillePage: options.taillePage ?? TAILLE_PAGE,
    budgetTotalMs: options.budgetTotalMs ?? BUDGET_TOTAL_MS,
    maintenant: options.maintenant ?? Date.now,
  };
}

/** 429 et 5xx : la FFBB est surchargée ou en panne passagère, réessayer a un sens. */
function estRepetable(statut: number): boolean {
  return statut === 429 || statut >= 500;
}

/** 401 et 403 : jetons périmés. Traité à part — invalidation puis **une** reprise. */
function estProblemeDAuthentification(statut: number): boolean {
  return statut === 401 || statut === 403;
}

async function appelUnique(
  url: string,
  init: RequestInit & { method: string },
  transport: Transport,
): Promise<Response> {
  try {
    return await transport.fetch(url, {
      ...init,
      signal: AbortSignal.timeout(transport.delaiExpirationMs),
    });
  } catch (cause) {
    // Panne réseau ou délai dépassé : pas de reprise, l'appelant doit le savoir
    // tout de suite. L'erreur d'origine reste attachée en `cause`.
    throw new ErreurFfbb(
      `Requête FFBB impossible (réseau coupé ou délai de ${String(transport.delaiExpirationMs)} ms dépassé)`,
      { url, methode: init.method },
      { cause },
    );
  }
}

/**
 * Envoie la requête et reprend sur 429/5xx avec une attente exponentielle.
 * Renvoie la **dernière** réponse obtenue, y compris en échec : c'est l'appelant
 * qui décide si un 401 est une erreur fatale ou une invitation à renouveler les
 * jetons.
 */
/**
 * Délai d'attente réclamé par le serveur via `Retry-After`, en millisecondes.
 *
 * Ignorer cet en-tête, c'est brûler ses trois tentatives en trois secondes face à
 * un serveur qui demandait trente secondes de répit — puis recommencer à la page
 * suivante, en martelant une API qui vient justement de demander qu'on la laisse
 * tranquille. La valeur est plafonnée : un `Retry-After` délirant ne doit pas
 * suspendre la synchronisation.
 */
export const RETRY_AFTER_MAX_MS = 30_000;

function delaiReclameParLeServeur(reponse: Response): number | null {
  const entete = reponse.headers.get("retry-after");
  if (entete === null) return null;

  // Forme « secondes » (la seule utilisée en pratique par les CDN et Meilisearch).
  const secondes = Number(entete.trim());
  if (Number.isInteger(secondes) && secondes >= 0) {
    return Math.min(secondes * 1000, RETRY_AFTER_MAX_MS);
  }

  // Forme « date HTTP », plus rare. Une date passée ou illisible ne donne rien :
  // on retombe alors sur l'attente exponentielle plutôt que d'inventer un délai.
  const date = Date.parse(entete);
  if (Number.isNaN(date)) return null;
  const attente = date - Date.now();
  return attente > 0 ? Math.min(attente, RETRY_AFTER_MAX_MS) : 0;
}

async function envoyer(
  url: string,
  init: RequestInit & { method: string },
  transport: Transport,
): Promise<Response> {
  for (let tentative = 1; ; tentative += 1) {
    const reponse = await appelUnique(url, init, transport);
    if (!estRepetable(reponse.status) || tentative >= NOMBRE_TENTATIVES) {
      return reponse;
    }
    const reclame = delaiReclameParLeServeur(reponse);
    // Le corps de la réponse en échec n'est pas lu : on le libère explicitement
    // plutôt que de laisser un flux ouvert derrière soi.
    await reponse.text();
    await transport.attendre(reclame ?? delaiDeReprise(tentative));
  }
}

async function exigerSucces(
  reponse: Response,
  contexte: { url: string; methode: string },
  resume: string,
): Promise<void> {
  if (reponse.ok) return;
  throw new ErreurFfbb(resume, {
    ...contexte,
    statut: reponse.status,
    corps: tronquer(await reponse.text()),
  });
}

async function lireJson(
  reponse: Response,
  contexte: { url: string; methode: string },
): Promise<unknown> {
  const texte = await reponse.text();
  try {
    return JSON.parse(texte) as unknown;
  } catch (cause) {
    throw new ErreurFfbb(
      "Réponse FFBB illisible : JSON invalide ou tronqué",
      { ...contexte, statut: reponse.status, corps: tronquer(texte) },
      { cause },
    );
  }
}

/* ------------------------------------------------------------------ *
 * Jetons publics
 * ------------------------------------------------------------------ */

/**
 * Récupère `key_dh` et `key_ms` depuis la configuration publique.
 *
 * Fonction **sans cache** : la mise en cache 6 h vit dans `jetons.ts`, qui a
 * besoin de la base. Séparer les deux permet de tester celle-ci sans Postgres et
 * celui-là sans réseau.
 */
export async function recupererJetons(options: OptionsTransportFfbb = {}): Promise<JetonsFfbb> {
  const transport = normaliserTransport(options);
  const contexte = { url: URL_CONFIGURATION, methode: "GET" };

  const reponse = await envoyer(
    URL_CONFIGURATION,
    {
      method: "GET",
      headers: {
        // Voir USER_AGENT_NAVIGATEUR : sans lui, 403 garanti.
        "user-agent": USER_AGENT_NAVIGATEUR,
        accept: "application/json",
        origin: "https://competitions.ffbb.com",
        referer: "https://competitions.ffbb.com/",
      },
    },
    transport,
  );

  await exigerSucces(
    reponse,
    contexte,
    reponse.status === 403
      ? "Jetons FFBB refusés (403). Cause quasi certaine : le User-Agent de navigateur a été retiré des en-têtes"
      : "Jetons FFBB indisponibles",
  );

  const brut = await lireJson(reponse, contexte);
  return validerFfbb(schemaConfigurationFfbb, brut, "configuration FFBB").data;
}

/* ------------------------------------------------------------------ *
 * Client authentifié
 * ------------------------------------------------------------------ */

export interface FournisseurDeJetons {
  obtenir: () => Promise<JetonsFfbb>;
  /** Appelée sur 401/403 : le cache est faux, la prochaine lecture doit taper l'API. */
  invalider: () => Promise<void>;
}

export interface ClientFfbb {
  /** Toutes les rencontres de la saison en cours où le club joue, à domicile ou non. */
  listerRencontresDuClub: (codeClub: string) => Promise<RencontreFfbb[]>;
  /** La fiche club, pour ses `engagements_codes`. */
  obtenirOrganisme: (codeClub: string) => Promise<OrganismeFfbb>;
}

function exigerCodeOrganisme(codeClub: string): void {
  if (!FORMAT_CODE_ORGANISME.test(codeClub)) {
    // Le code part tel quel dans un filtre Meilisearch : un code non conforme
    // produirait un 400 illisible, voire un filtre détourné.
    // `ErreurFfbb` et non `Error` : le contrat d'erreur publié par ce module est
    // `ErreurFfbb` / `ErreurValidationFfbb`. Un appelant qui trie ses erreurs avec
    // `instanceof ErreurFfbb` prendrait sinon la mauvaise branche sur un code mal
    // formé, et traiterait un bug de programmation comme un incident de source.
    throw new ErreurFfbb(
      `Code d'organisme FFBB invalide : « ${codeClub} ». Format attendu : trois lettres ` +
        `de ligue puis sept chiffres, par exemple PDL0049077.`,
      { url: URL_MEILISEARCH, methode: "POST" },
    );
  }
}

export function creerClientFfbb(
  jetons: FournisseurDeJetons,
  options: OptionsTransportFfbb = {},
): ClientFfbb {
  const transport = normaliserTransport(options);

  async function interrogerIndex<T extends z.ZodType>(
    index: string,
    corpsRequete: Readonly<Record<string, unknown>>,
    schemaReponse: T,
    contexteValidation: string,
  ): Promise<z.infer<T>> {
    const url = `${URL_MEILISEARCH}/indexes/${index}/search`;
    const contexte = { url, methode: "POST" };

    const construireInit = (jeton: string): RequestInit & { method: string } => ({
      method: "POST",
      headers: {
        authorization: `Bearer ${jeton}`,
        "content-type": "application/json",
        accept: "application/json",
        // Le serveur Meilisearch ne l'exige pas aujourd'hui, contrairement à
        // api.ffbb.com ; on l'envoie quand même pour présenter le même client
        // partout plutôt que de dépendre d'une tolérance non documentée.
        "user-agent": USER_AGENT_NAVIGATEUR,
      },
      body: JSON.stringify(corpsRequete),
    });

    const premiere = await envoyer(url, construireInit((await jetons.obtenir()).key_ms), transport);

    if (!estProblemeDAuthentification(premiere.status)) {
      await exigerSucces(premiere, contexte, `Recherche FFBB refusée sur l'index ${index}`);
      return validerFfbb(schemaReponse, await lireJson(premiere, contexte), contexteValidation);
    }

    // Les jetons publics FFBB tournent. Une seule reprise, après invalidation :
    // si elle échoue aussi, insister ne ferait que marteler l'API.
    await premiere.text();
    await jetons.invalider();

    const seconde = await envoyer(url, construireInit((await jetons.obtenir()).key_ms), transport);
    await exigerSucces(
      seconde,
      contexte,
      `Recherche FFBB toujours refusée sur l'index ${index} après renouvellement des jetons`,
    );
    return validerFfbb(schemaReponse, await lireJson(seconde, contexte), contexteValidation);
  }

  return {
    async listerRencontresDuClub(codeClub: string): Promise<RencontreFfbb[]> {
      exigerCodeOrganisme(codeClub);
      const toutes: RencontreFfbb[] = [];
      const debut = transport.maintenant();

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const ecoule = transport.maintenant() - debut;
        if (ecoule > transport.budgetTotalMs) {
          throw new ErreurFfbb(
            `Budget de synchronisation dépassé : ${String(Math.round(ecoule / 1000))} s écoulées ` +
              `avant la page ${String(page + 1)} (budget ${String(Math.round(transport.budgetTotalMs / 1000))} s). ` +
              `Échec franc plutôt qu'une fonction tuée en vol, sans trace`,
            {
              url: `${URL_MEILISEARCH}/indexes/${INDEX_RENCONTRES}/search`,
              methode: "POST",
            },
          );
        }

        const reponse = await interrogerIndex(
          INDEX_RENCONTRES,
          {
            q: "",
            filter: `idOrganismeEquipe1.code = ${codeClub} OR idOrganismeEquipe2.code = ${codeClub}`,
            limit: transport.taillePage,
            // L'offset suit le **nombre de documents déjà reçus**, pas la taille
            // demandée : si le serveur sert des pages plus courtes que demandé (son
            // propre plafond, une limite ajoutée un jour), calculer l'offset sur
            // `taillePage` sauterait en silence tous les documents intermédiaires.
            // C'est la réponse qui fait foi, ici comme pour la condition d'arrêt.
            offset: toutes.length,
            sort: ["date_timestamp:asc"],
          },
          schemaReponseRencontres,
          `rencontres du club ${codeClub}, page ${String(page + 1)}`,
        );

        toutes.push(...reponse.hits);

        // Page incomplète = dernière page. Un index vide renvoie zéro document
        // dès la première page : c'est un résultat vide, pas une erreur — c'est à
        // la synchronisation (T06) de juger qu'un index vide est suspect.
        if (reponse.hits.length < reponse.limit) {
          return toutes;
        }
      }

      throw new ErreurFfbb(
        `Pagination FFBB interrompue : ${String(MAX_PAGES)} pages pleines de ${String(transport.taillePage)} documents ` +
          `sans jamais atteindre une page incomplète. La condition d'arrêt ne tient plus, ` +
          `on refuse de boucler`,
        { url: `${URL_MEILISEARCH}/indexes/${INDEX_RENCONTRES}/search`, methode: "POST" },
      );
    },

    async obtenirOrganisme(codeClub: string): Promise<OrganismeFfbb> {
      exigerCodeOrganisme(codeClub);

      // `code` n'est pas un attribut filtrable de cet index (l'API répond 400 et
      // liste les attributs autorisés). On passe donc par la recherche plein
      // texte, qui est floue, puis on exige une égalité exacte côté client : pas
      // de « premier résultat » pris au hasard.
      const reponse = await interrogerIndex(
        INDEX_ORGANISMES,
        { q: codeClub, limit: 20, offset: 0 },
        schemaReponseOrganismes,
        `organisme ${codeClub}`,
      );

      const organisme = reponse.hits.find((candidat) => candidat.code === codeClub);
      if (organisme === undefined) {
        throw new ErreurFfbb(
          `Aucune fiche FFBB de code exactement ${codeClub} parmi les ${String(reponse.hits.length)} ` +
            `résultats de la recherche`,
          { url: `${URL_MEILISEARCH}/indexes/${INDEX_ORGANISMES}/search`, methode: "POST" },
        );
      }
      return organisme;
    },
  };
}
