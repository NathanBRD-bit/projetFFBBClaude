// CONTRE-EXEMPLE VOLONTAIREMENT FAUTIF — ne pas corriger.
//
// Ce fichier sert à vérifier que les garde-fous du linter échouent réellement.
// Il n'est ni compilé ni linté en l'état : `tsconfig.json` exclut `tests/garde-fous`
// et `eslint.config.mjs` l'ignore globalement. Il ne casse donc pas la CI.
//
// Mode d'emploi et sortie attendue : voir tests/garde-fous/README.md.

import { useState } from "react";
import { redirect } from "next/navigation";
import PageAccueil from "../app/page";

async function chargerScore(): Promise<number> {
  return Promise.resolve(0);
}

export function sondeGardeFous(points: number, libelle: string): string {
  // eqeqeq : comparaison lâche
  if (points == 0) {
    return "";
  }

  // no-empty (allowEmptyCatch: false) : erreur avalée en silence
  try {
    redirect("/");
  } catch {}

  // @typescript-eslint/no-floating-promises : promesse jamais attendue
  chargerScore();

  // @typescript-eslint/no-explicit-any : type laxiste
  const brut: any = libelle;
  useState(brut);

  // @typescript-eslint/no-unnecessary-condition : `libelle` ne peut pas être undefined
  if (libelle !== undefined) {
    return String(PageAccueil);
  }

  return "";
}

export async function sondeAwaitThenable(): Promise<void> {
  // @typescript-eslint/await-thenable : await sur une valeur qui n'est pas une promesse
  await "pas une promesse";
}

export function sondeMisusedPromises(): void {
  // @typescript-eslint/no-misused-promises : handler async là où un retour void est attendu
  setTimeout(chargerScore, 0);
}
