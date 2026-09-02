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
