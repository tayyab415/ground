export function closeRing(coords: [number, number][]): [number, number][] {
  if (coords.length === 0) return coords;
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) return coords;
  return [...coords, first];
}

export function polygonFromLonLat(coords: [number, number][]): GeoJSON.Polygon | null {
  if (coords.length < 3) return null;
  const ring = closeRing(coords);
  return { type: "Polygon", coordinates: [ring] };
}

export function pointGeometry(lat: number, lon: number): GeoJSON.Point {
  return { type: "Point", coordinates: [lon, lat] };
}

export function vertexCount(geom: GeoJSON.Geometry | undefined): number {
  if (!geom) return 0;
  if (geom.type === "Polygon") return Math.max(0, (geom.coordinates[0]?.length ?? 1) - 1);
  if (geom.type === "LineString") return geom.coordinates.length;
  if (geom.type === "Point") return 1;
  return 0;
}
