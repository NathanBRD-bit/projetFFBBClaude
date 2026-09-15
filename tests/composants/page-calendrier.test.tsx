import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Equipe, Rencontre } from "@/domaine/types";
import { EQUIPE_SF1, EQUIPE_SM1, construireRencontre } from "../fixtures/matchs";

const depot = vi.hoisted(() => ({
  SAISON_COURANTE: "26-27",
  listerEquipes: vi.fn<() => Promise<Equipe[]>>(),
  listerRencontres: vi.fn<(filtre?: unknown) => Promise<Rencontre[]>>(),
}));
vi.mock("@/infrastructure/donnees/depot", () => depot);

const { default: PageCalendrier, metadata } = await import("@/app/calendrier/page");

/** Horloge figée : « à venir » dépend de l'heure courante, pas du jour du test. */
const MAINTENANT = new Date("2026-09-14T12:00:00+02:00");

const MATCH_SEPTEMBRE = construireRencontre({
  id: "r-2602",
  slug: "2026-09-19-seniors-masculins-1-pouance-basket",
  equipeId: EQUIPE_SM1.id,
  dateHeure: "2026-09-19T20:30:00+02:00",
  adversaire: "Pouancé Basket",
});

const MATCH_OCTOBRE = construireRencontre({
  id: "r-2608",
  slug: "2026-10-04-seniors-feminines-1-chalonnes-sur-loire",
  equipeId: EQUIPE_SF1.id,
  dateHeure: "2026-10-04T15:30:00+02:00",
  adversaire: "Chalonnes-sur-Loire",
});

function rendre(recherche: Record<string, string | string[] | undefined> = {}) {
  return PageCalendrier({ searchParams: Promise.resolve(recherche) });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
  vi.clearAllMocks();
  depot.listerEquipes.mockResolvedValue([EQUIPE_SM1, EQUIPE_SF1]);
  depot.listerRencontres.mockResolvedValue([MATCH_SEPTEMBRE, MATCH_OCTOBRE]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Page Calendrier", () => {
  it("annonce la saison en cours dans son titre de niveau 1", async () => {
    render(await rendre());

    expect(
      screen.getByRole("heading", { level: 1, name: "Calendrier 2026-2027" }),
    ).toBeInTheDocument();
  });

  it("explique que la FFBB publie le calendrier au fil de l'eau", async () => {
    render(await rendre());

    expect(screen.getByText(/au fil de l'eau/i)).toBeInTheDocument();
  });

  it("regroupe les rencontres par mois, du plus proche au plus lointain", async () => {
    render(await rendre());

    const titres = screen.getAllByRole("heading", { level: 2 }).map((titre) => titre.textContent);

    expect(titres).toEqual(["septembre 2026", "octobre 2026"]);
  });

  it("affiche chaque rencontre avec un lien vers sa page de match", async () => {
    render(await rendre());

    expect(screen.getByRole("link", { name: /Pouancé Basket/ })).toHaveAttribute(
      "href",
      "/matchs/2026-09-19-seniors-masculins-1-pouance-basket",
    );
  });

  it("marque « Toutes les équipes » comme filtre actif par défaut", async () => {
    render(await rendre());

    const filtres = screen.getByRole("navigation", { name: "Filtrer par équipe" });

    expect(within(filtres).getByRole("link", { name: "Toutes les équipes" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("propose un lien de filtre par équipe, sans JavaScript client", async () => {
    render(await rendre());

    const filtres = screen.getByRole("navigation", { name: "Filtrer par équipe" });

    expect(within(filtres).getByRole("link", { name: EQUIPE_SF1.nom })).toHaveAttribute(
      "href",
      "/calendrier?equipe=seniors-feminines-1",
    );
  });

  it("annonce l'équipe filtrée avec aria-current et interroge le dépôt sur son identifiant", async () => {
    depot.listerRencontres.mockResolvedValue([MATCH_OCTOBRE]);
    render(await rendre({ equipe: "seniors-feminines-1" }));

    expect(depot.listerRencontres).toHaveBeenCalledWith({
      saison: "26-27",
      equipeId: EQUIPE_SF1.id,
    });

    const filtres = screen.getByRole("navigation", { name: "Filtrer par équipe" });

    expect(within(filtres).getByRole("link", { name: EQUIPE_SF1.nom })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(filtres).getByRole("link", { name: "Toutes les équipes" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("explique honnêtement l'absence de calendrier publié plutôt que de laisser un trou", async () => {
    depot.listerRencontres.mockResolvedValue([]);
    render(await rendre());

    expect(
      screen.getByText("La FFBB n'a pas encore publié la suite du calendrier 2026-2027"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Résultats" })).toHaveAttribute("href", "/resultats");
  });

  it("garde un état vide dédié quand le filtre d'une équipe ne renvoie rien", async () => {
    depot.listerRencontres.mockResolvedValue([]);
    render(await rendre({ equipe: "seniors-masculins-1" }));

    expect(
      screen.getByText("Aucun match à venir pour les Seniors Masculins 1"),
    ).toBeInTheDocument();
  });

  it("écarte les rencontres déjà jouées ou annulées", async () => {
    depot.listerRencontres.mockResolvedValue([
      construireRencontre({ id: "joue", statut: "joue", adversaire: "Segré Basket 3" }),
      construireRencontre({ id: "annule", statut: "annule", adversaire: "Tiercé-Cheffes" }),
    ]);
    render(await rendre());

    expect(screen.queryByText(/Segré Basket 3/)).toBeNull();
    expect(screen.queryByText(/Tiercé-Cheffes/)).toBeNull();
  });

  it("dit clairement qu'un slug d'équipe inconnu ne correspond à rien, sans planter", async () => {
    render(await rendre({ equipe: "equipe-de-france" }));

    expect(
      screen.getByText("Aucune équipe ne correspond à « equipe-de-france »"),
    ).toBeInTheDocument();
    // Les seuls `li` restants sont ceux des filtres : aucune liste de rencontres.
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    // Aucun appel au dépôt : inutile d'aller chercher des rencontres pour une équipe qui n'existe pas.
    expect(depot.listerRencontres).not.toHaveBeenCalled();
  });

  it("porte un titre de page propre", () => {
    expect(metadata.title).toBe("Calendrier");
  });
});
