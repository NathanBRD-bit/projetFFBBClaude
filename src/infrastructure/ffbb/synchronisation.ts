import { and, eq, inArray, isNull, isNotNull, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { BaseDeDonnees } from "@/infrastructure/bdd/client";
import {
  competition,
  conflitSynchronisation,
  engagement,
  journalSynchronisation,
  organisme,
  poule,
  rencontre,
  saison,
  salle,
} from "@/infrastructure/bdd/schema";

import {
  creerClientFfbb,
  type DocumentFfbbEcarte,
  type OptionsTransportFfbb,
  type LectureRencontresFfbb,
} from "./client";
import { fusionner, type ConflitFusion, type EtatActuelRencontre } from "./fusion";
import { creerFournisseurDeJetons } from "./jetons";
import {
  desambiguiserCleNaturelle,
  desambiguiserSlug,
  normaliser,
  type ColonnesFfbbRencontre,
  type ColonnesRencontreEnBase,
  type ContexteNormalisation,
  type EngagementConnu,
  type MotifNonRapproche,
  type ReferenceCompetition,
  type ReferenceOrganisme,
  type ReferencePoule,
  type ReferenceSalle,
  type RencontreNormalisee,
  type StatutNormalise,
  type StatutRencontre,
  type ValeurColonne,
} from "./normalisation";

/**
 * Moteur de synchronisation FFBB : la pièce qui **applique**.
 *
 * Le client lit (T04), la normalisation traduit et la fusion décide (T05, toutes
 * deux pures) ; ce module orchestre et écrit. C'est le seul endroit du lot qui
 * touche la base, et il le fait **en une transaction unique** : une
 * synchronisation est tout écrite ou pas écrite du tout, jamais à moitié.
 *
 * ## Deux règles structurantes, héritées du plan
 *
 * 1. **La base est source de vérité, l'API n'est qu'une alimentation.** Aucune
 *    suppression, jamais : une rencontre qui disparaît de l'index reçoit
 *    `disparue_de_ffbb_le`. Si elle était jouée elle reste affichée telle quelle
 *    — c'est ainsi que se construit l'historique pluriannuel que la FFBB ne garde
 *    pas. Si elle était à venir, elle passe `a_confirmer` avec un conflit visible.
 * 2. **Aucun bug silencieux.** Un document refusé est compté et nommé, un index
 *    vide sur une base peuplée est un échec, un cache abîmé laisse une trace au
 *    journal. Ce qui n'a pas pu être fait se lit dans `journal_synchronisation`,
 *    jamais dans les seuls logs.
 *
 * ## Découpage en deux temps
 *
 * - **Hors transaction** : jetons, lecture de l'index, lecture du référentiel et
 *   des états actuels, normalisation, fusion, classement des documents écartés.
 *   Rien n'y est écrit hors le cache de jetons, qui est un artefact dérivé.
 * - **Dans la transaction** : création du référentiel manquant, écriture des
 *   rencontres, ouverture des conflits, marquage des disparitions.
 *
 * Ce découpage n'est pas cosmétique : il permet d'écarter en amont les documents
 * que la base refuserait (rencontre sans aucun organisme, saison inconnue) plutôt
 * que de faire tomber la transaction du lot entier pour une rencontre.
 *
 * ## Ce que la FFBB ne dira jamais
 *
 * Les statuts `reporte` et `forfait` ne remontent pas d'ici : `remise` et
 * `forfaitEquipe*` sont des attributs filtrables de l'index qu'**aucun document
 * n'alimente** (vérifié le 16/09/2026, cf. `normalisation.ts`). Ils viendront du
 * back-office. Ce module ne les invente pas.
 */

/* ------------------------------------------------------------------ *
 * Constantes de dégradation
 * ------------------------------------------------------------------ */

/**
 * Au-delà de cette proportion de documents écartés, on considère que **le format
 * a changé** plutôt que d'importer une moitié de calendrier : l'exécution est un
 * échec et rien n'est écrit. 5 % laisse passer l'accident isolé (un match mal
 * saisi à la fédération) et arrête net une évolution de schéma.
 */
export const PROPORTION_INVALIDES_MAX = 0.05;

/**
 * Statuts d'une rencontre qui n'a pas encore eu lieu. Leur disparition de l'index
 * appelle une confirmation humaine ; celle d'une rencontre jouée, forfait ou
 * annulée est au contraire l'archivage normal d'un résultat acquis.
 */
const STATUTS_A_VENIR: ReadonlySet<StatutRencontre> = new Set<StatutRencontre>([
  "a_venir",
  "reporte",
]);

/** Le champ sous lequel une disparition est portée au back-office. */
const CHAMP_CONFLIT_STATUT = "statut";

/**
 * Le champ sous lequel une renumérotation FFBB est signalée (ADR 0002) : un
 * `id_ffbb` inconnu dont la clé naturelle existe déjà.
 */
const CHAMP_CONFLIT_IDENTIFIANT = "idFfbb";

/* ------------------------------------------------------------------ *
 * Types publics
 * ------------------------------------------------------------------ */

export type DeclencheurSynchronisation = "cron_vercel" | "github_actions" | "manuel";

/** `en_cours` n'apparaît jamais dans un résumé : il ne vit que le temps de l'exécution. */
export type StatutSynchronisation = "succes" | "partiel" | "echec";

/** Un document lu dans l'index puis écarté, et **pourquoi**. */
export interface DocumentEcarte {
  /** `id` FFBB du document, `null` si le document est illisible jusque-là. */
  readonly idFfbb: string | null;
  readonly motif: string;
}

/** Une rencontre importée qu'aucun engagement ne rattache à une de nos équipes. */
export interface RencontreNonRapprochee {
  readonly idFfbb: string;
  /** Le libellé FFBB à ajouter à l'engagement, quand le club figure au document. */
  readonly libelleFfbb: string | null;
  readonly motif: MotifNonRapproche;
}

export interface CompteursSynchronisation {
  readonly nbLues: number;
  readonly nbCreees: number;
  readonly nbMisesAJour: number;
  readonly nbInchangees: number;
  readonly nbDisparues: number;
  readonly nbInvalides: number;
  readonly nbConflits: number;
  readonly nbNonRapprochees: number;
}

export interface ResumeSynchronisation {
  /** Ligne de `journal_synchronisation` ouverte par cette exécution. */
  readonly journalId: string;
  readonly statut: StatutSynchronisation;
  readonly demarreeLe: Date;
  readonly termineeLe: Date;
  readonly dureeMs: number;
  readonly compteurs: CompteursSynchronisation;
  readonly messageErreur: string | null;
  readonly ecartes: readonly DocumentEcarte[];
  readonly nonRapprochees: readonly RencontreNonRapprochee[];
  /** Anomalies réparées en vol : cache de jetons abîmé, par exemple. */
  readonly incidents: readonly string[];
}

export interface DependancesSynchronisation {
  readonly base: BaseDeDonnees;
  /** Code FFBB du club, `PDL0049077` pour le SOCL. */
  readonly codeClubFfbb: string;
  readonly declencheur: DeclencheurSynchronisation;
  /** Renseigné uniquement pour un déclenchement manuel au back-office. */
  readonly declencheeParId?: string | null;
  /** Horloge injectable : une exécution doit être rejouable à l'identique en test. */
  readonly maintenant?: () => Date;
  readonly transport?: OptionsTransportFfbb;
  /**
   * Prévenue quand l'exécution n'est pas un succès. T07 y branchera la
   * notification de l'équipe ; par défaut l'échec part sur `console.error`, pour
   * qu'il ne soit jamais muet.
   */
  readonly alerter?: (resume: ResumeSynchronisation) => void | Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Outils
 * ------------------------------------------------------------------ */

/**
 * La première ligne d'un résultat, ou une erreur qui dit laquelle manquait.
 *
 * Exportée pour être testable seule : c'est un chemin qu'aucun scénario normal
 * n'atteint (un `insert ... returning` rend toujours sa ligne), et un garde-fou
 * jamais exécuté est un garde-fou qu'on ne sait pas correct.
 */
export function exigerLigne<T>(lignes: readonly T[], quoi: string): T {
  const [ligne] = lignes;
  if (ligne === undefined) {
    throw new Error(
      `La base n'a rendu aucune ligne pour ${quoi}. Écriture perdue sans erreur : on refuse de continuer.`,
    );
  }
  return ligne;
}

/**
 * Décrit une erreur **et toute sa chaîne de causes**.
 *
 * `ErreurFfbb` range la panne réseau d'origine en `cause` ; s'arrêter au message
 * de surface écrirait « Requête FFBB impossible » au journal sans jamais dire que
 * c'était un DNS qui ne répondait pas. Fonctionne aussi sur ce qui n'est pas une
 * `Error` : `String(...)` accepte tout, et le journal ne doit pas rester muet
 * parce qu'un appelant a levé autre chose.
 */
function decrireErreur(erreur: unknown): string {
  const chaine: string[] = [];
  for (let courante: unknown = erreur; courante instanceof Error; courante = courante.cause) {
    chaine.push(String(courante));
  }
  return [String(erreur), ...chaine.slice(1)].join(" ← ");
}

/** Valeur de colonne → texte affichable au back-office. `null` reste `null`. */
function representerValeur(valeur: ValeurColonne): string | null {
  if (valeur === null) return null;
  if (valeur instanceof Date) return valeur.toISOString();
  return String(valeur);
}

/* ------------------------------------------------------------------ *
 * Traduction : colonnes FFBB → colonnes de `rencontre`
 * ------------------------------------------------------------------ */

/** Les identifiants du référentiel, une fois les codes FFBB résolus en `uuid`. */
interface ReferencesResolues {
  readonly saisonId: string;
  readonly competitionId: string;
  readonly pouleId: string;
  readonly organismeDomicileId: string | null;
  readonly organismeExterieurId: string | null;
  readonly salleId: string | null;
}

/**
 * Les colonnes de `rencontre` correspondant une à une à `ColonnesFfbbRencontre`,
 * mais exprimées comme la table les porte : des `uuid` là où la normalisation
 * parlait en codes FFBB.
 */
interface ValeursRencontreFfbb {
  cleNaturelle: string;
  slug: string;
  saisonId: string;
  competitionId: string;
  pouleId: string;
  equipeId: string | null;
  organismeDomicileId: string | null;
  organismeExterieurId: string | null;
  nomEquipeDomicileFfbb: string;
  nomEquipeExterieurFfbb: string;
  salleId: string | null;
  dateHeure: Date;
  heureConfirmee: boolean;
  numero: string;
  journee: number;
  statut: StatutNormalise;
  scoreDomicile: number | null;
  scoreExterieur: number | null;
  forfaitDomicile: boolean;
  forfaitExterieur: boolean;
}

/**
 * Correspondance colonne fusionnable → colonne de la table.
 *
 * Le type mappé impose une entrée **par** colonne de `ColonnesFfbbRencontre` :
 * ajouter demain une colonne alimentée par la FFBB sans la traduire ici ne
 * compile pas. Une table de correspondance plutôt qu'un `switch` avec son cas
 * par défaut inatteignable — un garde-fou de type vaut mieux qu'une branche morte.
 */
const COLONNE_SQL: { readonly [C in keyof ColonnesFfbbRencontre]: keyof ValeursRencontreFfbb } = {
  cleNaturelle: "cleNaturelle",
  slug: "slug",
  saisonCodeFfbb: "saisonId",
  competitionCodeFfbb: "competitionId",
  pouleCodeFfbb: "pouleId",
  equipeId: "equipeId",
  organismeDomicileCodeFfbb: "organismeDomicileId",
  organismeExterieurCodeFfbb: "organismeExterieurId",
  nomEquipeDomicileFfbb: "nomEquipeDomicileFfbb",
  nomEquipeExterieurFfbb: "nomEquipeExterieurFfbb",
  salleCodeFfbb: "salleId",
  dateHeure: "dateHeure",
  heureConfirmee: "heureConfirmee",
  numero: "numero",
  journee: "journee",
  statut: "statut",
  scoreDomicile: "scoreDomicile",
  scoreExterieur: "scoreExterieur",
  forfaitDomicile: "forfaitDomicile",
  forfaitExterieur: "forfaitExterieur",
};

function construireValeurs(
  colonnes: ColonnesFfbbRencontre,
  references: ReferencesResolues,
): ValeursRencontreFfbb {
  return {
    cleNaturelle: colonnes.cleNaturelle,
    slug: colonnes.slug,
    saisonId: references.saisonId,
    competitionId: references.competitionId,
    pouleId: references.pouleId,
    equipeId: colonnes.equipeId,
    organismeDomicileId: references.organismeDomicileId,
    organismeExterieurId: references.organismeExterieurId,
    nomEquipeDomicileFfbb: colonnes.nomEquipeDomicileFfbb,
    nomEquipeExterieurFfbb: colonnes.nomEquipeExterieurFfbb,
    salleId: references.salleId,
    dateHeure: colonnes.dateHeure,
    heureConfirmee: colonnes.heureConfirmee,
    numero: colonnes.numero,
    journee: colonnes.journee,
    statut: colonnes.statut,
    scoreDomicile: colonnes.scoreDomicile,
    scoreExterieur: colonnes.scoreExterieur,
    forfaitDomicile: colonnes.forfaitDomicile,
    forfaitExterieur: colonnes.forfaitExterieur,
  };
}

/** Recopie une clé d'un objet vers un autre en gardant la corrélation clé/valeur. */
function recopier<K extends keyof ValeursRencontreFfbb>(
  cible: Partial<ValeursRencontreFfbb>,
  source: ValeursRencontreFfbb,
  cle: K,
): void {
  cible[cle] = source[cle];
}

/**
 * **Exactement** les colonnes que la fusion a rendues, et rien d'autre.
 *
 * C'est le contrat de T05 : ce qu'elle n'a pas rendu n'a pas à être écrit — une
 * colonne verrouillée divergente, par exemple, doit rester intouchée pendant que
 * ses voisines se mettent à jour.
 */
function extraireColonnes(
  colonnes: Partial<ColonnesFfbbRencontre>,
  valeurs: ValeursRencontreFfbb,
): Partial<ValeursRencontreFfbb> {
  const sortie: Partial<ValeursRencontreFfbb> = {};
  for (const champ of Object.keys(colonnes) as (keyof ColonnesFfbbRencontre)[]) {
    recopier(sortie, valeurs, COLONNE_SQL[champ]);
  }
  return sortie;
}

/* ------------------------------------------------------------------ *
 * Lectures préalables
 * ------------------------------------------------------------------ */

type TransactionBdd = Parameters<Parameters<BaseDeDonnees["transaction"]>[0]>[0];

interface ReferentielSaisons {
  /** Code FFBB → `uuid`. Une saison sans `code_ffbb` n'y figure pas. */
  readonly idParCodeFfbb: ReadonlyMap<string, string>;
  readonly codeFfbbParId: ReadonlyMap<string, string>;
}

async function lireSaisons(base: BaseDeDonnees): Promise<ReferentielSaisons> {
  const lignes = await base.select({ id: saison.id, codeFfbb: saison.codeFfbb }).from(saison);
  const idParCodeFfbb = new Map<string, string>();
  const codeFfbbParId = new Map<string, string>();
  for (const ligne of lignes) {
    // Une saison créée au back-office avant d'être ouverte côté FFBB n'a pas
    // encore de code : elle existe, mais aucun document ne peut s'y rattacher.
    if (ligne.codeFfbb === null) continue;
    idParCodeFfbb.set(ligne.codeFfbb, ligne.id);
    codeFfbbParId.set(ligne.id, ligne.codeFfbb);
  }
  return { idParCodeFfbb, codeFfbbParId };
}

/**
 * Les engagements du club, avec le code FFBB de leur saison. C'est la **seule**
 * clé de rattachement d'une rencontre à une de nos équipes (aucune heuristique de
 * ressemblance, cf. `normalisation.ts`).
 */
async function lireEngagements(
  base: BaseDeDonnees,
  saisons: ReferentielSaisons,
): Promise<EngagementConnu[]> {
  const lignes = await base
    .select({
      equipeId: engagement.equipeId,
      saisonId: engagement.saisonId,
      libellesFfbb: engagement.libellesFfbb,
    })
    .from(engagement);
  return lignes.flatMap((ligne) => {
    const saisonCodeFfbb = saisons.codeFfbbParId.get(ligne.saisonId);
    if (saisonCodeFfbb === undefined) return [];
    return [{ equipeId: ligne.equipeId, saisonCodeFfbb, libellesFfbb: ligne.libellesFfbb }];
  });
}

const organismeDomicile = alias(organisme, "organisme_domicile");
const organismeExterieur = alias(organisme, "organisme_exterieur");

/**
 * Les rencontres déjà connues de la FFBB, **reconstruites dans le vocabulaire de
 * la fusion** : codes FFBB plutôt qu'`uuid`, sept statuts plutôt que cinq.
 */
async function lireEtatsActuels(base: BaseDeDonnees, idsFfbb: readonly string[]) {
  return base
    .select({
      id: rencontre.id,
      // Le `where` ci-dessous ne retient que des lignes dont `id_ffbb` est
      // renseigné : la colonne est déclarée nullable, la valeur lue ne l'est pas.
      // On le dit au typage plutôt que d'ajouter une garde que rien n'atteint.
      idFfbb: sql<string>`${rencontre.idFfbb}`,
      majLe: rencontre.majLe,
      disparueDeFfbbLe: rencontre.disparueDeFfbbLe,
      empreinteFfbb: rencontre.empreinteFfbb,
      champsVerrouilles: rencontre.champsVerrouilles,
      cleNaturelle: rencontre.cleNaturelle,
      slug: rencontre.slug,
      saisonCodeFfbb: saison.codeFfbb,
      competitionCodeFfbb: competition.codeFfbb,
      pouleCodeFfbb: poule.codeFfbb,
      equipeId: rencontre.equipeId,
      organismeDomicileCodeFfbb: organismeDomicile.codeFfbb,
      organismeExterieurCodeFfbb: organismeExterieur.codeFfbb,
      nomEquipeDomicileFfbb: rencontre.nomEquipeDomicileFfbb,
      nomEquipeExterieurFfbb: rencontre.nomEquipeExterieurFfbb,
      salleCodeFfbb: salle.codeFfbb,
      dateHeure: rencontre.dateHeure,
      heureConfirmee: rencontre.heureConfirmee,
      numero: rencontre.numero,
      journee: rencontre.journee,
      statut: rencontre.statut,
      scoreDomicile: rencontre.scoreDomicile,
      scoreExterieur: rencontre.scoreExterieur,
      forfaitDomicile: rencontre.forfaitDomicile,
      forfaitExterieur: rencontre.forfaitExterieur,
    })
    .from(rencontre)
    .innerJoin(saison, eq(rencontre.saisonId, saison.id))
    .leftJoin(competition, eq(rencontre.competitionId, competition.id))
    .leftJoin(poule, eq(rencontre.pouleId, poule.id))
    .leftJoin(organismeDomicile, eq(rencontre.organismeDomicileId, organismeDomicile.id))
    .leftJoin(organismeExterieur, eq(rencontre.organismeExterieurId, organismeExterieur.id))
    .leftJoin(salle, eq(rencontre.salleId, salle.id))
    .where(inArray(rencontre.idFfbb, idsFfbb));
}

type LigneEtatActuel = Awaited<ReturnType<typeof lireEtatsActuels>>[number];

/**
 * Le nombre de rencontres que nous tenons pour **encore publiées** par la FFBB.
 * C'est la seule mesure dont le garde-fou anti-effacement de masse a besoin : un
 * index vide devant une base peuplée est suspect, quelle que soit la saison.
 */
async function compterRencontresVivantes(base: BaseDeDonnees): Promise<number> {
  const lignes = await base
    .select({ id: rencontre.id })
    .from(rencontre)
    .where(and(isNotNull(rencontre.idFfbb), isNull(rencontre.disparueDeFfbbLe)));
  return lignes.length;
}

/* ------------------------------------------------------------------ *
 * Référentiel : création à la volée, idempotente
 * ------------------------------------------------------------------ */

/**
 * Cache d'une exécution : une même compétition revient sur des dizaines de
 * rencontres, et la relire à chaque fois serait un N+1 pur (docs/qualite.md).
 */
interface CacheReferentiel {
  readonly organismes: Map<string, string>;
  readonly competitions: Map<string, string>;
  readonly poules: Map<string, string>;
  readonly salles: Map<string, string>;
}

function creerCacheReferentiel(): CacheReferentiel {
  return { organismes: new Map(), competitions: new Map(), poules: new Map(), salles: new Map() };
}

async function obtenirOuCreerOrganisme(
  tx: TransactionBdd,
  cache: CacheReferentiel,
  reference: ReferenceOrganisme,
): Promise<string> {
  const connu = cache.organismes.get(reference.codeFfbb);
  if (connu !== undefined) return connu;

  const existantes = await tx
    .select({ id: organisme.id })
    .from(organisme)
    .where(eq(organisme.codeFfbb, reference.codeFfbb))
    .limit(1);
  const [existante] = existantes;
  if (existante !== undefined) {
    cache.organismes.set(reference.codeFfbb, existante.id);
    return existante.id;
  }

  const creees = await tx
    .insert(organisme)
    .values({ codeFfbb: reference.codeFfbb, nom: reference.nom, estLeClub: reference.estLeClub })
    .returning({ id: organisme.id });
  const creee = exigerLigne(creees, `la création de l'organisme ${reference.codeFfbb}`);
  cache.organismes.set(reference.codeFfbb, creee.id);
  return creee.id;
}

async function obtenirOuCreerCompetition(
  tx: TransactionBdd,
  cache: CacheReferentiel,
  saisonId: string,
  reference: ReferenceCompetition,
): Promise<string> {
  const cle = `${saisonId}|${reference.codeFfbb}`;
  const connue = cache.competitions.get(cle);
  if (connue !== undefined) return connue;

  const existantes = await tx
    .select({ id: competition.id })
    .from(competition)
    .where(and(eq(competition.saisonId, saisonId), eq(competition.codeFfbb, reference.codeFfbb)))
    .limit(1);
  const [existante] = existantes;
  if (existante !== undefined) {
    cache.competitions.set(cle, existante.id);
    return existante.id;
  }

  const creees = await tx
    .insert(competition)
    .values({
      saisonId,
      codeFfbb: reference.codeFfbb,
      nom: reference.nom,
      categorie: reference.categorie,
      niveau: reference.niveau,
    })
    .returning({ id: competition.id });
  const creee = exigerLigne(creees, `la création de la compétition ${reference.codeFfbb}`);
  cache.competitions.set(cle, creee.id);
  return creee.id;
}

async function obtenirOuCreerPoule(
  tx: TransactionBdd,
  cache: CacheReferentiel,
  competitionId: string,
  reference: ReferencePoule,
): Promise<string> {
  const cle = `${competitionId}|${reference.codeFfbb}`;
  const connue = cache.poules.get(cle);
  if (connue !== undefined) return connue;

  const existantes = await tx
    .select({ id: poule.id })
    .from(poule)
    .where(and(eq(poule.competitionId, competitionId), eq(poule.codeFfbb, reference.codeFfbb)))
    .limit(1);
  const [existante] = existantes;
  if (existante !== undefined) {
    cache.poules.set(cle, existante.id);
    return existante.id;
  }

  const creees = await tx
    .insert(poule)
    .values({ competitionId, codeFfbb: reference.codeFfbb, nom: reference.nom })
    .returning({ id: poule.id });
  const creee = exigerLigne(creees, `la création de la poule ${reference.codeFfbb}`);
  cache.poules.set(cle, creee.id);
  return creee.id;
}

async function obtenirOuCreerSalle(
  tx: TransactionBdd,
  cache: CacheReferentiel,
  reference: ReferenceSalle,
): Promise<string> {
  const connue = cache.salles.get(reference.codeFfbb);
  if (connue !== undefined) return connue;

  const existantes = await tx
    .select({ id: salle.id })
    .from(salle)
    .where(eq(salle.codeFfbb, reference.codeFfbb))
    .limit(1);
  const [existante] = existantes;
  if (existante !== undefined) {
    cache.salles.set(reference.codeFfbb, existante.id);
    return existante.id;
  }

  const creees = await tx
    .insert(salle)
    .values({
      codeFfbb: reference.codeFfbb,
      nom: reference.nom,
      adresse: reference.adresse,
      codePostal: reference.codePostal,
      ville: reference.ville,
      latitude: reference.latitude,
      longitude: reference.longitude,
    })
    .returning({ id: salle.id });
  const creee = exigerLigne(creees, `la création de la salle ${reference.codeFfbb}`);
  cache.salles.set(reference.codeFfbb, creee.id);
  return creee.id;
}

async function resoudreReferences(
  tx: TransactionBdd,
  cache: CacheReferentiel,
  saisonId: string,
  normalisee: RencontreNormalisee,
): Promise<ReferencesResolues> {
  const { references } = normalisee;
  const competitionId = await obtenirOuCreerCompetition(
    tx,
    cache,
    saisonId,
    references.competition,
  );
  return {
    saisonId,
    competitionId,
    pouleId: await obtenirOuCreerPoule(tx, cache, competitionId, references.poule),
    organismeDomicileId:
      references.organismeDomicile === null
        ? null
        : await obtenirOuCreerOrganisme(tx, cache, references.organismeDomicile),
    organismeExterieurId:
      references.organismeExterieur === null
        ? null
        : await obtenirOuCreerOrganisme(tx, cache, references.organismeExterieur),
    salleId:
      references.salle === null ? null : await obtenirOuCreerSalle(tx, cache, references.salle),
  };
}

/* ------------------------------------------------------------------ *
 * Conflits
 * ------------------------------------------------------------------ */

interface ConflitAOuvrir {
  readonly rencontreId: string;
  readonly champ: string;
  readonly valeurLocale: string | null;
  readonly valeurFfbb: string | null;
}

/**
 * Ouvre un conflit, ou ne fait rien s'il est **déjà ouvert**.
 *
 * Un conflit non résolu est re-détecté à chaque passage : c'est voulu (T05), une
 * divergence non arbitrée doit rester visible. Sans `on conflict do nothing`
 * adossé à l'index unique partiel `conflit_synchronisation_ouvert_unique`, le
 * back-office se remplirait d'un doublon par synchronisation et deviendrait
 * illisible en une journée.
 *
 * Renvoie `true` si une ligne a réellement été créée : c'est ce que compte
 * `nb_conflits`.
 */
async function ouvrirConflit(
  tx: TransactionBdd,
  journalId: string,
  detecteLe: Date,
  conflit: ConflitAOuvrir,
): Promise<boolean> {
  const creees = await tx
    .insert(conflitSynchronisation)
    .values({ ...conflit, journalId, detecteLe })
    .onConflictDoNothing()
    .returning({ id: conflitSynchronisation.id });
  return creees.length > 0;
}

/* ------------------------------------------------------------------ *
 * Application : la transaction
 * ------------------------------------------------------------------ */

/** Une rencontre normalisée, sa saison résolue et la décision de fusion la concernant. */
interface RencontreAAppliquer {
  readonly normalisee: RencontreNormalisee;
  readonly saisonId: string;
  /** `null` pour une rencontre encore inconnue : c'est ce qui commande la création. */
  readonly ligne: LigneEtatActuel | null;
  readonly resultat: ReturnType<typeof fusionner>;
}

interface Compteurs {
  nbCreees: number;
  nbMisesAJour: number;
  nbInchangees: number;
  nbDisparues: number;
  nbConflits: number;
}

/** Ce que toute écriture de la transaction traîne avec elle. */
interface ContexteEcriture {
  readonly tx: TransactionBdd;
  readonly journalId: string;
  readonly instant: Date;
  readonly compteurs: Compteurs;
}

async function ouvrirConflitsDeFusion(
  ecriture: ContexteEcriture,
  rencontreId: string,
  conflits: readonly ConflitFusion[],
): Promise<void> {
  for (const conflit of conflits) {
    const ouvert = await ouvrirConflit(ecriture.tx, ecriture.journalId, ecriture.instant, {
      rencontreId,
      champ: conflit.champ,
      valeurLocale: representerValeur(conflit.valeurLocale),
      valeurFfbb: representerValeur(conflit.valeurFfbb),
    });
    if (ouvert) ecriture.compteurs.nbConflits += 1;
  }
}

/**
 * Crée la rencontre, en désambiguïsant `cle_naturelle` et `slug` **si et
 * seulement si** ils entrent en collision.
 *
 * C'est le seul moment où ces deux colonnes s'écrivent : T05 ne les réémet plus
 * jamais en mise à jour, précisément pour que la valeur choisie ici soit
 * définitive. La collision se cherche dans la transaction en cours, de sorte que
 * deux rencontres du même lot — un aller-retour joué le même jour sur un plateau,
 * cas prévu par l'ADR 0002 — se voient l'une l'autre.
 *
 * Une collision de clé naturelle est en outre signalée comme conflit sur la
 * rencontre déjà en place : c'est peut-être un aller-retour légitime, c'est
 * peut-être une renumérotation FFBB, et seul un humain peut trancher.
 */
async function creerRencontre(
  ecriture: ContexteEcriture,
  normalisee: RencontreNormalisee,
  references: ReferencesResolues,
  empreinteFfbb: string | undefined,
  conflits: readonly ConflitFusion[],
): Promise<void> {
  const { tx, journalId, instant, compteurs } = ecriture;
  // À la création, `fusionner` rend exactement les colonnes normalisées et
  // l'empreinte : la ligne s'écrit donc entière, sans rien choisir de plus.
  const valeurs = construireValeurs(normalisee.colonnes, references);
  const idFfbb = normalisee.idFfbb;

  const jumelles = await tx
    .select({
      id: rencontre.id,
      idFfbb: rencontre.idFfbb,
      cleNaturelle: rencontre.cleNaturelle,
      slug: rencontre.slug,
    })
    .from(rencontre)
    .where(or(eq(rencontre.cleNaturelle, valeurs.cleNaturelle), eq(rencontre.slug, valeurs.slug)));

  const jumelleParCle = jumelles.find((autre) => autre.cleNaturelle === valeurs.cleNaturelle);
  const cleNaturelle =
    jumelleParCle === undefined
      ? valeurs.cleNaturelle
      : desambiguiserCleNaturelle(valeurs.cleNaturelle, idFfbb);
  const slug = jumelles.some((autre) => autre.slug === valeurs.slug)
    ? desambiguiserSlug(valeurs.slug, idFfbb)
    : valeurs.slug;

  const creees = await tx
    .insert(rencontre)
    .values({
      ...valeurs,
      cleNaturelle,
      slug,
      idFfbb,
      source: "ffbb",
      empreinteFfbb,
      vuDansFfbbLe: instant,
    })
    .returning({ id: rencontre.id });
  const creee = exigerLigne(creees, `la création de la rencontre FFBB ${idFfbb}`);
  compteurs.nbCreees += 1;

  if (jumelleParCle !== undefined) {
    const ouvert = await ouvrirConflit(tx, journalId, instant, {
      rencontreId: jumelleParCle.id,
      champ: CHAMP_CONFLIT_IDENTIFIANT,
      valeurLocale: jumelleParCle.idFfbb,
      valeurFfbb: idFfbb,
    });
    if (ouvert) compteurs.nbConflits += 1;
  }

  await ouvrirConflitsDeFusion(ecriture, creee.id, conflits);
}

/**
 * Met à jour une rencontre connue : les colonnes rendues par la fusion, plus
 * `vu_dans_ffbb_le` — écrit **quelle que soit l'action**, puisqu'il dit « vue au
 * dernier passage » et non « modifiée ».
 *
 * `disparue_de_ffbb_le` repasse à `null` : une rencontre réapparue dans l'index
 * n'est plus disparue, et laisser l'horodatage en place la rangerait pour
 * toujours parmi les anomalies du tableau de bord.
 *
 * `maj_le` n'est préservé que si **rien** ne change par ailleurs. Un horodatage
 * de modification qui avance parce qu'on a simplement revu la rencontre dans
 * l'index est un horodatage qui ment — et c'est aussi ce qui prouve
 * l'idempotence : réimporter deux fois de suite laisse la base strictement
 * identique.
 */
async function mettreAJourRencontre(
  ecriture: ContexteEcriture,
  ligne: LigneEtatActuel,
  normalisee: RencontreNormalisee,
  references: ReferencesResolues,
  colonnes: Partial<ColonnesFfbbRencontre>,
  empreinteFfbb: string | undefined,
  conflits: readonly ConflitFusion[],
): Promise<void> {
  const { tx, instant, compteurs } = ecriture;
  const valeurs = construireValeurs(normalisee.colonnes, references);
  const aEcrire = extraireColonnes(colonnes, valeurs);
  const nbColonnes = Object.keys(aEcrire).length;

  const majLe = ligne.majLe;
  // Rien à écrire et rien à rétablir : l'horodatage de modification ne doit pas
  // bouger pour un simple « revue dans l'index ». C'est ce qui rend un réimport
  // identique strictement sans effet.
  const rienNeChange =
    nbColonnes === 0 && empreinteFfbb === undefined && ligne.disparueDeFfbbLe === null;

  await tx
    .update(rencontre)
    .set({
      ...aEcrire,
      ...(empreinteFfbb === undefined ? {} : { empreinteFfbb }),
      vuDansFfbbLe: instant,
      disparueDeFfbbLe: null,
      ...(rienNeChange ? { majLe } : {}),
    })
    .where(eq(rencontre.id, ligne.id));

  if (rienNeChange) compteurs.nbInchangees += 1;
  else compteurs.nbMisesAJour += 1;

  await ouvrirConflitsDeFusion(ecriture, ligne.id, conflits);
}

/**
 * Marque les rencontres qui ne figurent plus dans l'index. **Aucun `DELETE`,
 * jamais** : c'est ce qui construit l'historique pluriannuel que la FFBB ne garde
 * pas, et c'est irréversible dans l'autre sens.
 *
 * Le périmètre se limite aux saisons effectivement lues : l'index ne contient que
 * la saison en cours, et comparer les saisons antérieures à un index qui ne les
 * porte pas archiverait tout l'historique d'un coup.
 */
async function marquerDisparitions(
  ecriture: ContexteEcriture,
  saisonIds: string[],
  idsVus: string[],
): Promise<void> {
  const { tx, journalId, instant, compteurs } = ecriture;
  const disparues = await tx
    .select({
      id: rencontre.id,
      statut: rencontre.statut,
      champsVerrouilles: rencontre.champsVerrouilles,
    })
    .from(rencontre)
    .where(
      and(
        isNotNull(rencontre.idFfbb),
        isNull(rencontre.disparueDeFfbbLe),
        inArray(rencontre.saisonId, saisonIds),
        notInArray(rencontre.idFfbb, idsVus),
      ),
    );

  for (const ligne of disparues) {
    compteurs.nbDisparues += 1;
    const aVenir = STATUTS_A_VENIR.has(ligne.statut);
    // Un statut verrouillé est une décision humaine : la disparition la signale,
    // elle ne l'écrase pas. Une rencontre jouée, elle, reste telle quelle — c'est
    // exactement ce qu'on veut archiver.
    const statutModifiable = aVenir && !ligne.champsVerrouilles.includes(CHAMP_CONFLIT_STATUT);

    await tx
      .update(rencontre)
      .set(
        statutModifiable
          ? { statut: "a_confirmer", disparueDeFfbbLe: instant }
          : { disparueDeFfbbLe: instant },
      )
      .where(eq(rencontre.id, ligne.id));

    if (aVenir) {
      const ouvert = await ouvrirConflit(tx, journalId, instant, {
        rencontreId: ligne.id,
        champ: CHAMP_CONFLIT_STATUT,
        valeurLocale: ligne.statut,
        // `null` : la FFBB ne publie plus rien sur cette rencontre. Ce n'est pas
        // une valeur manquante, c'est l'absence elle-même qui est l'information.
        valeurFfbb: null,
      });
      if (ouvert) compteurs.nbConflits += 1;
    }
  }
}

async function appliquer(
  tx: TransactionBdd,
  journalId: string,
  instant: Date,
  aAppliquer: readonly RencontreAAppliquer[],
): Promise<Compteurs> {
  const compteurs: Compteurs = {
    nbCreees: 0,
    nbMisesAJour: 0,
    nbInchangees: 0,
    nbDisparues: 0,
    nbConflits: 0,
  };
  const ecriture: ContexteEcriture = { tx, journalId, instant, compteurs };
  const cache = creerCacheReferentiel();

  for (const element of aAppliquer) {
    const references = await resoudreReferences(tx, cache, element.saisonId, element.normalisee);
    // Les trois formes de `colonnes` rendues par la fusion se lisent à travers ce
    // seul type : `ColonnesACreer` comme `Record<string, never>` s'y conforment.
    const colonnes: Partial<ColonnesFfbbRencontre> & { readonly empreinteFfbb?: string } =
      element.resultat.colonnes;
    const { empreinteFfbb, ...colonnesFfbb } = colonnes;

    if (element.ligne === null) {
      await creerRencontre(
        ecriture,
        element.normalisee,
        references,
        empreinteFfbb,
        element.resultat.conflits,
      );
      continue;
    }
    await mettreAJourRencontre(
      ecriture,
      element.ligne,
      element.normalisee,
      references,
      colonnesFfbb,
      empreinteFfbb,
      element.resultat.conflits,
    );
  }

  if (aAppliquer.length > 0) {
    await marquerDisparitions(
      ecriture,
      [...new Set(aAppliquer.map((element) => element.saisonId))],
      aAppliquer.map((element) => element.normalisee.idFfbb),
    );
  }
  return compteurs;
}

/* ------------------------------------------------------------------ *
 * Préparation : normalisation, fusion, classement des écartés
 * ------------------------------------------------------------------ */

/**
 * Reconstruit l'état d'une ligne existante dans le vocabulaire de la fusion.
 *
 * `null` quand la ligne ne porte pas les codes FFBB de son référentiel : elle a
 * alors été saisie à la main avec un `id_ffbb`, et la comparer reviendrait à
 * inventer les valeurs manquantes. Le document est écarté, bruyamment, plutôt que
 * d'écraser une saisie sur une comparaison fausse.
 */
function construireEtatActuel(ligne: LigneEtatActuel): EtatActuelRencontre | null {
  const { saisonCodeFfbb, competitionCodeFfbb, pouleCodeFfbb } = ligne;
  if (saisonCodeFfbb === null) return null;
  if (competitionCodeFfbb === null) return null;
  if (pouleCodeFfbb === null) return null;
  const colonnes: ColonnesRencontreEnBase = {
    cleNaturelle: ligne.cleNaturelle,
    slug: ligne.slug,
    saisonCodeFfbb,
    competitionCodeFfbb,
    pouleCodeFfbb,
    equipeId: ligne.equipeId,
    organismeDomicileCodeFfbb: ligne.organismeDomicileCodeFfbb,
    organismeExterieurCodeFfbb: ligne.organismeExterieurCodeFfbb,
    nomEquipeDomicileFfbb: ligne.nomEquipeDomicileFfbb,
    nomEquipeExterieurFfbb: ligne.nomEquipeExterieurFfbb,
    salleCodeFfbb: ligne.salleCodeFfbb,
    dateHeure: ligne.dateHeure,
    heureConfirmee: ligne.heureConfirmee,
    numero: ligne.numero,
    journee: ligne.journee,
    statut: ligne.statut,
    scoreDomicile: ligne.scoreDomicile,
    scoreExterieur: ligne.scoreExterieur,
    forfaitDomicile: ligne.forfaitDomicile,
    forfaitExterieur: ligne.forfaitExterieur,
  };
  return {
    empreinteFfbb: ligne.empreinteFfbb,
    champsVerrouilles: ligne.champsVerrouilles,
    colonnes,
  };
}

interface Preparation {
  readonly aAppliquer: RencontreAAppliquer[];
  readonly ecartes: DocumentEcarte[];
  readonly nonRapprochees: RencontreNonRapprochee[];
}

/**
 * Traduit et décide, sans rien écrire.
 *
 * Tout ce qui est écarté l'est **ici**, avant la transaction : une rencontre sans
 * aucun organisme violerait `rencontre_organisme_connu` et ferait tomber la
 * transaction du lot entier pour un seul document. On préfère la compter comme
 * document invalide et importer les autres.
 */
function preparer(
  lecture: LectureRencontresFfbb,
  contexte: ContexteNormalisation,
  saisons: ReferentielSaisons,
  etats: ReadonlyMap<string, LigneEtatActuel>,
): Preparation {
  const aAppliquer: RencontreAAppliquer[] = [];
  const nonRapprochees: RencontreNonRapprochee[] = [];
  const ecartes: DocumentEcarte[] = lecture.ecartes.map(decrireDocumentRefuse);

  for (const document of lecture.rencontres) {
    let normalisee: RencontreNormalisee;
    try {
      // La normalisation est pure et ne lève qu'une `ErreurNormalisationFfbb`.
      // Attraper large n'avale rien pour autant : le message intégral part au
      // journal, le document est compté invalide, et le seuil des 5 % transforme
      // une anomalie systématique en échec franc de l'exécution.
      normalisee = normaliser(document, contexte);
    } catch (erreur) {
      ecartes.push({ idFfbb: document.id, motif: decrireErreur(erreur) });
      continue;
    }

    const { colonnes } = normalisee;
    if (
      colonnes.organismeDomicileCodeFfbb === null &&
      colonnes.organismeExterieurCodeFfbb === null
    ) {
      ecartes.push({
        idFfbb: normalisee.idFfbb,
        motif:
          "aucun organisme FFBB des deux côtés : la rencontre n'est rattachable à personne " +
          "et la contrainte rencontre_organisme_connu la refuserait",
      });
      continue;
    }

    const saisonId = saisons.idParCodeFfbb.get(colonnes.saisonCodeFfbb);
    if (saisonId === undefined) {
      ecartes.push({
        idFfbb: normalisee.idFfbb,
        motif:
          `aucune saison en base ne porte le code FFBB « ${colonnes.saisonCodeFfbb} ». ` +
          `Créez-la au back-office : la synchronisation n'invente pas de dates de saison`,
      });
      continue;
    }

    const ligne = etats.get(normalisee.idFfbb) ?? null;
    const etatActuel = ligne === null ? null : construireEtatActuel(ligne);
    if (ligne !== null && etatActuel === null) {
      ecartes.push({
        idFfbb: normalisee.idFfbb,
        motif:
          "la rencontre déjà en base ne porte pas les codes FFBB de sa saison, de sa " +
          "compétition ou de sa poule : comparer reviendrait à inventer les valeurs manquantes",
      });
      continue;
    }

    let resultat: RencontreAAppliquer["resultat"];
    try {
      // `fusionner` lève sur un `champs_verrouilles` qui nomme une colonne
      // inexistante — une saisie fautive au back-office, pas une panne de la FFBB.
      resultat = fusionner(etatActuel, normalisee);
    } catch (erreur) {
      ecartes.push({ idFfbb: normalisee.idFfbb, motif: decrireErreur(erreur) });
      continue;
    }

    if (normalisee.rapprochement.motifNonRapproche !== null) {
      nonRapprochees.push({
        idFfbb: normalisee.idFfbb,
        libelleFfbb: normalisee.rapprochement.libelleFfbb,
        motif: normalisee.rapprochement.motifNonRapproche,
      });
    }
    aAppliquer.push({ normalisee, saisonId, ligne, resultat });
  }

  return { aAppliquer, ecartes, nonRapprochees };
}

function decrireDocumentRefuse(ecarte: DocumentFfbbEcarte): DocumentEcarte {
  return {
    idFfbb: ecarte.idFfbb,
    motif: `refusé par le schéma FFBB — ${ecarte.problemes.join(" ; ")}`,
  };
}

/* ------------------------------------------------------------------ *
 * Journal
 * ------------------------------------------------------------------ */

const COMPTEURS_VIDES: CompteursSynchronisation = {
  nbLues: 0,
  nbCreees: 0,
  nbMisesAJour: 0,
  nbInchangees: 0,
  nbDisparues: 0,
  nbInvalides: 0,
  nbConflits: 0,
  nbNonRapprochees: 0,
};

/**
 * Compose le message du journal : les documents écartés, un par ligne, et les
 * incidents réparés en vol. `null` quand il n'y a rien à dire — la contrainte
 * `journal_echec_avec_message` interdit de son côté un échec muet.
 */
function composerMessage(
  entete: string | null,
  ecartes: readonly DocumentEcarte[],
  incidents: readonly string[],
): string | null {
  const lignes = [
    ...(entete === null ? [] : [entete]),
    ...ecartes.map(
      (ecarte) => `Document ${ecarte.idFfbb ?? "(identifiant illisible)"} : ${ecarte.motif}`,
    ),
    ...incidents.map((incident) => `Incident réparé : ${incident}`),
  ];
  return lignes.length === 0 ? null : lignes.join("\n");
}

async function ouvrirJournal(
  dependances: DependancesSynchronisation,
  demarreeLe: Date,
): Promise<string> {
  const creees = await dependances.base
    .insert(journalSynchronisation)
    .values({
      declencheur: dependances.declencheur,
      declencheeParId: dependances.declencheeParId,
      statut: "en_cours",
      demarreeLe,
    })
    .returning({ id: journalSynchronisation.id });
  return exigerLigne(creees, "l'ouverture du journal de synchronisation").id;
}

async function refermerJournal(base: BaseDeDonnees, resume: ResumeSynchronisation): Promise<void> {
  await base
    .update(journalSynchronisation)
    .set({
      statut: resume.statut,
      termineeLe: resume.termineeLe,
      dureeMs: resume.dureeMs,
      messageErreur: resume.messageErreur,
      ...resume.compteurs,
    })
    .where(eq(journalSynchronisation.id, resume.journalId));
}

function alerterParDefaut(resume: ResumeSynchronisation): void {
  // Une exécution non réussie qui ne préviendrait personne serait exactement le
  // bug silencieux que le projet refuse. T07 branchera ici la vraie notification.
  console.error("[synchronisation FFBB] exécution non réussie", {
    statut: resume.statut,
    journalId: resume.journalId,
    messageErreur: resume.messageErreur,
    compteurs: resume.compteurs,
  });
}

/* ------------------------------------------------------------------ *
 * Point d'entrée
 * ------------------------------------------------------------------ */

/** Ce que l'exécution rapporte, avant que le résumé ne lui ajoute ses horodatages. */
interface Issue {
  readonly statut: StatutSynchronisation;
  /** En-tête du message de journal : la cause de l'échec, ou `null` sur un succès. */
  readonly entete: string | null;
  readonly compteurs: CompteursSynchronisation;
  readonly ecartes: readonly DocumentEcarte[];
  readonly nonRapprochees: readonly RencontreNonRapprochee[];
}

function echouer(entete: string, ecartes: readonly DocumentEcarte[]): Issue {
  return {
    statut: "echec",
    entete,
    compteurs: COMPTEURS_VIDES,
    ecartes,
    nonRapprochees: [],
  };
}

async function executer(
  dependances: DependancesSynchronisation,
  journalId: string,
  maintenant: () => Date,
  instant: Date,
  incidents: string[],
): Promise<Issue> {
  const { base, codeClubFfbb } = dependances;

  const jetons = creerFournisseurDeJetons({
    base,
    maintenant,
    transport: dependances.transport,
    // Le cache est un artefact dérivé : une ligne abîmée se répare en une
    // requête. Mais l'incident doit laisser une trace, sinon il se reproduit
    // indéfiniment sans que personne ne le sache.
    onCacheIllisible: (erreur) => {
      incidents.push(String(erreur));
    },
  });
  const client = creerClientFfbb(jetons, dependances.transport);

  const lecture = await client.listerRencontresDuClub(codeClubFfbb);
  const nbLues = lecture.rencontres.length + lecture.ecartes.length;

  const saisons = await lireSaisons(base);
  const contexte: ContexteNormalisation = {
    codeClubFfbb,
    engagements: await lireEngagements(base, saisons),
    maintenant: instant,
  };
  const lignesConnues = await lireEtatsActuels(
    base,
    lecture.rencontres.map((document) => document.id),
  );
  const etats = new Map(lignesConnues.map((ligne) => [ligne.idFfbb, ligne] as const));

  const preparation = preparer(lecture, contexte, saisons, etats);
  const nbInvalides = preparation.ecartes.length;

  // Le format a probablement changé : importer la moitié d'un calendrier serait
  // pire que ne rien importer, puisque le site afficherait une saison amputée
  // sans que rien ne le signale au visiteur.
  if (nbInvalides > nbLues * PROPORTION_INVALIDES_MAX) {
    return echouer(
      `${String(nbInvalides)} document(s) écarté(s) sur ${String(nbLues)} lu(s), au-delà du seuil ` +
        `de ${String(Math.round(PROPORTION_INVALIDES_MAX * 100))} % : le format FFBB a probablement ` +
        `changé. Aucune écriture n'a été faite.`,
      preparation.ecartes,
    );
  }

  // Garde-fou anti-effacement de masse. Un index vide est indiscernable d'une
  // panne partielle côté FFBB : appliquer les disparitions archiverait toute la
  // saison d'un coup, sur une information dont on ne sait pas si elle est vraie.
  if (nbLues === 0) {
    const vivantes = await compterRencontresVivantes(base);
    if (vivantes > 0) {
      return echouer(
        `L'index FFBB est revenu vide alors que la base porte ${String(vivantes)} rencontre(s) ` +
          `encore publiée(s). Aucune disparition n'a été appliquée et rien n'a été écrit : ` +
          `garde-fou anti-effacement de masse.`,
        [],
      );
    }
  }

  const compteursEcriture = await base.transaction((tx) =>
    appliquer(tx, journalId, instant, preparation.aAppliquer),
  );

  const statut: StatutSynchronisation =
    nbInvalides > 0 || incidents.length > 0 ? "partiel" : "succes";

  return {
    statut,
    entete: null,
    compteurs: {
      nbLues,
      nbInvalides,
      nbNonRapprochees: preparation.nonRapprochees.length,
      ...compteursEcriture,
    },
    ecartes: preparation.ecartes,
    nonRapprochees: preparation.nonRapprochees,
  };
}

/**
 * Synchronise le calendrier et les résultats du club depuis la FFBB.
 *
 * Ne lève pas : une exécution ratée est une exécution **journalisée** en `echec`
 * avec son message, puis signalée à `alerter`. C'est l'appelant (T07) qui en
 * déduit son code HTTP. Lever aurait laissé le journal ouvert en `en_cours`, donc
 * une panne sans trace exploitable.
 */
export async function synchroniser(
  dependances: DependancesSynchronisation,
): Promise<ResumeSynchronisation> {
  const maintenant = dependances.maintenant ?? (() => new Date());
  const demarreeLe = maintenant();
  const journalId = await ouvrirJournal(dependances, demarreeLe);
  const incidents: string[] = [];

  let issue: Issue;
  try {
    issue = await executer(dependances, journalId, maintenant, demarreeLe, incidents);
  } catch (erreur) {
    // Rien n'est avalé : le message intégral, chaîne de causes comprise, part au
    // journal et à l'alerte. La transaction, elle, a déjà été annulée par le
    // driver — c'est tout l'intérêt de n'en ouvrir qu'une.
    issue = echouer(decrireErreur(erreur), []);
  }

  const termineeLe = maintenant();
  const { entete, ...reste } = issue;
  const resume: ResumeSynchronisation = {
    journalId,
    demarreeLe,
    termineeLe,
    dureeMs: termineeLe.getTime() - demarreeLe.getTime(),
    incidents,
    messageErreur: composerMessage(entete, issue.ecartes, incidents),
    ...reste,
  };
  await refermerJournal(dependances.base, resume);

  if (resume.statut !== "succes") {
    await (dependances.alerter ?? alerterParDefaut)(resume);
  }
  return resume;
}
