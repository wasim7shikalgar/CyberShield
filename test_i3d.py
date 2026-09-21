import os
import sys
import torch


# ============================================================
# PATHS
# ============================================================

PROJECT_ROOT = os.path.abspath("DeepfakeBench")
TRAINING_DIR = os.path.join(PROJECT_ROOT, "training")

SLOWFAST_PARENT = os.path.join(
    TRAINING_DIR,
    "detectors",
    "utils"
)

sys.path.insert(0, TRAINING_DIR)
sys.path.insert(0, SLOWFAST_PARENT)


# ============================================================
# IMPORT SLOWFAST
# ============================================================

print("=" * 60)
print("I3D DIRECT LOADING TEST")
print("=" * 60)

print()
print("Loading SlowFast package...")


from slowfast.config.defaults import get_cfg

from slowfast.models.video_model_builder import ResNet


print("SlowFast package loaded successfully.")


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
  TEST_CROP_SIZE: 256
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
# CREATE CONFIG
# ============================================================

print()
print("Creating configuration...")

cfg = get_cfg()

cfg.merge_from_str(config_text)

cfg.NUM_GPUS = 1
cfg.TEST.BATCH_SIZE = 1
cfg.TRAIN.BATCH_SIZE = 1
cfg.DATA.NUM_FRAMES = 16


print("Configuration ready.")


# ============================================================
# CREATE I3D MODEL
# ============================================================

print()
print("Creating I3D ResNet-50...")

model = ResNet(cfg)

print("I3D architecture created successfully.")


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
print("Loading pretrained weights:")
print(weights_path)


checkpoint = torch.load(
    weights_path,
    map_location="cpu"
)


print("Checkpoint loaded.")


# ============================================================
# PROCESS CHECKPOINT
# ============================================================

if isinstance(checkpoint, dict):

    print(
        "Checkpoint entries:",
        len(checkpoint)
    )

else:

    raise RuntimeError(
        "Unexpected checkpoint format."
    )


modified_weights = {}

for key, value in checkpoint.items():

    new_key = key.replace(
        "resnet.",
        ""
    )

    modified_weights[new_key] = value


# ============================================================
# CLASSIFIER
# ============================================================

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


# ============================================================
# LOAD STATE DICT
# ============================================================

print()
print("Loading weights into model...")

result = model.load_state_dict(
    modified_weights,
    strict=False
)

missing = result.missing_keys
unexpected = result.unexpected_keys


# ============================================================
# RESULT
# ============================================================

print()
print("=" * 60)
print("WEIGHT LOADING RESULT")
print("=" * 60)

print("Missing keys:", len(missing))
print("Unexpected keys:", len(unexpected))


if len(missing) == 0 and len(unexpected) == 0:

    print()
    print("✅ I3D PRETRAINED MODEL LOADED SUCCESSFULLY")

else:

    print()
    print("⚠️ WEIGHT DIFFERENCES FOUND")

    if missing:

        print()
        print("Missing keys:")

        for key in missing[:10]:

            print(" -", key)

    if unexpected:

        print()
        print("Unexpected keys:")

        for key in unexpected[:10]:

            print(" -", key)


# ============================================================
# CPU
# ============================================================

model = model.cpu()

model.eval()


print()
print("=" * 60)
print("MODEL STATUS")
print("=" * 60)

print("Model  : I3D ResNet-50")
print("Weight : I3D_8x8_R50.pth")
print("Device : CPU")
print("Mode   : Evaluation")
print("Status : READY")

print("=" * 60)