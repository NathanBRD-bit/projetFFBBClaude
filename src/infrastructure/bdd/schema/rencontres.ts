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
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { horodatages, identifiant } from "./_communs";
import { utilisateur } from "./administration";
import { equipe, joueur } from "./club";
import { competition, organisme, poule, saison, salle } from "./referentiel";

/**
 * Rencontres : la table centrale du site. La base est **source de vérité**, l'API
 * FFBB n'est qu'une alimentation — d'où `champs_verrouilles`,
 * `disparue_de_ffbb_le` et l'absence totale de suppression.
 */

/**
 * `score_manquant` : le match a bien été joué, mais la feuille n'a jamais été
 * remontée à la FFBB. C'est fréquent au niveau départemental. Sans ce statut, un
 * tel match devait être rangé en `a_confirmer` — un statut qui veut dire tout
 * autre chose (match disparu de l'index FFBB) — ou forcé en `joue` avec des
 * scores nuls. Nommer l'absence vaut mieux que la déguiser.
 */
export const statutRencontre = pgEnum("statut_rencontre", [
  "a_venir",
  "joue",
  "score_manquant",
  "reporte",
  "annule",
  "forfait",
  "a_confirmer",
]);

export const sourceDonnee = pgEnum("source_donnee", ["ffbb", "manuel"]);

export const rencontre = pgTable(
  "rencontre",
  {
    id: identifiant(),
    /** Identifiant FFBB : clé d'idempotence de la synchronisation. */
    idFfbb: text("id_ffbb").unique(),
    /**
     * Filet de secours si `id_ffbb` change ou manque : composition stable
     * (saison + compétition + libellés + date). Toujours renseignée.
     */
    cleNaturelle: text("cle_naturelle").notNull().unique(),
    slug: text("slug").notNull().unique(),

    saisonId: uuid("saison_id")
      .notNull()
      .references(() => saison.id, { onDelete: "restrict" }),
    competitionId: uuid("competition_id").references(() => competition.id, {
      onDelete: "restrict",
    }),
    pouleId: uuid("poule_id"),
    /** Notre équipe, quand le libellé FFBB a pu être rattaché. `null` = non rapproché. */
    equipeId: uuid("equipe_id").references(() => equipe.id, { onDelete: "restrict" }),

    organismeDomicileId: uuid("organisme_domicile_id")
      .notNull()
      .references(() => organisme.id, { onDelete: "restrict" }),
    organismeExterieurId: uuid("organisme_exterieur_id")
      .notNull()
      .references(() => organisme.id, { onDelete: "restrict" }),
    /** Libellés bruts reçus de la FFBB, conservés pour le rapprochement manuel. */
    nomEquipeDomicileFfbb: text("nom_equipe_domicile_ffbb"),
    nomEquipeExterieurFfbb: text("nom_equipe_exterieur_ffbb"),

    salleId: uuid("salle_id").references(() => salle.id, { onDelete: "restrict" }),
    dateHeure: timestamp("date_heure", { withTimezone: true }).notNull(),
    /** Faux quand la FFBB publie une date sans horaire arrêté. */
    heureConfirmee: boolean("heure_confirmee").notNull().default(true),
    numero: text("numero"),
    journee: smallint("journee"),

    statut: statutRencontre("statut").notNull().default("a_venir"),
    /**
     * `null` = non joué ou score non remonté. **Jamais `0` par défaut** : afficher
     * 0-0 pour un match sans score remonté serait une information fausse.
     */
    scoreDomicile: smallint("score_domicile"),
    scoreExterieur: smallint("score_exterieur"),
    forfaitDomicile: boolean("forfait_domicile").notNull().default(false),
    forfaitExterieur: boolean("forfait_exterieur").notNull().default(false),

    source: sourceDonnee("source").notNull().default("ffbb"),
    /** SHA-256 du payload FFBB normalisé : on ne réécrit que sur vrai changement. */
    empreinteFfbb: text("empreinte_ffbb"),
    vuDansFfbbLe: timestamp("vu_dans_ffbb_le", { withTimezone: true }),
    /**
     * Horodate la disparition du match de l'index FFBB. La sync ne supprime jamais :
     * c'est cette colonne qui permet de garder l'historique et de signaler l'anomalie.
     */
    disparueDeFfbbLe: timestamp("disparue_de_ffbb_le", { withTimezone: true }),
    /**
     * Colonnes éditées à la main, intouchables par la sync. Une divergence sur un
     * champ verrouillé crée un conflit visible, elle n'écrase rien.
     */
    champsVerrouilles: text("champs_verrouilles")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    resumeMd: text("resume_md"),
    affichePubliquement: boolean("affiche_publiquement").notNull().default(true),
    ...horodatages(),
  },
  (t) => [
    // Un seul des deux scores renseigné est toujours une erreur de saisie ou de
    // normalisation : un match a deux scores, ou aucun.
    check(
      "rencontre_scores_ensemble",
      sql`(${t.scoreDomicile} is null) = (${t.scoreExterieur} is null)`,
    ),
    // Un match déclaré joué sans score est une donnée à moitié écrite ; on l'attrape
    // ici plutôt que de laisser le rendu public inventer un tiret.
    check(
      "rencontre_joue_avec_score",
      sql`${t.statut} <> 'joue' or ${t.scoreDomicile} is not null`,
    ),
    // Deux contraintes distinctes et non une conjonction : le nom de la contrainte
    // violée doit dire lequel des deux scores est fautif.
    check(
      "rencontre_score_domicile_positif",
      sql`${t.scoreDomicile} is null or ${t.scoreDomicile} >= 0`,
    ),
    check(
      "rencontre_score_exterieur_positif",
      sql`${t.scoreExterieur} is null or ${t.scoreExterieur} >= 0`,
    ),
    /**
     * Une **équipe** ne joue pas contre elle-même — mais un **club**, si.
     *
     * La première version de cette contrainte comparait les organismes, ce qui
     * rejetait un derby interne. Sur 3 000 rencontres réelles de l'index FFBB,
     * 4 opposent deux équipes du même club (« AIX MAURIENNE S B - 2 » contre
     * « AIX MAURIENNE S B - 3 »), et le SOCL engage lui-même plusieurs équipes
     * dans les mêmes catégories : la synchronisation aurait échoué sur une donnée
     * parfaitement légitime.
     *
     * Le garde-fou porte donc sur le couple (organisme, libellé d'équipe) : ce
     * qu'on refuse, c'est une rencontre strictement identique des deux côtés,
     * signe d'une erreur de rapprochement et non d'un derby. `is distinct from`
     * et non `<>` : deux libellés nuls doivent être considérés comme identiques,
     * pas comme incomparables.
     */
    check(
      "rencontre_equipes_distinctes",
      sql`${t.organismeDomicileId} <> ${t.organismeExterieurId} or ${t.nomEquipeDomicileFfbb} is distinct from ${t.nomEquipeExterieurFfbb}`,
    ),
    check("rencontre_cle_naturelle_non_vide", sql`btrim(${t.cleNaturelle}) <> ''`),
    // Symétrique de `rencontre_joue_avec_score` : un match rangé en
    // « score manquant » qui porte un score est une contradiction.
    check(
      "rencontre_score_manquant_sans_score",
      sql`${t.statut} <> 'score_manquant' or ${t.scoreDomicile} is null`,
    ),
    // Constat de review : rien n'empêchait `statut = 'forfait'` sans qu'aucune des
    // deux équipes ne soit déclarée forfait — l'affichage aurait dû deviner.
    check(
      "rencontre_forfait_declare",
      sql`${t.statut} <> 'forfait' or ${t.forfaitDomicile} or ${t.forfaitExterieur}`,
    ),
    // Constat de review : `poule_id` est couvert par une clé étrangère composite,
    // or MATCH SIMPLE ne contrôle rien dès qu'une colonne du couple est nulle. Une
    // poule inexistante passait donc dès que `competition_id` valait null.
    check(
      "rencontre_poule_implique_competition",
      sql`${t.pouleId} is null or ${t.competitionId} is not null`,
    ),
    // La poule doit relever de la compétition du match (clé étrangère composite,
    // MATCH SIMPLE : dès qu'une des deux colonnes est nulle, la contrainte passe).
    foreignKey({
      name: "rencontre_poule_competition_fk",
      columns: [t.pouleId, t.competitionId],
      foreignColumns: [poule.id, poule.competitionId],
    }).onDelete("restrict"),
    // Constat de review : `engagement` garantissait déjà que la compétition relève
    // de la bonne saison, mais pas `rencontre`. Un match de la saison 25-26 pouvait
    // pointer une compétition 26-27 et se retrouver listé sous la mauvaise saison,
    // sans la moindre erreur.
    foreignKey({
      name: "rencontre_competition_saison_fk",
      columns: [t.competitionId, t.saisonId],
      foreignColumns: [competition.id, competition.saisonId],
    }).onDelete("restrict"),

    index("rencontre_saison_date_idx").on(t.saisonId, t.dateHeure.desc()),
    index("rencontre_equipe_date_idx").on(t.equipeId, t.dateHeure.desc()),
    index("rencontre_competition_date_idx").on(t.competitionId, t.dateHeure.desc()),
    index("rencontre_statut_date_idx").on(t.statut, t.dateHeure.desc()),
    // Le tableau de bord liste les matchs disparus de l'index FFBB : index partiel,
    // parce que la très grande majorité des lignes ont la colonne à `null`.
    index("rencontre_disparues_idx")
      .on(t.disparueDeFfbbLe.desc())
      .where(sql`${t.disparueDeFfbbLe} is not null`),
  ],
);

/**
 * `statistique_joueur` — **version 1 volontairement réduite aux points marqués**.
 *
 * Les colonnes détaillées prévues au modèle (tirs 2 points / 3 points / lancers
 * francs, rebonds offensifs et défensifs, passes, interceptions, contres, fautes,
 * minutes jouées) ne sont **pas** créées ici. Décision produit : la saisie est
 * manuelle, l'API FFBB n'expose aucune statistique individuelle, et un box score
 * complet ne sera jamais rempli tant que le club n'en aura pas pris l'habitude.
 * Elles seront ajoutées **par une migration dédiée** si l'usage suit — ajouter des
 * colonnes nullables à une table existante est une migration sans risque.
 *
 * Sémantique des valeurs : `null` = non saisi, `0` = zéro point marqué. Les deux ne
 * doivent jamais être confondus ; l'affichage public écrit « — » pour `null`.
 */
export const statistiqueJoueur = pgTable(
  "statistique_joueur",
  {
    id: identifiant(),
    rencontreId: uuid("rencontre_id")
      .notNull()
      .references(() => rencontre.id, { onDelete: "cascade" }),
    joueurId: uuid("joueur_id")
      .notNull()
      .references(() => joueur.id, { onDelete: "cascade" }),
    aJoue: boolean("a_joue").notNull(),
    points: smallint("points"),
    saisiPar: uuid("saisi_par").references(() => utilisateur.id, { onDelete: "set null" }),
    saisiLe: timestamp("saisi_le", { withTimezone: true }).notNull().defaultNow(),
    majLe: timestamp("maj_le", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("statistique_joueur_rencontre_joueur_unique").on(t.rencontreId, t.joueurId),
    check("statistique_joueur_points_positifs", sql`${t.points} is null or ${t.points} >= 0`),
    // Un joueur qui n'est pas entré en jeu ne peut pas avoir marqué : la ligne
    // « a_joue = false, points = 12 » est une erreur de saisie, pas une donnée.
    check("statistique_joueur_absent_sans_points", sql`${t.aJoue} or ${t.points} is null`),
    index("statistique_joueur_joueur_idx").on(t.joueurId),
  ],
);
