import { setupServer } from "msw/node";
import type { RequestHandler } from "msw";

/**
 * Handlers par défaut : volontairement vide. Chaque test déclare les requêtes
 * qu'il attend via `serveurMsw.use(...)`. Toute requête réseau non déclarée fait
 * échouer le test (`onUnhandledRequest: 'error'`, cf. tests/setup.ts) : on ne
 * laisse jamais un test toucher le réseau réel sans le dire.
 */
export const handlersParDefaut: RequestHandler[] = [];

export const serveurMsw = setupServer(...handlersParDefaut);
