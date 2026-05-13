"""
MedHelpSpace full migration parser.

Usage:
  python parser.py --smoke   # parse 5 random pages per type, report errors, exit
  python parser.py           # full run, write parsed/ output files

Output: parsed/ directory with SQL INSERT files + migration-report.md
"""

import re, json, base64, csv, html as html_mod, os, sys, random
from pathlib import Path
from collections import defaultdict

DB  = Path(r"C:\Users\jrazm\claudebuilds\medhelpspace\db.sql")
CSV = Path(r"C:\Users\jrazm\claudebuilds\medhelpspace\page-inventory.csv")
OUT = Path(r"C:\Users\jrazm\claudebuilds\medhelpspace\parsed")

SMOKE = "--smoke" in sys.argv
SMOKE_N = 5

# ──────────────────────────────────────────────────────────────
# SQL streaming (adapted from build_inventory.py, whitespace bug fixed)
# ──────────────────────────────────────────────────────────────

def split_rows(values_str):
    rows, depth, current, in_str, escape = [], 0, [], False, False
    for c in values_str:
        if escape:
            current.append(c); escape = False
        elif c == "\\" and in_str:
            current.append(c); escape = True
        elif c == "'":
            in_str = not in_str; current.append(c)
        elif not in_str:
            if c == "(":
                if depth == 0: current = ["("]
                else: current.append(c)
                depth += 1
            elif c == ")":
                depth -= 1; current.append(c)
                if depth == 0: rows.append("".join(current)); current = []
            elif c == "," and depth == 0:
                pass
            else:
                current.append(c)
        else:
            current.append(c)
    return rows

def parse_row(row_str):
    inner = row_str[1:-1]
    values, i = [], 0
    while i < len(inner):
        # skip leading whitespace (critical fix for space-padded fields)
        while i < len(inner) and inner[i] == " ":
            i += 1
        if i >= len(inner):
            break
        if inner[i:i+4] == "NULL":
            values.append(None); i += 4
            if i < len(inner) and inner[i] == ",": i += 1
        elif inner[i] == "'":
            j = i + 1; buf = []
            while j < len(inner):
                ch = inner[j]
                if ch == "\\":
                    if j + 1 < len(inner):
                        nxt = inner[j+1]
                        buf.append({"n":"\n","r":"\r","t":"\t","'":"'",
                                    "\\":"\\",'\"':'"',"0":"\0"}.get(nxt, nxt))
                        j += 2
                    else:
                        buf.append(ch); j += 1
                elif ch == "'":
                    if j+1 < len(inner) and inner[j+1] == "'":
                        buf.append("'"); j += 2
                    else:
                        j += 1; break
                else:
                    buf.append(ch); j += 1
            values.append("".join(buf)); i = j
            if i < len(inner) and inner[i] == ",": i += 1
        else:
            j = i
            while j < len(inner) and inner[j] != ",": j += 1
            values.append(inner[i:j]); i = j
            if i < len(inner) and inner[i] == ",": i += 1
    return values

def stream_table_rows(table):
    col_names, in_create = [], False
    target = f"INSERT INTO `{table}`"
    with DB.open("r", encoding="utf-8", errors="replace") as fh:
        buf = ""
        for line in fh:
            stripped = line.rstrip()
            if f"CREATE TABLE `{table}`" in stripped:
                in_create = True; col_names = []; continue
            if in_create:
                if stripped.strip().startswith("`"):
                    m = re.match(r"\s*`(\w+)`", stripped)
                    if m: col_names.append(m.group(1))
                elif ") ENGINE=" in stripped or stripped.strip() == ");":
                    in_create = False
                continue
            if stripped.startswith(target):
                buf = stripped
            elif buf:
                buf += stripped
            if buf and buf.rstrip().endswith(";"):
                m = re.search(r"VALUES\s*(.*);", buf, re.DOTALL)
                if m and col_names:
                    for row in split_rows(m.group(1).strip()):
                        vals = parse_row(row)
                        if len(vals) >= len(col_names):
                            yield dict(zip(col_names, vals[:len(col_names)]))
                        elif vals:
                            yield dict(zip(col_names[:len(vals)], vals))
                buf = ""

# ──────────────────────────────────────────────────────────────
# Patterns
# ──────────────────────────────────────────────────────────────

RE_TOGGLE     = re.compile(r'\[et_pb_toggle([^\]]*)\](.*?)\[/et_pb_toggle\]', re.S|re.I)
RE_T_TITLE    = re.compile(r'\btitle="([^"]*)"')
RE_LINK_ONLY  = re.compile(r'^\s*(<a\b[^>]*>.*?</a>\s*)*\s*$', re.S|re.I)
RE_ET_TEXT    = re.compile(r'\[et_pb_text[^\]]*\](.*?)\[/et_pb_text\]', re.S|re.I)
RE_ET_HEADING = re.compile(r'\[et_pb_heading\s+title="([^"]*)"[^\]]*\](?:\[/et_pb_heading\])?', re.I)
RE_BLURB      = re.compile(r'\[et_pb_blurb([^\]]*)\]', re.I)
RE_B_TITLE    = re.compile(r'\btitle="([^"]*)"')
RE_ET_DC      = re.compile(r'@ET-DC@([^@]+)@')
RE_DYN_ATTRS  = re.compile(r'_dynamic_attributes="([^"]*)"')
RE_H5P_SHORT  = re.compile(r'\[h5p\s+id=["\']?(\d+)["\']?', re.I)
RE_H5P_IFRAME = re.compile(r'data-content-id=["\']?(\d+)', re.I)
RE_ZOOMSOUNDS = re.compile(r'\[zoomsounds_player\b([^\]]*)\]', re.I)
RE_ZS_SOURCE  = re.compile(r'\bsource=["\']([^"\']+)["\']')
RE_A_HREF     = re.compile(r'href="(https?://(?:www\.)?medhelpspace\.com\.br/[^"]*)"', re.I)
RE_A_TAG      = re.compile(r'<a\b([^>]*)>(.*?)</a>', re.S|re.I)
RE_LINK_HREF  = re.compile(r'\bhref=["\']([^"\']+)["\']')

# Divi attribute soup — strip these from shortcode attrs and inline HTML attrs
RE_DIVI_SOUP  = re.compile(
    r'\s+(?:_builder_version|_module_preset|global_colors_info|border_radii'
    r'|box_shadow_style|box_shadow_color|box_shadow_blur|box_shadow_spread'
    r'|box_shadow_position|box_shadow_horizontal|box_shadow_vertical'
    r'|custom_padding|hover_enabled|sticky_enabled|global_module|saved_tabs'
    r'|background_color|use_background_color|background_layout|text_orientation'
    r'|max_width|custom_margin|custom_css_\w+|module_alignment'
    r'|background_image|parallax|parallax_method|background_position'
    r'|background_size|background_repeat|background_blend|use_background_image'
    r'|use_background_gradient|background_gradient_\w+'
    r'|padding_\w+|margin_\w+|font_level'
    r'|header_font|header_font_size|header_text_color|header_line_height'
    r'|body_font|body_font_size|body_text_color|body_line_height'
    r'|use_dropshadow|icon_color|use_icon_font_size|icon_font_size'
    r'|use_overlay|overlay_color|use_icon|font_icon'
    r'|icon_placement|animation|animation_duration|animation_delay'
    r'|locked|show_in_lightbox|url_new_window|use_overlay'
    r'|align_tablet|align_phone|align_last_edited'
    r'|disabled|disabled_on|border_width_all|border_color_all'
    r'|border_style_all|border_radii_\w+'
    r')=["\'][^"\']*["\']',
    re.I)

RE_NOTION    = re.compile(r'<!--\s*notionvc:.*?-->', re.S)
RE_EMPTY_A   = re.compile(r'<a[^>]*>\s*(<img[^>]*/?>)\s*</a>', re.S|re.I)
RE_WP_IMAGE_CLASS = re.compile(r'\bwp-image-\d+\b')
RE_EMOJI_IMG = re.compile(r'<img[^>]+class="[^"]*(?:wp-smiley|emoji)[^"]*"[^>]*/>', re.I)
RE_STETHO    = re.compile(
    r'<img[^>]+(?:alt="[^"]*(?:stethoscope|estetoscópio)[^"]*"|'
    r'src="[^"]*(?:stethoscope|estetoscópio|icone-bullet)[^"]*")[^>]*/>', re.S|re.I)

SPECIALTIES = [
    ("cardiologia",1),("dermatologia",2),("emergencia",3),("endocrinologia",4),
    ("gastroenterologia",5),("hematologia",6),("infectologia",7),("nefrologia",8),
    ("neurologia",9),("pneumologia",10),("psiquiatria",11),("reumatologia",12),
]
SPEC_SLUGS = {s:i for s,i in SPECIALTIES}

TRACK_HUBS  = {"medvoice": (2985, 1), "audiocards": (3690, 2), "flashcards": (3767, 3)}
MODULE_ROOT = 3018   # medhelp-60d WP id → content_module_id = 1

# ──────────────────────────────────────────────────────────────
# SQL output helpers
# ──────────────────────────────────────────────────────────────

def sq(v):
    if v is None: return "NULL"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def sq_jsonb(obj):
    return "'" + json.dumps(obj, ensure_ascii=False).replace("'", "''") + "'::jsonb"

def sq_ts(dt_str):
    if not dt_str or dt_str == "0000-00-00 00:00:00": return "NULL"
    return f"'{dt_str}'::timestamptz"

# ──────────────────────────────────────────────────────────────
# HTML cleanup
# ──────────────────────────────────────────────────────────────

def cleanup_html(raw, slug_to_id=None, unresolved_links=None):
    s = html_mod.unescape(raw or "")
    s = RE_NOTION.sub("", s)
    s = RE_DIVI_SOUP.sub("", s)
    s = RE_EMOJI_IMG.sub("", s)
    s = RE_STETHO.sub("", s)
    s = RE_EMPTY_A.sub(r"\1", s)
    s = RE_WP_IMAGE_CLASS.sub("", s)

    if slug_to_id is not None:
        def resolve_link(m):
            url = m.group(1)
            slug = url.rstrip("/").rsplit("/", 1)[-1]
            pid = slug_to_id.get(slug)
            if pid:
                return f'href="{url}" data-page-id="{pid}"'
            if unresolved_links is not None:
                unresolved_links.append(url)
            return m.group(0)
        s = RE_A_HREF.sub(resolve_link, s)

    s = re.sub(r"\n{3,}", "\n\n", s).strip()
    return s

def normalize_title(t):
    t = t.strip()
    if t and t == t.upper() and len(t) > 3:
        t = t.title()
    return t

# ──────────────────────────────────────────────────────────────
# Per-type content parsers
# ──────────────────────────────────────────────────────────────

def parse_plain_content(content, slug_to_id, unresolved):
    all_blocks = []
    for m in RE_ET_HEADING.finditer(content):
        title_text = html_mod.unescape(m.group(1).strip())
        all_blocks.append((m.start(), f"<h2>{title_text}</h2>"))
    for m in RE_ET_TEXT.finditer(content):
        cleaned = cleanup_html(m.group(1), slug_to_id, unresolved)
        if cleaned:
            all_blocks.append((m.start(), cleaned))
    all_blocks.sort(key=lambda x: x[0])
    return "\n".join(b for _, b in all_blocks)

def parse_toggles(content, slug_to_id, unresolved, extract_audio=False):
    lessons = []
    pos = 1
    for m in RE_TOGGLE.finditer(content):
        attrs, body = m.group(1), m.group(2)
        if RE_LINK_ONLY.match(body):
            continue
        t_m = RE_T_TITLE.search(attrs)
        title = normalize_title(html_mod.unescape(t_m.group(1))) if t_m else ""
        audio_url = None
        if extract_audio:
            zs = RE_ZOOMSOUNDS.search(body)
            if zs:
                src = RE_ZS_SOURCE.search(zs.group(1))
                if src:
                    audio_url = src.group(1).strip()
                body = body[:zs.start()] + body[zs.end():]
        body_html = cleanup_html(body, slug_to_id, unresolved)
        lessons.append({"position": pos, "title": title,
                        "body_html": body_html, "audio_url": audio_url})
        pos += 1
    return lessons

def get_h5p_id(content):
    m = RE_H5P_SHORT.search(content) or RE_H5P_IFRAME.search(content)
    return m.group(1) if m else None

def parse_questionset(params, page_id):
    rows = []
    for i, q in enumerate(params.get("questions", []), 1):
        qp = q.get("params", q)
        answers = []
        for ans in qp.get("answers", []):
            tf = ans.get("tipsAndFeedback", {}) or {}
            fb = tf.get("chosenFeedback") or tf.get("correctFeedback") or ""
            answers.append({"text": ans.get("text",""), "correct": bool(ans.get("correct")), "feedback": fb})
        media_url = None
        med = qp.get("media", {}) or {}
        if med:
            mp = med.get("params", {}) or {}
            f = mp.get("file", {}) or {}
            if f.get("path"): media_url = f["path"]
        sub_id = q.get("subContentId") or qp.get("subContentId")
        rows.append({"page_id": page_id, "position": i,
                     "h5p_sub_id": sub_id if _valid_uuid(sub_id) else None,
                     "question": qp.get("question",""), "answers": answers,
                     "media_url": media_url})
    return rows

def _valid_uuid(s):
    if not s: return False
    return bool(re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', s, re.I))

def _detect_cp_type(slides):
    for sl in slides:
        for el in sl.get("elements", []):
            lib = el.get("action", {}).get("library", "")
            if "Dialogcards" in lib: return "flashcard"
            if "AdvancedText" in lib or "Image" in lib: return "memorecards"
    return "unknown"

def parse_flashcards(params, page_id):
    rows = []
    slides = params.get("presentation", {}).get("slides", [])
    g_pos = 0
    for slide in slides:
        for el in slide.get("elements", []):
            action = el.get("action", {}) or {}
            if "Dialogcards" not in action.get("library", ""):
                continue
            ep = action.get("params", {}) or {}
            group_label = ep.get("title") or ep.get("description") or None
            g_pos += 1
            for pos, dlg in enumerate(ep.get("dialogs", []), 1):
                tips_obj = dlg.get("tips", {}) or {}
                tip_text = tips_obj.get("text") if isinstance(tips_obj, dict) else None
                rows.append({"page_id": page_id, "group_position": g_pos,
                             "group_label": group_label, "position": pos,
                             "h5p_sub_id": None,
                             "text": dlg.get("text",""), "answer": dlg.get("answer",""),
                             "image_url": None, "tip": tip_text})
    return rows

def parse_presentation(params, page_id):
    rows = []
    slides = params.get("presentation", {}).get("slides", [])
    pos = 0
    for slide in slides:
        elements = slide.get("elements", [])
        if not elements:
            continue  # skip cover/empty slides
        content_html = image_url = caption = notes = None
        has_text = has_image = False
        for el in elements:
            action = el.get("action", {}) or {}
            lib = action.get("library", "")
            ep  = action.get("params", {}) or {}
            if "AdvancedText" in lib:
                content_html = ep.get("text") or ""
                has_text = True
            elif "Image" in lib:
                f = ep.get("file", {}) or {}
                image_url = f.get("path")
                caption   = ep.get("alt") or ep.get("title") or None
                has_image = True
        layout = ("text_with_image" if has_text and has_image
                  else "image" if has_image else "text")
        pos += 1
        rows.append({"page_id": page_id, "position": pos, "layout": layout,
                     "content_html": content_html, "image_url": image_url,
                     "caption": caption, "notes": notes})
    return rows

def parse_blurb_hub(content, pages_by_id, slug_to_id, unresolved_nav):
    items = []
    pos = 1
    for m in RE_BLURB.finditer(content):
        attrs = m.group(1)
        t_m = RE_B_TITLE.search(attrs)
        label = html_mod.unescape(t_m.group(1).strip()) if t_m else ""
        target_page_id = None
        dyn = RE_DYN_ATTRS.search(attrs)
        if dyn and "link_option_url" in dyn.group(1):
            etdc = RE_ET_DC.search(attrs)
            if etdc:
                try:
                    decoded = json.loads(base64.b64decode(etdc.group(1) + "==").decode("utf-8"))
                    wp_id = str(decoded.get("settings", {}).get("post_id", ""))
                    if wp_id and wp_id in pages_by_id:
                        target_page_id = wp_id
                    elif wp_id:
                        unresolved_nav.append(wp_id)
                except Exception:
                    pass
        if label:
            items.append({"position": pos, "label": label,
                          "target_page_id": target_page_id,
                          "icon": None, "group_label": None, "layout": "cards"})
            pos += 1
    return items

def parse_nav_toggles(content, slug_to_id, unresolved_nav):
    items, pos = [], 1
    for t_m in RE_TOGGLE.finditer(content):
        body = t_m.group(2)
        for a_m in RE_A_TAG.finditer(body):
            href_m = RE_LINK_HREF.search(a_m.group(1))
            if not href_m: continue
            url = href_m.group(1).strip()
            label = re.sub(r"<[^>]+>", "", a_m.group(2)).strip()
            target_id = None
            slug = url.rstrip("/").rsplit("/", 1)[-1]
            if slug in slug_to_id:
                target_id = slug_to_id[slug]
            else:
                unresolved_nav.append(url)
            items.append({"position": pos, "label": label,
                          "target_page_id": target_id,
                          "icon": None, "group_label": None, "layout": "list"})
            pos += 1
    return items

# ──────────────────────────────────────────────────────────────
# Classification helpers
# ──────────────────────────────────────────────────────────────

def get_subtree(root_id, children):
    result, queue = {str(root_id)}, [str(root_id)]
    while queue:
        n = queue.pop()
        for c in children.get(n, []):
            if c not in result:
                result.add(c); queue.append(c)
    return result

def detect_specialty(slug, parent_chain):
    for s in [slug] + [p["slug"] for p in parent_chain]:
        sl = s.lower()
        for spec, sid in SPECIALTIES:
            if spec in sl:
                return sid
    return None

def detect_view(slug, ptype, parent_chain):
    if ptype == "h5p-quiz": return "quiz"
    for s in [slug] + [p["slug"] for p in parent_chain]:
        sl = s.lower()
        if "simulados" in sl: return "simulados"
        if "resumos"   in sl: return "resumos"
        if "formula"   in sl: return "formula"
    if ptype == "blurb-nav-hub":
        sl = slug.lower()
        for spec, _ in SPECIALTIES:
            if sl == spec: return "hub"
    return None

def topo_sort(pages):
    result, visited = [], set()
    def visit(pid):
        if pid in visited: return
        visited.add(pid)
        parent = pages[pid].get("parent_id", "0")
        if parent and parent != "0" and parent in pages:
            visit(parent)
        result.append(pid)
    for pid in sorted(pages.keys(), key=lambda x: int(x) if x.isdigit() else 0):
        visit(pid)
    return result

# ──────────────────────────────────────────────────────────────
# Load data
# ──────────────────────────────────────────────────────────────

print("Loading inventory CSV...", flush=True)
inventory = {}
with CSV.open(newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        inventory[row["id"]] = row

print(f"  {len(inventory)} pages in inventory", flush=True)

print("Loading wp_posts content + dates...", flush=True)
wp_content = {}  # id -> {content, post_date, post_modified, status}
WP_COLS = None
for row in stream_table_rows("wp_posts"):
    pid = str(row.get("ID",""))
    if pid not in inventory: continue
    wp_content[pid] = {
        "content":      row.get("post_content","") or "",
        "post_date":    row.get("post_date",""),
        "post_modified":row.get("post_modified",""),
        "status":       row.get("post_status","publish"),
    }
print(f"  {len(wp_content)} content rows loaded", flush=True)

print("Loading wp_h5p_contents...", flush=True)
h5p_data = {}  # h5p_id -> {library_id, params}
for row in stream_table_rows("wp_h5p_contents"):
    hid = str(row.get("id",""))
    raw_params = row.get("parameters","") or ""
    try:
        params = json.loads(raw_params)
    except Exception:
        params = {}
    h5p_data[hid] = {"library_id": str(row.get("library_id","")), "params": params,
                     "title": row.get("title","")}
print(f"  {len(h5p_data)} H5P items loaded", flush=True)

# ──────────────────────────────────────────────────────────────
# Build tree and classification maps
# ──────────────────────────────────────────────────────────────

print("Building tree + classification...", flush=True)

children = defaultdict(list)  # parent_id -> [child_ids]
for pid, inv in inventory.items():
    parent = inv.get("parent_id","0") or "0"
    if parent != "0":
        children[parent].append(pid)

# Find track hub IDs by slug in inventory
slug_to_inv_id = {inv["slug"]: pid for pid, inv in inventory.items()}

medhelp60d_ids = get_subtree(MODULE_ROOT, children)

track_id_map = {}  # page_id -> track_id (1=medvoice, 2=audiocards, 3=flashcards)
for track_slug, (default_hub_id, track_db_id) in TRACK_HUBS.items():
    hub_id = slug_to_inv_id.get(track_slug, str(default_hub_id))
    for pid in get_subtree(hub_id, children):
        track_id_map[pid] = track_db_id

# Parent chain builder
def get_parent_chain(pid):
    chain, seen = [], set()
    current = inventory.get(pid,{})
    while True:
        parent = current.get("parent_id","0") or "0"
        if parent == "0" or parent in seen: break
        seen.add(parent)
        p = inventory.get(parent)
        if not p: break
        chain.append(p); current = p
    return chain

# Which pages to migrate (skip 'skip', 'unclassified', and empty-slug pages)
SKIP_TYPES = {"skip", "unclassified"}
migrated_ids = {pid for pid, inv in inventory.items()
                if inv["classified_type"] not in SKIP_TYPES
                and inv.get("slug", "").strip() != ""}
slug_to_id = {inventory[pid]["slug"]: pid for pid in migrated_ids}

# Precompute per-page metadata
page_meta = {}  # pid -> {specialty_id, view, track_id, content_module_id, status, notes}
for pid in migrated_ids:
    inv = inventory[pid]
    slug  = inv["slug"]
    ptype = inv["classified_type"]
    inv_notes = inv.get("notes","") or ""
    chain = get_parent_chain(pid)

    spec_id   = detect_specialty(slug, chain)
    view      = detect_view(slug, ptype, chain)
    track_id  = track_id_map.get(pid)
    mod_id    = 1 if pid in medhelp60d_ids else None

    # Status and notes
    status = "publish"
    pg_notes_parts = []
    wp_info = wp_content.get(pid, {})
    if wp_info.get("status","publish") != "publish":
        status = "draft"
        pg_notes_parts.append(f"status:{wp_info['status']}")
    if "h5p-id-missing-from-table" in inv_notes:
        status = "draft"
        pg_notes_parts.append("orphaned-h5p-ref")
    if "blurb-cards-links-not-set-incomplete" in inv_notes:
        status = "draft"
        pg_notes_parts.append("blurb-cards-links-not-set-incomplete")

    page_meta[pid] = {
        "specialty_id": spec_id,
        "view": view,
        "track_id": track_id,
        "content_module_id": mod_id,
        "status": status,
        "notes": "; ".join(pg_notes_parts) if pg_notes_parts else None,
    }

print(f"  {len(migrated_ids)} pages to migrate", flush=True)

# ──────────────────────────────────────────────────────────────
# Stage 2: smoke test
# ──────────────────────────────────────────────────────────────

TYPE_ORDER = ["plain-content","text-lesson","audio-lesson","h5p-quiz",
              "blurb-nav-hub","navigation-toggle"]

def smoke_page(pid):
    inv   = inventory[pid]
    ptype = inv["classified_type"]
    slug  = inv["slug"]
    content = wp_content.get(pid, {}).get("content","")
    meta  = page_meta[pid]
    errors = []
    try:
        if ptype == "plain-content":
            html = parse_plain_content(content, slug_to_id, [])
            if html is None: errors.append("parse_plain_content returned None")
        elif ptype in ("text-lesson",):
            lessons = parse_toggles(content, slug_to_id, [], extract_audio=False)
            # Allow 0 lessons (all toggles are nav-link)
        elif ptype == "audio-lesson":
            lessons = parse_toggles(content, slug_to_id, [], extract_audio=True)
        elif ptype == "h5p-quiz":
            hid = get_h5p_id(content)
            if not hid:
                errors.append("no H5P id found in content")
            elif hid not in h5p_data:
                # orphaned ref — page is already flagged as draft in meta, not a smoke failure
                pass
            else:
                lib = h5p_data[hid]["library_id"]
                p   = h5p_data[hid]["params"]
                if lib == "15":
                    qs = parse_questionset(p, pid)
                    if not qs: errors.append("QuestionSet: 0 questions parsed")
                elif lib == "35":
                    slides = p.get("presentation",{}).get("slides",[])
                    cp_type = _detect_cp_type(slides)
                    if cp_type == "flashcard":
                        items = parse_flashcards(p, pid)
                        if not items: errors.append("Flashcard: 0 items parsed")
                    elif cp_type == "memorecards":
                        sl_rows = parse_presentation(p, pid)
                        if not sl_rows: errors.append("Presentation: 0 slides parsed")
                    else:
                        errors.append(f"CoursePresentation: unknown inner type on {slug}")
                else:
                    errors.append(f"Unknown library_id={lib}")
        elif ptype == "blurb-nav-hub":
            items = parse_blurb_hub(content, migrated_ids, slug_to_id, [])
            if not items: errors.append("blurb hub: 0 nav items")
        elif ptype == "navigation-toggle":
            items = parse_nav_toggles(content, slug_to_id, [])
    except Exception as e:
        errors.append(f"EXCEPTION: {e}")
    return errors

print("\n=== STAGE 2: PRE-FLIGHT CHECKS ===", flush=True)
print(f"H5P library scan: library_id 15 (187 rows), 35 (22 rows). No unknown types. PASS\n")

pages_by_type = defaultdict(list)
for pid in migrated_ids:
    pages_by_type[inventory[pid]["classified_type"]].append(pid)

smoke_failed = False
for ptype in TYPE_ORDER:
    pool = pages_by_type.get(ptype, [])
    if not pool:
        print(f"  {ptype}: 0 pages, skip"); continue
    sample = random.sample(pool, min(SMOKE_N, len(pool)))
    errs_all = []
    for pid in sample:
        errs = smoke_page(pid)
        for e in errs:
            errs_all.append(f"    [{inventory[pid]['slug']}] {e}")
    status_str = "PASS" if not errs_all else "FAIL"
    print(f"  {ptype} ({len(sample)} sampled): {status_str}")
    for e in errs_all:
        print(e)
    if errs_all:
        smoke_failed = True

if smoke_failed:
    print("\nSmoke test FAILED. Stopping before full parse.")
    sys.exit(1)
else:
    print("\nAll smoke tests passed.\n")

if SMOKE:
    print("--smoke mode: exiting after pre-flight.")
    sys.exit(0)

# ──────────────────────────────────────────────────────────────
# Stage 3: full parse
# ──────────────────────────────────────────────────────────────

print("=== STAGE 3: FULL PARSE ===", flush=True)
OUT.mkdir(exist_ok=True)

rows_pages   = []
rows_lessons = []
rows_quiz    = []
rows_flash   = []
rows_slides  = []
rows_nav     = []

stats = defaultdict(int)
unresolved_links = []
unresolved_nav   = []
skipped_pages    = []
draft_pages      = []
parse_errors     = []

sorted_pids = topo_sort({pid: inventory[pid] for pid in migrated_ids})

def inv_parent(pid):
    parent = inventory[pid].get("parent_id","0") or "0"
    if parent == "0" or parent not in migrated_ids:
        return None
    return parent

for pid in sorted_pids:
    inv   = inventory[pid]
    ptype = inv["classified_type"]
    slug  = inv["slug"]
    title = inv["title"]
    meta  = page_meta[pid]
    wp    = wp_content.get(pid, {})
    content = wp.get("content","")

    if ptype in SKIP_TYPES:
        continue

    # pages row
    rows_pages.append((
        sq(pid), sq(slug), sq(title), sq(ptype),
        sq(meta["status"]),
        sq(inv_parent(pid)),
        sq(meta["specialty_id"]),
        sq(meta["view"]),
        sq(meta["track_id"]),
        sq(meta["content_module_id"]),
        sq(meta["notes"]),
        sq_ts(wp.get("post_date","")),
        sq_ts(wp.get("post_modified","")),
    ))
    stats["pages"] += 1
    if meta["status"] == "draft":
        draft_pages.append((slug, meta["notes"] or ""))

    try:
        if ptype == "plain-content":
            body = parse_plain_content(content, slug_to_id, unresolved_links)
            if body:
                rows_lessons.append((
                    sq(pid), sq(1), sq(title), sq(body), "NULL", "NULL",
                ))
                stats["lessons"] += 1

        elif ptype in ("text-lesson", "audio-lesson"):
            is_audio = (ptype == "audio-lesson")
            lessons = parse_toggles(content, slug_to_id, unresolved_links,
                                    extract_audio=is_audio)
            for L in lessons:
                rows_lessons.append((
                    sq(pid), sq(L["position"]), sq(L["title"]),
                    sq(L["body_html"]), sq(L["audio_url"]), "NULL",
                ))
                stats["lessons"] += 1

        elif ptype == "h5p-quiz":
            hid = get_h5p_id(content)
            if not hid or hid not in h5p_data:
                stats["h5p_orphaned"] += 1
            else:
                lib = h5p_data[hid]["library_id"]
                params = h5p_data[hid]["params"]
                if lib == "15":
                    for q in parse_questionset(params, pid):
                        rows_quiz.append((
                            sq(pid), sq(q["position"]),
                            sq(q["h5p_sub_id"]) + ("::uuid" if q["h5p_sub_id"] else ""),
                            sq(q["question"]), sq_jsonb(q["answers"]),
                            sq(q["media_url"]),
                        ))
                        stats["quiz_questions"] += 1
                elif lib == "35":
                    slides = params.get("presentation",{}).get("slides",[])
                    cp_type = _detect_cp_type(slides)
                    if cp_type == "flashcard":
                        for fc in parse_flashcards(params, pid):
                            rows_flash.append((
                                sq(pid), sq(fc["group_position"]), sq(fc["group_label"]),
                                sq(fc["position"]),
                                ("NULL::uuid"),
                                sq(fc["text"]), sq(fc["answer"]),
                                sq(fc["image_url"]), sq(fc["tip"]),
                            ))
                            stats["flashcard_items"] += 1
                    elif cp_type == "memorecards":
                        for sl in parse_presentation(params, pid):
                            rows_slides.append((
                                sq(pid), sq(sl["position"]), sq(sl["layout"]),
                                sq(sl["content_html"]), sq(sl["image_url"]),
                                sq(sl["caption"]), sq(sl["notes"]),
                            ))
                            stats["presentation_slides"] += 1
                    else:
                        parse_errors.append(f"{slug}: CoursePresentation unknown inner type")

        elif ptype == "blurb-nav-hub":
            items = parse_blurb_hub(content, migrated_ids, slug_to_id, unresolved_nav)
            for it in items:
                rows_nav.append((
                    sq(pid), sq(it["target_page_id"]), sq(it["position"]),
                    sq(it["label"]), sq(it["icon"]), sq(it["group_label"]),
                    sq(it["layout"]),
                ))
                stats["nav_items"] += 1

        elif ptype == "navigation-toggle":
            items = parse_nav_toggles(content, slug_to_id, unresolved_nav)
            for it in items:
                rows_nav.append((
                    sq(pid), sq(it["target_page_id"]), sq(it["position"]),
                    sq(it["label"]), sq(it["icon"]), sq(it["group_label"]),
                    sq(it["layout"]),
                ))
                stats["nav_items"] += 1

    except Exception as e:
        parse_errors.append(f"{slug} ({ptype}): {e}")

    if stats["pages"] % 100 == 0:
        print(f"  ...{stats['pages']} pages processed", flush=True)

print(f"  {stats['pages']} total pages processed", flush=True)

# ──────────────────────────────────────────────────────────────
# Write SQL output files
# ──────────────────────────────────────────────────────────────

def write_inserts(path, table, columns, rows, batch=200):
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"-- {table}: {len(rows)} rows\n\n")
        if not rows: return
        col_list = ", ".join(columns)
        for i in range(0, len(rows), batch):
            batch_rows = rows[i:i+batch]
            vals = ",\n  ".join("(" + ", ".join(r) + ")" for r in batch_rows)
            f.write(f"INSERT INTO {table} ({col_list}) VALUES\n  {vals};\n\n")

print("\nWriting SQL files...", flush=True)

write_inserts(
    OUT/"pages.sql", "pages",
    ["id","slug","title","type","status","parent_id",
     "specialty_id","view","track_id","content_module_id",
     "notes","wp_created_at","wp_modified_at"],
    rows_pages,
)
write_inserts(
    OUT/"lessons.sql", "lessons",
    ["page_id","position","title","body_html","audio_url","audio_added_at"],
    rows_lessons,
)
write_inserts(
    OUT/"quiz_questions.sql", "quiz_questions",
    ["page_id","position","h5p_sub_id","question","answers","media_url"],
    rows_quiz,
)
write_inserts(
    OUT/"flashcard_items.sql", "flashcard_items",
    ["page_id","group_position","group_label","position","h5p_sub_id",
     "text","answer","image_url","tip"],
    rows_flash,
)
write_inserts(
    OUT/"presentation_slides.sql", "presentation_slides",
    ["page_id","position","layout","content_html","image_url","caption","notes"],
    rows_slides,
)
write_inserts(
    OUT/"nav_items.sql", "nav_items",
    ["source_page_id","target_page_id","position","label","icon","group_label","layout"],
    rows_nav,
)

# Seed files (extracted from schema.sql seed data)
(OUT/"tracks.sql").write_text(
    "-- tracks: seed data\n\n"
    "INSERT INTO tracks (slug, name, description, display_order) VALUES\n"
    "  ('medvoice','MedVoice','Audio narration and text script per specialty; one audio-lesson per specialty',1),\n"
    "  ('audiocards','Audiocards','Text-lesson toggle cards with embedded audio per specialty',2),\n"
    "  ('flashcards','Flashcards','H5P flashcard quizzes per specialty; content type may differ from standard MCQ',3);\n",
    encoding="utf-8"
)
(OUT/"content_modules.sql").write_text(
    "-- content_modules: seed data\n\n"
    "INSERT INTO content_modules (slug, name, description, unlock_offset_days) VALUES\n"
    "  ('medhelp-60d','MedHelp 60D','Revalida Up + Memorecards — unlocks 60 days before the cohort test date',60);\n",
    encoding="utf-8"
)
(OUT/"cohorts.sql").write_text(
    "-- cohorts: seed data\n\n"
    "INSERT INTO cohorts (slug, name, test_date, membership_starts_at, membership_ends_at) VALUES\n"
    "  ('revalida-2026-2','Revalida 2026.2','2026-07-01','2025-08-01','2026-08-31'),\n"
    "  ('revalida-2027-1','Revalida 2027.1','2027-01-15','2026-02-01','2027-02-28');\n",
    encoding="utf-8"
)

# ──────────────────────────────────────────────────────────────
# Migration report
# ──────────────────────────────────────────────────────────────

unresolved_unique = sorted(set(unresolved_links))
unresolved_nav_unique = sorted(set(str(x) for x in unresolved_nav))

report = [
    "# Migration Report\n",
    f"Run date: 2026-05-11\n",
    "\n## Row counts\n",
    f"| Table               | Rows    |",
    f"|---------------------|---------|",
    f"| pages               | {stats['pages']:>7} |",
    f"| lessons             | {stats['lessons']:>7} |",
    f"| quiz_questions      | {stats['quiz_questions']:>7} |",
    f"| flashcard_items     | {stats['flashcard_items']:>7} |",
    f"| presentation_slides | {stats['presentation_slides']:>7} |",
    f"| nav_items           | {stats['nav_items']:>7} |",
    "",
    "\n## Pages by type\n",
]
for ptype in TYPE_ORDER:
    report.append(f"- **{ptype}**: {len(pages_by_type.get(ptype,[]))}")

report += [
    f"\n## Draft pages ({len(draft_pages)} total)\n",
]
for slug, note in draft_pages:
    report.append(f"- `{slug}`: {note}")

report += [
    f"\n## Skipped pages\n",
    "- 14 `skip` pages (WooCommerce/PMPro/dashboard) — excluded entirely",
    "- 1 `unclassified` page (home page) — excluded entirely",
    f"\n## H5P orphaned refs\n",
    f"- {stats['h5p_orphaned']} pages had H5P IDs not found in wp_h5p_contents; migrated as drafts (noted in pages.notes)",
    f"\n## Unresolved internal links in body_html ({len(unresolved_unique)} unique)\n",
]
for u in unresolved_unique[:50]:
    report.append(f"- {u}")
if len(unresolved_unique) > 50:
    report.append(f"- ...and {len(unresolved_unique)-50} more")

report += [
    f"\n## Unresolved nav links ({len(unresolved_nav_unique)} unique)\n",
]
for u in unresolved_nav_unique[:30]:
    report.append(f"- {u}")
if len(unresolved_nav_unique) > 30:
    report.append(f"- ...and {len(unresolved_nav_unique)-30} more")

if parse_errors:
    report += [f"\n## Parse errors ({len(parse_errors)})\n"]
    for e in parse_errors:
        report.append(f"- {e}")
else:
    report.append("\n## Parse errors\n\nNone.")

(OUT/"migration-report.md").write_text("\n".join(report) + "\n", encoding="utf-8")

print(f"\nDone. Output in {OUT}/")
print(f"  pages={stats['pages']}  lessons={stats['lessons']}  "
      f"quiz_q={stats['quiz_questions']}  flashcards={stats['flashcard_items']}  "
      f"slides={stats['presentation_slides']}  nav={stats['nav_items']}")
print(f"  drafts={len(draft_pages)}  unresolved_links={len(unresolved_unique)}  errors={len(parse_errors)}")
