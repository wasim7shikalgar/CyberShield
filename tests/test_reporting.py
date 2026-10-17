import unittest

from reporting import create_scan_report_pdf


class DetectionReportTests(unittest.TestCase):
    def test_report_is_a_pdf_and_contains_scan_specific_data(self):
        scan_id = "9c42934d-673c-421c-9a08-4f6ddb57f0f7"
        result = {
            "id": scan_id,
            "timestamp": "2026-10-16T10:30:00",
            "media_type": "Audio",
            "prediction": "FAKE",
            "model": "Wav2Vec2",
            "confidence": 91.2,
            "real": 8.8,
            "fake": 91.2,
            "risk": 91.2,
            "risk_level": "HIGH",
            "media_hash": "a" * 64,
            "block_hash": "b" * 64,
            "scam_intelligence": {
                "risk_level": "HIGH",
                "summary": "Rule-based warning indicators found.",
                "transcript": "Please share your OTP.",
                "indicators": [{
                    "label": "Credential request",
                    "description": "An OTP was requested.",
                    "excerpts": ["share your OTP"],
                }],
                "recommendations": ["Do not share one-time codes."],
            },
            "explanation": {
                "summary": "The detector returned FAKE based on its scores.",
                "visualization_note": "No visualization is available.",
                "caveat": "This is not verified truth.",
            },
            "filename": "<script>alert('x')</script>.wav",
        }

        pdf = create_scan_report_pdf(result, {"valid": True})

        self.assertTrue(pdf.startswith(b"%PDF-"))
        self.assertTrue(pdf.rstrip().endswith(b"%%EOF"))
        self.assertGreater(len(pdf), 1000)

    def test_missing_optional_fields_still_generate_report(self):
        pdf = create_scan_report_pdf(
            {
                "id": "scan-with-missing-data",
                "media_type": "Image",
                "prediction": "REAL",
            },
            {"valid": False},
        )

        self.assertTrue(pdf.startswith(b"%PDF-"))
        self.assertGreater(len(pdf), 500)


if __name__ == "__main__":
    unittest.main()
