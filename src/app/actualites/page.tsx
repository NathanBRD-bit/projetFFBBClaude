import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FiltreCategories, ListeArticles } from "@/composants/public/article-liste";
import { Conteneur } from "@/composants/ui/primitives";
import { listerArticles, listerCategoriesArticles } from "@/infrastructure/donnees/depot";

export const metadata: Metadata = {
  title: "Actualités",
  description:
    "Toutes les nouvelles du SOCL Basket : vie du club, événements, présentations d'équipes et comptes rendus.",
};

/**
 * Validation du paramètre `?categorie=` à la frontière de la page.
 *
 * Une catégorie inconnue n'est pas un filtre vide : c'est une URL fausse, et elle
 * se solde par un 404 plutôt que par une liste silencieusement complète — sinon le
 * visiteur croit lire une catégorie qui n'existe pas.
 */
function lireCategorie(
  valeur: string | string[] | undefined,
  categoriesConnues: readonly string[],
): string | null {
  if (valeur === undefined) {
    return null;
  }
  if (Array.isArray(valeur) || !categoriesConnues.includes(valeur)) {
    notFound();
  }
  return valeur;
}

export default async function PageActualites({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [parametres, articles, categories] = await Promise.all([
    searchParams,
    listerArticles(),
    listerCategoriesArticles(),
  ]);

  const categorieActive = lireCategorie(parametres.categorie, categories);
  const affiches =
    categorieActive === null
      ? articles
      : articles.filter((article) => article.categorie === categorieActive);

  return (
    <Conteneur className="py-10 sm:py-14">
      <h1 className="text-3xl font-extrabold tracking-tight text-violet sm:text-4xl">Actualités</h1>
      <p className="mt-3 max-w-2xl text-base text-encre-douce">
        Les nouvelles du club, des équipes et des salles. Les articles à la une sont affichés en
        premier.
      </p>

      <div className="mt-8">
        <FiltreCategories categories={categories} categorieActive={categorieActive} />

        <h2 className="sr-only">
          {categorieActive === null
            ? "Tous les articles"
            : `Articles de la catégorie ${categorieActive}`}
        </h2>
        <ListeArticles articles={affiches} />
      </div>
    </Conteneur>
  );
}
