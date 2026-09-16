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
 * 3. **Colonnes FFBB libres** — mises à jour, et seulement si `empreinte_ffbb`
 *    a changé. Empreinte identique ⇒ `inchange`, zéro colonne, `maj_le` intact.
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
  /** `null` pour une rencontre créée à la main, jamais encore synchronisée. */
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

export type ColonnesAMettreAJour = Partial<ColonnesFfbbRencontre> & {
  readonly empreinteFfbb: string;
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
 * - empreinte identique → `inchange`. Les verrous sont tout de même validés, et
 *   aucun conflit n'est produit : si la FFBB n'a pas bougé depuis le dernier
 *   import, un écart sur un champ verrouillé est notre propre correction
 *   manuelle, pas une divergence de source. La signaler à chaque passage
 *   noierait les vrais conflits.
 * - sinon → `mettre_a_jour` : les colonnes libres qui diffèrent, plus
 *   `empreinte_ffbb`. Les colonnes verrouillées qui diffèrent sortent en
 *   conflits et ne sont pas écrites.
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
  const verrous = verrousFusionnables(
    etatActuel.champsVerrouilles,
    entrees.map(([champ]) => champ),
    normalisee.idFfbb,
  );

  if (etatActuel.empreinteFfbb === normalisee.empreinteFfbb) {
    return { action: "inchange", colonnes: {}, conflits: [] };
  }

  const aEcrire: Partial<Record<keyof ColonnesFfbbRencontre, ValeurColonne>> = {};
  const conflits: ConflitFusion[] = [];

  for (const [champ, valeurFfbb] of entrees) {
    const valeurLocale = etatActuel.colonnes[champ];
    // Identique : rien à écrire, et surtout pas de « conflit » sur une colonne
    // verrouillée qui n'a pas bougé.
    if (memeValeur(valeurLocale, valeurFfbb)) continue;

    if (verrous.has(champ)) {
      conflits.push({ champ, valeurLocale, valeurFfbb });
      continue;
    }
    aEcrire[champ] = valeurFfbb;
  }

  return {
    action: "mettre_a_jour",
    // Seule conversion du module : les clés viennent de `normalisee.colonnes`,
    // les couples clé/valeur sont donc cohérents par construction — ce que le
    // typage d'`Object.entries` ne sait pas exprimer sans réécrire la boucle en
    // générique, pour aucun gain de sûreté réelle.
    colonnes: {
      ...(aEcrire as Partial<ColonnesFfbbRencontre>),
      empreinteFfbb: normalisee.empreinteFfbb,
    },
    conflits,
  };
}
