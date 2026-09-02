"""Ground analysis sidecar.

Cloud Run + Application Default Credentials only.
  ee.Initialize(project='gen-lang-client-0261050164')
  Places API (New) via ADC bearer token + x-goog-user-project.

This service never ships a browser Maps key. If Earth Engine is slow or
unavailable, it returns a gap — callers must not invent NDVI.
"""

from __future__ import annotations

import os
import time
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "gen-lang-client-0261050164")

app = Flask(__name__)
CORS(app)

_ee_ok = False
_ee_error: str | None = None


def init_ee() -> None:
    global _ee_ok, _ee_error
    try:
        import ee

        ee.Initialize(project=PROJECT)
        _ee_ok = True
        _ee_error = None
    except Exception as exc:  # noqa: BLE001 — surface any ADC/EE failure as a gap
        _ee_ok = False
        _ee_error = str(exc)


init_ee()


@app.get("/health")
def health():
    return jsonify(ok=True, ee=_ee_ok, ee_error=_ee_error, project=PROJECT)


@app.post("/v1/ndvi")
def ndvi():
    """Median Sentinel-2 NDVI around each district centroid.

    On any failure, returns HTTP 200 with status=gap so the desk can show the
    gap instead of inventing crop-health numbers.
    """
    if not _ee_ok:
        return jsonify(
            status="gap",
            reason=f"Earth Engine unavailable: {_ee_error}",
            project=PROJECT,
            districts=[],
        )
    payload = request.get_json(silent=True) or {}
    districts = payload.get("districts") or []
    try:
        import ee

        start = "2023-06-01"
        end = "2024-12-31"
        out: list[dict[str, Any]] = []
        t0 = time.time()
        for d in districts:
            if time.time() - t0 > 20:
                return jsonify(
                    status="gap",
                    reason="Earth Engine too slow (>20s). No partial NDVI is returned.",
                    districts=[],
                )
            lat = float(d["lat"])
            lon = float(d["lon"])
            geom = ee.Geometry.Point([lon, lat]).buffer(4000)
            col = (
                ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                .filterBounds(geom)
                .filterDate(start, end)
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30))
            )

            def add_ndvi(img: Any) -> Any:
                return img.normalizedDifference(["B8", "B4"]).rename("NDVI")

            stats = col.map(add_ndvi).median().reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=geom,
                scale=120,
                maxPixels=1_000_000,
            )
            value = stats.get("NDVI").getInfo()
            if value is None:
                continue
            out.append(
                {
                    "id": d.get("id"),
                    "ndvi": float(value),
                    "startDate": start,
                    "endDate": end,
                    "source": {
                        "name": "Google Earth Engine / Sentinel-2 SR Harmonized",
                        "url": "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED",
                    },
                }
            )
        if not out:
            return jsonify(
                status="gap",
                reason="Earth Engine ran but produced no NDVI means.",
                districts=[],
            )
        return jsonify(status="ok", districts=out)
    except Exception as exc:  # noqa: BLE001
        return jsonify(status="gap", reason=f"Earth Engine error: {exc}", districts=[])


@app.post("/v1/places/rice-mills")
def rice_mills():
    """Places API (New) text search via ADC. Never uses a browser key."""
    try:
        import google.auth
        import google.auth.transport.requests
        import urllib.request
        import json

        creds, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        creds.refresh(google.auth.transport.requests.Request())
        payload = request.get_json(silent=True) or {}
        lat = float(payload["lat"])
        lon = float(payload["lon"])
        body = json.dumps(
            {
                "textQuery": "rice mill",
                "locationBias": {
                    "circle": {
                        "center": {"latitude": lat, "longitude": lon},
                        "radius": 15000.0,
                    }
                },
            }
        ).encode()
        req = urllib.request.Request(
            "https://places.googleapis.com/v1/places:searchText",
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {creds.token}",
                "X-Goog-User-Project": PROJECT,
                "X-Goog-FieldMask": "places.displayName,places.location",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode())
        places = data.get("places") or []
        return jsonify(status="ok", count=len(places), places=places)
    except Exception as exc:  # noqa: BLE001
        return jsonify(status="gap", reason=f"Places ADC unavailable: {exc}", places=[])


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
