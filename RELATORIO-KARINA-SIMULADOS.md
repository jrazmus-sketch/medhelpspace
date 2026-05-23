# Revisão de Simulados — Páginas que precisam da sua atenção

Olá Karina! Este relatório lista as páginas de simulados que **não conseguimos converter automaticamente** para o novo formato interativo do site. Para cada página, indicamos exatamente **o que está diferente** e **o que precisa ser ajustado** no texto original. Anote suas observações no Google Doc que o Justin te enviou.

---

## Como o sistema novo funciona (em poucas palavras)

O site novo transforma cada simulado num **quiz interativo**: o aluno responde uma questão de cada vez, vê na hora se acertou, e recebe a explicação do gabarito. Para fazer isso automaticamente em todas as páginas de simulado, o programa precisa que cada página siga **sempre o mesmo padrão**:

1. **Duas abas (seções)** com os títulos exatos:
   - `Simulado 1 - Perguntas`
   - `Simulado 1 - Respostas`
2. **10 questões** na aba de Perguntas, numeradas de `Questão 1` a `Questão 10`.
3. Cada questão com **4 alternativas** marcadas com `(A)`, `(B)`, `(C)`, `(D)` no início.
4. Cada resposta na aba de Respostas com o marcador exato `✔ Alternativa correta: (X)` (onde X é a letra correta).

Quando uma página foge desse padrão — mesmo que seja só um detalhe — o programa não consegue ler. Convertemos **134 páginas com sucesso**, mas **35 páginas** precisam de ajuste no texto original antes de podermos rodá-las.

Assim que você terminar a revisão, o Justin vai reprocessar as páginas corrigidas — **não é necessário refazer nada**, só ajustar o texto onde indicarmos abaixo.

---

## Categoria 1 — Pequena correção em apenas 1 ou 2 questões (17 páginas)

Estas páginas estão **quase prontas**: 8, 9 ou 10 questões funcionam normalmente, mas há **1 ou 2 questões específicas** onde as alternativas `(A) (B) (C) (D)` não estão formatadas como nas outras. Provavelmente faltou colocar uma letra entre parênteses, ou as alternativas estão separadas de um jeito diferente.

**O que verificar em cada uma:** abra a página, vá na questão indicada, e confira se as 4 alternativas estão escritas como `(A) texto`, `(B) texto`, `(C) texto`, `(D) texto`.

### Cardiologia
- [Crise Hipertensiva — Simulados](https://medhelpspace.vercel.app/app/cardiologia/crise-hipertensiva-simulados) — verificar **Questão 9**
- [Dislipidemias — Simulados](https://medhelpspace.vercel.app/app/cardiologia/dislipidemias-simulados) — verificar **Questão 6**

### Cirurgia Geral
- [Doenças Hepatobiliares — Simulados](https://medhelpspace.vercel.app/app/cirurgia-geral/doencas-hepatobiliares-simulados) — verificar **Questão 4**
- [TEC (Trauma Cranioencefálico) — Simulados](https://medhelpspace.vercel.app/app/cirurgia-geral/tec-simulados) — verificar **Questão 9**

### Endocrinologia
- [Nódulo e Câncer de Tireoide — Simulados](https://medhelpspace.vercel.app/app/endocrinologia/nodulo-e-cancer-de-tireoide-simulados) — verificar **Questão 2**

### Hematologia
- [Anemia Falciforme — Simulados](https://medhelpspace.vercel.app/app/hematologia/anemia-falciforme-simulados) — verificar **Questão 2**
- [Anemia Hemolítica — Simulados](https://medhelpspace.vercel.app/app/hematologia/anemia-hemolitica-simulados) — verificar **Questões 1 e 2**

### Infectologia
- [Infecção do Trato Urinário — Simulados](https://medhelpspace.vercel.app/app/infectologia/infeccao-do-trato-urinario-simulados) — verificar **Questão 4**

### Nefrologia
- [Doença Renal Crônica — Simulados](https://medhelpspace.vercel.app/app/nefrologia/doenca-renal-cronica-simulados) — verificar **Questão 8**
- [Síndrome Nefrítica — Simulados](https://medhelpspace.vercel.app/app/nefrologia/sindrome-nefritica-simulados) — verificar **Questão 5**

### Obstetrícia
- [Assistência Pré-Natal — Simulados](https://medhelpspace.vercel.app/app/obstetricia/assistencia-pre-natal-simulados) — verificar **Questões 5 e 8**
- [Diabetes da Gestação — Simulados](https://medhelpspace.vercel.app/app/obstetricia/diabetes-da-gestacao-simulados) — verificar **Questões 4 e 10**
- [Prematuridade — Simulados](https://medhelpspace.vercel.app/app/obstetricia/prematuridade-simulados) — verificar **Questão 2**

### Pediatria
- [Reanimação Neonatal — Simulados](https://medhelpspace.vercel.app/app/pediatria/reanimacao-neonatal-simulados) — verificar **Questão 3**
- [Taquipneia Transitória do Recém-Nascido — Simulados](https://medhelpspace.vercel.app/app/pediatria/taquipneia-transitoria-do-recem-nascido-simulados) — verificar **Questão 2**
- [TORCHS — Simulados](https://medhelpspace.vercel.app/app/pediatria/torchs-simulados) — verificar **Questões 3 e 10**
- [Triagem Neonatal — Simulados](https://medhelpspace.vercel.app/app/pediatria/triagem-neonatal-simulados) — verificar **Questões 2, 5, 6 e 10**

### Saúde Coletiva
- [Indicadores de Saúde — Simulados](https://medhelpspace.vercel.app/app/saude-coletiva/indicadores-de-saude-simulados) — verificar **Questão 10**

---

## Categoria 2 — Toda a especialidade segue um padrão diferente (10 páginas)

### Reumatologia (6 páginas) — aba "Perguntas" com nome diferente

**O problema:** o programa não está encontrando a aba `Simulado 1 - Perguntas` em nenhuma página de reumatologia. Provavelmente o título da primeira aba está escrito de um jeito diferente (por exemplo `Simulado 1 - Questões`, `Perguntas do Simulado 1`, ou algo parecido). É só uma correção no **título da aba**, o conteúdo deve estar certo.

**O que verificar:** em cada uma das páginas abaixo, ver se o título da primeira aba é exatamente `Simulado 1 - Perguntas` (com hífen e maiúsculas como mostrado). Se for diferente, anotar como está escrito.

- [Artrite Infecciosa — Simulados](https://medhelpspace.vercel.app/app/reumatologia/artrite-infecciosa-simulados)
- [Artrite Reumatoide — Simulados](https://medhelpspace.vercel.app/app/reumatologia/artrite-reumatoide-simulados)
- [Febre Reumática — Simulados](https://medhelpspace.vercel.app/app/reumatologia/febre-reumatica-simulados)
- [Fibromialgia — Simulados](https://medhelpspace.vercel.app/app/reumatologia/fibromialgia-simulados)
- [Lúpus — Simulados](https://medhelpspace.vercel.app/app/reumatologia/lupus-simulados)
- [Vasculite de Pequenos Vasos — Simulados](https://medhelpspace.vercel.app/app/reumatologia/vasculite-de-pequenos-vasos-simulados)

### Psiquiatria (4 páginas) — marcador da resposta correta em formato diferente

**O problema:** nas 3 primeiras páginas, o programa não está encontrando o marcador exato `✔ Alternativa correta: (X)` no gabarito das questões. Pode estar escrito como `Resposta correta`, `Gabarito`, ou sem o símbolo `✔`. A quarta página (`Efeitos do Álcool e Abstinência`) não tem a aba de Respostas — ou ela está com outro título, ou faltou criar.

**O que verificar:**

- [Efeitos do Álcool e Abstinência — Simulados](https://medhelpspace.vercel.app/app/psiquiatria/efeitos-do-alcool-e-abstinencia-simulados) — **a aba `Simulado 1 - Respostas` está faltando ou com outro nome**. Verificar se as respostas existem em algum lugar da página.
- [Emergências Psiquiátricas — Simulados](https://medhelpspace.vercel.app/app/psiquiatria/emergencias-psiquiatricas-simulados) — verificar **Questões 4 e 9** na aba de Respostas (marcador da resposta correta)
- [Transtorno de Ansiedade — Simulados](https://medhelpspace.vercel.app/app/psiquiatria/transtorno-de-ansiedade-simulados) — verificar **Questões 5 e 10** na aba de Respostas
- [Transtornos Alimentares — Simulados](https://medhelpspace.vercel.app/app/psiquiatria/transtornos-alimentares-simulados) — verificar **Questão 9** na aba de Respostas

---

## Categoria 3 — Aba de "Respostas" faltando ou com nome diferente (3 páginas)

**O problema:** o programa achou as 10 questões normalmente, mas não conseguiu encontrar a aba `Simulado 1 - Respostas`. Pode estar com outro título (`Gabarito`, `Comentários`, etc.), ou a aba pode não ter sido criada.

- [Intoxicações Exógenas — Simulados](https://medhelpspace.vercel.app/app/emergencia/intoxicacoes-exogenas-simulados) — verificar se existe aba de respostas/gabarito
- [Ventilação Mecânica — Simulados](https://medhelpspace.vercel.app/app/emergencia/ventilacao-mecanica-simulados) — verificar se existe aba de respostas/gabarito
- [Imunizações — Simulados](https://medhelpspace.vercel.app/app/pediatria/imunizacoes-simulados) — verificar se existe aba de respostas/gabarito

---

## Categoria 4 — Conteúdo incompleto ou faltando (4 páginas)

Aqui o problema é mais sério — o programa **não conseguiu encontrar quase nada** que reconhecesse como questão. Pode ser que a página esteja vazia, que o conteúdo esteja num formato totalmente diferente (PDF, imagem, etc.), ou que esteja faltando o simulado inteiro.

- [Mecanismo de Parto — Simulados](https://medhelpspace.vercel.app/app/obstetricia/mecanismo-de-parto-simulados) — encontramos **9 perguntas mas 10 respostas**. Falta uma pergunta, ou tem uma resposta a mais. Verificar se a numeração das questões está certa e se todas as 10 estão presentes.
- [Distopias Genitais — Simulados](https://medhelpspace.vercel.app/app/ginecologia/distopias-genitais-simulados) — nenhuma questão foi encontrada. Verificar se a página tem o simulado escrito no formato padrão.
- [Atelectasia — Simulados](https://medhelpspace.vercel.app/app/pneumologia/atelectasia-simulados) — nenhuma questão foi encontrada. Verificar se a página tem o simulado.
- [Medicina do Trabalho — Simulados](https://medhelpspace.vercel.app/app/saude-coletiva/medicina-do-trabalho-simulados) — nenhuma questão foi encontrada.

---

## Categoria 5 — Páginas com 3 simulados em vez de 1 (2 páginas)

**Não precisa revisar agora.** Estas duas páginas têm **30 questões cada** (três simulados de 10), num formato diferente das outras. O Justin vai tratá-las separadamente — só estou avisando por completude.

- `discursivas-simulados`
- `objetivas-simulados`

---

## Resumo

| Categoria | Páginas | O que fazer |
|---|---|---|
| 1 — Pequena correção em 1-2 questões | 17 | Verificar formato das alternativas (A)(B)(C)(D) nas questões indicadas |
| 2 — Reumatologia (título da aba) | 6 | Verificar título da aba "Perguntas" |
| 2 — Psiquiatria (marcador do gabarito) | 4 | Verificar formato do marcador "✔ Alternativa correta: (X)" |
| 3 — Aba de Respostas faltando | 3 | Verificar se existe aba de gabarito |
| 4 — Conteúdo incompleto | 4 | Verificar se a página tem simulado e está completa |
| 5 — Três simulados (Justin cuida) | 2 | — |
| **Total** | **36** | |

---

## Por favor

Abra o Google Doc que o Justin te enviou e, para cada página, anote:
1. **Como o texto está hoje** (por exemplo: "o título da aba é `Questões do Simulado 1` em vez de `Simulado 1 - Perguntas`")
2. **Se você consegue corrigir** ou se precisa de ajuda

Quando você terminar, o Justin roda o programa de novo e essas páginas vão ficar automaticamente no novo formato interativo, junto com as outras 134 que já estão prontas.

Qualquer dúvida, pode me chamar!
