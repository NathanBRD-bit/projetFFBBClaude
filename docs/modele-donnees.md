# Modèle de données

Postgres, nommage **français en `snake_case`**, clés primaires `uuid` générées par `gen_random_uuid()`,
horodatages `cree_le` / `maj_le` en `timestamptz` sur les tables mutables.

Le schéma vit dans [`src/infrastructure/bdd/schema/`](../src/infrastructure/bdd/schema), un fichier par
domaine fonctionnel. Les migrations SQL versionnées sont dans [`drizzle/`](../drizzle) : c'est le SQL qui est
relu en review, pas le TypeScript qui le produit.

> **Ce document explique surtout _pourquoi_ les contraintes existent.** Le _quoi_ est dans la migration ;
> le _pourquoi_ se perd, et c'est lui qui empêche quelqu'un de « simplifier » un garde-fou dans six mois.

## Le principe qui commande tout le reste

**La base est la source de vérité, l'API FFBB n'est qu'une alimentation.** L'index Meilisearch de la FFBB ne
contient que la saison en cours ; l'historique pluriannuel n'existe donc nulle part ailleurs que chez nous.
Trois conséquences qui se lisent directement dans le schéma :

1. la synchronisation ne fait **jamais** de `DELETE` ;
2. un match disparu de l'index est **horodaté**, pas supprimé (`disparue_de_ffbb_le`) ;
3. une saisie manuelle n'est **jamais écrasée** en silence (`champs_verrouilles`, `conflit_synchronisation`).

## Les tables

### Référentiel — `referentiel.ts`

| Table         | Rôle                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| `saison`      | Saisons sportives (`25-26`, `26-27`). Une seule est « courante ».          |
| `organisme`   | Clubs, nous compris. `code_ffbb` unique ; `est_le_club` distingue le SOCL. |
| `competition` | Une compétition d'une saison donnée (`Départemental U11 Masculins`).       |
| `poule`       | Une poule d'une compétition.                                               |
| `salle`       | Gymnases, avec coordonnées facultatives pour la carte.                     |

### Club — `club.ts`

| Table           | Rôle                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------- |
| `equipe`        | Les 7 équipes du club, **stables dans le temps** : elles survivent aux saisons.              |
| `engagement`    | équipe × saison × compétition (+ poule), et surtout `libelles_ffbb`.                         |
| `joueur`        | Effectifs. `nom_affiche` permet « Léo M. » ; `visible_publiquement` est **faux** par défaut. |
| `joueur_equipe` | Rattachement d'un joueur à une équipe pour une saison.                                       |

### Rencontres — `rencontres.ts`

`rencontre` est la table centrale ; `statistique_joueur` porte les points marqués.

### Éditorial — `editorial.ts`

`categorie_article`, `article`, `media`.

### Administration — `administration.ts`

`utilisateur`, `session`, `tentative_connexion`, `parametre`.

### Synchronisation — `synchronisation.ts`

`journal_synchronisation` (ce qui a tourné et ce que ça a produit), `conflit_synchronisation` (les
divergences à arbitrer à la main).

---

## Les trois décisions de modélisation qui méritent une explication

### 1. `null` et non `0` sur les scores

`score_domicile` et `score_exterieur` sont `smallint` **nullable**, jamais `not null default 0`.

`0` est une vraie valeur : un match peut se finir 20-0 sur forfait. `null` veut dire « on ne sait pas » :
match à venir, match reporté, ou match joué dont la FFBB n'a jamais remonté la feuille de marque — cas très
fréquent en départemental. Mettre `0` par défaut afficherait **0-0 au public pour un match dont on ignore le
résultat** : une information fausse, indiscernable d'une information vraie. C'est exactement le bug
silencieux que le projet interdit.

Trois contraintes tiennent cette sémantique :

```sql
check ((score_domicile is null) = (score_exterieur is null))  -- deux scores, ou aucun
check (statut <> 'joue' or score_domicile is not null)        -- « joué » implique un score
check (score_domicile is null or score_domicile >= 0)         -- et idem côté extérieur
```

La deuxième a une conséquence pratique qu'il faut avoir en tête : **un match passé sans score remonté ne peut
pas être marqué `joue`.** Il reste en `a_confirmer` avec des scores nuls, jusqu'à saisie manuelle. C'est
voulu : le statut ne doit pas pouvoir mentir sur l'existence d'un résultat. Le jeu de peuplement contient ce
cas (`2026-02-07-cande-le-lion-dangers-u11m`).

La même règle vaut pour `statistique_joueur.points` : `null` = non saisi, `0` = zéro point marqué.
L'affichage public écrit « — » pour `null`, jamais « 0 ».

### 2. `champs_verrouilles`

`text[]`, sur `rencontre`. Contient le nom des colonnes qu'un humain a éditées au back-office.

Le problème : un bénévole corrige l'horaire d'un match parce qu'il sait que la salle a changé ; deux heures
plus tard, la synchronisation repasse et remet la valeur FFBB. La correction est perdue, personne ne le voit.

La parade tient en **trois cercles** :

1. les champs éditoriaux (`resume_md`, `affiche_publiquement`…) sont **hors de portée** de la fonction de
   fusion : elle ne les écrit jamais ;
2. un champ FFBB édité à la main entre dans `champs_verrouilles`. En cas de divergence, la sync crée un
   **conflit visible au back-office** et **n'écrase rien** ;
3. les autres champs se mettent à jour normalement, et seulement si `empreinte_ffbb` a changé.

Le conflit est matérialisé par `conflit_synchronisation`, avec un index unique **partiel** :

```sql
create unique index conflit_synchronisation_ouvert_unique
  on conflit_synchronisation (rencontre_id, champ) where resolu_le is null;
```

Un seul conflit ouvert par (rencontre, champ) : sans cela, chaque passage de la sync empilerait un doublon et
le tableau de bord deviendrait illisible en une journée. Une fois résolu, le conflit sort de l'index et
l'historique reste consultable.

### 3. `disparue_de_ffbb_le`

`timestamptz` nullable, sur `rencontre`. Horodate le moment où un match connu a cessé d'apparaître dans
l'index FFBB.

La sync ne supprime jamais. Un match qui disparaît est soit une correction légitime de la FFBB, soit un bug
de leur côté, soit une panne partielle de leur index — et nous n'avons **aucun moyen de faire la différence**.
Supprimer serait irréversible ; horodater ne l'est pas.

- Match **joué** qui disparaît → il reste affiché à vie. C'est ainsi que se construit l'historique
  pluriannuel, que l'API ne sait pas fournir.
- Match **à venir** qui disparaît → il passe en `a_confirmer`, avec un conflit visible au back-office.

Un garde-fou complémentaire vit dans le moteur de sync (T06) et non dans le schéma : **si l'index revient
vide alors que la base contient des matchs, aucune disparition n'est appliquée** et la synchronisation est
marquée en échec. C'est l'anti-effacement de masse.

---

## Les autres garde-fous, et ce qu'ils empêchent

| Contrainte                                   | Ce qu'elle empêche                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `saison_une_seule_courante` (index partiel)  | Deux saisons courantes → toute requête « la saison en cours » ambiguë.    |
| `organisme_un_seul_club` (index partiel)     | Deux « notre club » → toute requête « nos matchs » ambiguë.               |
| `rencontre_organismes_distincts`             | Un match du SOCL contre le SOCL, né d'un rapprochement raté.              |
| `rencontre.id_ffbb` unique                   | Un doublon à chaque synchronisation : c'est la clé d'idempotence.         |
| `rencontre.cle_naturelle` unique, non nulle  | Filet de secours si `id_ffbb` change ou manque (match saisi à la main).   |
| `rencontre.slug` unique                      | Deux URL publiques identiques.                                            |
| `rencontre_poule_competition_fk` (composite) | Une poule rattachée à une autre compétition que celle du match.           |
| `engagement_competition_saison_fk`           | Une équipe engagée 25-26 dans une compétition 26-27.                      |
| `article_publie_avec_date`                   | Un article publié sans date : impossible à trier ni à dater au rendu.     |
| `article_image_alt_obligatoire`              | Une image de couverture sans alternative textuelle (ou avec un alt vide). |
| `media_type_mime_autorise`                   | Un SVG téléversé comme image — vecteur d'injection de script.             |
| `statistique_joueur_absent_sans_points`      | « n'a pas joué, 12 points » : une erreur de saisie, pas une donnée.       |
| `journal_echec_avec_message`                 | Un échec de synchronisation qui ne dit pas pourquoi.                      |
| `conflit_valeurs_differentes`                | Un « conflit » entre deux valeurs identiques.                             |
| `session_expiration_posterieure`             | Une session créée déjà expirée.                                           |
| `salle_coordonnees_ensemble`                 | Une demi-coordonnée, qui place un point au large du golfe de Guinée.      |

Chacune de ces contraintes est **démontrée par un test qui tente l'insertion illégale et vérifie qu'elle est
rejetée** : [`tests/integration/contraintes.test.ts`](../tests/integration/contraintes.test.ts). Un
garde-fou non prouvé n'est pas un garde-fou.

### Unicité d'email insensible à la casse

`utilisateur.email` n'utilise **pas** le type `citext`, mais un index unique fonctionnel :

```sql
create unique index utilisateur_email_unique on utilisateur (lower(email));
```

Arbitrage : `citext` est une extension `contrib`, à installer explicitement sur Neon **et** sur PGlite, donc
une dépendance de plus à gérer dans deux environnements. L'index fonctionnel est du Postgres de base,
strictement portable, et il documente lui-même la règle appliquée.

Contrepartie assumée, à connaître avant d'écrire une requête : **toute recherche par email doit comparer
`lower(email)`** pour utiliser l'index. C'est le rôle de la couche d'accès, pas du schéma.

L'email est par ailleurs stocké tel qu'il a été saisi, et un email entouré d'espaces est **refusé** plutôt
que nettoyé en silence (`utilisateur_email_plausible`) : la frontière valide, elle ne corrige pas.

---

## `statistique_joueur` : ce qui n'est délibérément pas là

La v1 est réduite à **`a_joue`, `points`, `saisi_par`, `saisi_le`**. Les colonnes détaillées du modèle
initial — tirs 2 points / 3 points / lancers francs, rebonds offensifs et défensifs, passes, interceptions,
contres, fautes, minutes jouées — **ne sont pas créées**.

Raisons : la saisie est entièrement manuelle (l'API FFBB n'expose aucune statistique individuelle), et un box
score complet ne sera jamais rempli tant que le club n'en aura pas pris l'habitude. Une table à quinze
colonnes vides est une rubrique morte qui donne l'illusion d'une fonctionnalité.

Ces colonnes arriveront **par une migration dédiée** si l'usage suit. Ajouter des colonnes nullables à une
table existante est une migration sans risque et sans réécriture de données : rien n'est perdu à attendre.

---

## Protection des données des joueurs

Le club compte des équipes de jeunes à partir des U9. Le schéma applique la minimisation :

- **aucune donnée sensible** : ni date de naissance, ni numéro de licence, ni contact ;
- `nom_affiche` permet d'afficher « Léo M. » plutôt qu'un état civil complet ;
- `visible_publiquement` est **`false` par défaut** : tant que les autorisations de droit à l'image ne sont
  pas recueillies, aucun joueur n'apparaît côté public. Le site fonctionne sans, simplement les effectifs et
  les points par joueur ne s'affichent pas ;
- le retrait se fait en basculant un booléen, sans suppression ni migration.

---

## Travailler avec la base

| Action                                         | Commande                   |
| ---------------------------------------------- | -------------------------- |
| Régénérer la migration après un changement     | `npm run bdd:generer`      |
| Appliquer les migrations (`DATABASE_URL`)      | `npm run bdd:migrer`       |
| Peupler la base de données de démonstration    | `npm run bdd:semer`        |
| Tests d'intégration (migrations + contraintes) | `npm run test:integration` |

`scripts/semer.ts` est **idempotent** : chaque ligne porte un identifiant fixe et est écrite en
`insert … on conflict (id) do update`. Le relancer ne duplique rien et laisse la base strictement dans le
même état — propriété vérifiée par un test.

⚠️ Les données du script sont des **fixtures de développement**. Seuls le code FFBB du club
(`PDL0049077`), les deux salles et le match U11 M du 19/09/2026 proviennent de sources vérifiées ; la
composition exacte des 7 équipes, les codes FFBB des clubs adverses et les scores sont plausibles mais
inventés, et restent à faire confirmer par le club.

## Pourquoi PGlite en test et Neon en production

Les tests d'intégration tournent sur [PGlite](https://pglite.dev) : un vrai Postgres compilé en WebAssembly,
lancé **dans le processus Node**. Pas de serveur à installer, pas de conteneur à démarrer, pas de
`services: postgres` en CI — donc les mêmes contraintes vérifiées sur la machine de chacun et sur GitHub
Actions, sans qu'aucune de ces vérifications ne dépende de la présence de Docker.

Ce sont **exactement les fichiers SQL de `drizzle/`** qui sont appliqués, ceux qui partiront sur Neon. Le
type `BaseDeDonnees` exposé par [`client.ts`](../src/infrastructure/bdd/client.ts) est l'interface Postgres
générique de Drizzle : le code métier ne sait pas, et n'a pas à savoir, quel driver est branché.
