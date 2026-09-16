# ADR 0002 — Clé d'idempotence des rencontres FFBB

- **Statut** : acceptée
- **Date** : 2026-09-15
- **Tâche** : T04 (client FFBB). Commande le `on conflict` de T06 (moteur de synchronisation).

## Contexte

La synchronisation FFBB doit être **rejouable à l'identique** : réimporter le même index deux fois de
suite doit produire zéro création et zéro mise à jour (test obligatoire de T06). Cela suppose une clé
stable qui identifie une rencontre d'un import à l'autre.

Le schéma de T03 prévoit deux colonnes et ne tranche pas laquelle porte l'idempotence :

```sql
id_ffbb        text unique          -- « identifiant FFBB »
cle_naturelle  text not null unique -- « filet de secours »
```

Trois candidats se présentaient dans le document renvoyé par l'index `ffbbserver_rencontres` :

1. le champ `id` ;
2. le champ `uniqueKey`, dont le nom promet précisément l'unicité ;
3. une clé naturelle composée (saison + compétition + poule + date + libellés d'équipes).

## Méthode : ce que les fixtures et un échantillon réel disent

Toutes les observations ci-dessous viennent de requêtes réelles du 15/09/2026 sur
`POST https://meilisearch-prod.ffbb.app/indexes/ffbbserver_rencontres/search`, et non d'une lecture de
documentation (il n'y en a pas).

- **Fixture du club** (`tests/fixtures/ffbb/rencontres-club.json`) : la seule rencontre publiée du SOCL
  à cette date.
  ```json
  "id": "200000014681472",
  "uniqueKey": "200000003058340_1_3",
  "idPoule": { "id": "200000003058340", "nom": "D 4A" },
  "numeroJournee": "1",
  "url_competition": ".../competitions/dmu11-4/match/200000014681472"
  ```
- **Échantillon large** : 5 000 documents de l'index (5 pages de 1 000, `sort: date_timestamp:asc`),
  c'est-à-dire le plafond de `estimatedTotalHits` renvoyé par ce serveur.

### Résultat décisif

| Champ       | Valeurs distinctes sur 5 000 documents |
| ----------- | -------------------------------------- |
| `id`        | **5 000**                              |
| `uniqueKey` | **4 999**                              |

`uniqueKey` **n'est pas unique**. La collision observée :

```
uniqueKey = "200000003057050_61_61"
  ├─ id 200000014732846 — ROCHE LA MOLIERE ES vs ANDREZIEUX-BOUTHEON LOIRE SUD BASKET
  └─ id 200000014732847 — ROCHE LA MOLIERE ES vs ROCHE LA MOLIERE ES
  (même poule « Poule A », même compétition « Amical PNM », même date 2026-09-13)
```

Deux rencontres différentes, même `uniqueKey`. En `on conflict` cela aurait signifié : la seconde écrase
la première, et **un match disparaît du site sans qu'aucune erreur ne soit levée** — le bug silencieux
que ce projet refuse par principe.

### Pourquoi : structure de `uniqueKey`

Sur les 5 000 documents, `uniqueKey` vaut exactement
`` `${idPoule.id}_${numeroJournee}_${numeroRencontre}` `` (vérifié 5 000/5 000). C'est un numéro d'ordre
**dans une poule**, pas un identifiant. Sur un plateau amical où plusieurs rencontres partagent le même
numéro d'ordre, il se répète.

### Ce qui plaide pour `id`

- 5 000 valeurs distinctes sur 5 000 documents.
- `url_competition` se termine par `/<id>` sur **5 000 documents sur 5 000** : c'est l'identifiant de
  l'URL publique de la fiche match sur `competitions.ffbb.com`. Un identifiant qui sert d'URL publique
  n'est pas renuméroté à la légère — c'est le meilleur indice de stabilité disponible sans historique.
- Le format (`200000014681472`, chaîne de chiffres, préfixe `2` + compteur) est celui d'une clé technique
  attribuée à la création, cohérent avec `creation_timestamp`.

## Décision

**`rencontre.id_ffbb` reçoit le champ `id`. C'est la cible du `on conflict` de T06.**

`uniqueKey` n'est pas utilisé comme clé. Il est conservé tel quel dans le document validé, à titre
documentaire et pour le rapprochement manuel au back-office.

`rencontre.cle_naturelle` reste le filet de secours annoncé par T03, mais il est **composé**, pas copié
de `uniqueKey` :

```
saison.code | competitionId.code | idPoule.id | date | nomEquipe1 | nomEquipe2
```

(normalisation — minuscules, espaces réduits — à la charge de T05, qui est pure et testée). Cette
composition distingue bien les deux rencontres de la collision ci-dessus, puisque `nomEquipe2` diffère.

Rôles, à respecter en T06 :

- `id_ffbb` est la clé d'idempotence : c'est sur elle que porte le `on conflict do update` ;
- `cle_naturelle` est un **détecteur**, pas une clé d'écriture. Si un import présente un `id_ffbb` inconnu
  dont la `cle_naturelle` existe déjà, la FFBB a renuméroté une rencontre : T06 doit ouvrir un
  `conflit_synchronisation` et **ne pas** créer un doublon en silence.

## Conséquences

- Le `on conflict` de T06 s'écrit sur `rencontre.id_ffbb`, colonne déjà `unique` au schéma : aucune
  migration n'est nécessaire, T03 n'est pas touchée.
- `id` est une chaîne côté FFBB et le reste en base (`text`). Ne pas la convertir en entier : elle dépasse
  déjà 2^47 et rien ne garantit qu'elle restera numérique.
- Deux rencontres légitimement identiques en `cle_naturelle` (même poule, même date, mêmes deux équipes,
  cas des matchs aller/retour joués le même jour sur un plateau) feraient échouer la contrainte unique de
  `cle_naturelle`. T06 doit donc composer la clé naturelle **en y incluant `id_ffbb` en dernier recours**
  si la composition seule entre en collision, et journaliser le cas.

## Alternatives écartées

| Option                                   | Pourquoi écartée                                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uniqueKey` comme clé d'idempotence      | Prouvé non unique : 1 collision sur 5 000 documents. Aurait fait disparaître des matchs sans erreur.                                                       |
| Clé naturelle composée **seule**         | Dépend de libellés d'équipes que la FFBB retouche en cours de saison (« CHAZE SUR ARGOS - 2 »). Un renommage créerait un doublon à chaque import.          |
| `id` **et** `uniqueKey` en clé composite | Hérite de l'instabilité de `uniqueKey` sans rien gagner : `id` est déjà unique à lui seul.                                                                 |
| Hachage du document entier               | Change à chaque retouche FFBB (score saisi, salle corrigée) : ce serait une clé de _version_, pas d'identité. C'est exactement le rôle d'`empreinte_ffbb`. |

## Ce que cette décision ne prouve pas

- **La stabilité d'`id` dans le temps.** Un instantané, même de 5 000 documents, ne peut pas montrer
  qu'un `id` ne change jamais d'une saison ou d'une refonte à l'autre. Les parades existent déjà et
  doivent être maintenues : `cle_naturelle` comme détecteur de renumérotation, `empreinte_ffbb` pour
  n'écrire que sur vrai changement, `disparue_de_ffbb_le` au lieu de toute suppression, et le job
  hebdomadaire `contrat-ffbb.yml` de T07.
- **L'unicité d'`id` au-delà de 5 000 documents.** Le serveur plafonne `estimatedTotalHits` à 5 000 ;
  l'index national en compte davantage. L'échantillon est ordonné par date, donc contigu, ce qui est le
  cas le plus favorable aux collisions de `uniqueKey` — et c'est justement là qu'elles apparaissent.
  L'unicité d'`id` reste garantie en dernier ressort par la contrainte `unique` de Postgres : une
  violation ferait échouer la transaction de synchronisation, bruyamment.
