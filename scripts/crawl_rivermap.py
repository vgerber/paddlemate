#!/usr/bin/env python3
"""
Crawl https://rivermap.org/mobile/ to extract whitewater section data.

Usage:
    pip install requests beautifulsoup4
    python crawl_rivermap.py > sections.json
    python crawl_rivermap.py --regions "Salzkammergut,Karwendel" > sections.json

Output: JSON array of river objects, each containing their sections:
  {
    "name":    "Lammer",
    "region":  "Salzkammergut",
    "country": "AT",
    "sections": [
      {
        "name":        "Lammeröfen",
        "difficulty":  "IV-V",
        "length_km":   2.73,
        "put_in":      [47.58920, 13.28400],   // [lat, lon] or null
        "take_out":    [47.57670, 13.26710],   // [lat, lon] or null
        "coordinates": null                    // point spot, [lat, lon] or null
      }
    ]
  }
"""

import argparse
import json
import re
import sys
import time
from dataclasses import asdict, dataclass
from typing import Optional

import requests
from bs4 import BeautifulSoup, NavigableString, Tag

BASE_URL = "https://rivermap.org/mobile/"
INDEX_URL = "https://rivermap.org/mobile/index.html"
REQUEST_DELAY = 0.75  # seconds between requests — be polite
HEADERS = {"User-Agent": "paddlemate-crawler/1.0 (https://github.com/paddlemate)"}

# Whitewater difficulty: e.g. "III-IV (IV+)", "V- (X)", "II-III (III+)", "X"
_DIFF = r"[IVX]+[-+]?"
DIFFICULTY_RE = re.compile(
    rf"^\s*({_DIFF}(?:\s*[-–]\s*{_DIFF})?(?:\s*\(\s*{_DIFF}\s*\))?)\s*$"
)
COORD_RE = re.compile(r"([-\d.]+),\s*([-\d.]+)")


@dataclass
class Section:
    name: str
    difficulty: Optional[str]
    length_km: Optional[float]
    put_in: Optional[list[float]]  # [lat, lon]
    take_out: Optional[list[float]]  # [lat, lon]
    coordinates: Optional[list[float]]  # point spot [lat, lon]


@dataclass
class River:
    name: str
    region: str
    country: str
    sections: list[Section]


def fetch(url: str) -> bytes:
    """Return raw response bytes; let BeautifulSoup handle charset detection."""
    resp = requests.get(url, timeout=20, headers=HEADERS)
    resp.raise_for_status()
    return resp.content


def parse_coord_span(td: Tag) -> Optional[list[float]]:
    """Extract [lat, lon] from the first <span> inside a coordinate <td>."""
    span = td.find("span")
    if span:
        m = COORD_RE.search(span.get_text())
        if m:
            return [float(m.group(1)), float(m.group(2))]
    return None


def parse_coords_from_table(
    table: Tag,
) -> tuple[Optional[list[float]], Optional[list[float]]]:
    """Parse Put-in / Take-out coords from a nested coordinate table."""
    put_in: Optional[list[float]] = None
    take_out: Optional[list[float]] = None
    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) < 2:
            continue
        label = cells[0].get_text(strip=True).rstrip(":")
        coord = parse_coord_span(cells[1])
        if label == "Put-in":
            put_in = coord
        elif label == "Take-out":
            take_out = coord
        elif label == "Coordinates":
            put_in = coord  # treat as put_in for point features
    return put_in, take_out


def parse_length(text: str) -> Optional[float]:
    m = re.search(r"([\d.]+)\s*km", text)
    return float(m.group(1)) if m else None


def parse_difficulty(text: str) -> Optional[str]:
    """Return difficulty if the whole text matches a grade, else None."""
    m = DIFFICULTY_RE.match(text)
    return m.group(1).strip() if m else None


def parse_section_cell(
    td: Tag,
) -> tuple[
    str,
    Optional[str],
    Optional[float],
    Optional[list[float]],
    Optional[list[float]],
    Optional[list[float]],
]:
    """
    Parse the <td class="t"> data cell.

    The cell structure is:
      <span class="notranslate"><b>Name</b></span>
      <br>
      Difficulty Grade     ← plain text node
      <i>X.XX km</i>
      <br>
      [optional gauge graph / links]
      [optional nested <table> with Put-in / Take-out]
      [optional Notes / Weather / Map links]

    Returns: (name, difficulty, length_km, put_in, take_out, point_coordinates)
    """
    # Name from <b> inside <span class="notranslate">
    name_span = td.find("span", class_="notranslate")
    name = name_span.get_text(strip=True) if name_span else ""

    # Difficulty: first text node after the <br> that follows the name span
    difficulty: Optional[str] = None
    length_km: Optional[float] = None
    found_name_br = False
    for child in td.children:
        if not found_name_br:
            if getattr(child, "name", None) == "br":
                found_name_br = True
            continue
        if isinstance(child, NavigableString):
            text = child.strip()
            if text and difficulty is None:
                difficulty = parse_difficulty(text)
        elif getattr(child, "name", None) == "i":
            length_km = parse_length(child.get_text())
            break  # length always follows difficulty

    # Coordinates: nested <table> takes priority
    nested_table = td.find("table")
    put_in: Optional[list[float]] = None
    take_out: Optional[list[float]] = None
    point_coord: Optional[list[float]] = None

    if nested_table:
        put_in, take_out = parse_coords_from_table(nested_table)
        # If only put_in filled (point spot), move to point_coord
        if put_in and not take_out:
            point_coord = put_in
            put_in = None

    return name, difficulty, length_km, put_in, take_out, point_coord


def group_into_rivers(
    flat_sections: list[Section], region: str, country: str
) -> list[River]:
    """Group flat sections (with ._river_name attached) into River objects."""
    rivers: dict[str, River] = {}
    for sec in flat_sections:
        river_name = sec._river_name  # type: ignore[attr-defined]
        if river_name not in rivers:
            rivers[river_name] = River(
                name=river_name, region=region, country=country, sections=[]
            )
        rivers[river_name].sections.append(sec)
    return list(rivers.values())


def parse_region_page(html: str, region: str, country: str) -> list[River]:
    soup = BeautifulSoup(html, "html.parser")
    sections: list[Section] = []

    rows = soup.find_all("tr")
    i = 0
    while i < len(rows):
        row = rows[i]
        cells = row.find_all("td", recursive=False)

        # Section rows have exactly two top-level cells: td.c (indicator) + td.t (data)
        if (
            len(cells) == 2
            and cells[0].get("class") == ["c"]
            and cells[1].get("class") == ["t"]
        ):
            td = cells[1]
            name, difficulty, length_km, put_in, take_out, point_coord = (
                parse_section_cell(td)
            )

            if not name:
                i += 1
                continue

            # If no nested table found, coordinates are in the next sibling rows
            if put_in is None and point_coord is None:
                j = i + 1
                while j < len(rows):
                    sibling_cells = rows[j].find_all("td", recursive=False)
                    if len(sibling_cells) == 2:
                        label = sibling_cells[0].get_text(strip=True).rstrip(":")
                        coord = parse_coord_span(sibling_cells[1])
                        if label == "Put-in":
                            put_in = coord
                        elif label == "Take-out":
                            take_out = coord
                        elif label == "Coordinates":
                            point_coord = coord
                        j += 1
                    else:
                        break

            # Split "RiverName: SectionName" → (river, section)
            if ": " in name:
                river_name, section_name = name.split(": ", 1)
            else:
                river_name, section_name = name, name

            sections.append(
                Section(
                    name=section_name,
                    difficulty=difficulty,
                    length_km=length_km,
                    put_in=put_in,
                    take_out=take_out,
                    coordinates=point_coord,
                )
            )
            sections[-1]._river_name = river_name  # type: ignore[attr-defined]

        i += 1

    return group_into_rivers(sections, region, country)


def parse_index(html: str) -> list[dict]:
    """Return [{region, country, url}, ...]"""
    soup = BeautifulSoup(html, "html.parser")
    regions = []

    # Each country block is a <div class="s"> containing a <table class="notranslate">
    for div in soup.find_all("div", class_="s"):
        table = div.find("table", class_="notranslate")
        if not table:
            continue
        country = ""
        for row in table.find_all("tr"):
            b = row.find("b")
            if b and re.fullmatch(r"[A-Z]{2}", b.get_text(strip=True)):
                country = b.get_text(strip=True)
                continue
            a = row.find("a")
            if a and country:
                href = a.get("href", "")
                if href.endswith(".html"):
                    # Resolve relative URLs
                    if not href.startswith("http"):
                        href = BASE_URL + href.lstrip("./")
                    regions.append(
                        {
                            "region": a.get_text(strip=True),
                            "country": country,
                            "url": href,
                        }
                    )

    return regions


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Crawl rivermap.org/mobile for section data"
    )
    parser.add_argument(
        "--regions",
        help="Comma-separated region names to fetch (default: all)",
        default="",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=REQUEST_DELAY,
        help=f"Seconds between requests (default: {REQUEST_DELAY})",
    )
    args = parser.parse_args()

    filter_regions = {r.strip() for r in args.regions.split(",") if r.strip()}

    print("Fetching region index…", file=sys.stderr)
    index_html = fetch(INDEX_URL)
    all_regions = parse_index(index_html)
    print(f"Found {len(all_regions)} regions", file=sys.stderr)

    if filter_regions:
        all_regions = [r for r in all_regions if r["region"] in filter_regions]
        print(
            f"Filtered to {len(all_regions)} regions: {filter_regions}", file=sys.stderr
        )

    results: list[River] = []

    for i, reg in enumerate(all_regions, 1):
        print(
            f"[{i}/{len(all_regions)}] {reg['country']} / {reg['region']}…",
            file=sys.stderr,
        )
        try:
            html = fetch(reg["url"])
            rivers = parse_region_page(html, reg["region"], reg["country"])
            results.extend(rivers)
            n_sections = sum(len(r.sections) for r in rivers)
            print(f"  → {len(rivers)} rivers, {n_sections} sections", file=sys.stderr)
        except requests.HTTPError as exc:
            print(f"  HTTP error: {exc}", file=sys.stderr)
        except Exception as exc:  # noqa: BLE001
            print(f"  Error: {exc}", file=sys.stderr)

        if i < len(all_regions):
            time.sleep(args.delay)

    total_sections = sum(len(r.sections) for r in results)
    print(
        f"\nTotal: {len(results)} rivers, {total_sections} sections across {len(all_regions)} regions",
        file=sys.stderr,
    )

    def river_to_dict(r: River) -> dict:
        return {
            "name": r.name,
            "region": r.region,
            "country": r.country,
            "sections": [asdict(s) for s in r.sections],
        }

    print(json.dumps([river_to_dict(r) for r in results], indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
