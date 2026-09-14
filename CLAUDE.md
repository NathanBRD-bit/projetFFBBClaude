# CLAUDE.md

Instructions permanentes pour Claude Code sur ce dépôt. Le détail vit dans `docs/` : ne rapatrier ici que
ce qui est utile à **chaque** session.

## Commandes

Stack non choisie (phase Conception en cours). À remplir dès qu'elle l'est — c'est la section la plus utile
du fichier.

| Action | Commande |
|---|---|
| Installer les dépendances | _à définir_ |
| Lancer le serveur de dev | _à définir_ |
| Lancer toute la suite de tests | _à définir_ |
| Lancer **un seul** test | _à définir_ |
| Rapport de couverture | _à définir_ |
| Lint / format | _à définir_ |
| Build de production | _à définir_ |

## Projet

- Équipe : Eugène, Mathis, Raphaël, Nathan, Léane.
- **Sujet non arrêté** : ne rien considérer comme acquis côté contenu tant que la Conception n'a pas tranché
  le use case, le périmètre et le public visé.
- **Objectif : un site en production sur Vercel**, pas une maquette. Toute décision (stack, dépendance,
  contenu) se juge à cette aune : est-ce que ça tient en ligne et reste maintenable par l'équipe ?
- Conséquence sur la stack : statique ou Node. Pas de PHP, pas de serveur applicatif long, pas d'état sur le
  disque. Détail dans `docs/deploiement.md`.

## Méthode de travail

Conception → Plan → Exécution → Review → Mise en production. Deux règles à retenir en permanence :

- **Ne pas coder** tant que use case, stack et périmètre ne sont pas tranchés.
- **Une review après chaque tâche**, pas une seule review globale à la fin.

Sur ce projet, déléguer à un sous-agent spécialisé par phase est le comportement attendu par défaut.
Choix des agents et déroulé complet : `docs/process.md`.

## Règles non négociables

- **Pas de bug silencieux** : une erreur doit être bruyante, immédiate et localisable. Jamais d'erreur
  avalée, jamais de valeur par défaut qui fait passer une donnée absente pour un cas normal. Ces règles sont
  appliquées par le linter et le mode strict, pas seulement écrites ici — voir `docs/qualite.md`.
- **Tests écrits avec la tâche**, jamais repoussés à une tâche « tests » finale. Couverture ≥ 80 % sur la
  logique métier, 100 % sur le critique (validation d'entrées, auth, données utilisateur).
- **Un bug corrigé = un test qui le reproduit**, ajouté avant le correctif.
- **Une tâche n'est finie que si** lint et tests passent *et* que le rendu réel a été vu (skill `run` en
  local, puis URL de preview Vercel) — pas seulement le diff relu.
- **Rapport honnête** : un test qui échoue, une étape sautée, une vérification non faite se disent
  explicitement. Jamais de « c'est bon » sur du non-vérifié.

## Conventions

- Commits conventionnels, sujet en français à l'impératif : `feat: ajouter le formulaire de contact`.
- Une branche par tâche (`feat/`, `fix/`, `chore/`, `docs/`). `main` est déployée en production : on n'y
  pousse jamais directement, tout passe par une PR avec CI verte.
- Secrets en variables d'environnement (dashboard Vercel). `.env` jamais commité, `.env.example` tenu à jour.
- Détail : `CONTRIBUTING.md`.

## Langue

Français partout : contenu du site, documentation, messages de commit, échanges.
