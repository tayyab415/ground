# Analysis sidecar (Cloud Run)

This service is optional. The Ground desk runs without it and shows **NDVI / Places as gaps**.

## Auth

- Application Default Credentials only.
- `ee.Initialize(project='gen-lang-client-0261050164')`
- Places API (New) uses the ADC bearer token and `X-Goog-User-Project: gen-lang-client-0261050164`.
- Do not mint keys. Do not put a Maps JavaScript key in the browser.

## Deploy

If you already have deploy rights on that GCP project (this repo does not mint them):

```bash
gcloud run deploy ground-analysis \
  --source . \
  --region asia-south1 \
  --project gen-lang-client-0261050164
```

Then set `VITE_ANALYSIS_URL` to the Cloud Run URL at **build** time for the desk. Leave it empty for a static GitHub Pages build.
