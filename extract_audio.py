import av
import numpy as np
import soundfile as sf
import os

VIDEO_PATH = "deepfake.mp4"
AUDIO_PATH = "deepfake_audio.wav"

print("=" * 60)
print("AUDIO EXTRACTION TEST")
print("=" * 60)

print(f"\nVideo: {VIDEO_PATH}")
print(f"Output: {AUDIO_PATH}")

if not os.path.exists(VIDEO_PATH):
    print("\nERROR: deepfake.mp4 not found.")
    print("Make sure it is in the project folder.")
    exit()

try:
    container = av.open(VIDEO_PATH)

    audio_streams = container.streams.audio

    if len(audio_streams) == 0:
        print("\nNO AUDIO STREAM FOUND!")
        container.close()
        exit()

    stream = audio_streams[0]

    print("\nAudio stream found.")
    print(f"Sample rate: {stream.sample_rate}")
    print(f"Channels: {stream.channels}")
    print(f"Codec: {stream.codec_context.name}")

    audio_chunks = []

    for frame in container.decode(stream):
        audio = frame.to_ndarray()

        # Convert to float32
        audio = audio.astype(np.float32)

        audio_chunks.append(audio)

    container.close()

    if not audio_chunks:
        print("\nERROR: No audio data decoded.")
        exit()

    audio_data = np.concatenate(audio_chunks, axis=1)

    # Convert stereo/multi-channel to mono
    if audio_data.shape[0] > 1:
        audio_data = np.mean(audio_data, axis=0)
    else:
        audio_data = audio_data[0]

    # Normalize if necessary
    max_value = np.max(np.abs(audio_data))

    if max_value > 1.0:
        audio_data = audio_data / max_value

    audio_data = audio_data.astype(np.float32)

    sample_rate = stream.sample_rate

    sf.write(
        AUDIO_PATH,
        audio_data,
        sample_rate
    )

    duration = len(audio_data) / sample_rate

    rms = np.sqrt(np.mean(audio_data ** 2))
    peak = np.max(np.abs(audio_data))

    print("\n" + "=" * 60)
    print("AUDIO EXTRACTION SUCCESS")
    print("=" * 60)

    print(f"\nSample rate: {sample_rate} Hz")
    print(f"Duration: {duration:.2f} seconds")
    print(f"Channels: Mono")
    print(f"RMS volume: {rms:.6f}")
    print(f"Peak volume: {peak:.6f}")

    if rms < 0.005:
        level = "VERY LOW"
    elif rms < 0.02:
        level = "LOW"
    elif rms < 0.08:
        level = "NORMAL"
    else:
        level = "HIGH"

    print(f"Audio level: {level}")

    print(f"\nSaved audio:")
    print(os.path.abspath(AUDIO_PATH))

    print("\n" + "=" * 60)

except Exception as e:
    print("\nERROR while extracting audio:")
    print(type(e).__name__)
    print(e)