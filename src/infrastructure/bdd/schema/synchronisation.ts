import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { identifiant } from "./_communs";
import { utilisateur } from "./administration";
import { rencontre } from "./rencontres";

/**
 * Traçabilité de la synchronisation FFBB : ce qui a tourné, ce que ça a produit,
 * et les divergences qu'il faut arbitrer à la main.
 */

export const declencheurSynchronisation = pgEnum("declencheur_synchronisation", [
  "cron_vercel",
  "github_actions",
  "manuel",
]);

export const statutSynchronisation = pgEnum("statut_synchronisation", [
  "en_cours",
  "succes",
  "partiel",
  "echec",
]);

export const resolutionConflit = pgEnum("resolution_conflit", ["garder_local", "appliquer_ffbb"]);

export const journalSynchronisation = pgTable(
  "journal_synchronisation",
  {
    id: identifiant(),
    declencheur: declencheurSynchronisation("declencheur").notNull(),
    /** Renseigné uniquement pour un déclenchement manuel au back-office. */
    declencheeParId: uuid("declenchee_par_id").references(() => utilisateur.id, {
      onDelete: "set null",
    }),
    statut: statutSynchronisation("statut").notNull(),
    // Table en ajout seul : pas de `maj_le`. Une exécution passée ne se réécrit pas.
    demarreeLe: timestamp("demarree_le", { withTimezone: true }).notNull().defaultNow(),
    termineeLe: timestamp("terminee_le", { withTimezone: true }),
    dureeMs: integer("duree_ms"),
    nbLues: integer("nb_lues").notNull().default(0),
    nbCreees: integer("nb_creees").notNull().default(0),
    nbMisesAJour: integer("nb_mises_a_jour").notNull().default(0),
    nbInchangees: integer("nb_inchangees").notNull().default(0),
    nbInvalides: integer("nb_invalides").notNull().default(0),
    nbDisparues: integer("nb_disparues").notNull().default(0),
    messageErreur: text("message_erreur"),
  },
  (t) => [
    // Un échec qui ne dit pas pourquoi est exactement le bug silencieux que le
    // projet interdit : la base refuse d'enregistrer un `echec` muet.
    check(
      "journal_echec_avec_message",
      sql`${t.statut} <> 'echec' or ${t.messageErreur} is not null`,
    ),
    check(
      "journal_fin_posterieure",
      sql`${t.termineeLe} is null or ${t.termineeLe} >= ${t.demarreeLe}`,
    ),
    // Terminé et durée vont ensemble : une exécution close sans durée mesurée
    // signalerait un chemin de code qui a oublié de refermer le journal.
    check("journal_duree_avec_fin", sql`(${t.termineeLe} is null) = (${t.dureeMs} is null)`),
    check(
      "journal_compteurs_positifs",
      sql`${t.nbLues} >= 0 and ${t.nbCreees} >= 0 and ${t.nbMisesAJour} >= 0 and ${t.nbInchangees} >= 0 and ${t.nbInvalides} >= 0 and ${t.nbDisparues} >= 0`,
    ),
    check("journal_duree_positive", sql`${t.dureeMs} is null or ${t.dureeMs} >= 0`),
    index("journal_synchronisation_demarree_le_idx").on(t.demarreeLe.desc()),
    index("journal_synchronisation_statut_idx").on(t.statut, t.demarreeLe.desc()),
  ],
);

export const conflitSynchronisation = pgTable(
  "conflit_synchronisation",
  {
    id: identifiant(),
    rencontreId: uuid("rencontre_id")
      .notNull()
      .references(() => rencontre.id, { onDelete: "cascade" }),
    /** Nom de la colonne en litige, tel qu'il figure dans `champs_verrouilles`. */
    champ: text("champ").notNull(),
    valeurLocale: text("valeur_locale"),
    valeurFfbb: text("valeur_ffbb"),
    journalId: uuid("journal_id").references(() => journalSynchronisation.id, {
      onDelete: "set null",
    }),
    detecteLe: timestamp("detecte_le", { withTimezone: true }).notNull().defaultNow(),
    resoluLe: timestamp("resolu_le", { withTimezone: true }),
    resoluParId: uuid("resolu_par_id").references(() => utilisateur.id, { onDelete: "set null" }),
    resolution: resolutionConflit("resolution"),
  },
  (t) => [
    // Un seul conflit ouvert par (rencontre, champ) : sans cette unicité partielle,
    // chaque passage de la sync empilerait un doublon et le back-office deviendrait
    // illisible. Une fois résolu, le conflit sort de l'index et l'historique reste.
    uniqueIndex("conflit_synchronisation_ouvert_unique")
      .on(t.rencontreId, t.champ)
      .where(sql`${t.resoluLe} is null`),
    // Résolu et décision vont ensemble : un conflit clos sans arbitrage enregistré
    // ne permettrait pas d'expliquer pourquoi la valeur affichée est celle-là.
    check("conflit_resolution_coherente", sql`(${t.resoluLe} is null) = (${t.resolution} is null)`),
    // Un « conflit » entre deux valeurs identiques n'est pas un conflit.
    check("conflit_valeurs_differentes", sql`${t.valeurLocale} is distinct from ${t.valeurFfbb}`),
    check("conflit_champ_non_vide", sql`btrim(${t.champ}) <> ''`),
    index("conflit_synchronisation_ouverts_idx")
      .on(t.detecteLe.desc())
      .where(sql`${t.resoluLe} is null`),
    index("conflit_synchronisation_rencontre_idx").on(t.rencontreId),
  ],
);
