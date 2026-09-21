import cv2
import numpy as np
import torch

from facenet_pytorch import MTCNN


class DeepfakeDetector:

    def __init__(self):

        print("Initializing Deepfake Detector...")

        self.device = torch.device("cpu")

        self.face_detector = MTCNN(
            keep_all=True,
            image_size=160,
            margin=20,
            min_face_size=40,
            thresholds=[0.6, 0.7, 0.7],
            factor=0.709,
            post_process=True,
            device=self.device
        )

        print("Face detector ready.")

    def extract_faces(self, frame):

        rgb = cv2.cvtColor(
            frame,
            cv2.COLOR_BGR2RGB
        )

        boxes, probabilities = self.face_detector.detect(
            rgb
        )

        detected_faces = []

        if boxes is None:
            return detected_faces

        for box, probability in zip(
            boxes,
            probabilities
        ):

            if probability is None:
                continue

            if probability < 0.90:
                continue

            x1, y1, x2, y2 = box

            x1 = max(0, int(x1))
            y1 = max(0, int(y1))
            x2 = min(frame.shape[1], int(x2))
            y2 = min(frame.shape[0], int(y2))

            if x2 <= x1 or y2 <= y1:
                continue

            face = frame[
                y1:y2,
                x1:x2
            ]

            if face.size == 0:
                continue

            detected_faces.append({
                "face": face,
                "box": (x1, y1, x2, y2),
                "confidence": float(probability)
            })

        return detected_faces

    def preprocess_face(self, face):

        face = cv2.resize(
            face,
            (224, 224)
        )

        face = cv2.cvtColor(
            face,
            cv2.COLOR_BGR2RGB
        )

        face = face.astype(
            np.float32
        ) / 255.0

        # Normalize
        mean = np.array(
            [0.485, 0.456, 0.406],
            dtype=np.float32
        )

        std = np.array(
            [0.229, 0.224, 0.225],
            dtype=np.float32
        )

        face = (
            face - mean
        ) / std

        # HWC → CHW
        face = np.transpose(
            face,
            (2, 0, 1)
        )

        # Add batch dimension
        face = np.expand_dims(
            face,
            axis=0
        )

        tensor = torch.from_numpy(
            face
        )

        return tensor.to(
            self.device
        )

    def analyze_frame(self, frame):

        faces = self.extract_faces(
            frame
        )

        results = []

        for face_data in faces:

            tensor = self.preprocess_face(
                face_data["face"]
            )

            results.append({
                "box": face_data["box"],
                "face_confidence": face_data["confidence"],
                "tensor_shape": tuple(
                    tensor.shape
                )
            })

        return results