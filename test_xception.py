import os
import sys
import torch


# ============================================================
# PATH SETUP
# ============================================================

PROJECT_ROOT = os.path.abspath("DeepfakeBench")
TRAINING_DIR = os.path.join(PROJECT_ROOT, "training")

sys.path.insert(0, TRAINING_DIR)


print("=" * 60)
print("XCEPTION DEEPFAKE MODEL - FULL TEST")
print("=" * 60)


# ============================================================
# IMPORT XCEPTION
# ============================================================

print()
print("Loading Xception network...")

from networks.xception import Xception

print("Xception network imported successfully.")


# ============================================================
# MODEL CONFIGURATION
# ============================================================

print()
print("Creating Xception model...")


xception_config = {
    "num_classes": 2,
    "mode": "original",
    "inc": 3,
    "dropout": 0.0
}


model = Xception(xception_config)

print("Xception model created successfully.")


# ============================================================
# CHECKPOINT PATH
# ============================================================

checkpoint_path = os.path.join(
    PROJECT_ROOT,
    "training",
    "weights",
    "xception_best.pth"
)


print()
print("Checkpoint:")
print(checkpoint_path)


if not os.path.exists(checkpoint_path):

    raise FileNotFoundError(
        f"Checkpoint not found:\n{checkpoint_path}"
    )


print("Checkpoint exists.")


# ============================================================
# LOAD CHECKPOINT
# ============================================================

print()
print("Loading checkpoint...")

checkpoint = torch.load(
    checkpoint_path,
    map_location="cpu"
)

print("Checkpoint loaded successfully.")

print("Checkpoint type:", type(checkpoint))


# ============================================================
# CHECKPOINT INFORMATION
# ============================================================

if isinstance(checkpoint, dict):

    print()
    print("Number of checkpoint keys:")
    print(len(checkpoint))


# ============================================================
# REMOVE "backbone." PREFIX
# ============================================================

print()
print("Checking checkpoint keys...")


first_key = next(iter(checkpoint.keys()))

print("First checkpoint key:")
print(first_key)


if first_key.startswith("backbone."):

    print()
    print("Detected 'backbone.' prefix.")
    print("Removing prefix from checkpoint keys...")

    cleaned_checkpoint = {}

    for key, value in checkpoint.items():

        if key.startswith("backbone."):

            new_key = key[len("backbone."):]

        else:

            new_key = key

        cleaned_checkpoint[new_key] = value

else:

    print()
    print("No 'backbone.' prefix detected.")

    cleaned_checkpoint = checkpoint


# ============================================================
# SHOW NEW FIRST KEY
# ============================================================

print()
print("First cleaned key:")

cleaned_first_key = next(iter(cleaned_checkpoint.keys()))

print(cleaned_first_key)


# ============================================================
# LOAD WEIGHTS
# ============================================================

print()
print("Loading weights into Xception model...")


try:

    result = model.load_state_dict(
        cleaned_checkpoint,
        strict=True
    )

    print()
    print("SUCCESS!")
    print("All Xception weights loaded successfully.")

    print()
    print("Missing keys:")
    print(result.missing_keys)

    print()
    print("Unexpected keys:")
    print(result.unexpected_keys)

except RuntimeError as e:

    print()
    print("=" * 60)
    print("WEIGHT LOADING ERROR")
    print("=" * 60)

    print(e)

    sys.exit(1)


# ============================================================
# EVALUATION MODE
# ============================================================

model.eval()

print()
print("Xception model is now in evaluation mode.")


# ============================================================
# MODEL SUMMARY
# ============================================================

print()
print("=" * 60)
print("MODEL INFORMATION")
print("=" * 60)

total_parameters = sum(
    parameter.numel()
    for parameter in model.parameters()
)

trainable_parameters = sum(
    parameter.numel()
    for parameter in model.parameters()
    if parameter.requires_grad
)

print("Total parameters:", total_parameters)
print("Trainable parameters:", trainable_parameters)


# ============================================================
# FORWARD PASS TEST
# ============================================================

print()
print("=" * 60)
print("FORWARD PASS TEST")
print("=" * 60)


print()
print("Creating dummy image...")


# Xception expects:
# Batch size = 1
# Channels = 3
# Height = 299
# Width = 299

dummy_image = torch.randn(
    1,
    3,
    299,
    299
)


print("Dummy image shape:")
print(dummy_image.shape)


# ============================================================
# RUN MODEL
# ============================================================

print()
print("Running Xception inference...")


with torch.no_grad():

    output, features = model(dummy_image)


# ============================================================
# OUTPUT INFORMATION
# ============================================================

print()
print("Inference completed successfully!")


print()
print("Output shape:")
print(output.shape)


print()
print("Feature shape:")
print(features.shape)


# ============================================================
# SOFTMAX PROBABILITY
# ============================================================

probabilities = torch.softmax(
    output,
    dim=1
)


print()
print("Raw output:")
print(output)


print()
print("Probabilities:")
print(probabilities)


# ============================================================
# PREDICTION
# ============================================================

prediction = torch.argmax(
    probabilities,
    dim=1
).item()


confidence = probabilities[
    0,
    prediction
].item() * 100


print()
print("=" * 60)
print("PREDICTION")
print("=" * 60)


if prediction == 0:

    label = "REAL"

else:

    label = "FAKE"


print()
print("Predicted class:", prediction)
print("Prediction:", label)
print("Confidence: {:.2f}%".format(confidence))


# ============================================================
# FINISH
# ============================================================

print()
print("=" * 60)
print("XCEPTION MODEL TEST COMPLETE")
print("=" * 60)