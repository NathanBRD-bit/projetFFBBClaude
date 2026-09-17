import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { BaseDeDonnees } from "@/infrastructure/bdd/client";
import {
  competition,
  conflitSynchronisation,
  engagement,
  equipe,
  journalSynchronisation,
  parametre,
  poule,
  rencontre,
  saison,
  salle,
  utilisateur,
  organisme,
} from "@/infrastructure/bdd/schema";
import { URL_CONFIGURATION } from "@/infrastructure/ffbb/client";
import { CLE_PARAMETRE_JETONS } from "@/infrastructure/ffbb/jetons";
import { exigerLigne, synchroniser } from "@/infrastructure/ffbb/synchronisation";

import {
  chargerFixture,
  configurationQuiRepond,
  rencontresQuiRepondent,
  URL_RECHERCHE_RENCONTRES,
  type DocumentJson,
} from "../msw/ffbb";
import { serveurMsw } from "../msw/serveur";
import { creerBaseDeTest, type BaseDeTest } from "./aide-base";

/**
 * Moteur de synchronisation FFBB, éprouvé de bout en bout : **vrai Postgres**
 * (PGlite, mêmes migrations qu'en production), **réseau simulé** (MSW, fixtures
 * réelles capturées une fois) et **horloge figée**.
 *
 * Le document de référence est la seule rencontre réellement publiée par la FFBB
 * pour le SOCL au 16/09/2026. Tous les autres en dérivent par modification
 * explicite : un test qui valide un document inventé de toutes pièces ne prouve
 * rien du format réel.
 */

const CODE_CLUB = "PDL0049077";
const LIBELLE_SOCL = "STADE OLYMPIQUE CANDE LOIRE BASKET";
const ID_REEL = "200000014681472";

/** Instant de référence : trois jours avant la rencontre du 19/09. */
const T0 = new Date("2026-09-16T08:00:00+02:00");

const DOCUMENT_REEL = exigerLigne(
  chargerFixture("rencontres-club.json").hits as DocumentJson[],
  "la fixture rencontres-club.json",
);

/** Une variante du document réel : seuls les champs nommés changent. */
function variante(modifications: DocumentJson): DocumentJson {
  return { ...DOCUMENT_REEL, ...modifications };
}

/** Enveloppe Meilisearch autour d'une liste de documents. */
function page(documents: readonly DocumentJson[]): DocumentJson {
  return { hits: [...documents], limit: 200, offset: 0, estimatedTotalHits: documents.length };
}

/**
 * Une rencontre distincte de la rencontre réelle : la date change, donc la clé
 * naturelle et le slug aussi. Sert dès qu'un test a besoin de plusieurs
 * rencontres sans déclencher la désambiguïsation.
 */
function autreRencontre(rang: number, modifications: DocumentJson = {}): DocumentJson {
  const jour = String(rang).padStart(2, "0");
  return variante({
    id: `9000000000000${jour}`,
    date: `2026-10-${jour}`,
    date_rencontre: `2026-10-${jour}T11:30:00`,
    uniqueKey: `200000003058340_2_${String(rang)}`,
    ...modifications,
  });
}

function reseauFfbb(documents: readonly DocumentJson[]): void {
  serveurMsw.use(configurationQuiRepond(), rencontresQuiRepondent(page(documents)));
}

describe("moteur de synchronisation FFBB", () => {
  let contexte: BaseTest;

  interface BaseTest extends BaseDeTest {
    base: BaseDeDonnees;
  }

  beforeAll(async () => {
    contexte = await creerBaseDeTest();
  });

  afterAll(async () => {
    await contexte.fermer();
  });

  beforeEach(async () => {
    await contexte.client.exec(
      `truncate table conflit_synchronisation, journal_synchronisation, rencontre, engagement,
       joueur_equipe, joueur, equipe, poule, competition, salle, organisme, saison, parametre
       restart identity cascade;`,
    );
    await semerReferentiel(contexte.base);
  });

  /**
   * Le minimum que le back-office fournit : deux saisons — dont une **sans code
   * FFBB**, comme une saison créée avant l'ouverture des engagements — une équipe
   * et ses engagements. Le reste (organismes, compétition, poule, salle du match)
   * est créé à la volée par la synchronisation : c'est ce qu'on veut éprouver.
   */
  async function semerReferentiel(base: BaseDeDonnees): Promise<void> {
    const saison2627 = exigerLigne(
      await base
        .insert(saison)
        .values({
          code: "26-27",
          libelle: "Saison 2026-2027",
          codeFfbb: "26-27",
          debutLe: "2026-07-01",
          finLe: "2027-06-30",
          estCourante: true,
        })
        .returning({ id: saison.id }),
      "la saison 26-27",
    );
    const saison2526 = exigerLigne(
      await base
        .insert(saison)
        .values({
          code: "25-26",
          libelle: "Saison 2025-2026",
          codeFfbb: null,
          debutLe: "2025-07-01",
          finLe: "2026-06-30",
        })
        .returning({ id: saison.id }),
      "la saison 25-26",
    );
    const equipeU11 = exigerLigne(
      await base
        .insert(equipe)
        .values({ slug: "u11-masculins", nom: "U11 Masculins", categorie: "U11", sexe: "masculin" })
        .returning({ id: equipe.id }),
      "l'équipe U11",
    );
    const competitions = await base
      .insert(competition)
      .values([
        { saisonId: saison2627.id, codeFfbb: "ENGAGEMENT-2627", nom: "Engagement 26-27" },
        { saisonId: saison2526.id, codeFfbb: "ENGAGEMENT-2526", nom: "Engagement 25-26" },
      ])
      .returning({ id: competition.id, saisonId: competition.saisonId });

    await base.insert(engagement).values(
      competitions.map((competitionEngagement) => ({
        equipeId: equipeU11.id,
        saisonId: competitionEngagement.saisonId,
        competitionId: competitionEngagement.id,
        libellesFfbb: [LIBELLE_SOCL],
      })),
    );
  }

  function lancer(options: { readonly alerter?: () => void } = {}) {
    return synchroniser({
      base: contexte.base,
      codeClubFfbb: CODE_CLUB,
      declencheur: "github_actions",
      maintenant: () => T0,
      alerter: options.alerter ?? (() => undefined),
    });
  }

  function lireRencontres() {
    return contexte.base.select().from(rencontre).orderBy(rencontre.idFfbb);
  }

  function lireConflits() {
    return contexte.base.select().from(conflitSynchronisation);
  }

  async function lireJournal(journalId: string) {
    return exigerLigne(
      await contexte.base
        .select()
        .from(journalSynchronisation)
        .where(eq(journalSynchronisation.id, journalId)),
      "le journal de l'exécution",
    );
  }

  /* ================================================================ *
   * Premier import
   * ================================================================ */

  it("importe la rencontre réelle du club sur une base vide", async () => {
    reseauFfbb([DOCUMENT_REEL]);

    const resume = await lancer();

    expect(resume.statut).toBe("succes");
    expect(resume.compteurs).toEqual({
      nbLues: 1,
      nbCreees: 1,
      nbMisesAJour: 0,
      nbInchangees: 0,
      nbDisparues: 0,
      nbInvalides: 0,
      nbConflits: 0,
      nbNonRapprochees: 0,
    });

    const [importee] = await lireRencontres();
    expect(importee?.idFfbb).toBe(ID_REEL);
    expect(importee?.statut).toBe("a_venir");
    // Surtout pas 0 : un match à venir n'a pas de score, il n'en a pas « zéro ».
    expect(importee?.scoreDomicile).toBeNull();
    expect(importee?.scoreExterieur).toBeNull();
    expect(importee?.vuDansFfbbLe).toEqual(T0);
    expect(importee?.disparueDeFfbbLe).toBeNull();
    expect(importee?.source).toBe("ffbb");
    expect(importee?.equipeId).not.toBeNull();
  });

  it("crée à la volée les organismes, la compétition, la poule et la salle manquants", async () => {
    reseauFfbb([DOCUMENT_REEL]);

    await lancer();

    const organismes = await contexte.base.select().from(organisme);
    expect(organismes.map((ligne) => ligne.codeFfbb).sort()).toEqual(["PDL0049040", CODE_CLUB]);
    expect(organismes.find((ligne) => ligne.codeFfbb === CODE_CLUB)?.estLeClub).toBe(true);

    const competitions = await contexte.base.select().from(competition);
    expect(competitions.map((ligne) => ligne.codeFfbb)).toContain("DMU11-4");
    const [pouleCreee] = await contexte.base
      .select()
      .from(poule)
      .where(eq(poule.codeFfbb, "200000003058340"));
    expect(pouleCreee?.nom).toBe("D 4A");
    const [salleCreee] = await contexte.base.select().from(salle);
    expect(salleCreee?.ville).toBe("Chazé-sur-Argos");
    expect(salleCreee?.latitude).toBeCloseTo(47.61002);
  });

  it("réutilise le référentiel existant au lieu de le dupliquer", async () => {
    reseauFfbb([DOCUMENT_REEL, autreRencontre(1)]);

    await lancer();

    // Deux rencontres, même compétition, même poule, même salle, mêmes organismes.
    expect(await lireRencontres()).toHaveLength(2);
    expect(await contexte.base.select().from(salle)).toHaveLength(1);
    expect(await contexte.base.select().from(poule)).toHaveLength(1);
    expect(await contexte.base.select().from(organisme)).toHaveLength(2);
  });

  it("importe les rencontres dont un seul organisme, ou aucune salle, n'est publié", async () => {
    // Cas réels et fréquents : 187 documents sur 5 000 ne publient qu'un seul
    // organisme, 240 n'ont pas de salle. Les refuser ferait disparaître de vraies
    // rencontres du site.
    reseauFfbb([
      autreRencontre(1, { idOrganismeEquipe1: null }),
      autreRencontre(2, { idOrganismeEquipe2: null }),
      autreRencontre(3, { salle: null, _geo: null }),
    ]);

    const resume = await lancer();

    expect(resume.statut).toBe("succes");
    expect(resume.compteurs.nbCreees).toBe(3);
    const rencontres = await lireRencontres();
    expect(
      rencontres.map((ligne) => ligne.organismeDomicileId).filter((id) => id === null),
    ).toEqual([null]);
    expect(
      rencontres.map((ligne) => ligne.organismeExterieurId).filter((id) => id === null),
    ).toEqual([null]);
    expect(rencontres.map((ligne) => ligne.salleId).filter((id) => id === null)).toEqual([null]);
  });

  /* ================================================================ *
   * Idempotence — le test qui compte le plus
   * ================================================================ */

  it("ne crée ni ne modifie rien au réimport identique, dix fois de suite", async () => {
    reseauFfbb([DOCUMENT_REEL]);
    const premier = await lancer();
    expect(premier.compteurs.nbCreees).toBe(1);
    const apresPremier = await lireRencontres();

    for (let passage = 2; passage <= 11; passage += 1) {
      reseauFfbb([DOCUMENT_REEL]);
      const resume = await lancer();

      expect(resume.statut, `passage ${String(passage)}`).toBe("succes");
      expect(resume.compteurs.nbCreees, `créations au passage ${String(passage)}`).toBe(0);
      expect(resume.compteurs.nbMisesAJour, `mises à jour au passage ${String(passage)}`).toBe(0);
      expect(resume.compteurs.nbInchangees, `inchangées au passage ${String(passage)}`).toBe(1);
      // La preuve : la table est **strictement** identique, `maj_le` compris.
      expect(await lireRencontres(), `état de la base au passage ${String(passage)}`).toEqual(
        apresPremier,
      );
    }
  });

  /* ================================================================ *
   * Évolution des données
   * ================================================================ */

  it("met à jour le score apparu entre deux passages", async () => {
    reseauFfbb([DOCUMENT_REEL]);
    await lancer();

    reseauFfbb([variante({ joue: true, resultatEquipe1: "48", resultatEquipe2: "63" })]);
    const resume = await lancer();

    expect(resume.compteurs.nbMisesAJour).toBe(1);
    expect(resume.compteurs.nbInchangees).toBe(0);
    const [misesAJour] = await lireRencontres();
    expect(misesAJour?.statut).toBe("joue");
    expect(misesAJour?.scoreDomicile).toBe(48);
    expect(misesAJour?.scoreExterieur).toBe(63);
  });

  it("n'efface jamais le rattachement à une équipe quand le libellé disparaît", async () => {
    reseauFfbb([DOCUMENT_REEL]);
    await lancer();
    const [avant] = await lireRencontres();
    expect(avant?.equipeId).not.toBeNull();

    // Le libellé est retiré de l'engagement : la FFBB ne rattache plus rien.
    await contexte.base.update(engagement).set({ libellesFfbb: [] });
    reseauFfbb([DOCUMENT_REEL]);
    await lancer();

    const [apres] = await lireRencontres();
    expect(apres?.equipeId).toBe(avant?.equipeId);
  });

  it("compte et remonte les rencontres qu'aucun engagement ne rattache", async () => {
    await contexte.base.update(engagement).set({ libellesFfbb: [] });
    reseauFfbb([DOCUMENT_REEL]);

    const resume = await lancer();

    expect(resume.compteurs.nbNonRapprochees).toBe(1);
    expect(resume.nonRapprochees).toEqual([
      { idFfbb: ID_REEL, libelleFfbb: LIBELLE_SOCL, motif: "libelle_non_rapproche" },
    ]);
    expect((await lireJournal(resume.journalId)).nbNonRapprochees).toBe(1);
  });

  /* ================================================================ *
   * Disparitions
   * ================================================================ */

  it("archive sans la modifier une rencontre jouée disparue de l'index", async () => {
    reseauFfbb([variante({ joue: true, resultatEquipe1: "48", resultatEquipe2: "63" })]);
    await lancer();

    // L'index ne publie plus que l'autre rencontre.
    reseauFfbb([autreRencontre(1)]);
    const resume = await lancer();

    expect(resume.compteurs.nbDisparues).toBe(1);
    const [archivee] = await contexte.base
      .select()
      .from(rencontre)
      .where(eq(rencontre.idFfbb, ID_REEL));
    // Toujours là, toujours jouée, toujours avec son score : c'est ainsi qu'on
    // construit l'historique que la FFBB ne garde pas.
    expect(archivee?.statut).toBe("joue");
    expect(archivee?.scoreDomicile).toBe(48);
    expect(archivee?.disparueDeFfbbLe).toEqual(T0);
    expect(await lireConflits()).toEqual([]);
  });

  it("passe en « à confirmer » et ouvre un conflit pour une rencontre à venir disparue", async () => {
    reseauFfbb([DOCUMENT_REEL]);
    await lancer();

    reseauFfbb([autreRencontre(1)]);
    const resume = await lancer();

    expect(resume.compteurs.nbDisparues).toBe(1);
    expect(resume.compteurs.nbConflits).toBe(1);
    const [aConfirmer] = await contexte.base
      .select()
      .from(rencontre)
      .where(eq(rencontre.idFfbb, ID_REEL));
    expect(aConfirmer?.statut).toBe("a_confirmer");
    expect(aConfirmer?.disparueDeFfbbLe).toEqual(T0);

    const conflits = await lireConflits();
    expect(conflits).toHaveLength(1);
    expect(conflits[0]?.champ).toBe("statut");
    expect(conflits[0]?.valeurLocale).toBe("a_venir");
    // `null` : la FFBB ne publie plus rien du tout sur cette rencontre.
    expect(conflits[0]?.valeurFfbb).toBeNull();
  });

  it("respecte un statut verrouillé quand la rencontre à venir disparaît", async () => {
    reseauFfbb([DOCUMENT_REEL]);
    await lancer();
    await contexte.base
      .update(rencontre)
      .set({ statut: "reporte", champsVerrouilles: ["statut"] })
      .where(eq(rencontre.idFfbb, ID_REEL));

    reseauFfbb([autreRencontre(1)]);
    const resume = await lancer();

    const [conservee] = await contexte.base
      .select()
      .from(rencontre)
      .where(eq(rencontre.idFfbb, ID_REEL));
    // La décision humaine tient ; la disparition est signalée, pas imposée.
    expect(conservee?.statut).toBe("reporte");
    expect(conservee?.disparueDeFfbbLe).toEqual(T0);
    expect(resume.compteurs.nbConflits).toBe(1);
  });

  it("efface la marque de disparition quand la rencontre réapparaît dans l'index", async () => {
    const jouee = variante({ joue: true, resultatEquipe1: "48", resultatEquipe2: "63" });
    reseauFfbb([jouee]);
    await lancer();
    reseauFfbb([autreRencontre(1)]);
    await lancer();

    reseauFfbb([jouee, autreRencontre(1)]);
    const resume = await lancer();

    const [revenue] = await contexte.base
      .select()
      .from(rencontre)
      .where(eq(rencontre.idFfbb, ID_REEL));
    expect(revenue?.disparueDeFfbbLe).toBeNull();
    expect(resume.compteurs.nbDisparues).toBe(0);
  });

  it("ne touche pas aux rencontres d'une saison absente de l'index", async () => {
    reseauFfbb([DOCUMENT_REEL]);
    await lancer();
    // La rencontre est rattachée de force à la saison 25-26, que l'index ne porte
    // pas : comparer les deux archiverait tout l'historique d'un coup.
    const [ancienne] = await contexte.base
      .select({ id: saison.id })
      .from(saison)
      .where(eq(saison.code, "25-26"));
    const [competitionAncienne] = await contexte.base
      .select({ id: competition.id })
      .from(competition)
      .where(eq(competition.codeFfbb, "ENGAGEMENT-2526"));
    await contexte.base
      .update(rencontre)
      .set({
        saisonId: ancienne?.id,
        competitionId: competitionAncienne?.id,
        pouleId: null,
        idFfbb: "autre-saison",
      })
      .where(eq(rencontre.idFfbb, ID_REEL));

    reseauFfbb([autreRencontre(1)]);
    const resume = await lancer();

    expect(resume.compteurs.nbDisparues).toBe(0);
    const [intacte] = await contexte.base
      .select()
      .from(rencontre)
      .where(eq(rencontre.idFfbb, "autre-saison"));
    expect(intacte?.disparueDeFfbbLe).toBeNull();
  });

  /* ================================================================ *
   * Garde-fou anti-effacement de masse
   * ================================================================ */

  it("échoue et ne touche à rien quand l'index revient vide sur une base peuplée", async () => {
    reseauFfbb([DOCUMENT_REEL, autreRencontre(1)]);
    await lancer();
    const avant = await lireRencontres();
    const conflitsAvant = await lireConflits();
    expect(avant).toHaveLength(2);

    serveurMsw.use(
      configurationQuiRepond(),
      rencontresQuiRepondent(chargerFixture("rencontres-vide.json")),
    );
    const resume = await lancer();

    expect(resume.statut).toBe("echec");
    expect(resume.compteurs.nbLues).toBe(0);
    expect(resume.messageErreur).toMatch(/2 rencontre\(s\) encore publiée\(s\)/);
    // La preuve : la table est **octet pour octet** celle d'avant — aucune
    // disparition, aucun horodatage touché, aucun statut modifié.
    expect(await lireRencontres()).toEqual(avant);
    expect(await lireConflits()).toEqual(conflitsAvant);
    expect(resume.compteurs.nbDisparues).toBe(0);
    expect((await lireJournal(resume.journalId)).statut).toBe("echec");
  });

  it("accepte un index vide tant que la base ne connaît aucune rencontre", async () => {
    serveurMsw.use(
      configurationQuiRepond(),
      rencontresQuiRepondent(chargerFixture("rencontres-vide.json")),
    );

    const resume = await lancer();

    expect(resume.statut).toBe("succes");
    expect(resume.compteurs.nbLues).toBe(0);
    expect(resume.compteurs.nbDisparues).toBe(0);
    expect(await lireRencontres()).toEqual([]);
  });

  /* ================================================================ *
   * Documents invalides
   * ================================================================ */

  it("échoue sans rien écrire quand 30 % des documents sont invalides", async () => {
    const valides = Array.from({ length: 7 }, (_, rang) => autreRencontre(rang + 1));
    const invalides = Array.from({ length: 3 }, (_, rang) =>
      autreRencontre(rang + 20, { resultatEquipe1: "F" }),
    );
    reseauFfbb([...valides, ...invalides]);

    const resume = await lancer();

    expect(resume.statut).toBe("echec");
    expect(resume.compteurs.nbLues).toBe(0);
    expect(resume.messageErreur).toMatch(/3 document\(s\) écarté\(s\) sur 10 lu\(s\)/);
    expect(resume.messageErreur).toMatch(/resultatEquipe1/);
    expect(resume.ecartes).toHaveLength(3);
    expect(await lireRencontres()).toEqual([]);
  });

  it("écarte un document sans aucun organisme et importe quand même le lot", async () => {
    // 1 écarté sur 21 lus : sous le seuil des 5 %, la transaction du lot passe.
    const valides = Array.from({ length: 20 }, (_, rang) => autreRencontre(rang + 1));
    const sansOrganisme = autreRencontre(30, {
      idOrganismeEquipe1: null,
      idOrganismeEquipe2: null,
    });
    reseauFfbb([...valides, sansOrganisme]);

    const resume = await lancer();

    expect(resume.statut).toBe("partiel");
    expect(resume.compteurs.nbLues).toBe(21);
    expect(resume.compteurs.nbCreees).toBe(20);
    expect(resume.compteurs.nbInvalides).toBe(1);
    expect(resume.ecartes[0]?.motif).toMatch(/aucun organisme FFBB des deux côtés/);
    expect(await lireRencontres()).toHaveLength(20);
    expect((await lireJournal(resume.journalId)).nbInvalides).toBe(1);
  });

  it("nomme « identifiant illisible » un document dont l'id lui-même est refusé", async () => {
    reseauFfbb([variante({ id: 42 })]);

    const resume = await lancer();

    expect(resume.statut).toBe("echec");
    expect(resume.ecartes).toEqual([
      { idFfbb: null, motif: expect.stringContaining("refusé par le schéma FFBB") as string },
    ]);
    expect(resume.messageErreur).toMatch(/Document \(identifiant illisible\)/);
  });

  it("écarte un document dont la saison FFBB n'existe pas en base", async () => {
    reseauFfbb([variante({ saison: { code: "27-28" } })]);

    const resume = await lancer();

    expect(resume.statut).toBe("echec");
    expect(resume.messageErreur).toMatch(/aucune saison en base ne porte le code FFBB « 27-28 »/);
    expect(await lireRencontres()).toEqual([]);
  });

  it("écarte un document que la normalisation refuse de dater", async () => {
    reseauFfbb([variante({ date_rencontre: "2026-06-31T20:30:00" })]);

    const resume = await lancer();

    expect(resume.statut).toBe("echec");
    expect(resume.messageErreur).toMatch(/n'est pas une date valide/);
  });

  it("écarte un document dont le verrou nomme une colonne inexistante", async () => {
    reseauFfbb([DOCUMENT_REEL]);
    await lancer();
    await contexte.base
      .update(rencontre)
      .set({ champsVerrouilles: ["score_domicile"] })
      .where(eq(rencontre.idFfbb, ID_REEL));

    reseauFfbb([DOCUMENT_REEL]);
    const resume = await lancer();

    expect(resume.statut).toBe("echec");
    expect(resume.messageErreur).toMatch(/n'est pas une colonne alimentée par la FFBB/);
  });

  it.each([
    ["sa saison", { cible: "saison" }],
    ["sa compétition", { cible: "competition" }],
    ["sa poule", { cible: "poule" }],
  ])("écarte une rencontre en base dont %s n'a pas de code FFBB", async (_libelle, { cible }) => {
    reseauFfbb([DOCUMENT_REEL]);
    await lancer();

    if (cible === "saison") {
      // La rencontre est rattachée à la saison 25-26, qui n'a pas de code FFBB,
      // alors que le document en annonce une autre : son état en base n'est plus
      // comparable.
      const ancienne = exigerLigne(
        await contexte.base.select({ id: saison.id }).from(saison).where(eq(saison.code, "25-26")),
        "la saison 25-26",
      );
      const competitionAncienne = exigerLigne(
        await contexte.base
          .select({ id: competition.id })
          .from(competition)
          .where(eq(competition.codeFfbb, "ENGAGEMENT-2526")),
        "la compétition d'engagement 25-26",
      );
      await contexte.base
        .update(rencontre)
        .set({ saisonId: ancienne.id, competitionId: competitionAncienne.id, pouleId: null })
        .where(eq(rencontre.idFfbb, ID_REEL));
    } else if (cible === "competition") {
      await contexte.base
        .update(competition)
        .set({ codeFfbb: null })
        .where(eq(competition.codeFfbb, "DMU11-4"));
    } else {
      await contexte.base.update(poule).set({ codeFfbb: null });
    }

    reseauFfbb([DOCUMENT_REEL]);
    const resume = await lancer();

    expect(resume.statut).toBe("echec");
    expect(resume.messageErreur).toMatch(/ne porte pas les codes FFBB de sa saison/);
  });

  /* ================================================================ *
   * Désambiguïsation
   * ================================================================ */

  it("désambiguïse la clé naturelle et le slug de deux rencontres identiques", async () => {
    const jumelle = variante({ id: "200000014681473", uniqueKey: "200000003058340_1_4" });
    reseauFfbb([DOCUMENT_REEL, jumelle]);

    const resume = await lancer();

    expect(resume.compteurs.nbCreees).toBe(2);
    const rencontres = await lireRencontres();
    const premiere = rencontres.find((ligne) => ligne.idFfbb === ID_REEL);
    const seconde = rencontres.find((ligne) => ligne.idFfbb === "200000014681473");
    expect(seconde?.cleNaturelle).toBe(`${premiere?.cleNaturelle ?? ""}|200000014681473`);
    expect(seconde?.slug).toBe(`${premiere?.slug ?? ""}-200000014681473`);

    // Une renumérotation FFBB est indiscernable d'un aller-retour : on le signale.
    const conflits = await lireConflits();
    expect(conflits).toHaveLength(1);
    expect(conflits[0]?.champ).toBe("idFfbb");
    expect(conflits[0]?.valeurFfbb).toBe("200000014681473");
  });

  it("ne contredit pas au passage suivant la clé naturelle désambiguïsée", async () => {
    const jumelle = variante({ id: "200000014681473", uniqueKey: "200000003058340_1_4" });
    reseauFfbb([DOCUMENT_REEL, jumelle]);
    await lancer();
    const avant = await lireRencontres();

    reseauFfbb([DOCUMENT_REEL, jumelle]);
    const resume = await lancer();

    expect(resume.compteurs.nbCreees).toBe(0);
    expect(resume.compteurs.nbMisesAJour).toBe(0);
    expect(resume.compteurs.nbInchangees).toBe(2);
    expect(await lireRencontres()).toEqual(avant);
  });

  /* ================================================================ *
   * Conflits
   * ================================================================ */

  it("n'ouvre pas deux fois le même conflit resté ouvert", async () => {
    reseauFfbb([variante({ joue: true, resultatEquipe1: "48", resultatEquipe2: "63" })]);
    await lancer();
    // Le score est corrigé à la main puis verrouillé : la FFBB ne doit plus
    // l'écraser, seulement signaler la divergence.
    await contexte.base
      .update(rencontre)
      .set({ scoreDomicile: 50, champsVerrouilles: ["scoreDomicile"] })
      .where(eq(rencontre.idFfbb, ID_REEL));

    reseauFfbb([variante({ joue: true, resultatEquipe1: "48", resultatEquipe2: "63" })]);
    const premier = await lancer();
    reseauFfbb([variante({ joue: true, resultatEquipe1: "48", resultatEquipe2: "63" })]);
    const second = await lancer();

    expect(premier.compteurs.nbConflits).toBe(1);
    // Re-détecté — c'est voulu — mais pas redoublé en base.
    expect(second.compteurs.nbConflits).toBe(0);
    const conflits = await lireConflits();
    expect(conflits).toHaveLength(1);
    expect(conflits[0]?.champ).toBe("scoreDomicile");
    expect(conflits[0]?.valeurLocale).toBe("50");
    expect(conflits[0]?.valeurFfbb).toBe("48");
    // Et surtout : la saisie manuelle n'a pas été écrasée.
    const [protegee] = await lireRencontres();
    expect(protegee?.scoreDomicile).toBe(50);
  });

  it("décrit dans le conflit aussi bien une date qu'une valeur absente", async () => {
    reseauFfbb([DOCUMENT_REEL]);
    await lancer();
    // La date a été corrigée à la main, et le score est protégé d'avance : les
    // deux colonnes sont verrouillées, la FFBB ne doit plus les écraser.
    await contexte.base
      .update(rencontre)
      .set({
        dateHeure: new Date("2026-09-20T15:00:00+02:00"),
        champsVerrouilles: ["dateHeure", "scoreDomicile"],
      })
      .where(eq(rencontre.idFfbb, ID_REEL));

    reseauFfbb([variante({ joue: true, resultatEquipe1: "48", resultatEquipe2: "63" })]);
    const resume = await lancer();

    const conflits = await lireConflits();
    const parChamp = new Map(conflits.map((conflit) => [conflit.champ, conflit]));
    expect(parChamp.get("dateHeure")?.valeurLocale).toBe("2026-09-20T13:00:00.000Z");
    expect(parChamp.get("dateHeure")?.valeurFfbb).toBe("2026-09-19T09:30:00.000Z");
    // `null` local : la rencontre n'avait pas de score, elle n'en avait pas « zéro ».
    expect(parChamp.get("scoreDomicile")?.valeurLocale).toBeNull();
    expect(parChamp.get("scoreDomicile")?.valeurFfbb).toBe("48");
    expect(resume.compteurs.nbConflits).toBe(conflits.length);
    // Rien n'a été écrit sur les colonnes protégées.
    const [protegee] = await lireRencontres();
    expect(protegee?.scoreDomicile).toBeNull();
    expect(protegee?.dateHeure).toEqual(new Date("2026-09-20T15:00:00+02:00"));
  });

  it("n'ouvre qu'un seul conflit de renumérotation pour trois rencontres de même clé", async () => {
    reseauFfbb([
      DOCUMENT_REEL,
      variante({ id: "200000014681473", uniqueKey: "200000003058340_1_4" }),
      variante({ id: "200000014681474", uniqueKey: "200000003058340_1_5" }),
    ]);

    const resume = await lancer();

    expect(resume.compteurs.nbCreees).toBe(3);
    // Les deux collisions portent sur la même rencontre et le même champ :
    // l'index unique partiel n'en garde qu'une.
    expect(resume.compteurs.nbConflits).toBe(1);
    expect(await lireConflits()).toHaveLength(1);
  });

  it("ne redouble pas le conflit d'une rencontre qui disparaît deux fois", async () => {
    reseauFfbb([DOCUMENT_REEL, autreRencontre(1)]);
    await lancer();
    reseauFfbb([autreRencontre(1)]);
    await lancer();
    // Elle réapparaît : la marque de disparition tombe, le statut revient.
    reseauFfbb([DOCUMENT_REEL, autreRencontre(1)]);
    await lancer();

    reseauFfbb([autreRencontre(1)]);
    const resume = await lancer();

    expect(resume.compteurs.nbDisparues).toBe(1);
    expect(resume.compteurs.nbConflits).toBe(0);
    expect(await lireConflits()).toHaveLength(1);
  });

  /* ================================================================ *
   * Cache de jetons
   * ================================================================ */

  it("répare un cache de jetons illisible et le trace au journal", async () => {
    await contexte.base.insert(parametre).values({
      cle: CLE_PARAMETRE_JETONS,
      valeur: "{ceci n'est pas du JSON",
      expireLe: new Date(T0.getTime() + 3_600_000),
    });
    reseauFfbb([DOCUMENT_REEL]);

    const resume = await lancer();

    // Réparé : la rencontre est bien importée malgré le cache abîmé.
    expect(resume.compteurs.nbCreees).toBe(1);
    // Tracé : l'incident ne disparaît pas dans un log.
    expect(resume.statut).toBe("partiel");
    expect(resume.incidents).toHaveLength(1);
    expect(resume.messageErreur).toMatch(/Cache des jetons FFBB illisible/);
    expect((await lireJournal(resume.journalId)).messageErreur).toMatch(/Incident réparé/);
  });

  /* ================================================================ *
   * Amont injoignable
   * ================================================================ */

  it("échoue sans rien écrire quand les jetons sont injoignables", async () => {
    serveurMsw.use(
      http.get(URL_CONFIGURATION, () => new HttpResponse("panne", { status: 500 })),
      rencontresQuiRepondent(page([DOCUMENT_REEL])),
    );

    const resume = await lancer();

    expect(resume.statut).toBe("echec");
    expect(resume.messageErreur).toMatch(/Jetons FFBB indisponibles/);
    expect(await lireRencontres()).toEqual([]);
    expect((await lireJournal(resume.journalId)).statut).toBe("echec");
  });

  it("échoue sans rien écrire quand l'index est injoignable", async () => {
    serveurMsw.use(
      configurationQuiRepond(),
      http.post(URL_RECHERCHE_RENCONTRES, () => new HttpResponse("panne", { status: 502 })),
    );

    const resume = await lancer();

    expect(resume.statut).toBe("echec");
    expect(resume.messageErreur).toMatch(/Recherche FFBB refusée/);
    expect(await lireRencontres()).toEqual([]);
  });

  it("annule toute la transaction quand une écriture est refusée par la base", async () => {
    // Deux rencontres du même lot dont l'une viole `rencontre_equipes_distinctes` :
    // même organisme et même libellé des deux côtés.
    reseauFfbb([
      autreRencontre(1),
      autreRencontre(2, {
        nomEquipe1: LIBELLE_SOCL,
        nomEquipe2: LIBELLE_SOCL,
        idOrganismeEquipe1: DOCUMENT_REEL.idOrganismeEquipe2,
        idOrganismeEquipe2: DOCUMENT_REEL.idOrganismeEquipe2,
      }),
    ]);

    const resume = await lancer();

    expect(resume.statut).toBe("echec");
    expect(resume.messageErreur).toMatch(/rencontre_equipes_distinctes/);
    // Tout ou rien : la rencontre valide du même lot n'est pas écrite non plus.
    expect(await lireRencontres()).toEqual([]);
  });

  /* ================================================================ *
   * Journal et alerte
   * ================================================================ */

  it("renseigne le journal de bout en bout", async () => {
    reseauFfbb([DOCUMENT_REEL]);

    const resume = await lancer();
    const ligne = await lireJournal(resume.journalId);

    expect(ligne.declencheur).toBe("github_actions");
    expect(ligne.statut).toBe("succes");
    expect(ligne.demarreeLe).toEqual(T0);
    expect(ligne.termineeLe).toEqual(T0);
    expect(ligne.dureeMs).toBe(0);
    expect(ligne.nbLues).toBe(1);
    expect(ligne.nbCreees).toBe(1);
    expect(ligne.nbConflits).toBe(0);
    expect(ligne.messageErreur).toBeNull();
    expect(ligne.declencheeParId).toBeNull();
  });

  it("alerte dès que l'exécution n'est pas un succès, et jamais sinon", async () => {
    const alertes: string[] = [];
    reseauFfbb([DOCUMENT_REEL]);
    await lancer({ alerter: () => alertes.push("succes") });
    expect(alertes).toEqual([]);

    serveurMsw.use(
      configurationQuiRepond(),
      rencontresQuiRepondent(page([variante({ resultatEquipe1: "F" })])),
    );
    await lancer({ alerter: () => alertes.push("echec") });

    expect(alertes).toEqual(["echec"]);
  });

  it("prévient sur la sortie d'erreur quand aucune alerte n'est branchée", async () => {
    const journalConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);
    serveurMsw.use(
      configurationQuiRepond(),
      rencontresQuiRepondent(page([variante({ resultatEquipe1: "F" })])),
    );

    // Ni horloge ni alerte injectées : ce sont les valeurs par défaut qu'on éprouve.
    const resume = await synchroniser({
      base: contexte.base,
      codeClubFfbb: CODE_CLUB,
      declencheur: "cron_vercel",
    });

    expect(resume.statut).toBe("echec");
    expect(journalConsole).toHaveBeenCalledWith(
      "[synchronisation FFBB] exécution non réussie",
      expect.objectContaining({ statut: "echec" }),
    );
    // Horloge réelle : la durée est mesurée, pas supposée.
    expect(resume.dureeMs).toBeGreaterThanOrEqual(0);
    journalConsole.mockRestore();
  });

  it("garde la trace de la personne qui a déclenché la synchronisation", async () => {
    const utilisateurAdmin = exigerLigne(
      await contexte.base
        .insert(utilisateur)
        .values({
          email: "admin@socl.test",
          nomAffiche: "Admin",
          motDePasseHash: "hache-factice",
          role: "administrateur",
        })
        .returning({ id: utilisateur.id }),
      "l'utilisateur administrateur",
    );
    reseauFfbb([DOCUMENT_REEL]);

    const resume = await synchroniser({
      base: contexte.base,
      codeClubFfbb: CODE_CLUB,
      declencheur: "manuel",
      declencheeParId: utilisateurAdmin.id,
      maintenant: () => T0,
      alerter: () => undefined,
    });

    const ligne = await lireJournal(resume.journalId);
    expect(ligne.declencheur).toBe("manuel");
    expect(ligne.declencheeParId).toBe(utilisateurAdmin.id);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
