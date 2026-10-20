#!/usr/bin/env python3
"""Build qa-review-{es,pt,de,fr,it}.html from qa-review.html.

Only the head, the gate title, the stage headline, and the stored language
change; the body stays English and is translated in the browser.

    python3 scripts/build-review-langs.py            # write the pages
    python3 scripts/build-review-langs.py --check    # exit 1 if a page is stale
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = "https://carlosandmunoz.com/"
LOCALES = [("en", "en_US"), ("es", "es_CO"), ("pt", "pt_BR"), ("de", "de_DE"), ("fr", "fr_FR"), ("it", "it_IT")]

LANGS = {
    "es": {
        "language": "Spanish",
        "native": "Español",
        "title": "La página ya está hablando.",
        "seo_title": "QA-lab URL Review: SEO, GEO y casos de prueba desde una URL",
        "description": "Una página https pública, calificada en SEO, búsqueda con IA (GEO), analítica, seguridad, accesibilidad y velocidad, con casos de prueba para 20 frameworks.",
        "og_description": "Una lectura https pública, una lista de tecnologías y casos de QA propuestos con scripts iniciales para veinte frameworks. Un navegador sin interfaz corre axe-core, registra el rastreo antes y después de una elección de cookies y toma capturas. Las demás herramientas se nombran cuando corresponden y no se ejecutan. Seis idiomas.",
        "twitter_title": "Lee la página pública. Propón los casos.",
        "twitter_description": "Una lectura pública de un sitio https, una lista de tecnologías y casos de QA propuestos. Una revisión completada por navegador y red. El informe se muestra una vez.",
        "gate": "Antes de leer una sola dirección.",
        "display": ["La página", "ya está hablando.", "Escribimos la", "lista de pruebas."],
    },
    "pt": {
        "language": "Portuguese",
        "native": "Português",
        "title": "A página já está falando.",
        "seo_title": "QA-lab URL Review: SEO, GEO e casos de teste de uma URL",
        "description": "Uma página https pública, lida e avaliada em SEO, busca com IA (GEO), analytics, segurança, acessibilidade e velocidade, com casos de teste para 20 frameworks.",
        "og_description": "Uma leitura https pública, uma lista de tecnologias e casos de QA propostos com scripts iniciais para vinte frameworks. Um navegador headless roda o axe-core, registra o rastreamento antes e depois de uma escolha de cookies e tira capturas. As outras ferramentas são nomeadas quando se aplicam e não são executadas. Seis idiomas.",
        "twitter_title": "Leia a página pública. Proponha os casos.",
        "twitter_description": "Uma leitura pública de um site https, uma lista de tecnologias e casos de QA propostos. Uma revisão concluída por navegador e rede. O relatório é mostrado uma vez.",
        "gate": "Antes de ler um único endereço.",
        "display": ["A página", "já está falando.", "Escrevemos a", "lista de testes."],
    },
    "de": {
        "language": "German",
        "native": "Deutsch",
        "title": "Die Seite spricht bereits.",
        "seo_title": "QA-lab URL Review: SEO, GEO und Testfälle aus einer URL",
        "description": "Eine öffentliche https-Seite, bewertet nach SEO, KI-Suche (GEO), Analytics, Sicherheit, Barrierefreiheit und Tempo, mit Testfällen für 20 Frameworks.",
        "og_description": "Eine öffentliche https-Lesung, eine Technologieliste und vorgeschlagene QA-Fälle mit Startskripten für zwanzig Frameworks. Ein Headless-Browser führt axe-core aus, zeichnet Tracking vor und nach einer Cookie-Wahl auf und macht Screenshots. Andere Spezialwerkzeuge werden genannt, wenn sie zutreffen, und nicht gestartet. Sechs Sprachen.",
        "twitter_title": "Die öffentliche Seite lesen. Die Fälle vorschlagen.",
        "twitter_description": "Eine öffentliche Lesung einer https-Website, eine Technologieliste und vorgeschlagene QA-Fälle. Eine abgeschlossene Prüfung pro Browser und Netzwerk. Der Bericht wird einmal angezeigt.",
        "gate": "Bevor eine einzige Adresse gelesen wird.",
        "display": ["Die Seite", "spricht bereits.", "Wir schreiben die", "Testliste."],
    },
    "fr": {
        "language": "French",
        "native": "Français",
        "title": "La page parle déjà.",
        "seo_title": "QA-lab URL Review : SEO, GEO et cas de test depuis une URL",
        "description": "Une page https publique, lue et notée en SEO, recherche IA (GEO), analytics, sécurité, accessibilité et vitesse, avec des cas de test pour 20 frameworks.",
        "og_description": "Une lecture https publique, une liste de technologies et des cas de QA proposés avec des scripts de départ pour vingt frameworks. Un navigateur headless lance axe-core, relève le suivi avant et après un choix de cookies et prend des captures. Les autres outils spécialisés sont nommés lorsqu’ils s’appliquent et ne sont pas lancés. Six langues.",
        "twitter_title": "Lire la page publique. Proposer les cas.",
        "twitter_description": "Une lecture publique d’un site https, une liste de technologies et des cas de QA proposés. Une revue terminée par navigateur et par réseau. Le rapport est affiché une fois.",
        "gate": "Avant de lire une seule adresse.",
        "display": ["La page", "parle déjà.", "Nous écrivons la", "liste de tests."],
    },
    "it": {
        "language": "Italian",
        "native": "Italiano",
        "title": "La pagina sta già parlando.",
        "seo_title": "QA-lab URL Review: SEO, GEO e casi di test da un URL",
        "description": "Una pagina https pubblica, letta e valutata per SEO, ricerca IA (GEO), analytics, sicurezza, accessibilità e velocità, con casi di test per 20 framework.",
        "og_description": "Una lettura https pubblica, un elenco di tecnologie e casi di QA proposti con script iniziali per venti framework. Un browser headless esegue axe-core, registra il tracciamento prima e dopo una scelta sui cookie e fa screenshot. Gli altri strumenti specialistici vengono nominati quando si applicano e non vengono avviati. Sei lingue.",
        "twitter_title": "Leggi la pagina pubblica. Proponi i casi.",
        "twitter_description": "Una lettura pubblica di un sito https, un elenco di tecnologie e casi di QA proposti. Una revisione completata per browser e rete. Il report viene mostrato una volta.",
        "gate": "Prima di leggere un solo indirizzo.",
        "display": ["La pagina", "sta già parlando.", "Scriviamo la", "lista dei test."],
    },
}


def swap(text, old, new, count=1):
    found = text.count(old)
    if found < count:
        raise SystemExit(f"expected {count}x, found {found}x: {old[:90]!r}")
    return text.replace(old, new, count)


def locale_block(code):
    order = [loc for loc in LOCALES if loc[0] == code] + [loc for loc in LOCALES if loc[0] != code]
    lines = [f'    <meta property="og:locale" content="{order[0][1]}">']
    lines += [f'    <meta property="og:locale:alternate" content="{loc}">' for _, loc in order[1:]]
    return "\n".join(lines)


def build(source, code):
    t = LANGS[code]
    page = f"qa-review-{code}.html"
    url = BASE + page
    s = source
    s = swap(s, '<html lang="en">', f'<html lang="{code}">')
    s = swap(s, "<title>QA-lab URL Review: SEO, GEO, and QA test cases from a URL</title>", f"<title>{t['seo_title']}</title>")
    head_desc = s[s.index('<meta name="description" content="'):]
    head_desc = head_desc[: head_desc.index(">") + 1]
    s = swap(s, head_desc, f'<meta name="description" content="{t["description"]}">')
    s = swap(s, '<meta name="language" content="English">', f'<meta name="language" content="{t["language"]}">')
    s = swap(s, '<link rel="canonical" href="https://carlosandmunoz.com/qa-review.html">', f'<link rel="canonical" href="{url}">')
    s = swap(s, locale_block("en"), locale_block(code))
    s = swap(s, '<meta property="og:url" content="https://carlosandmunoz.com/qa-review.html">', f'<meta property="og:url" content="{url}">')
    s = swap(s, '<meta property="og:title" content="The page is already talking. · QA-lab URL Review">', f'<meta property="og:title" content="{t["title"]} · QA-lab URL Review">')
    og_desc = s[s.index('<meta property="og:description" content="'):]
    og_desc = og_desc[: og_desc.index(">") + 1]
    s = swap(s, og_desc, f'<meta property="og:description" content="{t["og_description"]}">')
    s = swap(s, '<meta name="twitter:title" content="Read the public page. Propose the cases. · QA-lab URL Review">', f'<meta name="twitter:title" content="{t["twitter_title"]} · QA-lab URL Review">')
    tw_desc = s[s.index('<meta name="twitter:description" content="'):]
    tw_desc = tw_desc[: tw_desc.index(">") + 1]
    s = swap(s, tw_desc, f'<meta name="twitter:description" content="{t["twitter_description"]}">')
    s = swap(s, '"url": "https://carlosandmunoz.com/qa-review.html",\n                "applicationCategory"', f'"url": "{url}",\n                "applicationCategory"')
    s = swap(s, '"item": "https://carlosandmunoz.com/qa-review.html"', f'"item": "{url}"')
    s = swap(s, '"url": "https://carlosandmunoz.com/qa-review.html#service-facts"', f'"url": "{url}#service-facts"')
    s = swap(s, '<div class="brand"><a href="qa-review.html">', f'<div class="brand"><a href="{page}">')
    flag_en = 'src="https://hatscripts.github.io/circle-flags/flags/gb.svg" alt="English"'
    s = swap(s, flag_en, f'src="https://hatscripts.github.io/circle-flags/flags/{code}.svg" alt="{t["native"]}"', 2)
    s = swap(s, '<h2 id="gate-title">Before a single address is read.</h2>', f'<h2 id="gate-title" lang="{code}" translate="no">{t["gate"]}</h2>')
    d = t["display"]
    s = swap(
        s,
        '<h1 id="studio-title" class="display">\n'
        "                <span>The page is</span>\n"
        '                <span class="display-em">already talking.</span>\n'
        "                <span>We write the</span>\n"
        "                <span>test list.</span>",
        f'<h1 id="studio-title" class="display" lang="{code}" translate="no">\n'
        f"                <span>{d[0]}</span>\n"
        f'                <span class="display-em">{d[1]}</span>\n'
        f"                <span>{d[2]}</span>\n"
        f"                <span>{d[3]}</span>",
    )
    s = swap(s, '<script src="js/site-i18n.js', f'<script>try{{localStorage.setItem("cv-preferred-lang","{code}")}}catch(e){{}}</script>\n<script src="js/site-i18n.js')
    return page, s


def main():
    check = "--check" in sys.argv
    source = (ROOT / "qa-review.html").read_text(encoding="utf-8")
    stale = []
    for code in LANGS:
        page, html = build(source, code)
        target = ROOT / page
        if check:
            if not target.exists() or target.read_text(encoding="utf-8") != html:
                stale.append(page)
        else:
            target.write_text(html, encoding="utf-8")
            print("wrote", page)
    if stale:
        print("stale:", ", ".join(stale))
        sys.exit(1)


if __name__ == "__main__":
    main()
