import os
import unittest
import uuid
from unittest.mock import MagicMock, patch


os.environ["ENABLE_MEDIA_DETECTORS"] = "false"
with (
    patch(
        "transformers.AutoFeatureExtractor.from_pretrained",
        return_value=MagicMock(),
    ),
    patch(
        "transformers.AutoModelForAudioClassification.from_pretrained",
        return_value=MagicMock(),
    ),
):
    import app as cybershield_app


class ScanReportRouteTests(unittest.TestCase):
    def setUp(self):
        self.previous_history = list(cybershield_app.history)
        self.scan_id = str(uuid.uuid4())
        cybershield_app.history[:] = [{
            "id": self.scan_id,
            "timestamp": "2026-10-16T10:30:00",
            "media_type": "Image",
            "prediction": "REAL",
            "model": "Xception + DeepfakeBench",
            "confidence": 87.5,
            "real": 87.5,
            "fake": 12.5,
            "risk": 12.5,
            "risk_level": "LOW",
            "media_hash": "a" * 64,
            "block_hash": "b" * 64,
            "explanation": {
                "summary": "The detector returned REAL based on its scores.",
                "visualization_note": "No visualization is available.",
                "caveat": "This is not verified truth.",
            },
        }]
        self.client = cybershield_app.app.test_client()

    def tearDown(self):
        cybershield_app.history[:] = self.previous_history

    def test_report_route_returns_a_scan_specific_pdf(self):
        response = self.client.get(
            f"/api/reports/{self.scan_id}"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "application/pdf")
        self.assertIn(
            f"CyberShield_Report_{self.scan_id}.pdf",
            response.headers["Content-Disposition"],
        )
        self.assertTrue(response.data.startswith(b"%PDF-"))

    def test_report_route_rejects_invalid_and_missing_scan_ids(self):
        invalid = self.client.get("/api/reports/not-a-uuid")
        missing = self.client.get(
            f"/api/reports/{uuid.uuid4()}"
        )

        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(missing.status_code, 404)


if __name__ == "__main__":
    unittest.main()
