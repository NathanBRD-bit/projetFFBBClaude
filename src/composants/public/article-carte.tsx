import Link from "next/link";
import { Badge, Carte } from "@/composants/ui/primitives";
import { formaterDateLongue } from "@/domaine/rencontres";
import type { Article } from "@/domaine/types";

/**
 * Carte d'article, partagée par l'accueil et la liste des actualités : un article
 * ne doit pas se présenter différemment d'une page à l'autre.
 *
 * Le titre porte le lien (et non la carte entière) pour que le libellé annoncé par
 * un lecteur d'écran soit le titre de l'article, pas le chapeau et la date en prime.
 */
export function CarteArticle({ article }: { article: Article }) {
  return (
    <Carte className="flex h-full flex-col transition-colors focus-within:border-violet hover:border-violet">
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{article.categorie}</Badge>
          {article.epingle ? <Badge ton="attention">À la une</Badge> : null}
        </div>

        <h3 className="text-lg leading-snug font-bold text-violet">
          <Link href={`/actualites/${article.slug}`} className="underline-offset-4 hover:underline">
            {article.titre}
          </Link>
        </h3>

        <p className="flex-1 text-sm text-encre-douce">{article.chapeau}</p>

        <p className="text-xs text-encre-douce">
          <time dateTime={article.publieLe}>{formaterDateLongue(article.publieLe)}</time>
          {" · "}
          {article.auteur}
        </p>
      </div>
    </Carte>
  );
}
