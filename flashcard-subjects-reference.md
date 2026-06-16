# Flashcards / AudioCards — Referência de Temas

Guia para a Karina ao gerar as questões no ChatGPT. Cada **tema** (ex.: "Bradiarritmias")
vira **um arquivo `.md`** e abastece **as duas seções**: os Flashcards e os AudioCards
(mesmo conteúdo, o AudioCards só acrescenta o player de áudio).

> Use os nomes de tema **exatamente** como estão nesta lista. O nome do tema é a "chave"
> que liga as questões à seção certa no site. Se quiser **renomear, juntar, dividir ou
> criar** temas novos, pode — só avise o Justin para o importador acompanhar.

---

## Como usar (resumo)

Para cada lote, no ChatGPT você informa:

1. **Especialidade** (o slug em verde abaixo, ex.: `cardiologia`)
2. **Tema** (o nome exato da lista, ex.: `Crise Hipertensiva`)
3. **Quantas questões** quer gerar
4. **Um exemplo** de pergunta/resposta no estilo desejado
5. **O conteúdo de origem** (cole o material)

Regras que o ChatGPT já segue (estão no prompt):
- Gera **somente** com base no conteúdo colado (sem inventar).
- Respostas **curtas e faladas por extenso** (ex.: "pressão arterial", nunca "PA"),
  porque o mesmo texto é lido no áudio.
- Um arquivo por tema, no formato fixo de importação.

---

## Especialidades e temas atuais

Slug da especialidade em `código`. Os nomes podem ser ajustados — esta é a lista atual.

### `cardiologia`
Bradiarritmias · Cardiopatia Congênita · Crise Hipertensiva · Dislipidemia ·
Endocardite Infecciosa · Hipertensão Arterial · Insuficiência Cardíaca ·
Síndrome Coronariana Aguda · Síndrome Coronariana Crônica · Tamponamento Cardíaco ·
Taquiarritmias · Valvopatias

### `cirurgia-geral`
Abdome Agudo Hemorrágico · Abdome Agudo Obstrutivo · Abdome Agudo Perfurativo ·
Abdome Agudo Vascular · Apendicite Aguda · Câncer Colorretal · Câncer de Esôfago ·
Câncer de Estômago · Colecistite Aguda · Diverticulite · Doenças Hepatobiliares ·
Doenças Orificiais · Hemorragia Digestiva · Hemorroidas · Hérnia · Pancreatite Aguda ·
Queimados · TEC · Trauma – Atendimento Inicial e Vias Aéreas · Trauma de Tórax ·
Trauma Osteomielite · Trauma Raquimedular

### `dermatologia`
Doenças Bolhosas · Doenças Eczematosas · Doenças Eritematodescamativas ·
Farmacodermias · Micoses · Neoplasias em Dermatologia · Parasitoses Cutâneas

### `emergencia`  *(slug da página: `emergencia-flashcards`)*
ACLS · Choque · Intoxicações Exógenas · Ventilação Mecânica

### `endocrinologia`
Diabetes · Doença das Adrenais · Doenças das Paratireoides · Hipotiroidismo ·
Nódulo e Câncer de Tireoide · Osteoporose · Tireotoxicose

### `gastroenterologia`
Cirrose · Doença Celíaca · Doença do Refluxo Gastroesofágico ·
Doenças Inflamatórias Intestinais · Hepatites Virais · Síndrome do Intestino Irritável ·
Úlcera Péptica

### `hematologia`
Anemia de Doença Crônica · Anemia Falciforme · Anemia Ferropriva · Anemia Hemolítica ·
Anemia Megaloblástica · Distúrbio da Hemostasia Primária ·
Distúrbio da Hemostasia Secundária · Leucemias · Linfomas · Mieloma Múltiplo

### `infectologia`
Dengue, Chikungunya, Zika, Febre Amarela · Doença de Chagas · Hanseníase · HIV ·
Infecção do Trato Urinário · Leishmaniose · Leptospirose · Meningites · Mononucleose ·
Parasitoses Intestinais · Úlceras Genitais – IST

### `nefrologia`
Distúrbios Hidroeletrolíticos Nefrológicos · Doença Renal Crônica · Injúria Renal Aguda ·
Síndrome Nefrítica · Síndrome Nefrótica · Tumores Renais

### `neurologia`
Ataque Isquêmico Transitório · AVC Hemorrágico · AVC Isquêmico · Cefaleias · Demências ·
Doença de Parkinson · Epilepsias · Hipertensão Intracraniana · Infecções Neurológicas ·
Meningites · Neoplasias do Sistema Nervoso · Patologias da Coluna Vertebral

### `pediatria`
Aleitamento Materno · Alimentação Complementar · Bronquiolite · Convulsão Febril ·
Desnutrição e Obesidade · Diarreia e Desidratação ·
Distúrbio do Crescimento e Desenvolvimento · Estenose Hipertrófica do Piloro ·
Faringoamigdalite Estreptocócica · Febre Sem Sinais de Localização (FSSL) ·
Icterícia Neonatal · Imunizações · Invaginação Intestinal em Lactente ·
IVAS – Resfriado, Sinusite e Otite · Laringite Viral (Crupe) · Malformações Congênitas ·
Maus Tratos e Prevenção de Acidentes na Infância · Puericultura · Reanimação Neonatal ·
Sepse Neonatal · Síndrome do Desconforto Respiratório ·
Taquipneia Transitória do Recém-Nascido · TORCHS · Triagem Neonatal ·
Tumor Neuroendócrino Infantil

### `pneumologia`
Abscesso Pulmonar · Asma · Atelectasia · Derrame Pleural ·
Doenças Pulmonares Intersticiais · DPOC · Nódulo e Câncer de Pulmão ·
Pneumonia Adquirida na Comunidade · Tromboembolismo Pulmonar · Tuberculose

### `psiquiatria`
⚠️ **A lista atual está errada** (hoje contém os temas de Pneumologia por um erro de
migração antigo). **Defina aqui a lista real de Psiquiatria** — ela substitui o que está
no banco quando importarmos.

### `reumatologia`
Artrite Infecciosa · Artrite Reumatóide · Esclerose Sistêmica · Febre Reumática ·
Fibromialgia · Gota · Lupus · Osteoartrite · Vasculite de Pequenos Vasos

### `saude-coletiva`
Atenção ao Idoso · Atenção Básica · Bioestatística · Declaração de Óbito ·
Estudos Epidemiológicos · Ética Médica · Indicadores de Saúde · Medicina do Trabalho ·
Processo Saúde-Doença · SUS – Histórico, Princípios e Diretrizes ·
Vigilância Epidemiológica

---

## Especialidades sem deck hoje

Não existem flashcards de **Ginecologia**, **Obstetrícia** nem **Clínica Médica** ainda.
Se a Karina criar temas para essas, é só nomear a especialidade
(`ginecologia`, `obstetricia`, `clinica-medica`) — o importador cria o deck.

---

## Notas técnicas (para o Justin)

- **Total atual:** 163 temas em 15 especialidades (~3.506 cards).
- Os `group_label` no banco hoje vêm com HTML/`&nbsp;`/espaços (ex.:
  `<p><strong>Bradiarritmias&nbsp;</strong></p>`). Na importação (substituição total),
  o importador **casa pelo nome normalizado** e **regrava o rótulo em texto limpo**.
- `psiquiatria-flashcards` está com o conteúdo de Pneumologia — será sobrescrito.
- Slug do tema (nome do arquivo) = minúsculas, sem acentos, espaços→hífens
  (ex.: "Crise Hipertensiva" → `crise-hipertensiva`).
- Lista regenerável: `node scripts/_list-flashcard-subjects.js`.
