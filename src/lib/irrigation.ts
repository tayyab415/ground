import type { IrrigationPrior } from "./types";

/**
 * Irrigation priors are MODEL ASSUMPTIONS, not measured canal flow.
 * They exist so a human can challenge the fact the ranking hangs on.
 * They are not census irrigation shares and not Earth Engine outputs.
 */
export const IRRIGATION_PRIORS: Record<string, IrrigationPrior> = {
  gorakhpur: {
    class: "perennial_canal_assumed",
    score: 0.93,
    label: "Canal irrigation treated as year-round",
    status: "unverified",
    assumption:
      "Saryu/Rapti canal command is treated as year-round supply. This is unverified. Local knowledge (seasonal vs perennial) can overturn the rank.",
    source: {
      name: "Workspace model prior",
      note: "Not satellite-verified. Not a measured irrigation percentage.",
    },
  },
  ballia: {
    class: "mixed_groundwater_surface",
    score: 0.8,
    label: "Mixed groundwater and surface water",
    status: "modeled",
    assumption:
      "Ganga–Ghaghara doab prior: ranking does not hang on one perennial canal.",
    source: {
      name: "Workspace model prior",
      note: "Qualitative prior for eastern alluvial doab. Not a census share.",
    },
  },
  kushinagar: {
    class: "seasonal_canal",
    score: 0.68,
    label: "Seasonal canal command (Gandak) plus wells",
    status: "modeled",
    assumption: "Gandak command treated as seasonal, not year-round.",
    source: {
      name: "Workspace model prior",
      note: "Qualitative canal-command prior. Not satellite-verified.",
    },
  },
  deoria: {
    class: "seasonal_canal",
    score: 0.68,
    label: "Seasonal canal command (Gandak) plus wells",
    status: "modeled",
    assumption: "Gandak command treated as seasonal, not year-round.",
    source: {
      name: "Workspace model prior",
      note: "Qualitative canal-command prior. Not satellite-verified.",
    },
  },
  maharajganj: {
    class: "seasonal_canal",
    score: 0.66,
    label: "Seasonal canal / hill-front command plus wells",
    status: "modeled",
    assumption: "Treated as seasonal surface water plus groundwater.",
    source: {
      name: "Workspace model prior",
      note: "Qualitative prior. Not satellite-verified.",
    },
  },
  siddharthnagar: {
    class: "seasonal_canal",
    score: 0.66,
    label: "Seasonal canal command plus wells",
    status: "modeled",
    assumption: "Treated as seasonal surface water plus groundwater.",
    source: {
      name: "Workspace model prior",
      note: "Qualitative prior. Not satellite-verified.",
    },
  },
  basti: {
    class: "mixed_groundwater_surface",
    score: 0.74,
    label: "Mixed groundwater and surface water",
    status: "modeled",
    assumption: "No perennial-canal claim in the V1 model.",
    source: {
      name: "Workspace model prior",
      note: "Qualitative prior. Not a census share.",
    },
  },
  "sant-kabir-nagar": {
    class: "mixed_groundwater_surface",
    score: 0.73,
    label: "Mixed groundwater and surface water",
    status: "modeled",
    assumption: "No perennial-canal claim in the V1 model.",
    source: {
      name: "Workspace model prior",
      note: "Qualitative prior. Not a census share.",
    },
  },
  "ambedkar-nagar": {
    class: "mixed_groundwater_surface",
    score: 0.74,
    label: "Mixed groundwater and surface water",
    status: "modeled",
    assumption: "No perennial-canal claim in the V1 model.",
    source: {
      name: "Workspace model prior",
      note: "Qualitative prior. Not a census share.",
    },
  },
  azamgarh: {
    class: "mixed_groundwater_surface",
    score: 0.75,
    label: "Mixed groundwater and surface water",
    status: "modeled",
    assumption: "No perennial-canal claim in the V1 model.",
    source: {
      name: "Workspace model prior",
      note: "Qualitative prior. Not a census share.",
    },
  },
  mau: {
    class: "mixed_groundwater_surface",
    score: 0.76,
    label: "Mixed groundwater and surface water",
    status: "modeled",
    assumption: "No perennial-canal claim in the V1 model.",
    source: {
      name: "Workspace model prior",
      note: "Qualitative prior. Not a census share.",
    },
  },
  ghazipur: {
    class: "mixed_groundwater_surface",
    score: 0.77,
    label: "Mixed groundwater and surface water",
    status: "modeled",
    assumption: "Ganga-belt prior; no perennial-canal claim.",
    source: {
      name: "Workspace model prior",
      note: "Qualitative prior. Not a census share.",
    },
  },
};

export const SEASONAL_CANAL_SCORE = 0.48;

export const SEASONAL_CORRECTION_PRIOR: IrrigationPrior = {
  class: "seasonal_canal",
  score: SEASONAL_CANAL_SCORE,
  label: "Canal irrigation corrected to seasonal",
  status: "corrected",
  assumption:
    "Human correction: canal does not supply year-round water. Ranking re-run with seasonal irrigation.",
  source: {
    name: "Human local knowledge",
    note: "Applied in this browser session. Not persisted until export/approve.",
  },
};
