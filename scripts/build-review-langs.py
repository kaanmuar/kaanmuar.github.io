#!/usr/bin/env python3
"""Build qa-review-{es,pt,de,fr,it}.html from qa-review.html, and qa-review-pay-{es,pt,de,fr,it}.html
from qa-review-pay.html with the copy in js/qa-review-pay-copy.js.

The head, the structured data, the consent screen, the stage headline, the hero stats, the price list, the noscript
Live Reports text, and the stored language are translated by hand (review_langs_copy.py).
The rest of the body ships translated too, so search engines and visitors without JavaScript get one language:
what the browser would write comes from its copy tables (js/qa-review-*.js, js/site-glossary.js), and the
text no table holds from review_langs_body.py. The noscript text on
every page, English included, is written from assets/live-reports/index.json.

    python3 scripts/build-review-langs.py            # write the pages
    python3 scripts/build-review-langs.py --check    # exit 1 if a page is stale
"""
import json
import pathlib
import re
import sys
from html.parser import HTMLParser

from review_langs_body import BODY, WRITTEN
from review_langs_copy import AND, COMPARE_NOTE, COPY, DATE, FACTS, HEADER, LIVE, LIVE_EXAMPLES, MONTHS, GATE_LINKS, SAMPLE, SKIP

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = "https://carlosandmunoz.com/"
# Spanish copy is Latin American (es-419, tú); Portuguese is Brazilian. A review analyzes pages; it never "reads" them.
LOCALES = [("en", "en_US"), ("es", "es_CO"), ("pt", "pt_BR"), ("de", "de_DE"), ("fr", "fr_FR"), ("it", "it_IT")]

LANGS = {
    "es": {
        "language": "Spanish",
        "native": "Español",
        "title": "Encuentra fugas, fallas y bloqueos primero.",
        "seo_title": "QA-lab URL Review: SEO, GEO y casos de prueba desde una URL",
        "description": "Una página https pública, analizada y calificada en SEO, búsqueda con IA (GEO), analítica, seguridad, accesibilidad y velocidad, con casos de prueba para 20 frameworks.",
        "og_description": "Un análisis público por https, calificado en SEO, GEO, analítica, seguridad, accesibilidad y rendimiento, con una lista de qué corregir primero y casos de QA propuestos con scripts iniciales para veinte frameworks. Un navegador sin interfaz ejecuta axe-core, registra el rastreo antes y después de una elección de cookies y toma capturas de pantalla. También revisa widgets de chat, páginas legales, librerías desactualizadas, Safe Browsing, el vencimiento del dominio y la seguridad del correo. Inicia sesión con tu correo o con una cuenta que ya tienes. Las demás herramientas especializadas se nombran cuando corresponden y no se ejecutan. Seis idiomas.",
        "twitter_title": "Privacidad, accesibilidad y seguridad desde una URL.",
        "twitter_description": "Un análisis público de un sitio https, una lista de tecnologías y casos de QA propuestos. Inicia sesión; una revisión incluida por navegador y red. Las ejecuciones con sesión iniciada aparecen en la página de tu cuenta.",
        "gate": "Antes de analizar una sola dirección.",
        "display": ["Encuentra fugas,", "fallas y bloqueos", "antes que tus clientes", "o un regulador."],
    },
    "pt": {
        "language": "Portuguese",
        "native": "Português",
        "title": "Encontre vazamentos, falhas e bloqueios primeiro.",
        "seo_title": "QA-lab URL Review: SEO, GEO e casos de teste de uma URL",
        "description": "Uma página https pública, analisada e avaliada em SEO, busca com IA (GEO), analytics, segurança, acessibilidade e velocidade, com casos de teste para 20 frameworks.",
        "og_description": "Uma análise pública via https, avaliada em SEO, GEO, analytics, segurança, acessibilidade e desempenho, com uma lista do que corrigir primeiro e casos de QA propostos com scripts iniciais para vinte frameworks. Um navegador headless executa o axe-core, registra o rastreamento antes e depois de uma escolha de cookies e faz capturas de tela. Também verifica widgets de chat, páginas legais, bibliotecas desatualizadas, Safe Browsing, o vencimento do domínio e a segurança do e-mail. Entre com seu e-mail ou com uma conta que você já tem. As outras ferramentas especializadas são citadas quando se aplicam e não são executadas. Seis idiomas.",
        "twitter_title": "Privacidade, acessibilidade e segurança a partir de uma URL.",
        "twitter_description": "Uma análise pública de um site https, uma lista de tecnologias e casos de QA propostos. Entre; uma revisão incluída por navegador e rede. As execuções com login aparecem na página da sua conta.",
        "gate": "Antes de analisar um único endereço.",
        "display": ["Encontre vazamentos,", "falhas e bloqueios", "antes dos seus clientes", "ou de um regulador."],
    },
    "de": {
        "language": "German",
        "native": "Deutsch",
        "title": "Lecks, Fehler und Sperren zuerst finden.",
        "seo_title": "QA-lab URL Review: SEO, GEO und Testfälle aus einer URL",
        "description": "Eine öffentliche https-Seite, geprüft und bewertet nach SEO, KI-Suche (GEO), Analytics, Sicherheit, Barrierefreiheit und Tempo, mit Testfällen für 20 Frameworks.",
        "og_description": "Eine öffentliche https-Prüfung, bewertet nach SEO, GEO, Analytics, Sicherheit, Barrierefreiheit und Performance, mit einer Liste der dringendsten Korrekturen und vorgeschlagenen QA-Fällen mit Startskripten für zwanzig Frameworks. Ein Headless-Browser führt axe-core aus, zeichnet Tracking vor und nach einer Cookie-Wahl auf und macht Screenshots. Außerdem prüft sie Chat-Widgets, Rechtsseiten, veraltete Bibliotheken, Safe Browsing, den Domain-Ablauf und die E-Mail-Sicherheit. Anmeldung per E-Mail oder mit einem bestehenden Konto. Andere Spezialwerkzeuge werden genannt, wenn sie zutreffen, und nicht gestartet. Sechs Sprachen.",
        "twitter_title": "Datenschutz, Barrierefreiheit und Sicherheit aus einer URL.",
        "twitter_description": "Eine öffentliche Prüfung einer https-Website, eine Technologieliste und vorgeschlagene QA-Fälle. Anmelden, dann eine enthaltene Prüfung pro Browser und Netzwerk. Läufe mit Anmeldung stehen auf Ihrer Kontoseite.",
        "gate": "Bevor eine einzige Adresse geprüft wird.",
        "display": ["Finden Sie Lecks,", "Fehler und Sperren,", "bevor Kunden", "oder Behörden es tun."],
    },
    "fr": {
        "language": "French",
        "native": "Français",
        "title": "Trouvez d’abord les fuites, pannes et blocages.",
        "seo_title": "QA-lab URL Review : SEO, GEO et cas de test depuis une URL",
        "description": "Une page https publique, analysée et notée en SEO, recherche IA (GEO), analytics, sécurité, accessibilité et vitesse, avec des cas de test pour 20 frameworks.",
        "og_description": "Une analyse publique en https, notée en SEO, GEO, analytics, sécurité, accessibilité et performance, avec une liste des corrections prioritaires et des cas de QA proposés avec des scripts de départ pour vingt frameworks. Un navigateur headless lance axe-core, relève le suivi avant et après un choix de cookies et prend des captures d’écran. Elle contrôle aussi les widgets de chat, les pages légales, les bibliothèques obsolètes, Safe Browsing, l’expiration du domaine et la sécurité des e-mails. Connexion par e-mail ou avec un compte que vous avez déjà. Les autres outils spécialisés sont nommés lorsqu’ils s’appliquent et ne sont pas lancés. Six langues.",
        "twitter_title": "Confidentialité, accessibilité et sécurité depuis une URL.",
        "twitter_description": "Une analyse publique d’un site https, une liste de technologies et des cas de QA proposés. Connectez-vous ; une analyse incluse par navigateur et réseau. Les exécutions connectées figurent sur la page de votre compte.",
        "gate": "Avant d’analyser une seule adresse.",
        "display": ["Trouvez les fuites,", "pannes et blocages", "avant vos clients", "ou un régulateur."],
    },
    "it": {
        "language": "Italian",
        "native": "Italiano",
        "title": "Trova prima perdite, guasti e blocchi.",
        "seo_title": "QA-lab URL Review: SEO, GEO e casi di test da un URL",
        "description": "Una pagina https pubblica, analizzata e valutata per SEO, ricerca IA (GEO), analytics, sicurezza, accessibilità e velocità, con casi di test per 20 framework.",
        "og_description": "Un’analisi pubblica via https, valutata per SEO, GEO, analytics, sicurezza, accessibilità e prestazioni, con un elenco di cosa sistemare prima e casi di QA proposti con script iniziali per venti framework. Un browser headless esegue axe-core, registra il tracciamento prima e dopo una scelta sui cookie e fa screenshot. Controlla anche widget di chat, pagine legali, librerie obsolete, Safe Browsing, scadenza del dominio e sicurezza dell’email. Accedi con la tua email o con un account che hai già. Gli altri strumenti specialistici vengono nominati quando si applicano e non vengono avviati. Sei lingue.",
        "twitter_title": "Privacy, accessibilità e sicurezza da un URL.",
        "twitter_description": "Un’analisi pubblica di un sito https, un elenco di tecnologie e casi di QA proposti. Accedi; una revisione inclusa per browser e rete. Le esecuzioni con accesso sono elencate nella pagina del tuo account.",
        "gate": "Prima di analizzare un solo indirizzo.",
        "display": ["Trova perdite,", "guasti e blocchi", "prima dei clienti", "o di un’autorità."],
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


def header(s, code):
    """The header buttons and the toggle names, hand-written so the page reads in one language before any translator runs."""
    h = HEADER[code]
    mark = f' lang="{code}" translate="no"'
    s = swap(s, '<a class="btn btn-ghost" href="qa-lab.html">Regression lab</a>', f'<a class="btn btn-ghost" href="qa-lab.html"{mark}>{h["lab"]}</a>')
    s = swap(s, '<a class="btn btn-ghost" href="qa-review-account.html">Your reviews</a>', f'<a class="btn btn-ghost" href="qa-review-account.html"{mark}>{h["reviews"]}</a>', 2)
    s = swap(s, '<button class="btn btn-ghost" id="tour-start-btn" type="button">How this review works</button>', f'<button class="btn btn-ghost" id="tour-start-btn" type="button"{mark}>{h["tour"]}</button>')
    s = swap(s, '<button class="btn btn-ghost" id="share-open" type="button" disabled>Report</button>', f'<button class="btn btn-ghost" id="share-open" type="button" disabled{mark}>{h["report"]}</button>')
    s = swap(s, 'type="button" aria-label="Language">', f'type="button" aria-label="{h["language"]}">', 2)
    return swap(s, '<button id="theme-toggle" type="button" aria-label="Toggle dark mode">', f'<button id="theme-toggle" type="button" aria-label="{h["theme"]}">')


def gate(s, code):
    g = COPY[code]["gate"]
    a = s.index('<div id="gate" class="gate" hidden>')
    b = s.index("</form>", a)
    part = s[a:b]
    part = swap(part, 'id="gate-close" type="button" aria-label="Close"', f'id="gate-close" type="button" aria-label="{g["close"]}"')
    part = swap(part, 'role="status" data-text="The review of {host} starts as soon as you accept." hidden>',
                f'role="status" data-text="{g["waiting"]}" lang="{code}" translate="no" hidden>')
    part = retag(part, '<p class="gate-tagline">', "</p>", g["tagline"], code)
    for key, (title, gist) in g["cards"].items():
        part = retag(part, f'<b class="tg-title" data-tg="{key}">', "</b>", title, code)
        part = retag(part, f'<span class="tg-gist" data-tg="{key}">', "</span>", gist, code)
    part = retag(part, '<p class="lede">', "</p>", g["lede"], code)
    part = retag(part, '<p class="sample-line">', "</p>", SAMPLE.format(**g["sample"]), code)
    part = retag(part, '<p class="records-note">', "</p>", g["legal"]["lead"] + " " + GATE_LINKS.format(**g["legal"]), code)
    part = retag(part, '<label class="check check-all"><input type="checkbox" id="terms-all">', "</label>", " " + g["all"], code)
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

ASK_KEYS = ("open", "title", "close", "note", "inputLabel", "placeholder", "send", "repo")


def js_strings(path, code, keys):
    """String values from one language's block (`    es: {` up to its closing `    }`) of a browser copy table."""
    js = (ROOT / path).read_text(encoding="utf-8")
    start = js.index(f"\n    {code}: {{\n")
    end = js.index("\n    }", start)
    out = {}
    for key in keys:
        m = re.compile(rf'\b{key}: ("(?:[^"\\]|\\.)*")').search(js, start, end)
        if not m:
            raise SystemExit(f"{path} has no {code}.{key}")
        out[key] = json.loads(m.group(1))
    return out


COPY_TABLES = ("js/qa-review-report-copy.js", "js/qa-review-multi.js", "js/qa-review-compare-copy.js", "js/qa-review-progress.js",
               "js/qa-review-verify.js", "js/qa-review-benchmark.js", "js/qa-review-live.js", "js/qa-review-ask.js", "js/qa-review-pay-copy.js")
PAIR = re.compile(r'\b(\w+): ("(?:[^"\\]|\\.)*")')


def js_index(code):
    """English text to the page language's text, from every key the browser copy tables hold once, the first table winning."""
    out = {}
    for path in COPY_TABLES:
        js = (ROOT / path).read_text(encoding="utf-8")
        blocks = []
        for lang in ("en", code):
            start = js.index(f"\n    {lang}: {{\n")
            pairs = PAIR.findall(js, start, js.index("\n    }", start))
            once = {key for key in {k for k, _ in pairs} if sum(k == key for k, _ in pairs) == 1}
            blocks.append({k: json.loads(v) for k, v in pairs if k in once})
        en, local = blocks
        for key, text in en.items():
            if key in local and "{" not in text and "<" not in text:
                out.setdefault(squash(text), local[key])
    return out


def ask_copy(code):
    """The Ask the report panel strings for one language, read from js/qa-review-ask.js."""
    return js_strings("js/qa-review-ask.js", code, ASK_KEYS)


def report_copy(s, code):
    """What js/qa-review-report-copy.js does in the browser to each data-report-copy element, done here so the HTML ships it."""
    found = list(re.finditer(r'<(\w+)([^>]*) data-report-copy="(\w+)"([^>]*)>([^<]*)</\1>', s))
    keys = sorted({m.group(3) for m in found})
    en, t = js_strings("js/qa-review-report-copy.js", "en", keys), js_strings("js/qa-review-report-copy.js", code, keys)
    for m in reversed(found):
        tag, before, key, after, text = m.groups()
        if text != en[key]:
            raise SystemExit(f"qa-review.html data-report-copy={key} reads {text!r}, js/qa-review-report-copy.js en has {en[key]!r}")
        s = s[:m.start()] + f'<{tag}{before} data-report-copy="{key}"{after} lang="{code}" translate="no">{t[key]}</{tag}>' + s[m.end():]
    return s


def live_head(s, code, data):
    """The Live Reports heading as js/qa-review-live.js writes it."""
    t = js_strings("js/qa-review-live.js", code, ("eyebrow", "title", "titleEm", "lede"))
    s = retag(s, '<p class="eyebrow" data-live-eyebrow>', "</p>", t["eyebrow"], code)
    s = retag(s, '<h2 id="live-title" class="live-title" data-live-title>', "</h2>", f'{t["title"]} <em>{t["titleEm"]}</em>', code)
    return retag(s, '<p class="live-lede" data-live-lede>', "</p>", t["lede"].replace("{n}", str(data["count"])), code)


VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
OPAQUE = {"script", "style", "svg", "noscript", "template", "canvas"}
TEXT_ATTRS = ("placeholder", "aria-label", "title", "alt")
squash = lambda text: " ".join(text.split())


class Spans(HTMLParser):
    """Offsets of every body element, text run and translatable attribute, skipping what is already in another language or kept as is."""

    def __init__(self, s):
        super().__init__(convert_charrefs=False)
        self.lines = [0] + [i + 1 for i, ch in enumerate(s) if ch == "\n"]
        self.stack, self.elements, self.texts, self.attrs, self.body = [], [], [], [], False

    def at(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "body":
            self.body = True
        start = self.at()
        end = start + len(self.get_starttag_text())
        parent = self.stack[-1] if self.stack else None
        kept = (parent and parent["kept"]) or tag in OPAQUE or a.get("translate") == "no" or ("lang" in a and tag != "html") or "notranslate" in (a.get("class") or "").split()
        if self.body and not kept:
            self.attrs += [(start, end, name, a[name]) for name in TEXT_ATTRS if a.get(name)]
        if tag in VOID:
            return
        self.stack.append({"tag": tag, "start": start, "open": end, "kept": kept, "id": a.get("id")})

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i]["tag"] == tag:
                el = self.stack[i]
                del self.stack[i:]
                if self.body and not el["kept"]:
                    self.elements.append((el, self.at()))
                return

    def handle_data(self, data):
        if self.body and self.stack and not self.stack[-1]["kept"] and data.strip():
            self.texts.append((self.at(), data, self.stack[-1]))


def mark(tag_text, code):
    return re.sub(r"\s*/?>$", lambda m: f' lang="{code}" translate="no"' + m.group(0).lstrip(), tag_text, count=1)


def glossary_lines(code):
    """The whole lines js/site-glossary.js puts over machine translation (its LINES), which win over every other source."""
    js = (ROOT / "js/site-glossary.js").read_text(encoding="utf-8")
    start = js.index(f"\n        {code}: {{\n", js.index("const LINES = {"))
    block = js[start:js.index("\n        }", start)]
    return {squash(en): local for en, local in re.findall(r"'((?:[^'\\]|\\.)*)': '((?:[^'\\]|\\.)*)'", block)}


def body_table(code):
    """English to the page language for the rest of the body: the browser copy tables, then review_langs_body.BODY, then the glossary lines."""
    table = js_index(code)
    table["(4 left)"] = js_strings("js/qa-review-report-copy.js", code, ("left",))["left"].replace("{n}", "4")
    table.update({squash(en): row[code] for en, row in BODY})
    table.update(glossary_lines(code))
    return table


def body_copy(s, code, table, ids_written):
    """The rest of the body: whole elements (when they hold links or emphasis), text runs, and attributes.
    The element that gets the text is marked lang and translate="no" unless a script rewrites it, so a later machine pass skips it."""
    p = Spans(s)
    p.feed(s)
    edits, used, whole, marked = [], set(), set(), set()
    for el, close in p.elements:
        inner = s[el["open"]:close]
        if "<" in inner and squash(inner) in table:
            edits.append((el["open"], close, table[squash(inner)]))
            whole.add(el["start"])
            marked.add(el["start"])
            used.add(squash(inner))
    inside = lambda pos: any(el["open"] <= pos < close for el, close in p.elements if el["start"] in whole)
    for pos, data, parent in p.texts:
        key = squash(data)
        if key in table and not inside(pos):
            lead, trail = data[: len(data) - len(data.lstrip())], data[len(data.rstrip()):]
            edits.append((pos, pos + len(data), lead + table[key] + trail))
            marked.add(parent["start"])
            used.add(key)
    tags = {}
    for start, end, name, value in p.attrs:
        if squash(value) in table:
            tag_text = tags.get(start, (end, s[start:end]))[1]
            tags[start] = (end, tag_text.replace(f'{name}="{value}"', f'{name}="{table[squash(value)]}"', 1))
            used.add(squash(value))
    for el, _ in p.elements:
        if el["start"] in marked and el["id"] not in ids_written:
            tags[el["start"]] = (el["open"], mark(tags.get(el["start"], (0, s[el["start"]:el["open"]]))[1], code))
    edits += [(start, end, tag_text) for start, (end, tag_text) in tags.items()]
    missing = {squash(en) for en, _ in BODY} - used
    if missing:
        raise SystemExit("review_langs_body.BODY has text the page no longer holds: " + "; ".join(sorted(missing))[:400])
    for a, b, text in sorted(edits, key=lambda e: e[0], reverse=True):
        s = s[:a] + text + s[b:]
    return s


def ask_panel(s, code):
    en, t = ask_copy("en"), ask_copy(code)
    mark = f' lang="{code}" translate="no" hidden>'
    s = swap(s, f'aria-controls="ask-panel" hidden>{en["open"]}</button>', f'aria-controls="ask-panel"{mark}{t["open"]}</button>')
    s = swap(s, '<aside class="ask-panel no-print" id="ask-panel" aria-labelledby="ask-title" hidden>', f'<aside class="ask-panel no-print" id="ask-panel" aria-labelledby="ask-title"{mark}')
    for key in ASK_KEYS:
        if key != "placeholder":
            s = swap(s, f'data-ask-text="{key}">{en[key]}<', f'data-ask-text="{key}">{t[key]}<')
    return swap(s, f'placeholder="{en["placeholder"]}"', f'placeholder="{t["placeholder"]}"')


FACT_LABELS = ["kinds of cases", "frameworks you already know", "address to begin", "pages read so far", "reviews run so far"]


def facts(s, code):
    a = s.index('<ul class="facts">')
    b = s.index('<a class="live-jump"', a)
    part = s[a:b]
    for english, local in zip(FACT_LABELS, FACTS[code]):
        part = swap(part, f"<span>{english}</span>", f'<span lang="{code}" translate="no">{local}</span>')
    s = s[:a] + part + s[b:]
    sample = COPY[code]["gate"]["sample"]
    s = retag(s, '<button class="stage-link" id="stage-sample-open" type="button">', "</button>", sample["button"], code)
    s = retag(s, '<a class="stage-link" id="stage-guide" href="qa-review-guide.html">', "</a>", sample["tour"], code)
    return retag(s, '<a class="live-jump" href="#live-reports">', "</a>", FACTS[code][-1], code)


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
    s = swap(s, '<meta property="og:title" content="Find the leaks, breaks and blocks first. · QA-lab URL Review">', f'<meta property="og:title" content="{t["title"]} · QA-lab URL Review">')
    og_desc = s[s.index('<meta property="og:description" content="'):]
    og_desc = og_desc[: og_desc.index(">") + 1]
    s = swap(s, og_desc, f'<meta property="og:description" content="{t["og_description"]}">')
    s = swap(s, '<meta name="twitter:title" content="Privacy, accessibility and security from one URL. · QA-lab URL Review">', f'<meta name="twitter:title" content="{t["twitter_title"]} · QA-lab URL Review">')
    tw_desc = s[s.index('<meta name="twitter:description" content="'):]
    tw_desc = tw_desc[: tw_desc.index(">") + 1]
    s = swap(s, tw_desc, f'<meta name="twitter:description" content="{t["twitter_description"]}">')
    s = swap(s, '"url": "https://carlosandmunoz.com/qa-review.html",\n                "applicationCategory"', f'"url": "{url}",\n                "applicationCategory"')
    s = swap(s, '"item": "https://carlosandmunoz.com/qa-review.html"', f'"item": "{url}"')
    s = swap(s, '"url": "https://carlosandmunoz.com/qa-review.html#service-facts"', f'"url": "{url}#service-facts"')
    s = swap(s, '<a class="skip-link" href="#review-app">Skip to main content</a>', f'<a class="skip-link" href="#review-app" lang="{code}" translate="no">{SKIP[code]}</a>')
    s = swap(s, '<div class="brand"><a href="qa-review.html">', f'<div class="brand"><a href="{page}">')
    s = swap(s, '<a class="btn btn-ghost" href="qa-review-social.html">', f'<a class="btn btn-ghost" href="qa-review-social-{code}.html">')
    s = swap(s, 'href="qa-review-pay.html?purpose=report"', f'href="qa-review-pay-{code}.html?purpose=report"')
    s = swap(s, 'href="qa-review-pay.html?purpose=new-run"', f'href="qa-review-pay-{code}.html?purpose=new-run"')
    flag_en = 'src="https://hatscripts.github.io/circle-flags/flags/gb.svg" alt="English"'
    s = swap(s, flag_en, f'src="https://hatscripts.github.io/circle-flags/flags/{code}.svg" alt="{t["native"]}"', 2)
    s = swap(s, '<h2 id="gate-title">Before a single address is analyzed.</h2>', f'<h2 id="gate-title" lang="{code}" translate="no">{t["gate"]}</h2>')
    d = t["display"]
    s = swap(
        s,
        '<h1 id="studio-title" class="display">\n'
        "                <span>Find the leaks,</span>\n"
        '                <span class="display-em">breaks and blocks</span>\n'
        "                <span>before customers</span>\n"
        "                <span>or regulators do.</span>",
        f'<h1 id="studio-title" class="display" lang="{code}" translate="no">\n'
        f"                <span>{d[0]}</span>\n"
        f'                <span class="display-em">{d[1]}</span>\n'
        f"                <span>{d[2]}</span>\n"
        f"                <span>{d[3]}</span>",
    )
    s = structured(s, code)
    s = header(s, code)
    s = gate(s, code)
    s = facts(s, code)
    s = ask_panel(s, code)
    s = retag(s, '<p class="meta-line" id="compare-note">', "</p>", COMPARE_NOTE[code], code)
    s = report_copy(s, code)
    s = live_head(s, code, data)
    s = body_copy(s, code, body_table(code), WRITTEN)
    s = with_live(s, code, data)
    s = swap(s, '<script src="js/qa-review-findings-copy.en.js?', f'<script src="js/qa-review-findings-copy.{code}.js?')
    s = swap(s, '<script src="js/site-i18n.js', f'<script>try{{localStorage.setItem("cv-preferred-lang","{code}")}}catch(e){{}}</script>\n<script src="js/site-i18n.js')
    return page, s


PAY_KEYS = ("title", "description", "testMode", "eyebrow", "headingRun", "intro", "payWith", "paypalWays", "itemRun",
            "accountPaypal", "collected", "note", "disclaimers", "back", "continueTo")


def pay_copy(code):
    """The static payment page strings for one language, read from js/qa-review-pay-copy.js."""
    return {key: text.replace("{name}", "PayPal") for key, text in js_strings("js/qa-review-pay-copy.js", code, PAY_KEYS).items()}


def build_pay(source, code):
    en, t = pay_copy("en"), pay_copy(code)
    page = f"qa-review-pay-{code}.html"
    mark = f' lang="{code}" translate="no"'
    s = swap(source, '<html lang="en">', f'<html lang="{code}">')
    s = swap(s, f"<title>{en['title']}</title>", f"<title>{t['title']}</title>")
    s = swap(s, f'<meta name="description" content="{en["description"]}">', f'<meta name="description" content="{t["description"]}">')
    s = swap(s, '<a class="brand" href="qa-review.html">', f'<a class="brand" href="qa-review-{code}.html">')
    s = retag(s, '<p class="test-mode" id="test-mode" role="status" hidden>', "</p>", t["testMode"], code)
    s = retag(s, '<p class="eyebrow">', "</p>", t["eyebrow"], code)
    s = retag(s, '<h1 id="pay-heading">', "</h1>", t["headingRun"], code)
    s = swap(s, '<p class="yield" id="pay-yield" hidden>', f'<p class="yield" id="pay-yield"{mark} hidden>')
    s = swap(s, '<p id="pay-fx">', f'<p id="pay-fx"{mark}>')
    s = retag(s, '<p id="pay-copy">', "</p>", t["intro"], code)
    s = swap(s, '<ol class="lines" id="pay-lines" hidden>', f'<ol class="lines" id="pay-lines"{mark} hidden>')
    s = retag(s, "<legend>", "</legend>", t["payWith"], code)
    s = swap(s, f"<small>{en['paypalWays']}</small>", f"<small{mark}>{t['paypalWays']}</small>")
    s = swap(s, f'<span id="pay-item">{en["itemRun"]}</span>', f'<span id="pay-item">{t["itemRun"]}</span>')
    s = retag(s, '<span id="pay-collect-label">', "</span>", t["accountPaypal"], code)
    s = retag(s, '<span id="pay-collector">', "</span>", t["collected"], code)
    s = retag(s, '<p id="pay-note">', "</p>", t["note"], code)
    s = swap(s, f'<a href="qa-review-legal.html">{en["disclaimers"]}</a>', f'<a href="qa-review-legal.html"{mark}>{t["disclaimers"]}</a>')
    s = swap(s, f'<a class="btn btn-ghost" href="qa-review.html">{en["back"]}</a>', f'<a class="btn btn-ghost" href="qa-review-{code}.html"{mark}>{t["back"]}</a>')
    s = retag(s, '<button class="btn btn-primary" id="charge" type="button">', "</button>", t["continueTo"], code)
    s = swap(s, '<script src="js/site-i18n.js', f'<script>try{{localStorage.setItem("cv-preferred-lang","{code}")}}catch(e){{}}</script>\n    <script src="js/site-i18n.js')
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
    pay = (ROOT / "qa-review-pay.html").read_text(encoding="utf-8")
    pages = [build(source, code, data) for code in LANGS] + [build_pay(pay, code) for code in LANGS]
    for page, html in pages:
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
