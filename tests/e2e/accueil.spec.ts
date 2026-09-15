import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Page d'accueil", () => {
  test("affiche le titre du club et les sections de la page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("SOCL Basket — Stade Olympique Candé Loiré");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /le basket à candé et à loiré/i,
    );
    await expect(page.getByRole("region", { name: "Le prochain match" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Les dernières actualités" })).toBeVisible();
  });

  test("ne présente aucune violation d'accessibilité critique ou sérieuse", async ({ page }) => {
    await page.goto("/");

    const resultat = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const bloquantes = resultat.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    );

    // Le message d'échec liste les règles fautives : on sait quoi corriger sans relancer.
    expect(bloquantes.map((violation) => violation.id)).toEqual([]);
  });
});
