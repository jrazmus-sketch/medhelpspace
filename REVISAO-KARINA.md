# Revisão — Visão geral da funcionalidade

> Documento para a Karina revisar. **Atualizar este arquivo sempre que mudarmos
> algo no funcionamento da Revisão.** Última atualização: 23/06/2026.

## Resumo rápido
A **Revisão** é um sistema de **repetição espaçada** (a mesma ideia do Anki): ele traz
de volta, no momento certo, o conteúdo que o aluno **já estudou**, para fixar na
memória de longo prazo. O aluno não precisa montar nada — o sistema agenda tudo
sozinho conforme ele estuda. Também há modos **manuais** para o aluno revisar o que
quiser (o que errou, seus pontos fracos, uma página específica).

---

## O que entra em revisão (e quando)

Um item só entra na revisão depois que o aluno **o completa pela primeira vez**. Ou
seja: **só aparece aqui o que ele já viu** — nunca conteúdo novo ou não estudado.

| Quando o aluno… | …o item entra na revisão |
|---|---|
| Responde uma **questão** | A questão é agendada |
| Estuda um **flashcard** (vira e marca *Errei*/*Acertei*) | O flashcard é agendado |
| Termina um conjunto de **MemoreCards** | O conjunto é agendado para **releitura** |

Isso acontece **automaticamente**, em segundo plano. O aluno não precisa marcar
"quero revisar isto".

---

## Como o sistema decide **quando** o item volta

Esse é o coração do sistema. Para questões e flashcards, usamos o algoritmo **SM-2**:

- **Acertou** → o item demora **mais** para voltar. Os intervalos vão crescendo:
  **1 dia → 6 dias → cada vez mais espaçado**. Quanto melhor o aluno sabe, mais
  raramente o item reaparece.
- **Errou** → o item volta **já no dia seguinte** e "reinicia" (passa a aparecer com
  frequência de novo, até o aluno acertar).

**MemoreCards** são uma exceção: como são slides para **reler** (não têm certo/errado),
seguem um calendário fixo que vai se espaçando: **7 → 21 → 60 → 120 dias**.

---

## Automático vs. Manual

### 🔄 Automático (sem o aluno fazer nada)
- **Agendamento**: os itens são marcados sozinhos conforme o aluno estuda.
- **"Revisar hoje"**: a tela inicial da Revisão já mostra quantos itens estão
  pendentes no dia, com questões e flashcards **intercalados** (misturar os formatos
  ajuda a fixar).
- **Lembrete diário**: quando o aluno tem itens pendentes (a partir de **10**), ele
  recebe um aviso no **sininho de notificações**.
- **Reta final**: nos **últimos 14 dias** antes da prova, o **Plano de Estudos**
  coloca a revisão **em primeiro lugar**, antes de conteúdo novo.
- **Aviso no menu**: o item "Revisão" no menu mostra um **número** com a quantidade
  pendente (no desktop e no celular).

### ✋ Manual (o aluno escolhe)
Na central de Revisão (`Revisão` no menu), além de "Revisar hoje", o aluno tem:
- **Só as que errei** — revisar **tudo que ele errou** e ainda não recuperou, a
  qualquer momento (sem esperar a data agendada).
- **Pontos fracos** — revisar as **especialidades com menor % de acerto** (calculado
  pelas questões que ele já respondeu).
- **Revisar de novo** — em qualquer página de questões ou flashcards que ele já fez,
  há um link **"Revisar com repetição espaçada"** para revisar **só aquela página**.
- **"Já domino isto"** — durante a sessão, o aluno pode **remover um item** da revisão
  se já dominou (não aparece mais).

---

## Como é uma sessão de revisão
- **Um item por vez**, intercalando questões e flashcards.
- **Questão**: escolhe a alternativa → vê na hora **se acertou** + o
  **comentário/explicação**. Se errou, aparece um link **"Revisar a aula"** que leva
  para a aula de origem (reforço).
- **Flashcard**: **vira** a carta → marca **Errei** ou **Acertei**.
- **No fim**: um resumo (quantas acertou, %) e a opção **"Refazer as erradas"**.

---

## Tipos de conteúdo cobertos
- **Questões** (estilo Revalida/INEP)
- **Flashcards**
- **MemoreCards** (releitura — passivo, sem certo/errado)
- **Aulas**: não são "testadas" na revisão; elas aparecem como o link
  **"Revisar a aula"** quando o aluno erra uma questão, servindo de reforço.

---

## Acompanhamento (no Relatório)
No **Relatório de Desempenho** há uma seção **Revisão** mostrando:
- **Em revisão** (total de itens no sistema do aluno)
- **A revisar hoje**
- **Dominados** (itens bem espaçados, já fixados)
- **Para recuperar** (itens que ele errou)

---

## Observação sobre conteúdo novo
O conteúdo novo que você adicionar (questões, flashcards ou memorecards de uma
especialidade) **entra na revisão automaticamente** assim que os alunos estudarem —
desde que seja desses **formatos já existentes** e com a **especialidade definida**.
Só se um dia criarmos um **formato totalmente novo** de conteúdo é que a equipe
técnica precisa conectá-lo à revisão (isso é do lado do desenvolvimento).
