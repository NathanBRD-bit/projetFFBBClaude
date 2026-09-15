import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DetailEquipe } from "@/composants/public/equipe-detail";
import { dernieresRencontresJouees, prochainesRencontres } from "@/domaine/rencontres";
import type { Equipe, Joueur, Rencontre } from "@/domaine/types";
import { EQUIPES, JOUEURS, RENCONTRES } from "@/infrastructure/donnees/demo";

const MAINTENANT = new Date("2026-09-14T12:00:00+02:00");

function equipeParSlug(slug: string): Equipe {
  const equipe = EQUIPES.find((candidate) => candidate.slug === slug);
  if (equipe === undefined) {
    throw new Error(`Jeu de données de test incohérent : équipe « ${slug} » absente.`);
  }
  return equipe;
}

function rencontresDe(equipe: Equipe): Rencontre[] {
  return RENCONTRES.filter((rencontre) => rencontre.equipeId === equipe.id);
}

function joueursDe(equipe: Equipe): Joueur[] {
  return JOUEURS.filter((joueur) => joueur.equipeId === equipe.id);
}

function rendre(equipe: Equipe) {
  const rencontres = rencontresDe(equipe);
  render(
    <DetailEquipe
      equipe={equipe}
      prochains={prochainesRencontres(rencontres, MAINTENANT, 5)}
      derniers={dernieresRencontresJouees(rencontres, 5)}
      joueurs={joueursDe(equipe)}
    />,
  );
}

describe("Page d'équipe — équipe dont l'effectif est saisi", () => {
  const SENIORS_MASCULINS = equipeParSlug("seniors-masculins-1");

  it("affiche le nom de l'équipe en titre de niveau 1 et sa compétition", () => {
    rendre(SENIORS_MASCULINS);

    expect(
      screen.getByRole("heading", { level: 1, name: "Seniors Masculins 1" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Départementale masculine seniors - Division 5")).toBeInTheDocument();
  });

  it("présente l'équipe, ses entraîneurs et ses créneaux", () => {
    rendre(SENIORS_MASCULINS);

    expect(screen.getByText(/l'équipe fanion masculine du club/i)).toBeInTheDocument();
    expect(screen.getByText("Thomas Guérin")).toBeInTheDocument();
    expect(screen.getByText(/Entraînement : mardi 20h00 - 22h00, Loison/)).toBeInTheDocument();
  });

  it("affiche les prochains matchs et les derniers résultats de cette équipe seulement", () => {
    rendre(SENIORS_MASCULINS);

    const aVenir = screen.getByRole("region", { name: "Les prochains matchs" });
    const joues = screen.getByRole("region", { name: "Les derniers résultats" });

    expect(within(aVenir).getByText(/Pouancé Basket/)).toBeInTheDocument();
    expect(within(joues).getByText(/Segré Basket 3/)).toBeInTheDocument();
    // Un adversaire d'une autre équipe ne doit pas apparaître sur cette page.
    expect(screen.queryByText(/Chazé-sur-Argos 2/)).not.toBeInTheDocument();
  });

  it("affiche l'effectif avec le numéro, le nom et le poste de chaque joueur", () => {
    rendre(SENIORS_MASCULINS);

    const effectif = screen.getByRole("region", { name: "L'effectif" });
    const lignes = within(effectif).getAllByRole("row");

    // 7 joueurs saisis, plus la ligne d'en-tête.
    expect(lignes).toHaveLength(8);
    expect(within(effectif).getByText("Thomas G.")).toBeInTheDocument();
    expect(within(effectif).getByText("Meneur")).toBeInTheDocument();
  });
});

describe("Page d'équipe — équipe sans effectif saisi", () => {
  const U11_MASCULINS = equipeParSlug("u11-masculins");

  it("ne vérifie rien d'inutile : cette équipe n'a effectivement aucun joueur enregistré", () => {
    expect(joueursDe(U11_MASCULINS)).toHaveLength(0);
  });

  it("n'affiche aucune section effectif plutôt qu'un tableau vide", () => {
    rendre(U11_MASCULINS);

    expect(screen.queryByRole("region", { name: "L'effectif" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "L'effectif" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("n'écrit nulle part qu'il n'y a aucun joueur : l'information n'est pas saisie, pas absente", () => {
    rendre(U11_MASCULINS);

    expect(screen.queryByText(/aucun joueur/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/effectif/i)).not.toBeInTheDocument();
  });

  it("affiche malgré tout la présentation et le calendrier de l'équipe", () => {
    rendre(U11_MASCULINS);

    expect(screen.getByRole("heading", { level: 1, name: "U11 Masculins" })).toBeInTheDocument();
    expect(screen.getByText(/Chazé-sur-Argos 2/)).toBeInTheDocument();
  });
});

describe("Page d'équipe — équipe sans entraîneur déclaré", () => {
  const VETERANS = equipeParSlug("veterans-masculins");

  it("n'affiche pas de bloc encadrement vide", () => {
    rendre(VETERANS);

    expect(screen.queryByRole("heading", { name: /entraîneur/i })).not.toBeInTheDocument();
  });

  it("affiche un seul entraîneur au singulier et plusieurs au pluriel", () => {
    render(<DetailEquipe equipe={VETERANS} prochains={[]} derniers={[]} joueurs={[]} />);
    expect(screen.queryByRole("heading", { name: "Entraîneur" })).not.toBeInTheDocument();

    render(
      <DetailEquipe
        equipe={{ ...VETERANS, entraineurs: ["Alice", "Bob"] }}
        prochains={[]}
        derniers={[]}
        joueurs={[]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Entraîneurs" })).toBeInTheDocument();
  });
});

describe("Page d'équipe — équipe sans aucune rencontre", () => {
  const EQUIPE_SANS_CRENEAU: Equipe = {
    ...equipeParSlug("u9-masculins"),
    entraineurs: [],
    creneaux: [],
  };

  it("explique l'absence de match à venir et de résultat au lieu de laisser deux trous", () => {
    render(<DetailEquipe equipe={EQUIPE_SANS_CRENEAU} prochains={[]} derniers={[]} joueurs={[]} />);

    expect(screen.getByText("Aucun match à venir")).toBeInTheDocument();
    expect(screen.getByText("Aucun résultat")).toBeInTheDocument();
  });

  it("n'affiche pas de bilan chiffré quand aucun match n'a de score connu", () => {
    render(<DetailEquipe equipe={EQUIPE_SANS_CRENEAU} prochains={[]} derniers={[]} joueurs={[]} />);

    expect(screen.queryByText(/au score connu/i)).not.toBeInTheDocument();
  });
});

describe("Page d'équipe — bilan des derniers résultats", () => {
  const U15 = equipeParSlug("u15-feminines");

  it("compte les victoires, les défaites et les nuls des matchs au score connu", () => {
    rendre(U15);

    // U15 en 25-26 : un nul 36-36, et un match joué dont la feuille n'est jamais
    // remontée — celui-là ne doit pas être compté comme une défaite.
    expect(screen.getByText(/Sur le dernier match au score connu/)).toBeInTheDocument();
    expect(screen.getByText("0 victoire")).toBeInTheDocument();
    expect(screen.getByText("0 défaite")).toBeInTheDocument();
    expect(screen.getByText(/1 nul/)).toBeInTheDocument();
  });

  it("accorde le pluriel des victoires et des défaites", () => {
    rendre(equipeParSlug("seniors-masculins-1"));

    expect(screen.getByText(/Sur les 3 derniers matchs au score connu/)).toBeInTheDocument();
    expect(screen.getByText("2 victoires")).toBeInTheDocument();
    expect(screen.getByText("1 défaite")).toBeInTheDocument();
  });
});
