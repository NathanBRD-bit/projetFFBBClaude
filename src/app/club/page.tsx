import type { Metadata } from "next";
import { COURRIEL, RESEAUX, URL_FFBB_CLUB } from "@/composants/public/pied-de-page";
import { Carte, Conteneur, TitreSection } from "@/composants/ui/primitives";

export const metadata: Metadata = {
  title: "Le club",
  description:
    "Le Stade Olympique Candé Loiré Basket : son histoire, son bureau, ses deux salles et ses contacts.",
};

/** Numéro du secrétariat, communiqué publiquement par le club. */
const TELEPHONE = "06 64 37 17 05";
const TELEPHONE_LIEN = "+33664371705";

const BUREAU = [
  { fonction: "Président", nom: "François Robin" },
  { fonction: "Secrétaire", nom: "Florence Provost" },
  { fonction: "Trésorière", nom: "Malgorzata Meillereux" },
] as const;

const SALLES = [
  {
    nom: "Complexe Sportif R. Loison",
    adresse: "Allée Pierre Charpentier",
    ville: "49440 Candé",
    usage: "Seniors masculins, U15 et U18 féminines, vétérans",
  },
  {
    nom: "Salle de Loire",
    adresse: "Rue de la Libération",
    ville: "49440 Loiré",
    usage: "Seniors féminines, U9 et U11 masculins",
  },
] as const;

export default function PageClub() {
  return (
    <>
      <section className="sur-violet bg-violet-fonce text-white">
        <Conteneur className="py-10 sm:py-14">
          <p className="text-sm font-semibold tracking-widest text-jaune uppercase">Le club</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Stade Olympique Candé Loiré Basket
          </h1>
          <p className="mt-2 text-base text-white/85">Club affilié à la FFBB — PDL0049077</p>
        </Conteneur>
      </section>

      <Conteneur className="space-y-12 py-10 sm:py-14">
        <section aria-labelledby="titre-presentation">
          <TitreSection>
            <span id="titre-presentation">Qui sommes-nous</span>
          </TitreSection>
          <div className="max-w-prose space-y-4 text-base leading-relaxed text-encre">
            <p>
              Le SOCL Basket est né du rapprochement des clubs de Candé et de Loiré. Deux communes,
              deux salles, un seul club : les équipes s&apos;entraînent et reçoivent tantôt au
              Complexe Sportif R. Loison à Candé, tantôt à la Salle de Loire à Loiré.
            </p>
            <p>
              Le club est affilié à la Fédération Française de BasketBall sous le numéro{" "}
              <strong className="font-bold">PDL0049077</strong>, et engage ses équipes dans les
              championnats départementaux du comité de Maine-et-Loire.
            </p>
            <p>
              Il fonctionne entièrement grâce à des bénévoles : entraîneurs, membres du bureau,
              parents à la table de marque, à la buvette et au volant des voitures le samedi.
            </p>
          </div>
        </section>

        <section aria-labelledby="titre-bureau">
          <TitreSection>
            <span id="titre-bureau">Le bureau</span>
          </TitreSection>
          <ul className="grid gap-4 sm:grid-cols-3">
            {BUREAU.map((membre) => (
              <li key={membre.fonction}>
                <Carte className="h-full p-4">
                  <p className="text-xs font-bold tracking-wider text-violet uppercase">
                    {membre.fonction}
                  </p>
                  <p className="mt-1 text-base font-semibold text-encre">{membre.nom}</p>
                </Carte>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="titre-salles">
          <TitreSection>
            <span id="titre-salles">Les salles</span>
          </TitreSection>
          <ul className="grid gap-4 sm:grid-cols-2">
            {SALLES.map((salle) => (
              <li key={salle.nom}>
                <Carte className="h-full border-l-4 border-l-jaune p-5">
                  <h3 className="text-lg font-bold text-violet">{salle.nom}</h3>
                  <address className="mt-2 text-sm text-encre not-italic">
                    {salle.adresse}
                    <br />
                    {salle.ville}
                  </address>
                  <p className="mt-3 text-sm text-encre-douce">{salle.usage}</p>
                </Carte>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="titre-contact">
          <TitreSection>
            <span id="titre-contact">Nous contacter</span>
          </TitreSection>
          <div className="grid gap-4 sm:grid-cols-2">
            <Carte className="p-5">
              <h3 className="text-sm font-bold tracking-wider text-violet uppercase">
                Secrétariat
              </h3>
              <ul className="mt-3 space-y-2 text-base">
                <li>
                  <a
                    href={`mailto:${COURRIEL}`}
                    className="font-semibold text-violet underline underline-offset-4 hover:text-encre"
                  >
                    {COURRIEL}
                  </a>
                </li>
                <li>
                  <a
                    href={`tel:${TELEPHONE_LIEN}`}
                    className="font-semibold text-violet underline underline-offset-4 hover:text-encre"
                  >
                    {TELEPHONE}
                  </a>
                </li>
              </ul>
            </Carte>

            <Carte className="p-5">
              <h3 className="text-sm font-bold tracking-wider text-violet uppercase">
                Nous suivre
              </h3>
              <ul className="mt-3 space-y-2 text-base">
                {RESEAUX.map((reseau) => (
                  <li key={reseau.nom}>
                    <a
                      href={reseau.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-violet underline underline-offset-4 hover:text-encre"
                    >
                      {reseau.nom}
                    </a>{" "}
                    <span className="text-sm text-encre-douce">({reseau.pseudo})</span>
                  </li>
                ))}
                <li>
                  <a
                    href={URL_FFBB_CLUB}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-violet underline underline-offset-4 hover:text-encre"
                  >
                    Fiche du club sur le site de la FFBB
                  </a>
                </li>
              </ul>
            </Carte>
          </div>
        </section>
      </Conteneur>
    </>
  );
}
