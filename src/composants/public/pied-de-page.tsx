import Link from "next/link";
import { Conteneur } from "@/composants/ui/primitives";

export const RESEAUX = [
  { nom: "Instagram", url: "https://www.instagram.com/socl_basket/", pseudo: "@socl_basket" },
  { nom: "Facebook", url: "https://www.facebook.com/soclbasket/", pseudo: "SOCL Basket" },
];

export const COURRIEL = "secretariat.socl.basket@gmail.com";

export const URL_FFBB_CLUB =
  "https://competitions.ffbb.com/ligues/pdl/comites/0049/clubs/pdl0049077";

export function PiedDePage() {
  return (
    <footer className="sur-violet mt-16 bg-violet-fonce text-white">
      <Conteneur className="grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="text-base font-extrabold">SOCL Basket</p>
          <p className="mt-1 text-sm text-white/80">
            Stade Olympique Candé Loiré Basket
            <br />
            Club affilié FFBB — PDL0049077
          </p>
        </div>

        <div>
          <h2 className="text-sm font-bold tracking-wider uppercase">Nous trouver</h2>
          <address className="mt-2 text-sm text-white/80 not-italic">
            Complexe Sportif R. Loison
            <br />
            Allée Pierre Charpentier, 49440 Candé
            <br />
            <br />
            Salle de Loire
            <br />
            Rue de la Libération, 49440 Loiré
          </address>
        </div>

        <div>
          <h2 className="text-sm font-bold tracking-wider uppercase">Nous suivre</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {RESEAUX.map((reseau) => (
              <li key={reseau.nom}>
                <a
                  href={reseau.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white underline underline-offset-4 hover:text-jaune"
                >
                  {reseau.nom} <span className="text-white/80">({reseau.pseudo})</span>
                </a>
              </li>
            ))}
            <li>
              <a
                href={`mailto:${COURRIEL}`}
                className="text-white underline underline-offset-4 hover:text-jaune"
              >
                {COURRIEL}
              </a>
            </li>
          </ul>
        </div>
      </Conteneur>

      <div className="border-t border-white/20">
        <Conteneur className="flex flex-wrap items-center justify-between gap-3 py-4 text-xs text-white/80">
          <p>© {new Date().getFullYear()} SOCL Basket</p>
          <p>
            Calendriers et résultats issus de la{" "}
            <a
              href={URL_FFBB_CLUB}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-jaune"
            >
              FFBB
            </a>
            {" · "}
            <Link
              href="/mentions-legales"
              className="underline underline-offset-4 hover:text-jaune"
            >
              Mentions légales
            </Link>
          </p>
        </Conteneur>
      </div>
    </footer>
  );
}
