import Link from "next/link";
import { Badge } from "@/composants/ui/primitives";
import type { Equipe, Sexe } from "@/domaine/types";

/**
 * Libellé d'affichage du sexe d'une équipe. La FFBB parle de « masculin » et
 * « féminin » ; le club, lui, dit « masculins » et « féminines ».
 */
export function libelleSexe(sexe: Sexe): string {
  switch (sexe) {
    case "masculin":
      return "Masculins";
    case "feminin":
      return "Féminines";
  }
}

export function CarteEquipe({ equipe }: { equipe: Equipe }) {
  return (
    <Link
      href={`/equipes/${equipe.slug}`}
      className="flex h-full flex-col gap-3 rounded-lg border border-bordure bg-fond p-5 transition-colors hover:border-violet hover:bg-violet-voile"
    >
      <span className="flex flex-wrap items-center gap-2">
        <Badge>{equipe.categorie}</Badge>
        <Badge>{libelleSexe(equipe.sexe)}</Badge>
      </span>

      <span className="text-lg font-bold text-violet">{equipe.nom}</span>

      <span className="flex-1 text-sm text-encre-douce">{equipe.competition}</span>

      <span className="text-sm font-semibold text-violet underline underline-offset-4">
        Voir l&apos;équipe
      </span>
    </Link>
  );
}
