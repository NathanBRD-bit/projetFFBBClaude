import Link from "next/link";
import { formaterDateCourte, formaterHeure, libelleStatut, resultat } from "@/domaine/rencontres";
import type { Equipe, Rencontre } from "@/domaine/types";
import { Badge } from "@/composants/ui/primitives";

/**
 * Ligne de match, utilisée par le calendrier, les résultats, l'accueil et les
 * pages d'équipe. Un seul composant pour toutes ces vues : un score ne doit pas
 * s'afficher différemment d'une page à l'autre.
 */
export function CarteMatch({
  rencontre,
  equipe,
  afficherEquipe = true,
}: {
  rencontre: Rencontre;
  equipe: Equipe | null;
  afficherEquipe?: boolean;
}) {
  const issue = resultat(rencontre);
  const heure = formaterHeure(rencontre);
  const scoreConnu = rencontre.scoreNous !== null && rencontre.scoreAdversaire !== null;

  return (
    <li>
      <Link
        href={`/matchs/${rencontre.slug}`}
        className="flex items-center gap-4 rounded-lg border border-bordure bg-fond px-4 py-3 transition-colors hover:border-violet hover:bg-violet-voile"
      >
        <div className="w-16 shrink-0 text-center">
          <p className="text-sm font-bold text-violet">{formaterDateCourte(rencontre.dateHeure)}</p>
          {/* Pas d'heure inventée : quand la FFBB ne l'a pas publiée, on le dit. */}
          <p className="text-xs text-encre-douce">{heure ?? "horaire à venir"}</p>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-encre">
            <span className="text-encre-douce">{rencontre.domicile ? "contre" : "à"} </span>
            {rencontre.adversaire}
          </p>
          <p className="truncate text-xs text-encre-douce">
            {afficherEquipe && equipe !== null ? `${equipe.nom} · ` : ""}
            {rencontre.domicile ? "à domicile" : "en déplacement"}
            {rencontre.journee === null ? "" : ` · journée ${String(rencontre.journee)}`}
          </p>
        </div>

        <div className="shrink-0 text-right">
          {scoreConnu ? (
            <p
              className={`text-lg font-extrabold tabular-nums ${
                issue === "victoire"
                  ? "text-victoire"
                  : issue === "defaite"
                    ? "text-defaite"
                    : "text-encre"
              }`}
            >
              {rencontre.scoreNous} – {rencontre.scoreAdversaire}
            </p>
          ) : (
            <Badge ton={rencontre.statut === "reporte" ? "attention" : "neutre"}>
              {rencontre.statut === "joue"
                ? "score non communiqué"
                : libelleStatut(rencontre.statut)}
            </Badge>
          )}
        </div>
      </Link>
    </li>
  );
}
