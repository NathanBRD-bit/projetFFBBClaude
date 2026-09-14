/**
 * Mise en forme d'un score de match.
 *
 * Règle du projet sur `null` vs `0` : un score absent (match non joué, feuille de
 * match non remontée) et un score de zéro sont deux informations différentes.
 * `null` s'affiche `—`, `0` s'affiche `0`. Aucune valeur par défaut ne vient
 * masquer la donnée manquante — voir docs/qualite.md.
 */

/** Tiret cadratin affiché quand au moins un des deux scores est inconnu. */
export const SCORE_INCONNU = "—";

/** Séparateur entre les deux scores (tiret demi-cadratin entouré d'espaces). */
const SEPARATEUR = " – ";

function verifierScore(valeur: number, cote: "domicile" | "extérieur"): void {
  if (!Number.isInteger(valeur) || valeur < 0) {
    throw new RangeError(
      `Score ${cote} invalide : ${String(valeur)}. Un score est un entier positif ou nul.`,
    );
  }
}

/**
 * Formate un score pour l'affichage.
 *
 * @param domicile Points de l'équipe qui reçoit, ou `null` si le score est inconnu.
 * @param exterieur Points de l'équipe visiteuse, ou `null` si le score est inconnu.
 * @returns `'62 – 58'`, ou `'—'` si l'un des deux scores est inconnu.
 * @throws RangeError si un score n'est pas un entier positif ou nul.
 */
export function formaterScore(domicile: number | null, exterieur: number | null): string {
  // La validation passe avant le court-circuit sur `null` : sinon une valeur
  // corrompue d'un côté (-1, NaN) s'afficherait comme un banal « match non joué »
  // dès que l'autre score est inconnu, et l'anomalie resterait invisible.
  if (domicile !== null) {
    verifierScore(domicile, "domicile");
  }
  if (exterieur !== null) {
    verifierScore(exterieur, "extérieur");
  }

  if (domicile === null || exterieur === null) {
    return SCORE_INCONNU;
  }

  return `${String(domicile)}${SEPARATEUR}${String(exterieur)}`;
}
