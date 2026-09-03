# Ground

A map that stops being a confident black box and becomes a checkable decision a human and an AI agent can both stand behind.

**Live:** [https://tayyab415.github.io/ground/](https://tayyab415.github.io/ground/) — served from `/docs`. Vite `BASE_PATH=/ground/` matches project Pages at that URL.

MIT license is [`LICENSE`](./LICENSE) at the repo root (also copied into [`docs/LICENSE`](./docs/LICENSE)).

Codex on the left. Ground in the browser on the right. The agent drives the map through WebMCP (`document.modelContext.registerTool`). Same commands as the visible UI.

This is not an OpenStreetMap clone. OSM tiles and public datasets are evidence. The product is the shared workspace: mission, candidates, layers, unsaved selection (including lasso/polygon), corrections, GroundCheck, decision record.

See `PLAN.md` for the product shape.

## North-star loop

No in-app chatbot. No spawned Codex-army UI.

0. Pick a region (`set_region` or the **Region** select in the left panel): Uttar Pradesh, Maharashtra (Vidarbha + Konkan), or the US Mississippi Delta. Switching re-centers the map and resets the ranking/corrections for that region.
1. Open the desk. Click **Start analysis** (or ask the agent to call `show_candidates`).
2. Ranked districts/counties for the active region appear. In UP, Gorakhpur leads because of an **unverified year-round canal** prior — not because of a fake NDVI.
3. Open Gorakhpur evidence (`open_evidence` / View details). Crop health shows a **dated Earth Engine snapshot** where we have it. Ambedkar Nagar NDVI is a gap (not invented). Flood is a gap. The weak card is still canal irrigation.
4. Human: the canal is seasonal. Apply the correction (`apply_correction`) or preview it first (`preview_scenario`).
5. Ranking moves, with before/after ranks. NDVI stays out of the ranking while coverage is incomplete.
6. **Send GroundCheck** (`send_ground_check`) for a real field photo + short answer + GPS + timestamp. The desk never invents a reply. Same-browser localStorage can receive a reply. A mobile officer on another device is a **gap** unless a real shared store exists — we do not invent one. If the store is down, the check is a gap.
7. Open the field link **in this browser**, reply. Human **Approve evidence** (`approve_evidence`).
8. **Approve** the decision (human only). **Share** / `export_decision` writes a JSON record with sources, corrections, GroundChecks, gaps, and a SHA-256 hash.

Draw a **polygon** or **lasso** on the map. `get_current_selection` reads that unsaved geometry from this tab only — not a server roundtrip.

## WebMCP tools

Registered on the page when the browser supports WebMCP. Each tool calls the same function as the UI control. Unsaved selection/corrections/GroundChecks are readable only through WebMCP, not a REST API.

| Tool | Role |
| --- | --- |
| `get_workspace_state` | Mission, candidates, layers, unsaved changes |
| `get_current_selection` | Unsaved district / polygon / lasso / point in this tab |
| `get_visible_map_state` | Bounds, zoom, OSM tiles, layers |
| `get_open_evidence` | Open evidence card |
| `get_unsaved_changes` | Unsaved human selection and uncommitted corrections (this tab only) |
| `show_candidates` | Rank and overlay candidates |
| `open_evidence` | Open a district evidence card |
| `highlight_uncertainty` | Mark unverified assumptions |
| `preview_scenario` | Re-rank preview (not committed) |
| `apply_correction` | Apply canal correction and re-rank (unsaved) |
| `set_region` | Switch region (up / maharashtra / us); resets ranking + corrections |
| `get_ground_checks` | Read GroundChecks + replies (never invented) |
| `send_ground_check` | Create a field check (question + location + due date) |
| `approve_evidence` | Mark a real field reply as verified; parses the officer's answer and applies the irrigation correction it implies |
| `export_decision` | Decision record + hash |

If `document.modelContext` is missing, the desk still works. The agent just cannot see the tab until a WebMCP-capable client loads the page.

## Honest sources

| Layer | Source | If missing |
| --- | --- | --- |
| Basemap | OSM raster tiles (no Maps JS key). Roads toggle adds/removes those tiles. | Tile gap banner; polygons still work |
| Districts | UP: `udit-001/india-maps-data`; Maharashtra: OSM boundary relations (`scripts/build-region-snapshot.py`); US: OSM county relations (`scripts/build-region-snapshot-us.py`) | Pools are 12–14 districts/counties per region, not full censuses |
| Soil | ISRIC SoilGrids 2.0 point sample at centroid | Factor dropped, weights renormalized |
| Elevation | Open-Meteo Elevation API (SRTM-based) | Factor dropped |
| NDVI | UP: dated EE snapshot (`src/data/ndvi-ee-snapshot.json`), Sentinel-2 SR Harmonized, 60 m, 64 scenes, as of 2026-07-29…08-27. Maharashtra/US: no snapshot rows — NDVI is a gap, not invented. Live EE is a **private** IAM/token-gated Cloud Run sidecar (`ground-analysis`); a private build may point `VITE_ANALYSIS_URL` at it. | Ambedkar Nagar is a gap. Jaunpur was computed but is outside the V1 pool. No number is invented. Ranking drops NDVI while coverage is partial. |
| Mills | Places API (New) via that same private sidecar, else OSM Overpass | Gap in this snapshot (Overpass 504) |
| Irrigation | Explicit model prior (challengeable) | The canal fact is the point of the product |
| Flood | Not loaded | Gap; flood constraint is not enforced |
| Geocode / directions | Sidecar ADC only | Public desk does not call them |
| GroundCheck replies | Same-browser localStorage after a real field submit | Mobile officer on another device is a gap unless a real shared store exists. No store is invented. Photo/GPS are not collected without a store hit. |

Mockup scores from the visual spec are **not** used.

## Run locally

```bash
npm install
npm test
npm run dev
```

Optional analysis sidecar is **private** (token + Cloud Run IAM-only). Judges use the static desk; `VITE_ANALYSIS_URL` stays empty in the public build. See `server/README.md`. Do not publish `/v1/ndvi`, Places, geocode, or directions without auth. Do not CORS-open compute. Do not mint Maps keys. Do not put the sidecar URL or token in the public Pages bundle.

**Private build with the Cloud Run sidecar.** The service `ground-analysis` is deployed at
`https://ground-analysis-1027824348124.us-central1.run.app` (IAM-only + `GROUND_SIDECAR_TOKEN`,
verified to return real Sentinel-2 NDVI). A non-public build may point at it:

```bash
VITE_ANALYSIS_URL=https://ground-analysis-1027824348124.us-central1.run.app npm run build
```

The browser then calls `/v1/ndvi` with the operator's own Google identity (add
`roles/run.invoker` to the service for that account). No token ever ships in the bundle.
The Pages build stays on the dated EE snapshot so the public desk never depends on private auth.

The committed static desk lives in `/docs` (`npm run snapshot:docs`).

## Out of scope

In-app chatbot, spawned Codex army UI, minting a browser Maps key.

## License

MIT. Required for the OpenAI WebMCP Challenge (public repo, license visible).
