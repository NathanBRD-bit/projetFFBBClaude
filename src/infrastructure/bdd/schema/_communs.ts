import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Colonnes partagées par toutes les tables. Ce sont des *fabriques* et non des
 * constantes : un constructeur de colonne Drizzle est mutable, le partager entre
 * deux tables ferait dépendre le schéma de l'ordre d'évaluation des modules.
 */

/** Clé primaire de toutes les tables : `uuid` généré par Postgres. */
export const identifiant = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);

/**
 * Horodatages des tables **mutables**. Les tables en ajout seul
 * (`tentative_connexion`, `journal_synchronisation`) n'ont volontairement pas de
 * `maj_le` : une ligne d'historique qui change est un bug, pas un cas normal.
 */
export const horodatages = () => ({
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
});
