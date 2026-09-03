"""Ground analysis sidecar — private / optional.

Judges use the static OSM desk. This process is NOT a public deploy.

Auth (both required in spirit; either is enough to reject anonymous compute):
  - GROUND_SIDECAR_TOKEN: prefer X-Ground-Token; also accept Authorization Bearer
    if it is the sidecar token. Cloud Run IAM Bearer must not hide X-Ground-Token.
  - Cloud Run: deploy with --no-allow-unauthenticated (IAM-only)

If GROUND_SIDECAR_TOKEN is unset, compute routes always 401.
CORS is not wide-open. Do not put a Maps JS key in the browser.
Do not print tokens.
"""

from __future__ import annotations

import json
import os
import secrets
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

from flask import Flask, jsonify, request

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "gen-lang-client-0261050164")
SIDECAR_TOKEN = os.environ.get("GROUND_SIDECAR_TOKEN", "").strip()

app = Flask(__name__)

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


def _header_tokens() -> list[str]:
    """Collect sidecar-token candidates. Prefer X-Ground-Token.

    Cloud Run IAM uses Authorization: Bearer <identity token>. That must not
    hide a valid X-Ground-Token. The sidecar secret is accepted from either
    header so clients can send Bearer <GROUND_SIDECAR_TOKEN> without IAM.
    """
    tokens: list[str] = []
    xt = request.headers.get("X-Ground-Token", "").strip()
    if xt:
        tokens.append(xt)
    auth = request.headers.get("Authorization", "").strip()
    if auth.lower().startswith("bearer "):
        bearer = auth[7:].strip()
        if bearer and bearer not in tokens:
            tokens.append(bearer)
    return tokens


def _matches_sidecar_token(presented: str, expected: str) -> bool:
    if not presented or not expected or len(presented) != len(expected):
        return False
    return secrets.compare_digest(presented, expected)


def require_sidecar_auth():
    """Reject anonymous compute. Token must be set AND match."""
    if not SIDECAR_TOKEN:
        return (
            jsonify(
                status="gap",
                error="unauthorized",
                reason="Sidecar is private. Set GROUND_SIDECAR_TOKEN and send it, or use Cloud Run IAM-only. Compute routes are not public.",
            ),
            401,
        )
    if not any(_matches_sidecar_token(t, SIDECAR_TOKEN) for t in _header_tokens()):
        return (
            jsonify(
                status="gap",
                error="unauthorized",
                reason="Missing or invalid sidecar token.",
            ),
            401,
        )
    return None


_CHECKS: dict[str, dict[str, Any]] = {}

# GAUL ADM2 names for the V1 eastern UP pool. Siddharthnagar = GAUL "Siddharth Nagar".
GAUL_ADM2 = {
    "gorakhpur": "Gorakhpur",
    "deoria": "Deoria",
    "kushinagar": "Kushinagar",
    "maharajganj": "Maharajganj",
    "basti": "Basti",
    "sant-kabir-nagar": "Sant Kabir Nagar",
    "siddharthnagar": "Siddharth Nagar",
    "azamgarh": "Azamgarh",
    "mau": "Mau",
    "ballia": "Ballia",
    "ghazipur": "Ghazipur",
    "ambedkar-nagar": "Ambedkar Nagar",
    "jaunpur": "Jaunpur",
}


def ee_filter_end_exclusive(inclusive_end: date) -> date:
    """Earth Engine filterDate end is exclusive. +1 day keeps as-of-day scenes."""
    return inclusive_end + timedelta(days=1)


MAX_NDVI_INCLUSIVE_DAYS = 30


class NdviWindowError(ValueError):
    """Caller asked for an NDVI date window this sidecar will not run."""


def ndvi_date_window(payload: dict[str, Any]) -> tuple[date, date]:
    """Inclusive start/end. Rejects start>end and windows longer than 30 inclusive days."""
    try:
        as_of = payload.get("endDate") or datetime.now(timezone.utc).date().isoformat()
        end = datetime.fromisoformat(str(as_of)[:10]).date()
        start = (
            datetime.fromisoformat(str(payload["startDate"])[:10]).date()
            if payload.get("startDate")
            else (end - timedelta(days=MAX_NDVI_INCLUSIVE_DAYS - 1))
        )
    except ValueError as exc:
        raise NdviWindowError("Invalid startDate or endDate.") from exc
    if start > end:
        raise NdviWindowError("startDate must not be after endDate.")
    inclusive_days = (end - start).days + 1
    if inclusive_days > MAX_NDVI_INCLUSIVE_DAYS:
        raise NdviWindowError(
            f"NDVI window is {inclusive_days} inclusive days; maximum is {MAX_NDVI_INCLUSIVE_DAYS}. "
            "A 366-day caller window is not accepted."
        )
    return start, end


def _adc_request(url: str, body: dict[str, Any], headers: dict[str, str], timeout: int = 12) -> dict[str, Any]:
    import google.auth
    import google.auth.transport.requests
    import urllib.request

    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    creds.refresh(google.auth.transport.requests.Request())
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {creds.token}",
            "X-Goog-User-Project": PROJECT,
            "Content-Type": "application/json",
            **headers,
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


@app.get("/health")
def health():
    """Probe only. Does not run Earth Engine or Places."""
    return jsonify(ok=True, sidecar="private", token_configured=bool(SIDECAR_TOKEN))


@app.post("/v1/ndvi")
def ndvi():
    """District-polygon 30-day Sentinel-2 NDVI. Auth required. No centroid buffers."""
    denied = require_sidecar_auth()
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    try:
        start, end = ndvi_date_window(payload)
    except NdviWindowError as exc:
        return (
            jsonify(status="gap", error="invalid_window", reason=str(exc), districts=[]),
            400,
        )
    if not _ee_ok:
        return jsonify(
            status="gap",
            reason=f"Earth Engine unavailable: {_ee_error}",
            project=PROJECT,
            districts=[],
        )
    districts = payload.get("districts") or []
    try:
        import ee

        start_s, end_s = start.isoformat(), end.isoformat()
        end_exclusive = ee_filter_end_exclusive(end).isoformat()
        ids = [str(d.get("id") or "") for d in districts if d.get("id")]
        gaul_names = []
        id_by_gaul: dict[str, str] = {}
        for did in ids:
            name = GAUL_ADM2.get(did)
            if not name:
                continue
            gaul_names.append(name)
            id_by_gaul[name] = did
        if not gaul_names:
            return jsonify(
                status="gap",
                reason="No requested district maps to FAO/GAUL/2015/level2. Centroid buffers are not used.",
                districts=[],
            )

        t0 = time.time()
        gaul = (
            ee.FeatureCollection("FAO/GAUL/2015/level2")
            .filter(ee.Filter.eq("ADM0_NAME", "India"))
            .filter(ee.Filter.eq("ADM1_NAME", "Uttar Pradesh"))
            .filter(ee.Filter.inList("ADM2_NAME", gaul_names))
        )

        def mask_ndvi(img: Any) -> Any:
            scl = img.select("SCL")
            qa = img.select("QA60")
            nd = img.normalizedDifference(["B8", "B4"]).rename("NDVI")
            cloud = qa.bitwiseAnd(1 << 10).Or(qa.bitwiseAnd(1 << 11))
            return nd.updateMask(scl.gte(4).And(scl.lte(6))).updateMask(cloud.eq(0))

        col = (
            ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(gaul.geometry())
            .filterDate(start_s, end_exclusive)
            .map(mask_ndvi)
        )
        n_scenes = int(col.size().getInfo() or 0)
        latest = None
        if n_scenes:
            latest = col.sort("system:time_start", False).first().get("system:time_start").getInfo()
        if time.time() - t0 > 40:
            return jsonify(
                status="gap",
                reason="Earth Engine too slow. No partial NDVI is returned.",
                districts=[],
            )
        median = col.median()
        reduced = median.reduceRegions(
            collection=gaul,
            reducer=ee.Reducer.mean(),
            scale=60,
            tileScale=2,
        )
        info = reduced.getInfo() or {}
        latest_iso = None
        if isinstance(latest, (int, float)):
            latest_iso = datetime.fromtimestamp(latest / 1000, tz=timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )
        out: list[dict[str, Any]] = []
        for feat in info.get("features") or []:
            props = feat.get("properties") or {}
            gaul_name = props.get("ADM2_NAME")
            did = id_by_gaul.get(str(gaul_name)) if gaul_name else None
            value = props.get("NDVI")
            if not did or value is None:
                continue
            try:
                ndvi_v = float(value)
            except (TypeError, ValueError):
                continue
            if not (-1 <= ndvi_v <= 1):
                continue
            out.append(
                {
                    "id": did,
                    "ndvi": ndvi_v,
                    "startDate": start_s,
                    "endDate": end_s,
                    "source": {
                        "name": "Google Earth Engine / Sentinel-2 SR Harmonized",
                        "url": "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED",
                        "note": (
                            f"District-polygon mean NDVI. FAO/GAUL/2015/level2, SCL 4-6 + QA60, "
                            f"scale 60m, {n_scenes} scenes"
                            + (f", latest_scene {latest_iso}" if latest_iso else "")
                            + ". Siddharthnagar = GAUL Siddharth Nagar."
                        ),
                    },
                }
            )
        if not out:
            return jsonify(
                status="gap",
                reason="Earth Engine ran the 30-day polygon recipe but produced no NDVI means.",
                districts=[],
                recipe={
                    "startDate": start_s,
                    "endDate": end_s,
                    "scenes": n_scenes,
                    "latest_scene": latest_iso,
                    "scaleMeters": 60,
                    "cloudMask": "SCL 4-6 + QA60",
                    "datasets": ["COPERNICUS/S2_SR_HARMONIZED", "FAO/GAUL/2015/level2"],
                },
            )
        return jsonify(
            status="ok",
            districts=out,
            recipe={
                "startDate": start_s,
                "endDate": end_s,
                "scenes": n_scenes,
                "latest_scene": latest_iso,
                "scaleMeters": 60,
                "cloudMask": "SCL 4-6 + QA60",
                "datasets": ["COPERNICUS/S2_SR_HARMONIZED", "FAO/GAUL/2015/level2"],
            },
        )
    except Exception as exc:  # noqa: BLE001
        return jsonify(status="gap", reason=f"Earth Engine error: {exc}", districts=[])


@app.post("/v1/places/rice-mills")
def rice_mills():
    """Places API (New) text search via ADC. Auth required. Never a browser key."""
    denied = require_sidecar_auth()
    if denied:
        return denied
    try:
        payload = request.get_json(silent=True) or {}
        lat = float(payload["lat"])
        lon = float(payload["lon"])
        data = _adc_request(
            "https://places.googleapis.com/v1/places:searchText",
            {
                "textQuery": "rice mill",
                "locationBias": {
                    "circle": {
                        "center": {"latitude": lat, "longitude": lon},
                        "radius": 15000.0,
                    }
                },
            },
            {"X-Goog-FieldMask": "places.displayName,places.location"},
        )
        places = data.get("places") or []
        return jsonify(status="ok", count=len(places), places=places)
    except Exception as exc:  # noqa: BLE001
        return jsonify(status="gap", reason=f"Places ADC unavailable: {exc}", places=[])


@app.post("/v1/geocode")
def geocode():
    """Server-side geocode via Places ADC. Auth required. No Maps JS key."""
    denied = require_sidecar_auth()
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    query = str(payload.get("q") or payload.get("address") or "").strip()
    if not query:
        return jsonify(status="gap", reason="Missing q.", results=[]), 400
    try:
        data = _adc_request(
            "https://places.googleapis.com/v1/places:searchText",
            {"textQuery": query},
            {"X-Goog-FieldMask": "places.displayName,places.location,places.formattedAddress"},
        )
        places = data.get("places") or []
        if not places:
            return jsonify(status="gap", reason="No geocode match.", results=[])
        return jsonify(status="ok", results=places)
    except Exception as exc:  # noqa: BLE001
        return jsonify(status="gap", reason=f"Geocode ADC unavailable: {exc}", results=[])


@app.post("/v1/directions")
def directions():
    """Server-side Routes API via ADC. Auth required. No Maps JS key."""
    denied = require_sidecar_auth()
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    origin = payload.get("origin") or {}
    dest = payload.get("destination") or {}
    try:
        olat, olon = float(origin["lat"]), float(origin["lon"])
        dlat, dlon = float(dest["lat"]), float(dest["lon"])
    except (KeyError, TypeError, ValueError):
        return jsonify(status="gap", reason="origin and destination need lat/lon.", routes=[]), 400
    try:
        data = _adc_request(
            "https://routes.googleapis.com/directions/v2:computeRoutes",
            {
                "origin": {"location": {"latLng": {"latitude": olat, "longitude": olon}}},
                "destination": {"location": {"latLng": {"latitude": dlat, "longitude": dlon}}},
                "travelMode": "DRIVE",
            },
            {"X-Goog-FieldMask": "routes.duration,routes.distanceMeters"},
        )
        routes = data.get("routes") or []
        if not routes:
            return jsonify(status="gap", reason="No route returned.", routes=[])
        return jsonify(status="ok", routes=routes)
    except Exception as exc:  # noqa: BLE001
        return jsonify(status="gap", reason=f"Directions ADC unavailable: {exc}", routes=[])


@app.post("/v1/ground-checks")
def create_ground_check():
    """Create a field check. Auth required. Does not invent a reply."""
    denied = require_sidecar_auth()
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    question = str(payload.get("question") or "").strip()
    if not question:
        return jsonify(status="gap", error="question required"), 400
    cid = secrets.token_urlsafe(12)
    row = {
        "id": cid,
        "districtId": payload.get("districtId"),
        "question": question,
        "location": payload.get("location"),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "reply": None,
    }
    _CHECKS[cid] = row
    return jsonify(status="ok", check=row)


@app.get("/v1/ground-checks/<cid>")
def get_ground_check(cid: str):
    denied = require_sidecar_auth()
    if denied:
        return denied
    row = _CHECKS.get(cid)
    if not row:
        return jsonify(status="gap", reason="Unknown check. No reply was invented."), 404
    return jsonify(status="ok", check=row)


@app.post("/v1/ground-checks/<cid>/reply")
def reply_ground_check(cid: str):
    """Store a real field reply. Never generates photo/GPS/answer."""
    denied = require_sidecar_auth()
    if denied:
        return denied
    row = _CHECKS.get(cid)
    if not row:
        return jsonify(status="gap", reason="Unknown check. No reply was invented."), 404
    payload = request.get_json(silent=True) or {}
    answer = str(payload.get("answer") or "").strip()
    photo = payload.get("photoDataUrl")
    if not answer or not photo:
        return jsonify(
            status="gap",
            reason="Photo and short answer are required. Sidecar will not fake a field reply.",
        ), 400
    row["reply"] = {
        "answer": answer,
        "photoDataUrl": photo,
        "gps": payload.get("gps"),
        "gpsGap": payload.get("gpsGap"),
        "capturedAt": payload.get("capturedAt") or datetime.now(timezone.utc).isoformat(),
        "receivedAt": datetime.now(timezone.utc).isoformat(),
        "store": "sidecar",
    }
    return jsonify(status="ok", check=row)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
