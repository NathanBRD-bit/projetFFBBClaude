import type { ColonnesFfbbRencontre, RencontreNormalisee, ValeurColonne } from "./normalisation";

/**
 * Fusion : rencontre normalisée + ligne existante → ce qu'il faut écrire.
 *
 * Fonction **pure**, sans base ni réseau : elle décide, elle n'applique pas.
 * T06 exécute la décision dans sa transaction.
 *
 * ## Les trois cercles (plan, « Modèle de données »)
 *
 * 1. **Colonnes éditoriales** — `resume_md`, `affiche_publiquement`. La fusion
 *    n'y touche jamais, et ce n'est pas une affaire de discipline : elles
 *    n'existent ni dans `ColonnesFfbbRencontre` ni dans `EtatActuelRencontre`,
 *    donc les écrire ne compile pas. Un garde-fou de type vaut mieux qu'une
 *    consigne en prose (docs/qualite.md).
 * 2. **Colonnes FFBB verrouillées** — celles que `champs_verrouilles` désigne.
 *    Divergence ⇒ **conflit** décrit champ par champ, et **aucune écriture**.
 * 3. **Colonnes FFBB libres** — mises à jour dès que leur valeur diffère de
 *    celle de la ligne. Aucune divergence ⇒ `inchange`, zéro colonne.
 *
 * ## L'empreinte ne décide plus rien
 *
 * La décision se prend sur la **comparaison des valeurs**, jamais sur
 * `empreinte_ffbb`. Constat de review : une empreinte identique faisait conclure
 * « rien à faire » alors que la *ligne*, elle, pouvait avoir dérivé — une colonne
 * FFBB retouchée à la main sans verrou n'était donc jamais réconciliée, et la
 * base gardait sa valeur pour toujours, sans conflit ni trace.
 *
 * L'empreinte reste écrite (diagnostic, et filtrage rapide côté T06), mais elle
 * n'est **avancée que si toutes les colonnes divergentes ont pu être écrites** :
 * tant qu'un conflit reste ouvert, la ligne conserve l'ancienne, de sorte que le
 * prochain passage réexamine la rencontre. Contrepartie assumée : un conflit non
 * résolu est re-signalé à chaque synchronisation. C'est voulu — T06 déduplique
 * par l'index unique partiel `conflit_synchronisation_ouvert_unique`, et une
 * divergence non traitée doit rester visible.
 *
 * ## Contrat de `champs_verrouilles`
 *
 * La colonne contient les **noms camelCase des colonnes fusionnables**, ceux de
 * `ColonnesFfbbRencontre` (`scoreDomicile`, `dateHeure`, `slug`, `equipeId`…),
 * plus éventuellement les deux noms éditoriaux, acceptés sans effet puisqu'ils
 * sont déjà hors d'atteinte. Tout autre nom **lève** : un verrou qui ne protège
 * rien est un mensonge silencieux, exactement ce que le projet refuse — la
 * personne qui a écrit `score_domicile` au back-office croirait le score protégé
 * alors qu'il serait écrasé au prochain import.
 */

/* ------------------------------------------------------------------ *
 * Erreur
 * ------------------------------------------------------------------ */

export class ErreurFusionFfbb extends Error {
  override readonly name = "ErreurFusionFfbb";

  constructor(
    readonly idFfbb: string,
    readonly motif: string,
  ) {
    super(`rencontre FFBB ${idFfbb} : ${motif}`);
  }
}

/* ------------------------------------------------------------------ *
 * Entrée
 * ------------------------------------------------------------------ */

/**
 * Les colonnes que la fusion n'a **pas** le droit d'écrire. Elles ne figurent
 * pas dans `ColonnesFfbbRencontre` ; le type ci-dessous interdit en plus de les
 * faire entrer par l'état actuel.
 */
export type ColonneEditoriale = "resumeMd" | "affichePubliquement";

/**
 * L'état en base d'une rencontre déjà connue, réduit à ce dont la fusion a
 * besoin. `& { [C in ColonneEditoriale]?: never }` rend l'ajout d'un champ
 * éditorial impossible à compiler, y compris depuis une variable typée
 * largement : le premier cercle est tenu par le compilateur.
 */
export type EtatActuelRencontre = {
  /**
   * L'empreinte du dernier passage, `null` pour une rencontre créée à la main.
   * **La fusion ne s'en sert pas pour décider** : elle compare les valeurs (voir
   * l'en-tête du module). Elle reste portée ici parce que T06 s'en sert pour
   * filtrer en amont et parce qu'un diagnostic doit pouvoir la relire.
   */
  readonly empreinteFfbb: string | null;
  readonly champsVerrouilles: readonly string[];
  readonly colonnes: ColonnesFfbbRencontre;
} & { readonly [C in ColonneEditoriale]?: never };

/* ------------------------------------------------------------------ *
 * Sortie
 * ------------------------------------------------------------------ */

export interface ConflitFusion {
  readonly champ: keyof ColonnesFfbbRencontre;
  /** Ce que la base porte aujourd'hui, c'est-à-dire la saisie manuelle protégée. */
  readonly valeurLocale: ValeurColonne;
  /** Ce que la FFBB publie désormais, et qui n'a **pas** été écrit. */
  readonly valeurFfbb: ValeurColonne;
}

export type ColonnesACreer = ColonnesFfbbRencontre & { readonly empreinteFfbb: string };

/**
 * `empreinteFfbb` est **optionnelle** : elle n'est portée que si toutes les
 * colonnes divergentes ont pu être écrites. Tant qu'un conflit reste ouvert, la
 * ligne conserve son ancienne empreinte, pour que le prochain passage réexamine
 * la rencontre plutôt que de la croire à jour (voir `fusionner`).
 */
export type ColonnesAMettreAJour = Partial<ColonnesFfbbRencontre> & {
  readonly empreinteFfbb?: string;
};

/**
 * `action` est le discriminant : il détermine la forme de `colonnes`. Un
 * `inchange` ne peut pas porter de colonne, un `creer` les porte toutes — le
 * type dit la règle, l'appelant ne peut pas s'en écarter par distraction.
 */
export type ResultatFusion =
  | {
      readonly action: "creer";
      readonly colonnes: ColonnesACreer;
      readonly conflits: readonly ConflitFusion[];
    }
  | {
      readonly action: "mettre_a_jour";
      readonly colonnes: ColonnesAMettreAJour;
      readonly conflits: readonly ConflitFusion[];
    }
  | {
      readonly action: "inchange";
      readonly colonnes: Record<string, never>;
      readonly conflits: readonly ConflitFusion[];
    };

/* ------------------------------------------------------------------ *
 * Comparaison
 * ------------------------------------------------------------------ */

/**
 * Égalité valeur à valeur. Les `Date` se comparent sur leur instant : `===` sur
 * deux objets `Date` distincts est toujours faux, ce qui ferait diverger
 * `date_heure` à chaque import.
 */
function memeValeur(locale: ValeurColonne, ffbb: ValeurColonne): boolean {
  if (locale instanceof Date && ffbb instanceof Date) {
    return locale.getTime() === ffbb.getTime();
  }
  return locale === ffbb;
}

/** Les noms éditoriaux : acceptés comme verrous, sans effet (déjà intouchables). */
const NOMS_EDITORIAUX: readonly string[] = ["resumeMd", "affichePubliquement"];

/* ------------------------------------------------------------------ *
 * Groupes de colonnes indissociables
 * ------------------------------------------------------------------ */

/**
 * Colonnes que la base contraint **ensemble** : verrouiller l'une revient à
 * verrouiller tout le groupe.
 *
 * Constat de review : les verrous s'appliquaient colonne par colonne, ce qui
 * produisait des lignes incohérentes. `score_domicile` verrouillé à 48 et
 * résultat rétracté côté FFBB donnait un conflit sur `scoreDomicile` (non écrit)
 * mais un `scoreExterieur = null` écrit : la ligne violait
 * `rencontre_scores_ensemble` et faisait échouer la transaction de T06.
 *
 * Une entrée de conflit est produite **par colonne réellement divergente**, mais
 * le refus d'écriture porte sur le groupe entier.
 *
 * **Limite connue** : deux contraintes relient les deux groupes entre eux
 * (`rencontre_joue_avec_score`, `rencontre_score_manquant_sans_score`). Un verrou
 * sur `statut` seul, avec un score rétracté côté FFBB, peut donc encore produire
 * une ligne refusée par la base — bruyamment, dans la transaction de T06. Les
 * fusionner en un seul groupe figerait le statut dès qu'un score est verrouillé ;
 * l'arbitrage a été rendu en faveur de deux groupes, et le cas résiduel est
 * documenté plutôt que masqué.
 */
const GROUPES_INDISSOCIABLES: readonly (readonly string[])[] = [
  ["scoreDomicile", "scoreExterieur"],
  ["statut", "forfaitDomicile", "forfaitExterieur"],
];

/**
 * Étend les verrous à leur groupe : toute colonne qui partage un groupe avec une
 * colonne verrouillée devient protégée, qu'elle soit verrouillée ou non.
 */
function colonnesProtegees(verrous: ReadonlySet<string>): ReadonlySet<string> {
  const protegees = new Set(verrous);
  for (const groupe of GROUPES_INDISSOCIABLES) {
    if (groupe.some((champ) => verrous.has(champ))) {
      for (const champ of groupe) protegees.add(champ);
    }
  }
  return protegees;
}

/**
 * Valide les noms de `champs_verrouilles` et renvoie ceux qui portent sur une
 * colonne fusionnable.
 */
function verrousFusionnables(
  champsVerrouilles: readonly string[],
  nomsFusionnables: readonly string[],
  idFfbb: string,
): ReadonlySet<string> {
  const retenus = new Set<string>();
  for (const champ of champsVerrouilles) {
    if (nomsFusionnables.includes(champ)) {
      retenus.add(champ);
      continue;
    }
    if (NOMS_EDITORIAUX.includes(champ)) continue;
    throw new ErreurFusionFfbb(
      idFfbb,
      `champs_verrouilles contient « ${champ} », qui n'est pas une colonne ` +
        `alimentée par la FFBB. Noms acceptés : ${[...nomsFusionnables, ...NOMS_EDITORIAUX].join(", ")}`,
    );
  }
  return retenus;
}

/* ------------------------------------------------------------------ *
 * Point d'entrée
 * ------------------------------------------------------------------ */

/**
 * Décide de l'écriture à faire pour une rencontre.
 *
 * - `etatActuel === null` → `creer`, toutes les colonnes, aucun conflit
 *   possible : il n'y a pas encore de saisie à protéger.
 * - aucune colonne ne diverge → `inchange`, zéro colonne.
 * - sinon → `mettre_a_jour` : les colonnes libres qui diffèrent, plus
 *   `empreinte_ffbb` **si et seulement si** aucun conflit n'est resté ouvert.
 *   Les colonnes verrouillées qui diffèrent sortent en conflits et ne sont pas
 *   écrites ; quand elles sont les seules à diverger, il ne reste rien à écrire
 *   et le résultat est un `inchange` **porteur de conflits**.
 */
export function fusionner(
  etatActuel: EtatActuelRencontre | null,
  normalisee: RencontreNormalisee,
): ResultatFusion {
  if (etatActuel === null) {
    return {
      action: "creer",
      colonnes: { ...normalisee.colonnes, empreinteFfbb: normalisee.empreinteFfbb },
      conflits: [],
    };
  }

  // Les noms fusionnables se lisent sur l'objet lui-même : aucune liste à tenir
  // à jour en parallèle du type, donc aucune divergence possible.
  const entrees = Object.entries(normalisee.colonnes) as [
    keyof ColonnesFfbbRencontre,
    ValeurColonne,
  ][];
  const protegees = colonnesProtegees(
    verrousFusionnables(
      etatActuel.champsVerrouilles,
      entrees.map(([champ]) => champ),
      normalisee.idFfbb,
    ),
  );

  const aEcrire: Partial<Record<keyof ColonnesFfbbRencontre, ValeurColonne>> = {};
  const conflits: ConflitFusion[] = [];

  for (const [champ, valeurFfbb] of entrees) {
    const valeurLocale = etatActuel.colonnes[champ];
    // Identique : rien à écrire, et surtout pas de « conflit » sur une colonne
    // verrouillée qui n'a pas bougé.
    if (memeValeur(valeurLocale, valeurFfbb)) continue;

    // Un rattachement ne s'efface pas. `equipe_id` est renseigné par le
    // back-office, via les libellés d'engagement : un libellé retiré ou retouché
    // ferait sinon repasser la colonne à `null`, et la rencontre disparaîtrait
    // de « les matchs de l'équipe » sans que rien ne le signale. La FFBB peut le
    // renseigner (null → valeur) ou le corriger (valeur → autre valeur), jamais
    // le vider. Ce n'est pas un conflit : personne n'a rien arbitré.
    if (champ === "equipeId" && valeurFfbb === null) continue;

    if (protegees.has(champ)) {
      conflits.push({ champ, valeurLocale, valeurFfbb });
      continue;
    }
    aEcrire[champ] = valeurFfbb;
  }

  // Rien à écrire : la ligne est déjà conforme, ou tout ce qui divergeait est
  // protégé. Les conflits sortent quand même — c'est la seule trace de la
  // divergence, et elle doit revenir à chaque passage tant qu'elle dure.
  if (Object.keys(aEcrire).length === 0) {
    return { action: "inchange", colonnes: {}, conflits };
  }

  // Seule conversion du module : les clés viennent de `normalisee.colonnes`, les
  // couples clé/valeur sont donc cohérents par construction — ce que le typage
  // d'`Object.entries` ne sait pas exprimer sans réécrire la boucle en
  // générique, pour aucun gain de sûreté réelle.
  const colonnes = aEcrire as Partial<ColonnesFfbbRencontre>;

  return {
    action: "mettre_a_jour",
    // L'empreinte ne peut avancer que si plus rien ne diverge après écriture :
    // sinon la ligne serait déclarée « à jour » alors qu'elle ne l'est pas.
    colonnes:
      conflits.length === 0 ? { ...colonnes, empreinteFfbb: normalisee.empreinteFfbb } : colonnes,
    conflits,
  };
}
