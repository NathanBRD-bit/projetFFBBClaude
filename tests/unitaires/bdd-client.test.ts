import { afterEach, describe, expect, it } from "vitest";

import {
  creerBaseNeon,
  creerPoolNeon,
  definirBaseCourante,
  lireUrlBaseDeDonnees,
  MESSAGE_DATABASE_URL_ABSENTE,
  obtenirBase,
  reinitialiserBaseCourante,
  type BaseDeDonnees,
} from "@/infrastructure/bdd/client";

/**
 * Le client de base de données ne doit **jamais** masquer une configuration absente.
 * C'est le seul endroit du code qui lit `DATABASE_URL` : si le garde-fou saute ici,
 * l'application démarre avec une base fantôme et échoue beaucoup plus loin.
 *
 * Aucun test de ce fichier n'ouvre de connexion : construire un pool Neon ne contacte
 * rien tant qu'aucune requête n'est envoyée.
 */
describe("client de base de données", () => {
  const URL_FACTICE = "postgresql://utilisateur:secret@hote.invalid/base?sslmode=require";

  afterEach(() => {
    reinitialiserBaseCourante();
  });

  it("renvoie l'URL quand la variable d'environnement est renseignée", () => {
    const url = lireUrlBaseDeDonnees({ DATABASE_URL: URL_FACTICE });

    expect(url).toBe(URL_FACTICE);
  });

  it("échoue immédiatement si DATABASE_URL est absente", () => {
    expect(() => lireUrlBaseDeDonnees({})).toThrowError(MESSAGE_DATABASE_URL_ABSENTE);
  });

  it("échoue aussi si DATABASE_URL est vide, plutôt que de passer une chaîne vide au driver", () => {
    expect(() => lireUrlBaseDeDonnees({ DATABASE_URL: "   " })).toThrowError(
      MESSAGE_DATABASE_URL_ABSENTE,
    );
  });

  it("construit une instance Drizzle sur un pool Neon sans ouvrir de connexion", async () => {
    const pool = creerPoolNeon(URL_FACTICE);

    const base = creerBaseNeon(pool);

    expect(typeof base.select).toBe("function");
    await pool.end();
  });

  it("réutilise la même instance d'un appel à l'autre", () => {
    const precedent = process.env.DATABASE_URL;
    process.env.DATABASE_URL = URL_FACTICE;
    try {
      expect(obtenirBase()).toBe(obtenirBase());
    } finally {
      if (precedent === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = precedent;
    }
  });

  it("propage l'erreur de configuration au premier accès réel à la base", () => {
    const precedent = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(() => obtenirBase()).toThrowError(MESSAGE_DATABASE_URL_ABSENTE);
    } finally {
      if (precedent !== undefined) process.env.DATABASE_URL = precedent;
    }
  });

  it("utilise l'instance injectée par les tests d'intégration plutôt que Neon", () => {
    // `definirBaseCourante` est le point par lequel PGlite entre en jeu : sans lui,
    // les tests devraient connaître le driver, ce que le reste du code ignore.
    const injectee = { marqueur: "pglite" } as unknown as BaseDeDonnees;

    definirBaseCourante(injectee);

    expect(obtenirBase()).toBe(injectee);
  });
});
