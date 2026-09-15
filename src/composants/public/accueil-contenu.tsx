import Link from "next/link";
import { CarteArticle } from "@/composants/public/article-carte";
import { CarteMatch } from "@/composants/public/carte-match";
import {
  Badge,
  BoutonLien,
  Carte,
  Conteneur,
  EtatVide,
  TitreSection,
} from "@/composants/ui/primitives";
import { formaterDateLongue, formaterHeure } from "@/domaine/rencontres";
import type { Article, Equipe, Rencontre } from "@/domaine/types";

/** Une rencontre et l'équipe du club qui la joue, déjà résolue par la page. */
export interface RencontreAffichee {
  readonly rencontre: Rencontre;
  readonly equipe: Equipe | null;
}

export interface ProprietesAccueil {
  /** `null` quand la FFBB n'a encore publié aucune rencontre à venir. */
  readonly prochain: RencontreAffichee | null;
  readonly derniers: readonly RencontreAffichee[];
  readonly articles: readonly Article[];
  readonly equipes: readonly Equipe[];
}

function Bandeau() {
  return (
    <section className="sur-violet bg-violet-fonce text-white">
      <Conteneur className="py-14 sm:py-20">
        <p className="text-sm font-semibold tracking-widest text-jaune uppercase">
          Stade Olympique Candé Loiré
        </p>
        <h1 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl">
          Le basket à Candé et à Loiré, du mini-basket aux vétérans
        </h1>
        <p className="mt-4 max-w-2xl text-base text-white/85 sm:text-lg">
          Sept équipes engagées, deux salles, une saison. Retrouvez ici le calendrier, les résultats
          et les nouvelles du club, mis à jour tout au long de l&apos;année.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <BoutonLien href="/calendrier">Voir le calendrier</BoutonLien>
          {/* Variante secondaire : bordure violette sur fond violet foncé, illisible.
              Le bandeau impose donc son propre style, blanc sur violet (11,2:1). */}
          <Link
            href="/actualites"
            className="inline-flex items-center justify-center rounded-md border-2 border-white px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-white hover:text-violet"
          >
            Lire les actualités
          </Link>
        </div>
      </Conteneur>
    </section>
  );
}

function ProchainMatch({ prochain }: { prochain: RencontreAffichee | null }) {
  if (prochain === null) {
    return (
      <EtatVide titre="Aucun match programmé pour l'instant">
        La FFBB publie les rencontres au fil de la saison. Dès qu&apos;une date est connue, elle
        apparaît ici et dans le calendrier.
      </EtatVide>
    );
  }

  const { rencontre, equipe } = prochain;
  const heure = formaterHeure(rencontre);

  return (
    <Carte className="border-l-4 border-l-jaune bg-fond-doux">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge ton="accent">{equipe === null ? "Équipe à confirmer" : equipe.nom}</Badge>
            <Badge ton={rencontre.domicile ? "attention" : "neutre"}>
              {rencontre.domicile ? "À domicile" : "En déplacement"}
            </Badge>
          </div>

          <p className="mt-3 text-2xl font-extrabold tracking-tight text-violet sm:text-3xl">
            <span className="text-encre-douce">{rencontre.domicile ? "contre " : "à "}</span>
            {rencontre.adversaire}
          </p>

          <p className="mt-2 text-base text-encre">
            <time dateTime={rencontre.dateHeure}>{formaterDateLongue(rencontre.dateHeure)}</time>
            {/* Jamais d'heure inventée : quand la FFBB ne l'a pas publiée, on le dit. */}
            {heure === null ? (
              <span className="text-encre-douce"> — horaire non communiqué</span>
            ) : (
              <>{` à ${heure}`}</>
            )}
          </p>

          <p className="mt-1 text-sm text-encre-douce">
            {rencontre.salle === null
              ? "Lieu non communiqué"
              : `${rencontre.salle.nom}, ${rencontre.salle.ville}`}
            {rencontre.journee === null ? "" : ` · journée ${String(rencontre.journee)}`}
          </p>
        </div>

        <div className="shrink-0">
          <BoutonLien href={`/matchs/${rencontre.slug}`}>Détail du match</BoutonLien>
        </div>
      </div>
    </Carte>
  );
}

function DerniersResultats({ derniers }: { derniers: readonly RencontreAffichee[] }) {
  if (derniers.length === 0) {
    return (
      <EtatVide titre="Pas encore de résultat">
        Les scores seront publiés après les premières rencontres de la saison.
      </EtatVide>
    );
  }

  return (
    <ul className="space-y-2">
      {derniers.map(({ rencontre, equipe }) => (
        <CarteMatch key={rencontre.id} rencontre={rencontre} equipe={equipe} />
      ))}
    </ul>
  );
}

function ApercuEquipes({ equipes }: { equipes: readonly Equipe[] }) {
  if (equipes.length === 0) {
    return (
      <EtatVide titre="Aucune équipe engagée">
        Les équipes de la saison seront annoncées dès l&apos;enregistrement des engagements FFBB.
      </EtatVide>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {equipes.map((equipe) => (
        <li key={equipe.id}>
          <Link
            href={`/equipes/${equipe.slug}`}
            className="block h-full rounded-lg border border-bordure bg-fond px-4 py-3 transition-colors hover:border-violet hover:bg-violet-voile"
          >
            <span className="block font-bold text-violet">{equipe.nom}</span>
            <span className="mt-0.5 block text-xs text-encre-douce">{equipe.competition}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Corps de la page d'accueil, séparé de `src/app/page.tsx` : la page va chercher
 * les données, ce composant ne fait que les afficher. C'est ce découpage qui permet
 * de le rendre en test avec des listes entièrement vides — saison qui démarre, site
 * tout neuf — et de vérifier que la page reste présentable sans une seule donnée.
 */
export function AccueilContenu({ prochain, derniers, articles, equipes }: ProprietesAccueil) {
  return (
    <>
      <Bandeau />

      <Conteneur className="space-y-14 py-12 sm:py-16">
        <section aria-labelledby="titre-prochain-match">
          <TitreSection lien={{ href: "/calendrier", libelle: "Tout le calendrier" }}>
            <span id="titre-prochain-match">Le prochain match</span>
          </TitreSection>
          <ProchainMatch prochain={prochain} />
        </section>

        <section aria-labelledby="titre-derniers-resultats">
          <TitreSection lien={{ href: "/resultats", libelle: "Tous les résultats" }}>
            <span id="titre-derniers-resultats">Les derniers résultats</span>
          </TitreSection>
          <DerniersResultats derniers={derniers} />
        </section>

        <section aria-labelledby="titre-actualites">
          <TitreSection lien={{ href: "/actualites", libelle: "Toutes les actualités" }}>
            <span id="titre-actualites">Les dernières actualités</span>
          </TitreSection>
          {articles.length === 0 ? (
            <EtatVide titre="Aucune actualité pour le moment">
              Les nouvelles du club — vie des équipes, événements, informations pratiques — seront
              publiées ici.
            </EtatVide>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((article) => (
                <li key={article.slug}>
                  <CarteArticle article={article} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="titre-equipes">
          <TitreSection lien={{ href: "/equipes", libelle: "Toutes les équipes" }}>
            <span id="titre-equipes">Les équipes du club</span>
          </TitreSection>
          <ApercuEquipes equipes={equipes} />
        </section>
      </Conteneur>
    </>
  );
}
