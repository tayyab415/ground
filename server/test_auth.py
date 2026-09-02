"""Sidecar token gate: IAM Bearer must not hide X-Ground-Token."""

from __future__ import annotations

import unittest

import app as sidecar


class SidecarAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self._prev = sidecar.SIDECAR_TOKEN
        sidecar.app.testing = True
        self.client = sidecar.app.test_client()

    def tearDown(self) -> None:
        sidecar.SIDECAR_TOKEN = self._prev

    def test_unset_token_is_401_even_with_headers(self) -> None:
        sidecar.SIDECAR_TOKEN = ""
        res = self.client.post(
            "/v1/ndvi",
            json={"districts": []},
            headers={
                "X-Ground-Token": "anything",
                "Authorization": "Bearer anything",
            },
        )
        self.assertEqual(res.status_code, 401)
        body = res.get_json()
        self.assertEqual(body["error"], "unauthorized")

    def test_iam_bearer_does_not_hide_x_ground_token(self) -> None:
        sidecar.SIDECAR_TOKEN = "sidecar-secret"
        res = self.client.post(
            "/v1/ndvi",
            json={"districts": []},
            headers={
                "Authorization": "Bearer ya29.cloud-run-iam-identity",
                "X-Ground-Token": "sidecar-secret",
            },
        )
        self.assertNotEqual(res.status_code, 401)
        body = res.get_json()
        self.assertNotEqual(body.get("error"), "unauthorized")

    def test_bearer_sidecar_token_is_accepted(self) -> None:
        sidecar.SIDECAR_TOKEN = "sidecar-secret"
        res = self.client.post(
            "/v1/ndvi",
            json={"districts": []},
            headers={"Authorization": "Bearer sidecar-secret"},
        )
        self.assertNotEqual(res.status_code, 401)

    def test_iam_bearer_alone_is_rejected(self) -> None:
        sidecar.SIDECAR_TOKEN = "sidecar-secret"
        res = self.client.post(
            "/v1/ndvi",
            json={"districts": []},
            headers={"Authorization": "Bearer ya29.cloud-run-iam-identity"},
        )
        self.assertEqual(res.status_code, 401)

    def test_no_cors_app(self) -> None:
        self.assertFalse(any("cors" in str(type(e)).lower() for e in sidecar.app.iter_blueprints()))
        src = sidecar.__file__
        with open(src, encoding="utf-8") as fh:
            text = fh.read()
        self.assertNotIn("CORS(app)", text)
        self.assertNotIn("flask_cors", text)

    def test_ndvi_uses_polygon_30day_recipe(self) -> None:
        with open(sidecar.__file__, encoding="utf-8") as fh:
            text = fh.read()
        self.assertNotIn("buffer(4000)", text)
        self.assertNotIn("2023-06-01", text)
        self.assertIn("FAO/GAUL/2015/level2", text)
        self.assertIn("SCL", text)
        self.assertIn("Siddharth Nagar", text)

    def test_ee_filter_date_end_is_exclusive_plus_one_day(self) -> None:
        from datetime import date

        self.assertEqual(
            sidecar.ee_filter_end_exclusive(date(2026, 8, 27)).isoformat(),
            "2026-08-28",
        )
        with open(sidecar.__file__, encoding="utf-8") as fh:
            text = fh.read()
        self.assertIn("filterDate(start_s, end_exclusive)", text)
        self.assertIn('"endDate": end_s', text)
        self.assertNotIn("filterDate(start_s, end_s)", text)

    def test_geocode_and_directions_and_ground_checks_require_auth(self) -> None:
        sidecar.SIDECAR_TOKEN = "sidecar-secret"
        for path in ("/v1/geocode", "/v1/directions", "/v1/ground-checks"):
            res = self.client.post(path, json={})
            self.assertEqual(res.status_code, 401, path)



if __name__ == "__main__":
    unittest.main()
