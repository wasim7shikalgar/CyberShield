"use strict";

/* =========================================================
   CYBERSHIELD - DASHBOARD SCRIPT
   =========================================================
   FEATURES
   ---------------------------------------------------------
   1. Browser live microphone monitoring
      - PCM16 mono stream at 16 kHz over WebSocket
      - /ws/audio/<call_id>
      - /api/latest

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

let liveAudioStream = null;
let liveAudioContext = null;
let liveAudioSource = null;
let liveAudioProcessor = null;
let liveAudioMuteGain = null;
let liveAudioSocket = null;
let activeLiveCallId = "";
let liveCaptureChunks = [];
let liveCaptureSamples = 0;
const LIVE_CAPTURE_MAX_SECONDS = 120;

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
const LANGUAGE_STORAGE_KEY = "cybershield_language";

const RECORD_DURATION_SECONDS = 60;

const LANGUAGE_TRANSLATIONS = {
    hi: {
        "Language": "भाषा",
        "AI SECURITY PLATFORM": "एआई सुरक्षा प्लेटफ़ॉर्म",
        "COMMAND CENTER": "नियंत्रण केंद्र",
        "SECURITY MODE": "सुरक्षा मोड",
        "Overview": "अवलोकन",
        "Media Scanner": "मीडिया स्कैनर",
        "Live Detection": "लाइव पहचान",
        "Record & Scan": "रिकॉर्ड करें और स्कैन करें",
        "Analytics": "विश्लेषण",
        "Scan History": "स्कैन इतिहास",
        "System Status": "सिस्टम स्थिति",
        "AI Protection": "एआई सुरक्षा",
        "Active": "सक्रिय",
        "Threat Engine": "खतरा पहचान प्रणाली",
        "AI Models": "एआई मॉडल",
        "Detection Node 01": "पहचान नोड 01",
        "AI CYBERSECURITY COMMAND CENTER": "एआई साइबर सुरक्षा नियंत्रण केंद्र",
        "Deepfake Threat Detection": "डीपफेक खतरा पहचान",
        "Multimodal AI analysis for audio, video and image authenticity.": "ऑडियो, वीडियो और छवि की प्रामाणिकता के लिए मल्टीमॉडल एआई विश्लेषण।",
        "System Online": "सिस्टम ऑनलाइन",
        "Waiting for telemetry...": "टेलीमेट्री की प्रतीक्षा...",
        "OVERVIEW": "अवलोकन",
        "Security Overview": "सुरक्षा अवलोकन",
        "LIVE MONITORING": "लाइव निगरानी",
        "TOTAL SCANS": "कुल स्कैन",
        "AUTHENTIC MEDIA": "प्रामाणिक मीडिया",
        "SUSPICIOUS": "संदिग्ध",
        "THREATS DETECTED": "पहचाने गए खतरे",
        "Session activity": "सत्र गतिविधि",
        "Verified as real": "असली के रूप में सत्यापित",
        "Requires attention": "ध्यान देने की आवश्यकता",
        "AI flagged media": "एआई द्वारा चिह्नित मीडिया",
        "MULTIMODAL SCANNER": "मल्टीमॉडल स्कैनर",
        "Analyze Media": "मीडिया का विश्लेषण करें",
        "AI ENGINE READY": "एआई इंजन तैयार",
        "Media Input": "मीडिया इनपुट",
        "Select or drop media for analysis": "विश्लेषण के लिए मीडिया चुनें या यहाँ छोड़ें",
        "Audio": "ऑडियो",
        "Voice / Call Recording": "आवाज़ / कॉल रिकॉर्डिंग",
        "Video": "वीडियो",
        "Face / Deepfake Analysis": "चेहरा / डीपफेक विश्लेषण",
        "Image": "छवि",
        "Face / Synthetic Media": "चेहरा / कृत्रिम मीडिया",
        "Upload": "अपलोड करें",
        "Drop your media here": "अपना मीडिया यहाँ छोड़ें",
        "or choose Audio, Video or Image above": "या ऊपर ऑडियो, वीडियो अथवा छवि चुनें",
        "🔒 Files are processed by CyberShield AI": "🔒 फ़ाइलों को CyberShield AI द्वारा संसाधित किया जाता है",
        "No file selected": "कोई फ़ाइल नहीं चुनी गई",
        "Remove selected media file": "चयनित मीडिया फ़ाइल हटाएँ",
        "Remove selected file": "चयनित फ़ाइल हटाएँ",
        "Detection Configuration": "पहचान कॉन्फ़िगरेशन",
        "Configure analysis behaviour": "विश्लेषण का तरीका सेट करें",
        "Scan Mode": "स्कैन मोड",
        "Analysis depth": "विश्लेषण की गहराई",
        "Quick": "त्वरित",
        "Fast scan": "तेज़ स्कैन",
        "Standard": "मानक",
        "Balanced": "संतुलित",
        "Deep": "गहन",
        "Maximum": "अधिकतम",
        "Detection Sensitivity": "पहचान संवेदनशीलता",
        "High": "उच्च",
        "Strict": "कड़ा",
        "Automatic Analysis": "स्वचालित विश्लेषण",
        "Start analysis when supported media is selected": "समर्थित मीडिया चुनते ही विश्लेषण शुरू करें",
        "Start AI Analysis": "एआई विश्लेषण शुरू करें",
        "AI inference engine": "एआई अनुमान इंजन",
        "REAL-TIME AUDIO INTELLIGENCE": "रीयल-टाइम ऑडियो विश्लेषण",
        "Live Threat Monitor": "लाइव खतरा निगरानी",
        "STANDBY": "प्रतीक्षा में",
        "Microphone standby": "माइक्रोफ़ोन प्रतीक्षा में",
        "Start Live Detection": "लाइव पहचान शुरू करें",
        "Stop": "रोकें",
        "Download exact detector input (WAV)": "डिटेक्टर का मूल इनपुट डाउनलोड करें (WAV)",
        "Optional debug capture: up to 120 seconds, stored only in this browser.": "वैकल्पिक डिबग रिकॉर्डिंग: अधिकतम 120 सेकंड, केवल इसी ब्राउज़र में संग्रहित।",
        "STATUS": "स्थिति",
        "LATEST CHUNK": "नवीनतम भाग",
        "SAMPLE RATE": "सैंपल दर",
        "MODEL": "मॉडल",
        "AI Verdict": "एआई का निष्कर्ष",
        "Latest voice analysis": "नवीनतम आवाज़ विश्लेषण",
        "CONFIDENCE": "विश्वास स्तर",
        "CURRENT CLASSIFICATION": "वर्तमान वर्गीकरण",
        "Start live detection to begin AI analysis.": "एआई विश्लेषण शुरू करने के लिए लाइव पहचान चालू करें।",
        "Real Probability": "असली होने की संभावना",
        "Fake Probability": "नकली होने की संभावना",
        "ANALYSIS": "विश्लेषण",
        "Audio Activity": "ऑडियो गतिविधि",
        "Speech Activity": "वाक् गतिविधि",
        "Risk Level": "जोखिम स्तर",
        "ANALYTICS": "विश्लेषण",
        "Detection Analytics": "पहचान विश्लेषिकी",
        "Media Activity": "मीडिया गतिविधि",
        "Detection pipeline usage": "पहचान प्रक्रिया का उपयोग",
        "AUDIT TRAIL": "ऑडिट रिकॉर्ड",
        "Search scans...": "स्कैन खोजें...",
        "All Results": "सभी परिणाम",
        "Real": "असली",
        "Fake": "नकली",
        "↻ Refresh": "↻ रीफ़्रेश",
        "Refresh scan history": "स्कैन इतिहास रीफ़्रेश करें",
        "↓ Export": "↓ निर्यात",
        "Clear": "साफ़ करें",
        "TIME": "समय",
        "MEDIA": "मीडिया",
        "RESULT": "परिणाम",
        "CONFIDENCE": "विश्वास स्तर",
        "RISK": "जोखिम",
        "MODEL": "मॉडल",
        "No active analysis.": "कोई सक्रिय विश्लेषण नहीं।",
        "Media Type": "मीडिया प्रकार",
        "Confidence": "विश्वास स्तर",
        "AI Model": "एआई मॉडल",
        "THREAT ASSESSMENT": "खतरे का आकलन",
        "Fraud Risk Score": "धोखाधड़ी जोखिम स्कोर",
        "RISK ENGINE": "जोखिम इंजन",
        "CURRENT RISK": "वर्तमान जोखिम",
        "No immediate threat detected.": "कोई तात्कालिक खतरा नहीं मिला।",
        "LOW": "कम",
        "MEDIUM": "मध्यम",
        "HIGH": "उच्च",
        "MODEL TELEMETRY": "मॉडल टेलीमेट्री",
        "AI Analysis Signals": "एआई विश्लेषण संकेत",
        "● TELEMETRY LIVE": "● टेलीमेट्री लाइव",
        "Inference Model": "अनुमान मॉडल",
        "Classification": "वर्गीकरण",
        "Inference Status": "अनुमान स्थिति",
        "INFERENCE ENGINE": "अनुमान इंजन",
        "RISK ENGINE": "जोखिम इंजन",
        "Multimodal Deepfake Detection Platform": "मल्टीमॉडल डीपफेक पहचान प्लेटफ़ॉर्म",
        "System health check unavailable": "सिस्टम स्वास्थ्य जाँच उपलब्ध नहीं",
        "Select an audio, video, or image file first.": "पहले ऑडियो, वीडियो या छवि फ़ाइल चुनें।",
        "Unsupported media type.": "असमर्थित मीडिया प्रकार।",
        "Preparing media...": "मीडिया तैयार किया जा रहा है...",
        "Uploading media...": "मीडिया अपलोड हो रहा है...",
        "Running AI detector...": "एआई डिटेक्टर चल रहा है...",
        "Calculating authenticity risk...": "प्रामाणिकता जोखिम की गणना हो रही है...",
        "Updating forensic dashboard...": "फॉरेंसिक डैशबोर्ड अपडेट हो रहा है...",
        "Analysis complete.": "विश्लेषण पूरा हुआ।",
        "Scan Complete": "स्कैन पूरा हुआ",
        "Scan Failed": "स्कैन विफल",
        "Unable to analyze audio.": "ऑडियो का विश्लेषण नहीं हो सका।",
        "Media scan failed.": "मीडिया स्कैन विफल हुआ।",
        "Audio Scanner Ready": "ऑडियो स्कैनर तैयार",
        "Select an audio file to begin.": "शुरू करने के लिए ऑडियो फ़ाइल चुनें।",
        "No audio selected": "कोई ऑडियो नहीं चुना गया",
        "Ready to scan": "स्कैन के लिए तैयार",
        "Click Scan Audio to analyze this file.": "इस फ़ाइल का विश्लेषण करने के लिए ऑडियो स्कैन पर क्लिक करें।",
        "The selected file is too large.": "चयनित फ़ाइल बहुत बड़ी है।",
        "Microphone access requires HTTPS or localhost. Open this app at http://localhost:7860, or use an HTTPS URL.": "माइक्रोफ़ोन के लिए HTTPS या localhost ज़रूरी है। यह ऐप http://localhost:7860 पर खोलें या HTTPS URL इस्तेमाल करें।",
        "This browser does not support MediaRecorder.": "यह ब्राउज़र MediaRecorder का समर्थन नहीं करता।",
        "This browser does not support live audio processing.": "यह ब्राउज़र लाइव ऑडियो प्रोसेसिंग का समर्थन नहीं करता।",
        "Could not connect to the live detector. Confirm Flask-Sock is available and restart the Flask server.": "लाइव डिटेक्टर से कनेक्शन नहीं हो सका। Flask-Sock उपलब्ध होने की पुष्टि करें और Flask सर्वर फिर शुरू करें।",
        "Use HTTPS or localhost to enable the microphone.": "माइक्रोफ़ोन चालू करने के लिए HTTPS या localhost इस्तेमाल करें।",
        "Your browser microphone is streaming to the live AI detector.": "आपके ब्राउज़र का माइक्रोफ़ोन लाइव एआई डिटेक्टर को ऑडियो भेज रहा है।",
        "Audio status:": "ऑडियो स्थिति:",
        "Download exact detector input (WAV)": "डिटेक्टर का मूल इनपुट डाउनलोड करें (WAV)",
        "FORENSIC AUDIO SCAN": "फॉरेंसिक ऑडियो स्कैन",
        "Record & Scan": "रिकॉर्ड करें और स्कैन करें",
        "Record a 1-minute voice sample and analyze it as one complete audio file.": "एक मिनट का आवाज़ नमूना रिकॉर्ड करें और पूरी ऑडियो फ़ाइल का विश्लेषण करें।",
        "RECORDING STATUS": "रिकॉर्डिंग स्थिति",
        "Click Start Recording to capture a 1-minute sample.": "एक मिनट का नमूना रिकॉर्ड करने के लिए रिकॉर्डिंग शुरू करें पर क्लिक करें।",
        "AUDIO CAPTURE": "ऑडियो रिकॉर्डिंग",
        "Start Recording": "रिकॉर्डिंग शुरू करें",
        "RECORDED AUDIO": "रिकॉर्ड किया गया ऑडियो",
        "NOT READY": "तैयार नहीं",
        "No recording yet": "अभी कोई रिकॉर्डिंग नहीं",
        "Record 1 minute to create an audio sample.": "ऑडियो नमूना बनाने के लिए एक मिनट रिकॉर्ड करें।",
        "No scan activity yet": "अभी कोई स्कैन गतिविधि नहीं",
        "Start a live detection or upload supported media.": "लाइव पहचान शुरू करें या समर्थित मीडिया अपलोड करें।",
        "BLOCKCHAIN": "ब्लॉकचेन",
        "INFRASTRUCTURE": "बुनियादी ढाँचा",
        "Audio Detection": "ऑडियो पहचान",
        "Video Detection": "वीडियो पहचान",
        "Image Detection": "छवि पहचान",
        "Threat Scoring": "खतरा स्कोरिंग",
        "API STATUS": "एपीआई स्थिति",
        "CONNECTING": "कनेक्ट हो रहा है",
        "NODE": "नोड",
        "SECURITY INTELLIGENCE": "सुरक्षा जानकारी",
        "Detection Distribution": "पहचान का वितरण",
        "Current session": "वर्तमान सत्र",
        "scans": "स्कैन",
        "Search": "खोजें",
        "Filter": "फ़िल्टर",
        "Export": "निर्यात",
        "Scan Audio": "ऑडियो स्कैन करें",
        "Recording complete": "रिकॉर्डिंग पूरी हुई",
        "Permission denied": "अनुमति अस्वीकृत",
        "Microphone access was denied.": "माइक्रोफ़ोन की अनुमति नहीं मिली।",
        "Live detection started.": "लाइव पहचान शुरू हुई।",
        "Live detection stopped.": "लाइव पहचान रुक गई।",
        "Could not start recording.": "रिकॉर्डिंग शुरू नहीं हो सकी।",
        "Could not stop recording.": "रिकॉर्डिंग बंद नहीं हो सकी।",
        "Please select a file.": "कृपया फ़ाइल चुनें।",
        "Please wait for the current scan to finish.": "वर्तमान स्कैन पूरा होने तक प्रतीक्षा करें।",
        "History cleared.": "इतिहास साफ़ किया गया।",
        "Failed to clear history.": "इतिहास साफ़ नहीं हो सका।",
        "Failed to load scan history.": "स्कैन इतिहास लोड नहीं हो सका।",
        "Audio scan complete.": "ऑडियो स्कैन पूरा हुआ।",
        "Image scan complete.": "छवि स्कैन पूरा हुआ।",
        "Video scan complete.": "वीडियो स्कैन पूरा हुआ।",
        "Audio scan failed.": "ऑडियो स्कैन विफल हुआ।",
        "Image scan failed.": "छवि स्कैन विफल हुआ।",
        "Video scan failed.": "वीडियो स्कैन विफल हुआ।",
        "ONLINE": "ऑनलाइन",
        "READY": "तैयार",
        "WAITING": "प्रतीक्षा में",
        "LIVE": "लाइव",
        "ACTIVE": "सक्रिय",
        "IDLE": "निष्क्रिय",
        "UNAVAILABLE": "उपलब्ध नहीं",
        "OPERATIONAL": "कार्यरत",
        "REAL": "असली",
        "FAKE": "नकली",
        "LATEST EVENT": "नवीनतम घटना",
        "DETECTION RESULT": "पहचान परिणाम",
        "Current Analysis": "वर्तमान विश्लेषण",
        "FORENSIC RESULT": "फॉरेंसिक परिणाम",
        "Scan Recorded Audio": "रिकॉर्ड किया गया ऑडियो स्कैन करें",
        "No scan activity yet": "अभी कोई स्कैन गतिविधि नहीं",
        "Start a live detection or upload supported media.": "लाइव पहचान शुरू करें या समर्थित मीडिया अपलोड करें।",
        "INFRASTRUCTURE": "बुनियादी ढाँचा",
        "Audio Detection": "ऑडियो पहचान",
        "Video Detection": "वीडियो पहचान",
        "Image Detection": "छवि पहचान",
        "Threat Scoring": "खतरा स्कोरिंग",
        "API STATUS": "एपीआई स्थिति",
        "SECURITY INTELLIGENCE": "सुरक्षा जानकारी",
        "Detection Distribution": "पहचान का वितरण",
        "Current session": "वर्तमान सत्र",
        "scans": "स्कैन",
        "HASH-CHAIN LEDGER CHECKING...": "हैश-चेन लेज़र की जाँच हो रही है...",
        "HASH-CHAIN LEDGER VALID": "हैश-चेन लेज़र सही है",
        "HASH-CHAIN LEDGER INVALID": "हैश-चेन लेज़र अमान्य है",
        "BLOCKS": "ब्लॉक"
    },
    mr: {
        "Language": "भाषा",
        "AI SECURITY PLATFORM": "एआय सुरक्षा प्लॅटफॉर्म",
        "COMMAND CENTER": "नियंत्रण केंद्र",
        "SECURITY MODE": "सुरक्षा मोड",
        "Overview": "आढावा",
        "Media Scanner": "मीडिया स्कॅनर",
        "Live Detection": "थेट शोध",
        "Record & Scan": "रेकॉर्ड करा आणि स्कॅन करा",
        "Analytics": "विश्लेषण",
        "Scan History": "स्कॅन इतिहास",
        "System Status": "प्रणाली स्थिती",
        "AI Protection": "एआय संरक्षण",
        "Active": "सक्रिय",
        "Threat Engine": "धोका शोध प्रणाली",
        "AI Models": "एआय मॉडेल्स",
        "Detection Node 01": "शोध नोड 01",
        "AI CYBERSECURITY COMMAND CENTER": "एआय सायबर सुरक्षा नियंत्रण केंद्र",
        "Deepfake Threat Detection": "डीपफेक धोका शोध",
        "Multimodal AI analysis for audio, video and image authenticity.": "ऑडिओ, व्हिडिओ आणि प्रतिमेच्या सत्यतेसाठी मल्टिमोडल एआय विश्लेषण.",
        "System Online": "प्रणाली ऑनलाइन",
        "Waiting for telemetry...": "टेलीमेट्रीची प्रतीक्षा...",
        "OVERVIEW": "आढावा",
        "Security Overview": "सुरक्षा आढावा",
        "LIVE MONITORING": "थेट निरीक्षण",
        "TOTAL SCANS": "एकूण स्कॅन",
        "AUTHENTIC MEDIA": "प्रामाणिक मीडिया",
        "SUSPICIOUS": "संशयास्पद",
        "THREATS DETECTED": "आढळलेले धोके",
        "Session activity": "सत्रातील हालचाल",
        "Verified as real": "खरे असल्याची पडताळणी",
        "Requires attention": "लक्ष देणे आवश्यक",
        "AI flagged media": "एआयने चिन्हांकित केलेले मीडिया",
        "MULTIMODAL SCANNER": "मल्टिमोडल स्कॅनर",
        "Analyze Media": "मीडियाचे विश्लेषण करा",
        "AI ENGINE READY": "एआय इंजिन तयार",
        "Media Input": "मीडिया इनपुट",
        "Select or drop media for analysis": "विश्लेषणासाठी मीडिया निवडा किंवा येथे सोडा",
        "Audio": "ऑडिओ",
        "Voice / Call Recording": "आवाज / कॉल रेकॉर्डिंग",
        "Video": "व्हिडिओ",
        "Face / Deepfake Analysis": "चेहरा / डीपफेक विश्लेषण",
        "Image": "प्रतिमा",
        "Face / Synthetic Media": "चेहरा / कृत्रिम मीडिया",
        "Upload": "अपलोड करा",
        "Drop your media here": "तुमचे मीडिया येथे सोडा",
        "or choose Audio, Video or Image above": "किंवा वरून ऑडिओ, व्हिडिओ अथवा प्रतिमा निवडा",
        "🔒 Files are processed by CyberShield AI": "🔒 फाइल्सवर CyberShield AI प्रक्रिया करते",
        "No file selected": "कोणतीही फाइल निवडलेली नाही",
        "Remove selected media file": "निवडलेली मीडिया फाइल काढा",
        "Remove selected file": "निवडलेली फाइल काढा",
        "Detection Configuration": "शोध संरचना",
        "Configure analysis behaviour": "विश्लेषणाची पद्धत ठरवा",
        "Scan Mode": "स्कॅन मोड",
        "Analysis depth": "विश्लेषणाची खोली",
        "Quick": "जलद",
        "Fast scan": "जलद स्कॅन",
        "Standard": "मानक",
        "Balanced": "संतुलित",
        "Deep": "सखोल",
        "Maximum": "कमाल",
        "Detection Sensitivity": "शोध संवेदनशीलता",
        "High": "उच्च",
        "Strict": "कठोर",
        "Automatic Analysis": "स्वयंचलित विश्लेषण",
        "Start analysis when supported media is selected": "समर्थित मीडिया निवडल्यावर विश्लेषण सुरू करा",
        "Start AI Analysis": "एआय विश्लेषण सुरू करा",
        "AI inference engine": "एआय अनुमान इंजिन",
        "REAL-TIME AUDIO INTELLIGENCE": "रिअल-टाइम ऑडिओ विश्लेषण",
        "Live Threat Monitor": "थेट धोका निरीक्षण",
        "STANDBY": "प्रतीक्षेत",
        "Microphone standby": "मायक्रोफोन प्रतीक्षेत",
        "Start Live Detection": "थेट शोध सुरू करा",
        "Stop": "थांबवा",
        "Download exact detector input (WAV)": "डिटेक्टरचा मूळ इनपुट डाउनलोड करा (WAV)",
        "Optional debug capture: up to 120 seconds, stored only in this browser.": "ऐच्छिक डीबग रेकॉर्डिंग: कमाल 120 सेकंद, फक्त याच ब्राउझरमध्ये साठवले जाते.",
        "STATUS": "स्थिती",
        "LATEST CHUNK": "नवीनतम भाग",
        "SAMPLE RATE": "नमुना दर",
        "MODEL": "मॉडेल",
        "AI Verdict": "एआयचा निष्कर्ष",
        "Latest voice analysis": "नवीनतम आवाज विश्लेषण",
        "CONFIDENCE": "विश्वास पातळी",
        "CURRENT CLASSIFICATION": "सध्याचे वर्गीकरण",
        "Start live detection to begin AI analysis.": "एआय विश्लेषण सुरू करण्यासाठी थेट शोध सुरू करा.",
        "Real Probability": "खरे असण्याची शक्यता",
        "Fake Probability": "बनावट असण्याची शक्यता",
        "ANALYSIS": "विश्लेषण",
        "Audio Activity": "ऑडिओ हालचाल",
        "Speech Activity": "वाणी हालचाल",
        "Risk Level": "धोका पातळी",
        "ANALYTICS": "विश्लेषण",
        "Detection Analytics": "शोध विश्लेषण",
        "Media Activity": "मीडिया हालचाल",
        "Detection pipeline usage": "शोध प्रक्रियेचा वापर",
        "AUDIT TRAIL": "ऑडिट नोंद",
        "Search scans...": "स्कॅन शोधा...",
        "All Results": "सर्व निकाल",
        "Real": "खरे",
        "Fake": "बनावट",
        "↻ Refresh": "↻ पुन्हा लोड करा",
        "Refresh scan history": "स्कॅन इतिहास पुन्हा लोड करा",
        "↓ Export": "↓ निर्यात",
        "Clear": "पुसून टाका",
        "TIME": "वेळ",
        "MEDIA": "मीडिया",
        "RESULT": "निकाल",
        "RISK": "धोका",
        "No active analysis.": "सध्या कोणतेही विश्लेषण सुरू नाही.",
        "Media Type": "मीडिया प्रकार",
        "Confidence": "विश्वास पातळी",
        "AI Model": "एआय मॉडेल",
        "THREAT ASSESSMENT": "धोका मूल्यांकन",
        "Fraud Risk Score": "फसवणूक धोका गुण",
        "RISK ENGINE": "धोका इंजिन",
        "CURRENT RISK": "सध्याचा धोका",
        "No immediate threat detected.": "तातडीचा धोका आढळला नाही.",
        "LOW": "कमी",
        "MEDIUM": "मध्यम",
        "HIGH": "उच्च",
        "MODEL TELEMETRY": "मॉडेल टेलीमेट्री",
        "AI Analysis Signals": "एआय विश्लेषण संकेत",
        "● TELEMETRY LIVE": "● टेलीमेट्री सुरू",
        "Inference Model": "अनुमान मॉडेल",
        "Classification": "वर्गीकरण",
        "Inference Status": "अनुमान स्थिती",
        "INFERENCE ENGINE": "अनुमान इंजिन",
        "Multimodal Deepfake Detection Platform": "मल्टिमोडल डीपफेक शोध प्लॅटफॉर्म",
        "System health check unavailable": "प्रणाली आरोग्य तपासणी उपलब्ध नाही",
        "Select an audio, video, or image file first.": "प्रथम ऑडिओ, व्हिडिओ किंवा प्रतिमा फाइल निवडा.",
        "Unsupported media type.": "असमर्थित मीडिया प्रकार.",
        "Preparing media...": "मीडिया तयार करत आहे...",
        "Uploading media...": "मीडिया अपलोड होत आहे...",
        "Running AI detector...": "एआय डिटेक्टर सुरू आहे...",
        "Calculating authenticity risk...": "सत्यता धोक्याची गणना होत आहे...",
        "Updating forensic dashboard...": "फॉरेन्सिक डॅशबोर्ड अद्ययावत होत आहे...",
        "Analysis complete.": "विश्लेषण पूर्ण झाले.",
        "Scan Complete": "स्कॅन पूर्ण",
        "Scan Failed": "स्कॅन अयशस्वी",
        "Unable to analyze audio.": "ऑडिओचे विश्लेषण करता आले नाही.",
        "Media scan failed.": "मीडिया स्कॅन अयशस्वी.",
        "Audio Scanner Ready": "ऑडिओ स्कॅनर तयार",
        "Select an audio file to begin.": "सुरू करण्यासाठी ऑडिओ फाइल निवडा.",
        "No audio selected": "ऑडिओ निवडलेला नाही",
        "Ready to scan": "स्कॅनसाठी तयार",
        "Click Scan Audio to analyze this file.": "या फाइलचे विश्लेषण करण्यासाठी ऑडिओ स्कॅनवर क्लिक करा.",
        "The selected file is too large.": "निवडलेली फाइल खूप मोठी आहे.",
        "Microphone access requires HTTPS or localhost. Open this app at http://localhost:7860, or use an HTTPS URL.": "मायक्रोफोनसाठी HTTPS किंवा localhost आवश्यक आहे. हे अॅप http://localhost:7860 येथे उघडा किंवा HTTPS URL वापरा.",
        "This browser does not support MediaRecorder.": "हा ब्राउझर MediaRecorder ला समर्थन देत नाही.",
        "This browser does not support live audio processing.": "हा ब्राउझर थेट ऑडिओ प्रक्रियेला समर्थन देत नाही.",
        "Could not connect to the live detector. Confirm Flask-Sock is available and restart the Flask server.": "थेट डिटेक्टरशी जोडता आले नाही. Flask-Sock उपलब्ध असल्याची खात्री करून Flask सर्व्हर पुन्हा सुरू करा.",
        "Use HTTPS or localhost to enable the microphone.": "मायक्रोफोन सुरू करण्यासाठी HTTPS किंवा localhost वापरा.",
        "Your browser microphone is streaming to the live AI detector.": "तुमच्या ब्राउझरचा मायक्रोफोन थेट एआय डिटेक्टरकडे ऑडिओ पाठवत आहे.",
        "FORENSIC AUDIO SCAN": "फॉरेन्सिक ऑडिओ स्कॅन",
        "Record & Scan": "रेकॉर्ड करा आणि स्कॅन करा",
        "Record a 1-minute voice sample and analyze it as one complete audio file.": "एक मिनिटाचा आवाज नमुना रेकॉर्ड करा आणि संपूर्ण ऑडिओ फाइलचे विश्लेषण करा.",
        "RECORDING STATUS": "रेकॉर्डिंग स्थिती",
        "Click Start Recording to capture a 1-minute sample.": "एक मिनिटाचा नमुना रेकॉर्ड करण्यासाठी रेकॉर्डिंग सुरू करा वर क्लिक करा.",
        "AUDIO CAPTURE": "ऑडिओ रेकॉर्डिंग",
        "Start Recording": "रेकॉर्डिंग सुरू करा",
        "RECORDED AUDIO": "रेकॉर्ड केलेला ऑडिओ",
        "NOT READY": "तयार नाही",
        "No recording yet": "अद्याप रेकॉर्डिंग नाही",
        "Record 1 minute to create an audio sample.": "ऑडिओ नमुना तयार करण्यासाठी एक मिनिट रेकॉर्ड करा.",
        "No scan activity yet": "अद्याप स्कॅन गतिविधी नाही",
        "Start a live detection or upload supported media.": "थेट शोध सुरू करा किंवा समर्थित मीडिया अपलोड करा.",
        "BLOCKCHAIN": "ब्लॉकचेन",
        "INFRASTRUCTURE": "पायाभूत सुविधा",
        "Audio Detection": "ऑडिओ शोध",
        "Video Detection": "व्हिडिओ शोध",
        "Image Detection": "प्रतिमा शोध",
        "Threat Scoring": "धोका गुणांकन",
        "API STATUS": "एपीआय स्थिती",
        "CONNECTING": "जोडत आहे",
        "NODE": "नोड",
        "SECURITY INTELLIGENCE": "सुरक्षा माहिती",
        "Detection Distribution": "शोध वितरण",
        "Current session": "सध्याचे सत्र",
        "scans": "स्कॅन",
        "Search": "शोधा",
        "Filter": "फिल्टर",
        "Export": "निर्यात",
        "Scan Audio": "ऑडिओ स्कॅन करा",
        "Recording complete": "रेकॉर्डिंग पूर्ण",
        "Permission denied": "परवानगी नाकारली",
        "Microphone access was denied.": "मायक्रोफोनची परवानगी नाकारली गेली.",
        "Live detection started.": "थेट शोध सुरू झाला.",
        "Live detection stopped.": "थेट शोध थांबला.",
        "Could not start recording.": "रेकॉर्डिंग सुरू करता आले नाही.",
        "Could not stop recording.": "रेकॉर्डिंग थांबवता आले नाही.",
        "Please select a file.": "कृपया फाइल निवडा.",
        "Please wait for the current scan to finish.": "सध्याचा स्कॅन पूर्ण होईपर्यंत प्रतीक्षा करा.",
        "History cleared.": "इतिहास पुसून टाकला.",
        "Failed to clear history.": "इतिहास पुसता आला नाही.",
        "Failed to load scan history.": "स्कॅन इतिहास लोड करता आला नाही.",
        "Audio scan complete.": "ऑडिओ स्कॅन पूर्ण.",
        "Image scan complete.": "प्रतिमा स्कॅन पूर्ण.",
        "Video scan complete.": "व्हिडिओ स्कॅन पूर्ण.",
        "Audio scan failed.": "ऑडिओ स्कॅन अयशस्वी.",
        "Image scan failed.": "प्रतिमा स्कॅन अयशस्वी.",
        "Video scan failed.": "व्हिडिओ स्कॅन अयशस्वी.",
        "ONLINE": "ऑनलाइन",
        "READY": "तयार",
        "WAITING": "प्रतीक्षेत",
        "LIVE": "थेट",
        "ACTIVE": "सक्रिय",
        "IDLE": "निष्क्रिय",
        "UNAVAILABLE": "उपलब्ध नाही",
        "OPERATIONAL": "कार्यरत",
        "REAL": "खरे",
        "FAKE": "बनावट",
        "LATEST EVENT": "नवीनतम घटना",
        "DETECTION RESULT": "शोध निकाल",
        "Current Analysis": "सध्याचे विश्लेषण",
        "FORENSIC RESULT": "फॉरेन्सिक निकाल",
        "Scan Recorded Audio": "रेकॉर्ड केलेला ऑडिओ स्कॅन करा",
        "INFRASTRUCTURE": "पायाभूत सुविधा",
        "Audio Detection": "ऑडिओ शोध",
        "Video Detection": "व्हिडिओ शोध",
        "Image Detection": "प्रतिमा शोध",
        "Threat Scoring": "धोका गुणांकन",
        "API STATUS": "एपीआय स्थिती",
        "SECURITY INTELLIGENCE": "सुरक्षा माहिती",
        "Detection Distribution": "शोध वितरण",
        "Current session": "सध्याचे सत्र",
        "scans": "स्कॅन",
        "HASH-CHAIN LEDGER CHECKING...": "हॅश-चेन लेजर तपासत आहे...",
        "HASH-CHAIN LEDGER VALID": "हॅश-चेन लेजर वैध",
        "HASH-CHAIN LEDGER INVALID": "हॅश-चेन लेजर अवैध",
        "BLOCKS": "ब्लॉक्स"
    }
};

let currentLanguage = "en";
const originalTextNodes = new WeakMap();

function translateText(value) {
    const text = String(value);
    const dictionary =
        LANGUAGE_TRANSLATIONS[currentLanguage];

    if (!dictionary) {
        return text;
    }

    const trimmed = text.trim();
    let translated = dictionary[trimmed];

    if (!translated) {
        const analyzing = trimmed.match(
            /^Analyzing (audio|video|image)\.\.\.$/
        );
        const scanning = trimmed.match(
            /^Scanning (audio|video|image)\.\.\.$/
        );
        const scanComplete = trimmed.match(
            /^(.+) scan complete\.$/
        );
        const confidenceResult = trimmed.match(
            /^(.+) detected with ([\d.]+%) confidence\.$/
        );

        if (analyzing) {
            translated = {
                hi: "विश्लेषण हो रहा है...",
                mr: "विश्लेषण सुरू आहे..."
            }[currentLanguage];
        } else if (scanning) {
            translated = {
                hi: "स्कैन हो रहा है...",
                mr: "स्कॅन सुरू आहे..."
            }[currentLanguage];
        } else if (scanComplete) {
            translated = currentLanguage === "hi"
                ? `${translateText(scanComplete[1])} स्कैन पूरा हुआ।`
                : `${translateText(scanComplete[1])} स्कॅन पूर्ण.`;
        } else if (confidenceResult) {
            translated = currentLanguage === "hi"
                ? `${translateText(confidenceResult[1])} मिला; विश्वास स्तर ${confidenceResult[2]}।`
                : `${translateText(confidenceResult[1])} आढळले; विश्वास पातळी ${confidenceResult[2]}.`;
        }
    }

    if (!translated) {
        return text;
    }

    const leadingWhitespace =
        text.match(/^\s*/)?.[0] || "";
    const trailingWhitespace =
        text.match(/\s*$/)?.[0] || "";

    return `${leadingWhitespace}${translated}${trailingWhitespace}`;
}

function translateTextNode(node) {
    if (!originalTextNodes.has(node)) {
        originalTextNodes.set(node, node.nodeValue);
    }

    const original = originalTextNodes.get(node);
    const translated = translateText(original);

    if (node.nodeValue !== translated) {
        node.nodeValue = translated;
    }
}

function translatePage(root = document.body) {
    if (!root) {
        return;
    }

    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                const parent = node.parentElement;
                if (
                    !parent ||
                    parent.closest("script, style, .language-control")
                ) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let node;
    while ((node = walker.nextNode())) {
        translateTextNode(node);
    }

    root.querySelectorAll?.(
        "[placeholder], [title], [aria-label]"
    ).forEach(element => {
        for (const attribute of [
            "placeholder",
            "title",
            "aria-label"
        ]) {
            const value = element.getAttribute(attribute);
            if (value) {
                const key = `data-i18n-original-${attribute}`;
                if (!element.hasAttribute(key)) {
                    element.setAttribute(key, value);
                }
                element.setAttribute(
                    attribute,
                    translateText(element.getAttribute(key))
                );
            }
        }
    });
}

function initializeLanguageSelector() {
    const selector = document.getElementById("languageSelect");
    let savedLanguage = "en";

    try {
        savedLanguage =
            window.localStorage.getItem(LANGUAGE_STORAGE_KEY) || "en";
    } catch (error) {
        console.warn("Could not read saved dashboard language.", error);
    }

    currentLanguage =
        Object.prototype.hasOwnProperty.call(
            LANGUAGE_TRANSLATIONS,
            savedLanguage
        )
            ? savedLanguage
            : "en";

    const applyLanguage = language => {
        currentLanguage =
            Object.prototype.hasOwnProperty.call(
                LANGUAGE_TRANSLATIONS,
                language
            )
                ? language
                : "en";

        document.documentElement.lang =
            currentLanguage === "hi"
                ? "hi"
                : currentLanguage === "mr"
                    ? "mr"
                    : "en";

        const languageLabel =
            document.getElementById("languageLabel");
        if (languageLabel) {
            languageLabel.textContent =
                translateText("Language");
        }

        translatePage();

        try {
            window.localStorage.setItem(
                LANGUAGE_STORAGE_KEY,
                currentLanguage
            );
        } catch (error) {
            console.warn("Could not save dashboard language.", error);
        }
    };

    if (selector) {
        selector.value = currentLanguage;
        selector.addEventListener("change", () => {
            applyLanguage(selector.value);
        });
    }

    applyLanguage(currentLanguage);

    if (document.body && typeof MutationObserver !== "undefined") {
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === "characterData") {
                    translateTextNode(mutation.target);
                } else {
                    mutation.addedNodes.forEach(addedNode => {
                        if (addedNode.nodeType === Node.TEXT_NODE) {
                            translateTextNode(addedNode);
                        } else if (addedNode.nodeType === Node.ELEMENT_NODE) {
                            translatePage(addedNode);
                        }
                    });
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }
}

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


function setRiskCircleState(
    circle,
    fakeProbability,
    progress
) {
    if (!circle) {
        return;
    }

    const riskBand =
        calculateRiskLevel(fakeProbability).toLowerCase();
    const progressPercentage =
        toPercentage(progress);

    circle.classList.remove(
        "low",
        "medium",
        "high"
    );
    circle.classList.add(riskBand);
    circle.style.setProperty(
        "--circle-progress",
        `${(progressPercentage * 3.6).toFixed(2)}deg`
    );
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

        media_hash:
            String(
                getFirstDefined(
                    rawResult,
                    ["media_hash"],
                    ""
                )
            ),

        block_index:
            getFirstDefined(
                rawResult,
                ["block_index"],
                null
            ),

        block_hash:
            String(
                getFirstDefined(
                    rawResult,
                    ["block_hash"],
                    ""
                )
            ),

        chunk,

        recording,

        inference,

        explanation:
            getFirstDefined(
                rawResult,
                ["explanation"],
                null
            ),

        scam_intelligence:
            getFirstDefined(
                rawResult,
                ["scam_intelligence"],
                null
            )
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
        selectedCard.classList.remove(
            "hidden"
        );
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
        selectedCard.classList.add(
            "hidden"
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
   LIVE BROWSER MICROPHONE MONITOR
   ========================================================= */

function resampleToMonoPcm16(
    input,
    inputRate,
    outputRate = 16000
) {
    if (
        !input.length ||
        !Number.isFinite(inputRate) ||
        inputRate <= 0
    ) {
        return new Int16Array(0);
    }

    const outputLength =
        Math.floor(
            input.length *
            outputRate /
            inputRate
        );

    const output =
        new Int16Array(outputLength);

    for (
        let index = 0;
        index < outputLength;
        index += 1
    ) {
        const sourcePosition =
            index *
            inputRate /
            outputRate;

        const sourceIndex =
            Math.floor(sourcePosition);

        const fraction =
            sourcePosition -
            sourceIndex;

        const first =
            input[sourceIndex] || 0;

        const second =
            input[
                Math.min(
                    sourceIndex + 1,
                    input.length - 1
                )
            ] || 0;

        const sample =
            Math.max(
                -1,
                Math.min(
                    1,
                    first +
                    (second - first) *
                    fraction
                )
            );

        output[index] =
            sample < 0
                ? Math.round(sample * 32768)
                : Math.round(sample * 32767);
    }

    return output;
}


function resetLiveCapture() {
    liveCaptureChunks = [];
    liveCaptureSamples = 0;

    const downloadButton =
        el("downloadLiveCaptureButton");

    if (downloadButton) {
        downloadButton.disabled = true;
    }

    setText(
        "liveCaptureStatus",
        `Optional debug capture: up to ${LIVE_CAPTURE_MAX_SECONDS} seconds, stored only in this browser.`
    );
}


function downloadLiveCapture() {
    if (liveCaptureSamples === 0) {
        showToast(
            "No live microphone audio was captured.",
            "error"
        );
        return;
    }

    const audioBytes =
        liveCaptureSamples * Int16Array.BYTES_PER_ELEMENT;
    const wavHeader =
        new ArrayBuffer(44);
    const header =
        new DataView(wavHeader);
    const writeText = (offset, text) => {
        for (let index = 0; index < text.length; index += 1) {
            header.setUint8(offset + index, text.charCodeAt(index));
        }
    };

    writeText(0, "RIFF");
    header.setUint32(4, 36 + audioBytes, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    header.setUint32(16, 16, true);
    header.setUint16(20, 1, true);
    header.setUint16(22, 1, true);
    header.setUint32(24, 16000, true);
    header.setUint32(28, 32000, true);
    header.setUint16(32, 2, true);
    header.setUint16(34, 16, true);
    writeText(36, "data");
    header.setUint32(40, audioBytes, true);

    const audio =
        new Int16Array(liveCaptureSamples);
    let offset = 0;

    for (const chunk of liveCaptureChunks) {
        audio.set(chunk, offset);
        offset += chunk.length;
    }

    const wav =
        new Blob(
            [wavHeader, audio.buffer],
            { type: "audio/wav" }
        );
    const url =
        URL.createObjectURL(wav);
    const link =
        document.createElement("a");

    link.href = url;
    link.download = "cybershield-live-microphone.wav";
    link.click();
    window.setTimeout(
        () => URL.revokeObjectURL(url),
        1000
    );
}


async function cleanupBrowserLiveAudio() {
    if (liveAudioProcessor) {
        liveAudioProcessor.onaudioprocess =
            null;

        try {
            liveAudioProcessor.disconnect();
        } catch {}

        liveAudioProcessor = null;
    }

    if (liveAudioSource) {
        try {
            liveAudioSource.disconnect();
        } catch {}

        liveAudioSource = null;
    }

    if (liveAudioMuteGain) {
        try {
            liveAudioMuteGain.disconnect();
        } catch {}

        liveAudioMuteGain = null;
    }

    if (liveAudioStream) {
        liveAudioStream
            .getTracks()
            .forEach(
                track => track.stop()
            );

        liveAudioStream = null;
    }

    if (
        liveAudioContext &&
        liveAudioContext.state !== "closed"
    ) {
        try {
            await liveAudioContext.close();
        } catch (error) {
            console.debug(
                "Live audio context cleanup:",
                error
            );
        }
    }

    liveAudioContext = null;
}


function handleLiveSocketClose(socket) {
    if (liveAudioSocket !== socket) {
        return;
    }

    liveAudioSocket = null;
    activeLiveCallId = "";
    finishLiveCapture();

    cleanupBrowserLiveAudio();
    updateLiveRecordingUI(false);
    stopLiveTimer();
    stopLivePolling();

    showToast(
        "Live microphone connection to the detector was lost.",
        "error"
    );
}


function finishLiveCapture() {
    const downloadButton =
        el("downloadLiveCaptureButton");

    if (downloadButton) {
        downloadButton.disabled =
            liveCaptureSamples === 0;
    }

    const durationSeconds =
        liveCaptureSamples / 16000;

    setText(
        "liveCaptureStatus",
        liveCaptureSamples
            ? `Captured ${durationSeconds.toFixed(1)} seconds. Download the WAV to inspect the exact streamed signal.`
            : "No microphone audio was captured."
    );
}


async function startLiveRecording() {
    const startButton =
        el("startButton");

    if (startButton) {
        startButton.disabled =
            true;
    }

    let socket = null;

    try {
        resetLiveCapture();

        if (
            !window.isSecureContext ||
            !navigator.mediaDevices?.getUserMedia
        ) {
            throw new Error(
                "Live microphone requires HTTPS or localhost. Open this app at http://localhost:7860."
            );
        }

        if (typeof AudioContext === "undefined") {
            throw new Error(
                "This browser does not support live audio processing."
            );
        }

        liveAudioStream =
            await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

        const callId =
            crypto.randomUUID
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        activeLiveCallId = callId;

        const websocketProtocol =
            window.location.protocol === "https:"
                ? "wss:"
                : "ws:";

        socket = new WebSocket(
            `${websocketProtocol}//${window.location.host}/ws/audio/${encodeURIComponent(callId)}`
        );
        liveAudioSocket = socket;
        socket.binaryType = "arraybuffer";

        await new Promise(
            (resolve, reject) => {
                let settled = false;

                const connectionTimeout =
                    window.setTimeout(
                        () => {
                            if (!settled) {
                                settled = true;
                                reject(
                                    new Error(
                                        "Timed out connecting to live audio detector. Check that Flask-Sock is installed and the server is running."
                                    )
                                );
                            }
                        },
                        10000
                    );

                socket.onmessage =
                    event => {
                        let message;

                        try {
                            message =
                                JSON.parse(event.data);
                        } catch {
                            return;
                        }

                        if (
                            !settled &&
                            message.success
                        ) {
                            settled = true;
                            window.clearTimeout(
                                connectionTimeout
                            );
                            resolve();
                        } else if (
                            !message.success &&
                            message.message
                        ) {
                            showToast(
                                message.message,
                                "error"
                            );
                        }
                    };

                socket.onerror = () => {
                    if (!settled) {
                        settled = true;
                        window.clearTimeout(
                            connectionTimeout
                        );
                        reject(
                            new Error(
                                "Could not connect to the live detector. Confirm Flask-Sock is available and restart the Flask server."
                            )
                        );
                    }
                };

                socket.onclose = () => {
                    window.clearTimeout(
                        connectionTimeout
                    );

                    if (!settled) {
                        settled = true;
                        reject(
                            new Error(
                                "The live detector closed the microphone connection."
                            )
                        );
                    } else {
                        handleLiveSocketClose(
                            socket
                        );
                    }
                };
            }
        );

        liveAudioContext =
            new AudioContext();

        await liveAudioContext.resume();

        liveAudioSource =
            liveAudioContext.createMediaStreamSource(
                liveAudioStream
            );

        liveAudioProcessor =
            liveAudioContext.createScriptProcessor(
                4096,
                1,
                1
            );

        liveAudioMuteGain =
            liveAudioContext.createGain();

        liveAudioMuteGain.gain.value = 0;

        liveAudioProcessor.onaudioprocess =
            event => {
                if (
                    !socket ||
                    socket.readyState !== WebSocket.OPEN ||
                    socket.bufferedAmount > 1024 * 1024
                ) {
                    return;
                }

                const samples =
                    event.inputBuffer.getChannelData(0);

                const pcm =
                    resampleToMonoPcm16(
                        samples,
                        liveAudioContext.sampleRate
                    );

                if (pcm.length) {
                    const remainingSamples =
                        LIVE_CAPTURE_MAX_SECONDS * 16000 -
                        liveCaptureSamples;

                    if (remainingSamples > 0) {
                        const capturedPcm =
                            pcm.slice(
                                0,
                                remainingSamples
                            );

                        liveCaptureChunks.push(
                            capturedPcm
                        );
                        liveCaptureSamples +=
                            capturedPcm.length;
                    }

                    socket.send(pcm.buffer);
                }
            };

        liveAudioSource.connect(
            liveAudioProcessor
        );
        liveAudioProcessor.connect(
            liveAudioMuteGain
        );
        liveAudioMuteGain.connect(
            liveAudioContext.destination
        );

        liveRecordingStartedAt =
            Date.now();

        updateLiveRecordingUI(
            true
        );

        resetLiveVerdict();

        startLiveTimer();

        startLivePolling();

        showToast(
            "Your browser microphone is streaming to the live AI detector.",
            "success"
        );
    } catch (error) {
        console.error(
            "Live monitoring start error:",
            error
        );

        activeLiveCallId = "";
        finishLiveCapture();

        if (socket) {
            liveAudioSocket = null;

            try {
                socket.close();
            } catch {}
        }

        await cleanupBrowserLiveAudio();

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
        const socket =
            liveAudioSocket;

        liveAudioSocket = null;
        activeLiveCallId = "";
        finishLiveCapture();

        if (
            socket &&
            socket.readyState === WebSocket.OPEN
        ) {
            socket.send(
                JSON.stringify({
                    event: "stop"
                })
            );
        }

        if (
            socket &&
            socket.readyState < WebSocket.CLOSING
        ) {
            socket.close();
        }

        await cleanupBrowserLiveAudio();

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

        if (
            !activeLiveCallId ||
            resultPayload.streaming !== true ||
            resultPayload.call_id !== activeLiveCallId
        ) {
            return;
        }

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
        const secureContext =
            typeof window !== "undefined" &&
            window.isSecureContext;

        const message =
            secureContext
                ? "This browser does not expose microphone capture here. Try an up-to-date Chrome or Edge browser."
                : "Microphone access requires HTTPS or localhost. Open this app at http://localhost:7860, or use an HTTPS URL.";

        setText(
            "recordScanMessage",
            message
        );

        showToast(
            secureContext
                ? "Browser microphone capture is unavailable."
                : "Use HTTPS or localhost to enable the microphone.",
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


function resetLiveVerdict() {
    setText(
        "confidenceValue",
        "--"
    );

    setText(
        "liveDetectionResult",
        "ANALYZING"
    );

    setText(
        "liveDetectionMessage",
        "Waiting for the first microphone audio window..."
    );

    setText(
        "realProbability",
        "--"
    );

    setText(
        "fakeProbability",
        "--"
    );

    const realBar =
        el("realBar");

    if (realBar) {
        realBar.style.width =
            "0%";
    }

    const fakeBar =
        el("fakeBar");

    if (fakeBar) {
        fakeBar.style.width =
            "0%";
    }

    const ring =
        el("verdictRing");

    if (ring) {
        ring.style.setProperty(
            "--verdict-progress",
            "0%"
        );

        ring.classList.remove(
            "real",
            "fake"
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

    updateScanInsights(
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


function setInsightList(
    listElement,
    items,
    getText
) {
    if (!listElement) {
        return;
    }

    listElement.replaceChildren();
    const values =
        Array.isArray(items)
            ? items
            : [];

    if (values.length === 0) {
        const emptyItem =
            document.createElement("li");
        emptyItem.textContent =
            "None detected";
        listElement.appendChild(emptyItem);
        return;
    }

    values.forEach(
        item => {
            const listItem =
                document.createElement("li");
            listItem.textContent =
                getText(item);
            listElement.appendChild(listItem);
        }
    );
}


function updateScanInsights(
    result
) {
    const panel =
        el("scanInsights");

    if (!panel || !result.id) {
        return;
    }

    panel.classList.remove("hidden");
    setText(
        "insightPrediction",
        `${result.media_type}: ${result.prediction}`
    );
    setText(
        "insightScores",
        [
            `REAL ${formatPercentage(result.real)}`,
            `FAKE ${formatPercentage(result.fake)}`,
            `Confidence ${formatPercentage(result.confidence)}`
        ].join(" | ")
    );

    const explanation =
        result.explanation &&
        typeof result.explanation === "object"
            ? result.explanation
            : {};
    setText(
        "insightExplanation",
        explanation.summary ||
        "The detector output is available, but an explanation was not returned."
    );
    setText(
        "insightCaveat",
        explanation.caveat ||
        "This prediction is an estimate and is not verified truth."
    );
    setText(
        "insightVisualizationNote",
        explanation.visualization_note ||
        "No model-supported explanation visualization is available for this scan."
    );

    const downloadButton =
        el("downloadScanReportButton");
    const validScanId =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            String(result.id)
        );
    if (downloadButton) {
        downloadButton.disabled = !validScanId;
        downloadButton.dataset.scanId =
            validScanId
                ? result.id
                : "";
    }

    const scamPanel =
        el("voiceScamPanel");
    if (!scamPanel) {
        return;
    }
    if (result.media_type !== "Audio") {
        scamPanel.classList.add("hidden");
        return;
    }

    scamPanel.classList.remove("hidden");
    const scam =
        result.scam_intelligence &&
        typeof result.scam_intelligence === "object"
            ? result.scam_intelligence
            : {};
    const riskLevel =
        String(scam.risk_level || "UNKNOWN").toUpperCase();
    const riskBadge =
        el("scamRiskBadge");
    if (riskBadge) {
        riskBadge.textContent = riskLevel;
        riskBadge.className =
            `scam-risk-badge ${riskLevel.toLowerCase()}`;
    }
    setText(
        "scamSummary",
        scam.summary ||
        "Transcription is unavailable; the voice authenticity result remains separate."
    );
    setText(
        "scamTranscript",
        scam.transcript ||
        (scam.status === "unavailable"
            ? "Transcription unavailable. Voice authenticity analysis was not affected."
            : "Not available for this live audio scan.")
    );
    setInsightList(
        el("scamIndicators"),
        scam.indicators,
        indicator => {
            const label =
                indicator && indicator.label
                    ? indicator.label
                    : "Warning indicator";
            const excerpts =
                indicator && Array.isArray(indicator.excerpts)
                    ? indicator.excerpts
                    : [];
            return excerpts.length
                ? `${label}: ${excerpts.join(" | ")}`
                : label;
        }
    );
    setInsightList(
        el("scamRecommendations"),
        scam.recommendations,
        recommendation => String(recommendation)
    );
}


async function downloadScanReport(
    scanId,
    button = null
) {
    if (!scanId) {
        showToast("This scan does not have a valid report ID.", "error");
        return;
    }

    const message =
        el("reportDownloadMessage");
    const originalText =
        button ? button.textContent : "";
    if (button) {
        button.disabled = true;
        button.textContent = "Preparing PDF...";
    }
    if (message) {
        message.textContent = "";
    }

    try {
        const response =
            await fetch(
                `/api/reports/${encodeURIComponent(scanId)}`,
                {
                    method: "GET",
                    headers: {
                        Accept: "application/pdf, application/json"
                    }
                }
            );

        if (!response.ok) {
            let errorMessage =
                `Report download failed (${response.status}).`;
            try {
                const data = await response.json();
                errorMessage =
                    data.message || errorMessage;
            } catch (error) {
                console.debug("Report error response was not JSON:", error);
            }
            throw new Error(errorMessage);
        }

        const contentType =
            response.headers.get("Content-Type") || "";
        if (!contentType.includes("application/pdf")) {
            throw new Error("The server did not return a PDF report.");
        }

        const blob =
            await response.blob();
        const downloadUrl =
            URL.createObjectURL(blob);
        const link =
            document.createElement("a");
        link.href = downloadUrl;
        link.download =
            `CyberShield_Report_${scanId}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(
            () => URL.revokeObjectURL(downloadUrl),
            1000
        );
        showToast("Detection report downloaded.", "success");
    } catch (error) {
        console.error("Detection report download failed:", error);
        if (message) {
            message.textContent =
                error.message || "The report could not be downloaded.";
        }
        showToast(
            error.message || "The report could not be downloaded.",
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
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

    setRiskCircleState(
        ring,
        result.fake,
        result.confidence
    );

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

    setRiskCircleState(
        circle,
        result.fake,
        result.risk
    );
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
            "Unknown",

        media_hash:
            result.media_hash ||
            "",

        block_index:
            result.block_index ??
            null,

        block_hash:
            result.block_hash ||
            ""
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
            7;

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

            const blockchainCell =
                document.createElement(
                    "td"
                );

            if (item.block_hash) {
                const blockLabel =
                    document.createElement(
                        "div"
                    );

                blockLabel.textContent =
                    `#${item.block_index} · ${item.block_hash.slice(0, 12)}…`;

                blockLabel.title =
                    item.block_hash;

                const verifyButton =
                    document.createElement(
                        "button"
                    );

                verifyButton.type = "button";
                verifyButton.className = "history-btn";
                verifyButton.textContent = "Verify file";
                verifyButton.addEventListener(
                    "click",
                    () => verifyHistoryFile(item, verifyButton)
                );

                blockchainCell.append(
                    blockLabel,
                    verifyButton
                );
            } else {
                blockchainCell.textContent =
                    "Not recorded";
            }

            if (
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                    String(item.id)
                )
            ) {
                const reportButton =
                    document.createElement("button");
                reportButton.type = "button";
                reportButton.className = "history-btn";
                reportButton.textContent = "Download PDF";
                reportButton.addEventListener(
                    "click",
                    () => downloadScanReport(item.id, reportButton)
                );
                blockchainCell.appendChild(reportButton);
            }

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

            row.appendChild(
                blockchainCell
            );

            body.appendChild(
                row
            );
        }
    );
}


async function verifyHistoryFile(
    item,
    button
) {
    const picker =
        document.createElement("input");

    picker.type = "file";
    picker.accept = "audio/*,image/*,video/*";
    picker.addEventListener(
        "change",
        async () => {
            const file =
                picker.files?.[0];

            if (!file) {
                return;
            }

            button.disabled = true;
            button.textContent = "Checking...";

            try {
                const formData =
                    new FormData();

                formData.append("scan_id", item.id);
                formData.append("file", file);

                const response =
                    await fetch(
                        "/api/blockchain/verify",
                        {
                            method: "POST",
                            body: formData
                        }
                    );

                const data =
                    await response.json();

                if (
                    response.ok &&
                    data.success &&
                    data.verification?.valid &&
                    data.verification?.file_matches
                ) {
                    showToast(
                        "Blockchain verified: original file matches this scan.",
                        "success"
                    );
                } else {
                    showToast(
                        data.verification?.error ||
                        data.message ||
                        "Blockchain verification failed.",
                        "error"
                    );
                }
            } catch (error) {
                showToast(
                    error.message ||
                    "Could not verify the selected file.",
                    "error"
                );
            } finally {
                button.disabled = false;
                button.textContent = "Verify file";
            }
        },
        { once: true }
    );

    picker.click();
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
        "FILE",
        "SCAN_ID",
        "BLOCK_INDEX",
        "BLOCK_HASH"
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
                item.filename,
                item.id,
                item.block_index ?? "",
                item.block_hash
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
    setRiskCircleState(
        el("verdictRing"),
        0,
        0
    );
    setRiskCircleState(
        el("riskCircle"),
        0,
        0
    );

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

        const blockchainStatus =
            el("blockchainStatus");

        if (blockchainStatus) {
            const ledger =
                data?.blockchain;

            blockchainStatus.classList.remove(
                "online",
                "pending"
            );

            if (ledger?.valid) {
                blockchainStatus.classList.add(
                    "online"
                );
                blockchainStatus.textContent =
                    `HASH-CHAIN LEDGER VALID - ${ledger.block_count} BLOCKS`;
            } else {
                blockchainStatus.classList.add(
                    "pending"
                );
                blockchainStatus.textContent =
                    `HASH-CHAIN LEDGER INVALID - ${ledger?.error || "STATUS UNAVAILABLE"}`;
            }
        }
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

        const blockchainStatus =
            el("blockchainStatus");

        if (blockchainStatus) {
            blockchainStatus.classList.remove(
                "online"
            );
            blockchainStatus.classList.add(
                "pending"
            );
            blockchainStatus.textContent =
                "HASH-CHAIN LEDGER STATUS UNAVAILABLE";
        }
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

    const downloadLiveCaptureButton =
        el("downloadLiveCaptureButton");

    if (downloadLiveCaptureButton) {
        downloadLiveCaptureButton.addEventListener(
            "click",
            downloadLiveCapture
        );
        downloadLiveCaptureButton.disabled = true;
    }

    const downloadScanReportButton =
        el("downloadScanReportButton");

    if (downloadScanReportButton) {
        downloadScanReportButton.addEventListener(
            "click",
            () => downloadScanReport(
                downloadScanReportButton.dataset.scanId,
                downloadScanReportButton
            )
        );
        downloadScanReportButton.disabled = true;
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

    const recordScanPanel =
        document.querySelector(".record-scan-panel");
    const analysisGrid =
        document.querySelector(".analysis-grid");
    const scanInsights =
        el("scanInsights");

    if (recordScanPanel && analysisGrid) {
        analysisGrid.insertAdjacentElement(
            "afterend",
            recordScanPanel
        );

        if (scanInsights) {
            recordScanPanel.insertAdjacentElement(
                "afterend",
                scanInsights
            );
        }
    }

    initializeLanguageSelector();

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