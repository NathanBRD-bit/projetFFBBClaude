import type { Metadata } from "next";
import Link from "next/link";
import { FiltresRencontres, type OptionFiltre } from "@/composants/public/calendrier-filtres";
import { ListeParMois } from "@/composants/public/calendrier-liste-mois";
import {
  libelleSaison,
  lienFiltre,
  lireParametre,
  resoudreEquipe,
} from "@/composants/public/match-outils";
import { Conteneur, EtatVide } from "@/composants/ui/primitives";
import { prochainesRencontres, regrouperParMois } from "@/domaine/rencontres";
import type { Rencontre } from "@/domaine/types";
import { listerEquipes, listerRencontres, SAISON_COURANTE } from "@/infrastructure/donnees/depot";

const SAISON_AFFICHEE = libelleSaison(SAISON_COURANTE);

export const metadata: Metadata = {
  title: "Calendrier",
  description: `Les matchs à venir des équipes du SOCL Basket pour la saison ${SAISON_AFFICHEE}, équipe par équipe.`,
};

export default async function PageCalendrier({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametres = await searchParams;
  const equipes = await listerEquipes();
  const selection = resoudreEquipe(equipes, lireParametre(parametres.equipe));

  let aVenir: Rencontre[] = [];
  if (selection.etat !== "inconnue") {
    const rencontres = await listerRencontres({
      saison: SAISON_COURANTE,
      equipeId: selection.etat === "trouvee" ? selection.equipe.id : undefined,
    });
    aVenir = prochainesRencontres(rencontres, new Date());
  }

  const equipesParId = new Map(equipes.map((equipe) => [equipe.id, equipe]));
  const options: OptionFiltre[] = [
    {
      href: "/calendrier",
      libelle: "Toutes les équipes",
      actif: selection.etat === "toutes",
    },
    ...equipes.map((equipe) => ({
      href: lienFiltre("/calendrier", { equipe: equipe.slug }),
      libelle: equipe.nom,
      actif: selection.etat === "trouvee" && selection.equipe.id === equipe.id,
    })),
  ];

  return (
    <Conteneur className="py-8 sm:py-12">
      <h1 className="text-2xl font-bold tracking-tight text-violet sm:text-3xl">
        Calendrier {SAISON_AFFICHEE}
      </h1>
      <p className="mt-3 max-w-prose text-base text-encre-douce">
        La FFBB publie les rencontres au fil de l&apos;eau, souvent quelques semaines seulement à
        l&apos;avance : cette page ne montre que ce qui a déjà été officialisé, et se complète à
        chaque nouvelle publication.
      </p>

      <FiltresRencontres etiquette="Filtrer par équipe" options={options} />

      <div className="mt-8">
        {selection.etat === "inconnue" ? (
          <EtatVide titre={`Aucune équipe ne correspond à « ${selection.slug} »`}>
            L&apos;adresse demandée pointe vers une équipe qui n&apos;existe pas au club.{" "}
            <Link href="/calendrier" className="font-semibold text-violet underline">
              Revenir au calendrier complet
            </Link>
            .
          </EtatVide>
        ) : aVenir.length === 0 ? (
          <EtatVide
            titre={
              selection.etat === "trouvee"
                ? `Aucun match à venir pour les ${selection.equipe.nom}`
                : `La FFBB n'a pas encore publié la suite du calendrier ${SAISON_AFFICHEE}`
            }
          >
            Rien n&apos;est encore programmé ici. En attendant, les rencontres déjà disputées sont
            sur la page{" "}
            <Link href="/resultats" className="font-semibold text-violet underline">
              Résultats
            </Link>
            .
          </EtatVide>
        ) : (
          <ListeParMois
            groupes={regrouperParMois(aVenir)}
            equipesParId={equipesParId}
            afficherEquipe={selection.etat === "toutes"}
          />
        )}
      </div>
    </Conteneur>
  );
}
