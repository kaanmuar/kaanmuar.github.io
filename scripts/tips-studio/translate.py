#!/usr/bin/env python3
"""Translate the strings build.js --export-strings wrote, one language per clip.

   python3 scripts/tips-studio/translate.py media/social-posts/<batch>

Reads <batch>/i18n-src.json and writes <batch>/i18n.json. URLs, hashtags and line breaks are kept,
and a title line wrapped in *...* stays emphasised. Finished strings are cached in i18n.json, so a
rerun only asks for what changed."""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

KEEP = re.compile(r"(https?://\S+|#\w+|\n)")
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


def pieces(text):
    """Translatable fragments of one string, without URLs, hashtags, line breaks or emphasis marks."""
    return [p.strip() for p in KEEP.split(text.replace("*", "")) if p and not KEEP.fullmatch(p) and re.search(r"[A-Za-z]", p)]


def keep_hosts(src, out):
    """The translator spaces the dots of a domain ("postobon. com"); put each host of the English back together."""
    for host in sorted(set(HOST.findall(src)), key=len, reverse=True):
        out = re.sub(r"\s*\.\s*".join(map(re.escape, host.split("."))), host, out, flags=re.I)
    return out


def fill(texts, lang, cache):
    """Translate every uncached fragment of these strings, one request per ~4,000 characters."""
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
            cache[lang + "\x00" + src] = keep_hosts(src, out.strip())


def translate(text, lang, cache):
    if lang == "en" or not text.strip():
        return text
    star = re.fullmatch(r"\*(.+)\*", text.strip())
    if star:
        return "*" + translate(star.group(1), lang, cache) + "*"
    parts = []
    for piece in KEEP.split(text.replace("*", "")):
        if not piece or KEEP.fullmatch(piece) or not re.search(r"[A-Za-z]", piece):
            parts.append(piece)
            continue
        lead = piece[: len(piece) - len(piece.lstrip())]
        tail = piece[len(piece.rstrip()):]
        parts.append(lead + cache[lang + "\x00" + piece.strip()] + tail)
    return "".join(parts)


def main():
    out_dir = Path(sys.argv[1])
    src = json.loads((out_dir / "i18n-src.json").read_text())
    dest = out_dir / "i18n.json"
    done = json.loads(dest.read_text()) if dest.exists() else {}
    cache = {key: keep_hosts(key.split("\x00", 1)[-1], value) for key, value in done.get("cache", {}).items()}
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
