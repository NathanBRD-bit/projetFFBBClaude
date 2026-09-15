import { CarteMatch } from "@/composants/public/carte-match";
import { libelleSexe } from "@/composants/public/equipe-carte";
import { Badge, Carte, Conteneur, EtatVide, TitreSection } from "@/composants/ui/primitives";
import { bilan } from "@/domaine/rencontres";
import type { Equipe, Joueur, Rencontre } from "@/domaine/types";

export interface ProprietesEquipe {
  readonly equipe: Equipe;
  readonly prochains: readonly Rencontre[];
  readonly derniers: readonly Rencontre[];
  /** Liste vide quand le club n'a pas saisi l'effectif : la section disparaît alors. */
  readonly joueurs: readonly Joueur[];
}

/** « 1 victoire », « 2 victoires » : l'accord se fait ici, pas dans le JSX. */
function accorder(nombre: number, singulier: string): string {
  return `${String(nombre)} ${singulier}${nombre > 1 ? "s" : ""}`;
}

function ListeMatchs({
  rencontres,
  equipe,
  titreVide,
  explicationVide,
}: {
  rencontres: readonly Rencontre[];
  equipe: Equipe;
  titreVide: string;
  explicationVide: string;
}) {
  if (rencontres.length === 0) {
    return <EtatVide titre={titreVide}>{explicationVide}</EtatVide>;
  }

  return (
    <ul className="space-y-2">
      {rencontres.map((rencontre) => (
        // `afficherEquipe={false}` : on est déjà sur la page de l'équipe, répéter son
        // nom sur chaque ligne n'apprend rien et allonge la lecture.
        <CarteMatch
          key={rencontre.id}
          rencontre={rencontre}
          equipe={equipe}
          afficherEquipe={false}
        />
      ))}
    </ul>
  );
}

function Effectif({ joueurs }: { joueurs: readonly Joueur[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Effectif de l&apos;équipe</caption>
        <thead>
          <tr className="bg-violet-voile text-left text-violet">
            <th scope="col" className="border border-bordure px-3 py-2 font-bold">
              Numéro
            </th>
            <th scope="col" className="border border-bordure px-3 py-2 font-bold">
              Joueur
            </th>
            <th scope="col" className="border border-bordure px-3 py-2 font-bold">
              Poste
            </th>
          </tr>
        </thead>
        <tbody>
          {joueurs.map((joueur) => (
            <tr key={joueur.id}>
              <td className="border border-bordure px-3 py-2 font-bold tabular-nums text-violet">
                {/* Un numéro non attribué reste vide : jamais remplacé par un « 0 ». */}
                {joueur.numero === null ? "—" : joueur.numero}
              </td>
              <td className="border border-bordure px-3 py-2">{joueur.nomAffiche}</td>
              <td className="border border-bordure px-3 py-2 text-encre-douce">
                {joueur.poste ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Page d'une équipe, hors récupération des données. Chaque bloc facultatif
 * (encadrement, créneaux, effectif) disparaît complètement quand l'information
 * manque : un tableau vide ou un « aucun joueur » ferait passer une donnée non
 * saisie pour un fait.
 */
export function DetailEquipe({ equipe, prochains, derniers, joueurs }: ProprietesEquipe) {
  const compteur = bilan(derniers);

  return (
    <>
      <section className="sur-violet bg-violet-fonce text-white">
        <Conteneur className="py-10 sm:py-14">
          <div className="flex flex-wrap items-center gap-2">
            <Badge ton="attention">{equipe.categorie}</Badge>
            <Badge ton="attention">{libelleSexe(equipe.sexe)}</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{equipe.nom}</h1>
          <p className="mt-2 text-base text-white/85">{equipe.competition}</p>
        </Conteneur>
      </section>

      <Conteneur className="space-y-12 py-10 sm:py-14">
        <section aria-labelledby="titre-presentation">
          <TitreSection>
            <span id="titre-presentation">L&apos;équipe</span>
          </TitreSection>
          <p className="max-w-prose text-base leading-relaxed text-encre">{equipe.presentation}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {equipe.entraineurs.length === 0 ? null : (
              <Carte className="p-4">
                <h3 className="text-sm font-bold tracking-wider text-violet uppercase">
                  {equipe.entraineurs.length > 1 ? "Entraîneurs" : "Entraîneur"}
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-encre">
                  {equipe.entraineurs.map((entraineur) => (
                    <li key={entraineur}>{entraineur}</li>
                  ))}
                </ul>
              </Carte>
            )}

            {equipe.creneaux.length === 0 ? null : (
              <Carte className="p-4">
                <h3 className="text-sm font-bold tracking-wider text-violet uppercase">Créneaux</h3>
                <ul className="mt-2 space-y-1 text-sm text-encre">
                  {equipe.creneaux.map((creneau) => (
                    <li key={creneau}>{creneau}</li>
                  ))}
                </ul>
              </Carte>
            )}
          </div>
        </section>

        <section aria-labelledby="titre-prochains-matchs">
          <TitreSection>
            <span id="titre-prochains-matchs">Les prochains matchs</span>
          </TitreSection>
          <ListeMatchs
            rencontres={prochains}
            equipe={equipe}
            titreVide="Aucun match à venir"
            explicationVide="Le calendrier de cette équipe n'a pas encore été publié par la FFBB, ou sa saison est terminée."
          />
        </section>

        <section aria-labelledby="titre-derniers-matchs">
          <TitreSection>
            <span id="titre-derniers-matchs">Les derniers résultats</span>
          </TitreSection>
          {compteur.joues === 0 ? null : (
            <p className="mb-4 text-sm text-encre-douce">
              {compteur.joues === 1
                ? "Sur le dernier match au score connu : "
                : `Sur les ${String(compteur.joues)} derniers matchs au score connu : `}
              <strong className="font-bold text-victoire">
                {accorder(compteur.victoires, "victoire")}
              </strong>
              {", "}
              <strong className="font-bold text-defaite">
                {accorder(compteur.defaites, "défaite")}
              </strong>
              {compteur.nuls === 0 ? "" : `, ${accorder(compteur.nuls, "nul")}`}.
            </p>
          )}
          <ListeMatchs
            rencontres={derniers}
            equipe={equipe}
            titreVide="Aucun résultat"
            explicationVide="Aucune rencontre jouée n'a encore été enregistrée pour cette équipe."
          />
        </section>

        {/* Seules deux équipes ont un effectif saisi. Pour les autres, aucune section :
            ni tableau vide, ni « aucun joueur », qui laisseraient croire à un effectif
            réellement vide alors que l'information n'a simplement pas été renseignée. */}
        {joueurs.length === 0 ? null : (
          <section aria-labelledby="titre-effectif">
            <TitreSection>
              <span id="titre-effectif">L&apos;effectif</span>
            </TitreSection>
            <Effectif joueurs={joueurs} />
          </section>
        )}
      </Conteneur>
    </>
  );
}
