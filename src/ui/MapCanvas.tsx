import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { selectDistrict, setMapView } from "../lib/commands";
import { choroplethMode, districtFill, rankColor } from "../lib/format";
import { SNAPSHOT } from "../lib/rank";
import { resolveTileHealth } from "../lib/tiles";
import { useWorkspace } from "../lib/useWorkspace";

const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const LIGHT_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

function makeTiles(roads: boolean) {
  return roads
    ? L.tileLayer(OSM, { attribution: OSM_ATTR, maxZoom: 18 })
    : L.tileLayer(LIGHT, { attribution: LIGHT_ATTR, maxZoom: 19, subdomains: "abcd" });
}

function bindTileHealth(tiles: L.TileLayer) {
  let loaded = 0;
  let errors = 0;
  const apply = (event: "tileload" | "tileerror" | "load") => {
    const next = resolveTileHealth(loaded, errors, event);
    if (next) setMapView({ tiles: next });
  };
  tiles.on("tileload", () => {
    loaded += 1;
    apply("tileload");
  });
  tiles.on("tileerror", () => {
    errors += 1;
    apply("tileerror");
  });
  tiles.on("load", () => apply("load"));
}

export function MapCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const roadsRef = useRef<boolean | null>(null);
  const ws = useWorkspace();

  useEffect(() => {
    if (!wrapRef.current || mapRef.current) return;
    const map = L.map(wrapRef.current, {
      center: ws.map.center,
      zoom: ws.map.zoom,
      zoomControl: true,
    });
    const tiles = makeTiles(ws.layers.roads);
    bindTileHealth(tiles);
    tiles.addTo(map);
    tilesRef.current = tiles;
    roadsRef.current = ws.layers.roads;
    const group = L.layerGroup().addTo(map);
    layersRef.current = group;
    mapRef.current = map;
    map.on("moveend", () => {
      const b = map.getBounds();
      setMapView({
        center: [map.getCenter().lat, map.getCenter().lng],
        zoom: map.getZoom(),
        bounds: [
          [b.getSouth(), b.getWest()],
          [b.getNorth(), b.getEast()],
        ],
      });
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (roadsRef.current === ws.layers.roads && tilesRef.current) return;
    if (tilesRef.current) map.removeLayer(tilesRef.current);
    const tiles = makeTiles(ws.layers.roads);
    bindTileHealth(tiles);
    tiles.addTo(map);
    tilesRef.current = tiles;
    roadsRef.current = ws.layers.roads;
  }, [ws.layers.roads]);

  useEffect(() => {
    const group = layersRef.current;
    if (!group) return;
    group.clearLayers();
    const mode = choroplethMode(ws.layers);
    if (ws.layers.districts && ws.geojson) {
      const gj = L.geoJSON(ws.geojson, {
        style: (feat) => {
          const id = (feat?.properties as { id?: string } | null)?.id;
          const cand = ws.candidates.find((c) => c.districtId === id);
          const selected = ws.selection?.districtId === id;
          const uncertain = ws.highlightedUncertainty.includes(id ?? "");
          const outline = cand ? rankColor(cand.rank) : "#64748b";
          const fill = districtFill(mode, cand);
          return {
            color: selected ? "#0f172a" : outline,
            weight: selected ? 3 : uncertain ? 2.5 : 1.5,
            dashArray: uncertain ? "6 4" : undefined,
            fillColor: fill,
            fillOpacity: selected ? 0.6 : cand ? 0.45 : 0.08,
          };
        },
        onEachFeature: (feat, layer) => {
          const id = (feat.properties as { id?: string }).id;
          const name = (feat.properties as { name?: string }).name ?? id;
          const cand = ws.candidates.find((c) => c.districtId === id);
          const fillHint =
            mode === "rank"
              ? "rank"
              : mode === "ndvi"
                ? "NDVI fill"
                : mode === "soil"
                  ? "soil fill"
                  : "elevation fill";
          layer.bindTooltip(
            cand ? `${cand.rank}. ${name}  ${cand.scoreDisplay} · ${fillHint}` : name ?? "",
          );
          layer.on("click", () => {
            if (id) selectDistrict(id);
          });
        },
      });
      gj.addTo(group);
    }
    if (ws.layers.mills) {
      for (const d of Object.values(SNAPSHOT.districts)) {
        if (d.mills && d.mills.status !== "gap" && typeof d.mills.count === "number" && d.mills.count > 0) {
          L.circleMarker([d.centroid.lat, d.centroid.lon], {
            radius: 5,
            color: "#0f766e",
            fillOpacity: 0.9,
          })
            .bindTooltip(`${d.name}: OSM mill matches`)
            .addTo(group);
        }
      }
    }
  }, [ws.geojson, ws.candidates, ws.selection, ws.layers, ws.highlightedUncertainty]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ws.selection) return;
    const c = SNAPSHOT.districts[ws.selection.districtId]?.centroid;
    if (c) map.panTo([c.lat, c.lon]);
  }, [ws.selection]);

  return <div ref={wrapRef} style={{ height: "100%", width: "100%" }} />;
}
