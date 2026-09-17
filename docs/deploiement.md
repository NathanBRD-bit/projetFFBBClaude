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

## Synchronisation FFBB planifiée

La synchronisation est déclenchée par une route protégée,
`GET|POST /api/cron/synchronisation-ffbb`, qui répond **200** sur `succes` et `partiel`, **500** sur
`echec`, et **401** sur tout appel non authentifié. Elle exige
`Authorization: Bearer <CRON_SECRET>`, comparé en temps constant.

### Trois déclencheurs, et pourquoi

| Déclencheur                             | Fréquence                                                             | Rôle                                |
| --------------------------------------- | --------------------------------------------------------------------- | ----------------------------------- |
| `vercel.json`                           | 1×/jour, 6 h (±59 min)                                                | Filet de sécurité                   |
| `.github/workflows/synchronisation.yml` | Toutes les 2 h en semaine · toutes les 15 min les week-ends 13 h–21 h | **Déclencheur principal** et alerte |
| Bouton au back-office (T14)             | À la demande                                                          | Reprise manuelle après incident     |

Le plan **Hobby de Vercel limite les crons à une exécution par jour**, avec une précision à l'heure
près : une expression plus fréquente dans `vercel.json` **fait échouer le déploiement**. D'où le
report du vrai rythme sur GitHub Actions, gratuit et sans cette limite. Passer au plan Pro
(~20 $/mois) lèverait la contrainte — ce n'est pas justifié pour un site associatif informatif.

Le workflow GitHub échoue si la réponse n'est pas 200 : c'est cet échec qui envoie le **mail
d'alerte** à l'équipe, indépendamment de `WEBHOOK_ALERTE`. Ne jamais y ajouter `|| true` ni
`continue-on-error` : ce serait supprimer la seule alerte qui ne dépende d'aucune configuration.

Deux réserves sur les crons GitHub, à connaître : ils peuvent être **retardés** de plusieurs minutes
aux heures chargées, et GitHub **désactive** les workflows planifiés d'un dépôt resté 60 jours sans
activité (un mail prévient ; il suffit de les réactiver dans l'onglet Actions).

### Variables d'environnement à déclarer sur Vercel

Settings → Environment Variables. Les clés complètes sont documentées dans `.env.example`.

| Clé                     | Portée               | Obligatoire | Rôle                                                       |
| ----------------------- | -------------------- | ----------- | ---------------------------------------------------------- |
| `DATABASE_URL`          | Production + Preview | Oui         | Base Neon (posée par l'intégration Neon).                  |
| `CRON_SECRET`           | Production + Preview | Oui         | Secret du `Bearer`. Absente → la route refuse **tout**.    |
| `URL_SITE`              | Production + Preview | Oui         | URL absolue du site.                                       |
| `BLOB_READ_WRITE_TOKEN` | Production + Preview | Oui         | Stockage des fichiers.                                     |
| `WEBHOOK_ALERTE`        | Production           | Non         | Webhook Slack/Discord/Mattermost pour les alertes d'échec. |

Sans `CRON_SECRET`, la route répond 401 à tout le monde — cron compris — et écrit une **erreur
explicite** dans les logs Vercel : c'est un problème de déploiement, jamais un problème d'appelant.

### Secrets et variables à déclarer sur GitHub

Settings → Secrets and variables → Actions. Attention à l'onglet : un secret déclaré comme variable
(ou l'inverse) n'est **pas** lu, et le job échoue en le disant.

| Nom           | Onglet    | Utilisé par           | Valeur                                                              |
| ------------- | --------- | --------------------- | ------------------------------------------------------------------- |
| `CRON_SECRET` | Secrets   | `synchronisation.yml` | **Exactement** la même valeur que la variable Vercel de production. |
| `URL_SITE`    | Variables | `synchronisation.yml` | URL de production, protocole compris, sans barre oblique finale.    |

`contrat-ffbb.yml` n'a besoin d'aucun secret : l'API FFBB est publique.

Si `CRON_SECRET` est renouvelée, elle doit l'être **des deux côtés** dans la même journée, sinon le
workflow rougit toutes les deux heures.

### Vérification du contrat FFBB

`.github/workflows/contrat-ffbb.yml` tourne tous les lundis, appelle l'API FFBB réelle
(`npm run contrat:ffbb`) et vérifie que les schémas Zod tiennent encore. Il **ne bloque aucune PR** :
c'est un détecteur de dérive, pas une barrière. Avec `scripts/capturer-fixtures-ffbb.ts`, c'est le
seul endroit du dépôt qui sort sur le réseau réel — la suite de tests, elle, tourne intégralement
derrière MSW.

## À compléter après la Conception

Commande de build · dossier de sortie · version de Node · variables d'environnement requises · nom de domaine.
