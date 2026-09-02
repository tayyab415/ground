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


if __name__ == "__main__":
    unittest.main()
