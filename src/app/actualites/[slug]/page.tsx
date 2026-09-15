import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContenuArticle } from "@/composants/public/article-contenu";
import { Badge, Conteneur } from "@/composants/ui/primitives";
import { formaterDateLongue } from "@/domaine/rencontres";
import { listerArticles, trouverArticle } from "@/infrastructure/donnees/depot";

interface ProprietesPage {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const articles = await listerArticles();
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: ProprietesPage): Promise<Metadata> {
  const { slug } = await params;
  const article = await trouverArticle(slug);
  if (article === null) {
    // Pas de titre inventé pour une page qui n'existe pas : le 404 s'en charge.
    return { title: "Article introuvable" };
  }
  return { title: article.titre, description: article.chapeau };
}

export default async function PageArticle({ params }: ProprietesPage) {
  const { slug } = await params;
  const article = await trouverArticle(slug);
  if (article === null) {
    notFound();
  }

  return (
    <Conteneur className="py-8 sm:py-12">
      <nav aria-label="Fil d'Ariane">
        <ol className="flex flex-wrap items-center gap-x-2 text-sm text-encre-douce">
          <li>
            <Link href="/" className="underline underline-offset-4 hover:text-violet">
              Accueil
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/actualites" className="underline underline-offset-4 hover:text-violet">
              Actualités
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="max-w-full truncate font-semibold text-encre">
            {article.titre}
          </li>
        </ol>
      </nav>

      <article className="mt-6">
        <header className="border-b-2 border-jaune pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{article.categorie}</Badge>
            {article.epingle ? <Badge ton="attention">À la une</Badge> : null}
          </div>

          <h1 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight text-violet sm:text-4xl">
            {article.titre}
          </h1>

          <p className="mt-4 max-w-2xl text-lg text-encre-douce">{article.chapeau}</p>

          <p className="mt-4 text-sm text-encre-douce">
            Publié le{" "}
            <time dateTime={article.publieLe}>{formaterDateLongue(article.publieLe)}</time>
            {" par "}
            <span className="font-semibold text-encre">{article.auteur}</span>
          </p>
        </header>

        <div className="mt-8 max-w-3xl">
          <ContenuArticle markdown={article.contenu} />
        </div>
      </article>

      <p className="mt-12 border-t border-bordure pt-6">
        <Link
          href="/actualites"
          className="text-sm font-semibold text-violet underline underline-offset-4 hover:text-encre"
        >
          ← Retour aux actualités
        </Link>
      </p>
    </Conteneur>
  );
}
