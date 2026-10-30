#!/usr/bin/env python3
"""Build the catalogue seed migration from data/materials/*.json.

    python3 -I scripts/materials/build_seed.py [out.sql]

The data files hold facts and links only (no images). The output is one
idempotent SQL file: rows are upserted by (category, brand, model, variant)
and an entry a user edited after import (updated_by set) is never touched.
Run it again after changing the data and put the result in a new migration.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data", "materials")
DEFAULT_OUT = os.path.join(ROOT, "api", "migrations", "0057_materials_catalogue_seed.sql")

DISCIPLINES = {"creek", "river_runner", "half_slice", "playboat", "slalom", "downriver",
               "crossover", "freestyle", "other"}
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

COLUMNS = ["category", "brand", "model", "variant", "discipline", "construction",
           "year_from", "year_to", "year_approximate", "length_cm", "width_cm", "height_cm",
           "volume_l", "weight_kg", "cockpit_length_cm", "cockpit_width_cm",
           "paddler_weight_min_kg", "paddler_weight_max_kg", "product_url", "colors",
           "sources", "notes", "blade_area_cm2", "blade_length_cm", "blade_width_cm",
           "length_min_cm", "length_max_cm", "lengths_cm", "pieces", "shaft",
           "shaft_material", "blade_material", "feather_deg", "shaft_diameter"]
SQL_TYPES = {
    "category": "material_category", "discipline": "material_discipline",
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


def clean_common(e, out, category):
    out["category"] = category
    out["brand"] = (e["brand"] or "").strip()[:80]
    out["model"] = (e["model"] or "").strip()[:80]
    variant = (e.get("variant") or "").strip() or None
    out["variant"] = variant[:80] if variant else None
    out["notes"] = (e.get("notes") or "").strip()

    for field, allowed in (("discipline", DISCIPLINES), ("construction", CONSTRUCTIONS),
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
            images.append({"url": u, "page_url": p})
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
    return (row["category"], row["brand"].lower(), row["model"].lower(), (row["variant"] or "").lower())


def build():
    rows = []
    with open(os.path.join(DATA, "kayaks.json"), encoding="utf-8") as fh:
        rows += [kayak(e) for e in json.load(fh)]
    with open(os.path.join(DATA, "paddles.json"), encoding="utf-8") as fh:
        rows += [paddle(e) for e in split_paddles(json.load(fh))]
    seen = {}
    for r in rows:
        k = identity(r)
        if k in seen:
            raise SystemExit(f"duplicate entry {k}: fix the data, the seed would hide one")
        seen[k] = r
    return rows


def render(rows):
    cols = COLUMNS + ["images"]
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    if "$seed$" in payload:
        raise SystemExit("payload contains the dollar-quote tag")
    coldefs = ",\n    ".join(f"{c} {sql_type(c)}" for c in cols)
    insert_cols = ", ".join(COLUMNS)
    select_cols = ", ".join(COLUMNS)
    updates = ",\n    ".join(f"{c} = EXCLUDED.{c}" for c in COLUMNS
                             if c not in ("category", "brand", "model", "variant"))
    ident = ("category, lower(btrim(brand)), lower(btrim(model)), "
             "lower(btrim(COALESCE(variant, '')))")
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
ON CONFLICT (material_id, source_url) DO NOTHING;
"""


def main():
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
