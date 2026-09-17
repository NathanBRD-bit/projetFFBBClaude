import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { journalSynchronisation, parametre } from "@/infrastructure/bdd/schema";
import { creerAlerte, NOM_VARIABLE_WEBHOOK } from "@/infrastructure/ffbb/alerte";
import { CLE_PARAMETRE_JETONS } from "@/infrastructure/ffbb/jetons";
import {
  exigerLigne,
  synchroniser,
  type ResumeSynchronisation,
} from "@/infrastructure/ffbb/synchronisation";

import { chargerFixture, configurationQuiRepond, rencontresQuiRepondent } from "../msw/ffbb";
import { serveurMsw } from "../msw/serveur";
import { creerBaseDeTest, type BaseDeTest } from "./aide-base";

/**
 * L'alerte branchée sur le **vrai** moteur de synchronisation, avec un vrai
 * Postgres (PGlite) et un webhook en panne.
 *
 * Ce fichier existe pour une seule propriété, que les tests unitaires de
 * `alerte.ts` ne peuvent pas prouver seuls : **un webhook injoignable ne change
 * pas le statut de la synchronisation**. `synchronisation.ts` appelle son crochet
 * `alerter` avec un `await` non protégé, à dessein ; c'est donc à l'alerte de ne
 * jamais rejeter, et c'est vérifiable ici de bout en bout — résumé *et* ligne de
 * journal.
 */

const CODE_CLUB = "PDL0049077";
const T0 = new Date("2026-09-16T08:00:00+02:00");
const URL_WEBHOOK = "https://alertes.example/socl";

describe("alerte d'échec branchée sur la synchronisation", () => {
  let contexte: BaseDeTest;

  beforeAll(async () => {
    contexte = await creerBaseDeTest();
  });

  afterAll(async () => {
    await contexte.fermer();
  });

  beforeEach(async () => {
    await contexte.client.exec(
      `truncate table conflit_synchronisation, journal_synchronisation, rencontre, engagement,
       joueur_equipe, joueur, equipe, poule, competition, salle, organisme, saison, parametre
       restart identity cascade;`,
    );
    // Cache de jetons abîmé : le fournisseur le répare mais enregistre un
    // incident, ce qui suffit à faire d'une exécution par ailleurs correcte un
    // `partiel`. C'est le statut qu'il faut ici : sur un `echec`, la question de
    // savoir si l'alerte a dégradé le statut ne se poserait plus.
    await contexte.base.insert(parametre).values({
      cle: CLE_PARAMETRE_JETONS,
      valeur: "{ceci n'est pas du JSON",
      expireLe: new Date(T0.getTime() + 3_600_000),
    });
    // Index vide sur une base vide : accepté, et aucune disparition appliquée.
    serveurMsw.use(
      configurationQuiRepond(),
      rencontresQuiRepondent(chargerFixture("rencontres-vide.json")),
    );
  });

  function lancer(alerter: (resume: ResumeSynchronisation) => Promise<void>) {
    return synchroniser({
      base: contexte.base,
      codeClubFfbb: CODE_CLUB,
      declencheur: "github_actions",
      maintenant: () => T0,
      alerter,
    });
  }

  async function lireJournal(journalId: string) {
    return exigerLigne(
      await contexte.base
        .select()
        .from(journalSynchronisation)
        .where(eq(journalSynchronisation.id, journalId)),
      "le journal de l'exécution",
    );
  }

  it("laisse un partiel en partiel quand le webhook répond une erreur", async () => {
    serveurMsw.use(http.post(URL_WEBHOOK, () => new HttpResponse("non", { status: 503 })));
    const journal: string[] = [];

    const resume = await lancer(
      creerAlerte({
        env: { [NOM_VARIABLE_WEBHOOK]: URL_WEBHOOK },
        journaliserErreur: (message) => journal.push(message),
      }),
    );

    expect(resume.statut).toBe("partiel");
    expect((await lireJournal(resume.journalId)).statut).toBe("partiel");
    // L'échec de l'alerte reste visible : il n'est pas avalé, il change de canal.
    expect(journal).toHaveLength(1);
    expect(journal[0]).toContain("a répondu 503");
  });

  it("laisse un partiel en partiel quand le webhook est injoignable", async () => {
    serveurMsw.use(http.post(URL_WEBHOOK, () => HttpResponse.error()));
    const journal: string[] = [];

    const resume = await lancer(
      creerAlerte({
        env: { [NOM_VARIABLE_WEBHOOK]: URL_WEBHOOK },
        journaliserErreur: (message) => journal.push(message),
      }),
    );

    expect(resume.statut).toBe("partiel");
    expect((await lireJournal(resume.journalId)).statut).toBe("partiel");
    expect(journal[0]).toContain("injoignable");
  });

  it("transmet au webhook le statut, les compteurs et l'identifiant de journal réels", async () => {
    let recu: unknown = null;
    serveurMsw.use(
      http.post(URL_WEBHOOK, async ({ request }) => {
        recu = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const resume = await lancer(creerAlerte({ env: { [NOM_VARIABLE_WEBHOOK]: URL_WEBHOOK } }));

    expect(recu).toMatchObject({
      statut: "partiel",
      journalId: resume.journalId,
      compteurs: resume.compteurs,
    });
  });
});
