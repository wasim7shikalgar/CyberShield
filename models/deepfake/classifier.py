import torch
import torch.nn as nn
from torchvision import models


class DeepfakeClassifier:

    def __init__(self, model_path=None):

        self.device = torch.device("cpu")

        print("Initializing Deepfake Classifier...")
        print("Device:", self.device)

        # ResNet18 backbone
        self.model = models.resnet18(
            weights=None
        )

        # 2 classes
        # 0 = REAL
        # 1 = FAKE
        self.model.fc = nn.Linear(
            self.model.fc.in_features,
            2
        )

        if model_path:

            print(
                "Loading trained weights..."
            )

            checkpoint = torch.load(
                model_path,
                map_location=self.device
            )

            self.model.load_state_dict(
                checkpoint
            )

        self.model.to(self.device)

        self.model.eval()

        print("Deepfake Classifier Ready")

    def predict(self, face_tensor):

        with torch.no_grad():

            output = self.model(
                face_tensor
            )

            probabilities = torch.softmax(
                output,
                dim=1
            )

            real_probability = float(
                probabilities[0][0]
            )

            fake_probability = float(
                probabilities[0][1]
            )

        return {
            "real": real_probability,
            "fake": fake_probability
        }