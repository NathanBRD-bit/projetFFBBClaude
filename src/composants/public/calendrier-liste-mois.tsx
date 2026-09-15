import { CarteMatch } from "@/composants/public/carte-match";
import type { Equipe, Rencontre } from "@/domaine/types";

export interface GroupeMois {
  readonly cle: string;
  readonly libelle: string;
  readonly rencontres: readonly Rencontre[];
}

/**
 * Rend des rencontres regroupées par mois (`regrouperParMois()` du domaine).
 * Partagé par le calendrier et les résultats : un match doit s'afficher de la même
 * façon des deux côtés.
 */
export function ListeParMois({
  groupes,
  equipesParId,
  afficherEquipe = true,
}: {
  groupes: readonly GroupeMois[];
  equipesParId: ReadonlyMap<string, Equipe>;
  afficherEquipe?: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      {groupes.map((groupe) => (
        <section key={groupe.cle} aria-labelledby={`mois-${groupe.cle}`}>
          <h2
            id={`mois-${groupe.cle}`}
            className="mb-3 border-b-2 border-jaune pb-1 text-lg font-bold text-violet first-letter:uppercase"
          >
            {groupe.libelle}
          </h2>
          <ul className="flex flex-col gap-2">
            {groupe.rencontres.map((rencontre) => {
              const equipe = equipesParId.get(rencontre.equipeId);
              if (equipe === undefined) {
                // Pas de repli silencieux : une rencontre rattachée à une équipe
                // inexistante est une incohérence de données, elle doit casser ici
                // plutôt que de produire une ligne amputée de son équipe.
                throw new Error(
                  `Rencontre « ${rencontre.slug} » rattachée à une équipe inconnue « ${rencontre.equipeId} ».`,
                );
              }
              return (
                <CarteMatch
                  key={rencontre.id}
                  rencontre={rencontre}
                  equipe={equipe}
                  afficherEquipe={afficherEquipe}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
