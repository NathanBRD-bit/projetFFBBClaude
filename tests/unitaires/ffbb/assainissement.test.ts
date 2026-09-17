import { describe, expect, it } from "vitest";

import { assainirMessage, LONGUEUR_MESSAGE_MAX } from "@/infrastructure/ffbb/assainissement";

/**
 * Ce module est la dernière barrière avant qu'un message d'erreur ne quitte le
 * serveur — vers la réponse HTTP, vers Slack, vers un journal d'exécution public
 * de GitHub Actions. Ce qui passe ici passe partout.
 */
describe("assainirMessage", () => {
  it("laisse passer un message sans rien de sensible", () => {
    expect(assainirMessage("L'index FFBB est revenu vide.")).toBe("L'index FFBB est revenu vide.");
  });

  it("renvoie null quand il n'y a pas de message", () => {
    expect(assainirMessage(null)).toBeNull();
  });

  it("masque une chaîne de connexion Postgres complète", () => {
    // Le cas qui a motivé ce module : le driver recopie l'URL entière, mot de
    // passe compris, dans son message d'erreur.
    const message = assainirMessage(
      "connexion refusée : postgresql://socl:motdepasse@ep-abc.eu-west-2.aws.neon.tech/neondb",
    );

    expect(message).toBe("connexion refusée : [uri masquée]");
    expect(message).not.toContain("motdepasse");
  });

  it("masque aussi une URL anodine, faute de savoir les distinguer", () => {
    // Choix assumé : filtrer au cas par cas reviendrait à parier sur la forme
    // des messages d'erreur à venir.
    expect(assainirMessage("appel à https://api.ffbb.com/items/configuration refusé")).toBe(
      "appel à [uri masquée] refusé",
    );
  });

  it("masque un nom d'hôte technique cité sans schéma d'URI", () => {
    // `getaddrinfo ENOTFOUND …` ne contient aucune URI : le masquage d'URI seul
    // laissait fuiter le nom d'hôte de la base dans les journaux publics.
    expect(assainirMessage("getaddrinfo ENOTFOUND ep-cool-123.eu-central-1.aws.neon.tech")).toBe(
      "getaddrinfo ENOTFOUND [hôte masqué]",
    );
    expect(assainirMessage("échec vers socl-basket.vercel.app")).toBe("échec vers [hôte masqué]");
  });

  it("laisse intact un domaine qui n'est pas de l'infrastructure", () => {
    // On ne caviarde pas un message utile : `competitions.ffbb.com` aide au
    // diagnostic et ne révèle rien.
    expect(assainirMessage("vérifier sur competitions.ffbb.com")).toBe(
      "vérifier sur competitions.ffbb.com",
    );
  });

  it("masque le nom d'utilisateur cité par Postgres", () => {
    expect(assainirMessage('password authentication failed for user "socl"')).toBe(
      'password authentication failed for user "[masqué]"',
    );
  });

  it("tronque un message trop long", () => {
    const long = "a".repeat(LONGUEUR_MESSAGE_MAX + 200);

    expect(assainirMessage(long)).toHaveLength(LONGUEUR_MESSAGE_MAX);
  });

  it("masque avant de tronquer, jamais l'inverse", () => {
    // L'ordre n'est pas cosmétique : tronquer d'abord couperait l'URI en deux et
    // en laisserait passer la moitié — dont l'identifiant, qui précède l'arobase.
    const message = assainirMessage(
      `${"b".repeat(LONGUEUR_MESSAGE_MAX - 20)} postgresql://socl:secret@ep-x.neon.tech/db`,
    );

    expect(message).not.toContain("secret");
  });
});
