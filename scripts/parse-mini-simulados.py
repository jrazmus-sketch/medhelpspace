#!/usr/bin/env python3
"""parse-mini-simulados.py — READ-ONLY parser (no DB) for Karina's 2026-09 mini simulados.

    python scripts/parse-mini-simulados.py            # writes parsed/mini-simulados-parsed.json
    MS_LOCAL="C:/path/to/Mini simulados" python scripts/parse-mini-simulados.py

Each simulado now arrives as TWO Word files:
    mini-simulado-<N>.docx             the exam: stem, options, embedded figures, lab tables
    mini-simulado-<N>-comentado.docx   the key: correct letter, Comentário, why the others are
                                       wrong, Conceito-chave (+ a reference list we drop)
under  geral/  and  por-temas/<area>/  or  por-temas/clinica-medica/<subspecialty>/ .

The 125 pairs were produced in several sessions and do NOT share one template:
  - "QUESTÃO n" is a paragraph ("QUESTÃO 1", "01 QUESTÃO", "01 • QUESTÃO"), OR a boxed 1-cell
    table, OR a 2-cell table ("01 | QUESTÃO"), OR a 1-cell table that also holds the stem and a
    NESTED lab table, OR the whole exam is a 2-column LAYOUT table with those boxes nested in it;
  - options are "(A) text", "A) text", "A text", a 2-column table (letter | text), or a Word
    auto-lettered LIST whose letters are not in the text at all;
  - the key's answer line is a paragraph or a boxed table cell, "(B) text" or "C - text";
  - "Por que as outras estão erradas?" is a heading followed by "(A) Errada. …" lines, or one
    paragraph "A. … B. … D. …".
Nested tables rule out regex scraping, so this walks the real XML tree.

Output mirrors scripts/parse-simulados-new.js (July) so QuizPlayer renders it identically:
  question          <h3><strong>Questão N</strong></h3> + <p> stem … (+ <table class="quiz-table">)
  answers           [{text:'<div><strong>(A) …</strong></div>', correct, feedback}]
  explanation_html  <h4>Comentário</h4><p>…</p><h4>Conceito-chave</h4><ul class="resumo"><li>…</li></ul>
Figures are extracted to parsed/mini-simulados-media/ and listed per question (`images`);
uploading them and setting media_url is the apply step's job.

Integrity checks (each failure is a warning, never a silent pass):
  25 questions numbered 1..25 · 4–5 options A.. in order · a correct letter that exists ·
  the key's answer TEXT matches the exam's option text (catches a key paired with the wrong
  exam) · the key's gabarito grid, when present, agrees with the per-question letters.
"""
import difflib
import html
import json
import os
import re
import sys
import unicodedata
import zipfile

try:  # hardened parser when available
    import defusedxml.ElementTree as ET
except ImportError:  # stdlib fallback — safe_xml() below refuses any DTD, which is what XXE and
    import xml.etree.ElementTree as ET  # entity-expansion ("billion laughs") attacks both require

ROOT = os.environ.get('MS_LOCAL') or r'C:\Users\jrazm\OneDrive\Desktop\Medhelpspace\Mini simulados-20260921T200258Z-1-001\Mini simulados'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'parsed', 'mini-simulados-parsed.json')
MEDIA_OUT = os.path.join(HERE, '..', 'parsed', 'mini-simulados-media')

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
V = 'urn:schemas-microsoft-com:vml'
MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'

# Folder name -> specialties.slug (her folder has a typo).
SPEC_FIX = {'gastroentrologia': 'gastroenterologia'}
SPECIALTIES = {
    'cardiologia', 'dermatologia', 'emergencia', 'endocrinologia', 'gastroenterologia', 'hematologia',
    'infectologia', 'nefrologia', 'neurologia', 'pneumologia', 'psiquiatria', 'reumatologia',
    'cirurgia-geral', 'ginecologia', 'obstetricia', 'pediatria', 'saude-coletiva',
}


def local(el):
    return el.tag.rsplit('}', 1)[-1]


# ───────────────────────────── docx → blocks ─────────────────────────────

def para_block(p):
    """A paragraph → {'k':'p','text':str,'imgs':[rId]} (text from every run, fallbacks skipped)."""
    parts, imgs = [], []

    def walk(el):
        for ch in el:
            if ch.tag == f'{{{MC}}}Fallback':
                continue  # duplicate of the mc:Choice content
            t = local(ch)
            if ch.tag == f'{{{W}}}t':
                parts.append(ch.text or '')
            elif ch.tag == f'{{{W}}}tab':
                parts.append(' ')
            elif ch.tag in (f'{{{W}}}br', f'{{{W}}}cr'):
                parts.append('\n')
            elif ch.tag == f'{{{W}}}noBreakHyphen':
                parts.append('-')
            elif ch.tag == f'{{{A}}}blip':
                rid = ch.get(f'{{{R}}}embed')
                if rid:
                    imgs.append(rid)
            elif ch.tag == f'{{{V}}}imagedata':
                rid = ch.get(f'{{{R}}}id')
                if rid:
                    imgs.append(rid)
            elif t == 'txbxContent':
                continue  # text boxes are decoration in these files
            walk(ch)

    walk(p)
    text = re.sub(r'[ \t\u00a0]+', ' ', ''.join(parts)).strip()
    num = p.find(f'{{{W}}}pPr/{{{W}}}numPr/{{{W}}}numId')
    return {'k': 'p', 'text': text, 'imgs': imgs, 'list': num.get(f'{{{W}}}val') if num is not None else None}


def blocks_of(node):
    out = []
    for ch in node:
        t = local(ch)
        if t == 'p':
            out.append(para_block(ch))
        elif t == 'tbl':
            rows = []
            for tr in ch.findall(f'{{{W}}}tr'):
                rows.append([blocks_of(tc) for tc in tr.findall(f'{{{W}}}tc')])
            out.append({'k': 't', 'rows': rows})
        elif t in ('sdt', 'sdtContent', 'customXml', 'smartTag', 'ins'):
            out.extend(blocks_of(ch))
    return out


def safe_xml(data, what):
    """OOXML parts never carry a DTD. Refusing one blocks external entities and entity bombs."""
    head = data[:4096].lower()
    if b'<!doctype' in head or b'<!entity' in data.lower():
        raise ValueError(f'{what}: XML declares a DTD/entity — refused')
    return ET.fromstring(data)


def load_docx(path):
    z = zipfile.ZipFile(path)
    body = safe_xml(z.read('word/document.xml'), 'document.xml').find(f'{{{W}}}body')
    rels = {}
    try:
        for rel in safe_xml(z.read('word/_rels/document.xml.rels'), 'document.xml.rels'):
            if rel.get('Type', '').endswith('/image'):
                rels[rel.get('Id')] = 'word/' + rel.get('Target').lstrip('/')
    except KeyError:
        pass
    return z, blocks_of(body), rels


def cell_text(cell_blocks):
    out = []
    for b in cell_blocks:
        if b['k'] == 'p':
            if b['text']:
                out.append(b['text'])
        else:
            for row in b['rows']:
                for c in row:
                    out.append(cell_text(c))
    return ' '.join(x for x in out if x)


def table_cells(tb):
    return [cell_text(c) for row in tb['rows'] for c in row]


# ───────────────────────────── blocks → events ─────────────────────────────

# Case-SENSITIVE on purpose: whatever surrounds "QUESTÃO n" on a header line is an ALL-CAPS
# area label ("QUESTÃO 02 APS / SAÚDE DO TRABALHADOR", "CLÍNICA MÉDICA QUESTÃO 1"); a stem
# sentence always has lowercase letters, so it can never be mistaken for a header.
_CAPS = r'[A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜ0-9 /&,.()\-–—•·|:]'
QHEAD = re.compile(
    r'^\s*(?:' + _CAPS + r'{0,60}?(?i:QUEST[ÃA]O)\s+0*(\d{1,2})(?:\s*' + _CAPS + r'{0,70})?'
    r'|0*(\d{1,2})\s*[•·.\-–—]?\s*(?i:QUEST[ÃA]O))\s*$')
QHEAD_KEY = re.compile(r'^\s*Quest[ãa]o\s+0*(\d{1,2})\s*[|•·:\-–—]\s*\S.{0,110}$', re.I)   # "Questão 01 | Título"
AREA_LABEL = re.compile(r'^' + _CAPS + r'{4,70}$')
QHEAD_LOOSE = re.compile(r'^\s*QUEST[ÃA]O\s+0*(\d{1,2})\b', re.I)
NUM_ONLY = re.compile(r'^0*(\d{1,2})$')
RULE_LINE = re.compile(r'^[\s\-–—―_=•·.*~─━═]{5,}$')      # decorative separators


def qnum(m):
    return int(m.group(1) or m.group(2))


def is_sheet(cells):
    """Answer sheets / bubble grids / gabarito grids — never question content."""
    flat = ' '.join(cells)
    if re.search(r'[○◯⭕□☐⬜]', flat):
        return True
    letters = sum(1 for c in cells if re.fullmatch(r'[A-Ea-e]', c.strip()))
    nums = sum(1 for c in cells if NUM_ONLY.match(c.strip()))
    paired = sum(1 for c in cells if re.fullmatch(r'0*\d{1,2}\s*[-–:.)]?\s*[A-E]', c.strip()))   # "01 B"
    bubbles = sum(1 for c in cells if re.fullmatch(r'A\s*B\s*C\s*D(\s*E)?', c.strip()))         # "A B C D"
    return (letters >= 15 and nums >= 15) or paired >= 15 or bubbles >= 10


def grid_from(cells):
    """2×25 (or similar) gabarito grid → {n: letter}; also '01 B' style cells."""
    pairs = {}
    for c in cells:
        m = re.fullmatch(r'0*(\d{1,2})\s*[-–:.)]?\s*([A-E])', c.strip())
        if m:
            pairs[int(m.group(1))] = m.group(2)
    if len(pairs) >= 20:
        return pairs
    nums = [int(NUM_ONLY.match(c.strip()).group(1)) for c in cells if NUM_ONLY.match(c.strip())]
    lets = [c.strip().upper() for c in cells if re.fullmatch(r'[A-Ea-e]', c.strip())]
    if len(nums) == len(lets) and len(nums) >= 20:
        return dict(zip(nums, lets))
    return None


def is_options_table(tb):
    rows = tb['rows']
    if not (4 <= len(rows) <= 5):
        return False
    for i, row in enumerate(rows):
        if len(row) < 2:
            return False
        if cell_text(row[0]).strip().strip('().').upper() != 'ABCDE'[i]:
            return False
    return True


def has_qhead(tb):
    for row in tb['rows']:
        for c in row:
            for x in c:
                if x['k'] == 'p':
                    first = x['text'].split('\n')[0] if x['text'] else ''
                    if QHEAD.match(first) or (QHEAD_LOOSE.match(first) and len(first) > 40):
                        return True
                elif has_qhead(x):
                    return True
    return False


def interpret(blocks, state):
    """Flatten blocks into events: ('q',n) ('t',text) ('img',rid) ('opt',L,text) ('table',rows)."""
    ev = []
    for b in blocks:
        if b['k'] == 'p':
            text = b['text']
            if text:
                for line in text.split('\n'):
                    line = line.strip()
                    if not line or RULE_LINE.match(line):
                        continue
                    m = QHEAD.match(line)
                    if m:
                        ev.append(('q', qnum(m)))
                        continue
                    mk = None if state.get('exam') else QHEAD_KEY.match(line)
                    if mk:
                        ev.append(('q', int(mk.group(1))))
                        continue
                    ml = QHEAD_LOOSE.match(line) if state.get('exam') else None
                    if ml and len(line) > 40:      # "QUESTÃO 05 Mulher de 36 anos…" in one paragraph
                        ev.append(('q', int(ml.group(1))))
                        ev.append(('t', QHEAD_LOOSE.sub('', line, count=1).strip(' :.-–—'), b.get('list')))
                        continue
                    ev.append(('t', line, b.get('list')))
            for rid in b['imgs']:
                ev.append(('img', rid))
            continue

        cells = table_cells(b)
        if is_sheet(cells):
            g = grid_from(cells)
            if g and not state.get('grid'):
                state['grid'] = g
            continue

        flat0 = cells[0].strip() if cells else ''
        # "01 | QUESTÃO"  or  "QUESTÃO | 01"
        if len(cells) == 2 and ((NUM_ONLY.match(cells[0].strip()) and re.fullmatch(r'QUEST[ÃA]O', cells[1].strip(), re.I))
                                or (NUM_ONLY.match(cells[1].strip()) and re.fullmatch(r'QUEST[ÃA]O', cells[0].strip(), re.I))):
            nm = NUM_ONLY.match(cells[0].strip()) or NUM_ONLY.match(cells[1].strip())
            ev.append(('q', int(nm.group(1))))
            continue
        if len(b['rows']) == 1 and len(b['rows'][0]) == 2:
            L = cell_text(b['rows'][0][0]).strip().strip('().').upper()
            if L in ('A', 'B', 'C', 'D', 'E'):
                ev.append(('opt', L, cell_text(b['rows'][0][1]).strip()))
                continue
        if is_options_table(b):
            for i, row in enumerate(b['rows']):
                ev.append(('opt', 'ABCDE'[i], ' '.join(cell_text(c) for c in row[1:]).strip()))
            continue
        n_cells = sum(len(r) for r in b['rows'])
        # A container, not data: a boxed header / callout (1 cell), a boxed answer line, or a
        # LAYOUT table whose cells hold whole questions (a "QUESTÃO n" paragraph at any depth).
        if n_cells == 1 or has_qhead(b) or re.search(r'Alternativa\s+correta|Gabarito\s*:', ' '.join(cells), re.I):
            for row in b['rows']:
                for c in row:
                    ev.extend(interpret(c, state))
            continue
        rows = [[cell_text(c) for c in row] for row in b['rows']]
        # One merged table: lab rows, then "A | …", "B | …", "C | …", "D | …" as its last rows.
        for k in (5, 4):
            tail = rows[-k:]
            if len(rows) > k and all(len(r) >= 2 and r[0].strip().strip('().').upper() == 'ABCDE'[i] for i, r in enumerate(tail)):
                ev.append(('table', rows[:-k]))
                for i, r in enumerate(tail):
                    ev.append(('opt', 'ABCDE'[i], ' '.join(x for x in r[1:] if x).strip()))
                break
        else:
            ev.append(('table', rows))
    return ev


def split_by_question(ev):
    qs, order, cur = {}, [], None
    for e in ev:
        if e[0] == 'q':
            cur = e[1]
            if cur not in qs:
                qs[cur] = []
                order.append(cur)
            else:                      # a repeated number = a second block (draft + final): keep the last
                qs[cur] = []
            continue
        if cur is not None:
            qs[cur].append(e)
    return qs, order


# ───────────────────────────── exam side ─────────────────────────────

OPT_PATTERNS = [
    re.compile(r'^\(([A-Ea-e])\)\s*(.+)$', re.S),
    re.compile(r'^([A-Ea-e])\)\s*(.+)$', re.S),
    re.compile(r'^([A-E])\s*[.\-–:]\s+(.+)$', re.S),
    re.compile(r'^([A-E])\s+(.+)$', re.S),          # bare "A text" — only trusted inside a full A..D run
]
EXAM_TAIL = re.compile(r'^(FOLHA\s+DE\s+RESPOSTAS|GABARITO|FIM\s+D[OA]\s+(CADERNO|PROVA|SIMULADO)|Nome\s*:|Registro\s+de\s+desempenho|Anota[çc][õo]es|Espa[çc]o\s+para\s+rascunho|Rascunho|Desempenho)', re.I)


def opt_of(text):
    for rx in OPT_PATTERNS:
        m = rx.match(text)
        if m:
            return m.group(1).upper(), m.group(2).strip()
    return None


def build_exam_question(events, warn):
    # cut an after-the-exam footer (answer sheet heading etc.)
    for i, e in enumerate(events):
        if e[0] == 't' and EXAM_TAIL.match(e[1]):
            events = events[:i]
            break
    # A leading area tag is not stem: "CLÍNICA MÉDICA / NEUROLOGIA" or "Clínica Médica / Hepatologia"
    # (short, has a " / ", no sentence punctuation).
    def is_tag(t):
        return bool(AREA_LABEL.match(t)) or (' / ' in t and len(t) <= 70 and not re.search(r'[.,;:?!]', t))
    while events and events[0][0] == 't' and is_tag(events[0][1]):
        events = events[1:]
    # options delivered as a table win; else find the LAST run of text lines lettered A,B,C,D(,E)
    topts = [(e[1], e[2]) for e in events if e[0] == 'opt']
    if len(topts) >= 4:
        first = next(i for i, e in enumerate(events) if e[0] == 'opt')
        stem_ev, after = events[:first], [e for e in events[first:] if e[0] != 'opt']
        options = topts
    else:
        best = None
        i = 0
        while i < len(events):
            if events[i][0] == 't':
                run, j = [], i
                while j < len(events) and events[j][0] == 't' and len(run) < 5:
                    o = opt_of(events[j][1])
                    if not o or o[0] != 'ABCDE'[len(run)]:
                        break
                    run.append(o)
                    j += 1
                if len(run) >= 4:
                    best = (i, j, run)
                    i = j
                    continue
            i += 1
        if not best:
            # Word auto-lettered list: the letters are numbering, not text. Take the LAST run of
            # 4–5 consecutive list paragraphs that share one list id.
            i = 0
            while i < len(events):
                e = events[i]
                if e[0] == 't' and len(e) > 2 and e[2]:
                    j = i
                    while j < len(events) and events[j][0] == 't' and len(events[j]) > 2 and events[j][2] == e[2]:
                        j += 1
                    if 4 <= j - i <= 5:
                        best = (i, j, [('ABCDE'[k], events[i + k][1]) for k in range(j - i)])
                    i = j
                    continue
                i += 1
        if not best:
            return None, 'no A–D option run found'
        stem_ev, after, options = events[:best[0]], events[best[1]:], best[2]
    stray = [e[1] for e in after if e[0] == 't' and not AREA_LABEL.match(e[1])]
    if stray:
        warn(f'text after the options ignored: {stray[0][:70]}')
    return {'stem': stem_ev + [e for e in after if e[0] in ('img', 'table')], 'options': options}, None


# ───────────────────────────── key side ─────────────────────────────

ANSWER = re.compile(r'^[✓✔☑✅]?\s*(?:Alternativa|Resposta|Op[çc][ãa]o)\s+correta\s*:\s*\(?([A-Ea-e])\)?\s*[-–—.:)]*\s*(.*)$', re.S)
GAB = re.compile(r'^[✓✔☑✅]?\s*(?:Gabarito|Resposta)\s*:?\s*\(?([A-E])\)?(?=[\s.:)\-–—]|$)\s*[-–—.:)]*\s*(.*)$', re.S)
LBL_COMMENT = re.compile(r'^(?:Coment[áa]rio|Justificativa|Explica[çc][ãa]o)\s*[:.]?\s*(.*)$', re.S | re.I)
LBL_WHY = re.compile(r'^Por\s+que\s+as\s+(?:outras|demais)(?:\s+alternativas)?\s+est[ãa]o\s+(?:erradas|incorretas)\s*\??\s*:?\s*(.*)$', re.S | re.I)
LBL_KEY = re.compile(r'^[●•▪■◆\-–]?\s*(?:Conceito|Ponto|Mensagem|Li[çc][ãa]o)[\s-]*chave\s*[:.]?\s*(.*)$', re.S | re.I)
KEY_TAIL = re.compile(r'^(Refer[êe]ncias?|Bibliografia|Fontes?\b|Base\s+normativa|Observa[çc][ãa]o\s+editorial|Nota\s+editorial|Material\s+educacional)', re.I)
DISTR = re.compile(r'^\(?([A-E])\)?\s*[).:\-–—]\s*(.+)$', re.S)          # "(A) …", "A. …", "A: …", "A - …"
DISTR_PAIR = re.compile(r'^\(?([A-E])\s*(?:e|,|/)\s*([A-E])\)?\s*[).:\-–—]?\s*(.+)$', re.S)   # "(A e B) Erradas. …\"


def split_inline_distractors(text, wrong):
    """'A. … B. … D. …' in one paragraph → {letter: text}; letters must appear in order and be
    followed by an uppercase sentence start (so 'B. burgdorferi' inside a sentence is not a cut)."""
    out, pos = {}, 0
    marks = []
    for L in wrong:
        m = re.compile(r'(?:^|\s)\(?%s\)?\s*[).:\-–—]\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç])' % L).search(text, pos)
        if not m:
            continue
        marks.append((L, m.start(), m.end()))
        pos = m.end()
    for i, (L, s, e) in enumerate(marks):
        out[L] = text[e:(marks[i + 1][1] if i + 1 < len(marks) else len(text))].strip()
    return out


def build_key_entry(events):
    lines = []
    for e in events:
        if e[0] == 't':
            if KEY_TAIL.match(e[1]):
                break
            lines.append(e[1])
    k = {'letter': None, 'answer_text': '', 'comment': [], 'why': {}, 'conceito': ''}
    mode = None
    why_inline = ''
    for ln in lines:
        m = ANSWER.match(ln) or GAB.match(ln)
        if m and not k['letter']:
            k['letter'], k['answer_text'], mode = m.group(1).upper(), m.group(2).strip(), None
            continue
        m = LBL_COMMENT.match(ln)
        if m:
            mode = 'comment'
            if m.group(1).strip():
                k['comment'].append(m.group(1).strip())
            continue
        m = LBL_WHY.match(ln)
        if m:
            mode = 'why'
            why_inline = m.group(1).strip()
            continue
        m = LBL_KEY.match(ln)
        if m:
            mode = 'key'
            k['conceito'] = m.group(1).strip()
            continue
        if mode == 'comment':
            k['comment'].append(ln)
        elif mode == 'why':
            d2 = DISTR_PAIR.match(ln)
            d = None if d2 else DISTR.match(ln)
            if d2:
                k['why'][d2.group(1)] = k['why'][d2.group(2)] = d2.group(3).strip()
            elif d:
                k['why'][d.group(1).upper()] = d.group(2).strip()
            elif k['why']:
                last = list(k['why'])[-1]
                k['why'][last] += ' ' + ln
            else:
                why_inline += ' ' + ln
        elif mode == 'key':
            k['conceito'] += ' ' + ln
    # Several distractors can share ONE paragraph ("A: … B: … D: …"), with or without the label
    # on the same line. If the per-line reading left a wrong letter without text, re-read the
    # whole block as inline and keep whichever reading explains more letters.
    if k['letter']:
        wrong = [L for L in 'ABCD' if L != k['letter']]
        if any(not k['why'].get(L) for L in wrong):
            blob = ' '.join([why_inline] + [f"{L}) {t}" for L, t in k['why'].items()]).strip() if not why_inline else why_inline
            if not why_inline and k['why']:
                first = sorted(k['why'])[0]
                blob = f"{first}) {k['why'][first]}" + ''.join(f" {L}) {t}" for L, t in k['why'].items() if L != first)
            alt = split_inline_distractors(blob.strip(), wrong)
            if sum(1 for L in wrong if alt.get(L)) > sum(1 for L in wrong if k['why'].get(L)):
                k['why'] = alt
    return k


# ───────────────────────────── html ─────────────────────────────

def esc(s):
    return html.escape(s, quote=True)


def table_html(rows):
    body = ''.join('<tr>' + ''.join((f'<th>{esc(c)}</th>' if i == 0 else f'<td>{esc(c)}</td>') for c in r) + '</tr>'
                   for i, r in enumerate(rows) if any(x.strip() for x in r))
    return f'<div class="quiz-table-wrap"><table class="quiz-table">{body}</table></div>'


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


# ───────────────────────────── main ─────────────────────────────

def collect():
    sims = []
    for dp, _dn, fn in os.walk(ROOT):
        for f in fn:
            m = re.fullmatch(r'mini-simulado-(\d+)\.docx', f, re.I)
            if not m:
                continue
            rel = os.path.relpath(dp, ROOT).replace('\\', '/')
            if rel.split('/')[0].lower() == 'geral':
                group, spec = 'geral', None
            else:
                group, spec = 'por-area', SPEC_FIX.get(rel.split('/')[-1].lower(), rel.split('/')[-1].lower())
            n = int(m.group(1))
            sims.append({'group': group, 'specSlug': spec, 'num': n,
                         'slug': f'simulado-geral-{n}' if group == 'geral' else f'{spec}-simulado-{n}',
                         'exam': os.path.join(dp, f), 'key': os.path.join(dp, f[:-5] + '-comentado.docx')})
    return sorted(sims, key=lambda s: (s['specSlug'] or '~', s['num']))


def main():
    if not os.path.isdir(ROOT):
        sys.exit(f'Source not found: {ROOT}')
    os.makedirs(MEDIA_OUT, exist_ok=True)
    result, warnings, skipped = [], [], []
    letters_total = {}
    n_img = n_tbl = n_q = 0

    for s in collect():
        name = f"{s['specSlug'] or 'geral'}#{s['num']}"
        w = lambda msg, _n=name: warnings.append(f'{_n}: {msg}')
        if s['specSlug'] and s['specSlug'] not in SPECIALTIES:
            skipped.append(f'{name}: unknown specialty folder'); continue
        if not os.path.exists(s['key']):
            skipped.append(f'{name}: no "-comentado" file — cannot be imported (no answer key)'); continue
        try:
            zx, xb, xrels = load_docx(s['exam'])
            _zk, kb, _ = load_docx(s['key'])
        except Exception as e:  # noqa: BLE001
            skipped.append(f'{name}: unreadable docx ({e})'); continue

        est, kst = {'exam': True}, {}
        xq, xorder = split_by_question(interpret(xb, est))
        kq, _korder = split_by_question(interpret(kb, kst))
        grid = kst.get('grid') or {}
        if not xq:
            skipped.append(f'{name}: no "QUESTÃO n" found in the exam'); continue
        if sorted(xq) != list(range(1, len(xq) + 1)):
            w(f'question numbers are not 1..n: {sorted(xq)}')
        if len(xq) != 25:
            w(f'{len(xq)} questions (expected 25)')

        questions = []
        for n in sorted(xq):
            qw = lambda msg, _n=n: w(f'Q{_n}: {msg}')
            built, err = build_exam_question(xq[n], qw)
            if err:
                qw(err + ' — question SKIPPED'); continue
            if n not in kq:
                qw('missing from the key — question SKIPPED'); continue
            k = build_key_entry(kq[n])
            opts = built['options']
            letters = [L for L, _ in opts]
            if letters != list('ABCDE'[:len(letters)]):
                qw(f'options out of order {letters} — question SKIPPED'); continue
            if not k['letter']:
                qw('no correct letter in the key — question SKIPPED'); continue
            if k['letter'] not in letters:
                qw(f"key says ({k['letter']}) but options are {letters} — question SKIPPED"); continue
            if grid and grid.get(n) and grid[n] != k['letter']:
                qw(f"gabarito grid says {grid[n]} but the comment says {k['letter']}")
            opt_text = dict(opts)[k['letter']]
            if k['answer_text']:
                a, b = norm(k['answer_text'])[:140], norm(opt_text)[:140]
                if a and b and difflib.SequenceMatcher(None, a, b).ratio() < 0.55:
                    qw(f"key answer text does not match option ({k['letter']}): key «{k['answer_text'][:60]}» vs exam «{opt_text[:60]}»")
            if not k['comment']:
                qw('no Comentário')
            wrong = [L for L in letters if L != k['letter']]
            if [L for L in wrong if not k['why'].get(L)]:
                qw(f"no 'why wrong' text for {[L for L in wrong if not k['why'].get(L)]}")

            stem_html, images = [], []
            for e in built['stem']:
                if e[0] == 't':
                    stem_html.append(f'<p>{esc(e[1])}</p>')
                elif e[0] == 'table':
                    stem_html.append(table_html(e[1])); n_tbl += 1
                elif e[0] == 'img':
                    target = xrels.get(e[1])
                    if not target or target not in zx.namelist():
                        qw(f'image relationship {e[1]} not found'); continue
                    ext = os.path.splitext(target)[1].lower() or '.png'
                    fname = f"{s['slug']}-q{n}" + (f'-{len(images) + 1}' if images else '') + ext
                    with open(os.path.join(MEDIA_OUT, fname), 'wb') as fh:
                        fh.write(zx.read(target))
                    images.append(fname); n_img += 1
            if not any(x.startswith('<p>') for x in stem_html):
                qw('empty stem — question SKIPPED'); continue
            if len(images) > 1:
                qw(f'{len(images)} figures but media_url holds one — only the first will show')

            pos = len(questions) + 1
            questions.append({
                'position': pos, 'number': n,
                'question': f'<h3><strong>Questão {pos}</strong></h3>\n' + '\n'.join(stem_html),
                'answers': [{'text': f'<div><strong>({L}) {esc(t)}</strong></div>', 'correct': L == k['letter'],
                             'feedback': '' if L == k['letter'] else k['why'].get(L, '')} for L, t in opts],
                'explanation_html': '\n'.join(filter(None, [
                    f"<h4>Comentário</h4>\n" + '\n'.join(f'<p>{esc(c)}</p>' for c in k['comment']) if k['comment'] else '',
                    f"<h4>Conceito-chave</h4>\n<ul class=\"resumo\"><li>{esc(k['conceito'].strip())}</li></ul>" if k['conceito'].strip() else '',
                ])) or None,
                'images': images,
            })
            letters_total[k['letter']] = letters_total.get(k['letter'], 0) + 1
            n_q += 1
        if not questions:
            skipped.append(f'{name}: 0 questions parsed'); continue
        result.append({'group': s['group'], 'specSlug': s['specSlug'], 'num': s['num'], 'slug': s['slug'],
                       'title': f"Simulado {s['num']}", 'exam': s['exam'].replace('\\', '/'), 'key': s['key'].replace('\\', '/'),
                       'questionCount': len(questions), 'questions': questions})

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1)

    by = {}
    for r in result:
        key = r['specSlug'] or '(geral)'
        by.setdefault(key, [0, 0]); by[key][0] += 1; by[key][1] += r['questionCount']
    print('\nMini simulados parse')
    print(f'  root : {ROOT}')
    print(f'  out  : {os.path.normpath(OUT)}')
    print(f'  simulados: {len(result)}   questions: {n_q}   figures: {n_img}   stem tables: {n_tbl}')
    tot = sum(letters_total.values()) or 1
    print('  correct letters: ' + '  '.join(f'{L}={c} ({c * 100 // tot}%)' for L, c in sorted(letters_total.items())))
    print('  per specialty  : ' + '  '.join(f'{k}={v[0]}/{v[1]}q' for k, v in sorted(by.items())))
    odd = [r for r in result if r['questionCount'] != 25]
    if odd:
        print('  NOT 25 questions: ' + ', '.join(f"{r['slug']}={r['questionCount']}" for r in odd))
    if skipped:
        print(f'\n  ✗ {len(skipped)} simulado(s) SKIPPED:')
        for x in skipped:
            print('    - ' + x)
    with open(os.path.join(os.path.dirname(OUT), 'mini-simulados-warnings.txt'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(['SKIPPED'] + skipped + ['', 'WARNINGS'] + warnings) + '\n')
    if warnings:
        print(f'\n  ⚠ {len(warnings)} warning(s) (all in parsed/mini-simulados-warnings.txt):')
        for x in warnings[:80]:
            print('    - ' + x)
        if len(warnings) > 80:
            print(f'    … +{len(warnings) - 80} more')
    else:
        print('\n  ✓ no warnings')


if __name__ == '__main__':
    main()
