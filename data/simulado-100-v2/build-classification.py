"""Turn Karina's authoritative list into classification.json.

She writes SIX labels but reports on FIVE grandes áreas: Ginecologia and
Obstetrícia are separate labels in her sheet and combined as
"Ginecologia e Obstetrícia" in the distribution she signed off on (18), which is
also one of the five áreas she wants shown in the report. So both map to `go`.
"""
import json, collections

AREA_SLUG = {
    "Clínica Médica": "clinica-medica",
    "Cirurgia Geral": "cirurgia",
    "Ginecologia": "go",
    "Obstetrícia": "go",
    "Pediatria": "pediatria",
    "Saúde Coletiva": "saude-coletiva",
}

# Distribution Karina signed off on, by reporting área.
EXPECTED = {
    "clinica-medica": 39,
    "go": 18,
    "pediatria": 17,
    "cirurgia": 16,
    "saude-coletiva": 10,
}

rows = []
seen = set()
for line in open("karina-classification.txt", encoding="utf-8"):
    line = line.strip()
    if not line:
        continue
    num, area, tema = line.split("|")
    num = int(num)
    assert num not in seen, f"duplicate Q{num}"
    seen.add(num)
    assert area in AREA_SLUG, f"unknown área {area!r} on Q{num}"
    assert tema.strip(), f"empty tema on Q{num}"
    rows.append({"number": num, "area": AREA_SLUG[area], "tema": tema.strip(),
                 "confidence": "alta", "note": "", "karina_label": area})

assert len(rows) == 100, f"expected 100, got {len(rows)}"
assert sorted(seen) == list(range(1, 101)), "numbers are not exactly 1..100"

counts = collections.Counter(r["area"] for r in rows)
print("Reporting-área distribution (Karina's list vs. her stated totals):")
ok = True
for slug, expected in EXPECTED.items():
    got = counts[slug]
    flag = "OK " if got == expected else "MISMATCH"
    if got != expected:
        ok = False
    print(f"  {slug:<16} {got:>3}   stated {expected:>3}   {flag}")
print(f"  {'TOTAL':<16} {sum(counts.values()):>3}")

sub = collections.Counter(r["karina_label"] for r in rows)
print(f"\n  (her split inside GO: Ginecologia {sub['Ginecologia']} + "
      f"Obstetrícia {sub['Obstetrícia']} = {sub['Ginecologia'] + sub['Obstetrícia']})")

temas = [r["tema"] for r in rows]
print(f"\n  distinct temas: {len(set(temas))} of {len(temas)}")
dupes = [t for t, c in collections.Counter(temas).items() if c > 1]
if dupes:
    print("  repeated temas:", dupes)

for r in rows:
    r.pop("karina_label")
json.dump(rows, open("classification.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print(f"\nwrote classification.json ({len(rows)} rows) — "
      f"{'all totals match' if ok else 'TOTALS DISAGREE, DO NOT IMPORT'}")
