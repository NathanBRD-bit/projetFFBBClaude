/**
 * Types métier du site. Volontairement sans dépendance : `src/domaine/` doit
 * rester testable sans réseau, sans base et sans framework.
 *
 * Ces types décrivent le site tel qu'il s'affiche. Le modèle de base de données
 * (T03) est plus riche — il conserve notamment les deux équipes d'un match, les
 * champs verrouillés et l'archivage. Le passage à Drizzle remplacera uniquement
 * l'implémentation du dépôt, pas ces types ni les pages.
 */

/** Code de saison au format FFBB : `'26-27'`. */
export type CodeSaison = string;

export type Sexe = "masculin" | "feminin";

export type StatutRencontre = "a_venir" | "joue" | "reporte" | "annule" | "forfait";

export type Resultat = "victoire" | "defaite" | "nul";

export interface Salle {
  readonly nom: string;
  readonly adresse: string;
  readonly ville: string;
}

export interface Equipe {
  readonly id: string;
  readonly slug: string;
  /** Nom d'usage : « Seniors Masculins 1 ». */
  readonly nom: string;
  /** Catégorie d'âge FFBB : « U11 », « Seniors », « Vétérans ». */
  readonly categorie: string;
  readonly sexe: Sexe;
  /** Compétition engagée cette saison, libellé FFBB complet. */
  readonly competition: string;
  readonly entraineurs: readonly string[];
  readonly creneaux: readonly string[];
  readonly presentation: string;
  readonly ordre: number;
}

export interface Rencontre {
  readonly id: string;
  readonly slug: string;
  readonly saison: CodeSaison;
  readonly equipeId: string;
  readonly competition: string;
  readonly journee: number | null;
  /** Date et heure en ISO. L'affichage se fait toujours en Europe/Paris. */
  readonly dateHeure: string;
  /** `false` quand l'heure exacte n'a pas été publiée par la FFBB. */
  readonly heureConfirmee: boolean;
  readonly adversaire: string;
  readonly domicile: boolean;
  /**
   * `null` = score inconnu (match non joué, ou feuille non remontée).
   * `0` = l'équipe n'a pas marqué. Ces deux cas ne doivent jamais être confondus.
   */
  readonly scoreNous: number | null;
  readonly scoreAdversaire: number | null;
  readonly statut: StatutRencontre;
  readonly salle: Salle | null;
  readonly urlFfbb: string | null;
  /** Compte-rendu rédigé par le club, en Markdown. */
  readonly resume: string | null;
}

export interface Joueur {
  readonly id: string;
  readonly equipeId: string;
  readonly nomAffiche: string;
  readonly numero: number | null;
  readonly poste: string | null;
}

/** Points marqués par un joueur sur un match. Saisie manuelle, souvent absente. */
export interface LignePoints {
  readonly rencontreId: string;
  readonly joueurId: string;
  /** `null` = non saisi. `0` = le joueur a joué sans marquer. */
  readonly points: number | null;
}

export interface Article {
  readonly slug: string;
  readonly titre: string;
  readonly chapeau: string;
  readonly contenu: string;
  readonly categorie: string;
  readonly publieLe: string;
  readonly auteur: string;
  readonly epingle: boolean;
}
