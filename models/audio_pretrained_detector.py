from flask import Flask, render_template, request, jsonify
import os
import subprocess
import sys

app = Flask(__name__)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER


# ============================================================
# HOME
# ============================================================

@app.route("/")
def home():
    return render_template("index.html")


# ============================================================
# UPLOAD VIDEO
# ============================================================

@app.route("/upload", methods=["POST"])
def upload():

    if "video" not in request.files:
        return jsonify({
            "success": False,
            "message": "No video selected."
        }), 400

    video = request.files["video"]

    if video.filename == "":
        return jsonify({
            "success": False,
            "message": "No video selected."
        }), 400

    video_path = os.path.join(
        app.config["UPLOAD_FOLDER"],
        video.filename
    )

    video.save(video_path)

    return jsonify({
        "success": True,
        "message": "Video uploaded successfully.",
        "filename": video.filename,
        "path": os.path.abspath(video_path)
    })


# ============================================================
# AUDIO DETECTION
# ============================================================

@app.route("/analyze", methods=["POST"])
def analyze():

    video_filename = request.form.get("filename")

    if not video_filename:
        return jsonify({
            "success": False,
            "message": "Video filename missing."
        }), 400

    video_path = os.path.join(
        app.config["UPLOAD_FOLDER"],
        video_filename
    )

    if not os.path.exists(video_path):
        return jsonify({
            "success": False,
            "message": "Video file not found."
        }), 404

    # --------------------------------------------------------
    # Extract audio
    # --------------------------------------------------------

    audio_path = "deepfake_audio.wav"

    try:

        subprocess.run(
            [
                sys.executable,
                "extract_audio.py"
            ],
            check=True
        )

    except Exception as e:

        return jsonify({
            "success": False,
            "message": f"Audio extraction failed: {str(e)}"
        }), 500

    # --------------------------------------------------------
    # Run pretrained audio detector
    # --------------------------------------------------------

    try:

        result = subprocess.run(
            [
                sys.executable,
                os.path.join(
                    "models",
                    "audio_pretrained_detector.py"
                )
            ],
            capture_output=True,
            text=True
        )

        output = result.stdout

        print("\n" + "=" * 60)
        print("AUDIO MODEL OUTPUT")
        print("=" * 60)
        print(output)

        # ----------------------------------------------------
        # Extract prediction
        # ----------------------------------------------------

        prediction = "UNKNOWN"
        confidence = 0.0
        real_probability = 0.0
        fake_probability = 0.0

        for line in output.splitlines():

            line = line.strip()

            if line.startswith("Prediction:"):
                prediction = line.split(":", 1)[1].strip()

            elif line.startswith("Confidence:"):
                value = line.split(":", 1)[1].strip()
                confidence = float(
                    value.replace("%", "")
                )

            elif line.startswith("Real:"):
                value = line.split(":", 1)[1].strip()
                real_probability = float(
                    value.replace("%", "")
                )

            elif line.startswith("Fake:"):
                value = line.split(":", 1)[1].strip()
                fake_probability = float(
                    value.replace("%", "")
                )

        return jsonify({

            "success": True,

            "video": {
                "status": "Analyzed"
            },

            "audio": {
                "status": "Analyzed",
                "prediction": prediction,
                "confidence": confidence,
                "real": real_probability,
                "fake": fake_probability
            },

            "final": {
                "prediction": prediction,
                "confidence": confidence
            }

        })

    except Exception as e:

        return jsonify({
            "success": False,
            "message": f"Audio detection failed: {str(e)}"
        }), 500


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":

    print("=" * 60)
    print("AI VIDEO & AUDIO DEEPFAKE DETECTION")
    print("=" * 60)

    print("\nStarting Flask server...")

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )