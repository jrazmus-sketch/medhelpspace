# Onboarding ("Comece por aqui") — Visão geral da funcionalidade

> Documento para a Karina. **Atualizar este arquivo sempre que mudarmos algo no
> funcionamento do onboarding.** Última atualização: 23/06/2026.

## Resumo rápido
O **Onboarding** é o "tour de boas-vindas" para alunos novos. Em vez de uma aula
chata no começo, ele mostra **pequenas caixas de dica** (as "dicas rápidas") **na
hora certa**, dentro de cada seção do site — explicando como aquela parte funciona.
O aluno **fecha cada caixa no X** quando não precisa mais, e ela não volta. Toda essa
informação também fica guardada numa página fixa, a **"Comece por aqui"**, para
consultar quando quiser. O objetivo é só um: **reduzir o atrito** para o aluno começar
a estudar rápido, sem se perder.

As dicas também explicam **como cada seção conversa com a Revisão** (ver
`REVISAO-KARINA.md`).

---

## As três partes

| Parte | Onde aparece | O que faz |
|---|---|---|
| **Cartão de boas-vindas** | Topo do painel (Início), para quem é novo | Apresenta as duas formas de estudar (por **tipo** ou por **especialidade**) e leva para o guia completo. Fecha no X. |
| **Caixas de dica** ("Dica rápida") | Em cada seção (ver tabela abaixo) | Explicam aquela seção em 1–2 frases. Cada uma fecha no X, individualmente. |
| **Página "Comece por aqui"** | `/app/comecar` (fixa, sempre disponível) | Reúne **todas** as dicas num só lugar, em formato de guia. Tem o botão **"Reativar as dicas"**. |

**Como o aluno chega na página fixa, a qualquer momento:**
- Menu do usuário (avatar) → **"Comece por aqui"**
- **Rodapé** do site → "Comece por aqui"
- No celular: aba **"Estudar"** (a folha que abre de baixo) → "Comece por aqui"

---

## Onde aparecem as caixas de dica

| Seção | A dica explica… |
|---|---|
| **Painel (Início)** | As duas formas de estudar (tipo × especialidade) e o cartão *Continuar*. |
| **Escolha como estudar** | Que cada tipo cobre todas as especialidades (Praticar / Ler / Ouvir). |
| **Estude por especialidade** | Que entrar numa especialidade reúne todo o conteúdo dela. |
| **Estudo por Questões** | Uma questão por vez, com correção e comentário. **+ entra na Revisão.** |
| **Flashcards** | Virar a carta e marcar *Errei/Acertei*. **+ a autoavaliação alimenta a Revisão.** |
| **Resumos / aulas** | Navegar pelas seções e marcar como concluída. |
| **MedVoice / AudioCards** | Ouvir por seção, controles de ±15s. |
| **Revalida Up** | Recordação ativa dos padrões de prova. |
| **Revisão** | A central de repetição espaçada (revisar hoje / só as que errei / pontos fracos). |
| **Meu Plano** | O roteiro diário com links diretos. |
| **MedHelp 60D** | Que abre sozinho ~60 dias antes da prova. |

> As dicas de **Questões, Flashcards, MedVoice/AudioCards, Revisão e Plano** sempre
> trazem uma linha **"Como entra na Revisão"**, para o aluno entender o ciclo
> *estudar → revisar* desde o começo.

---

## ✋ O que é por aluno (cada um vê o seu)
- Cada aluno vê as caixas até **fechar no X**. Depois disso, não voltam para ele.
- O botão **"Reativar as dicas"** (na página *Comece por aqui*) traz as caixas de
  volta para aquele aluno, caso ele queira rever.
- A página *Comece por aqui* **está sempre disponível** para todos — não some.

---

## 🎨 Editar os textos pelo construtor visual (Edição rápida)

**Todos os textos do onboarding são editáveis direto na tela**, do mesmo jeito que a
gente edita os textos da página de vendas — sem precisar de programador. Isso vale
para **títulos, textos e as linhas de "Como entra na Revisão"** de todas as dicas,
além do **título da página** *Comece por aqui*.

**Passo a passo (no computador):**
1. Entre como admin e ligue o **"Edição rápida"** na barra roxa de admin, no topo.
2. Vá para a página **`/app/comecar`** (*Comece por aqui*) — é o **melhor lugar para
   editar**, porque mostra **todos** os textos juntos.
3. **Clique no texto** que quer mudar (ele fica com uma borda pontilhada).
4. Edite e clique em **Salvar** (ou `Esc` para cancelar). A mudança vale **na hora** e
   **em todos os lugares** onde aquele texto aparece (caixas + guia).

**Detalhes úteis:**
- Os símbolos **`**assim**`** deixam a palavra em **negrito**; **`*assim*`** deixa em
  *itálico*. Pode manter, tirar ou adicionar — é só seguir esse padrão.
- O **cartão de boas-vindas** (o roxo do painel) é editado **pela página
  *Comece por aqui***, não em cima do próprio cartão (o fundo roxo atrapalharia a
  leitura na hora de editar). O texto é o mesmo nos dois lugares.
- A edição rápida funciona **no computador** (não no celular).

> 💡 Dica: para editar uma caixa que você já fechou, use o botão **"Onboarding"**
> (abaixo) para fazê-la reaparecer — ou edite tudo de uma vez pela página
> *Comece por aqui*, que mostra todas.

---

## 🔌 Ligar / desligar o onboarding como super admin (botão "Onboarding")

Na **barra roxa de admin** (topo), ao lado de "Edição rápida", existe um botão
**"Onboarding"** — visível só para **super admin** (você e o Justin).

- **Desligado (normal):** cada aluno vê as dicas até fechar. É o estado de sempre.
- **Ligado ("Onboarding ativo"):** **mostra todas as dicas e o cartão de boas-vindas
  de novo**, mesmo as que já foram fechadas. Serve para **testar/pré-visualizar** a
  experiência de um aluno novo.

**Importante:**
- É só **para você (o seu navegador)**. **Não muda nada** para os alunos.
- **Não apaga** o que você já fechou — quando desligar, tudo volta ao normal.
- Fica ligado mesmo se atualizar a página, até você desligar. É reversível a qualquer
  momento.

**Para testar a experiência do aluno novo:** ligue o **"Onboarding"** → navegue pelo
site → todas as caixas aparecem como apareceriam para alguém entrando pela primeira
vez. Para também **editar** enquanto testa, ligue junto o **"Edição rápida"**.

---

## Quem vê e quando
- O onboarding aparece **só para membros ativos** (alunos com acesso). **Não** aparece
  para o público na página de vendas.
- Enquanto o site não vira oficialmente (cutover), pode parecer "vazio" para contas
  sem acesso — é esperado.
