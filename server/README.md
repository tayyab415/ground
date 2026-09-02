# Analysis sidecar (optional, private)

Judges use the **static OSM desk**. This folder is not a default public deploy.
Do not put `/v1/ndvi`, `/v1/places/rice-mills`, `/v1/geocode`, `/v1/directions`,
or GroundCheck compute on the public internet.

The public GitHub Pages snapshot **must** keep `VITE_ANALYSIS_URL` empty.
Do not bake a Cloud Run URL or token into the frontend. Do not print tokens.
Do not mint Maps JS keys.

A private IAM-only Cloud Run service may exist in project
`gen-lang-client-0261050164` (operator-only). Conductor holds the secret
`ground-sidecar-token`. This repo does not need that secret to ship the public desk.

## Auth

Compute routes reject unauthenticated requests.

1. **Token (required by the app):** set `GROUND_SIDECAR_TOKEN` and send
   `X-Ground-Token: <token>` (preferred) or `Authorization: Bearer <token>`.
   Cloud Run IAM also uses `Authorization: Bearer`; the sidecar prefers
   `X-Ground-Token` so an identity token cannot hide a valid sidecar secret.
   If the env var is empty, those routes always return 401.
2. **Cloud Run IAM-only:** deploy with `--no-allow-unauthenticated`. Never
   `--allow-unauthenticated`.

There is **no** `CORS(app)` wide-open policy. The public desk does not call
this sidecar. Never put the sidecar token or a Maps JS key in the frontend bundle.

Earth Engine / Places / geocode / directions use Application Default Credentials only:

- `ee.Initialize(project='gen-lang-client-0261050164')`
- `/v1/ndvi` uses FAO/GAUL/2015/level2 district polygons, last 30 days of
  `COPERNICUS/S2_SR_HARMONIZED`, SCL 4–6 + QA60, 60 m. Siddharthnagar = GAUL
  “Siddharth Nagar”. No centroid buffers.
- Places API (New), geocode, and Routes via ADC bearer + `X-Goog-User-Project`
- Do not mint keys

## Deploy (IAM-only, not public)

```bash
export GROUND_SIDECAR_TOKEN=  # generate a token; do not commit it
gcloud run deploy ground-analysis \
  --source . \
  --region us-central1 \
  --project gen-lang-client-0261050164 \
  --no-allow-unauthenticated \
  --set-env-vars GROUND_SIDECAR_TOKEN=$GROUND_SIDECAR_TOKEN
```

The static desk shows the dated EE NDVI snapshot (and mill/flood/geocode gaps)
unless a private operator points a **non-public** build at this service.
