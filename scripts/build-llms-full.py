#!/usr/bin/env python3
"""Write llms-full.txt from llms.txt, the guide page, and the live reports index.

Run again after llms.txt, qa-review-guide.html, or assets/live-reports/index.json changes:
    python3 scripts/build-llms-full.py          # write
    python3 scripts/build-llms-full.py --check  # exit 1 when llms-full.txt is stale
"""
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
        f"As of {data['generatedAt']}, the series holds {data['count']} public sites in {len(data['sectors'])} sectors, each read once by QA-lab URL Review "
        f"(up to {max(r.get('pages', 0) for r in rows)} pages). Average overall score {avg['overall']}; area averages: {areas}. "
        "Reports are view and share only; each link opens one report with its six area scores and findings. "
        "A score is a snapshot of one public analysis, not a certification.",
        "",
        "Site | Sector | Scope | Place | Read | Overall | Report",
    ]
    for r in rows:
        place = ", ".join(x for x in (r.get("city"), r.get("country")) if x) or r.get("scope", "")
        lines.append(" | ".join(str(x) for x in (
            r["name"], data["sectors"].get(r["sector"], r["sector"]), r.get("scope", ""), place, r["read"], r["overall"],
            f"{SITE}qa-review.html?live={r['id']}",
        )))
    return "\n".join(lines)


def build():
    llms = (ROOT / "llms.txt").read_text(encoding="utf-8").strip()
    return "\n\n".join([llms, guide_section(), live_section()]) + "\n"


def main():
    text = build()
    target = ROOT / "llms-full.txt"
    if "--check" in sys.argv:
        current = target.read_text(encoding="utf-8") if target.exists() else ""
        if current != text:
            print("llms-full.txt is stale; run python3 scripts/build-llms-full.py")
            sys.exit(1)
        return
    target.write_text(text, encoding="utf-8")
    print("wrote", target.name, len(text), "bytes")


if __name__ == "__main__":
    main()
