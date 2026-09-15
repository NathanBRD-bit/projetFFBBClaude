import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EnTete } from "@/composants/public/en-tete";
import { PiedDePage } from "@/composants/public/pied-de-page";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SOCL Basket — Stade Olympique Candé Loiré",
    template: "%s · SOCL Basket",
  },
  description:
    "Site officiel du Stade Olympique Candé Loiré Basket : calendrier, résultats, équipes et actualités du club.",
};

// Props typées explicitement plutôt que via le global `LayoutProps` généré par Next :
// ce global n'existe qu'après un build, or `npm run types` tourne avant `npm run build` en CI.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-fond text-encre">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-jaune focus:px-4 focus:py-2 focus:font-bold focus:text-violet"
        >
          Aller au contenu
        </a>
        <EnTete />
        <main id="contenu" className="flex-1">
          {children}
        </main>
        <PiedDePage />
      </body>
    </html>
  );
}
