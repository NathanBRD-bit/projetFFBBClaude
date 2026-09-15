/**
 * Jeu de données de démonstration.
 *
 * IMPORTANT : ces données sont **fictives**, à l'exception du référentiel du club
 * (nom, équipes engagées, salles, libellés de compétition) et de la première
 * rencontre du 19/09/2026, qui proviennent de l'API FFBB réelle.
 * Les scores, les joueurs et les articles sont inventés pour donner à voir le site.
 *
 * Elles seront remplacées en T03/T06 par la base Postgres alimentée par la
 * synchronisation FFBB. Les pages passent par `src/infrastructure/donnees/depot.ts`
 * et ne connaissent pas cette source : seule l'implémentation du dépôt changera.
 */

import type { Article, Equipe, Joueur, LignePoints, Rencontre, Salle } from "@/domaine/types";

export const SAISON_COURANTE = "26-27";
export const SAISON_PRECEDENTE = "25-26";

export const LOISON: Salle = {
  nom: "Complexe Sportif R. Loison",
  adresse: "Allée Pierre Charpentier",
  ville: "Candé",
};

export const SALLE_DE_LOIRE: Salle = {
  nom: "Salle de Loire",
  adresse: "Rue de la Libération",
  ville: "Loiré",
};

const CHAZEENNE: Salle = {
  nom: "Salle de sport - La Chazéenne",
  adresse: "Route de Vern",
  ville: "Chazé-sur-Argos",
};

const SALLE_SEGRE: Salle = {
  nom: "Salle Ernest Renan",
  adresse: "Rue Ernest Renan",
  ville: "Segré-en-Anjou Bleu",
};

const SALLE_LION: Salle = {
  nom: "Complexe sportif du Haut-Anjou",
  adresse: "Rue des Sports",
  ville: "Le Lion-d'Angers",
};

export const EQUIPES: readonly Equipe[] = [
  {
    id: "eq-sm1",
    slug: "seniors-masculins-1",
    nom: "Seniors Masculins 1",
    categorie: "Seniors",
    sexe: "masculin",
    competition: "Départementale masculine seniors - Division 5",
    entraineurs: ["Thomas Guérin"],
    creneaux: ["Entraînement : mardi 20h00 - 22h00, Loison", "Match : samedi 20h30"],
    presentation:
      "L'équipe fanion masculine du club. Un groupe jeune, monté de D6 la saison dernière, qui découvre la division 5 avec l'ambition de se maintenir sans trembler.",
    ordre: 1,
  },
  {
    id: "eq-sf1",
    slug: "seniors-feminines-1",
    nom: "Seniors Féminines 1",
    categorie: "Seniors",
    sexe: "feminin",
    competition: "Départementale féminine seniors - Division 4",
    entraineurs: ["Céline Rabineau", "Marie Josse"],
    creneaux: ["Entraînement : jeudi 20h00 - 22h00, Salle de Loire", "Match : dimanche 15h30"],
    presentation:
      "Une équipe soudée, dont plusieurs joueuses sont au club depuis les catégories jeunes. Objectif affiché cette saison : le haut de tableau.",
    ordre: 2,
  },
  {
    id: "eq-u18f",
    slug: "u18-feminines",
    nom: "U18 Féminines",
    categorie: "U18",
    sexe: "feminin",
    competition: "Départemental féminin U18 - Division 4",
    entraineurs: ["Marie Josse"],
    creneaux: ["Entraînement : mercredi 18h30 - 20h00, Loison", "Match : samedi 16h00"],
    presentation:
      "La passerelle vers l'équipe seniors féminine : trois joueuses du groupe s'entraînent déjà avec les seniors.",
    ordre: 3,
  },
  {
    id: "eq-u15f",
    slug: "u15-feminines",
    nom: "U15 Féminines",
    categorie: "U15",
    sexe: "feminin",
    competition: "Départemental féminin U15 - Division 4",
    entraineurs: ["Julien Bretaudeau"],
    creneaux: ["Entraînement : mercredi 17h00 - 18h30, Loison", "Match : samedi 14h00"],
    presentation:
      "Un groupe en construction, où l'accent est mis sur les fondamentaux et le plaisir de jouer ensemble.",
    ordre: 4,
  },
  {
    id: "eq-u11m",
    slug: "u11-masculins",
    nom: "U11 Masculins",
    categorie: "U11",
    sexe: "masculin",
    competition: "Départemental masculin U11 - Division 4",
    entraineurs: ["Antoine Pellerin"],
    creneaux: ["Entraînement : mercredi 14h00 - 15h30, Salle de Loire", "Match : samedi 11h30"],
    presentation:
      "Le mini-basket au sens propre : on apprend à dribbler, à passer et surtout à s'amuser. Aucun résultat n'est publié à ce niveau, seulement les rencontres.",
    ordre: 5,
  },
  {
    id: "eq-u9m",
    slug: "u9-masculins",
    nom: "U9 Masculins",
    categorie: "U9",
    sexe: "masculin",
    competition: "Départemental masculin U9 - Division 6",
    entraineurs: ["Antoine Pellerin", "Sophie Delahaye"],
    creneaux: ["Entraînement : mercredi 13h00 - 14h00, Salle de Loire", "Plateau : samedi matin"],
    presentation:
      "Les plus jeunes du club, en plateaux le samedi matin. Les rencontres se jouent sous forme de tournois, sans classement.",
    ordre: 6,
  },
  {
    id: "eq-vetm",
    slug: "veterans-masculins",
    nom: "Vétérans Masculins",
    categorie: "Vétérans",
    sexe: "masculin",
    competition: "Départemental masculin Vétérans",
    entraineurs: [],
    creneaux: ["Entraînement et match : vendredi 20h30, Loison"],
    presentation:
      "Le basket loisir du club : un match par semaine, de la bonne humeur, et une troisième mi-temps qui n'a jamais été perdue.",
    ordre: 7,
  },
];

interface BrouillonRencontre {
  id: string;
  equipeId: string;
  saison: string;
  dateHeure: string;
  heureConfirmee?: boolean;
  adversaire: string;
  domicile: boolean;
  scoreNous?: number | null;
  scoreAdversaire?: number | null;
  statut?: Rencontre["statut"];
  journee?: number;
  salle?: Salle | null;
  resume?: string;
}

function construire(brouillon: BrouillonRencontre): Rencontre {
  const equipe = EQUIPES.find((e) => e.id === brouillon.equipeId);
  if (equipe === undefined) {
    // Volontairement bruyant : une donnée de démo incohérente doit casser tout de
    // suite, pas produire une page à moitié vide.
    throw new Error(`Données de démo incohérentes : équipe inconnue « ${brouillon.equipeId} ».`);
  }
  const date = new Date(brouillon.dateHeure);
  const jour = date.toISOString().slice(0, 10);
  const adversaireSlug = brouillon.adversaire
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return {
    id: brouillon.id,
    slug: `${jour}-${equipe.slug}-${adversaireSlug}`,
    saison: brouillon.saison,
    equipeId: brouillon.equipeId,
    competition: equipe.competition,
    journee: brouillon.journee ?? null,
    dateHeure: brouillon.dateHeure,
    heureConfirmee: brouillon.heureConfirmee ?? true,
    adversaire: brouillon.adversaire,
    domicile: brouillon.domicile,
    scoreNous: brouillon.scoreNous ?? null,
    scoreAdversaire: brouillon.scoreAdversaire ?? null,
    statut: brouillon.statut ?? "a_venir",
    salle: brouillon.salle === undefined ? (brouillon.domicile ? LOISON : null) : brouillon.salle,
    urlFfbb: "https://competitions.ffbb.com/ligues/pdl/comites/0049/clubs/pdl0049077",
    resume: brouillon.resume ?? null,
  };
}

const BROUILLONS: readonly BrouillonRencontre[] = [
  // ---------- Saison 2026-2027 : à venir (la FFBB n'a publié que le début du calendrier) ----------
  {
    // Rencontre réelle, telle que remontée par l'API FFBB le 14/09/2026.
    id: "r-2601",
    equipeId: "eq-u11m",
    saison: SAISON_COURANTE,
    dateHeure: "2026-09-19T11:30:00+02:00",
    adversaire: "Chazé-sur-Argos 2",
    domicile: false,
    journee: 1,
    salle: CHAZEENNE,
  },
  {
    id: "r-2602",
    equipeId: "eq-sm1",
    saison: SAISON_COURANTE,
    dateHeure: "2026-09-19T20:30:00+02:00",
    adversaire: "Pouancé Basket",
    domicile: true,
    journee: 1,
  },
  {
    id: "r-2603",
    equipeId: "eq-sf1",
    saison: SAISON_COURANTE,
    dateHeure: "2026-09-20T15:30:00+02:00",
    adversaire: "Le Lion-d'Angers",
    domicile: false,
    journee: 1,
    salle: SALLE_LION,
  },
  {
    id: "r-2604",
    equipeId: "eq-u15f",
    saison: SAISON_COURANTE,
    dateHeure: "2026-09-26T14:00:00+02:00",
    adversaire: "Segré Basket 2",
    domicile: true,
    journee: 2,
  },
  {
    id: "r-2605",
    equipeId: "eq-u18f",
    saison: SAISON_COURANTE,
    dateHeure: "2026-09-26T16:00:00+02:00",
    adversaire: "Vern-d'Anjou",
    domicile: true,
    journee: 2,
  },
  {
    id: "r-2606",
    equipeId: "eq-sm1",
    saison: SAISON_COURANTE,
    dateHeure: "2026-09-26T20:30:00+02:00",
    adversaire: "Béconnais SC",
    domicile: false,
    journee: 2,
    salle: null,
    // Cas réel fréquent : la FFBB publie la date sans l'heure.
    heureConfirmee: false,
  },
  {
    id: "r-2607",
    equipeId: "eq-vetm",
    saison: SAISON_COURANTE,
    dateHeure: "2026-10-02T20:30:00+02:00",
    adversaire: "Tiercé-Cheffes",
    domicile: true,
    salle: LOISON,
  },
  {
    id: "r-2608",
    equipeId: "eq-sf1",
    saison: SAISON_COURANTE,
    dateHeure: "2026-10-04T15:30:00+02:00",
    adversaire: "Chalonnes-sur-Loire",
    domicile: true,
    journee: 2,
    salle: SALLE_DE_LOIRE,
  },
  {
    id: "r-2609",
    equipeId: "eq-u9m",
    saison: SAISON_COURANTE,
    dateHeure: "2026-10-10T10:00:00+02:00",
    adversaire: "Plateau à Saint-Georges-sur-Loire",
    domicile: false,
    salle: null,
    heureConfirmee: false,
  },
  {
    id: "r-2610",
    equipeId: "eq-sm1",
    saison: SAISON_COURANTE,
    dateHeure: "2026-10-10T20:30:00+02:00",
    adversaire: "Angers ABC 3",
    domicile: true,
    journee: 3,
    // Cas réel : match reporté par l'adversaire, date à refixer.
    statut: "reporte",
  },

  // ---------- Saison 2025-2026 : archive conservée par le site ----------
  {
    id: "r-2501",
    equipeId: "eq-sm1",
    saison: SAISON_PRECEDENTE,
    dateHeure: "2026-05-16T20:30:00+02:00",
    adversaire: "Segré Basket 3",
    domicile: true,
    journee: 22,
    scoreNous: 74,
    scoreAdversaire: 61,
    statut: "joue",
    resume:
      "Dernier match de la saison à Loison, et la meilleure manière de la finir. Menés de sept points à la pause, les Violets ont passé un 24-8 dans le troisième quart-temps pour ne plus jamais être inquiétés. La montée en D5 était déjà acquise : cette victoire la célèbre.",
  },
  {
    id: "r-2502",
    equipeId: "eq-sm1",
    saison: SAISON_PRECEDENTE,
    dateHeure: "2026-05-09T20:30:00+02:00",
    adversaire: "Le Lion-d'Angers 2",
    domicile: false,
    journee: 21,
    scoreNous: 58,
    scoreAdversaire: 66,
    statut: "joue",
    salle: SALLE_LION,
  },
  {
    id: "r-2503",
    equipeId: "eq-sm1",
    saison: SAISON_PRECEDENTE,
    dateHeure: "2026-04-25T20:30:00+02:00",
    adversaire: "Pouancé Basket 2",
    domicile: true,
    journee: 20,
    scoreNous: 81,
    scoreAdversaire: 52,
    statut: "joue",
  },
  {
    id: "r-2504",
    equipeId: "eq-sf1",
    saison: SAISON_PRECEDENTE,
    dateHeure: "2026-05-17T15:30:00+02:00",
    adversaire: "Vern-d'Anjou",
    domicile: true,
    journee: 18,
    scoreNous: 49,
    scoreAdversaire: 47,
    statut: "joue",
    salle: SALLE_DE_LOIRE,
    resume:
      "Deux points d'écart, un lancer franc à six secondes de la fin, et une salle debout. On ne racontera pas la fin de match autrement : c'est exactement comme ça qu'elle s'est passée.",
  },
  {
    id: "r-2505",
    equipeId: "eq-sf1",
    saison: SAISON_PRECEDENTE,
    dateHeure: "2026-05-03T15:30:00+02:00",
    adversaire: "Segré Basket",
    domicile: false,
    journee: 17,
    scoreNous: 38,
    scoreAdversaire: 55,
    statut: "joue",
    salle: SALLE_SEGRE,
  },
  {
    id: "r-2506",
    equipeId: "eq-sf1",
    saison: SAISON_PRECEDENTE,
    dateHeure: "2026-04-12T15:30:00+02:00",
    adversaire: "Béconnais SC 2",
    domicile: true,
    journee: 16,
    // Cas réel : l'adversaire déclare forfait, le score est administratif.
    scoreNous: 20,
    scoreAdversaire: 0,
    statut: "forfait",
    salle: SALLE_DE_LOIRE,
  },
  {
    id: "r-2507",
    equipeId: "eq-u18f",
    saison: SAISON_PRECEDENTE,
    dateHeure: "2026-05-16T16:00:00+02:00",
    adversaire: "Tiercé-Cheffes",
    domicile: true,
    journee: 14,
    scoreNous: 44,
    scoreAdversaire: 39,
    statut: "joue",
  },
  {
    id: "r-2508",
    equipeId: "eq-u18f",
    saison: SAISON_PRECEDENTE,
    dateHeure: "2026-05-02T16:00:00+02:00",
    adversaire: "Chalonnes-sur-Loire",
    domicile: false,
    journee: 13,
    scoreNous: 31,
    scoreAdversaire: 58,
    statut: "joue",
  },
  {
    id: "r-2509",
    equipeId: "eq-u15f",
    saison: SAISON_PRECEDENTE,
    dateHeure: "2026-05-16T14:00:00+02:00",
    adversaire: "Angers ABC 2",
    domicile: true,
    journee: 12,
    scoreNous: 36,
    scoreAdversaire: 36,
    statut: "joue",
  },
  {
    id: "r-2510",
    equipeId: "eq-u15f",
    saison: SAISON_PRECEDENTE,
    dateHeure: "2026-04-11T14:00:00+02:00",
    adversaire: "Loire-Authion",
    domicile: false,
    journee: 11,
    // Cas réel : match joué mais feuille de match jamais remontée par l'adversaire.
    // Le score reste inconnu — on affiche « — », jamais « 0 ».
    scoreNous: null,
    scoreAdversaire: null,
    statut: "joue",
  },
  {
    id: "r-2511",
    equipeId: "eq-vetm",
    saison: SAISON_PRECEDENTE,
    dateHeure: "2026-05-15T20:30:00+02:00",
    adversaire: "Candé Loisirs",
    domicile: true,
    scoreNous: 62,
    scoreAdversaire: 58,
    statut: "joue",
  },
  {
    id: "r-2512",
    equipeId: "eq-u11m",
    saison: SAISON_PRECEDENTE,
    dateHeure: "2026-05-16T11:30:00+02:00",
    adversaire: "Chazé-sur-Argos",
    domicile: true,
    scoreNous: 28,
    scoreAdversaire: 22,
    statut: "joue",
    salle: SALLE_DE_LOIRE,
  },
];

export const RENCONTRES: readonly Rencontre[] = BROUILLONS.map(construire);

export const JOUEURS: readonly Joueur[] = [
  { id: "j-01", equipeId: "eq-sm1", nomAffiche: "Thomas G.", numero: 4, poste: "Meneur" },
  { id: "j-02", equipeId: "eq-sm1", nomAffiche: "Maxime B.", numero: 5, poste: "Arrière" },
  { id: "j-03", equipeId: "eq-sm1", nomAffiche: "Lucas R.", numero: 7, poste: "Ailier" },
  { id: "j-04", equipeId: "eq-sm1", nomAffiche: "Hugo M.", numero: 9, poste: "Ailier fort" },
  { id: "j-05", equipeId: "eq-sm1", nomAffiche: "Antoine D.", numero: 11, poste: "Pivot" },
  { id: "j-06", equipeId: "eq-sm1", nomAffiche: "Nathan P.", numero: 12, poste: "Arrière" },
  { id: "j-07", equipeId: "eq-sm1", nomAffiche: "Kévin L.", numero: 14, poste: "Pivot" },
  { id: "j-08", equipeId: "eq-sf1", nomAffiche: "Camille V.", numero: 4, poste: "Meneuse" },
  { id: "j-09", equipeId: "eq-sf1", nomAffiche: "Léane B.", numero: 6, poste: "Arrière" },
  { id: "j-10", equipeId: "eq-sf1", nomAffiche: "Manon T.", numero: 8, poste: "Ailière" },
  { id: "j-11", equipeId: "eq-sf1", nomAffiche: "Julie C.", numero: 10, poste: "Intérieure" },
  { id: "j-12", equipeId: "eq-sf1", nomAffiche: "Sarah M.", numero: 13, poste: "Ailière" },
];

/**
 * Points par joueur. Volontairement incomplet : seuls deux matchs ont été saisis,
 * et l'un d'eux comporte une ligne non renseignée. C'est le cas réel — la saisie
 * est bénévole — et le site doit rester présentable sans elle.
 */
export const POINTS: readonly LignePoints[] = [
  { rencontreId: "r-2501", joueurId: "j-01", points: 12 },
  { rencontreId: "r-2501", joueurId: "j-02", points: 17 },
  { rencontreId: "r-2501", joueurId: "j-03", points: 8 },
  { rencontreId: "r-2501", joueurId: "j-04", points: 14 },
  { rencontreId: "r-2501", joueurId: "j-05", points: 9 },
  { rencontreId: "r-2501", joueurId: "j-06", points: 0 },
  { rencontreId: "r-2501", joueurId: "j-07", points: null },
  { rencontreId: "r-2504", joueurId: "j-08", points: 11 },
  { rencontreId: "r-2504", joueurId: "j-09", points: 13 },
  { rencontreId: "r-2504", joueurId: "j-10", points: 6 },
  { rencontreId: "r-2504", joueurId: "j-11", points: 15 },
  { rencontreId: "r-2504", joueurId: "j-12", points: 4 },
];

export const ARTICLES: readonly Article[] = [
  {
    slug: "reprise-des-entrainements-saison-2026-2027",
    titre: "La reprise des entraînements, c'est maintenant",
    chapeau:
      "Toutes les catégories ont repris le chemin des salles. Voici les créneaux de la saison, à Candé comme à Loiré.",
    contenu: `La saison 2026-2027 est lancée. Les entraînements ont repris pour toutes les catégories, au Complexe Sportif R. Loison à Candé et à la Salle de Loire à Loiré.

## Les créneaux

- **U9 et U11** : mercredi après-midi, Salle de Loire
- **U15 et U18** : mercredi en fin de journée, Loison
- **Seniors Masculins** : mardi soir, Loison
- **Seniors Féminines** : jeudi soir, Salle de Loire
- **Vétérans** : vendredi soir, Loison

## Il reste des places

Plusieurs catégories peuvent encore accueillir de nouveaux licenciés, en particulier chez les jeunes. Les deux premières séances sont **gratuites et sans engagement** : venez essayer, le short et les baskets suffisent.

Pour toute question, écrivez-nous à secretariat.socl.basket@gmail.com.`,
    categorie: "Vie du club",
    publieLe: "2026-09-08T18:00:00+02:00",
    auteur: "Le bureau",
    epingle: true,
  },
  {
    slug: "soiree-du-club-le-17-octobre",
    titre: "Soirée du club : rendez-vous le 17 octobre",
    chapeau:
      "Repas, tombola et remise des maillots à la salle des fêtes de Candé. Ouvert aux licenciés, aux familles et aux supporters.",
    contenu: `La traditionnelle soirée du club aura lieu le **samedi 17 octobre à partir de 19h30**, à la salle des fêtes de Candé.

Au programme : remise officielle des maillots à toutes les équipes, repas préparé par les bénévoles, tombola au profit du club, et une piste de danse qui ne demande qu'à servir.

## Informations pratiques

- **Tarifs** : 18 € par adulte, 9 € pour les moins de 12 ans
- **Réservation** : avant le 10 octobre, auprès de votre entraîneur ou par mail
- **Sur place** : buvette tenue par les parents des U11

C'est le moment de l'année où l'on voit enfin toutes les équipes réunies. On compte sur vous.`,
    categorie: "Événement",
    publieLe: "2026-09-12T09:30:00+02:00",
    auteur: "Le bureau",
    epingle: true,
  },
  {
    slug: "presentation-seniors-masculins-2026-2027",
    titre: "Seniors Masculins : une montée à confirmer",
    chapeau:
      "Promu en Division 5, le groupe de Thomas Guérin aborde sa première saison à ce niveau avec un effectif quasiment inchangé.",
    contenu: `Après une saison 2025-2026 conclue à la deuxième place et une montée acquise avant même la dernière journée, les Seniors Masculins découvrent la **Division 5 départementale**.

## Un groupe stable

L'effectif reste presque identique : un seul départ, et deux arrivées venues des U18. C'est une continuité rare à ce niveau, et probablement le meilleur atout de l'équipe.

> « On ne change pas ce qui fonctionne. L'objectif, c'est de se maintenir sans trembler, et de continuer à prendre du plaisir. » — Thomas Guérin, entraîneur

## Le calendrier

La saison démarre le **19 septembre à domicile** contre Pouancé. Les matchs se jouent le samedi à 20h30 au Complexe Loison, et l'entrée est libre.`,
    categorie: "Équipes",
    publieLe: "2026-09-10T17:00:00+02:00",
    auteur: "Thomas Guérin",
    epingle: false,
  },
  {
    slug: "bilan-saison-2025-2026",
    titre: "Bilan de la saison 2025-2026",
    chapeau:
      "Une montée chez les masculins, un maintien confortable chez les féminines, et un effectif jeune en nette progression.",
    contenu: `La saison 2025-2026 restera comme l'une des plus réussies de la jeune histoire du club né du rapprochement entre Candé et Loiré.

## Ce qu'on retient

- **Seniors Masculins** : deuxième de D6, montée en D5
- **Seniors Féminines** : cinquièmes de D4, maintien assuré à quatre journées de la fin
- **U18 Féminines** : une seconde moitié de saison très solide
- **U11 et U9** : des effectifs en hausse, et des plateaux du samedi matin toujours pleins

## Merci

Rien de tout cela ne tient sans les bénévoles : les entraîneurs, les parents qui conduisent aux matchs, ceux qui tiennent la table de marque et la buvette. Le club, c'est eux.`,
    categorie: "Vie du club",
    publieLe: "2026-06-20T11:00:00+02:00",
    auteur: "Le bureau",
    epingle: false,
  },
  {
    slug: "appel-aux-benevoles-table-de-marque",
    titre: "Appel aux bénévoles pour la table de marque",
    chapeau:
      "Deux personnes suffisent par match. Une petite formation est proposée en octobre, aucune expérience n'est nécessaire.",
    contenu: `Chaque rencontre à domicile a besoin de **deux bénévoles à la table de marque** : une personne au chronomètre, une à la feuille de match électronique.

Ce n'est ni compliqué ni chronophage, et c'est indispensable : sans table de marque, un match ne peut pas se tenir.

## Une formation en octobre

Une session d'initiation d'une heure trente est prévue le **samedi 11 octobre à 10h** à Loison. Elle est ouverte à tous, licenciés ou non, à partir de 16 ans.

Inscrivez-vous auprès du bureau ou directement par mail. Un planning sera ensuite établi pour que personne ne soit sollicité plus d'une fois par mois.`,
    categorie: "Vie du club",
    publieLe: "2026-09-05T14:00:00+02:00",
    auteur: "Le bureau",
    epingle: false,
  },
];
