/**
 * Fabriques de données pour les tests du calendrier, des résultats et de la page
 * d'un match. Chaque test compose la rencontre dont il a besoin plutôt que de
 * dépendre du jeu de démonstration, qui bougera quand la base arrivera.
 */

import type { Equipe, Joueur, Rencontre } from "@/domaine/types";

export const EQUIPE_SM1: Equipe = {
  id: "eq-sm1",
  slug: "seniors-masculins-1",
  nom: "Seniors Masculins 1",
  categorie: "Seniors",
  sexe: "masculin",
  competition: "Départementale masculine seniors - Division 5",
  entraineurs: ["Thomas Guérin"],
  creneaux: ["Match : samedi 20h30"],
  presentation: "L'équipe fanion masculine du club.",
  ordre: 1,
};

export const EQUIPE_SF1: Equipe = {
  id: "eq-sf1",
  slug: "seniors-feminines-1",
  nom: "Seniors Féminines 1",
  categorie: "Seniors",
  sexe: "feminin",
  competition: "Départementale féminine seniors - Division 4",
  entraineurs: ["Céline Rabineau"],
  creneaux: ["Match : dimanche 15h30"],
  presentation: "Une équipe soudée.",
  ordre: 2,
};

const RENCONTRE_PAR_DEFAUT: Rencontre = {
  id: "r-test",
  slug: "2026-09-19-seniors-masculins-1-pouance-basket",
  saison: "26-27",
  equipeId: EQUIPE_SM1.id,
  competition: EQUIPE_SM1.competition,
  journee: 1,
  dateHeure: "2026-09-19T20:30:00+02:00",
  heureConfirmee: true,
  adversaire: "Pouancé Basket",
  domicile: true,
  scoreNous: null,
  scoreAdversaire: null,
  statut: "a_venir",
  salle: {
    nom: "Complexe Sportif R. Loison",
    adresse: "Allée Pierre Charpentier",
    ville: "Candé",
  },
  urlFfbb: "https://competitions.ffbb.com/exemple",
  resume: null,
};

export function construireRencontre(surcharge: Partial<Rencontre> = {}): Rencontre {
  return { ...RENCONTRE_PAR_DEFAUT, ...surcharge };
}

const JOUEUR_PAR_DEFAUT: Joueur = {
  id: "j-test",
  equipeId: EQUIPE_SM1.id,
  nomAffiche: "Joueur Test",
  numero: 4,
  poste: "Meneur",
};

export function construireJoueur(surcharge: Partial<Joueur> = {}): Joueur {
  return { ...JOUEUR_PAR_DEFAUT, ...surcharge };
}
