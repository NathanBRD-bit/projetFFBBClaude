import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  pgTable,
  text,
  uniqueIndex,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { horodatages, identifiant } from "./_communs";

/**
 * Référentiel : les entités que la synchronisation FFBB découvre et réutilise
 * (saisons, clubs, compétitions, poules, salles). Elles sont créées à la volée par
 * le moteur de sync, jamais supprimées.
 */

export const saison = pgTable(
  "saison",
  {
    id: identifiant(),
    /** Code court affiché et utilisé dans les URL : `25-26`. */
    code: text("code").notNull().unique(),
    libelle: text("libelle").notNull(),
    /** Code de la saison côté FFBB, absent tant qu'aucun match n'a été synchronisé. */
    codeFfbb: text("code_ffbb").unique(),
    debutLe: date("debut_le").notNull(),
    finLe: date("fin_le").notNull(),
    estCourante: boolean("est_courante").notNull().default(false),
    ...horodatages(),
  },
  (t) => [
    // Une saison courante et une seule. L'index unique partiel est le seul moyen
    // déclaratif de l'exprimer : toutes les lignes `est_courante = true` partagent
    // la même valeur indexée, la deuxième est donc rejetée par Postgres.
    uniqueIndex("saison_une_seule_courante")
      .on(t.estCourante)
      .where(sql`${t.estCourante}`),
    check("saison_periode_coherente", sql`${t.finLe} > ${t.debutLe}`),
  ],
);

export const organisme = pgTable(
  "organisme",
  {
    id: identifiant(),
    /** Code FFBB de l'organisme, par exemple `PDL0049077` pour le SOCL. */
    codeFfbb: text("code_ffbb").notNull().unique(),
    nom: text("nom").notNull(),
    nomCourt: text("nom_court"),
    ville: text("ville"),
    /** Vrai pour le SOCL uniquement : c'est ce qui distingue « nous » de « l'adversaire ». */
    estLeClub: boolean("est_le_club").notNull().default(false),
    ...horodatages(),
  },
  (t) => [
    // Même trick que `saison` : le site n'a qu'un club propriétaire. Deux lignes à
    // `est_le_club = true` rendraient toutes les requêtes « nos matchs » ambiguës.
    uniqueIndex("organisme_un_seul_club")
      .on(t.estLeClub)
      .where(sql`${t.estLeClub}`),
  ],
);

export const competition = pgTable(
  "competition",
  {
    id: identifiant(),
    saisonId: uuid("saison_id")
      .notNull()
      .references(() => saison.id, { onDelete: "restrict" }),
    codeFfbb: text("code_ffbb"),
    nom: text("nom").notNull(),
    /** Catégorie d'âge telle qu'affichée : `U11`, `Senior`, `Vétérans`. */
    categorie: text("categorie"),
    /** Niveau : `Départemental 1`, `Pré-région`… */
    niveau: text("niveau"),
    ...horodatages(),
  },
  (t) => [
    unique("competition_saison_nom_unique").on(t.saisonId, t.nom),
    uniqueIndex("competition_saison_code_ffbb_unique")
      .on(t.saisonId, t.codeFfbb)
      .where(sql`${t.codeFfbb} is not null`),
    // Clé candidate qui permet à `engagement` de vérifier, par clé étrangère
    // composite, que sa compétition appartient bien à la saison déclarée.
    unique("competition_id_saison_unique").on(t.id, t.saisonId),
    index("competition_saison_idx").on(t.saisonId),
  ],
);

export const poule = pgTable(
  "poule",
  {
    id: identifiant(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competition.id, { onDelete: "restrict" }),
    codeFfbb: text("code_ffbb"),
    nom: text("nom").notNull(),
    ...horodatages(),
  },
  (t) => [
    unique("poule_competition_nom_unique").on(t.competitionId, t.nom),
    uniqueIndex("poule_competition_code_ffbb_unique")
      .on(t.competitionId, t.codeFfbb)
      .where(sql`${t.codeFfbb} is not null`),
    unique("poule_id_competition_unique").on(t.id, t.competitionId),
    index("poule_competition_idx").on(t.competitionId),
  ],
);

export const salle = pgTable(
  "salle",
  {
    id: identifiant(),
    codeFfbb: text("code_ffbb").unique(),
    nom: text("nom").notNull(),
    adresse: text("adresse"),
    codePostal: text("code_postal"),
    ville: text("ville").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    ...horodatages(),
  },
  (t) => [
    unique("salle_nom_ville_unique").on(t.nom, t.ville),
    // Une demi-coordonnée ne situe rien : soit les deux, soit aucune. Sans cette
    // contrainte, une carte afficherait un point au large du golfe de Guinée.
    check("salle_coordonnees_ensemble", sql`(${t.latitude} is null) = (${t.longitude} is null)`),
    check(
      "salle_latitude_valide",
      sql`${t.latitude} is null or (${t.latitude} between -90 and 90)`,
    ),
    check(
      "salle_longitude_valide",
      sql`${t.longitude} is null or (${t.longitude} between -180 and 180)`,
    ),
  ],
);
