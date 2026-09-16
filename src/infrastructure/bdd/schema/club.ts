import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { horodatages, identifiant } from "./_communs";
import { competition, poule, saison } from "./referentiel";

/**
 * Le club : équipes stables dans le temps, engagements par saison, effectifs.
 * `equipe` survit aux saisons ; c'est `engagement` qui porte le lien
 * équipe × saison × compétition.
 */

export const sexeEquipe = pgEnum("sexe_equipe", ["masculin", "feminin", "mixte"]);

export const equipe = pgTable(
  "equipe",
  {
    id: identifiant(),
    slug: text("slug").notNull().unique(),
    nom: text("nom").notNull(),
    /** `U9`, `U11`, `U13`, `Senior`, `Vétérans`… */
    categorie: text("categorie").notNull(),
    sexe: sexeEquipe("sexe").notNull(),
    /** Ordre d'affichage imposé par le club, du plus jeune au plus âgé. */
    ordre: smallint("ordre").notNull().default(0),
    photoUrl: text("photo_url"),
    photoAlt: text("photo_alt"),
    /** Créneaux d'entraînement, en Markdown : texte libre tenu par le club. */
    creneauxMd: text("creneaux_md"),
    descriptionMd: text("description_md"),
    affichePubliquement: boolean("affiche_publiquement").notNull().default(true),
    ...horodatages(),
  },
  (t) => [
    // Une image sans alternative textuelle est inaccessible : la base refuse, plutôt
    // que de laisser l'oubli filer jusqu'au rendu public.
    check(
      "equipe_photo_alt_obligatoire",
      sql`${t.photoUrl} is null or (${t.photoAlt} is not null and btrim(${t.photoAlt}) <> '')`,
    ),
    check("equipe_ordre_positif", sql`${t.ordre} >= 0`),
    index("equipe_ordre_idx").on(t.ordre),
  ],
);

export const engagement = pgTable(
  "engagement",
  {
    id: identifiant(),
    equipeId: uuid("equipe_id")
      .notNull()
      .references(() => equipe.id, { onDelete: "restrict" }),
    saisonId: uuid("saison_id")
      .notNull()
      .references(() => saison.id, { onDelete: "restrict" }),
    competitionId: uuid("competition_id").notNull(),
    pouleId: uuid("poule_id"),
    /**
     * Les orthographes exactes vues dans `nomEquipe1` / `nomEquipe2` côté FFBB
     * (« SO CANDE LOIRE BASKET - 1 »…). C'est ce tableau, éditable au back-office,
     * qui rattache un match FFBB à notre équipe — aucune heuristique de
     * ressemblance, qui serait fragile et silencieusement fausse.
     */
    libellesFfbb: text("libelles_ffbb")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...horodatages(),
  },
  (t) => [
    unique("engagement_equipe_saison_competition_unique").on(
      t.equipeId,
      t.saisonId,
      t.competitionId,
    ),
    // Clé étrangère composite : la compétition engagée doit appartenir à la saison
    // déclarée. Une FK simple laisserait passer « équipe 25-26 engagée dans une
    // compétition 26-27 », incohérence indétectable ensuite.
    foreignKey({
      name: "engagement_competition_saison_fk",
      columns: [t.competitionId, t.saisonId],
      foreignColumns: [competition.id, competition.saisonId],
    }).onDelete("restrict"),
    // Même principe pour la poule : elle doit relever de la compétition engagée.
    // `poule_id` nullable reste accepté (clé composite en MATCH SIMPLE).
    foreignKey({
      name: "engagement_poule_competition_fk",
      columns: [t.pouleId, t.competitionId],
      foreignColumns: [poule.id, poule.competitionId],
    }).onDelete("restrict"),
    index("engagement_saison_idx").on(t.saisonId),
    index("engagement_equipe_idx").on(t.equipeId),
  ],
);

export const joueur = pgTable(
  "joueur",
  {
    id: identifiant(),
    /**
     * Le seul nom affiché publiquement. Permet « Léo M. » : aucune obligation de
     * stocker l'état civil complet d'un mineur (voir docs/modele-donnees.md).
     */
    nomAffiche: text("nom_affiche").notNull(),
    prenom: text("prenom"),
    nom: text("nom"),
    numero: smallint("numero"),
    /**
     * Faux par défaut, volontairement : tant que l'autorisation de droit à l'image
     * n'est pas recueillie, le joueur n'apparaît nulle part côté public.
     */
    visiblePubliquement: boolean("visible_publiquement").notNull().default(false),
    photoUrl: text("photo_url"),
    photoAlt: text("photo_alt"),
    ...horodatages(),
  },
  (t) => [
    check("joueur_numero_valide", sql`${t.numero} is null or (${t.numero} between 0 and 99)`),
    check(
      "joueur_photo_alt_obligatoire",
      sql`${t.photoUrl} is null or (${t.photoAlt} is not null and btrim(${t.photoAlt}) <> '')`,
    ),
    check("joueur_nom_affiche_non_vide", sql`btrim(${t.nomAffiche}) <> ''`),
    index("joueur_visible_idx").on(t.visiblePubliquement),
  ],
);

export const joueurEquipe = pgTable(
  "joueur_equipe",
  {
    id: identifiant(),
    joueurId: uuid("joueur_id")
      .notNull()
      .references(() => joueur.id, { onDelete: "cascade" }),
    equipeId: uuid("equipe_id")
      .notNull()
      .references(() => equipe.id, { onDelete: "restrict" }),
    saisonId: uuid("saison_id")
      .notNull()
      .references(() => saison.id, { onDelete: "restrict" }),
    ...horodatages(),
  },
  (t) => [
    unique("joueur_equipe_unique").on(t.joueurId, t.equipeId, t.saisonId),
    index("joueur_equipe_equipe_saison_idx").on(t.equipeId, t.saisonId),
  ],
);
