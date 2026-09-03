# District / county geometry

- `up-rice-districts.geojson` — simplified extract of Uttar Pradesh district
  polygons from [udit-001/india-maps-data](https://github.com/udit-001/india-maps-data)
  (credits DataMeet / Survey of India index maps). Not an official Survey of
  India product. V1 keeps twelve eastern rice-belt districts.
- `maharashtra-rice-districts.geojson` — twelve rice-producing districts
  (Vidarbha plateau + Konkan coast), simplified from OSM boundary relations
  via `scripts/build-region-snapshot.py`.
- `us-delta-rice-counties.geojson` — fourteen rice-belt counties in the US
  Mississippi Delta (Arkansas + Mississippi), via
  `scripts/build-region-snapshot-us.py`.

The candidate pools are bounded so ranking stays sourced; these are not
full-state censuses.
