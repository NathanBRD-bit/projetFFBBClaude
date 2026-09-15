import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccueilContenu, type RencontreAffichee } from "@/composants/public/accueil-contenu";
import { dernieresRencontresJouees, prochainesRencontres } from "@/domaine/rencontres";
import type { Article, Equipe, Rencontre } from "@/domaine/types";
import { ARTICLES, EQUIPES, RENCONTRES } from "@/infrastructure/donnees/demo";

/**
 * Horloge figée : sans elle, le « prochain match » dépendrait du jour où la suite
 * est lancée, et le test deviendrait rouge tout seul dans quelques mois.
 */
const MAINTENANT = new Date("2026-09-14T12:00:00+02:00");

function equipeDe(equipeId: string): Equipe {
  const equipe = EQUIPES.find((candidate) => candidate.id === equipeId);
  if (equipe === undefined) {
    throw new Error(`Jeu de données de test incohérent : équipe « ${equipeId} » absente.`);
  }
  return equipe;
}

function accueilAvecDonnees() {
  const [premiere] = prochainesRencontres(RENCONTRES, MAINTENANT, 1);
  if (premiere === undefined) {
    throw new Error("Le jeu de démonstration doit contenir au moins une rencontre à venir.");
  }
  const prochain: RencontreAffichee = { rencontre: premiere, equipe: equipeDe(premiere.equipeId) };
  const derniers: RencontreAffichee[] = dernieresRencontresJouees(RENCONTRES, 3).map(
    (rencontre) => ({ rencontre, equipe: equipeDe(rencontre.equipeId) }),
  );
  const articles: Article[] = [...ARTICLES].slice(0, 3);

  return { prochain, derniers, articles, equipes: EQUIPES };
}

describe("Page d'accueil — avec des données", () => {
  it("annonce le club dans le titre de niveau 1", () => {
    render(<AccueilContenu {...accueilAvecDonnees()} />);

    expect(
      screen.getByRole("heading", { level: 1, name: /le basket à candé et à loiré/i }),
    ).toBeInTheDocument();
  });

  it("propose les deux actions du bandeau vers le calendrier et les actualités", () => {
    render(<AccueilContenu {...accueilAvecDonnees()} />);

    expect(screen.getByRole("link", { name: "Voir le calendrier" })).toHaveAttribute(
      "href",
      "/calendrier",
    );
    expect(screen.getByRole("link", { name: "Lire les actualités" })).toHaveAttribute(
      "href",
      "/actualites",
    );
  });

  it("met en avant le prochain match avec son équipe, son adversaire, sa date et son lieu", () => {
    const donnees = accueilAvecDonnees();
    render(<AccueilContenu {...donnees} />);

    const section = screen.getByRole("region", { name: "Le prochain match" });

    // La première rencontre du jeu de démonstration : U11 masculins à Chazé-sur-Argos.
    expect(within(section).getByText("U11 Masculins")).toBeInTheDocument();
    expect(within(section).getByText(/Chazé-sur-Argos 2/)).toBeInTheDocument();
    expect(within(section).getByText(/samedi 19 septembre 2026/)).toBeInTheDocument();
    expect(within(section).getByText(/11h30/)).toBeInTheDocument();
    expect(within(section).getByText(/La Chazéenne/)).toBeInTheDocument();
    expect(within(section).getByText("En déplacement")).toBeInTheDocument();
  });

  it("affiche au plus trois derniers résultats et le lien vers la page des résultats", () => {
    const donnees = accueilAvecDonnees();
    render(<AccueilContenu {...donnees} />);

    const section = screen.getByRole("region", { name: "Les derniers résultats" });

    expect(within(section).getAllByRole("listitem")).toHaveLength(3);
    expect(within(section).getByRole("link", { name: "Tous les résultats" })).toHaveAttribute(
      "href",
      "/resultats",
    );
  });

  it("affiche les trois dernières actualités avec leur catégorie et leur date", () => {
    const donnees = accueilAvecDonnees();
    render(<AccueilContenu {...donnees} />);

    const section = screen.getByRole("region", { name: "Les dernières actualités" });
    const premier = donnees.articles[0];
    if (premier === undefined) {
      throw new Error("Le jeu de démonstration doit contenir au moins un article.");
    }

    expect(within(section).getAllByRole("listitem")).toHaveLength(3);
    expect(within(section).getByRole("link", { name: premier.titre })).toHaveAttribute(
      "href",
      `/actualites/${premier.slug}`,
    );
    expect(within(section).getByText(premier.chapeau)).toBeInTheDocument();
    expect(within(section).getAllByText(premier.categorie).length).toBeGreaterThan(0);
  });

  it("propose un lien vers chacune des sept équipes du club", () => {
    const donnees = accueilAvecDonnees();
    render(<AccueilContenu {...donnees} />);

    const section = screen.getByRole("region", { name: "Les équipes du club" });

    for (const equipe of EQUIPES) {
      expect(within(section).getByRole("link", { name: new RegExp(equipe.nom) })).toHaveAttribute(
        "href",
        `/equipes/${equipe.slug}`,
      );
    }
  });
});

describe("Page d'accueil — sans aucune donnée", () => {
  /** Le cas de recette : site tout neuf, aucune rencontre publiée, aucun article rédigé. */
  function rendreVide() {
    render(<AccueilContenu prochain={null} derniers={[]} articles={[]} equipes={[]} />);
  }

  it("conserve son bandeau et son titre de niveau 1", () => {
    rendreVide();

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir le calendrier" })).toBeInTheDocument();
  });

  it("garde les quatre sections de la page plutôt que de les faire disparaître", () => {
    rendreVide();

    for (const titre of [
      "Le prochain match",
      "Les derniers résultats",
      "Les dernières actualités",
      "Les équipes du club",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: titre })).toBeInTheDocument();
    }
  });

  it("explique l'absence de match au lieu de laisser un trou", () => {
    rendreVide();

    expect(screen.getByText("Aucun match programmé pour l'instant")).toBeInTheDocument();
    expect(
      screen.getByText(/la ffbb publie les rencontres au fil de la saison/i),
    ).toBeInTheDocument();
  });

  it("explique l'absence de résultat, d'actualité et d'équipe", () => {
    rendreVide();

    expect(screen.getByText("Pas encore de résultat")).toBeInTheDocument();
    expect(screen.getByText("Aucune actualité pour le moment")).toBeInTheDocument();
    expect(screen.getByText("Aucune équipe engagée")).toBeInTheDocument();
  });

  it("n'affiche aucune carte de match ni d'article", () => {
    rendreVide();

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("Page d'accueil — prochain match aux informations incomplètes", () => {
  const RENCONTRE_INCOMPLETE: Rencontre = {
    id: "r-test",
    slug: "2026-09-26-seniors-masculins-1-beconnais-sc",
    saison: "26-27",
    equipeId: "eq-sm1",
    competition: "Départementale masculine seniors - Division 5",
    journee: null,
    dateHeure: "2026-09-26T20:30:00+02:00",
    heureConfirmee: false,
    adversaire: "Béconnais SC",
    domicile: true,
    scoreNous: null,
    scoreAdversaire: null,
    statut: "a_venir",
    salle: null,
    urlFfbb: null,
    resume: null,
  };

  function rendre(prochain: RencontreAffichee) {
    render(<AccueilContenu prochain={prochain} derniers={[]} articles={[]} equipes={[]} />);
  }

  it("écrit que l'horaire n'est pas communiqué plutôt que d'en inventer un", () => {
    rendre({ rencontre: RENCONTRE_INCOMPLETE, equipe: equipeDe("eq-sm1") });

    expect(screen.getByText(/horaire non communiqué/i)).toBeInTheDocument();
    expect(screen.queryByText(/20h30/)).not.toBeInTheDocument();
  });

  it("écrit que le lieu n'est pas communiqué quand la salle est inconnue", () => {
    rendre({ rencontre: RENCONTRE_INCOMPLETE, equipe: equipeDe("eq-sm1") });

    expect(screen.getByText(/lieu non communiqué/i)).toBeInTheDocument();
  });

  it("n'affiche aucun numéro de journée quand la FFBB ne l'a pas publié", () => {
    rendre({ rencontre: RENCONTRE_INCOMPLETE, equipe: equipeDe("eq-sm1") });

    expect(screen.queryByText(/journée/i)).not.toBeInTheDocument();
  });

  it("annonce un match à domicile avec « contre » et non « à »", () => {
    rendre({ rencontre: RENCONTRE_INCOMPLETE, equipe: equipeDe("eq-sm1") });

    const section = screen.getByRole("region", { name: "Le prochain match" });

    expect(within(section).getByText("À domicile")).toBeInTheDocument();
    expect(within(section).getByText(/contre/)).toBeInTheDocument();
  });

  it("dit que l'équipe est à confirmer plutôt que de laisser un badge vide", () => {
    rendre({ rencontre: RENCONTRE_INCOMPLETE, equipe: null });

    expect(screen.getByText("Équipe à confirmer")).toBeInTheDocument();
  });
});
