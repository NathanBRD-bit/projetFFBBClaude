import { AccueilContenu, type RencontreAffichee } from "@/composants/public/accueil-contenu";
import { dernieresRencontresJouees, prochainesRencontres } from "@/domaine/rencontres";
import type { Equipe, Rencontre } from "@/domaine/types";
import { listerArticles, listerEquipes, listerRencontres } from "@/infrastructure/donnees/depot";

/**
 * Le « prochain match » se calcule par rapport à l'heure courante : une page figée
 * au moment du build finirait par mettre en avant un match déjà joué. Une heure de
 * fraîcheur suffit — le calendrier FFBB ne bouge pas plus vite que ça.
 */
export const revalidate = 3600;

/**
 * Rattache une rencontre à son équipe.
 *
 * Une rencontre orpheline est une incohérence de données, pas un cas d'affichage :
 * on échoue bruyamment plutôt que de publier une carte de match sans équipe.
 */
function rattacher(
  rencontre: Rencontre,
  equipesParId: ReadonlyMap<string, Equipe>,
): RencontreAffichee {
  const equipe = equipesParId.get(rencontre.equipeId);
  if (equipe === undefined) {
    throw new Error(
      `Rencontre « ${rencontre.id} » rattachée à une équipe inconnue « ${rencontre.equipeId} ».`,
    );
  }
  return { rencontre, equipe };
}

export default async function PageAccueil() {
  // Trois lectures indépendantes, lancées ensemble plutôt qu'en cascade.
  const [equipes, articles, rencontres] = await Promise.all([
    listerEquipes(),
    listerArticles(3),
    listerRencontres(),
  ]);

  // Une seule passe pour indexer les équipes : pas un appel au dépôt par rencontre.
  const equipesParId = new Map(equipes.map((equipe) => [equipe.id, equipe]));

  const [premiere] = prochainesRencontres(rencontres, new Date(), 1);

  return (
    <AccueilContenu
      prochain={premiere === undefined ? null : rattacher(premiere, equipesParId)}
      derniers={dernieresRencontresJouees(rencontres, 3).map((rencontre) =>
        rattacher(rencontre, equipesParId),
      )}
      articles={articles}
      equipes={equipes}
    />
  );
}
