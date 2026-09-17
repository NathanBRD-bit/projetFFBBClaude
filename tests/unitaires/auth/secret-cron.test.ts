import { describe, expect, it } from "vitest";

import {
  egalEnTempsConstant,
  MESSAGE_SECRET_NON_CONFIGURE,
  verifierSecretCron,
} from "@/auth/secret-cron";

/**
 * Authentification du cron. Module critique au sens de docs/qualite.md : seuil de
 * couverture à 100 %, et chaque motif de refus vérifié un par un — un 401 qui
 * refuse pour la mauvaise raison envoie l'équipe chercher au mauvais endroit.
 */

const SECRET = "un-secret-de-cron-suffisamment-long-0123456789";
const ENV = { CRON_SECRET: SECRET } as const;

describe("verifierSecretCron", () => {
  it("accepte l'en-tête Bearer portant exactement le secret configuré", () => {
    const verification = verifierSecretCron(`Bearer ${SECRET}`, ENV);

    expect(verification).toStrictEqual({ autorise: true });
  });

  it("accepte le schéma écrit en minuscules, insensible à la casse comme l'exige HTTP", () => {
    const verification = verifierSecretCron(`bearer ${SECRET}`, ENV);

    expect(verification.autorise).toBe(true);
  });

  it("refuse en nommant la variable manquante quand CRON_SECRET est absente", () => {
    const verification = verifierSecretCron(`Bearer ${SECRET}`, {});

    expect(verification).toStrictEqual({
      autorise: false,
      motif: "secret_non_configure",
      explication: MESSAGE_SECRET_NON_CONFIGURE,
    });
  });

  it("traite une CRON_SECRET vide comme absente, et non comme un secret valide", () => {
    // Sans ce test, `Authorization: Bearer ` ouvrirait la route sur un
    // environnement où la variable est déclarée sans valeur.
    const verification = verifierSecretCron("Bearer ", { CRON_SECRET: "   " });

    expect(verification).toMatchObject({ autorise: false, motif: "secret_non_configure" });
  });

  it("refuse un appel sans en-tête Authorization", () => {
    const verification = verifierSecretCron(null, ENV);

    expect(verification).toMatchObject({ autorise: false, motif: "en_tete_absent" });
  });

  it("refuse un en-tête qui n'est pas au schéma Bearer", () => {
    const verification = verifierSecretCron(`Basic ${SECRET}`, ENV);

    expect(verification).toMatchObject({ autorise: false, motif: "schema_inattendu" });
  });

  it("refuse un mauvais secret de même longueur", () => {
    const faux = `${SECRET.slice(0, -1)}X`;

    const verification = verifierSecretCron(`Bearer ${faux}`, ENV);

    expect(verification).toMatchObject({ autorise: false, motif: "secret_invalide" });
  });

  it("refuse un secret plus court sans lever, là où timingSafeEqual lèverait", () => {
    // Le cas le plus courant en production : deux secrets qui n'ont pas la même
    // longueur. Une comparaison naïve planterait en 500 au lieu de refuser en 401.
    const verification = verifierSecretCron("Bearer trop-court", ENV);

    expect(verification).toMatchObject({ autorise: false, motif: "secret_invalide" });
  });

  it("refuse un en-tête Bearer sans valeur", () => {
    const verification = verifierSecretCron("Bearer ", ENV);

    expect(verification).toMatchObject({ autorise: false, motif: "secret_invalide" });
  });

  it("ne révèle jamais le secret attendu dans l'explication d'un refus", () => {
    const verification = verifierSecretCron("Bearer mauvais", ENV);

    expect(verification.autorise).toBe(false);
    if (!verification.autorise) {
      expect(verification.explication).not.toContain(SECRET);
    }
  });

  it("lit process.env quand aucun environnement n'est fourni", () => {
    // `CRON_SECRET` n'est pas définie dans l'environnement de test : le refus
    // prouve que c'est bien `process.env` qui a été consulté.
    expect(process.env.CRON_SECRET).toBeUndefined();

    expect(verifierSecretCron("Bearer peu importe")).toMatchObject({
      motif: "secret_non_configure",
    });
  });
});

describe("egalEnTempsConstant", () => {
  it("reconnaît deux chaînes identiques", () => {
    expect(egalEnTempsConstant(SECRET, SECRET)).toBe(true);
  });

  it("distingue deux chaînes de longueurs différentes sans lever", () => {
    expect(() => egalEnTempsConstant("a", "abcdefghij")).not.toThrow();
    expect(egalEnTempsConstant("a", "abcdefghij")).toBe(false);
  });

  it("distingue deux chaînes vides d'une chaîne non vide", () => {
    expect(egalEnTempsConstant("", "")).toBe(true);
    expect(egalEnTempsConstant("", SECRET)).toBe(false);
  });
});
