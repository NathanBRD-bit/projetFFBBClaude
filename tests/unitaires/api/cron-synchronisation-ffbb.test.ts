import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DependancesSynchronisation,
  ResumeSynchronisation,
  StatutSynchronisation,
} from "@/infrastructure/ffbb/synchronisation";

/**
 * Route de déclenchement de la synchronisation FFBB.
 *
 * Deux frontières sont simulées, et seulement elles : la **base** (la route
 * n'ouvre pas de Postgres pour décider d'un code HTTP) et le **moteur de
 * synchronisation**, déjà éprouvé de bout en bout en intégration. Ce qui reste
 * est exactement ce que ce fichier doit prouver : qui est refusé, quel code HTTP
 * sort, et ce que le corps de la réponse laisse voir.
 *
 * `src/app/**` est hors des seuils de couverture (couche rendue) ; la route est
 * couverte ici quand même — c'est une frontière d'authentification.
 */

const BASE_FACTICE = vi.hoisted(() => ({ marqueur: "base simulée" }));
const synchroniserSimule = vi.hoisted(() =>
  vi.fn<(dependances: DependancesSynchronisation) => Promise<ResumeSynchronisation>>(),
);
const obtenirBaseSimule = vi.hoisted(() => vi.fn(() => BASE_FACTICE));

vi.mock("@/infrastructure/bdd/client", () => ({ obtenirBase: obtenirBaseSimule }));
vi.mock("@/infrastructure/ffbb/synchronisation", () => ({ synchroniser: synchroniserSimule }));

const { GET, POST } = await import("@/app/api/cron/synchronisation-ffbb/route");

const SECRET = "secret-de-cron-pour-les-tests-0123456789";
const URL_ROUTE = "https://socl.example/api/cron/synchronisation-ffbb";

function resume(
  statut: StatutSynchronisation,
  messageErreur: string | null = null,
): ResumeSynchronisation {
  return {
    journalId: "3f6d0c3a-0000-4000-8000-000000000042",
    statut,
    demarreeLe: new Date("2026-09-17T06:00:00Z"),
    termineeLe: new Date("2026-09-17T06:00:03Z"),
    dureeMs: 3_000,
    compteurs: {
      nbLues: 241,
      nbCreees: 1,
      nbMisesAJour: 0,
      nbInchangees: 240,
      nbDisparues: 0,
      nbInvalides: 0,
      nbConflits: 0,
      nbNonRapprochees: 0,
    },
    messageErreur,
    ecartes: [],
    nonRapprochees: [],
    incidents: [],
  };
}

function requete(
  enTetes: Readonly<Record<string, string>> = {},
  methode: "GET" | "POST" = "GET",
): Request {
  return new Request(URL_ROUTE, { method: methode, headers: enTetes });
}

function authentifiee(enTetes: Readonly<Record<string, string>> = {}): Request {
  return requete({ authorization: `Bearer ${SECRET}`, ...enTetes });
}

describe("route /api/cron/synchronisation-ffbb", () => {
  let erreurs: ReturnType<typeof vi.spyOn>;
  let avertissements: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    synchroniserSimule.mockReset();
    synchroniserSimule.mockResolvedValue(resume("succes"));
    obtenirBaseSimule.mockClear();
    erreurs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    avertissements = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /* ---------------------------------------------------------------- *
   * Refus
   * ---------------------------------------------------------------- */

  it("refuse en 401 un appel sans en-tête Authorization", async () => {
    const reponse = await GET(requete());

    expect(reponse.status).toBe(401);
    expect(await reponse.json()).toStrictEqual({ erreur: "Non autorisé." });
  });

  it("refuse en 401 un mauvais secret, sans jamais lancer la synchronisation", async () => {
    const reponse = await GET(requete({ authorization: "Bearer ce-n-est-pas-le-bon" }));

    expect(reponse.status).toBe(401);
    expect(synchroniserSimule).not.toHaveBeenCalled();
    // Aucune connexion à la base n'est ouverte pour un appel refusé.
    expect(obtenirBaseSimule).not.toHaveBeenCalled();
  });

  it("refuse en 401 quand CRON_SECRET n'est pas configurée côté serveur", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const reponse = await GET(authentifiee());

    expect(reponse.status).toBe(401);
    expect(synchroniserSimule).not.toHaveBeenCalled();
  });

  it("journalise la CRON_SECRET manquante comme une erreur serveur, pas comme un appel fautif", async () => {
    vi.stubEnv("CRON_SECRET", "");

    await GET(authentifiee());

    expect(erreurs).toHaveBeenCalledWith(expect.stringContaining("CRON_SECRET est absente"));
    expect(avertissements).not.toHaveBeenCalled();
  });

  it("journalise un mauvais secret comme un avertissement, sans crier à la panne", async () => {
    await GET(requete({ authorization: "Bearer ce-n-est-pas-le-bon" }));

    expect(avertissements).toHaveBeenCalledWith(expect.stringContaining("secret_invalide"));
    expect(erreurs).not.toHaveBeenCalled();
  });

  it("répond le même corps quelle que soit la cause du refus", async () => {
    const sansEnTete = await (await GET(requete())).text();
    const mauvaisSecret = await (await GET(requete({ authorization: "Bearer faux" }))).text();
    vi.stubEnv("CRON_SECRET", "");
    const nonConfiguree = await (await GET(authentifiee())).text();

    // Trois causes, une seule réponse : rien n'apprend à l'appelant où ça coince.
    expect(new Set([sansEnTete, mauvaisSecret, nonConfiguree]).size).toBe(1);
  });

  /* ---------------------------------------------------------------- *
   * Exécution
   * ---------------------------------------------------------------- */

  it("répond 200 et le résumé quand la synchronisation réussit", async () => {
    const reponse = await GET(authentifiee());

    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toStrictEqual({
      statut: "succes",
      journalId: "3f6d0c3a-0000-4000-8000-000000000042",
      dureeMs: 3_000,
      compteurs: resume("succes").compteurs,
      messageErreur: null,
    });
  });

  it("répond 200 sur un statut partiel : la dégradation prévue n'est pas une panne", async () => {
    synchroniserSimule.mockResolvedValue(resume("partiel", "2 documents écartés"));

    const reponse = await GET(authentifiee());

    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toMatchObject({ statut: "partiel" });
  });

  it("répond 500 quand la synchronisation échoue, pour que le workflow rougisse", async () => {
    synchroniserSimule.mockResolvedValue(resume("echec", "Jetons FFBB indisponibles"));

    const reponse = await GET(authentifiee());

    expect(reponse.status).toBe(500);
    expect(await reponse.json()).toMatchObject({ statut: "echec" });
  });

  it("interdit toute mise en cache de la réponse", async () => {
    const reponse = await GET(authentifiee());

    expect(reponse.headers.get("cache-control")).toBe("no-store");
  });

  it("accepte aussi POST, pour le déclenchement manuel", async () => {
    const reponse = await POST(requete({ authorization: `Bearer ${SECRET}` }, "POST"));

    expect(reponse.status).toBe(200);
    expect(synchroniserSimule).toHaveBeenCalledTimes(1);
  });

  it("passe la base et le code FFBB du club au moteur de synchronisation", async () => {
    await GET(authentifiee());

    expect(synchroniserSimule).toHaveBeenCalledWith(
      expect.objectContaining({ base: BASE_FACTICE, codeClubFfbb: "PDL0049077" }),
    );
  });

  /* ---------------------------------------------------------------- *
   * Déclencheur journalisé
   * ---------------------------------------------------------------- */

  it("reconnaît le cron Vercel à son en-tête", async () => {
    await GET(authentifiee({ "x-vercel-cron": "1" }));

    expect(synchroniserSimule).toHaveBeenCalledWith(
      expect.objectContaining({ declencheur: "cron_vercel" }),
    );
  });

  it("reconnaît GitHub Actions à l'en-tête qu'il pose lui-même", async () => {
    await GET(authentifiee({ "x-declencheur": "github_actions" }));

    expect(synchroniserSimule).toHaveBeenCalledWith(
      expect.objectContaining({ declencheur: "github_actions" }),
    );
  });

  it("enregistre comme manuel un appel qui ne s'annonce pas, ou qui s'annonce mal", async () => {
    await GET(authentifiee());
    await GET(authentifiee({ "x-declencheur": "n-importe-quoi" }));

    expect(synchroniserSimule).toHaveBeenCalledTimes(2);
    for (const appel of synchroniserSimule.mock.calls) {
      expect(appel[0]).toMatchObject({ declencheur: "manuel" });
    }
  });

  it("accepte le déclencheur manuel annoncé explicitement par le back-office", async () => {
    await GET(authentifiee({ "x-declencheur": "manuel" }));

    expect(synchroniserSimule).toHaveBeenCalledWith(
      expect.objectContaining({ declencheur: "manuel" }),
    );
  });

  /* ---------------------------------------------------------------- *
   * Fuites
   * ---------------------------------------------------------------- */

  it("ne laisse fuir ni le secret ni la chaîne de connexion dans la réponse", async () => {
    synchroniserSimule.mockResolvedValue(
      resume(
        "echec",
        "connexion refusée : postgresql://socl:motdepasse@ep-cool-123.eu-central-1.aws.neon.tech/socl",
      ),
    );

    const corps = await (await GET(authentifiee())).text();

    expect(corps).not.toContain(SECRET);
    expect(corps).not.toContain("motdepasse");
    expect(corps).not.toContain("neon.tech");
    expect(corps).toContain("[uri masquée]");
  });

  it("masque aussi les URL de l'API FFBB, sans rien inventer pour autant", async () => {
    synchroniserSimule.mockResolvedValue(
      resume(
        "echec",
        "Jetons FFBB indisponibles (500) sur https://api.ffbb.com/items/configuration",
      ),
    );

    const corps = (await (await GET(authentifiee())).json()) as { messageErreur: string };

    expect(corps.messageErreur).toBe("Jetons FFBB indisponibles (500) sur [uri masquée]");
  });

  it("borne la longueur du message d'erreur renvoyé", async () => {
    synchroniserSimule.mockResolvedValue(resume("echec", "e".repeat(5_000)));

    const corps = (await (await GET(authentifiee())).json()) as { messageErreur: string };

    expect(corps.messageErreur).toHaveLength(500);
  });
});
