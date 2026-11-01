#!/usr/bin/env python3
"""Build the catalogue seed migration from data/materials/*.json.

    python3 -I scripts/materials/build_seed.py [out.sql]

The data files hold facts and links only (no images). The output is one
idempotent SQL file: rows are upserted by (category, brand, model, variant)
and an entry a user edited after import (updated_by set) is never touched.
Run it again after changing the data and put the result in a new migration.

    python3 -I scripts/materials/build_seed.py --size-migration [out.sql]

writes the statements that move the size out of `variant` on catalogue rows
already in a database, from the same split_variant() the seed uses.

    GROUPS_DIR=<dir> python3 -I scripts/materials/build_seed.py --merge-groups
    python3 -I scripts/materials/build_seed.py --groups-migration [out.sql]

the first copies the researched groups (.claude/handoffs/materials-data/groups/*.json)
into data/materials/kayaks.json; the second writes the migration that files every
catalogue model under the groups the data lists. The default output is the full
seed used by api/tests/catalogue_seed.rs (regenerate it after any data change).

    python3 -I scripts/materials/build_seed.py --availability-migration [out.sql]

writes the migration that adds the availability columns and fills them from
data/materials/availability.json (one row per raw model and variant, sizes
share it). Rows are matched by (category, brand, model, variant) after the
same variant split the seed uses; an entry a user edited is never touched.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data", "materials")
# The full seed, kept for the test that proves a re-run changes nothing.
DEFAULT_OUT = os.path.join(ROOT, "api", "tests", "sql", "catalogue_seed.sql")
GROUPS_DIR = os.environ.get("GROUPS_DIR") or os.path.join(ROOT, ".claude", "handoffs", "materials-data", "groups")
MAX_DISCIPLINES = 3

# Brand names before the product suffix was dropped, as the research files
# for the groups still spell them.
OLD_BRANDS = {"Spade Kayaks": "Spade", "Waka Kayaks": "Waka", "Fluid Kayaks": "Fluid",
              "EXO Kayaks": "EXO", "Zet Kayaks": "Zet", "Jackson Kayak": "Jackson",
              "AT Paddles": "AT", "VE Paddles": "VE", "Lendal (Celtic Paddles)": "Lendal"}

# A paddle is filed by use, a boat by the kind of boat (chk_materials_discipline).
DISCIPLINES = {
    "kayak": {"creek", "river_runner", "half_slice", "playboat", "slalom", "downriver",
              "crossover", "freestyle", "other"},
    "paddle": {"whitewater", "freestyle", "slalom", "wildwater", "touring", "canoe", "polo",
               "other"},
}
CONSTRUCTIONS = {"plastic", "composite", "inflatable", "folding", "wood"}
SHAFTS = {"straight", "bent", "cranked"}
SHAFT_MATERIALS = {"carbon", "fiberglass", "aluminium", "wood", "plastic", "hybrid"}

# Ceilings of chk_materials_ceiling / chk_materials_paddle.
CEILINGS = {"length_cm": 2000, "width_cm": 500, "height_cm": 500, "volume_l": 2000,
            "weight_kg": 500, "cockpit_length_cm": 500, "cockpit_width_cm": 500,
            "paddler_weight_min_kg": 500, "paddler_weight_max_kg": 500,
            "blade_area_cm2": 2000, "blade_length_cm": 200, "blade_width_cm": 200,
            "length_min_cm": 400, "length_max_cm": 400}

# A year that rests on one of these is shown as approximate.
WEAK_HOSTS = ("playak.com", "web.archive.org")
WEAK_WORDS = re.compile(r"archive|playak|snippet|search (summary|result)|listing year|"
                        r"verify|conflict|disagree|unclear|uncertain|may be earlier|"
                        r"lower bound|bulk-import", re.I)

COLUMNS = ["category", "brand", "model", "variant", "size", "disciplines", "construction",
           "year_from", "year_to", "year_approximate", "length_cm", "width_cm", "height_cm",
           "volume_l", "weight_kg", "cockpit_length_cm", "cockpit_width_cm",
           "paddler_weight_min_kg", "paddler_weight_max_kg", "product_url", "colors",
           "sources", "notes", "editor_note", "blade_area_cm2", "blade_length_cm", "blade_width_cm",
           "length_min_cm", "length_max_cm", "lengths_cm", "pieces", "shaft",
           "shaft_material", "blade_material", "feather_deg", "shaft_diameter"]
SQL_TYPES = {
    "category": "material_category", "disciplines": "material_discipline[]",
    "construction": "material_construction", "shaft": "paddle_shaft",
    "shaft_material": "paddle_shaft_material", "year_from": "int", "year_to": "int",
    "year_approximate": "boolean", "colors": "text[]", "sources": "jsonb",
    "lengths_cm": "double precision[]", "feather_deg": "int[]", "pieces": "int",
    "images": "jsonb",
}


def sql_type(col):
    if col in SQL_TYPES:
        return SQL_TYPES[col]
    if col in CEILINGS:
        return "double precision"
    return "text"


def host_of(url):
    m = re.match(r"https://([^/?#:@]+)", url or "")
    return m.group(1).lower() if m else None


def num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def add_note(e, text):
    e["notes"] = (e["notes"] + " " if e["notes"] else "") + text


# A label that is only a size. Dagger writes SM/MD/LG for S/M/L, and the
# range labels (S/M, M/L) are sizes in their own right.
SIZE_LABELS = {
    "xs": "XS", "s": "S", "small": "S", "sm": "S",
    "m": "M", "medium": "M", "md": "M",
    "l": "L", "large": "L", "lg": "L",
    "xl": "XL",
    "s/m": "S/M", "sm/md": "S/M", "m/l": "M/L", "md/lg": "M/L",
    "m|l": "M/L", "medium/large": "M/L",
}
# Paddle labels stay builds, so only the plain single sizes move there.
PADDLE_SIZES = {"XS", "S", "M", "L", "XL"}
# A number with the year it was sold in brackets: "7.5 (2005)".
SIZE_YEAR = re.compile(r"^(\d+(?:\.\d+)?) \((\d{4})\)$")


def split_variant(category, variant):
    """Split the free-text variant of an entry into (size, variant).

    A size (S, Medium, SM/MD, 7.5 (2005)) moves to `size` in its short form;
    what is left, an edition or a build, stays in `variant`. Anything not
    plainly a size is left alone, so "L creek" or "Medium 648" keep their label.

    >>> split_variant("kayak", "Medium")
    ('M', None)
    >>> split_variant("kayak", "SM/MD")
    ('S/M', None)
    >>> split_variant("kayak", "M|L")
    ('M/L', None)
    >>> split_variant("kayak", "8.5 (2005)")
    ('8.5', '2005')
    >>> split_variant("kayak", "PR-X")
    (None, 'PR-X')
    >>> split_variant("kayak", "L creek")
    (None, 'L creek')
    >>> split_variant("kayak", "65")
    ('65', None)
    >>> split_variant("kayak", "2005")
    (None, '2005')
    >>> split_variant("paddle", "L")
    ('L', None)
    >>> split_variant("paddle", "Large 703")
    (None, 'Large 703')
    >>> split_variant("paddle", "1 piece, bent shaft")
    (None, '1 piece, bent shaft')
    >>> split_variant("kayak", None)
    (None, None)
    """
    label = (variant or "").strip()
    if not label:
        return None, None
    if category == "paddle":
        size = SIZE_LABELS.get(label.lower())
        return (size, None) if size in PADDLE_SIZES else (None, label)
    size = SIZE_LABELS.get(label.lower())
    if size:
        return size, None
    if re.fullmatch(r"\d{1,3}(?:\.\d+)?", label):
        return label, None
    m = SIZE_YEAR.match(label)
    if m:
        return m.group(1), m.group(2)
    return None, label


def clean_common(e, out, category):
    out["category"] = category
    out["brand"] = (e["brand"] or "").strip()[:80]
    out["model"] = (e["model"] or "").strip()[:80]
    size, variant = split_variant(category, e.get("variant"))
    out["variant"] = variant[:80] if variant else None
    out["size"] = size[:40] if size else None
    out["notes"] = (e.get("notes") or "").strip()

    groups = []
    for v in e.get("disciplines") or []:
        if v in DISCIPLINES[category] and v not in groups:
            groups.append(v)
        else:
            add_note(out, f"disciplines as published: {v}.")
    out["disciplines"] = groups[:MAX_DISCIPLINES] or ["other"]

    for field, allowed in (("construction", CONSTRUCTIONS),
                           ("shaft", SHAFTS), ("shaft_material", SHAFT_MATERIALS)):
        v = e.get(field)
        if v is None or field not in e:
            out[field] = None
        elif v in allowed:
            out[field] = v
        else:
            out[field] = None
            add_note(out, f"{field} as published: {v}.")

    for field, ceiling in CEILINGS.items():
        if field not in e and field != "weight_kg":
            continue
        v = e.get(field)
        if v is None:
            out[field] = None
        elif num(v) and 0 < v <= ceiling:
            out[field] = v
        else:
            out[field] = None
            add_note(out, f"{field} as published: {v}.")

    for field in ("year_from", "year_to"):
        v = e.get(field)
        if v is None:
            out[field] = None
        elif isinstance(v, int) and 1900 <= v <= 2100:
            out[field] = v
        else:
            out[field] = None
            add_note(out, f"{field} as published: {v}.")
    if out["year_from"] and out["year_to"] and out["year_to"] < out["year_from"]:
        add_note(out, f"year_to as published: {out['year_to']}.")
        out["year_to"] = None

    sources = {k: v for k, v in (e.get("sources") or {}).items()
               if isinstance(v, str) and re.match(r"https?://", v) and len(v) <= 500}
    out["sources"] = sources or None
    year_src = sources.get("year_from") or ""
    notes_year = [s for s in re.split(r"[;.]\s", out["notes"])
                  if re.search(r"year", s, re.I) and WEAK_WORDS.search(s)]
    out["year_approximate"] = bool(
        out["year_from"] and (host_of(year_src) in WEAK_HOSTS or
                              any(host_of(year_src) == h or (host_of(year_src) or "").endswith("." + h)
                                  for h in WEAK_HOSTS) or notes_year))

    url = e.get("product_url")
    out["product_url"] = url if url and re.match(r"https?://", url) and len(url) <= 500 else None

    colors = []
    for c in e.get("colors") or []:
        c = c.strip()[:80] if isinstance(c, str) else ""
        if c and c not in colors:
            colors.append(c)
    out["colors"] = colors[:40]

    images, seen = [], set()
    for im in e.get("images") or []:
        u, p = (im or {}).get("url") or "", (im or {}).get("page_url") or ""
        if (u.startswith("https://") and len(u) <= 1000 and re.match(r"https?://", p)
                and len(p) <= 1000 and host_of(u) and u not in seen):
            seen.add(u)
            images.append({"url": u, "page_url": p, **({"batch": im["batch"]} if im.get("batch") else {})})
    out["images"] = images


def kayak(e):
    out = {}
    clean_common(e, out, "kayak")
    a, b = out["paddler_weight_min_kg"], out["paddler_weight_max_kg"]
    if a is not None and b is not None and b < a:
        add_note(out, f"paddler_weight_max_kg as published: {b}.")
        out["paddler_weight_max_kg"] = None
    return out


def paddle(e):
    out = {}
    e = dict(e)
    g = e.get("weight_g")
    e["weight_kg"] = round(g / 1000, 3) if num(g) and g > 0 else None
    clean_common(e, out, "paddle")
    out["weight_kg"] = e["weight_kg"] if e["weight_kg"] and e["weight_kg"] <= 500 else None
    out["blade_material"] = (e.get("blade_material") or "").strip()[:80] or None
    d = e.get("shaft_diameter")
    out["shaft_diameter"] = (str(d).strip()[:40] or None) if d is not None else None
    out["pieces"] = e["pieces"] if isinstance(e.get("pieces"), int) and 1 <= e["pieces"] <= 8 else None
    out["lengths_cm"] = [x for x in (e.get("lengths_cm") or []) if num(x) and 0 < x <= 400][:20] or None
    out["feather_deg"] = [int(x) for x in (e.get("feather_deg") or [])
                          if num(x) and 0 <= x <= 360][:12] or None
    lo, hi = out["length_min_cm"], out["length_max_cm"]
    if lo is not None and hi is not None and hi < lo:
        add_note(out, f"length_max_cm as published: {hi}.")
        out["length_max_cm"] = None
    return out


def both_shafts(e):
    """True when a straight-shaft entry says the model also comes bent."""
    if e.get("shaft") != "straight":
        return False
    text = (e.get("variant") or "") + " " + (e.get("notes") or "")
    return bool(re.search(r"(straight|bent|cranked?|ergo)[^.;]{0,40}\b(or|and|/)\b[^.;]{0,40}"
                          r"(bent|cranked?|ergo|straight)", text, re.I))


def split_paddles(entries):
    out = []
    for e in entries:
        if not both_shafts(e):
            out.append(e)
            continue
        text = (e.get("variant") or "") + " " + (e.get("notes") or "")
        other = "cranked" if re.search(r"crank", text, re.I) else "bent"
        straight = dict(e)
        second = dict(e)
        straight["variant"] = ", ".join(x for x in (e.get("variant"), "straight") if x)
        second["variant"] = ", ".join(x for x in (e.get("variant"), other) if x)
        second["shaft"] = other
        # Weight and angles were stated for the straight shaft only.
        second["weight_g"] = None
        second["notes"] = ((e.get("notes") or "") + " Shaft type listed as an alternative of the "
                           "straight model; weight not stated for it.").strip()
        out += [straight, second]
    return out


def identity(row):
    return (row["category"], row["brand"].lower(), row["model"].lower(), (row["variant"] or "").lower(),
            (row["size"] or "").lower())


def legacy_labels():
    """Every (category, variant) as the first seed stored it, with the split."""
    with open(os.path.join(DATA, "kayaks.json"), encoding="utf-8") as fh:
        kayaks = json.load(fh)
    with open(os.path.join(DATA, "paddles.json"), encoding="utf-8") as fh:
        paddles = split_paddles(json.load(fh))
    labels = {("kayak", (e.get("variant") or "").strip()) for e in kayaks}
    labels |= {("paddle", (e.get("variant") or "").strip()) for e in paddles}
    return sorted(l for l in labels if l[1])


def model_key(row):
    return (row["category"], row["brand"].lower(), row["model"].lower(), (row["variant"] or "").lower())


def model_availability():
    """One availability per model of the seed.

    The research has a row per model and variant as the data files spell
    them. A model is current if any of its rows is, discontinued if all are,
    otherwise unknown; year_to is the latest the research states.
    """
    with open(os.path.join(DATA, "availability.json"), encoding="utf-8") as fh:
        research = {(r["brand"].lower(), r["model"].lower(), (r["variant"] or "").lower()): r
                    for r in json.load(fh)}
    with open(os.path.join(DATA, "kayaks.json"), encoding="utf-8") as fh:
        kayaks = [("kayak", e) for e in json.load(fh)]
    with open(os.path.join(DATA, "paddles.json"), encoding="utf-8") as fh:
        paddles = [("paddle", e) for e in json.load(fh)]
    found = {}
    for category, e in kayaks + paddles:
        r = research.get((e["brand"].lower(), e["model"].lower(), (e.get("variant") or "").lower()))
        if r is None:
            raise SystemExit(f"no availability row for {category} {e['brand']} {e['model']} "
                             f"{e.get('variant')}")
        for split in split_paddles([e]) if category == "paddle" else [e]:
            row = kayak(split) if category == "kayak" else paddle(split)
            found.setdefault(model_key(row), (row, []))[1].append(r)
    out = []
    for row, rs in found.values():
        statuses = {r["status"] for r in rs}
        status = ("current" if "current" in statuses
                  else "discontinued" if statuses == {"discontinued"} else "unknown")
        pick = next(r for r in rs if r["status"] == status) if status != "unknown" else rs[0]
        years = [r["year_to"] for r in rs if r["status"] == "discontinued" and r["year_to"]]
        out.append({"category": row["category"], "brand": row["brand"], "model": row["model"],
                    "variant": row["variant"], "availability": status,
                    "availability_source": pick["source"][:500],
                    "availability_checked": pick["checked"],
                    "year_to": max(years) if status == "discontinued" and years else None})
    return out


def render_availability_migration():
    payload = json.dumps(model_availability(), ensure_ascii=False, separators=(",", ":"))
    if "$seed$" in payload:
        raise SystemExit("payload contains the dollar-quote tag")
    return f"""-- Generated by scripts/materials/build_seed.py --availability-migration from
-- data/materials/availability.json. Idempotent; entries a user edited
-- (updated_by set) are left alone. Every size of a model gets the model's status.

CREATE TYPE material_availability AS ENUM ('current', 'discontinued', 'unknown');

ALTER TABLE materials
    ADD COLUMN availability material_availability NOT NULL DEFAULT 'unknown',
    ADD COLUMN availability_source TEXT,
    ADD COLUMN availability_checked DATE,
    ADD CONSTRAINT chk_materials_availability_source CHECK (
        availability_source IS NULL
        OR (length(availability_source) <= 500 AND availability_source ~ '^https?://')
    );

CREATE INDEX idx_materials_availability ON materials (availability);

CREATE TEMP TABLE seed_availability ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset($seed${payload}$seed$::jsonb) AS s(
    category material_category, brand text, model text, variant text,
    availability material_availability, availability_source text,
    availability_checked date, year_to int
);

UPDATE materials m SET
    availability = s.availability,
    availability_source = s.availability_source,
    availability_checked = s.availability_checked,
    year_to = CASE WHEN m.year_to IS NULL AND s.year_to IS NOT NULL
                        AND (m.year_from IS NULL OR s.year_to >= m.year_from)
                   THEN s.year_to ELSE m.year_to END
FROM seed_availability s
WHERE m.category = s.category
  AND lower(btrim(m.brand)) = lower(btrim(s.brand))
  AND lower(btrim(m.model)) = lower(btrim(s.model))
  AND lower(btrim(COALESCE(m.variant, ''))) = lower(btrim(COALESCE(s.variant, '')))
  AND m.created_by = 'system-catalogue'
  AND m.updated_by IS NULL
  AND (m.availability, m.availability_source, m.availability_checked, m.year_to)
      IS DISTINCT FROM (s.availability, s.availability_source, s.availability_checked,
          CASE WHEN m.year_to IS NULL AND s.year_to IS NOT NULL
                    AND (m.year_from IS NULL OR s.year_to >= m.year_from)
               THEN s.year_to ELSE m.year_to END);

DO $$
DECLARE missing int;
BEGIN
    SELECT COUNT(*) INTO missing FROM seed_availability s
    WHERE NOT EXISTS (
        SELECT 1 FROM materials m
        WHERE m.category = s.category
          AND lower(btrim(m.brand)) = lower(btrim(s.brand))
          AND lower(btrim(m.model)) = lower(btrim(s.model))
          AND lower(btrim(COALESCE(m.variant, ''))) = lower(btrim(COALESCE(s.variant, ''))));
    RAISE NOTICE 'availability rows matching no entry: %', missing;
END $$;
"""


def sql_text(v):
    return "NULL" if v is None else "'" + v.replace("'", "''") + "'"


def render_size_migration():
    """UPDATE for catalogue rows whose variant holds a size, keyed by label.

    Only untouched imports move (updated_by IS NULL): a user's edit keeps the
    variant it was saved with.
    """
    moves = []
    for category, label in legacy_labels():
        size, variant = split_variant(category, label)
        if (size, variant) != (None, label):
            moves.append((category, label, size, variant))
    values = ",\n    ".join(
        f"('{c}'::material_category, {sql_text(old)}, {sql_text(size)}, {sql_text(variant)})"
        for c, old, size, variant in moves)
    return f"""-- Generated by scripts/materials/build_seed.py --size-migration.
-- Moves the size out of `variant` on imported rows that no user has edited.

UPDATE materials m SET size = v.size, variant = v.variant
FROM (VALUES
    {values}
) AS v(category, old_variant, size, variant)
WHERE m.category = v.category
  AND m.variant = v.old_variant
  AND m.created_by = 'system-catalogue'
  AND m.updated_by IS NULL;
"""


def build():
    rows = []
    with open(os.path.join(DATA, "kayaks.json"), encoding="utf-8") as fh:
        rows += [kayak(e) for e in json.load(fh)]
    with open(os.path.join(DATA, "paddles.json"), encoding="utf-8") as fh:
        rows += [paddle(e) for e in split_paddles(json.load(fh))]
    # Research notes are for editors; the public note stays empty on imports.
    for r in rows:
        r["editor_note"] = r["notes"]
        r["notes"] = None
    seen = {}
    for r in rows:
        k = identity(r)
        if k in seen:
            raise SystemExit(f"duplicate entry {k}: fix the data, the seed would hide one")
        seen[k] = r
    return rows


def render(rows):
    # Photos added later carry a batch tag and ship in their own migration.
    rows = [{**r, "images": [i for i in r["images"] if "batch" not in i]} for r in rows]
    cols = COLUMNS + ["images"]
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    if "$seed$" in payload:
        raise SystemExit("payload contains the dollar-quote tag")
    coldefs = ",\n    ".join(f"{c} {sql_type(c)}" for c in cols)
    insert_cols = ", ".join(COLUMNS)
    select_cols = ", ".join(COLUMNS)
    updates = ",\n    ".join(f"{c} = EXCLUDED.{c}" for c in COLUMNS
                             if c not in ("category", "brand", "model", "variant", "size"))
    ident = ("category, lower(btrim(brand)), lower(btrim(model)), "
             "lower(btrim(COALESCE(variant, ''))), lower(btrim(COALESCE(size, '')))")
    old = ", ".join(f"materials.{c}" for c in COLUMNS)
    new = ", ".join(f"EXCLUDED.{c}" for c in COLUMNS)
    return f"""-- Generated by scripts/materials/build_seed.py from data/materials/*.json.
-- Do not edit by hand. Idempotent: rows are upserted by identity, an entry a
-- user edited (updated_by set) is left alone, and re-running changes nothing.

CREATE TEMP TABLE seed_catalogue ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset($seed${payload}$seed$::jsonb) AS s(
    {coldefs}
);

INSERT INTO materials ({insert_cols}, created_by)
SELECT {select_cols}, 'system-catalogue' FROM seed_catalogue
ON CONFLICT ({ident}) DO UPDATE SET
    {updates},
    updated_at = NOW()
WHERE materials.created_by = 'system-catalogue'
  AND materials.updated_by IS NULL
  AND ({old}) IS DISTINCT FROM ({new});

INSERT INTO material_images (material_id, source_url, host, page_url, credit)
SELECT m.id, i->>'url', lower(substring(i->>'url' from '^https://([^/?#:@]+)')),
       i->>'page_url', s.brand
FROM seed_catalogue s
CROSS JOIN LATERAL jsonb_array_elements(s.images) AS i
JOIN materials m ON m.category = s.category
    AND lower(btrim(m.brand)) = lower(btrim(s.brand))
    AND lower(btrim(m.model)) = lower(btrim(s.model))
    AND lower(btrim(COALESCE(m.variant, ''))) = lower(btrim(COALESCE(s.variant, '')))
    AND lower(btrim(COALESCE(m.size, ''))) = lower(btrim(COALESCE(s.size, '')))
ON CONFLICT (material_id, source_url) DO NOTHING;
"""


def merge_groups():
    """Copy the researched groups from GROUPS_DIR into data/materials/kayaks.json.

    A research row names a model by its brand (old or new spelling), model and
    variant as the data file spells them. Its groups replace the entry's list,
    primary first. Returns (merged entries, rows that matched no entry).
    """
    path = os.path.join(DATA, "kayaks.json")
    with open(path, encoding="utf-8") as fh:
        kayaks = json.load(fh)
    by_key = {}
    for e in kayaks:
        by_key.setdefault((e["brand"].lower(), e["model"].lower(), (e["variant"] or "").lower()),
                          []).append(e)
    merged, unmatched = 0, []
    for name in sorted(os.listdir(GROUPS_DIR)):
        if not name.endswith(".json"):
            continue
        with open(os.path.join(GROUPS_DIR, name), encoding="utf-8") as fh:
            rows = json.load(fh)
        for r in rows:
            groups = []
            for g in r["groups"]:
                if g not in DISCIPLINES["kayak"]:
                    raise SystemExit(f"{name}: unknown group {g} for {r['brand']} {r['model']}")
                if g not in groups:
                    groups.append(g)
            if not 1 <= len(groups) <= MAX_DISCIPLINES:
                raise SystemExit(f"{name}: {r['brand']} {r['model']} needs 1-{MAX_DISCIPLINES} groups")
            brand = OLD_BRANDS.get(r["brand"], r["brand"])
            hits = by_key.get((brand.lower(), r["model"].lower(), (r.get("variant") or "").lower()))
            if not hits:
                unmatched.append((name, r["brand"], r["model"], r.get("variant")))
                continue
            for e in hits:
                e["disciplines"] = groups
                merged += 1
                # A weakly sourced grouping keeps its caveat on the entry.
                note = f"Groups: {r['note'].strip()}"
                if r["note"].lower().startswith("weak") and note not in (e.get("notes") or ""):
                    e["notes"] = ((e.get("notes") or "") + " " + note).strip()
    # The sizes of a model share its groups: each gets the union, in order.
    models = {}
    for e in kayaks:
        models.setdefault((e["brand"].lower(), e["model"].lower(),
                           (split_variant("kayak", e["variant"])[1] or "").lower()), []).append(e)
    for entries in models.values():
        union = []
        for e in entries:
            union += [g for g in e["disciplines"] if g not in union]
        for e in entries:
            e["disciplines"] = union[:MAX_DISCIPLINES]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(kayaks, indent=1, ensure_ascii=False) + "\n")
    return merged, unmatched


def render_groups_migration():
    """Set the groups of every catalogue entry from the data files.

    The notes go with them: a weakly sourced grouping keeps its caveat there.
    Only untouched catalogue rows change, so a user's edit stands and a
    re-run is a no-op.
    """
    entries = [{"category": r["category"], "brand": r["brand"], "model": r["model"],
                "variant": r["variant"], "size": r["size"], "disciplines": r["disciplines"],
                "notes": r["notes"]} for r in build()]
    payload = json.dumps(entries, ensure_ascii=False, separators=(",", ":"))
    if "$seed$" in payload:
        raise SystemExit("payload contains the dollar-quote tag")
    return f"""-- Generated by scripts/materials/build_seed.py --groups-migration from
-- data/materials/*.json. Files each catalogue model under every group its maker
-- lists it in, primary first. Idempotent; entries a user edited (updated_by set)
-- are left alone.

WITH seed AS (
    SELECT * FROM jsonb_to_recordset($seed${payload}$seed$::jsonb) AS s(
        category material_category, brand text, model text, variant text, size text,
        disciplines material_discipline[], notes text
    )
)
UPDATE materials m SET disciplines = s.disciplines, notes = s.notes, updated_at = NOW()
FROM seed s
WHERE m.category = s.category
  AND lower(btrim(m.brand)) = lower(btrim(s.brand))
  AND lower(btrim(m.model)) = lower(btrim(s.model))
  AND lower(btrim(COALESCE(m.variant, ''))) = lower(btrim(COALESCE(s.variant, '')))
  AND lower(btrim(COALESCE(m.size, ''))) = lower(btrim(COALESCE(s.size, '')))
  AND m.created_by = 'system-catalogue'
  AND m.updated_by IS NULL
  AND (m.disciplines, m.notes) IS DISTINCT FROM (s.disciplines, s.notes);
"""


def render_photo_migration(batch):
    """Pending material_images rows for the photos tagged `batch` in the data.

    Every size row of a model gets the model's photos; a model that already has
    any image is skipped, so a re-run inserts nothing.
    """
    items = []
    for r in build():
        imgs = [i for i in r["images"] if i.get("batch") == batch]
        if imgs:
            items.append({"category": r["category"], "brand": r["brand"], "model": r["model"],
                          "variant": r["variant"], "size": r["size"], "images": imgs})
    payload = json.dumps(items, ensure_ascii=False, separators=(",", ":"))
    if "$seed$" in payload:
        raise SystemExit("payload contains the dollar-quote tag")
    return f"""-- Generated by scripts/materials/build_seed.py --photo-migration {batch}.
-- Queues product photo links for the mirror job. Every size of a model gets the
-- model's photos; a model that already has an image is skipped, so re-running
-- inserts nothing. The mirror allowlist is the set of hosts in this table, so
-- the new hosts join it with these rows.

WITH seed AS (
    SELECT * FROM jsonb_to_recordset($seed${payload}$seed$::jsonb) AS s(
        category material_category, brand text, model text, variant text, size text,
        images jsonb
    )
), target AS (
    SELECT m.id AS material_id, s.brand, s.images
    FROM seed s
    JOIN materials m ON m.category = s.category
        AND lower(btrim(m.brand)) = lower(btrim(s.brand))
        AND lower(btrim(m.model)) = lower(btrim(s.model))
        AND lower(btrim(COALESCE(m.variant, ''))) = lower(btrim(COALESCE(s.variant, '')))
        AND lower(btrim(COALESCE(m.size, ''))) = lower(btrim(COALESCE(s.size, '')))
        AND m.created_by = 'system-catalogue'
    WHERE NOT EXISTS (
        SELECT 1 FROM materials o
        JOIN material_images oi ON oi.material_id = o.id
        WHERE o.category = m.category
          AND lower(btrim(o.brand)) = lower(btrim(m.brand))
          AND lower(btrim(o.model)) = lower(btrim(m.model))
          AND lower(btrim(COALESCE(o.variant, ''))) = lower(btrim(COALESCE(m.variant, '')))
    )
)
INSERT INTO material_images (material_id, source_url, host, page_url, credit)
SELECT t.material_id, i->>'url', lower(substring(i->>'url' from '^https://([^/?#:@]+)')),
       i->>'page_url', t.brand
FROM target t
CROSS JOIN LATERAL jsonb_array_elements(t.images) AS i
ON CONFLICT (material_id, source_url) DO NOTHING;
"""


def main():
    if sys.argv[1:2] == ["--merge-groups"]:
        merged, unmatched = merge_groups()
        print("entries updated:", merged, "unmatched research rows:", len(unmatched))
        for u in unmatched:
            print("  unmatched:", u)
        return
    if sys.argv[1:2] == ["--groups-migration"]:
        sql = render_groups_migration()
        if len(sys.argv) < 3:
            sys.stdout.write(sql)
        else:
            open(sys.argv[2], "w", encoding="utf-8").write(sql)
        return
    if sys.argv[1:2] == ["--photo-migration"]:
        sql = render_photo_migration(sys.argv[2])
        if len(sys.argv) < 4:
            sys.stdout.write(sql)
        else:
            open(sys.argv[3], "w", encoding="utf-8").write(sql)
        return
    if sys.argv[1:2] == ["--size-migration"]:
        sys.stdout.write(render_size_migration()) if len(sys.argv) < 3 else open(
            sys.argv[2], "w", encoding="utf-8").write(render_size_migration())
        return
    if sys.argv[1:2] == ["--availability-migration"]:
        sql = render_availability_migration()
        if len(sys.argv) < 3:
            sys.stdout.write(sql)
        else:
            open(sys.argv[2], "w", encoding="utf-8").write(sql)
        return
    out = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    rows = build()
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(render(rows))
    kinds = {}
    for r in rows:
        kinds[r["category"]] = kinds.get(r["category"], 0) + 1
    print(kinds, "images:", sum(len(r["images"]) for r in rows),
          "approximate years:", sum(r["year_approximate"] for r in rows))


if __name__ == "__main__":
    main()
