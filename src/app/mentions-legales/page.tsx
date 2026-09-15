import type { Metadata } from "next";
import Link from "next/link";
import { COURRIEL, URL_FFBB_CLUB } from "@/composants/public/pied-de-page";
import { Conteneur } from "@/composants/ui/primitives";

export const metadata: Metadata = {
  title: "Mentions légales",
  description:
    "Éditeur, hébergeur, origine des données et traitement des données personnelles du site du SOCL Basket.",
};

const CLASSES_RUBRIQUE = "mt-10 text-xl font-bold tracking-tight text-violet";
const CLASSES_TEXTE = "mt-3 max-w-prose text-base leading-relaxed text-encre";

export default function PageMentionsLegales() {
  return (
    <Conteneur className="py-10 sm:py-14">
      <h1 className="text-3xl font-extrabold tracking-tight text-violet sm:text-4xl">
        Mentions légales
      </h1>

      <h2 className={CLASSES_RUBRIQUE}>Éditeur du site</h2>
      <p className={CLASSES_TEXTE}>
        Stade Olympique Candé Loiré Basket (SOCL Basket), association loi 1901, club affilié à la
        Fédération Française de BasketBall sous le numéro PDL0049077.
      </p>
      <p className={CLASSES_TEXTE}>
        Siège social : Complexe Sportif R. Loison, Allée Pierre Charpentier, 49440 Candé.
        <br />
        Contact :{" "}
        <a
          href={`mailto:${COURRIEL}`}
          className="font-semibold text-violet underline underline-offset-4 hover:text-encre"
        >
          {COURRIEL}
        </a>
      </p>
      <p className={CLASSES_TEXTE}>
        {/* Ces informations n'ont pas été communiquées au moment de la mise en ligne.
            On l'écrit plutôt que d'inventer un numéro ou un nom. */}
        Numéro RNA, numéro SIRET et directeur de la publication : <em>à compléter</em>.
      </p>

      <h2 className={CLASSES_RUBRIQUE}>Hébergement</h2>
      <p className={CLASSES_TEXTE}>
        Le site est hébergé par Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis —{" "}
        <a
          href="https://vercel.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-violet underline underline-offset-4 hover:text-encre"
        >
          vercel.com
        </a>
        .
      </p>

      <h2 className={CLASSES_RUBRIQUE}>Origine des données sportives</h2>
      <p className={CLASSES_TEXTE}>
        Les calendriers, les compositions de poules et les résultats publiés sur ce site proviennent
        de la Fédération Française de BasketBall, via la{" "}
        <a
          href={URL_FFBB_CLUB}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-violet underline underline-offset-4 hover:text-encre"
        >
          fiche officielle du club
        </a>
        . La FFBB reste la source de référence : en cas d&apos;écart entre ce site et le site
        fédéral, c&apos;est ce dernier qui fait foi.
      </p>
      <p className={CLASSES_TEXTE}>
        Les comptes rendus, photographies et présentations d&apos;équipes sont, eux, rédigés et
        publiés par le club.
      </p>

      <h2 className={CLASSES_RUBRIQUE}>Données personnelles</h2>
      <p className={CLASSES_TEXTE}>
        Le site public ne demande aucune inscription, ne dépose aucun cookie publicitaire et
        n&apos;utilise aucun traceur à des fins de mesure d&apos;audience. Les seules données
        personnelles affichées sont les noms des entraîneurs, des membres du bureau et des joueurs,
        publiés avec leur accord ou celui de leur représentant légal.
      </p>
      <p className={CLASSES_TEXTE}>
        Toute personne peut demander la rectification ou le retrait des informations la concernant
        en écrivant à{" "}
        <a
          href={`mailto:${COURRIEL}`}
          className="font-semibold text-violet underline underline-offset-4 hover:text-encre"
        >
          {COURRIEL}
        </a>
        . La demande est traitée dans les meilleurs délais.
      </p>

      <h2 className={CLASSES_RUBRIQUE}>Propriété intellectuelle</h2>
      <p className={CLASSES_TEXTE}>
        Le logo et le nom du SOCL Basket appartiennent au club. Les textes publiés sur ce site ne
        peuvent être reproduits sans autorisation.
      </p>

      <p className="mt-12 border-t border-bordure pt-6">
        <Link
          href="/club"
          className="text-sm font-semibold text-violet underline underline-offset-4 hover:text-encre"
        >
          ← En savoir plus sur le club
        </Link>
      </p>
    </Conteneur>
  );
}
