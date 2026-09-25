from flask import Flask, render_template, jsonify, request
import base64
import json
import os
import tempfile
import time
import threading
import uuid
import subprocess
import shutil
import traceback

import numpy as np
import torch
import librosa
import soundfile as sf

from transformers import (
    AutoFeatureExtractor,
    AutoModelForAudioClassification
)

try:
    from flask_sock import Sock

    SOCKET_IMPORT_ERROR = None

except Exception as error:
    Sock = None
    SOCKET_IMPORT_ERROR = str(error)


from live_audio import (
    start_recording,
    stop_recording,
    is_recording
)


# ============================================================
# IMAGE / VIDEO DETECTORS
# ============================================================

try:
    from image_detector import (
        initialize as initialize_image_detector,
        detect_image
    )

    IMAGE_DETECTOR_IMPORT_ERROR = None

except Exception as error:

    initialize_image_detector = None
    detect_image = None
    IMAGE_DETECTOR_IMPORT_ERROR = str(error)

    print()
    print("=" * 70)
    print("IMAGE DETECTOR IMPORT ERROR")
    print("=" * 70)
    print(error)
    traceback.print_exc()
    print("=" * 70)


try:
    from video_detector import (
        initialize as initialize_video_detector,
        detect_video
    )

    VIDEO_DETECTOR_IMPORT_ERROR = None

except Exception as error:

    initialize_video_detector = None
    detect_video = None
    VIDEO_DETECTOR_IMPORT_ERROR = str(error)

    print()
    print("=" * 70)
    print("VIDEO DETECTOR IMPORT ERROR")
    print("=" * 70)
    print(error)
    traceback.print_exc()
    print("=" * 70)


# ============================================================
# FLASK APP
# ============================================================

app = Flask(__name__)

if Sock is not None:
    socket = Sock(app)
else:
    socket = None

app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024

PROJECT_ROOT = os.path.dirname(
    os.path.abspath(__file__)
)


# ============================================================
# SETTINGS
# ============================================================

MODEL_NAME = "zodumair/wav2vec2-deepfake-voice-detector"

AUDIO_FOLDER = os.path.join(
    PROJECT_ROOT,
    "live_audio_chunks"
)
UPLOADED_AUDIO_FOLDER = os.path.join(
    PROJECT_ROOT,
    "uploaded_audio"
)
RECORDED_AUDIO_FOLDER = os.path.join(
    PROJECT_ROOT,
    "recorded_audio"
)

IMAGE_UPLOAD_FOLDER = os.path.join(
    PROJECT_ROOT,
    "uploaded_images"
)
VIDEO_UPLOAD_FOLDER = os.path.join(
    PROJECT_ROOT,
    "uploaded_videos"
)

SAMPLE_RATE = 16000


# ============================================================
# DEVICE
# ============================================================

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)


# ============================================================
# CREATE FOLDERS
# ============================================================

for folder in [
    AUDIO_FOLDER,
    UPLOADED_AUDIO_FOLDER,
    RECORDED_AUDIO_FOLDER,
    IMAGE_UPLOAD_FOLDER,
    VIDEO_UPLOAD_FOLDER
]:
    os.makedirs(folder, exist_ok=True)


# ============================================================
# LOAD AUDIO MODEL
# ============================================================

print()
print("=" * 70)
print("CYBERSHIELD AI MULTIMODAL SECURITY")
print("=" * 70)

print()
print("Loading Wav2Vec2 audio model...")
print("Model:", MODEL_NAME)
print("Device:", DEVICE)

feature_extractor = AutoFeatureExtractor.from_pretrained(
    MODEL_NAME
)

model = AutoModelForAudioClassification.from_pretrained(
    MODEL_NAME
)

model.to(DEVICE)
model.eval()

print()
print("Wav2Vec2 audio model ready.")


# ============================================================
# DETECTOR STATE
# ============================================================

image_detector_ready = False
video_detector_ready = False

image_detector_lock = threading.Lock()
video_detector_lock = threading.Lock()


# ============================================================
# IMAGE DETECTOR INITIALIZATION
# ============================================================

def ensure_image_detector():

    global image_detector_ready

    if image_detector_ready:
        return True

    if initialize_image_detector is None:

        raise RuntimeError(
            "Image detector is unavailable.\n\n"
            "Import error:\n"
            + str(IMAGE_DETECTOR_IMPORT_ERROR)
        )

    with image_detector_lock:

        if image_detector_ready:
            return True

        print()
        print("=" * 70)
        print("INITIALIZING IMAGE DETECTOR")
        print("=" * 70)

        try:

            initialize_image_detector()

            image_detector_ready = True

            print("Image detector ready.")
            print("=" * 70)

            return True

        except Exception as error:

            print()
            print("IMAGE DETECTOR INITIALIZATION FAILED")
            print(error)
            traceback.print_exc()

            raise RuntimeError(
                "Image detector initialization failed: "
                + str(error)
            )


# ============================================================
# VIDEO DETECTOR INITIALIZATION
# ============================================================

def ensure_video_detector():

    global video_detector_ready

    if video_detector_ready:
        return True

    if initialize_video_detector is None:

        raise RuntimeError(
            "Video detector is unavailable.\n\n"
            "Import error:\n"
            + str(VIDEO_DETECTOR_IMPORT_ERROR)
        )

    with video_detector_lock:

        if video_detector_ready:
            return True

        print()
        print("=" * 70)
        print("INITIALIZING VIDEO DETECTOR")
        print("=" * 70)

        try:

            initialize_video_detector()

            video_detector_ready = True

            print("Video detector ready.")
            print("=" * 70)

            return True

        except Exception as error:

            print()
            print("VIDEO DETECTOR INITIALIZATION FAILED")
            print(error)
            traceback.print_exc()

            raise RuntimeError(
                "Video detector initialization failed: "
                + str(error)
            )


# ============================================================
# GLOBAL RESULT
# ============================================================

latest_result = {

    "id": "",
    "timestamp": "",
    "chunk": "Waiting...",
    "filename": "",
    "media_type": "Audio",

    "prediction": "WAITING",
    "classification": "WAITING",

    "confidence": 0,

    "real": 0,
    "fake": 0,

    "real_probability": 0,
    "fake_probability": 0,

    "risk": 0,
    "risk_score": 0,
    "risk_level": "LOW",

    "model": "Wav2Vec2",
    "source": "None",

    "recording": False
}

history = []

result_lock = threading.Lock()

processed_chunks = set()


# ============================================================
# TIME
# ============================================================

def now_string():

    return time.strftime(
        "%Y-%m-%dT%H:%M:%S"
    )


# ============================================================
# SAFE FLOAT
# ============================================================

def safe_float(value, default=0.0):

    try:
        return float(value)

    except Exception:
        return float(default)


# ============================================================
# NORMALIZE PROBABILITIES
# ============================================================

def normalize_probabilities(real, fake):

    real = max(
        0.0,
        safe_float(real)
    )

    fake = max(
        0.0,
        safe_float(fake)
    )

    total = real + fake

    if total <= 0:

        return 50.0, 50.0

    real = (
        real / total
    ) * 100.0

    fake = (
        fake / total
    ) * 100.0

    return real, fake


# ============================================================
# RISK
# ============================================================

def calculate_risk(fake_probability):

    risk = max(
        0.0,
        min(
            100.0,
            safe_float(fake_probability)
        )
    )

    if risk <= 30:

        level = "LOW"

    elif risk <= 60:

        level = "MEDIUM"

    else:

        level = "HIGH"

    return risk, level


def get_voice_action(risk_level):

    if risk_level == "HIGH":

        return {
            "alert_status": "ALERT",
            "recommendation": (
                "Do not approve sensitive requests. "
                "Verify the caller using a trusted callback or MFA."
            )
        }

    if risk_level == "MEDIUM":

        return {
            "alert_status": "CAUTION",
            "recommendation": (
                "Use secondary verification before sharing information "
                "or approving a transaction."
            )
        }

    return {
        "alert_status": "MONITORING",
        "recommendation": "Continue monitoring the voice signal."
    }


# ============================================================
# BUILD AUDIO RESULT
# ============================================================

def build_result(
    prediction,
    confidence,
    real,
    fake,
    source,
    filename="",
    chunk="",
    model_name="Wav2Vec2",
    voice_metrics=None
):

    real, fake = normalize_probabilities(
        real,
        fake
    )

    prediction = str(
        prediction
    ).upper()

    if prediction not in {
        "REAL",
        "FAKE"
    }:

        prediction = (
            "FAKE"
            if fake > real
            else "REAL"
        )

    confidence = (
        fake
        if prediction == "FAKE"
        else real
    )

    risk, risk_level = calculate_risk(
        fake
    )

    voice_action = get_voice_action(
        risk_level
    )

    result = {

        "id": str(uuid.uuid4()),

        "timestamp": now_string(),

        "chunk": (
            chunk
            or filename
            or "Audio"
        ),

        "filename": filename,

        "media_type": "Audio",

        "prediction": prediction,

        "classification": prediction,

        "confidence": round(
            confidence,
            2
        ),

        "real": round(
            real,
            2
        ),

        "fake": round(
            fake,
            2
        ),

        "real_probability": round(
            real,
            2
        ),

        "fake_probability": round(
            fake,
            2
        ),

        "risk": round(
            risk,
            2
        ),

        "risk_score": round(
            risk,
            2
        ),

        "risk_level": risk_level,

        "alert_status": voice_action[
            "alert_status"
        ],

        "recommendation": voice_action[
            "recommendation"
        ],

        "model": model_name,

        "source": source,

        "recording": is_recording()
    }

    if voice_metrics:

        result.update(voice_metrics)

    return result


# ============================================================
# UPDATE RESULT
# ============================================================

def update_latest(
    result,
    add_history=True
):

    global latest_result

    with result_lock:

        latest_result = dict(result)

        if add_history:

            history.insert(
                0,
                dict(result)
            )

            if len(history) > 100:

                del history[100:]


# ============================================================
# BUILD IMAGE / VIDEO RESULT
# ============================================================

def build_media_result(
    detector_result,
    media_type,
    source,
    filename,
    model_name
):

    if detector_result is None:

        raise RuntimeError(
            "Detector returned no result."
        )

    prediction = str(
        detector_result.get(
            "prediction",
            detector_result.get(
                "classification",
                "UNKNOWN"
            )
        )
    ).upper()

    real = safe_float(
        detector_result.get(
            "real",
            detector_result.get(
                "real_probability",
                0
            )
        )
    )

    fake = safe_float(
        detector_result.get(
            "fake",
            detector_result.get(
                "fake_probability",
                0
            )
        )
    )

    if real <= 1.0 and fake <= 1.0:

        real *= 100.0
        fake *= 100.0

    real, fake = normalize_probabilities(
        real,
        fake
    )

    if prediction not in {
        "REAL",
        "FAKE"
    }:

        prediction = (
            "FAKE"
            if fake >= real
            else "REAL"
        )

    confidence = safe_float(
        detector_result.get(
            "confidence",
            fake if prediction == "FAKE" else real
        )
    )

    if confidence <= 1.0:

        confidence *= 100.0

    confidence = max(
        0.0,
        min(
            100.0,
            confidence
        )
    )

    risk = safe_float(
        detector_result.get(
            "risk",
            detector_result.get(
                "risk_score",
                fake
            )
        )
    )

    if risk <= 1.0:

        risk *= 100.0

    risk = max(
        0.0,
        min(
            100.0,
            risk
        )
    )

    risk_level = str(
        detector_result.get(
            "risk_level",
            ""
        )
    ).upper()

    if risk_level not in {
        "LOW",
        "MEDIUM",
        "HIGH"
    }:

        _, risk_level = calculate_risk(
            risk
        )

    result = {

        "id": str(uuid.uuid4()),

        "timestamp": now_string(),

        "chunk": filename,

        "filename": filename,

        "media_type": media_type,

        "prediction": prediction,

        "classification": prediction,

        "confidence": round(
            confidence,
            2
        ),

        "real": round(
            real,
            2
        ),

        "fake": round(
            fake,
            2
        ),

        "real_probability": round(
            real,
            2
        ),

        "fake_probability": round(
            fake,
            2
        ),

        "risk": round(
            risk,
            2
        ),

        "risk_score": round(
            risk,
            2
        ),

        "risk_level": risk_level,

        "model": detector_result.get(
            "model",
            model_name
        ),

        "source": source,

        "recording": is_recording()
    }

    detector_fields = [

        "faces_detected",
        "face_used",

        "faces_found",
        "no_face_frames",

        "frames_total",
        "frames_processed",

        "analyzed_frames",

        "fps",
        "duration",

        "frames_selected",
        "faces_missed"
    ]

    for key in detector_fields:

        if key in detector_result:

            result[key] = detector_result[key]

    if media_type == "Video":

        result["frames_selected"] = detector_result.get(
            "frames_selected",
            detector_result.get(
                "analyzed_frames",
                0
            )
        )

        result["faces_detected"] = detector_result.get(
            "faces_detected",
            detector_result.get(
                "faces_found",
                0
            )
        )

        result["faces_missed"] = detector_result.get(
            "faces_missed",
            detector_result.get(
                "no_face_frames",
                0
            )
        )

    return result


# ============================================================
# AUDIO DETECTION
# ============================================================

def extract_voice_metrics(audio):

    if audio is None or len(audio) == 0:

        return {}

    try:

        frame_rms = librosa.feature.rms(
            y=audio,
            frame_length=512,
            hop_length=256
        )[0]

        mean_rms = float(frame_rms.mean())

        activity_threshold = max(
            0.01,
            mean_rms * 0.35
        )

        speech_activity = float(
            (frame_rms > activity_threshold).mean() * 100.0
        )

        zero_crossing_rate = float(
            librosa.feature.zero_crossing_rate(
                audio,
                frame_length=512,
                hop_length=256
            ).mean()
        )

        spectral_centroid = float(
            librosa.feature.spectral_centroid(
                y=audio,
                sr=SAMPLE_RATE,
                n_fft=512,
                hop_length=256
            ).mean()
        )

        return {
            "audio_duration_seconds": round(
                len(audio) / SAMPLE_RATE,
                3
            ),
            "speech_activity": round(
                speech_activity,
                2
            ),
            "rms_energy": round(
                mean_rms,
                6
            ),
            "zero_crossing_rate": round(
                zero_crossing_rate,
                6
            ),
            "spectral_centroid_hz": round(
                spectral_centroid,
                2
            )
        }

    except Exception as error:

        print(
            "Voice metrics error:",
            error
        )

        return {}

def detect_audio(audio_path):

    inference_started = time.perf_counter()

    try:

        audio, sample_rate = librosa.load(
            audio_path,
            sr=SAMPLE_RATE,
            mono=True
        )

    except Exception as error:

        print(
            "Audio loading error:",
            error
        )

        return None

    if audio is None or len(audio) == 0:

        return None

    try:

        inputs = feature_extractor(
            audio,
            sampling_rate=SAMPLE_RATE,
            return_tensors="pt"
        )

        inputs = {
            key: value.to(DEVICE)
            for key, value in inputs.items()
        }

    except Exception as error:

        print(
            "Feature extraction error:",
            error
        )

        return None

    try:

        with torch.no_grad():

            outputs = model(
                **inputs
            )

            probabilities = torch.softmax(
                outputs.logits,
                dim=-1
            )[0]

    except Exception as error:

        print(
            "Audio model inference error:",
            error
        )

        return None

    id2label = model.config.id2label

    real_probability = 0.0
    fake_probability = 0.0

    for index, probability in enumerate(
        probabilities
    ):

        label = id2label.get(
            index,
            str(index)
        )

        label = str(
            label
        ).lower()

        probability = float(
            probability.item()
        )

        if "real" in label:

            real_probability = probability

        elif "fake" in label:

            fake_probability = probability

    if (
        real_probability == 0
        and
        fake_probability == 0
        and
        len(probabilities) >= 2
    ):

        real_probability = float(
            probabilities[0].item()
        )

        fake_probability = float(
            probabilities[1].item()
        )

    real_probability, fake_probability = normalize_probabilities(
        real_probability,
        fake_probability
    )

    if fake_probability > real_probability:

        prediction = "FAKE"
        confidence = fake_probability

    else:

        prediction = "REAL"
        confidence = real_probability

    return {

        "prediction": prediction,

        "confidence": confidence,

        "real": real_probability,

        "fake": fake_probability,

        "voice_metrics": {
            **extract_voice_metrics(audio),
            "analysis_latency_ms": round(
                (time.perf_counter() - inference_started) * 1000.0,
                2
            )
        }
    }


# ============================================================
# AUDIO CONVERSION
# ============================================================

def convert_to_wav(
    source_path,
    output_path
):

    ffmpeg = shutil.which(
        "ffmpeg"
    )

    if not ffmpeg:

        raise RuntimeError(
            "FFmpeg is not installed or not available in PATH."
        )

    command = [

        ffmpeg,

        "-y",

        "-i",
        source_path,

        "-ac",
        "1",

        "-ar",
        str(SAMPLE_RATE),

        "-sample_fmt",
        "s16",

        output_path
    ]

    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    if result.returncode != 0:

        raise RuntimeError(
            "FFmpeg conversion failed:\n"
            + result.stderr[-1500:]
        )

    return output_path


# ============================================================
# ANALYZE AUDIO FILE
# ============================================================

def analyze_audio_file(
    file_path,
    source,
    filename
):

    extension = os.path.splitext(
        file_path
    )[1].lower()

    analysis_path = file_path
    temporary_wav = None

    if extension != ".wav":

        temporary_wav = (
            file_path
            + "_converted.wav"
        )

        convert_to_wav(
            file_path,
            temporary_wav
        )

        analysis_path = temporary_wav

    try:

        result = detect_audio(
            analysis_path
        )

    finally:

        if (
            temporary_wav
            and
            os.path.exists(
                temporary_wav
            )
        ):

            try:
                os.remove(
                    temporary_wav
                )

            except Exception:
                pass

    if result is None:

        raise RuntimeError(
            "Could not analyze audio."
        )

    final_result = build_result(

        prediction=result["prediction"],

        confidence=result["confidence"],

        real=result["real"],

        fake=result["fake"],

        source=source,

        filename=filename,

        chunk=filename,

        model_name="Wav2Vec2 Deepfake Detector",

        voice_metrics=result.get(
            "voice_metrics",
            {}
        )
    )

    update_latest(
        final_result,
        add_history=True
    )

    return final_result


# ============================================================
# LIVE AUDIO MONITOR
# ============================================================

def get_chunk_number(filename):

    try:

        return int(
            os.path.splitext(
                filename
            )[0].split("_")[-1]
        )

    except Exception:

        return 999999


def analyze_live_file(filename):

    if filename in processed_chunks:
        return

    audio_path = os.path.join(
        AUDIO_FOLDER,
        filename
    )

    if not os.path.exists(audio_path):
        return

    try:

        size1 = os.path.getsize(
            audio_path
        )

        time.sleep(0.15)

        size2 = os.path.getsize(
            audio_path
        )

        if size1 != size2:
            return

        result = detect_audio(
            audio_path
        )

        if result is None:

            processed_chunks.add(
                filename
            )

            return

        final_result = build_result(

            prediction=result["prediction"],

            confidence=result["confidence"],

            real=result["real"],

            fake=result["fake"],

            source="Live Microphone",

            filename=filename,

            chunk=filename,

            model_name="Wav2Vec2 Deepfake Detector",

            voice_metrics=result.get(
                "voice_metrics",
                {}
            )
        )

        update_latest(
            final_result,
            add_history=True
        )

        processed_chunks.add(
            filename
        )

        print(
            "LIVE:",
            filename,
            final_result["prediction"],
            final_result["confidence"]
        )

    except Exception as error:

        print(
            "Live analysis error:",
            error
        )

        processed_chunks.add(
            filename
        )


def monitor_audio():

    print(
        "Live audio monitor thread started."
    )

    while True:

        try:

            if os.path.exists(
                AUDIO_FOLDER
            ):

                files = [

                    filename

                    for filename in os.listdir(
                        AUDIO_FOLDER
                    )

                    if (
                        filename.startswith("chunk_")
                        and
                        filename.lower().endswith(".wav")
                    )
                ]

                files.sort(
                    key=get_chunk_number
                )

                for filename in files:

                    analyze_live_file(
                        filename
                    )

        except Exception as error:

            print(
                "Monitor error:",
                error
            )

        time.sleep(0.25)


# ============================================================
# DASHBOARD
# ============================================================

@app.route("/")
def dashboard():

    return render_template(
        "dashboard.html"
    )


# ============================================================
# LATEST
# ============================================================

@app.route(
    "/api/latest",
    methods=["GET"]
)
def api_latest():

    with result_lock:

        result = dict(
            latest_result
        )

    result["recording"] = is_recording()

    return jsonify(result)


# ============================================================
# HISTORY
# ============================================================

@app.route(
    "/api/history",
    methods=["GET"]
)
def api_history():

    with result_lock:

        items = [
            dict(item)
            for item in history
        ]

    return jsonify({

        "success": True,

        "history": items

    })


@app.route(
    "/api/history/clear",
    methods=["POST"]
)
def api_history_clear():

    global processed_chunks

    with result_lock:

        history.clear()

        latest_result.update({
            "id": "",
            "timestamp": "",
            "chunk": "Waiting...",
            "filename": "",
            "media_type": "Audio",
            "prediction": "WAITING",
            "classification": "WAITING",
            "confidence": 0,
            "real": 0,
            "fake": 0,
            "real_probability": 0,
            "fake_probability": 0,
            "risk": 0,
            "risk_score": 0,
            "risk_level": "LOW",
            "model": "Wav2Vec2",
            "source": "None",
            "recording": is_recording()
        })

    processed_chunks.clear()

    return jsonify({
        "success": True,
        "message": "History and latest result reset."
    })


# ============================================================
# LIVE AUDIO START
# ============================================================

@app.route(
    "/api/audio/start",
    methods=["POST"]
)
def api_audio_start():

    global processed_chunks

    try:

        processed_chunks.clear()

        success = start_recording()

        if not success:

            return jsonify({

                "success": False,

                "message":
                    "Server microphone is unavailable. Use the browser Record & Scan control instead."

            }), 500

        update_latest({

            "id": str(uuid.uuid4()),

            "timestamp": now_string(),

            "chunk": "Recording...",

            "filename": "",

            "media_type": "Audio",

            "prediction": "WAITING",

            "classification": "WAITING",

            "confidence": 0,

            "real": 0,

            "fake": 0,

            "real_probability": 0,

            "fake_probability": 0,

            "risk": 0,

            "risk_score": 0,

            "risk_level": "LOW",

            "model": "Wav2Vec2",

            "source": "Live Microphone",

            "recording": True

        }, add_history=False)

        return jsonify({

            "success": True,

            "message":
                "Live audio recording started."

        })

    except Exception as error:

        print(
            "Start audio error:",
            error
        )

        return jsonify({

            "success": False,

            "message": str(error)

        }), 500


# ============================================================
# LIVE AUDIO STOP
# ============================================================

@app.route(
    "/api/audio/stop",
    methods=["POST"]
)
def api_audio_stop():

    try:

        success = stop_recording()

        return jsonify({

            "success": success,

            "message":
                "Live audio stopped."

        })

    except Exception as error:

        return jsonify({

            "success": False,

            "message": str(error)

        }), 500


# ============================================================
# LIVE STATUS
# ============================================================

@app.route(
    "/api/audio/status",
    methods=["GET"]
)
def api_audio_status():

    return jsonify({

        "success": True,

        "recording": is_recording()

    })


# ============================================================
# LIVE STREAM AUDIO
# ============================================================

def decode_stream_message(message):

    if isinstance(message, bytes):
        return message

    if not isinstance(message, str):
        return None

    try:
        payload = json.loads(message)
    except json.JSONDecodeError:
        return None

    if payload.get("event") == "stop":
        return b""

    media = payload.get("media", {})
    encoded_audio = media.get("payload")

    if not encoded_audio:
        return None

    try:
        return base64.b64decode(encoded_audio)
    except Exception:
        return None


def analyze_stream_window(audio, call_id):

    temporary_path = None

    try:

        with tempfile.NamedTemporaryFile(
            suffix=".wav",
            delete=False
        ) as temporary_file:

            temporary_path = temporary_file.name

        sf.write(
            temporary_path,
            audio,
            SAMPLE_RATE,
            subtype="PCM_16"
        )

        result = detect_audio(
            temporary_path
        )

        if result is None:
            return None

        final_result = build_result(
            prediction=result["prediction"],
            confidence=result["confidence"],
            real=result["real"],
            fake=result["fake"],
            source="Live Audio Stream",
            filename=call_id,
            chunk="stream_window",
            model_name="Wav2Vec2 Deepfake Detector",
            voice_metrics=result.get(
                "voice_metrics",
                {}
            )
        )

        final_result["call_id"] = call_id
        final_result["streaming"] = True

        update_latest(
            final_result,
            add_history=True
        )

        return final_result

    finally:

        if temporary_path and os.path.exists(temporary_path):

            try:
                os.remove(temporary_path)
            except Exception:
                pass


if socket is not None:

    @socket.route("/ws/audio/<call_id>")
    def audio_stream(ws, call_id):

        window_samples = SAMPLE_RATE * 2
        hop_samples = SAMPLE_RATE // 2
        audio_buffer = np.empty(0, dtype=np.float32)

        ws.send(json.dumps({
            "success": True,
            "message": "Audio stream connected.",
            "sample_rate": SAMPLE_RATE,
            "format": "PCM16 mono",
            "window_seconds": 2,
            "hop_seconds": 0.5
        }))

        while True:

            message = ws.receive()

            if message is None:
                break

            raw_audio = decode_stream_message(message)

            if raw_audio == b"":
                break

            if not raw_audio:
                continue

            samples = np.frombuffer(
                raw_audio,
                dtype=np.int16
            ).astype(np.float32) / 32768.0

            audio_buffer = np.concatenate(
                (audio_buffer, samples)
            )

            while len(audio_buffer) >= window_samples:

                window = audio_buffer[:window_samples]
                result = analyze_stream_window(
                    window,
                    call_id
                )

                if result is not None:
                    ws.send(json.dumps({
                        "success": True,
                        "result": result
                    }))

                audio_buffer = audio_buffer[hop_samples:]


# ============================================================
# AUDIO UPLOAD
# ============================================================

@app.route(
    "/api/audio/upload",
    methods=["POST"]
)
def api_audio_upload():

    file = request.files.get(
        "audio"
    )

    if file is None:

        return jsonify({

            "success": False,

            "message":
                "No audio file received."

        }), 400

    if not file.filename:

        return jsonify({

            "success": False,

            "message":
                "No audio file selected."

        }), 400

    extension = os.path.splitext(
        file.filename
    )[1].lower()

    allowed = {

        ".wav",
        ".mp3",
        ".m4a",
        ".ogg",
        ".flac",
        ".webm"

    }

    if extension not in allowed:

        return jsonify({

            "success": False,

            "message":
                "Unsupported audio format."

        }), 400

    safe_name = (
        "audio_"
        + str(uuid.uuid4())
        + extension
    )

    path = os.path.join(
        UPLOADED_AUDIO_FOLDER,
        safe_name
    )

    try:

        file.save(path)

        result = analyze_audio_file(

            path,

            "Uploaded Audio",

            file.filename

        )

        return jsonify({

            "success": True,

            "result": result

        })

    except Exception as error:

        print(
            "Audio upload error:",
            error
        )

        traceback.print_exc()

        return jsonify({

            "success": False,

            "message": str(error)

        }), 500

    finally:

        try:

            if os.path.exists(path):
                os.remove(path)

        except Exception:
            pass


# ============================================================
# 15 SECOND RECORDED AUDIO
# ============================================================

@app.route(
    "/api/audio/recorded",
    methods=["POST"]
)
def api_audio_recorded():

    file = request.files.get(
        "audio"
    )

    if file is None:

        return jsonify({

            "success": False,

            "message":
                "No recorded audio received."

        }), 400

    if not file.filename:

        return jsonify({

            "success": False,

            "message":
                "Recorded audio has no filename."

        }), 400

    extension = os.path.splitext(
        file.filename
    )[1].lower()

    if extension not in {

        ".wav",
        ".webm",
        ".ogg",
        ".mp3",
        ".m4a",
        ".flac"

    }:

        extension = ".webm"

    safe_name = (

        "recorded_"
        + time.strftime("%Y%m%d_%H%M%S")
        + "_"
        + str(uuid.uuid4())[:8]
        + extension

    )

    path = os.path.join(
        RECORDED_AUDIO_FOLDER,
        safe_name
    )

    try:

        file.save(path)

        result = analyze_audio_file(

            path,

            "15-Second Recording",

            safe_name

        )

        result["recording_file"] = path

        return jsonify({

            "success": True,

            "message":
                "15-second recording saved and analyzed.",

            "result": result

        })

    except Exception as error:

        print(
            "Recorded audio error:",
            error
        )

        traceback.print_exc()

        return jsonify({

            "success": False,

            "message": str(error)

        }), 500


# ============================================================
# IMAGE UPLOAD / SCAN
# ============================================================

def process_image_upload():

    file = (
        request.files.get("image")
        or request.files.get("file")
        or request.files.get("media")
    )

    if file is None:

        return jsonify({

            "success": False,

            "message":
                "No image file received."

        }), 400

    if not file.filename:

        return jsonify({

            "success": False,

            "message":
                "No image selected."

        }), 400

    extension = os.path.splitext(
        file.filename
    )[1].lower()

    allowed = {

        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".bmp"

    }

    if extension not in allowed:

        return jsonify({

            "success": False,

            "message":
                "Unsupported image format."

        }), 400

    safe_name = (
        "image_"
        + str(uuid.uuid4())
        + extension
    )

    image_path = os.path.join(
        IMAGE_UPLOAD_FOLDER,
        safe_name
    )

    original_name = file.filename

    try:

        print()
        print("=" * 70)
        print("IMAGE SCAN")
        print("=" * 70)
        print("Original:", original_name)

        file.save(image_path)

        ensure_image_detector()

        if detect_image is None:

            raise RuntimeError(
                "Image detector function is unavailable."
            )

        detector_result = detect_image(
            image_path
        )

        final_result = build_media_result(

            detector_result=detector_result,

            media_type="Image",

            source="Uploaded Image",

            filename=original_name,

            model_name="Xception + DeepfakeBench"

        )

        update_latest(
            final_result,
            add_history=True
        )

        print(
            "IMAGE:",
            final_result["prediction"],
            final_result["confidence"]
        )

        return jsonify({

            "success": True,

            "result": final_result

        })

    except Exception as error:

        print()
        print("IMAGE ANALYSIS ERROR")
        print(error)
        traceback.print_exc()

        return jsonify({

            "success": False,

            "message":
                "Image detection failed: "
                + str(error),

            "media_type": "Image"

        }), 500

    finally:

        try:

            if os.path.exists(image_path):
                os.remove(image_path)

        except Exception:
            pass


@app.route(
    "/api/image/upload",
    methods=["POST"]
)
def api_image_upload():

    return process_image_upload()


@app.route(
    "/api/image/scan",
    methods=["POST"]
)
def api_image_scan():

    return process_image_upload()


# ============================================================
# VIDEO UPLOAD / SCAN
# ============================================================

def process_video_upload():

    file = (
        request.files.get("video")
        or request.files.get("file")
        or request.files.get("media")
    )

    if file is None:

        return jsonify({

            "success": False,

            "message":
                "No video file received."

        }), 400

    if not file.filename:

        return jsonify({

            "success": False,

            "message":
                "No video selected."

        }), 400

    extension = os.path.splitext(
        file.filename
    )[1].lower()

    allowed = {

        ".mp4",
        ".avi",
        ".mov",
        ".mkv",
        ".webm"

    }

    if extension not in allowed:

        return jsonify({

            "success": False,

            "message":
                "Unsupported video format."

        }), 400

    safe_name = (
        "video_"
        + str(uuid.uuid4())
        + extension
    )

    video_path = os.path.join(
        VIDEO_UPLOAD_FOLDER,
        safe_name
    )

    original_name = file.filename

    try:

        print()
        print("=" * 70)
        print("VIDEO SCAN")
        print("=" * 70)
        print("Original:", original_name)

        file.save(video_path)

        ensure_video_detector()

        if detect_video is None:

            raise RuntimeError(
                "Video detector function is unavailable."
            )

        detector_result = detect_video(

            video_path,

            max_frames=32

        )

        final_result = build_media_result(

            detector_result=detector_result,

            media_type="Video",

            source="Uploaded Video",

            filename=original_name,

            model_name="Xception + DeepfakeBench"

        )

        update_latest(
            final_result,
            add_history=True
        )

        print(
            "VIDEO:",
            final_result["prediction"],
            final_result["confidence"]
        )

        return jsonify({

            "success": True,

            "result": final_result

        })

    except Exception as error:

        print()
        print("VIDEO ANALYSIS ERROR")
        print(error)
        traceback.print_exc()

        return jsonify({

            "success": False,

            "message":
                "Video detection failed: "
                + str(error),

            "media_type": "Video"

        }), 500

    finally:

        try:

            if os.path.exists(video_path):
                os.remove(video_path)

        except Exception:
            pass


@app.route(
    "/api/video/upload",
    methods=["POST"]
)
def api_video_upload():

    return process_video_upload()


@app.route(
    "/api/video/scan",
    methods=["POST"]
)
def api_video_scan():

    return process_video_upload()


# ============================================================
# RESET
# ============================================================

@app.route(
    "/api/audio/reset",
    methods=["POST"]
)
def api_audio_reset():

    with result_lock:

        latest_result.update({

            "chunk": "Waiting...",

            "filename": "",

            "media_type": "Audio",

            "prediction": "WAITING",

            "classification": "WAITING",

            "confidence": 0,

            "real": 0,

            "fake": 0,

            "real_probability": 0,

            "fake_probability": 0,

            "risk": 0,

            "risk_score": 0,

            "risk_level": "LOW",

            "model": "Wav2Vec2",

            "source": "None",

            "recording": is_recording()

        })

    return jsonify({
        "success": True
    })


# ============================================================
# HEALTH
# ============================================================

@app.route(
    "/api/health",
    methods=["GET"]
)
def api_health():

    return jsonify({

        "success": True,

        "status": "online",

        "audio_model": "ready",

        "streaming_audio": (
            "ready"
            if socket is not None
            else "unavailable"
        ),

        "streaming_audio_import_error":
            SOCKET_IMPORT_ERROR,

        "image_model": (
            "ready"
            if image_detector_ready
            else (
                "available"
                if initialize_image_detector is not None
                else "error"
            )
        ),

        "video_model": (
            "ready"
            if video_detector_ready
            else (
                "available"
                if initialize_video_detector is not None
                else "error"
            )
        ),

        "image_detector_import_error":
            IMAGE_DETECTOR_IMPORT_ERROR,

        "video_detector_import_error":
            VIDEO_DETECTOR_IMPORT_ERROR,

        "device": str(DEVICE),

        "recording": is_recording(),

        "recorded_audio_folder":
            RECORDED_AUDIO_FOLDER,

        "image_upload_folder":
            IMAGE_UPLOAD_FOLDER,

        "video_upload_folder":
            VIDEO_UPLOAD_FOLDER

    })


# ============================================================
# 404 HANDLER
# ============================================================

@app.errorhandler(404)
def handle_404(error):

    if request.path.startswith("/api/"):

        return jsonify({

            "success": False,

            "message":
                "API endpoint not found.",

            "endpoint":
                request.path,

            "method":
                request.method

        }), 404

    return error


# ============================================================
# 413 HANDLER
# ============================================================

@app.errorhandler(413)
def handle_413(error):

    return jsonify({

        "success": False,

        "message":
            "Uploaded file is too large. Maximum size is 500 MB."

    }), 413


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":

    monitor_thread = threading.Thread(

        target=monitor_audio,

        daemon=True

    )

    monitor_thread.start()

    print()
    print("=" * 70)
    print("CYBERSHIELD SERVER STARTING")
    print("=" * 70)

    print()
    print("Live Audio:")
    print("Server microphone + frontend control")

    print()
    print("15-second Recording:")
    print("Browser microphone -> recorded_audio/")

    print()
    print("Image Detection:")
    print("Xception + DeepfakeBench")

    print()
    print("Video Detection:")
    print("Xception + DeepfakeBench")

    print()
    print("Image API:")
    print("POST /api/image/upload")
    print("POST /api/image/scan")

    print()
    print("Video API:")
    print("POST /api/video/upload")
    print("POST /api/video/scan")

    print()
    print("History:")
    print("Enabled")

    print()
    print("Dashboard:")
    print("http://127.0.0.1:5000")

    print()
    print("Server:")
    print("0.0.0.0:5000")

    print("=" * 70)

    app.run(

        host="0.0.0.0",

        port=int(os.environ.get("PORT", "7860")),

        debug=False,

        threaded=True

    )