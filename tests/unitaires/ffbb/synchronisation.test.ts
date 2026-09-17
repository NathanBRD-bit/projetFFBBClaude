import { describe, expect, it } from "vitest";

import { exigerLigne, PROPORTION_INVALIDES_MAX } from "@/infrastructure/ffbb/synchronisation";

/**
 * Le moteur de synchronisation se prouve sur une vraie base
 * (`tests/integration/ffbb-synchronisation.test.ts`). Ne restent ici que les
 * pièces qu'aucun scénario réel n'atteint, et qui doivent pourtant être justes :
 * un garde-fou jamais exécuté est un garde-fou qu'on ne sait pas correct.
 */
describe("garde-fou sur une écriture sans ligne rendue", () => {
  it("renvoie la première ligne quand la base en a rendu une", () => {
    expect(exigerLigne([{ id: "abc" }, { id: "def" }], "un test")).toEqual({ id: "abc" });
  });

  it("refuse de continuer quand la base n'a rendu aucune ligne, en disant laquelle", () => {
    expect(() => exigerLigne([], "la création de la poule D 4A")).toThrowError(
      /La base n'a rendu aucune ligne pour la création de la poule D 4A/,
    );
  });
});

describe("seuil de documents invalides", () => {
  it("laisse passer l'accident isolé et arrête un changement de format", () => {
    // 1 document écarté sur 250 (l'ordre de grandeur d'une saison de club) passe ;
    // 1 sur 10 non. C'est cette frontière-là que le plan décrit.
    expect(1 > 250 * PROPORTION_INVALIDES_MAX).toBe(false);
    expect(1 > 10 * PROPORTION_INVALIDES_MAX).toBe(true);
  });
});
