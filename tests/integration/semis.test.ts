import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { IDENTIFIANTS_SEMIS, semer } from "../../scripts/semer";
import { article, rencontre, saison, statistiqueJoueur, equipe } from "@/infrastructure/bdd/schema";

import { creerBaseDeTest, type BaseDeTest } from "./aide-base";

/**
 * Le script de peuplement doit passer, et **passer deux fois de suite** en laissant la
 * base strictement dans le même état. C'est la même propriété que celle exigée du
 * moteur de synchronisation : rejouer ne doit rien créer, rien dupliquer, rien casser.
 */
describe("script de peuplement", () => {
  let contexte: BaseDeTest;

  beforeAll(async () => {
    contexte = await creerBaseDeTest();
  });

  afterAll(async () => {
    await contexte.fermer();
  });

  /** Empreinte complète de la base : toutes les lignes, dans un ordre déterministe. */
  async function photographierLaBase(): Promise<string> {
    const tables = [
      "saison",
      "organisme",
      "salle",
      "competition",
      "poule",
      "equipe",
      "engagement",
      "utilisateur",
      "parametre",
      "joueur",
      "joueur_equipe",
      "rencontre",
      "statistique_joueur",
      "categorie_article",
      "article",
      "journal_synchronisation",
      "conflit_synchronisation",
    ];
    const morceaux: string[] = [];
    for (const table of tables) {
      const resultat = await contexte.client.query(`select * from "${table}" order by id::text`);
      morceaux.push(`${table}: ${JSON.stringify(resultat.rows)}`);
    }
    return morceaux.join("\n");
  }

  it("écrit le jeu de démonstration attendu au premier passage", async () => {
    const resume = await semer(contexte.base);

    expect(resume).toEqual({
      saisons: 2,
      organismes: 6,
      salles: 3,
      competitions: 5,
      poules: 5,
      equipes: 7,
      engagements: 5,
      joueurs: 6,
      utilisateurs: 2,
      rencontres: 11,
      statistiques: 5,
      articles: 3,
    });
  });

  it("crée les 7 équipes réelles du club, dans l'ordre d'affichage voulu", async () => {
    const equipes = await contexte.base
      .select({ slug: equipe.slug, ordre: equipe.ordre })
      .from(equipe)
      .orderBy(asc(equipe.ordre));

    expect(equipes.map((e) => e.slug)).toEqual([
      "u9-mixte",
      "u11-masculins",
      "u13-masculins",
      "u15-masculins",
      "u17-feminines",
      "seniors-masculins",
      "veterans-loisirs",
    ]);
  });

  it("ne déclare qu'une seule saison courante", async () => {
    const saisons = await contexte.base
      .select({ code: saison.code, estCourante: saison.estCourante })
      .from(saison);

    expect(saisons.filter((s) => s.estCourante).map((s) => s.code)).toEqual(["26-27"]);
  });

  it("laisse les scores à null pour un match à venir, et jamais à zéro", async () => {
    const lignes = await contexte.base
      .select({
        statut: rencontre.statut,
        scoreDomicile: rencontre.scoreDomicile,
        scoreExterieur: rencontre.scoreExterieur,
      })
      .from(rencontre);

    const aVenir = lignes.filter((l) => l.statut === "a_venir");
    expect(aVenir.length).toBeGreaterThan(0);
    for (const ligne of aVenir) {
      expect(ligne.scoreDomicile).toBeNull();
      expect(ligne.scoreExterieur).toBeNull();
    }
  });

  it("garde un match passé sans score remonté en `a_confirmer`, scores nuls", async () => {
    const [ligne] = await contexte.base
      .select({
        statut: rencontre.statut,
        scoreDomicile: rencontre.scoreDomicile,
        scoreExterieur: rencontre.scoreExterieur,
      })
      .from(rencontre)
      .where(eq(rencontre.id, IDENTIFIANTS_SEMIS.rencontreSansScoreRemonte));

    expect(ligne).toEqual({ statut: "a_confirmer", scoreDomicile: null, scoreExterieur: null });
  });

  it("enregistre le forfait avec le score réglementaire 20-0", async () => {
    const [ligne] = await contexte.base
      .select({
        statut: rencontre.statut,
        scoreDomicile: rencontre.scoreDomicile,
        scoreExterieur: rencontre.scoreExterieur,
        forfaitExterieur: rencontre.forfaitExterieur,
      })
      .from(rencontre)
      .where(eq(rencontre.id, IDENTIFIANTS_SEMIS.rencontreForfait));

    expect(ligne).toEqual({
      statut: "forfait",
      scoreDomicile: 20,
      scoreExterieur: 0,
      forfaitExterieur: true,
    });
  });

  it("distingue zéro point marqué d'une saisie absente", async () => {
    const lignes = await contexte.base
      .select({ aJoue: statistiqueJoueur.aJoue, points: statistiqueJoueur.points })
      .from(statistiqueJoueur);

    // La nuance qui justifie la colonne nullable : `0` existe, `null` aussi, et
    // l'affichage public écrit « — » pour le second, jamais « 0 ».
    expect(lignes.filter((l) => l.points === 0)).toHaveLength(1);
    expect(lignes.filter((l) => l.points === null)).toHaveLength(2);
  });

  it("laisse l'article brouillon sans date de publication", async () => {
    const lignes = await contexte.base
      .select({ statut: article.statut, publieLe: article.publieLe })
      .from(article);

    const brouillons = lignes.filter((l) => l.statut === "brouillon");
    expect(brouillons).toHaveLength(1);
    expect(brouillons[0]?.publieLe).toBeNull();
  });

  it("laisse la base strictement identique quand on le relance", async () => {
    const avant = await photographierLaBase();

    await semer(contexte.base);

    const apres = await photographierLaBase();
    expect(apres).toBe(avant);
  });

  it("ne duplique aucune rencontre au second passage", async () => {
    await semer(contexte.base);

    const resultat = await contexte.client.query<{ nb: number }>(
      "select count(*)::int as nb from rencontre",
    );
    expect(resultat.rows[0]?.nb).toBe(11);
  });
});
