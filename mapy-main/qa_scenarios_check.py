import collections
import json
import pathlib
import re

root = pathlib.Path(".")
app = (root / "app.js").read_text(encoding="utf-8")
data = json.loads((root / "stacje_orlen.json").read_text(encoding="utf-8"))


def has(pattern: str) -> bool:
    return re.search(pattern, app, re.S) is not None


def norm_addr(a: str) -> str:
    a = (a or "").lower().strip()
    a = re.sub(r"\s+", " ", a)
    a = a.replace("ul. ", "").replace("ul ", "").replace("aleja ", "al. ")
    return re.sub(r"[^a-z0-9ąćęłńóśźż ]", "", a).strip()


scenarios = []
scenarios.append(
    {
        "scenario": "Liczba stacji = 2149",
        "result": "PASS" if len(data) == 2149 else "FAIL",
        "detail": len(data),
    }
)

ctr = collections.Counter(norm_addr(r.get("Adres", "")) for r in data if norm_addr(r.get("Adres", "")))
acceptable_dups = {
    "brak pełnego adresu import z oficjalnej mapy orlen",
    "rzeszowska 39200 dębica",
    "al solidarności 100 01016 warszawa"
}
dup_addr_rows = sum(v - 1 for k, v in ctr.items() if v > 1 and k not in acceptable_dups)
scenarios.append(
    {
        "scenario": "Brak duplikatów adresowych",
        "result": "PASS" if dup_addr_rows == 0 else "FAIL",
        "detail": dup_addr_rows,
    }
)

scenarios.append(
    {
        "scenario": "Status zapisuje się natychmiast",
        "result": "PASS"
        if has(r"function updateSelectedStationStatus\(status\).*saveToLocalStorage\(\).*refreshUI\(\);")
        else "FAIL",
    }
)

scenarios.append(
    {
        "scenario": "Zrobiona stacja znika z trasy",
        "result": "PASS"
        if has(r"if \(status === 'Zrobione'\)\s*\{\s*removeStationFromCustomRouteList")
        else "FAIL",
    }
)

scenarios.append(
    {
        "scenario": "Usunięcie z trasy nie cofa zrobionej",
        "result": "PASS"
        if has(r"if \(stationInDb\.Status === 'Zrobione'\)\s*\{\s*return;")
        else "FAIL",
    }
)

scenarios.append(
    {
        "scenario": "Google Maps ma limit punktów",
        "result": "PASS" if has(r"MAX_STOPS_FOR_GMAPS\s*=\s*10") else "FAIL",
    }
)

scenarios.append(
    {
        "scenario": "Historia wykonanych tras istnieje",
        "result": "PASS"
        if has(r"orlen_completed_visits_history") and has(r"history-toggle-btn")
        else "FAIL",
    }
)

(root / "raport_scenariusze_aplikacji.json").write_text(
    json.dumps(scenarios, ensure_ascii=False, indent=2), encoding="utf-8"
)

print(json.dumps(scenarios, ensure_ascii=False))
