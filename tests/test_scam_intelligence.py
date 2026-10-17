import unittest
from unittest.mock import patch

import scam_intelligence


class ScamIntelligenceTests(unittest.TestCase):
    def test_clean_transcript_is_low_risk_without_claiming_safety(self):
        result = scam_intelligence.analyze_scam_transcript(
            "The office will open at nine tomorrow."
        )

        self.assertEqual(result["risk_level"], "LOW")
        self.assertEqual(result["indicators"], [])
        self.assertIn("does not establish", result["summary"])

    def test_credential_request_is_high_risk_and_includes_excerpt(self):
        result = scam_intelligence.analyze_scam_transcript(
            "Please tell me the OTP and your bank password now."
        )

        self.assertEqual(result["risk_level"], "HIGH")
        self.assertEqual(len(result["indicators"]), 1)
        self.assertIn("OTP", result["indicators"][0]["excerpts"][0])
        self.assertIn("not proof", result["summary"])

    def test_urgent_impersonation_combination_is_high_risk(self):
        result = scam_intelligence.analyze_scam_transcript(
            "I am a bank officer. Transfer the money immediately."
        )

        self.assertEqual(result["risk_level"], "HIGH")
        self.assertGreaterEqual(len(result["indicators"]), 2)

    def test_empty_transcript_is_unknown(self):
        result = scam_intelligence.analyze_scam_transcript("")

        self.assertEqual(result["risk_level"], "UNKNOWN")
        self.assertEqual(result["status"], "unknown")

    def test_transcription_failure_does_not_raise(self):
        with patch.object(
            scam_intelligence.librosa,
            "load",
            side_effect=RuntimeError("unsupported test audio"),
        ):
            result = scam_intelligence.transcribe_and_analyze("unused.wav")

        self.assertEqual(result["risk_level"], "UNKNOWN")
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(result["error"], "Transcription could not be completed.")

    def test_explanation_reports_scores_without_claiming_internal_evidence(self):
        result = scam_intelligence.explain_detection_result({
            "prediction": "FAKE",
            "media_type": "Image",
            "model": "Xception",
            "confidence": 83.2,
            "real": 16.8,
            "fake": 83.2,
        })

        self.assertIn("FAKE", result["summary"])
        self.assertIn("83.2%", result["summary"])
        self.assertFalse(result["visualization_available"])
        self.assertIn("not verified truth", result["caveat"])


if __name__ == "__main__":
    unittest.main()
