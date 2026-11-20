#!/usr/bin/env python3
"""Cut the Lab / Jarvis base animations into individual game assets.

Input : assets/review-arena/{lab,jarvis}-full-pipeline-v2-animated.mp4 (the reference art)
Output: assets/review-arena/v3/{skin}/clean.jpg    plate with every animated entity erased
        assets/review-arena/v3/{skin}/items.png    RGBA atlas: every item / character cut out alone
        assets/review-arena/v3/{skin}/bay-*.webp   baked character loops (Lab robots, doctor)
        js/qa-review-arena-atlas.js                geometry + atlas rects the engine reads

Run: python3 -m venv /tmp/arena-venv && /tmp/arena-venv/bin/pip install pillow numpy scipy
     /tmp/arena-venv/bin/python scripts/review-arena-build.py [--debug]
"""
import glob, json, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets/review-arena")
OUT = os.path.join(SRC, "v3")
DEBUG = "--debug" in sys.argv
W, H = 1280, 720


def frames(skin):
    d = tempfile.mkdtemp(prefix=f"arena-{skin}-")
    subprocess.check_call(
        ["ffmpeg", "-v", "error", "-y", "-i", f"{SRC}/{skin}-full-pipeline-v2-animated.mp4",
         "-fps_mode", "passthrough", f"{d}/f%03d.png"])
    files = sorted(glob.glob(f"{d}/f*.png"))
    return files


def runs(mask, minlen, gap):
    out, s, last = [], None, None
    for i, v in enumerate(mask):
        if v:
            if s is None:
                s = i
            last = i
        elif s is not None and i - last > gap:
            if last - s + 1 >= minlen:
                out.append((s, last + 1))
            s = None
    if s is not None and last - s + 1 >= minlen:
        out.append((s, last + 1))
    return out


def erase(img, rect, pad_x=3):
    """Erase rect by horizontal interpolation between the columns just outside it."""
    x0, y0, x1, y1 = [int(v) for v in rect]
    x0 = max(pad_x, x0); x1 = min(W - pad_x - 1, x1)
    left = img[y0:y1, x0 - pad_x:x0].mean(axis=1)
    right = img[y0:y1, x1:x1 + pad_x].mean(axis=1)
    t = np.linspace(0, 1, x1 - x0)[None, :, None]
    img[y0:y1, x0:x1] = left[:, None, :] * (1 - t) + right[:, None, :] * t


def cutout(orig, clean, rect, lo=9, hi=46):
    """RGBA sprite: alpha from distance between original and erased background."""
    x0, y0, x1, y1 = [int(v) for v in rect]
    a = orig[y0:y1, x0:x1]
    b = clean[y0:y1, x0:x1]
    d = np.abs(a - b).max(axis=2)
    alpha = np.clip((d - lo) / (hi - lo), 0, 1)
    alpha = ndi.gaussian_filter(alpha, 0.6)
    rgba = np.dstack([np.clip(a, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


class Atlas:
    """Shelf packer for the RGBA item atlas."""

    def __init__(self, width=1024):
        self.w = width; self.x = 0; self.y = 0; self.row = 0; self.items = {}; self.imgs = []

    def add(self, key, img):
        w, h = img.size
        if self.x + w + 2 > self.w:
            self.x = 0; self.y += self.row + 2; self.row = 0
        self.items[key] = [self.x, self.y, w, h]
        self.imgs.append((self.x, self.y, img))
        self.x += w + 2; self.row = max(self.row, h)

    def save(self, path):
        sheet = Image.new("RGBA", (self.w, self.y + self.row + 2), (0, 0, 0, 0))
        for x, y, img in self.imgs:
            sheet.paste(img, (x, y))
        sheet.save(path, optimize=True)


def build_lab(files):
    skin = "lab"
    os.makedirs(f"{OUT}/{skin}", exist_ok=True)
    orig = np.asarray(Image.open(files[0]).convert("RGB")).astype(np.float32)
    lum = orig.mean(axis=2)
    clean = orig.copy()
    atlas = Atlas()
    geo = {"skin": skin, "w": W, "h": H}

    # —— tick boxes: 18 rounded boxes found from their top border ——
    band = lum[109:115, :] > 38
    boxes = runs(band.any(axis=0), 40, 3)
    assert len(boxes) == 18, f"expected 18 tick boxes, got {len(boxes)}: {boxes}"
    tick_rows = (110, 172)
    stations = []
    for i, (bx0, bx1) in enumerate(boxes):
        cx = (bx0 + bx1) / 2
        # erase check glyph inside the box (the label text above stays baked)
        erase(clean, (cx - 14, 143, cx + 14, 165), pad_x=4)
        # item: union of the opened blobs below the connector (items are much brighter than the dark floor)
        sx0, sx1 = int(cx - 38), int(cx + 38)
        reg = lum[200:294, sx0:sx1].copy()
        reg[:34, int(cx - sx0 - 5):int(cx - sx0 + 5)] = 0  # thin dashed connector
        m = reg > 21
        m = ndi.binary_opening(m, structure=np.ones((3, 3)))
        m = ndi.binary_closing(m, structure=np.ones((5, 5)))
        lab, n = ndi.label(m)
        bbs = []
        for k, sl in enumerate(ndi.find_objects(lab)):
            a = (lab[sl] == k + 1).sum()
            h = sl[0].stop - sl[0].start
            if a > 120 and h >= 12:
                bbs.append((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop))
        ix0 = sx0 + min(b[0] for b in bbs) - 2; ix1 = sx0 + max(b[2] for b in bbs) + 2
        iy0 = 200 + min(b[1] for b in bbs) - 2; iy1 = min(297, 200 + max(b[3] for b in bbs) + 3)
        # connector: from box bottom to item top, plus the beads on it
        erase(clean, (cx - 5, 173, cx + 5, iy0 + 2), pad_x=4)
        stations.append({"i": i, "cx": round(cx, 1), "box": [bx0, tick_rows[0], bx1, tick_rows[1]],
                         "item": [ix0, iy0, ix1, iy1], "conn": [round(cx, 1), 174, iy0]})
    for s in stations:
        erase(clean, s["item"], pad_x=4)
    for s in stations:
        spr = cutout(orig, clean, s["item"])
        atlas.add(f"st{s['i']}", spr)
        s["sprite"] = atlas.items[f"st{s['i']}"]
    geo["stations"] = stations

    # —— doctor + five robot bays ——
    doctor = [40, 336, 158, 452]
    bays = {
        "timeout": [276, 340, 441, 469], "stop": [451, 340, 611, 469],
        "retry": [631, 340, 791, 469], "slow": [801, 340, 960, 469], "fail": [973, 340, 1133, 469],
    }
    geo["doctor"] = doctor
    geo["bays"] = bays
    # baked loops, every 3rd frame (8 fps), saved as one strip per character
    step = 3
    pick = list(range(0, len(files), step))
    geo["loop"] = {"frames": len(pick), "fps": 24 / step}
    for name, rect in list(bays.items()) + [("doctor", doctor)]:
        x0, y0, x1, y1 = rect
        w, h = x1 - x0, y1 - y0
        strip = Image.new("RGB", (w * len(pick), h))
        for k, fi in enumerate(pick):
            strip.paste(Image.open(files[fi]).convert("RGB").crop(rect), (k * w, 0))
        strip.save(f"{OUT}/{skin}/loop-{name}.webp", quality=78, method=6)
        geo.setdefault("loops", {})[name] = {"w": w, "h": h}
        erase(clean, (x0 - 2, y0, x1 + 2, y1), pad_x=3)

    # —— HUD: erase live-state pixels the engine redraws ——
    hud = {"bar": [100, 74, 1180, 98], "pct": [1190, 74, 1272, 98],
           "pill": [1010, 18, 1140, 54], "timer": [1140, 18, 1275, 54], "log": [8, 486, 1272, 706]}
    geo["hud"] = hud
    for key in ("pill", "timer", "log", "pct", "bar"):
        erase(clean, hud[key], pad_x=3)

    Image.fromarray(np.clip(clean, 0, 255).astype(np.uint8)).save(f"{OUT}/{skin}/clean.jpg", quality=90)
    atlas.save(f"{OUT}/{skin}/items.png")
    if DEBUG:
        dbg = Image.fromarray(orig.astype(np.uint8))
        d = ImageDraw.Draw(dbg)
        for s in stations:
            d.rectangle(s["box"], outline=(255, 255, 0))
            d.rectangle(s["item"], outline=(0, 255, 255))
        d.rectangle(doctor, outline=(255, 0, 255))
        for r in bays.values():
            d.rectangle(r, outline=(255, 128, 0))
        for r in hud.values():
            d.rectangle(r, outline=(0, 255, 0))
        dbg.save(f"{OUT}/{skin}/debug-boxes.png")
    return geo


def build_jarvis(files):
    skin = "jarvis"
    os.makedirs(f"{OUT}/{skin}", exist_ok=True)
    orig = np.asarray(Image.open(files[0]).convert("RGB")).astype(np.float32)
    lum = orig.mean(axis=2)
    clean = orig.copy()
    atlas = Atlas()
    geo = {"skin": skin, "w": W, "h": H}

    lanes_y = [147, 230, 318]
    node_x = [269, 336, 402, 470, 535, 590, 647, 721, 788, 855, 920, 982, 1047, 1106, 1162, 1223]
    nodes = []
    for li, cy in enumerate(lanes_y):
        for ni, cx in enumerate(node_x):
            rect = [cx - 19, cy - 21, cx + 19, cy + 17]
            nodes.append({"lane": li, "n": ni, "cx": cx, "cy": cy, "rect": rect})
    for nd in nodes:
        erase(clean, nd["rect"], pad_x=3)
    for nd in nodes:
        spr = cutout(orig, clean, nd["rect"], lo=10, hi=50)
        key = f"n{nd['lane']}_{nd['n']}"
        atlas.add(key, spr)
        nd["sprite"] = atlas.items[key]
    geo["nodes"] = nodes
    geo["laneY"] = lanes_y
    geo["nodeX"] = node_x

    # hazard row (detour lane): stopwatch, warning, spark, gavel, then rejoin nodes
    hz_y = 399
    hz = [("timeout", 390), ("stop", 574), ("fail", 705), ("slow", 825),
          ("score", 938), ("sign", 1067), ("save", 1170)]
    haz = []
    for key, cx in hz:
        rect = [cx - 26, hz_y - 24, cx + 26, hz_y + 18]
        haz.append({"id": key, "cx": cx, "cy": hz_y, "rect": rect})
    for h in haz:
        erase(clean, h["rect"], pad_x=3)
    for h in haz:
        spr = cutout(orig, clean, h["rect"], lo=10, hi=50)
        atlas.add(f"h_{h['id']}", spr)
        h["sprite"] = atlas.items[f"h_{h['id']}"]
    geo["hazard"] = haz
    geo["hazardY"] = hz_y

    # process table rows: replaced live by the real log lines
    tx0, ty0, tx1, ty1 = 233, 508, 1256, 664
    med = np.median(clean[ty0:ty1, tx0:tx1].reshape(-1, 3), axis=0)
    clean[ty0:ty1, tx0:tx1] = med
    geo["hud"] = {"log": [tx0, ty0, tx1, ty1]}

    Image.fromarray(np.clip(clean, 0, 255).astype(np.uint8)).save(f"{OUT}/{skin}/clean.jpg", quality=90)
    atlas.save(f"{OUT}/{skin}/items.png")
    if DEBUG:
        dbg = Image.fromarray(orig.astype(np.uint8))
        d = ImageDraw.Draw(dbg)
        for n in nodes:
            d.rectangle(n["rect"], outline=(0, 255, 255))
        for h in haz:
            d.rectangle(h["rect"], outline=(255, 128, 0))
        dbg.save(f"{OUT}/{skin}/debug-boxes.png")
    return geo


def main():
    os.makedirs(OUT, exist_ok=True)
    geos = {}
    for skin, fn in (("lab", build_lab), ("jarvis", build_jarvis)):
        files = frames(skin)
        geos[skin] = fn(files)
        print(skin, "frames", len(files), "ok")
    js = ("/* Generated by scripts/review-arena-build.py: geometry of every cut-out item (1280x720 board). */\n"
          "window.ReviewArenaAtlas = " + json.dumps(geos, separators=(",", ":")) + ";\n")
    open(os.path.join(ROOT, "js/qa-review-arena-atlas.js"), "w").write(js)
    print("wrote js/qa-review-arena-atlas.js", len(js), "bytes")


if __name__ == "__main__":
    main()
