# Simulado 100Q — parsed source data (set_version 2)

The machine-readable form of Karina's two PDFs, plus her final área/tema
classification. **`scripts/import-simulado-100.js` reads this directory.**

Current source — the *versão definitiva*, August 2026:
`OneDrive/Desktop/Medhelpspace/SImulado 08-10-2026/`
(`simulado-100-questoes.pdf`, `gabarito-comentado-simulado-100-questoes.pdf`).
It supersedes the July set in `OneDrive/Desktop/Medhelpspace/New 100/`
(`simulado-100q.pdf`, `gabarito-comentado-simulado-100q.pdf`, `Novo simulado.rtf`).

## Files

| File | What it is |
|---|---|
| `merged.json` | The 100 questions: enunciado, four alternatives, `correct_index`, comentário, distractor analysis, conceito-chave. **Generated** by `scripts/parse-simulado-100-pdfs.py` |
| `classification.json` | Grande área + tema per question — Karina's final, approved classification |
| `karina-classification.txt` | Her raw list as sent, `número\|área\|tema`. The source of truth for the file above |
| `build-classification.py` | Regenerates `classification.json` from that list and asserts the totals reconcile |
| `figure-urls.json` | Question number → Bunny CDN URL, for the seven questions with images |

## Re-parsing after Karina sends a new caderno

```bash
python scripts/parse-simulado-100-pdfs.py --src "<pdf folder>"            # dry run + diff
python scripts/parse-simulado-100-pdfs.py --src "<pdf folder>" --write    # rewrite merged.json
```

The dry run prints a field-by-field diff against the `merged.json` already here, so a
revision can be reviewed before it is written — and it refuses to write at all unless
the answer key agrees across all three sources (below).

`classification.json` and `figure-urls.json` are **not** regenerated: they are keyed by
question number and survive a re-parse untouched, as long as the numbering holds. The
parser asserts that the figure-bearing questions still match `figure-urls.json`, and the
importer re-validates the área/tema coverage before writing.

Two things the August caderno changed that the parser now normalises:

- the sub/superscripts were flattened at source (`SpO2`, `mm3`, `166 x 100 mmHg`), so an
  explicit whitelist restores `SpO₂`, `mm³`, `166 × 100 mmHg`. It is a whitelist on
  purpose — a blanket digit rule would mangle T4, B12 and HbA1c;
- the printed GABARITO grid moved out of the questions PDF into the gabarito comentado
  (page 2), which is where `parse_grid` reads it.

## Re-importing

```bash
# prod
node scripts/import-simulado-100.js --dir data/simulado-100-v2 --apply \
     --member-page simulado-100q-3

# local
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
  node scripts/import-simulado-100.js --dir data/simulado-100-v2 --apply \
       --member-page simulado-100q-3
```

Drop `--apply` for a dry run; it validates and prints the área distribution without
writing. `--member-page` also syncs the MedHelp 60D copy in `quiz_questions`, which
is why a correction only ever has to be made once.

Rows upsert on `(set_version, position)` and `(page_id, position)`, so **question
ids are stable** — `leads.sim_progress` is keyed by them, and a delete/insert cycle
would silently wipe every in-progress exam.

## Provenance of the answer key

Every correct answer is cross-validated three independent ways, on every parse, and
any disagreement is a hard failure — a wrong key on a funnel that grades 100
questions is worse than no import at all:

1. the letter stated per question in the gabarito comentado,
2. the printed GABARITO SINTÉTICO grid (page 2 of the gabarito comentado; in the July
   caderno it lived on page 19 of the questions PDF),
3. the correct alternative's *text* matched back against the alternatives parsed
   from the questions PDF.

All 100 agree. Answer spread is 28 A / 25 B / 25 C / 22 D — unchanged from the July
set, as is the answer key itself on all 100 questions.

## Classification

Karina's approved distribution, which `build-classification.py` asserts on every
run:

| Grande área | Questões |
|---|---:|
| Clínica Médica | 39 |
| Ginecologia e Obstetrícia | 18 |
| Pediatria | 17 |
| Cirurgia Geral | 16 |
| Saúde Coletiva | 10 |

She labels Ginecologia (8) and Obstetrícia (10) separately at source; the candidate
sees the combined 18. All 100 temas are distinct — which is why the report lists
temas to revisit but never reports a percentage per tema.
