import type { Metadata } from "next";
import Link from "next/link";
import { FiltresRencontres, type OptionFiltre } from "@/composants/public/calendrier-filtres";
import { ListeParMois } from "@/composants/public/calendrier-liste-mois";
import {
  accorder,
  libelleSaison,
  lienFiltre,
  lireParametre,
  rencontresJouees,
  resoudreEquipe,
  resoudreSaison,
} from "@/composants/public/match-outils";
import { Carte, Conteneur, EtatVide } from "@/composants/ui/primitives";
import { bilan, regrouperParMois } from "@/domaine/rencontres";
import type { Rencontre } from "@/domaine/types";
import {
  listerEquipes,
  listerRencontres,
  listerSaisons,
  SAISON_COURANTE,
} from "@/infrastructure/donnees/depot";

export const metadata: Metadata = {
  title: "Résultats",
  description:
    "Tous les résultats des équipes du SOCL Basket, saison par saison, avec le bilan victoires / défaites.",
};

export default async function PageResultats({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametres = await searchParams;
  const saisons = listerSaisons();
  const equipes = await listerEquipes();
  const choixSaison = resoudreSaison(saisons, lireParametre(parametres.saison), SAISON_COURANTE);
  const choixEquipe = resoudreEquipe(equipes, lireParametre(parametres.equipe));

  let jouees: Rencontre[] = [];
  if (choixSaison.etat === "trouvee" && choixEquipe.etat !== "inconnue") {
    const rencontres = await listerRencontres({
      saison: choixSaison.saison,
      equipeId: choixEquipe.etat === "trouvee" ? choixEquipe.equipe.id : undefined,
    });
    jouees = rencontresJouees(rencontres);
  }

  // Les liens de filtre conservent l'autre filtre : changer d'équipe ne doit pas
  // renvoyer sournoisement le visiteur sur une autre saison.
  const saisonCourante = choixSaison.etat === "trouvee" ? choixSaison.saison : null;
  const equipeCourante = choixEquipe.etat === "trouvee" ? choixEquipe.equipe.slug : null;

  const optionsSaison: OptionFiltre[] = saisons.map((code) => ({
    href: lienFiltre("/resultats", { saison: code, equipe: equipeCourante }),
    libelle: libelleSaison(code),
    actif: saisonCourante === code,
  }));

  const optionsEquipe: OptionFiltre[] = [
    {
      href: lienFiltre("/resultats", { saison: saisonCourante, equipe: null }),
      libelle: "Toutes les équipes",
      actif: choixEquipe.etat === "toutes",
    },
    ...equipes.map((equipe) => ({
      href: lienFiltre("/resultats", { saison: saisonCourante, equipe: equipe.slug }),
      libelle: equipe.nom,
      actif: choixEquipe.etat === "trouvee" && choixEquipe.equipe.id === equipe.id,
    })),
  ];

  const equipesParId = new Map(equipes.map((equipe) => [equipe.id, equipe]));
  const comptes = bilan(jouees);
  const sansScore = jouees.length - comptes.joues;

  return (
    <Conteneur className="py-8 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight text-violet sm:text-3xl">Résultats</h1>
      <p className="mt-3 max-w-prose text-base text-encre-douce">
        Les rencontres déjà disputées, de la plus récente à la plus ancienne. Les scores proviennent
        des feuilles de match remontées à la FFBB : quand l&apos;une d&apos;elles manque, le score
        est annoncé comme non communiqué plutôt que remplacé par un zéro.
      </p>

      <FiltresRencontres etiquette="Filtrer par saison" options={optionsSaison} />
      <FiltresRencontres etiquette="Filtrer par équipe" options={optionsEquipe} />

      <div className="mt-8">
        {choixSaison.etat === "inconnue" ? (
          <EtatVide titre={`Aucune saison ne correspond à « ${choixSaison.code} »`}>
            Les saisons publiées sur le site sont {saisons.map(libelleSaison).join(" et ")}.{" "}
            <Link href="/resultats" className="font-semibold text-violet underline">
              Revenir aux résultats
            </Link>
            .
          </EtatVide>
        ) : choixEquipe.etat === "inconnue" ? (
          <EtatVide titre={`Aucune équipe ne correspond à « ${choixEquipe.slug} »`}>
            L&apos;adresse demandée pointe vers une équipe qui n&apos;existe pas au club.{" "}
            <Link href="/resultats" className="font-semibold text-violet underline">
              Revenir aux résultats
            </Link>
            .
          </EtatVide>
        ) : jouees.length === 0 ? (
          <EtatVide
            titre={
              choixEquipe.etat === "trouvee"
                ? `Aucun match joué par les ${choixEquipe.equipe.nom} en ${libelleSaison(choixSaison.saison)}`
                : `Aucun match joué en ${libelleSaison(choixSaison.saison)}`
            }
          >
            Aucun résultat n&apos;a encore été enregistré sur ce périmètre. Les rencontres
            programmées sont sur le{" "}
            <Link href="/calendrier" className="font-semibold text-violet underline">
              calendrier
            </Link>
            .
          </EtatVide>
        ) : (
          <>
            <Carte className="mb-8 px-4 py-5 sm:px-6">
              <h2 className="text-sm font-semibold tracking-wider text-encre-douce uppercase">
                Bilan {libelleSaison(choixSaison.saison)}
                {choixEquipe.etat === "trouvee" ? ` · ${choixEquipe.equipe.nom}` : ""}
              </h2>
              <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
                <div>
                  <dt className="text-xs text-encre-douce">Victoires</dt>
                  <dd className="text-2xl font-extrabold text-victoire tabular-nums">
                    {comptes.victoires}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-encre-douce">Défaites</dt>
                  <dd className="text-2xl font-extrabold text-defaite tabular-nums">
                    {comptes.defaites}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-encre-douce">Matchs nuls</dt>
                  <dd className="text-2xl font-extrabold text-encre tabular-nums">
                    {comptes.nuls}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-encre-douce">Matchs comptabilisés</dt>
                  <dd className="text-2xl font-extrabold text-violet tabular-nums">
                    {comptes.joues}
                  </dd>
                </div>
              </dl>
              {sansScore > 0 ? (
                <p className="mt-3 text-sm text-encre-douce">
                  {accorder(sansScore, "rencontre")} de ce périmètre{" "}
                  {sansScore > 1 ? "sont disputées" : "est disputée"} sans que la feuille de match
                  ait été remontée : {sansScore > 1 ? "elles ne comptent" : "elle ne compte"} ni en
                  victoire ni en défaite.
                </p>
              ) : null}
            </Carte>

            <ListeParMois
              groupes={regrouperParMois(jouees)}
              equipesParId={equipesParId}
              afficherEquipe={choixEquipe.etat === "toutes"}
            />
          </>
        )}
      </div>
    </Conteneur>
  );
}
