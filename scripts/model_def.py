'''
Shared TinyCamNet definition used by scripts/create_placeholder_model.py.

The Colab notebook uses CamClassifier (ResNet-18 / MobileNetV2) with the same
ONNX I/O names: input, probability, features, cam_weights.
'''

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

FEATURE_CHANNELS = 64
PATCH_SIZE = 96


class TinyCamNet(nn.Module):
    def __init__(self, num_features: int = FEATURE_CHANNELS) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.Conv2d(32, 32, kernel_size=3, stride=1, padding=1, bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.Conv2d(32, num_features, kernel_size=3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(num_features),
            nn.ReLU(inplace=True),
            nn.Conv2d(num_features, num_features, kernel_size=3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(num_features),
            nn.ReLU(inplace=True),
        )
        self.classifier = nn.Linear(num_features, 1)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        feat = self.features(x)
        pooled = F.adaptive_avg_pool2d(feat, 1).flatten(1)
        logits = self.classifier(pooled)
        probability = torch.sigmoid(logits)
        cam_weights = self.classifier.weight.squeeze(0)
        return probability, feat, cam_weights
