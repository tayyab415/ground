# Ground

**One line:** a map that stops being a confident black box and becomes a checkable decision that a human and an AI agent can both stand behind.

**The setup, in practice:** Codex chat on the left. A browser with Ground in it on the right. You prompt the agent in Codex. The agent drives the map in the browser through WebMCP. Everything is one session, two panes.

This document is a plan and an invitation. It describes the shape of the product, how the parties talk to each other, and which credentials do what. It does not prescribe the implementation. A coding agent should read this, form its own picture, and explore.

Alongside this plan there is a visual companion: the interactive HTML page in this repo (`index.html`, standalone copy `ground-selfcontained.html`) walks through the same mission as ten screenshots in sequence. Treat it as one artist's sketch of the destination, not as a contract. If your exploration finds a better layout or a different workflow, the plan should bend, not the other way round.

---

## 1. The problem

Somebody draws a polygon on a map and says "put the program here." That polygon is built from data, assumptions, and judgment calls. Almost none of that survives to the person who has to approve the money.

Today:

- A ranked map appears with no visible logic. The ranking lives in a spreadsheet nobody else can open.
- When a fact is wrong (a canal that runs dry in September, a road that washes out), the map is still confident. Nothing flags it.
- People with local knowledge cannot change the map. Their correction lives in an email thread or nowhere.
- "Why this district?" gets answered with a shrug and a PDF.
- When it goes wrong, nobody can say which assumption killed the decision. The same mistake repeats next season.

Ground exists so a geographic decision can be examined, corrected, and re-run instead of trusted.

---

## 2. The actors

### The human

- Knows the ground: the canal, the road, the landlord, the monsoon.
- Holds authority: approves, rejects, decides.
- Has judgment: sees when a model is being naive.
- Cannot fetch and compute ten datasets in an afternoon. Cannot glance at a satellite mosaic. Cannot recall every source version.

The human's job is to bring knowledge and to take responsibility.

### The coding agent (in Codex)

- Fetches data: satellite imagery, soil grids, elevation, places, roads.
- Computes: ranking, buffers, overlap, sensitivity.
- Remembers: every source, version, date, and calculation.
- Cannot know that a canal runs dry in September. Cannot take responsibility for the decision.

The agent's job is to bring scale, speed, and a perfect memory for receipts.

### The map app (Ground, in the browser)

- Renders the map and the evidence.
- Holds the workspace state: mission, candidates, layers, scenario toggles, unsaved changes, decision history.
- Executes deterministic spatial jobs on the backend.
- Never decides anything on its own.

### The field officer

- Answers one precise question from a phone link. No account, no training.
- Sends a photo, a short answer, GPS, and a timestamp.

### What none of them can do alone

The human knows the place but cannot compute. The agent can compute but does not know the place. The map can show anything but cannot decide. The officer sees the truth but is not in the room. Ground is the room.

---

## 3. The core loop

One loop runs on every mission. Each step has an owner.

1. **Propose (agent).** Find data, run the analysis, rank candidates, show sources.
2. **Inspect (human).** Open evidence, read source cards, find the assumption that looks shaky.
3. **Challenge (both).** The agent flags the weak fact. The human confirms or corrects it with local knowledge.
4. **Re-run (agent).** Bounded re-analysis. The ranking updates and shows what moved.
5. **Record (human).** Approve the decision. Export the record with sources, corrections, and approvals.

The loop is not a chatbot exchange. It is a negotiation on a shared map.

---

## 4. How the parties communicate

### Human -> Agent (in Codex, natural language)

- "Select three districts for a rice-resilience program in Uttar Pradesh."
- "Why does Gorakhpur rank first?"
- "The canal here is seasonal, not year-round."
- "Ballia it is. Approve."

The human talks the way they talk to a colleague. The agent translates intent into actions.

### Agent -> Ground (WebMCP commands)

The agent does not click around the browser like a user. It sends structured commands to the app. See the WebMCP section below.

### Ground -> Agent (WebMCP read state)

The agent can read what is on screen: the selected polygon, the open evidence card, the unsaved toggle, the visible layers, the current timeline. It never asks the human "which area do you mean?" It reads the selection.

### Ground -> Human (the browser)

The map, the boards, the evidence cards, the timeline, the decision record. This is where the human sees the result and the receipts.

### Human -> Ground (approvals and corrections)

The human confirms or rejects agent-staged changes. Nothing durable happens without the human. These are explicit, labelled actions, not passive watching.

### Agent -> Field officer (through Ground)

Ground creates a mobile check request: one question, one location, photo + short answer, due date. The officer replies without an account. The reply is evidence, not chatter.

### The other Codex agents

The top-level agent does not do everything itself. It can spawn other Codex agents to explore in parallel:

- One agent researches the region and data sources.
- One agent tests the analysis recipe against held-out data.
- One agent verifies the WebMCP behaviour in a browser.
- One agent audits the decision record for reproducibility.

Each of those agents gets its own task, its own browser session if needed, and reports back with findings. The top-level agent watches all of them, reconciles their outputs, and only then stages changes to the shared workspace.

---

## 5. WebMCP: the bridge

WebMCP is what makes the collaboration live. It is not the analysis engine. It is the thin connector between the agent and the human's current, unsaved browser state.

### Why WebMCP and not a normal API

A normal API talks to persisted server state. The value here is in state that has not been saved yet: the polygon the human just drew, the evidence card that is open, the scenario toggle that is still a draft. That state only exists in the browser tab. WebMCP is the only channel that sees it.

### The three tiers of WebMCP tools

**Read (the agent observes the session):**

- get_workspace_state -> mission, candidates, layers, unsaved changes
- get_current_selection -> the polygon, point, or lasso the human selected
- get_visible_map_state -> bounds, zoom, active layers
- get_open_evidence -> which candidate's evidence is being inspected
- get_unsaved_changes -> what the human changed but has not committed

**Write (the agent affects what the human sees):**

- show_candidates -> push ranked results as overlays
- open_evidence -> open evidence cards for a candidate
- highlight_uncertainty -> mark cells that depend on an unverified assumption
- preview_scenario -> preview a re-ranking before it is committed

**Confirm (the agent stages, the human decides):**

- apply_correction -> accept a human correction and re-run the bounded analysis
- send_ground_check -> create and send a field verification request
- approve_evidence -> mark field evidence as verified
- export_decision -> generate and download the decision record

### The WebMCP versus standard navigation question

This is an explicit thing to test, not an assumption to accept:

- Standard navigation: the agent drives the page by automating the browser (clicking, typing, waiting for selectors). Fragile, slow, and it cannot see the human's unsaved state cleanly.
- WebMCP: the app exposes its commands and state directly to the agent. The agent calls a command; the app performs the same action the visible controls perform.

Verify, head to head: same task, two sessions, one with WebMCP and one with plain browser automation. Measure reliability, speed, and whether the agent can observe the human's unsaved selection. The product should only lean on WebMCP where it actually wins.

### The rule that keeps WebMCP honest

WebMCP calls the same application commands as the visible UI. There is no second implementation. If a feature exists in the UI, it exists as a command; if it exists as a command, it exists in the UI. Anything else is drift.

---

## 6. Credentials and their jobs

Two credentials carry the heavy lifting. This section says what each one does. Actual key values live in environment variables, never in documents or code.

### The Google Maps Platform API key

This is the key the browser uses for geography and places. Its job:

- **Geocoding:** turn "Uttar Pradesh" or "Lucknow" into coordinates and boundaries for the mission.
- **Places API:** find real-world anchors. Existing rice mills, farms, wholesale markets, roads, facilities. These become candidate context and market-access evidence.
- **Map tiles:** render the base map in the browser. Roads, boundaries, terrain.
- **Elevation:** terrain context for the analysis.
- **Static maps:** generate shareable map images for reports and the decision record.
- **Directions/route:** travel-time context when a decision cares about access (mill proximity, service reach).

Its task is: give the product the real, current geography and the places that exist on the ground. It is the "what is there" key.

Restriction note: the key is scoped by API and by IP in the project today. That split (render key vs routing key) is expected: keep the browser key limited to what the page renders, and keep the analysis key server-side.

### The GCP Earth Engine key

This is the analytical engine. Its job:

- **Satellite imagery.** Landsat, Sentinel, composite mosaics.
- **Indices.** NDVI for crop health, water indices, change detection.
- **Land cover.** What is actually farmed, forested, built-up.
- **Time series.** Compare a season against previous seasons, not just one snapshot.
- **Masked analysis.** Overlay the mission polygon, compute within it, return summaries per district.

Its task is: turn satellite pixels into the evidence layers that rank candidates and show which facts are weak. It is the "what the satellites say" key. It runs on the backend, not in the browser.

### What each key must never do

- The Maps key never claims to know soil quality, crop health, or anything derived from satellite analysis. It provides places and geography.
- The Earth Engine key never claims to know that a specific canal is seasonal. That is human and field knowledge, collected through GroundCheck.
- Neither key is the source of truth for a decision. They are evidence providers. The decision record names them as sources, with dates and versions.

---

## 7. How the top-level agent orchestrates

This is the part that makes Ground agent-native rather than a website with a chat box.

### Initiate

The human types the mission in Codex. The agent opens or confirms a browser tab with Ground, and establishes the WebMCP session. It confirms: session active, tools available, map loaded.

### Decompose

The agent breaks the mission into sub-questions and spawns other Codex agents:

- **Dataset scout:** what public data exists for this region, and what are its limits?
- **Recipe tester:** does the candidate ranking hold against held-out data or independent sources?
- **WebMCP verifier:** in a separate browser session, does each WebMCP command behave as documented?
- **Record auditor:** can a decision record be reproduced from its hash by a fresh agent?

Each spawned agent prompts itself, digs, and returns findings. The top-level agent does not redo their work; it reconciles it.

### Negotiate

The agent composes the plan and stages it on the map: candidates, evidence, flagged assumptions. The human inspects. Corrections come back as natural language. The agent re-runs the bounded analysis and shows the delta.

### Verify

Before anything is presented as done, the agent checks:

- The analysis ran on real data (the credentials above), not stubs.
- Every displayed result has a source, a date, a resolution.
- The WebMCP session reflected the human's actual selection, not a guessed one.
- The decision record can be reproduced.

### Monitor

The agent watches the whole session:

- WebMCP session health: still connected? Tools still listed?
- Human actions: what did the human change, reject, approve?
- Field checks: sent? unanswered? answered? approved?
- Backend jobs: finished? failed? partial?
- The timeline: does the recorded history match what actually happened?

The timeline is the shop window. If the timeline does not match reality, the product has failed.

---

## 8. The verification plan

Verification is a first-class activity, not a final step.

### The kill test

Remove WebMCP and give the agent a normal API plus browser automation. If the demo is just as clear and collaborative, the browser integration is decorative. The demo must depend on the human's unsaved selection or correction, shown live, before it is persisted.

### WebMCP versus standard navigation

Run the same task twice. Measure reliability, speed, and whether the agent can see the human's unsaved state. Publish the comparison, even if it is uncomfortable.

### Backend versus UI

A 200 response is not success. The backend must execute on real data, and the browser must show the real result. Verify the whole path: API key call -> backend computation -> WebMCP push -> visible map state.

### The honest demo rule

Never fake a field response, never fake a ranking, never fake a confidence score. If a fact is missing, show the gap. That is the product.

---

## 9. The journey this plan points at

The reference scenario, used as the north star:

1. You, in Codex: "Select three districts for a rice-resilience program in Uttar Pradesh."
2. The agent builds the mission form in the browser, opens the WebMCP session.
3. It pulls Landsat (Earth Engine), soil, elevation, and mill locations (Maps), ranks five districts.
4. You ask why Gorakhpur leads. Evidence cards open. The weak card is flagged: canal irrigation unverified.
5. You correct: the canal is seasonal. The ranking re-runs. Gorakhpur falls, Ballia leads.
6. The agent drafts one GroundCheck to settle the fact. You approve sending it.
7. A field officer replies with a photo and GPS. You approve it as evidence.
8. The decision record exports: mission, ranking history, sources, corrections, approvals, reproducibility hash.
9. You approve. The agent records it and the timeline shows the whole chain.

That is the loop from proposal to decision, with a person and an agent sharing one map.

---

## 10. What is deliberately left open

This document sets the shape, not the answers. A fresh agent should explore:

- What the workspace layout should be beyond the reference mockups.
- Which WebMCP commands survive contact with a real browser.
- How heavy the backend analysis should be versus what runs in the browser.
- How the human approval moments are paced; too many, and it is a chore; too few, and it is a black box.
- Whether the field-check network starts as a real product or as a staged demonstration with a real mobile reply flow.
- How the decision record evolves into a template system for other decision types: warehouses, flood response, health facilities, conservation.
- What honest limits the public data stack has for agriculture specifically, and where the product stops making claims.

The plan is a compass. The exploration is the journey.
