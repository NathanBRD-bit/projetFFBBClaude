import { describe, expect, it } from "vitest";

import {
  ErreurValidationFfbb,
  schemaConfigurationFfbb,
  schemaJetonsFfbb,
  schemaOrganismeFfbb,
  schemaRencontreFfbb,
  schemaReponseOrganismes,
  schemaReponseRencontres,
  validerFfbb,
} from "@/infrastructure/ffbb/schemas";
import { chargerFixture } from "../../msw/ffbb";

/**
 * La frontière d'entrée du projet. Tout ce qui passe ces schémas est ensuite
 * traité comme fiable : si un garde-fou saute ici, une donnée FFBB malformée
 * arrive en base sans que rien ne l'arrête.
 *
 * Les documents testés sont les **réponses réelles** capturées par
 * `scripts/capturer-fixtures-ffbb.ts`, jamais des objets inventés.
 */

const configuration = chargerFixture("configuration.json");
const rencontresDuClub = chargerFixture("rencontres-club.json");
const organismes = chargerFixture("organisme-socl.json");

/** Renvoie le seul document de la fixture des rencontres du club. */
function rencontreReelle(): Record<string, unknown> {
  const reponse = validerFfbb(schemaReponseRencontres, rencontresDuClub, "fixture");
  const [premiere] = (rencontresDuClub as { hits: Record<string, unknown>[] }).hits;
  expect(reponse.hits).toHaveLength(1);
  if (premiere === undefined) throw new Error("fixture des rencontres vide");
  return premiere;
}

describe("schéma de la configuration FFBB", () => {
  it("accepte la réponse réelle et en extrait les deux jetons", () => {
    const valide = validerFfbb(schemaConfigurationFfbb, configuration, "configuration FFBB");

    expect(valide.data).toEqual({
      key_dh: "jeton-directus-factice-pour-les-tests",
      key_ms: "jeton-meilisearch-factice-pour-les-tests",
    });
  });

  it("ignore les champs inconnus du document plutôt que de rejeter la réponse", () => {
    // La réponse réelle porte une dizaine de champs (versions des applis…) que
    // nous n'utilisons pas. Les rejeter ferait tomber la synchronisation au
    // premier champ ajouté par la FFBB.
    const valide = validerFfbb(schemaConfigurationFfbb, configuration, "configuration FFBB");

    expect(Object.keys(valide.data)).toEqual(["key_dh", "key_ms"]);
  });

  it("refuse un jeton vide en nommant le champ fautif", () => {
    const sansJeton = { data: { key_dh: "abc", key_ms: "" } };

    expect(() =>
      validerFfbb(schemaConfigurationFfbb, sansJeton, "configuration FFBB"),
    ).toThrowError(/data\.key_ms/);
  });

  it("refuse une réponse qui n'est pas un objet, en nommant la racine", () => {
    expect(() =>
      validerFfbb(schemaConfigurationFfbb, "503 Service Unavailable", "config"),
    ).toThrowError(/\(racine\)/);
  });
});

describe("schéma d'une rencontre FFBB", () => {
  it("accepte la rencontre réelle du SOCL", () => {
    const rencontre = validerFfbb(schemaRencontreFfbb, rencontreReelle(), "rencontre");

    expect(rencontre.id).toBe("200000014681472");
    expect(rencontre.saison.code).toBe("26-27");
    expect(rencontre.idOrganismeEquipe2?.code).toBe("PDL0049077");
  });

  it("conserve les scores d'un match non joué à null, jamais à zéro", () => {
    const rencontre = validerFfbb(schemaRencontreFfbb, rencontreReelle(), "rencontre");

    expect(rencontre.joue).toBe(false);
    expect(rencontre.resultatEquipe1).toBeNull();
    expect(rencontre.resultatEquipe2).toBeNull();
  });

  it("accepte un score FFBB sous forme de chaîne d'entier", () => {
    const jouee = {
      ...rencontreReelle(),
      joue: true,
      resultatEquipe1: "71",
      resultatEquipe2: "83",
    };

    const rencontre = validerFfbb(schemaRencontreFfbb, jouee, "rencontre");

    expect(rencontre.resultatEquipe1).toBe("71");
  });

  it("rejette la rencontre entière si un score n'est pas un entier", () => {
    // Un « F » de forfait à la place d'un score doit être refusé : le laisser
    // passer produirait un score fantôme ou un 0 en base.
    const invalide = { ...rencontreReelle(), resultatEquipe1: "F" };

    expect(() =>
      validerFfbb(schemaRencontreFfbb, invalide, "rencontre 200000014681472"),
    ).toThrowError(/resultatEquipe1/);
  });

  it("accepte une rencontre sans salle ni géolocalisation", () => {
    // 240 documents sur 5 000 : plateau jeunes non domicilié. Cas normal.
    const sansSalle = { ...rencontreReelle(), salle: null, _geo: null };

    const rencontre = validerFfbb(schemaRencontreFfbb, sansSalle, "rencontre");

    expect(rencontre.salle).toBeNull();
  });

  it("accepte une rencontre dont un organisme est absent", () => {
    const sansOrganisme = { ...rencontreReelle(), idOrganismeEquipe1: null };

    const rencontre = validerFfbb(schemaRencontreFfbb, sansOrganisme, "rencontre");

    expect(rencontre.idOrganismeEquipe1).toBeNull();
  });

  it("rejette une date au mauvais format en nommant le champ", () => {
    const malDatee = { ...rencontreReelle(), date: "19/09/2026" };

    expect(() => validerFfbb(schemaRencontreFfbb, malDatee, "rencontre")).toThrowError(
      /^.*\bdate : date attendue au format AAAA-MM-JJ/,
    );
  });

  it("rejette une heure de rencontre sans le format ISO local attendu", () => {
    const malHeuree = { ...rencontreReelle(), date_rencontre: "2026-09-19 11:30" };

    expect(() => validerFfbb(schemaRencontreFfbb, malHeuree, "rencontre")).toThrowError(
      /date_rencontre/,
    );
  });

  it("nomme le chemin complet d'un champ imbriqué fautif", () => {
    const modele = rencontreReelle();
    const salleCassee = {
      ...modele,
      salle: { ...(modele.salle as Record<string, unknown>), cartographie: { ville: 49 } },
    };

    expect(() => validerFfbb(schemaRencontreFfbb, salleCassee, "rencontre")).toThrowError(
      /salle\.cartographie\.ville/,
    );
  });
});

describe("schéma d'un organisme FFBB", () => {
  it("accepte la fiche réelle du SOCL et ses engagements", () => {
    const reponse = validerFfbb(schemaReponseOrganismes, organismes, "organisme PDL0049077");
    const [socl] = reponse.hits;

    expect(socl?.code).toBe("PDL0049077");
    expect(socl?.engagements_codes).toContain("DMU11-4");
  });

  it("ne retient ni le courriel, ni le téléphone, ni le code d'emploi du club", () => {
    // Le site public n'en a aucun usage : ce qui n'entre pas dans le schéma
    // n'entre pas en base.
    const reponse = validerFfbb(schemaReponseOrganismes, organismes, "organisme PDL0049077");
    const [socl] = reponse.hits;

    expect(socl).not.toHaveProperty("mail");
    expect(socl).not.toHaveProperty("telephone");
    expect(socl).not.toHaveProperty("code_emploi");
  });

  it("accepte une fiche sans cartographie", () => {
    const [socl] = (organismes as { hits: Record<string, unknown>[] }).hits;
    if (socl === undefined) throw new Error("fixture organisme vide");

    const fiche = validerFfbb(schemaOrganismeFfbb, { ...socl, cartographie: null }, "organisme");

    expect(fiche.cartographie).toBeNull();
  });
});

describe("enveloppe de recherche Meilisearch", () => {
  it("expose le nombre de documents et la limite renvoyés par le serveur", () => {
    const reponse = validerFfbb(schemaReponseRencontres, rencontresDuClub, "rencontres");

    expect(reponse.limit).toBe(200);
    expect(reponse.offset).toBe(0);
    expect(reponse.estimatedTotalHits).toBe(1);
  });

  it("rejette l'enveloppe entière si un seul document est invalide", () => {
    // Pas d'import partiel : un document fautif dans une page de 200 fait
    // rejeter la page. C'est à T06 de décider quoi faire de ce rejet.
    const fixture = chargerFixture("rencontre-invalide.json");

    expect(() => validerFfbb(schemaReponseRencontres, fixture, "rencontres")).toThrowError(
      ErreurValidationFfbb,
    );
    expect(() => validerFfbb(schemaReponseRencontres, fixture, "rencontres")).toThrowError(
      /hits\.0\.resultatEquipe1/,
    );
  });

  it("accepte une page vide sans la confondre avec une erreur", () => {
    const reponse = validerFfbb(
      schemaReponseRencontres,
      chargerFixture("rencontres-vide.json"),
      "rencontres",
    );

    expect(reponse.hits).toEqual([]);
  });
});

describe("erreur de validation", () => {
  it("porte le contexte et la liste des problèmes, pas seulement un message", () => {
    let capturee: unknown;
    try {
      validerFfbb(schemaConfigurationFfbb, { data: {} }, "configuration FFBB");
    } catch (erreur) {
      capturee = erreur;
    }

    expect(capturee).toBeInstanceOf(ErreurValidationFfbb);
    const erreur = capturee as ErreurValidationFfbb;
    expect(erreur.contexte).toBe("configuration FFBB");
    expect(erreur.problemes).toHaveLength(2);
    expect(erreur.problemes.join(" ")).toMatch(/data\.key_dh/);
    expect(erreur.problemes.join(" ")).toMatch(/data\.key_ms/);
  });

  it("nomme « (racine) » quand l'erreur ne porte sur aucun champ précis", () => {
    // Une réponse qui n'est même pas un objet : le chemin Zod est vide, et un
    // message sans chemin serait illisible en journal.
    expect(() => validerFfbb(schemaJetonsFfbb, "pas un objet", "configuration")).toThrowError(
      /\(racine\)/,
    );
  });
});
