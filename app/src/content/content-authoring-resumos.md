# Content authoring spec — Resumos pages

This document tells **Karina (or ChatGPT working for her)** how to format new "Resumos" content so it can be bulk-imported into the MedHelpSpace site automatically — no manual cleanup on Justin's side.

Follow this spec exactly. The import script is strict on purpose: any deviation means a page is rejected and has to be edited by hand.

---

## 1. File format (high level)

- One **Markdown file per page** (`.md`).
- The file has two parts:
  1. **Frontmatter** at the top — a small YAML block with the page metadata (title, slug, specialty, etc.).
  2. **Body** below the frontmatter — the actual content in Markdown.

That's it. No Word docs, no Google Doc exports, no `.docx`. Markdown only.

---

## 2. Filename convention

```
{page-slug}.md
```

The filename **must equal the slug** (URL path) of the page, with `.md` at the end.

| Page title | Slug | Filename |
|---|---|---|
| Bradiarritmias Resumos | `bradiarritmias-resumos` | `bradiarritmias-resumos.md` |
| Taquiarritmias Resumos | `taquiarritmias-resumos` | `taquiarritmias-resumos.md` |
| Síndrome Coronariana Aguda Resumos | `sindrome-coronariana-aguda-resumos` | `sindrome-coronariana-aguda-resumos.md` |

**Slug rules** (this is the URL — must be safe):
- Lowercase only.
- ASCII only — strip all accents: `ã → a`, `ç → c`, `é → e`, `ó → o`, etc.
- Spaces become hyphens.
- No special characters except hyphens.
- **Always end with `-resumos`** for resumo pages.

---

## 3. Google Drive folder structure

Save the files in this exact folder layout:

```
MedHelpSpace Content/
└── Resumos/
    ├── cardiologia/
    │   ├── bradiarritmias-resumos.md
    │   ├── taquiarritmias-resumos.md
    │   └── sindrome-coronariana-aguda-resumos.md
    ├── pneumologia/
    │   └── asma-resumos.md
    ├── reumatologia/
    │   └── ...
    └── ...
```

One subfolder per specialty. Specialty folder names use the same slug format as URLs:

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
| Medicina de Emergência | `medicina-de-emergencia` |
| Saúde Coletiva | `saude-coletiva` |

---

## 4. Frontmatter (required at top of every file)

```yaml
---
title: Bradiarritmias Resumos
slug: bradiarritmias-resumos
specialty: cardiologia
view: resumos
type: plain-content
---
```

| Field | What it is | Example |
|---|---|---|
| `title` | What appears at the top of the page (with accents/capitalization intact) | `Bradiarritmias Resumos` |
| `slug` | URL path piece — must match filename (without `.md`) | `bradiarritmias-resumos` |
| `specialty` | Specialty folder slug (from table above) | `cardiologia` |
| `view` | Always `resumos` for resumo pages | `resumos` |
| `type` | Always `plain-content` for resumo pages | `plain-content` |

All five fields are **required**. The import script rejects any file missing one.

---

## 5. Body — Markdown conventions

Below the closing `---` of the frontmatter, write the content in standard Markdown. Use these specific conventions:

### Headings

- `## Heading 2` → **black, bold, large** — used for the main topic/section title (e.g. `Bradiarritmias`).
- `### Heading 3` → **brand purple, bold, medium** — used for narrative titles AND scene/episode headings (e.g. `"Quando o Ritmo Desacelera"` or `Cena 1 – O monitor não grita, mas o corpo avisa`).
- `#### Heading 4` → smaller subheading. Use sparingly.
- **Never use `# Heading 1`** — the page title comes from the frontmatter `title:` field, not from the body.

### Emphasis

- `*italic*` → italic. Use for narrator's voice, subtitles, asides.
- `**bold**` → bold. Use for emphasis inside a paragraph (e.g. **marca-passo definitivo**).
- Don't combine: no `***bold italic***`.

### Paragraphs

- Just write prose. Separate paragraphs with a blank line.
- For lines that should sit close together (like a multi-line stanza in the narrative), use **single line breaks** between them — the import script preserves these with `<br>`. Example:

```markdown
Ele não chega em corrida elétrica.
Ele chega em câmera lenta.
```

renders as two lines in one paragraph.

### Dialogue

- Use an em-dash (`—`) followed by the quote in straight quotes. Don't use `<blockquote>` or `>` for dialogue. Example:

```markdown
— "Doutor, parece que meu coração está falhando… fico escurecendo."
```

### Lists

- Bullet lists: hyphen + space:
  ```markdown
  - First item
  - Second item
  - Third item
  ```
- Numbered lists: digit + period + space:
  ```markdown
  1. First step
  2. Second step
  ```
- **Don't use emoji as bullets** (`●`, `🟪`, `📌`, `🟣`, `❌`, etc.). The import script strips them.

### Inline punctuation

- Use **straight quotes** (`"like this"`), not curly quotes (`"like this"`). The renderer handles typography.
- Em-dash `—` (the long one) for dialogue and asides. Hyphen `-` for compound words. En-dash `–` is fine for ranges.

### Links

- Internal links to other pages on the site:
  ```markdown
  [bradiarritmia AV avançada](bradiarritmias)
  ```
  The text in `()` is the **slug** of the target page (the part after `/app/cardiologia/`). The import script resolves it to the page ID.
- External links: full URL.
  ```markdown
  [SBC 2023 diretriz](https://example.com/diretriz.pdf)
  ```

### Images

- Host the image first on Bunny CDN (`medhelpspace.b-cdn.net`), then reference it:
  ```markdown
  ![Eletrocardiograma de BAV total](https://medhelpspace.b-cdn.net/Images/cardiologia/bav-total.png)
  ```
- Alt text in the brackets is required (helps screen readers and search).
- Don't paste base64 images. Don't upload images to Google Drive expecting the import to grab them.

---

## 6. Things to NEVER include

The import script will strip these or reject the file:

| Don't include | Why |
|---|---|
| `<div>`, `<span>`, `<p style="...">`, any raw HTML | We want clean Markdown. The script generates the HTML. |
| Inline colors (`<span style="color:#b046e9">`) | Brand purple is applied by the renderer based on heading level, not per-element. |
| Decorative emoji as bullets (`●`, `🟪`, `📌`, `🟣`, `❌`, `⚠️`, `🧠`) | These were a WordPress workaround. Use real Markdown lists instead. |
| `<br>` tags written manually | Use Markdown single-line breaks (a single newline inside a paragraph). |
| `&nbsp;` | Just type a regular space. |
| WordPress shortcodes (`[et_pb_text]`, `[h5p id=...]`, `[zoomsounds_player]`) | These were a Divi/WP thing. Not used in the new system. |
| Decorative emoji in the heading text itself (e.g. `### 🟪 Comentário:`) | Brand styling is automatic; emoji in headings clash with it. |

---

## 7. Complete example — `bradiarritmias-resumos.md`

This is what a finished file looks like, top to bottom:

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

Ele não chega em corrida elétrica.
Ele chega em câmera lenta.

— "Doutor, parece que meu coração está falhando… fico escurecendo."

E aí começa o raciocínio que a prova ama:
bradiarritmia não é apenas "pulso baixo".
É um ritmo lento que pode ou não comprometer débito cardíaco, perfusão e condução elétrica.

**Primeiro clique:** nem toda bradicardia é doença. Atleta, sono, alto tônus vagal e algumas situações fisiológicas podem cursar com frequência baixa sem significado patológico. Já a bradicardia **sintomática**, ou acompanhada de **distúrbio de condução**, muda totalmente o peso do caso.

### Cena 2 – O ECG fala antes do paciente

Os achados que devem chamar atenção no traçado:

- Frequência abaixo de 50 bpm com sintomas
- Ondas P sem QRS correspondente (bloqueio AV de alto grau)
- Pausa sinusal > 3 segundos
- Ondas "a em canhão" no pulso venoso jugular

Cada um desses achados aponta para uma fisiopatologia diferente — e cada um muda a conduta.

### Resumo-chave

- Bradiarritmia sintomática + distúrbio de condução = avaliar marca-passo
- ECG é a chave: localize o nível do bloqueio
- Não confunda bradicardia fisiológica com patológica
```

---

## 8. Pre-import checklist (for the author before saving the file to Drive)

Run through this list for every file:

- [ ] Filename ends in `.md` and matches the `slug` in frontmatter
- [ ] Filename ends in `-resumos`
- [ ] File is in the correct specialty subfolder under `MedHelpSpace Content/Resumos/`
- [ ] Frontmatter is at the top, between two `---` lines
- [ ] All five frontmatter fields are filled in
- [ ] No `# Heading 1` in body (page title comes from frontmatter)
- [ ] At least one `## Heading 2` (the section header)
- [ ] No raw HTML, no `<span style="...">`, no decorative bullet emoji
- [ ] Internal links use slugs, not full URLs
- [ ] Straight quotes, not curly quotes
- [ ] If there are images, they're already uploaded to Bunny CDN with the full URL pasted in

---

## 9. What happens at import time

When Justin runs the bulk import script:

1. The script walks `MedHelpSpace Content/Resumos/{specialty}/*.md`.
2. For each file:
   - Parses the frontmatter.
   - Looks up the specialty's parent hub by convention (`{specialty}-resumos`, e.g. `cardiologia-resumos`).
   - Converts the Markdown body to clean HTML.
   - Inserts (or updates, if the slug already exists) a row in `pages` and the corresponding `lessons` row.
   - Logs success or error.
3. Files with errors stay in Drive untouched — the author fixes them and the next import picks them up.

Re-importing the same file is safe (idempotent): existing pages get **updated**, not duplicated.

---

## 10. Quick reference for ChatGPT

If you're priming ChatGPT to write these files, paste this short version as a system prompt:

> You are writing content for MedHelpSpace, a Brazilian medical exam-prep site. Output a single Markdown file in this exact shape:
>
> 1. YAML frontmatter at the top with `title`, `slug`, `specialty`, `view: resumos`, `type: plain-content`.
> 2. Body in Markdown only — no HTML, no inline styles, no decorative emoji bullets.
> 3. Use `##` for the main section heading (black). Use `###` for narrative titles and scene/episode headings (these render in brand purple automatically).
> 4. Use `*italic*` for narrator voice, `**bold**` for emphasis, hyphen-space `- ` for bullet lists.
> 5. Dialogue uses an em-dash `—` followed by straight quotes. Single newlines inside a paragraph for tight multi-line stanzas; blank line between paragraphs.
> 6. Slug = lowercase, ASCII (strip accents), hyphens for spaces, ends in `-resumos`.
> 7. Filename = `{slug}.md`. Save to `MedHelpSpace Content/Resumos/{specialty}/`.
>
> Match the tone of an experienced clinical professor narrating a case. Use Brazilian Portuguese throughout. Never include WordPress shortcodes (`[h5p ...]`, `[et_pb_text]`, `[zoomsounds_player]`).

---

*Last updated 2026-05-30. Questions: ping Justin.*
