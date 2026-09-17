CREATE TYPE "public"."sexe_equipe" AS ENUM('masculin', 'feminin', 'mixte');--> statement-breakpoint
CREATE TYPE "public"."source_donnee" AS ENUM('ffbb', 'manuel');--> statement-breakpoint
CREATE TYPE "public"."statut_rencontre" AS ENUM('a_venir', 'joue', 'score_manquant', 'reporte', 'annule', 'forfait', 'a_confirmer');--> statement-breakpoint
CREATE TYPE "public"."statut_article" AS ENUM('brouillon', 'publie', 'archive');--> statement-breakpoint
CREATE TYPE "public"."role_utilisateur" AS ENUM('administrateur', 'redacteur');--> statement-breakpoint
CREATE TYPE "public"."declencheur_synchronisation" AS ENUM('cron_vercel', 'github_actions', 'manuel');--> statement-breakpoint
CREATE TYPE "public"."resolution_conflit" AS ENUM('garder_local', 'appliquer_ffbb');--> statement-breakpoint
CREATE TYPE "public"."statut_synchronisation" AS ENUM('en_cours', 'succes', 'partiel', 'echec');--> statement-breakpoint
CREATE TABLE "competition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"saison_id" uuid NOT NULL,
	"code_ffbb" text,
	"nom" text NOT NULL,
	"categorie" text,
	"niveau" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_saison_nom_unique" UNIQUE("saison_id","nom"),
	CONSTRAINT "competition_id_saison_unique" UNIQUE("id","saison_id")
);
--> statement-breakpoint
CREATE TABLE "organisme" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_ffbb" text NOT NULL,
	"nom" text NOT NULL,
	"nom_court" text,
	"ville" text,
	"est_le_club" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisme_code_ffbb_unique" UNIQUE("code_ffbb")
);
--> statement-breakpoint
CREATE TABLE "poule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"code_ffbb" text,
	"nom" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poule_competition_nom_unique" UNIQUE("competition_id","nom"),
	CONSTRAINT "poule_id_competition_unique" UNIQUE("id","competition_id")
);
--> statement-breakpoint
CREATE TABLE "saison" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"libelle" text NOT NULL,
	"code_ffbb" text,
	"debut_le" date NOT NULL,
	"fin_le" date NOT NULL,
	"est_courante" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saison_code_unique" UNIQUE("code"),
	CONSTRAINT "saison_code_ffbb_unique" UNIQUE("code_ffbb"),
	CONSTRAINT "saison_periode_coherente" CHECK ("saison"."fin_le" > "saison"."debut_le")
);
--> statement-breakpoint
CREATE TABLE "salle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_ffbb" text,
	"nom" text NOT NULL,
	"adresse" text,
	"code_postal" text,
	"ville" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salle_code_ffbb_unique" UNIQUE("code_ffbb"),
	CONSTRAINT "salle_nom_ville_unique" UNIQUE("nom","ville"),
	CONSTRAINT "salle_coordonnees_ensemble" CHECK (("salle"."latitude" is null) = ("salle"."longitude" is null)),
	CONSTRAINT "salle_latitude_valide" CHECK ("salle"."latitude" is null or ("salle"."latitude" between -90 and 90)),
	CONSTRAINT "salle_longitude_valide" CHECK ("salle"."longitude" is null or ("salle"."longitude" between -180 and 180))
);
--> statement-breakpoint
CREATE TABLE "engagement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipe_id" uuid NOT NULL,
	"saison_id" uuid NOT NULL,
	"competition_id" uuid NOT NULL,
	"poule_id" uuid,
	"libelles_ffbb" text[] DEFAULT '{}'::text[] NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engagement_equipe_saison_competition_unique" UNIQUE("equipe_id","saison_id","competition_id")
);
--> statement-breakpoint
CREATE TABLE "equipe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nom" text NOT NULL,
	"categorie" text NOT NULL,
	"sexe" "sexe_equipe" NOT NULL,
	"ordre" smallint DEFAULT 0 NOT NULL,
	"photo_url" text,
	"photo_alt" text,
	"creneaux_md" text,
	"description_md" text,
	"affiche_publiquement" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_slug_unique" UNIQUE("slug"),
	CONSTRAINT "equipe_photo_alt_obligatoire" CHECK ("equipe"."photo_url" is null or ("equipe"."photo_alt" is not null and btrim("equipe"."photo_alt") <> '')),
	CONSTRAINT "equipe_ordre_positif" CHECK ("equipe"."ordre" >= 0)
);
--> statement-breakpoint
CREATE TABLE "joueur" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom_affiche" text NOT NULL,
	"prenom" text,
	"nom" text,
	"numero" smallint,
	"visible_publiquement" boolean DEFAULT false NOT NULL,
	"photo_url" text,
	"photo_alt" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "joueur_numero_valide" CHECK ("joueur"."numero" is null or ("joueur"."numero" between 0 and 99)),
	CONSTRAINT "joueur_photo_alt_obligatoire" CHECK ("joueur"."photo_url" is null or ("joueur"."photo_alt" is not null and btrim("joueur"."photo_alt") <> '')),
	CONSTRAINT "joueur_nom_affiche_non_vide" CHECK (btrim("joueur"."nom_affiche") <> '')
);
--> statement-breakpoint
CREATE TABLE "joueur_equipe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"joueur_id" uuid NOT NULL,
	"equipe_id" uuid NOT NULL,
	"saison_id" uuid NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "joueur_equipe_unique" UNIQUE("joueur_id","equipe_id","saison_id")
);
--> statement-breakpoint
CREATE TABLE "rencontre" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_ffbb" text,
	"cle_naturelle" text NOT NULL,
	"slug" text NOT NULL,
	"saison_id" uuid NOT NULL,
	"competition_id" uuid,
	"poule_id" uuid,
	"equipe_id" uuid,
	"organisme_domicile_id" uuid,
	"organisme_exterieur_id" uuid,
	"nom_equipe_domicile_ffbb" text,
	"nom_equipe_exterieur_ffbb" text,
	"salle_id" uuid,
	"date_heure" timestamp with time zone NOT NULL,
	"heure_confirmee" boolean DEFAULT true NOT NULL,
	"numero" text,
	"journee" smallint,
	"statut" "statut_rencontre" DEFAULT 'a_venir' NOT NULL,
	"score_domicile" smallint,
	"score_exterieur" smallint,
	"forfait_domicile" boolean DEFAULT false NOT NULL,
	"forfait_exterieur" boolean DEFAULT false NOT NULL,
	"source" "source_donnee" DEFAULT 'ffbb' NOT NULL,
	"empreinte_ffbb" text,
	"vu_dans_ffbb_le" timestamp with time zone,
	"disparue_de_ffbb_le" timestamp with time zone,
	"champs_verrouilles" text[] DEFAULT '{}'::text[] NOT NULL,
	"resume_md" text,
	"affiche_publiquement" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rencontre_id_ffbb_unique" UNIQUE("id_ffbb"),
	CONSTRAINT "rencontre_cle_naturelle_unique" UNIQUE("cle_naturelle"),
	CONSTRAINT "rencontre_slug_unique" UNIQUE("slug"),
	CONSTRAINT "rencontre_scores_ensemble" CHECK (("rencontre"."score_domicile" is null) = ("rencontre"."score_exterieur" is null)),
	CONSTRAINT "rencontre_joue_avec_score" CHECK ("rencontre"."statut" <> 'joue' or "rencontre"."score_domicile" is not null),
	CONSTRAINT "rencontre_score_domicile_positif" CHECK ("rencontre"."score_domicile" is null or "rencontre"."score_domicile" >= 0),
	CONSTRAINT "rencontre_score_exterieur_positif" CHECK ("rencontre"."score_exterieur" is null or "rencontre"."score_exterieur" >= 0),
	CONSTRAINT "rencontre_equipes_distinctes" CHECK ("rencontre"."organisme_domicile_id" is distinct from "rencontre"."organisme_exterieur_id" or "rencontre"."nom_equipe_domicile_ffbb" is distinct from "rencontre"."nom_equipe_exterieur_ffbb"),
	CONSTRAINT "rencontre_organisme_connu" CHECK ("rencontre"."organisme_domicile_id" is not null or "rencontre"."organisme_exterieur_id" is not null),
	CONSTRAINT "rencontre_cle_naturelle_non_vide" CHECK (btrim("rencontre"."cle_naturelle") <> ''),
	CONSTRAINT "rencontre_score_manquant_sans_score" CHECK ("rencontre"."statut" <> 'score_manquant' or "rencontre"."score_domicile" is null),
	CONSTRAINT "rencontre_forfait_declare" CHECK ("rencontre"."statut" <> 'forfait' or "rencontre"."forfait_domicile" or "rencontre"."forfait_exterieur"),
	CONSTRAINT "rencontre_poule_implique_competition" CHECK ("rencontre"."poule_id" is null or "rencontre"."competition_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "statistique_joueur" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rencontre_id" uuid NOT NULL,
	"joueur_id" uuid NOT NULL,
	"a_joue" boolean NOT NULL,
	"points" smallint,
	"saisi_par" uuid,
	"saisi_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "statistique_joueur_rencontre_joueur_unique" UNIQUE("rencontre_id","joueur_id"),
	CONSTRAINT "statistique_joueur_points_positifs" CHECK ("statistique_joueur"."points" is null or "statistique_joueur"."points" >= 0),
	CONSTRAINT "statistique_joueur_absent_sans_points" CHECK ("statistique_joueur"."a_joue" or "statistique_joueur"."points" is null)
);
--> statement-breakpoint
CREATE TABLE "article" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"titre" text NOT NULL,
	"chapo" text,
	"corps_md" text NOT NULL,
	"categorie_id" uuid,
	"auteur_id" uuid,
	"statut" "statut_article" DEFAULT 'brouillon' NOT NULL,
	"publie_le" timestamp with time zone,
	"image_couverture_url" text,
	"image_couverture_alt" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_slug_unique" UNIQUE("slug"),
	CONSTRAINT "article_publie_avec_date" CHECK ("article"."statut" <> 'publie' or "article"."publie_le" is not null),
	CONSTRAINT "article_image_alt_obligatoire" CHECK ("article"."image_couverture_url" is null or ("article"."image_couverture_alt" is not null and btrim("article"."image_couverture_alt") <> '')),
	CONSTRAINT "article_titre_non_vide" CHECK (btrim("article"."titre") <> ''),
	CONSTRAINT "article_slug_non_vide" CHECK (btrim("article"."slug") <> '')
);
--> statement-breakpoint
CREATE TABLE "categorie_article" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"ordre" smallint DEFAULT 0 NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorie_article_slug_unique" UNIQUE("slug"),
	CONSTRAINT "categorie_article_nom_unique" UNIQUE("nom"),
	CONSTRAINT "categorie_article_ordre_positif" CHECK ("categorie_article"."ordre" >= 0),
	CONSTRAINT "categorie_article_slug_non_vide" CHECK (btrim("categorie_article"."slug") <> '')
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"chemin" text NOT NULL,
	"nom_fichier" text NOT NULL,
	"type_mime" text NOT NULL,
	"taille_octets" integer NOT NULL,
	"largeur" smallint,
	"hauteur" smallint,
	"texte_alternatif" text NOT NULL,
	"televerse_par" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_url_unique" UNIQUE("url"),
	CONSTRAINT "media_chemin_unique" UNIQUE("chemin"),
	CONSTRAINT "media_texte_alternatif_non_vide" CHECK (btrim("media"."texte_alternatif") <> ''),
	CONSTRAINT "media_taille_valide" CHECK ("media"."taille_octets" > 0 and "media"."taille_octets" <= 5242880),
	CONSTRAINT "media_type_mime_autorise" CHECK ("media"."type_mime" in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
	CONSTRAINT "media_dimensions_ensemble" CHECK (("media"."largeur" is null) = ("media"."hauteur" is null))
);
--> statement-breakpoint
CREATE TABLE "parametre" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cle" text NOT NULL,
	"valeur" text NOT NULL,
	"description" text,
	"expire_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parametre_cle_unique" UNIQUE("cle"),
	CONSTRAINT "parametre_cle_non_vide" CHECK (btrim("parametre"."cle") <> '')
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"jeton_hash" text NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"derniere_activite_le" timestamp with time zone DEFAULT now() NOT NULL,
	"revoquee_le" timestamp with time zone,
	"adresse_ip" text,
	"agent_utilisateur" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_jeton_hash_unique" UNIQUE("jeton_hash"),
	CONSTRAINT "session_expiration_posterieure" CHECK ("session"."expire_le" > "session"."cree_le")
);
--> statement-breakpoint
CREATE TABLE "tentative_connexion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_saisi" text NOT NULL,
	"adresse_ip" text NOT NULL,
	"reussie" boolean NOT NULL,
	"tentee_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utilisateur" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nom_affiche" text NOT NULL,
	"mot_de_passe_hash" text NOT NULL,
	"role" "role_utilisateur" DEFAULT 'redacteur' NOT NULL,
	"est_actif" boolean DEFAULT true NOT NULL,
	"derniere_connexion_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "utilisateur_email_plausible" CHECK ("utilisateur"."email" = btrim("utilisateur"."email") and position('@' in "utilisateur"."email") > 1),
	CONSTRAINT "utilisateur_nom_affiche_non_vide" CHECK (btrim("utilisateur"."nom_affiche") <> ''),
	CONSTRAINT "utilisateur_hash_non_vide" CHECK (btrim("utilisateur"."mot_de_passe_hash") <> '')
);
--> statement-breakpoint
CREATE TABLE "conflit_synchronisation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rencontre_id" uuid NOT NULL,
	"champ" text NOT NULL,
	"valeur_locale" text,
	"valeur_ffbb" text,
	"journal_id" uuid,
	"detecte_le" timestamp with time zone DEFAULT now() NOT NULL,
	"resolu_le" timestamp with time zone,
	"resolu_par_id" uuid,
	"resolution" "resolution_conflit",
	CONSTRAINT "conflit_resolution_coherente" CHECK (("conflit_synchronisation"."resolu_le" is null) = ("conflit_synchronisation"."resolution" is null)),
	CONSTRAINT "conflit_valeurs_differentes" CHECK ("conflit_synchronisation"."valeur_locale" is distinct from "conflit_synchronisation"."valeur_ffbb"),
	CONSTRAINT "conflit_champ_non_vide" CHECK (btrim("conflit_synchronisation"."champ") <> '')
);
--> statement-breakpoint
CREATE TABLE "journal_synchronisation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"declencheur" "declencheur_synchronisation" NOT NULL,
	"declenchee_par_id" uuid,
	"statut" "statut_synchronisation" NOT NULL,
	"demarree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"terminee_le" timestamp with time zone,
	"duree_ms" integer,
	"nb_lues" integer DEFAULT 0 NOT NULL,
	"nb_creees" integer DEFAULT 0 NOT NULL,
	"nb_mises_a_jour" integer DEFAULT 0 NOT NULL,
	"nb_inchangees" integer DEFAULT 0 NOT NULL,
	"nb_invalides" integer DEFAULT 0 NOT NULL,
	"nb_disparues" integer DEFAULT 0 NOT NULL,
	"message_erreur" text,
	CONSTRAINT "journal_echec_avec_message" CHECK ("journal_synchronisation"."statut" <> 'echec' or "journal_synchronisation"."message_erreur" is not null),
	CONSTRAINT "journal_fin_posterieure" CHECK ("journal_synchronisation"."terminee_le" is null or "journal_synchronisation"."terminee_le" >= "journal_synchronisation"."demarree_le"),
	CONSTRAINT "journal_duree_avec_fin" CHECK (("journal_synchronisation"."terminee_le" is null) = ("journal_synchronisation"."duree_ms" is null)),
	CONSTRAINT "journal_compteurs_positifs" CHECK ("journal_synchronisation"."nb_lues" >= 0 and "journal_synchronisation"."nb_creees" >= 0 and "journal_synchronisation"."nb_mises_a_jour" >= 0 and "journal_synchronisation"."nb_inchangees" >= 0 and "journal_synchronisation"."nb_invalides" >= 0 and "journal_synchronisation"."nb_disparues" >= 0),
	CONSTRAINT "journal_duree_positive" CHECK ("journal_synchronisation"."duree_ms" is null or "journal_synchronisation"."duree_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_saison_id_saison_id_fk" FOREIGN KEY ("saison_id") REFERENCES "public"."saison"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poule" ADD CONSTRAINT "poule_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_equipe_id_equipe_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipe"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_saison_id_saison_id_fk" FOREIGN KEY ("saison_id") REFERENCES "public"."saison"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_competition_saison_fk" FOREIGN KEY ("competition_id","saison_id") REFERENCES "public"."competition"("id","saison_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_poule_competition_fk" FOREIGN KEY ("poule_id","competition_id") REFERENCES "public"."poule"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joueur_equipe" ADD CONSTRAINT "joueur_equipe_joueur_id_joueur_id_fk" FOREIGN KEY ("joueur_id") REFERENCES "public"."joueur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joueur_equipe" ADD CONSTRAINT "joueur_equipe_equipe_id_equipe_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipe"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joueur_equipe" ADD CONSTRAINT "joueur_equipe_saison_id_saison_id_fk" FOREIGN KEY ("saison_id") REFERENCES "public"."saison"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rencontre" ADD CONSTRAINT "rencontre_saison_id_saison_id_fk" FOREIGN KEY ("saison_id") REFERENCES "public"."saison"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rencontre" ADD CONSTRAINT "rencontre_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rencontre" ADD CONSTRAINT "rencontre_equipe_id_equipe_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipe"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rencontre" ADD CONSTRAINT "rencontre_organisme_domicile_id_organisme_id_fk" FOREIGN KEY ("organisme_domicile_id") REFERENCES "public"."organisme"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rencontre" ADD CONSTRAINT "rencontre_organisme_exterieur_id_organisme_id_fk" FOREIGN KEY ("organisme_exterieur_id") REFERENCES "public"."organisme"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rencontre" ADD CONSTRAINT "rencontre_salle_id_salle_id_fk" FOREIGN KEY ("salle_id") REFERENCES "public"."salle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rencontre" ADD CONSTRAINT "rencontre_poule_competition_fk" FOREIGN KEY ("poule_id","competition_id") REFERENCES "public"."poule"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rencontre" ADD CONSTRAINT "rencontre_competition_saison_fk" FOREIGN KEY ("competition_id","saison_id") REFERENCES "public"."competition"("id","saison_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistique_joueur" ADD CONSTRAINT "statistique_joueur_rencontre_id_rencontre_id_fk" FOREIGN KEY ("rencontre_id") REFERENCES "public"."rencontre"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistique_joueur" ADD CONSTRAINT "statistique_joueur_joueur_id_joueur_id_fk" FOREIGN KEY ("joueur_id") REFERENCES "public"."joueur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statistique_joueur" ADD CONSTRAINT "statistique_joueur_saisi_par_utilisateur_id_fk" FOREIGN KEY ("saisi_par") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_categorie_id_categorie_article_id_fk" FOREIGN KEY ("categorie_id") REFERENCES "public"."categorie_article"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_auteur_id_utilisateur_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_televerse_par_utilisateur_id_fk" FOREIGN KEY ("televerse_par") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflit_synchronisation" ADD CONSTRAINT "conflit_synchronisation_rencontre_id_rencontre_id_fk" FOREIGN KEY ("rencontre_id") REFERENCES "public"."rencontre"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflit_synchronisation" ADD CONSTRAINT "conflit_synchronisation_journal_id_journal_synchronisation_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journal_synchronisation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflit_synchronisation" ADD CONSTRAINT "conflit_synchronisation_resolu_par_id_utilisateur_id_fk" FOREIGN KEY ("resolu_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_synchronisation" ADD CONSTRAINT "journal_synchronisation_declenchee_par_id_utilisateur_id_fk" FOREIGN KEY ("declenchee_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_saison_code_ffbb_unique" ON "competition" USING btree ("saison_id","code_ffbb") WHERE "competition"."code_ffbb" is not null;--> statement-breakpoint
CREATE INDEX "competition_saison_idx" ON "competition" USING btree ("saison_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organisme_un_seul_club" ON "organisme" USING btree ("est_le_club") WHERE "organisme"."est_le_club";--> statement-breakpoint
CREATE UNIQUE INDEX "poule_competition_code_ffbb_unique" ON "poule" USING btree ("competition_id","code_ffbb") WHERE "poule"."code_ffbb" is not null;--> statement-breakpoint
CREATE INDEX "poule_competition_idx" ON "poule" USING btree ("competition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saison_une_seule_courante" ON "saison" USING btree ("est_courante") WHERE "saison"."est_courante";--> statement-breakpoint
CREATE INDEX "engagement_saison_idx" ON "engagement" USING btree ("saison_id");--> statement-breakpoint
CREATE INDEX "engagement_equipe_idx" ON "engagement" USING btree ("equipe_id");--> statement-breakpoint
CREATE INDEX "equipe_ordre_idx" ON "equipe" USING btree ("ordre");--> statement-breakpoint
CREATE INDEX "joueur_visible_idx" ON "joueur" USING btree ("visible_publiquement");--> statement-breakpoint
CREATE INDEX "joueur_equipe_equipe_saison_idx" ON "joueur_equipe" USING btree ("equipe_id","saison_id");--> statement-breakpoint
CREATE INDEX "rencontre_saison_date_idx" ON "rencontre" USING btree ("saison_id","date_heure" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "rencontre_equipe_date_idx" ON "rencontre" USING btree ("equipe_id","date_heure" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "rencontre_competition_date_idx" ON "rencontre" USING btree ("competition_id","date_heure" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "rencontre_statut_date_idx" ON "rencontre" USING btree ("statut","date_heure" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "rencontre_disparues_idx" ON "rencontre" USING btree ("disparue_de_ffbb_le" DESC NULLS LAST) WHERE "rencontre"."disparue_de_ffbb_le" is not null;--> statement-breakpoint
CREATE INDEX "statistique_joueur_joueur_idx" ON "statistique_joueur" USING btree ("joueur_id");--> statement-breakpoint
CREATE INDEX "article_statut_publie_le_idx" ON "article" USING btree ("statut","publie_le" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "article_categorie_idx" ON "article" USING btree ("categorie_id");--> statement-breakpoint
CREATE INDEX "media_cree_le_idx" ON "media" USING btree ("cree_le" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "session_expire_le_idx" ON "session" USING btree ("expire_le");--> statement-breakpoint
CREATE INDEX "session_utilisateur_idx" ON "session" USING btree ("utilisateur_id");--> statement-breakpoint
CREATE INDEX "tentative_connexion_email_idx" ON "tentative_connexion" USING btree (lower("email_saisi"),"tentee_le" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tentative_connexion_ip_idx" ON "tentative_connexion" USING btree ("adresse_ip","tentee_le" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "utilisateur_email_unique" ON "utilisateur" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "conflit_synchronisation_ouvert_unique" ON "conflit_synchronisation" USING btree ("rencontre_id","champ") WHERE "conflit_synchronisation"."resolu_le" is null;--> statement-breakpoint
CREATE INDEX "conflit_synchronisation_ouverts_idx" ON "conflit_synchronisation" USING btree ("detecte_le" DESC NULLS LAST) WHERE "conflit_synchronisation"."resolu_le" is null;--> statement-breakpoint
CREATE INDEX "conflit_synchronisation_rencontre_idx" ON "conflit_synchronisation" USING btree ("rencontre_id");--> statement-breakpoint
CREATE INDEX "journal_synchronisation_demarree_le_idx" ON "journal_synchronisation" USING btree ("demarree_le" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "journal_synchronisation_statut_idx" ON "journal_synchronisation" USING btree ("statut","demarree_le" DESC NULLS LAST);