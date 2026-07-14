#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Ustawia główny dataset na 2100 punktów z priorytetem danych oficjalnych."""

from __future__ import annotations

import csv
import json
import pathlib
import re
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent
TARGET = 2100


def load_json(name: str):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def save_json(name: str, rows):
    (ROOT / name).write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def save_csv(name: str, rows):
    headers = [
        "ID_Punktu",
        "Nazwa_Stacji",
        "Adres",
        "Latitude",
        "Longitude",
        "Handlowiec",
        "Status",
        "Ostatnia_Aktualizacja",
        "Notatki",
        "Audyt",
    ]
    with (ROOT / name).open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def station_number(row: dict) -> int | None:
    name = str(row.get("Nazwa_Stacji", ""))
    m = re.search(r"orlen\s*nr\s*(\d+)", name.lower())
    if m:
        return int(m.group(1))
    tail = str(row.get("ID_Punktu", "")).split("-")[-1]
    return int(tail) if tail.isdigit() else None


def normalize_addr(addr: str) -> str:
    return re.sub(r"\s+", " ", (addr or "").strip().lower())


def metrics(rows):
    ids = [str(r.get("ID_Punktu", "")).strip() for r in rows]
    addrs = [normalize_addr(str(r.get("Adres", ""))) for r in rows if normalize_addr(str(r.get("Adres", "")))]
    coords = [(str(r.get("Latitude", "")).strip(), str(r.get("Longitude", "")).strip()) for r in rows]
    return {
        "count": len(rows),
        "dup_id_rows": sum(v - 1 for v in Counter(ids).values() if v > 1),
        "dup_addr_rows": sum(v - 1 for v in Counter(addrs).values() if v > 1),
        "dup_coord_rows": sum(v - 1 for v in Counter(coords).values() if v > 1),
    }


def main():
    current = load_json("stacje_orlen.json")
    backup = load_json("stacje_orlen_2421_backup.json")
    official = load_json("orlen_official_snapshot.json")

    by_num_current = {station_number(r) for r in current if station_number(r) is not None}
    by_num_backup = {}
    for r in backup:
        num = station_number(r)
        if num is not None and num not in by_num_backup:
            by_num_backup[num] = r

    # Priorytet: LocalId z oficjalnej mapy (typ ORLEN), które nie są jeszcze w lokalnej bazie.
    official_local_ids = []
    seen = set()
    for it in official:
        lid = it.get("LocalId")
        if not str(lid).isdigit():
            continue
        lid = int(lid)
        if lid in seen:
            continue
        seen.add(lid)
        official_local_ids.append(lid)

    rows = list(current)
    existing_ids = {str(r.get("ID_Punktu", "")).strip() for r in rows}
    existing_addr = {normalize_addr(str(r.get("Adres", ""))) for r in rows if normalize_addr(str(r.get("Adres", "")))}

    added_from_backup = 0
    for lid in official_local_ids:
        if len(rows) >= TARGET:
            break
        if lid in by_num_current:
            continue
        candidate = by_num_backup.get(lid)
        if not candidate:
            continue
        rid = str(candidate.get("ID_Punktu", "")).strip()
        addr = normalize_addr(str(candidate.get("Adres", "")))
        if rid in existing_ids:
            continue
        if addr and addr in existing_addr:
            continue
        rows.append(candidate)
        existing_ids.add(rid)
        if addr:
            existing_addr.add(addr)
        added_from_backup += 1

    # Fallback: jeśli nadal brakuje do 2100, dołóż punkty bezpośrednio z official snapshot.
    added_from_official_fallback = 0
    fallback_seq = 1
    for it in official:
        if len(rows) >= TARGET:
            break
        lid = it.get("LocalId")
        lat = it.get("Latitude")
        lon = it.get("Longitude")
        if not str(lid).isdigit():
            continue
        lid = int(lid)
        rid = f"ORL-PL-{lid}"
        if rid in existing_ids:
            rid = f"ORL-PL-OFF-{lid}-{fallback_seq}"
            fallback_seq += 1
            if rid in existing_ids:
                continue
        row = {
            "ID_Punktu": rid,
            "Nazwa_Stacji": f"Orlen nr {lid} (z mapy oficjalnej)",
            "Adres": "Brak pełnego adresu (import z oficjalnej mapy ORLEN)",
            "Latitude": str(lat) if lat is not None else "",
            "Longitude": str(lon) if lon is not None else "",
            "Handlowiec": "",
            "Status": "Do zrobienia",
            "Ostatnia_Aktualizacja": "",
            "Notatki": "IMPORT OFICJALNY ORLEN (DO WERYFIKACJI ADRESU)",
            "Audyt": "Nie",
        }
        rows.append(row)
        existing_ids.add(rid)
        added_from_official_fallback += 1

    rows = rows[:TARGET]

    for name in ["stacje_orlen.json", "stacje_orlen_rzetelne.json", "stacje_orlen_final_1966.json"]:
        save_json(name, rows)
    for name in ["stacje_orlen.csv", "stacje_orlen_rzetelne.csv", "stacje_orlen_final_1966.csv"]:
        save_csv(name, rows)

    report = {
        "target": TARGET,
        "added_from_backup": added_from_backup,
        "added_from_official_fallback": added_from_official_fallback,
        "final_metrics": metrics(rows),
    }
    save_json("report_target_2100.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
