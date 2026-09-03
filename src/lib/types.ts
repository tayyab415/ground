export type LayerId =
  | "districts"
  | "ndvi"
  | "soil"
  | "elevation"
  | "mills"
  | "roads";

export type ScenarioId = "base" | "high_investment" | "low_risk";

export type EvidenceStatus =
  | "ok"
  | "unverified"
  | "modeled"
  | "corrected"
  | "gap";

export type SourceRef = {
  name: string;
  url?: string;
  retrievedAt?: string;
  note?: string;
};

export type EvidenceItem = {
  id: string;
  label: string;
  value: number | string | null;
  display: string;
  unit?: string;
  status: EvidenceStatus;
  score?: number;
  usedInRanking: boolean;
  source: SourceRef;
  assumption?: string;
};

export type IrrigationClass =
  | "perennial_canal_assumed"
  | "seasonal_canal"
  | "mixed_groundwater_surface";

export type IrrigationPrior = {
  class: IrrigationClass;
  score: number;
  label: string;
  status: EvidenceStatus;
  assumption: string;
  source: SourceRef;
};

export type Correction = {
  id: string;
  districtId: string;
  fact: "canal_irrigation";
  from: IrrigationClass;
  to: IrrigationClass;
  note: string;
  appliedAt: string;
  committed: boolean;
};

export type Candidate = {
  districtId: string;
  name: string;
  rank: number;
  previousRank: number | null;
  score: number;
  scoreDisplay: string;
  reasons: string[];
  evidence: EvidenceItem[];
  centroid: { lat: number; lon: number };
};

export type RankingMeta = {
  computedAt: string | null;
  recipe: string;
  weights: Record<string, number>;
  droppedFactors: { id: string; reason: string }[];
  ndviIncluded: boolean;
  note: string;
};

export type DrawMode = "idle" | "polygon" | "lasso";

export type Selection = {
  kind: "district" | "polygon" | "lasso" | "point";
  districtId?: string;
  name: string;
  polygon?: GeoJSON.Geometry;
  point?: { lat: number; lon: number };
  vertexCount?: number;
  saved: false;
};

export type GroundCheckReply = {
  answer: string;
  photoDataUrl: string | null;
  gps: { lat: number; lon: number; accuracyM?: number } | null;
  gpsGap?: string;
  capturedAt: string;
  receivedAt: string;
  store: "sidecar" | "browser";
};

export type GroundCheckStatus = "created" | "sent" | "awaiting" | "replied" | "approved" | "gap";

export type GroundCheck = {
  id: string;
  districtId: string;
  districtName: string;
  question: string;
  location: { lat: number; lon: number };
  dueAt: string;
  createdAt: string;
  status: GroundCheckStatus;
  fieldPath: string;
  deliveryGap?: string;
  reply: GroundCheckReply | null;
  approvedAt?: string;
  approvedBy?: string;
};

export type Constraints = {
  budgetCr: number;
  maxDistricts: number;
  irrigatedAreaMinPct: number | null;
  floodRiskMax: string | null;
  millDistanceKm: number | null;
  notes: string[];
};

export type Mission = {
  title: string;
  region: string;
  objective: string;
  candidatePoolNote: string;
};

export type TimelineEvent = {
  id: string;
  at: string;
  kind: string;
  text: string;
};

export type Approval = {
  districtId: string;
  name: string;
  by: string;
  at: string;
  reason: string;
};

export type ScenarioPreview = {
  label: string;
  scenario: ScenarioId;
  scenarioExplicit: boolean;
  correction?: Correction;
  before: { districtId: string; rank: number; score: number }[];
  after: { districtId: string; rank: number; score: number }[];
  whatChanged: string[];
};

export type MapViewState = {
  center: [number, number];
  zoom: number;
  bounds: [[number, number], [number, number]] | null;
  tiles: "ok" | "gap";
  tilesNote: string;
};

export type NdviLookup = Record<
  string,
  {
    value: number;
    source: SourceRef;
    startDate: string;
    endDate: string;
  }
>;

export type Workspace = {
  mission: Mission;
  constraints: Constraints;
  layers: Record<LayerId, boolean>;
  scenario: ScenarioId;
  selection: Selection | null;
  drawMode: DrawMode;
  candidates: Candidate[];
  rankingMeta: RankingMeta;
  openEvidenceDistrictId: string | null;
  highlightedUncertainty: string[];
  scenarioPreview: ScenarioPreview | null;
  corrections: Correction[];
  groundChecks: GroundCheck[];
  timeline: TimelineEvent[];
  approval: Approval | null;
  view: "desk" | "decision";
  map: MapViewState;
  analysisStatus: "idle" | "running" | "ready";
  ndvi: NdviLookup;
  ndviGap: { reason: string } | null;
  geojson: GeoJSON.FeatureCollection | null;
  webmcp: { registered: boolean; reason: string };
};

export type DecisionRecord = {
  title: string;
  generatedAt: string;
  mission: Mission;
  constraints: Constraints;
  finalChoice: {
    districtId: string | null;
    name: string | null;
    rank: number | null;
    score: number | null;
    approved: boolean;
  };
  ranking: {
    recipe: string;
    weights: Record<string, number>;
    droppedFactors: RankingMeta["droppedFactors"];
    candidates: {
      rank: number;
      previousRank: number | null;
      districtId: string;
      name: string;
      score: number;
      reasons: string[];
      evidence: EvidenceItem[];
    }[];
  };
  sources: SourceRef[];
  corrections: Correction[];
  groundChecks: GroundCheck[];
  approvals: Approval[];
  gaps: string[];
  reproducibilityHash: string;
  note: string;
};
