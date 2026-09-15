import Link from "next/link";

export interface OptionFiltre {
  readonly href: string;
  readonly libelle: string;
  readonly actif: boolean;
}

/**
 * Filtres du calendrier et des résultats : de simples liens serveur, pas de
 * JavaScript client. L'option active est distinguée visuellement **et** annoncée
 * aux lecteurs d'écran par `aria-current="page"` — la couleur seule ne suffit pas.
 */
export function FiltresRencontres({
  etiquette,
  options,
}: {
  etiquette: string;
  options: readonly OptionFiltre[];
}) {
  return (
    <nav aria-label={etiquette} className="mt-4">
      <p className="mb-2 text-xs font-semibold tracking-wider text-encre-douce uppercase">
        {etiquette}
      </p>
      <ul className="flex flex-wrap gap-2">
        {options.map((option) => (
          <li key={option.href}>
            <Link
              href={option.href}
              aria-current={option.actif ? "page" : undefined}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                option.actif
                  ? "border-violet bg-violet text-white"
                  : "border-bordure text-violet hover:border-violet hover:bg-violet-voile"
              }`}
            >
              {option.libelle}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
