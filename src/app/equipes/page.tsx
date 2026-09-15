import type { Metadata } from "next";
import { CarteEquipe } from "@/composants/public/equipe-carte";
import { Conteneur, EtatVide } from "@/composants/ui/primitives";
import { listerEquipes } from "@/infrastructure/donnees/depot";

export const metadata: Metadata = {
  title: "Les équipes",
  description:
    "Les équipes engagées par le SOCL Basket cette saison, du mini-basket aux seniors et aux vétérans.",
};

export default async function PageEquipes() {
  // Le dépôt renvoie déjà les équipes triées par `ordre` : pas de second tri ici,
  // sinon deux endroits décideraient de l'ordre d'affichage.
  const equipes = await listerEquipes();

  return (
    <Conteneur className="py-10 sm:py-14">
      <h1 className="text-3xl font-extrabold tracking-tight text-violet sm:text-4xl">
        Les équipes du club
      </h1>
      <p className="mt-3 max-w-2xl text-base text-encre-douce">
        Le SOCL engage des équipes dans toutes les catégories, des plateaux du samedi matin chez les
        plus jeunes aux rencontres du samedi soir chez les seniors.
      </p>

      <div className="mt-8">
        {equipes.length === 0 ? (
          <EtatVide titre="Aucune équipe engagée">
            Les engagements de la saison n&apos;ont pas encore été enregistrés auprès de la FFBB.
          </EtatVide>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {equipes.map((equipe) => (
              <li key={equipe.id}>
                <CarteEquipe equipe={equipe} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Conteneur>
  );
}
