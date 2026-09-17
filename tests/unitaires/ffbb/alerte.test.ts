import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import {
  composerMessageAlerte,
  creerAlerte,
  creerAlertePanne,
  LONGUEUR_MESSAGE_ERREUR,
  NOM_VARIABLE_WEBHOOK,
} from "@/infrastructure/ffbb/alerte";
import type { ResumeSynchronisation } from "@/infrastructure/ffbb/synchronisation";

import { serveurMsw } from "../../msw/serveur";

/**
 * Alerte d'échec de synchronisation.
 *
 * Aucun de ces tests ne touche le réseau réel : MSW intercepte, et toute requête
 * non déclarée fait échouer le test (`onUnhandledRequest: "error"`).
 *
 * La propriété la plus importante n'est pas « le message est joli » mais
 * « **la fonction ne rejette jamais** » : c'est elle qui garantit qu'un webhook
 * en panne ne transforme pas un `partiel` en `echec`.
 */

const URL_WEBHOOK = "https://alertes.example/socl";

const RESUME: ResumeSynchronisation = {
  journalId: "3f6d0c3a-0000-4000-8000-000000000001",
  statut: "partiel",
  demarreeLe: new Date("2026-09-17T06:00:00Z"),
  termineeLe: new Date("2026-09-17T06:00:04Z"),
  dureeMs: 4_000,
  compteurs: {
    nbLues: 241,
    nbCreees: 3,
    nbMisesAJour: 2,
    nbInchangees: 235,
    nbDisparues: 0,
    nbInvalides: 1,
    nbConflits: 0,
    nbNonRapprochees: 0,
  },
  messageErreur: "1 document écarté : hits[4] : date_rencontre : champ absent",
  ecartes: [],
  nonRapprochees: [],
  incidents: [],
};

function resumeAvec(modifications: Partial<ResumeSynchronisation>): ResumeSynchronisation {
  return { ...RESUME, ...modifications };
}

/** Enregistre un webhook qui répond `statut` et retient le corps reçu. */
function webhookQuiRepond(statut: number): { corps: () => unknown } {
  let recu: unknown = null;
  serveurMsw.use(
    http.post(URL_WEBHOOK, async ({ request }) => {
      recu = await request.json();
      return statut === 204
        ? new HttpResponse(null, { status: 204 })
        : new HttpResponse("non", { status: statut });
    }),
  );
  return { corps: () => recu };
}

describe("composerMessageAlerte", () => {
  it("nomme le statut, les compteurs, l'erreur et l'identifiant de journal", () => {
    const message = composerMessageAlerte(RESUME);

    expect(message).toContain("partiel");
    expect(message).toContain("nbLues=241");
    expect(message).toContain("nbInvalides=1");
    expect(message).toContain("date_rencontre : champ absent");
    expect(message).toContain(RESUME.journalId);
  });

  it("tronque un message d'erreur trop long au lieu de déverser tout le journal", () => {
    const long = "x".repeat(LONGUEUR_MESSAGE_ERREUR + 500);

    const message = composerMessageAlerte(resumeAvec({ messageErreur: long }));

    expect(message).toContain(`${"x".repeat(LONGUEUR_MESSAGE_ERREUR)}…`);
    expect(message).not.toContain("x".repeat(LONGUEUR_MESSAGE_ERREUR + 1));
  });

  it("dit explicitement qu'aucune erreur n'a été enregistrée plutôt que d'afficher « null »", () => {
    const message = composerMessageAlerte(resumeAvec({ messageErreur: null }));

    expect(message).toContain("aucun message d'erreur enregistré");
    expect(message).not.toContain("null");
  });
});

describe("creerAlerte", () => {
  it("poste sur le webhook un message lisible et les champs structurés", async () => {
    const webhook = webhookQuiRepond(204);
    const journal: string[] = [];

    await creerAlerte({
      env: { [NOM_VARIABLE_WEBHOOK]: URL_WEBHOOK },
      journaliserErreur: (message) => journal.push(message),
    })(RESUME);

    expect(webhook.corps()).toMatchObject({
      text: composerMessageAlerte(RESUME),
      content: composerMessageAlerte(RESUME),
      statut: "partiel",
      journalId: RESUME.journalId,
      compteurs: RESUME.compteurs,
    });
    // Envoi réussi : rien sur la sortie d'erreur.
    expect(journal).toEqual([]);
  });

  it("écrit sur la sortie d'erreur quand aucun webhook n'est configuré", async () => {
    const journal: string[] = [];

    await creerAlerte({ env: {}, journaliserErreur: (message) => journal.push(message) })(RESUME);

    expect(journal).toHaveLength(1);
    expect(journal[0]).toContain(RESUME.journalId);
    expect(journal[0]).toContain(`${NOM_VARIABLE_WEBHOOK} non configurée`);
  });

  it("traite une WEBHOOK_ALERTE vide comme absente au lieu d'appeler une URL vide", async () => {
    const journal: string[] = [];

    await creerAlerte({
      env: { [NOM_VARIABLE_WEBHOOK]: "   " },
      journaliserErreur: (message) => journal.push(message),
    })(RESUME);

    expect(journal[0]).toContain(`${NOM_VARIABLE_WEBHOOK} non configurée`);
  });

  it("signale sans lever un webhook qui refuse le message", async () => {
    webhookQuiRepond(500);
    const journal: string[] = [];

    const alerter = creerAlerte({
      env: { [NOM_VARIABLE_WEBHOOK]: URL_WEBHOOK },
      journaliserErreur: (message) => journal.push(message),
    });

    await expect(alerter(RESUME)).resolves.toBeUndefined();
    expect(journal).toHaveLength(1);
    expect(journal[0]).toContain("a répondu 500");
    // L'alerte perdue n'est pas perdue pour autant : le message y figure en entier.
    expect(journal[0]).toContain(RESUME.journalId);
  });

  it("signale sans lever un webhook injoignable", async () => {
    serveurMsw.use(http.post(URL_WEBHOOK, () => HttpResponse.error()));
    const journal: string[] = [];

    const alerter = creerAlerte({
      env: { [NOM_VARIABLE_WEBHOOK]: URL_WEBHOOK },
      journaliserErreur: (message) => journal.push(message),
    });

    await expect(alerter(RESUME)).resolves.toBeUndefined();
    expect(journal).toHaveLength(1);
    expect(journal[0]).toContain("injoignable");
    expect(journal[0]).toContain(RESUME.journalId);
  });

  it("retombe sur process.env et console.error quand rien n'est injecté", async () => {
    // Ce sont les valeurs par défaut qu'on éprouve : WEBHOOK_ALERTE n'est pas
    // définie dans l'environnement de test, l'alerte doit donc partir sur stderr.
    expect(process.env[NOM_VARIABLE_WEBHOOK]).toBeUndefined();
    const journalConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await creerAlerte()(RESUME);

    expect(journalConsole).toHaveBeenCalledWith(expect.stringContaining(RESUME.journalId));
    journalConsole.mockRestore();
  });
});

/**
 * Panne survenue **avant** l'ouverture du journal — base injoignable ou
 * `DATABASE_URL` absente. Constat de review : c'était la seule panne à ne
 * déclencher aucune alerte, alors que c'est la plus grave.
 */
describe("alerte de panne avant journalisation", () => {
  const PANNE = "getaddrinfo ENOTFOUND ep-cool-123.eu-central-1.aws.neon.tech";

  it("envoie l'alerte au webhook sans identifiant de journal", async () => {
    let corps: unknown;
    serveurMsw.use(
      http.post(URL_WEBHOOK, async ({ request }) => {
        corps = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await creerAlertePanne({ env: { [NOM_VARIABLE_WEBHOOK]: URL_WEBHOOK } })(PANNE);

    expect(corps).toMatchObject({ statut: "echec" });
    expect(JSON.stringify(corps)).toContain("panne avant journalisation");
  });

  it("masque le nom d'hôte de la base avant de l'envoyer à un tiers", async () => {
    // Le point entier du constat : une alerte part vers Slack ou Discord, où
    // elle reste dans l'historique du salon. Elle doit être assainie comme la
    // réponse HTTP.
    let corps = "";
    serveurMsw.use(
      http.post(URL_WEBHOOK, async ({ request }) => {
        corps = await request.text();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await creerAlertePanne({ env: { [NOM_VARIABLE_WEBHOOK]: URL_WEBHOOK } })(PANNE);

    expect(corps).not.toContain("neon.tech");
    expect(corps).toContain("hôte masqué");
  });

  it("écrit sur la sortie d'erreur quand aucun webhook n'est configuré", async () => {
    const journal: string[] = [];

    await creerAlertePanne({ env: {}, journaliserErreur: (texte) => journal.push(texte) })(PANNE);

    expect(journal).toHaveLength(1);
    expect(journal[0]).toContain(`${NOM_VARIABLE_WEBHOOK} non configurée`);
  });

  it("signale un webhook qui refuse, sans jamais rejeter", async () => {
    const journal: string[] = [];
    serveurMsw.use(http.post(URL_WEBHOOK, () => new HttpResponse("non", { status: 500 })));

    await expect(
      creerAlertePanne({
        env: { [NOM_VARIABLE_WEBHOOK]: URL_WEBHOOK },
        journaliserErreur: (texte) => journal.push(texte),
      })(PANNE),
    ).resolves.toBeUndefined();

    expect(journal[0]).toContain("refusé");
  });

  it("signale un webhook injoignable, sans jamais rejeter", async () => {
    const journal: string[] = [];

    await expect(
      creerAlertePanne({
        env: { [NOM_VARIABLE_WEBHOOK]: URL_WEBHOOK },
        envoyer: () => Promise.reject(new Error("réseau coupé")),
        journaliserErreur: (texte) => journal.push(texte),
      })(PANNE),
    ).resolves.toBeUndefined();

    expect(journal[0]).toContain("injoignable");
  });

  it("supporte un rejet qui n'est pas une Error", async () => {
    const journal: string[] = [];

    await creerAlertePanne({
      env: { [NOM_VARIABLE_WEBHOOK]: URL_WEBHOOK },
      // Même raison que ci-dessus : on vérifie que l'alerte encaisse un rejet
      // qui n'est pas une `Error`, ce qu'aucun code correct ne produit mais que
      // `fetch` d'une bibliothèque tierce peut très bien faire.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      envoyer: () => Promise.reject("panne brute"),
      journaliserErreur: (texte) => journal.push(texte),
    })(PANNE);

    expect(journal[0]).toContain("panne brute");
  });

  it("écrit sur console.error quand aucun journal n'est fourni", async () => {
    // La sortie par défaut, celle qui sert réellement en production : sans
    // dépendance injectée, l'alerte doit atterrir dans les journaux Vercel.
    const espion = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await creerAlertePanne({ env: {} })(PANNE);

    expect(espion).toHaveBeenCalledOnce();
    expect(espion.mock.calls[0]?.[0]).toContain("panne avant journalisation");
    espion.mockRestore();
  });

  it("reste lisible quand le message de panne est vide", async () => {
    const journal: string[] = [];

    await creerAlertePanne({ env: {}, journaliserErreur: (texte) => journal.push(texte) })("");

    expect(journal[0]).toContain("Erreur :");
  });
});
