import { describe, expect, it } from "vitest";

import {
  desambiguiserCleNaturelle,
  desambiguiserSlug,
  ErreurNormalisationFfbb,
  normaliser,
  type ContexteNormalisation,
  type DocumentRencontreFfbb,
  type EngagementConnu,
} from "@/infrastructure/ffbb/normalisation";
import { schemaRencontreFfbb, validerFfbb } from "@/infrastructure/ffbb/schemas";
import { chargerFixture } from "../../msw/ffbb";

/**
 * La couche entre le document FFBB validé et la ligne de base. Elle décide du
 * statut, des scores, de l'heure réelle du match et du rattachement à nos
 * équipes : chacune de ces décisions est un endroit où une donnée fausse
 * passerait inaperçue jusqu'au site public.
 *
 * Le cas nominal part de la **rencontre réelle** capturée dans les fixtures. Les
 * cas limites (forfait, report, score manquant, bascule horaire) n'existent pas
 * dans cet échantillon : ils sont fabriqués **à partir** du document réel, en ne
 * changeant que le champ visé.
 */

const IDENTIFIANT_U11 = "11111111-1111-4111-8111-111111111111";
const IDENTIFIANT_U13 = "22222222-2222-4222-8222-222222222222";
const CODE_CLUB = "PDL0049077";
const LIBELLE_CLUB = "STADE OLYMPIQUE CANDE LOIRE BASKET";
const MAINTENANT = new Date("2026-09-16T08:00:00.000Z");

const ENGAGEMENT_U11: EngagementConnu = {
  equipeId: IDENTIFIANT_U11,
  saisonCodeFfbb: "26-27",
  libellesFfbb: [LIBELLE_CLUB, "SO CANDE LOIRE BASKET - 1"],
};

/** Le document réel du club, validé par le schéma de T04. */
function documentReel(): DocumentRencontreFfbb {
  const enveloppe = chargerFixture("rencontres-club.json") as { hits: unknown[] };
  const [premier] = enveloppe.hits;
  if (premier === undefined) throw new Error("fixture des rencontres du club vide");
  return validerFfbb(schemaRencontreFfbb, premier, "fixture rencontres-club");
}

/** Le document réel, avec quelques champs remplacés pour isoler un cas limite. */
function documentAvec(remplacements: Partial<DocumentRencontreFfbb>): DocumentRencontreFfbb {
  return { ...documentReel(), ...remplacements };
}

function contexteAvec(engagements: readonly EngagementConnu[]): ContexteNormalisation {
  return { codeClubFfbb: CODE_CLUB, engagements, maintenant: MAINTENANT };
}

const CONTEXTE = contexteAvec([ENGAGEMENT_U11]);

describe("normalisation de la rencontre réelle du club", () => {
  it("traduit le document FFBB en colonnes de la table rencontre", () => {
    const normalisee = normaliser(documentReel(), CONTEXTE);

    expect(normalisee.idFfbb).toBe("200000014681472");
    expect(normalisee.colonnes).toEqual({
      cleNaturelle:
        "26-27|dmu11-4|200000003058340|2026-09-19|chaze-sur-argos-2|stade-olympique-cande-loire-basket",
      slug: "2026-09-19-u11-masculins-chaze-sur-argos",
      saisonCodeFfbb: "26-27",
      competitionCodeFfbb: "DMU11-4",
      pouleCodeFfbb: "200000003058340",
      equipeId: IDENTIFIANT_U11,
      organismeDomicileCodeFfbb: "PDL0049040",
      organismeExterieurCodeFfbb: CODE_CLUB,
      nomEquipeDomicileFfbb: "CHAZE SUR ARGOS - 2",
      nomEquipeExterieurFfbb: LIBELLE_CLUB,
      salleCodeFfbb: "1001000139",
      dateHeure: new Date("2026-09-19T09:30:00.000Z"),
      heureConfirmee: true,
      numero: "200000003058340_1_3",
      journee: 1,
      statut: "a_venir",
      scoreDomicile: null,
      scoreExterieur: null,
      forfaitDomicile: false,
      forfaitExterieur: false,
    });
  });

  it("laisse les scores à null sur un match à venir, et surtout pas à 0", () => {
    const normalisee = normaliser(documentReel(), CONTEXTE);

    expect(normalisee.colonnes.scoreDomicile).toBeNull();
    expect(normalisee.colonnes.scoreExterieur).toBeNull();
    expect(normalisee.colonnes.scoreDomicile).not.toBe(0);
  });

  it("reporte l'instant injecté dans vu_dans_ffbb_le sans lire l'horloge", () => {
    const normalisee = normaliser(documentReel(), CONTEXTE);

    expect(normalisee.vuDansFfbbLe).toEqual(MAINTENANT);
  });

  it("extrait les références nécessaires au référentiel", () => {
    const normalisee = normaliser(documentReel(), CONTEXTE);

    expect(normalisee.references).toEqual({
      saison: { codeFfbb: "26-27" },
      competition: {
        idFfbb: "200000002898993",
        codeFfbb: "DMU11-4",
        nom: "Départementale masculine U11 - Division 4",
        categorie: "U11",
        niveau: "Départemental 4",
      },
      poule: { codeFfbb: "200000003058340", nom: "D 4A" },
      organismeDomicile: {
        codeFfbb: "PDL0049040",
        nom: "CHAZE SUR ARGOS",
        estLeClub: false,
      },
      organismeExterieur: { codeFfbb: CODE_CLUB, nom: LIBELLE_CLUB, estLeClub: true },
      salle: {
        codeFfbb: "1001000139",
        nom: "SALLE DE SPORT - LA CHAZEENNE",
        adresse: "Route de Vern",
        codePostal: "49500",
        ville: "Chazé-sur-Argos",
        latitude: 47.61002,
        longitude: -0.86751,
      },
    });
  });

  it("laisse la salle à null quand la FFBB ne domicilie pas la rencontre", () => {
    const normalisee = normaliser(documentAvec({ salle: null, _geo: null }), CONTEXTE);

    expect(normalisee.references.salle).toBeNull();
    expect(normalisee.colonnes.salleCodeFfbb).toBeNull();
  });
});

describe("dérivation du statut", () => {
  it("range en joué un match joué dont les deux scores sont remontés", () => {
    const normalisee = normaliser(
      documentAvec({ joue: true, resultatEquipe1: "71", resultatEquipe2: "64" }),
      CONTEXTE,
    );

    expect(normalisee.colonnes.statut).toBe("joue");
    expect(normalisee.colonnes.scoreDomicile).toBe(71);
    expect(normalisee.colonnes.scoreExterieur).toBe(64);
  });

  it("range en score_manquant un match joué dont la feuille n'a pas été remontée", () => {
    const normalisee = normaliser(
      documentAvec({ joue: true, resultatEquipe1: null, resultatEquipe2: null }),
      CONTEXTE,
    );

    expect(normalisee.colonnes.statut).toBe("score_manquant");
    expect(normalisee.colonnes.scoreDomicile).toBeNull();
  });

  it("garde un score de 0 comme une donnée, jamais comme une absence", () => {
    const normalisee = normaliser(
      documentAvec({ joue: true, resultatEquipe1: "0", resultatEquipe2: "58" }),
      CONTEXTE,
    );

    expect(normalisee.colonnes.scoreDomicile).toBe(0);
    expect(normalisee.colonnes.statut).toBe("joue");
  });

  it("refuse un score non numérique au lieu de produire un NaN", () => {
    const document = documentAvec({ joue: true, resultatEquipe1: "F", resultatEquipe2: "20" });

    expect(() => normaliser(document, CONTEXTE)).toThrow(ErreurNormalisationFfbb);
    expect(() => normaliser(document, CONTEXTE)).toThrow(
      /resultatEquipe1 n'est pas un entier : « F »/,
    );
  });

  it("refuse un match dont un seul des deux scores est renseigné", () => {
    const document = documentAvec({ joue: true, resultatEquipe1: "71", resultatEquipe2: null });

    expect(() => normaliser(document, CONTEXTE)).toThrow(/un seul des deux scores est renseigné/);
  });

  it("refuse un match non joué qui porte pourtant un score", () => {
    const document = documentAvec({ joue: false, resultatEquipe1: "71", resultatEquipe2: "64" });

    expect(() => normaliser(document, CONTEXTE)).toThrow(
      /non jouée \(joue = false\) portant le score 71-64 : combinaison inclassable/,
    );
  });

  it("range en reporté un match remis", () => {
    const normalisee = normaliser(documentAvec({ remise: true }), CONTEXTE);

    expect(normalisee.colonnes.statut).toBe("reporte");
    expect(normalisee.colonnes.scoreDomicile).toBeNull();
  });

  it("refuse un match à la fois remis et porteur d'un score", () => {
    const document = documentAvec({
      remise: true,
      joue: true,
      resultatEquipe1: "20",
      resultatEquipe2: "0",
    });

    expect(() => normaliser(document, CONTEXTE)).toThrow(
      /remise alors qu'elle porte un score : combinaison inclassable/,
    );
  });

  it("range en forfait un forfait de l'équipe recevante et nomme l'équipe fautive", () => {
    const normalisee = normaliser(documentAvec({ forfaitEquipe1: true }), CONTEXTE);

    expect(normalisee.colonnes.statut).toBe("forfait");
    expect(normalisee.colonnes.forfaitDomicile).toBe(true);
    expect(normalisee.colonnes.forfaitExterieur).toBe(false);
  });

  it("range en forfait un forfait de l'équipe visiteuse, score réglementaire compris", () => {
    const normalisee = normaliser(
      documentAvec({
        forfaitEquipe2: true,
        joue: true,
        resultatEquipe1: "20",
        resultatEquipe2: "0",
      }),
      CONTEXTE,
    );

    expect(normalisee.colonnes.statut).toBe("forfait");
    expect(normalisee.colonnes.forfaitExterieur).toBe(true);
    expect(normalisee.colonnes.scoreExterieur).toBe(0);
  });

  it("refuse un numéro de journée non numérique", () => {
    const document = documentAvec({ numeroJournee: "J1" });

    expect(() => normaliser(document, CONTEXTE)).toThrow(
      /numeroJournee n'est pas un entier : « J1 »/,
    );
  });
});

describe("conversion de l'heure locale Europe/Paris", () => {
  it("applique le décalage d'été à un match de septembre", () => {
    const normalisee = normaliser(
      documentAvec({ date_rencontre: "2026-09-19T11:30:00" }),
      CONTEXTE,
    );

    expect(normalisee.colonnes.dateHeure.toISOString()).toBe("2026-09-19T09:30:00.000Z");
  });

  it("applique le décalage d'hiver à un match de janvier", () => {
    const normalisee = normaliser(
      documentAvec({ date: "2026-01-10", date_rencontre: "2026-01-10T15:00:00" }),
      CONTEXTE,
    );

    expect(normalisee.colonnes.dateHeure.toISOString()).toBe("2026-01-10T14:00:00.000Z");
  });

  it("retient l'heure d'été sur une heure locale que la bascule d'automne rend ambiguë", () => {
    // Le 25/10/2026, 02:30 locale existe deux fois : 00:30 UTC en heure d'été,
    // puis 01:30 UTC en heure d'hiver. On retient la première occurrence.
    const normalisee = normaliser(
      documentAvec({ date: "2026-10-25", date_rencontre: "2026-10-25T02:30:00" }),
      CONTEXTE,
    );

    expect(normalisee.colonnes.dateHeure.toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("convertit correctement une heure postérieure à la bascule d'automne", () => {
    const normalisee = normaliser(
      documentAvec({ date: "2026-10-25", date_rencontre: "2026-10-25T14:00:00" }),
      CONTEXTE,
    );

    expect(normalisee.colonnes.dateHeure.toISOString()).toBe("2026-10-25T13:00:00.000Z");
  });

  it("refuse une heure locale que la bascule de printemps fait disparaître", () => {
    // Le 29/03/2026, on passe de 02:00 à 03:00 : 02:30 n'existe pas.
    const document = documentAvec({ date: "2026-03-29", date_rencontre: "2026-03-29T02:30:00" });

    expect(() => normaliser(document, CONTEXTE)).toThrow(
      /n'existe pas dans le fuseau Europe\/Paris/,
    );
  });

  it("marque l'heure comme non confirmée quand la FFBB ne publie qu'une date", () => {
    const normalisee = normaliser(
      documentAvec({ date_rencontre: "2026-09-19T00:00:00" }),
      CONTEXTE,
    );

    expect(normalisee.colonnes.heureConfirmee).toBe(false);
    expect(normalisee.colonnes.dateHeure.toISOString()).toBe("2026-09-18T22:00:00.000Z");
  });
});

describe("rapprochement avec nos équipes", () => {
  it("rattache la rencontre à l'équipe dont l'engagement porte le libellé exact", () => {
    const normalisee = normaliser(documentReel(), CONTEXTE);

    expect(normalisee.rapprochement).toEqual({
      cote: "exterieur",
      libelleFfbb: LIBELLE_CLUB,
      equipeId: IDENTIFIANT_U11,
      motifNonRapproche: null,
    });
  });

  it("laisse equipeId à null et signale la rencontre quand le libellé est inconnu", () => {
    const contexte = contexteAvec([
      { ...ENGAGEMENT_U11, libellesFfbb: ["SO CANDE LOIRE BASKET - 3"] },
    ]);

    const normalisee = normaliser(documentReel(), contexte);

    expect(normalisee.colonnes.equipeId).toBeNull();
    expect(normalisee.rapprochement.motifNonRapproche).toBe("libelle_non_rapproche");
    expect(normalisee.rapprochement.libelleFfbb).toBe(LIBELLE_CLUB);
  });

  it("ne rattache pas un engagement d'une autre saison", () => {
    const contexte = contexteAvec([{ ...ENGAGEMENT_U11, saisonCodeFfbb: "25-26" }]);

    const normalisee = normaliser(documentReel(), contexte);

    expect(normalisee.rapprochement.equipeId).toBeNull();
    expect(normalisee.rapprochement.motifNonRapproche).toBe("libelle_non_rapproche");
  });

  it("refuse de choisir quand deux engagements revendiquent le même libellé", () => {
    const contexte = contexteAvec([
      ENGAGEMENT_U11,
      { ...ENGAGEMENT_U11, equipeId: IDENTIFIANT_U13 },
    ]);

    expect(() => normaliser(documentReel(), contexte)).toThrow(
      /revendiqué par 2 engagements de la saison 26-27/,
    );
  });

  it("signale une rencontre où le club n'apparaît dans aucun organisme", () => {
    const autreClub = {
      id: "8849",
      code: "PDL0049099",
      nom: "SEGRE BASKET CLUB",
      nom_simple: null,
      nomClubPro: "",
      logo: null,
    };

    const normalisee = normaliser(documentAvec({ idOrganismeEquipe2: autreClub }), CONTEXTE);

    expect(normalisee.rapprochement).toEqual({
      cote: null,
      libelleFfbb: null,
      equipeId: null,
      motifNonRapproche: "club_absent_du_document",
    });
    // Sans « nous », il n'y a pas d'adversaire à désigner : le slug nomme les deux camps.
    expect(normalisee.colonnes.slug).toBe(
      "2026-09-19-u11-masculins-chaze-sur-argos-segre-basket-club",
    );
  });

  it("accepte une rencontre dont la FFBB ne publie aucun organisme", () => {
    const normalisee = normaliser(
      documentAvec({ idOrganismeEquipe1: null, idOrganismeEquipe2: null }),
      CONTEXTE,
    );

    expect(normalisee.rapprochement.motifNonRapproche).toBe("club_absent_du_document");
    expect(normalisee.colonnes.organismeDomicileCodeFfbb).toBeNull();
    expect(normalisee.colonnes.organismeExterieurCodeFfbb).toBeNull();
    expect(normalisee.references.organismeDomicile).toBeNull();
    // Faute d'organisme, le slug retombe sur les libellés d'équipe.
    expect(normalisee.colonnes.slug).toBe(
      "2026-09-19-u11-masculins-chaze-sur-argos-2-stade-olympique-cande-loire-basket",
    );
  });
});

describe("domicile et extérieur", () => {
  it("place le club à domicile quand c'est son code qui porte l'organisme recevant", () => {
    const document = documentReel();

    const normalisee = normaliser(
      {
        ...document,
        nomEquipe1: LIBELLE_CLUB,
        nomEquipe2: "CHAZE SUR ARGOS - 2",
        idOrganismeEquipe1: document.idOrganismeEquipe2,
        idOrganismeEquipe2: document.idOrganismeEquipe1,
      },
      CONTEXTE,
    );

    expect(normalisee.rapprochement.cote).toBe("domicile");
    expect(normalisee.colonnes.slug).toBe("2026-09-19-u11-masculins-chaze-sur-argos");
  });

  it("se fie au code d'organisme et non au libellé d'équipe", () => {
    // Libellé du club côté recevant, mais code d'organisme de l'adversaire :
    // c'est le code qui doit trancher, sinon un libellé homonyme suffirait à
    // nous faire jouer à domicile.
    const normalisee = normaliser(documentAvec({ nomEquipe1: LIBELLE_CLUB }), CONTEXTE);

    expect(normalisee.rapprochement.cote).toBe("exterieur");
  });
});

describe("clé naturelle et slug", () => {
  it("compose la clé naturelle sans id_ffbb, pour rester un détecteur de renumérotation", () => {
    const normalisee = normaliser(documentReel(), CONTEXTE);

    expect(normalisee.colonnes.cleNaturelle).not.toContain(normalisee.idFfbb);
    expect(normalisee.colonnes.cleNaturelle.split("|")).toEqual([
      "26-27",
      "dmu11-4",
      "200000003058340",
      "2026-09-19",
      "chaze-sur-argos-2",
      "stade-olympique-cande-loire-basket",
    ]);
  });

  it("ne change pas de clé naturelle sur une retouche cosmétique du libellé FFBB", () => {
    const reference = normaliser(documentReel(), CONTEXTE).colonnes.cleNaturelle;

    const retouche = normaliser(documentAvec({ nomEquipe1: "Chazé sur Argos  2" }), CONTEXTE)
      .colonnes.cleNaturelle;

    expect(retouche).toBe(reference);
  });

  it("refuse un libellé qui ne laisse aucun caractère exploitable", () => {
    const document = documentAvec({ nomEquipe1: "--- ---" });

    expect(() => normaliser(document, CONTEXTE)).toThrow(
      /nomEquipe1 ne contient aucun caractère exploitable/,
    );
  });

  it("met le sexe de la compétition au pluriel dans le slug", () => {
    const document = documentReel();
    const feminine = {
      ...document,
      competitionId: { ...document.competitionId, sexe: "Féminin" },
    };

    expect(normaliser(feminine, CONTEXTE).colonnes.slug).toBe(
      "2026-09-19-u11-feminines-chaze-sur-argos",
    );
  });

  it("garde un sexe inattendu tel quel plutôt que d'échouer sur un libellé de slug", () => {
    const document = documentReel();
    const inattendu = {
      ...document,
      competitionId: { ...document.competitionId, sexe: "Non genré" },
    };

    expect(normaliser(inattendu, CONTEXTE).colonnes.slug).toBe(
      "2026-09-19-u11-non-genre-chaze-sur-argos",
    );
  });

  it("ajoute id_ffbb en dernier recours pour départager deux clés identiques", () => {
    expect(desambiguiserCleNaturelle("26-27|dmu11-4|1|2026-09-19|a|b", "200000014681472")).toBe(
      "26-27|dmu11-4|1|2026-09-19|a|b|200000014681472",
    );
    expect(desambiguiserSlug("2026-09-19-u11-masculins-chaze-sur-argos", "200000014681472")).toBe(
      "2026-09-19-u11-masculins-chaze-sur-argos-200000014681472",
    );
  });
});

describe("empreinte FFBB", () => {
  it("ne dépend pas de l'ordre des clés du document JSON", () => {
    const enveloppe = chargerFixture("rencontres-club.json") as {
      hits: Record<string, unknown>[];
    };
    const [premier] = enveloppe.hits;
    if (premier === undefined) throw new Error("fixture des rencontres du club vide");
    const permute = Object.fromEntries(Object.entries(premier).reverse());

    const empreinteOrigine = normaliser(documentReel(), CONTEXTE).empreinteFfbb;
    const empreintePermutee = normaliser(
      validerFfbb(schemaRencontreFfbb, permute, "fixture permutée"),
      CONTEXTE,
    ).empreinteFfbb;

    expect(empreintePermutee).toBe(empreinteOrigine);
  });

  it("ignore les champs FFBB que nous n'utilisons pas", () => {
    const document = documentReel();
    const bruit = normaliser(
      {
        ...document,
        officiels: [
          { ordre: 1, fonction: { libelle: "Arbitre" }, officiel: { nom: "N", prenom: "P" } },
        ],
        modification_timestamp: 1788266294000,
        creation_timestamp: 1787907255000,
        handicap1: 4,
        url_competition: "/autre/chemin/200000014681472",
        pratique: null,
      },
      CONTEXTE,
    );

    expect(bruit.empreinteFfbb).toBe(normaliser(document, CONTEXTE).empreinteFfbb);
  });

  it("change dès qu'une colonne que nous écrivons change", () => {
    const avant = normaliser(documentReel(), CONTEXTE).empreinteFfbb;
    const apres = normaliser(
      documentAvec({ joue: true, resultatEquipe1: "71", resultatEquipe2: "64" }),
      CONTEXTE,
    ).empreinteFfbb;

    expect(apres).not.toBe(avant);
  });

  it("change quand le rapprochement d'équipe change", () => {
    const rapproche = normaliser(documentReel(), CONTEXTE).empreinteFfbb;
    const nonRapproche = normaliser(documentReel(), contexteAvec([])).empreinteFfbb;

    expect(nonRapproche).not.toBe(rapproche);
  });

  it("est un SHA-256 hexadécimal", () => {
    expect(normaliser(documentReel(), CONTEXTE).empreinteFfbb).toMatch(/^[0-9a-f]{64}$/);
  });
});
