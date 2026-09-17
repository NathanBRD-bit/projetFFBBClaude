import {
  creerClientFfbb,
  recupererJetons,
  type FournisseurDeJetons,
} from "../src/infrastructure/ffbb/client";

/**
 * Vérification du **contrat** de l'API FFBB — lancée une fois par semaine par
 * `.github/workflows/contrat-ffbb.yml`, jamais sur une PR.
 *
 *     npx tsx scripts/verifier-contrat-ffbb.ts
 *
 * Question posée, et une seule : *les schémas Zod du projet décrivent-ils
 * toujours ce que la FFBB renvoie ?* Le reste (normalisation, fusion, écriture)
 * est couvert par les tests, sur fixtures, sans réseau.
 *
 * ## Pourquoi ce n'est pas un test
 *
 * Toute la suite tourne derrière MSW avec `onUnhandledRequest: "error"` : aucun
 * test ne peut toucher le réseau, et c'est une bonne chose — une CI dont le vert
 * dépend de la disponibilité d'un service tiers ne veut plus rien dire. Ce
 * script, lui, tape l'API réelle. Il est donc **hors** de la suite, et hors du
 * chemin des PR : il prévient *avant* la casse, il ne bloque personne.
 *
 * Avec `scripts/capturer-fixtures-ffbb.ts`, ce sont les deux seuls fichiers du
 * dépôt autorisés à sortir sur le réseau réel.
 *
 * ## Ce qu'il fait échouer
 *
 * - jetons publics illisibles ou hors schéma ;
 * - enveloppe Meilisearch hors schéma (elle est validée strictement) ;
 * - **un seul** document de rencontre écarté par Zod — en temps normal il n'y en
 *   a aucun, donc le premier est déjà le signal qu'un champ a bougé ;
 * - fiche club hors schéma ;
 * - index qui ne renvoie plus aucune rencontre pour le club (soit le filtre a
 *   changé, soit l'index est vide : dans les deux cas il faut aller voir).
 */

const CODE_CLUB = "PDL0049077";

/**
 * Fournisseur sans cache : `recupererJetons` refait l'appel à chaque fois, il n'y
 * a donc rien à invalider. Le cache 6 h vit dans `jetons.ts` et demande une base
 * de données — dont cette vérification n'a pas besoin, et qu'on ne veut surtout
 * pas brancher sur la production depuis un job hebdomadaire.
 */
const jetonsSansCache: FournisseurDeJetons = {
  obtenir: () => recupererJetons(),
  invalider: () => Promise.resolve(),
};

const problemes: string[] = [];

const client = creerClientFfbb(jetonsSansCache);

const lecture = await client.listerRencontresDuClub(CODE_CLUB);
console.info(
  `Rencontres : ${String(lecture.rencontres.length)} validée(s), ` +
    `${String(lecture.ecartes.length)} écartée(s).`,
);

for (const ecarte of lecture.ecartes) {
  problemes.push(
    `Document ${ecarte.idFfbb ?? "(id illisible)"} refusé par schemaRencontreFfbb : ` +
      ecarte.problemes.join(" | "),
  );
}

if (lecture.rencontres.length === 0) {
  problemes.push(
    `L'index ne renvoie plus aucune rencontre pour ${CODE_CLUB}. Soit le filtre a changé, ` +
      `soit l'index est vide : à vérifier à la main sur competitions.ffbb.com.`,
  );
}

// Constat de review : cet appel n'était pas protégé. S'il levait — précisément
// la dérive que ce job traque — le processus mourait avant d'afficher les
// problèmes déjà collectés, et la première étape de la procédure décrite dans le
// workflow (« lire la liste des champs fautifs dans les logs ») n'avait rien à lire.
try {
  const organisme = await client.obtenirOrganisme(CODE_CLUB);
  console.info(`Fiche club : ${organisme.nom} — engagements « ${organisme.engagements_codes} ».`);
} catch (cause) {
  problemes.push(`Fiche club : ${cause instanceof Error ? cause.message : String(cause)}`);
}

if (problemes.length > 0) {
  // `console.error` puis `exit(1)` : le job doit rougir et dire quoi regarder.
  // Pas de tri, pas de résumé : la liste complète, telle quelle.
  console.error(
    `Le contrat FFBB a changé — ${String(problemes.length)} problème(s) :\n` +
      problemes.map((probleme) => `  - ${probleme}`).join("\n"),
  );
  process.exit(1);
}

console.info("Contrat FFBB conforme : les schémas Zod du projet tiennent toujours.");
