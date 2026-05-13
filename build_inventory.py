"""
build_inventory.py
Reads the UpdraftPlus SQL dump and produces page-inventory.csv.

Classification rules (applied in priority order):
  skip          – WooCommerce pages, PMPro pages, mhs_welcome_bar/mhs_updates_ticker
  audio-lesson  – content contains [zoomsounds_player]
  h5p-quiz      – content contains <iframe data-content-id or [h5p id=
  text-lesson   – has toggles (et_pb_toggle) but no audio/h5p
  navigation-toggle – toggles whose inner text is only <a> links (no body prose)
  blurb-nav-hub – contains et_pb_blurb with post_link_url_page
  plain-content – only et_pb_text modules, no toggles/quizzes/nav
  unclassified  – anything else
"""

import csv
import re
import sys
from pathlib import Path

SQL_PATH  = Path(r"c:\Users\jrazm\claudebuilds\medhelpspace\db.sql")
CSV_PATH  = Path(r"c:\Users\jrazm\claudebuilds\medhelpspace\page-inventory.csv")

# ---------------------------------------------------------------------------
# 1. SQL streaming parser – pulls INSERT rows for a given table
# ---------------------------------------------------------------------------

def stream_table_rows(sql_path: Path, table: str):
    """
    Yields each row tuple (as a list of raw SQL-value strings) from
    INSERT INTO `table` … statements, handling multi-row INSERTs.
    """
    in_table = False
    buf = ""
    target = f"INSERT INTO `{table}`"

    with sql_path.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            stripped = line.rstrip()  # strip all trailing whitespace incl. spaces before \n
            if stripped.startswith(target):
                in_table = True
                buf = ""

            if in_table:
                buf += stripped
                if stripped.endswith(";"):
                    # extract the VALUES(…) block
                    m = re.search(r"VALUES\s*(.*);", buf, re.DOTALL)
                    if m:
                        values_str = m.group(1).strip()
                        for row in split_rows(values_str):
                            yield parse_row(row)
                    in_table = False
                    buf = ""


def split_rows(values_str: str):
    """Split '(…),(…),(…)' into individual row strings, respecting quotes."""
    rows = []
    depth = 0
    current = []
    in_str = False
    escape = False
    start = None

    i = 0
    while i < len(values_str):
        c = values_str[i]
        if escape:
            current.append(c)
            escape = False
        elif c == "\\" and in_str:
            current.append(c)
            escape = True
        elif c == "'" and not escape:
            in_str = not in_str
            current.append(c)
        elif not in_str:
            if c == "(":
                if depth == 0:
                    current = ["("]
                else:
                    current.append(c)
                depth += 1
            elif c == ")":
                depth -= 1
                current.append(c)
                if depth == 0:
                    rows.append("".join(current))
                    current = []
            elif c == "," and depth == 0:
                pass  # separator between rows
            else:
                current.append(c)
        else:
            current.append(c)
        i += 1

    return rows


def parse_row(row_str: str):
    """
    Parse one SQL row '(val1,val2,…)' into a Python list of strings.
    Handles NULL, integers, quoted strings with escape sequences.
    """
    inner = row_str[1:-1]  # strip outer parens
    values = []
    i = 0
    while i < len(inner):
        c = inner[i]
        if inner[i:i+4] == "NULL":
            values.append(None)
            i += 4
            if i < len(inner) and inner[i] == ",":
                i += 1
        elif c == "'":
            # quoted string
            j = i + 1
            buf = []
            while j < len(inner):
                ch = inner[j]
                if ch == "\\" :
                    if j + 1 < len(inner):
                        nxt = inner[j+1]
                        esc = {"n": "\n", "r": "\r", "t": "\t", "'": "'",
                               "\\": "\\", '"': '"', "0": "\0"}.get(nxt, nxt)
                        buf.append(esc)
                        j += 2
                    else:
                        buf.append(ch)
                        j += 1
                elif ch == "'":
                    if j + 1 < len(inner) and inner[j+1] == "'":
                        buf.append("'")
                        j += 2
                    else:
                        j += 1  # end of string
                        break
                else:
                    buf.append(ch)
                    j += 1
            values.append("".join(buf))
            i = j
            if i < len(inner) and inner[i] == ",":
                i += 1
        else:
            # number or unquoted value
            j = i
            while j < len(inner) and inner[j] not in (",",):
                j += 1
            values.append(inner[i:j])
            i = j
            if i < len(inner) and inner[i] == ",":
                i += 1
    return values


# ---------------------------------------------------------------------------
# 2. Load wp_posts – pages only
# ---------------------------------------------------------------------------

print("Loading wp_posts …", flush=True)

# Column positions in wp_posts (standard WP schema):
# 0=ID, 1=post_author, 2=post_date, 3=post_date_gmt,
# 4=post_content, 5=post_title, 6=post_excerpt, 7=post_status,
# 8=comment_status, 9=ping_status, 10=post_password,
# 11=post_name (slug), 12=to_ping, 13=pinged,
# 14=post_modified, 15=post_modified_gmt, 16=post_content_filtered,
# 17=post_parent, 18=guid, 19=menu_order, 20=post_type,
# 21=post_mime_type, 22=comment_count

KEEP_TYPES = {"page", "post"}
KEEP_STATUSES = {"publish", "draft", "private", "pending"}

pages = {}  # id -> dict

for row in stream_table_rows(SQL_PATH, "wp_posts"):
    if len(row) < 22:
        continue
    post_type   = row[20] if row[20] else ""
    post_status = row[7]  if row[7]  else ""
    if post_type not in KEEP_TYPES:
        continue
    if post_status not in KEEP_STATUSES:
        continue

    pid     = row[0]
    content = row[4] or ""
    pages[pid] = {
        "id":        pid,
        "slug":      row[11] or "",
        "title":     row[5]  or "",
        "parent_id": row[17] or "0",
        "status":    post_status,
        "content":   content,
    }

print(f"  {len(pages)} pages/posts loaded", flush=True)

# ---------------------------------------------------------------------------
# 3. Load wp_h5p_contents – just collect which content IDs exist
# ---------------------------------------------------------------------------

print("Loading wp_h5p_contents …", flush=True)

h5p_ids = set()
for row in stream_table_rows(SQL_PATH, "wp_h5p_contents"):
    if row:
        h5p_ids.add(str(row[0]))

print(f"  {len(h5p_ids)} H5P content items found", flush=True)

# ---------------------------------------------------------------------------
# 4. Classify each page
# ---------------------------------------------------------------------------

print("Classifying pages …", flush=True)

# Patterns
RE_ZOOMSOUNDS   = re.compile(r"\[zoomsounds_player", re.I)
RE_H5P_IFRAME   = re.compile(r'<iframe[^>]+data-content-id=', re.I)
RE_H5P_SHORT    = re.compile(r'\[h5p\s+id=', re.I)
RE_TOGGLE       = re.compile(r'et_pb_toggle', re.I)
RE_BLURB        = re.compile(r'et_pb_blurb', re.I)
# Divi encodes dynamic page links as base64 @ET-DC@…@ and marks the attribute
# in _dynamic_attributes="link_option_url" — this is the blurb-nav-hub signal.
RE_BLURB_DYNLINK = re.compile(
    r'\[et_pb_blurb[^\]]*_dynamic_attributes="[^"]*link_option_url', re.I)
# Blurbs with static real-URL links (older Divi pattern for page cards)
RE_BLURB_STATICLINK = re.compile(
    r'\[et_pb_blurb[^\]]*link_option_url="https?://', re.I)
# Blurbs with no link at all (card UI with no href set) — incomplete nav hubs
RE_BLURB_NOLINK = re.compile(
    r'\[et_pb_blurb\b(?![^\]]*link_option_url)', re.I)
RE_WC           = re.compile(r'et_pb_wc_', re.I)
RE_WC_SHOP      = re.compile(r'et_pb_shop\b', re.I)  # WooCommerce product listing
RE_PMPRO        = re.compile(r'\[pmpro_', re.I)
RE_MHS_DASH     = re.compile(r'\[mhs_welcome_bar|\[mhs_updates_ticker', re.I)
RE_TOGGLE_INNER = re.compile(
    r'\[et_pb_toggle[^\]]*\](.*?)\[/et_pb_toggle\]', re.S | re.I)
RE_LINK_ONLY    = re.compile(r'^\s*(<a\b[^>]*>.*?</a>\s*)*\s*$', re.S | re.I)
RE_ALL_MODULES  = re.compile(r'\[et_pb_(\w+)', re.I)
RE_BUNNY        = re.compile(r'medhelpspace\.b-cdn\.net', re.I)

# Modules that are "structural" — their presence alone doesn't make a page unusual
PLAIN_OK_MODULES = {
    "section", "row", "column", "column_inner", "row_inner", "section_inner",
    "text", "heading", "image", "button", "divider", "cta", "video",
    "social_media_follow", "social_media_follow_network", "number_counter",
    "countdown_timer", "testimonial", "icon", "fullwidth_header",
    "fullwidth_image", "fullwidth_map", "map", "search",
    "contact_form", "contact_field", "post_title", "post_content",
    "post_featured_image", "post_slider", "sidebar",
}

# H5P id cross-reference in content
def content_h5p_ids(content):
    found = set()
    for m in RE_H5P_SHORT.finditer(content):
        nm = re.search(r'id=["\']?(\d+)', content[m.start():m.start()+60])
        if nm:
            found.add(nm.group(1))
    for m in RE_H5P_IFRAME.finditer(content):
        nm = re.search(r'data-content-id=["\']?(\d+)', content[m.start():m.start()+120])
        if nm:
            found.add(nm.group(1))
    return found

def classify(content, slug=""):
    if RE_WC.search(content) or RE_WC_SHOP.search(content) or \
       RE_PMPRO.search(content) or RE_MHS_DASH.search(content):
        return "skip"
    if RE_ZOOMSOUNDS.search(content):
        return "audio-lesson"
    if RE_H5P_IFRAME.search(content) or RE_H5P_SHORT.search(content):
        return "h5p-quiz"
    if RE_TOGGLE.search(content):
        toggles = RE_TOGGLE_INNER.findall(content)
        if toggles and all(RE_LINK_ONLY.match(t) for t in toggles):
            return "navigation-toggle"
        return "text-lesson"
    # Divi blurb cards with dynamic page links (@ET-DC@ encoded URL)
    if RE_BLURB_DYNLINK.search(content) or RE_BLURB_STATICLINK.search(content):
        return "blurb-nav-hub"
    # Blurbs present but with no link set → incomplete nav-hub template or non-nav blurb
    if RE_BLURB.search(content):
        # Home page uses blurbs for testimonials — not a nav hub
        if not content.strip() or slug in ("home",):
            return "unclassified"
        # Blurbs without link attributes — incomplete nav hubs, flag for review
        return "blurb-nav-hub"
    # plain-content: any standard Divi layout with no exotic signals
    modules = set(m.lower() for m in RE_ALL_MODULES.findall(content))
    exotic = modules - PLAIN_OK_MODULES
    if not exotic:
        return "plain-content"
    return "unclassified"

rows_out = []
for pid, p in pages.items():
    content = p["content"]

    ctype       = classify(content, slug=p["slug"])
    has_h5p_c   = bool(RE_H5P_IFRAME.search(content) or RE_H5P_SHORT.search(content))
    has_audio   = bool(RE_ZOOMSOUNDS.search(content) or RE_BUNNY.search(content))
    toggle_count= len(re.findall(r'\[et_pb_toggle\b', content, re.I))
    modules_used= ",".join(sorted(set(
        m.lower() for m in RE_ALL_MODULES.findall(content)
    ))) or ""

    # notes
    notes_parts = []
    if ctype == "skip":
        if RE_WC.search(content):
            notes_parts.append("WooCommerce")
        if RE_WC_SHOP.search(content):
            notes_parts.append("WooCommerce-shop-listing")
        if RE_PMPRO.search(content):
            notes_parts.append("PMPro")
        if RE_MHS_DASH.search(content):
            notes_parts.append("mhs-dashboard")
    if ctype == "unclassified":
        if p["slug"] == "home":
            notes_parts.append("homepage-landing-page-not-content")
        elif not content.strip():
            notes_parts.append("empty-content")
        elif p["slug"] in ("paste-page-name-here", "new-page-name-paste-here"):
            notes_parts.append("unfinished-template")
    if ctype == "blurb-nav-hub" and RE_BLURB.search(content) \
       and not RE_BLURB_DYNLINK.search(content) \
       and not RE_BLURB_STATICLINK.search(content):
        notes_parts.append("blurb-cards-links-not-set-incomplete")
    if RE_BUNNY.search(content) and not RE_ZOOMSOUNDS.search(content):
        notes_parts.append("bunny-url-no-player-shortcode")
    if ctype == "text-lesson":
        toggles = RE_TOGGLE_INNER.findall(content)
        mixed = [t for t in toggles if not RE_LINK_ONLY.match(t)]
        link_only = [t for t in toggles if RE_LINK_ONLY.match(t)]
        if mixed and link_only:
            notes_parts.append(f"mixed-toggle-types:{len(link_only)}link+{len(mixed)}prose")
    h5p_ref = content_h5p_ids(content)
    if h5p_ref:
        missing = h5p_ref - h5p_ids
        if missing:
            notes_parts.append(f"h5p-id-missing-from-table:{','.join(sorted(missing))}")
    if p["status"] != "publish":
        notes_parts.append(f"status:{p['status']}")

    rows_out.append({
        "id":                pid,
        "slug":              p["slug"],
        "title":             p["title"],
        "parent_id":         p["parent_id"],
        "classified_type":   ctype,
        "has_h5p":           "1" if has_h5p_c else "0",
        "has_audio":         "1" if has_audio  else "0",
        "toggle_count":      toggle_count,
        "divi_modules_used": modules_used,
        "notes":             "; ".join(notes_parts),
    })

# Sort: skip last, then by slug
ORDER = ["audio-lesson","h5p-quiz","text-lesson","navigation-toggle",
         "blurb-nav-hub","plain-content","unclassified","skip"]
rows_out.sort(key=lambda r: (ORDER.index(r["classified_type"])
                              if r["classified_type"] in ORDER else 99,
                              r["slug"]))

# ---------------------------------------------------------------------------
# 5. Write CSV
# ---------------------------------------------------------------------------

FIELDS = ["id","slug","title","parent_id","classified_type",
          "has_h5p","has_audio","toggle_count","divi_modules_used","notes"]

with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=FIELDS)
    w.writeheader()
    w.writerows(rows_out)

print(f"\nWrote {len(rows_out)} rows to {CSV_PATH}", flush=True)

# ---------------------------------------------------------------------------
# 6. Summary counts
# ---------------------------------------------------------------------------

from collections import Counter
counts = Counter(r["classified_type"] for r in rows_out)
print("\nType breakdown:")
for t in ORDER:
    print(f"  {t:<22} {counts.get(t,0):>5}")
other = {k:v for k,v in counts.items() if k not in ORDER}
for k,v in other.items():
    print(f"  {k:<22} {v:>5}")
print(f"  {'TOTAL':<22} {len(rows_out):>5}")
