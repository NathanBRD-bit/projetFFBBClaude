import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { creerBaseDeTest, type BaseDeTest } from "./aide-base";

/**
 * La migration initiale doit s'appliquer **de zéro sur une base vierge**. PGlite en
 * crée une neuve à chaque exécution : si `drizzle/0000_*.sql` était incohérent, ce
 * fichier serait le premier à rougir.
 */
describe("migration initiale", () => {
  let contexte: BaseDeTest;

  beforeAll(async () => {
    contexte = await creerBaseDeTest();
  });

  afterAll(async () => {
    await contexte.fermer();
  });

  it("s'applique sur une base vierge et crée les 20 tables du modèle", async () => {
    const resultat = await contexte.client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    const tables = resultat.rows.map((ligne) => ligne.table_name);

    expect(tables).toEqual([
      "article",
      "categorie_article",
      "competition",
      "conflit_synchronisation",
      "engagement",
      "equipe",
      "joueur",
      "joueur_equipe",
      "journal_synchronisation",
      "media",
      "organisme",
      "parametre",
      "poule",
      "rencontre",
      "saison",
      "salle",
      "session",
      "statistique_joueur",
      "tentative_connexion",
      "utilisateur",
    ]);
  });

  it("crée toutes les contraintes `check` attendues", async () => {
    const resultat = await contexte.client.query<{ conname: string }>(
      `select conname from pg_constraint
         join pg_class on pg_class.oid = pg_constraint.conrelid
         join pg_namespace on pg_namespace.oid = pg_class.relnamespace
        where contype = 'c' and nspname = 'public'
        order by conname`,
    );
    const contraintes = resultat.rows.map((ligne) => ligne.conname);

    // Les garde-fous nommés dans le plan, un par un. Un `check` renommé ou disparu
    // doit casser ce test, pas passer en silence.
    expect(contraintes).toEqual(
      expect.arrayContaining([
        "rencontre_scores_ensemble",
        "rencontre_joue_avec_score",
        "rencontre_score_domicile_positif",
        "rencontre_score_exterieur_positif",
        "rencontre_equipes_distinctes",
        "rencontre_organisme_connu",
        "article_publie_avec_date",
        "article_image_alt_obligatoire",
        "statistique_joueur_points_positifs",
        "statistique_joueur_absent_sans_points",
        "conflit_resolution_coherente",
        "journal_echec_avec_message",
        "salle_coordonnees_ensemble",
        "utilisateur_email_plausible",
        "session_expiration_posterieure",
      ]),
    );
  });

  it("crée les index uniques partiels qui portent les règles d'unicité conditionnelle", async () => {
    const resultat = await contexte.client.query<{ indexname: string; indexdef: string }>(
      "select indexname, indexdef from pg_indexes where schemaname = 'public' order by indexname",
    );
    const parNom = new Map(resultat.rows.map((ligne) => [ligne.indexname, ligne.indexdef]));

    expect(parNom.get("saison_une_seule_courante")).toContain("WHERE");
    expect(parNom.get("saison_une_seule_courante")).toContain("UNIQUE");
    expect(parNom.get("conflit_synchronisation_ouvert_unique")).toContain("resolu_le IS NULL");
    // Unicité d'email insensible à la casse : l'index porte bien sur `lower(email)`.
    expect(parNom.get("utilisateur_email_unique")).toContain("lower(email)");
  });

  it("crée les index de lecture attendus sur les rencontres et les articles", async () => {
    const resultat = await contexte.client.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname = 'public'",
    );
    const index = resultat.rows.map((ligne) => ligne.indexname);

    expect(index).toEqual(
      expect.arrayContaining([
        "rencontre_saison_date_idx",
        "rencontre_equipe_date_idx",
        "rencontre_statut_date_idx",
        "article_statut_publie_le_idx",
        "session_expire_le_idx",
      ]),
    );
  });

  it("laisse la base sans aucune donnée métier après migration", async () => {
    const resultat = await contexte.client.query<{ nb: number }>(
      "select count(*)::int as nb from rencontre",
    );

    expect(resultat.rows[0]?.nb).toBe(0);
  });
});
