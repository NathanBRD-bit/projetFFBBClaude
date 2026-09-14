import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Page d'accueil", () => {
  test("affiche le titre du club et le message de construction", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("SOCL Basket");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /le site du club est en construction/i,
    );
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
