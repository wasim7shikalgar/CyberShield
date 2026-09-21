import os
import sys
import numpy as np
import librosa


# ============================================================
# AUDIO DEEPFAKE DETECTOR - FEATURE ANALYSIS
# ============================================================

AUDIO_PATH = "deepfake_audio.wav"

print("=" * 60)
print("AUDIO DEEPFAKE DETECTION")
print("=" * 60)

print(f"\nAudio: {AUDIO_PATH}")


# ------------------------------------------------------------
# CHECK FILE
# ------------------------------------------------------------

if not os.path.exists(AUDIO_PATH):
    print("\nERROR: Audio file not found!")
    print(f"Expected: {os.path.abspath(AUDIO_PATH)}")
    sys.exit(1)


# ------------------------------------------------------------
# LOAD AUDIO
# ------------------------------------------------------------

try:

    print("\nLoading audio...")

    y, sr = librosa.load(
        AUDIO_PATH,
        sr=16000,
        mono=True
    )

    print("Audio loaded successfully.")

    duration = len(y) / sr

    print(f"Sample rate: {sr} Hz")
    print(f"Duration: {duration:.2f} seconds")
    print(f"Samples: {len(y)}")


except Exception as e:

    print("\nERROR while loading audio:")
    print(type(e).__name__)
    print(e)

    sys.exit(1)


# ------------------------------------------------------------
# BASIC AUDIO FEATURES
# ------------------------------------------------------------

print("\n" + "=" * 60)
print("EXTRACTING AUDIO FEATURES")
print("=" * 60)


# RMS Energy
rms = librosa.feature.rms(y=y)[0]

# Zero Crossing Rate
zcr = librosa.feature.zero_crossing_rate(y)[0]

# Spectral Centroid
spectral_centroid = librosa.feature.spectral_centroid(
    y=y,
    sr=sr
)[0]

# Spectral Bandwidth
spectral_bandwidth = librosa.feature.spectral_bandwidth(
    y=y,
    sr=sr
)[0]

# Spectral Rolloff
spectral_rolloff = librosa.feature.spectral_rolloff(
    y=y,
    sr=sr
)[0]

# MFCC
mfcc = librosa.feature.mfcc(
    y=y,
    sr=sr,
    n_mfcc=13
)


# ------------------------------------------------------------
# DISPLAY FEATURES
# ------------------------------------------------------------

print("\nBasic Features:")

print(f"RMS mean:              {np.mean(rms):.6f}")
print(f"RMS std:               {np.std(rms):.6f}")

print(f"Zero crossing mean:    {np.mean(zcr):.6f}")
print(f"Zero crossing std:     {np.std(zcr):.6f}")

print(
    f"Spectral centroid:     "
    f"{np.mean(spectral_centroid):.2f} Hz"
)

print(
    f"Spectral bandwidth:    "
    f"{np.mean(spectral_bandwidth):.2f} Hz"
)

print(
    f"Spectral rolloff:      "
    f"{np.mean(spectral_rolloff):.2f} Hz"
)


# ------------------------------------------------------------
# MFCC FEATURES
# ------------------------------------------------------------

print("\nMFCC Features:")

for i in range(13):

    mean_value = np.mean(mfcc[i])
    std_value = np.std(mfcc[i])

    print(
        f"MFCC {i + 1:02d}: "
        f"mean={mean_value:10.4f} "
        f"std={std_value:10.4f}"
    )


# ------------------------------------------------------------
# FEATURE VECTOR
# ------------------------------------------------------------

feature_vector = np.concatenate([
    [
        np.mean(rms),
        np.std(rms),

        np.mean(zcr),
        np.std(zcr),

        np.mean(spectral_centroid),
        np.std(spectral_centroid),

        np.mean(spectral_bandwidth),
        np.std(spectral_bandwidth),

        np.mean(spectral_rolloff),
        np.std(spectral_rolloff)
    ],

    np.mean(mfcc, axis=1),

    np.std(mfcc, axis=1)
])


# ------------------------------------------------------------
# FEATURE VECTOR INFORMATION
# ------------------------------------------------------------

print("\n" + "=" * 60)
print("FEATURE VECTOR")
print("=" * 60)

print(f"\nFeature vector shape: {feature_vector.shape}")
print(f"Number of features: {len(feature_vector)}")


# ------------------------------------------------------------
# AUDIO QUALITY CHECK
# ------------------------------------------------------------

print("\n" + "=" * 60)
print("AUDIO ANALYSIS")
print("=" * 60)


mean_rms = np.mean(rms)
mean_zcr = np.mean(zcr)
mean_centroid = np.mean(spectral_centroid)


print(f"\nAverage RMS: {mean_rms:.6f}")
print(f"Average ZCR: {mean_zcr:.6f}")
print(f"Average spectral centroid: {mean_centroid:.2f} Hz")


# ------------------------------------------------------------
# IMPORTANT
# ------------------------------------------------------------

print("\n" + "=" * 60)
print("RESULT")
print("=" * 60)

print("""
Audio feature extraction completed successfully.

IMPORTANT:
These features alone do NOT prove that the audio is REAL
or FAKE.

A trained audio deepfake classification model is required
for an actual REAL/FAKE prediction.
""")

print("=" * 60)
print("AUDIO ANALYSIS COMPLETE")
print("=" * 60)