#!/usr/bin/env python3
"""Build a Ground region snapshot + filtered GeoJSON for a new Indian state.

Usage:
    python3 scripts/build-region-snapshot.py maharashtra "bhandara gondia ..." \
        --out src/data/snapshot-maharashtra.json \
        --geojson-out docs/data/maharashtra-rice-districts.geojson

Data:
  - Boundaries: udit-001/india-maps-data (geojson/states/<state>.geojson)
  - Soil: ISRIC SoilGrids 2.0 point sample (clay/sand/silt, 0-5cm mean)
  - Elevation: Open-Meteo Elevation API (SRTM-based)
Honest defaults baked in: mills=gap, flood gap, no invented values.
"""
import argparse, json, re, subprocess, sys, time

GEOJSON_BASE = "https://raw.githubusercontent.com/udit-001/india-maps-data/main/geojson/states"

def curl_json(url):
    r = subprocess.run(["curl", "-s", "--max-time", "25", url], capture_output=True, text=True)
    return json.loads(r.stdout)

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.strip().lower()).strip("-")

def centroid(feature):
    pts = []
    def collect(coords):
        if coords and isinstance(coords[0], (int, float)):
            pts.append(coords); return
        for c in coords: collect(c)
    collect(feature["geometry"]["coordinates"])
    n = len(pts)
    return sum(p[1] for p in pts)/n, sum(p[0] for p in pts)/n

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("state")           # "maharashtra"
    ap.add_argument("districts")       # space-separated slugs
    ap.add_argument("--out", required=True)
    ap.add_argument("--geojson-out", required=True)
    args = ap.parse_args()

    want = set(args.districts.split())
    gj = curl_json(f"{GEOJSON_BASE}/{args.state}.geojson")
    key = "id" if "id" in gj["features"][0]["properties"] else "district"
    sel = {}
    for f in gj["features"]:
        name = f["properties"][key]
        if slug(name) in want:
            lat, lon = centroid(f)
            sel[slug(name)] = {"id": slug(name), "name": name,
                               "geometry": f["geometry"],
                               "centroid": {"lat": round(lat,5), "lon": round(lon,5)}}
    print(f"selected {len(sel)} of {len(want)} districts")
    assert len(sel) == len(want), "missing districts: " + ",".join(want - set(sel))

    fc = {"type":"FeatureCollection","features":[
        {"type":"Feature","properties":{"id":v["id"],"name":v["name"],"st_nm":args.state},
         "geometry":v["geometry"]} for v in sel.values()]}
    json.dump(fc, open(args.geojson_out, "w"))

    districts = {}
    for pid, v in sel.items():
        lat, lon = v["centroid"]["lat"], v["centroid"]["lon"]
        try:
            soil = None
            data = curl_json(f"https://rest.isric.org/soilgrids/v2.0/properties/query?lon={lon}&lat={lat}"
                             f"&property=clay&property=sand&property=silt&depth=0-5cm&value=mean")
            layers = {l["name"]: l for l in data["properties"]["layers"]}
            props = {g: {"mean": layers[g]["depths"][0]["values"]["mean"], "unit": "g/kg",
                         "conversion_factor": None} for g in ["clay","sand","silt"]}
            soil = {"properties": props, "source": "ISRIC SoilGrids 2.0",
                    "url": "https://rest.isric.org/soilgrids/v2.0/docs",
                    "query": {"lat": round(lat,5), "lon": round(lon,5), "depth":"0-5cm"}}
            elev = curl_json(f"https://api.open-meteo.com/v1/elevation?latitude={lat}&longitude={lon}")["elevation"][0]
        except Exception as e:
            print("ERR", pid, e); soil = None; elev = None
        districts[pid] = {
            "id": pid, "name": v["name"], "centroid": {"lon": lon, "lat": lat},
            "soil": soil,
            "elevation": {"meters": round(elev,1), "source": "Open-Meteo Elevation API (SRTM-based)",
                          "url": "https://open-meteo.com/en/docs/elevation-api",
                          "query": {"lat": round(lat,5), "lon": round(lon,5)}} if elev is not None else None,
            "error": [],
            "mills": {"status":"gap","reason":"Overpass API unavailable",
                      "source":"OpenStreetMap via Overpass API"},
        }
        time.sleep(0.3)
        print(pid, v["name"], "soil:", bool(soil), "elev:", elev)

    snap = {"retrievedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "region": args.state, "districts": districts}
    json.dump(snap, open(args.out, "w"), indent=1)
    print(f"wrote {args.out} and {args.geojson_out}")

if __name__ == "__main__":
    main()
