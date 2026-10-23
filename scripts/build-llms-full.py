#!/usr/bin/env python3
"""Write llms-full.txt from llms.txt, the guide page, and the live reports index.

It also writes the Live Reports count in llms.txt and the noscript Live Reports text on the six
review pages (scripts/build-review-langs.py), so the daily job keeps every count current.
Run again after llms.txt, qa-review-guide.html, qa-review.html, or assets/live-reports/index.json changes:
    python3 scripts/build-llms-full.py          # write
    python3 scripts/build-llms-full.py --check  # exit 1 when a generated file is stale
"""
import importlib.util
import json
import pathlib
import re
import sys
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://carlosandmunoz.com/"
BLOCKS = {"h1": "# ", "h2": "## ", "h3": "### ", "p": "", "li": "", "summary": "Q: "}
SKIP = {"script", "style", "svg", "noscript", "button"}


class GuideText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_main = False
        self.skip = 0
        self.block = None
        self.parent = None
        self.buf = []
        self.out = []

    def flush(self, tag):
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        if text:
            prefix = BLOCKS[tag]
            if tag == "p" and self.out and self.out[-1].startswith("Q: "):
                prefix = "A: "
            self.out.append(prefix + text)
        self.buf = []

    def handle_starttag(self, tag, attrs):
        if tag == "main":
            self.in_main = True
        elif not self.in_main:
            return
        if tag in SKIP:
            self.skip += 1
        elif tag in BLOCKS and self.block is None and not self.skip:
            self.block, self.buf = tag, []
        elif tag in ("h3", "p") and self.block == "li":
            self.flush("li")
            self.parent, self.block = "li", tag

    def handle_endtag(self, tag):
        if tag == "main":
            self.in_main = False
        if not self.in_main:
            return
        if tag in SKIP and self.skip:
            self.skip -= 1
        elif tag == self.block:
            self.flush(tag)
            self.block, self.parent = self.parent, None

    def handle_data(self, data):
        if self.block and not self.skip:
            self.buf.append(data)


def guide_section():
    parser = GuideText()
    parser.feed((ROOT / "qa-review-guide.html").read_text(encoding="utf-8"))
    lines = []
    for line in parser.out:
        if line.startswith("#"):
            lines.append("")
            line = "#" + line
        lines.append(line)
    return "## How QA-lab URL Review works (" + SITE + "qa-review-guide.html)\n" + "\n".join(lines).replace("\n\n\n", "\n\n").strip("\n")


def live_section():
    data = json.loads((ROOT / "assets/live-reports/index.json").read_text(encoding="utf-8"))
    avg = data["averages"]
    areas = ", ".join(f"{k} {v}" for k, v in avg["areas"].items())
    rows = sorted(data["reports"], key=lambda r: (-r["overall"], r["name"]))
    lines = [
        f"## Live reports ({SITE}qa-review.html#live-reports)",
        "",
        f"As of {data['generatedAt']}, the series holds {data['count']} public sites in {len(data['sectors'])} sectors, analyzed by QA-lab URL Review "
        f"since {min(r['read'] for r in rows)} (up to {max(r.get('pages', 0) for r in rows)} pages each); new requested reviews are added in a daily batch. "
        f"Average overall score {avg['overall']}; area averages: {areas}. "
        "Reports are view and share only; each link opens one report with its six area scores and findings. "
        "A score is a snapshot of one public analysis, not a certification.",
        "",
        "Site | Sector | Scope | Place | Analyzed | Overall | Report",
    ]
    for r in rows:
        place = ", ".join(x for x in (r.get("city"), r.get("country")) if x) or r.get("scope", "")
        lines.append(" | ".join(str(x) for x in (
            r["name"], data["sectors"].get(r["sector"], r["sector"]), r.get("scope", ""), place, r["read"], r["overall"],
            f"{SITE}qa-review.html?live={r['id']}",
        )))
    return "\n".join(lines)


def llms_count(text):
    data = json.loads((ROOT / "assets/live-reports/index.json").read_text(encoding="utf-8"))
    pattern = r"(\[Live reports\]\([^)]*\)): \d+ real public sites"
    if not re.search(pattern, text):
        raise SystemExit("llms.txt has no Live reports count line")
    return re.sub(pattern, lambda m: f"{m.group(1)}: {data['count']} real public sites", text)


def build(llms):
    return "\n\n".join([llms.strip(), guide_section(), live_section()]) + "\n"


def review_pages(check):
    spec = importlib.util.spec_from_file_location("build_review_langs", ROOT / "scripts/build-review-langs.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.main(check)


def main():
    check = "--check" in sys.argv
    source = ROOT / "llms.txt"
    current_llms = source.read_text(encoding="utf-8")
    llms = llms_count(current_llms)
    text = build(llms)
    target = ROOT / "llms-full.txt"
    if check:
        current = target.read_text(encoding="utf-8") if target.exists() else ""
        if current != text or llms != current_llms:
            print("llms.txt or llms-full.txt is stale; run python3 scripts/build-llms-full.py")
            sys.exit(1)
        review_pages(True)
        return
    if llms != current_llms:
        source.write_text(llms, encoding="utf-8")
        print("wrote", source.name)
    review_pages(False)
    target.write_text(text, encoding="utf-8")
    print("wrote", target.name, len(text), "bytes")


if __name__ == "__main__":
    main()
