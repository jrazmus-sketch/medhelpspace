# Simulado 100Q — parsed source data (set_version 2)

The machine-readable form of Karina's two PDFs, plus her final área/tema
classification. **`scripts/import-simulado-100.js` reads this directory** — without
it the set cannot be re-imported without re-parsing the PDFs from scratch.

Original PDFs: `OneDrive/Desktop/Medhelpspace/New 100/`
(`simulado-100q.pdf`, `gabarito-comentado-simulado-100q.pdf`, `Novo simulado.rtf`).

## Files

| File | What it is |
|---|---|
| `merged.json` | The 100 questions: enunciado, four alternatives, `correct_index`, comentário, distractor analysis, conceito-chave |
| `classification.json` | Grande área + tema per question — Karina's final, approved classification |
| `karina-classification.txt` | Her raw list as sent, `número\|área\|tema`. The source of truth for the file above |
| `build-classification.py` | Regenerates `classification.json` from that list and asserts the totals reconcile |
| `figure-urls.json` | Question number → Bunny CDN URL, for the seven questions with images |

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

Every correct answer was cross-validated three independent ways before import:

1. the letter stated in the gabarito comentado,
2. the printed GABARITO grid on page 19 of the questions PDF,
3. the correct alternative's *text* matched back against the alternatives parsed
   from the other PDF.

All 100 agreed. Answer spread is 28 A / 25 B / 25 C / 22 D.

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
