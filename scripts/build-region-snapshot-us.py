#!/usr/bin/env python3
"""Build a Ground region snapshot + filtered GeoJSON for US Mississippi Delta counties.

Usage:
    python3 scripts/build-region-snapshot-us.py \
        --counties-json /tmp/us-counties.json \
        --out src/data/snapshot-us.json \
        --geojson-out public/data/us-delta-rice-counties.geojson

Data:
  - Boundaries: US Census county outlines (Plotly geojson export)
  - Soil: ISRIC SoilGrids 2.0 point sample (clay/sand/silt, 0-5cm mean)
  - Elevation: Open-Meteo Elevation API (SRTM-based)
Honest defaults baked in: mills=gap, flood gap, NDVI gap, no invented values.
"""
import argparse, json, re, subprocess, sys, time

# (STATE FIPS, COUNTY FIPS) -> source label (for the human-readable name)
TARGETS = {
    # (STATE FIPS, COUNTY FIPS): expected county NAME
    ("05", "093"): "Mississippi", ("05", "041"): "Desha", ("05", "017"): "Chicot",
    ("28", "151"): "Washington", ("28", "011"): "Bolivar", ("28", "133"): "Sunflower",
    ("28", "083"): "Leflore", ("28", "053"): "Humphreys", ("28", "163"): "Yazoo",
    ("28", "125"): "Sharkey", ("28", "055"): "Issaquena", ("28", "143"): "Tunica",
    ("28", "027"): "Coahoma", ("28", "135"): "Tallahatchie",
}
STATE_ABBR = {"05": "AR", "28": "MS"}

def curl_json(url):
    r = subprocess.run(["curl", "-s", "--max-time", "25", url], capture_output=True, text=True)
    return json.loads(r.stdout)

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.strip().lower()).strip("-")

def ring_area(ring):
    n = len(ring)
    s = 0.0
    for i in range(n - 1):
        s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return s / 2.0

def polygon_centroid(rings):
    """Area-weighted centroid over polygon rings (exterior + holes)."""
    ax = ay = atot = 0.0
    for ring in rings:
        a = ring_area(ring)
        if abs(a) < 1e-12:
            continue
        cx = cy = 0.0
        n = len(ring)
        for i in range(n - 1):
            f = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
            cx += (ring[i][0] + ring[i + 1][0]) * f
            cy += (ring[i][1] + ring[i + 1][1]) * f
        cx /= 6.0 * a
        cy /= 6.0 * a
        ax += cx * a
        ay += cy * a
        atot += a
    return (ay / atot, ax / atot)  # (lat, lon)

def geometry_centroid(geom):
    coords = geom["coordinates"]
    if geom["type"] == "Polygon":
        return polygon_centroid(coords)
    # MultiPolygon: area-weighted across polygons
    lat = lon = atot = 0.0
    for poly in coords:
        a = sum(abs(ring_area(r)) for r in poly)
        la, lo = polygon_centroid(poly)
        lat += la * a; lon += lo * a; atot += a
    return (lat / atot, lon / atot)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--counties-json", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--geojson-out", required=True)
    args = ap.parse_args()

    want = set(TARGETS.keys())
    county = json.load(open(args.counties_json))
    sel = {}
    for f in county["features"]:
        p = f["properties"]
        k = (p["STATE"], p["COUNTY"])
        if k in want:
            assert p["NAME"] == TARGETS[k], f"{k}: got {p['NAME']}, expected {TARGETS[k]}"
            st = STATE_ABBR.get(k[0], k[0])
            cid = slug(f"{p['NAME']}-{st}")
            lat, lon = geometry_centroid(f["geometry"])
            sel[cid] = {
                "id": cid,
                "name": f"{p['NAME']} County, {st}",
                "geometry": f["geometry"],
                "centroid": {"lat": round(lat, 5), "lon": round(lon, 5)},
            }
    print(f"selected {len(sel)} of {len(want)} counties")
    assert len(sel) == len(want), f"missing {len(want) - len(sel)} counties: {set(TARGETS) - set(__import__('itertools'))}"

    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature",
         "properties": {"id": v["id"], "name": v["name"], "st_nm": "US-MS-AR delta"},
         "geometry": v["geometry"]} for v in sel.values()]}
    json.dump(fc, open(args.geojson_out, "w"))

    districts = {}
    for pid, v in sel.items():
        lat, lon = v["centroid"]["lat"], v["centroid"]["lon"]
        soil = None; elev = None
        try:
            data = curl_json(f"https://rest.isric.org/soilgrids/v2.0/properties/query?lon={lon}&lat={lat}"
                             f"&property=clay&property=sand&property=silt&depth=0-5cm&value=mean")
            layers = {l["name"]: l for l in data["properties"]["layers"]}
            props = {g: {"mean": layers[g]["depths"][0]["values"]["mean"], "unit": "g/kg",
                         "conversion_factor": None} for g in ["clay", "sand", "silt"]}
            soil = {"properties": props, "source": "ISRIC SoilGrids 2.0",
                    "url": "https://rest.isric.org/soilgrids/v2.0/docs",
                    "query": {"lat": round(lat, 5), "lon": round(lon, 5), "depth": "0-5cm"}}
        except Exception as e:
            print("SOIL ERR", pid, e)
        try:
            elev = curl_json(f"https://api.open-meteo.com/v1/elevation?latitude={lat}&longitude={lon}")["elevation"][0]
        except Exception as e:
            print("ELEV ERR", pid, e)
        districts[pid] = {
            "id": pid, "name": v["name"], "centroid": {"lon": lon, "lat": lat},
            "soil": soil,
            "elevation": {"meters": round(elev, 1), "source": "Open-Meteo Elevation API (SRTM-based)",
                          "url": "https://open-meteo.com/en/docs/elevation-api",
                          "query": {"lat": round(lat, 5), "lon": round(lon, 5)}} if elev is not None else None,
            "error": [],
            "mills": {"status": "gap", "reason": "Overpass API unavailable",
                      "source": "OpenStreetMap via Overpass API"},
        }
        time.sleep(0.25)
        print(pid, v["name"], "soil:", bool(soil), "elev:", elev)

    snap = {"retrievedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "region": "us", "districts": districts}
    json.dump(snap, open(args.out, "w"), indent=1)
    print(f"wrote {args.out} and {args.geojson_out}")

if __name__ == "__main__":
    main()
