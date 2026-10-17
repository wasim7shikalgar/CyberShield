"""Persistent, tamper-evident hash-chain ledger for scan certificates."""

import hashlib
import json
import os
import threading
import uuid
from datetime import datetime, timezone


GENESIS_HASH = "0" * 64


class LedgerIntegrityError(RuntimeError):
    """Raised when the stored ledger is malformed or has been modified."""


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as file_handle:
        for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_stream(stream):
    digest = hashlib.sha256()
    has_content = False
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        has_content = True
        digest.update(chunk)
    if not has_content:
        raise ValueError("The uploaded file is empty.")
    return digest.hexdigest()


class BlockchainLedger:
    """A local append-only ledger linked by SHA-256 block hashes."""

    def __init__(self, path):
        self.path = os.path.abspath(path)
        self._lock = threading.RLock()

    @staticmethod
    def _canonical_json(value):
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")

    @classmethod
    def _block_hash(cls, block):
        unhashed_block = {
            key: value for key, value in block.items() if key != "hash"
        }
        return hashlib.sha256(cls._canonical_json(unhashed_block)).hexdigest()

    def _read_blocks(self):
        if not os.path.exists(self.path):
            return []
        with open(self.path, "r", encoding="utf-8") as file_handle:
            blocks = json.load(file_handle)
        if not isinstance(blocks, list):
            raise LedgerIntegrityError("The blockchain ledger is not a list.")
        return blocks

    def _validate_blocks(self, blocks):
        previous_hash = GENESIS_HASH
        scan_ids = set()

        for index, block in enumerate(blocks):
            if not isinstance(block, dict):
                return False, "Ledger block is not an object.", index
            if type(block.get("index")) is not int or block["index"] != index:
                return False, "Ledger block index mismatch.", index
            scan_id = block.get("scan_id")
            if not isinstance(scan_id, str) or not scan_id:
                return False, "Ledger scan ID is invalid.", index
            if block.get("previous_hash") != previous_hash:
                return False, "Previous-block hash mismatch.", index
            if not isinstance(block.get("hash"), str):
                return False, "Block hash is missing.", index
            if block.get("hash") != self._block_hash(block):
                return False, "Block hash mismatch.", index
            if scan_id in scan_ids:
                return False, "Duplicate scan ID in ledger.", index
            media_hash = block.get("media_hash")
            if (
                not isinstance(media_hash, str)
                or len(media_hash) != 64
                or any(character not in "0123456789abcdef" for character in media_hash)
            ):
                return False, "Media hash is missing.", index
            certificate = block.get("certificate")
            if not isinstance(certificate, dict):
                return False, "Scan certificate is missing.", index
            previous_hash = block["hash"]
            scan_ids.add(scan_id)

        return True, None, None

    def status(self):
        with self._lock:
            try:
                blocks = self._read_blocks()
            except (OSError, json.JSONDecodeError, LedgerIntegrityError) as error:
                return {
                    "valid": False,
                    "block_count": 0,
                    "latest_hash": None,
                    "error": str(error),
                }

            valid, error, invalid_index = self._validate_blocks(blocks)
            latest_block = blocks[-1] if blocks else None
            return {
                "valid": valid,
                "block_count": len(blocks),
                "latest_hash": (
                    latest_block.get("hash")
                    if isinstance(latest_block, dict)
                    else None
                ),
                "error": error,
                "invalid_block": invalid_index,
            }

    def append_scan(self, result, media_hash):
        with self._lock:
            blocks = self._read_blocks()
            valid, error, invalid_index = self._validate_blocks(blocks)
            if not valid:
                raise LedgerIntegrityError(
                    f"Ledger integrity check failed at block "
                    f"{invalid_index}: {error}"
                )

            scan_id = str(result["id"])
            if any(block["scan_id"] == scan_id for block in blocks):
                raise ValueError(f"Scan ID {scan_id} is already in the ledger.")

            previous_hash = blocks[-1]["hash"] if blocks else GENESIS_HASH
            certificate = {
                "scan_id": scan_id,
                "timestamp": str(result["timestamp"]),
                "media_type": str(result["media_type"]),
                "prediction": str(result["prediction"]),
                "confidence": result.get("confidence"),
                "risk_score": result.get("risk_score", result.get("risk")),
                "model": str(result["model"]),
            }
            block = {
                "index": len(blocks),
                "timestamp": datetime.now(timezone.utc).isoformat(
                    timespec="seconds"
                ),
                "scan_id": scan_id,
                "media_hash": media_hash,
                "certificate": certificate,
                "previous_hash": previous_hash,
            }
            block["hash"] = self._block_hash(block)
            blocks.append(block)
            self._write_blocks(blocks)

            return {
                "block_index": block["index"],
                "block_hash": block["hash"],
                "media_hash": media_hash,
            }

    def _write_blocks(self, blocks):
        directory = os.path.dirname(self.path)
        os.makedirs(directory, exist_ok=True)
        temporary_path = self.path + ".tmp." + uuid.uuid4().hex
        try:
            with open(temporary_path, "w", encoding="utf-8") as file_handle:
                json.dump(
                    blocks,
                    file_handle,
                    sort_keys=True,
                    separators=(",", ":"),
                    ensure_ascii=False,
                )
                file_handle.flush()
                os.fsync(file_handle.fileno())
            os.replace(temporary_path, self.path)
        finally:
            if os.path.exists(temporary_path):
                os.remove(temporary_path)

    def verify_scan(self, scan_id, media_hash):
        with self._lock:
            blocks = self._read_blocks()
            valid, error, invalid_index = self._validate_blocks(blocks)
            if not valid:
                return {
                    "valid": False,
                    "file_matches": False,
                    "error": error,
                    "invalid_block": invalid_index,
                }

            block = next(
                (
                    item
                    for item in blocks
                    if item["scan_id"] == scan_id
                ),
                None,
            )
            if block is None:
                return {
                    "valid": True,
                    "file_matches": False,
                    "error": "Scan ID was not found in the ledger.",
                }

            file_matches = block["media_hash"] == media_hash
            return {
                "valid": True,
                "file_matches": file_matches,
                "block_index": block["index"],
                "block_hash": block["hash"],
                "error": None if file_matches else "File hash does not match.",
            }
