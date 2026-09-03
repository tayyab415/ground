import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cancelDraw, selectDistrict, setDrawnSelection, setMapView } from "../lib/commands";
import { choroplethMode, districtFill, rankColor } from "../lib/format";
import { SNAPSHOT } from "../lib/rank";
import { REGIONS } from "../data/regions";
import { getState } from "../lib/store";
import { OSM_ATTR, OSM_TILE_URL, resolveTileHealth, tileUrlForRoads } from "../lib/tiles";
import { useWorkspace } from "../lib/useWorkspace";

function makeTiles() {
  return L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTR, maxZoom: 19 });
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
  const drawRef = useRef<L.LayerGroup | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const ws = useWorkspace();

  useEffect(() => {
    if (!wrapRef.current || mapRef.current) return;
    const map = L.map(wrapRef.current, {
      center: ws.map.center,
      zoom: ws.map.zoom,
      zoomControl: true,
    });
    const group = L.layerGroup().addTo(map);
    const draw = L.layerGroup().addTo(map);
    layersRef.current = group;
    drawRef.current = draw;
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
      tilesRef.current = null;
    };
  }, []);

  // When the region changes, move the real Leaflet view to the new region's
  // home center/zoom. State alone (ws.map) is patched by set_region, but the
  // map object keeps its old view unless we call setView.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const def = REGIONS[ws.region];
    map.setView(def.mapCenter, def.mapZoom, { animate: false });
    setMapView({ center: def.mapCenter, zoom: def.mapZoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.region]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const url = tileUrlForRoads(ws.layers.roads);
    if (url) {
      if (!tilesRef.current) {
        const tiles = makeTiles();
        bindTileHealth(tiles);
        tiles.addTo(map);
        tilesRef.current = tiles;
      }
    } else if (tilesRef.current) {
      map.removeLayer(tilesRef.current);
      tilesRef.current = null;
      setMapView({ tiles: "ok" });
    }
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
          const selected = ws.selection?.kind === "district" && ws.selection.districtId === id;
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
            if (getState().drawMode !== "idle") return;
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
    const group = drawRef.current;
    if (!group) return;
    group.clearLayers();
    const geom = ws.selection?.polygon;
    if (!geom || ws.selection?.kind === "district") return;
    if (ws.selection?.kind === "point" && ws.selection.point) {
      L.circleMarker([ws.selection.point.lat, ws.selection.point.lon], {
        radius: 7,
        color: "#1d4ed8",
        fillOpacity: 0.9,
      })
        .bindTooltip("Unsaved point")
        .addTo(group);
      return;
    }
    L.geoJSON(geom, {
      style: {
        color: "#1d4ed8",
        weight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.25,
        dashArray: "4 3",
      },
    }).addTo(group);
  }, [ws.selection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const restorePanZoom = () => {
      map.dragging.enable();
      map.doubleClickZoom.enable();
    };
    if (ws.drawMode === "idle") {
      restorePanZoom();
      return;
    }
    map.dragging.disable();
    if (ws.drawMode === "polygon") map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();

    const pts: L.LatLng[] = [];
    const draft = L.polyline([], { color: "#1d4ed8", weight: 2 }).addTo(map);

    const finish = (kind: "polygon" | "lasso") => {
      if (pts.length >= 3) {
        setDrawnSelection({
          kind,
          coordinates: pts.map((p) => [p.lng, p.lat]),
        });
      } else {
        cancelDraw();
      }
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") cancelDraw();
    };
    window.addEventListener("keydown", onKey);

    if (ws.drawMode === "lasso") {
      let drawing = false;
      let settled = false;
      const onDown = (e: L.LeafletMouseEvent) => {
        drawing = true;
        pts.push(e.latlng);
        draft.setLatLngs(pts);
      };
      const onMove = (e: L.LeafletMouseEvent) => {
        if (!drawing) return;
        pts.push(e.latlng);
        draft.setLatLngs(pts);
      };
      const onPointerUp = () => {
        if (!drawing || settled) return;
        settled = true;
        finish("lasso");
      };
      map.on("mousedown", onDown);
      map.on("mousemove", onMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("mouseup", onPointerUp);
      return () => {
        map.off("mousedown", onDown);
        map.off("mousemove", onMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("mouseup", onPointerUp);
        window.removeEventListener("keydown", onKey);
        draft.remove();
        restorePanZoom();
      };
    }

    const onClick = (e: L.LeafletMouseEvent) => {
      pts.push(e.latlng);
      draft.setLatLngs(pts);
    };
    const onDbl = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stop(e);
      finish("polygon");
    };
    map.on("click", onClick);
    map.on("dblclick", onDbl);
    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDbl);
      window.removeEventListener("keydown", onKey);
      draft.remove();
      restorePanZoom();
    };
  }, [ws.drawMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ws.selection) return;
    if (ws.selection.kind === "district" && ws.selection.districtId) {
      const c = SNAPSHOT.districts[ws.selection.districtId]?.centroid;
      if (c) map.panTo([c.lat, c.lon]);
    }
  }, [ws.selection]);

  return <div ref={wrapRef} style={{ height: "100%", width: "100%" }} />;
}
