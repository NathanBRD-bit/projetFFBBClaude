import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DetailEquipe } from "@/composants/public/equipe-detail";
import { libelleSexe } from "@/composants/public/equipe-carte";
import { dernieresRencontresJouees, prochainesRencontres } from "@/domaine/rencontres";
import {
  listerEquipes,
  listerJoueurs,
  listerRencontres,
  trouverEquipe,
} from "@/infrastructure/donnees/depot";

/** Les prochains matchs et les derniers résultats affichés sur une page d'équipe. */
const NOMBRE_MATCHS_AFFICHES = 5;

/** La liste des prochains matchs dépend de l'heure courante : cf. src/app/page.tsx. */
export const revalidate = 3600;

interface ProprietesPage {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const equipes = await listerEquipes();
  return equipes.map((equipe) => ({ slug: equipe.slug }));
}

export async function generateMetadata({ params }: ProprietesPage): Promise<Metadata> {
  const { slug } = await params;
  const equipe = await trouverEquipe(slug);
  if (equipe === null) {
    return { title: "Équipe introuvable" };
  }
  return {
    title: equipe.nom,
    description: `${equipe.categorie} ${libelleSexe(equipe.sexe)} du SOCL Basket — ${equipe.competition}. Calendrier, résultats et effectif.`,
  };
}

export default async function PageEquipe({ params }: ProprietesPage) {
  const { slug } = await params;
  const equipe = await trouverEquipe(slug);
  if (equipe === null) {
    notFound();
  }

  const [rencontres, joueurs] = await Promise.all([
    listerRencontres({ equipeId: equipe.id }),
    listerJoueurs(equipe.id),
  ]);

  return (
    <DetailEquipe
      equipe={equipe}
      prochains={prochainesRencontres(rencontres, new Date(), NOMBRE_MATCHS_AFFICHES)}
      derniers={dernieresRencontresJouees(rencontres, NOMBRE_MATCHS_AFFICHES)}
      joueurs={joueurs}
    />
  );
}
