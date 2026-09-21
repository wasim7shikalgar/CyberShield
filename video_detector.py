# ============================================================
# CYBERSHIELD - VIDEO DEEPFAKE DETECTOR
# ============================================================
#
# CyberShield Video Detection Pipeline:
#
# Video
#   ↓
# OpenCV Frame Extraction
#   ↓
# Face Detection
#   ↓
# Largest Face Crop
#   ↓
# DeepfakeBench Xception
#   ↓
# REAL / FAKE Probability
#   ↓
# Multi-frame Average
#   ↓
# Risk Score
#   ↓
# LOW / MEDIUM / HIGH
#
# ============================================================

import os
import sys
import cv2
import torch
import numpy as np
import traceback

from PIL import Image
from torchvision import transforms


# ============================================================
# PROJECT PATHS
# ============================================================

PROJECT_ROOT = os.path.dirname(
    os.path.abspath(__file__)
)

DEEPFAKEBENCH_ROOT = os.path.join(
    PROJECT_ROOT,
    "DeepfakeBench"
)

TRAINING_ROOT = os.path.join(
    DEEPFAKEBENCH_ROOT,
    "training"
)

NETWORKS_ROOT = os.path.join(
    TRAINING_ROOT,
    "networks"
)

WEIGHTS_ROOT = os.path.join(
    TRAINING_ROOT,
    "weights"
)

XCEPTION_WEIGHTS = os.path.join(
    WEIGHTS_ROOT,
    "xception_best.pth"
)


# ============================================================
# PYTHON PATH
# ============================================================

for path in [
    DEEPFAKEBENCH_ROOT,
    TRAINING_ROOT,
    NETWORKS_ROOT,
]:

    if os.path.isdir(path):

        if path not in sys.path:

            sys.path.insert(
                0,
                path
            )


# ============================================================
# IMPORT XCEPTION
# ============================================================

try:

    from xception import Xception

    print(
        "✅ Xception imported successfully."
    )

except Exception as error:

    print()
    print("=" * 60)
    print("❌ XCEPTION IMPORT ERROR")
    print("=" * 60)

    print(
        error
    )

    print()

    print(
        "Expected Xception file:"
    )

    print(
        os.path.join(
            NETWORKS_ROOT,
            "xception.py"
        )
    )

    raise


# ============================================================
# DEVICE
# ============================================================

DEVICE = torch.device(
    "cuda"
    if torch.cuda.is_available()
    else "cpu"
)

print(
    f"🎯 Video detector device: {DEVICE}"
)


# ============================================================
# XCEPTION CONFIG
# ============================================================
#
# IMPORTANT:
# Your actual DeepfakeBench Xception constructor is:
#
#     Xception(xception_config)
#
# NOT:
#
#     Xception(**config)
#
# ============================================================

XCEPTION_CONFIG = {

    "num_classes": 2,

    "mode": "original",

    "inc": 3,

    "dropout": False,
}


# ============================================================
# IMAGE TRANSFORMATION
# ============================================================

IMAGE_SIZE = 256

IMAGE_TRANSFORM = transforms.Compose(
    [

        transforms.Resize(
            (
                IMAGE_SIZE,
                IMAGE_SIZE
            )
        ),

        transforms.ToTensor(),

        transforms.Normalize(
            mean=[
                0.5,
                0.5,
                0.5
            ],

            std=[
                0.5,
                0.5,
                0.5
            ]
        ),
    ]
)


# ============================================================
# GLOBAL MODEL
# ============================================================

MODEL = None


# ============================================================
# LOAD XCEPTION
# ============================================================

def load_xception_model():

    global MODEL

    print()
    print(
        "Loading Xception model..."
    )

    # --------------------------------------------------------
    # IMPORTANT:
    # Actual constructor accepts ONE config dictionary.
    # --------------------------------------------------------

    MODEL = Xception(
        XCEPTION_CONFIG
    )

    MODEL = MODEL.to(
        DEVICE
    )

    print(
        "Loading Xception checkpoint..."
    )

    if not os.path.exists(
        XCEPTION_WEIGHTS
    ):

        raise FileNotFoundError(
            "\n❌ Xception checkpoint not found.\n\n"
            f"Expected:\n"
            f"{XCEPTION_WEIGHTS}\n"
        )

    checkpoint = torch.load(
        XCEPTION_WEIGHTS,
        map_location=DEVICE
    )

    # --------------------------------------------------------
    # FIND STATE DICTIONARY
    # --------------------------------------------------------

    if isinstance(
        checkpoint,
        dict
    ):

        if "state_dict" in checkpoint:

            state_dict = (
                checkpoint["state_dict"]
            )

        elif "model_state_dict" in checkpoint:

            state_dict = (
                checkpoint[
                    "model_state_dict"
                ]
            )

        elif "model" in checkpoint:

            state_dict = (
                checkpoint["model"]
            )

        else:

            state_dict = checkpoint

    else:

        state_dict = checkpoint

    # --------------------------------------------------------
    # CLEAN STATE DICTIONARY KEYS
    # --------------------------------------------------------

    cleaned_state_dict = {}

    for key, value in state_dict.items():

        new_key = key

        prefixes = [
            "module.",
            "model.",
            "backbone.",
        ]

        changed = True

        while changed:

            changed = False

            for prefix in prefixes:

                if new_key.startswith(
                    prefix
                ):

                    new_key = new_key[
                        len(prefix):
                    ]

                    changed = True

        cleaned_state_dict[
            new_key
        ] = value

    # --------------------------------------------------------
    # LOAD WEIGHTS
    # --------------------------------------------------------

    missing_keys, unexpected_keys = (
        MODEL.load_state_dict(
            cleaned_state_dict,
            strict=False
        )
    )

    print()
    print(
        "Xception weights loaded."
    )

    print(
        "Missing keys:",
        list(missing_keys)
    )

    print(
        "Unexpected keys:",
        list(unexpected_keys)
    )

    MODEL.eval()

    print(
        "✅ Xception model ready."
    )


# ============================================================
# LOAD OPENCV FACE DETECTOR
# ============================================================

FACE_DETECTOR = None


def load_face_detector():

    global FACE_DETECTOR

    cascade_path = (
        cv2.data.haarcascades
        + "haarcascade_frontalface_default.xml"
    )

    FACE_DETECTOR = (
        cv2.CascadeClassifier(
            cascade_path
        )
    )

    if FACE_DETECTOR.empty():

        raise RuntimeError(
            "❌ OpenCV Haar face detector "
            "could not be loaded."
        )

    print(
        "✅ OpenCV Haar face detector ready."
    )


# ============================================================
# INITIALIZE
# ============================================================

def initialize():

    load_xception_model()

    load_face_detector()


# ============================================================
# FACE DETECTION
# ============================================================

def detect_faces(frame):

    if frame is None:

        return []

    gray = cv2.cvtColor(
        frame,
        cv2.COLOR_BGR2GRAY
    )

    faces = FACE_DETECTOR.detectMultiScale(
        gray,

        scaleFactor=1.1,

        minNeighbors=5,

        minSize=(
            40,
            40
        )
    )

    return faces


# ============================================================
# GET LARGEST FACE
# ============================================================

def get_largest_face(
    faces
):

    if faces is None:

        return None

    if len(faces) == 0:

        return None

    largest_face = max(
        faces,

        key=lambda face:
            face[2] * face[3]
    )

    return largest_face


# ============================================================
# CROP FACE
# ============================================================

def crop_face(
    frame,
    face,
    expansion=0.30
):

    if face is None:

        return None

    x, y, w, h = face

    frame_height, frame_width = (
        frame.shape[:2]
    )

    expand_x = int(
        w * expansion
    )

    expand_y = int(
        h * expansion
    )

    x1 = max(
        0,
        x - expand_x
    )

    y1 = max(
        0,
        y - expand_y
    )

    x2 = min(
        frame_width,
        x + w + expand_x
    )

    y2 = min(
        frame_height,
        y + h + expand_y
    )

    face_crop = frame[
        y1:y2,
        x1:x2
    ]

    if face_crop.size == 0:

        return None

    return face_crop


# ============================================================
# EXTRACT LOGITS
# ============================================================

def extract_logits(
    output
):
    """
    Handles different DeepfakeBench Xception
    output formats.

    Possible outputs:

        Tensor

        Tuple[Tensor, ...]

        List[Tensor]

        Dict containing logits/output
    """

    # --------------------------------------------------------
    # CASE 1:
    # Direct Tensor
    # --------------------------------------------------------

    if torch.is_tensor(
        output
    ):

        return output

    # --------------------------------------------------------
    # CASE 2:
    # Tuple / List
    # --------------------------------------------------------

    if isinstance(
        output,
        (tuple, list)
    ):

        # First search direct tensors
        for item in output:

            if torch.is_tensor(
                item
            ):

                return item

        # Then search nested structures
        for item in output:

            if isinstance(
                item,
                (
                    tuple,
                    list,
                    dict
                )
            ):

                try:

                    return extract_logits(
                        item
                    )

                except Exception:

                    continue

    # --------------------------------------------------------
    # CASE 3:
    # Dictionary
    # --------------------------------------------------------

    if isinstance(
        output,
        dict
    ):

        preferred_keys = [
            "logits",
            "output",
            "out",
            "prediction",
            "pred",
        ]

        for key in preferred_keys:

            if key in output:

                value = output[key]

                try:

                    return extract_logits(
                        value
                    )

                except Exception:

                    continue

        # Search all values
        for value in output.values():

            try:

                return extract_logits(
                    value
                )

            except Exception:

                continue

    # --------------------------------------------------------
    # NOTHING FOUND
    # --------------------------------------------------------

    raise TypeError(
        "❌ Could not extract Tensor logits "
        f"from model output type: "
        f"{type(output)}"
    )


# ============================================================
# PREDICT SINGLE FACE
# ============================================================

@torch.no_grad()
def predict_face(
    face_crop
):

    if face_crop is None:

        return None

    # --------------------------------------------------------
    # OpenCV BGR → RGB
    # --------------------------------------------------------

    rgb_image = cv2.cvtColor(
        face_crop,
        cv2.COLOR_BGR2RGB
    )

    # --------------------------------------------------------
    # NumPy → PIL
    # --------------------------------------------------------

    pil_image = Image.fromarray(
        rgb_image
    )

    # --------------------------------------------------------
    # TRANSFORM
    # --------------------------------------------------------

    tensor = IMAGE_TRANSFORM(
        pil_image
    )

    # Add batch dimension
    tensor = tensor.unsqueeze(
        0
    )

    tensor = tensor.to(
        DEVICE
    )

    # --------------------------------------------------------
    # MODEL
    # --------------------------------------------------------

    model_output = MODEL(
        tensor
    )

    # --------------------------------------------------------
    # EXTRACT TENSOR
    # --------------------------------------------------------

    logits = extract_logits(
        model_output
    )

    # --------------------------------------------------------
    # ENSURE BATCH DIMENSION
    # --------------------------------------------------------

    if logits.ndim == 1:

        logits = logits.unsqueeze(
            0
        )

    # --------------------------------------------------------
    # SOFTMAX
    # --------------------------------------------------------

    probabilities = torch.softmax(
        logits,
        dim=1
    )

    probabilities = (
        probabilities
        .detach()
        .cpu()
        .numpy()
    )

    # --------------------------------------------------------
    # SAFETY CHECK
    # --------------------------------------------------------

    if probabilities.shape[1] < 2:

        raise RuntimeError(
            "❌ Xception returned fewer "
            "than 2 classification outputs."
        )

    # --------------------------------------------------------
    # CLASS MAPPING
    #
    # DeepfakeBench:
    #
    # 0 = REAL
    # 1 = FAKE
    # --------------------------------------------------------

    real_probability = float(
        probabilities[0][0]
    )

    fake_probability = float(
        probabilities[0][1]
    )

    # --------------------------------------------------------
    # PREDICTION
    # --------------------------------------------------------

    if fake_probability >= real_probability:

        prediction = "FAKE"

        confidence = (
            fake_probability * 100
        )

    else:

        prediction = "REAL"

        confidence = (
            real_probability * 100
        )

    return {

        "prediction":
            prediction,

        "confidence":
            confidence,

        "real":
            real_probability * 100,

        "fake":
            fake_probability * 100,

        "real_probability":
            real_probability * 100,

        "fake_probability":
            fake_probability * 100,
    }


# ============================================================
# RISK CALCULATION
# ============================================================

def calculate_risk(
    fake_probability
):

    fake_probability = float(
        fake_probability
    )

    # Decimal → percentage
    if fake_probability <= 1.0:

        fake_probability *= 100.0

    # Clamp
    fake_probability = max(
        0.0,
        min(
            100.0,
            fake_probability
        )
    )

    risk_score = fake_probability

    if risk_score <= 30:

        risk_level = "LOW"

    elif risk_score <= 60:

        risk_level = "MEDIUM"

    else:

        risk_level = "HIGH"

    return (
        risk_score,
        risk_level
    )


# ============================================================
# GET VIDEO FRAME INDICES
# ============================================================

def get_frame_indices(
    total_frames,
    max_frames=32
):

    if total_frames <= 0:

        return []

    if total_frames <= max_frames:

        return list(
            range(total_frames)
        )

    indices = np.linspace(
        0,
        total_frames - 1,
        max_frames,
        dtype=int
    )

    return sorted(
        list(
            set(
                indices.tolist()
            )
        )
    )


# ============================================================
# DETECT VIDEO
# ============================================================

def detect_video(
    video_path,
    max_frames=32
):

    # --------------------------------------------------------
    # CHECK FILE
    # --------------------------------------------------------

    if not os.path.exists(
        video_path
    ):

        raise FileNotFoundError(
            f"❌ Video not found:\n"
            f"{video_path}"
        )

    # --------------------------------------------------------
    # OPEN VIDEO
    # --------------------------------------------------------

    capture = cv2.VideoCapture(
        video_path
    )

    if not capture.isOpened():

        raise RuntimeError(
            f"❌ Could not open video:\n"
            f"{video_path}"
        )

    # --------------------------------------------------------
    # VIDEO INFORMATION
    # --------------------------------------------------------

    total_frames = int(
        capture.get(
            cv2.CAP_PROP_FRAME_COUNT
        )
    )

    fps = float(
        capture.get(
            cv2.CAP_PROP_FPS
        )
    )

    if fps <= 0:

        fps = 1.0

    duration = (
        total_frames / fps
    )

    print()
    print("=" * 60)
    print(
        "CYBERSHIELD VIDEO DEEPFAKE DETECTION"
    )
    print("=" * 60)

    print(
        f"Video: {video_path}"
    )

    print(
        f"Total frames: {total_frames}"
    )

    print(
        f"FPS: {fps}"
    )

    print(
        f"Duration: {duration:.2f} seconds"
    )

    print("=" * 60)

    # --------------------------------------------------------
    # SELECT FRAMES
    # --------------------------------------------------------

    frame_indices = get_frame_indices(
        total_frames,
        max_frames
    )

    print(
        f"Frames selected: "
        f"{len(frame_indices)}"
    )

    print("=" * 60)

    # --------------------------------------------------------
    # STORAGE
    # --------------------------------------------------------

    frame_results = []

    processed_frames = 0

    faces_found = 0

    no_face_frames = 0

    # --------------------------------------------------------
    # PROCESS FRAMES
    # --------------------------------------------------------

    for counter, frame_index in enumerate(
        frame_indices,
        start=1
    ):

        capture.set(
            cv2.CAP_PROP_POS_FRAMES,
            int(frame_index)
        )

        success, frame = (
            capture.read()
        )

        if not success:

            print(
                f"⚠️ Could not read "
                f"frame {frame_index}"
            )

            continue

        processed_frames += 1

        # ----------------------------------------------------
        # FACE DETECTION
        # ----------------------------------------------------

        faces = detect_faces(
            frame
        )

        largest_face = (
            get_largest_face(
                faces
            )
        )

        if largest_face is None:

            no_face_frames += 1

            print(
                f"[{counter:02d}/"
                f"{len(frame_indices):02d}] "
                f"Frame {frame_index}: "
                f"NO FACE"
            )

            continue

        faces_found += 1

        # ----------------------------------------------------
        # FACE CROP
        # ----------------------------------------------------

        face_crop = crop_face(
            frame,
            largest_face
        )

        if face_crop is None:

            print(
                f"[{counter:02d}/"
                f"{len(frame_indices):02d}] "
                f"Frame {frame_index}: "
                f"FACE CROP FAILED"
            )

            continue

        # ----------------------------------------------------
        # XCEPTION PREDICTION
        # ----------------------------------------------------

        result = predict_face(
            face_crop
        )

        if result is None:

            continue

        frame_results.append(
            result
        )

        print(
            f"[{counter:02d}/"
            f"{len(frame_indices):02d}] "
            f"Frame {frame_index}: "
            f"{result['prediction']} | "
            f"REAL "
            f"{result['real']:.2f}% | "
            f"FAKE "
            f"{result['fake']:.2f}%"
        )

    # --------------------------------------------------------
    # RELEASE VIDEO
    # --------------------------------------------------------

    capture.release()

    # --------------------------------------------------------
    # CHECK
    # --------------------------------------------------------

    if len(frame_results) == 0:

        raise RuntimeError(
            "\n❌ No usable face detected "
            "in the video.\n\n"
            "Possible reasons:\n"
            "1. No visible face.\n"
            "2. Face is too small.\n"
            "3. Face is too blurry.\n"
            "4. Lighting is poor.\n"
            "5. Haar detector could not detect it."
        )

    # --------------------------------------------------------
    # AVERAGE REAL / FAKE
    # --------------------------------------------------------

    real_values = [

        result["real"]

        for result in frame_results

    ]

    fake_values = [

        result["fake"]

        for result in frame_results

    ]

    average_real = float(
        np.mean(
            real_values
        )
    )

    average_fake = float(
        np.mean(
            fake_values
        )
    )

    # --------------------------------------------------------
    # FINAL PREDICTION
    # --------------------------------------------------------

    if average_fake >= average_real:

        final_prediction = "FAKE"

        final_confidence = (
            average_fake
        )

    else:

        final_prediction = "REAL"

        final_confidence = (
            average_real
        )

    # --------------------------------------------------------
    # RISK
    # --------------------------------------------------------

    risk_score, risk_level = (
        calculate_risk(
            average_fake
        )
    )

    # --------------------------------------------------------
    # RESULT
    # --------------------------------------------------------

    result = {

        "prediction":
            final_prediction,

        "confidence":
            round(
                final_confidence,
                2
            ),

        "real":
            round(
                average_real,
                2
            ),

        "fake":
            round(
                average_fake,
                2
            ),

        "real_probability":
            round(
                average_real,
                2
            ),

        "fake_probability":
            round(
                average_fake,
                2
            ),

        "risk":
            round(
                risk_score,
                2
            ),

        "risk_score":
            round(
                risk_score,
                2
            ),

        "risk_level":
            risk_level,

        "frames_total":
            total_frames,

        "frames_processed":
            processed_frames,

        "faces_found":
            faces_found,

        "no_face_frames":
            no_face_frames,

        "analyzed_frames":
            len(
                frame_results
            ),

        "fps":
            round(
                fps,
                2
            ),

        "duration":
            round(
                duration,
                2
            ),

        "model":
            "Xception + DeepfakeBench",

        "source":
            "video",

        "video":
            os.path.basename(
                video_path
            ),
    }

    return result


# ============================================================
# PRINT RESULT
# ============================================================

def print_result(
    result
):

    print()
    print()
    print("=" * 60)
    print(
        "CYBERSHIELD VIDEO ANALYSIS RESULT"
    )
    print("=" * 60)

    print()

    print(
        f"🎬 Video: "
        f"{result['video']}"
    )

    print(
        f"🤖 Model: "
        f"{result['model']}"
    )

    print()

    print(
        f"Prediction: "
        f"{result['prediction']}"
    )

    print(
        f"Confidence: "
        f"{result['confidence']:.2f}%"
    )

    print()

    print(
        f"REAL Probability: "
        f"{result['real']:.2f}%"
    )

    print(
        f"FAKE Probability: "
        f"{result['fake']:.2f}%"
    )

    print()

    print(
        f"Risk Score: "
        f"{result['risk']:.2f}%"
    )

    print(
        f"Risk Level: "
        f"{result['risk_level']}"
    )

    print()

    print(
        f"Total Frames: "
        f"{result['frames_total']}"
    )

    print(
        f"Frames Processed: "
        f"{result['frames_processed']}"
    )

    print(
        f"Faces Found: "
        f"{result['faces_found']}"
    )

    print(
        f"Frames Analyzed: "
        f"{result['analyzed_frames']}"
    )

    print(
        f"No-Face Frames: "
        f"{result['no_face_frames']}"
    )

    print()

    print("=" * 60)

    if result["prediction"] == "FAKE":

        print(
            "🚨 CYBERSHIELD: "
            "POTENTIAL DEEPFAKE DETECTED"
        )

    else:

        print(
            "✅ CYBERSHIELD: "
            "VIDEO APPEARS REAL"
        )

    print("=" * 60)

    print()


# ============================================================
# MAIN
# ============================================================

def main():

    import argparse

    parser = argparse.ArgumentParser(
        description=(
            "CyberShield "
            "Xception Video Deepfake Detector"
        )
    )

    parser.add_argument(
        "video",
        help=(
            "Path to video file"
        )
    )

    parser.add_argument(
        "--max-frames",
        type=int,
        default=32,
        help=(
            "Maximum frames to analyze. "
            "Default: 32"
        )
    )

    args = parser.parse_args()

    try:

        # ----------------------------------------------------
        # INITIALIZE MODELS
        # ----------------------------------------------------

        initialize()

        # ----------------------------------------------------
        # DETECT VIDEO
        # ----------------------------------------------------

        result = detect_video(
            args.video,
            max_frames=args.max_frames
        )

        # ----------------------------------------------------
        # PRINT RESULT
        # ----------------------------------------------------

        print_result(
            result
        )

    except Exception as error:

        print()
        print("=" * 60)
        print(
            "❌ VIDEO DETECTION ERROR"
        )
        print("=" * 60)

        print(
            str(error)
        )

        print()

        traceback.print_exc()

        print()


# ============================================================
# PROGRAM ENTRY
# ============================================================

if __name__ == "__main__":

    main()