/**
 * Logique d'affichage des rencontres. Fonctions pures : pas d'accès aux données,
 * pas d'horloge implicite — la date « maintenant » est toujours passée en argument,
 * sinon les tests deviennent dépendants du jour où on les lance.
 */

import type { Rencontre, Resultat } from "./types";

const FUSEAU = "Europe/Paris";

/**
 * Résultat du match du point de vue du club.
 *
 * @returns `null` si le match n'est pas joué ou si le score n'a pas été renseigné.
 */
export function resultat(rencontre: Rencontre): Resultat | null {
  const { scoreNous, scoreAdversaire } = rencontre;
  if (scoreNous === null || scoreAdversaire === null) {
    return null;
  }
  if (scoreNous > scoreAdversaire) {
    return "victoire";
  }
  if (scoreNous < scoreAdversaire) {
    return "defaite";
  }
  return "nul";
}

/** Un match est « à venir » tant qu'il n'a pas été joué et que sa date n'est pas passée. */
export function estAVenir(rencontre: Rencontre, maintenant: Date): boolean {
  if (rencontre.statut === "joue" || rencontre.statut === "annule") {
    return false;
  }
  return new Date(rencontre.dateHeure).getTime() >= maintenant.getTime();
}

export function trierParDateCroissante(rencontres: readonly Rencontre[]): Rencontre[] {
  return [...rencontres].sort(
    (a, b) => new Date(a.dateHeure).getTime() - new Date(b.dateHeure).getTime(),
  );
}

export function trierParDateDecroissante(rencontres: readonly Rencontre[]): Rencontre[] {
  return trierParDateCroissante(rencontres).reverse();
}

/** Les matchs à venir, du plus proche au plus lointain. */
export function prochainesRencontres(
  rencontres: readonly Rencontre[],
  maintenant: Date,
  limite?: number,
): Rencontre[] {
  const aVenir = trierParDateCroissante(rencontres.filter((r) => estAVenir(r, maintenant)));
  return limite === undefined ? aVenir : aVenir.slice(0, limite);
}

/** Les matchs joués, du plus récent au plus ancien. */
export function dernieresRencontresJouees(
  rencontres: readonly Rencontre[],
  limite?: number,
): Rencontre[] {
  const jouees = trierParDateDecroissante(rencontres.filter((r) => r.statut === "joue"));
  return limite === undefined ? jouees : jouees.slice(0, limite);
}

/** Bilan d'une saison : victoires, défaites, nuls. Les matchs sans score sont ignorés. */
export function bilan(rencontres: readonly Rencontre[]): {
  victoires: number;
  defaites: number;
  nuls: number;
  joues: number;
} {
  let victoires = 0;
  let defaites = 0;
  let nuls = 0;
  for (const rencontre of rencontres) {
    switch (resultat(rencontre)) {
      case "victoire":
        victoires += 1;
        break;
      case "defaite":
        defaites += 1;
        break;
      case "nul":
        nuls += 1;
        break;
      case null:
        break;
    }
  }
  return { victoires, defaites, nuls, joues: victoires + defaites + nuls };
}

/**
 * Regroupe les rencontres par mois, en conservant l'ordre reçu.
 *
 * @returns une liste de groupes `{ cle: '2026-09', libelle: 'septembre 2026', rencontres }`.
 */
export function regrouperParMois(
  rencontres: readonly Rencontre[],
): { cle: string; libelle: string; rencontres: Rencontre[] }[] {
  const groupes = new Map<string, { cle: string; libelle: string; rencontres: Rencontre[] }>();
  for (const rencontre of rencontres) {
    const date = new Date(rencontre.dateHeure);
    const cle = `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const existant = groupes.get(cle);
    if (existant === undefined) {
      groupes.set(cle, {
        cle,
        libelle: new Intl.DateTimeFormat("fr-FR", {
          month: "long",
          year: "numeric",
          timeZone: FUSEAU,
        }).format(date),
        rencontres: [rencontre],
      });
    } else {
      existant.rencontres.push(rencontre);
    }
  }
  return [...groupes.values()];
}

/** « samedi 19 septembre 2026 ». */
export function formaterDateLongue(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: FUSEAU,
  }).format(new Date(iso));
}

/** « 19 sept. ». */
export function formaterDateCourte(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: FUSEAU,
  }).format(new Date(iso));
}

/**
 * « 11h30 », ou `null` si l'heure n'a pas été confirmée par la FFBB.
 * On préfère ne rien afficher plutôt qu'une heure inventée.
 */
export function formaterHeure(rencontre: Rencontre): string | null {
  if (!rencontre.heureConfirmee) {
    return null;
  }
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSEAU,
  })
    .format(new Date(rencontre.dateHeure))
    .replace(":", "h");
}

/** Libellé lisible d'un statut, pour les badges. */
export function libelleStatut(statut: Rencontre["statut"]): string {
  switch (statut) {
    case "a_venir":
      return "À venir";
    case "joue":
      return "Joué";
    case "reporte":
      return "Reporté";
    case "annule":
      return "Annulé";
    case "forfait":
      return "Forfait";
  }
}
