import { describe, expect, it } from "vitest";
import { rendreMarkdown } from "@/domaine/markdown";

describe("rendreMarkdown — neutralisation du contenu dangereux", () => {
  it("supprime une balise script écrite dans le Markdown", () => {
    const html = rendreMarkdown("Bonjour\n\n<script>alert(1)</script>");

    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
    expect(html).toContain("<p>Bonjour</p>");
  });

  it("supprime une image porteuse d'un gestionnaire onerror", () => {
    const html = rendreMarkdown('<img src=x onerror="alert(1)">');

    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<img");
  });

  it("retire l'adresse d'un lien javascript: tout en gardant son libellé", () => {
    const html = rendreMarkdown("[cliquez ici](javascript:alert(1))");

    expect(html).not.toContain("javascript:");
    expect(html).toContain("cliquez ici");
    expect(html).not.toContain("href");
  });

  it("supprime une iframe", () => {
    const html = rendreMarkdown('<iframe src="https://exemple.test"></iframe>');

    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("exemple.test");
  });

  it("supprime un attribut de style ou d'événement sur un élément autorisé", () => {
    const html = rendreMarkdown('<p onclick="alert(1)" style="position:fixed">Texte</p>');

    expect(html).not.toContain("onclick");
    expect(html).not.toContain("style=");
  });

  it("neutralise une adresse d'image en data: URI", () => {
    const html = rendreMarkdown("![logo](data:text/html;base64,PHNjcmlwdD4=)");

    expect(html).not.toContain("data:text/html");
  });

  it("échappe les chevrons d'un texte qui n'est pas du HTML valide", () => {
    const html = rendreMarkdown("2 < 3 & 4 > 1");

    expect(html).toContain("&#x3C;");
    expect(html).toContain("&#x26;");
  });

  it("rend une chaîne vide pour un Markdown vide plutôt que de renvoyer autre chose", () => {
    expect(rendreMarkdown("")).toBe("");
  });
});

describe("rendreMarkdown — mise en forme préservée", () => {
  it("convertit les titres de niveau 2 et 3", () => {
    const html = rendreMarkdown("## Les créneaux\n\n### Le mercredi");

    expect(html).toContain("<h2>Les créneaux</h2>");
    expect(html).toContain("<h3>Le mercredi</h3>");
  });

  it("convertit une liste à puces en liste HTML", () => {
    const html = rendreMarkdown("- U9\n- U11\n- U15");

    expect(html).toContain("<ul>");
    expect(html).toContain("<li>U9</li>");
  });

  it("convertit une liste numérotée en liste ordonnée", () => {
    const html = rendreMarkdown("1. Premier\n2. Second");

    expect(html).toContain("<ol>");
    expect(html).toContain("<li>Premier</li>");
  });

  it("convertit le gras et l'italique", () => {
    const html = rendreMarkdown("Séances **gratuites** et _sans engagement_.");

    expect(html).toContain("<strong>gratuites</strong>");
    expect(html).toContain("<em>sans engagement</em>");
  });

  it("conserve un lien https avec son adresse", () => {
    const html = rendreMarkdown("[la FFBB](https://www.ffbb.com/)");

    expect(html).toContain('<a href="https://www.ffbb.com/">la FFBB</a>');
  });

  it("conserve un lien mailto", () => {
    const html = rendreMarkdown("[nous écrire](mailto:secretariat.socl.basket@gmail.com)");

    expect(html).toContain('href="mailto:secretariat.socl.basket@gmail.com"');
  });

  it("convertit une citation en blockquote", () => {
    const html = rendreMarkdown("> On ne change pas ce qui fonctionne.");

    expect(html).toContain("<blockquote>");
    expect(html).toContain("On ne change pas ce qui fonctionne.");
  });

  it("convertit un tableau GFM en tableau HTML", () => {
    const html = rendreMarkdown(
      "| Équipe | Points |\n| --- | ---: |\n| Seniors M1 | 74 |\n| Seniors F1 | 49 |",
    );

    expect(html).toContain("<table>");
    expect(html).toContain("<th>Équipe</th>");
    expect(html).toContain('<td align="right">74</td>');
  });

  it("convertit les autres marques GFM : barré et liste de cases à cocher", () => {
    const html = rendreMarkdown("~~annulé~~\n\n- [x] fait\n- [ ] à faire");

    expect(html).toContain("<del>annulé</del>");
    expect(html).toContain('type="checkbox"');
  });
});
