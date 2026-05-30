# Content authoring spec — Resumos & Fórmula pages

This document tells **Karina (and ChatGPT working for her)** how to format new content for two page types on MedHelpSpace:

- **Resumos** — narrative-style summary pages ("Quando o Ritmo Desacelera…")
- **Fórmula** — decision-rule / pattern-recognition pages ("BRADIARRITMIAS (BAVT)") with pitfalls and memory hooks

Both share the same Markdown format. They differ only in their `view:` metadata field, their filename suffix, and which folder they live in.

Files written to this spec can be **bulk-imported** automatically — no manual cleanup. The import script is strict: deviations are rejected.

---

## 1. File format (high level)

- One **Markdown file per page** (`.md`).
- The file has two parts:
  1. **Frontmatter** at the top — a small YAML block with the page metadata.
  2. **Body** below the frontmatter — the actual content in Markdown.

That's it. No Word docs, no `.docx`, no Google Doc HTML exports. Markdown only.

---

## 2. Filename convention

```
{page-slug}.md
```

The filename **must equal the slug** (URL path) of the page, with `.md` at the end. The suffix tells the script which page type it is:

| Page type | Slug ends in | Filename example |
|---|---|---|
| Resumos | `-resumos` | `bradiarritmias-resumos.md` |
| Fórmula | `-formula` | `bradiarritmias-formula.md` |

**Slug rules** (this is the URL — must be safe):
- Lowercase only.
- ASCII only — strip all accents: `ã → a`, `ç → c`, `é → e`, `ó → o`.
- Spaces become hyphens.
- No special characters except hyphens.
- Always end with `-resumos` or `-formula`.

---

## 3. Google Drive folder structure

Save the files in this exact folder layout:

```
MedHelpSpace Content/
├── Resumos/
│   ├── cardiologia/
│   │   ├── bradiarritmias-resumos.md
│   │   └── taquiarritmias-resumos.md
│   ├── pneumologia/
│   │   └── asma-resumos.md
│   └── ...
└── Formula/
    ├── cardiologia/
    │   ├── bradiarritmias-formula.md
    │   └── sindrome-coronariana-aguda-formula.md
    ├── pneumologia/
    │   └── ...
    └── ...
```

One subfolder per specialty. Folder names use the same slug format as URLs:

| Specialty | Folder name |
|---|---|
| Cardiologia | `cardiologia` |
| Pneumologia | `pneumologia` |
| Reumatologia | `reumatologia` |
| Endocrinologia | `endocrinologia` |
| Gastroenterologia | `gastroenterologia` |
| Hematologia | `hematologia` |
| Infectologia | `infectologia` |
| Nefrologia | `nefrologia` |
| Neurologia | `neurologia` |
| Dermatologia | `dermatologia` |
| Psiquiatria | `psiquiatria` |
| Ginecologia | `ginecologia` |
| Obstetrícia | `obstetricia` |
| Pediatria | `pediatria` |
| Cirurgia Geral | `cirurgia-geral` |
| Medicina de Emergência | `emergencia` |
| Saúde Coletiva | `saude-coletiva` |

---

## 4. Frontmatter (required at top of every file)

**For Resumos:**

```yaml
---
title: Bradiarritmias Resumos
slug: bradiarritmias-resumos
specialty: cardiologia
view: resumos
type: plain-content
---
```

**For Fórmula:**

```yaml
---
title: Bradiarritmias Formula
slug: bradiarritmias-formula
specialty: cardiologia
view: formula
type: plain-content
---
```

| Field | What it is | Example |
|---|---|---|
| `title` | Page title (accents/capitalization intact) | `Bradiarritmias Formula` |
| `slug` | URL path piece — must match filename (without `.md`) | `bradiarritmias-formula` |
| `specialty` | Specialty folder slug (from table above) | `cardiologia` |
| `view` | `resumos` OR `formula` | `formula` |
| `type` | Always `plain-content` | `plain-content` |

All five fields are **required**. The import script rejects any file missing one.

---

## 5. Body — Markdown conventions

Below the closing `---` of the frontmatter, write the content in standard Markdown.

### Headings

- `## Heading 2` → **black, bold, large** — main topic/section title (e.g. `Bradiarritmias`).
- `### Heading 3` → **brand purple, bold, medium** — narrative titles, scene/episode headings, pegadinha/regrinha headings (e.g. `"Quando o Ritmo Desacelera"`, `Cena 1`, `Pegadinha Clássica`, `Regrinha da Memorização`).
- `#### Heading 4` → smaller subheading. Use sparingly.
- **Never use `# Heading 1`** — page title comes from the frontmatter `title:` field.

### Emphasis

- `*italic*` → italic. Use for narrator's voice, subtitles, asides.
- `**bold**` → bold. Use for emphasis inside a paragraph (e.g. **marca-passo definitivo**).
- Don't combine: no `***bold italic***`.

### Paragraphs

- Just write prose. Separate paragraphs with a blank line.
- For tight multi-line stanzas (narrative), use **single line breaks** between them.

```markdown
Ele não chega em corrida elétrica.
Ele chega em câmera lenta.
```

### Dialogue

```markdown
— "Doutor, parece que meu coração está falhando… fico escurecendo."
```

Em-dash + straight quotes. **Don't** use `>` blockquote for dialogue.

### Lists — three semantic types

The author writes natural emoji-bulleted lists. The import script converts them into typed `<ul>` elements that get rendered with the appropriate marker via CSS. **Don't** write the HTML by hand — just use these emoji prefixes:

| Bullet prefix | Meaning | Renders as |
|---|---|---|
| `-` or `*` | Standard bullet | `•` (filled disc) |
| `❌` | "Pegadinha" / pitfall | `❌` (X mark) |
| `🟣` | "Resumo-chave" / key takeaway | `🟣` (purple circle) |
| `💬` | "Regrinha" / memorization hint | `💬` (speech bubble) |

```markdown
### Pegadinha Clássica
❌ Viu ondas "a" em canhão e pensou em sopro? Erro – isso aponta para dissociação AV.
❌ Marcou atropina isolada como solução do BAVT? Pegadinha – pode até ser tentada, mas costuma falhar.
❌ Indicou cardioversão elétrica para bradicardia? Nunca – cardioversão é conduta de taquiarritmia.

### Regrinha da Memorização
💬 "Canhão no pescoço, bloqueio no circuito."
💬 "Bradicardia sintomática + bloqueio AV alto grau = marca-passo definitivo."

### Resumo-chave
🟣 BAVT sintomático = marca-passo definitivo.
🟣 ECG é a chave para localizar o nível do bloqueio.
```

For regular bullet lists, hyphen + space:

```markdown
- Frequência abaixo de 50 bpm com sintomas
- Ondas P sem QRS correspondente
- Pausa sinusal > 3 segundos
```

Numbered lists work the same way: `1.` `2.` `3.`

### Inline punctuation

- Use **straight quotes** (`"like this"`), not curly quotes.
- Em-dash `—` for dialogue and asides. Hyphen `-` for compound words. En-dash `–` is fine for ranges.

### Links

Internal links use the target page's slug:

```markdown
[bradiarritmia AV avançada](bradiarritmias)
```

External links: full URL.

```markdown
[SBC 2023 diretriz](https://example.com/diretriz.pdf)
```

### Images

Host on Bunny CDN first, then reference:

```markdown
![Eletrocardiograma de BAV total](https://medhelpspace.b-cdn.net/Images/cardiologia/bav-total.png)
```

Alt text required. Don't paste base64; don't expect Google Drive image links to work.

---

## 6. Things to NEVER include

| Don't include | Why |
|---|---|
| `<div>`, `<span>`, `<p style="...">`, any raw HTML | Markdown only — the script generates the HTML. |
| Inline colors (`<span style="color:#b046e9">`) | Brand purple is applied automatically based on heading level. |
| Manual `<ul class="pega">` HTML | Use `❌` bullet prefix; script handles the class. |
| `<br>` tags written by hand | Use Markdown single-line breaks instead. |
| `&nbsp;` | Just type a regular space. |
| WordPress shortcodes (`[et_pb_text]`, `[h5p id=...]`, `[zoomsounds_player]`) | Not used in the new system. |
| Decorative emoji **in the heading text** (e.g. `### 🟪 Comentário:`) | Brand styling is automatic; emoji clash with it. |

---

## 7. Complete examples

### `bradiarritmias-resumos.md` (Resumos page)

```markdown
---
title: Bradiarritmias Resumos
slug: bradiarritmias-resumos
specialty: cardiologia
view: resumos
type: plain-content
---

## Bradiarritmias

### "Quando o Ritmo Desacelera" – Uma história chamada Bradiarritmias

*Resumos Narrativos – Clínica em Cena | MedHelpSpace Revalida*

### Cena 1 – O monitor não grita, mas o corpo avisa

Você entra na sala e o traçado parece "calmo demais".
Homem de 72 anos. Tontura. Fraqueza. Quase síncope ao levantar.
No monitor: frequência de 38 bpm.

— "Doutor, parece que meu coração está falhando… fico escurecendo."

**Primeiro clique:** nem toda bradicardia é doença. Atleta, sono, alto tônus vagal e algumas situações fisiológicas podem cursar com frequência baixa sem significado patológico.

### Resumo-chave
🟣 Bradiarritmia sintomática + distúrbio de condução = avaliar marca-passo
🟣 ECG é a chave: localize o nível do bloqueio
🟣 Não confunda bradicardia fisiológica com patológica
```

### `bradiarritmias-formula.md` (Fórmula page)

```markdown
---
title: Bradiarritmias Formula
slug: bradiarritmias-formula
specialty: cardiologia
view: formula
type: plain-content
---

## Bradiarritmias

### BRADIARRITMIAS (BAVT)

*Fórmula MedHelp – Decisão Treinada | MedHelpSpace Revalida*

### Pegadinha Clássica
❌ Viu ondas "a" em canhão e pensou em sopro? Erro – isso aponta para dissociação AV.
❌ Paciente com ritmo de escape e PA preservada virou "tranquilo"? Cuidado – precisa monitorização e pode deteriorar.
❌ Marcou atropina isolada como solução do BAVT? Pegadinha – pode até ser tentada, mas costuma falhar.
❌ Esqueceu do marca-passo transcutâneo como ponte? Vacilo de prova – ele entra na estabilização.
❌ Indicou cardioversão elétrica para bradicardia? Nunca – cardioversão é conduta de taquiarritmia.
❌ Achou que marca-passo definitivo só vale se houver sintoma? Erro – no BAVT persistente, ele é a conduta definitiva.

### Regrinha da Memorização
💬 "Canhão no pescoço, bloqueio no circuito."
💬 "BAVT sintomático = marca-passo definitivo, sempre."
💬 "Atropina tenta, transcutâneo segura, definitivo resolve."
```

---

## 8. Pre-import checklist

Run through this list for every file:

- [ ] Filename ends in `.md` and matches the `slug` in frontmatter
- [ ] Filename ends in `-resumos` OR `-formula`
- [ ] File is in the correct folder: `MedHelpSpace Content/Resumos/{specialty}/` or `…/Formula/{specialty}/`
- [ ] Frontmatter is at the top, between two `---` lines
- [ ] All five frontmatter fields are filled in
- [ ] `view:` matches the folder + filename suffix
- [ ] No `# Heading 1` in body
- [ ] At least one `## Heading 2`
- [ ] No raw HTML, no `<span style="...">`, no manual `<ul class="…">`
- [ ] Pitfall lists use `❌` prefix; memory hooks use `💬`; key takeaways use `🟣`
- [ ] Internal links use slugs, not full URLs
- [ ] Straight quotes, not curly quotes
- [ ] If there are images, they're already on Bunny CDN with the full URL pasted in

---

## 9. What happens at import time

When Justin runs the bulk import script:

1. The script walks `MedHelpSpace Content/Resumos/**/*.md` and `MedHelpSpace Content/Formula/**/*.md` (synced locally via Google Drive for Desktop).
2. For each file:
   - Parses the frontmatter.
   - Looks up the specialty + view hub by convention (`{specialty}-{view}`, e.g. `cardiologia-formula`).
   - Converts the Markdown body to clean HTML, applying the semantic-bullet rules (❌ → `<ul class="pega">`, 🟣 → `<ul class="resumo">`, 💬 → `<ul class="dica">`).
   - **Backs up the existing `lessons.body_html`** to a backup table before overwriting (full rollback always available).
   - Upserts the `pages` row + the `lessons` row by slug.
3. Files with errors stay in Drive untouched — fix and the next import picks them up.

Re-importing the same file is safe (idempotent): existing pages get **updated**; nothing is duplicated.

---

## 10. Quick reference for ChatGPT

If you're priming ChatGPT to write these files, paste this short version as a system prompt:

> You are writing content for MedHelpSpace, a Brazilian medical exam-prep site. Output a single Markdown file in this exact shape:
>
> 1. YAML frontmatter at the top with `title`, `slug`, `specialty`, `view` (`resumos` or `formula`), `type: plain-content`.
> 2. Body in Markdown only — no HTML, no inline styles.
> 3. `##` for the main section heading (renders black). `###` for narrative titles, scene/episode headings, and Pegadinha / Regrinha / Resumo headings (these render in brand purple automatically).
> 4. Semantic bullets by prefix: `-` standard; `❌` pitfall ("Pegadinha"); `🟣` key takeaway ("Resumo-chave"); `💬` memorization hint ("Regrinha").
> 5. Dialogue: em-dash `—` followed by straight quotes. Single newlines inside a paragraph for tight multi-line stanzas; blank line between paragraphs.
> 6. Slug = lowercase, ASCII (strip accents), hyphens for spaces, ends in `-resumos` or `-formula`. Filename = `{slug}.md`. Save to `MedHelpSpace Content/{Resumos|Formula}/{specialty}/`.
>
> Match the tone of an experienced clinical professor narrating a case (Resumos) or distilling decision rules + pitfalls + memory hooks (Fórmula). Use Brazilian Portuguese. Never include WordPress shortcodes.

---

*Last updated 2026-05-30.*
