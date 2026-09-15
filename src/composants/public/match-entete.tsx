import { Badge } from "@/composants/ui/primitives";
import { estJouee, messageForfait, ordreAffichage } from "@/composants/public/match-outils";
import { formaterDateLongue, formaterHeure, libelleStatut, resultat } from "@/domaine/rencontres";
import { formaterScore } from "@/domaine/score";
import type { Equipe, Rencontre } from "@/domaine/types";

const TONS_RESULTAT = {
  victoire: "text-victoire",
  defaite: "text-defaite",
  nul: "text-encre",
} as const;

/**
 * En-tête d'une page de match : les deux équipes dans l'ordre recevant / visiteur,
 * puis le score s'il est connu, sinon la date et l'heure.
 *
 * On ne se sert pas de l'horloge ici : c'est le statut de la rencontre qui décide
 * quoi afficher. Une page générée statiquement doit rendre la même chose quel que
 * soit le moment du build.
 */
export function EnteteMatch({ rencontre, equipe }: { rencontre: Rencontre; equipe: Equipe }) {
  const { recevant, visiteur } = ordreAffichage(rencontre);
  const jouee = estJouee(rencontre);
  const scoreConnu = rencontre.scoreNous !== null && rencontre.scoreAdversaire !== null;
  const issue = resultat(rencontre);
  const heure = formaterHeure(rencontre);
  const forfait = messageForfait(rencontre);

  return (
    <header className="rounded-lg border border-bordure bg-fond-doux px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-center justify-center gap-2 text-center">
        <Badge ton={rencontre.statut === "reporte" ? "attention" : "neutre"}>
          {libelleStatut(rencontre.statut)}
        </Badge>
        <p className="text-sm text-encre-douce">
          {rencontre.competition}
          {rencontre.journee === null ? "" : ` · journée ${String(rencontre.journee)}`}
        </p>
      </div>

      <h1 className="sr-only">
        {recevant.nom} contre {visiteur.nom}, {formaterDateLongue(rencontre.dateHeure)}
      </h1>

      <div className="mt-6 grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <p
          aria-hidden="true"
          className={`text-center text-xl font-bold sm:text-right ${
            recevant.estNous ? "text-violet" : "text-encre"
          }`}
        >
          {recevant.nom}
        </p>

        <div className="text-center">
          {jouee && scoreConnu ? (
            <p
              className={`text-4xl font-extrabold tabular-nums sm:text-5xl ${
                issue === null ? "text-encre" : TONS_RESULTAT[issue]
              }`}
            >
              {formaterScore(recevant.score, visiteur.score)}
            </p>
          ) : jouee ? (
            <>
              <p
                className="text-4xl font-extrabold text-encre-douce sm:text-5xl"
                aria-hidden="true"
              >
                {formaterScore(null, null)}
              </p>
              <p className="mt-1 text-sm font-semibold text-encre-douce">Score non communiqué</p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-violet first-letter:uppercase">
                {formaterDateLongue(rencontre.dateHeure)}
              </p>
              <p className="text-sm text-encre-douce">
                {heure === null ? "Horaire non communiqué par la FFBB" : heure}
              </p>
            </>
          )}
        </div>

        <p
          aria-hidden="true"
          className={`text-center text-xl font-bold sm:text-left ${
            visiteur.estNous ? "text-violet" : "text-encre"
          }`}
        >
          {visiteur.nom}
        </p>
      </div>

      <p className="mt-6 text-center text-sm text-encre-douce">
        {equipe.nom} · {rencontre.domicile ? "à domicile" : "en déplacement"}
      </p>

      {forfait === null ? null : (
        <p className="mt-4 rounded-md border border-bordure bg-fond px-4 py-3 text-center text-sm font-semibold text-encre">
          {forfait}
        </p>
      )}

      {jouee && !scoreConnu ? (
        <p className="mt-4 rounded-md border border-bordure bg-fond px-4 py-3 text-center text-sm text-encre-douce">
          La feuille de match n&apos;a pas été transmise à la FFBB : le score de cette rencontre
          n&apos;est pas connu. Il n&apos;est compté ni en victoire ni en défaite.
        </p>
      ) : null}
    </header>
  );
}
