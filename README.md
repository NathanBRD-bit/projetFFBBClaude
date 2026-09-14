# projetFFBBClaude

Site web d'équipe, déployé en production sur [Vercel](https://vercel.com).

> **Statut : squelette technique en place.** La stack est tranchée et outillée ; le contenu du site reste
> à construire.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS v4 · Drizzle ORM (Postgres Neon) ·
Vitest + Testing Library + MSW · Playwright + axe-core · ESLint (flat config, type-checked) + Prettier.

Node **22.12 ou plus**.

## Équipe

Eugène · Mathis · Raphaël · Nathan · Léane

## Installation

```bash
git clone https://github.com/NathanBRD-bit/projetFFBBClaude.git
cd projetFFBBClaude
cp .env.example .env        # puis renseigner les valeurs (voir les commentaires du fichier)
npm ci                      # installation reproductible depuis package-lock.json
npm run dev                 # http://localhost:3000
```

Pour les tests de bout en bout, installer une fois le navigateur utilisé par Playwright :

```bash
npx playwright install --with-deps chromium
```

## Commandes

| Action                           | Commande                                                      |
| -------------------------------- | ------------------------------------------------------------- |
| Serveur de dev                   | `npm run dev`                                                 |
| Tests unitaires et de composants | `npm test`                                                    |
| Tests en mode surveillance       | `npm run test:watch`                                          |
| Un seul test                     | `npx vitest run tests/unitaires/score.test.ts -t "affiche 0"` |
| Couverture                       | `npm run test:couverture`                                     |
| Tests de bout en bout            | `npm run test:e2e`                                            |
| Lint                             | `npm run lint` (correction : `npm run lint:corriger`)         |
| Formatage                        | `npm run format` (vérification : `npm run format:check`)      |
| Vérification des types           | `npm run types`                                               |
| Build de production              | `npm run build`                                               |

## Organisation du code

| Dossier               | Rôle                                                                             |
| --------------------- | -------------------------------------------------------------------------------- |
| `src/app/`            | Routes et rendu (App Router).                                                    |
| `src/domaine/`        | Logique métier **pure** : ni I/O, ni React, ni Next, ni ORM. Le linter l'impose. |
| `src/infrastructure/` | Accès au monde extérieur : `bdd/`, `ffbb/`, `stockage/`.                         |
| `src/actions/`        | Server Actions : validation des entrées et orchestration.                        |
| `src/auth/`           | Authentification et autorisations.                                               |
| `src/composants/`     | Composants React : `ui/` (génériques), `public/`, `admin/`.                      |
| `tests/`              | `unitaires/`, `integration/`, `composants/`, `e2e/`, `fixtures/`, `garde-fous/`. |
| `docs/adr/`           | Décisions d'architecture, avec les alternatives écartées.                        |

Les garde-fous du linter et la façon de vérifier qu'ils échouent vraiment sont décrits dans
[tests/garde-fous/README.md](tests/garde-fous/README.md).

## Documentation

| Document                                                 | Contenu                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)                                   | Instructions permanentes pour Claude Code                   |
| [CONTRIBUTING.md](CONTRIBUTING.md)                       | Branches, commits, pull requests, définition de « terminé » |
| [docs/process.md](docs/process.md)                       | Méthode de travail en cinq phases                           |
| [docs/qualite.md](docs/qualite.md)                       | Standards de code, performance, documentation               |
| [docs/deploiement.md](docs/deploiement.md)               | Contraintes Vercel, flux de déploiement, rollback           |
| [tests/garde-fous/README.md](tests/garde-fous/README.md) | Preuve que les règles du linter font échouer la CI          |

## Qualité

Couverture ≥ 80 % sur la logique métier (100 % sur le critique), Lighthouse ≥ 90 en performance et
accessibilité, lint et tests bloquants avant tout déploiement.

## Déploiement

Chaque pull request produit une URL de preview ; `main` déploie en production.
