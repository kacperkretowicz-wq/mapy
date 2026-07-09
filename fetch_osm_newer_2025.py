import json
import pathlib
import urllib.parse
import urllib.request

q = """[out:json][timeout:120];
area["ISO3166-1"="PL"]->.searchArea;
(
  node["amenity"="fuel"]["brand"~"Orlen",i](area.searchArea)(newer:"2025-01-01");
  way["amenity"="fuel"]["brand"~"Orlen",i](area.searchArea)(newer:"2025-01-01");
);
out center tags;"""

url = "https://overpass.kumi.systems/api/interpreter"
req = urllib.request.Request(
    url,
    data=urllib.parse.urlencode({"data": q}).encode("utf-8"),
    headers={"User-Agent": "mapy-main-audit/1.0", "Content-Type": "application/x-www-form-urlencoded"},
)
with urllib.request.urlopen(req, timeout=120) as resp:
    data = json.loads(resp.read().decode("utf-8"))

pathlib.Path("osm_orlen_newer_2025.json").write_text(
    json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
)
print("newer_2025_count", len(data.get("elements", [])))
for e in data.get("elements", [])[:30]:
    t = e.get("tags", {})
    c = e.get("center") or e
    print(e.get("id"), t.get("ref"), t.get("name"), t.get("addr:city"), c.get("lat"), c.get("lon"))
