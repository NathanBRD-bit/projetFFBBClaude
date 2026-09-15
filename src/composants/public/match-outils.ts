/**
 * Fonctions pures partagées par le calendrier, les résultats et la page d'un match.
 *
 * Elles auraient leur place dans `src/domaine/`, mais ce dossier est tenu par une
 * autre tâche en cours : elles sont donc rangées ici, avec le préfixe `match-`.
 * Elles restent volontairement sans dépendance à React ni au dépôt de données,
 * pour être testables telles quelles.
 */

import { formaterHeure, resultat, trierParDateDecroissante } from "@/domaine/rencontres";
import { formaterScore, SCORE_INCONNU } from "@/domaine/score";
import type { Equipe, Rencontre, Salle } from "@/domaine/types";

const FUSEAU = "Europe/Paris";

/** Nom court du club, tel qu'il s'affiche dans l'en-tête d'un match. */
export const NOM_CLUB = "SOCL";

/**
 * Une rencontre « jouée » au sens des résultats : le match a eu lieu ou a été
 * tranché administrativement.
 *
 * `dernieresRencontresJouees()` du domaine ne retient que `statut === 'joue'` et
 * laisse donc tomber les forfaits, qui comptent pourtant au classement et dans le
 * bilan. La page Résultats a besoin des deux.
 */
export function estJouee(rencontre: Rencontre): boolean {
  return rencontre.statut === "joue" || rencontre.statut === "forfait";
}

/** Les rencontres jouées, de la plus récente à la plus ancienne. */
export function rencontresJouees(rencontres: readonly Rencontre[]): Rencontre[] {
  return trierParDateDecroissante(rencontres.filter(estJouee));
}

/**
 * Normalise un paramètre de requête.
 *
 * `?equipe=a&equipe=b` donne un tableau : l'URL est ambiguë. On ne choisit pas à la
 * place du visiteur — la valeur recomposée ne correspondra à aucun slug et la page
 * affichera un message « filtre inconnu », plutôt que d'ignorer la moitié de l'URL.
 */
export function lireParametre(valeur: string | string[] | undefined): string | null {
  if (valeur === undefined) {
    return null;
  }
  const nettoye = (Array.isArray(valeur) ? valeur.join(",") : valeur).trim();
  return nettoye === "" ? null : nettoye;
}

export type SelectionEquipe =
  | { readonly etat: "toutes" }
  | { readonly etat: "trouvee"; readonly equipe: Equipe }
  | { readonly etat: "inconnue"; readonly slug: string };

/**
 * Résout le filtre `?equipe=`. Un slug absent de la liste n'est pas ignoré
 * silencieusement : il ressort en `inconnue` pour que la page le dise.
 */
export function resoudreEquipe(equipes: readonly Equipe[], slug: string | null): SelectionEquipe {
  if (slug === null) {
    return { etat: "toutes" };
  }
  const equipe = equipes.find((candidate) => candidate.slug === slug);
  return equipe === undefined ? { etat: "inconnue", slug } : { etat: "trouvee", equipe };
}

export type SelectionSaison =
  | { readonly etat: "trouvee"; readonly saison: string }
  | { readonly etat: "inconnue"; readonly code: string };

/** Résout le filtre `?saison=`, en retombant sur `defaut` quand il est absent. */
export function resoudreSaison(
  saisons: readonly string[],
  code: string | null,
  defaut: string,
): SelectionSaison {
  if (code === null) {
    return { etat: "trouvee", saison: defaut };
  }
  return saisons.includes(code) ? { etat: "trouvee", saison: code } : { etat: "inconnue", code };
}

/** « 26-27 » devient « 2026-2027 ». */
export function libelleSaison(code: string): string {
  if (!/^\d{2}-\d{2}$/.test(code)) {
    throw new RangeError(`Code de saison invalide : « ${code} ». Format attendu « 26-27 ».`);
  }
  return `20${code.slice(0, 2)}-20${code.slice(3)}`;
}

/** Construit l'URL d'une page filtrée. Les filtres à `null` sont omis de la requête. */
export function lienFiltre(base: string, filtres: Record<string, string | null>): string {
  const parametres = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur !== null) {
      parametres.set(cle, valeur);
    }
  }
  const requete = parametres.toString();
  return requete === "" ? base : `${base}?${requete}`;
}

/**
 * Lien de localisation vers OpenStreetMap. On interroge sur l'adresse et la ville :
 * le nom de la salle n'est pas une donnée cartographique fiable.
 */
export function lienCarte(salle: Salle): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(
    `${salle.adresse}, ${salle.ville}`,
  )}`;
}

/**
 * Points d'un joueur sur un match. `null` = non saisi : on affiche un tiret, jamais
 * un zéro qui ferait croire que le joueur n'a pas marqué.
 */
export function formaterPoints(points: number | null): string {
  return points === null ? SCORE_INCONNU : String(points);
}

/**
 * Le meilleur total marqué, ou `null` s'il n'y a rien à distinguer (aucune saisie,
 * ou tout le monde à zéro : « meilleur marqueur » n'aurait alors aucun sens).
 */
export function meilleurTotal(
  lignes: readonly { readonly points: number | null }[],
): number | null {
  let meilleur: number | null = null;
  for (const ligne of lignes) {
    if (ligne.points === null || ligne.points === 0) {
      continue;
    }
    if (meilleur === null || ligne.points > meilleur) {
      meilleur = ligne.points;
    }
  }
  return meilleur;
}

/**
 * Découpe un compte-rendu en paragraphes sur les lignes vides.
 * Texte simple volontairement : aucun HTML n'est produit à partir de la saisie.
 */
export function decouperParagraphes(texte: string): string[] {
  return texte
    .split(/\n[ \t]*\n/)
    .map((paragraphe) => paragraphe.trim())
    .filter((paragraphe) => paragraphe !== "");
}

export interface CoteAffiche {
  readonly nom: string;
  readonly score: number | null;
  readonly estNous: boolean;
}

/** Ordre d'affichage des deux équipes : le club recevant à gauche. */
export function ordreAffichage(
  rencontre: Rencontre,
  nomClub: string = NOM_CLUB,
): { recevant: CoteAffiche; visiteur: CoteAffiche } {
  const nous: CoteAffiche = { nom: nomClub, score: rencontre.scoreNous, estNous: true };
  const adverse: CoteAffiche = {
    nom: rencontre.adversaire,
    score: rencontre.scoreAdversaire,
    estNous: false,
  };
  return rencontre.domicile
    ? { recevant: nous, visiteur: adverse }
    : { recevant: adverse, visiteur: nous };
}

/** « SOCL – Pouancé Basket », dans l'ordre recevant puis visiteur. */
export function intituleMatch(rencontre: Rencontre, nomClub: string = NOM_CLUB): string {
  const { recevant, visiteur } = ordreAffichage(rencontre, nomClub);
  return `${recevant.nom} – ${visiteur.nom}`;
}

/**
 * « 19 septembre 2026 ». Variante sans jour de la semaine de `formaterDateLongue()`,
 * pour les titres de page où « samedi » n'apporte rien.
 */
export function formaterDateSansJourSemaine(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: FUSEAU,
  }).format(new Date(iso));
}

/**
 * Phrase d'explication quand le score est administratif.
 * `null` pour tous les autres statuts : un forfait ne doit pas être présenté comme
 * un match normal, et un match normal ne doit pas porter cet avertissement.
 */
export function messageForfait(rencontre: Rencontre): string | null {
  if (rencontre.statut !== "forfait") {
    return null;
  }
  switch (resultat(rencontre)) {
    case "victoire":
      return "Match non joué : l'adversaire a déclaré forfait. Le score est administratif.";
    case "defaite":
      return "Match non joué : le club a déclaré forfait. Le score est administratif.";
    default:
      return "Match non joué : forfait déclaré. Le score est administratif.";
  }
}

/** Accord en nombre : `accorder(1, 'victoire')` donne « 1 victoire », `accorder(3, …)` « 3 victoires ». */
export function accorder(nombre: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${String(nombre)} ${nombre > 1 ? pluriel : singulier}`;
}

/**
 * Description d'un match pour les métadonnées de page : résultat quand il est
 * connu, date et heure quand le match est à venir. Jamais de score inventé.
 */
export function descriptionMatch(rencontre: Rencontre, equipe: Equipe): string {
  const { recevant, visiteur } = ordreAffichage(rencontre);
  const date = formaterDateSansJourSemaine(rencontre.dateHeure);
  const contexte = `${equipe.nom} · ${rencontre.competition}${
    rencontre.journee === null ? "" : `, journée ${String(rencontre.journee)}`
  }.`;

  if (estJouee(rencontre)) {
    const detail =
      recevant.score === null || visiteur.score === null
        ? `${recevant.nom} contre ${visiteur.nom}, score non communiqué`
        : `${recevant.nom} ${formaterScore(recevant.score, visiteur.score)} ${visiteur.nom}`;
    return `${contexte} Résultat du ${date} : ${detail}.`;
  }

  const heure = formaterHeure(rencontre);
  const moment = heure === null ? `le ${date}, horaire non communiqué` : `le ${date} à ${heure}`;
  return `${contexte} ${recevant.nom} reçoit ${visiteur.nom} ${moment}.`;
}
