# Fórmula MedHelp — output/formatting spec (for import)

**Purpose:** Karina's master prompt already says *what* to write and *how* to write it. This
appendix only tells ChatGPT how to **format its output** so Claude can import each page
straight into Supabase (`pages` + `lessons`) with no reformatting. Paste this block at the
**end** of Karina's prompt, under a heading like "FORMATO DE SAÍDA".

At import each page becomes `type=plain-content`, `view=formula`, `content_module_id=1`
(gated in MedHelp 60D — do not change), `status=publish`, unique `slug` ending `-formula`.

---

## THE APPENDIX (copy everything below this line)

## FORMATO DE SAÍDA (para importação no site — siga à risca)

Devolva **cada página em um único bloco de código HTML** (```html … ```), sem nenhum texto
fora dos blocos. Cada bloco começa com quatro comentários de metadados e termina com
`<!-- END -->`. Use este esqueleto (o conteúdo entre `{ }` é você quem escreve):

```html
<!-- MEDHELP-FORMULA-PAGE -->
<!-- title: {Nome do tema} -->
<!-- slug: {nome-do-tema}-formula -->
<!-- specialty: cardiologia -->
<h2>{Nome do tema}</h2>
<p><strong>{NOME DO TEMA EM MAIÚSCULAS (SIGLA)}</strong><br><em>Fórmula MedHelp – Decisão Treinada | MedHelpSpace Revalida</em></p>

<h3>{Título da seção}</h3>
<ul class="pega">
  <li>{item}</li>
  <li>{item}</li>
</ul>

<h3>{Título da seção}</h3>
<ul class="dica">
  <li>{item}</li>
</ul>

<h3>O que fazer?</h3>
<p><strong>{Cenário clínico}</strong></p>
<ul>
  <li>{conduta}</li>
</ul>
<p><strong>{Outro cenário}</strong></p>
<ul>
  <li>{conduta}</li>
</ul>

<h3>{Título da seção}</h3>
<ul class="resumo">
  <li>{item}</li>
</ul>
<!-- END -->
```

### Regras de marcação

- **Tags permitidas, apenas estas:** `<h2>`, `<h3>`, `<p>`, `<strong>`, `<em>`, `<br>`,
  `<ul>`, `<li>`. Não use `<h1>`, `<div>`, `style=`, cor inline, `<script>`, `<iframe>`,
  tabela ou imagem.
- **`<h2>`** = título do tema, **uma vez** por página (mesma coisa do metadado `title`).
- **`<h3>`** = cada subtítulo de seção. Fica roxo automaticamente — **não** adicione cor,
  negrito ou estilo.
- **Ícone das listas é adicionado pelo site pela classe do `<ul>`.** Escolha a classe cujo
  ícone combina com a seção e **NÃO digite o emoji dentro do `<li>`**:
  | Classe | Ícone que o site coloca |
  |---|---|
  | `<ul class="pega">` | ❌ |
  | `<ul class="dica">` | 💬 |
  | `<ul class="resumo">` | 🟣 |
  | `<ul>` (sem classe) | • marcador normal — use para condutas por cenário |
- **Seção de conduta** ("O que fazer?" ou equivalente): cada cenário é
  `<p><strong>Cenário</strong></p>` seguido de um `<ul>` **sem classe**.
- Use aspas curvas tipográficas ("…") no texto.
- A linha em itálico do bloco de título é sempre exatamente
  `Fórmula MedHelp – Decisão Treinada | MedHelpSpace Revalida` (travessão "–", não "-").

### Metadados (os quatro comentários no topo)

- `title` = nome do tema (idêntico ao `<h2>`).
- `slug` = nome do tema em minúsculas, **sem acentos**, espaços → hífens, terminando em
  `-formula`. Ex.: "Insuficiência Cardíaca" → `insuficiencia-cardiaca-formula`.
- `specialty` = um destes slugs: `cardiologia`, `pneumologia`, `gastroenterologia`,
  `nefrologia`, `endocrinologia`, `hematologia`, `infectologia`, `reumatologia`,
  `neurologia`, `dermatologia`, `psiquiatria`, `clinica-medica`, `cirurgia-geral`,
  `ginecologia`, `obstetricia`, `pediatria`, `medicina-de-emergencia`, `saude-coletiva`.
  (Na dúvida, use o mais próximo — a equipe corrige na importação.)
