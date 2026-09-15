import { describe, expect, it } from "vitest";
import {
  accorder,
  decouperParagraphes,
  descriptionMatch,
  estJouee,
  formaterDateSansJourSemaine,
  formaterPoints,
  intituleMatch,
  libelleSaison,
  lienCarte,
  lienFiltre,
  lireParametre,
  meilleurTotal,
  messageForfait,
  ordreAffichage,
  rencontresJouees,
  resoudreEquipe,
  resoudreSaison,
} from "@/composants/public/match-outils";
import { EQUIPE_SF1, EQUIPE_SM1, construireRencontre } from "../fixtures/matchs";

describe("estJouee", () => {
  it("retient un match au statut « joue »", () => {
    expect(estJouee(construireRencontre({ statut: "joue" }))).toBe(true);
  });

  it("retient un forfait, qui compte au classement même s'il n'a pas été disputé", () => {
    expect(estJouee(construireRencontre({ statut: "forfait" }))).toBe(true);
  });

  it("écarte les matchs à venir, reportés et annulés", () => {
    expect(estJouee(construireRencontre({ statut: "a_venir" }))).toBe(false);
    expect(estJouee(construireRencontre({ statut: "reporte" }))).toBe(false);
    expect(estJouee(construireRencontre({ statut: "annule" }))).toBe(false);
  });
});

describe("rencontresJouees", () => {
  it("trie du plus récent au plus ancien et ne garde que les matchs tranchés", () => {
    const ancien = construireRencontre({
      id: "ancien",
      dateHeure: "2026-04-11T14:00:00+02:00",
      statut: "joue",
    });
    const recent = construireRencontre({
      id: "recent",
      dateHeure: "2026-05-16T20:30:00+02:00",
      statut: "joue",
    });
    const forfait = construireRencontre({
      id: "forfait",
      dateHeure: "2026-05-01T20:30:00+02:00",
      statut: "forfait",
    });
    const aVenir = construireRencontre({ id: "a-venir", statut: "a_venir" });

    const resultat = rencontresJouees([ancien, aVenir, recent, forfait]);

    expect(resultat.map((rencontre) => rencontre.id)).toEqual(["recent", "forfait", "ancien"]);
  });

  it("renvoie une liste vide quand rien n'a été joué", () => {
    expect(rencontresJouees([construireRencontre({ statut: "a_venir" })])).toEqual([]);
  });
});

describe("lireParametre", () => {
  it("renvoie null quand le paramètre est absent", () => {
    expect(lireParametre(undefined)).toBeNull();
  });

  it("renvoie null quand le paramètre est vide ou seulement des espaces", () => {
    expect(lireParametre("")).toBeNull();
    expect(lireParametre("   ")).toBeNull();
  });

  it("nettoie les espaces autour d'une valeur simple", () => {
    expect(lireParametre("  u18-feminines ")).toBe("u18-feminines");
  });

  it("recompose une valeur répétée au lieu d'en choisir une en silence", () => {
    expect(lireParametre(["a", "b"])).toBe("a,b");
  });
});

describe("resoudreEquipe", () => {
  it("renvoie « toutes » quand aucun slug n'est demandé", () => {
    expect(resoudreEquipe([EQUIPE_SM1], null)).toEqual({ etat: "toutes" });
  });

  it("renvoie l'équipe correspondant au slug", () => {
    expect(resoudreEquipe([EQUIPE_SM1, EQUIPE_SF1], "seniors-feminines-1")).toEqual({
      etat: "trouvee",
      equipe: EQUIPE_SF1,
    });
  });

  it("signale un slug inconnu au lieu de retomber sur « toutes »", () => {
    expect(resoudreEquipe([EQUIPE_SM1], "equipe-de-france")).toEqual({
      etat: "inconnue",
      slug: "equipe-de-france",
    });
  });
});

describe("resoudreSaison", () => {
  it("retombe sur la saison par défaut quand aucune n'est demandée", () => {
    expect(resoudreSaison(["26-27", "25-26"], null, "26-27")).toEqual({
      etat: "trouvee",
      saison: "26-27",
    });
  });

  it("accepte une saison publiée", () => {
    expect(resoudreSaison(["26-27", "25-26"], "25-26", "26-27")).toEqual({
      etat: "trouvee",
      saison: "25-26",
    });
  });

  it("signale une saison absente de la liste", () => {
    expect(resoudreSaison(["26-27", "25-26"], "12-13", "26-27")).toEqual({
      etat: "inconnue",
      code: "12-13",
    });
  });
});

describe("libelleSaison", () => {
  it("développe le code FFBB en années complètes", () => {
    expect(libelleSaison("26-27")).toBe("2026-2027");
  });

  it("refuse bruyamment un code hors format plutôt que d'afficher n'importe quoi", () => {
    expect(() => libelleSaison("2026")).toThrow(RangeError);
  });
});

describe("lienFiltre", () => {
  it("renvoie l'URL nue quand aucun filtre n'est actif", () => {
    expect(lienFiltre("/resultats", { saison: null, equipe: null })).toBe("/resultats");
  });

  it("conserve les filtres actifs et omet ceux à null", () => {
    expect(lienFiltre("/resultats", { saison: "25-26", equipe: null })).toBe(
      "/resultats?saison=25-26",
    );
  });

  it("encode les deux filtres quand ils sont présents", () => {
    expect(lienFiltre("/resultats", { saison: "25-26", equipe: "u18-feminines" })).toBe(
      "/resultats?saison=25-26&equipe=u18-feminines",
    );
  });
});

describe("lienCarte", () => {
  it("construit une recherche OpenStreetMap à partir de l'adresse et de la ville", () => {
    const lien = lienCarte({
      nom: "Complexe Sportif R. Loison",
      adresse: "Allée Pierre Charpentier",
      ville: "Candé",
    });

    expect(lien).toBe(
      "https://www.openstreetmap.org/search?query=All%C3%A9e%20Pierre%20Charpentier%2C%20Cand%C3%A9",
    );
  });
});

describe("formaterPoints", () => {
  it("affiche un tiret quand la ligne n'a pas été saisie", () => {
    expect(formaterPoints(null)).toBe("—");
  });

  it("affiche zéro quand le joueur a réellement marqué zéro point", () => {
    expect(formaterPoints(0)).toBe("0");
  });

  it("affiche le total tel quel", () => {
    expect(formaterPoints(17)).toBe("17");
  });
});

describe("meilleurTotal", () => {
  it("renvoie le plus haut total saisi", () => {
    expect(meilleurTotal([{ points: 12 }, { points: 17 }, { points: null }])).toBe(17);
  });

  it("renvoie null quand aucune ligne n'est saisie", () => {
    expect(meilleurTotal([{ points: null }, { points: null }])).toBeNull();
  });

  it("ne désigne pas de meilleur marqueur quand tout le monde est à zéro", () => {
    expect(meilleurTotal([{ points: 0 }, { points: 0 }])).toBeNull();
  });

  it("renvoie null sur une liste vide", () => {
    expect(meilleurTotal([])).toBeNull();
  });
});

describe("decouperParagraphes", () => {
  it("découpe sur les lignes vides et supprime les blancs superflus", () => {
    expect(decouperParagraphes("Premier.\n\n  Deuxième.  \n\n\nTroisième.")).toEqual([
      "Premier.",
      "Deuxième.",
      "Troisième.",
    ]);
  });

  it("renvoie un seul paragraphe quand il n'y a pas de ligne vide", () => {
    expect(decouperParagraphes("Une seule phrase.")).toEqual(["Une seule phrase."]);
  });

  it("renvoie une liste vide pour un texte blanc", () => {
    expect(decouperParagraphes("   \n\n  ")).toEqual([]);
  });
});

describe("ordreAffichage", () => {
  it("place le club à gauche quand il reçoit", () => {
    const rencontre = construireRencontre({ domicile: true, scoreNous: 74, scoreAdversaire: 61 });

    const { recevant, visiteur } = ordreAffichage(rencontre);

    expect(recevant).toEqual({ nom: "SOCL", score: 74, estNous: true });
    expect(visiteur).toEqual({ nom: "Pouancé Basket", score: 61, estNous: false });
  });

  it("place l'adversaire à gauche quand le club se déplace", () => {
    const rencontre = construireRencontre({ domicile: false, scoreNous: 58, scoreAdversaire: 66 });

    const { recevant, visiteur } = ordreAffichage(rencontre);

    expect(recevant).toEqual({ nom: "Pouancé Basket", score: 66, estNous: false });
    expect(visiteur).toEqual({ nom: "SOCL", score: 58, estNous: true });
  });
});

describe("intituleMatch", () => {
  it("nomme le match dans l'ordre recevant puis visiteur", () => {
    expect(intituleMatch(construireRencontre({ domicile: true }))).toBe("SOCL – Pouancé Basket");
    expect(intituleMatch(construireRencontre({ domicile: false }))).toBe("Pouancé Basket – SOCL");
  });
});

describe("formaterDateSansJourSemaine", () => {
  it("formate la date en heure de Paris, sans le jour de la semaine", () => {
    expect(formaterDateSansJourSemaine("2026-09-19T20:30:00+02:00")).toBe("19 septembre 2026");
  });
});

describe("messageForfait", () => {
  it("ne dit rien sur un match normal", () => {
    expect(messageForfait(construireRencontre({ statut: "joue" }))).toBeNull();
  });

  it("signale le forfait de l'adversaire quand le club l'emporte", () => {
    const message = messageForfait(
      construireRencontre({ statut: "forfait", scoreNous: 20, scoreAdversaire: 0 }),
    );

    expect(message).toContain("l'adversaire a déclaré forfait");
  });

  it("signale le forfait du club quand il perd sur tapis vert", () => {
    const message = messageForfait(
      construireRencontre({ statut: "forfait", scoreNous: 0, scoreAdversaire: 20 }),
    );

    expect(message).toContain("le club a déclaré forfait");
  });

  it("reste prudent quand le score administratif ne désigne pas de vainqueur", () => {
    const message = messageForfait(
      construireRencontre({ statut: "forfait", scoreNous: null, scoreAdversaire: null }),
    );

    expect(message).toBe("Match non joué : forfait déclaré. Le score est administratif.");
  });
});

describe("accorder", () => {
  it("garde le singulier à un", () => {
    expect(accorder(1, "victoire")).toBe("1 victoire");
  });

  it("garde le singulier à zéro, comme le veut l'usage en français", () => {
    expect(accorder(0, "victoire")).toBe("0 victoire");
  });

  it("met au pluriel au-delà de un", () => {
    expect(accorder(3, "victoire")).toBe("3 victoires");
  });

  it("accepte un pluriel irrégulier", () => {
    expect(accorder(2, "match", "matchs")).toBe("2 matchs");
  });
});

describe("descriptionMatch", () => {
  it("annonce le résultat d'un match joué", () => {
    const rencontre = construireRencontre({
      statut: "joue",
      domicile: true,
      scoreNous: 74,
      scoreAdversaire: 61,
      journee: 22,
      dateHeure: "2026-05-16T20:30:00+02:00",
    });

    expect(descriptionMatch(rencontre, EQUIPE_SM1)).toBe(
      "Seniors Masculins 1 · Départementale masculine seniors - Division 5, journée 22. " +
        "Résultat du 16 mai 2026 : SOCL 74 – 61 Pouancé Basket.",
    );
  });

  it("dit que le score est non communiqué plutôt que d'écrire un zéro", () => {
    const rencontre = construireRencontre({
      statut: "joue",
      scoreNous: null,
      scoreAdversaire: null,
    });

    const description = descriptionMatch(rencontre, EQUIPE_SM1);

    expect(description).toContain("score non communiqué");
    expect(description).not.toContain("0 – 0");
  });

  it("annonce la date et l'heure d'un match à venir", () => {
    const description = descriptionMatch(construireRencontre(), EQUIPE_SM1);

    expect(description).toContain("SOCL reçoit Pouancé Basket le 19 septembre 2026 à 20h30");
  });

  it("dit que l'horaire n'est pas connu quand la FFBB ne l'a pas publié", () => {
    const description = descriptionMatch(
      construireRencontre({ heureConfirmee: false }),
      EQUIPE_SM1,
    );

    expect(description).toContain("le 19 septembre 2026, horaire non communiqué");
  });

  it("omet la journée quand elle n'est pas renseignée", () => {
    const description = descriptionMatch(construireRencontre({ journee: null }), EQUIPE_SM1);

    expect(description).not.toContain("journée");
  });
});
