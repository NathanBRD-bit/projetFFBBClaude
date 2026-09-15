import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FiltreCategories, ListeArticles } from "@/composants/public/article-liste";
import type { Article } from "@/domaine/types";

const ARTICLE_EPINGLE: Article = {
  slug: "soiree-du-club",
  titre: "Soirée du club : rendez-vous le 17 octobre",
  chapeau: "Repas, tombola et remise des maillots à la salle des fêtes de Candé.",
  contenu: "Contenu sans importance pour ce test.",
  categorie: "Événement",
  publieLe: "2026-09-12T09:30:00+02:00",
  auteur: "Le bureau",
  epingle: true,
};

const ARTICLE_ORDINAIRE: Article = {
  slug: "bilan-saison",
  titre: "Bilan de la saison 2025-2026",
  chapeau: "Une montée chez les masculins, un maintien confortable chez les féminines.",
  contenu: "Contenu sans importance pour ce test.",
  categorie: "Vie du club",
  publieLe: "2026-06-20T11:00:00+02:00",
  auteur: "Thomas Guérin",
  epingle: false,
};

describe("Liste des articles", () => {
  it("affiche pour chaque article son titre, son chapeau, sa catégorie, sa date et son auteur", () => {
    render(<ListeArticles articles={[ARTICLE_ORDINAIRE]} />);

    expect(screen.getByRole("link", { name: ARTICLE_ORDINAIRE.titre })).toHaveAttribute(
      "href",
      "/actualites/bilan-saison",
    );
    expect(screen.getByText(ARTICLE_ORDINAIRE.chapeau)).toBeInTheDocument();
    expect(screen.getByText("Vie du club")).toBeInTheDocument();
    expect(screen.getByText(/samedi 20 juin 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Thomas Guérin/)).toBeInTheDocument();
  });

  it("marque d'un badge « À la une » le seul article épinglé", () => {
    render(<ListeArticles articles={[ARTICLE_EPINGLE, ARTICLE_ORDINAIRE]} />);

    const badges = screen.getAllByText("À la une");

    expect(badges).toHaveLength(1);
  });

  it("respecte l'ordre reçu, épinglés en tête", () => {
    render(<ListeArticles articles={[ARTICLE_EPINGLE, ARTICLE_ORDINAIRE]} />);

    const titres = screen.getAllByRole("heading", { level: 3 }).map((titre) => titre.textContent);

    expect(titres).toEqual([ARTICLE_EPINGLE.titre, ARTICLE_ORDINAIRE.titre]);
  });

  it("affiche un état vide explicite quand aucun article n'est publié", () => {
    render(<ListeArticles articles={[]} />);

    expect(screen.getByText("Aucune actualité pour le moment")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("Filtre par catégorie", () => {
  const CATEGORIES = ["Équipes", "Vie du club", "Événement"] as const;

  it("propose un lien serveur par catégorie, plus un lien « Toutes »", () => {
    render(<FiltreCategories categories={CATEGORIES} categorieActive={null} />);

    const filtres = within(screen.getByRole("navigation", { name: "Filtrer par catégorie" }));

    expect(filtres.getByRole("link", { name: "Toutes" })).toHaveAttribute("href", "/actualites");
    expect(filtres.getByRole("link", { name: "Vie du club" })).toHaveAttribute(
      "href",
      "/actualites?categorie=Vie%20du%20club",
    );
  });

  it("marque « Toutes » comme page courante quand aucune catégorie n'est demandée", () => {
    render(<FiltreCategories categories={CATEGORIES} categorieActive={null} />);

    expect(screen.getByRole("link", { name: "Toutes" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Événement" })).not.toHaveAttribute("aria-current");
  });

  it("déplace le marqueur de page courante sur la catégorie demandée", () => {
    render(<FiltreCategories categories={CATEGORIES} categorieActive="Événement" />);

    expect(screen.getByRole("link", { name: "Événement" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Toutes" })).not.toHaveAttribute("aria-current");
  });

  it("encode la catégorie dans l'adresse plutôt que de la coller telle quelle", () => {
    render(<FiltreCategories categories={["Vie du club"]} categorieActive={null} />);

    expect(screen.getByRole("link", { name: "Vie du club" })).toHaveAttribute(
      "href",
      "/actualites?categorie=Vie%20du%20club",
    );
  });
});
