import { config as chargerEnv } from "dotenv";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

import {
  creerBaseNeon,
  creerPoolNeon,
  lireUrlBaseDeDonnees,
} from "../src/infrastructure/bdd/client";

/**
 * Applique les migrations de `drizzle/` à la base pointée par `DATABASE_URL`
 * (Neon en production et en preview).
 *
 * Ce sont **exactement les mêmes fichiers SQL** que ceux appliqués sur PGlite par les
 * tests d'intégration : ce qui est prouvé en test est ce qui part en production.
 */
chargerEnv({ path: ".env", quiet: true });

const pool = creerPoolNeon(lireUrlBaseDeDonnees());
try {
  await migrate(creerBaseNeon(pool), { migrationsFolder: "./drizzle" });
  console.info("Migrations appliquées.");
} finally {
  await pool.end();
}
