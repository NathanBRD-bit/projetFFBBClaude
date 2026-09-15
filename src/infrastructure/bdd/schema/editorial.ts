import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { horodatages, identifiant } from "./_communs";
import { utilisateur } from "./administration";

/**
 * Éditorial : articles rédigés au back-office et médias téléversés sur Vercel Blob.
 * Ces colonnes sont hors de portée de la synchronisation FFBB — c'est le premier
 * des trois cercles de protection des saisies manuelles.
 */

export const statutArticle = pgEnum("statut_article", ["brouillon", "publie", "archive"]);

export const categorieArticle = pgTable(
  "categorie_article",
  {
    id: identifiant(),
    slug: text("slug").notNull().unique(),
    nom: text("nom").notNull().unique(),
    description: text("description"),
    ordre: smallint("ordre").notNull().default(0),
    ...horodatages(),
  },
  (t) => [
    check("categorie_article_ordre_positif", sql`${t.ordre} >= 0`),
    check("categorie_article_slug_non_vide", sql`btrim(${t.slug}) <> ''`),
  ],
);

export const article = pgTable(
  "article",
  {
    id: identifiant(),
    slug: text("slug").notNull().unique(),
    titre: text("titre").notNull(),
    chapo: text("chapo"),
    /** Corps en Markdown, assaini à l'affichage par une liste blanche. */
    corpsMd: text("corps_md").notNull(),
    categorieId: uuid("categorie_id").references(() => categorieArticle.id, {
      onDelete: "set null",
    }),
    auteurId: uuid("auteur_id").references(() => utilisateur.id, { onDelete: "set null" }),
    statut: statutArticle("statut").notNull().default("brouillon"),
    /** Date de publication. Reste `null` tant que l'article est brouillon. */
    publieLe: timestamp("publie_le", { withTimezone: true }),
    imageCouvertureUrl: text("image_couverture_url"),
    imageCouvertureAlt: text("image_couverture_alt"),
    ...horodatages(),
  },
  (t) => [
    // Un article publié sans date de publication ne peut ni être trié, ni daté au
    // rendu : la liste d'actualités afficherait un trou. On refuse à l'écriture.
    check("article_publie_avec_date", sql`${t.statut} <> 'publie' or ${t.publieLe} is not null`),
    // Alternative textuelle obligatoire dès qu'une image est présente, et non vide :
    // un alt vide est aussi inaccessible qu'un alt absent.
    check(
      "article_image_alt_obligatoire",
      sql`${t.imageCouvertureUrl} is null or (${t.imageCouvertureAlt} is not null and btrim(${t.imageCouvertureAlt}) <> '')`,
    ),
    check("article_titre_non_vide", sql`btrim(${t.titre}) <> ''`),
    check("article_slug_non_vide", sql`btrim(${t.slug}) <> ''`),
    // Requête de la page `/actualites` : les publiés, du plus récent au plus ancien.
    index("article_statut_publie_le_idx").on(t.statut, t.publieLe.desc()),
    index("article_categorie_idx").on(t.categorieId),
  ],
);

/** Taille maximale d'un média, en octets — 5 Mo, conformément au plan. */
const TAILLE_MEDIA_MAX_OCTETS = 5 * 1024 * 1024;

export const media = pgTable(
  "media",
  {
    id: identifiant(),
    /** URL publique renvoyée par Vercel Blob. */
    url: text("url").notNull().unique(),
    /** Chemin dans le store Blob, nécessaire à la suppression. */
    chemin: text("chemin").notNull().unique(),
    nomFichier: text("nom_fichier").notNull(),
    typeMime: text("type_mime").notNull(),
    tailleOctets: integer("taille_octets").notNull(),
    largeur: smallint("largeur"),
    hauteur: smallint("hauteur"),
    /**
     * Obligatoire et non vide : un média sans alternative textuelle ne doit pas
     * pouvoir entrer en base, sans quoi la règle se perd dès le premier formulaire.
     */
    texteAlternatif: text("texte_alternatif").notNull(),
    televersePar: uuid("televerse_par").references(() => utilisateur.id, { onDelete: "set null" }),
    ...horodatages(),
  },
  (t) => [
    check("media_texte_alternatif_non_vide", sql`btrim(${t.texteAlternatif}) <> ''`),
    check(
      "media_taille_valide",
      sql`${t.tailleOctets} > 0 and ${t.tailleOctets} <= ${sql.raw(String(TAILLE_MEDIA_MAX_OCTETS))}`,
    ),
    // Liste blanche de types MIME : la même que celle appliquée à l'upload. La
    // dupliquer en base est volontaire — c'est la dernière barrière si un appel
    // contourne le formulaire.
    check(
      "media_type_mime_autorise",
      sql`${t.typeMime} in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')`,
    ),
    check("media_dimensions_ensemble", sql`(${t.largeur} is null) = (${t.hauteur} is null)`),
    index("media_cree_le_idx").on(t.creeLe.desc()),
  ],
);
