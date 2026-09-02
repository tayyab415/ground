# Ground

A map that stops being a confident black box and becomes a checkable decision a human and an AI agent can both stand behind.

**Live desk (V1):** [https://tayyab415.github.io/ground/](https://tayyab415.github.io/ground/)

Codex on the left. Ground in the browser on the right. The agent drives the map through WebMCP (`document.modelContext.registerTool`). Same commands as the visible UI.

This is not an OpenStreetMap clone. OSM tiles and public datasets are evidence. The product is the shared workspace: mission, candidates, layers, unsaved selection, corrections, decision record.

See `PLAN.md` for the product shape. MIT license is in [`LICENSE`](./LICENSE).

## North-star loop (V1)

No field network. No chatbot in this app.

1. Open the live desk. Click **Start analysis** (or ask the agent to call `show_candidates`).
2. Ranked eastern Uttar Pradesh rice-belt districts appear. Gorakhpur leads because of an **unverified year-round canal** prior — not because of a fake NDVI.
3. Open Gorakhpur evidence (`open_evidence` / View details). The weak card is canal irrigation.
4. Human: the canal is seasonal. Apply the correction (`apply_correction`) or preview it first (`preview_scenario`).
5. Ranking moves, with before/after ranks. NDVI stays a **gap** unless Earth Engine actually answered.
6. **Approve** (human only). **Share** / `export_decision` writes a JSON record with sources, corrections, gaps, and a SHA-256 hash.

## WebMCP tools

Registered on the page when the browser supports WebMCP. Each tool calls the same function as the UI control.

| Tool | Role |
| --- | --- |
| `get_workspace_state` | Mission, candidates, layers, unsaved changes |
| `get_current_selection` | Unsaved district/polygon in this tab |
| `get_visible_map_state` | Bounds, zoom, OSM tiles, layers |
| `get_open_evidence` | Open evidence card |
| `show_candidates` | Rank and overlay candidates |
| `open_evidence` | Open a district evidence card |
| `highlight_uncertainty` | Mark unverified assumptions |
| `preview_scenario` | Re-rank preview (not committed) |
| `apply_correction` | Apply canal correction and re-rank (unsaved) |
| `export_decision` | Decision record + hash |

If `document.modelContext` is missing, the desk still works. The agent just cannot see the tab until a WebMCP-capable client (ChatGPT/Codex desktop, or Chrome with WebMCP) loads the page.

## Honest sources (V1)

| Layer | Source | If missing |
| --- | --- | --- |
| Basemap | OSM raster tiles (no Maps JS key) | Tile gap banner; polygons still work |
| Districts | `udit-001/india-maps-data` UP GeoJSON | Pool is 12 eastern rice-belt districts, not all 75 |
| Soil | ISRIC SoilGrids 2.0 point sample at centroid | Factor dropped, weights renormalized |
| Elevation | Open-Meteo Elevation API (SRTM-based) | Factor dropped |
| NDVI | Earth Engine Sentinel-2 via Cloud Run + ADC | **Gap. No number is invented.** |
| Mills | Places API (New) via ADC, else OSM Overpass | Gap in this snapshot (Overpass 504) |
| Irrigation | Explicit model prior (challengeable) | The canal fact is the point of the product |
| Flood | Not loaded | Gap; flood constraint is not enforced |

Mockup scores from the visual spec are **not** used.

## Run locally

```bash
npm install
npm test
npm run dev
```

Optional analysis sidecar (ADC, never a browser key): see `server/README.md`. Set `VITE_ANALYSIS_URL` at build time. Leave it empty for the public static desk.

## Out of scope (V1)

GroundCheck mobile/SMS, spawned Codex army, click-automation A/B, OSM clone, in-app chatbot.

## License

MIT. Required for the OpenAI WebMCP Challenge (public repo, license visible).
