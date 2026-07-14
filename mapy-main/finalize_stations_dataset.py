#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Finalizuje i synchronizuje główny zestaw stacji do 1966 rekordów."""

from __future__ import annotations

import csv
import json
import pathlib
import re
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parent
TARGET_COUNT = 1966
PLACEHOLDER_COORDS = {("52.0", "19.0"), ("52.000000", "19.000000")}

MAIN_JSON = ROOT / "stacje_orlen.json"
BACKUP_JSON = ROOT / "stacje_orlen_2421_backup.json"


def load_json(path: pathlib.Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: pathlib.Path, rows: list[dict]) -> None:
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def save_csv(path: pathlib.Path, rows: list[dict]) -> None:
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
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def norm_addr(addr: str) -> str:
    s = (addr or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def coord_key(row: dict) -> tuple[str, str]:
    return (str(row.get("Latitude", "")).strip(), str(row.get("Longitude", "")).strip())


def quality_score(row: dict) -> tuple:
    has_real_coord = coord_key(row) not in PLACEHOLDER_COORDS and all(coord_key(row))
    has_notes = bool(str(row.get("Notatki", "")).strip())
    audit = str(row.get("Audyt", "")).strip().lower() == "tak"
    done = str(row.get("Status", "")).strip().lower() == "zrobione"
    has_seller = bool(str(row.get("Handlowiec", "")).strip())
    has_address = bool(norm_addr(str(row.get("Adres", ""))))
    return (
        1 if audit else 0,
        1 if has_real_coord else 0,
        1 if has_address else 0,
        1 if done else 0,
        1 if has_notes else 0,
        1 if has_seller else 0,
    )


def dedupe_by_address(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    groups: dict[str, list[dict]] = defaultdict(list)
    untouched = []
    for row in rows:
        a = norm_addr(str(row.get("Adres", "")))
        if not a:
            untouched.append(row)
            continue
        groups[a].append(row)

    kept = []
    removed = []
    for addr, items in groups.items():
        if len(items) == 1:
            kept.append(items[0])
            continue
        ranked = sorted(items, key=quality_score, reverse=True)
        kept.append(ranked[0])
        removed.extend(ranked[1:])

    kept.extend(untouched)
    return kept, removed


def fill_to_target(rows: list[dict], backup_pool: list[dict], target: int) -> tuple[list[dict], int]:
    by_id = {str(r.get("ID_Punktu", "")).strip() for r in rows}
    by_addr = {norm_addr(str(r.get("Adres", ""))) for r in rows if norm_addr(str(r.get("Adres", "")))}

    candidates = []
    for r in backup_pool:
        rid = str(r.get("ID_Punktu", "")).strip()
        if not rid or rid in by_id:
            continue
        a = norm_addr(str(r.get("Adres", "")))
        if a and a in by_addr:
            continue
        candidates.append(r)

    candidates.sort(key=quality_score, reverse=True)

    added = 0
    for c in candidates:
        if len(rows) >= target:
            break
        rid = str(c.get("ID_Punktu", "")).strip()
        a = norm_addr(str(c.get("Adres", "")))
        if rid in by_id:
            continue
        if a and a in by_addr:
            continue
        rows.append(c)
        by_id.add(rid)
        if a:
            by_addr.add(a)
        added += 1
    return rows, added


def calc_metrics(rows: list[dict]) -> dict:
    ids = [str(r.get("ID_Punktu", "")).strip() for r in rows]
    addrs = [norm_addr(str(r.get("Adres", ""))) for r in rows if norm_addr(str(r.get("Adres", "")))]
    coords = [coord_key(r) for r in rows]

    return {
        "count": len(rows),
        "duplicate_id_rows": sum(v - 1 for v in Counter(ids).values() if v > 1),
        "duplicate_address_rows": sum(v - 1 for v in Counter(addrs).values() if v > 1),
        "duplicate_coordinate_rows": sum(v - 1 for v in Counter(coords).values() if v > 1),
        "placeholder_52_19_rows": sum(1 for c in coords if c in PLACEHOLDER_COORDS),
        "audit_tak_count": sum(1 for r in rows if str(r.get("Audyt", "")).strip().lower() == "tak"),
    }


def main() -> None:
    rows = load_json(MAIN_JSON)
    backup = load_json(BACKUP_JSON)

    before = calc_metrics(rows)
    deduped, removed = dedupe_by_address(rows)
    deduped, added = fill_to_target(deduped, backup, TARGET_COUNT)
    deduped = deduped[:TARGET_COUNT]
    after = calc_metrics(deduped)

    for name in ["stacje_orlen.json", "stacje_orlen_rzetelne.json", "stacje_orlen_final_1966.json"]:
        save_json(ROOT / name, deduped)
    for name in ["stacje_orlen.csv", "stacje_orlen_rzetelne.csv", "stacje_orlen_final_1966.csv"]:
        save_csv(ROOT / name, deduped)

    report = {
        "target_count": TARGET_COUNT,
        "before": before,
        "after": after,
        "removed_by_exact_duplicate_address": len(removed),
        "added_from_backup_to_restore_count": added,
    }
    save_json(ROOT / "finalization_report.json", report)

    print("Finalizacja zakonczona.")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
