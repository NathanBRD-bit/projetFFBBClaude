/**
 * Assainissement des messages d'erreur avant qu'ils ne sortent du serveur.
 *
 * Le message d'erreur vient du moteur de synchronisation : il peut recopier ce
 * qu'a dit le driver Postgres ou le client HTTP, donc une chaîne de connexion
 * complète, un nom d'hôte interne, un nom d'utilisateur de base. Filtrer au cas
 * par cas reviendrait à parier sur la forme des messages d'erreur à venir.
 *
 * **Ce module est partagé entre la réponse HTTP et l'alerte.** C'est le constat
 * central de la review de T07 : la route masquait soigneusement, et l'alerte
 * envoyait la version brute à Slack ou Discord — où elle serait restée dans
 * l'historique du salon. Un secret n'est pas moins divulgué parce qu'il part
 * vers un outil interne.
 *
 * Le message intégral, lui, reste dans `journal_synchronisation`, consultable
 * par quelqu'un qui a déjà accès à la base.
 */

/** Longueur maximale d'un message sortant. */
export const LONGUEUR_MESSAGE_MAX = 500;

/** `postgresql://…`, `https://…` : tout ce qui porte un schéma d'URI. */
const URI = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;

/**
 * Noms d'hôtes techniques, que le masquage d'URI laissait passer. Les pannes
 * Postgres les plus courantes en exposent sans schéma :
 * `getaddrinfo ENOTFOUND ep-cool-123.eu-central-1.aws.neon.tech`.
 * On ne vise que les domaines d'infrastructure connus, pour ne pas caviarder
 * un message utile qui citerait `ffbb.com`.
 */
const HOTE_TECHNIQUE = /\b[\w-]+(?:\.[\w-]+)*\.(?:neon\.tech|vercel\.app|amazonaws\.com)\b/gi;

/**
 * `password authentication failed for user "socl"` : le nom d'utilisateur de la
 * base n'a rien à faire dans un journal d'exécution public.
 */
const UTILISATEUR_CITE = /\buser\s+"[^"]*"/gi;

/**
 * Masque ce qui ne doit pas sortir, puis tronque.
 *
 * L'ordre compte : masquer d'abord, tronquer ensuite. Tronquer en premier
 * pourrait couper une URI en deux et en laisser passer la moitié — dont
 * l'identifiant, qui figure avant l'arobase.
 */
export function assainirMessage(message: string): string;
export function assainirMessage(message: string | null): string | null;
export function assainirMessage(message: string | null): string | null {
  if (message === null) {
    return null;
  }
  return message
    .replace(URI, "[uri masquée]")
    .replace(HOTE_TECHNIQUE, "[hôte masqué]")
    .replace(UTILISATEUR_CITE, 'user "[masqué]"')
    .slice(0, LONGUEUR_MESSAGE_MAX);
}
