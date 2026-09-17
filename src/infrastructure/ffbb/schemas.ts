import { z } from "zod";

/**
 * Contrat d'entrée de l'API FFBB.
 *
 * L'API n'est **ni publique ni contractuelle** : elle peut changer sans préavis
 * (cf. le tableau des risques du plan). Ces schémas sont la frontière où la
 * donnée entrante est jugée : ce qui passe ici est fiable pour tout le reste du
 * code, ce qui ne passe pas est rejeté **en entier** — jamais à moitié importé.
 *
 * ## Ce que « strict » veut dire ici
 *
 * Strict sur les champs **déclarés** : aucun `any`, aucun `unknown`, aucun
 * `z.record` fourre-tout ; chaque champ a son type exact et sa nullabilité
 * explicite, justifiée par une observation réelle (voir
 * `docs/adr/0002-cle-idempotence-ffbb.md` pour la méthode et l'échantillon).
 *
 * Volontairement **pas** `.strict()` au sens Zod (rejet des clés inconnues) :
 * l'index FFBB gagne des champs régulièrement — `officiels_string` n'est par
 * exemple présent que sur 3 350 des 5 000 documents observés. Refuser un
 * document parce que la FFBB a ajouté une colonne ferait tomber toute la
 * synchronisation sur un changement sans aucune conséquence pour nous. Les clés
 * inconnues sont donc ignorées ; les clés connues, elles, ne pardonnent rien.
 *
 * Aucune conversion de type ici non plus : les scores restent les chaînes que la
 * FFBB envoie (« 71 »), simplement **vérifiées** comme entiers. La conversion et
 * la dérivation du statut appartiennent à la normalisation (T05), qui est pure
 * et testée à part. Ce fichier décrit ce que la FFBB envoie, rien d'autre.
 */

/* ------------------------------------------------------------------ *
 * Jetons publics — GET https://api.ffbb.com/items/configuration
 * ------------------------------------------------------------------ */

/**
 * Seuls `key_dh` (Directus) et `key_ms` (Meilisearch) nous intéressent ; le
 * document en contient une dizaine d'autres (versions des applis mobiles…) qui
 * ne nous concernent pas. `min(1)` parce qu'une clé vide produirait un 401 trois
 * couches plus loin, au lieu d'une erreur ici, à l'endroit du problème.
 */
export const schemaJetonsFfbb = z.object({
  key_dh: z.string().min(1),
  key_ms: z.string().min(1),
});

export const schemaConfigurationFfbb = z.object({
  data: schemaJetonsFfbb,
});

export type JetonsFfbb = z.infer<typeof schemaJetonsFfbb>;
export type ConfigurationFfbb = z.infer<typeof schemaConfigurationFfbb>;

/* ------------------------------------------------------------------ *
 * Briques communes aux index Meilisearch
 * ------------------------------------------------------------------ */

/**
 * Les logos sont servis par l'assets Directus. `null` sur 1 279 des 5 000
 * documents observés — et sur les deux clubs de la seule rencontre du SOCL :
 * un club sans logo est le cas courant en départemental, pas une anomalie.
 */
const schemaLogo = z.object({
  id: z.string().min(1),
  gradient_color: z.string().nullable(),
});

/** GeoJSON tel que renvoyé par la FFBB : `[longitude, latitude]`, dans cet ordre. */
const schemaCoordonnees = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
});

const schemaGeo = z.object({
  lat: z.number(),
  lng: z.number(),
});

const schemaCartographieSalle = z.object({
  ville: z.string(),
  codePostal: z.string(),
  coordonnees: schemaCoordonnees,
});

/**
 * `salle` est `null` sur 240 des 5 000 documents observés : match non encore
 * domicilié, ou plateau jeunes dont le lieu n'est pas saisi. C'est un cas
 * normal, la page match devra l'afficher comme « lieu non communiqué » — surtout
 * pas inventer une salle.
 */
const schemaSalle = z.object({
  id: z.string().min(1),
  libelle: z.string(),
  adresse: z.string(),
  /** Chaîne vide dans l'immense majorité des cas ; la FFBB ne met jamais `null`. */
  adresseComplement: z.string(),
  cartographie: schemaCartographieSalle,
});

/**
 * Un organisme peut manquer sur une rencontre (84 et 103 cas sur 5 000, dont
 * 2 rencontres sans aucun des deux) : plateau « ENT- QUALIFICATION », équipe pas
 * encore engagée. Le rattachement au club se fait sur `code`, donc une rencontre
 * sans organisme ne sera simplement jamais rattachée — pas une erreur de format.
 */
const schemaOrganismeRencontre = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  nom: z.string(),
  /** `null` sur les 5 000 documents observés ; la colonne existe mais n'est pas alimentée. */
  nom_simple: z.string().nullable(),
  /** Chaîne vide hors clubs professionnels. */
  nomClubPro: z.string(),
  logo: schemaLogo.nullable(),
});

const schemaCategorieCompetition = z.object({
  code: z.string().min(1),
  libelle: z.string().min(1),
  ordre: z.number().int(),
});

const schemaCompetition = z.object({
  id: z.string().min(1),
  nom: z.string().min(1),
  code: z.string().min(1),
  slug: z.string().min(1),
  /** « Masculin » | « Féminin » | « Mixte » observés — laissé ouvert : la FFBB peut en ajouter. */
  sexe: z.string().min(1),
  /** « Championnat » | « Coupe » | « Plateau » observés, même raison. */
  typeCompetition: z.string().min(1),
  categorie: schemaCategorieCompetition,
  /** `null` sur les 5 000 documents observés. */
  logo: schemaLogo.nullable(),
});

const schemaPoule = z.object({
  id: z.string().min(1),
  nom: z.string().min(1),
});

const schemaSaison = z.object({
  /** Format « 26-27 ». L'index ne contient que la saison en cours. */
  code: z.string().min(1),
});

/**
 * Officiel désigné (arbitre, marqueur…). `ordre` est `null` sur 46 des 8 512
 * désignations observées et `fonction.libelle` absent sur 2 : la FFBB tolère des
 * désignations incomplètes, notre schéma doit les accepter sans les inventer.
 */
const schemaOfficiel = z.object({
  ordre: z.number().int().nullable(),
  fonction: z.object({ libelle: z.string().optional() }),
  officiel: z.object({ nom: z.string(), prenom: z.string() }),
});

/**
 * Un score FFBB arrive en **chaîne** (« 71 »), jamais en nombre, et vaut `null`
 * tant que la feuille n'est pas remontée. Le `regex` interdit qu'un « F » de
 * forfait ou une chaîne vide passe pour un score : dans ce cas le document
 * entier est rejeté et la synchronisation le compte comme invalide.
 */
const schemaScore = z
  .string()
  .regex(/^\d+$/, "score FFBB attendu en entier positif sous forme de chaîne (ex. « 71 »)")
  .nullable();

/* ------------------------------------------------------------------ *
 * Rencontre — index ffbbserver_rencontres
 * ------------------------------------------------------------------ */

export const schemaRencontreFfbb = z.object({
  /**
   * Clé d'idempotence de la synchronisation. Voir
   * `docs/adr/0002-cle-idempotence-ffbb.md` : c'est `id`, et pas `uniqueKey`,
   * qui s'est révélé non unique sur l'échantillon.
   */
  id: z.string().min(1),

  /** Date de la journée, sans heure : « 2026-09-19 ». */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date attendue au format AAAA-MM-JJ"),
  /**
   * Date **et heure** du coup d'envoi, sans fuseau : « 2026-09-19T11:30:00 ».
   * L'absence de fuseau est le piège du lot : c'est de l'heure locale
   * Europe/Paris, que T05 convertira explicitement.
   */
  date_rencontre: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, "date_rencontre attendue au format ISO local"),
  date_timestamp: z.number().int(),
  date_rencontre_timestamp: z.number().int(),

  /**
   * Drapeau FFBB « rencontre jouée ». Il ne suffit pas à lui seul : un document
   * observé porte `joue: true` avec les deux scores à `null`. C'est précisément
   * le cas que le statut `score_manquant` de T03 nomme.
   */
  joue: z.boolean(),

  nomEquipe1: z.string().min(1),
  nomEquipe2: z.string().min(1),
  resultatEquipe1: schemaScore,
  resultatEquipe2: schemaScore,

  /** Numéro de journée, en chaîne côté FFBB (« 1 », « 61 »). */
  numeroJournee: z.string().min(1),

  /** « 5x5 », ou `null` sur 239 des 5 000 documents observés. */
  pratique: z.string().nullable(),

  /**
   * `idPoule.id_numeroJournee_numeroRencontre`. Conservé pour la clé naturelle
   * de secours, **pas** comme clé d'idempotence : voir l'ADR 0002.
   */
  uniqueKey: z.string().min(1),

  /** Chemin relatif vers la fiche publique FFBB ; se termine toujours par `/<id>`. */
  url_competition: z.string().min(1),

  /** Points de handicap (plateaux jeunes). `null` quand il n'y en a pas. */
  handicap1: z.number().int().nullable(),
  handicap2: z.number().int().nullable(),

  officiels: z.array(schemaOfficiel),

  competitionId: schemaCompetition,
  idPoule: schemaPoule,
  saison: schemaSaison,

  idOrganismeEquipe1: schemaOrganismeRencontre.nullable(),
  idOrganismeEquipe2: schemaOrganismeRencontre.nullable(),

  /** `null` exactement quand `salle` l'est (240 documents sur 5 000). */
  salle: schemaSalle.nullable(),
  _geo: schemaGeo.nullable(),

  /** « Départemental » | « Régional » | « National » | « Pro » observés. */
  niveau: z.string().min(1),
  niveau_nb: z.string().min(1),

  creation_timestamp: z.number().int(),
  /** `null` sur 213 documents : une rencontre jamais retouchée depuis sa création. */
  modification_timestamp: z.number().int().nullable(),
  /** `null` tant qu'aucun résultat n'a été saisi (1 406 documents sur 5 000). */
  dateSaisieResultat_timestamp: z.number().int().nullable(),
});

export type RencontreFfbb = z.infer<typeof schemaRencontreFfbb>;

/* ------------------------------------------------------------------ *
 * Organisme — index ffbbserver_organismes
 * ------------------------------------------------------------------ */

const schemaCartographieOrganisme = z.object({
  ville: z.string(),
  codePostal: z.string(),
  latitude: z.number(),
  longitude: z.number(),
});

/**
 * Fiche club. On ne retient que ce dont le site a besoin : l'identité, la
 * localisation et la liste des engagements.
 *
 * `mail`, `telephone` et `code_emploi` sont volontairement **hors schéma** : ce
 * sont des données de contact et un jeton opaque dont le site public n'a aucun
 * usage. Ce qui n'entre pas dans le schéma n'entre pas en base (docs/rgpd).
 */
export const schemaOrganismeFfbb = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  nom: z.string().min(1),
  /** « Groupement » pour le SOCL ; d'autres valeurs existent (Comité, Ligue…). */
  type: z.string().min(1),
  /** `null` sur les 20 fiches observées ; la colonne existe mais n'est pas alimentée. */
  nom_simple: z.string().nullable(),
  url_competition: z.string().min(1),
  saison_en_cours: z.boolean(),
  /**
   * Engagements de la saison, concaténés en une seule chaîne
   * `CODE | Libellé|CODE | Libellé|…`. C'est la matière première du rattachement
   * équipe ↔ compétition de T13 ; le découpage appartient au domaine, pas ici.
   */
  engagements_codes: z.string(),
  engagements_noms: z.string(),
  offresPratiques: z.array(z.string()),
  /**
   * Nullable bien que présent sur les 20 fiches observées : la même structure
   * est `null` sur 240 salles du même serveur Meilisearch, et un club sans
   * adresse géocodée existe. Mieux vaut l'accepter que rejeter la fiche du club.
   */
  cartographie: schemaCartographieOrganisme.nullable(),
  logo: schemaLogo.nullable(),
  _geo: schemaGeo.nullable(),
});

export type OrganismeFfbb = z.infer<typeof schemaOrganismeFfbb>;

/* ------------------------------------------------------------------ *
 * Enveloppe de réponse Meilisearch
 * ------------------------------------------------------------------ */

/**
 * Enveloppe commune à tous les index. `limit` et `offset` sont relus dans la
 * réponse plutôt que supposés égaux à ce qu'on a demandé : c'est la réponse qui
 * fait foi pour décider si la page est pleine, donc s'il faut en demander une
 * autre.
 */
export function schemaReponseRecherche<T extends z.ZodType>(schemaDocument: T) {
  return z.object({
    hits: z.array(schemaDocument),
    limit: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
    estimatedTotalHits: z.number().int().nonnegative(),
  });
}

export const schemaReponseRencontres = schemaReponseRecherche(schemaRencontreFfbb);
export const schemaReponseOrganismes = schemaReponseRecherche(schemaOrganismeFfbb);

/**
 * Enveloppe seule, documents laissés bruts.
 *
 * L'enveloppe (`limit`, `offset`, et `hits` bien tableau) commande la pagination :
 * l'accepter à moitié n'aurait aucun sens, elle reste donc validée strictement.
 * Les documents, eux, sont analysés **un par un** par l'appelant, de sorte qu'un
 * seul document abîmé n'efface pas la page entière — c'est la dégradation décrite
 * au plan (« document ignoré en entier », et non « page ignorée en entier »).
 */
export const schemaEnveloppeDocumentsBruts = schemaReponseRecherche(z.unknown());

/**
 * De quoi nommer un document refusé. Sans son `id`, un « document invalide » au
 * journal de synchronisation n'apprend rien à personne et oblige à rejouer la
 * requête à la main pour savoir lequel.
 */
export const schemaIdentiteDocumentFfbb = z.object({ id: z.string().min(1) });

export type ReponseRencontresFfbb = z.infer<typeof schemaReponseRencontres>;
export type ReponseOrganismesFfbb = z.infer<typeof schemaReponseOrganismes>;

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/**
 * Erreur de validation d'un document FFBB. Elle **nomme le champ fautif** : sans
 * le chemin Zod, un « document invalide » dans le journal de synchronisation
 * n'apprend rien à personne et oblige à rejouer la requête à la main.
 */
export class ErreurValidationFfbb extends Error {
  override readonly name = "ErreurValidationFfbb";

  constructor(
    /** Ce qui était validé : « configuration FFBB », « rencontre 200000014681472 »… */
    readonly contexte: string,
    /** Un libellé `chemin : message` par problème relevé par Zod. */
    readonly problemes: readonly string[],
  ) {
    super(`${contexte} : document FFBB invalide — ${problemes.join(" ; ")}`);
  }
}

/** `["salle", "cartographie", "ville"]` → `salle.cartographie.ville`. */
function cheminLisible(chemin: readonly PropertyKey[]): string {
  return chemin.length === 0 ? "(racine)" : chemin.map((element) => String(element)).join(".");
}

/**
 * Résultat d'une analyse tolérante : la donnée validée, ou les problèmes relevés.
 * Jamais `null` en cas d'échec — un appelant qui reçoit `null` finit toujours par
 * le confondre avec « absent ».
 */
export type AnalyseFfbb<T> =
  | { readonly ok: true; readonly donnee: T }
  | { readonly ok: false; readonly problemes: readonly string[] };

/**
 * Valide `valeur` **sans lever**, en rendant les problèmes Zod lisibles.
 *
 * C'est la brique de la lecture document par document : un document que le schéma
 * refuse doit être écarté seul, sans emporter ses voisins de la même page (plan,
 * tableau de dégradation — « Document invalide (Zod) → document ignoré en entier,
 * `nb_invalides++`, chemin Zod journalisé »). Décider de compter, de journaliser
 * et de poursuivre appartient à la synchronisation (T06) ; ici on se contente de
 * dire ce qui ne va pas, et où.
 */
export function analyserFfbb<T extends z.ZodType>(
  schema: T,
  valeur: unknown,
): AnalyseFfbb<z.infer<T>> {
  const resultat = schema.safeParse(valeur);
  if (resultat.success) {
    return { ok: true, donnee: resultat.data };
  }
  return {
    ok: false,
    problemes: resultat.error.issues.map(
      (probleme) => `${cheminLisible(probleme.path)} : ${probleme.message}`,
    ),
  };
}

/**
 * Valide `valeur` ou lève. Réservé à ce qui n'a **pas** de sens à moitié : les
 * jetons, l'enveloppe d'une réponse Meilisearch, la fiche du club. Un document de
 * liste, lui, passe par `analyserFfbb` et n'emporte pas ses voisins.
 */
export function validerFfbb<T extends z.ZodType>(
  schema: T,
  valeur: unknown,
  contexte: string,
): z.infer<T> {
  const analyse = analyserFfbb(schema, valeur);
  if (!analyse.ok) {
    throw new ErreurValidationFfbb(contexte, analyse.problemes);
  }
  return analyse.donnee;
}
