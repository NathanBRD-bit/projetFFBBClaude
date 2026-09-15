import { rendreMarkdown } from "@/domaine/markdown";

/**
 * Mise en forme du corps d'un article. Aucun plugin typographique n'est installé
 * (une dépendance de plus pour du CSS qu'on écrit une fois) : les styles des
 * éléments produits par le Markdown sont déclarés ici, au seul endroit qui les rend.
 *
 * Le jaune n'apparaît que comme barre de citation, jamais comme couleur de texte :
 * 1,28:1 sur fond clair, cf. la charte dans globals.css.
 */
const CLASSES_CONTENU = [
  "text-base leading-relaxed text-encre",
  "[&>*+*]:mt-4",
  "[&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-violet",
  "sm:[&_h2]:text-2xl",
  "[&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-violet",
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:mt-1 [&_li]:marker:font-bold [&_li]:marker:text-violet",
  "[&_a]:font-semibold [&_a]:text-violet [&_a]:underline [&_a]:underline-offset-4",
  "[&_a:hover]:text-encre",
  "[&_strong]:font-bold [&_strong]:text-encre",
  "[&_blockquote]:border-l-4 [&_blockquote]:border-jaune [&_blockquote]:bg-fond-doux",
  "[&_blockquote]:py-3 [&_blockquote]:pl-4 [&_blockquote]:text-encre-douce [&_blockquote]:italic",
  "[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
  "[&_th]:border [&_th]:border-bordure [&_th]:bg-violet-voile [&_th]:px-3 [&_th]:py-2",
  "[&_th]:text-left [&_th]:font-bold [&_th]:text-violet",
  "[&_td]:border [&_td]:border-bordure [&_td]:px-3 [&_td]:py-2",
  "[&_code]:rounded [&_code]:bg-violet-voile [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-violet",
  "[&_hr]:my-8 [&_hr]:border-bordure",
  // Un tableau GFM large défile dans son bloc plutôt que de faire déborder la page.
  "overflow-x-auto",
].join(" ");

export function ContenuArticle({ markdown }: { markdown: string }) {
  const html = rendreMarkdown(markdown);

  return (
    // `dangerouslySetInnerHTML` est employé ici, et seulement ici, parce que la
    // chaîne vient d'être produite par `rendreMarkdown` : HTML brut abandonné à la
    // conversion, puis `rehype-sanitize` avec son schéma par défaut. Ne jamais
    // passer à cet attribut une chaîne qui n'est pas sortie de cette fonction.
    <div className={CLASSES_CONTENU} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
