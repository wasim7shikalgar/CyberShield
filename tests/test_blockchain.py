import io
import json
import os
import tempfile
import unittest

from blockchain import (
    BlockchainLedger,
    LedgerIntegrityError,
    sha256_file,
    sha256_stream,
)


class BlockchainLedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.ledger_path = os.path.join(
            self.temp_dir.name,
            "blockchain.json",
        )
        self.ledger = BlockchainLedger(self.ledger_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    @staticmethod
    def result(scan_id):
        return {
            "id": scan_id,
            "timestamp": "2026-10-13T14:00:00",
            "media_type": "Image",
            "prediction": "REAL",
            "confidence": 91.5,
            "risk_score": 8.5,
            "model": "test detector",
        }

    def test_append_links_blocks_and_verifies_original_file(self):
        media_path = os.path.join(self.temp_dir.name, "sample.bin")
        with open(media_path, "wb") as media_file:
            media_file.write(b"original media")
        media_hash = sha256_file(media_path)

        first = self.ledger.append_scan(
            self.result("scan-1"),
            media_hash,
        )
        second = self.ledger.append_scan(
            self.result("scan-2"),
            media_hash,
        )

        with open(self.ledger_path, "r", encoding="utf-8") as ledger_file:
            blocks = json.load(ledger_file)

        self.assertEqual(first["block_index"], 0)
        self.assertEqual(second["block_index"], 1)
        self.assertEqual(blocks[1]["previous_hash"], first["block_hash"])
        self.assertTrue(self.ledger.status()["valid"])
        self.assertTrue(
            self.ledger.verify_scan("scan-1", media_hash)["file_matches"]
        )
        self.assertFalse(
            self.ledger.verify_scan("scan-1", "0" * 64)["file_matches"]
        )

    def test_modified_block_is_detected_and_blocks_future_writes(self):
        self.ledger.append_scan(
            self.result("scan-1"),
            "a" * 64,
        )
        with open(self.ledger_path, "r", encoding="utf-8") as ledger_file:
            blocks = json.load(ledger_file)
        blocks[0]["certificate"]["prediction"] = "FAKE"
        with open(self.ledger_path, "w", encoding="utf-8") as ledger_file:
            json.dump(blocks, ledger_file)

        self.assertFalse(self.ledger.status()["valid"])
        with self.assertRaises(LedgerIntegrityError):
            self.ledger.append_scan(
                self.result("scan-2"),
                "b" * 64,
            )

    def test_rejects_duplicate_scan_ids(self):
        self.ledger.append_scan(
            self.result("scan-1"),
            "a" * 64,
        )
        with self.assertRaises(ValueError):
            self.ledger.append_scan(
                self.result("scan-1"),
                "b" * 64,
            )

    def test_malformed_block_is_reported_as_invalid(self):
        with open(self.ledger_path, "w", encoding="utf-8") as ledger_file:
            json.dump([{"scan_id": []}], ledger_file)

        status = self.ledger.status()

        self.assertFalse(status["valid"])
        self.assertEqual(status["invalid_block"], 0)

    def test_hash_helpers_match_bytes(self):
        media_path = os.path.join(self.temp_dir.name, "hash.bin")
        with open(media_path, "wb") as media_file:
            media_file.write(b"same bytes")

        with open(media_path, "rb") as media_file:
            stream_hash = sha256_stream(media_file)

        self.assertEqual(stream_hash, sha256_file(media_path))
        with self.assertRaises(ValueError):
            sha256_stream(io.BytesIO(b""))


if __name__ == "__main__":
    unittest.main()
