# ClinAct — Como escrever os casos para importação

**Versão 1 do formato.** Se esta versão mudar, você recebe o documento novo e o
importador avisa qual versão ele aceita.

Este documento é o combinado entre o que você escreve e o que o sistema consegue
ler sozinho. Se um caso seguir estas regras, ele entra na plataforma já dividido
em blocos, sem ninguém redigitar nada.

---

## Antes de tudo: escreva UM caso primeiro

Escreva **um** caso, mande, e nós passamos pelo importador. Só depois escreva os
outros 39.

Se algo no formato estiver errado, estará errado uma vez — não quarenta. Essa ida
e volta custa um dia e é a diferença entre importar 40 casos em minutos ou
redigitar 40 casos à mão.

Comece por um **Decisão em 30 Segundos**: é o formato mais simples dos quatro e é
o primeiro que vai estar funcionando na plataforma.

---

## 1. O arquivo

- Escreva onde você preferir (Google Docs, Word, bloco de notas).
- **Envie como `.txt` ou `.md`** — texto puro. Não envie `.docx` nem link do
  Google Docs: exporte por *Arquivo → Fazer download → Texto sem formatação*.
- **Vários casos podem ir no mesmo arquivo.** Separe cada um com uma linha
  contendo apenas:

```
=== CASO ===
```

- Imagens e áudios: nunca cole o arquivo dentro do documento. Escreva o nome do
  arquivo na linha, e deixe os arquivos na mesma pasta:

```
[imagem: ecg-caso-12.jpg]
[audio: sopro-aortico.mp3]
```

### Atenção: desligue a lista automática do Google Docs

Este é o único ajuste que você precisa fazer antes de começar.

O Google Docs (e o Word) transformam sozinhos uma linha que começa com `- ` em
marcador, e uma que começa com `1. ` em lista numerada. Quando isso acontece, o
hífen deixa de existir no texto — vira formatação — e o importador não enxerga
mais as suas alternativas.

No Google Docs: **Ferramentas → Preferências** e desmarque *Listas com marcadores
automáticas* e *Listas numeradas automáticas*.

Se preferir, escreva direto num editor de texto puro (Bloco de Notas, TextEdit) e
o problema não existe.

O importador também aceita `•` e `–` no lugar do `-`, caso alguma linha escape —
mas é melhor desligar do que contar com isso. (`*` não serve de substituto: ele já
significa "esta é a alternativa correta".)

### Por que texto puro

Negrito, itálico, cor, marcadores e tabelas feitos pela barra de ferramentas
**desaparecem** na exportação. Se a estrutura do caso depender de formatação, ela
some. Por isso a estrutura aqui é marcada com palavras, não com aparência.

---

## 2. A ficha do caso

A ficha vem no começo, uma informação por linha, com o rótulo **exatamente** como
está aqui — em maiúsculas, com dois-pontos:

```
FORMATO: decisao_30s
TÍTULO: TEP — paciente instável
ESPECIALIDADE: Pneumologia
TEMA: Tromboembolismo Pulmonar
DIFICULDADE: intermediária
DURAÇÃO: 2
RESUMO: Dispneia súbita com instabilidade: o que fazer antes da confirmação.
```

| Campo | O que vai nele |
|---|---|
| `FORMATO:` | Um de: `codigo_clinico`, `clinica_em_cena`, `decisao_30s`, `ponto_de_virada` |
| `TÍTULO:` | Único entre todos os casos. O endereço do caso é gerado a partir dele — você nunca escreve endereço. |
| `ESPECIALIDADE:` | Copiada da lista em `especialidades-e-temas.md` |
| `TEMA:` | Copiado da mesma lista |
| `DIFICULDADE:` | `básica`, `intermediária` ou `avançada` |
| `DURAÇÃO:` | Minutos, só o número |
| `RESUMO:` | Uma linha, opcional |
| `CHAVE FINAL:` | **Só no Código Clínico.** Ver seção 6. |

**Rótulo trocado é erro; campo opcional ausente é só um aviso.** O importador
reclama de `TITULO:` sem acento ou de `Título:` em minúsculas, mas segue em frente
se faltar o `RESUMO:`.

### O título não entrega o caso

Antes de abrir um caso, o aluno vê **formato, especialidade, título, dificuldade e
duração**. Ele **não** vê o `TEMA:` — esse aparece só depois que o caso termina.

O motivo é o raciocínio: ler "Pneumonia" na lista entrega justamente aquilo que o
caso deveria treinar. Por isso o `TÍTULO:` segue a mesma regra — prefira títulos
narrativos ou situacionais, ligados ao problema que se apresenta, nunca ao
diagnóstico ou à resposta central.

**Título público = não entrega o caso. `TEMA:` = organiza o caso.**

| Em vez de | Escreva |
|---|---|
| Choque — a pressão não respondeu | A pressão não respondeu |
| Pneumonia no idoso | No início do plantão |

O `TEMA:` continua sendo preenchido normalmente e continua valendo em tudo que é
interno: organização da biblioteca, filtros, revisão espaçada, relatórios e a sua
produção editorial. O que muda é só **onde** ele aparece para o aluno.

Se você renomear um caso já publicado, o endereço acompanha o novo título sozinho
e o endereço antigo continua funcionando — nenhum link quebra, e nada muda no
histórico de quem já jogou o caso.

---

## 3. Os blocos

Cada bloco começa com `## ` e o nome do bloco:

```
## NARRATIVA
Homem, 62 anos, dispneia súbita há 40 minutos.
PA 88/54, FC 128, SpO₂ 86% em ar ambiente.
```

**A ordem no arquivo é a ordem no caso.** Não numere os blocos.

Blocos disponíveis: `NARRATIVA`, `PISTAS`, `PERGUNTA`, `ORDENAR`, `CENA`,
`NOVO DADO`, `REAVALIAÇÃO`, `CONFIANÇA`, `FEEDBACK`, `CUSTO DO ATRASO`, `MÍDIA`,
`CRONÔMETRO`, `LEVE DESTE CASO`.

Cada modelo já traz os blocos padrão do seu formato — comece pelo modelo e apague
o que não usar.

O **Prontuário Vivo** e o **Código Decifrado** não se escrevem: o sistema monta os
dois a partir do que o caso já tem.

---

## 4. Alternativas

Dentro de `## PERGUNTA` (ou `## REAVALIAÇÃO`), o enunciado vem primeiro e as
alternativas depois:

```
## PERGUNTA
Qual a conduta imediata?

* Estabilizar e solicitar ecocardiograma à beira-leito
  feedback: Paciente instável não vai para a tomografia. O eco à beira-leito
  responde a pergunta sem tirar o paciente do lugar.
- Solicitar angio-TC de tórax imediatamente
  feedback: Transportar um paciente instável para a TC é o erro clássico aqui.
  sedução: É o exame que confirma o diagnóstico — parece a conduta mais definitiva.
- Solicitar D-dímero
  feedback: Já há alta probabilidade clínica; um D-dímero não muda a conduta.
  sedução: Exame rápido e barato, parece um bom primeiro passo.
```

Regras:

- `*` marca a **correta**. `-` marca as erradas.
- **Exatamente uma correta** por pergunta. De 2 a 5 alternativas.
- As linhas `feedback:` e `sedução:` pertencem à alternativa logo acima.
- A indentação é só para facilitar a leitura — pode indentar ou não, tanto faz.
- `sedução:` é onde você explica **por que a alternativa errada engana**. É o que
  mais ensina no ClinAct; opcional apenas tecnicamente.

---

## 5. Pistas (Código Clínico)

```
## PISTAS
- Dor pleurítica à direita há 2 dias
  detalhe: Iniciada no dia seguinte a um voo de 11 horas.
  categoria: anamnese
  grupo: A
- Edema assimétrico de panturrilha
  categoria: exame físico
  grupo: A
- Febre de 37,8°C
  detalhe: Isolada, sem outros sinais infecciosos.
  categoria: exame físico
  distrator: Sugere infecção, mas não explica a hipoxemia nem o edema unilateral.
```

- **`grupo:`** liga as pistas que se explicam juntas. Duas pistas com `grupo: A`
  aparecem conectadas no mapa do Código Decifrado. É o `grupo` que desenha o mapa —
  sem ele as pistas ficam soltas.
- **`distrator:`** marca a pista que não fecha, e o texto explica o porquê. Ela
  aparece apagada no mapa, com o seu motivo ao lado.
- `detalhe:` e `categoria:` são opcionais.
- **O texto principal vai na MESMA linha do `-` ou do `*`.** As linhas
  `feedback:`, `sedução:`, `detalhe:`, `categoria:` e `grupo:` são complementos da
  linha acima — nenhuma delas serve como o texto em si. Um `-` sozinho, com o
  texto só no `detalhe:`, é lido como pista sem texto e o importador recusa.

---

## 6. Chave final (Código Clínico)

No centro do mapa do Código Decifrado fica o que o caso realmente revela — e nem
sempre é um diagnóstico. Escreva na ficha:

```
CHAVE FINAL: Tromboembolismo pulmonar com repercussão hemodinâmica
```

Pode ser um diagnóstico, uma síndrome, um mecanismo, uma complicação, uma
prioridade, uma investigação ou uma conduta. O que fechar o caso.

---

## 7. Cenas (Clínica em Cena)

Cada cena tem um apelido curto, sem acento e sem espaço, que só serve para você
apontar desvios:

```
## CENA: chegada
Paciente chega à sala vermelha. PA 88/54, FC 128, SpO₂ 86%.

- Estabilizar antes de qualquer exame
  qualidade: ideal
  feedback: Correto. Nada se resolve com o paciente instável.
  fizemos: O₂ suplementar 5 L/min, acesso calibroso
  estado: PA 92/60, instável
  relógio: 5
- Enviar direto para a angio-TC
  qualidade: prejudicial
  feedback: O transporte de um instável custa caro.
  estado: PA 78/48, instável
  relógio: 15
  vai para: deterioracao
```

- **`sabemos:`, `encontramos:`, `fizemos:`, `estado:`** são as quatro gavetas do
  Prontuário Vivo. O que você escrever nelas aparece no prontuário do aluno.
  Pode usar quantas quiser na mesma conduta, e repetir a mesma em linhas separadas.
- **`estado:`** é a gaveta dos sinais vitais e da estabilidade **depois** dessa
  conduta. Persiste nas cenas seguintes.
- **`relógio:`** são os minutos narrativos gastos.
- **`vai para:`** só quando a conduta precisa **desviar**. Em branco — que é o
  normal — a conduta cai na cena seguinte.
- **`qualidade:`** é como a conduta entra no desempenho do aluno. Quatro valores:

| `qualidade:` | O que significa |
|---|---|
| `ideal` | a conduta certa naquele momento |
| `aceitavel` | razoável, mas não era a prioridade |
| `inadequada` | erro sem dano direto |
| `prejudicial` | pode causar dano |

  Escreva em **todas** as condutas de cena. É o que permite medir a Clínica em Cena
  sem transformá-la num certo/errado que ela não é.

**Você não escreve prontuário.** Ele é a leitura do que as condutas revelaram.

**Como o sistema navega as cenas:** uma cena que aparece em algum `vai para:` é
uma cena de desvio — o fluxo normal (as condutas em branco) **pula** essas cenas
e segue para a próxima cena comum. Ou seja: escreva o desvio no lugar onde ele
acontece na história, como no modelo; quem não desviou nunca passa por ele.

**Convergência é o padrão.** Um desvio pode durar no máximo uma cena antes de
voltar ao caminho comum. Isso é proposital: oito cenas com três condutas cada dão
24 blocos de texto para escrever — não 6.561 histórias.

---

## 8. Imagem e áudio

Os dois funcionam igual, nos quatro formatos, e podem aparecer **em qualquer ponto do
caso** — não só na abertura.

```
[imagem: rx-torax-caso-12.jpg]
legenda: Radiografia de tórax na admissão.
alt: Radiografia de tórax PA com opacidade em base direita.

[audio: sopro-aortico.mp3]
legenda: Ausculta em foco aórtico.
transcricao: Sopro sistólico ejetivo, +++/6.
```

- A linha da mídia **se prende ao que vem logo acima** — mesma regra do
  `feedback:`. Sozinha depois de um bloco, ela pertence ao bloco; dentro de uma pista,
  pertence à pista; embaixo de uma conduta, é o que aquela conduta revela.
- `legenda:` é o que o aluno lê. `alt:` descreve a imagem para quem usa leitor de
  tela. `transcricao:` faz o mesmo pelo áudio. As duas últimas são opcionais, mas
  escreva sempre que der — é o que torna o caso utilizável por todo mundo.
- Vídeo ainda não; a estrutura já está pronta para quando for.

**A mídia pode ser revelada por uma escolha.** É o uso mais forte dos quatro formatos:

```
- Auscultar o precórdio antes de pedir exames
  feedback: Boa. O achado muda a hipótese.
  encontramos: Sopro sistólico em foco aórtico
  [audio: sopro-aortico.mp3]
```

O aluno escolhe auscultar — e só então ouve. Pede a radiografia — e só então vê. No
Ponto de Virada, um ECG pode ser o próprio `## NOVO DADO`. No Código Clínico, uma
imagem dermatológica pode ser uma das pistas.

**Envie os arquivos junto com o caso**, com o mesmo nome que você escreveu.

**Formatos aceitos:**

| Tipo | Aceito | Não aceito |
|---|---|---|
| Áudio | `.mp3`, `.m4a`, `.wav` | `.ogg`, `.opus`, `.flac`, `.wma` |
| Imagem | `.jpg`, `.png`, `.webp`, `.gif` | `.heic`, `.tiff`, `.bmp` |
| Vídeo (ainda não usado) | `.mp4`, `.webm` | `.mov`, `.avi`, `.mkv` |

A regra por trás da lista é uma só: **o aluno nunca pode encontrar um botão de
áudio que não toca.** O `.ogg`, por exemplo, só toca em iPhone a partir do Safari
18.4 — quem tiver um iPhone mais antigo vê o player e não ouve nada. Por isso ele
fica de fora, mesmo funcionando no seu computador.

Se o seu áudio original for `.wav` ou `.ogg`, **guarde o original** e exporte uma
cópia em `.mp3` para a plataforma. O `.wav` é aceito, mas gera arquivos muito
maiores — prefira `.mp3` para o aluno que abre pelo celular.

O importador avisa na hora se um nome de arquivo tiver formato não aceito, e o
upload recusa o arquivo explicando o motivo.

Se o arquivo ainda não existir, escreva a linha do mesmo jeito e avise: o caso
importa com o espaço reservado, é aviso e não erro.

---

## 9. Blocos curtos

```
## NOVO DADO
A troponina volta em 2.400 ng/L.

## REAVALIAÇÃO
O que muda agora?
* ...
- ...

## CONFIANÇA

## FEEDBACK
Texto que aparece depois da resposta, valendo para a questão toda.

## CUSTO DO ATRASO
Cada 30 minutos de atraso na reperfusão aumenta a mortalidade.
janela: 90 minutos

## CRONÔMETRO
segundos: 30

## MÍDIA
[imagem: ecg-supra-anterior.jpg]
legenda: ECG na admissão.

## ORDENAR
Coloque em ordem de prioridade:
1. Garantir via aérea
2. Acesso venoso calibroso
3. Reposição volêmica
4. Exames de imagem

## LEVE DESTE CASO
Paciente instável não sai da sala para confirmar diagnóstico.
```

Em `## ORDENAR`, a ordem em que você escreve **é** a ordem correta.

**O cronômetro é pressão, não trava.** Ao chegar a zero ele não envia a resposta, não
bloqueia as alternativas, não marca erro e não encerra o caso. O aluno responde
normalmente depois. Só registramos quanto tempo levou.

`## CONFIANÇA` não tem conteúdo — é só ligar. A escala é fixa: baixa, média, alta.
Use apenas nas decisões em que faz sentido medir a segurança do aluno.

**No Clínica em Cena a coleta é seletiva — isso é regra do formato.** Não coloque
`## CONFIANÇA` depois de todas as cenas. Um caso pode ter nenhuma coleta, uma ou
várias, conforme a justificativa pedagógica. Priorize as decisões de maior peso
clínico:

- mudança relevante de hipótese;
- interpretação de um dado clínico importante;
- definição de gravidade;
- escalonamento de cuidado;
- decisão terapêutica relevante.

Evite nas decisões triviais e onde a repetição atrapalhe o ritmo da narrativa. O
importador não exige o bloco em cena nenhuma: quem decide é você, cena a cena.

---

## 10. O que você NÃO precisa revisar

O importador corrige tudo isto sozinho:

- aspas curvas (“ ”) e retas
- apóstrofos curvos
- travessões que o corretor troca sozinho (– — -)
- espaços duplos, espaços no fim da linha, linhas em branco a mais
- acentuação e maiúsculas dentro do texto do caso

**Não gaste tempo com nada disso.** Escreva normalmente.

Uma exceção: `ESPECIALIDADE:` e `TEMA:` precisam ser copiados **exatamente** como
estão na lista, inclusive onde a acentuação parecer errada (alguns temas antigos
estão sem acento no banco). Se não bater, o caso entra assim mesmo e nós ligamos o
tema depois — é aviso, não erro.

---

## 11. Quando o modelo não couber

Se você precisar de algo que o formato não prevê, **não invente marcação**.
Escreva um parágrafo normal começando com `NOTA:`:

```
NOTA: aqui eu queria que a imagem aparecesse só depois que o aluno respondesse.
```

O caso importa, a nota vem junto, e nós resolvemos. Estrutura inventada é pior do
que uma observação em português — ela quebra em silêncio e ninguém percebe.

---

## 12. Como o importador responde

Ao subir o arquivo, antes de gravar qualquer coisa, você vê uma tabela: um caso
por linha, com `OK`, `avisos` ou `erro`. Os erros dizem o nome do caso e a linha.
Nada entra no sistema antes de você confirmar.

- **Um caso com erro não derruba os outros.** Os válidos entram; os com erro ficam
  listados para correção.
- **Tudo entra como rascunho.** O importador nunca publica.
- Reimportar um caso com o mesmo **título** substitui o rascunho. Se o caso já
  estiver **publicado**, ele é pulado — para não sobrescrever, sem querer, um caso
  que alunos já fizeram.
