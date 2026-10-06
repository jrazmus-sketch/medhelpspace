"""
prepare-resumo-images.py — images inside a Resumo Narrativo .docx → Bunny CDN.

Karina 2026-10-06 ("Atualização dos Resumos Narrativos de Cardiologia — Bradiarritmia e
Taquiarritmia"): same text, plus the ECG strips. Each image is a self-contained figure
(title + labels baked in), so it is shipped as-is: resized to 1400 px wide (2× the widest
column) and saved as lossless WebP. The importer (scripts/import-resumos-v2.js) places a
<figure> where the image sits in the document, using parsed/resumos-images.json.

    python scripts/prepare-resumo-images.py            # extract + convert + manifest (dry run)
    python scripts/prepare-resumo-images.py --upload   # … and PUT them to Bunny storage

Remote path images/resumos/v1/<specialty>/<slug>/<nn>-<title>.webp — versioned: a later
redo goes to v2, never over a cached v1.
"""
import io
import json
import os
import re
import sys
import unicodedata
import urllib.request
import zipfile

from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, "parsed", "resumos-images")
MANIFEST = os.path.join(REPO, "parsed", "resumos-images.json")
CDN = "https://medhelpspace.b-cdn.net"
REMOTE = "images/resumos/v1"
WIDTH = 1400

# docx → (specialty, slug, {media name: alt}). Alt text = the figure's own title.
SOURCES = [
    ("parsed/resumos-2026-10-06-ecg/bradiarritmias.docx", "cardiologia", "bradiarritmias-resumos", {
        "image8.png": "ECG — Bradicardia sinusal",
        "image1.png": "ECG — Pausa sinusal",
        "image2.png": "ECG — Bloqueio AV de 1º grau",
        "image6.png": "ECG — Bloqueio AV de 2º grau, Mobitz I",
        "image3.png": "ECG — Bloqueio AV 2:1",
        "image7.png": "ECG — Bloqueio AV de 2º grau, Mobitz II",
        "image5.png": "ECG — Bloqueio AV avançado / de alto grau",
        "image4.png": "ECG — Bloqueio AV total (3º grau)",
    }),
    ("parsed/resumos-2026-10-06-ecg/taquiarritmias.docx", "cardiologia", "taquiarritmias-resumos", {
        "image8.png": "ECG — Taquicardia sinusal e taquicardias atriais",
        "image4.png": "ECG — Taquicardia supraventricular paroxística",
        "image7.png": "ECG — Fibrilação atrial com resposta rápida",
        "image6.png": "ECG — Flutter atrial",
        "image3.png": "ECG — Pré-excitação ventricular e FA pré-excitada",
        "image5.png": "ECG — Taquicardia ventricular monomórfica",
        "image1.png": "ECG — QT longo e torsades de pointes",
        "image2.png": "ECG — Fibrilação ventricular",
    }),
]


def kebab(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def media_in_order(docx):
    """Media names in the order their drawings appear in word/document.xml."""
    z = zipfile.ZipFile(docx)
    xml = z.read("word/document.xml").decode("utf8")
    rels = z.read("word/_rels/document.xml.rels").decode("utf8")
    rmap = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', rels))
    order = [rmap[r].split("/")[-1] for r in re.findall(r'<a:blip[^>]*r:embed="(rId\d+)"', xml)]
    return z, order


def load_env():
    for line in open(os.path.join(REPO, "app", ".env.local"), encoding="utf8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main():
    upload = "--upload" in sys.argv
    manifest = {}
    os.makedirs(OUT_DIR, exist_ok=True)
    for rel, spec, slug, alts in SOURCES:
        z, order = media_in_order(os.path.join(REPO, rel))
        missing = [m for m in order if m not in alts]
        if missing:
            sys.exit(f"✗ {rel}: no alt text for {missing}")
        for n, media in enumerate(order, 1):
            alt = alts[media]
            im = Image.open(io.BytesIO(z.read(f"word/media/{media}"))).convert("RGB")
            h = round(im.height * WIDTH / im.width)
            im = im.resize((WIDTH, h), Image.LANCZOS)
            name = f"{n:02d}-{kebab(alt.replace('ECG — ', ''))}.webp"
            local = os.path.join(OUT_DIR, slug, name)
            os.makedirs(os.path.dirname(local), exist_ok=True)
            im.save(local, "WEBP", lossless=True, method=6)
            remote = f"{REMOTE}/{spec}/{slug}/{name}"
            manifest[f"{slug}/{media}"] = {"url": f"{CDN}/{remote}", "remote": remote, "local": os.path.relpath(local, REPO), "w": WIDTH, "h": h, "alt": alt}
            print(f"  {slug} {media:>11} → {name}  {WIDTH}×{h}  {os.path.getsize(local) // 1024} KB")
    with open(MANIFEST, "w", encoding="utf8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"✓ {len(manifest)} image(s) → {os.path.relpath(MANIFEST, REPO)}")

    if not upload:
        print("  (dry run — add --upload to send them to Bunny)")
        return
    load_env()
    host, zone, key = os.environ.get("BUNNY_STORAGE_HOSTNAME"), os.environ.get("BUNNY_STORAGE_ZONE"), os.environ.get("BUNNY_API_KEY")
    if not (host and zone and key):
        sys.exit("✗ Missing BUNNY_STORAGE_HOSTNAME / BUNNY_STORAGE_ZONE / BUNNY_API_KEY in app/.env.local")
    base = f"https://{host}".rstrip("/")
    for item in manifest.values():
        with open(os.path.join(REPO, item["local"]), "rb") as f:
            req = urllib.request.Request(f"{base}/{zone}/{item['remote']}", data=f.read(), method="PUT", headers={"AccessKey": key, "Content-Type": "image/webp"})
        with urllib.request.urlopen(req) as res:
            if res.status not in (200, 201):
                sys.exit(f"✗ {item['remote']}: HTTP {res.status}")
    print(f"✓ uploaded {len(manifest)} to {REMOTE}/")


if __name__ == "__main__":
    main()
