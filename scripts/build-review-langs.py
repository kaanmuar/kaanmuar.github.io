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
        "description": "QA-lab URL Review lee una página https pública y propone casos de prueba, con scripts iniciales, para Playwright, Cypress, Robot, Selenium, WebdriverIO, CodeceptJS, Selenide, TestNG, Watir, Cucumber, Behave, SpecFlow, Jest, Vitest, Mocha, Appium, Calabash, JMeter, Gatling y k6. Nombra axe-core, Lighthouse, BrowserStack, Applitools, Percy, Provar y Copado cuando corresponden. No los ejecuta. La página se puede leer en inglés, español, portugués, alemán, francés e italiano.",
        "og_description": "Una lectura https pública, una lista de tecnologías y casos de QA propuestos con scripts iniciales para veinte frameworks. Las herramientas especializadas se nombran cuando corresponden y no se ejecutan. Seis idiomas.",
        "twitter_title": "Lee la página pública. Propón los casos.",
        "twitter_description": "Una lectura pública de un sitio https, una lista de tecnologías y casos de QA propuestos. Una revisión completada por navegador y red. El informe se muestra una vez.",
        "gate": "Antes de leer una sola dirección.",
        "display": ["La página", "ya está hablando.", "Escribimos la", "lista de pruebas."],
    },
    "pt": {
        "language": "Portuguese",
        "native": "Português",
        "title": "A página já está falando.",
        "description": "QA-lab URL Review lê uma página https pública e propõe casos de teste, com scripts iniciais, para Playwright, Cypress, Robot, Selenium, WebdriverIO, CodeceptJS, Selenide, TestNG, Watir, Cucumber, Behave, SpecFlow, Jest, Vitest, Mocha, Appium, Calabash, JMeter, Gatling e k6. Nomeia axe-core, Lighthouse, BrowserStack, Applitools, Percy, Provar e Copado quando se aplicam. Não os executa. A página pode ser lida em inglês, espanhol, português, alemão, francês e italiano.",
        "og_description": "Uma leitura https pública, uma lista de tecnologias e casos de QA propostos com scripts iniciais para vinte frameworks. As ferramentas especializadas são nomeadas quando se aplicam e não são executadas. Seis idiomas.",
        "twitter_title": "Leia a página pública. Proponha os casos.",
        "twitter_description": "Uma leitura pública de um site https, uma lista de tecnologias e casos de QA propostos. Uma revisão concluída por navegador e rede. O relatório é mostrado uma vez.",
        "gate": "Antes de ler um único endereço.",
        "display": ["A página", "já está falando.", "Escrevemos a", "lista de testes."],
    },
    "de": {
        "language": "German",
        "native": "Deutsch",
        "title": "Die Seite spricht bereits.",
        "description": "QA-lab URL Review liest eine öffentliche https-Seite und schlägt Testfälle mit Startskripten für Playwright, Cypress, Robot, Selenium, WebdriverIO, CodeceptJS, Selenide, TestNG, Watir, Cucumber, Behave, SpecFlow, Jest, Vitest, Mocha, Appium, Calabash, JMeter, Gatling und k6 vor. Es nennt axe-core, Lighthouse, BrowserStack, Applitools, Percy, Provar und Copado, wenn sie zutreffen. Es führt sie nicht aus. Die Seite kann auf Englisch, Spanisch, Portugiesisch, Deutsch, Französisch und Italienisch gelesen werden.",
        "og_description": "Eine öffentliche https-Lesung, eine Technologieliste und vorgeschlagene QA-Fälle mit Startskripten für zwanzig Frameworks. Spezialwerkzeuge werden genannt, wenn sie zutreffen, und nicht gestartet. Sechs Sprachen.",
        "twitter_title": "Die öffentliche Seite lesen. Die Fälle vorschlagen.",
        "twitter_description": "Eine öffentliche Lesung einer https-Website, eine Technologieliste und vorgeschlagene QA-Fälle. Eine abgeschlossene Prüfung pro Browser und Netzwerk. Der Bericht wird einmal angezeigt.",
        "gate": "Bevor eine einzige Adresse gelesen wird.",
        "display": ["Die Seite", "spricht bereits.", "Wir schreiben die", "Testliste."],
    },
    "fr": {
        "language": "French",
        "native": "Français",
        "title": "La page parle déjà.",
        "description": "QA-lab URL Review lit une page https publique et propose des cas de test, avec des scripts de départ, pour Playwright, Cypress, Robot, Selenium, WebdriverIO, CodeceptJS, Selenide, TestNG, Watir, Cucumber, Behave, SpecFlow, Jest, Vitest, Mocha, Appium, Calabash, JMeter, Gatling et k6. Il nomme axe-core, Lighthouse, BrowserStack, Applitools, Percy, Provar et Copado lorsqu’ils s’appliquent. Il ne les exécute pas. La page peut être lue en anglais, espagnol, portugais, allemand, français et italien.",
        "og_description": "Une lecture https publique, une liste de technologies et des cas de QA proposés avec des scripts de départ pour vingt frameworks. Les outils spécialisés sont nommés lorsqu’ils s’appliquent et ne sont pas lancés. Six langues.",
        "twitter_title": "Lire la page publique. Proposer les cas.",
        "twitter_description": "Une lecture publique d’un site https, une liste de technologies et des cas de QA proposés. Une revue terminée par navigateur et par réseau. Le rapport est affiché une fois.",
        "gate": "Avant de lire une seule adresse.",
        "display": ["La page", "parle déjà.", "Nous écrivons la", "liste de tests."],
    },
    "it": {
        "language": "Italian",
        "native": "Italiano",
        "title": "La pagina sta già parlando.",
        "description": "QA-lab URL Review legge una pagina https pubblica e propone casi di test, con script iniziali, per Playwright, Cypress, Robot, Selenium, WebdriverIO, CodeceptJS, Selenide, TestNG, Watir, Cucumber, Behave, SpecFlow, Jest, Vitest, Mocha, Appium, Calabash, JMeter, Gatling e k6. Nomina axe-core, Lighthouse, BrowserStack, Applitools, Percy, Provar e Copado quando si applicano. Non li esegue. La pagina può essere letta in inglese, spagnolo, portoghese, tedesco, francese e italiano.",
        "og_description": "Una lettura https pubblica, un elenco di tecnologie e casi di QA proposti con script iniziali per venti framework. Gli strumenti specialistici vengono nominati quando si applicano e non vengono avviati. Sei lingue.",
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
    s = swap(s, "<title>The page is already talking. · QA-lab URL Review</title>", f"<title>{t['title']} · QA-lab URL Review</title>")
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
    s = swap(s, '<h1 id="gate-title">Before a single address is read.</h1>', f'<h1 id="gate-title" lang="{code}" translate="no">{t["gate"]}</h1>')
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
