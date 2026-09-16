import { describe, expect, it } from "vitest";

import {
  ErreurFusionFfbb,
  fusionner,
  type EtatActuelRencontre,
} from "@/infrastructure/ffbb/fusion";
import {
  desambiguiserCleNaturelle,
  desambiguiserSlug,
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

/** La même rencontre déclarée perdue par forfait de l'équipe recevante. */
function rencontreForfait(): RencontreNormalisee {
  return normaliser({ ...documentReel(), forfaitEquipe1: true }, CONTEXTE);
}

/**
 * La même rencontre vue par un back-office qui rattache le libellé FFBB à
 * l'équipe donnée — ou à aucune, quand `equipeId` vaut `null`.
 */
function rencontreRapprochee(equipeId: string | null): RencontreNormalisee {
  return normaliser(documentReel(), {
    ...CONTEXTE,
    engagements: equipeId === null ? [] : [{ ...ENGAGEMENT, equipeId }],
  });
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

describe("rien à écrire", () => {
  it("ne produit aucune colonne quand toutes les valeurs coïncident", () => {
    const normalisee = rencontreAVenir();

    const resultat = fusionner(etatDe(normalisee), normalisee);

    expect(resultat.action).toBe("inchange");
    expect(resultat.colonnes).toEqual({});
    expect(resultat.conflits).toEqual([]);
  });

  it("réconcilie une retouche manuelle non verrouillée, malgré une empreinte identique", () => {
    // Constat de review : l'empreinte décidait seule. Une colonne FFBB retouchée à
    // la main sans verrou n'était donc **jamais** réconciliée — la base gardait sa
    // valeur pour toujours, sans conflit ni trace.
    const normalisee = rencontreAVenir();
    const etat: EtatActuelRencontre = {
      empreinteFfbb: normalisee.empreinteFfbb,
      champsVerrouilles: [],
      colonnes: { ...normalisee.colonnes, statut: "score_manquant" },
    };

    const resultat = fusionner(etat, normalisee);

    expect(resultat.action).toBe("mettre_a_jour");
    expect(resultat.colonnes).toMatchObject({ statut: "a_venir" });
  });

  it("re-signale le conflit à chaque passage tant que la divergence persiste", () => {
    // Contrepartie assumée de la comparaison par valeurs : un conflit non résolu
    // revient à chaque synchronisation. T06 déduplique par l'index unique partiel
    // `conflit_synchronisation_ouvert_unique`, et une divergence non traitée doit
    // rester visible.
    const normalisee = rencontreAVenir();
    const etat: EtatActuelRencontre = {
      empreinteFfbb: normalisee.empreinteFfbb,
      champsVerrouilles: ["scoreDomicile", "scoreExterieur"],
      colonnes: { ...normalisee.colonnes, scoreDomicile: 52, scoreExterieur: 61 },
    };

    const resultat = fusionner(etat, normalisee);

    expect(resultat.conflits).toEqual([
      { champ: "scoreDomicile", valeurLocale: 52, valeurFfbb: null },
      { champ: "scoreExterieur", valeurLocale: 61, valeurFfbb: null },
    ]);
  });
});

describe("empreinte", () => {
  it("n'avance pas l'empreinte tant qu'un conflit reste ouvert", () => {
    // Constat de review : l'empreinte avançait malgré le refus d'écriture. En
    // déverrouillant le champ — le geste naturel pour dire « la FFBB a raison » —
    // l'administrateur obtenait un `inchange` au passage suivant, et la valeur FFBB
    // n'était jamais appliquée.
    const avant = rencontreAVenir();
    const apres = rencontreJouee();
    const etat: EtatActuelRencontre = {
      empreinteFfbb: avant.empreinteFfbb,
      champsVerrouilles: ["scoreDomicile"],
      colonnes: { ...avant.colonnes, scoreDomicile: 48, scoreExterieur: 61 },
    };

    const resultat = fusionner(etat, apres);

    expect(resultat.conflits).not.toEqual([]);
    expect(Object.keys(resultat.colonnes)).not.toContain("empreinteFfbb");
  });

  it("avance l'empreinte dès que toutes les colonnes divergentes ont pu être écrites", () => {
    const apres = rencontreJouee();

    const resultat = fusionner(etatDe(rencontreAVenir()), apres);

    expect(resultat.colonnes).toMatchObject({ empreinteFfbb: apres.empreinteFfbb });
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
      // Le verrou porte sur `scoreDomicile`, mais les deux scores sont
      // indissociables : le second est refusé lui aussi (voir plus bas).
      { champ: "scoreExterieur", valeurLocale: null, valeurFfbb: 61 },
    ]);
    expect(Object.keys(resultat.colonnes)).not.toContain("scoreDomicile");
    // Les colonnes libres de la même rencontre, elles, sont bien écrites.
    expect(resultat.colonnes).toMatchObject({ statut: "joue" });
  });

  it("ne produit pas de conflit sur une colonne verrouillée restée identique", () => {
    const etat = etatDe(rencontreAVenir(), ["slug", "dateHeure"]);

    const resultat = fusionner(etat, rencontreJouee());

    expect(resultat.conflits).toEqual([]);
    expect(resultat.action).toBe("mettre_a_jour");
  });

  it("laisse un slug retouché à la main, sans même ouvrir de conflit", () => {
    // Le verrou est accepté, mais il ne protège plus rien : le slug est écrit à
    // la création et jamais réécrit (voir « colonnes écrites une seule fois »).
    // Rien n'étant tenté, il n'y a rien à arbitrer.
    const avant = rencontreAVenir();
    const etat: EtatActuelRencontre = {
      empreinteFfbb: avant.empreinteFfbb,
      champsVerrouilles: ["slug"],
      colonnes: { ...avant.colonnes, slug: "derby-de-la-rentree" },
    };

    const resultat = fusionner(etat, rencontreJouee());

    expect(resultat.conflits).toEqual([]);
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

describe("l'état actuel décrit la vraie ligne", () => {
  it("traite un statut que la FFBB ne produit pas comme une divergence", () => {
    // `annule` et `a_confirmer` existent en base sans se déduire d'un document :
    // `a_confirmer` signale une rencontre disparue de l'index, `annule` une
    // décision humaine. Le type de l'état actuel les omettait — une rencontre
    // réapparue dans l'index serait restée `a_confirmer` sans que rien ne le dise.
    const normalisee = rencontreAVenir();
    const etat: EtatActuelRencontre = {
      empreinteFfbb: normalisee.empreinteFfbb,
      champsVerrouilles: [],
      colonnes: { ...normalisee.colonnes, statut: "a_confirmer" },
    };

    const resultat = fusionner(etat, normalisee);

    expect(resultat.colonnes).toMatchObject({ statut: "a_venir" });
  });

  it("renseigne les colonnes que la base laisse nulles", () => {
    // `numero`, `journee` et les deux libellés d'équipe sont nullables en base
    // (rencontre saisie à la main) mais ne l'étaient pas dans le type : l'état
    // d'une telle ligne était impossible à décrire.
    const normalisee = rencontreAVenir();
    const etat: EtatActuelRencontre = {
      empreinteFfbb: normalisee.empreinteFfbb,
      champsVerrouilles: [],
      colonnes: {
        ...normalisee.colonnes,
        numero: null,
        journee: null,
        nomEquipeDomicileFfbb: null,
        nomEquipeExterieurFfbb: null,
      },
    };

    const resultat = fusionner(etat, normalisee);

    expect(resultat.colonnes).toMatchObject({
      numero: normalisee.colonnes.numero,
      journee: normalisee.colonnes.journee,
      nomEquipeDomicileFfbb: normalisee.colonnes.nomEquipeDomicileFfbb,
      nomEquipeExterieurFfbb: normalisee.colonnes.nomEquipeExterieurFfbb,
    });
  });
});

describe("colonnes écrites une seule fois", () => {
  it("ne réécrit pas le slug quand la FFBB renomme l'organisme adverse", () => {
    // Constat de review : le slug dérive du nom d'organisme FFBB, que la
    // fédération retouche. Le réécrire changerait une URL publique déjà partagée,
    // sans redirection — les liens tomberaient en 404.
    const renomme = normaliser(
      {
        ...documentReel(),
        idOrganismeEquipe1: {
          id: "200000000067239",
          code: "PDL0049040",
          nom: "CHAZÉ-SUR-ARGOS BASKET",
          nom_simple: null,
          nomClubPro: "",
          logo: null,
        },
      },
      CONTEXTE,
    );
    const avant = rencontreAVenir();
    expect(renomme.colonnes.slug).not.toBe(avant.colonnes.slug);

    const resultat = fusionner(etatDe(avant), renomme);

    expect(Object.keys(resultat.colonnes)).not.toContain("slug");
    expect(resultat.action).toBe("inchange");
  });

  it("ne réémet pas une clé naturelle que T06 a désambiguïsée", () => {
    // Constat de review : la désambiguïsation n'était pas collante. Au passage
    // suivant, la fusion réémettait la valeur ambiguë, qui entrait en collision
    // avec l'index unique de la ligne sœur — l'aller-retour du même plateau.
    const normalisee = rencontreAVenir();
    const etat: EtatActuelRencontre = {
      empreinteFfbb: normalisee.empreinteFfbb,
      champsVerrouilles: [],
      colonnes: {
        ...normalisee.colonnes,
        cleNaturelle: desambiguiserCleNaturelle(
          normalisee.colonnes.cleNaturelle,
          normalisee.idFfbb,
        ),
        slug: desambiguiserSlug(normalisee.colonnes.slug, normalisee.idFfbb),
      },
    };

    const resultat = fusionner(etat, normalisee);

    expect(resultat.action).toBe("inchange");
    expect(resultat.conflits).toEqual([]);
  });

  it("les porte en revanche à la création", () => {
    const normalisee = rencontreAVenir();

    const resultat = fusionner(null, normalisee);

    expect(resultat.colonnes).toMatchObject({
      cleNaturelle: normalisee.colonnes.cleNaturelle,
      slug: normalisee.colonnes.slug,
    });
  });
});

describe("rattachement à une de nos équipes", () => {
  const AUTRE_EQUIPE = "22222222-2222-4222-8222-222222222222";

  it("renseigne le rattachement quand la base ne l'avait pas encore", () => {
    const resultat = fusionner(
      etatDe(rencontreRapprochee(null)),
      rencontreRapprochee(IDENTIFIANT_U11),
    );

    expect(resultat.colonnes).toMatchObject({ equipeId: IDENTIFIANT_U11 });
  });

  it("corrige un rattachement devenu faux", () => {
    const resultat = fusionner(
      etatDe(rencontreRapprochee(IDENTIFIANT_U11)),
      rencontreRapprochee(AUTRE_EQUIPE),
    );

    expect(resultat.colonnes).toMatchObject({ equipeId: AUTRE_EQUIPE });
  });

  it("n'efface jamais un rattachement que la FFBB ne sait plus faire", () => {
    // Constat de review : un libellé retiré d'un engagement au back-office, ou une
    // retouche du libellé côté FFBB, suffisait à repasser `equipe_id` à `null`.
    // Le match disparaissait alors de « les matchs de l'équipe », sans erreur.
    const resultat = fusionner(
      etatDe(rencontreRapprochee(IDENTIFIANT_U11)),
      rencontreRapprochee(null),
    );

    expect(Object.keys(resultat.colonnes)).not.toContain("equipeId");
    expect(resultat.conflits).toEqual([]);
  });
});

describe("groupes de colonnes indissociables", () => {
  it("refuse tout le groupe des scores quand un seul des deux est verrouillé", () => {
    // Constat de review : les verrous s'appliquaient colonne par colonne alors que
    // la base impose des contraintes **inter-colonnes**. Score domicile verrouillé
    // à 48 et résultat rétracté côté FFBB : `score_domicile` restait à 48 pendant
    // que `score_exterieur` repassait à `null`, la ligne violait
    // `rencontre_scores_ensemble` et la transaction de T06 échouait.
    const jouee = rencontreJouee();
    const etat: EtatActuelRencontre = {
      empreinteFfbb: jouee.empreinteFfbb,
      champsVerrouilles: ["scoreDomicile"],
      colonnes: { ...jouee.colonnes, scoreDomicile: 48 },
    };

    const resultat = fusionner(etat, rencontreAVenir());

    expect(resultat.conflits).toEqual([
      { champ: "scoreDomicile", valeurLocale: 48, valeurFfbb: null },
      { champ: "scoreExterieur", valeurLocale: 61, valeurFfbb: null },
    ]);
    expect(Object.keys(resultat.colonnes)).not.toContain("scoreExterieur");
    // Le groupe du statut, lui, n'est pas protégé : il suit la FFBB.
    expect(resultat.colonnes).toMatchObject({ statut: "a_venir" });
  });

  it("refuse tout le groupe du statut quand un seul forfait est verrouillé", () => {
    // Même raisonnement : `rencontre_forfait_declare` lie `statut` aux deux
    // drapeaux de forfait. Écrire `statut = 'joue'` en laissant
    // `forfait_domicile = true` produirait une ligne que personne ne sait lire.
    const forfait = rencontreForfait();
    const etat: EtatActuelRencontre = {
      empreinteFfbb: forfait.empreinteFfbb,
      champsVerrouilles: ["forfaitDomicile"],
      colonnes: forfait.colonnes,
    };

    const resultat = fusionner(etat, rencontreJouee());

    expect(resultat.conflits).toEqual([
      { champ: "statut", valeurLocale: "forfait", valeurFfbb: "joue" },
      { champ: "forfaitDomicile", valeurLocale: true, valeurFfbb: false },
    ]);
    expect(Object.keys(resultat.colonnes)).not.toContain("statut");
    // Les scores, eux, relèvent de l'autre groupe : ils sont bien écrits.
    expect(resultat.colonnes).toMatchObject({ scoreDomicile: 52, scoreExterieur: 61 });
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
