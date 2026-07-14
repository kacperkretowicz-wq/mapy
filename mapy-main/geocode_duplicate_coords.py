import csv
import json
import logging
import math
import pathlib
import sys
import time
import traceback
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

LOG_FILE = pathlib.Path("geocode_duplicate_coords.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_FILE, encoding="utf-8"), logging.StreamHandler()],
)
logger = logging.getLogger(__name__)


def main() -> int:
    p = pathlib.Path("stacje_orlen.json")
    data = json.loads(p.read_text(encoding="utf-8"))
    logger.info("Loaded %d records from %s", len(data), p)

    coords = []
    for row_idx, r in enumerate(data):
        try:
            coords.append((round(float(r["Latitude"]), 6), round(float(r["Longitude"]), 6)))
        except Exception:
            logger.exception("Invalid coordinate at row=%d id=%s", row_idx, r.get("ID_Punktu"))
            coords.append(None)

    ctr = Counter(c for c in coords if c is not None)
    dup_keys = {k for k, v in ctr.items() if v > 1}
    idx_by_key = defaultdict(list)
    for i, k in enumerate(coords):
        if k in dup_keys:
            idx_by_key[k].append(i)

    updated = 0
    attempted = 0
    max_attempts = 280

    # Prioritize audited/important rows first for faster high-value corrections.
    def row_priority(i: int) -> tuple[int, str]:
        r = data[i]
        aud = str(r.get("Audyt", "")).strip().lower() == "tak"
        return (0 if aud else 1, str(r.get("ID_Punktu", "")))

    for dup_coord, idxs in idx_by_key.items():
        idxs = sorted(idxs, key=row_priority)
        for i in idxs:
            if attempted >= max_attempts:
                logger.info("Reached max_attempts=%d, stopping early.", max_attempts)
                break
            r = data[i]
            addr = (r.get("Adres") or "").strip()
            if not addr:
                logger.warning("Skipping empty address for row=%d id=%s", i, r.get("ID_Punktu"))
                continue
            query = f"Orlen, {addr}, Polska"
            url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
                {"q": query, "format": "json", "limit": 1, "countrycodes": "pl"}
            )
            attempted += 1
            try:
                req = urllib.request.Request(
                    url, headers={"User-Agent": "mapy-main-cleanup/1.0"}
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    rows = json.loads(resp.read().decode("utf-8"))
                if rows:
                    lat = float(rows[0]["lat"])
                    lon = float(rows[0]["lon"])
                    old_lat = float(r["Latitude"])
                    old_lon = float(r["Longitude"])

                    # Accept only if geocode significantly changes point (>20m)
                    r_earth = 6371000
                    p1, p2 = math.radians(old_lat), math.radians(lat)
                    dp = math.radians(lat - old_lat)
                    dl = math.radians(lon - old_lon)
                    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
                    x = max(0.0, min(1.0, x))
                    d = 2 * r_earth * math.atan2(math.sqrt(x), math.sqrt(1 - x))
                    if d >= 20:
                        r["Latitude"] = f"{lat:.6f}"
                        r["Longitude"] = f"{lon:.6f}"
                        updated += 1
                else:
                    logger.warning("No geocode result for row=%d id=%s", i, r.get("ID_Punktu"))
            except Exception:
                logger.exception(
                    "Geocoding failed row=%d id=%s addr=%r dup_coord=%s",
                    i,
                    r.get("ID_Punktu"),
                    addr,
                    dup_coord,
                )
            time.sleep(1.05)
        if attempted >= max_attempts:
            break

    for fn in ["stacje_orlen.json", "stacje_orlen_rzetelne.json", "stacje_orlen_final_1966.json"]:
        pathlib.Path(fn).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("Saved JSON files")

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
    for fn in ["stacje_orlen.csv", "stacje_orlen_rzetelne.csv", "stacje_orlen_final_1966.csv"]:
        with pathlib.Path(fn).open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
            w.writeheader()
            w.writerows(data)
    logger.info("Saved CSV files")

    post_coords = []
    for row_idx, r in enumerate(data):
        try:
            post_coords.append((round(float(r["Latitude"]), 6), round(float(r["Longitude"]), 6)))
        except Exception:
            logger.exception("Invalid post coordinate at row=%d id=%s", row_idx, r.get("ID_Punktu"))
    c2 = Counter(post_coords)
    result = {
        "attempted": attempted,
        "updated": updated,
        "dup_coord_rows_after": sum(v - 1 for v in c2.values() if v > 1),
        "total": len(data),
        "max_attempts": max_attempts,
    }
    logger.info("Run summary: %s", result)
    print(result)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:
        logger.error("Fatal error in geocode_duplicate_coords.py")
        logger.error(traceback.format_exc())
        raise SystemExit(1)
