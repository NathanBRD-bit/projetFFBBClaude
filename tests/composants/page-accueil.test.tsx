import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PageAccueil from "@/app/page";

describe("Page d'accueil", () => {
  it("annonce que le site est en construction dans un titre de niveau 1", () => {
    render(<PageAccueil />);

    expect(
      screen.getByRole("heading", { level: 1, name: /le site du club est en construction/i }),
    ).toBeInTheDocument();
  });

  it("affiche le nom du club", () => {
    render(<PageAccueil />);

    expect(screen.getByText("SOCL Basket")).toBeInTheDocument();
  });
});
