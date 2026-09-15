import { Pool } from "@neondatabase/serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

/**
 * Accès à la base. Le **choix du driver est un détail d'implémentation** : le code
 * métier ne manipule que le type `BaseDeDonnees`, qui est l'interface Postgres
 * commune de Drizzle. En production et en preview c'est Neon ; les tests
 * d'intégration injectent une instance PGlite (Postgres compilé en WebAssembly),
 * alimentée par **les mêmes fichiers de migration SQL**.
 *
 * Aucune variable d'environnement n'est lue en silence : `DATABASE_URL` absente lève
 * immédiatement, avec un message qui dit quoi faire.
 */

/**
 * Type manipulé par tout le reste du code. Volontairement le type Drizzle générique
 * et non `NeonDatabase` : rien en dehors de ce fichier ne doit savoir quel driver est
 * branché.
 */
export type BaseDeDonnees = PgDatabase<PgQueryResultHKT, typeof schema>;

export { schema };

/** Message unique, pour que l'erreur soit reconnaissable en test comme en production. */
export const MESSAGE_DATABASE_URL_ABSENTE =
  "DATABASE_URL est absente ou vide. Renseignez-la dans `.env` en local " +
  "(voir `.env.example`) ou dans les variables d'environnement Vercel. " +
  "Aucune valeur par défaut n'est appliquée : une base non configurée doit échouer tout de suite.";

/**
 * Lit `DATABASE_URL` ou échoue. Pas de `?? ""`, pas de repli sur `localhost` : une
 * chaîne vide produirait une erreur de connexion obscure trois couches plus loin.
 */
export function lireUrlBaseDeDonnees(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const url = env.DATABASE_URL;
  if (url === undefined || url.trim() === "") {
    throw new Error(MESSAGE_DATABASE_URL_ABSENTE);
  }
  return url;
}

/**
 * Ouvre un pool Neon. `Pool` et non le driver HTTP : la synchronisation FFBB applique
 * ses écritures dans **une seule transaction**, ce que le mode HTTP sans état ne
 * permet pas.
 *
 * Le constructeur n'ouvre aucune connexion — elle est établie à la première requête.
 * Le transport WebSocket utilise le `WebSocket` global de Node 22 : aucune
 * configuration supplémentaire n'est nécessaire (`neonConfig.webSocketConstructor`
 * ne sert qu'aux runtimes plus anciens).
 */
export function creerPoolNeon(url: string): Pool {
  return new Pool({ connectionString: url });
}

/**
 * Branche Drizzle sur un pool Neon déjà ouvert (le script de migration le ferme
 * lui-même). Le type de retour est ici le type **concret** du driver, et non
 * `BaseDeDonnees` : le migrateur `drizzle-orm/neon-serverless/migrator` l'exige. Tout
 * le reste du code passe par `BaseDeDonnees` et ignore le driver.
 */
export function creerBaseNeon(pool: Pool): NeonDatabase<typeof schema> {
  return drizzle({ client: pool, schema });
}

let baseCourante: BaseDeDonnees | undefined;

/**
 * Instance partagée, construite à la première utilisation.
 *
 * Paresseuse à dessein : `next build` importe les modules pour analyser les routes,
 * sans `DATABASE_URL`. Échouer à l'import casserait le build ; échouer au premier
 * accès réel reste immédiat et localisable, ce que la règle exige.
 */
export function obtenirBase(): BaseDeDonnees {
  baseCourante ??= creerBaseNeon(creerPoolNeon(lireUrlBaseDeDonnees()));
  return baseCourante;
}

/**
 * Point d'injection réservé aux tests d'intégration : ils construisent une base PGlite
 * migrée, puis la posent ici pour que le code appelant `obtenirBase()` travaille
 * dessus sans rien savoir du driver.
 *
 * `@electric-sql/pglite` est une dépendance de développement : elle est importée par le
 * harnais de test (`tests/integration/aide-base.ts`), jamais par `src/`, pour qu'elle
 * ne puisse pas se retrouver dans le bundle de production.
 */
export function definirBaseCourante(base: BaseDeDonnees): void {
  baseCourante = base;
}

/** Remet le singleton à zéro. À appeler en fin de test pour ne pas fuiter d'état. */
export function reinitialiserBaseCourante(): void {
  baseCourante = undefined;
}
