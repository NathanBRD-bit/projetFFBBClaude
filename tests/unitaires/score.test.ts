import { describe, expect, it } from "vitest";
import { formaterScore, SCORE_INCONNU } from "@/domaine/score";

describe("formaterScore", () => {
  it("affiche les deux scores séparés par un tiret quand ils sont connus", () => {
    expect(formaterScore(62, 58)).toBe("62 – 58");
  });

  it("affiche 0 et non le tiret d'absence quand une équipe n'a marqué aucun point", () => {
    // Cas central du projet : 0 est une donnée, pas une absence de donnée.
    expect(formaterScore(0, 58)).toBe("0 – 58");
    expect(formaterScore(62, 0)).toBe("62 – 0");
    expect(formaterScore(0, 0)).toBe("0 – 0");
  });

  it("renvoie le tiret d'absence quand le score domicile est inconnu", () => {
    expect(formaterScore(null, 58)).toBe(SCORE_INCONNU);
  });

  it("renvoie le tiret d'absence quand le score extérieur est inconnu", () => {
    expect(formaterScore(62, null)).toBe(SCORE_INCONNU);
  });

  it("renvoie le tiret d'absence quand les deux scores sont inconnus", () => {
    expect(formaterScore(null, null)).toBe(SCORE_INCONNU);
  });

  it("refuse un score négatif plutôt que de l'afficher", () => {
    expect(() => formaterScore(-1, 58)).toThrow(RangeError);
    expect(() => formaterScore(62, -1)).toThrow(/Score extérieur invalide/);
  });

  it("refuse un score invalide même quand l'autre score est inconnu", () => {
    // Régression : le court-circuit sur `null` sautait la validation, et une donnée
    // corrompue se déguisait en « match non joué ».
    expect(() => formaterScore(-1, null)).toThrow(/Score domicile invalide/);
    expect(() => formaterScore(null, -1)).toThrow(/Score extérieur invalide/);
    expect(() => formaterScore(Number.NaN, null)).toThrow(RangeError);
    expect(() => formaterScore(null, 58.5)).toThrow(/Score extérieur invalide/);
  });

  it("refuse un score non entier plutôt que de l'arrondir en silence", () => {
    expect(() => formaterScore(62.5, 58)).toThrow(/Score domicile invalide/);
    expect(() => formaterScore(62, Number.NaN)).toThrow(RangeError);
  });
});
