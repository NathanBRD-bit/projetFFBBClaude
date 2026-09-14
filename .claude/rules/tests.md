---
paths:
  - "**/*.test.*"
  - "**/*.spec.*"
  - "tests/**/*"
  - "__tests__/**/*"
  - "e2e/**/*"
---

# Écriture des tests

- Un test nomme ce qu'il vérifie en français : `il refuse une inscription sans email`, pas `test 3`.
- Structure **arrange / act / assert** visible, une assertion logique par test.
- Couvrir systématiquement, au-delà du cas nominal : entrée vide, valeur nulle ou absente, type inattendu,
  limite haute et basse, dépendance externe en échec.
- **Aucun test désactivé** (`skip`, `only`, commenté) sans une ligne expliquant pourquoi et quand il revient.
  `only` ne doit jamais être commité : il fait passer la CI au vert en n'exécutant presque rien.
- Pas de `sleep` ni d'attente arbitraire : attendre une condition explicite.
- Pas de dépendance entre tests ni à leur ordre d'exécution ; chaque test crée et nettoie ses propres données.
- Ne pas mocker ce qu'on cherche à tester. Mocker le réseau et l'horloge, pas la logique métier.
- Un test qui échoue doit dire **ce qui était attendu et ce qui a été obtenu** : préférer des assertions
  parlantes aux `assert(vrai)`.
- Corriger un bug : écrire d'abord le test qui le reproduit, vérifier qu'il échoue, puis corriger.

Seuils : ≥ 80 % de couverture sur la logique métier, 100 % sur le critique (validation d'entrées,
authentification, tout ce qui touche aux données utilisateur).
