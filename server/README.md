# Analysis sidecar (optional, private)

Judges use the **static OSM desk**. This folder is not a default public deploy.
Do not put `/v1/ndvi` or `/v1/places/rice-mills` on the public internet.

## Auth

Compute routes reject unauthenticated requests.

1. **Token (required by the app):** set `GROUND_SIDECAR_TOKEN` and send
   `X-Ground-Token: <token>` (preferred) or `Authorization: Bearer <token>`.
   Cloud Run IAM also uses `Authorization: Bearer`; the sidecar prefers
   `X-Ground-Token` so an identity token cannot hide a valid sidecar secret.
   If the env var is empty, those routes always return 401.
2. **Cloud Run IAM-only:** deploy with `--no-allow-unauthenticated`. Never
   `--allow-unauthenticated`.

There is **no** `CORS(app)` wide-open policy. The public V1 desk does not call
this sidecar (`VITE_ANALYSIS_URL` stays empty). Never put the sidecar token or a
Maps JS key in the frontend bundle.

Earth Engine / Places still use Application Default Credentials only:

- `ee.Initialize(project='gen-lang-client-0261050164')`
- Places API (New) via ADC bearer + `X-Goog-User-Project`
- Do not mint keys

## Deploy (IAM-only, not public)

```bash
export GROUND_SIDECAR_TOKEN=  # generate a token; do not commit it
gcloud run deploy ground-analysis \
  --source . \
  --region asia-south1 \
  --project gen-lang-client-0261050164 \
  --no-allow-unauthenticated \
  --set-env-vars GROUND_SIDECAR_TOKEN=$GROUND_SIDECAR_TOKEN
```

The static desk shows NDVI / Places as **gaps** unless a private operator
points a non-public build at this service.
