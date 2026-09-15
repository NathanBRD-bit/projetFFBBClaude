import { and, asc, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { IDENTIFIANTS_SEMIS, semer } from "../../scripts/semer";
import {
  article,
  equipe,
  organisme,
  rencontre,
  saison,
  salle,
  statistiqueJoueur,
  joueur,
} from "@/infrastructure/bdd/schema";

import { creerBaseDeTest, type BaseDeTest } from "./aide-base";

/**
 * Les requêtes que le site fera réellement : prochaines rencontres d'une équipe,
 * résultats d'une saison, actualités publiées, meilleurs marqueurs d'un match. Elles
 * valident les jointures et l'existence des index qui les portent.
 */
describe("requêtes de lecture", () => {
  let contexte: BaseDeTest;
  /** Horloge figée : sans elle, « à venir » changerait de sens avec le temps. */
  const maintenant = new Date("2026-09-15T12:00:00+02:00");

  beforeAll(async () => {
    contexte = await creerBaseDeTest();
    await semer(contexte.base);
  });

  afterAll(async () => {
    await contexte.fermer();
  });

  it("liste les prochaines rencontres d'une équipe, de la plus proche à la plus lointaine", async () => {
    const prochaines = await contexte.base
      .select({
        slug: rencontre.slug,
        dateHeure: rencontre.dateHeure,
        statut: rencontre.statut,
        salle: salle.nom,
      })
      .from(rencontre)
      .leftJoin(salle, eq(salle.id, rencontre.salleId))
      .where(
        and(
          eq(rencontre.equipeId, IDENTIFIANTS_SEMIS.equipeU11),
          gte(rencontre.dateHeure, maintenant),
          inArray(rencontre.statut, ["a_venir", "a_confirmer"]),
        ),
      )
      .orderBy(asc(rencontre.dateHeure));

    expect(prochaines.map((r) => r.slug)).toEqual([
      "2026-09-19-chaze-sur-argos-cande-u11m",
      "2026-10-03-cande-segre-u11m",
    ]);
    expect(prochaines[0]?.salle).toBe("Salle des Sports");
  });

  it("utilise l'index (equipe_id, date_heure) pour les prochaines rencontres", async () => {
    // `enable_seqscan = off` force le planificateur à révéler s'il *peut* utiliser
    // l'index : sur onze lignes il choisirait sinon toujours le parcours séquentiel.
    await contexte.client.exec("set enable_seqscan = off");
    const plan = await contexte.client.query<{ "QUERY PLAN": string }>(
      `explain select id from rencontre
         where equipe_id = '${IDENTIFIANTS_SEMIS.equipeU11}'
         order by date_heure desc`,
    );
    await contexte.client.exec("set enable_seqscan = on");

    const texte = plan.rows.map((ligne) => ligne["QUERY PLAN"]).join("\n");
    expect(texte).toContain("rencontre_equipe_date_idx");
  });

  it("liste les résultats d'une saison, du plus récent au plus ancien", async () => {
    const resultats = await contexte.base
      .select({
        slug: rencontre.slug,
        scoreDomicile: rencontre.scoreDomicile,
        scoreExterieur: rencontre.scoreExterieur,
      })
      .from(rencontre)
      .innerJoin(saison, eq(saison.id, rencontre.saisonId))
      .where(and(eq(saison.code, "25-26"), isNotNull(rencontre.scoreDomicile)))
      .orderBy(desc(rencontre.dateHeure));

    expect(resultats).toEqual([
      { slug: "2026-01-17-cande-vern-sm", scoreDomicile: 20, scoreExterieur: 0 },
      { slug: "2025-12-06-segre-cande-u11m", scoreDomicile: 61, scoreExterieur: 44 },
      { slug: "2025-11-15-cande-chaze-u11m", scoreDomicile: 58, scoreExterieur: 42 },
    ]);
  });

  it("n'inclut pas les matchs sans score dans les résultats d'une saison", async () => {
    const sansScore = await contexte.base
      .select({ slug: rencontre.slug, statut: rencontre.statut })
      .from(rencontre)
      .innerJoin(saison, eq(saison.id, rencontre.saisonId))
      .where(and(eq(saison.code, "25-26"), eq(rencontre.statut, "a_confirmer")));

    // Le match du 07/02 est passé mais son score n'est jamais remonté : il ne doit
    // apparaître ni comme résultat, ni comme 0-0.
    expect(sansScore.map((r) => r.slug)).toEqual(["2026-02-07-cande-le-lion-dangers-u11m"]);
  });

  it("restitue le nom des deux clubs d'une rencontre par double jointure", async () => {
    const organismeDomicile = alias(organisme, "organisme_domicile");
    const organismeExterieur = alias(organisme, "organisme_exterieur");

    const [ligne] = await contexte.base
      .select({
        domicile: organismeDomicile.nomCourt,
        exterieur: organismeExterieur.nomCourt,
        equipe: equipe.nom,
      })
      .from(rencontre)
      .innerJoin(organismeDomicile, eq(organismeDomicile.id, rencontre.organismeDomicileId))
      .innerJoin(organismeExterieur, eq(organismeExterieur.id, rencontre.organismeExterieurId))
      .leftJoin(equipe, eq(equipe.id, rencontre.equipeId))
      .where(eq(rencontre.id, IDENTIFIANTS_SEMIS.rencontreJouee));

    expect(ligne).toEqual({ domicile: "SOCL", exterieur: "BC Chazé", equipe: "U11 Masculins" });
  });

  it("ne remonte que les articles publiés, du plus récent au plus ancien", async () => {
    const publies = await contexte.base
      .select({ slug: article.slug })
      .from(article)
      .where(eq(article.statut, "publie"))
      .orderBy(desc(article.publieLe));

    expect(publies.map((a) => a.slug)).toEqual([
      "reprise-des-entrainements-2026-2027",
      "victoire-des-u11-contre-chaze",
    ]);
  });

  it("classe les marqueurs d'un match sans confondre zéro point et saisie absente", async () => {
    const lignes = await contexte.base
      .select({ nom: joueur.nomAffiche, points: statistiqueJoueur.points })
      .from(statistiqueJoueur)
      .innerJoin(joueur, eq(joueur.id, statistiqueJoueur.joueurId))
      .where(
        and(
          eq(statistiqueJoueur.rencontreId, IDENTIFIANTS_SEMIS.rencontreJouee),
          eq(statistiqueJoueur.aJoue, true),
          isNotNull(statistiqueJoueur.points),
        ),
      )
      .orderBy(desc(statistiqueJoueur.points));

    expect(lignes).toEqual([
      { nom: "Léo M.", points: 14 },
      { nom: "Timéo B.", points: 8 },
      { nom: "Noah R.", points: 0 },
    ]);
  });
});
