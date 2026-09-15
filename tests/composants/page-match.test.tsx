import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Joueur, Rencontre } from "@/domaine/types";
import { EQUIPE_SM1, construireJoueur, construireRencontre } from "../fixtures/matchs";

/**
 * Le dépôt est remplacé : il importe `server-only`, qui refuse de se charger hors
 * du rendu serveur. On mocke la frontière de données, pas la logique affichée.
 */
const depot = vi.hoisted(() => ({
  trouverRencontre: vi.fn<(slug: string) => Promise<Rencontre | null>>(),
  trouverEquipeParId: vi.fn<(id: string) => Promise<typeof EQUIPE_SM1 | null>>(),
  listerPointsDuMatch:
    vi.fn<(rencontreId: string) => Promise<{ joueur: Joueur; points: number | null }[]>>(),
  listerRencontres: vi.fn<() => Promise<Rencontre[]>>(),
}));
vi.mock("@/infrastructure/donnees/depot", () => depot);

/** `notFound()` lève en production : on garde ce comportement, avec un marqueur reconnaissable. */
const ERREUR_404 = "NEXT_NOT_FOUND_TEST";
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(ERREUR_404);
  },
}));

const {
  default: PageMatch,
  generateMetadata,
  generateStaticParams,
} = await import("@/app/matchs/[slug]/page");

function rendre(rencontre: Rencontre) {
  depot.trouverRencontre.mockResolvedValue(rencontre);
  depot.trouverEquipeParId.mockResolvedValue(EQUIPE_SM1);
  return PageMatch({ params: Promise.resolve({ slug: rencontre.slug }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  depot.listerPointsDuMatch.mockResolvedValue([]);
});

describe("Page d'un match — score connu", () => {
  const MATCH_GAGNE = construireRencontre({
    id: "r-2501",
    slug: "2026-05-16-seniors-masculins-1-segre-basket-3",
    saison: "25-26",
    dateHeure: "2026-05-16T20:30:00+02:00",
    adversaire: "Segré Basket 3",
    domicile: true,
    journee: 22,
    scoreNous: 74,
    scoreAdversaire: 61,
    statut: "joue",
    resume: "Menés de sept points à la pause.\n\nUn 24-8 dans le troisième quart-temps.",
  });

  const LIGNES = [
    { joueur: construireJoueur({ id: "j-02", nomAffiche: "Maxime B.", numero: 5 }), points: 17 },
    { joueur: construireJoueur({ id: "j-06", nomAffiche: "Nathan P.", numero: 12 }), points: 0 },
    {
      joueur: construireJoueur({ id: "j-07", nomAffiche: "Kévin L.", numero: null, poste: null }),
      points: null,
    },
  ];

  it("affiche le score du match dans l'ordre recevant puis visiteur", async () => {
    render(await rendre(MATCH_GAGNE));

    expect(screen.getByText("74 – 61")).toBeInTheDocument();
  });

  it("nomme le match et sa date dans le titre de niveau 1", async () => {
    render(await rendre(MATCH_GAGNE));

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "SOCL contre Segré Basket 3, samedi 16 mai 2026",
      }),
    ).toBeInTheDocument();
  });

  it("renvoie vers les résultats et non vers le calendrier", async () => {
    render(await rendre(MATCH_GAGNE));

    expect(screen.getByRole("link", { name: /retour aux résultats/i })).toHaveAttribute(
      "href",
      "/resultats",
    );
  });

  it("rend le compte-rendu en paragraphes distincts", async () => {
    render(await rendre(MATCH_GAGNE));

    expect(screen.getByText("Menés de sept points à la pause.")).toBeInTheDocument();
    expect(screen.getByText("Un 24-8 dans le troisième quart-temps.")).toBeInTheDocument();
  });

  it("ouvre la carte de la salle dans un nouvel onglet, sans fuite de référent", async () => {
    render(await rendre(MATCH_GAGNE));

    const lien = screen.getByRole("link", { name: /voir sur une carte/i });

    expect(lien).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/search?query=All%C3%A9e%20Pierre%20Charpentier%2C%20Cand%C3%A9",
    );
    expect(lien).toHaveAttribute("target", "_blank");
    expect(lien).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("met en avant le meilleur marqueur du tableau des points", async () => {
    depot.listerPointsDuMatch.mockResolvedValue(LIGNES);
    render(await rendre(MATCH_GAGNE));

    const ligne = screen.getByRole("row", { name: /Maxime B\./ });

    expect(within(ligne).getByText("Meilleur marqueur")).toBeInTheDocument();
    expect(within(ligne).getByText("17")).toBeInTheDocument();
  });

  it("distingue un joueur resté à zéro d'une ligne non saisie", async () => {
    depot.listerPointsDuMatch.mockResolvedValue(LIGNES);
    render(await rendre(MATCH_GAGNE));

    const ligneZero = screen.getByRole("row", { name: /Nathan P\./ });
    const ligneNonSaisie = screen.getByRole("row", { name: /Kévin L\./ });

    expect(within(ligneZero).getByText("0")).toBeInTheDocument();
    expect(within(ligneNonSaisie).queryByText("0")).toBeNull();
    expect(within(ligneNonSaisie).getByText("non saisi")).toBeInTheDocument();
  });

  it("donne au tableau une légende et des en-têtes de colonnes", async () => {
    depot.listerPointsDuMatch.mockResolvedValue(LIGNES);
    render(await rendre(MATCH_GAGNE));

    const tableau = screen.getByRole("table");

    expect(tableau).toHaveAccessibleName(/points marqués par joueur/i);
    expect(within(tableau).getByRole("columnheader", { name: "Points" })).toBeInTheDocument();
  });
});

describe("Page d'un match — match joué sans score remonté", () => {
  const MATCH_SANS_FEUILLE = construireRencontre({
    id: "r-2510",
    slug: "2026-04-11-u15-feminines-loire-authion",
    saison: "25-26",
    dateHeure: "2026-04-11T14:00:00+02:00",
    adversaire: "Loire-Authion",
    domicile: false,
    journee: 11,
    scoreNous: null,
    scoreAdversaire: null,
    statut: "joue",
    salle: null,
  });

  it("annonce que le score n'a pas été communiqué", async () => {
    render(await rendre(MATCH_SANS_FEUILLE));

    expect(screen.getByText("Score non communiqué")).toBeInTheDocument();
  });

  it("n'affiche jamais de zéro à la place d'un score absent", async () => {
    render(await rendre(MATCH_SANS_FEUILLE));

    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("0 – 0")).toBeNull();
    expect(screen.queryByText(/\b0\s*–\s*0\b/)).toBeNull();
  });

  it("précise que la rencontre ne compte ni en victoire ni en défaite", async () => {
    render(await rendre(MATCH_SANS_FEUILLE));

    expect(screen.getByText(/ni en victoire ni en défaite/i)).toBeInTheDocument();
  });

  it("dit que la salle n'est pas communiquée plutôt que d'en inventer une", async () => {
    render(await rendre(MATCH_SANS_FEUILLE));

    expect(screen.getByText(/salle non communiquée/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /voir sur une carte/i })).toBeNull();
  });

  it("n'affiche aucune section de points quand rien n'a été saisi", async () => {
    render(await rendre(MATCH_SANS_FEUILLE));

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("heading", { name: /points par joueur/i })).toBeNull();
    expect(screen.queryByText(/aucune statistique/i)).toBeNull();
  });
});

describe("Page d'un match — match à venir", () => {
  const MATCH_A_VENIR = construireRencontre();

  it("affiche la date et l'heure à la place du score", async () => {
    render(await rendre(MATCH_A_VENIR));

    expect(screen.getByText("samedi 19 septembre 2026")).toBeInTheDocument();
    expect(screen.getByText("20h30")).toBeInTheDocument();
  });

  it("n'affiche aucun zéro là où le score n'existe pas encore", async () => {
    render(await rendre(MATCH_A_VENIR));

    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("renvoie vers le calendrier et non vers les résultats", async () => {
    render(await rendre(MATCH_A_VENIR));

    expect(screen.getByRole("link", { name: /retour au calendrier/i })).toHaveAttribute(
      "href",
      "/calendrier",
    );
  });

  it("dit que l'horaire n'est pas publié quand la FFBB ne l'a pas confirmé", async () => {
    render(await rendre(construireRencontre({ heureConfirmee: false })));

    expect(screen.getByText(/horaire non communiqué par la ffbb/i)).toBeInTheDocument();
  });
});

describe("Page d'un match — cas particuliers", () => {
  it("signale un score administratif de forfait au lieu de le présenter comme un match joué", async () => {
    render(
      await rendre(
        construireRencontre({
          statut: "forfait",
          scoreNous: 20,
          scoreAdversaire: 0,
          adversaire: "Béconnais SC 2",
        }),
      ),
    );

    expect(screen.getByText(/l'adversaire a déclaré forfait/i)).toBeInTheDocument();
    expect(screen.getByText(/le score est administratif/i)).toBeInTheDocument();
  });

  it("renvoie une 404 quand le slug n'existe pas", async () => {
    depot.trouverRencontre.mockResolvedValue(null);

    await expect(
      PageMatch({ params: Promise.resolve({ slug: "match-inexistant" }) }),
    ).rejects.toThrow(ERREUR_404);
  });

  it("échoue bruyamment si la rencontre est rattachée à une équipe inconnue", async () => {
    depot.trouverRencontre.mockResolvedValue(construireRencontre());
    depot.trouverEquipeParId.mockResolvedValue(null);

    await expect(PageMatch({ params: Promise.resolve({ slug: "2026-09-19-x" }) })).rejects.toThrow(
      /équipe inconnue/,
    );
  });

  it("propose un lien vers la fiche officielle de la FFBB", async () => {
    render(await rendre(construireRencontre()));

    expect(
      screen.getByRole("link", { name: /fiche officielle sur le site de la ffbb/i }),
    ).toHaveAttribute("href", "https://competitions.ffbb.com/exemple");
  });
});

describe("Page d'un match — métadonnées et génération statique", () => {
  it("liste tous les slugs de rencontres pour la génération statique", async () => {
    depot.listerRencontres.mockResolvedValue([
      construireRencontre({ slug: "un" }),
      construireRencontre({ slug: "deux" }),
    ]);

    await expect(generateStaticParams()).resolves.toEqual([{ slug: "un" }, { slug: "deux" }]);
  });

  it("titre la page avec les deux équipes et la date du match", async () => {
    depot.trouverRencontre.mockResolvedValue(construireRencontre());
    depot.trouverEquipeParId.mockResolvedValue(EQUIPE_SM1);

    const metadonnees = await generateMetadata({
      params: Promise.resolve({ slug: "2026-09-19-seniors-masculins-1-pouance-basket" }),
    });

    expect(metadonnees.title).toBe("SOCL – Pouancé Basket, 19 septembre 2026");
    expect(metadonnees.description).toContain("Seniors Masculins 1");
  });

  it("ne fabrique pas de titre pour un match qui n'existe pas", async () => {
    depot.trouverRencontre.mockResolvedValue(null);

    const metadonnees = await generateMetadata({
      params: Promise.resolve({ slug: "inconnu" }),
    });

    expect(metadonnees.title).toBe("Match introuvable");
  });
});
