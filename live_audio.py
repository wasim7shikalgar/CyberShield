import os
import time
import threading
import numpy as np
import sounddevice as sd
import soundfile as sf


# ============================================================
# CYBERSHIELD LIVE AUDIO CONFIGURATION
# ============================================================

SAMPLE_RATE = 16000
CHANNELS = 1

PROJECT_ROOT = os.path.dirname(
    os.path.abspath(__file__)
)

# Existing live-monitoring requirement
CHUNK_DURATION = 2
CHUNK_DELAY = 0.25

OUTPUT_FOLDER = os.path.join(
    PROJECT_ROOT,
    "live_audio_chunks"
)

recording_active = False
recording_thread = None
chunk_number = 0

state_lock = threading.Lock()


# ============================================================
# INITIALIZATION
# ============================================================

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


# ============================================================
# AUDIO DEVICE HELPERS
# ============================================================

def get_input_devices():
    """
    Return available input-capable audio devices.
    """
    devices = []

    try:
        all_devices = sd.query_devices()

        for index, device in enumerate(all_devices):
            try:
                max_input_channels = int(
                    device.get("max_input_channels", 0)
                )
            except Exception:
                max_input_channels = 0

            if max_input_channels > 0:
                devices.append({
                    "index": index,
                    "name": device.get("name", f"Device {index}"),
                    "channels": max_input_channels,
                    "sample_rate": device.get(
                        "default_samplerate",
                        SAMPLE_RATE
                    )
                })

    except Exception as e:
        print(f"❌ Could not query audio devices: {e}")

    return devices


def get_default_input_device():
    """
    Find a valid default input device.
    """

    try:
        default_device = sd.default.device

        # sounddevice normally returns:
        # [input_device, output_device]
        if isinstance(default_device, (list, tuple)):
            input_device = default_device[0]

            if input_device is not None and int(input_device) >= 0:
                try:
                    device_info = sd.query_devices(
                        int(input_device)
                    )

                    if int(
                        device_info.get(
                            "max_input_channels",
                            0
                        )
                    ) > 0:
                        return int(input_device)

                except Exception:
                    pass

        # If default device is not usable,
        # search manually.
        devices = get_input_devices()

        if devices:
            return devices[0]["index"]

    except Exception as e:
        print(f"⚠️ Input device detection error: {e}")

    return None


def check_microphone():
    """
    Check whether a usable microphone exists.
    """

    device_index = get_default_input_device()

    if device_index is None:
        return {
            "available": False,
            "device": None,
            "message": (
                "No microphone/input device found. "
                "Check Windows microphone permissions "
                "and your recording device."
            )
        }

    try:
        device_info = sd.query_devices(device_index)

        device_name = device_info.get(
            "name",
            f"Input Device {device_index}"
        )

        input_channels = int(
            device_info.get(
                "max_input_channels",
                0
            )
        )

        if input_channels <= 0:
            return {
                "available": False,
                "device": device_name,
                "message": (
                    f"'{device_name}' is not an input device."
                )
            }

        return {
            "available": True,
            "device": device_name,
            "device_index": device_index,
            "channels": input_channels,
            "sample_rate": device_info.get(
                "default_samplerate",
                SAMPLE_RATE
            ),
            "message": (
                f"Microphone ready: {device_name}"
            )
        }

    except Exception as e:
        return {
            "available": False,
            "device": None,
            "message": (
                f"Microphone check failed: {e}"
            )
        }


# ============================================================
# CLEAN AUDIO FOLDER
# ============================================================

def clean_audio_folder():
    """
    Delete previous live WAV chunks.
    """

    global chunk_number

    os.makedirs(
        OUTPUT_FOLDER,
        exist_ok=True
    )

    for file in os.listdir(OUTPUT_FOLDER):

        file_path = os.path.join(
            OUTPUT_FOLDER,
            file
        )

        if file.lower().endswith(".wav"):

            try:
                os.remove(file_path)

            except Exception as e:
                print(
                    f"⚠️ Could not remove "
                    f"{file_path}: {e}"
                )

    with state_lock:
        chunk_number = 0


# ============================================================
# RECORDING STATE
# ============================================================

def is_recording():

    with state_lock:
        return recording_active


def set_recording_status(status):

    global recording_active

    with state_lock:
        recording_active = bool(status)


# ============================================================
# RECORD ONE LOW-LATENCY CHUNK
# ============================================================

def record_chunk(current_chunk_number):

    filename = os.path.join(
        OUTPUT_FOLDER,
        f"chunk_{current_chunk_number}.wav"
    )

    print(
        f"🎙️ Recording chunk "
        f"{current_chunk_number} "
        f"({CHUNK_DURATION} sec)..."
    )

    device_index = get_default_input_device()

    if device_index is None:

        print(
            "❌ No microphone/input device available."
        )

        return None

    try:

        audio = sd.rec(
            int(
                CHUNK_DURATION *
                SAMPLE_RATE
            ),
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype="float32",
            device=device_index
        )

        sd.wait()

        if audio is None:
            print(
                f"⚠️ Empty audio chunk "
                f"{current_chunk_number}"
            )
            return None

        if len(audio) == 0:

            print(
                f"⚠️ Empty audio chunk "
                f"{current_chunk_number}"
            )

            return None

        # Calculate signal amplitude
        max_amp = float(
            np.max(
                np.abs(audio)
            )
        )

        rms = float(
            np.sqrt(
                np.mean(
                    np.square(audio)
                )
            )
        )

        if max_amp < 0.00001:

            print(
                f"⚠️ Very low audio signal "
                f"in chunk {current_chunk_number}: "
                f"max_amp={max_amp:.8f}"
            )

        print(
            f"🔊 Chunk {current_chunk_number} "
            f"signal | "
            f"max_amp={max_amp:.6f} | "
            f"RMS={rms:.6f}"
        )

        # Save WAV
        sf.write(
            filename,
            audio,
            SAMPLE_RATE,
            subtype="PCM_16"
        )

        print(
            f"💾 Saved: {filename}"
        )

        return filename

    except Exception as e:

        print(
            f"❌ Audio recording error "
            f"in chunk "
            f"{current_chunk_number}: "
            f"{e}"
        )

        return None


# ============================================================
# LIVE RECORDING LOOP
# ============================================================

def recording_loop():

    global chunk_number

    print(
        "🎙️ Live recording loop started."
    )

    microphone = check_microphone()

    if not microphone.get("available"):

        print(
            "❌ Live recording cannot start:"
        )

        print(
            microphone.get(
                "message",
                "Unknown microphone error."
            )
        )

        set_recording_status(False)

        return

    print(
        "🎤 Microphone:"
        f" {microphone.get('device')}"
    )

    while is_recording():

        with state_lock:

            chunk_number += 1

            current_chunk = chunk_number

        record_chunk(
            current_chunk
        )

        if not is_recording():
            break

        time.sleep(
            CHUNK_DELAY
        )

    print(
        "🛑 Live recording loop stopped."
    )


# ============================================================
# START RECORDING
# ============================================================

def start_recording():

    global recording_thread

    if is_recording():

        print(
            "⚠️ Live recording already active."
        )

        return False

    microphone = check_microphone()

    if not microphone.get("available"):

        print(
            "❌ Cannot start live recording:"
        )

        print(
            microphone.get(
                "message",
                "Microphone unavailable."
            )
        )

        return False

    clean_audio_folder()

    set_recording_status(True)

    recording_thread = threading.Thread(
        target=recording_loop,
        daemon=True
    )

    recording_thread.start()

    print(
        "✅ Live audio recording started."
    )

    return True


# ============================================================
# STOP RECORDING
# ============================================================

def stop_recording():

    if not is_recording():

        print(
            "⚠️ Live recording is not active."
        )

        return False

    set_recording_status(False)

    print(
        "🛑 Live audio recording stop requested."
    )

    return True


# ============================================================
# LATEST CHUNK
# ============================================================

def get_latest_chunk():

    if not os.path.exists(
        OUTPUT_FOLDER
    ):
        return None

    files = [
        f
        for f in os.listdir(
            OUTPUT_FOLDER
        )
        if f.lower().endswith(".wav")
    ]

    if not files:
        return None

    files.sort(
        key=lambda x:
        os.path.getmtime(
            os.path.join(
                OUTPUT_FOLDER,
                x
            )
        )
    )

    return os.path.join(
        OUTPUT_FOLDER,
        files[-1]
    )


# ============================================================
# GET ALL AUDIO CHUNKS
# ============================================================

def get_audio_chunks():

    if not os.path.exists(
        OUTPUT_FOLDER
    ):
        return []

    files = [
        f
        for f in os.listdir(
            OUTPUT_FOLDER
        )
        if f.lower().endswith(".wav")
    ]

    files.sort()

    return [
        os.path.join(
            OUTPUT_FOLDER,
            f
        )
        for f in files
    ]


# ============================================================
# CURRENT CHUNK NUMBER
# ============================================================

def get_current_chunk_number():

    with state_lock:
        return chunk_number


# ============================================================
# AUDIO SETTINGS
# ============================================================

def get_audio_settings():

    microphone = check_microphone()

    return {

        "sample_rate": SAMPLE_RATE,

        "channels": CHANNELS,

        "chunk_duration": CHUNK_DURATION,

        "chunk_delay": CHUNK_DELAY,

        "output_folder": OUTPUT_FOLDER,

        "microphone": microphone
    }


# ============================================================
# TEST MAIN
# ============================================================

def main():

    print("=" * 70)

    print(
        "🎙️ CYBERSHIELD LIVE AUDIO TEST"
    )

    print("=" * 70)

    print(
        f"Sample Rate : {SAMPLE_RATE}"
    )

    print(
        f"Channels    : {CHANNELS}"
    )

    print(
        f"Chunk       : {CHUNK_DURATION} sec"
    )

    print(
        f"Delay       : {CHUNK_DELAY} sec"
    )

    print(
        f"Output      : {OUTPUT_FOLDER}"
    )

    print("=" * 70)

    microphone = check_microphone()

    print(
        "\n🎤 Microphone status:"
    )

    print(
        microphone
    )

    if not microphone.get("available"):

        print(
            "\n❌ Microphone is not available."
        )

        return

    try:

        start_recording()

        time.sleep(15)

        stop_recording()

        time.sleep(1)

        print(
            "\n📂 Generated chunks:"
        )

        for file in get_audio_chunks():

            print(
                f"   {file}"
            )

    except KeyboardInterrupt:

        stop_recording()

        print(
            "\n🛑 Stopped by user."
        )

    except Exception as e:

        stop_recording()

        print(
            f"\n❌ Test failed: {e}"
        )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    main()