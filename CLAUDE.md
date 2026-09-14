# CLAUDE.md

Guide pour Claude Code (claude.ai/code) sur ce dépôt.

## État du dépôt

Le projet est **vide de code** à ce jour : la racine ne contient que les deux photos de notes manuscrites
(`20260914_145941.jpg`, `20260914_145948.jpg`) et la config PhpStorm (`.idea/`, module `WEB_MODULE` + PHP).
Il n'y a ni gestionnaire de paquets, ni build, ni tests, ni framework, ni dépôt Git initialisé.
Ce fichier décrit donc **la méthode de travail**, pas une architecture existante.

Quand la stack sera choisie (phase 1 « Conception »), compléter ce fichier avec les commandes réelles
(install, lancement du serveur, lint, tests — y compris comment lancer un seul test) et la procédure de
déploiement.

Le dossier est dans le webroot Laragon (`C:\laragon\www\projetClaude`), mais **l'hébergement de
production est Vercel** : le vhost Apache/PHP de Laragon n'est donc pas le chemin de déploiement. Le dev
local se fera avec le serveur de dev de la stack retenue (`npm run dev` ou équivalent), pas via
`http://projetclaude.test`.

## Sujet du projet

**Le sujet n'est pas encore arrêté.** Ne rien considérer comme acquis côté contenu tant que la phase
« Conception » n'a pas tranché : use case, périmètre, public visé.

Équipe : Eugène, Mathis, Raphaël, Nathan, Léane.

**Objectif final : un site en production**, pas une maquette ni un prototype local. Toute décision de
conception (stack, hébergement, contenu, dépendances) se juge à cette aune : est-ce que ça tient en ligne,
déployable et maintenable par l'équipe ?

## Méthode de travail imposée

C'est le process que Claude doit suivre pour mener le projet. Le respecter tel quel. **Pour chaque phase,
déléguer à l'agent le plus compétent pour ce type de travail** — sur ce projet, l'usage de sous-agents
(outil `Agent`) et de skills dédiées est attendu par défaut, contrairement au fonctionnement habituel où on
ne délègue que sur demande.

| Phase | But | Agent / skill à privilégier |
|---|---|---|
| 1. **Conception** | Trancher le use case, la stack et ce qu'on veut faire exactement. Ne pas coder avant. | Agent `Plan` (architecte) pour les arbitrages techniques ; skill `design` pour maquetter les écrans ; agent `Explore` si besoin d'aller lire l'existant. |
| 2. **Plan** | Découper en tâches explicites, ordonnées, livrables une par une. | Agent `Plan`. |
| 3. **Exécution** | Une tâche = un agent spécialisé lancé pour elle. | Agent spécialisé quand il existe (`design` pour l'UI, `dataviz` pour des graphiques, `claude-code-guide` pour tout ce qui touche Claude Code / l'API) ; sinon `general-purpose`. |
| 4. **Review** | **Après chaque tâche**, pas une seule review globale à la fin. Le reviewer corrige ce qu'il trouve. | Skill `/code-review` (ajouter `--fix` pour appliquer), `/simplify` pour la qualité, `/security-review` avant toute mise en ligne. |
| 5. **Mise en production** | Le livrable doit tourner en ligne sur Vercel. | Vérifier le rendu réel avec la skill `run` en local, puis sur l'URL de preview Vercel ; documenter build + déploiement dans ce fichier. |

Le choix de l'agent se fait au cas par cas : si une phase colle mieux à un autre agent que celui listé
ci-dessus, prendre le mieux adapté — la table est un défaut, pas une contrainte.

## Qualité, tests et recettage

Claude gère ces trois volets de bout en bout, sans attendre qu'on les redemande. Les règles ci-dessous sont
des critères de « tâche terminée » : une tâche qui ne les respecte pas n'est pas livrée.

### Tests

- Les tests s'écrivent **avec** la tâche, pas dans une tâche « tests » à la fin.
- Cible de couverture : **≥ 80 % de lignes sur la logique métier**, **100 % sur le critique** (validation
  d'entrées, calculs, authentification, tout ce qui touche aux données utilisateur).
- La couverture est un plancher, pas un objectif. Chaque fonction testée l'est sur ses **cas limites et ses
  chemins d'erreur**, pas seulement le cas nominal : entrée vide, valeur nulle, type inattendu, dépendance
  externe en échec.
- Un bug corrigé = un test qui reproduit le bug, ajouté avant le correctif.
- Aucun test désactivé, marqué `skip` ou commenté sans une ligne expliquant pourquoi et quand il revient.

### Pas de bug silencieux

C'est la règle la plus importante : une erreur doit être **bruyante, immédiate et localisable**. Interdits
sauf justification écrite dans le code :

- `catch` / `except` vide ou qui se contente de logger et continue comme si de rien n'était ;
- l'opérateur `@` en PHP, `2>$null`, et toute suppression d'erreur globale ;
- une valeur par défaut qui masque une donnée absente (un `?? 0`, `?? ''` qui fait passer un bug pour un
  cas normal) — préférer l'échec explicite ;
- les comparaisons lâches (`==` en PHP/JS) là où l'identité stricte est attendue ;
- un `try` qui enveloppe trente lignes : réduire au strict appel qui peut échouer.

En positif : mode strict activé (`declare(strict_types=1)` en PHP, `strict: true` en TS), erreurs remontées
et loguées avec leur contexte, warnings traités comme des erreurs en CI, validation des entrées à la
frontière (formulaire, requête, API) plutôt que disséminée.

### Code optimisé

- Pas de requête en boucle (N+1), pas de travail refait à chaque requête là où un cache simple suffit.
- Toute dépendance ajoutée se justifie : ce qu'elle apporte, son poids, son alternative en natif.
- Budget perf sur le site livré : **Lighthouse ≥ 90** en perf et accessibilité, assets minifiés, images
  dimensionnées et en format moderne.
- Lisible avant malin : l'optimisation prématurée qui rend le code opaque est un défaut, pas une qualité.

### Recettage

- Après chaque tâche : lint + tests verts, puis vérification du **rendu réel** (skill `run`), pas seulement
  la lecture du diff.
- Avant mise en production, recette complète : parcours utilisateur de bout en bout, responsive mobile,
  accessibilité clavier et contrastes, liens morts, pages 404/500, console navigateur sans erreur.
- La CI bloque le déploiement si lint, tests ou seuil de couverture échouent.
- **Rapport honnête** : si un test échoue, une étape est sautée ou un point reste non vérifié, le dire
  explicitement dans le compte rendu — jamais annoncer « c'est bon » sur une vérification non faite.

Quand la stack sera choisie, remplacer ces principes par les **commandes réelles** (lancer la suite, lancer
un seul test, produire le rapport de couverture, lancer le lint) en haut de ce fichier.

## Déploiement — Vercel

L'hébergement de production est **Vercel**. Cette décision est prise : elle contraint la phase Conception,
elle ne s'y rediscute pas.

### Ce que ça impose à la stack

- **Pas de PHP, pas de serveur applicatif long** : Vercel sert du statique et des fonctions serverless
  Node/Edge. La stack se choisit dans ce périmètre — site statique (Astro, Vite, HTML/CSS/JS) ou framework
  Node (Next.js). Un backend PHP nécessiterait un autre hébergeur : à trancher explicitement si le besoin
  apparaît, pas par glissement.
- **Pas d'état sur le disque** : le système de fichiers est en lecture seule hors `/tmp`, et rien n'y
  survit entre deux invocations. Toute donnée persistante passe par un service externe (base managée,
  stockage objet), choisi en Conception.
- **Fonctions serverless stateless** : pas de variable globale qui sert de cache entre requêtes, attention
  aux timeouts d'exécution et aux démarrages à froid.
- **Secrets en variables d'environnement** dans le dashboard Vercel, jamais dans le dépôt. Un `.env` local
  est ignoré par Git ; `.env.example` documente les clés attendues, sans valeurs.

### Prérequis

Le dépôt n'est pas encore sous Git. Avant tout déploiement : `git init`, `.gitignore` (`node_modules`,
`.env`, `.vercel`, artefacts de build), puis dépôt distant relié au projet Vercel pour bénéficier des
déploiements automatiques.

### Flux de déploiement

- Chaque branche / PR produit une **URL de preview** : c'est le support de recettage, on recette là avant
  de merger, pas sur `localhost` uniquement.
- `main` déploie en production. Rien ne part sur `main` sans lint + tests + seuil de couverture au vert.
- En cas de régression constatée en prod, **rollback immédiat** vers le déploiement précédent depuis le
  dashboard Vercel, puis correction avec un test de non-régression — dans cet ordre.
- Vérifier après chaque mise en prod : page d'accueil, un parcours complet, console navigateur sans erreur,
  et les en-têtes/redirections si le projet en définit.

Quand la stack sera choisie, compléter ici : commande de build, dossier de sortie, version de Node,
variables d'environnement requises, nom de domaine.

## Langue

Équipe et livrable en **français** : rédiger le contenu du site, les commits et les échanges en français.
