# Méthode de travail

Process imposé sur le projet, du cadrage à la mise en ligne. Le résumé opérationnel tient dans
[CLAUDE.md](../CLAUDE.md) ; ce document donne le déroulé et le choix des agents.

## Principe

Chaque phase est confiée à **l'agent le plus compétent pour ce type de travail**. Sur ce projet, l'usage de
sous-agents et de skills dédiées est le comportement par défaut, contrairement au fonctionnement habituel de
Claude Code où on ne délègue que sur demande explicite.

## Les cinq phases

### 1. Conception

Trancher trois points avant toute ligne de code : **le use case**, **la stack**, **ce qu'on veut faire
exactement** (périmètre, public visé, ce qui est hors périmètre).

- Agent `Plan` pour les arbitrages techniques et les compromis d'architecture.
- Skill `design` pour maquetter les écrans et valider la direction visuelle avant de coder.
- Agent `Explore` si un existant doit être lu avant de décider.

Sortie attendue : une décision écrite (stack retenue, alternatives écartées et pourquoi), et les sections
Commandes et Déploiement de `CLAUDE.md` prêtes à être remplies.

### 2. Plan

Découper en tâches explicites, ordonnées, livrables une par une. Une tâche = un périmètre testable et
recettable seul.

- Agent `Plan`.

Sortie attendue : une liste de tâches avec, pour chacune, son critère de « terminé ».

### 3. Exécution

Une tâche = un agent lancé pour elle, avec le contexte dont il a besoin.

- Skill `design` pour l'UI, `dataviz` pour toute visualisation de données.
- Agent `claude-code-guide` pour ce qui touche Claude Code, le SDK ou l'API Anthropic.
- Agent `general-purpose` par défaut quand aucun agent spécialisé ne colle.

### 4. Review

**Après chaque tâche**, pas une seule passe globale à la fin. Le reviewer corrige ce qu'il trouve.

- `/code-review` (ajouter `--fix` pour appliquer les corrections).
- `/simplify` pour la qualité et la lisibilité.
- `/security-review` avant toute mise en ligne.

### 5. Mise en production

- Recette sur l'URL de preview Vercel via la skill `recette`, pas seulement en local.
- Merge sur `main` une fois la CI verte → déploiement automatique.
- Détail des contraintes et du rollback : [deploiement.md](deploiement.md).

## Choisir un autre agent

La liste ci-dessus est un défaut, pas une contrainte : si une tâche colle mieux à un autre agent, prendre
le mieux adapté et le dire dans le compte rendu.
