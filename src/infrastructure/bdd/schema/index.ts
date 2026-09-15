/**
 * Schéma Drizzle complet, découpé par domaine fonctionnel.
 *
 * C'est le point d'entrée unique : `drizzle.config.ts`, le client et les scripts
 * n'importent que ce fichier. Un fichier par domaine plutôt qu'un gros `schema.ts` —
 * une review de migration reste ainsi lisible même quand une seule table bouge.
 *
 * Les fichiers de ce dossier sont **déclaratifs** : ils sont exclus de la mesure de
 * couverture (voir `vitest.config.ts`), mais leurs contraintes sont prouvées une par
 * une par `tests/integration/contraintes.test.ts`.
 */

export * from "./referentiel";
export * from "./club";
export * from "./rencontres";
export * from "./editorial";
export * from "./administration";
export * from "./synchronisation";
