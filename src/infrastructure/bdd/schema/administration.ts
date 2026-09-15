import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { horodatages, identifiant } from "./_communs";

/**
 * Administration : comptes du back-office, sessions opaques, anti-bruteforce et
 * paramètres d'exploitation.
 */

export const roleUtilisateur = pgEnum("role_utilisateur", ["administrateur", "redacteur"]);

export const utilisateur = pgTable(
  "utilisateur",
  {
    id: identifiant(),
    email: text("email").notNull(),
    nomAffiche: text("nom_affiche").notNull(),
    /** Empreinte scrypt ; le mot de passe en clair n'entre jamais en base. */
    motDePasseHash: text("mot_de_passe_hash").notNull(),
    role: roleUtilisateur("role").notNull().default("redacteur"),
    estActif: boolean("est_actif").notNull().default(true),
    derniereConnexionLe: timestamp("derniere_connexion_le", { withTimezone: true }),
    ...horodatages(),
  },
  (t) => [
    // Unicité de l'email **insensible à la casse**, par index fonctionnel plutôt que
    // par le type `citext`. Raison : `citext` est une extension contrib, à installer
    // sur Neon comme sur PGlite ; l'index sur `lower(email)` est du Postgres de base,
    // strictement portable, et il documente lui-même la règle appliquée.
    // Contrepartie assumée : les lectures par email doivent comparer `lower(email)`
    // pour utiliser l'index — c'est le rôle de la couche d'accès, pas du schéma.
    uniqueIndex("utilisateur_email_unique").on(sql`lower(${t.email})`),
    // L'email est stocké tel qu'il a été saisi, mais sans espaces parasites ni
    // adresse manifestement invalide : la frontière refuse, elle ne « corrige » pas.
    check(
      "utilisateur_email_plausible",
      sql`${t.email} = btrim(${t.email}) and position('@' in ${t.email}) > 1`,
    ),
    check("utilisateur_nom_affiche_non_vide", sql`btrim(${t.nomAffiche}) <> ''`),
    check("utilisateur_hash_non_vide", sql`btrim(${t.motDePasseHash}) <> ''`),
  ],
);

export const session = pgTable(
  "session",
  {
    id: identifiant(),
    utilisateurId: uuid("utilisateur_id")
      .notNull()
      .references(() => utilisateur.id, { onDelete: "cascade" }),
    /** SHA-256 du jeton opaque. Le jeton en clair ne vit que dans le cookie. */
    jetonHash: text("jeton_hash").notNull().unique(),
    expireLe: timestamp("expire_le", { withTimezone: true }).notNull(),
    derniereActiviteLe: timestamp("derniere_activite_le", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Renseignée par une déconnexion ou une révocation ; la session reste tracée. */
    revoqueeLe: timestamp("revoquee_le", { withTimezone: true }),
    adresseIp: text("adresse_ip"),
    agentUtilisateur: text("agent_utilisateur"),
    creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Le ménage des sessions expirées et la vérification à chaque requête passent
    // tous les deux par cette colonne.
    index("session_expire_le_idx").on(t.expireLe),
    index("session_utilisateur_idx").on(t.utilisateurId),
    check("session_expiration_posterieure", sql`${t.expireLe} > ${t.creeLe}`),
  ],
);

export const tentativeConnexion = pgTable(
  "tentative_connexion",
  {
    id: identifiant(),
    /** L'email tel que saisi : il peut ne correspondre à aucun compte. */
    emailSaisi: text("email_saisi").notNull(),
    adresseIp: text("adresse_ip").notNull(),
    reussie: boolean("reussie").notNull(),
    // Table en ajout seul : pas de `maj_le`, une tentative ne se modifie pas.
    tenteeLe: timestamp("tentee_le", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tentative_connexion_email_idx").on(sql`lower(${t.emailSaisi})`, t.tenteeLe.desc()),
    index("tentative_connexion_ip_idx").on(t.adresseIp, t.tenteeLe.desc()),
  ],
);

export const parametre = pgTable(
  "parametre",
  {
    id: identifiant(),
    /** Clé fonctionnelle : `ffbb.key_dh`, `reseaux.instagram`… */
    cle: text("cle").notNull().unique(),
    valeur: text("valeur").notNull(),
    description: text("description"),
    /** Pour les valeurs à durée de vie (cache des jetons FFBB, 6 h). */
    expireLe: timestamp("expire_le", { withTimezone: true }),
    ...horodatages(),
  },
  (t) => [check("parametre_cle_non_vide", sql`btrim(${t.cle}) <> ''`)],
);
