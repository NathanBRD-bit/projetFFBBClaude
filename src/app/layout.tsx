import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SOCL Basket",
    template: "%s · SOCL Basket",
  },
  description:
    "Site officiel du club de basket SOCL : équipes, calendrier, résultats et actualités.",
};

// Props typées explicitement plutôt que via le global `LayoutProps` généré par Next :
// ce global n'existe qu'après un build, or `npm run types` tourne avant `npm run build` en CI.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-fond text-encre">{children}</body>
    </html>
  );
}
