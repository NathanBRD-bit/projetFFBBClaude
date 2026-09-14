# Garde-fous — preuve que le linter mord

Les règles de `docs/qualite.md` ne valent que si elles **font échouer** le lint. Ce dossier contient un
contre-exemple volontairement fautif et la procédure pour le vérifier soi-même.

`domaine-impur.exemple.ts` viole les neuf règles obligatoires du projet, dont l'interdiction faite à
`src/domaine/` (logique métier pure, sans I/O) d'importer React, Next ou une autre couche applicative.

## Pourquoi ce fichier ne casse pas la CI

Il n'est ni compilé ni linté en l'état :

- `tsconfig.json` → `"exclude": ["tests/garde-fous", …]` ;
- `eslint.config.mjs` → `globalIgnores(["tests/garde-fous/**", …])` ;
- `.prettierignore` → `tests/garde-fous/*.exemple.ts` (il doit rester lisible tel quel).

L'extension `.exemple.ts` rappelle qu'il ne s'agit pas d'un test exécutable.

## Comment vérifier (≈ 15 secondes)

Le fichier doit être copié dans `src/domaine/` pour que les règles ciblant ce dossier s'appliquent :

```bash
cp tests/garde-fous/domaine-impur.exemple.ts src/domaine/domaine-impur.ts
npx eslint src/domaine/domaine-impur.ts --max-warnings=0   # doit sortir en code 1
rm src/domaine/domaine-impur.ts
```

Sous PowerShell :

```powershell
Copy-Item tests/garde-fous/domaine-impur.exemple.ts src/domaine/domaine-impur.ts
npx eslint src/domaine/domaine-impur.ts --max-warnings=0
Remove-Item src/domaine/domaine-impur.ts
```

**Ne pas oublier le `rm`/`Remove-Item`** : le fichier laissé dans `src/domaine/` ferait échouer la CI,
ce qui est précisément le comportement recherché.

## Sortie obtenue (ESLint 9.39.5, typescript-eslint 8.70.0)

```text
./src/domaine/domaine-impur.ts
  9:1  error  'react' import is restricted from being used. src/domaine/ doit rester de la logique pure : ni framework (React, Next), ni accès aux données (Drizzle), ni couche applicative  no-restricted-imports
  10:1  error  'next/navigation' import is restricted from being used by a pattern. src/domaine/ doit rester de la logique pure : ni framework (React, Next), ni accès aux données (Drizzle), ni couche applicative  no-restricted-imports
  11:25  error  Unexpected path "../app/page" imported in restricted zone. src/domaine/ doit rester de la logique pure : ni framework (React, Next), ni accès aux données (Drizzle), ni couche applicative  import/no-restricted-paths
  19:14  error  Expected '===' and instead saw '=='  eqeqeq
  26:11  error  Empty block statement  no-empty
  29:3  error  Promises must be awaited, end with a call to .catch, end with a call to .then with a rejection handler or be explicitly marked as ignored with the `void` operator  @typescript-eslint/no-floating-promises
  32:15  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  33:3  error  React Hook "useState" is called in function "sondeGardeFous" that is neither a React function component nor a custom React Hook function. React component names must start with an uppercase letter. React Hook names must start with the word "use"  react-hooks/rules-of-hooks
  36:7  error  Unnecessary conditional, the types have no overlap  @typescript-eslint/no-unnecessary-condition
  45:3  error  Unexpected `await` of a non-Promise (non-"Thenable") value  @typescript-eslint/await-thenable
  50:14  error  Promise returned in function argument where a void return was expected  @typescript-eslint/no-misused-promises
✖ 11 problems (11 errors, 0 warnings)
```

Code de sortie : `1`.

## Correspondance règle ↔ ligne

| Ligne | Règle                                         | Ce qui est interdit                                   |
| ----- | --------------------------------------------- | ----------------------------------------------------- |
| 9     | `no-restricted-imports`                       | `import … from "react"` dans `src/domaine/`           |
| 10    | `no-restricted-imports`                       | `import … from "next/navigation"` dans `src/domaine/` |
| 11    | `import/no-restricted-paths`                  | import de `src/app/` depuis `src/domaine/`            |
| 19    | `eqeqeq`                                      | comparaison lâche `==`                                |
| 26    | `no-empty`                                    | `catch {}` qui avale l'erreur                         |
| 29    | `@typescript-eslint/no-floating-promises`     | promesse jamais attendue                              |
| 32    | `@typescript-eslint/no-explicit-any`          | type `any`                                            |
| 36    | `@typescript-eslint/no-unnecessary-condition` | test toujours vrai                                    |
| 45    | `@typescript-eslint/await-thenable`           | `await` sur une non-promesse                          |
| 50    | `@typescript-eslint/no-misused-promises`      | fonction async passée là où un `void` est attendu     |

La ligne 33 (`react-hooks/rules-of-hooks`) vient en prime de `next/core-web-vitals` : elle n'était pas visée
mais confirme que la configuration Next est bien active.

## Deux règles plutôt qu'une

`import/no-restricted-paths` ne raisonne que sur des chemins **du dépôt** : il bloque
`src/domaine/ → src/app/`, `src/infrastructure/`, `src/actions/`, `src/composants/`, alias `@/…` compris
(résolution via `eslint-import-resolver-typescript`). Il ne sait rien des paquets npm.

Les paquets interdits (`react`, `react-dom`, `next`, `next/*`, `drizzle-orm`, `server-only`) sont donc
bloqués par `no-restricted-imports`, appliqué en override sur `src/domaine/**` uniquement. Les deux règles
sont complémentaires, pas redondantes.
