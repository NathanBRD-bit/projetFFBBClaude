import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Résolution native de l'alias `@/*` déclaré dans tsconfig.json : une seule
  // source de vérité pour les chemins, et une dépendance de moins.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Par défaut les tests tournent en `node`. Seuls les tests de composants ont
    // besoin d'un DOM : ils sont isolés dans leur propre projet `jsdom`, pour ne
    // pas payer le coût de jsdom sur la logique métier.
    projects: [
      {
        extends: true,
        test: {
          name: "unitaires",
          environment: "node",
          include: ["tests/unitaires/**/*.test.ts", "tests/integration/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "composants",
          environment: "jsdom",
          include: ["tests/composants/**/*.test.tsx"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // Couches rendues / générées : couvertes par les tests e2e, pas par la couverture unitaire.
        "src/app/**",
        "src/composants/ui/**",
        "src/infrastructure/bdd/schema/**",
        "tests/**",
        "**/*.config.{ts,mts,js,mjs}",
        "**/*.d.ts",
      ],
      // Seuils par glob (syntaxe supportée par Vitest 5). Le critique est à 100 % ;
      // le reste de `src/` à 80 %, conformément à docs/qualite.md.
      // Un glob qui ne correspond encore à aucun fichier n'est pas évalué : les
      // seuils de ffbb/, auth/ et actions/ ne mordront qu'à partir de T03.
      thresholds: {
        "src/domaine/**": { lines: 100, functions: 100, branches: 100, statements: 100 },
        "src/infrastructure/ffbb/**": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/auth/**": { lines: 100, functions: 100, branches: 100, statements: 100 },
        "src/actions/**": { lines: 100, functions: 100, branches: 100, statements: 100 },
        "src/**": { lines: 80, functions: 80, branches: 80, statements: 80 },
      },
    },
  },
});
