# Déploiement — Vercel

L'hébergement de production est **Vercel**, décision prise en amont de la Conception.

## Ce que ça impose à la stack

- **Pas de PHP, pas de serveur applicatif long.** Vercel sert du statique et des fonctions serverless
  Node/Edge. Le choix se fait dans ce périmètre : site statique (Astro, Vite, HTML/CSS/JS) ou framework Node
  (Next.js). Un besoin de backend PHP imposerait un autre hébergeur : à trancher explicitement, jamais par
  glissement.
- **Pas d'état sur le disque.** Le système de fichiers est en lecture seule hors `/tmp`, et rien n'y survit
  entre deux invocations. Toute donnée persistante passe par un service externe (base managée, stockage
  objet), choisi en Conception.
- **Fonctions stateless.** Pas de variable globale servant de cache entre requêtes ; tenir compte des
  timeouts d'exécution et des démarrages à froid.
- **Secrets en variables d'environnement** dans le dashboard Vercel (Settings → Environment Variables),
  jamais dans le dépôt. `.env` est ignoré par Git ; `.env.example` documente les clés attendues, sans valeurs.

## Mise en place

Le dépôt GitHub est en place : <https://github.com/NathanBRD-bit/projetFFBBClaude>.

Reste à faire, une fois la stack choisie (Vercel détecte alors le framework et propose le bon build) :
importer le dépôt sur vercel.com → Add New Project, vérifier la commande de build et le dossier de sortie,
déclarer les variables d'environnement.

## Flux

- Chaque branche et chaque PR produit une **URL de preview** : c'est le support de recettage. On recette là
  avant de merger, pas uniquement sur `localhost`.
- `main` déploie en production. Rien n'arrive sur `main` sans lint, tests et seuil de couverture au vert.
- **Régression en production : rollback d'abord** vers le déploiement précédent depuis le dashboard Vercel,
  correction avec test de non-régression ensuite. Dans cet ordre.
- Après chaque mise en production : page d'accueil, un parcours complet, console navigateur sans erreur,
  redirections et en-têtes si le projet en définit.

## À compléter après la Conception

Commande de build · dossier de sortie · version de Node · variables d'environnement requises · nom de domaine.
