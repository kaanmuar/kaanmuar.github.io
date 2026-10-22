#!/usr/bin/env python3
"""Build qa-review-{es,pt,de,fr,it}.html from qa-review.html.

The head, the structured data, the consent screen, the stage headline, the noscript
Live Reports text, and the stored language are translated by hand (review_langs_copy.py);
the rest of the body stays English and is translated in the browser. The noscript text on
every page, English included, is written from assets/live-reports/index.json.

    python3 scripts/build-review-langs.py            # write the pages
    python3 scripts/build-review-langs.py --check    # exit 1 if a page is stale
"""
import json
import pathlib
import re
import sys

from review_langs_copy import AND, COPY, DATE, LIVE, LIVE_EXAMPLES, MONTHS, GATE_LINKS, SAMPLE

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = "https://carlosandmunoz.com/"
# Spanish copy is Latin American (es-419, tú); Portuguese is Brazilian. A review analyzes pages; it never "reads" them.
LOCALES = [("en", "en_US"), ("es", "es_CO"), ("pt", "pt_BR"), ("de", "de_DE"), ("fr", "fr_FR"), ("it", "it_IT")]

LANGS = {
    "es": {
        "language": "Spanish",
        "native": "Español",
        "title": "La página ya está hablando.",
        "seo_title": "QA-lab URL Review: SEO, GEO y casos de prueba desde una URL",
        "description": "Una página https pública, analizada y calificada en SEO, búsqueda con IA (GEO), analítica, seguridad, accesibilidad y velocidad, con casos de prueba para 20 frameworks.",
        "og_description": "Un análisis público por https, calificado en SEO, GEO, analítica, seguridad, accesibilidad y rendimiento, con una lista de qué corregir primero y casos de QA propuestos con scripts iniciales para veinte frameworks. Un navegador sin interfaz ejecuta axe-core, registra el rastreo antes y después de una elección de cookies y toma capturas de pantalla. También revisa widgets de chat, páginas legales, librerías desactualizadas, Safe Browsing, el vencimiento del dominio y la seguridad del correo. Inicia sesión con tu correo o con una cuenta que ya tienes. Las demás herramientas especializadas se nombran cuando corresponden y no se ejecutan. Seis idiomas.",
        "twitter_title": "Analiza la página pública. Propón los casos.",
        "twitter_description": "Un análisis público de un sitio https, una lista de tecnologías y casos de QA propuestos. Inicia sesión; una revisión incluida por navegador y red. Las ejecuciones con sesión iniciada aparecen en la página de tu cuenta.",
        "gate": "Antes de analizar una sola dirección.",
        "display": ["La página", "ya está hablando.", "Escribimos la", "lista de pruebas."],
    },
    "pt": {
        "language": "Portuguese",
        "native": "Português",
        "title": "A página já está falando.",
        "seo_title": "QA-lab URL Review: SEO, GEO e casos de teste de uma URL",
        "description": "Uma página https pública, analisada e avaliada em SEO, busca com IA (GEO), analytics, segurança, acessibilidade e velocidade, com casos de teste para 20 frameworks.",
        "og_description": "Uma análise pública via https, avaliada em SEO, GEO, analytics, segurança, acessibilidade e desempenho, com uma lista do que corrigir primeiro e casos de QA propostos com scripts iniciais para vinte frameworks. Um navegador headless executa o axe-core, registra o rastreamento antes e depois de uma escolha de cookies e faz capturas de tela. Também verifica widgets de chat, páginas legais, bibliotecas desatualizadas, Safe Browsing, o vencimento do domínio e a segurança do e-mail. Entre com seu e-mail ou com uma conta que você já tem. As outras ferramentas especializadas são citadas quando se aplicam e não são executadas. Seis idiomas.",
        "twitter_title": "Analise a página pública. Proponha os casos.",
        "twitter_description": "Uma análise pública de um site https, uma lista de tecnologias e casos de QA propostos. Entre; uma revisão incluída por navegador e rede. As execuções com login aparecem na página da sua conta.",
        "gate": "Antes de analisar um único endereço.",
        "display": ["A página", "já está falando.", "Escrevemos a", "lista de testes."],
    },
    "de": {
        "language": "German",
        "native": "Deutsch",
        "title": "Die Seite spricht bereits.",
        "seo_title": "QA-lab URL Review: SEO, GEO und Testfälle aus einer URL",
        "description": "Eine öffentliche https-Seite, geprüft und bewertet nach SEO, KI-Suche (GEO), Analytics, Sicherheit, Barrierefreiheit und Tempo, mit Testfällen für 20 Frameworks.",
        "og_description": "Eine öffentliche https-Prüfung, bewertet nach SEO, GEO, Analytics, Sicherheit, Barrierefreiheit und Performance, mit einer Liste der dringendsten Korrekturen und vorgeschlagenen QA-Fällen mit Startskripten für zwanzig Frameworks. Ein Headless-Browser führt axe-core aus, zeichnet Tracking vor und nach einer Cookie-Wahl auf und macht Screenshots. Außerdem prüft sie Chat-Widgets, Rechtsseiten, veraltete Bibliotheken, Safe Browsing, den Domain-Ablauf und die E-Mail-Sicherheit. Anmeldung per E-Mail oder mit einem bestehenden Konto. Andere Spezialwerkzeuge werden genannt, wenn sie zutreffen, und nicht gestartet. Sechs Sprachen.",
        "twitter_title": "Die öffentliche Seite prüfen. Die Fälle vorschlagen.",
        "twitter_description": "Eine öffentliche Prüfung einer https-Website, eine Technologieliste und vorgeschlagene QA-Fälle. Anmelden, dann eine enthaltene Prüfung pro Browser und Netzwerk. Läufe mit Anmeldung stehen auf Ihrer Kontoseite.",
        "gate": "Bevor eine einzige Adresse geprüft wird.",
        "display": ["Die Seite", "spricht bereits.", "Wir schreiben die", "Testliste."],
    },
    "fr": {
        "language": "French",
        "native": "Français",
        "title": "La page parle déjà.",
        "seo_title": "QA-lab URL Review : SEO, GEO et cas de test depuis une URL",
        "description": "Une page https publique, analysée et notée en SEO, recherche IA (GEO), analytics, sécurité, accessibilité et vitesse, avec des cas de test pour 20 frameworks.",
        "og_description": "Une analyse publique en https, notée en SEO, GEO, analytics, sécurité, accessibilité et performance, avec une liste des corrections prioritaires et des cas de QA proposés avec des scripts de départ pour vingt frameworks. Un navigateur headless lance axe-core, relève le suivi avant et après un choix de cookies et prend des captures d’écran. Elle contrôle aussi les widgets de chat, les pages légales, les bibliothèques obsolètes, Safe Browsing, l’expiration du domaine et la sécurité des e-mails. Connexion par e-mail ou avec un compte que vous avez déjà. Les autres outils spécialisés sont nommés lorsqu’ils s’appliquent et ne sont pas lancés. Six langues.",
        "twitter_title": "Analyser la page publique. Proposer les cas.",
        "twitter_description": "Une analyse publique d’un site https, une liste de technologies et des cas de QA proposés. Connectez-vous ; une analyse incluse par navigateur et réseau. Les exécutions connectées figurent sur la page de votre compte.",
        "gate": "Avant d’analyser une seule adresse.",
        "display": ["La page", "parle déjà.", "Nous écrivons la", "liste de tests."],
    },
    "it": {
        "language": "Italian",
        "native": "Italiano",
        "title": "La pagina sta già parlando.",
        "seo_title": "QA-lab URL Review: SEO, GEO e casi di test da un URL",
        "description": "Una pagina https pubblica, analizzata e valutata per SEO, ricerca IA (GEO), analytics, sicurezza, accessibilità e velocità, con casi di test per 20 framework.",
        "og_description": "Un’analisi pubblica via https, valutata per SEO, GEO, analytics, sicurezza, accessibilità e prestazioni, con un elenco di cosa sistemare prima e casi di QA proposti con script iniziali per venti framework. Un browser headless esegue axe-core, registra il tracciamento prima e dopo una scelta sui cookie e fa screenshot. Controlla anche widget di chat, pagine legali, librerie obsolete, Safe Browsing, scadenza del dominio e sicurezza dell’email. Accedi con la tua email o con un account che hai già. Gli altri strumenti specialistici vengono nominati quando si applicano e non vengono avviati. Sei lingue.",
        "twitter_title": "Analizza la pagina pubblica. Proponi i casi.",
        "twitter_description": "Un’analisi pubblica di un sito https, un elenco di tecnologie e casi di QA proposti. Accedi; una revisione inclusa per browser e rete. Le esecuzioni con accesso sono elencate nella pagina del tuo account.",
        "gate": "Prima di analizzare un solo indirizzo.",
        "display": ["La pagina", "sta già parlando.", "Scriviamo la", "lista dei test."],
    },
}


def swap(text, old, new, count=1):
    found = text.count(old)
    if found < count:
        raise SystemExit(f"expected {count}x, found {found}x: {old[:90]!r}")
    return text.replace(old, new, count)


def fmt_date(code, iso):
    y, m, d = (int(x) for x in iso.split("-"))
    return DATE[code].format(y=y, m=MONTHS[code][m - 1], d=d)


def live_text(code, data):
    """The noscript Live Reports paragraph, from the published index."""
    avg = data["averages"]
    rows = sorted(data["reports"], key=lambda r: (-r["overall"], r["name"]))
    top = [f"{r['name']} {r['overall']}" for r in rows[:4]]
    since = min(r["read"] for r in data["reports"])
    return LIVE[code].format(
        date=fmt_date(code, data["generatedAt"]), count=data["count"], sectors=len(data["sectors"]),
        since=fmt_date(code, since), overall=avg["overall"], top=", ".join(top[:-1]) + AND[code] + top[-1], **avg["areas"],
    ) + LIVE_EXAMPLES[code]


NOSCRIPT = '<div class="live-main" data-live-app><noscript><p class="live-lede">'


def with_live(s, code, data):
    start = s.index(NOSCRIPT) + len(NOSCRIPT)
    end = s.index("</p></noscript>", start)
    head = s[:start] if code == "en" else s[:start - 1] + f' lang="{code}" translate="no">'
    return head + live_text(code, data) + s[end:]


def retag(s, start, end, body, code):
    """Swap what follows the unique `start` up to `end`, and mark its first tag as hand-translated."""
    if s.count(start) != 1:
        raise SystemExit(f"expected 1x, found {s.count(start)}x: {start[:90]!r}")
    i = s.index(start)
    j = s.index(end, i + len(start))
    head = re.sub(r"^<(\w+)([^>]*)>", lambda m: f'<{m.group(1)}{m.group(2)} lang="{code}" translate="no">', start, count=1)
    return s[:i] + head + body + s[j:]


def gate(s, code):
    g = COPY[code]["gate"]
    a = s.index('<div id="gate" class="gate">')
    b = s.index("</form>", a)
    part = s[a:b]
    part = retag(part, '<p class="lede">', "</p>", g["lede"], code)
    part = retag(part, '<p class="sample-line">', "</p>", SAMPLE.format(**g["sample"]), code)
    part = retag(part, '<p class="records-note">', "</p>", g["legal"]["lead"] + " " + GATE_LINKS.format(**g["legal"]), code)
    part = retag(part, '<label class="check"><input type="checkbox" id="terms-all">', "</label>", " " + g["all"], code)
    for n in range(1, 11):
        part = retag(part, f'<label class="check"><input type="checkbox" name="t{n}">', "</label>", " " + g[f"t{n}"], code)
    part = retag(part, '<p class="records-note" id="records-note">', "</p>", g["records"], code)
    part = retag(part, '<button class="btn btn-primary" id="accept" type="submit" disabled>', "</button>", g["accept"], code)
    return s[:a] + part + s[b:]


def structured(s, code):
    c = COPY[code]
    line = lambda text: json.dumps(text, ensure_ascii=False)
    a = s.index('"description": "Sign in and submit a public https URL.')
    s = s[:a] + '"description": ' + line(c["description"]) + s[s.index(",\n", a):]
    a = s.index('"description": "QA-lab URL Review analyzes one public https address,')
    s = s[:a] + '"description": ' + line(c["organization"]) + s[s.index(",\n", a):]
    a = s.index('"featureList": [\n') + len('"featureList": [\n')
    b = s.index("\n                ],\n                \"inLanguage\"", a)
    s = s[:a] + ",\n".join(" " * 20 + line(item) for item in c["features"]) + s[b:]
    a = s.index('"mainEntity": [\n') + len('"mainEntity": [\n')
    b = s.index("\n                ]\n            }\n        ]\n    }\n    </script>", a)
    pad = " " * 20
    items = [
        pad + "{\n" + pad + '    "@type": "Question",\n' + pad + '    "name": ' + line(q) + ",\n"
        + pad + '    "acceptedAnswer": {\n' + pad + '        "@type": "Answer",\n' + pad + '        "text": ' + line(ans) + "\n"
        + pad + "    }\n" + pad + "}"
        for q, ans in c["faq"]
    ]
    return s[:a] + ",\n".join(items) + s[b:]


def locale_block(code):
    order = [loc for loc in LOCALES if loc[0] == code] + [loc for loc in LOCALES if loc[0] != code]
    lines = [f'    <meta property="og:locale" content="{order[0][1]}">']
    lines += [f'    <meta property="og:locale:alternate" content="{loc}">' for _, loc in order[1:]]
    return "\n".join(lines)


def build(source, code, data):
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
    s = swap(s, '<meta name="twitter:title" content="Analyze the public page. Propose the cases. · QA-lab URL Review">', f'<meta name="twitter:title" content="{t["twitter_title"]} · QA-lab URL Review">')
    tw_desc = s[s.index('<meta name="twitter:description" content="'):]
    tw_desc = tw_desc[: tw_desc.index(">") + 1]
    s = swap(s, tw_desc, f'<meta name="twitter:description" content="{t["twitter_description"]}">')
    s = swap(s, '"url": "https://carlosandmunoz.com/qa-review.html",\n                "applicationCategory"', f'"url": "{url}",\n                "applicationCategory"')
    s = swap(s, '"item": "https://carlosandmunoz.com/qa-review.html"', f'"item": "{url}"')
    s = swap(s, '"url": "https://carlosandmunoz.com/qa-review.html#service-facts"', f'"url": "{url}#service-facts"')
    s = swap(s, '<div class="brand"><a href="qa-review.html">', f'<div class="brand"><a href="{page}">')
    flag_en = 'src="https://hatscripts.github.io/circle-flags/flags/gb.svg" alt="English"'
    s = swap(s, flag_en, f'src="https://hatscripts.github.io/circle-flags/flags/{code}.svg" alt="{t["native"]}"', 2)
    s = swap(s, '<h2 id="gate-title">Before a single address is analyzed.</h2>', f'<h2 id="gate-title" lang="{code}" translate="no">{t["gate"]}</h2>')
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
    s = structured(s, code)
    s = gate(s, code)
    s = with_live(s, code, data)
    s = swap(s, '<script src="js/site-i18n.js', f'<script>try{{localStorage.setItem("cv-preferred-lang","{code}")}}catch(e){{}}</script>\n<script src="js/site-i18n.js')
    return page, s


def main(check=None):
    check = "--check" in sys.argv if check is None else check
    data = json.loads((ROOT / "assets/live-reports/index.json").read_text(encoding="utf-8"))
    english = ROOT / "qa-review.html"
    current = english.read_text(encoding="utf-8")
    source = with_live(current, "en", data)
    stale = []
    if source != current:
        if check:
            stale.append(english.name)
        else:
            english.write_text(source, encoding="utf-8")
            print("wrote", english.name)
    for code in LANGS:
        page, html = build(source, code, data)
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
    return stale


if __name__ == "__main__":
    main()
