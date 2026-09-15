import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnteteMatch } from "@/composants/public/match-entete";
import {
  decouperParagraphes,
  descriptionMatch,
  estJouee,
  formaterDateSansJourSemaine,
  intituleMatch,
  lienCarte,
} from "@/composants/public/match-outils";
import { TableauPoints } from "@/composants/public/match-tableau-points";
import { Conteneur } from "@/composants/ui/primitives";
import {
  listerPointsDuMatch,
  listerRencontres,
  trouverEquipeParId,
  trouverRencontre,
} from "@/infrastructure/donnees/depot";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const rencontres = await listerRencontres();
  return rencontres.map((rencontre) => ({ slug: rencontre.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const rencontre = await trouverRencontre(slug);
  if (rencontre === null) {
    // Pas de titre inventé pour une page qui va rendre un 404.
    return { title: "Match introuvable" };
  }
  const equipe = await trouverEquipeParId(rencontre.equipeId);
  if (equipe === null) {
    throw new Error(
      `Rencontre « ${rencontre.slug} » rattachée à une équipe inconnue « ${rencontre.equipeId} ».`,
    );
  }
  return {
    title: `${intituleMatch(rencontre)}, ${formaterDateSansJourSemaine(rencontre.dateHeure)}`,
    description: descriptionMatch(rencontre, equipe),
  };
}

export default async function PageMatch({ params }: Props) {
  const { slug } = await params;
  const rencontre = await trouverRencontre(slug);
  if (rencontre === null) {
    notFound();
  }

  const equipe = await trouverEquipeParId(rencontre.equipeId);
  if (equipe === null) {
    // Incohérence de données, pas un cas d'affichage : on casse au lieu de rendre
    // une page amputée de son équipe.
    throw new Error(
      `Rencontre « ${rencontre.slug} » rattachée à une équipe inconnue « ${rencontre.equipeId} ».`,
    );
  }

  const lignesPoints = await listerPointsDuMatch(rencontre.id);
  const jouee = estJouee(rencontre);
  const retour = jouee
    ? { href: "/resultats", libelle: "Retour aux résultats" }
    : { href: "/calendrier", libelle: "Retour au calendrier" };
  const paragraphes = rencontre.resume === null ? [] : decouperParagraphes(rencontre.resume);

  return (
    <Conteneur className="py-8 sm:py-12">
      <Link
        href={retour.href}
        className="inline-flex items-center gap-1 text-sm font-semibold text-violet underline underline-offset-4 hover:text-encre"
      >
        <span aria-hidden="true">←</span> {retour.libelle}
      </Link>

      <div className="mt-6">
        <EnteteMatch rencontre={rencontre} equipe={equipe} />
      </div>

      <section aria-labelledby="titre-lieu" className="mt-10">
        <h2
          id="titre-lieu"
          className="mb-3 border-b-2 border-jaune pb-1 text-lg font-bold text-violet"
        >
          Lieu
        </h2>
        {rencontre.salle === null ? (
          <p className="text-base text-encre-douce">
            Salle non communiquée. La FFBB n&apos;a pas publié le gymnase de cette rencontre : nous
            préférons ne rien indiquer plutôt que de vous envoyer au mauvais endroit.
          </p>
        ) : (
          <address className="text-base text-encre not-italic">
            <span className="block font-semibold">{rencontre.salle.nom}</span>
            <span className="block text-encre-douce">{rencontre.salle.adresse}</span>
            <span className="block text-encre-douce">{rencontre.salle.ville}</span>
            <a
              href={lienCarte(rencontre.salle)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center rounded-md border-2 border-violet px-4 py-2 text-sm font-bold text-violet transition-colors hover:bg-violet hover:text-white"
            >
              Voir sur une carte
              <span className="sr-only"> (OpenStreetMap, nouvel onglet)</span>
            </a>
          </address>
        )}
      </section>

      {paragraphes.length === 0 ? null : (
        <section aria-labelledby="titre-resume" className="mt-10">
          <h2
            id="titre-resume"
            className="mb-3 border-b-2 border-jaune pb-1 text-lg font-bold text-violet"
          >
            Le match
          </h2>
          <div className="flex max-w-prose flex-col gap-4">
            {paragraphes.map((paragraphe, index) => (
              // Texte brut découpé en paragraphes : aucun HTML n'est injecté à
              // partir de la saisie du club.
              <p
                key={`${String(index)}-${paragraphe.slice(0, 24)}`}
                className="text-base text-encre"
              >
                {paragraphe}
              </p>
            ))}
          </div>
        </section>
      )}

      {lignesPoints.length === 0 ? null : (
        <section aria-labelledby="titre-points" className="mt-10">
          <h2
            id="titre-points"
            className="mb-3 border-b-2 border-jaune pb-1 text-lg font-bold text-violet"
          >
            Points par joueur
          </h2>
          <TableauPoints lignes={lignesPoints} intitule={intituleMatch(rencontre)} />
        </section>
      )}

      {rencontre.urlFfbb === null ? null : (
        <p className="mt-10 text-sm text-encre-douce">
          <a
            href={rencontre.urlFfbb}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-violet underline underline-offset-4 hover:text-encre"
          >
            Consulter la fiche officielle sur le site de la FFBB
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
        </p>
      )}
    </Conteneur>
  );
}
