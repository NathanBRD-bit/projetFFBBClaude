import { eq } from "drizzle-orm";

import type { BaseDeDonnees } from "@/infrastructure/bdd/client";
import { parametre } from "@/infrastructure/bdd/schema";

import { recupererJetons, type FournisseurDeJetons, type OptionsTransportFfbb } from "./client";
import { schemaJetonsFfbb, type JetonsFfbb } from "./schemas";

/**
 * Cache des jetons publics FFBB.
 *
 * Les jetons `key_dh` / `key_ms` **tournent** côté FFBB : ils se récupèrent à
 * chaque fois depuis `api.ffbb.com/items/configuration`, jamais en dur et jamais
 * dans `.env` — une valeur d'environnement figée deviendrait fausse sans
 * prévenir, et personne ne saurait pourquoi la synchronisation s'est arrêtée.
 *
 * Le cache vit dans la table `parametre` (clé / valeur / `expire_le`) plutôt
 * qu'en mémoire : sur Vercel chaque invocation est un processus neuf, un cache
 * mémoire ne survivrait pas à la requête suivante et on taperait la
 * configuration FFBB à chaque synchronisation.
 */

export const CLE_PARAMETRE_JETONS = "ffbb.jetons";

/** 6 h. Assez court pour suivre une rotation, assez long pour ne pas marteler l'API. */
export const DUREE_CACHE_JETONS_MS = 6 * 60 * 60 * 1000;

const DESCRIPTION_PARAMETRE =
  "Jetons publics FFBB (key_dh, key_ms) mis en cache 6 h. Valeur technique régénérée " +
  "automatiquement : la supprimer force un nouvel appel à api.ffbb.com/items/configuration.";

export interface DependancesFournisseurJetons {
  readonly base: BaseDeDonnees;
  /**
   * Horloge injectable. Les tests la figent pour prouver qu'un jeton de plus de
   * 6 h est bien renouvelé, sans attendre six heures.
   */
  readonly maintenant?: () => Date;
  /** Options passées au client HTTP (fetch, attente entre reprises, délais). */
  readonly transport?: OptionsTransportFfbb;
  /**
   * Appelé quand la ligne de cache est illisible, juste avant de redemander les
   * jetons à la FFBB. C'est le canal qui empêche l'incident d'être silencieux :
   * T06 y branchera l'écriture dans `journal_synchronisation`. Absent, l'anomalie
   * est réparée sans trace — acceptable en test, pas en production.
   */
  readonly onCacheIllisible?: (erreur: ErreurCacheJetons) => void;
}

/**
 * Le cache est illisible.
 *
 * Cette erreur n'interrompt plus la synchronisation : le cache est un artefact
 * **dérivé**, pas une donnée source. Une ligne abîmée se répare toute seule en
 * redemandant les jetons à la FFBB — bloquer un import de résultats pour ça
 * serait disproportionné. Mais l'incident ne doit pas passer inaperçu pour
 * autant : il est signalé à l'appelant via `onCacheIllisible`, que T06
 * consignera dans le journal de synchronisation. Bruyant, donc, sans être
 * bloquant.
 */
export class ErreurCacheJetons extends Error {
  override readonly name = "ErreurCacheJetons";

  constructor(detail: string, options?: { cause?: unknown }) {
    super(
      `Cache des jetons FFBB illisible (paramètre « ${CLE_PARAMETRE_JETONS} ») : ${detail}. ` +
        `Supprimez cette ligne de la table « parametre » pour forcer un renouvellement.`,
      options,
    );
  }
}

/**
 * Relit la ligne de cache **sans jamais lever**.
 *
 * Renvoyer un résultat plutôt que de lancer une exception supprime une branche
 * « erreur d'un autre type » que rien ne pouvait atteindre — du code mort dans un
 * chemin de secours est pire qu'inutile : il donne l'illusion d'une protection.
 */
function relireCache(
  valeur: string,
): { ok: true; jetons: JetonsFfbb } | { ok: false; erreur: ErreurCacheJetons } {
  let brut: unknown;
  try {
    brut = JSON.parse(valeur);
  } catch (cause) {
    return {
      ok: false,
      erreur: new ErreurCacheJetons("la valeur stockée n'est pas du JSON", { cause }),
    };
  }

  // `safeParse` plutôt que le `validerFfbb` qui lève : un cache au mauvais format
  // est le même incident qu'un cache illisible, il doit suivre le même chemin.
  const analyse = schemaJetonsFfbb.safeParse(brut);
  if (!analyse.success) {
    const detail = analyse.error.issues
      .map(
        (souci) =>
          `${souci.path.map((element) => String(element)).join(".") || "(racine)"} : ${souci.message}`,
      )
      .join(" ; ");
    return { ok: false, erreur: new ErreurCacheJetons(detail) };
  }
  return { ok: true, jetons: analyse.data };
}

/**
 * Construit le fournisseur de jetons attendu par `creerClientFfbb`.
 *
 * `obtenir()` sert le cache tant qu'il est valide, sinon interroge la FFBB et
 * réécrit la ligne. `invalider()` supprime la ligne : c'est ce que le client
 * appelle sur un 401/403, avant son unique nouvelle tentative.
 */
export function creerFournisseurDeJetons(
  dependances: DependancesFournisseurJetons,
): FournisseurDeJetons {
  const { base } = dependances;
  const maintenant = dependances.maintenant ?? (() => new Date());

  return {
    async obtenir(): Promise<JetonsFfbb> {
      const instant = maintenant();

      const lignes = await base
        .select({ valeur: parametre.valeur, expireLe: parametre.expireLe })
        .from(parametre)
        .where(eq(parametre.cle, CLE_PARAMETRE_JETONS))
        .limit(1);
      const ligne = lignes[0];

      // `expireLe` à `null` voudrait dire « valeur sans durée de vie » : pour
      // cette clé-là c'est un état incohérent, on la traite comme périmée et on
      // la réécrit avec une échéance — plutôt que de servir un jeton d'âge inconnu.
      if (ligne !== undefined && ligne.expireLe !== null && ligne.expireLe > instant) {
        const relu = relireCache(ligne.valeur);
        if (relu.ok) {
          return relu.jetons;
        }
        // Cache illisible : on le signale, puis on repart sur un appel réseau.
        // Lever bloquerait toute la synchronisation sur un artefact réparable en
        // une requête.
        dependances.onCacheIllisible?.(relu.erreur);
      }

      const frais = await recupererJetons(dependances.transport);
      const expireLe = new Date(instant.getTime() + DUREE_CACHE_JETONS_MS);
      const valeur = JSON.stringify(frais);

      await base
        .insert(parametre)
        .values({
          cle: CLE_PARAMETRE_JETONS,
          valeur,
          description: DESCRIPTION_PARAMETRE,
          expireLe,
        })
        .onConflictDoUpdate({
          target: parametre.cle,
          // `majLe` est posé explicitement : le `$onUpdate` du schéma ne
          // s'applique pas à la branche `do update` d'un `on conflict`, et un
          // horodatage qui ment est exactement le bug silencieux qu'on refuse.
          set: { valeur, expireLe, majLe: instant },
        });

      return frais;
    },

    async invalider(): Promise<void> {
      await base.delete(parametre).where(eq(parametre.cle, CLE_PARAMETRE_JETONS));
    },
  };
}
