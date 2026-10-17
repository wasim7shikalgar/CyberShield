---
title: CyberShield
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
---

# CyberShield

CyberShield is a Flask-based multimodal deepfake detection dashboard for audio, image, and video files.

## How It Works

Users upload media or record audio from the dashboard. Flask sends the file to the relevant AI detector, calculates REAL/FAKE confidence and manipulation risk, and displays the result in the dashboard history.

## Features

- Audio deepfake detection with Wav2Vec2
- Image deepfake detection with Xception and DeepfakeBench
- Video frame analysis with face detection
- Browser live microphone stream to the audio detector over WebSocket
- One-minute browser recording and scan
- Risk score, confidence, analytics, history, CSV export, and system health
- Tamper-evident local hash-chain audit ledger for scan certificates
- Optional audio transcription with transparent scam-warning rules
- Per-scan PDF reports and factual result explanations

## Requirements

- Python 3.10 or newer
- FFmpeg available on `PATH` for non-WAV audio
- A working microphone for live monitoring
- Git submodules initialized for DeepfakeBench

## Setup

```powershell
git clone https://github.com/wasim7shikalgar/CyberShield.git
cd CyberShield
git submodule update --init --recursive
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

The application expects the required detector checkpoints locally. Large model files are intentionally excluded from Git. Place them in the paths expected by the detector modules before using image or video detection.

## Run

```powershell
python app.py
```

Open `http://localhost:7860` in a browser.

For browser microphone access, use `http://localhost:7860` or an HTTPS URL and allow microphone permission when prompted. Browsers block microphone capture on insecure HTTP origins such as `http://192.168.x.x:7860`; when accessing the app from another device, configure HTTPS. The Flask process must remain running while using the dashboard.

Live monitoring streams audio from the browser microphone to
`/ws/audio/<call_id>` as mono PCM16 at 16 kHz. It requires the `flask-sock`
dependency and a WebSocket-capable server. The server evaluates overlapping
3-second windows, advancing by 1 second per inference. The extra capture time
before the first result is intentional: it avoids classifying overly short
audio segments. The audio classifier is a machine learning estimate, not proof
of authenticity; test it on labeled examples from the kinds of cloned voices
and recording conditions expected in deployment. The current confidence value
is the model's softmax score and is not independently calibrated.

## Deploy Online

The repository includes `render.yaml` for Render deployment:

1. Create a Render account and choose **New Blueprint**.
2. Connect `https://github.com/wasim7shikalgar/CyberShield`.
3. Select the repository and deploy the blueprint.
4. Open the generated `onrender.com` URL and share it.

Model checkpoints are excluded from Git because of their size. Add the required checkpoints to the deployed service or use persistent object storage before enabling image and video detection.

### Hugging Face Spaces

To create a public browser-accessible demo without running the backend on your PC, create a new Docker Space and upload this repository. The Space URL will be public and the Flask backend will run in the Space container on port `7860`.

The free CPU tier may be slow or sleep when idle. Audio model files are downloaded during startup; image and video detection also require their model checkpoints to be added to the Space storage.

## API Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/` | GET | Dashboard |
| `/api/health` | GET | System health |
| `/api/audio/upload` | POST | Audio scan using form field `audio` |
| `/api/image/upload` | POST | Image scan using form field `image` |
| `/api/video/upload` | POST | Video scan using form field `video` |
| `/api/audio/start` | POST | Start live microphone monitoring |
| `/api/audio/stop` | POST | Stop live microphone monitoring |
| `/ws/audio/<call_id>` | WebSocket | Browser live audio stream (mono PCM16, 16 kHz) |
| `/api/history` | GET | Read scan history |
| `/api/history/clear` | POST | Clear history and latest result |
| `/api/blockchain/status` | GET | Check local hash-chain ledger integrity |
| `/api/blockchain/verify` | POST | Verify a file against a scan certificate (`scan_id` and `file`) |
| `/api/reports/<scan_id>` | GET | Download a PDF report for a scan in current server history |

## Scan Certificate Ledger

After each completed audio, image, or video scan (including live audio chunks),
the app hashes the original media with SHA-256 and adds a certificate to
`results/blockchain.json`. Each block includes the previous block hash, its
media hash, scan ID, verdict, confidence, risk score, and model name. Media
content and user details are not stored in the ledger. Clearing dashboard scan
history does not remove ledger blocks.

The dashboard shows ledger health and each scan's block hash. Select **Verify
file** on a history row and choose the original file to check both the ledger
chain and whether the file's hash matches that scan. The API can also be used
directly:

```powershell
curl.exe -F "scan_id=<scan-id-from-history>" -F "file=@C:\path\to\original.mp4" http://127.0.0.1:5000/api/blockchain/verify
```

This is a **local hash-chain audit ledger**, not a decentralized/public
blockchain: it can reveal accidental or unsophisticated edits to stored blocks,
but does not protect against an attacker who can rewrite the ledger and its
hashes. Use a blockchain network or externally signed/replicated ledger if
independent, decentralized verification is required. `BLOCKCHAIN_LEDGER_PATH`
can be set to choose a persistent ledger location; the default is inside the
runtime `results/` folder. On deployments with ephemeral filesystems, configure
persistent storage or ledger history will be lost when the instance is
recreated.

## Scam Intelligence, Explanations, and PDF Reports

Audio file uploads optionally run local speech-to-text using the
`openai/whisper-tiny` Transformers model, downloaded on first use. Set
`CYBERSHIELD_ASR_MODEL` to use another compatible Transformers
automatic-speech-recognition model. The transcription attempt is independent
of the existing Wav2Vec2 authenticity detector: if ASR is unavailable or
fails, the original voice prediction is still returned with scam risk marked
`UNKNOWN`. Live microphone windows are not transcribed because the overlapping
one-second inference schedule would add excessive latency and compute.

Scam indicators use documented keyword/pattern rules over the transcript. They
are warnings, not a determination that a conversation is a scam; real voices
may be used in scams and synthetic voices are not automatically malicious.
The "Why This Result?" panel reports the detector's actual prediction and
scores but does not claim access to hidden model reasoning. No Grad-CAM
heatmap is produced because the current detector interface does not expose a
validated explanation visualization.

Use **Download Report** on a completed scan or **Download PDF** in scan
history. `GET /api/reports/<scan_id>` generates a PDF from the matching scan
record without rerunning a model. Reports include available scan scores,
scam-intelligence data, explanation, hashes, and ledger status. Report lookup
uses the current in-memory server history, so a scan may no longer be
downloadable after the server restarts or history is cleared. The hash-chain
status does not establish that a prediction is correct, and file matching is
not claimed unless the original file is separately verified.

Run the ledger's standalone tests from the project directory with:

```powershell
python -m unittest tests.test_blockchain -v
```

The scam rules and report generation can be tested with:

```powershell
python -m unittest tests.test_scam_intelligence tests.test_reporting -v
```

## Notes

- Runtime uploads, generated media, virtual environments, datasets, and model weights are ignored by Git.
- `DeepfakeBench` is included as a Git submodule. Use `git submodule update --init --recursive` after cloning.
- Detection requires compatible model checkpoints and the dependencies listed in `requirements.txt`.
