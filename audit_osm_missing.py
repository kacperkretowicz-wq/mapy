#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Porównanie stacji ORLEN z OpenStreetMap vs lokalna baza."""

import csv
import json
import math
import pathlib
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent
QUERY = """[out:json][timeout:120];
area["ISO3166-1"="PL"]->.searchArea;
(
  node["amenity"="fuel"]["brand"~"Orlen",i](area.searchArea);
  way["amenity"="fuel"]["brand"~"Orlen",i](area.searchArea);
  relation["amenity"="fuel"]["brand"~"Orlen",i](area.searchArea);
);
out center tags;"""

SERVERS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def fetch_osm():
    for url in SERVERS:
        try:
            req = urllib.request.Request(
                url,
                data=urllib.parse.urlencode({"data": QUERY}).encode("utf-8"),
                headers={
                    "User-Agent": "mapy-main-audit/1.0",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            elements = data.get("elements", [])
            if elements:
                print(f"[OK] Pobrano {len(elements)} elementów z {url}")
                return data
        except Exception as exc:
            print(f"[FAIL] {url}: {exc}")
    raise RuntimeError("Nie udało się pobrać danych z Overpass API")


def get_coords(elem):
    lat = elem.get("lat")
    lon = elem.get("lon")
    if lat is None or lon is None:
        center = elem.get("center", {})
        lat = center.get("lat")
        lon = center.get("lon")
    if lat is None or lon is None:
        return None
    return float(lat), float(lon)


def build_address(tags):
    street = tags.get("addr:street", "").strip()
    house = tags.get("addr:housenumber", "").strip()
    postcode = tags.get("addr:postcode", "").strip()
    city = tags.get("addr:city", "").strip()
    parts = []
    if street:
        parts.append(f"ul. {street} {house}".strip())
    city_bits = " ".join(x for x in [postcode, city] if x)
    if city_bits:
        parts.append(city_bits)
    return ", ".join(parts)


def parse_sp(tags, name):
    for key in ("ref", "operator:ref", "brand:ref"):
        val = str(tags.get(key, "")).strip()
        if val.isdigit():
            return int(val)
    m = re.search(r"orlen\s*nr\s*(\d+)", str(name).lower())
    if m:
        return int(m.group(1))
    return None


def load_local(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    print("=" * 60)
    print("Audyt brakujących stacji ORLEN (OSM vs lokalna baza)")
    print("=" * 60)

    osm_data = fetch_osm()
    (ROOT / "osm_orlen_raw.json").write_text(
        json.dumps(osm_data, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    local_path = ROOT / "stacje_orlen_rzetelne.json"
    if not local_path.exists():
        local_path = ROOT / "stacje_orlen.json"
    local = load_local(local_path)
    print(f"Lokalna baza: {local_path.name} ({len(local)} rekordów)")

    local_by_osm_id = {}
    local_by_sp = {}
    local_coords = []
    for row in local:
        osm_id = str(row.get("ID_Punktu", "")).replace("ORL-PL-", "")
        if osm_id.isdigit():
            local_by_osm_id[int(osm_id)] = row
        m = re.search(r"orlen\s*nr\s*(\d+)", str(row.get("Nazwa_Stacji", "")).lower())
        if m:
            local_by_sp[int(m.group(1))] = row
        try:
            local_coords.append(
                (
                    float(row["Latitude"]),
                    float(row["Longitude"]),
                    row,
                )
            )
        except (KeyError, ValueError, TypeError):
            pass

    missing = []
    matched = 0
    recent_2025 = []
    now = datetime.now(timezone.utc)

    for elem in osm_data.get("elements", []):
        coords = get_coords(elem)
        if not coords:
            continue
        lat, lon = coords
        if lat == 52.0 and lon == 19.0:
            continue

        tags = elem.get("tags", {})
        osm_id = elem.get("id")
        name = tags.get("name", "Orlen")
        sp = parse_sp(tags, name)
        address = build_address(tags)

        found = False
        if osm_id in local_by_osm_id:
            found = True
        elif sp is not None and sp in local_by_sp:
            found = True
        else:
            for llat, llon, _ in local_coords:
                if haversine_m(lat, lon, llat, llon) <= 120:
                    found = True
                    break

        if found:
            matched += 1
            continue

        created = tags.get("created_by") or tags.get("source") or ""
        # OSM changeset timestamp not in out tags; use element version as weak signal
        version = elem.get("version")
        item = {
            "OSM_ID": osm_id,
            "OSM_Type": elem.get("type"),
            "SP": sp,
            "Nazwa": name,
            "Adres": address or f"współrzędne: {lat:.5f}, {lon:.5f}",
            "Latitude": f"{lat:.6f}",
            "Longitude": f"{lon:.6f}",
            "OSM_Version": version,
            "OSM_Tags": {k: v for k, v in tags.items() if k in (
                "brand", "operator", "ref", "name", "addr:street", "addr:housenumber",
                "addr:postcode", "addr:city", "opening_date", "start_date"
            )},
        }
        missing.append(item)

        opening = tags.get("opening_date") or tags.get("start_date") or ""
        if opening.startswith("2025") or opening.startswith("2026"):
            recent_2025.append(item)

    missing.sort(key=lambda x: (x["SP"] is None, x["SP"] or 99999, x["OSM_ID"]))
    recent_2025.sort(key=lambda x: x["OSM_ID"])

    out_json = ROOT / "stacje_brakujace_na_mapach.json"
    out_csv = ROOT / "stacje_brakujace_na_mapach.csv"
    out_recent = ROOT / "stacje_nowe_2025_na_mapach.json"

    out_json.write_text(json.dumps(missing, ensure_ascii=False, indent=2), encoding="utf-8")
    out_recent.write_text(json.dumps(recent_2025, ensure_ascii=False, indent=2), encoding="utf-8")

    headers = ["OSM_ID", "OSM_Type", "SP", "Nazwa", "Adres", "Latitude", "Longitude", "OSM_Version"]
    with out_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        for row in missing:
            writer.writerow(row)

    print(f"Dopasowane do lokalnej bazy: {matched}")
    print(f"Brakujące na liście (są na mapie OSM): {len(missing)}")
    print(f"Z tagiem opening/start 2025-2026: {len(recent_2025)}")
    print(f"Zapisano: {out_json.name}, {out_csv.name}, {out_recent.name}")
    if missing[:15]:
        print("\nPrzykładowe brakujące:")
        for row in missing[:15]:
            sp = row["SP"] if row["SP"] is not None else "?"
            print(f"  OSM {row['OSM_ID']} | SP {sp} | {row['Nazwa']} | {row['Adres']}")


if __name__ == "__main__":
    main()
