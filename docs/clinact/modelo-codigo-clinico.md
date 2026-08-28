# Modelo — Código Clínico

**Habilidade treinada:** conectar.
Pistas soltas que só fazem sentido juntas. Fecha no mapa do Código Decifrado.

| Bloco | Neste formato |
|---|---|
| `NARRATIVA` | padrão |
| `PISTAS` | padrão — é o coração do formato |
| `PERGUNTA` | padrão |
| `CONFIANÇA` | padrão |
| `FEEDBACK` | padrão |
| `LEVE DESTE CASO` | padrão |
| Código Decifrado | **gerado pelo sistema** a partir das pistas |
| `sedução:` nas alternativas | se o caso pedir |
| `MÍDIA` | se o caso pedir |

## O que faz este formato funcionar

O mapa final é desenhado pelo campo **`grupo:`**. Pistas que compartilham o mesmo
grupo aparecem ligadas entre si; as marcadas com `distrator:` aparecem apagadas,
com o motivo ao lado. Sem `grupo:`, o mapa vira uma lista solta.

**`CHAVE FINAL:`** é o centro do mapa. Não precisa ser um diagnóstico — pode ser
síndrome, mecanismo, complicação, prioridade, investigação ou conduta.

Sugestão: de 5 a 8 pistas, com 2 ou 3 grupos e 1 ou 2 distratores.

---

## Modelo para copiar

```
=== CASO ===
FORMATO: codigo_clinico
TÍTULO:
ESPECIALIDADE:
TEMA:
DIFICULDADE: intermediária
DURAÇÃO: 4
RESUMO:
CHAVE FINAL:

## NARRATIVA


## PISTAS
-
  detalhe:
  categoria:
  grupo: A
-
  detalhe:
  categoria:
  grupo: A
-
  detalhe:
  categoria:
  grupo: B
-
  detalhe:
  categoria:
  grupo: B
-
  detalhe:
  categoria:
  distrator:

## PERGUNTA


*
  feedback:
-
  feedback:
-
  feedback:

## CONFIANÇA

## FEEDBACK


## LEVE DESTE CASO

```
