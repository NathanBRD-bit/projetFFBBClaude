import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import pluginImport from "eslint-plugin-import";
import prettier from "eslint-config-prettier/flat";

/**
 * Les couches interdites à `src/domaine/` : ce dossier ne contient que de la logique
 * métier pure, sans I/O ni dépendance framework. Voir docs/qualite.md.
 */
const couchesInterditesAuDomaine = [
  "./src/app",
  "./src/infrastructure",
  "./src/actions",
  "./src/composants",
  "./src/auth",
];

/**
 * Modules d'entrées/sorties interdits au domaine. `src/domaine/` est censé être
 * testable sans réseau, sans disque et sans base : la règle doit le faire respecter,
 * pas seulement le documenter. `node:crypto`, `node:util` et `node:path` restent
 * autorisés : ce sont des calculs purs (empreintes, formatage), pas des I/O.
 */
const modulesIoInterdits = [
  "fs",
  "fs/*",
  "node:fs",
  "node:fs/*",
  "child_process",
  "node:child_process",
  "http",
  "https",
  "node:http",
  "node:https",
  "net",
  "dns",
  "node:net",
  "node:dns",
  "node:dgram",
  "node:worker_threads",
  "node:cluster",
  "pg",
  "postgres",
  "@neondatabase/serverless",
  "@electric-sql/pglite",
  "@vercel/blob",
];

const messageDomainePur =
  "src/domaine/ doit rester de la logique pure : ni framework (React, Next), ni accès aux données (Drizzle), ni couche applicative.";

const eslintConfig = defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    // Contre-exemples volontairement fautifs, lintés à la demande. Voir
    // tests/garde-fous/README.md.
    "tests/garde-fous/**",
  ]),

  ...nextVitals,
  ...nextTs,

  // Analyse type-checked : uniquement sur les fichiers couverts par tsconfig.json.
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Règles « pas de bug silencieux » (docs/qualite.md) : toutes bloquantes.
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    plugins: { import: pluginImport },
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
      },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: false }],
      eqeqeq: ["error", "always"],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/domaine",
              from: couchesInterditesAuDomaine,
              message: messageDomainePur,
            },
          ],
        },
      ],
    },
  },

  // `import/no-restricted-paths` ne sait raisonner que sur des chemins du dépôt.
  // Les paquets externes interdits au domaine sont donc bloqués par
  // `no-restricted-imports`, appliqué en override sur src/domaine/ uniquement.
  {
    files: ["src/domaine/**/*.ts", "src/domaine/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: messageDomainePur },
            { name: "react-dom", message: messageDomainePur },
            { name: "next", message: messageDomainePur },
            { name: "drizzle-orm", message: messageDomainePur },
            { name: "server-only", message: messageDomainePur },
          ],
          patterns: [
            {
              group: [
                "next/*",
                "react-dom/*",
                "drizzle-orm/*",
                "@/app/*",
                "@/infrastructure/*",
                "@/actions/*",
                "@/composants/*",
                "@/auth/*",
                ...modulesIoInterdits,
              ],
              message: messageDomainePur,
            },
          ],
        },
      ],
    },
  },

  // Fichiers de configuration à la racine : hors périmètre type-checked du projet.
  {
    files: ["*.mjs", "*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // En dernier : neutralise les règles de style que Prettier gère déjà.
  prettier,
]);

export default eslintConfig;
