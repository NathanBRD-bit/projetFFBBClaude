---
name: recette
description: Recetter une tâche ou une mise en production — checklist de vérification fonctionnelle, responsive, accessibilité, erreurs et performance, à dérouler sur le rendu réel (local ou URL de preview Vercel). À utiliser avant de merger une PR, avant une mise en ligne, ou quand on demande de « recetter », « valider », « vérifier le rendu ».
---

# Recette

Dérouler cette checklist **sur le rendu réel** — local via la skill `run`, ou sur l'URL de preview Vercel.
Lire le diff ne remplace pas la recette.

Reporter honnêtement : chaque point est *vérifié*, *échoué* ou *non vérifié*. Ne jamais cocher par défaut.

## 1. Fonctionnel

- [ ] Le parcours visé par la tâche fonctionne de bout en bout.
- [ ] Les cas d'erreur sont visibles et compréhensibles (champ invalide, réseau coupé, contenu vide).
- [ ] Aucune régression sur les parcours voisins.
- [ ] Les liens et boutons mènent quelque part ; aucun lien mort.

## 2. Erreurs

- [ ] Console navigateur sans erreur ni warning.
- [ ] Aucun échec réseau (onglet Réseau) : pas de 404 sur un asset, pas de 500.
- [ ] Pages 404 et 500 présentes et cohérentes avec le design.

## 3. Responsive

- [ ] Mobile (≈ 375 px), tablette (≈ 768 px), desktop (≈ 1440 px).
- [ ] Aucun débordement horizontal, aucun texte tronqué, aucune zone cliquable trop petite.

## 4. Accessibilité

- [ ] Navigation complète au clavier, focus toujours visible.
- [ ] Contrastes suffisants (AA), taille de texte lisible.
- [ ] Images avec `alt` pertinent, hiérarchie de titres cohérente, formulaires avec `label`.
- [ ] Fonctionne en thème clair et sombre si le site en propose.

## 5. Performance

- [ ] Lighthouse ≥ 90 en performance et en accessibilité.
- [ ] Images dimensionnées, pas de saut de mise en page au chargement.

## 6. Avant mise en production uniquement

- [ ] Lint, tests et seuil de couverture au vert en CI.
- [ ] Variables d'environnement déclarées côté Vercel.
- [ ] Aucun secret ni donnée de test dans le build.
- [ ] Rollback identifié : déploiement précédent connu et joignable.

## Rapport

Résumer : ce qui a été vérifié, ce qui a échoué, ce qui n'a pas pu l'être et pourquoi. Un point non vérifié
se dit — il ne se suppose pas bon.
