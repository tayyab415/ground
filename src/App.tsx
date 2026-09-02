import { useEffect, useState } from "react";
import {
  apply_correction,
  approveDecision,
  chooseScenario,
  closeDecision,
  closeEvidence,
  closePreview,
  export_decision,
  highlight_uncertainty,
  open_evidence,
  preview_scenario,
  selectDistrict,
  setGeojson,
  show_candidates,
  toggleLayer,
} from "./lib/commands";
import { rankColor, statusLabel, weakCard } from "./lib/format";
import type { LayerId, ScenarioId } from "./lib/types";
import { useWorkspace } from "./lib/useWorkspace";
import { registerWebMcpTools } from "./lib/webmcp";
import { MapCanvas } from "./ui/MapCanvas";

const LAYERS: { id: LayerId; label: string }[] = [
  { id: "districts", label: "District boundary" },
  { id: "ndvi", label: "Crop health (NDVI)" },
  { id: "soil", label: "Soil suitability" },
  { id: "elevation", label: "Elevation" },
  { id: "mills", label: "Rice mills" },
  { id: "roads", label: "Roads (OSM basemap)" },
];

export default function App() {
  const ws = useWorkspace();
  const [query, setQuery] = useState("Uttar Pradesh");
  const [record, setRecord] = useState<Awaited<ReturnType<typeof export_decision>> | null>(null);

  useEffect(() => {
    void registerWebMcpTools();
    void fetch(`${import.meta.env.BASE_URL}data/up-rice-districts.geojson`)
      .then((r) => {
        if (!r.ok) throw new Error("geojson missing");
        return r.json();
      })
      .then((gj: GeoJSON.FeatureCollection) => setGeojson(gj))
      .catch(() => undefined);
  }, []);

  const open = ws.candidates.find((c) => c.districtId === ws.openEvidenceDistrictId);
  const avg = averages(ws.candidates.slice(0, ws.constraints.maxDistricts));

  return (
    <div className="desk">
      <header className="topbar">
        <div className="brand">
          <mark>Ground</mark>
          <span>Desk</span>
        </div>
        <div className="mission-title">{ws.mission.title}</div>
        <div className="top-actions">
          <span className={`webmcp-pill ${ws.webmcp.registered ? "on" : ""}`} title={ws.webmcp.reason}>
            {ws.webmcp.registered ? "WebMCP tools on" : "WebMCP: UI commands ready"}
          </span>
          <button
            className="btn"
            onClick={async () => {
              const rec = await export_decision({ download: true });
              setRecord(rec);
            }}
          >
            Share
          </button>
          <button
            className={ws.approval ? "btn good" : "btn primary"}
            onClick={() => approveDecision({ by: "Human (this tab)" })}
          >
            {ws.approval ? "Approved" : "Approve"}
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="panel">
          <div className="kicker">Mission</div>
          <p className="mission-copy">{ws.mission.objective}</p>
          <p className="note">{ws.mission.candidatePoolNote}</p>

          <div className="kicker">Constraints</div>
          <div className="constraint">
            <span>Budget</span>
            <b>₹{ws.constraints.budgetCr} Cr</b>
          </div>
          <div className="constraint">
            <span>Max districts</span>
            <b>{ws.constraints.maxDistricts}</b>
          </div>
          <div className="constraint">
            <span>Irrigated area</span>
            <b>&gt; {ws.constraints.irrigatedAreaMinPct}% · gap</b>
          </div>
          <div className="constraint">
            <span>Flood risk</span>
            <b>{ws.constraints.floodRiskMax} or lower · gap</b>
          </div>
          <div className="constraint">
            <span>Mill distance</span>
            <b>&lt; {ws.constraints.millDistanceKm} km · gap</b>
          </div>
          {ws.constraints.notes.map((n) => (
            <p className="note" key={n}>
              {n}
            </p>
          ))}

          <div className="kicker">Layers</div>
          {LAYERS.map((l) => (
            <label className="layer" key={l.id}>
              <input
                type="checkbox"
                checked={ws.layers[l.id]}
                onChange={(e) => toggleLayer(l.id, e.target.checked)}
              />
              {l.label}
            </label>
          ))}

          <div className="kicker">Scenarios</div>
          {(
            [
              ["base", "Base scenario"],
              ["high_investment", "High investment"],
              ["low_risk", "Low risk appetite"],
            ] as [ScenarioId, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              className={`scenario ${ws.scenario === id ? "active" : ""}`}
              onClick={() => chooseScenario(id)}
            >
              {label}
            </button>
          ))}

          <div className="kicker">Timeline</div>
          <ol className="timeline">
            {ws.timeline.slice(-8).map((t) => (
              <li key={t.id}>{t.text}</li>
            ))}
          </ol>
        </aside>

        <section className="map-wrap">
          <div className="map-float">
            <input
              className="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const hit = ws.candidates.find(
                    (c) =>
                      c.name.toLowerCase() === query.toLowerCase() ||
                      c.districtId === query.toLowerCase(),
                  );
                  if (hit) selectDistrict(hit.districtId);
                }
              }}
              placeholder="Find a district"
            />
            <button className="btn primary" onClick={() => void show_candidates({ limit: 5 })}>
              {ws.analysisStatus === "running" ? "Ranking…" : "Start analysis"}
            </button>
            <button className="btn" onClick={() => highlight_uncertainty({ on: true })}>
              Flag uncertainty
            </button>
          </div>
          {ws.layers.ndvi && ws.ndviGap ? (
            <div className="gap-banner">NDVI gap — {ws.ndviGap.reason}</div>
          ) : null}
          {ws.map.tiles === "gap" ? (
            <div className="gap-banner">Map tiles gap — OSM raster did not load. District polygons still work.</div>
          ) : null}
          <MapCanvas />
          {ws.selection ? (
            <div className="sel-pill">Selected district ({ws.selection.name}) · unsaved</div>
          ) : (
            <div className="sel-pill">No selection</div>
          )}
          {ws.scenarioPreview ? (
            <div className="modal-back" onClick={closePreview}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="kicker">Scenarios</div>
                <h2>{ws.scenarioPreview.label}</h2>
                <p className="note">{ws.scenarioPreview.whatChanged.join(" · ")}</p>
                <div className="compare">
                  <div>
                    <strong>Original</strong>
                    <ol>
                      {ws.scenarioPreview.before.slice(0, 5).map((r) => (
                        <li key={r.districtId}>
                          {nameOf(ws, r.districtId)} ({(r.score * 100).toFixed(1)})
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <strong>Modified</strong>
                    <ol>
                      {ws.scenarioPreview.after.slice(0, 5).map((r) => {
                        const prev = ws.scenarioPreview?.before.find((b) => b.districtId === r.districtId);
                        const drop = prev && r.rank > prev.rank;
                        return (
                          <li key={r.districtId}>
                            {nameOf(ws, r.districtId)} ({(r.score * 100).toFixed(1)}){" "}
                            {drop ? <span className="down">↓</span> : null}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
                <div className="top-actions" style={{ marginTop: 16 }}>
                  <button className="btn" onClick={closePreview}>
                    Keep original
                  </button>
                  <button
                    className="btn primary"
                    onClick={() =>
                      apply_correction({
                        district: ws.scenarioPreview?.correction?.districtId,
                        value: "seasonal",
                        note: "The canal here is seasonal, not year-round.",
                      })
                    }
                  >
                    Apply correction
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="panel right">
          {ws.approval ? (
            <div className="okbox">
              Decision approved · {ws.approval.name}
              <div className="note">
                {ws.approval.reason} · {ws.approval.by}
              </div>
            </div>
          ) : null}
          {open ? (
            <div className="evidence">
              <div className="kicker">Evidence</div>
              <h2>{open.name}</h2>
              {weakCard(open.evidence)?.status === "unverified" ? (
                <div className="warnbox">Assumption: {weakCard(open.evidence)?.assumption}</div>
              ) : null}
              {open.evidence.find((e) => e.id === "irrigation" && e.status === "corrected") ? (
                <div className="okbox">Canal correction applied in this tab (unsaved until approve/export).</div>
              ) : null}
              {open.evidence.map((e) => (
                <div className="ev-row" key={e.id}>
                  <strong>
                    {e.label} <span className={`pill ${e.status === "ok" ? "ok" : e.status === "gap" ? "gap" : "warn"}`}>{statusLabel(e.status)}</span>
                  </strong>
                  <div className="val">{e.display}</div>
                  <div className="src">
                    {e.source.name}
                    {e.source.note ? ` — ${e.source.note}` : ""}
                    {e.usedInRanking ? "" : " · not used in ranking"}
                  </div>
                </div>
              ))}
              {open.districtId === "gorakhpur" &&
              open.evidence.find((e) => e.id === "irrigation")?.status === "unverified" ? (
                <div className="top-actions" style={{ marginTop: 12 }}>
                  <button
                    className="btn"
                    onClick={() =>
                      preview_scenario({ district: "gorakhpur", value: "seasonal" })
                    }
                  >
                    Preview seasonal canal
                  </button>
                  <button
                    className="btn primary"
                    onClick={() =>
                      apply_correction({
                        district: "gorakhpur",
                        value: "seasonal",
                        note: "The canal here is seasonal, not year-round.",
                      })
                    }
                  >
                    Canal is seasonal
                  </button>
                </div>
              ) : null}
              <button className="linkish" style={{ marginTop: 12 }} onClick={closeEvidence}>
                Back to ranking
              </button>
            </div>
          ) : (
            <>
              <div className="kicker">Candidates · sorted by overall score</div>
              {ws.candidates.length === 0 ? (
                <p className="note">
                  Rank the eastern rice-belt districts. Analysis uses SoilGrids + SRTM elevation + an explicit irrigation
                  prior. NDVI is included only if Earth Engine answers.
                </p>
              ) : null}
              {ws.candidates.map((c) => (
                <article
                  key={c.districtId}
                  className={`cand ${ws.selection?.districtId === c.districtId ? "selected" : ""}`}
                >
                  <div className="cand.head">
                    <div className="rank" style={{ color: rankColor(c.rank) }}>
                      {c.rank}. {c.name}
                    </div>
                    <div className="score">{c.scoreDisplay}</div>
                  </div>
                  <p>{c.reasons.slice(0, 3).join(" · ")}</p>
                  <div className="pills">
                    {c.previousRank && c.previousRank !== c.rank ? (
                      <span className={`pill ${c.rank > c.previousRank ? "gap" : "ok"}`}>
                        {c.previousRank} → {c.rank}
                      </span>
                    ) : null}
                    {c.evidence
                      .filter((e) => e.status !== "ok")
                      .map((e) => (
                        <span key={e.id} className={`pill ${e.status === "gap" ? "gap" : "warn"}`}>
                          {e.label}
                        </span>
                      ))}
                  </div>
                  <button className="linkish" onClick={() => open_evidence({ district: c.districtId })}>
                    View details →
                  </button>
                </article>
              ))}
            </>
          )}
        </aside>
      </div>

      <footer className="metrics">
        <Metric
          label="Avg crop health (NDVI)"
          value={ws.rankingMeta.ndviIncluded ? avg.ndvi : "Gap"}
          pct={ws.rankingMeta.ndviIncluded ? 0.7 : 0}
        />
        <Metric label="Avg soil suitability" value={avg.soil} pct={avg.soilN} />
        <Metric label="Avg elevation" value={avg.elev} pct={0.5} />
        <Metric label="Mills / market" value="Gap" pct={0} />
        <Metric
          label="Est. program cost"
          value={`₹${ws.constraints.budgetCr} Cr cap`}
          pct={0.6}
        />
        <Metric
          label="Districts selected"
          value={`${Math.min(ws.candidates.length, ws.constraints.maxDistricts)} / ${ws.constraints.maxDistricts}`}
          pct={ws.candidates.length ? 1 : 0}
        />
      </footer>

      {ws.view === "decision" && record ? (
        <div className="modal-back" onClick={closeDecision}>
          <div className="modal record" onClick={(e) => e.stopPropagation()}>
            <div className="kicker">Decision record</div>
            <h2>{record.title}</h2>
            <p className="note">Generated {record.generatedAt}</p>
            <p>
              <b>Final choice:</b> {record.finalChoice.name ?? "—"}{" "}
              {record.finalChoice.approved ? "(approved)" : "(draft, not approved)"}
            </p>
            <h3>Ranking</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>District</th>
                  <th>Score</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                {record.ranking.candidates.slice(0, 10).map((c) => (
                  <tr key={c.districtId}>
                    <td>{c.rank}</td>
                    <td>{c.name}</td>
                    <td>{(c.score * 100).toFixed(1)}</td>
                    <td>
                      {c.previousRank && c.previousRank !== c.rank ? `${c.previousRank}→${c.rank}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="note">{record.ranking.recipe}</p>
            <h3>Sources</h3>
            <ul>
              {record.sources.map((s) => (
                <li key={s.name}>
                  {s.name}
                  {s.note ? ` — ${s.note}` : ""}
                </li>
              ))}
            </ul>
            <h3>Corrections</h3>
            {record.corrections.length === 0 ? <p className="note">None.</p> : null}
            {record.corrections.map((c) => (
              <p key={c.id}>
                {c.districtId}: {c.from} → {c.to}. {c.note}
              </p>
            ))}
            <h3>Gaps</h3>
            <ul>
              {record.gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
            <h3>Reproducibility hash</h3>
            <p className="hash">{record.reproducibilityHash}</p>
            <button className="btn" onClick={closeDecision}>
              Back to desk
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="metric">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      <div className="bar">
        <i style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
    </div>
  );
}

function nameOf(ws: ReturnType<typeof useWorkspace>, id: string) {
  return ws.candidates.find((c) => c.districtId === id)?.name ?? id;
}

function averages(cands: ReturnType<typeof useWorkspace>["candidates"]) {
  if (!cands.length) return { ndvi: "—", soil: "—", soilN: 0, elev: "—" };
  const soils = cands
    .map((c) => c.evidence.find((e) => e.id === "soil")?.score)
    .filter((n): n is number => n != null);
  const elevs = cands
    .map((c) => c.evidence.find((e) => e.id === "elevation")?.value)
    .filter((n): n is number => typeof n === "number");
  const soilN = soils.length ? soils.reduce((a, b) => a + b, 0) / soils.length : 0;
  return {
    ndvi: "Gap",
    soil: soils.length ? soilN.toFixed(2) : "Gap",
    soilN,
    elev: elevs.length ? `${Math.round(elevs.reduce((a, b) => a + b, 0) / elevs.length)} m` : "Gap",
  };
}
