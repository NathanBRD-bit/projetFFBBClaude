import { createHash } from "node:crypto";

import type { RencontreFfbb } from "./schemas";

/**
 * Normalisation : du document FFBB **validé** vers la ligne de `rencontre`.
 *
 * Ce module est **pur**. Mêmes entrées, mêmes sorties : aucun réseau, aucune
 * base, aucune horloge implicite (`new Date()` est interdit ici — l'instant
 * courant arrive par `contexte.maintenant`). C'est ce qui rend la dérivation du
 * statut et le calcul de l'empreinte testables au cas près, sans rien monter.
 *
 * Il n'écrit rien : c'est T06 qui applique, résout les références du référentiel
 * en `uuid` et ouvre les conflits. Ici on ne fait que traduire et signaler.
 *
 * ## Découpage du résultat
 *
 * - `colonnes` — les colonnes de `rencontre` que la synchronisation a le droit
 *   d'écrire, et **elles seules** : ni `resume_md` ni `affiche_publiquement`
 *   n'y figurent, de sorte que la fusion ne peut pas les toucher (voir
 *   `fusion.ts`, premier cercle).
 * - `references` — ce qu'il faut à T06 pour créer/retrouver les lignes de
 *   référentiel (saison, compétition, poule, organismes, salle) avant d'écrire
 *   la rencontre.
 * - `rapprochement` — notre équipe, quand le libellé FFBB a pu être rattaché, et
 *   **le motif** quand il ne l'a pas été : le tableau de bord doit pouvoir lister
 *   les rencontres non rapprochées sans les deviner.
 * - `empreinteFfbb` — SHA-256 de `colonnes`. Voir plus bas.
 */

/* ------------------------------------------------------------------ *
 * Erreur
 * ------------------------------------------------------------------ */

/**
 * Échec de normalisation d'un document FFBB pourtant valide au sens Zod.
 *
 * Elle nomme toujours la rencontre fautive : sans `id_ffbb`, un « document
 * innormalisable » dans le journal de synchronisation oblige à rejouer l'import
 * à la main pour savoir lequel. C'est à T06 de l'attraper, de compter le
 * document comme invalide et de continuer — décision qui lui appartient.
 */
export class ErreurNormalisationFfbb extends Error {
  override readonly name = "ErreurNormalisationFfbb";

  constructor(
    readonly idFfbb: string,
    readonly motif: string,
  ) {
    super(`rencontre FFBB ${idFfbb} : ${motif}`);
  }
}

/* ------------------------------------------------------------------ *
 * Entrée : document et contexte
 * ------------------------------------------------------------------ */

/**
 * Indicateurs de situation d'une rencontre : match remis, forfait déclaré.
 *
 * **La FFBB ne fournira jamais ces champs**, et ce n'est pas une supposition :
 * `remise`, `forfaitEquipe1/2`, `defautEquipe1/2`, `validee` et `penalite*` sont
 * déclarés *filtrables* sur l'index, mais **aucun document ne les porte**. Un
 * filtre `remise = true` renvoie 0 document ; `remise = false` en renvoie 0
 * également, alors qu'au même instant `joue = true` en renvoie 3 610. Ce sont des
 * reliquats de configuration que la fédération n'alimente pas (vérifié le
 * 16/09/2026 sur l'index de production).
 *
 * Conséquence à connaître avant de s'y fier : **les statuts `reporte` et
 * `forfait` ne remonteront pas de la synchronisation**. Ce sont des statuts de
 * saisie au back-office. Un match reporté restera `a_venir` à sa date d'origine
 * tant qu'un humain ne l'aura pas corrigé — le site ne peut pas le deviner.
 *
 * Ces indicateurs restent la couture par laquelle le back-office fournira
 * l'information : le classement est écrit et testé, il n'y aura qu'à le brancher.
 * Mais tant que cette saisie n'existe pas, ces deux branches sont **testées et
 * non alimentées**, et il faut le dire plutôt que de les compter comme acquises.
 */
export interface IndicateursSituationFfbb {
  /** Rencontre remise à une date ultérieure. */
  readonly remise?: boolean;
  /** Forfait de l'équipe recevante (`nomEquipe1`). */
  readonly forfaitEquipe1?: boolean;
  /** Forfait de l'équipe visiteuse (`nomEquipe2`). */
  readonly forfaitEquipe2?: boolean;
}

/** Le document validé par T04, augmenté des indicateurs ci-dessus. */
export type DocumentRencontreFfbb = RencontreFfbb & IndicateursSituationFfbb;

/**
 * Un engagement du club tel que le back-office le connaît. `libellesFfbb` porte
 * les orthographes exactes vues dans `nomEquipe1` / `nomEquipe2` : c'est la
 * **seule** clé de rattachement, l'égalité y est stricte et aucune ressemblance
 * approximative n'est tentée (une heuristique floue rattacherait un jour la
 * mauvaise équipe, sans rien dire).
 */
export interface EngagementConnu {
  /** `uuid` de `equipe`. */
  readonly equipeId: string;
  /** Code de saison côté FFBB, format « 26-27 ». */
  readonly saisonCodeFfbb: string;
  readonly libellesFfbb: readonly string[];
}

export interface ContexteNormalisation {
  /** Code FFBB du club, `PDL0049077` pour le SOCL. */
  readonly codeClubFfbb: string;
  readonly engagements: readonly EngagementConnu[];
  /**
   * Instant courant, **injecté**. Alimente `vu_dans_ffbb_le`. Aucun appel à
   * `new Date()` dans ce module : deux normalisations du même document doivent
   * produire le même résultat, y compris à une seconde d'intervalle.
   */
  readonly maintenant: Date;
}

/* ------------------------------------------------------------------ *
 * Sortie
 * ------------------------------------------------------------------ */

/**
 * Statuts dérivables d'un document FFBB. `annule` et `a_confirmer` existent en
 * base mais ne s'en déduisent pas : `a_confirmer` signale une rencontre disparue
 * de l'index (T06 le sait, pas nous), `annule` relève d'une décision humaine.
 */
export type StatutNormalise = "a_venir" | "joue" | "score_manquant" | "reporte" | "forfait";

export type CoteDuClub = "domicile" | "exterieur";

/** Pourquoi une rencontre n'a pas été rattachée à une de nos équipes. */
export type MotifNonRapproche = "club_absent_du_document" | "libelle_non_rapproche";

export interface RapprochementEquipe {
  /** `null` quand le club n'apparaît dans aucun des deux organismes. */
  readonly cote: CoteDuClub | null;
  /** Le libellé FFBB de notre équipe, celui qu'il faudra ajouter à l'engagement. */
  readonly libelleFfbb: string | null;
  /** `uuid` de `equipe`, ou `null` si non rapproché — jamais une erreur. */
  readonly equipeId: string | null;
  /** `null` si et seulement si `equipeId` est renseigné. */
  readonly motifNonRapproche: MotifNonRapproche | null;
}

export interface ReferenceSaison {
  readonly codeFfbb: string;
}

export interface ReferenceCompetition {
  readonly idFfbb: string;
  readonly codeFfbb: string;
  readonly nom: string;
  readonly categorie: string;
  /** `Départemental 4` : `niveau` et `niveau_nb` recollés. */
  readonly niveau: string;
}

export interface ReferencePoule {
  readonly codeFfbb: string;
  readonly nom: string;
}

export interface ReferenceOrganisme {
  readonly codeFfbb: string;
  readonly nom: string;
  /** Vrai pour le SOCL : c'est ce qui distingue « nous » de « l'adversaire ». */
  readonly estLeClub: boolean;
}

export interface ReferenceSalle {
  readonly codeFfbb: string;
  readonly nom: string;
  readonly adresse: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface ReferencesFfbb {
  readonly saison: ReferenceSaison;
  readonly competition: ReferenceCompetition;
  readonly poule: ReferencePoule;
  /** `null` quand la FFBB ne publie pas l'organisme (plateau, équipe non engagée). */
  readonly organismeDomicile: ReferenceOrganisme | null;
  readonly organismeExterieur: ReferenceOrganisme | null;
  readonly salle: ReferenceSalle | null;
}

/** Les types que peut prendre une colonne fusionnable. */
export type ValeurColonne = string | number | boolean | Date | null;

/**
 * Les colonnes de `rencontre` alimentées par la FFBB — **le périmètre exact de
 * la fusion**.
 *
 * Déclaré en `type` et non en `interface` à dessein : un alias de type porte une
 * signature d'index implicite, ce qui permet de le parcourir sans conversion
 * pour l'empreinte et la comparaison.
 *
 * Les colonnes éditoriales (`resume_md`, `affiche_publiquement`) sont **absentes
 * par construction** : la fusion ne peut pas écrire ce qu'elle ne connaît pas.
 *
 * Les références au référentiel apparaissent sous leur identifiant FFBB
 * (`competitionCodeFfbb`…) et non sous forme d'`uuid` : la résolution appartient
 * à T06. Elles doivent néanmoins entrer dans l'empreinte, sans quoi un match
 * redomicilié ne déclencherait aucune mise à jour.
 */
export type ColonnesFfbbRencontre = {
  readonly cleNaturelle: string;
  readonly slug: string;
  readonly saisonCodeFfbb: string;
  readonly competitionCodeFfbb: string;
  readonly pouleCodeFfbb: string;
  /** `null` = non rapproché. Se met à jour quand le back-office complète un engagement. */
  readonly equipeId: string | null;
  readonly organismeDomicileCodeFfbb: string | null;
  readonly organismeExterieurCodeFfbb: string | null;
  readonly nomEquipeDomicileFfbb: string;
  readonly nomEquipeExterieurFfbb: string;
  readonly salleCodeFfbb: string | null;
  readonly dateHeure: Date;
  readonly heureConfirmee: boolean;
  readonly numero: string;
  readonly journee: number;
  readonly statut: StatutNormalise;
  readonly scoreDomicile: number | null;
  readonly scoreExterieur: number | null;
  readonly forfaitDomicile: boolean;
  readonly forfaitExterieur: boolean;
};

export interface RencontreNormalisee {
  /** Clé d'idempotence, cible du `on conflict` de T06 (ADR 0002). */
  readonly idFfbb: string;
  readonly colonnes: ColonnesFfbbRencontre;
  /** SHA-256 de `colonnes`. Voir `calculerEmpreinte`. */
  readonly empreinteFfbb: string;
  /** `contexte.maintenant`, écrit par T06 **hors fusion** : il change à chaque passage. */
  readonly vuDansFfbbLe: Date;
  readonly rapprochement: RapprochementEquipe;
  readonly references: ReferencesFfbb;
}

/* ------------------------------------------------------------------ *
 * Texte : slug et clé naturelle
 * ------------------------------------------------------------------ */

/**
 * Forme canonique d'un fragment de texte FFBB : sans accent, en minuscules, tout
 * ce qui n'est ni lettre ni chiffre réduit à un tiret unique.
 *
 * Sert à la fois au `slug` et à la `cle_naturelle`, volontairement : une retouche
 * cosmétique de la FFBB (« CHAZE SUR ARGOS - 2 » → « CHAZE SUR ARGOS 2 »,
 * « CHAZÉ » → « CHAZE ») ne doit pas fabriquer un doublon. Ce n'est pas une
 * heuristique de ressemblance — aucune distance n'est calculée, deux libellés
 * différents restent différents.
 */
function canoniser(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Canonise en refusant le résultat vide. Un fragment qui se réduit à rien
 * (libellé fait de seule ponctuation) produirait une clé naturelle ambiguë, que
 * la contrainte `rencontre_cle_naturelle_non_vide` rejetterait bien plus loin.
 */
function canoniserOuEchouer(valeur: string, champ: string, idFfbb: string): string {
  const canonique = canoniser(valeur);
  if (canonique === "") {
    throw new ErreurNormalisationFfbb(
      idFfbb,
      `${champ} ne contient aucun caractère exploitable (« ${valeur} ») : ` +
        `la clé naturelle et le slug en seraient ambigus`,
    );
  }
  return canonique;
}

/** Séparateur de la clé naturelle. `canoniser` garantit qu'aucun fragment ne le contient. */
const SEPARATEUR_CLE = "|";

/**
 * Composition de `cle_naturelle`, telle que tranchée par l'ADR 0002 :
 *
 * ```
 * saison | compétition | poule | date | équipe 1 | équipe 2
 * ```
 *
 * **`id_ffbb` n'y entre pas.** C'est délibéré et c'est tout l'intérêt de la
 * colonne : elle sert à *détecter* une renumérotation FFBB, donc elle doit être
 * indépendante de `id_ffbb`. Une clé naturelle qui contiendrait l'identifiant ne
 * détecterait plus rien — deux lignes pour la même rencontre passeraient toutes
 * les contraintes.
 *
 * L'ADR signale la contrepartie : un aller-retour joué le même jour sur un
 * plateau donne deux rencontres de même clé, et la contrainte `unique`
 * échouerait. Ce cas se règle **au moment de l'écriture**, par T06, qui est seul
 * à voir la collision — d'où `desambiguiserCleNaturelle`, plutôt que de dégrader
 * la clé de toutes les rencontres pour une poignée.
 */
function composerCleNaturelle(document: DocumentRencontreFfbb): string {
  const idFfbb = document.id;
  return [
    canoniserOuEchouer(document.saison.code, "saison.code", idFfbb),
    canoniserOuEchouer(document.competitionId.code, "competitionId.code", idFfbb),
    canoniserOuEchouer(document.idPoule.id, "idPoule.id", idFfbb),
    document.date,
    canoniserOuEchouer(document.nomEquipe1, "nomEquipe1", idFfbb),
    canoniserOuEchouer(document.nomEquipe2, "nomEquipe2", idFfbb),
  ].join(SEPARATEUR_CLE);
}

/**
 * Clé naturelle de dernier recours, **à n'utiliser que sur collision avérée**
 * (ADR 0002). À réserver à T06, qui doit aussi journaliser le cas : deux
 * rencontres de même clé naturelle sont soit un aller-retour légitime, soit une
 * renumérotation FFBB, et seule la seconde est une anomalie.
 */
export function desambiguiserCleNaturelle(cleNaturelle: string, idFfbb: string): string {
  return `${cleNaturelle}${SEPARATEUR_CLE}${idFfbb}`;
}

/** Pendant de `desambiguiserCleNaturelle` pour le slug, qui est unique lui aussi. */
export function desambiguiserSlug(slug: string, idFfbb: string): string {
  return `${slug}-${canoniser(idFfbb)}`;
}

/**
 * La FFBB écrit le sexe au singulier (« Masculin »), nos slugs d'équipe au
 * pluriel (« u11-masculins », cf. `equipe.slug`). Table explicite plutôt que
 * règle d'accord : le champ est laissé ouvert par le schéma de T04, et une
 * valeur inattendue doit produire un slug lisible, pas une exception.
 */
const PLURIEL_SEXE: Readonly<Record<string, string>> = {
  Masculin: "masculins",
  Féminin: "feminines",
  Mixte: "mixtes",
};

function slugSexe(sexe: string): string {
  const pluriel = PLURIEL_SEXE[sexe];
  if (pluriel === undefined) return canoniser(sexe);
  return pluriel;
}

/** Nom affichable d'un camp : celui du club quand la FFBB le publie, le libellé d'équipe sinon. */
function nomDuCamp(organisme: { readonly nom: string } | null, libelleEquipe: string): string {
  if (organisme === null) return libelleEquipe;
  return organisme.nom;
}

/**
 * Slug lisible et stable : `2026-09-19-u11-masculins-chaze-sur-argos`.
 *
 * Date, catégorie + sexe **de la compétition**, puis l'adversaire. La catégorie
 * vient de la compétition et non de notre équipe pour que le slug ne bouge pas
 * quand le rapprochement change : un slug est une URL publique, il doit survivre
 * à l'ajout d'un libellé au back-office.
 *
 * L'adversaire est nommé par son **organisme** (« CHAZE SUR ARGOS ») et non par
 * le libellé d'équipe (« CHAZE SUR ARGOS - 2 ») : le numéro d'équipe est du
 * bruit dans une URL. Quand le club n'apparaît pas dans la rencontre, les deux
 * camps sont nommés — il n'y a pas d'« adversaire » à désigner.
 */
function composerSlug(document: DocumentRencontreFfbb, cote: CoteDuClub | null): string {
  const competition = document.competitionId;
  const nomDomicile = nomDuCamp(document.idOrganismeEquipe1, document.nomEquipe1);
  const nomExterieur = nomDuCamp(document.idOrganismeEquipe2, document.nomEquipe2);

  const camps =
    cote === null
      ? [nomDomicile, nomExterieur]
      : [cote === "domicile" ? nomExterieur : nomDomicile];

  const fragments = [
    document.date,
    canoniserOuEchouer(
      competition.categorie.libelle,
      "competitionId.categorie.libelle",
      document.id,
    ),
    slugSexe(competition.sexe),
    ...camps.map((camp, rang) => canoniserOuEchouer(camp, `camp ${String(rang + 1)}`, document.id)),
  ];
  return fragments.join("-");
}

/* ------------------------------------------------------------------ *
 * Fuseau Europe/Paris
 * ------------------------------------------------------------------ */

/**
 * `date_rencontre` est une heure **locale sans décalage** (« 2026-09-19T11:30:00 »).
 * La lire avec `new Date(...)` la traiterait comme de l'UTC sur Vercel et comme
 * de l'heure locale dans un navigateur : deux heures d'écart l'été, sans la
 * moindre erreur. La conversion est donc explicite, et vérifiée par aller-retour.
 */
export const FUSEAU_CLUB = "Europe/Paris";

const FORMATEUR_FUSEAU = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSEAU_CLUB,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * Lit un champ de `formatToParts`. Pas de garde « et si le champ manquait » :
 * il ne peut pas manquer, il est demandé dans les options. S'il manquait malgré
 * tout, `Number("")` vaudrait `NaN` et la vérification d'aller-retour de
 * `convertirHeureParisienne` échouerait bruyamment — jamais en silence.
 */
function lireChamp(parties: readonly Intl.DateTimeFormatPart[], type: string): number {
  let valeur = "";
  for (const partie of parties) {
    if (partie.type === type) valeur = partie.value;
  }
  return Number(valeur);
}

/** Décalage Europe/Paris ↔ UTC, en millisecondes, à l'instant donné. */
function decalageFuseauMs(instant: number): number {
  const parties = FORMATEUR_FUSEAU.formatToParts(new Date(instant));
  const local = Date.UTC(
    lireChamp(parties, "year"),
    lireChamp(parties, "month") - 1,
    lireChamp(parties, "day"),
    lireChamp(parties, "hour"),
    lireChamp(parties, "minute"),
    lireChamp(parties, "second"),
  );
  return local - instant;
}

const DOUZE_HEURES_MS = 12 * 60 * 60 * 1000;

/**
 * « 2026-09-19T11:30:00 » → l'instant UTC de mêmes composantes, **après contrôle
 * que la date existe**.
 *
 * Le schéma Zod de T04 ne garantit que la *forme* : `\d{4}-\d{2}-\d{2}T…` accepte
 * « 2026-06-31T20:30:00 » et « 2026-09-19T25:00:00 ». `Date.UTC` reporte alors
 * silencieusement — le 31 juin devient le 1er juillet, 25:00 devient 01:00 le
 * lendemain — et la rencontre se retrouve affichée un autre jour sans qu'aucune
 * erreur n'ait été levée. C'est le bug silencieux type : une donnée fausse
 * indiscernable d'une donnée vraie.
 *
 * La vérification compare donc les composantes **relues** à celles de la chaîne
 * d'entrée. Un aller-retour sur la valeur déjà reportée ne prouverait rien : elle
 * se réaffiche toujours identique à elle-même.
 */
function lireComposantes(heureLocale: string, idFfbb: string): number {
  // Découpage par position : la forme est garantie par le schéma Zod de T04.
  const annee = Number(heureLocale.slice(0, 4));
  const mois = Number(heureLocale.slice(5, 7));
  const jour = Number(heureLocale.slice(8, 10));
  const heure = Number(heureLocale.slice(11, 13));
  const minute = Number(heureLocale.slice(14, 16));
  const seconde = Number(heureLocale.slice(17, 19));

  const millisecondes = Date.UTC(annee, mois - 1, jour, heure, minute, seconde);
  const relu = new Date(millisecondes);
  const identique =
    relu.getUTCFullYear() === annee &&
    relu.getUTCMonth() === mois - 1 &&
    relu.getUTCDate() === jour &&
    relu.getUTCHours() === heure &&
    relu.getUTCMinutes() === minute &&
    relu.getUTCSeconds() === seconde;

  if (!identique) {
    throw new ErreurNormalisationFfbb(
      idFfbb,
      `date_rencontre « ${heureLocale} » n'est pas une date valide : le calendrier la ` +
        `reporte au ${relu.toISOString().slice(0, 19)}. Refusée plutôt que décalée en silence`,
    );
  }
  return millisecondes;
}

/**
 * Heure locale Europe/Paris → instant absolu.
 *
 * Deux candidats sont construits, à partir du décalage en vigueur douze heures
 * avant et douze heures après : c'est ce qui encadre toute bascule d'heure d'été
 * ou d'hiver. Seuls sont retenus ceux qui **réaffichent exactement l'heure
 * demandée** une fois reconvertis — l'aller-retour est la vérification, pas une
 * supposition.
 *
 * - heure ambiguë (25/10/2026 02:30, qui existe deux fois) : le plus tôt des
 *   deux, c'est-à-dire l'heure d'été, comme le fait `Temporal` par défaut ;
 * - heure inexistante (29/03/2026 02:30, sautée par la bascule) : aucun candidat
 *   ne se vérifie, on **lève**. Inventer 03:30 serait une donnée fausse
 *   indiscernable d'une vraie.
 */
function convertirHeureParisienne(heureLocale: string, idFfbb: string): Date {
  const supposeUtc = lireComposantes(heureLocale, idFfbb);

  const candidats = [
    supposeUtc - decalageFuseauMs(supposeUtc - DOUZE_HEURES_MS),
    supposeUtc - decalageFuseauMs(supposeUtc + DOUZE_HEURES_MS),
  ];
  const verifies = candidats.filter(
    (candidat) => candidat + decalageFuseauMs(candidat) === supposeUtc,
  );

  if (verifies.length === 0) {
    throw new ErreurNormalisationFfbb(
      idFfbb,
      `date_rencontre « ${heureLocale} » n'existe pas dans le fuseau ${FUSEAU_CLUB} ` +
        `(heure sautée par le passage à l'heure d'été)`,
    );
  }
  return new Date(Math.min(...verifies));
}

/**
 * `heure_confirmee` : faux quand la FFBB publie la date sans horaire arrêté.
 * Elle écrit alors minuit — aucune rencontre ne démarre à 00:00:00, la
 * convention est sans ambiguïté.
 */
function heureEstConfirmee(heureLocale: string): boolean {
  return heureLocale.slice(11) !== "00:00:00";
}

/* ------------------------------------------------------------------ *
 * Entiers : scores et journée
 * ------------------------------------------------------------------ */

const FORMAT_ENTIER = /^\d+$/;

/**
 * Chaîne FFBB → entier, ou échec. Surtout pas de `Number()` nu : `Number("F")`
 * vaut `NaN`, qui se propagerait jusqu'à un score affiché « NaN » ou un
 * `smallint` refusé trois couches plus loin, loin de la cause.
 */
function exigerEntier(brut: string, champ: string, idFfbb: string): number {
  if (!FORMAT_ENTIER.test(brut)) {
    throw new ErreurNormalisationFfbb(
      idFfbb,
      `${champ} n'est pas un entier : « ${brut} ». Refusé plutôt que converti en NaN`,
    );
  }
  return Number.parseInt(brut, 10);
}

/**
 * Score FFBB → entier ou `null`. `null` veut dire « pas de résultat connu »,
 * `0` veut dire « zéro point marqué » : les deux ne doivent jamais se confondre,
 * d'où l'absence totale de valeur de repli ici.
 */
function convertirScore(brut: string | null, champ: string, idFfbb: string): number | null {
  if (brut === null) return null;
  return exigerEntier(brut, champ, idFfbb);
}

/* ------------------------------------------------------------------ *
 * Statut
 * ------------------------------------------------------------------ */

interface Situation {
  readonly statut: StatutNormalise;
  readonly scoreDomicile: number | null;
  readonly scoreExterieur: number | null;
  readonly forfaitDomicile: boolean;
  readonly forfaitExterieur: boolean;
}

/**
 * Dérive le statut, les scores et les drapeaux de forfait.
 *
 * Aucun `else` fourre-tout : chaque combinaison est soit nommée, soit refusée.
 * Les refus correspondent à des contradictions que la base rejetterait de toute
 * façon (`rencontre_scores_ensemble`, `rencontre_joue_avec_score`,
 * `rencontre_score_manquant_sans_score`) — autant échouer ici, où l'on peut dire
 * quel document et quel champ.
 */
function deriverSituation(document: DocumentRencontreFfbb): Situation {
  const idFfbb = document.id;
  const scoreDomicile = convertirScore(document.resultatEquipe1, "resultatEquipe1", idFfbb);
  const scoreExterieur = convertirScore(document.resultatEquipe2, "resultatEquipe2", idFfbb);
  const forfaitDomicile = document.forfaitEquipe1 === true;
  const forfaitExterieur = document.forfaitEquipe2 === true;

  if ((scoreDomicile === null) !== (scoreExterieur === null)) {
    throw new ErreurNormalisationFfbb(
      idFfbb,
      `un seul des deux scores est renseigné (resultatEquipe1 = ` +
        `${JSON.stringify(document.resultatEquipe1)}, resultatEquipe2 = ` +
        `${JSON.stringify(document.resultatEquipe2)}) : un match a deux scores, ou aucun`,
    );
  }
  const avecScore = scoreDomicile !== null;
  const communs = { scoreDomicile, scoreExterieur, forfaitDomicile, forfaitExterieur };

  if (forfaitDomicile || forfaitExterieur) {
    return { ...communs, statut: "forfait" };
  }

  if (document.remise === true) {
    if (avecScore) {
      throw new ErreurNormalisationFfbb(
        idFfbb,
        "rencontre déclarée remise alors qu'elle porte un score : combinaison inclassable",
      );
    }
    return { ...communs, statut: "reporte" };
  }

  if (document.joue) {
    // `joue: true` sans score existe réellement dans l'index : feuille de marque
    // jamais remontée. C'est pour ce cas que `score_manquant` a été créé (T03) —
    // il ne faut ni l'afficher 0-0, ni le ranger en `joue`.
    return { ...communs, statut: avecScore ? "joue" : "score_manquant" };
  }

  if (avecScore) {
    throw new ErreurNormalisationFfbb(
      idFfbb,
      `rencontre non jouée (joue = false) portant le score ${String(scoreDomicile)}-` +
        `${String(scoreExterieur)} : combinaison inclassable`,
    );
  }
  return { ...communs, statut: "a_venir" };
}

/* ------------------------------------------------------------------ *
 * Rapprochement avec nos équipes
 * ------------------------------------------------------------------ */

function coteDuClub(document: DocumentRencontreFfbb, codeClubFfbb: string): CoteDuClub | null {
  // Le côté se décide sur le **code d'organisme**, jamais sur le libellé : un
  // libellé se retouche, un code identifie.
  const domicile = document.idOrganismeEquipe1;
  if (domicile !== null && domicile.code === codeClubFfbb) return "domicile";

  const exterieur = document.idOrganismeEquipe2;
  if (exterieur !== null && exterieur.code === codeClubFfbb) return "exterieur";

  return null;
}

function rapprocherEquipe(
  document: DocumentRencontreFfbb,
  contexte: ContexteNormalisation,
): RapprochementEquipe {
  const cote = coteDuClub(document, contexte.codeClubFfbb);
  if (cote === null) {
    return {
      cote: null,
      libelleFfbb: null,
      equipeId: null,
      motifNonRapproche: "club_absent_du_document",
    };
  }

  const libelleFfbb = cote === "domicile" ? document.nomEquipe1 : document.nomEquipe2;
  const correspondants = contexte.engagements.filter(
    (engagement) =>
      engagement.saisonCodeFfbb === document.saison.code &&
      engagement.libellesFfbb.includes(libelleFfbb),
  );

  if (correspondants.length > 1) {
    // Deux engagements revendiquant le même libellé : erreur de saisie au
    // back-office. Choisir « le premier » rattacherait silencieusement la
    // mauvaise équipe, et personne ne s'en apercevrait.
    throw new ErreurNormalisationFfbb(
      document.id,
      `le libellé « ${libelleFfbb} » est revendiqué par ${String(correspondants.length)} ` +
        `engagements de la saison ${document.saison.code} : à corriger au back-office`,
    );
  }

  const [engagement] = correspondants;
  if (engagement === undefined) {
    // Non rapproché n'est pas une erreur : une équipe nouvellement engagée n'a
    // pas encore son libellé. La rencontre est importée, simplement signalée.
    return { cote, libelleFfbb, equipeId: null, motifNonRapproche: "libelle_non_rapproche" };
  }
  return { cote, libelleFfbb, equipeId: engagement.equipeId, motifNonRapproche: null };
}

/* ------------------------------------------------------------------ *
 * Empreinte
 * ------------------------------------------------------------------ */

function representer(valeur: ValeurColonne): string {
  if (valeur === null) return "null";
  if (valeur instanceof Date) return valeur.toISOString();
  if (typeof valeur === "string") return JSON.stringify(valeur);
  return String(valeur);
}

/**
 * Sérialisation stable : clés triées, valeurs représentées sans ambiguïté (les
 * chaînes sont échappées, donc aucune ne peut se faire passer pour `null` ni
 * introduire un séparateur).
 */
function serialiserStable(colonnes: Readonly<Record<string, ValeurColonne>>): string {
  return Object.entries(colonnes)
    .sort(([gauche], [droite]) => gauche.localeCompare(droite))
    .map(([cle, valeur]) => `${cle}=${representer(valeur)}`)
    .join("\n");
}

/**
 * SHA-256 des **seules colonnes que la synchronisation peut écrire**.
 *
 * Ce périmètre n'est pas un détail : il fait de « empreinte identique ⇒ rien à
 * écrire » un théorème plutôt qu'un espoir. Deux conséquences voulues :
 *
 * - l'empreinte est **insensible à tout ce que nous n'utilisons pas**
 *   (`officiels`, `modification_timestamp`, logos, `handicap*`, `url_competition`,
 *   `niveau_nb`…) : un champ FFBB sans intérêt ne déclenche aucune réécriture ;
 * - elle est **stable par permutation des clés JSON**, puisqu'elle est calculée
 *   sur un objet reconstruit, à clés triées, et non sur le document reçu.
 *
 * `vu_dans_ffbb_le` en est exclu (il change à chaque passage) et les colonnes
 * éditoriales n'y figurent pas, faute d'exister dans `ColonnesFfbbRencontre`.
 */
function calculerEmpreinte(colonnes: ColonnesFfbbRencontre): string {
  return createHash("sha256").update(serialiserStable(colonnes), "utf8").digest("hex");
}

/* ------------------------------------------------------------------ *
 * Références du référentiel
 * ------------------------------------------------------------------ */

function referenceOrganisme(
  organisme: RencontreFfbb["idOrganismeEquipe1"],
  codeClubFfbb: string,
): ReferenceOrganisme | null {
  if (organisme === null) return null;
  return {
    codeFfbb: organisme.code,
    nom: organisme.nom,
    estLeClub: organisme.code === codeClubFfbb,
  };
}

function referenceSalle(salle: RencontreFfbb["salle"]): ReferenceSalle | null {
  if (salle === null) return null;
  const [longitude, latitude] = salle.cartographie.coordonnees.coordinates;
  // GeoJSON range les coordonnées en [longitude, latitude] : les inverser
  // placerait toutes les salles du Maine-et-Loire au large de la Somalie.
  return {
    codeFfbb: salle.id,
    nom: salle.libelle,
    adresse: salle.adresse,
    codePostal: salle.cartographie.codePostal,
    ville: salle.cartographie.ville,
    latitude,
    longitude,
  };
}

function composerReferences(document: DocumentRencontreFfbb, codeClubFfbb: string): ReferencesFfbb {
  const competition = document.competitionId;
  return {
    saison: { codeFfbb: document.saison.code },
    competition: {
      idFfbb: competition.id,
      codeFfbb: competition.code,
      nom: competition.nom,
      categorie: competition.categorie.libelle,
      niveau: `${document.niveau} ${document.niveau_nb}`,
    },
    poule: { codeFfbb: document.idPoule.id, nom: document.idPoule.nom },
    organismeDomicile: referenceOrganisme(document.idOrganismeEquipe1, codeClubFfbb),
    organismeExterieur: referenceOrganisme(document.idOrganismeEquipe2, codeClubFfbb),
    salle: referenceSalle(document.salle),
  };
}

/* ------------------------------------------------------------------ *
 * Point d'entrée
 * ------------------------------------------------------------------ */

/**
 * Document FFBB validé → rencontre normalisée. Fonction **pure**.
 *
 * Lève une `ErreurNormalisationFfbb` sur toute contradiction qu'elle ne sait pas
 * classer. Un libellé d'équipe non rapproché n'en est pas une : c'est un cas
 * normal, signalé par `rapprochement.motifNonRapproche`.
 */
export function normaliser(
  document: DocumentRencontreFfbb,
  contexte: ContexteNormalisation,
): RencontreNormalisee {
  const rapprochement = rapprocherEquipe(document, contexte);
  const situation = deriverSituation(document);

  const colonnes: ColonnesFfbbRencontre = {
    cleNaturelle: composerCleNaturelle(document),
    slug: composerSlug(document, rapprochement.cote),
    saisonCodeFfbb: document.saison.code,
    competitionCodeFfbb: document.competitionId.code,
    pouleCodeFfbb: document.idPoule.id,
    equipeId: rapprochement.equipeId,
    organismeDomicileCodeFfbb:
      document.idOrganismeEquipe1 === null ? null : document.idOrganismeEquipe1.code,
    organismeExterieurCodeFfbb:
      document.idOrganismeEquipe2 === null ? null : document.idOrganismeEquipe2.code,
    nomEquipeDomicileFfbb: document.nomEquipe1,
    nomEquipeExterieurFfbb: document.nomEquipe2,
    salleCodeFfbb: document.salle === null ? null : document.salle.id,
    dateHeure: convertirHeureParisienne(document.date_rencontre, document.id),
    heureConfirmee: heureEstConfirmee(document.date_rencontre),
    // `uniqueKey` est conservé tel quel, comme numéro de rencontre lisible :
    // l'ADR 0002 lui refuse le rôle de clé, pas celui de repère (il vaut
    // `poule_journée_numéro` sur les 5 000 documents observés).
    numero: document.uniqueKey,
    journee: exigerEntier(document.numeroJournee, "numeroJournee", document.id),
    statut: situation.statut,
    scoreDomicile: situation.scoreDomicile,
    scoreExterieur: situation.scoreExterieur,
    forfaitDomicile: situation.forfaitDomicile,
    forfaitExterieur: situation.forfaitExterieur,
  };

  return {
    idFfbb: document.id,
    colonnes,
    empreinteFfbb: calculerEmpreinte(colonnes),
    vuDansFfbbLe: contexte.maintenant,
    rapprochement,
    references: composerReferences(document, contexte.codeClubFfbb),
  };
}
