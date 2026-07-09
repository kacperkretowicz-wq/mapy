#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Buduje pełną listę stacji ORLEN: PDF + OSM + istniejąca baza (z MOP/autostrady)."""

import csv
import json
import math
import pathlib
import re
import time
import urllib.parse
import urllib.request
from collections import defaultdict

from pypdf import PdfReader

ROOT = pathlib.Path(__file__).resolve().parent

WOJ = [
    "dolnośląskie", "kujawsko-pomorskie", "lubelskie", "lubuskie", "łódzkie",
    "małopolskie", "mazowieckie", "opolskie", "podkarpackie", "podlaskie",
    "pomorskie", "śląskie", "świętokrzyskie", "warmińsko-mazurskie",
    "wielkopolskie", "zachodniopomorskie",
    "PODKARPACKIE", "WIELKOPOLSKIE", "ŁÓDZKIE", "ŚLĄSKIE",
]
WOJ_RE = re.compile(r"\b(" + "|".join(sorted(map(re.escape, WOJ), key=len, reverse=True)) + r")\b$", re.I)
POSTCODE_RE = re.compile(r"\b(\d{2}-\d{3})\b")

PLACEHOLDER = (52.0, 19.0)


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def is_placeholder(lat, lon):
    try:
        return abs(float(lat) - PLACEHOLDER[0]) < 0.0001 and abs(float(lon) - PLACEHOLDER[1]) < 0.0001
    except (TypeError, ValueError):
        return True


def parse_pdf_row(line):
    s = " ".join(line.split())
    m = re.match(r"^(\d+)\s+(.*)$", s)
    if not m:
        return None
    sp = int(m.group(1))
    rest = m.group(2).strip()
    if "#N/D!" in rest:
        return {"SP": sp, "Miejscowosc": "", "Kod": "", "Ulica": "", "Nr": "", "Wojewodztwo": "", "Adres_PDF": ""}

    vm = WOJ_RE.search(rest)
    woj = vm.group(1) if vm else ""
    core = rest[: vm.start()].strip() if vm else rest

    pm = POSTCODE_RE.search(core)
    if not pm:
        return {"SP": sp, "Miejscowosc": core, "Kod": "", "Ulica": "", "Nr": "", "Wojewodztwo": woj, "Adres_PDF": core}

    kod = pm.group(1)
    before = core[: pm.start()].strip()
    after = core[pm.end() :].strip()

    # after postcode: street + optional number (often missing on MOP)
    ulica = after
    nr = ""
    if after and not after.lower().startswith(("mop", "autostrada", "droga", "trasa", "dk ", "a1", "a2", "a4", "s7", "s8")):
        parts = after.rsplit(" ", 1)
        if len(parts) == 2 and re.fullmatch(r"[\w./\-]+", parts[1]):
            ulica, nr = parts[0], parts[1]

    adres_parts = []
    if ulica:
        if nr:
            adres_parts.append(f"ul. {ulica} {nr}".replace("ul. ul.", "ul."))
        else:
            adres_parts.append(ulica)
    city_line = " ".join(x for x in [kod, before] if x)
    if city_line:
        adres_parts.append(city_line)

    return {
        "SP": sp,
        "Miejscowosc": before,
        "Kod": kod,
        "Ulica": ulica,
        "Nr": nr,
        "Wojewodztwo": woj,
        "Adres_PDF": ", ".join(adres_parts),
    }


def parse_pdf():
    pdf = PdfReader(str(ROOT / "Lista_stacji_ORLEN_20160301.pdf"))
    text = "\n".join((p.extract_text() or "") for p in pdf.pages)
    rows = {}
    for line in text.splitlines():
        s = " ".join(line.split())
        if not s or s.startswith("Lista stacji") or s.startswith("SP Miejscowość") or s.startswith("-- "):
            continue
        row = parse_pdf_row(line)
        if row:
            rows[row["SP"]] = row
    return rows


def get_osm_coords(elem):
    lat = elem.get("lat")
    lon = elem.get("lon")
    if lat is None or lon is None:
        c = elem.get("center", {})
        lat, lon = c.get("lat"), c.get("lon")
    if lat is None or lon is None:
        return None
    return float(lat), float(lon)


def osm_address(tags):
    street = tags.get("addr:street", "").strip()
    house = tags.get("addr:housenumber", "").strip()
    postcode = tags.get("addr:postcode", "").strip()
    city = tags.get("addr:city", "").strip()
    parts = []
    if street:
        parts.append(f"ul. {street} {house}".strip())
    elif tags.get("name", "").strip() and tags.get("name") != "Orlen":
        parts.append(tags["name"].strip())
    city_bits = " ".join(x for x in [postcode, city] if x)
    if city_bits:
        parts.append(city_bits)
    return ", ".join(parts)


def parse_sp_from_tags(tags, name=""):
    for key in ("ref", "operator:ref", "brand:ref"):
        val = str(tags.get(key, "")).strip()
        if val.isdigit():
            return int(val)
    m = re.search(r"orlen\s*nr\s*(\d+)", str(name).lower())
    return int(m.group(1)) if m else None


def load_osm_index():
    path = ROOT / "osm_orlen_raw.json"
    if not path.exists():
        raise FileNotFoundError("Brak osm_orlen_raw.json — uruchom najpierw audit_osm_missing.py")

    data = json.loads(path.read_text(encoding="utf-8"))
    by_sp = {}
    no_sp = []
    for elem in data.get("elements", []):
        coords = get_osm_coords(elem)
        if not coords:
            continue
        tags = elem.get("tags", {})
        sp = parse_sp_from_tags(tags, tags.get("name", ""))
        item = {
            "OSM_ID": elem.get("id"),
            "Lat": coords[0],
            "Lon": coords[1],
            "Adres": osm_address(tags),
            "Tags": tags,
        }
        if sp is not None:
            by_sp.setdefault(sp, []).append(item)
        else:
            no_sp.append(item)
    return by_sp, no_sp


def pick_osm(by_sp_list):
    if not by_sp_list:
        return None
    # prefer entry with address, then highest precision coords
    ranked = sorted(
        by_sp_list,
        key=lambda x: (1 if x["Adres"] else 0, -x["Lat"]),
        reverse=True,
    )
    return ranked[0]


def load_existing_meta():
    sources = [
        ROOT / "stacje_orlen.json",
        ROOT / "stacje_orlen.json.before_refresh",
    ]
    meta = {}
    for src in sources:
        if not src.exists():
            continue
        for row in json.loads(src.read_text(encoding="utf-8")):
            sp = sp_from_row(row)
            if sp is None:
                continue
            if sp not in meta:
                meta[sp] = row
            else:
                for k, v in row.items():
                    if v and not meta[sp].get(k):
                        meta[sp][k] = v
    return meta


def sp_from_row(row):
    m = re.search(r"orlen\s*nr\s*(\d+)", str(row.get("Nazwa_Stacji", "")).lower())
    if m:
        return int(m.group(1))
    tail = str(row.get("ID_Punktu", "")).split("-")[-1]
    return int(tail) if tail.isdigit() else None


def build_name(sp, city):
    city = (city or "").strip()
    return f"Orlen nr {sp} ({city})" if city else f"Orlen nr {sp}"


def best_coords(sp, osm_item, existing):
    if osm_item:
        return osm_item["Lat"], osm_item["Lon"], "OSM"
    if existing:
        try:
            lat, lon = float(existing["Latitude"]), float(existing["Longitude"])
            if not is_placeholder(lat, lon):
                return lat, lon, "ISTNIEJACE"
        except (KeyError, ValueError, TypeError):
            pass
    return PLACEHOLDER[0], PLACEHOLDER[1], "BRAK"


def best_address(pdf_row, osm_item, existing):
    if pdf_row and pdf_row.get("Adres_PDF"):
        return pdf_row["Adres_PDF"]
    if osm_item and osm_item.get("Adres"):
        return osm_item["Adres"]
    if existing and str(existing.get("Adres", "")).strip():
        return str(existing["Adres"]).strip()
    if pdf_row:
        bits = []
        if pdf_row.get("Ulica"):
            if pdf_row.get("Nr"):
                bits.append(f"ul. {pdf_row['Ulica']} {pdf_row['Nr']}")
            else:
                bits.append(pdf_row["Ulica"])
        city = " ".join(x for x in [pdf_row.get("Kod", ""), pdf_row.get("Miejscowosc", "")] if x)
        if city:
            bits.append(city)
        if bits:
            return ", ".join(bits)
    return ""


def normalize(s):
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def geocode_placeholders(rows, osm_by_sp, no_sp):
    """Uzupełnia współrzędne z OSM bez numeru SP (dopasowanie po kodzie/mieście/MOP)."""
    by_postcode = defaultdict(list)
    by_city = defaultdict(list)
    mop_osm = []
    for item in no_sp:
        tags = item.get("Tags", {})
        pc = normalize(tags.get("addr:postcode", ""))
        city = normalize(tags.get("addr:city", ""))
        cand_addr = normalize(item.get("Adres", ""))
        name = normalize(tags.get("name", ""))
        if pc:
            by_postcode[pc].append(item)
        if city:
            by_city[city].append(item)
        if any(k in cand_addr or k in name for k in ("mop", "autostrada", "a1", "a2", "a4", "dk", "droga")):
            mop_osm.append(item)

    used_osm = set()

    for row in rows:
        if not is_placeholder(row["Latitude"], row["Longitude"]):
            continue

        sp = int(str(row["ID_Punktu"]).split("-")[-1])
        if sp in osm_by_sp:
            picked = pick_osm(osm_by_sp[sp])
            if picked:
                row["Latitude"] = f"{picked['Lat']:.6f}"
                row["Longitude"] = f"{picked['Lon']:.6f}"
                continue

        adres = row.get("Adres", "")
        pc_m = POSTCODE_RE.search(adres)
        postcode = pc_m.group(1) if pc_m else ""
        city_m = re.search(r"\(([^)]+)\)", row.get("Nazwa_Stacji", ""))
        city = normalize(city_m.group(1) if city_m else "")
        if not city and postcode:
            city = normalize(adres.split(",")[-1].replace(postcode, "").strip())

        candidates = []
        if postcode and postcode in by_postcode:
            candidates.extend(by_postcode[postcode])
        if city and city in by_city:
            candidates.extend(by_city[city])

        addr_norm = normalize(adres)
        is_mop = any(k in addr_norm for k in ("mop", "autostrada", "a1", "a2", "a4", "dk", "droga", "trasa"))
        if is_mop:
            candidates.extend(mop_osm)

        keywords = [w for w in re.split(r"[\s,/\-]+", addr_norm) if len(w) >= 3]

        best = None
        best_score = 0
        for cand in candidates:
            osm_id = cand.get("OSM_ID")
            if osm_id in used_osm:
                continue
            cand_addr = normalize(cand.get("Adres", ""))
            score = 0
            if postcode and postcode in cand_addr:
                score += 3
            if city and city in cand_addr:
                score += 2
            for kw in keywords:
                if kw in cand_addr:
                    score += 1
            if is_mop and any(k in cand_addr for k in ("mop", "autostrada", "a1", "a2", "a4")):
                score += 2
            if score > best_score:
                best_score = score
                best = cand

        min_score = 1 if is_mop else 2
        if best and best_score >= min_score:
            row["Latitude"] = f"{best['Lat']:.6f}"
            row["Longitude"] = f"{best['Lon']:.6f}"
            used_osm.add(best.get("OSM_ID"))


def geocode_nominatim_placeholders(rows, max_requests=400):
    """Ostatnia próba geokodowania przez Nominatim (adres + Polska)."""
    done = 0
    for row in rows:
        if not is_placeholder(row["Latitude"], row["Longitude"]):
            continue
        if done >= max_requests:
            break
        query = row.get("Adres") or row.get("Nazwa_Stacji", "")
        if not query.strip():
            continue
        q = f"Orlen, {query}, Polska"
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
            {"q": q, "format": "json", "limit": 1, "countrycodes": "pl"}
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "mapy-main-orlen-audit/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if data:
                row["Latitude"] = f"{float(data[0]['lat']):.6f}"
                row["Longitude"] = f"{float(data[0]['lon']):.6f}"
                done += 1
        except Exception:
            pass
        time.sleep(1.05)


def write_outputs(rows):
    headers = [
        "ID_Punktu", "Nazwa_Stacji", "Adres", "Latitude", "Longitude",
        "Handlowiec", "Status", "Ostatnia_Aktualizacja", "Notatki", "Audyt",
    ]
    for name in ("stacje_orlen.json", "stacje_orlen_rzetelne.json"):
        (ROOT / name).write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    for name in ("stacje_orlen.csv", "stacje_orlen_rzetelne.csv"):
        with (ROOT / name).open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)


def main():
    print("=" * 60)
    print("Aktualizacja pełnej listy stacji ORLEN")
    print("=" * 60)

    pdf_rows = parse_pdf()
    osm_by_sp, no_sp = load_osm_index()
    existing_meta = load_existing_meta()

    # SP z map do dodania
    extra_path = ROOT / "stacje_do_dodania_z_map.json"
    if extra_path.exists():
        for item in json.loads(extra_path.read_text(encoding="utf-8")):
            sp = item.get("SP")
            if sp is None:
                continue
            osm_by_sp.setdefault(sp, []).append({
                "OSM_ID": item.get("OSM_ID"),
                "Lat": item["Lat"],
                "Lon": item["Lon"],
                "Adres": item.get("Adres", ""),
                "Tags": {},
            })

    all_sp = set(pdf_rows) | set(osm_by_sp) | set(existing_meta)

    output = []
    stats = defaultdict(int)

    for sp in sorted(all_sp):
        pdf_row = pdf_rows.get(sp)
        osm_item = pick_osm(osm_by_sp.get(sp, []))
        existing = existing_meta.get(sp)

        city = (pdf_row or {}).get("Miejscowosc", "")
        if not city and existing:
            m = re.search(r"\(([^)]+)\)", str(existing.get("Nazwa_Stacji", "")))
            if m:
                city = m.group(1)

        lat, lon, src = best_coords(sp, osm_item, existing)
        adres = best_address(pdf_row, osm_item, existing)

        row = {
            "ID_Punktu": f"ORL-PL-{sp}",
            "Nazwa_Stacji": build_name(sp, city),
            "Adres": adres,
            "Latitude": f"{lat:.6f}",
            "Longitude": f"{lon:.6f}",
            "Handlowiec": (existing or {}).get("Handlowiec", ""),
            "Status": (existing or {}).get("Status", "Do zrobienia"),
            "Ostatnia_Aktualizacja": (existing or {}).get("Ostatnia_Aktualizacja", ""),
            "Notatki": (existing or {}).get("Notatki", ""),
            "Audyt": (existing or {}).get("Audyt", "Nie"),
        }
        output.append(row)
        stats[src] += 1
        if not adres:
            stats["bez_adresu"] += 1
        elif pdf_row and pdf_row.get("Ulica") and not pdf_row.get("Nr"):
            stats["mop_lub_bez_numeru"] += 1

    geocode_placeholders(output, osm_by_sp, no_sp)
    geocode_nominatim_placeholders(output)

    stats_after = defaultdict(int)
    for row in output:
        if is_placeholder(row["Latitude"], row["Longitude"]):
            stats_after["placeholder"] += 1
        else:
            stats_after["with_coords"] += 1

    write_outputs(output)

    print(f"PDF: {len(pdf_rows)} pozycji")
    print(f"Łącznie SP w bazie: {len(output)}")
    print(f"Źródło współrzędnych (pierwszy przebieg): {dict(stats)}")
    print(f"Po uzupełnieniu z OSM: {dict(stats_after)}")
    print(f"Audyt=Tak: {sum(1 for r in output if str(r.get('Audyt','')).lower()=='tak')}")
    print("Zapisano: stacje_orlen.json/csv i stacje_orlen_rzetelne.json/csv")


if __name__ == "__main__":
    main()
