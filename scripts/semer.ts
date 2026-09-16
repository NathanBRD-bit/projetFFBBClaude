import { getTableColumns, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import type { BaseDeDonnees } from "../src/infrastructure/bdd/client";
import {
  article,
  categorieArticle,
  competition,
  conflitSynchronisation,
  engagement,
  equipe,
  joueur,
  joueurEquipe,
  journalSynchronisation,
  organisme,
  parametre,
  poule,
  rencontre,
  saison,
  salle,
  statistiqueJoueur,
  utilisateur,
} from "../src/infrastructure/bdd/schema";

/**
 * Jeu de données de démonstration du SOCL.
 *
 * Deux propriétés non négociables :
 *
 * 1. **Idempotent** — chaque ligne porte un identifiant fixe et est écrite en
 *    `insert … on conflict (id) do update`. Rejouer le script ne duplique rien,
 *    n'échoue pas, et laisse la base dans un état strictement identique.
 * 2. **Représentatif des cas pénibles** — un match à venir sans score, un match passé
 *    dont le score n'est jamais remonté, un report, un forfait, une heure non
 *    confirmée, un match disparu de l'index FFBB, un article brouillon, des points
 *    de joueurs partiellement saisis. Un jeu de données propre ne prouve rien.
 *
 * ⚠️ Données à faire valider par le club : seul le code FFBB du SOCL
 * (`PDL0049077`), les deux salles et le match U11 M du 19/09/2026 proviennent de
 * sources vérifiées. La composition exacte des 7 équipes, les codes FFBB des clubs
 * adverses et les scores sont **plausibles mais inventés** — ce sont des fixtures de
 * développement, pas des données de production.
 */

/** Code FFBB officiel du Stade Olympique Candé Loiré. */
export const CODE_FFBB_SOCL = "PDL0049077";

/**
 * Construit un uuid stable et lisible. Le groupe identifie la table, le suffixe la
 * ligne : une violation de contrainte affiche ainsi un identifiant qu'on reconnaît.
 */
function uuidFixe(groupe: string, suffixe: string): string {
  return `${groupe}-0000-4000-8000-${suffixe.padStart(12, "0")}`;
}

const idSaison = (n: string) => uuidFixe("5a150000", n);
const idOrganisme = (n: string) => uuidFixe("06000000", n);
const idCompetition = (n: string) => uuidFixe("c0000000", n);
const idPoule = (n: string) => uuidFixe("b0000000", n);
const idSalle = (n: string) => uuidFixe("5a110000", n);
const idEquipe = (n: string) => uuidFixe("e0000000", n);
const idEngagement = (n: string) => uuidFixe("e9000000", n);
const idJoueur = (n: string) => uuidFixe("10000000", n);
const idJoueurEquipe = (n: string) => uuidFixe("1e000000", n);
const idRencontre = (n: string) => uuidFixe("4e000000", n);
const idStatistique = (n: string) => uuidFixe("57a70000", n);
const idCategorie = (n: string) => uuidFixe("ca700000", n);
const idArticle = (n: string) => uuidFixe("a4000000", n);
const idUtilisateur = (n: string) => uuidFixe("05e40000", n);
const idParametre = (n: string) => uuidFixe("9a4a0000", n);
const idJournal = (n: string) => uuidFixe("10640000", n);
const idConflit = (n: string) => uuidFixe("c0f10000", n);

/**
 * Colonnes jamais réécrites lors d'un rejeu : la clé primaire, et les horodatages
 * techniques. Les laisser intacts est ce qui rend le second passage *strictement*
 * sans effet — sinon `maj_le` bougerait à chaque exécution et l'état final
 * différerait.
 */
const COLONNES_NON_REECRITES = new Set(["id", "creeLe", "majLe", "saisiLe", "demarreeLe"]);

/**
 * Construit la clause `do update set` d'un upsert : toutes les colonnes métier sont
 * réalignées sur les valeurs du script, aucune autre n'est touchée.
 */
function reecrireColonnesMetier<T extends PgTable>(table: T) {
  const misesAJour: Record<string, ReturnType<typeof sql.raw>> = {};
  for (const [nomPropriete, colonne] of Object.entries(getTableColumns(table))) {
    if (COLONNES_NON_REECRITES.has(nomPropriete)) continue;
    misesAJour[nomPropriete] = sql.raw(`excluded."${colonne.name}"`);
  }
  return misesAJour;
}

/** Fuseau du club : les horaires sont saisis en heure locale, stockés en UTC. */
const h = (iso: string) => new Date(iso);

// --- Référentiel -----------------------------------------------------------------

const SAISONS = [
  {
    id: idSaison("2526"),
    code: "25-26",
    libelle: "Saison 2025-2026",
    codeFfbb: "2025-2026",
    debutLe: "2025-09-01",
    finLe: "2026-06-30",
    estCourante: false,
  },
  {
    id: idSaison("2627"),
    code: "26-27",
    libelle: "Saison 2026-2027",
    codeFfbb: "2026-2027",
    debutLe: "2026-09-01",
    finLe: "2027-06-30",
    // Une seule saison courante : l'index unique partiel refuserait la deuxième.
    estCourante: true,
  },
];

const ORGANISMES = [
  {
    id: idOrganisme("1"),
    codeFfbb: CODE_FFBB_SOCL,
    nom: "Stade Olympique Candé Loiré",
    nomCourt: "SOCL",
    ville: "Candé",
    estLeClub: true,
  },
  {
    id: idOrganisme("2"),
    codeFfbb: "PDL0049101",
    nom: "Basket Club de Chazé-sur-Argos",
    nomCourt: "BC Chazé",
    ville: "Chazé-sur-Argos",
    estLeClub: false,
  },
  {
    id: idOrganisme("3"),
    codeFfbb: "PDL0049102",
    nom: "Segré Basket Club",
    nomCourt: "Segré BC",
    ville: "Segré-en-Anjou Bleu",
    estLeClub: false,
  },
  {
    id: idOrganisme("4"),
    codeFfbb: "PDL0049103",
    nom: "Le Lion d'Angers Basket",
    nomCourt: "Lion d'Angers",
    ville: "Le Lion-d'Angers",
    estLeClub: false,
  },
  {
    id: idOrganisme("5"),
    codeFfbb: "PDL0049104",
    nom: "Pouancé Basket",
    nomCourt: "Pouancé",
    ville: "Ombrée d'Anjou",
    estLeClub: false,
  },
  {
    id: idOrganisme("6"),
    codeFfbb: "PDL0049105",
    nom: "Vern d'Anjou Basket",
    nomCourt: "Vern",
    ville: "Erdre-en-Anjou",
    estLeClub: false,
  },
];

const SALLES = [
  {
    id: idSalle("1"),
    codeFfbb: "SALLE049077A",
    nom: "Complexe Sportif R. Loison",
    adresse: "Rue du Stade",
    codePostal: "49440",
    ville: "Candé",
    latitude: 47.5697,
    longitude: -1.0397,
  },
  {
    id: idSalle("2"),
    codeFfbb: "SALLE049077B",
    nom: "Salle de Loiré",
    adresse: "Rue de la Mairie",
    codePostal: "49440",
    ville: "Loiré",
    // Coordonnées inconnues : les deux colonnes restent nulles ensemble, la
    // contrainte `salle_coordonnees_ensemble` interdit la demi-information.
    latitude: null,
    longitude: null,
  },
  {
    id: idSalle("3"),
    codeFfbb: null,
    nom: "Salle des Sports",
    adresse: null,
    codePostal: "49500",
    ville: "Chazé-sur-Argos",
    latitude: null,
    longitude: null,
  },
];

const COMPETITIONS = [
  {
    id: idCompetition("1"),
    saisonId: idSaison("2526"),
    codeFfbb: "D1U11M-2526",
    nom: "Départemental U11 Masculins",
    categorie: "U11",
    niveau: "Départemental",
  },
  {
    id: idCompetition("2"),
    saisonId: idSaison("2526"),
    codeFfbb: "D2SM-2526",
    nom: "Départemental 2 Seniors Masculins",
    categorie: "Senior",
    niveau: "Départemental 2",
  },
  {
    id: idCompetition("3"),
    saisonId: idSaison("2627"),
    codeFfbb: "D1U11M-2627",
    nom: "Départemental U11 Masculins",
    categorie: "U11",
    niveau: "Départemental",
  },
  {
    id: idCompetition("4"),
    saisonId: idSaison("2627"),
    codeFfbb: "D1U13M-2627",
    nom: "Départemental U13 Masculins",
    categorie: "U13",
    niveau: "Départemental",
  },
  {
    id: idCompetition("5"),
    saisonId: idSaison("2627"),
    codeFfbb: "D2SM-2627",
    nom: "Départemental 2 Seniors Masculins",
    categorie: "Senior",
    niveau: "Départemental 2",
  },
];

const POULES = [
  { id: idPoule("1"), competitionId: idCompetition("1"), codeFfbb: "A", nom: "Poule A" },
  { id: idPoule("2"), competitionId: idCompetition("2"), codeFfbb: "B", nom: "Poule B" },
  { id: idPoule("3"), competitionId: idCompetition("3"), codeFfbb: "A", nom: "Poule A" },
  { id: idPoule("4"), competitionId: idCompetition("4"), codeFfbb: "A", nom: "Poule A" },
  { id: idPoule("5"), competitionId: idCompetition("5"), codeFfbb: "B", nom: "Poule B" },
];

// --- Club -------------------------------------------------------------------------

const EQUIPES = [
  {
    id: idEquipe("1"),
    slug: "u9-mixte",
    nom: "U9 Mixte",
    categorie: "U9",
    sexe: "mixte" as const,
    ordre: 1,
    creneauxMd: "Entraînement : mercredi 14 h – 15 h 30, Complexe Sportif R. Loison.",
  },
  {
    id: idEquipe("2"),
    slug: "u11-masculins",
    nom: "U11 Masculins",
    categorie: "U11",
    sexe: "masculin" as const,
    ordre: 2,
    creneauxMd: "Entraînement : mercredi 15 h 30 – 17 h, Complexe Sportif R. Loison.",
  },
  {
    id: idEquipe("3"),
    slug: "u13-masculins",
    nom: "U13 Masculins",
    categorie: "U13",
    sexe: "masculin" as const,
    ordre: 3,
    creneauxMd: "Entraînement : mardi 18 h – 19 h 30, Salle de Loiré.",
  },
  {
    id: idEquipe("4"),
    slug: "u15-feminines",
    nom: "U15 Féminines",
    categorie: "U15",
    sexe: "feminin" as const,
    ordre: 4,
    creneauxMd: "Entraînement : jeudi 18 h – 19 h 30, Complexe Sportif R. Loison.",
  },
  {
    id: idEquipe("5"),
    slug: "u18-feminines",
    nom: "U18 Féminines",
    categorie: "U18",
    sexe: "feminin" as const,
    ordre: 5,
    creneauxMd: "Entraînement : mardi 19 h 30 – 21 h, Complexe Sportif R. Loison.",
  },
  {
    id: idEquipe("6"),
    slug: "seniors-masculins",
    nom: "Seniors Masculins",
    categorie: "Senior",
    sexe: "masculin" as const,
    ordre: 6,
    creneauxMd: "Entraînement : vendredi 20 h – 22 h, Complexe Sportif R. Loison.",
  },
  {
    id: idEquipe("7"),
    slug: "veterans-masculins",
    nom: "Vétérans Masculins",
    categorie: "Vétérans",
    sexe: "masculin" as const,
    ordre: 7,
    creneauxMd: "Entraînement : lundi 20 h 30 – 22 h, Salle de Loiré.",
  },
  {
    id: idEquipe("8"),
    slug: "seniors-feminines",
    nom: "Seniors Féminines",
    categorie: "Senior",
    sexe: "feminin" as const,
    ordre: 8,
    creneauxMd: "Entraînement : jeudi 20 h – 22 h, Salle de Loiré.",
  },
];

const ENGAGEMENTS = [
  {
    id: idEngagement("1"),
    equipeId: idEquipe("2"),
    saisonId: idSaison("2526"),
    competitionId: idCompetition("1"),
    pouleId: idPoule("1"),
    libellesFfbb: ["SO CANDE LOIRE BASKET - 1", "SO CANDE LOIRE BASKET U11M"],
  },
  {
    id: idEngagement("2"),
    equipeId: idEquipe("6"),
    saisonId: idSaison("2526"),
    competitionId: idCompetition("2"),
    pouleId: idPoule("2"),
    libellesFfbb: ["SO CANDE LOIRE BASKET - 1"],
  },
  {
    id: idEngagement("3"),
    equipeId: idEquipe("2"),
    saisonId: idSaison("2627"),
    competitionId: idCompetition("3"),
    pouleId: idPoule("3"),
    libellesFfbb: ["SO CANDE LOIRE BASKET - 1", "SO CANDE LOIRE BASKET U11M"],
  },
  {
    id: idEngagement("4"),
    equipeId: idEquipe("3"),
    saisonId: idSaison("2627"),
    competitionId: idCompetition("4"),
    pouleId: idPoule("4"),
    libellesFfbb: ["SO CANDE LOIRE BASKET - 1"],
  },
  {
    id: idEngagement("5"),
    equipeId: idEquipe("6"),
    saisonId: idSaison("2627"),
    competitionId: idCompetition("5"),
    pouleId: idPoule("5"),
    // Aucun libellé rapproché pour l'instant : le tableau de bord doit le signaler.
    libellesFfbb: [],
  },
];

/**
 * Effectif de démonstration. `visible_publiquement` reste **faux** partout : tant que
 * les autorisations de droit à l'image des mineurs ne sont pas recueillies, aucun
 * joueur ne s'affiche côté public (voir le plan, risque RGPD).
 */
const JOUEURS = [
  { id: idJoueur("1"), nomAffiche: "Léo M.", numero: 4 },
  { id: idJoueur("2"), nomAffiche: "Timéo B.", numero: 5 },
  { id: idJoueur("3"), nomAffiche: "Noah R.", numero: 7 },
  { id: idJoueur("4"), nomAffiche: "Ethan L.", numero: 8 },
  { id: idJoueur("5"), nomAffiche: "Jules P.", numero: 10 },
  { id: idJoueur("6"), nomAffiche: "Raphaël D.", numero: 12 },
];

const JOUEURS_EQUIPES = JOUEURS.map((j, index) => ({
  id: idJoueurEquipe(String(index + 1)),
  joueurId: j.id,
  equipeId: idEquipe("2"),
  saisonId: idSaison("2627"),
}));

// --- Administration ----------------------------------------------------------------

/**
 * Empreinte volontairement invalide : aucun compte semé ne doit pouvoir se connecter.
 * Un mot de passe par défaut, même « temporaire », finit toujours en production.
 * La création des vrais comptes se fera en T10, par la commande dédiée.
 */
const HASH_INUTILISABLE = "semis:aucun-mot-de-passe-valide";

const UTILISATEURS = [
  {
    id: idUtilisateur("1"),
    email: "admin@socl-basket.fr",
    nomAffiche: "Compte administrateur (semis)",
    motDePasseHash: HASH_INUTILISABLE,
    role: "administrateur" as const,
  },
  {
    id: idUtilisateur("2"),
    email: "redaction@socl-basket.fr",
    nomAffiche: "Compte rédacteur (semis)",
    motDePasseHash: HASH_INUTILISABLE,
    role: "redacteur" as const,
  },
];

const PARAMETRES = [
  {
    id: idParametre("1"),
    cle: "reseaux.instagram",
    valeur: "https://www.instagram.com/socl_basket/",
    description: "Compte Instagram du club, affiché en pied de page.",
  },
  {
    id: idParametre("2"),
    cle: "reseaux.facebook",
    valeur: "https://www.facebook.com/soclbasket",
    description: "Page Facebook du club, affichée en pied de page.",
  },
];

// --- Rencontres ---------------------------------------------------------------------

const RENCONTRES = [
  // 1. Le seul match réellement publié par la FFBB au 14/09/2026 : à venir, sans score.
  {
    id: idRencontre("1"),
    idFfbb: "FFBB-2627-U11M-0001",
    cleNaturelle: "26-27|D1U11M|CHAZE|CANDE|2026-09-19",
    slug: "2026-09-19-chaze-sur-argos-cande-u11m",
    saisonId: idSaison("2627"),
    competitionId: idCompetition("3"),
    pouleId: idPoule("3"),
    equipeId: idEquipe("2"),
    organismeDomicileId: idOrganisme("2"),
    organismeExterieurId: idOrganisme("1"),
    nomEquipeDomicileFfbb: "BC CHAZE SUR ARGOS - 1",
    nomEquipeExterieurFfbb: "SO CANDE LOIRE BASKET - 1",
    salleId: idSalle("3"),
    dateHeure: h("2026-09-19T14:00:00+02:00"),
    heureConfirmee: true,
    numero: "1",
    journee: 1,
    statut: "a_venir" as const,
    scoreDomicile: null,
    scoreExterieur: null,
    source: "ffbb" as const,
    vuDansFfbbLe: h("2026-09-14T06:00:00+02:00"),
  },
  // 2. À venir, à domicile.
  {
    id: idRencontre("2"),
    idFfbb: "FFBB-2627-U11M-0002",
    cleNaturelle: "26-27|D1U11M|CANDE|SEGRE|2026-10-03",
    slug: "2026-10-03-cande-segre-u11m",
    saisonId: idSaison("2627"),
    competitionId: idCompetition("3"),
    pouleId: idPoule("3"),
    equipeId: idEquipe("2"),
    organismeDomicileId: idOrganisme("1"),
    organismeExterieurId: idOrganisme("3"),
    nomEquipeDomicileFfbb: "SO CANDE LOIRE BASKET - 1",
    nomEquipeExterieurFfbb: "SEGRE BC - 2",
    salleId: idSalle("1"),
    dateHeure: h("2026-10-03T14:00:00+02:00"),
    heureConfirmee: true,
    numero: "2",
    journee: 2,
    statut: "a_venir" as const,
    scoreDomicile: null,
    scoreExterieur: null,
    source: "ffbb" as const,
    vuDansFfbbLe: h("2026-09-14T06:00:00+02:00"),
  },
  // 3. Date connue, **heure non confirmée** : le rendu doit écrire « horaire à
  //    confirmer » et surtout pas « 00:00 ».
  {
    id: idRencontre("3"),
    idFfbb: "FFBB-2627-U13M-0003",
    cleNaturelle: "26-27|D1U13M|LION|CANDE|2026-10-10",
    slug: "2026-10-10-le-lion-dangers-cande-u13m",
    saisonId: idSaison("2627"),
    competitionId: idCompetition("4"),
    pouleId: idPoule("4"),
    equipeId: idEquipe("3"),
    organismeDomicileId: idOrganisme("4"),
    organismeExterieurId: idOrganisme("1"),
    nomEquipeDomicileFfbb: "LE LION D ANGERS - 1",
    nomEquipeExterieurFfbb: "SO CANDE LOIRE BASKET - 1",
    salleId: null,
    dateHeure: h("2026-10-10T00:00:00+02:00"),
    heureConfirmee: false,
    numero: "3",
    journee: 3,
    statut: "a_venir" as const,
    scoreDomicile: null,
    scoreExterieur: null,
    source: "ffbb" as const,
    vuDansFfbbLe: h("2026-09-14T06:00:00+02:00"),
  },
  // 4. **Reporté** : aucun score, et surtout pas de 0-0.
  {
    id: idRencontre("4"),
    idFfbb: "FFBB-2627-SM-0004",
    cleNaturelle: "26-27|D2SM|CANDE|POUANCE|2026-11-14",
    slug: "2026-11-14-cande-pouance-sm",
    saisonId: idSaison("2627"),
    competitionId: idCompetition("5"),
    pouleId: idPoule("5"),
    equipeId: idEquipe("6"),
    organismeDomicileId: idOrganisme("1"),
    organismeExterieurId: idOrganisme("5"),
    nomEquipeDomicileFfbb: "SO CANDE LOIRE BASKET - 1",
    nomEquipeExterieurFfbb: "POUANCE BASKET - 1",
    salleId: idSalle("1"),
    dateHeure: h("2026-11-14T20:30:00+01:00"),
    heureConfirmee: true,
    numero: "4",
    journee: 6,
    statut: "reporte" as const,
    scoreDomicile: null,
    scoreExterieur: null,
    source: "ffbb" as const,
    vuDansFfbbLe: h("2026-09-14T06:00:00+02:00"),
  },
  // 5. **Forfait** de l'équipe visiteuse : 20-0 réglementaire.
  {
    id: idRencontre("5"),
    idFfbb: "FFBB-2526-SM-0005",
    cleNaturelle: "25-26|D2SM|CANDE|VERN|2026-01-17",
    slug: "2026-01-17-cande-vern-sm",
    saisonId: idSaison("2526"),
    competitionId: idCompetition("2"),
    pouleId: idPoule("2"),
    equipeId: idEquipe("6"),
    organismeDomicileId: idOrganisme("1"),
    organismeExterieurId: idOrganisme("6"),
    nomEquipeDomicileFfbb: "SO CANDE LOIRE BASKET - 1",
    nomEquipeExterieurFfbb: "VERN D ANJOU - 2",
    salleId: idSalle("1"),
    dateHeure: h("2026-01-17T20:30:00+01:00"),
    heureConfirmee: true,
    numero: "5",
    journee: 11,
    statut: "forfait" as const,
    scoreDomicile: 20,
    scoreExterieur: 0,
    forfaitExterieur: true,
    source: "ffbb" as const,
    vuDansFfbbLe: h("2026-06-30T06:00:00+02:00"),
  },
  // 6. Match joué, score complet : la victoire de référence pour les tests de lecture.
  {
    id: idRencontre("6"),
    idFfbb: "FFBB-2526-U11M-0006",
    cleNaturelle: "25-26|D1U11M|CANDE|CHAZE|2025-11-15",
    slug: "2025-11-15-cande-chaze-u11m",
    saisonId: idSaison("2526"),
    competitionId: idCompetition("1"),
    pouleId: idPoule("1"),
    equipeId: idEquipe("2"),
    organismeDomicileId: idOrganisme("1"),
    organismeExterieurId: idOrganisme("2"),
    nomEquipeDomicileFfbb: "SO CANDE LOIRE BASKET - 1",
    nomEquipeExterieurFfbb: "BC CHAZE SUR ARGOS - 1",
    salleId: idSalle("1"),
    dateHeure: h("2025-11-15T14:00:00+01:00"),
    heureConfirmee: true,
    numero: "6",
    journee: 4,
    statut: "joue" as const,
    scoreDomicile: 58,
    scoreExterieur: 42,
    source: "ffbb" as const,
    vuDansFfbbLe: h("2026-06-30T06:00:00+02:00"),
  },
  // 7. Match joué à l'extérieur, défaite.
  {
    id: idRencontre("7"),
    idFfbb: "FFBB-2526-U11M-0007",
    cleNaturelle: "25-26|D1U11M|SEGRE|CANDE|2025-12-06",
    slug: "2025-12-06-segre-cande-u11m",
    saisonId: idSaison("2526"),
    competitionId: idCompetition("1"),
    pouleId: idPoule("1"),
    equipeId: idEquipe("2"),
    organismeDomicileId: idOrganisme("3"),
    organismeExterieurId: idOrganisme("1"),
    nomEquipeDomicileFfbb: "SEGRE BC - 2",
    nomEquipeExterieurFfbb: "SO CANDE LOIRE BASKET - 1",
    salleId: null,
    dateHeure: h("2025-12-06T14:00:00+01:00"),
    heureConfirmee: true,
    numero: "7",
    journee: 7,
    statut: "joue" as const,
    scoreDomicile: 61,
    scoreExterieur: 44,
    source: "ffbb" as const,
    vuDansFfbbLe: h("2026-06-30T06:00:00+02:00"),
  },
  // 8. **Match passé dont le score n'a jamais été remonté.** Cas typique de la FFBB.
  //    Il passe en `score_manquant` avec des scores `null` : la contrainte
  //    `rencontre_joue_avec_score` interdit précisément de le marquer « joué » sans
  //    score, ce qui évite d'afficher un 0-0 inventé.
  {
    id: idRencontre("8"),
    idFfbb: "FFBB-2526-U11M-0008",
    cleNaturelle: "25-26|D1U11M|CANDE|LION|2026-02-07",
    slug: "2026-02-07-cande-le-lion-dangers-u11m",
    saisonId: idSaison("2526"),
    competitionId: idCompetition("1"),
    pouleId: idPoule("1"),
    equipeId: idEquipe("2"),
    organismeDomicileId: idOrganisme("1"),
    organismeExterieurId: idOrganisme("4"),
    nomEquipeDomicileFfbb: "SO CANDE LOIRE BASKET - 1",
    nomEquipeExterieurFfbb: "LE LION D ANGERS - 1",
    salleId: idSalle("1"),
    dateHeure: h("2026-02-07T14:00:00+01:00"),
    heureConfirmee: true,
    numero: "8",
    journee: 13,
    statut: "score_manquant" as const,
    scoreDomicile: null,
    scoreExterieur: null,
    source: "ffbb" as const,
    vuDansFfbbLe: h("2026-06-30T06:00:00+02:00"),
  },
  // 9. **Annulé.**
  {
    id: idRencontre("9"),
    idFfbb: "FFBB-2526-SM-0009",
    cleNaturelle: "25-26|D2SM|POUANCE|CANDE|2026-03-14",
    slug: "2026-03-14-pouance-cande-sm",
    saisonId: idSaison("2526"),
    competitionId: idCompetition("2"),
    pouleId: idPoule("2"),
    equipeId: idEquipe("6"),
    organismeDomicileId: idOrganisme("5"),
    organismeExterieurId: idOrganisme("1"),
    nomEquipeDomicileFfbb: "POUANCE BASKET - 1",
    nomEquipeExterieurFfbb: "SO CANDE LOIRE BASKET - 1",
    salleId: null,
    dateHeure: h("2026-03-14T20:30:00+01:00"),
    heureConfirmee: true,
    numero: "9",
    journee: 18,
    statut: "annule" as const,
    scoreDomicile: null,
    scoreExterieur: null,
    source: "ffbb" as const,
    vuDansFfbbLe: h("2026-06-30T06:00:00+02:00"),
  },
  // 10. **Disparu de l'index FFBB** : jamais supprimé, seulement horodaté. Le match
  //     était à venir, il repasse donc en `a_confirmer` avec un conflit visible.
  {
    id: idRencontre("10"),
    idFfbb: "FFBB-2627-SM-0010",
    cleNaturelle: "26-27|D2SM|VERN|CANDE|2026-12-05",
    slug: "2026-12-05-vern-danjou-cande-sm",
    saisonId: idSaison("2627"),
    competitionId: idCompetition("5"),
    pouleId: idPoule("5"),
    equipeId: idEquipe("6"),
    organismeDomicileId: idOrganisme("6"),
    organismeExterieurId: idOrganisme("1"),
    nomEquipeDomicileFfbb: "VERN D ANJOU - 2",
    nomEquipeExterieurFfbb: "SO CANDE LOIRE BASKET - 1",
    salleId: null,
    dateHeure: h("2026-12-05T20:30:00+01:00"),
    heureConfirmee: true,
    numero: "10",
    journee: 8,
    statut: "a_confirmer" as const,
    scoreDomicile: null,
    scoreExterieur: null,
    source: "ffbb" as const,
    vuDansFfbbLe: h("2026-09-10T06:00:00+02:00"),
    disparueDeFfbbLe: h("2026-09-14T06:00:00+02:00"),
  },
  // 11. **Saisi à la main** : pas d'`id_ffbb`, horaire verrouillé pour que la sync ne
  //     l'écrase pas si le match finit par apparaître dans l'index.
  {
    id: idRencontre("11"),
    idFfbb: null,
    cleNaturelle: "26-27|AMICAL|CANDE|SEGRE|2026-09-05",
    slug: "2026-09-05-cande-segre-amical",
    saisonId: idSaison("2627"),
    competitionId: null,
    pouleId: null,
    equipeId: idEquipe("6"),
    organismeDomicileId: idOrganisme("1"),
    organismeExterieurId: idOrganisme("3"),
    nomEquipeDomicileFfbb: null,
    nomEquipeExterieurFfbb: null,
    salleId: idSalle("2"),
    dateHeure: h("2026-09-05T18:00:00+02:00"),
    heureConfirmee: true,
    numero: null,
    journee: null,
    statut: "joue" as const,
    scoreDomicile: 71,
    scoreExterieur: 66,
    source: "manuel" as const,
    champsVerrouilles: ["date_heure", "salle_id"],
    resumeMd: "Match amical de reprise, disputé jusqu'au bout.",
  },
];

/**
 * Points par joueur, **volontairement partiels** : trois lignes saisies, une ligne
 * « a joué mais points non saisis » (`null`, à ne pas confondre avec `0`) et une
 * ligne « n'a pas joué ». Le rendu public doit rester présentable dans tous les cas.
 */
const STATISTIQUES = [
  {
    id: idStatistique("1"),
    rencontreId: idRencontre("6"),
    joueurId: idJoueur("1"),
    aJoue: true,
    points: 14,
    saisiPar: idUtilisateur("1"),
  },
  {
    id: idStatistique("2"),
    rencontreId: idRencontre("6"),
    joueurId: idJoueur("2"),
    aJoue: true,
    points: 8,
    saisiPar: idUtilisateur("1"),
  },
  {
    id: idStatistique("3"),
    rencontreId: idRencontre("6"),
    joueurId: idJoueur("3"),
    aJoue: true,
    points: 0, // Zéro point marqué : une vraie valeur, à distinguer de « non saisi ».
    saisiPar: idUtilisateur("1"),
  },
  {
    id: idStatistique("4"),
    rencontreId: idRencontre("6"),
    joueurId: idJoueur("4"),
    aJoue: true,
    points: null, // Non saisi.
    saisiPar: idUtilisateur("1"),
  },
  {
    id: idStatistique("5"),
    rencontreId: idRencontre("6"),
    joueurId: idJoueur("5"),
    aJoue: false,
    points: null,
    saisiPar: idUtilisateur("1"),
  },
];

// --- Éditorial -----------------------------------------------------------------------

const CATEGORIES = [
  {
    id: idCategorie("1"),
    slug: "comptes-rendus",
    nom: "Comptes rendus",
    description: "Retour sur les matchs du week-end.",
    ordre: 1,
  },
  {
    id: idCategorie("2"),
    slug: "vie-du-club",
    nom: "Vie du club",
    description: "Tournois, stages, événements et bénévolat.",
    ordre: 2,
  },
  {
    id: idCategorie("3"),
    slug: "annonces",
    nom: "Annonces",
    description: "Informations pratiques et communiqués.",
    ordre: 3,
  },
];

const ARTICLES = [
  {
    id: idArticle("1"),
    slug: "reprise-des-entrainements-2026-2027",
    titre: "Reprise des entraînements : le calendrier de la saison",
    chapo: "Toutes les équipes reprennent la semaine du 1er septembre.",
    corpsMd:
      "Les créneaux de la saison 2026-2027 sont arrêtés.\n\n" +
      "Les U9 et U11 s'entraînent le mercredi après-midi au Complexe Sportif R. Loison, " +
      "les U13 et les vétérans à la Salle de Loiré.\n\n" +
      "Une permanence d'inscription est tenue le samedi matin au complexe.",
    categorieId: idCategorie("3"),
    auteurId: idUtilisateur("1"),
    statut: "publie" as const,
    publieLe: h("2026-08-28T09:00:00+02:00"),
    imageCouvertureUrl: "https://exemple.invalid/medias/reprise-2026.jpg",
    // Alternative obligatoire dès qu'une image est présente : la contrainte
    // `article_image_alt_obligatoire` refuserait la ligne sans elle.
    imageCouvertureAlt: "Jeunes joueurs du SOCL à l'entraînement dans le gymnase de Candé",
  },
  {
    id: idArticle("2"),
    slug: "victoire-des-u11-contre-chaze",
    titre: "Les U11 s'imposent 58-42 contre Chazé",
    chapo: "Une deuxième mi-temps solide a fait la différence.",
    corpsMd:
      "Menés à la pause, les U11 ont haussé le ton au retour des vestiaires.\n\n" +
      "Un collectif appliqué en défense et une adresse retrouvée ont permis de creuser " +
      "l'écart dans le dernier quart-temps.",
    categorieId: idCategorie("1"),
    auteurId: idUtilisateur("2"),
    statut: "publie" as const,
    publieLe: h("2025-11-16T18:30:00+01:00"),
    imageCouvertureUrl: null,
    imageCouvertureAlt: null,
  },
  {
    id: idArticle("3"),
    slug: "tournoi-de-fin-de-saison",
    titre: "Tournoi de fin de saison : appel aux bénévoles",
    chapo: "Le club cherche des renforts pour la buvette et la table de marque.",
    corpsMd:
      "Le tournoi se tiendra au Complexe Sportif R. Loison.\n\n" +
      "Toute aide est la bienvenue, même pour une heure.",
    categorieId: idCategorie("2"),
    auteurId: idUtilisateur("2"),
    // Brouillon : `publie_le` reste nul, et l'article doit être invisible du public.
    statut: "brouillon" as const,
    publieLe: null,
    imageCouvertureUrl: null,
    imageCouvertureAlt: null,
  },
];

// --- Synchronisation -------------------------------------------------------------------

const JOURNAUX = [
  {
    id: idJournal("1"),
    declencheur: "github_actions" as const,
    declencheeParId: null,
    statut: "succes" as const,
    demarreeLe: h("2026-09-14T06:00:00+02:00"),
    termineeLe: h("2026-09-14T06:00:04+02:00"),
    dureeMs: 4120,
    nbLues: 11,
    nbCreees: 0,
    nbMisesAJour: 0,
    nbInchangees: 10,
    nbInvalides: 0,
    nbDisparues: 1,
    messageErreur: null,
  },
];

const CONFLITS = [
  {
    id: idConflit("1"),
    rencontreId: idRencontre("11"),
    champ: "date_heure",
    valeurLocale: "2026-09-05T18:00:00+02:00",
    valeurFfbb: "2026-09-05T20:30:00+02:00",
    journalId: idJournal("1"),
    detecteLe: h("2026-09-14T06:00:03+02:00"),
    resoluLe: null,
    resoluParId: null,
    resolution: null,
  },
];

/** Ce que le script a écrit, pour que l'appelant puisse l'afficher ou l'asserter. */
export interface ResumeSemis {
  saisons: number;
  organismes: number;
  salles: number;
  competitions: number;
  poules: number;
  equipes: number;
  engagements: number;
  joueurs: number;
  utilisateurs: number;
  rencontres: number;
  statistiques: number;
  articles: number;
}

/**
 * Écrit le jeu de démonstration. Tout passe dans **une seule transaction** : un semis
 * à moitié appliqué serait pire qu'un semis en échec.
 */
export async function semer(base: BaseDeDonnees): Promise<ResumeSemis> {
  await base.transaction(async (tx) => {
    // L'ordre suit les dépendances de clés étrangères.
    await tx
      .insert(saison)
      .values(SAISONS)
      .onConflictDoUpdate({ target: saison.id, set: reecrireColonnesMetier(saison) });
    await tx
      .insert(organisme)
      .values(ORGANISMES)
      .onConflictDoUpdate({ target: organisme.id, set: reecrireColonnesMetier(organisme) });
    await tx
      .insert(salle)
      .values(SALLES)
      .onConflictDoUpdate({ target: salle.id, set: reecrireColonnesMetier(salle) });
    await tx
      .insert(competition)
      .values(COMPETITIONS)
      .onConflictDoUpdate({ target: competition.id, set: reecrireColonnesMetier(competition) });
    await tx
      .insert(poule)
      .values(POULES)
      .onConflictDoUpdate({ target: poule.id, set: reecrireColonnesMetier(poule) });
    await tx
      .insert(equipe)
      .values(EQUIPES)
      .onConflictDoUpdate({ target: equipe.id, set: reecrireColonnesMetier(equipe) });
    await tx
      .insert(engagement)
      .values(ENGAGEMENTS)
      .onConflictDoUpdate({ target: engagement.id, set: reecrireColonnesMetier(engagement) });
    await tx
      .insert(utilisateur)
      .values(UTILISATEURS)
      .onConflictDoUpdate({ target: utilisateur.id, set: reecrireColonnesMetier(utilisateur) });
    await tx
      .insert(parametre)
      .values(PARAMETRES)
      .onConflictDoUpdate({ target: parametre.id, set: reecrireColonnesMetier(parametre) });
    await tx
      .insert(joueur)
      .values(JOUEURS)
      .onConflictDoUpdate({ target: joueur.id, set: reecrireColonnesMetier(joueur) });
    await tx
      .insert(joueurEquipe)
      .values(JOUEURS_EQUIPES)
      .onConflictDoUpdate({ target: joueurEquipe.id, set: reecrireColonnesMetier(joueurEquipe) });
    await tx
      .insert(rencontre)
      .values(RENCONTRES)
      .onConflictDoUpdate({ target: rencontre.id, set: reecrireColonnesMetier(rencontre) });
    await tx
      .insert(statistiqueJoueur)
      .values(STATISTIQUES)
      .onConflictDoUpdate({
        target: statistiqueJoueur.id,
        set: reecrireColonnesMetier(statistiqueJoueur),
      });
    await tx
      .insert(categorieArticle)
      .values(CATEGORIES)
      .onConflictDoUpdate({
        target: categorieArticle.id,
        set: reecrireColonnesMetier(categorieArticle),
      });
    await tx
      .insert(article)
      .values(ARTICLES)
      .onConflictDoUpdate({ target: article.id, set: reecrireColonnesMetier(article) });
    await tx
      .insert(journalSynchronisation)
      .values(JOURNAUX)
      .onConflictDoUpdate({
        target: journalSynchronisation.id,
        set: reecrireColonnesMetier(journalSynchronisation),
      });
    await tx
      .insert(conflitSynchronisation)
      .values(CONFLITS)
      .onConflictDoUpdate({
        target: conflitSynchronisation.id,
        set: reecrireColonnesMetier(conflitSynchronisation),
      });
  });

  return {
    saisons: SAISONS.length,
    organismes: ORGANISMES.length,
    salles: SALLES.length,
    competitions: COMPETITIONS.length,
    poules: POULES.length,
    equipes: EQUIPES.length,
    engagements: ENGAGEMENTS.length,
    joueurs: JOUEURS.length,
    utilisateurs: UTILISATEURS.length,
    rencontres: RENCONTRES.length,
    statistiques: STATISTIQUES.length,
    articles: ARTICLES.length,
  };
}

// --- Exécution en ligne de commande -------------------------------------------------

/**
 * Le fichier est à la fois un module (importé par les tests d'intégration, qui lui
 * passent une base PGlite) et un exécutable (`npm run bdd:semer`, sur la base pointée
 * par `DATABASE_URL`). Ce garde distingue les deux sans dupliquer le jeu de données.
 */
async function executerEnLigneDeCommande(): Promise<void> {
  const [{ config: chargerEnv }, { creerBaseNeon, creerPoolNeon, lireUrlBaseDeDonnees }] =
    await Promise.all([import("dotenv"), import("../src/infrastructure/bdd/client")]);

  chargerEnv({ path: ".env", quiet: true });
  const pool = creerPoolNeon(lireUrlBaseDeDonnees());
  try {
    const resume = await semer(creerBaseNeon(pool));
    // Sortie volontairement bavarde : c'est la seule trace d'un script one-shot.
    console.info("Semis appliqué :", resume);
  } finally {
    await pool.end();
  }
}

/**
 * Garde-fou de production.
 *
 * `reecrireColonnesMetier` réécrit **toutes** les colonnes métier des lignes qu'il
 * connaît. Lancé par mégarde sur la base de production — un `.env` resté pointé sur
 * la branche Neon de prod, un shell Vercel — ce script publierait des matchs
 * inventés et écraserait les corrections faites au back-office. Il refuse donc de
 * s'exécuter en production sans confirmation explicite.
 */
function verifierEnvironnementAutorise(): void {
  const environnementVercel = process.env["VERCEL_ENV"];
  const confirme = process.argv.includes("--confirmer");
  if (environnementVercel === "production" && !confirme) {
    throw new Error(
      "Refus de peupler la base de PRODUCTION (VERCEL_ENV=production). " +
        "Ce script écrase les données métier des lignes qu'il connaît. " +
        "Relancez avec --confirmer si c'est réellement ce que vous voulez.",
    );
  }
}

const cheminLance = process.argv[1];
if (cheminLance !== undefined) {
  const { pathToFileURL } = await import("node:url");
  if (import.meta.url === pathToFileURL(cheminLance).href) {
    verifierEnvironnementAutorise();
    await executerEnLigneDeCommande();
  }
}

/**
 * Identifiants stables du jeu de démonstration. Exposés pour que les tests
 * d'intégration s'accrochent à des lignes précises sans les redéclarer — et pour
 * qu'un changement de fixture casse le test au lieu de le rendre vide de sens.
 */
export const IDENTIFIANTS_SEMIS = {
  saisonPrecedente: idSaison("2526"),
  saisonCourante: idSaison("2627"),
  club: idOrganisme("1"),
  organismeChaze: idOrganisme("2"),
  organismeSegre: idOrganisme("3"),
  salleCande: idSalle("1"),
  competitionU11Courante: idCompetition("3"),
  pouleU11Courante: idPoule("3"),
  equipeU11: idEquipe("2"),
  equipeSeniorsM: idEquipe("6"),
  joueurPremier: idJoueur("1"),
  joueurSecond: idJoueur("2"),
  utilisateurAdministrateur: idUtilisateur("1"),
  categorieComptesRendus: idCategorie("1"),
  /** Match à venir du 19/09/2026, sans score. */
  rencontreAVenir: idRencontre("1"),
  /** Match joué 58-42 : celui qui porte les points par joueur. */
  rencontreJouee: idRencontre("6"),
  /** Match passé dont la feuille n'a jamais été remontée : `score_manquant`. */
  rencontreSansScoreRemonte: idRencontre("8"),
  /** Forfait 20-0. */
  rencontreForfait: idRencontre("5"),
  /** Match saisi à la main, avec un conflit de synchronisation ouvert. */
  rencontreManuelle: idRencontre("11"),
} as const;
