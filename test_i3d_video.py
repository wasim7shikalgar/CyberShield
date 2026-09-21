import os
import sys
import cv2
import torch
import numpy as np

# ============================================================
# PATHS
# ============================================================

PROJECT_ROOT = os.path.abspath("DeepfakeBench")

TRAINING_DIR = os.path.join(
    PROJECT_ROOT,
    "training"
)

SLOWFAST_PARENT = os.path.join(
    TRAINING_DIR,
    "detectors",
    "utils"
)

sys.path.insert(0, TRAINING_DIR)
sys.path.insert(0, SLOWFAST_PARENT)


# ============================================================
# IMPORT I3D
# ============================================================

print("=" * 60)
print("I3D VIDEO INFERENCE TEST")
print("=" * 60)

from slowfast.config.defaults import get_cfg
from slowfast.models.video_model_builder import ResNet

print("SlowFast loaded.")


# ============================================================
# CONFIG
# ============================================================

config_text = """
TRAIN:
  ENABLE: True
  DATASET: kinetics
  BATCH_SIZE: 1
  EVAL_PERIOD: 10
  CHECKPOINT_PERIOD: 1
  AUTO_RESUME: True

DATA:
  NUM_FRAMES: 16
  SAMPLING_RATE: 8
  TRAIN_JITTER_SCALES: [256, 320]
  TRAIN_CROP_SIZE: 224
  TEST_CROP_SIZE: 224
  INPUT_CHANNEL_NUM: [3]

RESNET:
  ZERO_INIT_FINAL_BN: True
  WIDTH_PER_GROUP: 64
  NUM_GROUPS: 1
  DEPTH: 50
  TRANS_FUNC: bottleneck_transform
  STRIDE_1X1: False
  NUM_BLOCK_TEMP_KERNEL: [[3], [4], [6], [3]]

NONLOCAL:
  LOCATION: [[[]], [[]], [[]], [[]]]
  GROUP: [[1], [1], [1], [1]]
  INSTANTIATION: softmax

BN:
  USE_PRECISE_STATS: True
  NUM_BATCHES_PRECISE: 200

MODEL:
  NUM_CLASSES: 1
  ARCH: i3d
  MODEL_NAME: ResNet
  LOSS_FUNC: cross_entropy
  DROPOUT_RATE: 0.5
  HEAD_ACT: sigmoid

TEST:
  ENABLE: True
  DATASET: kinetics
  BATCH_SIZE: 1

DATA_LOADER:
  NUM_WORKERS: 0
  PIN_MEMORY: False

NUM_GPUS: 1
NUM_SHARDS: 1
RNG_SEED: 0
OUTPUT_DIR: .
"""


# ============================================================
# BUILD CONFIG
# ============================================================

cfg = get_cfg()

cfg.merge_from_str(config_text)

cfg.NUM_GPUS = 1
cfg.TEST.BATCH_SIZE = 1
cfg.TRAIN.BATCH_SIZE = 1
cfg.DATA.NUM_FRAMES = 16


# ============================================================
# CREATE MODEL
# ============================================================

print()
print("Creating I3D model...")

model = ResNet(cfg)

print("I3D model created.")


# ============================================================
# LOAD WEIGHTS
# ============================================================

weights_path = os.path.join(
    "models",
    "deepfake",
    "weights",
    "I3D_8x8_R50.pth"
)

print()
print("Loading weights...")

checkpoint = torch.load(
    weights_path,
    map_location="cpu"
)

modified_weights = {}

for key, value in checkpoint.items():

    new_key = key.replace(
        "resnet.",
        ""
    )

    modified_weights[new_key] = value


# Classifier adjustment
if "head.projection.weight" in modified_weights:

    modified_weights[
        "head.projection.weight"
    ] = modified_weights[
        "head.projection.weight"
    ][:1, :]


if "head.projection.bias" in modified_weights:

    modified_weights[
        "head.projection.bias"
    ] = modified_weights[
        "head.projection.bias"
    ][:1]


result = model.load_state_dict(
    modified_weights,
    strict=False
)


print(
    "Missing keys:",
    len(result.missing_keys)
)

print(
    "Unexpected keys:",
    len(result.unexpected_keys)
)


model = model.cpu()
model.eval()

print("Model ready.")


# ============================================================
# VIDEO
# ============================================================

VIDEO_PATH = "video.mp4"

cap = cv2.VideoCapture(VIDEO_PATH)

if not cap.isOpened():

    raise RuntimeError(
        "Cannot open video.mp4"
    )


total_frames = int(
    cap.get(cv2.CAP_PROP_FRAME_COUNT)
)

fps = cap.get(
    cv2.CAP_PROP_FPS
)

print()
print("=" * 60)
print("VIDEO INFORMATION")
print("=" * 60)

print("Frames :", total_frames)
print("FPS    :", fps)


# ============================================================
# READ 16 FRAMES
# ============================================================

frames = []

while len(frames) < 16:

    success, frame = cap.read()

    if not success:
        break

    frame = cv2.cvtColor(
        frame,
        cv2.COLOR_BGR2RGB
    )

    frame = cv2.resize(
        frame,
        (224, 224)
    )

    frames.append(frame)


cap.release()


if len(frames) < 16:

    raise RuntimeError(
        f"Only {len(frames)} frames available. "
        "Need 16 frames."
    )


print()
print("16-frame clip created.")


# ============================================================
# NUMPY → TORCH
# ============================================================

video_array = np.stack(
    frames,
    axis=0
)


# Shape:
# [T, H, W, C]

print(
    "Original tensor shape:",
    video_array.shape
)


video_tensor = torch.from_numpy(
    video_array
).float()


# Normalize
video_tensor = video_tensor / 255.0


# ImageNet-style normalization
mean = torch.tensor(
    [0.45, 0.45, 0.45]
).view(1, 1, 1, 3)

std = torch.tensor(
    [0.225, 0.225, 0.225]
).view(1, 1, 1, 3)


video_tensor = (
    video_tensor - mean
) / std


# ============================================================
# FORMAT FOR I3D
# ============================================================

# Current:
# [T, H, W, C]

# Convert:
# [C, T, H, W]

video_tensor = video_tensor.permute(
    3,
    0,
    1,
    2
)


# Add batch:
# [B, C, T, H, W]

video_tensor = video_tensor.unsqueeze(0)


print(
    "I3D input shape:",
    tuple(video_tensor.shape)
)


# ============================================================
# INFERENCE
# ============================================================

print()
print("Running I3D inference...")

with torch.no_grad():

    output = model(
        [video_tensor]
    )


# ============================================================
# OUTPUT
# ============================================================

print()
print("=" * 60)
print("I3D OUTPUT")
print("=" * 60)

print("Raw output:", output)

if torch.is_tensor(output):

    print(
        "Output shape:",
        tuple(output.shape)
    )

    print(
        "Output value:",
        output.detach().cpu().numpy()
    )

print()
print("=" * 60)
print("INFERENCE COMPLETE")
print("=" * 60)

print()
print("⚠️ IMPORTANT:")
print("This checkpoint is not being treated as a")
print("validated REAL/FAKE probability yet.")
print("It is being used to verify the I3D inference pipeline.")