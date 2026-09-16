import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  INDEX_ORGANISMES,
  INDEX_RENCONTRES,
  URL_CONFIGURATION,
  URL_MEILISEARCH,
  USER_AGENT_NAVIGATEUR,
} from "../src/infrastructure/ffbb/client";
import {
  schemaConfigurationFfbb,
  schemaReponseOrganismes,
  schemaReponseRencontres,
  validerFfbb,
} from "../src/infrastructure/ffbb/schemas";

/**
 * Capture des fixtures FFBB — **à lancer à la main**, jamais en CI ni en test :
 *
 *     npx tsx scripts/capturer-fixtures-ffbb.ts
 *
 * C'est le seul fichier du dépôt qui touche l'API FFBB réelle. Il écrit dans
 * `tests/fixtures/ffbb/` les trois réponses brutes dont les tests se servent
 * ensuite via MSW, pour que `npm test` ne fasse **aucune** requête réseau.
 *
 * Le script est volontairement paranoïaque : chaque réponse est validée par les
 * schémas Zod du projet **avant** d'être écrite. Une fixture partielle ou vide
 * est bien pire qu'une absence de fixture — elle fait passer au vert des tests
 * qui ne prouvent rien. Donc : tout ou rien, et l'écriture n'a lieu qu'à la fin.
 *
 * Effet de bord utile : si la FFBB change son format, ce script échoue en
 * nommant le champ fautif. C'est le même mécanisme que le job hebdomadaire
 * `contrat-ffbb.yml` prévu en T07.
 */

const CODE_CLUB = "PDL0049077";
const DOSSIER_FIXTURES = fileURLToPath(new URL("../tests/fixtures/ffbb", import.meta.url));

/**
 * Valeurs de remplacement des jetons. Publics ou non, un dépôt n'est pas un
 * endroit où recopier des jetons : ils tournent, ils finissent dans l'historique
 * git, et un lecteur pressé croirait pouvoir s'en servir.
 */
const JETON_DH_FACTICE = "jeton-directus-factice-pour-les-tests";
const JETON_MS_FACTICE = "jeton-meilisearch-factice-pour-les-tests";
const CODE_EMPLOI_FACTICE = "code-emploi-factice-pour-les-tests";

const EN_TETES_NAVIGATEUR = {
  "user-agent": USER_AGENT_NAVIGATEUR,
  accept: "application/json",
} as const;

function echouer(message: string): never {
  throw new Error(`Capture des fixtures FFBB interrompue : ${message}`);
}

async function lireReponse(reponse: Response, description: string): Promise<unknown> {
  const texte = await reponse.text();
  if (!reponse.ok) {
    echouer(
      `${description} a répondu ${String(reponse.status)} ${reponse.statusText}. ` +
        `Corps : ${texte.slice(0, 300)}`,
    );
  }
  try {
    return JSON.parse(texte) as unknown;
  } catch (cause) {
    throw new Error(`${description} n'a pas renvoyé du JSON : ${texte.slice(0, 300)}`, { cause });
  }
}

async function chercher(
  index: string,
  jetonMeilisearch: string,
  corps: Readonly<Record<string, unknown>>,
  description: string,
): Promise<unknown> {
  const reponse = await fetch(`${URL_MEILISEARCH}/indexes/${index}/search`, {
    method: "POST",
    headers: {
      ...EN_TETES_NAVIGATEUR,
      authorization: `Bearer ${jetonMeilisearch}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(corps),
  });
  return lireReponse(reponse, description);
}

async function ecrire(nomFichier: string, contenu: unknown): Promise<void> {
  const chemin = `${DOSSIER_FIXTURES}/${nomFichier}`;
  await writeFile(chemin, `${JSON.stringify(contenu, null, 2)}\n`, "utf8");
  console.info(`Écrit : ${chemin}`);
}

/* ------------------------------------------------------------------ *
 * 1. Configuration publique (jetons)
 * ------------------------------------------------------------------ */

const configurationBrute = await lireReponse(
  await fetch(URL_CONFIGURATION, {
    headers: {
      ...EN_TETES_NAVIGATEUR,
      origin: "https://competitions.ffbb.com",
      referer: "https://competitions.ffbb.com/",
    },
  }),
  "GET /items/configuration",
);

const configuration = validerFfbb(
  schemaConfigurationFfbb,
  configurationBrute,
  "configuration FFBB",
);
const jetonMeilisearch = configuration.data.key_ms;

/* ------------------------------------------------------------------ *
 * 2. Rencontres du club
 * ------------------------------------------------------------------ */

const rencontresBrutes = await chercher(
  INDEX_RENCONTRES,
  jetonMeilisearch,
  {
    q: "",
    filter: `idOrganismeEquipe1.code = ${CODE_CLUB} OR idOrganismeEquipe2.code = ${CODE_CLUB}`,
    limit: 200,
    offset: 0,
    sort: ["date_timestamp:asc"],
  },
  `recherche des rencontres de ${CODE_CLUB}`,
);

const rencontres = validerFfbb(
  schemaReponseRencontres,
  rencontresBrutes,
  `rencontres du club ${CODE_CLUB}`,
);
const premiereRencontre = rencontres.hits[0];
if (premiereRencontre === undefined) {
  echouer(
    `l'index ${INDEX_RENCONTRES} ne renvoie aucune rencontre pour ${CODE_CLUB}. ` +
      `Une fixture vide ferait passer au vert des tests qui ne prouvent rien : ` +
      `la fixture existante n'est pas écrasée. Le cas « index vide » est couvert ` +
      `par rencontres-vide.json, dérivée à la main.`,
  );
}

/* ------------------------------------------------------------------ *
 * 3. Fiche club
 * ------------------------------------------------------------------ */

// `code` n'est pas filtrable sur cet index : recherche plein texte, puis
// égalité exacte côté client. Une fixture contenant le mauvais club serait
// pire qu'une absence de fixture.
const organismesBruts = await chercher(
  INDEX_ORGANISMES,
  jetonMeilisearch,
  { q: CODE_CLUB, limit: 20, offset: 0 },
  `recherche de l'organisme ${CODE_CLUB}`,
);

const organismes = validerFfbb(schemaReponseOrganismes, organismesBruts, `organisme ${CODE_CLUB}`);
const organisme = organismes.hits.find((candidat) => candidat.code === CODE_CLUB);
if (organisme === undefined) {
  echouer(
    `aucune fiche de code exactement ${CODE_CLUB} parmi les ${String(organismes.hits.length)} ` +
      `résultats renvoyés par l'index ${INDEX_ORGANISMES}`,
  );
}

/* ------------------------------------------------------------------ *
 * 4. Écriture — seulement maintenant que tout est validé
 * ------------------------------------------------------------------ */

// La fixture conserve la réponse **brute**, champs inconnus compris : c'est ce
// que les tests doivent voir arriver. Seuls les jetons sont remplacés.
const configurationRedigee = configurationBrute as {
  data: Record<string, unknown>;
};
for (const [cle, valeur] of Object.entries(configurationRedigee.data)) {
  if (typeof valeur === "string" && valeur === configuration.data.key_dh) {
    configurationRedigee.data[cle] = JETON_DH_FACTICE;
  }
  if (typeof valeur === "string" && valeur === configuration.data.key_ms) {
    configurationRedigee.data[cle] = JETON_MS_FACTICE;
  }
}

const organismeBrut = (organismesBruts as { hits: Record<string, unknown>[] }).hits.find(
  (candidat) => candidat.code === CODE_CLUB,
);
if (organismeBrut === undefined) {
  echouer("la fiche club validée n'a pas été retrouvée dans la réponse brute");
}
/**
 * Champs personnels retirés de la fiche club avant écriture.
 *
 * `telephone` est le portable personnel d'un dirigeant bénévole et `mail` une
 * adresse nominative : les publier dans un dépôt Git public les y grave
 * définitivement, et chaque nouvelle capture les y remettrait. Ils sont déjà hors
 * schéma Zod, donc ils n'entrent jamais en base — raison de plus pour qu'ils
 * n'entrent pas non plus dans les fixtures.
 *
 * `code_emploi` est une chaîne opaque signée : même logique que pour les jetons.
 */
const CHAMPS_PERSONNELS_A_RETIRER = ["mail", "telephone", "code_emploi"] as const;

/**
 * Liste **noire explicite** plutôt que silencieuse : si la FFBB ajoute un jour un
 * champ personnel non listé ici, il passera. C'est pourquoi la capture affiche les
 * champs conservés — une relecture humaine reste nécessaire avant de commiter.
 */
for (const champ of CHAMPS_PERSONNELS_A_RETIRER) {
  if (champ in organismeBrut) {
    organismeBrut[champ] = champ === "code_emploi" ? CODE_EMPLOI_FACTICE : null;
  }
}
console.info(
  `Fiche club : champs conservés → ${Object.keys(organismeBrut).sort().join(", ")}. ` +
    `Relisez la fixture avant de la commiter.`,
);

await mkdir(DOSSIER_FIXTURES, { recursive: true });

// Les trois fichiers sont construits d'abord, écrits ensuite : une capture
// interrompue en cours d'écriture laisserait un jeu de fixtures incohérent
// (configuration fraîche, rencontres périmées), pire qu'une absence de fixture.
const aEcrire: [string, unknown][] = [
  ["configuration.json", configurationRedigee],
  ["rencontres-club.json", rencontresBrutes],
  ["organisme-socl.json", { ...(organismesBruts as object), hits: [organismeBrut] }],
];
for (const [nom, contenu] of aEcrire) {
  await ecrire(nom, contenu);
}

console.info(
  `Capture terminée : ${String(rencontres.hits.length)} rencontre(s) pour ${CODE_CLUB}, ` +
    `saison ${premiereRencontre.saison.code}.`,
);
