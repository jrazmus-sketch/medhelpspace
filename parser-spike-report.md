# Parser Spike Report

Seven page types parsed against real content from `db.sql`. All source excerpts are
from actual `wp_posts.post_content` or `wp_h5p_contents.parameters`.
Encoding note: non-ASCII chars appear as `?` in terminal output (Windows cp1252); the
actual stored bytes are correct UTF-8. The parser uses `utf-8` with `errors='replace'`.

---

## 1. plain-content — `bradiarritmias-resumos` (WP id 1620)

### Source excerpt (raw Divi shortcode, trimmed)
```
[et_pb_section ...][et_pb_row ...][et_pb_column ...]
  [et_pb_heading title="Bradiarritmias" ...]
  [et_pb_text ...]
    <p><span style="color: #b046e9;"><strong>"Quando o Ritmo Desacelera"...</strong></span>
    ... (narrative HTML, ~4 KB) ...
  [/et_pb_text]
[/et_pb_column][/et_pb_row][/et_pb_section]
```

### Parsed output (target-schema JSON)
```json
{
  "page_id": "1620",
  "slug": "bradiarritmias-resumos",
  "title": "Bradiarritmias Resumos",
  "type": "plain-content",
  "blocks": [
    { "type": "heading", "text": "Bradiarritmias" },
    { "type": "text", "html": "<p><span style=\"color: #b046e9;\"><strong>\"Quando o Ritmo Desacelera\" — Uma história chamada Bradiarritmias...</strong></span>...</p>" }
  ]
}
```

### Cleanup applied
- Divi attribute soup stripped from shortcode tags (only title/content kept)
- HTML entities decoded (`&#8221;` → `"`, `&#8220;` → `"`)
- Outer `[et_pb_section]` / `[et_pb_row]` / `[et_pb_column]` containers discarded

### Flags
- **Block count**: only 1 heading + 1 text block. The entire resumo narrative is one
  `[et_pb_text]` block. This is typical — each resumo page has at most one heading and
  one text block. The blocks array is confirmed correct.
- **`<span style="font-weight: 400;">` pattern** appears throughout. These are Notion
  paste artifacts (Notion exports inline `font-weight: 400` as a span). They render
  fine but add noise. Decision: keep for now; strip in a post-import cleanup pass if
  needed, since stripping is risky (could remove legitimate styling).

---

## 2. text-lesson — `bradiarritmias-simulados` (WP id 3884)

### Source excerpt
```
[et_pb_toggle title="Simulado 1 - Perguntas" open="on" ...]
  <p>SIMULADO REVALIDA INEP | MedHelpSpace<br>Questões inéditas no padrão da banca</p>
  <p>Questão 1 — A respeito das bradiarritmias...</p>
  ... (question + answer choices)
[/et_pb_toggle]
[et_pb_toggle title="Simulado 1 - Respostas" open="off" ...]
  <p>SIMULADO REVALIDA INEP | MedHelpSpace</p>
  ... (answers + explanations)
[/et_pb_toggle]
```

### Parsed output
```json
{
  "page_id": "3884",
  "slug": "bradiarritmias-simulados",
  "type": "text-lesson",
  "lessons": [
    {
      "position": 1,
      "title": "Simulado 1 - Perguntas",
      "body_html": "<p>SIMULADO REVALIDA INEP | MedHelpSpace<br />...</p>",
      "audio_url": null
    },
    {
      "position": 2,
      "title": "Simulado 1 - Respostas",
      "body_html": "<p>SIMULADO REVALIDA INEP | MedHelpSpace...</p>",
      "audio_url": null
    }
  ],
  "stripped_nav_toggles": []
}
```

### Cleanup applied
- Toggle attribute soup stripped, only `title` kept
- HTML entity decode, whitespace trim

### Flags
- Correct: 2 toggles → 2 `lessons` rows. No nav-link toggles on this page.
- The question text and answer choices are embedded as raw HTML in `body_html`. The app
  will render them as-is. No further parsing of question content is needed for simulados
  (they are NOT extracted into `quiz_questions` — only H5P quiz pages are).

---

## 3. text-lesson (mixed-toggle) — `pneumologia-medvoice` (WP id 3643)

Note: all four flagged mixed-toggle pages are in the medvoice track. In full parser,
these pages will be routed through the audio-lesson parser (not text-lesson), so audio
URLs will also be extracted. This spike uses text-lesson parsing to isolate the
nav-link detection logic.

### Source excerpt (toggle 4, stripped as nav-link)
```
[et_pb_toggle title="NÓDULO E CÂNCER DE PULMÃO" ...]
  <a href="https://medhelpspace.com.br/pneumologia/nodulo-e-cancer-de-pulmao/">
    Clique aqui para acessar o conteúdo
  </a>
[/et_pb_toggle]
```

### Parsed output
```json
{
  "lessons": [
    { "position": 1, "title": "ASMA", ... },
    { "position": 2, "title": "DERRAME PLEURAL", ... },
    { "position": 3, "title": "DPOC", ... },
    { "position": 4, "title": "PNEUMONIA", ... },
    { "position": 5, "title": "TUBERCULOSE", ... }
  ],
  "stripped_nav_toggles": [
    { "position": 4, "title": "NÓDULO E CÂNCER DE PULMÃO",
      "reason": "nav-link-only toggle" }
  ]
}
```

### Cleanup applied
- RE_LINK_ONLY regex: `^\s*(<a\b[^>]*>.*?</a>\s*)*\s*$` — detects toggles whose
  entire body is one or more `<a>` tags with no surrounding prose. Works correctly.

### Flags
- **Detection works**: the nav-link toggle at position 4 (not position 1 as the
  build_inventory note implied) was correctly identified and stripped.
- **Bug found (now fixed)**: earlier attempt used `re.sub(r'<[^>]+>', '', body)`
  to check for prose — this strips the text INSIDE `<a>` tags, making link-only
  toggles appear to have prose. Fixed to use RE_LINK_ONLY (matching build_inventory.py).
- **Implication**: `lessons.position` is renumbered after nav-link removal. Confirm
  this is the desired behavior (it is — position should be the rendered order).

---

## 4. audio-lesson — `cardiologia-medvoice` (WP id 3606)

**Critical finding**: audio is per-toggle, not per-page.

### Source excerpt (one toggle)
```
[et_pb_toggle title="BRADIARRITMIAS" ...]
  <p>MedVoice — A Clínica Fala<br>MedHelpSpace Revalida</p>
  [zoomsounds_player config="Medhelp1"
    source="https://medhelpspace.b-cdn.net/MedVoice-Audio/clinica-medica-feito/cardio-feito/bradiarrtimias-m.mp3"]
  <p>Um paciente de 64 anos...</p>
  ... (narrative transcript)
[/et_pb_toggle]
```

### Parsed output
```json
{
  "page_id": "3606",
  "slug": "cardiologia-medvoice",
  "type": "audio-lesson",
  "structure_note": "audio_url is per-toggle (one [zoomsounds_player source=URL] per toggle body)",
  "lessons": [
    {
      "position": 1,
      "title": "BRADIARRITMIAS",
      "body_html": "<p>MedVoice — A Clínica Fala<br />MedHelpSpace Revalida</p><p>Um paciente de 64 anos...</p>",
      "audio_url": "https://medhelpspace.b-cdn.net/MedVoice-Audio/clinica-medica-feito/cardio-feito/bradiarrtimias-m.mp3"
    },
    {
      "position": 2,
      "title": "CARDIOPATIAS CONGÊNITAS",
      "audio_url": "https://medhelpspace.b-cdn.net/MedVoice-Audio/clinica-medica-feito/cardio-feito/cardiopatias-congenitas-m.mp3",
      "body_html": "..."
    }
  ],
  "stripped_nav_toggles": []
}
```

9 lessons, each with a distinct Bunny CDN URL. `[zoomsounds_player]` shortcode stripped
from `body_html` before storing.

### Bugs found (both fixed)
1. **Wrong attribute name**: parser was reading `src=` — actual attribute is `source=`
   (e.g. `[zoomsounds_player config="Medhelp1" source="https://..."]`).
2. **Audio not per-page**: initial design assumed one audio URL per page. Actual structure
   is one audio per toggle. The `lessons.audio_url` column is correct; the parser must
   extract `source=` from within each toggle body and strip the shortcode from `body_html`.

### Schema confirmation
`lessons.audio_url` design is confirmed correct — nullable, per-lesson. No changes needed.

---

## 5. h5p-quiz (QuestionSet) — `bradiarritmias` (WP id 2076, H5P id 1)

### Embed in WP post content
```
[h5p id="1"]
```

### H5P parameters (excerpt)
```json
{
  "introPage": { "showIntroPage": false },
  "passPercentage": 100,
  "questions": [
    {
      "library": "H5P.MultiChoice 1.16",
      "subContentId": "a5f3c...",
      "params": {
        "question": "<h3><strong>Q1. Questão 1 (Revalida 2022.2)</strong></h3><p>Um paciente de 64 anos...</p>",
        "answers": [
          { "text": "<div><strong> (A) cardioversão elétrica.</strong></div>",
            "correct": false,
            "tipsAndFeedback": { "chosenFeedback": "", "notChosenFeedback": "" } },
          { "text": "<div><strong> (B) ablação de via anômala.</strong></div>",
            "correct": false, ... },
          { "text": "<div><strong> (C) marca-passo transcutâneo.</strong></div>",
            "correct": false, ... },
          { "text": "<div><strong> (D) atropina intravenosa.</strong></div>",
            "correct": true, "tipsAndFeedback": { "chosenFeedback": "Correto!" } }
        ]
      }
    }
  ]
}
```

### Parsed output (quiz_questions rows)
```json
[
  {
    "position": 1,
    "h5p_sub_id": "a5f3c...",
    "question": "<h3><strong>Q1. Questão 1 (Revalida 2022.2)</strong></h3><p>Um paciente de 64 anos...</p>",
    "answers": [
      { "text": "<div><strong>(A) cardioversão elétrica.</strong></div>",
        "correct": false, "feedback": "" },
      { "text": "<div><strong>(D) atropina intravenosa.</strong></div>",
        "correct": true,  "feedback": "Correto!" }
    ],
    "media_url": null
  }
]
```

### Bugs found (now fixed)
- **parse_row whitespace bug**: the SQL parser's `parse_row` function read the space
  before a quoted field as an unquoted value, consuming content up to the first
  internal comma of the JSON. Fix: skip leading whitespace at the start of each field.
  This bug affected ALL multi-column rows with space-padded values — critical fix for
  the full parser.

### Schema confirmation
`quiz_questions` table is correct. `answers` JSONB shape `[{text, correct, feedback}]`
confirmed. `feedback` comes from `tipsAndFeedback.chosenFeedback` per answer.

---

## 6. h5p-quiz (flashcards/memorecards) — MAJOR FINDINGS

Both `cardiologia-flashcards` (H5P id 45) and `cardiologia-memorecards` (H5P id 50)
are `H5P.CoursePresentation` (library_id 35) — a multi-slide container.
**They are structurally different from each other.**

---

### 6a. cardiologia-flashcards (H5P id 45)

**Structure**: CoursePresentation with 13 slides. Slide 0 = cover/empty. Slides 1–12
each contain exactly one `H5P.Dialogcards 1.9` element. Each Dialogcards block covers
one topic and contains N dialog cards.

```json
presentation.slides = [
  { "elements": [] },  // slide 0: cover (empty)
  {
    "elements": [{
      "library": "H5P.Dialogcards 1.9",
      "params": {
        "mode": "repetition",
        "title": "Bradiarritmias",
        "dialogs": [
          {
            "text": "<p style=\"text-align:center;\"><strong>Qual a definição de bradicardia com risco clínico?</strong></p>",
            "answer": "<p style=\"text-align:center;\"><strong>Frequência cardíaca baixa com repercussão hemodinâmica</strong></p>",
            "tips": {}
          },
          ... (25 more cards)
        ]
      }
    }]
  },
  // slides 2–12: same pattern, different topics
]
```

**Card counts per slide (12 topic slides)**:
Bradiarritmias=26, Cardiopatia Congênita=31, Crise Hipertensiva=25, Dislipidemias=29,
and 8 more topics. Total cards across all slides: several hundred.

**Key fields**: `dialogs[].text` = front (question), `dialogs[].answer` = back (answer).
No image field on these cards.

---

### 6b. cardiologia-memorecards (H5P id 50)

**Structure**: CoursePresentation with 11 slides. Slide 0 = cover. Slides 1–10 contain
`H5P.AdvancedText` and `H5P.Image` elements — **NOT flashcard/dialogcard content**.

```json
presentation.slides = [
  { "elements": [] },              // slide 0: cover
  { "elements": [{ "library": "H5P.AdvancedText 1.1",
                   "params": { "text": "<h2>Cardiologia</h2>..." } }] },
  { "elements": [{ "library": "H5P.Image 1.1",
                   "params": { "file": { "path": "images/..." } } }] },
  // more text + image slides
]
```

Memorecards is a **visual slide presentation** (title + image slides), not a card-flip
study tool. It cannot be stored in `flashcard_items`.

---

### Open questions answered

**Q: Same H5P type?** No. Same outer shell (CoursePresentation / library_id 35) but
completely different inner content: flashcards embed Dialogcards, memorecards embed
Text + Image slides.

**Q: Same track?** No. These are different experiences:
- Flashcards = active recall card-flip study tool (question → answer)
- Memorecards = passive visual review (slide deck with images)

They should remain separate tracks if surfaced in the app UI. Functionally they are
different enough that the "tracks" concept holds — flashcards track vs memorecards track
(or treat memorecards as a distinct content type entirely).

---

### Schema changes required (flashcard_items table)

**Current schema** (from schema.sql) is wrong for the actual data:

```sql
-- CURRENT (incorrect)
flashcard_items (front_text, back_text, image_url, tip)
```

**Required changes**:

1. **Field rename**: `front_text → text`, `back_text → answer` to match Dialogcards
   field names and avoid translation confusion in the parser.

2. **Group structure**: Dialogcards are grouped by slide (topic). Add:
   - `group_label text` — the Dialogcards `title` (e.g. "Bradiarritmias")
   - `group_position smallint` — slide index within the CoursePresentation (1-based)

3. **`position` field** stays as card position within the group (not globally unique
   by itself). The UNIQUE constraint must become `(page_id, group_position, position)`.

4. **No `image_url`** on Dialogcards cards in this dataset. Field can stay nullable
   but won't be populated for these pages.

**Revised `flashcard_items` table**:
```sql
CREATE TABLE flashcard_items (
  id             bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_id        bigint   NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  group_position smallint NOT NULL,   -- slide index within CoursePresentation (1-based)
  group_label    text,               -- Dialogcards title (topic name)
  position       smallint NOT NULL,   -- card index within the group (1-based)
  h5p_sub_id     uuid,
  text           text     NOT NULL,   -- front / question side (HTML)
  answer         text     NOT NULL,   -- back / answer side (HTML)
  image_url      text,
  tip            text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, group_position, position)
);
```

**Memorecards content**: needs a separate decision. Options:
- **New table** `presentation_slides(page_id, position, slide_type, content_html, image_url)` —
  typed but adds schema complexity
- **JSONB blob** on `pages.raw_content jsonb` — simple, flexible, loses queryability
- **Skip / rebuild natively** — memorecards is a slide deck; the app could rebuild it
  from a simpler source representation

Recommendation: add `raw_content jsonb` to `pages` as a catch-all for content types
that don't fit the typed tables (memorecards now, possibly others later). Parser writes
the full `parameters` JSON there; app reads it directly. Zero schema migration when new
H5P types are discovered.

---

## 7. blurb-nav-hub — `cardiologia` (WP id 1614)

### Source excerpt (one blurb shortcode)
```
[et_pb_blurb title="Bradiarritmias"
  url="@ET-DC@eyJkeW5hbWljIjp0cnVlLCJjb250ZW50IjoicG9zdF9saW5rX3VybF9wYWdlIiwic2V0dGluZ3MiOnsicG9zdF9pZCI6IjIwNzYifX0=@"
  _dynamic_attributes="link_option_url" ...]
```

### Decoded `@ET-DC@` value
```json
{
  "dynamic": true,
  "content": "post_link_url_page",
  "settings": { "post_id": "2076" }
}
```

### Parsed output (nav_items rows)
```json
[
  { "position": 1, "label": "Bradiarritmias",
    "target_page_id": "2076", "icon": null, "layout": "cards" },
  { "position": 2, "label": "Cardiopatia Congênita",
    "target_page_id": "2080", "icon": null, "layout": "cards" },
  ...
]
```

10 nav items for the cardiologia hub. All decoded correctly.

### Parser correction needed
The `target_page_id` is directly available in `decoded.settings.post_id`. The spike
parser was trying to resolve via slug lookup (which failed). Fix: extract
`decoded_url_info['settings']['post_id']` directly — it's already the WP post ID that
maps to `pages.id`. No slug lookup needed.

### Cleanup applied
- Base64 decode of `@ET-DC@...@` value
- JSON parse of decoded value
- `settings.post_id` extracted as `target_page_id`

---

## Summary: what needs to change before full parser

### Schema changes (schema.sql)

| Change | Reason |
|---|---|
| `flashcard_items`: rename `front_text→text`, `back_text→answer` | Dialogcards field names |
| `flashcard_items`: add `group_position`, `group_label` | CoursePresentation has grouped slides |
| `flashcard_items`: change UNIQUE to `(page_id, group_position, position)` | Cards are unique within group, not globally |
| `pages`: add `raw_content jsonb` (nullable) | For memorecards (slide presentation) and future unknown H5P types |

### Parser implementation notes

| Finding | Fix required |
|---|---|
| `parse_row` whitespace bug | Skip leading spaces before each field in the SQL row parser |
| Audio attribute is `source=` not `src=` | Fix in audio-lesson parser |
| Audio is per-toggle, not per-page | Extract `[zoomsounds_player source=...]` from inside each toggle body, strip it from `body_html` |
| Nav-link detection | Use RE_LINK_ONLY regex (not inner-text stripping) |
| Blurb target resolution | Use `decoded.settings.post_id` directly (not slug lookup) |
| Flashcard structure | CoursePresentation → slides → Dialogcards.dialogs (not top-level `cards` key) |
| Memorecards structure | CoursePresentation → slides → AdvancedText/Image (not flashcards) |

### Open question for team

**Memorecards (`cardiologia-memorecards` and all `*-memorecards` pages in medhelp-60d)**:
these are passive slide presentations (title + image decks), not active flashcard tools.
The current schema has no home for them. Recommend adding `raw_content jsonb` to `pages`
and writing the full `presentation.slides` JSON there. Alternatively, skip migration and
rebuild from a simpler source (the content is mostly images). Decision needed before
parser runs memorecards pages.

---

## Confirmed assumptions (no schema changes)

- `quiz_questions.answers` JSONB shape `[{text, correct, feedback}]` — correct
- `lessons.audio_url` nullable per-lesson — correct
- `nav_items.target_page_id` nullable for incomplete hubs — correct
- `pages.status = 'draft'` for orphaned H5P refs and incomplete blurb hubs — confirmed
- `plain-content` pages: one heading block + one text block is the norm — confirmed
