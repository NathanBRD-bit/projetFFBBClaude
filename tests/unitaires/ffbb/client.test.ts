import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { delay, http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import {
  attendreReellement,
  creerClientFfbb,
  ErreurFfbb,
  MAX_PAGES,
  NOMBRE_TENTATIVES,
  RETRY_AFTER_MAX_MS,
  recupererJetons,
  URL_CONFIGURATION,
  USER_AGENT_NAVIGATEUR,
  type FournisseurDeJetons,
} from "@/infrastructure/ffbb/client";
import { ErreurValidationFfbb } from "@/infrastructure/ffbb/schemas";

import {
  chargerFixture,
  configurationExigeantUnNavigateur,
  fetchEspionne,
  rencontresQuiRepondent,
  reponse401,
  reponse403,
  reponse429,
  reponse5xx,
  reponseJson,
  sequence,
  URL_RECHERCHE_ORGANISMES,
  URL_RECHERCHE_RENCONTRES,
  type DocumentJson,
} from "../../msw/ffbb";
import { serveurMsw } from "../../msw/serveur";

/**
 * Client HTTP FFBB.
 *
 * **Aucune requête réseau réelle** : toutes passent par MSW, et
 * `onUnhandledRequest: "error"` (tests/setup.ts) fait échouer tout appel non
 * déclaré. Le test « sans handler » en fin de fichier le prouve.
 *
 * Les attentes de backoff sont injectées : les tests vérifient les **durées
 * demandées** sans jamais patienter. Seule `attendreReellement` est éprouvée à
 * part, avec les horloges factices de Vitest.
 */

const CODE_CLUB = "PDL0049077";

const fixtureRencontres = chargerFixture("rencontres-club.json");
const fixtureOrganismes = chargerFixture("organisme-socl.json");

function rencontreModele(): Record<string, unknown> {
  const [premiere] = (fixtureRencontres as { hits: Record<string, unknown>[] }).hits;
  if (premiere === undefined) throw new Error("fixture des rencontres vide");
  return premiere;
}

/** Page Meilisearch fabriquée à partir de la rencontre réelle. */
function pageDe(
  nombreDeDocuments: number,
  limite: number,
  decalage: number,
): Record<string, unknown> {
  const modele = rencontreModele();
  return {
    hits: Array.from({ length: nombreDeDocuments }, (_, indice) => ({
      ...modele,
      id: `${modele.id as string}${String(decalage)}${String(indice)}`,
    })),
    query: "",
    processingTimeMs: 1,
    limit: limite,
    offset: decalage,
    estimatedTotalHits: 5000,
  };
}

function fournisseurDeJetonsFactice(): {
  fournisseur: FournisseurDeJetons;
  compteurs: { obtentions: number; invalidations: number };
} {
  const compteurs = { obtentions: 0, invalidations: 0 };
  return {
    compteurs,
    fournisseur: {
      obtenir: () => {
        compteurs.obtentions += 1;
        return Promise.resolve({
          key_dh: "jeton-dh-de-test",
          key_ms: `jeton-ms-de-test-${String(compteurs.obtentions)}`,
        });
      },
      invalider: () => {
        compteurs.invalidations += 1;
        return Promise.resolve();
      },
    },
  };
}

/** Attente instantanée qui retient les durées demandées. */
function attenteEspionne(): { delais: number[]; attendre: (ms: number) => Promise<void> } {
  const delais: number[] = [];
  return {
    delais,
    attendre: (millisecondes) => {
      delais.push(millisecondes);
      return Promise.resolve();
    },
  };
}

/* ================================================================== *
 * Jetons publics
 * ================================================================== */

describe("récupération des jetons publics", () => {
  it("lit key_dh et key_ms dans la configuration réelle", async () => {
    serveurMsw.use(configurationExigeantUnNavigateur());

    const jetons = await recupererJetons();

    expect(jetons).toEqual({
      key_dh: "jeton-directus-factice-pour-les-tests",
      key_ms: "jeton-meilisearch-factice-pour-les-tests",
    });
  });

  it("envoie un User-Agent de navigateur, faute de quoi la FFBB répond 403", async () => {
    // Le handler ci-dessus renvoie 403 si l'en-tête n'est pas celui d'un
    // navigateur : le succès du test précédent le prouve déjà. Ici on vérifie
    // la valeur exacte envoyée, pour que retirer l'en-tête casse ce test.
    let userAgentRecu: string | null = null;
    serveurMsw.use(
      http.get(URL_CONFIGURATION, ({ request }) => {
        userAgentRecu = request.headers.get("user-agent");
        return HttpResponse.json(chargerFixture("configuration.json"));
      }),
    );

    await recupererJetons();

    expect(userAgentRecu).toBe(USER_AGENT_NAVIGATEUR);
    expect(USER_AGENT_NAVIGATEUR).toMatch(/^Mozilla\//);
  });

  it("désigne le User-Agent quand la configuration répond 403", async () => {
    const { handler } = sequence(URL_CONFIGURATION, "get", [reponse403]);
    serveurMsw.use(handler);

    await expect(recupererJetons()).rejects.toThrowError(/User-Agent de navigateur/);
  });

  it("reprend après un 429 et réussit à la tentative suivante", async () => {
    const { handler, nombreAppels } = sequence(URL_CONFIGURATION, "get", [
      reponse429,
      () => reponseJson(chargerFixture("configuration.json")),
    ]);
    serveurMsw.use(handler);
    const attente = attenteEspionne();

    const jetons = await recupererJetons({ attendre: attente.attendre });

    expect(jetons.key_ms).toBe("jeton-meilisearch-factice-pour-les-tests");
    expect(nombreAppels()).toBe(2);
    expect(attente.delais).toEqual([1000]);
  });

  it("abandonne après trois tentatives sur 5xx, avec une attente exponentielle", async () => {
    const { handler, nombreAppels } = sequence(URL_CONFIGURATION, "get", [
      reponse5xx,
      reponse5xx,
      reponse5xx,
    ]);
    serveurMsw.use(handler);
    const attente = attenteEspionne();

    await expect(recupererJetons({ attendre: attente.attendre })).rejects.toThrowError(
      /Jetons FFBB indisponibles.*statut 502/s,
    );
    expect(nombreAppels()).toBe(NOMBRE_TENTATIVES);
    expect(attente.delais).toEqual([1000, 2000]);
  });

  it("n'insiste pas sur un 4xx et tronque le corps recopié dans l'erreur", async () => {
    const corpsTresLong = "x".repeat(900);
    const { handler, nombreAppels } = sequence(URL_CONFIGURATION, "get", [
      () => new HttpResponse(corpsTresLong, { status: 404 }),
    ]);
    serveurMsw.use(handler);

    await expect(recupererJetons()).rejects.toThrowError(/900 caractères au total/);
    expect(nombreAppels()).toBe(1);
  });

  it("signale un JSON tronqué au lieu de laisser remonter une erreur de parse nue", async () => {
    serveurMsw.use(
      http.get(
        URL_CONFIGURATION,
        () =>
          new HttpResponse('{"data":{"key_dh":"abc","key_m', {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    await expect(recupererJetons()).rejects.toThrowError(/JSON invalide ou tronqué/);
  });

  it("refuse une configuration sans jeton utilisable, en nommant le champ", async () => {
    serveurMsw.use(
      http.get(URL_CONFIGURATION, () => HttpResponse.json({ data: { key_dh: "abc", key_ms: "" } })),
    );

    await expect(recupererJetons()).rejects.toThrowError(ErreurValidationFfbb);
    await expect(recupererJetons()).rejects.toThrowError(/data\.key_ms/);
  });

  it("échoue quand la requête dépasse son délai, en le rappelant", async () => {
    serveurMsw.use(
      http.get(URL_CONFIGURATION, async () => {
        await delay(300);
        return HttpResponse.json(chargerFixture("configuration.json"));
      }),
    );

    await expect(recupererJetons({ delaiExpirationMs: 20 })).rejects.toThrowError(
      /délai de 20 ms dépassé/,
    );
  });
});

describe("attente par défaut entre deux reprises", () => {
  it("patiente la durée demandée, mesurée à l'horloge factice", async () => {
    vi.useFakeTimers();
    try {
      let termine = false;
      const promesse = attendreReellement(1000).then(() => {
        termine = true;
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(termine).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await promesse;
      expect(termine).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ================================================================== *
 * Client authentifié — rencontres
 * ================================================================== */

describe("liste des rencontres d'un club", () => {
  it("renvoie la rencontre réelle du SOCL et interroge le bon filtre", async () => {
    let corpsRecu: Record<string, unknown> = {};
    let autorisation: string | null = null;
    serveurMsw.use(
      http.post(URL_RECHERCHE_RENCONTRES, async ({ request }) => {
        autorisation = request.headers.get("authorization");
        corpsRecu = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(fixtureRencontres);
      }),
    );
    const { fournisseur } = fournisseurDeJetonsFactice();

    const rencontres = await creerClientFfbb(fournisseur).listerRencontresDuClub(CODE_CLUB);

    expect(rencontres.rencontres.map((rencontre) => rencontre.id)).toEqual(["200000014681472"]);
    expect(autorisation).toBe("Bearer jeton-ms-de-test-1");
    expect(corpsRecu.filter).toBe(
      "idOrganismeEquipe1.code = PDL0049077 OR idOrganismeEquipe2.code = PDL0049077",
    );
    expect(corpsRecu.sort).toEqual(["date_timestamp:asc"]);
  });

  it("renvoie une liste vide sur un index vide, sans lever d'erreur", async () => {
    // Juger qu'un index vide est suspect est le travail de la synchronisation
    // (T06), pas celui du client : lui se contente de rapporter ce qu'il a vu.
    serveurMsw.use(rencontresQuiRepondent(chargerFixture("rencontres-vide.json")));
    const { fournisseur } = fournisseurDeJetonsFactice();

    const rencontres = await creerClientFfbb(fournisseur).listerRencontresDuClub(CODE_CLUB);

    expect(rencontres).toEqual({ rencontres: [], ecartes: [] });
  });

  it("parcourt les pages jusqu'à la première page incomplète", async () => {
    const pages: DocumentJson[] = [
      chargerFixture("rencontres-page-1.json"),
      chargerFixture("rencontres-page-2.json"),
      chargerFixture("rencontres-page-3.json"),
    ];
    let appels = 0;
    serveurMsw.use(
      http.post(URL_RECHERCHE_RENCONTRES, () => {
        const page = pages[appels];
        appels += 1;
        if (page === undefined) throw new Error("une quatrième page a été demandée");
        return HttpResponse.json(page);
      }),
    );
    const { fournisseur } = fournisseurDeJetonsFactice();

    const rencontres = await creerClientFfbb(fournisseur, { taillePage: 2 }).listerRencontresDuClub(
      CODE_CLUB,
    );

    expect(appels).toBe(3);
    expect(rencontres.rencontres).toHaveLength(5);
    expect(new Set(rencontres.rencontres.map((rencontre) => rencontre.id)).size).toBe(5);
  });

  it("lève au lieu de boucler quand la pagination ne s'arrête jamais", async () => {
    // Page toujours pleine : la condition d'arrêt ne peut pas être atteinte.
    serveurMsw.use(http.post(URL_RECHERCHE_RENCONTRES, () => HttpResponse.json(pageDe(1, 1, 0))));
    const espion = fetchEspionne();
    const { fournisseur } = fournisseurDeJetonsFactice();

    const client = creerClientFfbb(fournisseur, { taillePage: 1, fetch: espion.fetch });

    await expect(client.listerRencontresDuClub(CODE_CLUB)).rejects.toThrowError(
      /Pagination FFBB interrompue : 20 pages pleines/,
    );
    expect(espion.nombreAppels()).toBe(MAX_PAGES);
  });

  it("écarte le document invalide en le nommant, sans emporter la page", async () => {
    // Le document porte « F » en `resultatEquipe1`. Refuser toute la page pour lui
    // ferait disparaître le calendrier entier du club sur un seul match mal saisi
    // à la fédération : le plan veut « document ignoré en entier », pas « page ».
    serveurMsw.use(rencontresQuiRepondent(chargerFixture("rencontre-invalide.json")));
    const { fournisseur } = fournisseurDeJetonsFactice();
    const client = creerClientFfbb(fournisseur);

    const lecture = await client.listerRencontresDuClub(CODE_CLUB);

    expect(lecture.rencontres).toEqual([]);
    expect(lecture.ecartes).toEqual([
      {
        idFfbb: "200000014681472",
        problemes: [
          "resultatEquipe1 : score FFBB attendu en entier positif sous forme de chaîne (ex. « 71 »)",
        ],
      },
    ]);
  });

  it("nomme « null » un document écarté dont l'identifiant est lui-même illisible", async () => {
    serveurMsw.use(
      rencontresQuiRepondent({ hits: [{ id: 42 }], limit: 200, offset: 0, estimatedTotalHits: 1 }),
    );
    const { fournisseur } = fournisseurDeJetonsFactice();

    const lecture = await creerClientFfbb(fournisseur).listerRencontresDuClub(CODE_CLUB);

    expect(lecture.ecartes.map((ecarte) => ecarte.idFfbb)).toEqual([null]);
  });

  it("refuse l'enveloppe entière quand elle-même est illisible", async () => {
    // L'enveloppe commande la pagination : sans `limit`, la condition d'arrêt
    // n'existe plus. Elle reste donc validée strictement, contrairement aux
    // documents qu'elle transporte.
    serveurMsw.use(rencontresQuiRepondent({ hits: [] }));
    const { fournisseur } = fournisseurDeJetonsFactice();
    const client = creerClientFfbb(fournisseur);

    await expect(client.listerRencontresDuClub(CODE_CLUB)).rejects.toThrowError(
      ErreurValidationFfbb,
    );
  });

  it("compte les documents écartés dans l'offset de la page suivante", async () => {
    // Un offset calculé sur les seuls documents valides redemanderait la même page
    // indéfiniment : la pagination doit suivre ce qui a été **reçu**.
    const decalages: number[] = [];
    const invalide = chargerFixture("rencontre-invalide.json");
    const [documentInvalide] = invalide.hits as Record<string, unknown>[];
    serveurMsw.use(
      http.post(URL_RECHERCHE_RENCONTRES, async ({ request }) => {
        const corps = (await request.json()) as { offset: number };
        decalages.push(corps.offset);
        return HttpResponse.json(
          decalages.length === 1
            ? { hits: [documentInvalide], limit: 1, offset: 0, estimatedTotalHits: 2 }
            : { hits: [], limit: 1, offset: 1, estimatedTotalHits: 2 },
        );
      }),
    );
    const { fournisseur } = fournisseurDeJetonsFactice();

    const lecture = await creerClientFfbb(fournisseur, { taillePage: 1 }).listerRencontresDuClub(
      CODE_CLUB,
    );

    expect(decalages).toEqual([0, 1]);
    expect(lecture.ecartes).toHaveLength(1);
  });

  it("refuse un code d'organisme mal formé sans émettre la moindre requête", async () => {
    // Aucun handler déclaré : si une requête partait, MSW ferait échouer le test.
    const { fournisseur } = fournisseurDeJetonsFactice();

    await expect(creerClientFfbb(fournisseur).listerRencontresDuClub("SOCL")).rejects.toThrowError(
      /Format attendu/,
    );
  });
});

/* ================================================================== *
 * Jetons périmés : 401 / 403
 * ================================================================== */

describe("renouvellement des jetons sur refus d'authentification", () => {
  it("invalide puis réessaie une seule fois après un 401, et réussit", async () => {
    const { handler } = sequence(URL_RECHERCHE_RENCONTRES, "post", [
      reponse401,
      () => reponseJson(fixtureRencontres),
    ]);
    serveurMsw.use(handler);
    const espion = fetchEspionne();
    const { fournisseur, compteurs } = fournisseurDeJetonsFactice();

    const rencontres = await creerClientFfbb(fournisseur, {
      fetch: espion.fetch,
    }).listerRencontresDuClub(CODE_CLUB);

    expect(rencontres.rencontres).toHaveLength(1);
    expect(compteurs.invalidations).toBe(1);
    expect(compteurs.obtentions).toBe(2);
    expect(espion.nombreAppels()).toBe(2);
  });

  it("traite un 403 de l'index comme un jeton périmé", async () => {
    const { handler } = sequence(URL_RECHERCHE_RENCONTRES, "post", [
      reponse403,
      () => reponseJson(fixtureRencontres),
    ]);
    serveurMsw.use(handler);
    const { fournisseur, compteurs } = fournisseurDeJetonsFactice();

    await creerClientFfbb(fournisseur).listerRencontresDuClub(CODE_CLUB);

    expect(compteurs.invalidations).toBe(1);
  });

  it("échoue explicitement au second 401, sans boucler", async () => {
    const { handler } = sequence(URL_RECHERCHE_RENCONTRES, "post", [reponse401, reponse401]);
    serveurMsw.use(handler);
    const espion = fetchEspionne();
    const { fournisseur, compteurs } = fournisseurDeJetonsFactice();

    const client = creerClientFfbb(fournisseur, { fetch: espion.fetch });

    await expect(client.listerRencontresDuClub(CODE_CLUB)).rejects.toThrowError(
      /toujours refusée.*après renouvellement des jetons/s,
    );
    expect(espion.nombreAppels()).toBe(2);
    expect(compteurs.invalidations).toBe(1);
  });
});

/* ================================================================== *
 * Fiche club
 * ================================================================== */

describe("fiche club", () => {
  it("retient la fiche dont le code est exactement celui demandé", async () => {
    serveurMsw.use(http.post(URL_RECHERCHE_ORGANISMES, () => HttpResponse.json(fixtureOrganismes)));
    const { fournisseur } = fournisseurDeJetonsFactice();

    const organisme = await creerClientFfbb(fournisseur).obtenirOrganisme(CODE_CLUB);

    expect(organisme.code).toBe(CODE_CLUB);
    expect(organisme.nom).toBe("STADE OLYMPIQUE CANDE LOIRE BASKET");
  });

  it("échoue plutôt que de retenir le premier résultat d'une recherche floue", async () => {
    serveurMsw.use(
      http.post(URL_RECHERCHE_ORGANISMES, () =>
        HttpResponse.json({ hits: [], query: "", limit: 20, offset: 0, estimatedTotalHits: 0 }),
      ),
    );
    const { fournisseur } = fournisseurDeJetonsFactice();

    await expect(creerClientFfbb(fournisseur).obtenirOrganisme(CODE_CLUB)).rejects.toThrowError(
      /Aucune fiche FFBB de code exactement PDL0049077 parmi les 0 résultats/,
    );
  });

  it("refuse un code d'organisme mal formé", async () => {
    const { fournisseur } = fournisseurDeJetonsFactice();

    await expect(creerClientFfbb(fournisseur).obtenirOrganisme("pdl0049077")).rejects.toThrowError(
      /Code d'organisme FFBB invalide/,
    );
  });
});

/* ================================================================== *
 * Preuve : aucun accès au réseau réel
 * ================================================================== */

describe("aucune configuration en dur ni dans l'environnement", () => {
  it("ne lit aucune variable d'environnement et n'embarque aucun jeton", () => {
    // Les jetons FFBB tournent : figés dans `.env`, ils deviendraient faux sans
    // prévenir et personne ne saurait pourquoi la synchronisation s'est arrêtée.
    // Ce test verrouille l'interdit, au lieu de le laisser en prose.
    const dossier = fileURLToPath(new URL("../../../src/infrastructure/ffbb/", import.meta.url));

    for (const fichier of ["client.ts", "jetons.ts", "schemas.ts"]) {
      const source = readFileSync(`${dossier}${fichier}`, "utf8");
      expect(source, `${fichier} lit l'environnement`).not.toMatch(/process\s*\.\s*env/);
      expect(source, `${fichier} contient un jeton en dur`).not.toMatch(/key_ms\s*[:=]\s*"[^"]/);
    }
  });
});

/* ================================================================== *
 * Constats de review — chaque correctif a son test
 * ================================================================== */

describe("robustesse relevée en review", () => {
  it("pagine sur le nombre de documents reçus, pas sur la taille demandée", async () => {
    // Le serveur sert des pages plus courtes que demandé. En calculant l'offset
    // sur `taillePage`, les documents intermédiaires étaient sautés en silence.
    const { fournisseur } = fournisseurDeJetonsFactice();
    const decalagesDemandes: number[] = [];
    serveurMsw.use(
      http.post(URL_RECHERCHE_RENCONTRES, async ({ request }) => {
        const corps = (await request.json()) as { offset: number };
        decalagesDemandes.push(corps.offset);
        // 2 documents servis alors que 4 étaient demandés, puis une page vide.
        return HttpResponse.json(
          decalagesDemandes.length === 1 ? pageDe(2, 2, 0) : pageDe(0, 2, 2),
        );
      }),
    );
    const client = creerClientFfbb(fournisseur, { taillePage: 4 });

    const rencontres = await client.listerRencontresDuClub(CODE_CLUB);

    expect(rencontres.rencontres).toHaveLength(2);
    // Le second appel repart de 2, pas de 4 : aucun document n'est enjambé.
    expect(decalagesDemandes).toEqual([0, 2]);
  });

  it("respecte le délai réclamé par `Retry-After` en secondes", async () => {
    const { fournisseur } = fournisseurDeJetonsFactice();
    const attente = attenteEspionne();
    const { handler } = sequence(URL_RECHERCHE_RENCONTRES, "post", [
      () =>
        new HttpResponse("Too Many Requests", { status: 429, headers: { "retry-after": "12" } }),
      () => reponseJson(pageDe(1, 200, 0)),
    ]);
    serveurMsw.use(handler);
    const client = creerClientFfbb(fournisseur, { attendre: attente.attendre });

    await client.listerRencontresDuClub(CODE_CLUB);

    // 12 s réclamées, et non les 1 s de l'attente exponentielle.
    expect(attente.delais).toEqual([12_000]);
  });

  it("plafonne un `Retry-After` déraisonnable au lieu de suspendre la synchro", async () => {
    const { fournisseur } = fournisseurDeJetonsFactice();
    const attente = attenteEspionne();
    const { handler } = sequence(URL_RECHERCHE_RENCONTRES, "post", [
      () =>
        new HttpResponse("Too Many Requests", { status: 429, headers: { "retry-after": "3600" } }),
      () => reponseJson(pageDe(1, 200, 0)),
    ]);
    serveurMsw.use(handler);
    const client = creerClientFfbb(fournisseur, { attendre: attente.attendre });

    await client.listerRencontresDuClub(CODE_CLUB);

    expect(attente.delais).toEqual([RETRY_AFTER_MAX_MS]);
  });

  it("accepte la forme « date HTTP » de `Retry-After`", async () => {
    const { fournisseur } = fournisseurDeJetonsFactice();
    const attente = attenteEspionne();
    const dans5s = new Date(Date.now() + 5000).toUTCString();
    const { handler } = sequence(URL_RECHERCHE_RENCONTRES, "post", [
      () =>
        new HttpResponse("Too Many Requests", { status: 429, headers: { "retry-after": dans5s } }),
      () => reponseJson(pageDe(1, 200, 0)),
    ]);
    serveurMsw.use(handler);
    const client = creerClientFfbb(fournisseur, { attendre: attente.attendre });

    await client.listerRencontresDuClub(CODE_CLUB);

    const [delai] = attente.delais;
    expect(delai).toBeGreaterThan(0);
    expect(delai).toBeLessThanOrEqual(5000);
  });

  it("retombe sur l'attente exponentielle si `Retry-After` est illisible", async () => {
    const { fournisseur } = fournisseurDeJetonsFactice();
    const attente = attenteEspionne();
    const { handler } = sequence(URL_RECHERCHE_RENCONTRES, "post", [
      () =>
        new HttpResponse("Too Many Requests", {
          status: 429,
          headers: { "retry-after": "bientôt" },
        }),
      () => reponseJson(pageDe(1, 200, 0)),
    ]);
    serveurMsw.use(handler);
    const client = creerClientFfbb(fournisseur, { attendre: attente.attendre });

    await client.listerRencontresDuClub(CODE_CLUB);

    expect(attente.delais).toEqual([1000]);
  });

  it("n'attend pas quand la date de `Retry-After` est déjà passée", async () => {
    const { fournisseur } = fournisseurDeJetonsFactice();
    const attente = attenteEspionne();
    const hier = new Date(Date.now() - 86_400_000).toUTCString();
    const { handler } = sequence(URL_RECHERCHE_RENCONTRES, "post", [
      () =>
        new HttpResponse("Too Many Requests", { status: 429, headers: { "retry-after": hier } }),
      () => reponseJson(pageDe(1, 200, 0)),
    ]);
    serveurMsw.use(handler);
    const client = creerClientFfbb(fournisseur, { attendre: attente.attendre });

    await client.listerRencontresDuClub(CODE_CLUB);

    expect(attente.delais).toEqual([0]);
  });

  it("échoue franchement quand le budget total est dépassé", async () => {
    // Sans budget global, 20 pages × 3 tentatives × 10 s dépassent les vingt
    // minutes : la fonction Vercel serait tuée en vol, sans trace nulle part.
    const { fournisseur } = fournisseurDeJetonsFactice();
    let horloge = 0;
    serveurMsw.use(
      http.post(URL_RECHERCHE_RENCONTRES, () => {
        horloge += 30_000;
        return HttpResponse.json(pageDe(2, 2, 0));
      }),
    );
    const client = creerClientFfbb(fournisseur, {
      taillePage: 2,
      budgetTotalMs: 45_000,
      maintenant: () => horloge,
    });

    await expect(client.listerRencontresDuClub(CODE_CLUB)).rejects.toThrowError(
      /Budget de synchronisation dépassé/,
    );
  });

  it("refuse un code de club malformé avec l'erreur du contrat, pas une erreur nue", async () => {
    // Un appelant qui trie ses erreurs avec `instanceof ErreurFfbb` prenait la
    // mauvaise branche et confondait un bug de programmation avec une panne de
    // source.
    const { fournisseur } = fournisseurDeJetonsFactice();
    const client = creerClientFfbb(fournisseur);

    await expect(client.listerRencontresDuClub("pas-un-code")).rejects.toThrowError(ErreurFfbb);
    await expect(client.obtenirOrganisme("PDL999")).rejects.toThrowError(ErreurFfbb);
  });
});

describe("message d'erreur du client", () => {
  it("n'affiche que les éléments de contexte réellement connus", () => {
    // Le message se compose à partir de ce qu'on sait : ni « statut undefined »,
    // ni virgules orphelines quand le statut ou le corps manquent.
    const sansRien = new ErreurFfbb("panne", { url: "https://exemple.test", methode: "GET" });
    const avecCorpsSeul = new ErreurFfbb("panne", {
      url: "https://exemple.test",
      methode: "GET",
      corps: "détail",
    });
    const complet = new ErreurFfbb("panne", {
      url: "https://exemple.test",
      methode: "GET",
      statut: 500,
      corps: "détail",
    });

    expect(sansRien.message).toBe("panne — GET https://exemple.test");
    expect(avecCorpsSeul.message).toBe("panne — GET https://exemple.test, corps « détail »");
    expect(complet.message).toBe("panne — GET https://exemple.test, statut 500, corps « détail »");
  });
});

describe("étanchéité au réseau", () => {
  it("échoue si une requête n'est pas interceptée par MSW", async () => {
    // Aucun handler : `onUnhandledRequest: "error"` refuse la requête. Ce test
    // est la preuve que `npm test` ne peut pas atteindre api.ffbb.com — s'il
    // passait au vert autrement, c'est que l'étanchéité aurait sauté.
    await expect(recupererJetons()).rejects.toThrowError(ErreurFfbb);
  });
});
