import cv2

from detectors.deepfake_detector import DeepfakeDetector


detector = DeepfakeDetector()

video = cv2.VideoCapture(
    "video.mp4"
)

if not video.isOpened():

    print("ERROR: video.mp4 open nahi hua")
    exit()


frame_number = 0
faces_found = 0

# CPU optimization:
# every 5th frame analyze karenge
FRAME_SKIP = 5


while True:

    success, frame = video.read()

    if not success:
        break

    frame_number += 1

    if frame_number % FRAME_SKIP != 0:
        continue

    analysis = detector.analyze_frame(
        frame
    )

    for face in analysis:

        faces_found += 1

        x1, y1, x2, y2 = face["box"]

        confidence = face[
            "face_confidence"
        ]

        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            (0, 255, 0),
            2
        )

        cv2.putText(
            frame,
            f"Face {confidence:.2f}",
            (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2
        )

        print(
            f"Frame: {frame_number} | "
            f"Face confidence: {confidence:.2f} | "
            f"Tensor: {face['tensor_shape']}"
        )

    cv2.imshow(
        "AI Deepfake Analysis",
        frame
    )

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break


video.release()
cv2.destroyAllWindows()


print()
print("=" * 45)
print("DEEPFAKE PREPROCESSING COMPLETE")
print("=" * 45)
print(f"Frames processed : {frame_number}")
print(f"Faces analyzed   : {faces_found}")
print("=" * 45)