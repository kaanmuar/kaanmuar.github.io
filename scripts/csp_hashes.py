"""The Python twin of scripts/build-csp-hashes.js: lists a 'sha256-...' in script-src for every inline script a page
runs, in place of 'unsafe-inline'. build-csp-hashes.js --check fails in CI when the two disagree on a page."""
import base64
import hashlib
import re

META = re.compile(r'(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")', re.I)
DATA_TYPES = re.compile(r"^(application/(ld\+)?json|text/(plain|template|html|x-template))$", re.I)
TAG = re.compile(r"<!--|<script\b([^>]*)>", re.I)
CLOSE = re.compile(r"</script[\s/>]", re.I)


def inline_scripts(html):
    out = []
    pos = 0
    while True:
        m = TAG.search(html, pos)
        if not m:
            break
        if m.group(0) == "<!--":
            end = html.find("-->", m.start() + 4)
            if end == -1:
                break
            pos = end + 3
            continue
        close = CLOSE.search(html, m.end())
        if not close:
            break
        body = html[m.end():close.start()]
        pos = close.start()
        attrs = m.group(1) or ""
        if re.search(r"\ssrc\s*=", " " + attrs, re.I):
            continue
        kind = re.search(r"""\stype\s*=\s*["']?([^"'\s>]+)""", attrs, re.I)
        if kind and DATA_TYPES.match(kind.group(1)):
            continue
        out.append(body)
    return out


def digest(body):
    raw = hashlib.sha256(re.sub(r"\r\n?", "\n", body).encode("utf-8")).digest()
    return "'sha256-" + base64.b64encode(raw).decode("ascii") + "'"


def apply(html):
    meta = META.search(html)
    if not meta:
        return html
    hashes = list(dict.fromkeys(digest(body) for body in inline_scripts(html)))
    parts = []
    for part in meta.group(2).split(";"):
        tokens = part.strip().split()
        if not tokens or tokens[0] != "script-src":
            parts.append(part)
            continue
        kept = [t for t in tokens if t != "'unsafe-inline'" and not re.match(r"^'sha(256|384|512)-", t)]
        parts.append(re.match(r"^\s*", part).group(0) + " ".join(kept + hashes))
    policy = ";".join(parts)
    return META.sub(lambda m: m.group(1) + policy + m.group(3), html, count=1)
