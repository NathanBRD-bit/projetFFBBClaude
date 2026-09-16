import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { URL_CONFIGURATION } from "@/infrastructure/ffbb/client";
import {
  CLE_PARAMETRE_JETONS,
  creerFournisseurDeJetons,
  DUREE_CACHE_JETONS_MS,
  ErreurCacheJetons,
} from "@/infrastructure/ffbb/jetons";
import { parametre } from "@/infrastructure/bdd/schema";

import { configurationExigeantUnNavigateur, reponse5xx, sequence } from "../msw/ffbb";
import { serveurMsw } from "../msw/serveur";
import { creerBaseDeTest, type BaseDeTest } from "./aide-base";

/**
 * Cache des jetons FFBB, éprouvé sur un **vrai Postgres** (PGlite) et un réseau
 * simulé (MSW). Les deux moitiés du mécanisme sont ici : la table `parametre`
 * avec son `expire_le`, et l'appel HTTP qu'elle doit éviter.
 *
 * L'horloge est injectée et figée : c'est le seul moyen de prouver un TTL de 6 h
 * sans attendre 6 h, et sans `sleep` (.claude/rules/tests.md).
 */
describe("cache des jetons FFBB", () => {
  let contexte: BaseDeTest;

  /** Instant de référence, déplaçable test par test. */
  const T0 = new Date("2026-09-15T08:00:00+02:00");

  beforeAll(async () => {
    contexte = await creerBaseDeTest();
  });

  afterEach(async () => {
    await contexte.base.delete(parametre);
  });

  afterAll(async () => {
    await contexte.fermer();
  });

  function lireLigne() {
    return contexte.base
      .select()
      .from(parametre)
      .where(eq(parametre.cle, CLE_PARAMETRE_JETONS))
      .limit(1);
  }

  it("interroge la FFBB au premier appel et range les jetons avec leur échéance", async () => {
    serveurMsw.use(configurationExigeantUnNavigateur());
    const fournisseur = creerFournisseurDeJetons({ base: contexte.base, maintenant: () => T0 });

    const jetons = await fournisseur.obtenir();

    expect(jetons.key_ms).toBe("jeton-meilisearch-factice-pour-les-tests");
    const [ligne] = await lireLigne();
    expect(ligne?.expireLe).toEqual(new Date(T0.getTime() + DUREE_CACHE_JETONS_MS));
    expect(ligne?.valeur).toContain("jeton-meilisearch-factice-pour-les-tests");
  });

  it("sert le cache au second appel, sans aucune requête réseau", async () => {
    // Le handler n'est déclaré que pour le premier appel : s'il en partait un
    // second, `onUnhandledRequest: "error"` ferait échouer le test. C'est la
    // preuve du cache, pas une simple assertion sur un compteur.
    serveurMsw.use(configurationExigeantUnNavigateur());
    const fournisseur = creerFournisseurDeJetons({ base: contexte.base, maintenant: () => T0 });
    await fournisseur.obtenir();
    serveurMsw.resetHandlers();

    const jetons = await fournisseur.obtenir();

    expect(jetons.key_dh).toBe("jeton-directus-factice-pour-les-tests");
  });

  it("redemande les jetons une fois les 6 h écoulées", async () => {
    serveurMsw.use(configurationExigeantUnNavigateur());
    let instant = T0;
    const fournisseur = creerFournisseurDeJetons({
      base: contexte.base,
      maintenant: () => instant,
    });
    await fournisseur.obtenir();

    // Une seconde après l'échéance : le cache ne doit plus être servi.
    instant = new Date(T0.getTime() + DUREE_CACHE_JETONS_MS + 1000);
    serveurMsw.use(
      http.get(URL_CONFIGURATION, () =>
        HttpResponse.json({ data: { key_dh: "dh-renouvele", key_ms: "ms-renouvele" } }),
      ),
    );

    const jetons = await fournisseur.obtenir();

    expect(jetons.key_ms).toBe("ms-renouvele");
    const [ligne] = await lireLigne();
    expect(ligne?.expireLe).toEqual(new Date(instant.getTime() + DUREE_CACHE_JETONS_MS));
  });

  it("sert encore le cache une seconde avant l'échéance", async () => {
    serveurMsw.use(configurationExigeantUnNavigateur());
    let instant = T0;
    const fournisseur = creerFournisseurDeJetons({
      base: contexte.base,
      maintenant: () => instant,
    });
    await fournisseur.obtenir();
    serveurMsw.resetHandlers();

    instant = new Date(T0.getTime() + DUREE_CACHE_JETONS_MS - 1000);

    const jetons = await fournisseur.obtenir();

    expect(jetons.key_ms).toBe("jeton-meilisearch-factice-pour-les-tests");
  });

  it("met à jour la ligne existante au lieu d'en créer une seconde", async () => {
    serveurMsw.use(configurationExigeantUnNavigateur());
    let instant = T0;
    const fournisseur = creerFournisseurDeJetons({
      base: contexte.base,
      maintenant: () => instant,
    });
    await fournisseur.obtenir();
    instant = new Date(T0.getTime() + DUREE_CACHE_JETONS_MS + 1000);

    await fournisseur.obtenir();

    const lignes = await contexte.base.select().from(parametre);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.majLe).toEqual(instant);
  });

  it("invalide en supprimant la ligne, ce qui force un nouvel appel", async () => {
    serveurMsw.use(configurationExigeantUnNavigateur());
    const fournisseur = creerFournisseurDeJetons({ base: contexte.base, maintenant: () => T0 });
    await fournisseur.obtenir();

    await fournisseur.invalider();

    expect(await lireLigne()).toEqual([]);
    // Le handler est toujours en place : l'appel repart bien sur le réseau.
    await expect(fournisseur.obtenir()).resolves.toMatchObject({
      key_ms: "jeton-meilisearch-factice-pour-les-tests",
    });
  });

  it("traite une ligne sans échéance comme périmée plutôt que de servir un jeton d'âge inconnu", async () => {
    await contexte.base.insert(parametre).values({
      cle: CLE_PARAMETRE_JETONS,
      valeur: JSON.stringify({ key_dh: "vieux-dh", key_ms: "vieux-ms" }),
      expireLe: null,
    });
    serveurMsw.use(configurationExigeantUnNavigateur());
    const fournisseur = creerFournisseurDeJetons({ base: contexte.base, maintenant: () => T0 });

    const jetons = await fournisseur.obtenir();

    expect(jetons.key_ms).toBe("jeton-meilisearch-factice-pour-les-tests");
  });

  it("signale un cache illisible puis redemande les jetons, sans bloquer la synchro", async () => {
    // Le cache est un artefact dérivé : une ligne abîmée se répare en une requête.
    // L'incident doit être signalé, pas fatal.
    serveurMsw.use(configurationExigeantUnNavigateur());
    await contexte.base.insert(parametre).values({
      cle: CLE_PARAMETRE_JETONS,
      valeur: "ceci n'est pas du json",
      expireLe: new Date(T0.getTime() + DUREE_CACHE_JETONS_MS),
    });
    const incidents: ErreurCacheJetons[] = [];
    const fournisseur = creerFournisseurDeJetons({
      base: contexte.base,
      maintenant: () => T0,
      onCacheIllisible: (erreur) => incidents.push(erreur),
    });

    const jetons = await fournisseur.obtenir();

    expect(jetons.key_ms).not.toBe("");
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toBeInstanceOf(ErreurCacheJetons);
    // La ligne abîmée a été remplacée, pas laissée en l'état.
    const [ligne] = await lireLigne();
    expect(ligne?.valeur).toContain("key_ms");
  });

  it("traite un cache au mauvais format exactement comme un cache illisible", async () => {
    serveurMsw.use(configurationExigeantUnNavigateur());
    await contexte.base.insert(parametre).values({
      cle: CLE_PARAMETRE_JETONS,
      valeur: JSON.stringify({ key_dh: "dh", key_ms: "" }),
      expireLe: new Date(T0.getTime() + DUREE_CACHE_JETONS_MS),
    });
    const incidents: ErreurCacheJetons[] = [];
    const fournisseur = creerFournisseurDeJetons({
      base: contexte.base,
      maintenant: () => T0,
      onCacheIllisible: (erreur) => incidents.push(erreur),
    });

    const jetons = await fournisseur.obtenir();

    expect(jetons.key_ms).not.toBe("");
    expect(incidents).toHaveLength(1);
    expect(incidents[0]?.message).toMatch(/key_ms/);
  });

  it("nomme « (racine) » quand la valeur en cache n'est même pas un objet", async () => {
    // `42` est du JSON valide mais pas des jetons : l'erreur Zod ne porte sur
    // aucun champ, et un message sans chemin serait illisible en journal.
    serveurMsw.use(configurationExigeantUnNavigateur());
    await contexte.base.insert(parametre).values({
      cle: CLE_PARAMETRE_JETONS,
      valeur: "42",
      expireLe: new Date(T0.getTime() + DUREE_CACHE_JETONS_MS),
    });
    const incidents: ErreurCacheJetons[] = [];
    const fournisseur = creerFournisseurDeJetons({
      base: contexte.base,
      maintenant: () => T0,
      onCacheIllisible: (erreur) => incidents.push(erreur),
    });

    await fournisseur.obtenir();

    expect(incidents[0]?.message).toMatch(/\(racine\)/);
  });

  it("répare un cache illisible même sans rapporteur, mais alors sans trace", async () => {
    // `onCacheIllisible` est optionnel : son absence ne doit pas faire échouer la
    // réparation. C'est le seul cas où l'anomalie passe inaperçue, et c'est pour
    // cela que T06 devra toujours brancher le rapporteur.
    serveurMsw.use(configurationExigeantUnNavigateur());
    await contexte.base.insert(parametre).values({
      cle: CLE_PARAMETRE_JETONS,
      valeur: "{",
      expireLe: new Date(T0.getTime() + DUREE_CACHE_JETONS_MS),
    });
    const fournisseur = creerFournisseurDeJetons({ base: contexte.base, maintenant: () => T0 });

    await expect(fournisseur.obtenir()).resolves.toHaveProperty("key_ms");
  });

  it("laisse remonter la panne de la FFBB sans rien écrire en base", async () => {
    const { handler } = sequence(URL_CONFIGURATION, "get", [reponse5xx, reponse5xx, reponse5xx]);
    serveurMsw.use(handler);
    const fournisseur = creerFournisseurDeJetons({
      base: contexte.base,
      maintenant: () => T0,
      // Attente instantanée : les reprises sont vérifiées ailleurs, inutile de
      // faire patienter cette suite trois secondes.
      transport: { attendre: () => Promise.resolve() },
    });

    await expect(fournisseur.obtenir()).rejects.toThrowError(/Jetons FFBB indisponibles/);
    expect(await lireLigne()).toEqual([]);
  });

  it("utilise l'horloge système quand aucune horloge n'est injectée", async () => {
    serveurMsw.use(configurationExigeantUnNavigateur());
    const avant = Date.now();
    const fournisseur = creerFournisseurDeJetons({ base: contexte.base });

    await fournisseur.obtenir();

    const [ligne] = await lireLigne();
    const echeance = ligne?.expireLe;
    if (echeance === undefined || echeance === null) {
      throw new Error("la ligne de cache a été écrite sans échéance");
    }
    expect(echeance.getTime()).toBeGreaterThanOrEqual(avant + DUREE_CACHE_JETONS_MS);
  });
});
