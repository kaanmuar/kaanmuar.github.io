#!/usr/bin/env python3
"""Tell IndexNow engines (Bing, Yandex, Seznam, Naver) about the sitemap URLs.

Run after the pages are live:  python3 scripts/indexnow.py [url ...]
With no arguments every <loc> in sitemap.xml is sent.
"""
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
HOST = "carlosandmunoz.com"
KEY = "c1ab1d693aa44efeae5463b429a4813e"


def main():
    urls = sys.argv[1:] or re.findall(r"<loc>([^<]+)</loc>", (ROOT / "sitemap.xml").read_text(encoding="utf-8"))
    body = json.dumps({"host": HOST, "key": KEY, "keyLocation": f"https://{HOST}/{KEY}.txt", "urlList": urls}).encode()
    req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body, headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=30) as res:
        print(res.status, len(urls), "urls")


if __name__ == "__main__":
    main()
