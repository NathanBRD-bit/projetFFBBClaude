import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { http, HttpResponse, type RequestHandler } from "msw";

import {
  INDEX_ORGANISMES,
  INDEX_RENCONTRES,
  URL_CONFIGURATION,
  URL_MEILISEARCH,
} from "@/infrastructure/ffbb/client";

/**
 * Outillage MSW pour l'API FFBB.
 *
 * Les fixtures sont les **réponses réelles** capturées une fois par
 * `scripts/capturer-fixtures-ffbb.ts` (les jetons y sont remplacés par des
 * valeurs factices). Aucun test ne fabrique de faux document à la main quand une
 * vraie réponse existe : un test qui valide un document inventé ne prouve rien
 * du format réel.
 */

const DOSSIER_FIXTURES = fileURLToPath(new URL("../fixtures/ffbb/", import.meta.url));

/**
 * Type d'un document JSON chargé depuis une fixture. `Record<string, unknown>`
 * et non `unknown` : c'est ce qu'attend `HttpResponse.json`, et cela évite un
 * `as` à chaque appel.
 */
export type DocumentJson = Record<string, unknown>;

export function chargerFixture(nomFichier: string): DocumentJson {
  return JSON.parse(readFileSync(`${DOSSIER_FIXTURES}${nomFichier}`, "utf8")) as DocumentJson;
}

export const URL_RECHERCHE_RENCONTRES = `${URL_MEILISEARCH}/indexes/${INDEX_RENCONTRES}/search`;
export const URL_RECHERCHE_ORGANISMES = `${URL_MEILISEARCH}/indexes/${INDEX_ORGANISMES}/search`;

/** `true` si l'en-tête ressemble à celui d'un navigateur, comme le teste la FFBB. */
function ressembleAUnNavigateur(userAgent: string | null): boolean {
  return userAgent !== null && userAgent.startsWith("Mozilla/");
}

/**
 * Reproduit le comportement **observé** de `api.ffbb.com` : 403 avec une page
 * HTML si le `User-Agent` n'est pas celui d'un navigateur, 200 sinon. C'est ce
 * qui permet de prouver que notre client envoie bien l'en-tête, au lieu de le
 * supposer.
 */
export function configurationExigeantUnNavigateur(): RequestHandler {
  return http.get(URL_CONFIGURATION, ({ request }) => {
    if (!ressembleAUnNavigateur(request.headers.get("user-agent"))) {
      return new HttpResponse("<html><body><h1>403 Forbidden</h1></body></html>", {
        status: 403,
        headers: { "content-type": "text/html" },
      });
    }
    return HttpResponse.json(chargerFixture("configuration.json"));
  });
}

/** Réponse fixe de la configuration, quand ce n'est pas elle que le test éprouve. */
export function configurationQuiRepond(): RequestHandler {
  return http.get(URL_CONFIGURATION, () => HttpResponse.json(chargerFixture("configuration.json")));
}

/** Réponse fixe de l'index des rencontres. */
export function rencontresQuiRepondent(fixture: DocumentJson): RequestHandler {
  return http.post(URL_RECHERCHE_RENCONTRES, () => HttpResponse.json(fixture));
}

/**
 * Enchaîne des réponses **dans l'ordre**, une par requête reçue. Sert à décrire
 * les scénarios de panne : « 429 puis succès », « 500 trois fois », « 401 puis
 * succès ». La dernière réponse est rejouée si le client insiste au-delà — ce
 * qui rend visible une boucle qu'on ne voulait pas.
 */
export function sequence(
  url: string,
  methode: "get" | "post",
  reponses: readonly (() => Response)[],
): { handler: RequestHandler; nombreAppels: () => number } {
  let appels = 0;
  const resoudre = (): Response => {
    const indice = Math.min(appels, reponses.length - 1);
    appels += 1;
    const fabrique = reponses[indice];
    if (fabrique === undefined) {
      throw new Error("séquence MSW vide : le test doit fournir au moins une réponse");
    }
    return fabrique();
  };
  const handler = methode === "get" ? http.get(url, resoudre) : http.post(url, resoudre);
  return { handler, nombreAppels: () => appels };
}

export const reponse429 = (): Response => new HttpResponse("Too Many Requests", { status: 429 });

export const reponse5xx = (): Response =>
  new HttpResponse("Bad Gateway: upstream connect error", { status: 502 });

export const reponse401 = (): Response =>
  new HttpResponse('{"message":"The provided API key is invalid.","code":"invalid_api_key"}', {
    status: 401,
    headers: { "content-type": "application/json" },
  });

export const reponse403 = (): Response =>
  new HttpResponse("<html><body><h1>403 Forbidden</h1></body></html>", {
    status: 403,
    headers: { "content-type": "text/html" },
  });

export const reponseJson = (valeur: DocumentJson): Response => HttpResponse.json(valeur);

/**
 * Compte les requêtes sortantes en enveloppant `fetch`. Nécessaire pour prouver
 * qu'après un 401 il y a **une seule** nouvelle tentative, et pas deux, ni une
 * boucle.
 */
export function fetchEspionne(): {
  fetch: typeof globalThis.fetch;
  nombreAppels: () => number;
} {
  let appels = 0;
  const reel = globalThis.fetch.bind(globalThis);
  return {
    fetch: (entree, init) => {
      appels += 1;
      return reel(entree, init);
    },
    nombreAppels: () => appels,
  };
}
