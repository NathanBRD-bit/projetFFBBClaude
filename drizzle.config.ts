import { config as chargerEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

import { lireUrlBaseDeDonnees } from "./src/infrastructure/bdd/client";

// drizzle-kit est lancé hors de Next : il faut charger `.env` explicitement.
// `override: false` par défaut — une variable déjà présente dans l'environnement
// (CI, Vercel) gagne toujours sur le fichier.
chargerEnv({ path: ".env", quiet: true });

/**
 * `drizzle-kit generate` produit du SQL versionné dans `drizzle/` **sans toucher à
 * aucune base**. Seules les commandes qui se connectent (`migrate`, `push`,
 * `studio`) ont besoin de `DATABASE_URL` : d'où l'accesseur, évalué au moment où la
 * valeur est réellement lue, et qui lève si elle manque plutôt que de passer une
 * chaîne vide au driver.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/bdd/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    get url(): string {
      return lireUrlBaseDeDonnees();
    },
  },
  strict: true,
  verbose: true,
});
