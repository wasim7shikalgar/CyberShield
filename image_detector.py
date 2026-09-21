# ============================================================
# CYBERSHIELD - IMAGE DEEPFAKE DETECTOR
# ============================================================
#
# Image Detection Pipeline:
#
# Image
#   ↓
# OpenCV Face Detection
#   ↓
# Largest Face Crop
#   ↓
# Xception + DeepfakeBench
#   ↓
# REAL / FAKE Probability
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

    print(error)

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
    f"🎯 Image detector device: {DEVICE}"
)


# ============================================================
# XCEPTION CONFIG
# ============================================================

XCEPTION_CONFIG = {

    "num_classes": 2,

    "mode": "original",

    "inc": 3,

    "dropout": False,
}


# ============================================================
# IMAGE CONFIG
# ============================================================

IMAGE_SIZE = 256


# ============================================================
# IMAGE TRANSFORMATION
# ============================================================

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
# FACE DETECTOR
# ============================================================

FACE_DETECTOR = None


# ============================================================
# INITIALIZATION STATE
# ============================================================

INITIALIZED = False


# ============================================================
# LOAD XCEPTION MODEL
# ============================================================

def load_xception_model():

    global MODEL

    if MODEL is not None:
        return

    print()
    print(
        "Loading Xception model..."
    )

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
    # CLEAN STATE DICTIONARY
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
# LOAD FACE DETECTOR
# ============================================================

def load_face_detector():

    global FACE_DETECTOR

    if FACE_DETECTOR is not None:
        return

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

    global INITIALIZED

    if INITIALIZED:
        return

    print()
    print("=" * 60)
    print("CYBERSHIELD IMAGE DETECTOR INITIALIZATION")
    print("=" * 60)

    load_xception_model()

    load_face_detector()

    INITIALIZED = True

    print(
        "✅ Image detector initialized."
    )

    print("=" * 60)


# ============================================================
# ENSURE INITIALIZED
# ============================================================

def ensure_initialized():

    if not INITIALIZED:
        initialize()


# ============================================================
# READ IMAGE
# ============================================================

def read_image(
    image_path
):

    if not os.path.exists(
        image_path
    ):

        raise FileNotFoundError(
            f"❌ Image not found:\n"
            f"{image_path}"
        )

    image = cv2.imread(
        image_path
    )

    if image is None:

        raise RuntimeError(
            f"❌ Could not read image:\n"
            f"{image_path}"
        )

    return image


# ============================================================
# FACE DETECTION
# ============================================================

def detect_faces(
    image
):

    ensure_initialized()

    if image is None:
        return []

    gray = cv2.cvtColor(
        image,
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
    image,
    face,
    expansion=0.30
):

    if face is None:
        return None

    x, y, w, h = face

    image_height, image_width = (
        image.shape[:2]
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
        image_width,
        x + w + expand_x
    )

    y2 = min(
        image_height,
        y + h + expand_y
    )

    face_crop = image[
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

    # --------------------------------------------------------
    # Tensor
    # --------------------------------------------------------

    if torch.is_tensor(
        output
    ):

        return output

    # --------------------------------------------------------
    # Tuple / List
    # --------------------------------------------------------

    if isinstance(
        output,
        (
            tuple,
            list
        )
    ):

        for item in output:

            if torch.is_tensor(
                item
            ):

                return item

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

                try:

                    return extract_logits(
                        output[key]
                    )

                except Exception:

                    continue

        for value in output.values():

            try:

                return extract_logits(
                    value
                )

            except Exception:

                continue

    # --------------------------------------------------------
    # FAILED
    # --------------------------------------------------------

    raise TypeError(
        "❌ Could not extract Tensor logits "
        f"from model output type: "
        f"{type(output)}"
    )


# ============================================================
# NORMALIZE PROBABILITIES
# ============================================================

def normalize_probabilities(
    real_probability,
    fake_probability
):

    real_probability = float(
        real_probability
    )

    fake_probability = float(
        fake_probability
    )

    real_probability = max(
        0.0,
        real_probability
    )

    fake_probability = max(
        0.0,
        fake_probability
    )

    total = (
        real_probability
        +
        fake_probability
    )

    if total <= 0:

        real_probability = 0.5
        fake_probability = 0.5

    else:

        real_probability = (
            real_probability
            /
            total
        )

        fake_probability = (
            fake_probability
            /
            total
        )

    return (
        real_probability,
        fake_probability
    )


# ============================================================
# PREDICT FACE
# ============================================================

@torch.no_grad()
def predict_face(
    face_crop
):

    ensure_initialized()

    if face_crop is None:
        return None

    # --------------------------------------------------------
    # BGR → RGB
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
    # EXTRACT LOGITS
    # --------------------------------------------------------

    logits = extract_logits(
        model_output
    )

    if logits.ndim == 1:

        logits = logits.unsqueeze(
            0
        )

    if logits.ndim != 2:

        raise RuntimeError(
            "❌ Unexpected Xception output shape: "
            f"{tuple(logits.shape)}"
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
    # CHECK OUTPUT
    # --------------------------------------------------------

    if probabilities.shape[1] < 2:

        raise RuntimeError(
            "❌ Xception returned fewer "
            "than 2 classification outputs."
        )

    # --------------------------------------------------------
    # CLASS MAPPING
    #
    # DeepfakeBench Xception:
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
    # FORCE PROBABILITY SUM TO 100%
    # --------------------------------------------------------

    (
        real_probability,
        fake_probability
    ) = normalize_probabilities(
        real_probability,
        fake_probability
    )

    # --------------------------------------------------------
    # PREDICTION
    # --------------------------------------------------------

    if fake_probability >= real_probability:

        prediction = "FAKE"

        confidence = (
            fake_probability * 100.0
        )

    else:

        prediction = "REAL"

        confidence = (
            real_probability * 100.0
        )

    return {

        "prediction":
            prediction,

        "confidence":
            confidence,

        "real":
            real_probability * 100.0,

        "fake":
            fake_probability * 100.0,

        "real_probability":
            real_probability * 100.0,

        "fake_probability":
            fake_probability * 100.0,
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
# DETECT IMAGE
# ============================================================

def detect_image(
    image_path
):

    ensure_initialized()

    print()
    print("=" * 60)
    print(
        "CYBERSHIELD IMAGE DEEPFAKE DETECTION"
    )
    print("=" * 60)

    print(
        f"Image: {image_path}"
    )

    # --------------------------------------------------------
    # READ IMAGE
    # --------------------------------------------------------

    image = read_image(
        image_path
    )

    height, width = (
        image.shape[:2]
    )

    print(
        f"Image size: "
        f"{width} x {height}"
    )

    # --------------------------------------------------------
    # FACE DETECTION
    # --------------------------------------------------------

    faces = detect_faces(
        image
    )

    print(
        f"Faces detected: "
        f"{len(faces)}"
    )

    if len(faces) == 0:

        raise RuntimeError(
            "\n❌ No face detected in image.\n\n"
            "Try an image where:\n"
            "1. Face is clearly visible.\n"
            "2. Face is not too small.\n"
            "3. Face is not heavily covered.\n"
            "4. Lighting is reasonable.\n"
            "5. Image is not extremely blurry."
        )

    # --------------------------------------------------------
    # LARGEST FACE
    # --------------------------------------------------------

    largest_face = get_largest_face(
        faces
    )

    x, y, w, h = largest_face

    print(
        f"Largest face: "
        f"x={x}, y={y}, "
        f"w={w}, h={h}"
    )

    # --------------------------------------------------------
    # FACE CROP
    # --------------------------------------------------------

    face_crop = crop_face(
        image,
        largest_face
    )

    if face_crop is None:

        raise RuntimeError(
            "❌ Failed to crop detected face."
        )

    # --------------------------------------------------------
    # XCEPTION INFERENCE
    # --------------------------------------------------------

    print(
        "Running Xception inference..."
    )

    prediction = predict_face(
        face_crop
    )

    if prediction is None:

        raise RuntimeError(
            "❌ Image prediction failed."
        )

    # --------------------------------------------------------
    # RISK
    # --------------------------------------------------------

    risk_score, risk_level = (
        calculate_risk(
            prediction["fake"]
        )
    )

    # --------------------------------------------------------
    # FINAL RESULT
    # --------------------------------------------------------

    result = {

        "prediction":
            prediction["prediction"],

        "confidence":
            round(
                prediction["confidence"],
                2
            ),

        "real":
            round(
                prediction["real"],
                2
            ),

        "fake":
            round(
                prediction["fake"],
                2
            ),

        "real_probability":
            round(
                prediction[
                    "real_probability"
                ],
                2
            ),

        "fake_probability":
            round(
                prediction[
                    "fake_probability"
                ],
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

        "faces_detected":
            len(faces),

        "face_used":
            1,

        "model":
            "Xception + DeepfakeBench",

        "source":
            "image",

        "image":
            os.path.basename(
                image_path
            ),
    }

    print_result(
        result
    )

    return result


# ============================================================
# PRINT RESULT
# ============================================================

def print_result(
    result
):

    print()
    print("=" * 60)
    print(
        "CYBERSHIELD IMAGE ANALYSIS RESULT"
    )
    print("=" * 60)

    print()

    print(
        f"🖼️ Image: "
        f"{result['image']}"
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
        f"Faces Detected: "
        f"{result['faces_detected']}"
    )

    print()

    print("=" * 60)

    if result["prediction"] == "FAKE":

        print(
            "🚨 CYBERSHIELD: "
            "POTENTIAL IMAGE DEEPFAKE DETECTED"
        )

    else:

        print(
            "✅ CYBERSHIELD: "
            "IMAGE APPEARS REAL"
        )

    print("=" * 60)

    print()


# ============================================================
# PROGRAM ENTRY
# ============================================================

def main():

    import argparse

    parser = argparse.ArgumentParser(
        description=(
            "CyberShield "
            "Xception Image Deepfake Detector"
        )
    )

    parser.add_argument(
        "image",
        help=(
            "Path to image file"
        )
    )

    args = parser.parse_args()

    try:

        # ----------------------------------------------------
        # INITIALIZE
        # ----------------------------------------------------

        initialize()

        # ----------------------------------------------------
        # DETECT IMAGE
        # ----------------------------------------------------

        result = detect_image(
            args.image
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
            "❌ IMAGE DETECTION ERROR"
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