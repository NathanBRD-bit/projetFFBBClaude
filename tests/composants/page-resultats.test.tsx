import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Equipe, Rencontre } from "@/domaine/types";
import { EQUIPE_SF1, EQUIPE_SM1, construireRencontre } from "../fixtures/matchs";

const depot = vi.hoisted(() => ({
  SAISON_COURANTE: "26-27",
  listerSaisons: vi.fn<() => string[]>(),
  listerEquipes: vi.fn<() => Promise<Equipe[]>>(),
  listerRencontres: vi.fn<(filtre?: unknown) => Promise<Rencontre[]>>(),
}));
vi.mock("@/infrastructure/donnees/depot", () => depot);

const { default: PageResultats, metadata } = await import("@/app/resultats/page");

const VICTOIRE = construireRencontre({
  id: "r-2501",
  slug: "2026-05-16-seniors-masculins-1-segre-basket-3",
  saison: "25-26",
  dateHeure: "2026-05-16T20:30:00+02:00",
  adversaire: "Segré Basket 3",
  scoreNous: 74,
  scoreAdversaire: 61,
  statut: "joue",
});

const DEFAITE = construireRencontre({
  id: "r-2502",
  slug: "2026-05-09-seniors-masculins-1-le-lion-d-angers-2",
  saison: "25-26",
  dateHeure: "2026-05-09T20:30:00+02:00",
  adversaire: "Le Lion-d'Angers 2",
  scoreNous: 58,
  scoreAdversaire: 66,
  statut: "joue",
});

/** Le cas piège : match joué, feuille de match jamais remontée. */
const SANS_FEUILLE = construireRencontre({
  id: "r-2510",
  slug: "2026-04-11-u15-feminines-loire-authion",
  saison: "25-26",
  dateHeure: "2026-04-11T14:00:00+02:00",
  adversaire: "Loire-Authion",
  scoreNous: null,
  scoreAdversaire: null,
  statut: "joue",
});

const FORFAIT = construireRencontre({
  id: "r-2506",
  slug: "2026-04-12-seniors-feminines-1-beconnais-sc-2",
  saison: "25-26",
  equipeId: EQUIPE_SF1.id,
  dateHeure: "2026-04-12T15:30:00+02:00",
  adversaire: "Béconnais SC 2",
  scoreNous: 20,
  scoreAdversaire: 0,
  statut: "forfait",
});

function rendre(recherche: Record<string, string | string[] | undefined> = {}) {
  return PageResultats({ searchParams: Promise.resolve(recherche) });
}

beforeEach(() => {
  vi.clearAllMocks();
  depot.listerSaisons.mockReturnValue(["26-27", "25-26"]);
  depot.listerEquipes.mockResolvedValue([EQUIPE_SM1, EQUIPE_SF1]);
  depot.listerRencontres.mockResolvedValue([VICTOIRE, DEFAITE, SANS_FEUILLE, FORFAIT]);
});

describe("Page Résultats — bilan", () => {
  it("compte les victoires, défaites et nuls du périmètre affiché", async () => {
    render(await rendre({ saison: "25-26" }));

    const bilan = screen.getByRole("heading", { level: 2, name: /^Bilan 2025-2026/ }).parentElement;
    if (bilan === null) {
      throw new Error("L'encart de bilan doit exister quand des matchs ont été joués.");
    }

    // VICTOIRE et FORFAIT côté club, DEFAITE contre : 2 victoires, 1 défaite, 0 nul.
    expect(within(bilan).getByText("Victoires").nextElementSibling).toHaveTextContent("2");
    expect(within(bilan).getByText("Défaites").nextElementSibling).toHaveTextContent("1");
    expect(within(bilan).getByText("Matchs nuls").nextElementSibling).toHaveTextContent("0");
    expect(within(bilan).getByText("Matchs comptabilisés").nextElementSibling).toHaveTextContent(
      "3",
    );
  });

  it("signale la rencontre sans feuille de match au lieu de la compter", async () => {
    render(await rendre({ saison: "25-26" }));

    expect(screen.getByText(/1 rencontre de ce périmètre est disputée/i)).toBeInTheDocument();
    expect(screen.getByText(/ni en victoire ni en défaite/i)).toBeInTheDocument();
  });

  it("n'affiche aucun encart de bilan quand rien n'a été joué", async () => {
    depot.listerRencontres.mockResolvedValue([]);
    render(await rendre({ saison: "26-27" }));

    expect(screen.queryByRole("heading", { name: /^Bilan/ })).toBeNull();
    expect(screen.getByText("Aucun match joué en 2026-2027")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "calendrier" })).toHaveAttribute("href", "/calendrier");
  });
});

describe("Page Résultats — liste", () => {
  it("affiche le score connu d'une rencontre", async () => {
    render(await rendre({ saison: "25-26" }));

    expect(screen.getByText("74 – 61")).toBeInTheDocument();
  });

  it("affiche « score non communiqué » et jamais « 0 – 0 » pour une feuille manquante", async () => {
    depot.listerRencontres.mockResolvedValue([SANS_FEUILLE]);
    render(await rendre({ saison: "25-26" }));

    // On restreint la recherche à la liste des rencontres : l'encart de bilan
    // affiche légitimement des compteurs à zéro, ce n'est pas un score manquant.
    const liste = screen.getByRole("region");

    expect(within(liste).getByText("score non communiqué")).toBeInTheDocument();
    expect(within(liste).queryByText("0 – 0")).toBeNull();
    expect(within(liste).queryByText("0")).toBeNull();
  });

  it("conserve les forfaits, que le domaine exclut des « rencontres jouées »", async () => {
    render(await rendre({ saison: "25-26" }));

    expect(screen.getByRole("link", { name: /Béconnais SC 2/ })).toBeInTheDocument();
  });

  it("trie du plus récent au plus ancien et regroupe par mois", async () => {
    render(await rendre({ saison: "25-26" }));

    const titres = screen
      .getAllByRole("heading", { level: 2 })
      .map((titre) => titre.textContent)
      .filter((texte) => !texte.startsWith("Bilan"));

    expect(titres).toEqual(["mai 2026", "avril 2026"]);
  });
});

describe("Page Résultats — filtres", () => {
  it("propose une option par saison publiée", async () => {
    render(await rendre());

    const filtres = screen.getByRole("navigation", { name: "Filtrer par saison" });

    expect(within(filtres).getByRole("link", { name: "2026-2027" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(filtres).getByRole("link", { name: "2025-2026" })).toHaveAttribute(
      "href",
      "/resultats?saison=25-26",
    );
  });

  it("conserve la saison choisie dans les liens de filtre par équipe", async () => {
    render(await rendre({ saison: "25-26" }));

    const filtres = screen.getByRole("navigation", { name: "Filtrer par équipe" });

    expect(within(filtres).getByRole("link", { name: EQUIPE_SM1.nom })).toHaveAttribute(
      "href",
      "/resultats?saison=25-26&equipe=seniors-masculins-1",
    );
  });

  it("conserve l'équipe choisie dans les liens de filtre par saison", async () => {
    render(await rendre({ saison: "25-26", equipe: "seniors-masculins-1" }));

    const filtres = screen.getByRole("navigation", { name: "Filtrer par saison" });

    expect(within(filtres).getByRole("link", { name: "2026-2027" })).toHaveAttribute(
      "href",
      "/resultats?saison=26-27&equipe=seniors-masculins-1",
    );
  });

  it("interroge le dépôt avec la saison et l'équipe demandées", async () => {
    render(await rendre({ saison: "25-26", equipe: "seniors-feminines-1" }));

    expect(depot.listerRencontres).toHaveBeenCalledWith({
      saison: "25-26",
      equipeId: EQUIPE_SF1.id,
    });
  });

  it("dit qu'une saison inconnue ne correspond à rien, sans planter", async () => {
    render(await rendre({ saison: "12-13" }));

    expect(screen.getByText("Aucune saison ne correspond à « 12-13 »")).toBeInTheDocument();
    expect(depot.listerRencontres).not.toHaveBeenCalled();
  });

  it("dit qu'une équipe inconnue ne correspond à rien, sans planter", async () => {
    render(await rendre({ equipe: "equipe-de-france" }));

    expect(
      screen.getByText("Aucune équipe ne correspond à « equipe-de-france »"),
    ).toBeInTheDocument();
    expect(depot.listerRencontres).not.toHaveBeenCalled();
  });

  it("nomme le périmètre vide quand une équipe n'a joué aucun match sur la saison", async () => {
    depot.listerRencontres.mockResolvedValue([]);
    render(await rendre({ saison: "25-26", equipe: "seniors-masculins-1" }));

    expect(
      screen.getByText("Aucun match joué par les Seniors Masculins 1 en 2025-2026"),
    ).toBeInTheDocument();
  });

  it("porte un titre de page propre", () => {
    expect(metadata.title).toBe("Résultats");
  });
});
