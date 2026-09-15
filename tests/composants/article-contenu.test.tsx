import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContenuArticle } from "@/composants/public/article-contenu";

/**
 * Ces tests vérifient le *rendu* de l'HTML assaini dans le DOM. La neutralisation
 * elle-même est testée à la source, dans tests/unitaires/markdown.test.ts.
 */
describe("Contenu d'un article", () => {
  it("rend les titres, les listes et les liens du Markdown", () => {
    render(
      <ContenuArticle
        markdown={"## Les créneaux\n\n- U9\n- U11\n\n[la FFBB](https://www.ffbb.com/)"}
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Les créneaux" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "la FFBB" })).toHaveAttribute(
      "href",
      "https://www.ffbb.com/",
    );
  });

  it("n'insère jamais de script dans le document, même si l'article en contient un", () => {
    const { container } = render(
      <ContenuArticle markdown={"Bonjour\n\n<script>alert(1)</script>"} />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("Bonjour")).toBeInTheDocument();
  });

  it("rend un contenu vide sans planter", () => {
    const { container } = render(<ContenuArticle markdown="" />);

    expect(container.firstChild).toBeEmptyDOMElement();
  });
});
