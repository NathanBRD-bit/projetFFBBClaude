# Qualité de code

Ce document détaille les règles résumées dans [CLAUDE.md](../CLAUDE.md). Règle générale : **tout ce qui peut
être vérifié par un outil doit l'être par un outil** — un linter est plus fiable qu'une consigne en prose.

## Pas de bug silencieux

Une erreur doit être bruyante, immédiate et localisable. Interdits, sauf justification écrite en commentaire
à l'endroit concerné :

- `catch` / `except` vide, ou qui logue puis continue comme si de rien n'était ;
- toute suppression globale d'erreur (l'opérateur `@` en PHP, `2>$null`, `|| true` en CI) ;
- une valeur par défaut qui masque une donnée absente : un `?? 0` ou `?? ''` qui transforme un bug en cas
  normal — préférer l'échec explicite ;
- les comparaisons lâches (`==`) là où l'identité stricte est attendue ;
- un `try` qui enveloppe trente lignes : le réduire au seul appel qui peut échouer.

En positif :

- mode strict de la stack activé (`strict: true` en TypeScript et équivalents) ;
- erreurs remontées et loguées **avec leur contexte** (quelle entrée, quelle opération) ;
- warnings traités comme des erreurs en CI ;
- validation des entrées **à la frontière** (formulaire, requête, API), pas disséminée dans le code métier.

### Application automatique

À mettre en place dès que la stack est choisie, pour que ces règles ne dépendent plus de la vigilance :

| Règle | Outil |
|---|---|
| `catch` vide | ESLint `no-empty` (`allowEmptyCatch: false`) |
| comparaisons lâches | ESLint `eqeqeq` |
| promesses non gérées | ESLint `no-floating-promises` |
| types laxistes | `tsconfig` `strict`, `noUncheckedIndexedAccess` |
| lint avant commit | hook pre-commit |
| warnings bloquants | `--max-warnings=0` en CI |

## Performance

- Pas de requête en boucle (N+1), pas de travail recalculé à chaque requête là où un cache simple suffit.
- Toute dépendance ajoutée se justifie : ce qu'elle apporte, son poids, l'alternative en natif.
- Budget sur le site livré : **Lighthouse ≥ 90** en performance et en accessibilité.
- Assets minifiés, images dimensionnées et servies en format moderne, polices chargées sans blocage du rendu.
- Lisible avant malin : une optimisation qui rend le code opaque sans gain mesuré n'est pas une optimisation.

## Documentation

- Le `README.md` doit permettre à un nouvel arrivant d'installer et lancer le projet sans poser de question.
- Toute décision structurante (stack, hébergement, service externe) est écrite avec ses alternatives
  écartées : on doit pouvoir comprendre plus tard *pourquoi*, pas seulement *quoi*.
- Les commentaires expliquent l'intention, pas la syntaxe. Un commentaire qui paraphrase le code est du bruit.
