/** OSM raster only. No Maps JS key, no CARTO key. */
export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export type TileHealthEvent = "tileload" | "tileerror" | "load";

/** One failed tile is not a layer gap. Gap only after a full load with zero successes. */
export function resolveTileHealth(
  loaded: number,
  errors: number,
  event: TileHealthEvent,
): "ok" | "gap" | null {
  if (event === "tileload") return "ok";
  if (event === "load") return loaded === 0 && errors > 0 ? "gap" : "ok";
  return null;
}

/** Roads toggle actually changes visible tiles: OSM on, none off. */
export function tileUrlForRoads(roadsOn: boolean): string | null {
  return roadsOn ? OSM_TILE_URL : null;
}
