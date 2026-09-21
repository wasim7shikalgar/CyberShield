import sys
import os
import cv2
import torch
import numpy as np

# ============================================================
# PATH SETUP
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEEPFAKEBENCH_DIR = os.path.join(BASE_DIR, "DeepfakeBench")

sys.path.insert(0, DEEPFAKEBENCH_DIR)

# ============================================================
# IMPORT XCEPTION
# ============================================================

print("=" * 60)
print("XCEPTION DEEPFAKE VIDEO TEST")
print("=" * 60)

print("\nLoading Xception network...")

try:
    from training.networks.xception import Xception
    print("Xception imported successfully.")
except Exception as e:
    print("\nERROR: Could not import Xception.")
    print(e)
    sys.exit(1)

# ============================================================
# DEVICE
# ============================================================

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

print("\nDevice:", device)

# ============================================================
# VIDEO PATH
# ============================================================

if len(sys.argv) < 2:
    print("\nERROR: Please provide video filename.")
    print("\nExample:")
    print("python test_xception_video.py video.mp4")
    sys.exit(1)

VIDEO_PATH = sys.argv[1]

# Convert relative path to absolute path
if not os.path.isabs(VIDEO_PATH):
    VIDEO_PATH = os.path.abspath(VIDEO_PATH)

# ============================================================
# CHECKPOINT
# ============================================================

CHECKPOINT_PATH = os.path.join(
    BASE_DIR,
    "DeepfakeBench",
    "training",
    "weights",
    "xception_best.pth"
)

print("\nVideo:")
print(VIDEO_PATH)

print("\nCheckpoint:")
print(CHECKPOINT_PATH)

if not os.path.exists(VIDEO_PATH):
    print("\nERROR: Video file not found!")
    sys.exit(1)

if not os.path.exists(CHECKPOINT_PATH):
    print("\nERROR: Xception checkpoint not found!")
    sys.exit(1)

# ============================================================
# CREATE XCEPTION MODEL
# ============================================================

print("\nLoading Xception network...")
print("Creating Xception model...")

xception_config = {
    "num_classes": 2,
    "mode": "normal",
    "inc": 3,
    "dropout": 0
}

try:
    model = Xception(xception_config)
    print("Xception model created successfully.")
except Exception as e:
    print("\nERROR while creating Xception model:")
    print(e)
    sys.exit(1)

# ============================================================
# LOAD CHECKPOINT
# ============================================================

print("\nLoading checkpoint...")

try:
    checkpoint = torch.load(
        CHECKPOINT_PATH,
        map_location=device
    )

    print("Checkpoint loaded.")
    print("Checkpoint type:", type(checkpoint))

except Exception as e:
    print("\nERROR while loading checkpoint:")
    print(e)
    sys.exit(1)

# ============================================================
# PROCESS CHECKPOINT
# ============================================================

if isinstance(checkpoint, dict):

    if "state_dict" in checkpoint:
        state_dict = checkpoint["state_dict"]

    elif "model" in checkpoint:
        state_dict = checkpoint["model"]

    elif "model_state_dict" in checkpoint:
        state_dict = checkpoint["model_state_dict"]

    else:
        state_dict = checkpoint

else:
    state_dict = checkpoint


print("\nFirst checkpoint key:")

try:
    first_key = next(iter(state_dict.keys()))
    print(first_key)
except:
    print("Could not read checkpoint keys.")

# ============================================================
# REMOVE BACKBONE PREFIX
# ============================================================

keys = list(state_dict.keys())

if len(keys) > 0 and keys[0].startswith("backbone."):

    print("\nDetected 'backbone.' prefix.")
    print("Removing prefix...")

    new_state_dict = {}

    for key, value in state_dict.items():
        if key.startswith("backbone."):
            new_key = key[len("backbone."):]
        else:
            new_key = key

        new_state_dict[new_key] = value

    state_dict = new_state_dict

    print("Prefix removed.")

# ============================================================
# LOAD WEIGHTS
# ============================================================

print("\nLoading Xception weights...")

try:

    result = model.load_state_dict(
        state_dict,
        strict=False
    )

    print("\nSUCCESS!")
    print("Xception weights loaded.")

    print("\nMissing keys:")
    print(result.missing_keys)

    print("\nUnexpected keys:")
    print(result.unexpected_keys)

except Exception as e:

    print("\nERROR while loading Xception weights:")
    print(e)
    sys.exit(1)

# ============================================================
# MOVE MODEL TO DEVICE
# ============================================================

model = model.to(device)
model.eval()

print("\nXception model is ready.")

total_parameters = sum(
    p.numel() for p in model.parameters()
)

print("\nTotal parameters:", total_parameters)

# ============================================================
# FACE DETECTOR
# ============================================================

print("\nLoading OpenCV face detector...")

cascade_path = cv2.data.haarcascades + \
    "haarcascade_frontalface_default.xml"

print("Cascade:")
print(cascade_path)

face_detector = cv2.CascadeClassifier(cascade_path)

if face_detector.empty():

    print("\nERROR: Face detector could not be loaded.")
    sys.exit(1)

print("Face detector loaded successfully.")

# ============================================================
# OPEN VIDEO
# ============================================================

print("\n")
print("=" * 60)
print("OPENING VIDEO")
print("=" * 60)

cap = cv2.VideoCapture(VIDEO_PATH)

if not cap.isOpened():

    print("\nERROR: Could not open video.")
    sys.exit(1)

total_frames = int(
    cap.get(cv2.CAP_PROP_FRAME_COUNT)
)

fps = cap.get(
    cv2.CAP_PROP_FPS
)

if fps <= 0:
    fps = 25

duration = total_frames / fps

print("\nTotal frames:", total_frames)
print("FPS:", fps)
print("Duration:", round(duration, 2), "seconds")

# ============================================================
# SELECT 32 FRAMES
# ============================================================

NUM_FRAMES = 32

if total_frames < NUM_FRAMES:
    frame_indices = np.arange(total_frames)
else:
    frame_indices = np.linspace(
        0,
        total_frames - 1,
        NUM_FRAMES
    ).astype(int)

print("\n")
print("=" * 60)
print("PROCESSING VIDEO")
print("=" * 60)

# ============================================================
# IMAGE PREPROCESSING
# ============================================================

def preprocess_face(face):

    # BGR -> RGB
    face = cv2.cvtColor(
        face,
        cv2.COLOR_BGR2RGB
    )

    # Resize
    face = cv2.resize(
        face,
        (299, 299),
        interpolation=cv2.INTER_LINEAR
    )

    # Convert to float
    face = face.astype(
        np.float32
    ) / 255.0

    # ImageNet normalization
    mean = np.array(
        [0.485, 0.456, 0.406],
        dtype=np.float32
    )

    std = np.array(
        [0.229, 0.224, 0.225],
        dtype=np.float32
    )

    face = (
        face - mean
    ) / std

    # HWC -> CHW
    face = np.transpose(
        face,
        (2, 0, 1)
    )

    # Tensor
    tensor = torch.from_numpy(
        face
    ).float()

    # Batch dimension
    tensor = tensor.unsqueeze(0)

    return tensor


# ============================================================
# PREDICTION FUNCTION
# ============================================================

def predict_face(face):

    tensor = preprocess_face(face)

    tensor = tensor.to(device)

    with torch.no_grad():

        output = model(tensor)

        # Handle tuple/list output
        if isinstance(output, (tuple, list)):
            output = output[0]

        # Handle dictionary output
        elif isinstance(output, dict):

            if "logits" in output:
                output = output["logits"]

            elif "output" in output:
                output = output["output"]

            else:
                output = next(
                    iter(output.values())
                )

        probabilities = torch.softmax(
            output,
            dim=1
        )

        probabilities = (
            probabilities[0]
            .cpu()
            .numpy()
        )

    return probabilities


# ============================================================
# PROCESS FRAMES
# ============================================================

real_probabilities = []
fake_probabilities = []

real_frames = 0
fake_frames = 0

frames_processed = 0
faces_detected = 0
faces_not_detected = 0

for frame_number in frame_indices:

    cap.set(
        cv2.CAP_PROP_POS_FRAMES,
        int(frame_number)
    )

    ret, frame = cap.read()

    if not ret:
        continue

    # --------------------------------------------------------
    # FACE DETECTION
    # --------------------------------------------------------

    gray = cv2.cvtColor(
        frame,
        cv2.COLOR_BGR2GRAY
    )

    faces = face_detector.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(40, 40)
    )

    if len(faces) == 0:

        faces_not_detected += 1

        print(
            f"Frame {frame_number} | "
            "FACE NOT DETECTED"
        )

        continue

    # --------------------------------------------------------
    # SELECT LARGEST FACE
    # --------------------------------------------------------

    largest_face = max(
        faces,
        key=lambda rect: rect[2] * rect[3]
    )

    x, y, w, h = largest_face

    # --------------------------------------------------------
    # EXPAND FACE BOX
    # --------------------------------------------------------

    expansion = 0.25

    cx = x + w // 2
    cy = y + h // 2

    new_w = int(
        w * (1 + expansion)
    )

    new_h = int(
        h * (1 + expansion)
    )

    x1 = max(
        0,
        cx - new_w // 2
    )

    y1 = max(
        0,
        cy - new_h // 2
    )

    x2 = min(
        frame.shape[1],
        cx + new_w // 2
    )

    y2 = min(
        frame.shape[0],
        cy + new_h // 2
    )

    face_crop = frame[
        y1:y2,
        x1:x2
    ]

    if face_crop.size == 0:
        continue

    # --------------------------------------------------------
    # PREDICT
    # --------------------------------------------------------

    try:

        probs = predict_face(
            face_crop
        )

        # Class 0 = REAL
        # Class 1 = FAKE

        real_prob = float(
            probs[0]
        )

        fake_prob = float(
            probs[1]
        )

    except Exception as e:

        print(
            f"\nPrediction error at frame "
            f"{frame_number}: {e}"
        )

        continue

    # --------------------------------------------------------
    # STORE
    # --------------------------------------------------------

    real_probabilities.append(
        real_prob
    )

    fake_probabilities.append(
        fake_prob
    )

    frames_processed += 1
    faces_detected += 1

    if fake_prob > real_prob:
        prediction = "FAKE"
        fake_frames += 1
    else:
        prediction = "REAL"
        real_frames += 1

    print(
        f"Frame {frame_number} | "
        f"REAL: {real_prob * 100:.2f}% | "
        f"FAKE: {fake_prob * 100:.2f}% | "
        f"{prediction}"
    )

# ============================================================
# RELEASE VIDEO
# ============================================================

cap.release()

# ============================================================
# VIDEO PROCESSING COMPLETE
# ============================================================

print("\n")
print("=" * 60)
print("VIDEO PROCESSING COMPLETE")
print("=" * 60)

print("\nFrames selected:", len(frame_indices))
print("Frames processed:", frames_processed)
print("Faces detected:", faces_detected)
print("Faces not detected:", faces_not_detected)

# ============================================================
# FINAL RESULT
# ============================================================

print("\n")
print("=" * 60)
print("FINAL VIDEO RESULT")
print("=" * 60)

if frames_processed == 0:

    print("\nERROR: No faces were successfully processed.")
    sys.exit(1)

average_real = np.mean(
    real_probabilities
)

average_fake = np.mean(
    fake_probabilities
)

# ------------------------------------------------------------
# FINAL PREDICTION
# ------------------------------------------------------------

if average_fake > average_real:

    final_prediction = "FAKE"
    confidence = average_fake

else:

    final_prediction = "REAL"
    confidence = average_real

print(
    f"\nFrames processed: {frames_processed}"
)

print(
    f"Average REAL probability: "
    f"{average_real * 100:.2f}%"
)

print(
    f"Average FAKE probability: "
    f"{average_fake * 100:.2f}%"
)

print(
    f"\nFINAL PREDICTION: "
    f"{final_prediction}"
)

print(
    f"CONFIDENCE: "
    f"{confidence * 100:.2f}%"
)

# ============================================================
# FRAME SUMMARY
# ============================================================

print("\n")
print("=" * 60)
print("FRAME PREDICTION SUMMARY")
print("=" * 60)

print(
    f"\nREAL frames: {real_frames}"
)

print(
    f"FAKE frames: {fake_frames}"
)

# ============================================================
# INTERPRETATION
# ============================================================

print("\n")
print("=" * 60)
print("INTERPRETATION")
print("=" * 60)

if confidence >= 0.80:

    print("\nStrong prediction.")

elif confidence >= 0.65:

    print("\nModerate prediction.")

else:

    print("\nVery uncertain prediction.")

print(
    "\nNote: A confidence near 50% "
    "means the model is uncertain."
)

print("\n")
print("=" * 60)
print("XCEPTION VIDEO TEST COMPLETE")
print("=" * 60)