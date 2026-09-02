# Modelo — Decisão em 30 Segundos

**Habilidade treinada:** priorizar.
Uma pergunta, pouco tempo, e o custo de escolher a ordem errada.

| Bloco | Neste formato |
|---|---|
| `NARRATIVA` | padrão |
| `PERGUNTA` | padrão |
| `CONFIANÇA` | padrão |
| `FEEDBACK` | padrão |
| `sedução:` nas alternativas | padrão |
| `CUSTO DO ATRASO` | padrão |
| `LEVE DESTE CASO` | padrão |
| `ORDENAR` | se o caso pedir |
| `CRONÔMETRO` | se o caso pedir |
| `MÍDIA` | se o caso pedir |

> O exemplo clínico abaixo é **só ilustração de formato** — é o mesmo caso de TEP
> que já apareceu na proposta. O conteúdo clínico dos 40 casos é seu.

---

## Modelo para copiar

```
=== CASO ===
FORMATO: decisao_30s
TÍTULO:
ESPECIALIDADE:
TEMA:
DIFICULDADE: intermediária
DURAÇÃO: 2
RESUMO:

## NARRATIVA


## PERGUNTA


* [alternativa correta]
  feedback:
- [alternativa errada]
  feedback:
  sedução:
- [alternativa errada]
  feedback:
  sedução:

## CONFIANÇA

## FEEDBACK


## CUSTO DO ATRASO


## LEVE DESTE CASO

```

---

## Exemplo preenchido

```
=== CASO ===
FORMATO: decisao_30s
TÍTULO: TEP — paciente instável
ESPECIALIDADE: Pneumologia
TEMA: Tromboembolismo Pulmonar
DIFICULDADE: intermediária
DURAÇÃO: 2
RESUMO: Dispneia súbita com instabilidade: o que fazer antes da confirmação.

## NARRATIVA
Homem, 62 anos, dispneia súbita há 40 minutos.
PA 88/54, FC 128, SpO₂ 86% em ar ambiente.

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

## CONFIANÇA

## FEEDBACK
Em instabilidade hemodinâmica, a pergunta deixa de ser "qual é o diagnóstico" e
passa a ser "o que mantém esse paciente vivo nos próximos dez minutos".

## CUSTO DO ATRASO
Cada minuto fora da sala é um minuto sem monitorização.
janela: 10 minutos

## LEVE DESTE CASO
Paciente instável não sai da sala para confirmar diagnóstico.
```
