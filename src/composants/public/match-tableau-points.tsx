import { Badge } from "@/composants/ui/primitives";
import { formaterPoints, meilleurTotal } from "@/composants/public/match-outils";
import type { Joueur } from "@/domaine/types";

export interface LignePointsAffichee {
  readonly joueur: Joueur;
  readonly points: number | null;
}

/**
 * Points marqués par joueur.
 *
 * Le composant suppose qu'il y a au moins une ligne : c'est à l'appelant de ne pas
 * afficher la section quand la saisie n'a pas été faite. Un tableau vide ou un
 * « aucune statistique » n'apportent rien au visiteur.
 */
export function TableauPoints({
  lignes,
  intitule,
}: {
  lignes: readonly LignePointsAffichee[];
  intitule: string;
}) {
  const meilleur = meilleurTotal(lignes);
  const saisieIncomplete = lignes.some((ligne) => ligne.points === null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="mb-3 text-left text-sm text-encre-douce">
          Points marqués par joueur — {intitule}, du meilleur marqueur au dernier.
        </caption>
        <thead>
          <tr className="border-b-2 border-bordure text-left">
            <th scope="col" className="py-2 pr-3 font-semibold text-violet">
              Joueur
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold text-violet">
              N°
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold text-violet">
              Poste
            </th>
            <th scope="col" className="py-2 text-right font-semibold text-violet">
              Points
            </th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne) => {
            const estMeilleur = ligne.points !== null && ligne.points === meilleur;
            return (
              <tr
                key={ligne.joueur.id}
                className={`border-b border-bordure ${estMeilleur ? "bg-violet-voile" : ""}`}
              >
                <th scope="row" className="py-2 pr-3 text-left font-semibold text-encre">
                  <span className="mr-2">{ligne.joueur.nomAffiche}</span>
                  {estMeilleur ? <Badge ton="accent">Meilleur marqueur</Badge> : null}
                </th>
                <td className="py-2 pr-3 text-encre-douce tabular-nums">
                  {ligne.joueur.numero === null ? "—" : ligne.joueur.numero}
                </td>
                <td className="py-2 pr-3 text-encre-douce">{ligne.joueur.poste ?? "—"}</td>
                <td
                  className={`py-2 text-right tabular-nums ${
                    estMeilleur ? "font-extrabold text-violet" : "font-semibold text-encre"
                  }`}
                >
                  {ligne.points === null ? (
                    <>
                      <span aria-hidden="true">{formaterPoints(null)}</span>
                      <span className="sr-only">non saisi</span>
                    </>
                  ) : (
                    formaterPoints(ligne.points)
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {saisieIncomplete ? (
        <p className="mt-3 text-xs text-encre-douce">
          « — » signale une ligne non saisie sur la feuille de match, et non un joueur resté à zéro.
        </p>
      ) : null}
    </div>
  );
}
