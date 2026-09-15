/**
 * Primitives d'interface partagées. Aucune n'est interactive : ce sont des
 * composants serveur, donc zéro kilo-octet de JavaScript envoyé au navigateur.
 */

import Link from "next/link";
import type { ReactNode } from "react";

export function Conteneur({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-5xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function TitreSection({
  children,
  lien,
}: {
  children: ReactNode;
  lien?: { href: string; libelle: string };
}) {
  return (
    <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-jaune pb-2">
      <h2 className="text-xl font-bold tracking-tight text-violet sm:text-2xl">{children}</h2>
      {lien === undefined ? null : (
        <Link
          href={lien.href}
          className="text-sm font-semibold text-violet underline underline-offset-4 hover:text-encre"
        >
          {lien.libelle}
        </Link>
      )}
    </div>
  );
}

type TonBadge = "neutre" | "victoire" | "defaite" | "attention" | "accent";

const TONS: Record<TonBadge, string> = {
  neutre: "bg-violet-voile text-violet",
  victoire: "bg-victoire text-white",
  defaite: "bg-defaite text-white",
  attention: "bg-jaune text-violet",
  accent: "bg-violet text-white",
};

export function Badge({ children, ton = "neutre" }: { children: ReactNode; ton?: TonBadge }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONS[ton]}`}
    >
      {children}
    </span>
  );
}

export function Carte({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-bordure bg-fond ${className}`}>{children}</div>;
}

/**
 * État vide. Le site démarre avec un calendrier presque vide — la FFBB publie les
 * rencontres au fil de l'eau : une page sans données doit rester une page finie,
 * qui explique pourquoi elle est vide, et non un trou.
 */
export function EtatVide({ titre, children }: { titre: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-bordure bg-fond-doux px-6 py-12 text-center">
      <p className="text-base font-semibold text-violet">{titre}</p>
      {children === undefined ? null : (
        <p className="mx-auto mt-2 max-w-prose text-sm text-encre-douce">{children}</p>
      )}
    </div>
  );
}

export function BoutonLien({
  href,
  children,
  variante = "principal",
}: {
  href: string;
  children: ReactNode;
  variante?: "principal" | "secondaire";
}) {
  // Le jaune ne peut pas servir de couleur de texte sur fond clair (1,28:1). En
  // fond de bouton avec un texte violet, il atteint 9,81:1 : c'est cette
  // combinaison-là qui porte les actions principales.
  const styles =
    variante === "principal"
      ? "bg-jaune text-violet hover:bg-violet hover:text-jaune"
      : "border-2 border-violet text-violet hover:bg-violet hover:text-white";
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-bold transition-colors ${styles}`}
    >
      {children}
    </Link>
  );
}
