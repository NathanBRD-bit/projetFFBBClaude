import { describe, expect, it } from "vitest";
import {
  bilan,
  dernieresRencontresJouees,
  estAVenir,
  formaterDateCourte,
  formaterDateLongue,
  formaterHeure,
  libelleStatut,
  prochainesRencontres,
  regrouperParMois,
  resultat,
  trierParDateCroissante,
  trierParDateDecroissante,
} from "@/domaine/rencontres";
import type { Rencontre } from "@/domaine/types";

/** Rencontre minimale, surchargée au cas par cas. */
function rencontre(surcharge: Partial<Rencontre> = {}): Rencontre {
  return {
    id: "r-1",
    slug: "2026-09-19-seniors-masculins-1-pouance",
    saison: "26-27",
    equipeId: "eq-sm1",
    competition: "Départementale masculine seniors - Division 5",
    journee: 1,
    dateHeure: "2026-09-19T20:30:00+02:00",
    heureConfirmee: true,
    adversaire: "Pouancé Basket",
    domicile: true,
    scoreNous: null,
    scoreAdversaire: null,
    statut: "a_venir",
    salle: null,
    urlFfbb: null,
    resume: null,
    ...surcharge,
  };
}

describe("resultat", () => {
  it("annonce une victoire quand le club marque plus que son adversaire", () => {
    expect(resultat(rencontre({ scoreNous: 74, scoreAdversaire: 61, statut: "joue" }))).toBe(
      "victoire",
    );
  });

  it("annonce une défaite quand le club marque moins", () => {
    expect(resultat(rencontre({ scoreNous: 58, scoreAdversaire: 66, statut: "joue" }))).toBe(
      "defaite",
    );
  });

  it("annonce un nul à égalité", () => {
    expect(resultat(rencontre({ scoreNous: 36, scoreAdversaire: 36, statut: "joue" }))).toBe("nul");
  });

  it("ne conclut rien quand un score est inconnu", () => {
    // Feuille de match jamais remontée : ce n'est ni une victoire ni une défaite.
    expect(
      resultat(rencontre({ scoreNous: null, scoreAdversaire: 60, statut: "joue" })),
    ).toBeNull();
    expect(
      resultat(rencontre({ scoreNous: 60, scoreAdversaire: null, statut: "joue" })),
    ).toBeNull();
    expect(resultat(rencontre())).toBeNull();
  });

  it("distingue un zéro d'un score absent", () => {
    // 0 est une donnée : une équipe battue 20-0 par forfait a bien perdu.
    expect(resultat(rencontre({ scoreNous: 0, scoreAdversaire: 20, statut: "forfait" }))).toBe(
      "defaite",
    );
    expect(resultat(rencontre({ scoreNous: 20, scoreAdversaire: 0, statut: "forfait" }))).toBe(
      "victoire",
    );
    expect(resultat(rencontre({ scoreNous: 0, scoreAdversaire: 0, statut: "joue" }))).toBe("nul");
  });
});

describe("estAVenir", () => {
  const maintenant = new Date("2026-09-14T12:00:00+02:00");

  it("considère à venir un match futur non joué", () => {
    expect(estAVenir(rencontre(), maintenant)).toBe(true);
  });

  it("exclut un match déjà joué même si sa date est future", () => {
    expect(estAVenir(rencontre({ statut: "joue" }), maintenant)).toBe(false);
  });

  it("exclut un match annulé", () => {
    expect(estAVenir(rencontre({ statut: "annule" }), maintenant)).toBe(false);
  });

  it("exclut un match dont la date est passée", () => {
    expect(estAVenir(rencontre({ dateHeure: "2026-09-01T20:30:00+02:00" }), maintenant)).toBe(
      false,
    );
  });

  it("garde un match reporté dont la date n'est pas encore passée", () => {
    // Un report reste une échéance à afficher tant que la date n'est pas dépassée.
    expect(estAVenir(rencontre({ statut: "reporte" }), maintenant)).toBe(true);
  });
});

describe("tri", () => {
  const tot = rencontre({ id: "tot", dateHeure: "2026-09-01T20:00:00+02:00" });
  const tard = rencontre({ id: "tard", dateHeure: "2026-10-01T20:00:00+02:00" });

  it("trie du plus ancien au plus récent", () => {
    expect(trierParDateCroissante([tard, tot]).map((r) => r.id)).toEqual(["tot", "tard"]);
  });

  it("trie du plus récent au plus ancien", () => {
    expect(trierParDateDecroissante([tot, tard]).map((r) => r.id)).toEqual(["tard", "tot"]);
  });

  it("ne modifie pas le tableau reçu", () => {
    const source = [tard, tot];
    trierParDateCroissante(source);
    expect(source.map((r) => r.id)).toEqual(["tard", "tot"]);
  });
});

describe("prochainesRencontres", () => {
  const maintenant = new Date("2026-09-14T12:00:00+02:00");
  const liste = [
    rencontre({ id: "a", dateHeure: "2026-10-10T20:00:00+02:00" }),
    rencontre({ id: "b", dateHeure: "2026-09-19T20:00:00+02:00" }),
    rencontre({ id: "passe", dateHeure: "2026-09-01T20:00:00+02:00", statut: "joue" }),
  ];

  it("renvoie les matchs futurs du plus proche au plus lointain", () => {
    expect(prochainesRencontres(liste, maintenant).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("respecte la limite demandée", () => {
    expect(prochainesRencontres(liste, maintenant, 1).map((r) => r.id)).toEqual(["b"]);
  });

  it("renvoie une liste vide quand plus rien n'est programmé", () => {
    expect(prochainesRencontres([], maintenant)).toEqual([]);
  });
});

describe("dernieresRencontresJouees", () => {
  const liste = [
    rencontre({ id: "vieux", dateHeure: "2026-04-01T20:00:00+02:00", statut: "joue" }),
    rencontre({ id: "recent", dateHeure: "2026-05-16T20:00:00+02:00", statut: "joue" }),
    rencontre({ id: "avenir", dateHeure: "2026-10-01T20:00:00+02:00" }),
    rencontre({ id: "forfait", dateHeure: "2026-05-01T20:00:00+02:00", statut: "forfait" }),
  ];

  it("ne retient que les matchs joués, du plus récent au plus ancien", () => {
    // Un forfait n'est pas un match joué : il n'entre pas dans cette liste.
    expect(dernieresRencontresJouees(liste).map((r) => r.id)).toEqual(["recent", "vieux"]);
  });

  it("respecte la limite demandée", () => {
    expect(dernieresRencontresJouees(liste, 1).map((r) => r.id)).toEqual(["recent"]);
  });
});

describe("bilan", () => {
  it("compte séparément victoires, défaites et nuls", () => {
    const resultatBilan = bilan([
      rencontre({ scoreNous: 70, scoreAdversaire: 60, statut: "joue" }),
      rencontre({ scoreNous: 50, scoreAdversaire: 60, statut: "joue" }),
      rencontre({ scoreNous: 60, scoreAdversaire: 60, statut: "joue" }),
    ]);
    expect(resultatBilan).toEqual({ victoires: 1, defaites: 1, nuls: 1, joues: 3 });
  });

  it("ignore les matchs sans score plutôt que de les compter comme des défaites", () => {
    const resultatBilan = bilan([
      rencontre({ scoreNous: 70, scoreAdversaire: 60, statut: "joue" }),
      rencontre({ scoreNous: null, scoreAdversaire: null, statut: "joue" }),
      rencontre(),
    ]);
    expect(resultatBilan).toEqual({ victoires: 1, defaites: 0, nuls: 0, joues: 1 });
  });

  it("renvoie un bilan vide pour une liste vide", () => {
    expect(bilan([])).toEqual({ victoires: 0, defaites: 0, nuls: 0, joues: 0 });
  });
});

describe("regrouperParMois", () => {
  it("regroupe les rencontres du même mois et nomme le mois en français", () => {
    const groupes = regrouperParMois([
      rencontre({ id: "a", dateHeure: "2026-09-19T20:00:00+02:00" }),
      rencontre({ id: "b", dateHeure: "2026-09-26T20:00:00+02:00" }),
      rencontre({ id: "c", dateHeure: "2026-10-10T20:00:00+02:00" }),
    ]);
    expect(groupes).toHaveLength(2);
    expect(groupes[0]?.cle).toBe("2026-09");
    expect(groupes[0]?.libelle).toBe("septembre 2026");
    expect(groupes[0]?.rencontres.map((r) => r.id)).toEqual(["a", "b"]);
    expect(groupes[1]?.rencontres.map((r) => r.id)).toEqual(["c"]);
  });

  it("renvoie une liste vide sans rencontre", () => {
    expect(regrouperParMois([])).toEqual([]);
  });
});

describe("formats de date", () => {
  it("écrit la date longue en français", () => {
    expect(formaterDateLongue("2026-09-19T11:30:00+02:00")).toBe("samedi 19 septembre 2026");
  });

  it("écrit la date courte en français", () => {
    expect(formaterDateCourte("2026-09-19T11:30:00+02:00")).toBe("19 sept.");
  });

  it("affiche l'heure en notation française", () => {
    expect(formaterHeure(rencontre({ dateHeure: "2026-09-19T11:30:00+02:00" }))).toBe("11h30");
  });

  it("n'affiche aucune heure quand la FFBB ne l'a pas confirmée", () => {
    // Mieux vaut ne rien annoncer qu'annoncer une heure inventée.
    expect(formaterHeure(rencontre({ heureConfirmee: false }))).toBeNull();
  });

  it("affiche l'heure de Paris quelle que soit la machine", () => {
    // Instant UTC : 18h30 UTC = 20h30 à Paris en heure d'été.
    expect(formaterHeure(rencontre({ dateHeure: "2026-09-19T18:30:00Z" }))).toBe("20h30");
  });
});

describe("libelleStatut", () => {
  it("donne un libellé lisible pour chaque statut", () => {
    expect(libelleStatut("a_venir")).toBe("À venir");
    expect(libelleStatut("joue")).toBe("Joué");
    expect(libelleStatut("reporte")).toBe("Reporté");
    expect(libelleStatut("annule")).toBe("Annulé");
    expect(libelleStatut("forfait")).toBe("Forfait");
  });
});
