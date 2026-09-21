---
title: CyberShield
emoji: shield
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
- Live microphone monitoring with three-second audio chunks
- One-minute browser recording and scan
- Risk score, confidence, analytics, history, CSV export, and system health

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

Open `http://127.0.0.1:5000` in a browser.

For browser microphone access, allow microphone permission when prompted. The Flask process must remain running while using the dashboard.

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
| `/api/history` | GET | Read scan history |
| `/api/history/clear` | POST | Clear history and latest result |

## Notes

- Runtime uploads, generated media, virtual environments, datasets, and model weights are ignored by Git.
- `DeepfakeBench` is included as a Git submodule. Use `git submodule update --init --recursive` after cloning.
- Detection requires compatible model checkpoints and the dependencies listed in `requirements.txt`.
