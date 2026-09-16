import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "@/infrastructure/bdd/schema";
import type { BaseDeDonnees } from "@/infrastructure/bdd/client";

/**
 * Harnais des tests d'intégration.
 *
 * Les tests tournent sur **PGlite** : un vrai Postgres compilé en WebAssembly, lancé
 * dans le processus Node. Pas de serveur, pas de conteneur, pas de service en CI —
 * donc les mêmes contraintes vérifiées sur la machine de chacun et sur GitHub Actions.
 *
 * Les migrations appliquées sont **exactement les fichiers SQL de `drizzle/`**, ceux
 * qui partiront sur Neon : un garde-fou prouvé ici est un garde-fou qui existe en
 * production.
 *
 * `@electric-sql/pglite` n'est importé que par ce fichier, jamais par `src/` : c'est
 * une dépendance de développement, elle ne doit pas pouvoir entrer dans le bundle.
 */

const DOSSIER_MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

export interface BaseDeTest {
  /** L'instance Drizzle, typée comme en production : le driver reste invisible. */
  base: BaseDeDonnees;
  /** Accès SQL brut, pour interroger les catalogues Postgres. */
  client: PGlite;
  fermer: () => Promise<void>;
}

/** Crée une base vierge en mémoire et y applique toutes les migrations. */
export async function creerBaseDeTest(): Promise<BaseDeTest> {
  const client = new PGlite();
  const base = drizzle({ client, schema });
  await migrate(base, { migrationsFolder: DOSSIER_MIGRATIONS });
  return {
    base,
    client,
    fermer: () => client.close(),
  };
}

/**
 * Déplie la chaîne des causes d'une erreur. Drizzle enveloppe l'erreur Postgres :
 * sans cela, l'assertion porterait sur « Failed query » et ne prouverait rien.
 */
function messageComplet(erreur: unknown): string {
  const morceaux: string[] = [];
  let courante: unknown = erreur;
  while (courante instanceof Error) {
    morceaux.push(courante.message);
    courante = courante.cause;
  }
  return morceaux.length > 0 ? morceaux.join(" | ") : String(erreur);
}

/**
 * Exécute une écriture censée être **refusée** par la base et renvoie le message
 * d'erreur de Postgres.
 *
 * Si l'écriture passe, le test échoue ici avec un message explicite : c'est tout
 * l'intérêt: une contrainte qui ne mord plus doit faire rougir la CI, pas passer
 * inaperçue.
 */
export async function capturerRefus(ecriture: () => Promise<unknown>): Promise<string> {
  try {
    await ecriture();
  } catch (erreur) {
    return messageComplet(erreur);
  }
  throw new Error(
    "L'écriture illégale a été ACCEPTÉE par la base alors qu'une contrainte devait la rejeter.",
  );
}
