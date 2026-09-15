import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CarteEquipe, libelleSexe } from "@/composants/public/equipe-carte";
import type { Equipe } from "@/domaine/types";

const U15_FEMININES: Equipe = {
  id: "eq-u15f",
  slug: "u15-feminines",
  nom: "U15 Féminines",
  categorie: "U15",
  sexe: "feminin",
  competition: "Départemental féminin U15 - Division 4",
  entraineurs: ["Julien Bretaudeau"],
  creneaux: ["Entraînement : mercredi 17h00 - 18h30, Loison"],
  presentation: "Un groupe en construction.",
  ordre: 4,
};

describe("libelleSexe", () => {
  it("dit « Masculins » pour une équipe masculine", () => {
    expect(libelleSexe("masculin")).toBe("Masculins");
  });

  it("dit « Féminines » pour une équipe féminine", () => {
    expect(libelleSexe("feminin")).toBe("Féminines");
  });
});

describe("Carte d'équipe", () => {
  it("mène vers la page de l'équipe", () => {
    render(<CarteEquipe equipe={U15_FEMININES} />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/equipes/u15-feminines");
  });

  it("affiche le nom, la catégorie, le sexe et la compétition engagée", () => {
    render(<CarteEquipe equipe={U15_FEMININES} />);

    expect(screen.getByText("U15 Féminines")).toBeInTheDocument();
    expect(screen.getByText("U15")).toBeInTheDocument();
    expect(screen.getByText("Féminines")).toBeInTheDocument();
    expect(screen.getByText("Départemental féminin U15 - Division 4")).toBeInTheDocument();
  });

  it("affiche « Masculins » pour une équipe masculine", () => {
    render(<CarteEquipe equipe={{ ...U15_FEMININES, sexe: "masculin" }} />);

    expect(screen.getByText("Masculins")).toBeInTheDocument();
  });
});
