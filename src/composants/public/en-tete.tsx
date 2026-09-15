import Image from "next/image";
import Link from "next/link";
import { Conteneur } from "@/composants/ui/primitives";

const LIENS = [
  { href: "/actualites", libelle: "Actualités" },
  { href: "/equipes", libelle: "Équipes" },
  { href: "/calendrier", libelle: "Calendrier" },
  { href: "/resultats", libelle: "Résultats" },
  { href: "/club", libelle: "Le club" },
];

export function EnTete() {
  return (
    <header className="sur-violet bg-violet-fonce text-white">
      <Conteneur className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3">
        <Link href="/" className="flex items-center gap-3">
          {/* `alt` vide : le nom du club est juste à côté en texte, répéter l'image
              ferait doublon pour un lecteur d'écran. */}
          <Image
            src="/logo-socl.png"
            alt=""
            width={48}
            height={48}
            priority
            className="h-12 w-12 shrink-0"
          />
          <span className="leading-tight">
            <span className="block text-lg font-extrabold tracking-tight">SOCL Basket</span>
            <span className="block text-xs text-white/80">Stade Olympique Candé Loiré</span>
          </span>
        </Link>

        <nav aria-label="Navigation principale">
          <ul className="flex flex-wrap items-center gap-1 text-sm font-semibold">
            {LIENS.map((lien) => (
              <li key={lien.href}>
                <Link
                  href={lien.href}
                  className="block rounded px-3 py-2 hover:bg-white/15 hover:text-jaune"
                >
                  {lien.libelle}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Conteneur>
    </header>
  );
}
