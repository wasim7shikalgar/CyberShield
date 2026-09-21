"use strict";

/* =========================================================
   CYBERSHIELD - DASHBOARD SCRIPT
   =========================================================
   FEATURES
   ---------------------------------------------------------
   1. Flask live microphone monitoring
      - Existing 3-second chunk workflow
      - /api/audio/start
      - /api/audio/status
      - /api/latest
      - /api/audio/stop

    2. 1-minute browser recording
      - Browser microphone
    - Record exactly up to 60 seconds
      - Live waveform
      - Audio preview
      - Recording Ready state
      - Scan through existing /api/audio/upload

   3. Media scanner
      - Audio
      - Image
      - Video

   4. Unified AI result rendering

   5. Risk analysis

   6. Analytics

   7. Audit history
      - Search
      - Filter
      - CSV export
      - Clear

   8. System health

   9. Dashboard navigation

   ========================================================= */


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let livePollingTimer = null;
let healthTimer = null;
let dashboardClockTimer = null;

let liveTimerInterval = null;
let liveRecordingStartedAt = null;

let recordTimerInterval = null;
let recordStartedAt = null;
let recordAutoStopTimer = null;

let mediaRecorder = null;
let recordedAudioChunks = [];
let recordedAudioBlob = null;
let recordedAudioUrl = null;
let recordedAudioMimeType = "";

let recordAudioStream = null;
let recordAudioContext = null;
let recordAnalyser = null;
let recordSourceNode = null;
let recordWaveAnimationFrame = null;

let selectedMediaType = null;
let selectedMediaFile = null;

let selectedScanMode = "standard";
let sensitivityValue = 50;
let autoScanEnabled = false;

let scanHistory = [];
let latestLiveAuditEntry = null;

let isUploading = false;
let isLivePolling = false;
let isInitialized = false;

let lastLiveResultId = "";
let lastAppliedResultId = "";

const HISTORY_STORAGE_KEY = "cybershield_audit_history_v2";

const RECORD_DURATION_SECONDS = 60;


/* =========================================================
   DOM HELPERS
   ========================================================= */

function el(id) {
    return document.getElementById(id);
}


function setText(id, value) {
    const node = el(id);

    if (node) {
        node.textContent =
            value === null ||
            value === undefined
                ? ""
                : String(value);
    }
}


function clamp(value, min, max) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return min;
    }

    return Math.min(
        Math.max(number, min),
        max
    );
}


function toPercentage(value) {
    let number = Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    /*
     * Some backends return probabilities
     * between 0 and 1 instead of 0 and 100.
     */
    if (
        number >= 0 &&
        number <= 1
    ) {
        number *= 100;
    }

    return clamp(
        number,
        0,
        100
    );
}


function formatPercentage(value) {
    return `${toPercentage(value).toFixed(1)}%`;
}


function formatFileSize(bytes) {
    const size = Number(bytes);

    if (
        !Number.isFinite(size) ||
        size <= 0
    ) {
        return "0 B";
    }

    const units = [
        "B",
        "KB",
        "MB",
        "GB"
    ];

    let index = 0;
    let current = size;

    while (
        current >= 1024 &&
        index < units.length - 1
    ) {
        current /= 1024;
        index++;
    }

    return `${current.toFixed(
        index === 0 ? 0 : 1
    )} ${units[index]}`;
}


function formatDuration(seconds) {
    const total = Math.max(
        0,
        Math.floor(
            Number(seconds) || 0
        )
    );

    const minutes =
        Math.floor(total / 60);

    const secs =
        total % 60;

    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}


function formatTime(value) {
    const date =
        value instanceof Date
            ? value
            : new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "--:--:--";
    }

    return date.toLocaleTimeString(
        [],
        {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }
    );
}


function formatDateTime(value) {
    const date =
        value instanceof Date
            ? value
            : new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return new Date().toISOString();
    }

    return date.toISOString();
}


function sleep(ms) {
    return new Promise(
        resolve =>
            window.setTimeout(
                resolve,
                ms
            )
    );
}


/* =========================================================
   SAFE FETCH
   ========================================================= */

async function fetchJSON(
    url,
    options = {}
) {
    let response;

    try {
        response =
            await fetch(
                url,
                {
                    cache: "no-store",
                    ...options
                }
            );
    } catch (error) {
        throw new Error(
            "Cannot connect to the CyberShield server. Start Flask with python app.py."
        );
    }

    let data = null;

    try {
        data =
            await response.json();
    } catch {
        data = null;
    }

    return {
        response,
        data
    };
}


/* =========================================================
   RESULT NORMALIZATION
   ========================================================= */

function calculateRiskLevel(risk) {
    const value =
        toPercentage(risk);

    if (value <= 30) {
        return "LOW";
    }

    if (value <= 60) {
        return "MEDIUM";
    }

    return "HIGH";
}


function normalizePrediction(value) {
    const text =
        String(
            value ?? ""
        )
            .trim()
            .toUpperCase();

    if (
        text.includes("FAKE") ||
        text.includes("SYNTHETIC") ||
        text.includes("DEEPFAKE") ||
        text.includes("MANIPULATED")
    ) {
        return "FAKE";
    }

    if (
        text.includes("REAL") ||
        text.includes("AUTHENTIC") ||
        text.includes("GENUINE")
    ) {
        return "REAL";
    }

    return "";
}


function getFirstDefined(
    object,
    keys,
    fallback = null
) {
    for (const key of keys) {
        if (
            object &&
            object[key] !== undefined &&
            object[key] !== null
        ) {
            return object[key];
        }
    }

    return fallback;
}


function normalizeResult(rawResult) {
    if (
        !rawResult ||
        typeof rawResult !== "object"
    ) {
        return null;
    }

    let realRaw =
        getFirstDefined(
            rawResult,
            [
                "real",
                "real_probability",
                "realProbability",
                "real_prob",
                "real_score"
            ],
            null
        );

    let fakeRaw =
        getFirstDefined(
            rawResult,
            [
                "fake",
                "fake_probability",
                "fakeProbability",
                "fake_prob",
                "fake_score"
            ],
            null
        );

    let real =
        toPercentage(realRaw);

    let fake =
        toPercentage(fakeRaw);

    /*
     * If backend only gives prediction/confidence,
     * construct a sensible probability distribution.
     */
    if (
        real <= 0 &&
        fake <= 0
    ) {
        const backendPrediction =
            normalizePrediction(
                getFirstDefined(
                    rawResult,
                    [
                        "prediction",
                        "classification",
                        "result",
                        "label",
                        "class"
                    ],
                    ""
                )
            );

        const backendConfidence =
            toPercentage(
                getFirstDefined(
                    rawResult,
                    [
                        "confidence",
                        "score",
                        "probability"
                    ],
                    0
                )
            );

        if (
            backendPrediction === "FAKE"
        ) {
            fake =
                backendConfidence;

            real =
                100 - fake;
        } else if (
            backendPrediction === "REAL"
        ) {
            real =
                backendConfidence;

            fake =
                100 - real;
        }
    }

    /*
     * Keep both probabilities valid.
     */
    let total =
        real + fake;

    if (
        !Number.isFinite(total) ||
        total <= 0
    ) {
        real = 50;
        fake = 50;
        total = 100;
    }

    /*
     * Normalize to exactly 100%.
     */
    real =
        (real / total) * 100;

    fake =
        (fake / total) * 100;

    /*
     * Prediction.
     */
    let prediction =
        normalizePrediction(
            getFirstDefined(
                rawResult,
                [
                    "prediction",
                    "classification",
                    "result",
                    "label",
                    "class"
                ],
                ""
            )
        );

    if (
        prediction !== "REAL" &&
        prediction !== "FAKE"
    ) {
        prediction =
            fake >= real
                ? "FAKE"
                : "REAL";
    }

    /*
     * Confidence must match the displayed class probability.
     * Some backend responses contain a separate confidence value
     * on a different scale, which makes the verdict inconsistent.
     */
    const expectedConfidence =
        prediction === "FAKE"
            ? fake
            : real;

    const confidence =
        expectedConfidence;

    /*
     * Risk.
     */
    let risk =
        toPercentage(
            getFirstDefined(
                rawResult,
                [
                    "risk",
                    "risk_score",
                    "riskScore",
                    "fraud_risk",
                    "fraudRisk"
                ],
                fake
            )
        );

    /*
     * If backend has prediction FAKE but risk
     * is accidentally zero, fake probability
     * is a safer frontend fallback.
     */
    if (
        prediction === "FAKE" &&
        risk <= 0 &&
        fake > 0
    ) {
        risk = fake;
    }

    const backendRiskLevel =
        String(
            getFirstDefined(
                rawResult,
                [
                    "risk_level",
                    "riskLevel"
                ],
                ""
            )
        )
            .trim()
            .toUpperCase();

    const riskLevel =
        (
            backendRiskLevel === "LOW" ||
            backendRiskLevel === "MEDIUM" ||
            backendRiskLevel === "HIGH"
        )
            ? backendRiskLevel
            : calculateRiskLevel(risk);

    const mediaTypeRaw =
        getFirstDefined(
            rawResult,
            [
                "media_type",
                "mediaType",
                "type",
                "media"
            ],
            "Audio"
        );

    const mediaTypeText =
        String(
            mediaTypeRaw
        ).trim();

    let mediaType =
        mediaTypeText || "Audio";

    const lowerMediaType =
        mediaType.toLowerCase();

    if (
        lowerMediaType.includes("audio") ||
        lowerMediaType.includes("voice")
    ) {
        mediaType = "Audio";
    } else if (
        lowerMediaType.includes("video")
    ) {
        mediaType = "Video";
    } else if (
        lowerMediaType.includes("image") ||
        lowerMediaType.includes("photo")
    ) {
        mediaType = "Image";
    }

    const filename =
        String(
            getFirstDefined(
                rawResult,
                [
                    "filename",
                    "file",
                    "file_name",
                    "name",
                    "chunk"
                ],
                "Unknown"
            )
        );

    const model =
        String(
            getFirstDefined(
                rawResult,
                [
                    "model",
                    "model_name",
                    "detector"
                ],
                "AI Detector"
            )
        );

    const source =
        String(
            getFirstDefined(
                rawResult,
                [
                    "source",
                    "inference_source"
                ],
                "Unknown"
            )
        );

    const timestamp =
        getFirstDefined(
            rawResult,
            [
                "timestamp",
                "created_at",
                "time",
                "date"
            ],
            new Date().toISOString()
        );

    const chunk =
        getFirstDefined(
            rawResult,
            [
                "chunk",
                "chunk_name",
                "chunk_id"
            ],
            null
        );

    const inference =
        getFirstDefined(
            rawResult,
            [
                "inference_ms",
                "inference_time",
                "processing_time",
                "latency"
            ],
            null
        );

    const recording =
        Boolean(
            getFirstDefined(
                rawResult,
                [
                    "recording",
                    "is_recording"
                ],
                false
            )
        );

    const backendId =
        getFirstDefined(
            rawResult,
            [
                "id",
                "scan_id",
                "result_id"
            ],
            null
        );

    const generatedId =
        `${mediaType}-${filename}-${prediction}-${timestamp}`;

    return {
        id:
            String(
                backendId ||
                generatedId
            ),

        timestamp,

        media_type:
            mediaType,

        filename,

        prediction,

        confidence,

        real,

        fake,

        risk,

        risk_level:
            riskLevel,

        model,

        source,

        chunk,

        recording,

        inference
    };
}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(
    message,
    type = "info"
) {
    const container =
        el("toastContainer");

    if (!container) {
        return;
    }

    const toast =
        document.createElement("div");

    toast.className =
        `toast toast-${type}`;

    toast.textContent =
        String(message);

    container.appendChild(
        toast
    );

    window.setTimeout(
        () => {
            toast.classList.add(
                "toast-hide"
            );

            window.setTimeout(
                () => {
                    toast.remove();
                },
                300
            );
        },
        3500
    );
}


/* =========================================================
   SCAN OVERLAY
   ========================================================= */

function showScanOverlay(
    message = "Analyzing media..."
) {
    const overlay =
        el("scanOverlay");

    if (!overlay) {
        return;
    }

    overlay.classList.remove(
        "hidden"
    );

    overlay.classList.add(
        "active"
    );

    setText(
        "scanOverlayMessage",
        message
    );

    setText(
        "scanProgressText",
        "0%"
    );

    const progress =
        el("scanProgressBar");

    if (progress) {
        progress.style.width =
            "0%";
    }
}


function updateScanOverlay(
    progress,
    message
) {
    const value =
        clamp(
            progress,
            0,
            100
        );

    setText(
        "scanOverlayMessage",
        message
    );

    setText(
        "scanProgressText",
        `${Math.round(value)}%`
    );

    const progressBar =
        el("scanProgressBar");

    if (progressBar) {
        progressBar.style.width =
            `${value}%`;
    }
}


function hideScanOverlay() {
    const overlay =
        el("scanOverlay");

    if (!overlay) {
        return;
    }

    overlay.classList.remove(
        "active"
    );

    overlay.classList.add(
        "hidden"
    );
}


/* =========================================================
   AUDIO SCAN STATUS
   ========================================================= */

function setAudioScanStatus(
    state,
    title = "",
    message = ""
) {
    const status =
        el("audioScanStatus");

    if (!status) {
        return;
    }

    status.classList.remove(
        "is-idle",
        "is-processing",
        "is-success",
        "is-error"
    );

    status.classList.add(
        `is-${state}`
    );

    setText(
        "audioScanTitle",
        title
    );

    setText(
        "audioScanMessage",
        message
    );

    const spinner =
        el("audioScanSpinner");

    if (spinner) {
        spinner.style.display =
            state === "processing"
                ? "inline-flex"
                : "none";
    }

    const pulse =
        el("audioScanStatusPulse");

    if (pulse) {
        pulse.className =
            `status-pulse ${state}`;
    }
}


/* =========================================================
   MEDIA FILE SELECTION
   ========================================================= */

function setSelectedFile(
    file,
    mediaType
) {
    if (!file) {
        return;
    }

    selectedMediaFile =
        file;

    selectedMediaType =
        mediaType;

    const selectedCard =
        el("selectedFileCard");

    if (selectedCard) {
        selectedCard.classList.add(
            "active"
        );
    }

    setText(
        "selectedFileName",
        file.name
    );

    setText(
        "selectedFileMeta",
        `${mediaType} • ${formatFileSize(file.size)}`
    );

    if (
        mediaType === "Audio"
    ) {
        setText(
            "audioSelectedFile",
            file.name
        );

        const audioControl =
            el("audioScanControl");

        if (audioControl) {
            audioControl.classList.add(
                "active"
            );
        }

        setText(
            "selectedAudioName",
            file.name
        );

        setText(
            "selectedAudioMeta",
            `${formatFileSize(file.size)} • Ready to scan`
        );

        setAudioScanStatus(
            "idle",
            "Audio Scanner Ready",
            "Click Scan Audio to analyze this file."
        );
    } else {
        const audioControl =
            el("audioScanControl");

        if (audioControl) {
            audioControl.classList.remove(
                "active"
            );
        }

        setText(
            "selectedAudioName",
            "No audio selected"
        );

        setText(
            "selectedAudioMeta",
            ""
        );
    }

    if (
        mediaType === "Video"
    ) {
        setText(
            "videoSelectedFile",
            file.name
        );
    }

    if (
        mediaType === "Image"
    ) {
        setText(
            "imageSelectedFile",
            file.name
        );
    }

    if (
        autoScanEnabled
    ) {
        window.setTimeout(
            () => {
                startMediaScan();
            },
            200
        );
    }
}


function clearSelectedFile() {
    selectedMediaFile =
        null;

    selectedMediaType =
        null;

    const selectedCard =
        el("selectedFileCard");

    if (selectedCard) {
        selectedCard.classList.remove(
            "active"
        );
    }

    const audioControl =
        el("audioScanControl");

    if (audioControl) {
        audioControl.classList.remove(
            "active"
        );
    }

    setText(
        "selectedFileName",
        ""
    );

    setText(
        "selectedFileMeta",
        ""
    );

    setText(
        "selectedAudioName",
        "No audio selected"
    );

    setText(
        "selectedAudioMeta",
        ""
    );

    setText(
        "audioSelectedFile",
        ""
    );

    setText(
        "videoSelectedFile",
        ""
    );

    setText(
        "imageSelectedFile",
        ""
    );

    const audioInput =
        el("audioFile");

    const videoInput =
        el("videoFile");

    const imageInput =
        el("imageFile");

    if (audioInput) {
        audioInput.value =
            "";
    }

    if (videoInput) {
        videoInput.value =
            "";
    }

    if (imageInput) {
        imageInput.value =
            "";
    }

    setAudioScanStatus(
        "idle",
        "Audio Scanner Ready",
        "Select an audio file to begin."
    );
}


function setupFileInput(
    inputId,
    buttonId,
    mediaType,
    acceptedExtensions
) {
    const input =
        el(inputId);

    const button =
        el(buttonId);

    if (
        !input ||
        !button
    ) {
        return;
    }

    input.accept =
        acceptedExtensions;

    button.addEventListener(
        "click",
        () => {
            input.click();
        }
    );

    input.addEventListener(
        "change",
        () => {
            const file =
                input.files &&
                input.files[0];

            if (!file) {
                return;
            }

            setSelectedFile(
                file,
                mediaType
            );
        }
    );
}


/* =========================================================
   DRAG AND DROP
   ========================================================= */

function setupDropZone() {
    const dropZone =
        el("scanDropArea");

    if (!dropZone) {
        return;
    }

    const prevent =
        event => {
            event.preventDefault();
            event.stopPropagation();
        };

    [
        "dragenter",
        "dragover",
        "dragleave",
        "drop"
    ].forEach(
        eventName => {
            dropZone.addEventListener(
                eventName,
                prevent
            );
        }
    );

    [
        "dragenter",
        "dragover"
    ].forEach(
        eventName => {
            dropZone.addEventListener(
                eventName,
                () => {
                    dropZone.classList.add(
                        "drag-active"
                    );
                }
            );
        }
    );

    [
        "dragleave",
        "drop"
    ].forEach(
        eventName => {
            dropZone.addEventListener(
                eventName,
                () => {
                    dropZone.classList.remove(
                        "drag-active"
                    );
                }
            );
        }
    );

    dropZone.addEventListener(
        "drop",
        event => {
            const files =
                event.dataTransfer?.files;

            if (
                !files ||
                files.length === 0
            ) {
                return;
            }

            const file =
                files[0];

            const type =
                detectMediaTypeFromFile(
                    file
                );

            if (!type) {
                showToast(
                    "Unsupported file type.",
                    "error"
                );

                return;
            }

            setSelectedFile(
                file,
                type
            );
        }
    );
}


function detectMediaTypeFromFile(
    file
) {
    if (!file) {
        return null;
    }

    const name =
        String(
            file.name || ""
        ).toLowerCase();

    const mime =
        String(
            file.type || ""
        ).toLowerCase();

    if (
        mime.startsWith(
            "audio/"
        ) ||
        /\.(wav|mp3|m4a|ogg|flac)$/i.test(
            name
        )
    ) {
        return "Audio";
    }

    if (
        mime.startsWith(
            "video/"
        ) ||
        /\.(mp4|avi|mov|mkv|webm)$/i.test(
            name
        )
    ) {
        return "Video";
    }

    if (
        /\.webm$/i.test(name)
    ) {
        return null;
    }

    if (
        mime.startsWith(
            "image/"
        ) ||
        /\.(jpg|jpeg|png|webp|bmp)$/i.test(
            name
        )
    ) {
        return "Image";
    }

    return null;
}


/* =========================================================
   MEDIA SCANNER
   ========================================================= */

async function startMediaScan() {
    if (isUploading) {
        return;
    }

    if (
        !selectedMediaFile ||
        !selectedMediaType
    ) {
        showToast(
            "Select an audio, video, or image file first.",
            "error"
        );

        return;
    }

    const endpointMap = {
        Audio: "/api/audio/upload",
        Video: "/api/video/upload",
        Image: "/api/image/upload"
    };

    const endpoint =
        endpointMap[
            selectedMediaType
        ];

    if (!endpoint) {
        showToast(
            "Unsupported media type.",
            "error"
        );

        return;
    }

    isUploading =
        true;

    const scanButton =
        el("startScanButton");

    if (scanButton) {
        scanButton.disabled =
            true;

        scanButton.classList.add(
            "loading"
        );
    }

    if (
        selectedMediaType === "Audio"
    ) {
        setAudioScanStatus(
            "processing",
            "Scanning audio...",
            "Running Wav2Vec2 AI authenticity analysis."
        );
    }

    showScanOverlay(
        `Analyzing ${selectedMediaType.toLowerCase()}...`
    );

    try {
        updateScanOverlay(
            10,
            "Preparing media..."
        );

        const formData =
            new FormData();

        if (
            selectedMediaType === "Audio"
        ) {
            formData.append(
                "audio",
                selectedMediaFile
            );
        }

        if (
            selectedMediaType === "Video"
        ) {
            formData.append(
                "video",
                selectedMediaFile
            );
        }

        if (
            selectedMediaType === "Image"
        ) {
            formData.append(
                "image",
                selectedMediaFile
            );
        }

        updateScanOverlay(
            30,
            "Uploading media..."
        );

        const {
            response,
            data
        } =
            await fetchJSON(
                endpoint,
                {
                    method: "POST",
                    body: formData
                }
            );

        updateScanOverlay(
            65,
            "Running AI detector..."
        );

        if (
            !response.ok
        ) {
            throw new Error(
                data?.error ||
                data?.message ||
                `Server returned ${response.status}.`
            );
        }

        if (
            data &&
            data.success === false
        ) {
            throw new Error(
                data.error ||
                data.message ||
                "Media scan failed."
            );
        }

        updateScanOverlay(
            85,
            "Calculating authenticity risk..."
        );

        const resultPayload =
            data?.result ||
            data?.data ||
            data;

        const result =
            normalizeResult(
                resultPayload
            );

        if (!result) {
            throw new Error(
                "Backend returned no valid detection result."
            );
        }

        updateScanOverlay(
            95,
            "Updating forensic dashboard..."
        );

        applyResult(
            result,
            {
                addToHistory: true,
                source: "upload"
            }
        );

        updateScanOverlay(
            100,
            "Analysis complete."
        );

        if (
            selectedMediaType === "Audio"
        ) {
            setAudioScanStatus(
                "success",
                "Scan Complete",
                `${result.prediction} detected with ${formatPercentage(result.confidence)} confidence.`
            );
        }

        showToast(
            `${result.media_type} scan complete.`,
            result.prediction === "FAKE"
                ? "error"
                : "success"
        );

        window.setTimeout(
            hideScanOverlay,
            500
        );
    } catch (error) {
        console.error(
            "CyberShield media scan error:",
            error
        );

        if (
            selectedMediaType === "Audio"
        ) {
            setAudioScanStatus(
                "error",
                "Scan Failed",
                error.message ||
                "Unable to analyze audio."
            );
        }

        showToast(
            error.message ||
            "Media scan failed.",
            "error"
        );

        hideScanOverlay();
    } finally {
        isUploading =
            false;

        if (scanButton) {
            scanButton.disabled =
                false;

            scanButton.classList.remove(
                "loading"
            );
        }
    }
}


async function scanSelectedAudio() {
    if (
        !selectedMediaFile ||
        selectedMediaType !== "Audio"
    ) {
        showToast(
            "Please select an audio file first.",
            "error"
        );

        return;
    }

    await startMediaScan();
}


/* =========================================================
   LIVE 3-SECOND FLASK MICROPHONE MONITOR
   ========================================================= */

async function startLiveRecording() {
    const startButton =
        el("startButton");

    if (startButton) {
        startButton.disabled =
            true;
    }

    try {
        const {
            response,
            data
        } =
            await fetchJSON(
                "/api/audio/start",
                {
                    method: "POST"
                }
            );

        if (
            !response.ok ||
            !data?.success
        ) {
            throw new Error(
                data?.error ||
                data?.message ||
                "Unable to start live microphone."
            );
        }

        liveRecordingStartedAt =
            Date.now();

        updateLiveRecordingUI(
            true
        );

        startLiveTimer();

        startLivePolling();

        showToast(
            "Live AI microphone monitoring started.",
            "success"
        );
    } catch (error) {
        console.error(
            "Live monitoring start error:",
            error
        );

        updateLiveRecordingUI(
            false
        );

        showToast(
            error.message ||
            "Unable to start live microphone.",
            "error"
        );
    }
}


async function stopLiveRecording() {
    const stopButton =
        el("stopButton");

    if (stopButton) {
        stopButton.disabled =
            true;
    }

    try {
        const {
            response,
            data
        } =
            await fetchJSON(
                "/api/audio/stop",
                {
                    method: "POST"
                }
            );

        if (
            !response.ok ||
            data?.success === false
        ) {
            throw new Error(
                data?.error ||
                data?.message ||
                "Unable to stop live monitoring."
            );
        }

        updateLiveRecordingUI(
            false
        );

        stopLiveTimer();

        stopLivePolling();

        showToast(
            "Live microphone monitoring stopped.",
            "info"
        );
    } catch (error) {
        console.error(
            "Live monitoring stop error:",
            error
        );

        updateLiveRecordingUI(
            false
        );

        stopLiveTimer();

        stopLivePolling();

        showToast(
            error.message ||
            "Unable to stop live monitoring.",
            "error"
        );
    }
}


function updateLiveRecordingUI(
    active
) {
    const indicator =
        el("recordingIndicator");

    if (indicator) {
        indicator.classList.toggle(
            "active",
            active
        );
    }

    const micIcon =
        el("micStatusIcon");

    if (micIcon) {
        micIcon.classList.toggle(
            "active",
            active
        );
    }

    const status =
        el("recordingStatus");

    if (status) {
        status.textContent =
            active
                ? "LIVE MONITORING"
                : "READY";
    }

    const voiceStatus =
        el("voiceStatus");

    if (voiceStatus) {
        voiceStatus.textContent =
            active
                ? "Microphone monitoring active"
                : "Microphone monitoring stopped";
    }

    const startButton =
        el("startButton");

    if (startButton) {
        startButton.disabled =
            active;
    }

    const stopButton =
        el("stopButton");

    if (stopButton) {
        stopButton.disabled =
            !active;
    }

    if (!active) {
        setText(
            "audioChunk",
            "Waiting for microphone..."
        );

        stopLiveWaveform();
    } else {
        startLiveWaveform();
    }
}


/* =========================================================
   LIVE TIMER
   ========================================================= */

function startLiveTimer() {
    stopLiveTimer();

    if (!liveRecordingStartedAt) {
        liveRecordingStartedAt =
            Date.now();
    }

    liveTimerInterval =
        window.setInterval(
            () => {
                if (
                    !liveRecordingStartedAt
                ) {
                    return;
                }

                const seconds =
                    (
                        Date.now() -
                        liveRecordingStartedAt
                    ) / 1000;

                setText(
                    "recordingTimer",
                    formatDuration(
                        seconds
                    )
                );
            },
            250
        );
}


function stopLiveTimer() {
    if (
        liveTimerInterval
    ) {
        window.clearInterval(
            liveTimerInterval
        );

        liveTimerInterval =
            null;
    }
}


/* =========================================================
   LIVE WAVEFORM
   ========================================================= */

let liveWaveAnimationFrame = null;


function startLiveWaveform() {
    if (
        liveWaveAnimationFrame
    ) {
        return;
    }

    animateLiveWaveform();
}


function animateLiveWaveform() {
    const bars =
        document.querySelectorAll(
            "#waveBars span"
        );

    if (!bars.length) {
        liveWaveAnimationFrame =
            null;

        return;
    }

    const active =
        isLivePolling;

    bars.forEach(
        (bar, index) => {
            if (!active) {
                bar.style.height =
                    "20%";

                return;
            }

            const wave =
                Math.abs(
                    Math.sin(
                        Date.now() / 170 +
                        index * 0.55
                    )
                );

            const random =
                Math.random() * 0.18;

            const height =
                20 +
                (
                    wave +
                    random
                ) * 45;

            bar.style.height =
                `${Math.min(
                    85,
                    height
                )}%`;
        }
    );

    if (active) {
        liveWaveAnimationFrame =
            window.requestAnimationFrame(
                animateLiveWaveform
            );
    } else {
        liveWaveAnimationFrame =
            null;
    }
}


function stopLiveWaveform() {
    if (
        liveWaveAnimationFrame
    ) {
        window.cancelAnimationFrame(
            liveWaveAnimationFrame
        );

        liveWaveAnimationFrame =
            null;
    }

    const bars =
        document.querySelectorAll(
            "#waveBars span"
        );

    bars.forEach(
        bar => {
            bar.style.height =
                "20%";
        }
    );
}


/* =========================================================
   LIVE POLLING
   ========================================================= */

function startLivePolling() {
    if (
        isLivePolling
    ) {
        return;
    }

    isLivePolling =
        true;

    pollLatestResult();

    livePollingTimer =
        window.setInterval(
            pollLatestResult,
            800
        );

    startLiveWaveform();
}


function stopLivePolling() {
    isLivePolling =
        false;

    if (
        livePollingTimer
    ) {
        window.clearInterval(
            livePollingTimer
        );

        livePollingTimer =
            null;
    }

    stopLiveWaveform();
}


async function pollLatestResult() {
    if (
        !isLivePolling
    ) {
        return;
    }

    try {
        const {
            response,
            data
        } =
            await fetchJSON(
                "/api/latest"
            );

        if (
            !response.ok ||
            !data
        ) {
            return;
        }

        if (
            data.success === false
        ) {
            return;
        }

        const resultPayload =
            data.result ||
            data.data ||
            data;

        const result =
            normalizeResult(
                resultPayload
            );

        if (!result) {
            return;
        }

        /*
         * Only update the live dashboard when
         * this is actually a live result.
         */
        lastLiveResultId =
            result.id;

        lastAppliedResultId =
            result.id;

        updateVerdict(
            result
        );

        updateCurrentAnalysis(
            result
        );

        updateRiskPanel(
            result
        );

        updateSignalPanel(
            result
        );

        updateLastUpdate(
            result
        );

        /*
         * Do not create a history row for every
         * 3-second chunk.
         *
         * Instead maintain one aggregate
         * "Live Microphone" row.
         */
        updateLiveAuditEntry(
            result
        );
    } catch (error) {
        console.debug(
            "Live latest polling:",
            error
        );
    }
}


/* =========================================================
    1-MINUTE BROWSER RECORDING
   ========================================================= */

function getSupportedMimeType() {
    if (
        typeof MediaRecorder ===
        "undefined"
    ) {
        return "";
    }

    const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg"
    ];

    for (
        const type of candidates
    ) {
        if (
            typeof MediaRecorder.isTypeSupported ===
            "function"
        ) {
            if (
                MediaRecorder.isTypeSupported(
                    type
                )
            ) {
                return type;
            }
        }
    }

    return "";
}


async function startRecordAndScan() {
    if (
        typeof navigator ===
        "undefined" ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {
        showToast(
            "Browser microphone access is not available.",
            "error"
        );

        return;
    }

    if (
        typeof MediaRecorder ===
        "undefined"
    ) {
        showToast(
            "This browser does not support MediaRecorder.",
            "error"
        );

        return;
    }

    if (
        mediaRecorder &&
        mediaRecorder.state ===
        "recording"
    ) {
        return;
    }

    /*
     * Clean previous recording.
     */
    clearRecordedAudio(false);

    try {
        recordAudioStream =
            await navigator.mediaDevices.getUserMedia(
                {
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false
                    }
                }
            );

        recordedAudioChunks =
            [];

        const mimeType =
            getSupportedMimeType();

        recordedAudioMimeType =
            mimeType ||
            "audio/webm";

        mediaRecorder =
            mimeType
                ? new MediaRecorder(
                    recordAudioStream,
                    {
                        mimeType
                    }
                )
                : new MediaRecorder(
                    recordAudioStream
                );

        /*
         * Web Audio analyser for real waveform.
         */
        setupRecordAudioVisualizer(
            recordAudioStream
        );

        mediaRecorder.addEventListener(
            "dataavailable",
            event => {
                if (
                    event.data &&
                    event.data.size > 0
                ) {
                    recordedAudioChunks.push(
                        event.data
                    );
                }
            }
        );

        mediaRecorder.addEventListener(
            "stop",
            handleRecorderStopped,
            {
                once: true
            }
        );

        mediaRecorder.addEventListener(
            "error",
            event => {
                console.error(
                    "MediaRecorder error:",
                    event
                );

                showToast(
                    "Browser audio recording failed.",
                    "error"
                );
            }
        );

        mediaRecorder.start(
            250
        );

        recordStartedAt =
            Date.now();

        updateRecordUI(
            "recording"
        );

        setText(
            "recordScanMessage",
            "Recording microphone audio for 1 minute..."
        );

        setText(
            "recordTimer",
            "00:00"
        );

        startRecordTimer();

        startRecordWaveform();

        showToast(
            "1-minute recording started.",
            "info"
        );

        recordAutoStopTimer =
            window.setTimeout(
                () => {
                    stopRecordAndScan();
                },
                RECORD_DURATION_SECONDS * 1000
            );
    } catch (error) {
        console.error(
            "1-minute recording start error:",
            error
        );

        cleanupRecordStream();

        updateRecordUI(
            "idle"
        );

        showToast(
            error?.message ||
            "Microphone permission was denied.",
            "error"
        );
    }
}


function stopRecordAndScan() {
    if (
        recordAutoStopTimer
    ) {
        window.clearTimeout(
            recordAutoStopTimer
        );

        recordAutoStopTimer =
            null;
    }

    if (
        mediaRecorder &&
        mediaRecorder.state ===
        "recording"
    ) {
        try {
            mediaRecorder.stop();
        } catch (error) {
            console.error(
                "MediaRecorder stop error:",
                error
            );

            finalizeRecordedAudio();
        }
    }
}


function handleRecorderStopped() {
    stopRecordTimer();

    stopRecordWaveform();

    cleanupRecordVisualizer();

    cleanupRecordStream();

    finalizeRecordedAudio();
}


function startRecordTimer() {
    stopRecordTimer();

    recordTimerInterval =
        window.setInterval(
            () => {
                if (
                    !recordStartedAt
                ) {
                    return;
                }

                const elapsed =
                    (
                        Date.now() -
                        recordStartedAt
                    ) / 1000;

                const seconds =
                    Math.min(
                        RECORD_DURATION_SECONDS,
                        elapsed
                    );

                setText(
                    "recordTimer",
                    formatDuration(
                        seconds
                    )
                );

                /*
                 * Update progress.
                 */
                const percentage =
                    (
                        seconds /
                        RECORD_DURATION_SECONDS
                    ) * 100;

                const progress =
                    el("recordProgress");

                const progressBar =
                    el("recordProgressBar");

                if (progress) {
                    progress.style.width =
                        `${percentage}%`;
                }

                if (progressBar) {
                    progressBar.style.width =
                        `${percentage}%`;
                }
            },
            100
        );
}


function stopRecordTimer() {
    if (
        recordTimerInterval
    ) {
        window.clearInterval(
            recordTimerInterval
        );

        recordTimerInterval =
            null;
    }
}


/* =========================================================
   RECORDING UI
   ========================================================= */

function updateRecordUI(
    state
) {
    const startButton =
        el("recordStartButton");

    const stopButton =
        el("recordStopButton");

    const scanButton =
        el("scanRecordedAudioButton");

    const status =
        el("recordScanStatus");

    const message =
        el("recordScanMessage");

    const readyBadge =
        el("recordReadyBadge");

    if (
        state === "recording"
    ) {
        if (startButton) {
            startButton.disabled =
                true;
        }

        if (stopButton) {
            stopButton.disabled =
                false;
        }

        if (scanButton) {
            scanButton.disabled =
                true;
        }

        if (status) {
            status.classList.add(
                "recording"
            );
        }

        setText(
            "recordScanStatus",
            "RECORDING"
        );

        setText(
            "recordScanMessage",
            "Recording microphone audio..."
        );

        if (readyBadge) {
            readyBadge.classList.remove(
                "active"
            );

            setText(
                "recordReadyBadge",
                "RECORDING"
            );
        }

        return;
    }

    if (
        state === "ready"
    ) {
        if (startButton) {
            startButton.disabled =
                false;
        }

        if (stopButton) {
            stopButton.disabled =
                true;
        }

        if (scanButton) {
            scanButton.disabled =
                !recordedAudioBlob;
        }

        if (status) {
            status.classList.remove(
                "recording"
            );
        }

        setText(
            "recordScanStatus",
            "RECORDING READY"
        );

        if (readyBadge) {
            readyBadge.classList.add(
                "active"
            );

            setText(
                "recordReadyBadge",
                "READY"
            );
        }

        if (message) {
            setText(
                "recordScanMessage",
                "Recording captured. Click Scan Audio to run Wav2Vec2."
            );
        }

        return;
    }

    if (
        state === "scanning"
    ) {
        if (startButton) {
            startButton.disabled =
                true;
        }

        if (stopButton) {
            stopButton.disabled =
                true;
        }

        if (scanButton) {
            scanButton.disabled =
                true;
        }

        setText(
            "recordScanStatus",
            "SCANNING"
        );

        if (readyBadge) {
            readyBadge.classList.remove(
                "active"
            );

            setText(
                "recordReadyBadge",
                "SCANNING"
            );
        }

        if (message) {
            setText(
                "recordScanMessage",
                "Wav2Vec2 is analyzing the 1-minute recording..."
            );
        }

        return;
    }

    if (
        state === "complete"
    ) {
        if (startButton) {
            startButton.disabled =
                false;
        }

        if (stopButton) {
            stopButton.disabled =
                true;
        }

        if (scanButton) {
            scanButton.disabled =
                !recordedAudioBlob;
        }

        setText(
            "recordScanStatus",
            "SCAN COMPLETE"
        );

        if (readyBadge) {
            readyBadge.classList.add(
                "active"
            );

            setText(
                "recordReadyBadge",
                "SCAN COMPLETE"
            );
        }

        return;
    }

    /*
     * IDLE
     */
    if (startButton) {
        startButton.disabled =
            false;
    }

    if (stopButton) {
        stopButton.disabled =
            true;
    }

    if (scanButton) {
        scanButton.disabled =
            true;
    }

    if (status) {
        status.classList.remove(
            "recording"
        );
    }

    setText(
        "recordScanStatus",
        "READY"
    );

    if (readyBadge) {
        readyBadge.classList.remove(
            "active"
        );

        setText(
            "recordReadyBadge",
            "READY TO RECORD"
        );
    }

    if (message) {
        setText(
            "recordScanMessage",
            "Click Start Recording to begin."
        );
    }
}


/* =========================================================
   RECORDING WAVEFORM
   ========================================================= */

function setupRecordAudioVisualizer(
    stream
) {
    if (
        !stream ||
        typeof AudioContext ===
        "undefined" &&
        typeof webkitAudioContext ===
        "undefined"
    ) {
        return;
    }

    try {
        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContextClass) {
            return;
        }

        recordAudioContext =
            new AudioContextClass();

        recordAnalyser =
            recordAudioContext.createAnalyser();

        recordAnalyser.fftSize =
            256;

        recordAnalyser.smoothingTimeConstant =
            0.75;

        recordSourceNode =
            recordAudioContext.createMediaStreamSource(
                stream
            );

        recordSourceNode.connect(
            recordAnalyser
        );
    } catch (error) {
        console.debug(
            "Audio visualizer setup:",
            error
        );

        cleanupRecordVisualizer();
    }
}


function startRecordWaveform() {
    stopRecordWaveform();

    animateRecordWaveform();
}


function animateRecordWaveform() {
    const bars =
        document.querySelectorAll(
            "#recordWaveBars span"
        );

    if (!bars.length) {
        recordWaveAnimationFrame =
            null;

        return;
    }

    if (
        !mediaRecorder ||
        mediaRecorder.state !==
        "recording"
    ) {
        bars.forEach(
            bar => {
                bar.style.height =
                    "18%";
            }
        );

        recordWaveAnimationFrame =
            null;

        return;
    }

    let values =
        [];

    if (recordAnalyser) {
        const bufferLength =
            recordAnalyser.frequencyBinCount;

        const dataArray =
            new Uint8Array(
                bufferLength
            );

        recordAnalyser.getByteTimeDomainData(
            dataArray
        );

        const groupSize =
            Math.max(
                1,
                Math.floor(
                    dataArray.length /
                    bars.length
                )
            );

        for (
            let index = 0;
            index < bars.length;
            index++
        ) {
            let sum = 0;

            const start =
                index *
                groupSize;

            const end =
                Math.min(
                    start + groupSize,
                    dataArray.length
                );

            for (
                let i = start;
                i < end;
                i++
            ) {
                const centered =
                    (
                        dataArray[i] -
                        128
                    ) / 128;

                sum +=
                    Math.abs(
                        centered
                    );
            }

            const average =
                sum /
                Math.max(
                    1,
                    end - start
                );

            values.push(
                average
            );
        }
    } else {
        values =
            bars.map(
                (_, index) =>
                    Math.abs(
                        Math.sin(
                            Date.now() /
                            170 +
                            index *
                            0.6
                        )
                    ) * 0.6
            );
    }

    bars.forEach(
        (bar, index) => {
            const value =
                values[index] || 0;

            const height =
                18 +
                Math.min(
                    72,
                    value * 180
                );

            bar.style.height =
                `${height}%`;
        }
    );

    recordWaveAnimationFrame =
        window.requestAnimationFrame(
            animateRecordWaveform
        );
}


function stopRecordWaveform() {
    if (
        recordWaveAnimationFrame
    ) {
        window.cancelAnimationFrame(
            recordWaveAnimationFrame
        );

        recordWaveAnimationFrame =
            null;
    }

    const bars =
        document.querySelectorAll(
            "#recordWaveBars span"
        );

    bars.forEach(
        bar => {
            bar.style.height =
                "18%";
        }
    );
}


/* =========================================================
   RECORDING STREAM CLEANUP
   ========================================================= */

function cleanupRecordStream() {
    if (
        recordAudioStream
    ) {
        recordAudioStream
            .getTracks()
            .forEach(
                track => {
                    try {
                        track.stop();
                    } catch {}
                }
            );

        recordAudioStream =
            null;
    }
}


function cleanupRecordVisualizer() {
    try {
        if (
            recordSourceNode
        ) {
            recordSourceNode.disconnect();
        }
    } catch {}

    recordSourceNode =
        null;

    recordAnalyser =
        null;

    if (
        recordAudioContext
    ) {
        try {
            recordAudioContext.close();
        } catch {}
    }

    recordAudioContext =
        null;
}


/* =========================================================
    FINALIZE 1-MINUTE RECORDING
   ========================================================= */

function finalizeRecordedAudio() {
    stopRecordTimer();

    stopRecordWaveform();

    cleanupRecordVisualizer();

    cleanupRecordStream();

    if (
        recordAutoStopTimer
    ) {
        window.clearTimeout(
            recordAutoStopTimer
        );

        recordAutoStopTimer =
            null;
    }

    if (
        !recordedAudioChunks.length
    ) {
        updateRecordUI(
            "idle"
        );

        showToast(
            "No audio data was captured.",
            "error"
        );

        return;
    }

    const mimeType =
        mediaRecorder?.mimeType ||
        recordedAudioMimeType ||
        "audio/webm";

    recordedAudioMimeType =
        mimeType;

    recordedAudioBlob =
        new Blob(
            recordedAudioChunks,
            {
                type: mimeType
            }
        );

    if (
        recordedAudioUrl
    ) {
        URL.revokeObjectURL(
            recordedAudioUrl
        );
    }

    recordedAudioUrl =
        URL.createObjectURL(
            recordedAudioBlob
        );

    const preview =
        el("recordedAudioPlayer");

    if (preview) {
        preview.src =
            recordedAudioUrl;

        preview.controls =
            true;

        preview.load();
    }

    const extension =
        getAudioExtension(
            mimeType
        );

    const filename =
        `recording_60s.${extension}`;

    setText(
        "recordedFileName",
        filename
    );

    setText(
        "recordedFileMeta",
        `${formatFileSize(recordedAudioBlob.size)} • 60 seconds • ${mimeType}`
    );

    /*
     * Some HTML versions may use these older IDs.
     * Keep compatibility.
     */
    setText(
        "recordedAudioName",
        filename
    );

    setText(
        "recordedAudioMeta",
        `${formatFileSize(recordedAudioBlob.size)} • 60 seconds • ${mimeType}`
    );

    const audioPreview =
        el("recordAudioPreview");

    if (audioPreview) {
        audioPreview.classList.add(
            "active"
        );
    }

    const progress =
        el("recordProgress");

    const progressBar =
        el("recordProgressBar");

    if (progress) {
        progress.style.width =
            "100%";
    }

    if (progressBar) {
        progressBar.style.width =
            "100%";
    }

    setText(
        "recordTimer",
        "01:00"
    );

    setText(
        "recordScanMessage",
        "Recording captured successfully. Preview it and click Scan Audio."
    );

    updateRecordUI(
        "ready"
    );

    showToast(
        "1-minute recording is ready to scan.",
        "success"
    );

    /*
     * Keep recorder reference but it is no longer recording.
     */
    mediaRecorder =
        null;
}


function getAudioExtension(
    mimeType
) {
    const type =
        String(
            mimeType || ""
        ).toLowerCase();

    if (
        type.includes("ogg")
    ) {
        return "ogg";
    }

    if (
        type.includes("wav")
    ) {
        return "wav";
    }

    if (
        type.includes("mpeg") ||
        type.includes("mp3")
    ) {
        return "mp3";
    }

    return "webm";
}


/* =========================================================
   CLEAR RECORDED AUDIO
   ========================================================= */

function clearRecordedAudio(
    showMessage = true
) {
    if (
        recordAutoStopTimer
    ) {
        window.clearTimeout(
            recordAutoStopTimer
        );

        recordAutoStopTimer =
            null;
    }

    stopRecordTimer();
    stopRecordWaveform();
    cleanupRecordVisualizer();
    cleanupRecordStream();

    if (
        mediaRecorder &&
        mediaRecorder.state ===
        "recording"
    ) {
        try {
            mediaRecorder.stop();
        } catch {}
    }

    mediaRecorder =
        null;

    recordedAudioChunks =
        [];

    recordedAudioBlob =
        null;

    if (
        recordedAudioUrl
    ) {
        URL.revokeObjectURL(
            recordedAudioUrl
        );

        recordedAudioUrl =
            null;
    }

    recordedAudioMimeType =
        "";

    const player =
        el("recordedAudioPlayer");

    if (player) {
        player.pause();
        player.removeAttribute(
            "src"
        );
        player.load();
    }

    const progress =
        el("recordProgress");

    const progressBar =
        el("recordProgressBar");

    if (progress) {
        progress.style.width =
            "0%";
    }

    if (progressBar) {
        progressBar.style.width =
            "0%";
    }

    setText(
        "recordTimer",
        "00:00"
    );

    setText(
        "recordedFileName",
        ""
    );

    setText(
        "recordedFileMeta",
        ""
    );

    setText(
        "recordedAudioName",
        ""
    );

    setText(
        "recordedAudioMeta",
        ""
    );

    const preview =
        el("recordAudioPreview");

    if (preview) {
        preview.classList.remove(
            "active"
        );
    }

    updateRecordUI(
        "idle"
    );

    if (showMessage) {
        setText(
            "recordScanMessage",
            "Recording cleared."
        );
    }
}


/* =========================================================
    SCAN 1-MINUTE RECORDING
   ========================================================= */

async function scanRecordedAudio() {
    if (
        !recordedAudioBlob ||
        recordedAudioBlob.size === 0
    ) {
        showToast(
            "Record audio before scanning.",
            "error"
        );

        return;
    }

    if (isUploading) {
        return;
    }

    isUploading =
        true;

    updateRecordUI(
        "scanning"
    );

    setText(
        "recordScanMessage",
        "Uploading recording and running Wav2Vec2..."
    );

    showScanOverlay(
        "Scanning 1-minute recording..."
    );

    try {
        updateScanOverlay(
            15,
            "Preparing recorded audio..."
        );

        const extension =
            getAudioExtension(
                recordedAudioBlob.type
            );

        const filename =
            `recording_60s.${extension}`;

        const formData =
            new FormData();

        /*
         * IMPORTANT:
         * Current Flask backend exposes
         * /api/audio/upload.
         *
         * There is no need for /api/audio/recorded.
         */
        formData.append(
            "audio",
            recordedAudioBlob,
            filename
        );

        updateScanOverlay(
            35,
            "Sending recording to CyberShield..."
        );

        const {
            response,
            data
        } =
            await fetchJSON(
                "/api/audio/upload",
                {
                    method: "POST",
                    body: formData
                }
            );

        updateScanOverlay(
            65,
            "Running Wav2Vec2 detector..."
        );

        if (
            !response.ok
        ) {
            throw new Error(
                data?.error ||
                data?.message ||
                `Recording scan failed with status ${response.status}.`
            );
        }

        if (
            data &&
            data.success === false
        ) {
            throw new Error(
                data.error ||
                data.message ||
                "Recording scan failed."
            );
        }

        updateScanOverlay(
            85,
            "Calculating authenticity risk..."
        );

        const resultPayload =
            data?.result ||
            data?.data ||
            data;

        const result =
            normalizeResult(
                resultPayload
            );

        if (!result) {
            throw new Error(
                "No valid detection result returned by backend."
            );
        }

        /*
         * Override metadata so audit trail
         * clearly identifies this as 1-minute
         * browser recording.
         */
        result.media_type =
            "Audio";

        result.filename =
            filename;

        result.source =
            "1-Minute Recording";

        updateScanOverlay(
            95,
            "Updating forensic dashboard..."
        );

        applyResult(
            result,
            {
                addToHistory: true,
                source: "recorded"
            }
        );

        /*
         * Show dedicated 15-sec result if
         * those elements exist in HTML.
         */
        updateRecordedAudioResult(
            result
        );

        setText(
            "recordScanMessage",
            `${result.prediction} detected with ${formatPercentage(result.confidence)} confidence.`
        );

        updateRecordUI(
            "complete"
        );

        updateScanOverlay(
            100,
            "Recording scan complete."
        );

        showToast(
            `1-minute audio: ${result.prediction}`,
            result.prediction === "FAKE"
                ? "error"
                : "success"
        );

        window.setTimeout(
            hideScanOverlay,
            700
        );
    } catch (error) {
        console.error(
            "Recorded audio scan error:",
            error
        );

        updateRecordUI(
            "ready"
        );

        setText(
            "recordScanMessage",
            error?.message ||
            "Unable to scan recording."
        );

        showToast(
            error?.message ||
            "Recording scan failed.",
            "error"
        );

        hideScanOverlay();
    } finally {
        isUploading =
            false;
    }
}


/* =========================================================
    1-MINUTE RESULT PANEL
   ========================================================= */

function updateRecordedAudioResult(
    result
) {
    setText(
        "recordResultPrediction",
        result.prediction
    );

    setText(
        "recordResultConfidence",
        formatPercentage(
            result.confidence
        )
    );

    setText(
        "recordResultReal",
        formatPercentage(
            result.real
        )
    );

    setText(
        "recordResultFake",
        formatPercentage(
            result.fake
        )
    );

    setText(
        "recordResultRisk",
        `${formatPercentage(result.risk)} ${result.risk_level}`
    );

    const resultPanel =
        el("recordScanResult");

    if (resultPanel) {
        resultPanel.classList.add(
            "active"
        );

        resultPanel.classList.remove(
            "real",
            "fake"
        );

        resultPanel.classList.add(
            result.prediction.toLowerCase()
        );
    }
}


/* =========================================================
   APPLY RESULT
   ========================================================= */

function applyResult(
    result,
    options = {}
) {
    const normalized =
        normalizeResult(
            result
        );

    if (!normalized) {
        return;
    }

    updateVerdict(
        normalized
    );

    updateCurrentAnalysis(
        normalized
    );

    updateRiskPanel(
        normalized
    );

    updateSignalPanel(
        normalized
    );

    if (
        options.addToHistory
    ) {
        addHistoryEntry(
            {
                ...normalized,
                source:
                    options.source ||
                    normalized.source
            }
        );
    }

    updateAnalytics();

    updateLastUpdate(
        normalized
    );

    /*
     * Dedicated result panel for 15-sec
     * recording.
     */
    if (
        options.source === "recorded"
    ) {
        updateRecordedAudioResult(
            normalized
        );
    }
}


/* =========================================================
   LIVE VERDICT
   ========================================================= */

function updateVerdict(
    result
) {
    setText(
        "confidenceValue",
        formatPercentage(
            result.confidence
        )
    );

    setText(
        "liveDetectionResult",
        result.prediction
    );

    setText(
        "liveDetectionMessage",
        getDetectionMessage(
            result
        )
    );

    setText(
        "realProbability",
        formatPercentage(
            result.real
        )
    );

    setText(
        "fakeProbability",
        formatPercentage(
            result.fake
        )
    );

    const realBar =
        el("realBar");

    if (realBar) {
        realBar.style.width =
            `${result.real}%`;
    }

    const fakeBar =
        el("fakeBar");

    if (fakeBar) {
        fakeBar.style.width =
            `${result.fake}%`;
    }

    const ring =
        el("verdictRing");

    if (ring) {
        ring.style.setProperty(
            "--verdict-progress",
            `${result.confidence}%`
        );

        ring.classList.remove(
            "real",
            "fake"
        );

        ring.classList.add(
            result.prediction.toLowerCase()
        );
    }

    const chunkText =
        result.chunk
            ? `Latest chunk: ${result.chunk}`
            : `${result.media_type} analysis`;

    setText(
        "audioChunk",
        chunkText
    );

    const resultNode =
        el("liveDetectionResult");

    if (resultNode) {
        resultNode.classList.remove(
            "real",
            "fake"
        );

        resultNode.classList.add(
            result.prediction.toLowerCase()
        );
    }
}


function getDetectionMessage(
    result
) {
    if (
        result.prediction ===
        "FAKE"
    ) {
        return "Synthetic or manipulated media characteristics detected.";
    }

    return "The detector currently identifies the analyzed media as authentic.";
}


/* =========================================================
   CURRENT ANALYSIS
   ========================================================= */

function updateCurrentAnalysis(
    result
) {
    setText(
        "detectionResult",
        result.prediction
    );

    setText(
        "detectionMessage",
        getDetectionMessage(
            result
        )
    );

    setText(
        "analysisMediaType",
        result.media_type
    );

    setText(
        "analysisConfidence",
        formatPercentage(
            result.confidence
        )
    );

    setText(
        "analysisRisk",
        formatPercentage(
            result.risk
        )
    );

    setText(
        "analysisModel",
        result.model
    );

    const resultIcon =
        el("resultIcon");

    if (resultIcon) {
        resultIcon.classList.remove(
            "real",
            "fake"
        );

        resultIcon.classList.add(
            result.prediction.toLowerCase()
        );
    }

    setText(
        "processingStatus",
        "ANALYSIS COMPLETE"
    );
}


/* =========================================================
   RISK PANEL
   ========================================================= */

function updateRiskPanel(
    result
) {
    setText(
        "riskValue",
        formatPercentage(
            result.risk
        )
    );

    setText(
        "riskLevel",
        result.risk_level
    );

    setText(
        "riskMessage",
        getRiskMessage(
            result
        )
    );

    const circle =
        el("riskCircle");

    if (circle) {
        circle.classList.remove(
            "low",
            "medium",
            "high"
        );

        circle.classList.add(
            result.risk_level.toLowerCase()
        );

        circle.style.setProperty(
            "--risk-progress",
            `${result.risk}%`
        );
    }
}


function getRiskMessage(
    result
) {
    if (
        result.risk_level ===
        "HIGH"
    ) {
        return "High-risk media detected. Secondary verification is recommended.";
    }

    if (
        result.risk_level ===
        "MEDIUM"
    ) {
        return "Suspicious characteristics detected. Additional verification is recommended.";
    }

    return "Low detected manipulation risk.";
}


/* =========================================================
   AI SIGNAL PANEL
   ========================================================= */

function updateSignalPanel(
    result
) {
    setText(
        "signalModel",
        result.model
    );

    setText(
        "signalClassification",
        result.prediction
    );

    setText(
        "signalConfidence",
        formatPercentage(
            result.confidence
        )
    );

    let inferenceText =
        result.source;

    if (
        result.inference !== null &&
        result.inference !== undefined &&
        result.inference !== ""
    ) {
        inferenceText =
            `${result.source} • ${result.inference} ms`;
    }

    setText(
        "signalInference",
        inferenceText
    );
}


/* =========================================================
   HISTORY STORAGE
   ========================================================= */

function saveHistoryToStorage() {
    try {
        localStorage.setItem(
            HISTORY_STORAGE_KEY,
            JSON.stringify(
                scanHistory.slice(
                    0,
                    200
                )
            )
        );
    } catch (error) {
        console.debug(
            "History localStorage save:",
            error
        );
    }
}


function loadHistoryFromStorage() {
    try {
        const raw =
            localStorage.getItem(
                HISTORY_STORAGE_KEY
            );

        if (!raw) {
            return [];
        }

        const parsed =
            JSON.parse(
                raw
            );

        if (
            !Array.isArray(parsed)
        ) {
            return [];
        }

        return parsed
            .map(
                item =>
                    normalizeResult(
                        item
                    )
            )
            .filter(
                Boolean
            )
            .map(
                createHistoryEntry
            );
    } catch (error) {
        console.debug(
            "History localStorage load:",
            error
        );

        return [];
    }
}


/* =========================================================
   HISTORY ENTRY
   ========================================================= */

function createHistoryEntry(
    result
) {
    return {
        id:
            String(
                result.id
            ),

        timestamp:
            result.timestamp ||
            new Date().toISOString(),

        media_type:
            result.media_type ||
            "Audio",

        filename:
            result.filename ||
            "Unknown",

        prediction:
            result.prediction ||
            "REAL",

        confidence:
            toPercentage(
                result.confidence
            ),

        real:
            toPercentage(
                result.real
            ),

        fake:
            toPercentage(
                result.fake
            ),

        risk:
            toPercentage(
                result.risk
            ),

        risk_level:
            result.risk_level ||
            calculateRiskLevel(
                result.risk
            ),

        model:
            result.model ||
            "AI Detector",

        source:
            result.source ||
            "Unknown"
    };
}


function addHistoryEntry(
    result
) {
    const normalized =
        normalizeResult(
            result
        );

    if (!normalized) {
        return;
    }

    /*
     * Live chunks are aggregated.
     */
    if (
        normalized.source ===
        "Live Microphone" ||
        (
            normalized.media_type ===
            "Audio" &&
            String(
                normalized.filename
            ).startsWith(
                "chunk_"
            )
        )
    ) {
        updateLiveAuditEntry(
            normalized
        );

        return;
    }

    const entry =
        createHistoryEntry(
            normalized
        );

    const duplicate =
        scanHistory.some(
            item =>
                item.id ===
                entry.id
        );

    if (duplicate) {
        return;
    }

    scanHistory.unshift(
        entry
    );

    if (
        scanHistory.length > 200
    ) {
        scanHistory =
            scanHistory.slice(
                0,
                200
            );
    }

    saveHistoryToStorage();

    renderHistory();

    updateAnalytics();
}


/* =========================================================
   LIVE AGGREGATED HISTORY
   ========================================================= */

function updateLiveAuditEntry(
    result
) {
    const normalized =
        normalizeResult(
            result
        );

    if (!normalized) {
        return;
    }

    const liveId =
        "live-microphone-aggregate";

    if (
        !latestLiveAuditEntry
    ) {
        latestLiveAuditEntry = {
            id: liveId,

            timestamp:
                normalized.timestamp ||
                new Date().toISOString(),

            media_type: "Audio",

            filename:
                "Live Microphone",

            prediction:
                normalized.prediction,

            confidence:
                normalized.confidence,

            real:
                normalized.real,

            fake:
                normalized.fake,

            risk:
                normalized.risk,

            risk_level:
                normalized.risk_level,

            model:
                normalized.model,

            source:
                "Live Microphone"
        };

        scanHistory.unshift(
            latestLiveAuditEntry
        );
    } else {
        latestLiveAuditEntry.timestamp =
            normalized.timestamp ||
            new Date().toISOString();

        latestLiveAuditEntry.prediction =
            normalized.prediction;

        latestLiveAuditEntry.confidence =
            normalized.confidence;

        latestLiveAuditEntry.real =
            normalized.real;

        latestLiveAuditEntry.fake =
            normalized.fake;

        latestLiveAuditEntry.risk =
            normalized.risk;

        latestLiveAuditEntry.risk_level =
            normalized.risk_level;

        latestLiveAuditEntry.model =
            normalized.model;
    }

    /*
     * Keep the aggregate entry at top.
     */
    scanHistory =
        scanHistory.filter(
            item =>
                item.id !==
                liveId
        );

    scanHistory.unshift(
        latestLiveAuditEntry
    );

    scanHistory =
        scanHistory.slice(
            0,
            200
        );

    saveHistoryToStorage();

    renderHistory();

    updateAnalytics();
}


/* =========================================================
   RENDER HISTORY
   ========================================================= */

function renderHistory() {
    const body =
        el("historyBody");

    if (!body) {
        return;
    }

    const searchInput =
        el("historySearch");

    const filterInput =
        el("historyFilter");

    const search =
        String(
            searchInput?.value ||
            ""
        )
            .trim()
            .toLowerCase();

    const filter =
        String(
            filterInput?.value ||
            "all"
        )
            .trim()
            .toLowerCase();

    const filtered =
        scanHistory.filter(
            item => {
                const searchable =
                    [
                        item.media_type,
                        item.filename,
                        item.prediction,
                        item.model,
                        item.source,
                        item.risk_level
                    ]
                        .join(" ")
                        .toLowerCase();

                const matchesSearch =
                    !search ||
                    searchable.includes(
                        search
                    );

                let matchesFilter =
                    true;

                if (
                    filter ===
                    "real"
                ) {
                    matchesFilter =
                        item.prediction ===
                        "REAL";
                }

                if (
                    filter ===
                    "fake"
                ) {
                    matchesFilter =
                        item.prediction ===
                        "FAKE";
                }

                if (
                    filter ===
                    "audio"
                ) {
                    matchesFilter =
                        String(
                            item.media_type
                        ).toLowerCase() ===
                        "audio";
                }

                if (
                    filter ===
                    "video"
                ) {
                    matchesFilter =
                        String(
                            item.media_type
                        ).toLowerCase() ===
                        "video";
                }

                if (
                    filter ===
                    "image"
                ) {
                    matchesFilter =
                        String(
                            item.media_type
                        ).toLowerCase() ===
                        "image";
                }

                return (
                    matchesSearch &&
                    matchesFilter
                );
            }
        );

    body.innerHTML =
        "";

    if (
        filtered.length === 0
    ) {
        const row =
            document.createElement(
                "tr"
            );

        const cell =
            document.createElement(
                "td"
            );

        cell.colSpan =
            6;

        cell.className =
            "history-empty";

        cell.textContent =
            "No audit records available.";

        row.appendChild(
            cell
        );

        body.appendChild(
            row
        );

        return;
    }

    filtered.forEach(
        item => {
            const row =
                document.createElement(
                    "tr"
                );

            /*
             * TIME
             */
            const timeCell =
                document.createElement(
                    "td"
                );

            timeCell.textContent =
                formatTime(
                    item.timestamp
                );

            /*
             * MEDIA
             */
            const mediaCell =
                document.createElement(
                    "td"
                );

            mediaCell.textContent =
                item.media_type;

            /*
             * RESULT
             */
            const resultCell =
                document.createElement(
                    "td"
                );

            const resultBadge =
                document.createElement(
                    "span"
                );

            resultBadge.className =
                `history-result ${String(
                    item.prediction
                ).toLowerCase()}`;

            resultBadge.textContent =
                item.prediction;

            resultCell.appendChild(
                resultBadge
            );

            /*
             * CONFIDENCE
             */
            const confidenceCell =
                document.createElement(
                    "td"
                );

            confidenceCell.textContent =
                formatPercentage(
                    item.confidence
                );

            /*
             * RISK
             */
            const riskCell =
                document.createElement(
                    "td"
                );

            const riskBadge =
                document.createElement(
                    "span"
                );

            riskBadge.className =
                `history-risk ${String(
                    item.risk_level
                ).toLowerCase()}`;

            riskBadge.textContent =
                `${formatPercentage(
                    item.risk
                )} ${item.risk_level}`;

            riskCell.appendChild(
                riskBadge
            );

            /*
             * MODEL
             */
            const modelCell =
                document.createElement(
                    "td"
                );

            modelCell.textContent =
                item.model;

            row.appendChild(
                timeCell
            );

            row.appendChild(
                mediaCell
            );

            row.appendChild(
                resultCell
            );

            row.appendChild(
                confidenceCell
            );

            row.appendChild(
                riskCell
            );

            row.appendChild(
                modelCell
            );

            body.appendChild(
                row
            );
        }
    );
}


/* =========================================================
   LOAD HISTORY
   ========================================================= */

async function loadHistory() {
    /*
     * Start with local history.
     * This ensures dashboard history works even
     * when /api/history does not exist.
     */
    const localHistory =
        loadHistoryFromStorage();

    if (
        localHistory.length
    ) {
        scanHistory =
            localHistory;

        const live =
            scanHistory.find(
                item =>
                    item.id ===
                    "live-microphone-aggregate"
            );

        if (live) {
            latestLiveAuditEntry =
                live;
        }
    }

    renderHistory();

    updateAnalytics();

    /*
     * Try backend history if available.
     * Failure is intentionally ignored.
     */
    try {
        const {
            response,
            data
        } =
            await fetchJSON(
                "/api/history"
            );

        if (
            !response.ok ||
            !data ||
            data.success === false
        ) {
            return false;
        }

        const backendHistory =
            Array.isArray(
                data.history
            )
                ? data.history
                : [];

        const normalizedBackend =
            backendHistory
                .map(
                    item =>
                        normalizeResult(
                            item
                        )
                )
                .filter(
                    Boolean
                )
                .map(
                    createHistoryEntry
                );

        /*
         * Merge backend and local history
         * without duplicates.
         */
        const merged = [
            ...normalizedBackend,
            ...scanHistory
        ];

        const unique =
            new Map();

        merged.forEach(
            item => {
                if (
                    !unique.has(
                        item.id
                    )
                ) {
                    unique.set(
                        item.id,
                        item
                    );
                }
            }
        );

        scanHistory =
            Array.from(
                unique.values()
            )
                .sort(
                    (
                        a,
                        b
                    ) =>
                        new Date(
                            b.timestamp
                        ) -
                        new Date(
                            a.timestamp
                        )
                )
                .slice(
                    0,
                    200
                );

        const liveEntry =
            scanHistory.find(
                item =>
                    item.id ===
                    "live-microphone-aggregate"
            );

        latestLiveAuditEntry =
            liveEntry ||
            null;

        saveHistoryToStorage();

        renderHistory();

        updateAnalytics();

        return true;
    } catch (error) {
        console.debug(
            "Backend history unavailable:",
            error
        );

        return false;
    }
}


async function refreshHistory() {
    const button =
        el("refreshHistoryButton");

    if (button) {
        button.disabled = true;
        button.classList.add("loading");
        button.textContent = "↻ Refreshing...";
    }

    try {
        const refreshed =
            await loadHistory();

        showToast(
            refreshed
                ? "History refreshed."
                : "Backend history is unavailable. Showing local history.",
            refreshed
                ? "success"
                : "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
            button.classList.remove("loading");
            button.textContent = "↻ Refresh";
        }
    }
}


/* =========================================================
   HISTORY CONTROLS
   ========================================================= */

function setupHistoryControls() {
    const search =
        el("historySearch");

    const filter =
        el("historyFilter");

    const refresh =
        el("refreshHistoryButton");

    if (search) {
        search.addEventListener(
            "input",
            renderHistory
        );
    }

    if (filter) {
        filter.addEventListener(
            "change",
            renderHistory
        );
    }

    if (refresh) {
        refresh.addEventListener(
            "click",
            refreshHistory
        );
    }
}


/* =========================================================
   CLEAR HISTORY
   ========================================================= */

async function clearHistory() {
    const confirmed =
        window.confirm(
            "Clear the CyberShield audit trail?"
        );

    if (!confirmed) {
        return;
    }

    /*
     * Try backend clear.
     * It may not exist in current backend.
     */
    let backendCleared = false;

    try {
        const {
            response,
            data
        } = await fetchJSON(
            "/api/history/clear",
            {
                method: "POST"
            }
        );

        if (
            !response.ok ||
            data?.success === false
        ) {
            throw new Error(
                data?.message ||
                "Backend history reset failed."
            );
        }

        backendCleared = true;
    } catch (error) {
        console.debug(
            "Backend history clear:",
            error
        );
    }

    /*
     * Try existing audio reset endpoint.
     */
    try {
        await fetchJSON(
            "/api/audio/reset",
            {
                method: "POST"
            }
        );
    } catch (error) {
        console.debug(
            "Audio reset:",
            error
        );
    }

    scanHistory =
        [];

    latestLiveAuditEntry =
        null;

    try {
        localStorage.removeItem(
            HISTORY_STORAGE_KEY
        );
    } catch {}

    renderHistory();

    updateAnalytics();

    showToast(
        backendCleared
            ? "All history and latest result cleared."
            : "Local history cleared, but backend reset was unavailable.",
        backendCleared
            ? "success"
            : "error"
    );
}


/* =========================================================
   CSV EXPORT
   ========================================================= */

function escapeCSV(
    value
) {
    const text =
        String(
            value ?? ""
        );

    return `"${text.replace(
        /"/g,
        '""'
    )}"`;
}


function exportHistory() {
    if (
        scanHistory.length === 0
    ) {
        showToast(
            "No audit records to export.",
            "error"
        );

        return;
    }

    const header = [
        "TIME",
        "MEDIA",
        "RESULT",
        "CONFIDENCE",
        "REAL_PROBABILITY",
        "FAKE_PROBABILITY",
        "RISK",
        "RISK_LEVEL",
        "MODEL",
        "SOURCE",
        "FILE"
    ];

    const rows =
        scanHistory.map(
            item => [
                formatDateTime(
                    item.timestamp
                ),
                item.media_type,
                item.prediction,
                formatPercentage(
                    item.confidence
                ),
                formatPercentage(
                    item.real
                ),
                formatPercentage(
                    item.fake
                ),
                formatPercentage(
                    item.risk
                ),
                item.risk_level,
                item.model,
                item.source,
                item.filename
            ]
        );

    const csv =
        [
            header,
            ...rows
        ]
            .map(
                row =>
                    row
                        .map(
                            escapeCSV
                        )
                        .join(",")
            )
            .join("\n");

    const blob =
        new Blob(
            [csv],
            {
                type:
                    "text/csv;charset=utf-8;"
            }
        );

    const url =
        URL.createObjectURL(
            blob
        );

    const link =
        document.createElement(
            "a"
        );

    link.href =
        url;

    link.download =
        `cybershield_audit_${new Date()
            .toISOString()
            .slice(
                0,
                19
            )
            .replace(
                /[:T]/g,
                "-"
            )}.csv`;

    document.body.appendChild(
        link
    );

    link.click();

    link.remove();

    URL.revokeObjectURL(
        url
    );

    showToast(
        "Audit trail exported.",
        "success"
    );
}


/* =========================================================
   ANALYTICS
   ========================================================= */

function updateAnalytics() {
    const total =
        scanHistory.length;

    const real =
        scanHistory.filter(
            item =>
                item.prediction ===
                "REAL"
        ).length;

    const fake =
        scanHistory.filter(
            item =>
                item.prediction ===
                "FAKE"
        ).length;

    const audio =
        scanHistory.filter(
            item =>
                String(
                    item.media_type
                ).toLowerCase() ===
                "audio"
        ).length;

    const video =
        scanHistory.filter(
            item =>
                String(
                    item.media_type
                ).toLowerCase() ===
                "video"
        ).length;

    const image =
        scanHistory.filter(
            item =>
                String(
                    item.media_type
                ).toLowerCase() ===
                "image"
        ).length;

    const suspicious =
        scanHistory.filter(
            item =>
                item.risk_level ===
                "MEDIUM"
        ).length;

    setText(
        "totalScans",
        total
    );

    setText(
        "analyticsTotal",
        total
    );

    setText(
        "realMedia",
        real
    );

    setText(
        "analyticsReal",
        real
    );

    setText(
        "fakeMedia",
        fake
    );

    setText(
        "suspiciousMedia",
        suspicious
    );

    setText(
        "audioScanCount",
        audio
    );

    setText(
        "videoScanCount",
        video
    );

    setText(
        "imageScanCount",
        image
    );

    setText(
        "distributionReal",
        `${real} REAL`
    );

    setText(
        "distributionFake",
        `${fake} FAKE`
    );

    const distributionTotal =
        real + fake;

    const realPercentage =
        distributionTotal > 0
            ? (
                real /
                distributionTotal
            ) * 100
            : 0;

    const fakePercentage =
        distributionTotal > 0
            ? (
                fake /
                distributionTotal
            ) * 100
            : 0;

    const chart =
        el("distributionChart");

    if (chart) {
        chart.style.setProperty(
            "--real-share",
            `${realPercentage}%`
        );

        chart.style.setProperty(
            "--fake-share",
            `${fakePercentage}%`
        );
    }
}


/* =========================================================
   INITIAL DASHBOARD STATE
   ========================================================= */

function setInitialDashboardState() {
    setText(
        "liveDetectionResult",
        "WAITING"
    );

    setText(
        "confidenceValue",
        "--"
    );

    setText(
        "realProbability",
        "--"
    );

    setText(
        "fakeProbability",
        "--"
    );

    setText(
        "audioChunk",
        "Waiting for microphone..."
    );

    setText(
        "detectionResult",
        "WAITING"
    );

    setText(
        "detectionMessage",
        "Start live monitoring or scan media to begin analysis."
    );

    setText(
        "analysisMediaType",
        "--"
    );

    setText(
        "analysisConfidence",
        "--"
    );

    setText(
        "analysisRisk",
        "--"
    );

    setText(
        "analysisModel",
        "--"
    );

    setText(
        "riskValue",
        "--"
    );

    setText(
        "riskLevel",
        "WAITING"
    );

    setText(
        "riskMessage",
        "No active threat assessment."
    );

    setText(
        "signalModel",
        "--"
    );

    setText(
        "signalClassification",
        "--"
    );

    setText(
        "signalConfidence",
        "--"
    );

    setText(
        "signalInference",
        "--"
    );

    setText(
        "recordTimer",
        "00:00"
    );

    setText(
        "recordScanStatus",
        "READY"
    );

    setText(
        "recordScanMessage",
        "Click Start Recording to begin."
    );

    setText(
        "recordedFileName",
        ""
    );

    setText(
        "recordedFileMeta",
        ""
    );

    setText(
        "recordResultPrediction",
        "--"
    );

    setText(
        "recordResultConfidence",
        "--"
    );

    setText(
        "recordResultReal",
        "--"
    );

    setText(
        "recordResultFake",
        "--"
    );

    setText(
        "recordResultRisk",
        "--"
    );
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {
    const links =
        document.querySelectorAll(
            ".nav-item[href^='#'], .sidebar a[href^='#']"
        );

    if (!links.length) {
        return;
    }

    links.forEach(
        link => {
            link.addEventListener(
                "click",
                event => {
                    const href =
                        link.getAttribute(
                            "href"
                        );

                    if (
                        !href ||
                        href === "#"
                    ) {
                        return;
                    }

                    const target =
                        document.querySelector(
                            href
                        );

                    if (target) {
                        event.preventDefault();

                        target.scrollIntoView(
                            {
                                behavior:
                                    "smooth",
                                block:
                                    "start"
                            }
                        );
                    }

                    links.forEach(
                        item =>
                            item.classList.remove(
                                "active"
                            )
                    );

                    link.classList.add(
                        "active"
                    );
                }
            );
        }
    );

    const sections =
        document.querySelectorAll(
            "section[id], main section[id]"
        );

    if (
        !(
            "IntersectionObserver" in
            window
        ) ||
        !sections.length
    ) {
        return;
    }

    const observer =
        new IntersectionObserver(
            entries => {
                entries.forEach(
                    entry => {
                        if (
                            !entry.isIntersecting
                        ) {
                            return;
                        }

                        const id =
                            entry.target.id;

                        links.forEach(
                            link => {
                                const target =
                                    link.getAttribute(
                                        "href"
                                    );

                                link.classList.toggle(
                                    "active",
                                    target ===
                                    `#${id}`
                                );
                            }
                        );
                    }
                );
            },
            {
                rootMargin:
                    "-20% 0px -65% 0px"
            }
        );

    sections.forEach(
        section =>
            observer.observe(
                section
            )
    );
}


/* =========================================================
   SCAN MODE
   ========================================================= */

function setupScanModes() {
    const buttons =
        document.querySelectorAll(
            ".mode-option"
        );

    buttons.forEach(
        button => {
            button.addEventListener(
                "click",
                () => {
                    buttons.forEach(
                        item =>
                            item.classList.remove(
                                "active"
                            )
                    );

                    button.classList.add(
                        "active"
                    );

                    selectedScanMode =
                        button.dataset.mode ||
                        "standard";
                }
            );
        }
    );

    /*
     * Pick active mode from HTML on load.
     */
    const active =
        document.querySelector(
            ".mode-option.active"
        );

    if (active) {
        selectedScanMode =
            active.dataset.mode ||
            "standard";
    }
}


/* =========================================================
   SENSITIVITY
   ========================================================= */

function setupSensitivity() {
    const slider =
        el("sensitivitySlider");

    if (!slider) {
        return;
    }

    sensitivityValue =
        clamp(
            slider.value,
            0,
            100
        );

    setText(
        "sensitivityValue",
        `${sensitivityValue}%`
    );

    slider.addEventListener(
        "input",
        () => {
            sensitivityValue =
                clamp(
                    slider.value,
                    0,
                    100
                );

            setText(
                "sensitivityValue",
                `${sensitivityValue}%`
            );
        }
    );
}


/* =========================================================
   AUTO SCAN
   ========================================================= */

function setupAutoScan() {
    const toggle =
        el("autoScanToggle");

    if (!toggle) {
        return;
    }

    autoScanEnabled =
        Boolean(
            toggle.checked
        );

    toggle.addEventListener(
        "change",
        () => {
            autoScanEnabled =
                Boolean(
                    toggle.checked
                );
        }
    );
}


/* =========================================================
   SYSTEM HEALTH
   ========================================================= */

async function checkSystemHealth() {
    try {
        const {
            response,
            data
        } =
            await fetchJSON(
                "/api/health"
            );

        if (
            !response.ok
        ) {
            throw new Error(
                "Health endpoint unavailable."
            );
        }

        /*
         * Different backend versions may return
         * slightly different health structures.
         */
        const healthy =
            data?.success !== false &&
            data?.healthy !== false &&
            data?.status !== "error";

        setSystemStatus(
            "audioSystemStatus",
            healthy
        );

        setSystemStatus(
            "videoSystemStatus",
            healthy
        );

        setSystemStatus(
            "imageSystemStatus",
            healthy
        );

        setSystemStatus(
            "riskStatus",
            healthy
        );

        setSystemStatus(
            "inferenceStatus",
            healthy
        );

        setSystemStatus(
            "featureStatus",
            healthy
        );

        setText(
            "riskStatusText",
            healthy
                ? "Risk engine operational"
                : "Risk engine unavailable"
        );
    } catch (error) {
        console.debug(
            "System health:",
            error
        );

        [
            "audioSystemStatus",
            "videoSystemStatus",
            "imageSystemStatus",
            "riskStatus",
            "inferenceStatus",
            "featureStatus"
        ].forEach(
            id =>
                setSystemStatus(
                    id,
                    false
                )
        );

        setText(
            "riskStatusText",
            "System health check unavailable"
        );
    }
}


function setSystemStatus(
    id,
    healthy
) {
    const node =
        el(id);

    if (!node) {
        return;
    }

    node.classList.remove(
        "online",
        "offline",
        "healthy",
        "error"
    );

    node.classList.add(
        healthy
            ? "online"
            : "offline"
    );

    node.textContent =
        healthy
            ? "ONLINE"
            : "OFFLINE";
}


/* =========================================================
   LAST UPDATE
   ========================================================= */

function updateLastUpdate(
    result
) {
    const timestamp =
        result?.timestamp ||
        new Date();

    const nodes =
        document.querySelectorAll(
            "[data-last-update], #lastUpdate"
        );

    nodes.forEach(
        node => {
            node.textContent =
                `Last update: ${formatTime(
                    timestamp
                )}`;
        }
    );
}


/* =========================================================
   DASHBOARD CLOCK
   ========================================================= */

function startDashboardClock() {
    const clock =
        el("headerClock");

    if (!clock) {
        return;
    }

    if (
        dashboardClockTimer
    ) {
        window.clearInterval(
            dashboardClockTimer
        );
    }

    const update =
        () => {
            clock.textContent =
                new Date().toLocaleTimeString(
                    [],
                    {
                        hour:
                            "2-digit",
                        minute:
                            "2-digit",
                        second:
                            "2-digit"
                    }
                );
        };

    update();

    dashboardClockTimer =
        window.setInterval(
            update,
            1000
        );
}


/* =========================================================
   BUTTON SETUP
   ========================================================= */

function setupButtons() {
    const startButton =
        el("startButton");

    if (startButton) {
        startButton.addEventListener(
            "click",
            startLiveRecording
        );
    }

    const stopButton =
        el("stopButton");

    if (stopButton) {
        stopButton.addEventListener(
            "click",
            stopLiveRecording
        );

        stopButton.disabled =
            true;
    }

    const scanButton =
        el("startScanButton");

    if (scanButton) {
        scanButton.addEventListener(
            "click",
            startMediaScan
        );
    }

    const audioScanButton =
        el("scanAudioButton");

    if (audioScanButton) {
        audioScanButton.addEventListener(
            "click",
            scanSelectedAudio
        );
    }

    const removeButton =
        el("removeSelectedFile");

    if (removeButton) {
        removeButton.addEventListener(
            "click",
            clearSelectedFile
        );
    }

    const clearButton =
        el("clearHistoryButton");

    if (clearButton) {
        clearButton.addEventListener(
            "click",
            clearHistory
        );
    }

    const exportButton =
        el("exportHistoryButton");

    if (exportButton) {
        exportButton.addEventListener(
            "click",
            exportHistory
        );
    }

    /*
    * 1-minute recording
     */
    const recordStartButton =
        el("recordStartButton");

    if (recordStartButton) {
        recordStartButton.addEventListener(
            "click",
            startRecordAndScan
        );
    }

    const recordStopButton =
        el("recordStopButton");

    if (recordStopButton) {
        recordStopButton.addEventListener(
            "click",
            stopRecordAndScan
        );

        recordStopButton.disabled =
            true;
    }

    /*
     * IMPORTANT:
     * Current HTML uses scanRecordedAudioButton.
     */
    const scanRecordedButton =
        el("scanRecordedAudioButton");

    if (scanRecordedButton) {
        scanRecordedButton.addEventListener(
            "click",
            scanRecordedAudio
        );

        scanRecordedButton.disabled =
            true;
    }
}


/* =========================================================
   FILE INPUT SETUP
   ========================================================= */

function setupFileInputs() {
    setupFileInput(
        "audioFile",
        "audioUploadButton",
        "Audio",
        ".wav,.mp3,.m4a,.ogg,.flac,.webm,audio/*"
    );

    setupFileInput(
        "videoFile",
        "videoUploadButton",
        "Video",
        ".mp4,.avi,.mov,.mkv,.webm,video/*"
    );

    setupFileInput(
        "imageFile",
        "imageUploadButton",
        "Image",
        ".jpg,.jpeg,.png,.webp,.bmp,image/*"
    );
}


/* =========================================================
   AUDIO STATUS
   ========================================================= */

async function checkAudioStatus() {
    try {
        const {
            response,
            data
        } =
            await fetchJSON(
                "/api/audio/status"
            );

        if (
            !response.ok ||
            !data
        ) {
            return;
        }

        const active =
            Boolean(
                data.recording ??
                data.recording_active ??
                data.active ??
                false
            );

        updateLiveRecordingUI(
            active
        );

        if (active) {
            if (
                !liveRecordingStartedAt
            ) {
                liveRecordingStartedAt =
                    Date.now();
            }

            startLiveTimer();
            startLivePolling();
        }
    } catch (error) {
        console.debug(
            "Audio status:",
            error
        );
    }
}


/* =========================================================
   KEYBOARD / ACCESSIBILITY
   ========================================================= */

function setupKeyboardShortcuts() {
    document.addEventListener(
        "keydown",
        event => {
            /*
             * Do not interfere with input fields.
             */
            const tag =
                event.target?.tagName;

            if (
                tag === "INPUT" ||
                tag === "TEXTAREA" ||
                tag === "SELECT"
            ) {
                return;
            }

            /*
             * Space = start/stop live monitor.
             */
            if (
                event.code ===
                "Space"
            ) {
                event.preventDefault();

                const active =
                    isLivePolling;

                if (active) {
                    stopLiveRecording();
                } else {
                    startLiveRecording();
                }
            }
        }
    );
}


/* =========================================================
   CLEANUP
   ========================================================= */

function cleanupDashboard() {
    stopLiveTimer();
    stopLivePolling();

    stopRecordTimer();
    stopRecordWaveform();

    if (
        recordAutoStopTimer
    ) {
        window.clearTimeout(
            recordAutoStopTimer
        );

        recordAutoStopTimer =
            null;
    }

    cleanupRecordVisualizer();
    cleanupRecordStream();

    if (
        dashboardClockTimer
    ) {
        window.clearInterval(
            dashboardClockTimer
        );

        dashboardClockTimer =
            null;
    }

    if (
        healthTimer
    ) {
        window.clearInterval(
            healthTimer
        );

        healthTimer =
            null;
    }

    if (
        recordedAudioUrl
    ) {
        URL.revokeObjectURL(
            recordedAudioUrl
        );

        recordedAudioUrl =
            null;
    }

    if (
        mediaRecorder &&
        mediaRecorder.state ===
        "recording"
    ) {
        try {
            mediaRecorder.stop();
        } catch {}
    }

    mediaRecorder =
        null;
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function initializeDashboard() {
    if (isInitialized) {
        return;
    }

    isInitialized =
        true;

    console.log(
        "CyberShield dashboard initializing..."
    );

    setInitialDashboardState();

    setupFileInputs();

    setupDropZone();

    setupButtons();

    setupNavigation();

    setupScanModes();

    setupSensitivity();

    setupAutoScan();

    setupHistoryControls();

    setupKeyboardShortcuts();

    updateRecordUI(
        "idle"
    );

    setAudioScanStatus(
        "idle",
        "Audio Scanner Ready",
        "Select an audio file to begin."
    );

    await loadHistory();

    await checkAudioStatus();

    await checkSystemHealth();

    /*
     * Only poll latest if the backend already
     * reports active live monitoring.
     */
    if (isLivePolling) {
        await pollLatestResult();
    }

    startDashboardClock();

    /*
     * Health refresh every 15 seconds.
     */
    healthTimer =
        window.setInterval(
            checkSystemHealth,
            15000
        );

    console.log(
        "CyberShield dashboard ready."
    );
}


/* =========================================================
   PAGE LOAD
   ========================================================= */

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initializeDashboard,
        {
            once: true
        }
    );
} else {
    initializeDashboard();
}


/* =========================================================
   PAGE CLEANUP
   ========================================================= */

window.addEventListener(
    "beforeunload",
    () => {
        cleanupDashboard();
    }
);