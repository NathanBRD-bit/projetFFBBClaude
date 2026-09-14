import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { serveurMsw } from "./msw/serveur";

beforeAll(() => {
  // `error` et non `warn` : une requête réseau non interceptée est un bug de test,
  // pas un détail. Elle doit être bruyante et immédiate (docs/qualite.md).
  serveurMsw.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  serveurMsw.resetHandlers();
});

afterAll(() => {
  serveurMsw.close();
});
