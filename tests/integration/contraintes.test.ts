import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { IDENTIFIANTS_SEMIS, semer } from "../../scripts/semer";
import {
  article,
  conflitSynchronisation,
  journalSynchronisation,
  media,
  rencontre,
  saison,
  salle,
  session,
  statistiqueJoueur,
  utilisateur,
} from "@/infrastructure/bdd/schema";

import { capturerRefus, creerBaseDeTest, type BaseDeTest } from "./aide-base";

/**
 * **Le cœur de la tâche.** Un schéma dont les garde-fous ne sont pas prouvés n'est pas
 * livré : chaque contrainte est ici démontrée par une insertion illégale dont on
 * vérifie qu'elle est **rejetée par Postgres**, et que c'est bien *la bonne* contrainte
 * qui a mordu.
 *
 * Toutes les écritures de ce fichier sont censées échouer : elles ne laissent donc
 * aucune trace et ne peuvent pas polluer les autres tests.
 */
describe("garde-fous du schéma", () => {
  let contexte: BaseDeTest;

  beforeAll(async () => {
    contexte = await creerBaseDeTest();
    await semer(contexte.base);
  });

  afterAll(async () => {
    await contexte.fermer();
  });

  /** Gabarit de rencontre valide ; chaque test n'en altère que ce qu'il veut casser. */
  function rencontreValide(surcharge: Partial<typeof rencontre.$inferInsert> = {}) {
    return {
      cleNaturelle: `test|${crypto.randomUUID()}`,
      slug: `test-${crypto.randomUUID()}`,
      saisonId: IDENTIFIANTS_SEMIS.saisonCourante,
      competitionId: IDENTIFIANTS_SEMIS.competitionU11Courante,
      pouleId: IDENTIFIANTS_SEMIS.pouleU11Courante,
      organismeDomicileId: IDENTIFIANTS_SEMIS.club,
      organismeExterieurId: IDENTIFIANTS_SEMIS.organismeChaze,
      dateHeure: new Date("2027-01-16T14:00:00+01:00"),
      ...surcharge,
    } satisfies typeof rencontre.$inferInsert;
  }

  describe("rencontre", () => {
    it("refuse un score négatif côté domicile", async () => {
      const message = await capturerRefus(() =>
        contexte.base
          .insert(rencontre)
          .values(rencontreValide({ scoreDomicile: -1, scoreExterieur: 10 })),
      );

      expect(message).toContain("rencontre_score_domicile_positif");
    });

    it("refuse un score négatif côté extérieur", async () => {
      const message = await capturerRefus(() =>
        contexte.base
          .insert(rencontre)
          .values(rencontreValide({ scoreDomicile: 10, scoreExterieur: -5 })),
      );

      expect(message).toContain("rencontre_score_exterieur_positif");
    });

    it("refuse un match déclaré joué sans score", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(rencontre).values(
          rencontreValide({
            statut: "joue",
            scoreDomicile: null,
            scoreExterieur: null,
          }),
        ),
      );

      expect(message).toContain("rencontre_joue_avec_score");
    });

    it("refuse un seul des deux scores renseigné", async () => {
      const message = await capturerRefus(() =>
        contexte.base
          .insert(rencontre)
          .values(rencontreValide({ scoreDomicile: 42, scoreExterieur: null })),
      );

      expect(message).toContain("rencontre_scores_ensemble");
    });

    it("refuse une rencontre strictement identique des deux côtés", async () => {
      // Même club ET même libellé d'équipe : c'est une erreur de rapprochement,
      // pas un match.
      const message = await capturerRefus(() =>
        contexte.base.insert(rencontre).values(
          rencontreValide({
            organismeDomicileId: IDENTIFIANTS_SEMIS.club,
            organismeExterieurId: IDENTIFIANTS_SEMIS.club,
            nomEquipeDomicileFfbb: "SO CANDE LOIRE BASKET - 1",
            nomEquipeExterieurFfbb: "SO CANDE LOIRE BASKET - 1",
          }),
        ),
      );

      expect(message).toContain("rencontre_equipes_distinctes");
    });

    it("refuse deux libellés nuls sur le même club, traités comme identiques", async () => {
      // `is distinct from` et non `<>` : sans lui, deux libellés nuls seraient
      // « incomparables » et la contrainte laisserait passer le doublon.
      const message = await capturerRefus(() =>
        contexte.base.insert(rencontre).values(
          rencontreValide({
            organismeDomicileId: IDENTIFIANTS_SEMIS.club,
            organismeExterieurId: IDENTIFIANTS_SEMIS.club,
            nomEquipeDomicileFfbb: null,
            nomEquipeExterieurFfbb: null,
          }),
        ),
      );

      expect(message).toContain("rencontre_equipes_distinctes");
    });

    it("accepte un derby entre deux équipes du même club", async () => {
      // Cas réel : 4 rencontres sur 3 000 dans l'index FFBB opposent deux équipes
      // d'un même club, et le SOCL en jouera. La contrainte d'origine, qui
      // comparait les organismes, aurait fait échouer la synchronisation dessus.
      const ligne = rencontreValide({
        organismeDomicileId: IDENTIFIANTS_SEMIS.club,
        organismeExterieurId: IDENTIFIANTS_SEMIS.club,
        nomEquipeDomicileFfbb: "SO CANDE LOIRE BASKET - 1",
        nomEquipeExterieurFfbb: "SO CANDE LOIRE BASKET - 2",
      });
      await contexte.base.insert(rencontre).values(ligne);
      await contexte.base.delete(rencontre).where(eq(rencontre.slug, ligne.slug));
    });

    it("accepte une rencontre dont la FFBB ne publie pas l'organisme recevant", async () => {
      // Constat de review : les deux colonnes étaient `not null`, alors que 187
      // documents sur 5 000 n'ont qu'un seul organisme publié (plateau
      // « ENT- QUALIFICATION », équipe pas encore engagée). Ces rencontres
      // échouaient à l'écriture, donc disparaissaient du site.
      const ligne = rencontreValide({
        organismeDomicileId: null,
        nomEquipeDomicileFfbb: "ENT- QUALIFICATION",
        nomEquipeExterieurFfbb: "SO CANDE LOIRE BASKET - 1",
      });
      await contexte.base.insert(rencontre).values(ligne);
      await contexte.base.delete(rencontre).where(eq(rencontre.slug, ligne.slug));
    });

    it("refuse une rencontre dont aucun des deux organismes n'est connu", async () => {
      // Nullable ne veut pas dire « sans identité » : sans un seul organisme, la
      // rencontre n'est rattachable à personne et n'a rien à faire en base.
      const message = await capturerRefus(() =>
        contexte.base.insert(rencontre).values(
          // Deux libellés distincts : sans cela, la ligne violerait aussi
          // `rencontre_equipes_distinctes` et le message ne dirait pas laquelle
          // des deux contraintes a mordu.
          rencontreValide({
            organismeDomicileId: null,
            organismeExterieurId: null,
            nomEquipeDomicileFfbb: "ENT- QUALIFICATION",
            nomEquipeExterieurFfbb: "SO CANDE LOIRE BASKET - 1",
          }),
        ),
      );

      expect(message).toContain("rencontre_organisme_connu");
    });

    it("refuse un doublon d'identifiant FFBB", async () => {
      const message = await capturerRefus(() =>
        contexte.base
          .insert(rencontre)
          // L'identifiant du match du 19/09/2026, déjà présent : c'est cette unicité
          // qui rend la synchronisation idempotente.
          .values(rencontreValide({ idFfbb: "FFBB-2627-U11M-0001" })),
      );

      expect(message).toContain("rencontre_id_ffbb_unique");
    });

    it("refuse un doublon de clé naturelle", async () => {
      const message = await capturerRefus(() =>
        contexte.base
          .insert(rencontre)
          .values(rencontreValide({ cleNaturelle: "26-27|D1U11M|CHAZE|CANDE|2026-09-19" })),
      );

      expect(message).toContain("rencontre_cle_naturelle_unique");
    });

    it("refuse une clé naturelle vide", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(rencontre).values(rencontreValide({ cleNaturelle: "   " })),
      );

      expect(message).toContain("rencontre_cle_naturelle_non_vide");
    });

    it("refuse un doublon de slug", async () => {
      const message = await capturerRefus(() =>
        contexte.base
          .insert(rencontre)
          .values(rencontreValide({ slug: "2026-09-19-chaze-sur-argos-cande-u11m" })),
      );

      expect(message).toContain("rencontre_slug_unique");
    });

    it("refuse une poule qui ne relève pas de la compétition du match", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(rencontre).values(
          rencontreValide({
            competitionId: IDENTIFIANTS_SEMIS.competitionU11Courante,
            // Poule d'une autre compétition : incohérence indétectable ensuite.
            pouleId: "b0000000-0000-4000-8000-000000000005",
          }),
        ),
      );

      expect(message).toContain("rencontre_poule_competition_fk");
    });

    // --- Constats relevés en review, chacun reproduit avant d'être corrigé ---

    it("refuse une compétition qui ne relève pas de la saison du match", async () => {
      // La clé étrangère composite manquait : un match de 2025-2026 pouvait pointer
      // une compétition de 2026-2027 et se retrouver listé sous la mauvaise saison,
      // pour toujours et sans la moindre erreur.
      const message = await capturerRefus(() =>
        contexte.base.insert(rencontre).values(
          rencontreValide({
            saisonId: IDENTIFIANTS_SEMIS.saisonPrecedente,
            competitionId: IDENTIFIANTS_SEMIS.competitionU11Courante,
            pouleId: IDENTIFIANTS_SEMIS.pouleU11Courante,
          }),
        ),
      );

      expect(message).toContain("rencontre_competition_saison_fk");
    });

    it("refuse une poule sans compétition, que la clé composite laissait passer", async () => {
      // MATCH SIMPLE : dès qu'une colonne du couple est nulle, la clé étrangère ne
      // contrôle plus rien. Une poule inexistante passait donc sans compétition.
      const message = await capturerRefus(() =>
        contexte.base.insert(rencontre).values(
          rencontreValide({
            competitionId: null,
            pouleId: "ffffffff-0000-4000-8000-000000009999",
          }),
        ),
      );

      expect(message).toContain("rencontre_poule_implique_competition");
    });

    it("refuse un forfait dont aucune équipe n'est déclarée forfait", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(rencontre).values(
          rencontreValide({
            statut: "forfait",
            scoreDomicile: 20,
            scoreExterieur: 0,
            forfaitDomicile: false,
            forfaitExterieur: false,
          }),
        ),
      );

      expect(message).toContain("rencontre_forfait_declare");
    });

    it("refuse un match en `score_manquant` qui porte malgré tout un score", async () => {
      // Le statut nomme une absence : lui adjoindre un score est une contradiction.
      const message = await capturerRefus(() =>
        contexte.base.insert(rencontre).values(
          rencontreValide({
            statut: "score_manquant",
            scoreDomicile: 58,
            scoreExterieur: 42,
          }),
        ),
      );

      expect(message).toContain("rencontre_score_manquant_sans_score");
    });

    it("accepte un match joué dont la feuille n'a pas été remontée", async () => {
      // La contre-épreuve : le cas réel que ce statut existe pour représenter doit,
      // lui, passer sans difficulté. C'est la seule écriture réussie de ce fichier,
      // donc la seule à devoir nettoyer derrière elle — le test suivant vérifie
      // qu'aucune ligne parasite ne subsiste.
      const ligne = rencontreValide({
        statut: "score_manquant",
        scoreDomicile: null,
        scoreExterieur: null,
      });
      await contexte.base.insert(rencontre).values(ligne);
      await contexte.base.delete(rencontre).where(eq(rencontre.slug, ligne.slug));
    });
  });

  describe("saison", () => {
    it("refuse une deuxième saison courante", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(saison).values({
          code: "27-28",
          libelle: "Saison 2027-2028",
          debutLe: "2027-09-01",
          finLe: "2028-06-30",
          estCourante: true,
        }),
      );

      expect(message).toContain("saison_une_seule_courante");
    });

    it("accepte une nouvelle saison tant qu'elle n'est pas déclarée courante", async () => {
      // Contre-épreuve : la contrainte est *partielle*, elle ne doit pas bloquer
      // l'ajout normal d'une saison.
      await contexte.base.insert(saison).values({
        id: "5a150000-0000-4000-8000-000000002728",
        code: "27-28",
        libelle: "Saison 2027-2028",
        debutLe: "2027-09-01",
        finLe: "2028-06-30",
        estCourante: false,
      });

      const restantes = await contexte.base.select({ code: saison.code }).from(saison);
      expect(restantes.map((s) => s.code)).toContain("27-28");

      await contexte.base
        .delete(saison)
        .where(eq(saison.id, "5a150000-0000-4000-8000-000000002728"));
    });

    it("refuse une saison qui se termine avant de commencer", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(saison).values({
          code: "99-00",
          libelle: "Saison impossible",
          debutLe: "2099-09-01",
          finLe: "2099-08-31",
          estCourante: false,
        }),
      );

      expect(message).toContain("saison_periode_coherente");
    });
  });

  describe("article", () => {
    const articleValide = (surcharge: Partial<typeof article.$inferInsert> = {}) =>
      ({
        slug: `test-${crypto.randomUUID()}`,
        titre: "Article de test",
        corpsMd: "Corps de test.",
        ...surcharge,
      }) satisfies typeof article.$inferInsert;

    it("refuse un article publié sans date de publication", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(article).values(articleValide({ statut: "publie", publieLe: null })),
      );

      expect(message).toContain("article_publie_avec_date");
    });

    it("refuse une image de couverture sans texte alternatif", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(article).values(
          articleValide({
            imageCouvertureUrl: "https://exemple.invalid/photo.jpg",
            imageCouvertureAlt: null,
          }),
        ),
      );

      expect(message).toContain("article_image_alt_obligatoire");
    });

    it("refuse un texte alternatif vide, aussi inaccessible qu'un alt absent", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(article).values(
          articleValide({
            imageCouvertureUrl: "https://exemple.invalid/photo.jpg",
            imageCouvertureAlt: "   ",
          }),
        ),
      );

      expect(message).toContain("article_image_alt_obligatoire");
    });

    it("refuse un doublon de slug", async () => {
      const message = await capturerRefus(() =>
        contexte.base
          .insert(article)
          .values(articleValide({ slug: "reprise-des-entrainements-2026-2027" })),
      );

      expect(message).toContain("article_slug_unique");
    });
  });

  describe("statistique_joueur", () => {
    it("refuse un nombre de points négatif", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(statistiqueJoueur).values({
          rencontreId: IDENTIFIANTS_SEMIS.rencontreAVenir,
          joueurId: IDENTIFIANTS_SEMIS.joueurPremier,
          aJoue: true,
          points: -3,
        }),
      );

      expect(message).toContain("statistique_joueur_points_positifs");
    });

    it("refuse deux lignes pour le même joueur sur la même rencontre", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(statistiqueJoueur).values({
          rencontreId: IDENTIFIANTS_SEMIS.rencontreJouee,
          joueurId: IDENTIFIANTS_SEMIS.joueurPremier,
          aJoue: true,
          points: 5,
        }),
      );

      expect(message).toContain("statistique_joueur_rencontre_joueur_unique");
    });

    it("refuse des points attribués à un joueur qui n'a pas joué", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(statistiqueJoueur).values({
          rencontreId: IDENTIFIANTS_SEMIS.rencontreAVenir,
          joueurId: IDENTIFIANTS_SEMIS.joueurSecond,
          aJoue: false,
          points: 12,
        }),
      );

      expect(message).toContain("statistique_joueur_absent_sans_points");
    });
  });

  describe("utilisateur", () => {
    it("refuse un email déjà pris, même écrit dans une autre casse", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(utilisateur).values({
          email: "ADMIN@SOCL-Basket.FR",
          nomAffiche: "Doublon en majuscules",
          motDePasseHash: "peu-importe",
        }),
      );

      expect(message).toContain("utilisateur_email_unique");
    });

    it("refuse un email sans arobase", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(utilisateur).values({
          email: "pas-un-email",
          nomAffiche: "Email invalide",
          motDePasseHash: "peu-importe",
        }),
      );

      expect(message).toContain("utilisateur_email_plausible");
    });

    it("refuse un email entouré d'espaces plutôt que de le corriger en silence", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(utilisateur).values({
          email: "  trainant@socl-basket.fr  ",
          nomAffiche: "Email mal nettoyé",
          motDePasseHash: "peu-importe",
        }),
      );

      expect(message).toContain("utilisateur_email_plausible");
    });
  });

  describe("session", () => {
    it("refuse un jeton de session déjà utilisé", async () => {
      const jeton = `hash-${crypto.randomUUID()}`;
      const valeurs = {
        utilisateurId: IDENTIFIANTS_SEMIS.utilisateurAdministrateur,
        jetonHash: jeton,
        expireLe: new Date("2030-01-01T00:00:00Z"),
      };
      await contexte.base.insert(session).values(valeurs);

      const message = await capturerRefus(() => contexte.base.insert(session).values(valeurs));

      expect(message).toContain("session_jeton_hash_unique");

      await contexte.base.delete(session).where(eq(session.jetonHash, jeton));
    });

    it("refuse une session déjà expirée à sa création", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(session).values({
          utilisateurId: IDENTIFIANTS_SEMIS.utilisateurAdministrateur,
          jetonHash: `hash-${crypto.randomUUID()}`,
          expireLe: new Date("2000-01-01T00:00:00Z"),
        }),
      );

      expect(message).toContain("session_expiration_posterieure");
    });
  });

  describe("conflit_synchronisation", () => {
    it("refuse un second conflit ouvert sur le même champ de la même rencontre", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(conflitSynchronisation).values({
          rencontreId: IDENTIFIANTS_SEMIS.rencontreManuelle,
          champ: "date_heure",
          valeurLocale: "autre valeur locale",
          valeurFfbb: "autre valeur ffbb",
        }),
      );

      expect(message).toContain("conflit_synchronisation_ouvert_unique");
    });

    it("accepte un nouveau conflit une fois le précédent résolu", async () => {
      // Contre-épreuve de l'unicité *partielle* : elle ne doit pas figer l'historique.
      await contexte.base
        .update(conflitSynchronisation)
        .set({ resoluLe: new Date("2026-09-15T09:00:00+02:00"), resolution: "garder_local" })
        .where(eq(conflitSynchronisation.id, "c0f10000-0000-4000-8000-000000000001"));

      const [insere] = await contexte.base
        .insert(conflitSynchronisation)
        .values({
          rencontreId: IDENTIFIANTS_SEMIS.rencontreManuelle,
          champ: "date_heure",
          valeurLocale: "valeur locale",
          valeurFfbb: "valeur ffbb",
        })
        .returning({ id: conflitSynchronisation.id });

      expect(insere?.id).toBeDefined();

      // Remise en l'état pour ne rien laisser derrière soi.
      await contexte.base
        .delete(conflitSynchronisation)
        .where(eq(conflitSynchronisation.id, insere?.id ?? ""));
      await contexte.base
        .update(conflitSynchronisation)
        .set({ resoluLe: null, resolution: null })
        .where(eq(conflitSynchronisation.id, "c0f10000-0000-4000-8000-000000000001"));
    });

    it("refuse un conflit résolu sans décision enregistrée", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(conflitSynchronisation).values({
          rencontreId: IDENTIFIANTS_SEMIS.rencontreJouee,
          champ: "score_domicile",
          valeurLocale: "58",
          valeurFfbb: "60",
          resoluLe: new Date("2026-09-15T09:00:00+02:00"),
          resolution: null,
        }),
      );

      expect(message).toContain("conflit_resolution_coherente");
    });

    it("refuse un conflit entre deux valeurs identiques", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(conflitSynchronisation).values({
          rencontreId: IDENTIFIANTS_SEMIS.rencontreJouee,
          champ: "score_domicile",
          valeurLocale: "58",
          valeurFfbb: "58",
        }),
      );

      expect(message).toContain("conflit_valeurs_differentes");
    });
  });

  describe("journal_synchronisation", () => {
    it("refuse un échec qui ne dit pas pourquoi", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(journalSynchronisation).values({
          declencheur: "manuel",
          statut: "echec",
          messageErreur: null,
        }),
      );

      expect(message).toContain("journal_echec_avec_message");
    });

    it("refuse un compteur négatif", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(journalSynchronisation).values({
          declencheur: "manuel",
          statut: "succes",
          nbCreees: -1,
        }),
      );

      expect(message).toContain("journal_compteurs_positifs");
    });
  });

  describe("salle et média", () => {
    it("refuse une salle avec une seule des deux coordonnées", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(salle).values({
          nom: "Salle à moitié géolocalisée",
          ville: "Candé",
          latitude: 47.57,
          longitude: null,
        }),
      );

      expect(message).toContain("salle_coordonnees_ensemble");
    });

    it("refuse un média sans texte alternatif utilisable", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(media).values({
          url: `https://exemple.invalid/${crypto.randomUUID()}.jpg`,
          chemin: `medias/${crypto.randomUUID()}.jpg`,
          nomFichier: "photo.jpg",
          typeMime: "image/jpeg",
          tailleOctets: 120_000,
          texteAlternatif: "   ",
        }),
      );

      expect(message).toContain("media_texte_alternatif_non_vide");
    });

    it("refuse un média dont le type MIME n'est pas dans la liste blanche", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(media).values({
          url: `https://exemple.invalid/${crypto.randomUUID()}.svg`,
          chemin: `medias/${crypto.randomUUID()}.svg`,
          nomFichier: "logo.svg",
          // SVG exclu volontairement : c'est un vecteur d'injection de script.
          typeMime: "image/svg+xml",
          tailleOctets: 4_000,
          texteAlternatif: "Logo du club",
        }),
      );

      expect(message).toContain("media_type_mime_autorise");
    });

    it("refuse un média au-delà de 5 Mo", async () => {
      const message = await capturerRefus(() =>
        contexte.base.insert(media).values({
          url: `https://exemple.invalid/${crypto.randomUUID()}.png`,
          chemin: `medias/${crypto.randomUUID()}.png`,
          nomFichier: "enorme.png",
          typeMime: "image/png",
          tailleOctets: 5 * 1024 * 1024 + 1,
          texteAlternatif: "Image trop lourde",
        }),
      );

      expect(message).toContain("media_taille_valide");
    });
  });

  it("n'a laissé aucune ligne parasite derrière les tentatives refusées", async () => {
    const resultat = await contexte.base.select({ nb: sql<number>`count(*)::int` }).from(rencontre);

    expect(resultat[0]?.nb).toBe(11);
  });
});
