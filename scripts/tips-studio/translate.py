#!/usr/bin/env python3
"""Translate the strings build.js --export-strings wrote, one language per clip.

   python3 scripts/tips-studio/translate.py media/social-posts/<batch> [--seed]

Reads <batch>/i18n-src.json and writes <batch>/i18n.json. URLs, hashtags, @handles, line breaks, the brand and
product names and the category labels are kept, each *...* span keeps its emphasis, and each fragment starts in
the case the English starts. Finished strings are cached in i18n.json, so a rerun only asks for what changed; the
cache is also rebuilt from the batch's committed translations, so strings filled by hand are not asked again.
--seed only rebuilds the cache, with no translator: run it after filling i18n.json by hand or by agent."""
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

# The translator renders the brand as "Revisión de URL de QA-lab" or "QA-Lab-URL-Überprüfung", so names never reach it.
NAMES = ["QA-lab URL Review", "QA-lab", "Live Reports", "carlosandmunoz.com"]
KEEP = re.compile(r"(https?://\S+|#\w+|(?<!\w)@\w+|\n| · |" + "|".join(re.escape(n) + r"\S*" for n in NAMES) + ")")
LABEL = re.compile(r"QA|SEO|GEO|A11y")
STAR = re.compile(r"(\*[^*\n]+\*)")
TAGS = re.compile(r"\n+#\w+(?: #\w+)*\s*$")
HOST = re.compile(r"\b(?:[a-z0-9-]+\.)+[a-z]{2,6}\b", re.I)
URL = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&dt=t&tl="


def gtx(text, lang):
    data = urllib.parse.urlencode({"q": text}).encode()
    for attempt in range(8):
        try:
            req = urllib.request.Request(URL + lang, data=data, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as res:
                out = "".join(part[0] for part in json.load(res)[0] if part[0])
            time.sleep(1.5)
            return out
        except Exception as err:  # rate limits come back as HTTP 429
            if attempt == 7:
                raise
            print("retry", lang, err, file=sys.stderr)
            time.sleep(30 * (attempt + 1))


def spans(text):
    """(emphasised, text) pairs: each *...* span is translated on its own, so its marks can go back around it."""
    for part in STAR.split(text):
        star = bool(STAR.fullmatch(part))
        yield star, part[1:-1] if star else part.replace("*", "")


def wanted(piece):
    return bool(piece) and not KEEP.fullmatch(piece) and bool(re.search(r"[A-Za-z]", piece)) and not LABEL.fullmatch(piece.strip())


def pieces(text):
    """Translatable fragments of one string, without URLs, hashtags, handles, names, labels, line breaks or emphasis marks."""
    return [p.strip() for _, span in spans(text) for p in KEEP.split(span) if wanted(p)]


def keep_hosts(src, out):
    """The translator spaces the dots of a domain ("postobon. com"); put each host of the English back together."""
    for host in sorted(set(HOST.findall(src)), key=len, reverse=True):
        out = re.sub(r"\s*\.\s*".join(map(re.escape, host.split("."))), host, out, flags=re.I)
    return out


def keep_case(src, out, lang):
    """A fragment translated on its own comes back capitalised at random ("exorcizarlo"); start it as the English does.
    German keeps its capitals, since a lowercase English start can be a German noun."""
    if not (src[:1].isalpha() and out[:1].isalpha()):
        return out
    if src[0].isupper():
        return out[0].upper() + out[1:]
    if lang != "de" and out[1:2].islower():
        return out[0].lower() + out[1:]
    return out


def tidy(src, out, lang):
    return keep_case(src, keep_hosts(src, out), lang)


def fill(texts, lang, cache):
    """Translate every uncached fragment of these strings, one request per ~4,000 characters."""
    if lang == "en":
        return
    todo = list(dict.fromkeys(p for t in texts for p in pieces(t) if lang + "\x00" + p not in cache))
    while todo:
        batch, size = [], 0
        while todo and size + len(todo[0]) < 4000:
            size += len(todo[0]) + 1
            batch.append(todo.pop(0))
        if not batch:
            batch.append(todo.pop(0))
        lines = gtx("\n".join(batch), lang).split("\n") if len(batch) > 1 else [gtx(batch[0], lang)]
        if len(lines) != len(batch):
            lines = [gtx(p, lang) for p in batch]
        for src, out in zip(batch, lines):
            cache[lang + "\x00" + src] = tidy(src, out.strip(), lang)


def translate(text, lang, cache):
    if lang == "en" or not text.strip():
        return text
    out = []
    for star, span in spans(text):
        parts = []
        for piece in KEEP.split(span):
            if not wanted(piece):
                parts.append(piece)
                continue
            lead = piece[: len(piece) - len(piece.lstrip())]
            tail = piece[len(piece.rstrip()):]
            parts.append(lead + cache[lang + "\x00" + piece.strip()] + tail)
        out.append(("*%s*" if star else "%s") % "".join(parts))
    return "".join(out)


def parts(text):
    """(emphasised, [text, kept, text, ...]) for each span, the shape both pieces() and translate() walk."""
    return [(star, KEEP.split(span)) for star, span in spans(text)]


def pair(src, out):
    """(English fragment, translated fragment) pairs of one finished string, or none when the two don't line up
    span for span and kept token for kept token. A caption's translation leaves out the tag line, which build.js
    puts back with the clip's own tags."""
    if TAGS.search(src) and not TAGS.search(out):
        src = TAGS.sub("", src)
    a, b = parts(src), parts(out)
    if [(s, len(p), p[1::2]) for s, p in a] != [(s, len(p), p[1::2]) for s, p in b]:
        return []
    return [(x.strip(), y.strip()) for (_, p), (_, q) in zip(a, b) for x, y in zip(p[::2], q[::2]) if wanted(x) and y.strip()]


def history(out_dir):
    """(i18n-src.json, i18n.json) of each commit that changed the batch's translations, oldest first, then the
    working copy. build.js rewrites i18n-src.json before each run, so only a pair from the same commit tells which
    English a translation was made from."""
    def show(rev, name):
        res = subprocess.run(["git", "show", rev + ":./" + name], cwd=out_dir, capture_output=True, text=True)
        return json.loads(res.stdout) if res.returncode == 0 else None
    log = subprocess.run(["git", "log", "--reverse", "--format=%H", "--", "i18n.json"], cwd=out_dir, capture_output=True, text=True)
    for rev in log.stdout.split() if log.returncode == 0 else []:
        yield show(rev, "i18n-src.json"), show(rev, "i18n.json")
    read = lambda name: json.loads((out_dir / name).read_text()) if (out_dir / name).exists() else None
    yield read("i18n-src.json"), read("i18n.json")


def seed(versions):
    """A cache rebuilt from finished translations. A translation is paired with the English beside it only in the
    version where it first appears or changes, so one left behind by a later English edit is not learned as the
    translation of the new English, and that string goes back to the translator."""
    cache, last = {}, {}

    def learn(at, english, text, lang):
        if english is None or last.get(at) == text:
            return
        last[at] = text
        for en, out in pair(english, text):
            cache[lang + "\x00" + en] = out

    for src, done in versions:
        if not src or not done:
            continue
        cache.update(done.get("cache") or {})
        for lang, ui in (done.get("ui") or {}).items():
            for key, text in ui.items():
                learn(("ui", lang, key), src.get("ui", {}).get(key), text, lang)
        for slug, strings in (done.get("clips") or {}).items():
            clip = src.get("clips", {}).get(slug)
            for key, text in strings.items() if clip else []:
                learn((slug, key), clip["strings"].get(key), text, clip["lang"])
    return cache


def main():
    out_dir = Path(sys.argv[1])
    src = json.loads((out_dir / "i18n-src.json").read_text())
    dest = out_dir / "i18n.json"
    done = json.loads(dest.read_text()) if dest.exists() else {}
    cache = {}
    for key, value in {**seed(history(out_dir)), **(done.get("cache") or {})}.items():
        lang, text = key.split("\x00", 1)
        cache[key] = tidy(text, value, lang)
    if "--seed" in sys.argv:
        dest.write_text(json.dumps({**done, "cache": cache}, ensure_ascii=False, indent=1))
        print("seeded", len(cache), "fragments")
        return
    result = {"ui": {}, "clips": {}, "cache": cache}
    for lang in sorted({clip["lang"] for clip in src["clips"].values()}):
        fill(src["ui"].values(), lang, cache)
        result["ui"][lang] = {k: translate(v, lang, cache) for k, v in src["ui"].items()}
    for slug, clip in src["clips"].items():
        fill(clip["strings"].values(), clip["lang"], cache)
        result["clips"][slug] = {k: translate(v, clip["lang"], cache) for k, v in clip["strings"].items()}
        dest.write_text(json.dumps(result, ensure_ascii=False, indent=1))
        print("translated", slug, clip["lang"])
    dest.write_text(json.dumps(result, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
