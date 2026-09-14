# projetFFBBClaude

Site web d'équipe, déployé en production sur [Vercel](https://vercel.com).

> **Statut : cadrage.** Le sujet, le périmètre et la stack sont en cours d'arbitrage (phase Conception).
> Les sections Installation et Commandes seront remplies dès que la stack sera tranchée.

## Équipe

Eugène · Mathis · Raphaël · Nathan · Léane

## Installation

_À compléter une fois la stack choisie._

```bash
git clone https://github.com/NathanBRD-bit/projetFFBBClaude.git
cd projetFFBBClaude
cp .env.example .env   # puis renseigner les valeurs
# installation des dépendances : à définir
# serveur de dev : à définir
```

## Commandes

| Action | Commande |
|---|---|
| Serveur de dev | _à définir_ |
| Tests | _à définir_ |
| Couverture | _à définir_ |
| Lint | _à définir_ |
| Build de production | _à définir_ |

## Documentation

| Document | Contenu |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Instructions permanentes pour Claude Code |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branches, commits, pull requests, définition de « terminé » |
| [docs/process.md](docs/process.md) | Méthode de travail en cinq phases |
| [docs/qualite.md](docs/qualite.md) | Standards de code, performance, documentation |
| [docs/deploiement.md](docs/deploiement.md) | Contraintes Vercel, flux de déploiement, rollback |

## Qualité

Couverture ≥ 80 % sur la logique métier (100 % sur le critique), Lighthouse ≥ 90 en performance et
accessibilité, lint et tests bloquants avant tout déploiement.

## Déploiement

Chaque pull request produit une URL de preview ; `main` déploie en production.
