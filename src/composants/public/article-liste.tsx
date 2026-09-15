import Link from "next/link";
import { EtatVide } from "@/composants/ui/primitives";
import type { Article } from "@/domaine/types";
import { CarteArticle } from "./article-carte";

const STYLE_FILTRE_COMMUN =
  "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors";
const STYLE_FILTRE_ACTIF = "border-violet bg-violet text-white";
const STYLE_FILTRE_INACTIF = "border-bordure bg-fond text-violet hover:bg-violet-voile";

/**
 * Filtre par catégorie en liens serveur : `?categorie=...`. Aucun JavaScript n'est
 * envoyé au navigateur, chaque filtre a sa propre URL partageable, et la navigation
 * clavier fonctionne sans que nous ayons rien à écrire pour elle.
 */
export function FiltreCategories({
  categories,
  categorieActive,
}: {
  categories: readonly string[];
  categorieActive: string | null;
}) {
  return (
    <nav aria-label="Filtrer par catégorie" className="mb-6">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            href="/actualites"
            aria-current={categorieActive === null ? "page" : undefined}
            className={`${STYLE_FILTRE_COMMUN} ${categorieActive === null ? STYLE_FILTRE_ACTIF : STYLE_FILTRE_INACTIF}`}
          >
            Toutes
          </Link>
        </li>
        {categories.map((categorie) => {
          const actif = categorie === categorieActive;
          return (
            <li key={categorie}>
              <Link
                href={`/actualites?categorie=${encodeURIComponent(categorie)}`}
                aria-current={actif ? "page" : undefined}
                className={`${STYLE_FILTRE_COMMUN} ${actif ? STYLE_FILTRE_ACTIF : STYLE_FILTRE_INACTIF}`}
              >
                {categorie}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ListeArticles({ articles }: { articles: readonly Article[] }) {
  if (articles.length === 0) {
    return (
      <EtatVide titre="Aucune actualité pour le moment">
        Les nouvelles du club seront publiées ici : vie des équipes, événements et informations
        pratiques.
      </EtatVide>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <li key={article.slug}>
          <CarteArticle article={article} />
        </li>
      ))}
    </ul>
  );
}
