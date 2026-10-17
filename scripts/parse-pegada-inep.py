#!/usr/bin/env python3
"""parse-pegada-inep.py — READ-ONLY parser (no DB) for Karina's "Questões Pegada INEP" (2026-10-17).

    python -I scripts/parse-pegada-inep.py <folder with Questoes_Pegada_INEP_<N>.docx>
    → parsed/pegada-inep-parsed.json + parsed/pegada-inep-media/ + parsed/pegada-inep-warnings.txt

38 mini simulados of questions taken from OTHER institutions' exams (ENARE, HCPA, UNESP, SES-GO…),
one .docx each, all from one generated template (unlike September's mini simulados):

  [Title] Questões Pegada INEP N · [Subtitle] Mini simulado N | 25 questões
  [Heading1] Questão N        ← exam half
      "ENARE | Questão original 27 | 2022"      source line (kept, shown above the stem)
      stem paragraphs · figures · typed tables
      "(A) …" "(B) …" (4 or 5 options; sometimes one paragraph split by line breaks)
  [Heading1] Questões Pegada INEP — Mini simulado N — Gabarito comentado
      [Heading2] Gabarito sintético + grid table ("4 | B*": * = historical item)
  [Heading2|3] Questão N      ← key half
      source line · optional "Origem: INEP — ENAMED 2025…" · optional "Questão histórica — …"
      "✅ Alternativa correta: (X) …" | "✅ Alternativa de referência: (X) …" | "Gabarito de referência: (X) …"
      "Comentário:" + paragraphs/lists
      "Por que as outras estão erradas?" | "Análise das (demais) alternativas:" + "(X) …"
      "🟣 Conceito-chave: …"
  Anything after the key (#10 carries a leftover editorial audit, "Gabarito oficial") is ignored.

Output mirrors scripts/parse-mini-simulados.py so QuizPlayer renders it like every other simulado:
  question          <h3><strong>Questão N</strong></h3> + <p class="quiz-source">…</p> + <p> stem …
  answers           [{text:'<div><strong>(A) …</strong></div>', correct, feedback}]
  explanation_html  [<p class="quiz-source">Origem…</p>] <h4>Comentário</h4>… <h4>Conceito-chave</h4><ul class="resumo">…
A historical item ("sem pontuação") keeps its REFERENCE letter as the correct answer — the
same convention as the annulled Questões (scripts/import-anuladas.js) — and says so above the
stem, so the student knows before answering.

Integrity checks (warnings, never a silent pass): 25 questions numbered 1..25 · options A.. in
order · key letter exists · key answer TEXT ≈ option text · grid letter == key letter · exam and
key source lines agree · every wrong option has a "why".
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
except ImportError:  # stdlib fallback — safe_xml() refuses any DTD (XXE / entity bombs need one)
    import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'parsed', 'pegada-inep-parsed.json')
MEDIA_OUT = os.path.join(HERE, '..', 'parsed', 'pegada-inep-media')
WARN_OUT = os.path.join(HERE, '..', 'parsed', 'pegada-inep-warnings.txt')
SLUG = 'pegada-inep-{n}'
TITLE = 'Questões Pegada INEP {n}'
# Figures go INLINE, where she placed them ("ferida na perna (imagem abaixo)" → figure → question),
# not in media_url: that slot shows ONE image above the heading, and 6 questions carry 2–3
# (ECG + X-ray, exams A and B). scripts/apply-pegada-inep.js uploads them to exactly this path.
# Versioned, so a later delivery can never overwrite a figure a live question still shows.
CDN_DIR = 'https://medhelpspace.b-cdn.net/images/simulados/pegada-inep/2026-10'

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
V = 'urn:schemas-microsoft-com:vml'
MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'


def local(el):
    return el.tag.rsplit('}', 1)[-1]


def esc(s):
    return html.escape(s, quote=False)


# ───────────────────────────── docx → blocks ─────────────────────────────

def para_block(p):
    """A paragraph → {'k':'p','text','html','imgs','style','list'}.
    `html` keeps super/subscript runs (10<sup>9</sup>/L, SpO<sub>2</sub>); `text` is plain."""
    parts, hparts, imgs = [], [], []

    def run_va(r):
        va = r.find(f'{{{W}}}rPr/{{{W}}}vertAlign')
        return va.get(f'{{{W}}}val') if va is not None else None

    def emit(s, va):
        parts.append(s)
        e = esc(s).replace('\n', '<br>')
        hparts.append(f'<sup>{e}</sup>' if va == 'superscript' and s.strip() else
                      f'<sub>{e}</sub>' if va == 'subscript' and s.strip() else e)

    def walk(el, va=None):
        for ch in el:
            if ch.tag == f'{{{MC}}}Fallback':
                continue  # duplicate of the mc:Choice content
            t = local(ch)
            if t == 'r':
                walk(ch, run_va(ch))
                continue
            if ch.tag == f'{{{W}}}t':
                emit(ch.text or '', va)
            elif ch.tag == f'{{{W}}}tab':
                emit(' ', None)
            elif ch.tag in (f'{{{W}}}br', f'{{{W}}}cr'):
                emit('\n', None)
            elif ch.tag == f'{{{W}}}noBreakHyphen':
                emit('-', None)
            elif ch.tag == f'{{{A}}}blip':
                rid = ch.get(f'{{{R}}}embed')
                if rid:
                    imgs.append(rid)
            elif ch.tag == f'{{{V}}}imagedata':
                rid = ch.get(f'{{{R}}}id')
                if rid:
                    imgs.append(rid)
            elif t == 'txbxContent':
                continue
            else:
                walk(ch, va)

    walk(p)
    text = re.sub(r'[ \t ]+', ' ', ''.join(parts)).strip()
    h = re.sub(r'[ \t ]+', ' ', ''.join(hparts)).strip()
    h = re.sub(r'(<br>\s*)+$', '', re.sub(r'^(\s*<br>)+', '', h)).strip()
    sty = p.find(f'{{{W}}}pPr/{{{W}}}pStyle')
    num = p.find(f'{{{W}}}pPr/{{{W}}}numPr/{{{W}}}numId')
    return {'k': 'p', 'text': text, 'html': h, 'imgs': imgs,
            'style': sty.get(f'{{{W}}}val') if sty is not None else '',
            'list': num.get(f'{{{W}}}val') if num is not None else None}


def blocks_of(node):
    out = []
    for ch in node:
        t = local(ch)
        if t == 'p':
            out.append(para_block(ch))
        elif t == 'tbl':
            rows = []
            for tr in ch.findall(f'{{{W}}}tr'):
                rows.append([' '.join(b['text'] for b in blocks_of(tc) if b['k'] == 'p' and b['text'])
                             for tc in tr.findall(f'{{{W}}}tc')])
            out.append({'k': 't', 'rows': rows})
        elif t in ('sdt', 'sdtContent', 'customXml', 'smartTag', 'ins'):
            out.extend(blocks_of(ch))
    return out


def safe_xml(data, what):
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


# ───────────────────────────── patterns ─────────────────────────────

Q_HEAD = re.compile(r'^Quest[ãa]o\s+0*(\d{1,2})$')
# key heading, sometimes with a suffix: "Questão 4 — Histórica, sem pontuação" (#35)
Q_HEAD_KEY = re.compile(r'^Quest[ãa]o\s+0*(\d{1,2})(?:\s*[—–-]\s*(.+))?$')
SOURCE = re.compile(r'^[A-Z][A-Za-z0-9\-/ ]{1,20}\s*\|\s*Quest[ãa]o original\s+\d+\s*\|\s*\d{4}$')
OPT = re.compile(r'^\(([A-E])\)\s*(.*)$', re.S)
KEY_START = re.compile(r'Gabarito comentado', re.I)
# "✅ Alternativa correta: (X)", "✅ Alternativa de referência: (X)", "Gabarito de referência (preliminar): (X)",
# "✅ Alternativa a assinalar — exceção: (X)", "✅ Alternativa correta — gabarito histórico da banca: (X)" …
ANSWER = re.compile(r'^(?:✅\s*)?((?:Alternativa|Gabarito)\b[^:()]{0,90}):\s*\(([A-E])\)\s*(.*)$', re.S)
COMMENT = re.compile(r'^Coment[áa]rio\s*:?\s*(.*)$', re.S)
# "Por que as outras estão erradas?" · "Por que as outras não constituem respostas exclusivas?" ·
# "Análise das alternativas:" · "Análise das demais alternativas:"
WHY = re.compile(r'^(?:Por que as (?:outras|demais)\b[^.]*\?|An[áa]lise das (?:demais )?alternativas\b[^.]*:?)\s*$', re.I)
SOURCE_ORIGEM = re.compile(r'^(.+?\|\s*\d{4})\s+(Origem\s*:.*)$')   # one line, no break (#11)
CONCEITO = re.compile(r'^🟣\s*Conceito-chave\s*:?\s*(.*)$', re.S)
ORIGEM = re.compile(r'^Origem\s*:')
HISTORICA = re.compile(r'^Quest[ãa]o hist[óo]rica\b')
IMAGE_OPT = re.compile(r'^Imagem\s+([A-E])\.?$')


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def table_html(rows):
    body = ''.join('<tr>' + ''.join((f'<th>{esc(c)}</th>' if i == 0 else f'<td>{esc(c)}</td>') for c in r) + '</tr>'
                   for i, r in enumerate(rows) if any(x.strip() for x in r))
    return f'<div class="quiz-table-wrap"><table class="quiz-table">{body}</table></div>'


def paras_html(items):
    """[('p'|'li', html)] → <p>…</p> with consecutive list items grouped into one <ul>."""
    out, ul = [], []
    for kind, h in items:
        if kind == 'li':
            ul.append(f'<li>{h}</li>')
            continue
        if ul:
            out.append('<ul>' + ''.join(ul) + '</ul>'); ul = []
        out.append(h if kind == 'raw' else f'<p>{h}</p>')
    if ul:
        out.append('<ul>' + ''.join(ul) + '</ul>')
    return out


def strip_opt(h):
    """'(B) texto' html → 'texto' html (the letter is re-added in the answer markup)."""
    return re.sub(r'^\(([A-E])\)\s*', '', h)


# ───────────────────────────── exam half ─────────────────────────────

def split_halves(blocks):
    for i, b in enumerate(blocks):
        if b['k'] == 'p' and b['style'].startswith('Heading1') and KEY_START.search(b['text']):
            return blocks[:i], blocks[i + 1:]
    return blocks, []


def parse_exam(blocks, w):
    qs, cur = {}, None
    for b in blocks:
        if b['k'] == 'p' and b['style'].startswith('Heading') and Q_HEAD.match(b['text']):
            n = int(Q_HEAD.match(b['text']).group(1))
            if n in qs:
                w(f'exam: Questão {n} appears twice')
            cur = qs[n] = {'source': None, 'stem': [], 'options': [], 'after': []}
            continue
        if cur is None:
            continue  # title, subtitle, instructions
        if b['k'] == 't':
            (cur['after'] if cur['options'] else cur['stem']).append(('table', b['rows']))
            continue
        for rid in b['imgs']:
            (cur['after'] if cur['options'] else cur['stem']).append(('img', rid))
        if not b['text']:
            continue
        first = b['text'].split('\n', 1)[0].strip()
        if cur['source'] is None and not cur['stem'] and SOURCE.match(first):
            # usually its own paragraph; sometimes "source<br><br>stem…" in one (#1 Q3)
            cur['source'] = first
            rest_t = b['text'].split('\n', 1)[1].strip() if '\n' in b['text'] else ''
            if not rest_t:
                continue
            rest_h = re.sub(r'^(\s*<br>)+', '', b['html'].split('<br>', 1)[1]).strip()
            b = dict(b, text=rest_t, html=rest_h)
        lines = b['text'].split('\n')
        hlines = b['html'].split('<br>')
        if OPT.match(lines[0].strip()):
            # one paragraph may hold several "(X) …" lines; a line without a letter continues the option
            for t, h in zip(lines, hlines if len(hlines) == len(lines) else [esc(x) for x in lines]):
                t, h = t.strip(), h.strip()
                if not t:
                    continue
                m = OPT.match(t)
                if m:
                    cur['options'].append([m.group(1), m.group(2).strip(), strip_opt(h)])
                elif cur['options']:
                    cur['options'][-1][1] += ' ' + t
                    cur['options'][-1][2] += ' ' + h
            continue
        if cur['options']:
            cur['after'].append(('t', b['text']))
            continue
        cur['stem'].append(('li' if b['list'] else 'p', b['html']))
    return qs


# ───────────────────────────── key half ─────────────────────────────

def parse_grid(rows):
    grid = {}
    for r in rows[1:]:
        for i in range(0, len(r) - 1, 2):
            n, L = r[i].strip(), r[i + 1].strip()
            m = re.fullmatch(r'([A-E])(\*?)', L)
            if re.fullmatch(r'\d{1,2}', n) and m:
                grid[int(n)] = (m.group(1), bool(m.group(2)))
    return grid


def parse_key(blocks, w):
    entries, grid, notes, cur, mode = {}, {}, [], None, None
    for b in blocks:
        if b['k'] == 'p' and b['style'].startswith('Heading1'):
            break  # end of the comented key (#10: "Gabarito oficial" audit follows)
        if b['k'] == 't':
            if cur is None and not grid:
                grid = parse_grid(b['rows'])
            elif cur is not None:
                cur['comment'].append(('raw', table_html(b['rows'])))
            continue
        mh = Q_HEAD_KEY.match(b['text']) if b['k'] == 'p' and b['style'].startswith('Heading') else None
        if mh:
            n = int(mh.group(1))
            if n in entries:
                w(f'key: Questão {n} appears twice')
            cur = entries[n] = {'source': None, 'origem': None, 'historica': None, 'letter': None,
                                'answer_label': '', 'answer_text': '', 'comment': [], 'why': {}, 'conceito': ''}
            if mh.group(2):
                suffix = mh.group(2).strip().rstrip('.')
                cur['historica'] = 'Questão ' + suffix[0].lower() + suffix[1:] if re.match(r'(?i)hist', suffix) else None
                if not cur['historica']:
                    w(f'key Q{n}: heading suffix «{suffix}» ignored')
            mode = 'head'
            continue
        if b['imgs'] and cur is not None:
            w(f'key Q{n}: figure inside the comment — not imported')
        t = b['text']
        if not t:
            continue
        if cur is None:
            if not b['style'].startswith('Heading') and not t.startswith('MedHelpSpace'):
                notes.append(t)
            continue
        if mode == 'head' and '\n' in t:
            # "source\nOrigem: …" in one paragraph (#11) — read the lines one by one
            head_lines = [x.strip() for x in t.split('\n') if x.strip()]
            if all(SOURCE.match(x) or ORIGEM.match(x) or HISTORICA.match(x) for x in head_lines):
                for x in head_lines:
                    if SOURCE.match(x):
                        cur['source'] = x
                    elif ORIGEM.match(x):
                        cur['origem'] = x
                    else:
                        cur['historica'] = x
                continue
        if mode == 'head' and cur['source'] is None and SOURCE.match(t):
            cur['source'] = t; continue
        mo = SOURCE_ORIGEM.match(t) if mode == 'head' and cur['source'] is None else None
        if mo and SOURCE.match(mo.group(1)):
            cur['source'], cur['origem'] = mo.group(1), mo.group(2); continue
        if mode == 'head' and ORIGEM.match(t):
            cur['origem'] = t; continue
        if mode == 'head' and HISTORICA.match(t):
            cur['historica'] = t; continue
        m = ANSWER.match(t)
        if m and cur['letter'] is None:
            cur['answer_label'], cur['letter'], cur['answer_text'] = m.group(1).strip(), m.group(2), m.group(3).strip()
            if not cur['historica'] and re.search(r'(?i)hist[óo]ric', cur['answer_label']):
                # "Alternativa correta — gabarito histórico da banca" (#14 Q13, #25 Q25)
                cur['historica'] = 'Questão histórica'
            mode = 'answer'; continue
        m = COMMENT.match(t)
        if m and mode in ('head', 'answer'):
            mode = 'comment'
            rest = b['html'].split(':', 1)[1].strip() if ':' in b['html'] else ''
            if rest:
                cur['comment'].append(('p', rest))
            continue
        if WHY.match(t):
            mode = 'why'; continue
        m = CONCEITO.match(t)
        if m:
            cur['conceito'] = m.group(1).strip(); mode = 'done'; continue
        if mode == 'comment':
            cur['comment'].append(('li' if b['list'] else 'p', b['html']))
        elif mode == 'why':
            m = OPT.match(t)
            if m:
                cur['why'][m.group(1)] = m.group(2).strip()
            elif re.match(r'^\(A alternativa correta', t):
                pass  # "(A alternativa correta está apresentada acima.)" (#35 Q1)
            else:
                w(f'key Q{n}: unlabelled line in the distractor list: «{t[:70]}»')
        else:
            w(f'key Q{n}: unexpected line ({mode}): «{t[:70]}»')
    return entries, grid, notes


# ───────────────────────────── main ─────────────────────────────

def main():
    if len(sys.argv) < 2 or not os.path.isdir(sys.argv[1]):
        sys.exit('usage: python -I scripts/parse-pegada-inep.py <folder with Questoes_Pegada_INEP_<N>.docx>')
    root = sys.argv[1]
    os.makedirs(MEDIA_OUT, exist_ok=True)
    files = sorted(((int(m.group(1)), f) for f in os.listdir(root)
                    if (m := re.fullmatch(r'Questoes_Pegada_INEP_(\d+)\.docx', f))), key=lambda x: x[0])
    result, warnings, notes_all, letters = [], [], [], {}
    n_img = n_tbl = n_hist = n_opts5 = 0

    for num, fname in files:
        name = f'#{num}'
        w = lambda msg, _n=name: warnings.append(f'{_n}: {msg}')
        z, blocks, rels = load_docx(os.path.join(root, fname))
        title = next((b['text'] for b in blocks if b['k'] == 'p' and b['style'] == 'Title'), '')
        if title and title != TITLE.format(n=num):
            w(f'title «{title}» does not match the file number')
        exam_b, key_b = split_halves(blocks)
        xq = parse_exam(exam_b, w)
        kq, grid, notes = parse_key(key_b, w)
        if notes:
            notes_all.append(f'{name}: ' + ' ¶ '.join(notes))
        if sorted(xq) != list(range(1, 26)):
            w(f'exam questions {sorted(xq)} (expected 1..25)')
        if sorted(kq) != sorted(xq):
            w(f'key questions {sorted(kq)} ≠ exam questions {sorted(xq)}')

        slug = SLUG.format(n=num)
        questions = []
        for n in sorted(xq):
            qw = lambda msg, _n=n: w(f'Q{_n}: {msg}')
            x, k = xq[n], kq.get(n)
            if not k:
                qw('missing from the key — SKIPPED'); continue
            opts = x['options']
            if not opts and k['letter'] and IMAGE_OPT.match(k['answer_text']) \
                    and any(kind == 'img' for kind, _ in x['stem']):
                # the alternatives are drawn inside the figure (#21 Q2: "Que imagem … dentre as abaixo")
                last = max([k['letter'], *k['why']])
                opts = [[L, f'Imagem {L}', f'Imagem {L}'] for L in 'ABCDE'[:'ABCDE'.index(last) + 1]]
                qw(f'alternatives are inside the figure — options built as {", ".join("Imagem " + o[0] for o in opts)}')
            lets = [o[0] for o in opts]
            if lets != list('ABCDE'[:len(lets)]) or len(lets) < 4:
                qw(f'options {lets} — SKIPPED'); continue
            if not k['letter']:
                qw('no answer line in the key — SKIPPED'); continue
            if k['letter'] not in lets:
                qw(f"key says ({k['letter']}) but options are {lets} — SKIPPED"); continue
            g = grid.get(n)
            if g and g[0] != k['letter']:
                qw(f"grid says {g[0]} but the comment says {k['letter']}")
            if g and g[1] != bool(k['historica']):
                qw(f"grid asterisk={g[1]} but historical line={bool(k['historica'])}")
            if not x['source']:
                qw('no source line in the exam')
            elif k['source'] and norm(k['source']) != norm(x['source']):
                qw(f"source differs: exam «{x['source']}» vs key «{k['source']}» (exam kept)")
            opt_text = dict((o[0], o[1]) for o in opts)[k['letter']]
            if k['answer_text']:
                a, b = norm(k['answer_text'])[:140], norm(opt_text)[:140]
                if a and b and difflib.SequenceMatcher(None, a, b).ratio() < 0.6:
                    qw(f"key answer text ≠ option ({k['letter']}): «{k['answer_text'][:60]}» vs «{opt_text[:60]}»")
            if not k['comment']:
                qw('no Comentário')
            if not k['conceito']:
                qw('no Conceito-chave')
            missing_why = [L for L in lets if L != k['letter'] and not k['why'].get(L)]
            if missing_why:
                qw(f'no "why wrong" text for {missing_why}')
            extra_why = [L for L in k['why'] if L not in lets]
            if extra_why:
                qw(f'"why" for letters that are not options: {extra_why}')
            if x['after']:
                qw(f"{len(x['after'])} block(s) after the options — not imported: {x['after'][:2]}")

            stem, images = [], []
            for kind, val in x['stem']:
                if kind in ('p', 'li'):
                    stem.append((kind, val))
                elif kind == 'table':
                    stem.append(('raw', table_html(val))); n_tbl += 1
                elif kind == 'img':
                    target = rels.get(val)
                    if not target or target not in z.namelist():
                        qw(f'image relationship {val} not found'); continue
                    ext = os.path.splitext(target)[1].lower() or '.png'
                    fn = f'{slug}-q{n}' + (f'-{len(images) + 1}' if images else '') + ext
                    with open(os.path.join(MEDIA_OUT, fn), 'wb') as fh:
                        fh.write(z.read(target))
                    images.append(fn); n_img += 1
                    url = f'{CDN_DIR}/{fn}'
                    stem.append(('raw', f'<figure class="quiz-figure"><a href="{url}" target="_blank" rel="noopener">'
                                        f'<img src="{url}" alt="Figura da questão" loading="lazy"></a></figure>'))
            if not any(kind in ('p', 'li') for kind, _ in stem):
                qw('empty stem — SKIPPED'); continue

            pos = len(questions) + 1
            if pos != n:
                qw(f'stored at position {pos}')
            # Source block above the stem: where the question comes from, and — before the student
            # answers — whether it is a historical item kept for study with a reference answer.
            # "Origem" sits here too (not in the explanation): the Comentário heading must stay the
            # explanation's first child, which is what draws its brand square (globals.css).
            meta = [esc(x['source'] or ''), esc(k['origem'] or '')]
            if k['historica']:
                meta.append(esc(k['historica']))
                n_hist += 1
            head = f'<h3><strong>Questão {pos}</strong></h3>\n<p class="quiz-source">{"<br>".join(m for m in meta if m)}</p>'
            correct_why = k['why'].get(k['letter'], '')
            expl = []
            if k['comment']:
                expl.append('<h4>Comentário</h4>\n' + '\n'.join(paras_html(k['comment'])))
            if k['conceito']:
                expl.append(f'<h4>Conceito-chave</h4>\n<ul class="resumo"><li>{esc(k["conceito"])}</li></ul>')
            questions.append({
                'position': pos, 'number': n, 'source': x['source'], 'historica': bool(k['historica']),
                'question': head + '\n' + '\n'.join(paras_html(stem)),
                'answers': [{'text': f'<div><strong>({L}) {h}</strong></div>', 'correct': L == k['letter'],
                             'feedback': correct_why if L == k['letter'] else k['why'].get(L, '')}
                            for L, _t, h in opts],
                'explanation_html': '\n'.join(expl) or None,
                'images': images,
            })
            letters[k['letter']] = letters.get(k['letter'], 0) + 1
            if len(lets) == 5:
                n_opts5 += 1
        # Page title "Simulado N", like the 20 Simulados Gerais: the collection (breadcrumb,
        # tagline, Continuar card) says which one — Karina: "numerados de 1 a 38".
        result.append({'num': num, 'slug': slug, 'title': f'Simulado {num}', 'docTitle': title, 'file': fname,
                       'questionCount': len(questions), 'questions': questions})

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1)
    with open(WARN_OUT, 'w', encoding='utf-8') as fh:
        fh.write('WARNINGS\n' + '\n'.join(warnings) + '\n\nNOTES UNDER THE GABARITO GRID\n' + '\n'.join(notes_all) + '\n')

    nq = sum(r['questionCount'] for r in result)
    multi = [f"{r['slug']} Q{q['number']}({len(q['images'])})" for r in result for q in r['questions'] if len(q['images']) > 1]
    print('\nQuestões Pegada INEP parse')
    print(f'  source : {root}')
    print(f'  out    : {os.path.normpath(OUT)}')
    print(f'  simulados: {len(result)}   questions: {nq}   figures: {n_img}   stem tables: {n_tbl}')
    print(f'  5-option questions: {n_opts5}   historical (reference answer): {n_hist}')
    tot = sum(letters.values()) or 1
    print('  correct letters: ' + '  '.join(f'{L}={c} ({c * 100 // tot}%)' for L, c in sorted(letters.items())))
    odd = [f"{r['slug']}={r['questionCount']}" for r in result if r['questionCount'] != 25]
    if odd:
        print('  NOT 25 questions: ' + ', '.join(odd))
    if multi:
        print(f'  questions with >1 figure: {len(multi)} — ' + ', '.join(multi))
    print(f'\n  {len(warnings)} warning(s) → {os.path.normpath(WARN_OUT)}')
    for x in warnings[:120]:
        print('    - ' + x)


if __name__ == '__main__':
    main()
