import { describe, expect, it, vi } from "vitest";

// `server-only` lève volontairement à l'import hors contexte serveur React. Le
// dépôt le garde pour empêcher un composant client de l'importer par mégarde ;
// en test unitaire, on le neutralise pour pouvoir exercer le module lui-même.
vi.mock("server-only", () => ({}));

const {
  listerArticles,
  listerCategoriesArticles,
  listerEquipes,
  listerJoueurs,
  listerPointsDuMatch,
  listerRencontres,
  listerSaisons,
  trouverArticle,
  trouverEquipe,
  trouverEquipeParId,
  trouverRencontre,
  SAISON_COURANTE,
  SAISON_PRECEDENTE,
} = await import("@/infrastructure/donnees/depot");

describe("listerSaisons", () => {
  it("renvoie les saisons de la plus récente à la plus ancienne, sans doublon", () => {
    expect(listerSaisons()).toEqual([SAISON_COURANTE, SAISON_PRECEDENTE]);
  });
});

describe("listerEquipes", () => {
  it("trie les équipes par leur ordre d'affichage", async () => {
    const equipes = await listerEquipes();

    expect(equipes.map((equipe) => equipe.ordre)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("trouverEquipe", () => {
  it("retrouve une équipe par son slug", async () => {
    const equipe = await trouverEquipe("seniors-masculins-1");

    expect(equipe?.nom).toBe("Seniors Masculins 1");
  });

  it("renvoie null pour un slug inconnu plutôt qu'une équipe au hasard", async () => {
    expect(await trouverEquipe("equipe-qui-nexiste-pas")).toBeNull();
  });
});

describe("trouverEquipeParId", () => {
  it("retrouve une équipe par son identifiant", async () => {
    const equipe = await trouverEquipeParId("eq-sf1");

    expect(equipe?.slug).toBe("seniors-feminines-1");
  });

  it("renvoie null pour un identifiant inconnu", async () => {
    expect(await trouverEquipeParId("eq-inconnue")).toBeNull();
  });
});

describe("listerRencontres", () => {
  it("renvoie toutes les rencontres quand aucun filtre n'est passé", async () => {
    const rencontres = await listerRencontres();

    expect(rencontres).toHaveLength(22);
  });

  it("filtre sur la saison demandée", async () => {
    const rencontres = await listerRencontres({ saison: SAISON_COURANTE });

    expect(rencontres.length).toBeGreaterThan(0);
    expect(rencontres.every((rencontre) => rencontre.saison === SAISON_COURANTE)).toBe(true);
  });

  it("filtre sur l'équipe demandée", async () => {
    const rencontres = await listerRencontres({ equipeId: "eq-sm1" });

    expect(rencontres.length).toBeGreaterThan(0);
    expect(rencontres.every((rencontre) => rencontre.equipeId === "eq-sm1")).toBe(true);
  });

  it("combine les deux filtres", async () => {
    const rencontres = await listerRencontres({ saison: SAISON_PRECEDENTE, equipeId: "eq-sm1" });

    expect(
      rencontres.every(
        (rencontre) => rencontre.saison === SAISON_PRECEDENTE && rencontre.equipeId === "eq-sm1",
      ),
    ).toBe(true);
  });

  it("renvoie une liste vide pour une équipe sans rencontre, et non toutes les rencontres", async () => {
    expect(await listerRencontres({ equipeId: "eq-inconnue" })).toEqual([]);
  });
});

describe("trouverRencontre", () => {
  it("retrouve une rencontre par son slug", async () => {
    const rencontre = await trouverRencontre("2026-09-19-seniors-masculins-1-pouance-basket");

    expect(rencontre?.adversaire).toBe("Pouancé Basket");
  });

  it("renvoie null pour un slug inconnu", async () => {
    expect(await trouverRencontre("2026-01-01-equipe-adversaire")).toBeNull();
  });
});

describe("listerJoueurs", () => {
  it("trie l'effectif par numéro de maillot croissant", async () => {
    const joueurs = await listerJoueurs("eq-sm1");

    expect(joueurs.map((joueur) => joueur.numero)).toEqual([4, 5, 7, 9, 11, 12, 14]);
  });

  it("renvoie une liste vide pour une équipe dont l'effectif n'est pas saisi", async () => {
    expect(await listerJoueurs("eq-u11m")).toEqual([]);
  });
});

describe("listerPointsDuMatch", () => {
  it("classe les joueurs du plus grand nombre de points au plus petit", async () => {
    const lignes = await listerPointsDuMatch("r-2504");

    expect(lignes.map((ligne) => ligne.points)).toEqual([15, 13, 11, 6, 4]);
  });

  it("place les saisies manquantes en dernier, derrière un vrai zéro", async () => {
    const lignes = await listerPointsDuMatch("r-2501");

    // Le 0 de la ligne « a joué sans marquer » précède le null « non saisi » :
    // les deux ne doivent jamais être confondus.
    expect(lignes.map((ligne) => ligne.points)).toEqual([17, 14, 12, 9, 8, 0, null]);
  });

  it("renvoie une liste vide pour un match sans aucune saisie", async () => {
    expect(await listerPointsDuMatch("r-2602")).toEqual([]);
  });
});

describe("listerArticles", () => {
  it("place les articles épinglés en tête, puis les autres du plus récent au plus ancien", async () => {
    const articles = await listerArticles();

    expect(articles.map((article) => article.epingle)).toEqual([true, true, false, false, false]);
    expect(articles.slice(2).map((article) => article.slug)).toEqual([
      "presentation-seniors-masculins-2026-2027",
      "appel-aux-benevoles-table-de-marque",
      "bilan-saison-2025-2026",
    ]);
  });

  it("respecte la limite demandée", async () => {
    expect(await listerArticles(3)).toHaveLength(3);
  });
});

describe("trouverArticle", () => {
  it("retrouve un article par son slug", async () => {
    const article = await trouverArticle("bilan-saison-2025-2026");

    expect(article?.titre).toBe("Bilan de la saison 2025-2026");
  });

  it("renvoie null pour un slug inconnu", async () => {
    expect(await trouverArticle("article-inexistant")).toBeNull();
  });
});

describe("listerCategoriesArticles", () => {
  it("renvoie les catégories distinctes, triées", async () => {
    expect(await listerCategoriesArticles()).toEqual(["Vie du club", "Équipes", "Événement"]);
  });
});
