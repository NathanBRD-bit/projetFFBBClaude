import { defineConfig, devices } from "@playwright/test";

/** Port dédié aux tests e2e, pour ne jamais entrer en conflit avec `npm run dev` (3000). */
const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Un `test.only` oublié fait échouer la CI plutôt que de la faire passer à vide.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI === undefined ? 0 : 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  // Un seul navigateur : le rendu est testé sur Chromium pour garder la CI rapide.
  // Les autres moteurs seront ajoutés si un bug spécifique le justifie.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Build + start : on teste ce qui sera réellement déployé, pas le serveur de dev.
    command: `npm run build && npm run start -- --port ${String(PORT)}`,
    url: BASE_URL,
    reuseExistingServer: process.env.CI === undefined,
    timeout: 180_000,
  },
});
