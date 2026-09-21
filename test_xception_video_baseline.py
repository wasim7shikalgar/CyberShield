
import os
import sys
import cv2
import torch
import numpy as np
from PIL import Image

# ============================================================
# PATH SETUP
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DEEPFAKEBENCH_DIR = os.path.join(BASE_DIR, "DeepfakeBench")
TRAINING_DIR = os.path.join(DEEPFAKEBENCH_DIR, "training")

if TRAINING_DIR not in sys.path:
    sys.path.insert(0, TRAINING_DIR)

# ============================================================
# IMPORT XCEPTION
# ============================================================

print("=" * 60)
print("XCEPTION DEEPFAKE VIDEO TEST - FACE DETECTION")
print("=" * 60)

print("\nLoading Xception network...")

try:
    from networks.xception import Xception
    print("Xception imported successfully.")
except Exception as e:
    print("ERROR: Could not import Xception.")
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

VIDEO_PATH = "deepfake.mp4"
# ============================================================
# CHECKPOINT PATH
# ============================================================

CHECKPOINT_PATH = os.path.join(
    TRAINING_DIR,
    "weights",
    "xception_best.pth"
)

print("\nVideo:")
print(VIDEO_PATH)

print("\nCheckpoint:")
print(CHECKPOINT_PATH)

# ============================================================
# CHECK FILES
# ============================================================

if not os.path.exists(VIDEO_PATH):
    print("\nERROR: video.mp4 not found!")
    print("Expected location:")
    print(VIDEO_PATH)
    sys.exit(1)

if not os.path.exists(CHECKPOINT_PATH):
    print("\nERROR: Xception checkpoint not found!")
    print("Expected location:")
    print(CHECKPOINT_PATH)
    sys.exit(1)

# ============================================================
# CREATE XCEPTION MODEL
# ============================================================

print("\nLoading Xception network...")
print("Creating Xception model...")

# IMPORTANT:
# These values come directly from:
# DeepfakeBench/training/config/detector/xception.yaml

model_config = {
    "mode": "original",
    "num_classes": 2,
    "inc": 3,
    "dropout": False
}

model = Xception(model_config)

print("Xception model created successfully.")

# ============================================================
# LOAD CHECKPOINT
# ============================================================

print("\nLoading checkpoint...")

checkpoint = torch.load(
    CHECKPOINT_PATH,
    map_location=device
)

print("Checkpoint loaded.")
print("Checkpoint type:", type(checkpoint))

# ============================================================
# HANDLE CHECKPOINT
# ============================================================

if isinstance(checkpoint, dict):
    state_dict = checkpoint

    # Some DeepfakeBench checkpoints contain:
    # backbone.conv1.weight
    #
    # Our Xception model expects:
    # conv1.weight

    if len(state_dict) > 0:

        first_key = next(iter(state_dict.keys()))

        print("\nFirst checkpoint key:")
        print(first_key)

        if first_key.startswith("backbone."):

            print("\nDetected 'backbone.' prefix.")
            print("Removing prefix...")

            state_dict = {
                key.replace("backbone.", "", 1): value
                for key, value in state_dict.items()
            }

            print("Prefix removed.")

else:
    print("\nERROR: Unsupported checkpoint format.")
    sys.exit(1)

# ============================================================
# REMOVE POSSIBLE FC KEYS
# ============================================================

clean_state_dict = {}

for key, value in state_dict.items():

    # Keep all normal Xception weights.
    # Ignore possible external classifier keys.
    if key.startswith("fc."):
        continue

    clean_state_dict[key] = value

state_dict = clean_state_dict

# ============================================================
# LOAD WEIGHTS
# ============================================================

print("\nLoading Xception weights...")

try:

    missing_keys, unexpected_keys = model.load_state_dict(
        state_dict,
        strict=False
    )

    print("\nSUCCESS!")
    print("Xception weights loaded.")

    print("\nMissing keys:")
    print(missing_keys)

    print("\nUnexpected keys:")
    print(unexpected_keys)

except Exception as e:

    print("\nERROR while loading Xception weights:")
    print(e)
    sys.exit(1)

# ============================================================
# MODEL INFO
# ============================================================

model = model.to(device)
model.eval()

print("\nXception model is ready.")

total_params = sum(
    p.numel()
    for p in model.parameters()
)

print("\nTotal parameters:", total_params)

# ============================================================
# LOAD FACE DETECTOR
# ============================================================

print("\nLoading OpenCV face detector...")

cascade_path = os.path.join(
    cv2.data.haarcascades,
    "haarcascade_frontalface_default.xml"
)

print("Cascade:")
print(cascade_path)

if not os.path.exists(cascade_path):

    print("\nERROR: Haar cascade file not found.")
    print(cascade_path)

    sys.exit(1)

face_detector = cv2.CascadeClassifier(cascade_path)

if face_detector.empty():

    print("\nERROR: Face detector could not be loaded.")
    sys.exit(1)

print("Face detector loaded successfully.")

# ============================================================
# VIDEO
# ============================================================

print("\n" + "=" * 60)
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
    fps = 25.0

duration = total_frames / fps

print("\nTotal frames:", total_frames)
print("FPS:", fps)
print("Duration: %.2f seconds" % duration)

# ============================================================
# FRAME SAMPLING
# ============================================================

# DeepfakeBench xception.yaml:
#
# frame_num:
#   test: 32
#
# So we sample up to 32 frames.

NUM_FRAMES = 32

if total_frames <= NUM_FRAMES:

    frame_indices = list(range(total_frames))

else:

    frame_indices = np.linspace(
        0,
        total_frames - 1,
        NUM_FRAMES,
        dtype=int
    )

# ============================================================
# NORMALIZATION
# ============================================================

MEAN = np.array(
    [0.5, 0.5, 0.5],
    dtype=np.float32
)

STD = np.array(
    [0.5, 0.5, 0.5],
    dtype=np.float32
)

# ============================================================
# PROCESS VIDEO
# ============================================================

print("\n" + "=" * 60)
print("PROCESSING VIDEO")
print("=" * 60)

real_probabilities = []
fake_probabilities = []

processed_frames = 0
faces_detected = 0
faces_not_detected = 0

frame_results = []

# ============================================================
# LOOP THROUGH SELECTED FRAMES
# ============================================================

for frame_number in frame_indices:

    # Jump to frame
    cap.set(
        cv2.CAP_PROP_POS_FRAMES,
        int(frame_number)
    )

    ret, frame = cap.read()

    if not ret:
        continue

    # --------------------------------------------------------
    # Convert to grayscale for Haar detection
    # --------------------------------------------------------

    gray = cv2.cvtColor(
        frame,
        cv2.COLOR_BGR2GRAY
    )

    # --------------------------------------------------------
    # Detect faces
    # --------------------------------------------------------

    faces = face_detector.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(50, 50)
    )

    if len(faces) == 0:

        faces_not_detected += 1

        continue

    faces_detected += 1

    # --------------------------------------------------------
    # Select biggest face
    # --------------------------------------------------------

    biggest_face = max(
        faces,
        key=lambda rect: rect[2] * rect[3]
    )

    x, y, w, h = biggest_face

    # --------------------------------------------------------
    # Expand face bounding box
    # --------------------------------------------------------

    scale = 1.3

    center_x = x + w / 2
    center_y = y + h / 2

    new_size = int(
        max(w, h) * scale
    )

    new_x = int(
        center_x - new_size / 2
    )

    new_y = int(
        center_y - new_size / 2
    )

    # --------------------------------------------------------
    # Keep bounding box inside image
    # --------------------------------------------------------

    height, width = frame.shape[:2]

    new_x = max(
        0,
        new_x
    )

    new_y = max(
        0,
        new_y
    )

    new_size = min(
        new_size,
        width - new_x
    )

    new_size = min(
        new_size,
        height - new_y
    )

    if new_size <= 10:
        continue

    # --------------------------------------------------------
    # Crop face
    # --------------------------------------------------------

    face = frame[
        new_y:new_y + new_size,
        new_x:new_x + new_size
    ]

    if face.size == 0:
        continue

    # --------------------------------------------------------
    # BGR -> RGB
    # --------------------------------------------------------

    face_rgb = cv2.cvtColor(
        face,
        cv2.COLOR_BGR2RGB
    )

    # --------------------------------------------------------
    # Resize to DeepfakeBench resolution
    # --------------------------------------------------------

    face_rgb = cv2.resize(
        face_rgb,
        (256, 256),
        interpolation=cv2.INTER_CUBIC
    )

    # --------------------------------------------------------
    # Convert to float
    # --------------------------------------------------------

    face_rgb = face_rgb.astype(
        np.float32
    ) / 255.0

    # --------------------------------------------------------
    # DeepfakeBench normalization
    #
    # (image - mean) / std
    # --------------------------------------------------------

    face_rgb = (
        face_rgb - MEAN
    ) / STD

    # --------------------------------------------------------
    # HWC -> CHW
    # --------------------------------------------------------

    face_tensor = torch.from_numpy(
        face_rgb
    ).permute(
        2,
        0,
        1
    ).float()

    # --------------------------------------------------------
    # Add batch dimension
    # --------------------------------------------------------

    face_tensor = face_tensor.unsqueeze(0)

    face_tensor = face_tensor.to(device)

    # --------------------------------------------------------
    # XCEPTION INFERENCE
    # --------------------------------------------------------

    with torch.no_grad():

        output = model(
            face_tensor
        )

        # Xception network returns:
        #
        # (output, features)

        if isinstance(output, tuple):

            logits = output[0]

        else:

            logits = output

    # --------------------------------------------------------
    # Softmax
    # --------------------------------------------------------

    probabilities = torch.softmax(
        logits,
        dim=1
    )

    real_probability = (
        probabilities[0, 0]
        .item()
    )

    fake_probability = (
        probabilities[0, 1]
        .item()
    )

    # --------------------------------------------------------
    # Save probabilities
    # --------------------------------------------------------

    real_probabilities.append(
        real_probability
    )

    fake_probabilities.append(
        fake_probability
    )

    # --------------------------------------------------------
    # Save frame result
    # --------------------------------------------------------

    frame_prediction = (
        "FAKE"
        if fake_probability > real_probability
        else "REAL"
    )

    frame_results.append(
        {
            "frame": int(frame_number),
            "real": real_probability,
            "fake": fake_probability,
            "prediction": frame_prediction
        }
    )

    processed_frames += 1

    # --------------------------------------------------------
    # Progress
    # --------------------------------------------------------

    print(
        "Frame %d | REAL: %.2f%% | FAKE: %.2f%% | %s"
        % (
            frame_number,
            real_probability * 100,
            fake_probability * 100,
            frame_prediction
        )
    )

# ============================================================
# CLOSE VIDEO
# ============================================================

cap.release()

# ============================================================
# CHECK RESULTS
# ============================================================

print("\n" + "=" * 60)
print("VIDEO PROCESSING COMPLETE")
print("=" * 60)

print("\nFrames selected:", len(frame_indices))
print("Frames processed:", processed_frames)
print("Faces detected:", faces_detected)
print("Faces not detected:", faces_not_detected)

if processed_frames == 0:

    print("\nERROR: No face was detected in any processed frame.")

    print("\nPossible reasons:")
    print("1. Face is too small.")
    print("2. Face is turned away.")
    print("3. Video quality is low.")
    print("4. Haar detector failed.")
    print("5. Video does not contain a clearly visible face.")

    sys.exit(1)

# ============================================================
# VIDEO LEVEL AVERAGE
# ============================================================

average_real = np.mean(
    real_probabilities
)

average_fake = np.mean(
    fake_probabilities
)

# ============================================================
# FINAL PREDICTION
# ============================================================

if average_fake > average_real:

    final_prediction = "FAKE"
    confidence = average_fake

else:

    final_prediction = "REAL"
    confidence = average_real

# ============================================================
# FINAL RESULT
# ============================================================

print("\n" + "=" * 60)
print("FINAL VIDEO RESULT")
print("=" * 60)

print(
    "\nFrames processed:",
    processed_frames
)

print(
    "Average REAL probability: %.2f%%"
    % (average_real * 100)
)

print(
    "Average FAKE probability: %.2f%%"
    % (average_fake * 100)
)

print(
    "\nFINAL PREDICTION:",
    final_prediction
)

print(
    "CONFIDENCE: %.2f%%"
    % (confidence * 100)
)

# ============================================================
# FRAME SUMMARY
# ============================================================

real_count = sum(
    1
    for result in frame_results
    if result["prediction"] == "REAL"
)

fake_count = sum(
    1
    for result in frame_results
    if result["prediction"] == "FAKE"
)

print("\n" + "=" * 60)
print("FRAME PREDICTION SUMMARY")
print("=" * 60)

print("\nREAL frames:", real_count)
print("FAKE frames:", fake_count)

# ============================================================
# CONFIDENCE INTERPRETATION
# ============================================================

print("\n" + "=" * 60)
print("INTERPRETATION")
print("=" * 60)

if confidence >= 0.80:

    print(
        "\nStrong prediction."
    )

elif confidence >= 0.65:

    print(
        "\nModerate prediction."
    )

elif confidence >= 0.55:

    print(
        "\nWeak prediction."
    )

else:

    print(
        "\nVery uncertain prediction."
    )

print(
    "\nNote: A confidence near 50%% means the model is uncertain."
)

# ============================================================
# COMPLETE
# ============================================================

print("\n" + "=" * 60)
print("XCEPTION VIDEO TEST COMPLETE")
print("=" * 60)

