# Contribuer

Conventions de travail sur le dépôt. Le résumé pour Claude Code est dans [CLAUDE.md](CLAUDE.md) ; la méthode
de projet est dans [docs/process.md](docs/process.md).

## Branches

- `main` est **déployée en production**. On n'y pousse jamais directement.
- Une branche par tâche, nommée `type/description-courte` : `feat/page-accueil`, `fix/formulaire-vide`,
  `chore/config-eslint`, `docs/readme-install`.
- La branche est supprimée après merge.

## Commits

Format [Conventional Commits](https://www.conventionalcommits.org/fr/), sujet **en français, à l'impératif**,
sans point final, 72 caractères maximum :

```
feat: ajouter le formulaire de contact
fix: corriger le calcul du total quand le panier est vide
chore: configurer ESLint et le hook pre-commit
docs: documenter la procédure de déploiement
test: couvrir les cas limites du parseur de dates
```

Types utilisés : `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `style`.

Le corps du message explique **pourquoi**, pas quoi : le diff dit déjà quoi.

## Pull requests

Une PR par tâche. Elle n'est mergeable que si :

- [ ] lint et tests passent en CI, seuil de couverture atteint ;
- [ ] la review de la tâche a été faite et ses retours traités ;
- [ ] le rendu a été vérifié sur l'**URL de preview Vercel**, pas seulement en local ;
- [ ] la documentation touchée est à jour (`README.md`, `docs/`, `.env.example`).

Merge en **squash** : un commit propre par tâche sur `main`.

## Définition de « terminé »

Une tâche est terminée quand elle est développée, **testée**, relue, recettée sur la preview et documentée.
Pas avant. Voir [docs/qualite.md](docs/qualite.md).

## Environnement local

1. Cloner le dépôt.
2. Copier `.env.example` en `.env` et renseigner les valeurs (jamais commiter `.env`).
3. Installer les dépendances et lancer le serveur de dev — commandes dans le [README](README.md), remplies
   dès que la stack est choisie.
