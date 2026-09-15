/**
 * Rendu du Markdown des articles (et des compte-rendus de match) en HTML.
 *
 * Le contenu vient de l'administration du club : demain d'un formulaire, donc
 * d'une saisie humaine qu'on ne contrôle pas au caractère près. Le HTML produit
 * ici est injecté tel quel dans la page : il doit donc être **assaini**, sans
 * exception et sans option de contournement.
 *
 * Deux barrières successives, volontairement redondantes :
 *
 * 1. `remark-rehype` est utilisé **sans** `allowDangerousHtml` : tout HTML brut
 *    écrit dans le Markdown (`<script>`, `<iframe>`, `<img onerror>`) est
 *    simplement abandonné à la conversion, il n'atteint jamais la sortie.
 * 2. `rehype-sanitize` repasse ensuite sur l'arbre avec le **schéma par défaut**
 *    (`defaultSchema`), qui n'autorise qu'une liste fermée d'éléments, d'attributs
 *    et de protocoles de lien (`http`, `https`, `mailto`…). C'est lui qui neutralise
 *    ce que le Markdown peut produire de dangereux sans passer par du HTML brut,
 *    au premier rang duquel les liens `javascript:`.
 *
 * Ce fichier appartient à `src/domaine/` : il transforme une chaîne en chaîne,
 * sans I/O, sans React et sans Next (règle ESLint `import/no-restricted-paths`).
 */

import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

/**
 * Chaîne figée une fois pour toutes : `unified` autorise la réutilisation d'un
 * processeur gelé, et le construire à chaque article serait du travail refait à
 * chaque rendu de page.
 */
const processeur = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize, defaultSchema)
  .use(rehypeStringify)
  .freeze();

/**
 * Convertit du Markdown (GFM) en HTML assaini.
 *
 * @param markdown source rédigée par le club.
 * @returns du HTML sûr à injecter, sans balise ni attribut exécutable.
 */
export function rendreMarkdown(markdown: string): string {
  return String(processeur.processSync(markdown));
}
