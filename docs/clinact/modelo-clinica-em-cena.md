# Modelo — Clínica em Cena

**Habilidade treinada:** conduzir.
Cenas encadeadas com 2 a 4 condutas. O paciente responde ao que você faz.

Este é o formato mais trabalhoso dos quatro. Deixe-o para depois de ter escrito
pelo menos um caso de cada um dos outros três.

| Bloco | Neste formato |
|---|---|
| `NARRATIVA` | padrão — a abertura, antes da primeira cena |
| `CENA` | padrão — o formato inteiro é feito delas |
| `FEEDBACK` | padrão |
| Prontuário Vivo | **gerado pelo sistema** a partir das quatro gavetas |
| `LEVE DESTE CASO` | padrão |
| `PERGUNTA` | se o caso pedir |
| `NOVO DADO` | se o caso pedir |
| `CONFIANÇA` | **seletiva** — nunca em todas as cenas (guia, seção 9) |
| `CUSTO DO ATRASO` | se o caso pedir |
| `MÍDIA` | disponível em qualquer ponto — imagem ou áudio |

## As duas regras que sustentam o formato

**1. Convergência é o padrão.** Toda conduta cai na cena seguinte, a menos que
você escreva `vai para:`. Um desvio dura no máximo uma cena antes de voltar ao
caminho comum. É isso que impede 8 cenas de virarem 6.561 histórias.

**2. O que dá a sensação de conduzir é o estado persistir, não o roteiro se
multiplicar.** Uma conduta ruim na cena 1 chega à cena 3 como um paciente mais
instável e com menos tempo — pelo mesmo texto de sempre. Por isso `estado:` e
`relógio:` importam mais do que `vai para:`.

## O prontuário se escreve sozinho

Você nunca redige prontuário. Ele se monta a partir de quatro chaves que você
escreve na conduta:

| Gaveta | O que entra |
|---|---|
| `sabemos` | história, antecedentes, o que foi contado |
| `encontramos` | achados de exame e resultados |
| `fizemos` | condutas executadas |
| `estado` | sinais vitais e estabilidade atuais |

Escreva `qualidade:` em **todas** as condutas: `ideal`, `aceitavel`, `inadequada` ou
`prejudicial`. É o que permite medir a Clínica em Cena sem reduzi-la a certo/errado.
Uma conduta pode revelar mídia — veja a seção 8 do guia.

Sugestão: 3 a 5 cenas, com 3 condutas cada.

Apelido da cena: curto, sem acento, sem espaço (`chegada`, `investigacao`,
`deterioracao`, `conduta-final`).

---

## Modelo para copiar

```
=== CASO ===
FORMATO: clinica_em_cena
TÍTULO:
ESPECIALIDADE:
TEMA:
DIFICULDADE: intermediária
DURAÇÃO: 8
RESUMO:

## NARRATIVA


## CENA: chegada


- [conduta]
  qualidade:
  feedback:
  encontramos:
  estado:
  relógio:
- [conduta]
  qualidade:
  feedback:
  estado:
  relógio:
- [conduta]
  qualidade:
  feedback:
  estado:
  relógio:
  vai para: deterioracao

## CENA: deterioracao


- [conduta]
  qualidade:
  feedback:
  estado:
  relógio:
- [conduta]
  qualidade:
  feedback:
  estado:
  relógio:

## CENA: investigacao


- [conduta]
  qualidade:
  feedback:
  encontramos:
  relógio:
- [conduta]
  qualidade:
  feedback:
  relógio:
- [conduta]
  qualidade:
  feedback:
  relógio:

## CENA: conduta-final


- [conduta]
  qualidade:
  feedback:
  fizemos:
- [conduta]
  qualidade:
  feedback:
- [conduta]
  qualidade:
  feedback:

## FEEDBACK


## LEVE DESTE CASO

```
