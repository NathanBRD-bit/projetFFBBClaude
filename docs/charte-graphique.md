# Charte graphique

Les couleurs ne sont pas choisies : elles sont **relevées sur le logo officiel du club**, puis vérifiées au
contraste. Les jetons vivent dans `src/app/globals.css` et nulle part ailleurs.

## Origine

Le logo du club — écusson circulaire, « STADE OLYMPIQUE CANDÉ LOIRE » en arc, ballon au centre, bandeau
« SOCL BASKET » — a été récupéré depuis la page Facebook du club (`soclbasket`). L'analyse des pixels colorés
donne deux couleurs dominantes, cohérentes avec le « 🟡🟣 » de la bio Instagram `socl_basket` :

| Couleur                          | Hex       | Part des pixels colorés du logo |
| -------------------------------- | --------- | ------------------------------- |
| Violet (bandeau et texte en arc) | `#5B1B40` | 51 %                            |
| Jaune (ballon)                   | `#F8E71B` | 21 %                            |

Le ballon est **jaune**, pas orange. La fiche FFBB du club ne contient aucun logo (`logo: null`), cette
source est donc la meilleure disponible.

## Jetons

| Jeton            | Hex       | Usage                                                           |
| ---------------- | --------- | --------------------------------------------------------------- |
| `--violet`       | `#5B1B40` | Texte structurant, titres, liens                                |
| `--violet-fonce` | `#3E1230` | Fonds d'en-tête, de pied de page et de bandeau                  |
| `--violet-voile` | `#F3EBF0` | Aplat très clair : survols, badges neutres. **Jamais du texte** |
| `--jaune`        | `#F8E71B` | Accent uniquement — voir la règle ci-dessous                    |
| `--fond`         | `#FFFFFF` | Fond des pages et des cartes                                    |
| `--fond-doux`    | `#FAF6F8` | Fond des zones secondaires et des états vides                   |
| `--encre`        | `#1F1420` | Texte courant                                                   |
| `--encre-douce`  | `#6B5C6A` | Texte secondaire, métadonnées                                   |
| `--bordure`      | `#E8DFE5` | Filets et contours de cartes                                    |
| `--victoire`     | `#1B6B45` | Score gagnant                                                   |
| `--defaite`      | `#A3182B` | Score perdant                                                   |

## La règle du jaune

**Le jaune ne sert jamais de couleur de texte sur fond clair.** Sur blanc il plafonne à **1,28:1**, très
loin des 4,5:1 exigés par WCAG AA. Il est réservé à trois usages :

1. **aplat ou bordure** (barre sous les titres de section, anneau de focus) ;
2. **accent sur violet foncé** — 12,32:1, AAA ;
3. **fond de bouton avec texte violet** — 9,81:1, AAA. C'est la combinaison qui porte les actions
   principales : fond jaune, texte violet, et non l'inverse.

## Contrastes mesurés

| Association                       | Ratio      | Niveau               |
| --------------------------------- | ---------- | -------------------- |
| `--encre` sur `--fond`            | 17,81:1    | AAA                  |
| `--violet-fonce` sur `--fond`     | 15,74:1    | AAA                  |
| Blanc sur `--violet-fonce`        | 15,74:1    | AAA                  |
| `--encre` sur `--fond-doux`       | 16,62:1    | AAA                  |
| `--violet` sur `--fond`           | 12,53:1    | AAA                  |
| `--jaune` sur `--violet-fonce`    | 12,32:1    | AAA                  |
| `--violet` sur `--jaune`          | 9,81:1     | AAA                  |
| `--defaite` sur `--fond`          | 7,71:1     | AAA                  |
| `--victoire` sur `--fond`         | 6,49:1     | AA                   |
| `--encre-douce` sur `--fond`      | 6,24:1     | AA                   |
| `--encre-douce` sur `--fond-doux` | 5,83:1     | AA                   |
| **`--jaune` sur `--fond`**        | **1,28:1** | **échec — interdit** |

## Typographie

Pile système (`ui-sans-serif`, `system-ui`, Segoe UI, Roboto…). Aucune police distante : une police Google
ferait dépendre le build d'un appel réseau et coûterait un aller-retour au premier affichage. Si le club
tient à une police de marque, elle sera auto-hébergée via `next/font/local`.

## Accessibilité

- Anneau de focus **toujours visible** : 3 px jaune, décalé de 2 px. Sur fond violet, il repasse en blanc
  (classe `.sur-violet`).
- Lien « Aller au contenu » en premier élément focusable de chaque page.
- `prefers-reduced-motion` respecté : animations et défilement doux neutralisés.
- Aucune information portée par la seule couleur : un score gagnant est vert **et** placé du côté du club,
  un statut est un mot dans un badge, pas une pastille muette.

## Le logo

`public/logo-socl.png` — 150 × 150, fond rendu transparent hors du cercle pour poser sur le violet.
`src/app/icon.png` — 180 × 180, Next en dérive le favicon.

**Limite connue** : 150 px est la meilleure résolution trouvée en ligne. Correct jusqu'à ~56 px d'affichage,
insuffisant au-delà. À remplacer dès que le club fournit un fichier vectoriel ou haute définition — un seul
fichier à changer, aucun code à toucher.
