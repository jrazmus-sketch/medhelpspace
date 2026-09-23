#!/usr/bin/env python3
"""prepare-memorecards.py — READ-ONLY on the source; writes WebP copies + a manifest.

    python scripts/prepare-memorecards.py
    MC_SRC="C:/path/to/#novo memorecards" python scripts/prepare-memorecards.py

Karina's MemoreCards arrive as PNGs laid out like her Revalida Up folders:
    <source>/<área>/<tema>/imagem-N.png                  (cirurgia-geral, ginecologia, …)
    <source>/clinica-medica/<especialidade>/<tema>/imagem-N.png

Each PNG is ~1.75 MB. The viewer preloads the next card so the swap feels instant,
and on a phone that means pulling one after another over mobile data — so every
card is re-encoded to WebP at its ORIGINAL resolution (she asked for "boa resolução",
never cropped or distorted). Quality 90 keeps small text on the cards crisp.

Card order inside a theme is the number in "imagem-N"; a file without a number
(one arrived as "ChatGPT Image …png") sorts after the numbered ones, by name.

Output:
    parsed/memorecards-webp/<especialidade>/<tema>/<position>.webp
    parsed/memorecards-manifest.json   [{spec, topic, position, file, width, height, bytes, source}]
Then: node scripts/import-memorecards.js  (upload + rows).
"""
import json
import os
import re
import sys

from PIL import Image

ROOT = os.environ.get(
    "MC_SRC",
    r"C:/Users/jrazm/OneDrive/Desktop/Medhelpspace/09-22-2026/memorecards/#novo memorecards",
)
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, "parsed", "memorecards-webp")
MANIFEST = os.path.join(REPO, "parsed", "memorecards-manifest.json")
QUALITY = 90


def order_key(name):
    m = re.search(r"imagem[-_ ]?(\d+)", name, re.I)
    return (0, int(m.group(1)), name) if m else (1, 0, name.lower())


def main():
    if not os.path.isdir(ROOT):
        sys.exit("source folder not found: %s" % ROOT)
    rows, warnings = [], []
    for dirpath, _dirs, files in os.walk(ROOT):
        pngs = sorted((f for f in files if f.lower().endswith(".png")), key=order_key)
        if not pngs:
            continue
        rel = os.path.relpath(dirpath, ROOT).replace(os.sep, "/").split("/")
        if len(rel) < 2:
            warnings.append("images directly under %s — skipped" % "/".join(rel))
            continue
        topic, spec = rel[-1], rel[-2]
        for position, name in enumerate(pngs, start=1):
            if order_key(name)[0] == 1:
                warnings.append("%s/%s: '%s' has no imagem-N number — placed at position %d"
                                % (spec, topic, name, position))
            src = os.path.join(dirpath, name)
            dst_dir = os.path.join(OUT_DIR, spec, topic)
            os.makedirs(dst_dir, exist_ok=True)
            dst = os.path.join(dst_dir, "%d.webp" % position)
            with Image.open(src) as im:
                im = im.convert("RGB")  # cards are opaque; drops a useless alpha channel
                width, height = im.size
                im.save(dst, "WEBP", quality=QUALITY, method=6)
            rows.append({
                "spec": spec, "topic": topic, "position": position,
                "file": os.path.relpath(dst, REPO).replace(os.sep, "/"),
                "width": width, "height": height,
                "bytes": os.path.getsize(dst), "source": name,
            })

    rows.sort(key=lambda r: (r["spec"], r["topic"], r["position"]))
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)

    src_mb = sum(os.path.getsize(os.path.join(dp, f)) for dp, _d, fs in os.walk(ROOT)
                 for f in fs if f.lower().endswith(".png")) / 1e6
    out_mb = sum(r["bytes"] for r in rows) / 1e6
    themes = {(r["spec"], r["topic"]) for r in rows}
    print("MemoreCards prepared")
    print("  source : %s" % ROOT)
    print("  cards  : %d in %d themes, %d specialties" % (len(rows), len(themes), len({r['spec'] for r in rows})))
    print("  size   : %.1f MB PNG -> %.1f MB WebP (%.0f%% smaller)" % (src_mb, out_mb, 100 * (1 - out_mb / src_mb)))
    print("  largest: %.0f KB" % (max(r["bytes"] for r in rows) / 1e3))
    print("  manifest: %s" % os.path.relpath(MANIFEST, REPO))
    for w in warnings:
        print("  ! " + w)


if __name__ == "__main__":
    main()
