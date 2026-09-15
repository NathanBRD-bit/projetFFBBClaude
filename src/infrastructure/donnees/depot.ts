/**
 * Dépôt de données : **seul** point d'accès des pages aux données du site.
 *
 * Aujourd'hui il sert le jeu de démonstration (`demo.ts`). En T03/T06, seule
 * l'implémentation de ces fonctions changera pour interroger Postgres via Drizzle :
 * les pages, elles, n'ont pas à bouger. D'où les signatures asynchrones dès
 * maintenant, alors que les données sont en mémoire.
 */

import "server-only";

import type { Article, Equipe, Joueur, Rencontre } from "@/domaine/types";
import {
  ARTICLES,
  EQUIPES,
  JOUEURS,
  POINTS,
  RENCONTRES,
  SAISON_COURANTE,
  SAISON_PRECEDENTE,
} from "./demo";

export { SAISON_COURANTE, SAISON_PRECEDENTE };

/** Les saisons disponibles, de la plus récente à la plus ancienne. */
export function listerSaisons(): string[] {
  return [...new Set(RENCONTRES.map((r) => r.saison))].sort().reverse();
}

export function listerEquipes(): Promise<Equipe[]> {
  return Promise.resolve([...EQUIPES].sort((a, b) => a.ordre - b.ordre));
}

export function trouverEquipe(slug: string): Promise<Equipe | null> {
  return Promise.resolve(EQUIPES.find((e) => e.slug === slug) ?? null);
}

export function trouverEquipeParId(id: string): Promise<Equipe | null> {
  return Promise.resolve(EQUIPES.find((e) => e.id === id) ?? null);
}

export interface FiltreRencontres {
  readonly saison?: string;
  readonly equipeId?: string;
}

export function listerRencontres(filtre: FiltreRencontres = {}): Promise<Rencontre[]> {
  return Promise.resolve(
    RENCONTRES.filter((r) => {
      if (filtre.saison !== undefined && r.saison !== filtre.saison) {
        return false;
      }
      if (filtre.equipeId !== undefined && r.equipeId !== filtre.equipeId) {
        return false;
      }
      return true;
    }),
  );
}

export function trouverRencontre(slug: string): Promise<Rencontre | null> {
  return Promise.resolve(RENCONTRES.find((r) => r.slug === slug) ?? null);
}

export function listerJoueurs(equipeId: string): Promise<Joueur[]> {
  return Promise.resolve(
    [...JOUEURS]
      .filter((j) => j.equipeId === equipeId)
      .sort((a, b) => (a.numero ?? 99) - (b.numero ?? 99)),
  );
}

/** Une ligne par joueur ayant une saisie sur ce match. Liste vide si rien n'a été saisi. */
export function listerPointsDuMatch(
  rencontreId: string,
): Promise<{ joueur: Joueur; points: number | null }[]> {
  const lignes = POINTS.filter((p) => p.rencontreId === rencontreId).map((ligne) => {
    const joueur = JOUEURS.find((j) => j.id === ligne.joueurId);
    if (joueur === undefined) {
      throw new Error(`Donnée de démo incohérente : joueur inconnu « ${ligne.joueurId} ».`);
    }
    return { joueur, points: ligne.points };
  });
  return Promise.resolve(
    lignes.sort((a, b) => {
      // Les joueurs sans saisie passent en dernier, jamais confondus avec un zéro.
      if (a.points === null) {
        return b.points === null ? 0 : 1;
      }
      if (b.points === null) {
        return -1;
      }
      return b.points - a.points;
    }),
  );
}

export function listerArticles(limite?: number): Promise<Article[]> {
  const tries = [...ARTICLES].sort((a, b) => {
    if (a.epingle !== b.epingle) {
      return a.epingle ? -1 : 1;
    }
    return new Date(b.publieLe).getTime() - new Date(a.publieLe).getTime();
  });
  return Promise.resolve(limite === undefined ? tries : tries.slice(0, limite));
}

export function trouverArticle(slug: string): Promise<Article | null> {
  return Promise.resolve(ARTICLES.find((a) => a.slug === slug) ?? null);
}

export function listerCategoriesArticles(): Promise<string[]> {
  return Promise.resolve([...new Set(ARTICLES.map((a) => a.categorie))].sort());
}
