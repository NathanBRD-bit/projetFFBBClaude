import { describe, expect, it } from "vitest";

import {
  ErreurFusionFfbb,
  fusionner,
  type EtatActuelRencontre,
} from "@/infrastructure/ffbb/fusion";
import {
  normaliser,
  type ContexteNormalisation,
  type DocumentRencontreFfbb,
  type EngagementConnu,
  type RencontreNormalisee,
} from "@/infrastructure/ffbb/normalisation";
import { schemaRencontreFfbb, validerFfbb } from "@/infrastructure/ffbb/schemas";
import { chargerFixture } from "../../msw/ffbb";

/**
 * La fusion est le dernier rempart avant l'écriture : c'est elle qui décide de
 * ne rien écraser. Un test qui manque ici, et une saisie manuelle du club
 * disparaît au prochain import sans qu'aucune erreur ne soit levée.
 *
 * Les deux états comparés sont produits par la **vraie** normalisation, à partir
 * du document réel : fabriquer un `RencontreNormalisee` à la main ferait tester
 * la fusion contre une forme qui n'existe pas.
 */

const IDENTIFIANT_U11 = "11111111-1111-4111-8111-111111111111";
const LIBELLE_CLUB = "STADE OLYMPIQUE CANDE LOIRE BASKET";

const ENGAGEMENT: EngagementConnu = {
  equipeId: IDENTIFIANT_U11,
  saisonCodeFfbb: "26-27",
  libellesFfbb: [LIBELLE_CLUB],
};

const CONTEXTE: ContexteNormalisation = {
  codeClubFfbb: "PDL0049077",
  engagements: [ENGAGEMENT],
  maintenant: new Date("2026-09-16T08:00:00.000Z"),
};

function documentReel(): DocumentRencontreFfbb {
  const enveloppe = chargerFixture("rencontres-club.json") as { hits: unknown[] };
  const [premier] = enveloppe.hits;
  if (premier === undefined) throw new Error("fixture des rencontres du club vide");
  return validerFfbb(schemaRencontreFfbb, premier, "fixture rencontres-club");
}

/** La rencontre telle qu'elle est aujourd'hui dans l'index : à venir, sans score. */
function rencontreAVenir(): RencontreNormalisee {
  return normaliser(documentReel(), CONTEXTE);
}

/** La même rencontre une fois la feuille de marque remontée. */
function rencontreJouee(): RencontreNormalisee {
  return normaliser(
    { ...documentReel(), joue: true, resultatEquipe1: "52", resultatEquipe2: "61" },
    CONTEXTE,
  );
}

/** L'état en base correspondant à une rencontre déjà synchronisée. */
function etatDe(
  normalisee: RencontreNormalisee,
  champsVerrouilles: readonly string[] = [],
): EtatActuelRencontre {
  return {
    empreinteFfbb: normalisee.empreinteFfbb,
    champsVerrouilles,
    colonnes: normalisee.colonnes,
  };
}

describe("création", () => {
  it("crée la rencontre avec toutes ses colonnes quand la base ne la connaît pas", () => {
    const normalisee = rencontreAVenir();

    const resultat = fusionner(null, normalisee);

    expect(resultat.action).toBe("creer");
    expect(resultat.colonnes).toEqual({
      ...normalisee.colonnes,
      empreinteFfbb: normalisee.empreinteFfbb,
    });
    expect(resultat.conflits).toEqual([]);
  });
});

describe("empreinte inchangée", () => {
  it("ne produit aucune colonne quand l'empreinte est identique", () => {
    const normalisee = rencontreAVenir();

    const resultat = fusionner(etatDe(normalisee), normalisee);

    expect(resultat.action).toBe("inchange");
    expect(resultat.colonnes).toEqual({});
    expect(resultat.conflits).toEqual([]);
  });

  it("ne rouvre pas de conflit sur un champ verrouillé tant que la FFBB n'a pas bougé", () => {
    // Le score a été corrigé à la main puis verrouillé ; la FFBB, elle, n'a rien
    // republié. Signaler un conflit à chaque passage noierait les vrais.
    const normalisee = rencontreAVenir();
    const etat: EtatActuelRencontre = {
      empreinteFfbb: normalisee.empreinteFfbb,
      champsVerrouilles: ["scoreDomicile", "scoreExterieur"],
      colonnes: { ...normalisee.colonnes, scoreDomicile: 52, scoreExterieur: 61 },
    };

    const resultat = fusionner(etat, normalisee);

    expect(resultat.action).toBe("inchange");
    expect(resultat.conflits).toEqual([]);
  });
});

describe("mise à jour des colonnes libres", () => {
  it("n'écrit que les colonnes qui ont changé, plus l'empreinte", () => {
    const apres = rencontreJouee();

    const resultat = fusionner(etatDe(rencontreAVenir()), apres);

    expect(resultat.action).toBe("mettre_a_jour");
    expect(resultat.colonnes).toEqual({
      statut: "joue",
      scoreDomicile: 52,
      scoreExterieur: 61,
      empreinteFfbb: apres.empreinteFfbb,
    });
    expect(resultat.conflits).toEqual([]);
  });

  it("ne réécrit pas la date quand seul l'objet Date diffère, pas l'instant", () => {
    const avant = rencontreAVenir();
    const etat: EtatActuelRencontre = {
      empreinteFfbb: avant.empreinteFfbb,
      champsVerrouilles: [],
      // Même instant, autre objet : `===` répondrait « différent » à chaque import.
      colonnes: { ...avant.colonnes, dateHeure: new Date(avant.colonnes.dateHeure.getTime()) },
    };

    const resultat = fusionner(etat, rencontreJouee());

    expect(Object.keys(resultat.colonnes)).not.toContain("dateHeure");
  });

  it("met à jour une rencontre créée à la main, dont l'empreinte est nulle", () => {
    const normalisee = rencontreAVenir();
    const etat: EtatActuelRencontre = {
      empreinteFfbb: null,
      champsVerrouilles: [],
      colonnes: { ...normalisee.colonnes, statut: "score_manquant" },
    };

    const resultat = fusionner(etat, normalisee);

    expect(resultat.action).toBe("mettre_a_jour");
    expect(resultat.colonnes).toEqual({
      statut: "a_venir",
      empreinteFfbb: normalisee.empreinteFfbb,
    });
  });
});

describe("colonnes verrouillées", () => {
  it("produit un conflit et n'écrit rien quand un score verrouillé diverge", () => {
    const avant = rencontreAVenir();
    const apres = rencontreJouee();
    const etat: EtatActuelRencontre = {
      empreinteFfbb: avant.empreinteFfbb,
      champsVerrouilles: ["scoreDomicile"],
      colonnes: { ...avant.colonnes, scoreDomicile: 48 },
    };

    const resultat = fusionner(etat, apres);

    expect(resultat.conflits).toEqual([
      { champ: "scoreDomicile", valeurLocale: 48, valeurFfbb: 52 },
    ]);
    expect(Object.keys(resultat.colonnes)).not.toContain("scoreDomicile");
    // Les colonnes libres de la même rencontre, elles, sont bien écrites.
    expect(resultat.colonnes).toMatchObject({ statut: "joue", scoreExterieur: 61 });
  });

  it("ne produit pas de conflit sur une colonne verrouillée restée identique", () => {
    const etat = etatDe(rencontreAVenir(), ["slug", "dateHeure"]);

    const resultat = fusionner(etat, rencontreJouee());

    expect(resultat.conflits).toEqual([]);
    expect(resultat.action).toBe("mettre_a_jour");
  });

  it("protège un slug retouché à la main", () => {
    const avant = rencontreAVenir();
    const etat: EtatActuelRencontre = {
      empreinteFfbb: avant.empreinteFfbb,
      champsVerrouilles: ["slug"],
      colonnes: { ...avant.colonnes, slug: "derby-de-la-rentree" },
    };

    const resultat = fusionner(etat, rencontreJouee());

    expect(resultat.conflits).toEqual([
      {
        champ: "slug",
        valeurLocale: "derby-de-la-rentree",
        valeurFfbb: avant.colonnes.slug,
      },
    ]);
    expect(Object.keys(resultat.colonnes)).not.toContain("slug");
  });

  it("accepte un verrou posé sur une colonne éditoriale, sans effet", () => {
    const etat = etatDe(rencontreAVenir(), ["resumeMd", "affichePubliquement"]);

    const resultat = fusionner(etat, rencontreJouee());

    expect(resultat.action).toBe("mettre_a_jour");
    expect(resultat.conflits).toEqual([]);
  });

  it("refuse un nom de verrou qui ne correspond à aucune colonne", () => {
    // « score_domicile » au lieu de « scoreDomicile » : le verrou ne protégerait
    // rien et personne ne s'en apercevrait.
    const etat = etatDe(rencontreAVenir(), ["score_domicile"]);

    expect(() => fusionner(etat, rencontreJouee())).toThrow(ErreurFusionFfbb);
    expect(() => fusionner(etat, rencontreJouee())).toThrow(
      /champs_verrouilles contient « score_domicile »/,
    );
  });
});

describe("premier cercle : les colonnes éditoriales", () => {
  it("n'écrit jamais resume_md, même quand l'état actuel en porte un", () => {
    const avant = rencontreAVenir();
    const etat: EtatActuelRencontre = {
      empreinteFfbb: avant.empreinteFfbb,
      champsVerrouilles: [],
      colonnes: avant.colonnes,
      // @ts-expect-error — garde-fou de type : une colonne éditoriale ne peut pas
      // entrer dans la fusion. Si cette ligne compile un jour, le premier cercle
      // n'est plus tenu par le compilateur et ce test doit échouer.
      resumeMd: "Beau match des U11, portés par une défense de fer.",
    };

    const resultat = fusionner(etat, rencontreJouee());

    expect(Object.keys(resultat.colonnes)).not.toContain("resumeMd");
    expect(Object.keys(resultat.colonnes)).not.toContain("affichePubliquement");
  });
});
