import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { selectDistrict, setMapView } from "../lib/commands";
import { rankColor } from "../lib/format";
import { SNAPSHOT } from "../lib/rank";
import { useWorkspace } from "../lib/useWorkspace";

const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function MapCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const ws = useWorkspace();

  useEffect(() => {
    if (!wrapRef.current || mapRef.current) return;
    const map = L.map(wrapRef.current, {
      center: ws.map.center,
      zoom: ws.map.zoom,
      zoomControl: true,
    });
    const tiles = L.tileLayer(OSM, {
      attribution: ATTR,
      maxZoom: 18,
    });
    tiles.on("tileerror", () => setMapView({ tiles: "gap" }));
    tiles.addTo(map);
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
    const group = layersRef.current;
    if (!map || !group) return;
    group.clearLayers();
    if (ws.layers.districts && ws.geojson) {
      const gj = L.geoJSON(ws.geojson, {
        style: (feat) => {
          const id = (feat?.properties as { id?: string } | null)?.id;
          const cand = ws.candidates.find((c) => c.districtId === id);
          const selected = ws.selection?.districtId === id;
          const uncertain = ws.highlightedUncertainty.includes(id ?? "");
          const color = cand ? rankColor(cand.rank) : "#64748b";
          return {
            color: selected ? "#0f172a" : color,
            weight: selected ? 3 : uncertain ? 2.5 : 1.5,
            dashArray: uncertain ? "6 4" : undefined,
            fillColor: cand ? color : "#94a3b8",
            fillOpacity: selected ? 0.55 : cand ? 0.35 : 0.08,
          };
        },
        onEachFeature: (feat, layer) => {
          const id = (feat.properties as { id?: string }).id;
          const name = (feat.properties as { name?: string }).name ?? id;
          const cand = ws.candidates.find((c) => c.districtId === id);
          layer.bindTooltip(
            cand ? `${cand.rank}. ${name}  ${cand.scoreDisplay}` : name ?? "",
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
  }, [
    ws.geojson,
    ws.candidates,
    ws.selection,
    ws.layers,
    ws.highlightedUncertainty,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ws.selection) return;
    const c = SNAPSHOT.districts[ws.selection.districtId]?.centroid;
    if (c) map.panTo([c.lat, c.lon]);
  }, [ws.selection]);

  return <div ref={wrapRef} style={{ height: "100%", width: "100%" }} />;
}
