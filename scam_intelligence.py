"""Optional speech transcription and transparent scam-indicator rules."""

import os
import re
import threading

import librosa
import numpy as np


_ASR_PIPELINE = None
_ASR_LOCK = threading.Lock()
_ASR_MODEL_LOCK = threading.Lock()
_MAX_TRANSCRIPTION_SECONDS = 600
_MAX_TRANSCRIPT_CHARACTERS = 12000

_INDICATOR_RULES = (
    {
        "key": "credentials",
        "label": "Credential or verification-code request",
        "description": "The transcript asks for credentials, payment-card details, or a one-time code.",
        "pattern": re.compile(
            r"\b(?:otp|one[- ]time password|verification code|passcode|password|pin|cvv|"
            r"card details|bank details|account number)\b|"
            r"(?:ओटीपी|पासवर्ड|पिन|गुप्त कोड)",
            re.IGNORECASE,
        ),
    },
    {
        "key": "urgent_payment",
        "label": "Urgent money-transfer request",
        "description": "The transcript combines urgency with a request to send or transfer money.",
        "pattern": re.compile(
            r"(?=.*\b(?:urgent|immediately|right now|today|within minutes|asap|"
            r"abhi|turant|jaldi)\b)"
            r"(?=.*\b(?:send|transfer|pay|wire|deposit|upi|money|funds|payment|"
            r"paise|bhejo|bhej|transfer karo)\b)",
            re.IGNORECASE,
        ),
    },
    {
        "key": "impersonation",
        "label": "Possible authority or family impersonation",
        "description": "The transcript refers to a bank, government, police, or relative identity.",
        "pattern": re.compile(
            r"\b(?:bank (?:employee|officer|manager|security)|police|officer|"
            r"government|tax department|customs|court|your (?:son|daughter|mother|father|"
            r"brother|sister|relative)|i am your (?:son|daughter|mother|father|brother|sister))\b|"
            r"(?:मैं आपका बेटा|मैं आपकी बेटी|बैंक अधिकारी|पुलिस अधिकारी)",
            re.IGNORECASE,
        ),
    },
    {
        "key": "threat",
        "label": "Threat of account restriction or legal action",
        "description": "The transcript threatens account blocking, suspension, arrest, or legal action.",
        "pattern": re.compile(
            r"\b(?:account (?:will be )?(?:blocked|frozen|suspended)|"
            r"card (?:will be )?(?:blocked|suspended)|arrest(?:ed)?|warrant|"
            r"legal action|police case|lawsuit|account band|giraftar)\b",
            re.IGNORECASE,
        ),
    },
    {
        "key": "secrecy",
        "label": "Pressure to keep the request secret",
        "description": "The transcript asks the listener not to tell anyone or share information.",
        "pattern": re.compile(
            r"\b(?:don't tell anyone|do not tell anyone|keep (?:this )?secret|"
            r"keep this confidential|don't share|do not share|confidential information|"
            r" kisi ko mat batana|chupke se)\b",
            re.IGNORECASE,
        ),
    },
    {
        "key": "suspicious_payment",
        "label": "Unusual payment or remote-access instruction",
        "description": "The transcript mentions gift cards, cryptocurrency, QR payment, or remote-access software.",
        "pattern": re.compile(
            r"\b(?:gift card|cryptocurrency|crypto wallet|bitcoin|scan (?:the )?qr|"
            r"qr code|remote access|anydesk|teamviewer|upi id)\b",
            re.IGNORECASE,
        ),
    },
)


def _get_asr_pipeline():
    global _ASR_PIPELINE

    if _ASR_PIPELINE is None:
        with _ASR_MODEL_LOCK:
            if _ASR_PIPELINE is None:
                from transformers import pipeline

                model_name = os.environ.get(
                    "CYBERSHIELD_ASR_MODEL",
                    "openai/whisper-tiny",
                )
                _ASR_PIPELINE = pipeline(
                    "automatic-speech-recognition",
                    model=model_name,
                    chunk_length_s=30,
                    device=-1,
                )

    return _ASR_PIPELINE


def analyze_scam_transcript(transcript):
    """Return rule-triggered warnings without treating them as proof of a scam."""
    text = str(transcript or "").strip()[:_MAX_TRANSCRIPT_CHARACTERS]
    if not text:
        return {
            "status": "unknown",
            "transcript": "",
            "risk_level": "UNKNOWN",
            "indicators": [],
            "summary": "No usable speech transcript is available.",
            "recommendations": [
                "Do not rely on this scan alone; verify sensitive requests independently."
            ],
        }

    indicators = []
    for rule in _INDICATOR_RULES:
        matches = list(rule["pattern"].finditer(text))
        if not matches:
            continue

        excerpts = []
        for match in matches[:3]:
            start = max(0, match.start() - 55)
            end = min(len(text), match.end() + 75)
            excerpt = text[start:end].strip()
            if excerpt and excerpt not in excerpts:
                excerpts.append(excerpt)

        indicators.append({
            "key": rule["key"],
            "label": rule["label"],
            "description": rule["description"],
            "excerpts": excerpts,
        })

    indicator_keys = {indicator["key"] for indicator in indicators}
    if not indicators:
        risk_level = "LOW"
        summary = (
            "No configured scam-warning patterns were found in the transcript. "
            "This does not establish that the conversation is safe."
        )
        recommendations = [
            "Continue to verify unexpected requests through a trusted channel."
        ]
    elif (
        "credentials" in indicator_keys
        or len(indicators) >= 3
        or (
            len(indicators) >= 2
            and indicator_keys.intersection({"urgent_payment", "impersonation", "threat"})
        )
    ):
        risk_level = "HIGH"
        summary = (
            f"{len(indicators)} rule-based warning categories were found. "
            "These signals warrant independent verification; they are not proof of a scam."
        )
        recommendations = [
            "Do not share OTPs, passwords, PINs, or banking details.",
            "Pause payments and independently call the organization or person using a trusted number.",
            "Do not install remote-access software at the caller's request.",
        ]
    else:
        risk_level = "MEDIUM"
        summary = (
            f"{len(indicators)} rule-based warning category was found. "
            "Treat the request cautiously and verify it independently."
        )
        recommendations = [
            "Use a trusted callback or another independent verification channel.",
            "Do not share sensitive information or approve an unexpected payment until verified.",
        ]

    return {
        "status": "complete",
        "transcript": text,
        "risk_level": risk_level,
        "indicators": indicators,
        "summary": summary,
        "recommendations": recommendations,
        "method": "transparent_keyword_rules",
    }


def transcribe_and_analyze(audio_path):
    """Attempt local ASR and scam rules; return an UNKNOWN result on any ASR failure."""
    try:
        audio, sample_rate = librosa.load(
            audio_path,
            sr=16000,
            mono=True,
        )
        if audio.size == 0:
            raise ValueError("No audio samples were available.")
        if len(audio) / sample_rate > _MAX_TRANSCRIPTION_SECONDS:
            raise ValueError(
                "Transcription is limited to audio up to 10 minutes."
            )

        transcriber = _get_asr_pipeline()
        with _ASR_LOCK:
            output = transcriber({
                "array": np.asarray(audio, dtype=np.float32),
                "sampling_rate": sample_rate,
            })

        transcript = str(output.get("text", "")).strip()
        if not transcript:
            return analyze_scam_transcript("")
        return analyze_scam_transcript(transcript)
    except Exception as error:
        print("Optional scam-intelligence transcription unavailable:", error)
        return {
            "status": "unavailable",
            "transcript": "",
            "risk_level": "UNKNOWN",
            "indicators": [],
            "summary": "Transcription is unavailable; voice authenticity analysis is unaffected.",
            "recommendations": [
                "Check the local ASR model download and audio format, then retry if needed.",
                "Verify sensitive requests independently.",
            ],
            "error": "Transcription could not be completed.",
        }


def explain_detection_result(result):
    """Summarize recorded model outputs without claiming access to model internals."""
    prediction = str(result.get("prediction") or "UNKNOWN").upper()
    media_type = str(result.get("media_type") or "Media")
    model = str(result.get("model") or "AI detector")
    confidence = result.get("confidence")
    real = result.get("real_probability", result.get("real"))
    fake = result.get("fake_probability", result.get("fake"))

    scores = []
    if real is not None:
        scores.append(f"REAL score: {real}%")
    if fake is not None:
        scores.append(f"FAKE score: {fake}%")
    score_text = "; ".join(scores) if scores else "Class scores are not available."
    confidence_text = (
        f"Displayed confidence: {confidence}%."
        if confidence is not None
        else "Confidence is not available."
    )

    if media_type.lower() == "audio":
        summary = (
            f"The {model} returned {prediction}. "
            f"{score_text} {confidence_text}"
        )
    else:
        summary = (
            f"The {model} returned {prediction} for the analyzed {media_type.lower()}. "
            f"{score_text} {confidence_text}"
        )

    return {
        "summary": summary,
        "evidence": score_text,
        "visualization_available": False,
        "visualization_note": (
            "No model-supported saliency map is currently generated. "
            "No image/video region or audio feature is claimed as the model's reason."
        ),
        "caveat": (
            "This is a model prediction, not verified truth. Scores are model outputs "
            "and may be wrong; independently verify high-impact decisions."
        ),
    }
