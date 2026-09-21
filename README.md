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
