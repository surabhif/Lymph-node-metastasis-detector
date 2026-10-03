#!/usr/bin/env python3
"""
Create a small untrained placeholder ONNX model for the web demo.

This model has random weights and is NOT useful for detecting metastasis.
It exists so the React app can load, run inference, and draw a CAM overlay
before Surabhi finishes training. Replace it by copying her Colab export to:

    web/public/models/pcam_cam.onnx

ONNX contract (must match the notebook export and the web app):
  input:       float32 [N, 3, 96, 96]  ImageNet-normalized RGB
  probability: float32 [N, 1]         P(tumor / metastasis)
  features:    float32 [N, C, H, W]   final conv feature maps
  cam_weights: float32 [C]            weights for tumor class CAM
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
import torch.nn as nn
import torch.nn.functional as F
from onnx import helper, numpy_helper


FEATURE_CHANNELS = 64
PATCH_SIZE = 96
EXPECTED_OUTPUTS = ("probability", "features", "cam_weights")


class TinyCamNet(nn.Module):
    """Small CNN with an explicit CAM-friendly head (same shape as the notebook export)."""

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
        feat = self.features(x)  # [N, C, H, W] ≈ [N, 64, 12, 12] for 96×96
        pooled = F.adaptive_avg_pool2d(feat, 1).flatten(1)
        logits = self.classifier(pooled)
        probability = torch.sigmoid(logits)
        # Force a real graph node (raw .weight can export under an anonymous name).
        cam_weights = self.classifier.weight.squeeze(0) * 1.0
        return probability, feat, cam_weights


def ensure_output_names(model: onnx.ModelProto) -> onnx.ModelProto:
    """Rename graph outputs to the contract names if the exporter used anonymous names."""
    current = [o.name for o in model.graph.output]
    if current == list(EXPECTED_OUTPUTS):
        return model

    # Map by position: 0=probability, 1=features, 2=cam_weights
    for i, desired in enumerate(EXPECTED_OUTPUTS):
        if i >= len(model.graph.output):
            break
        old = model.graph.output[i].name
        if old == desired:
            continue
        # Insert Identity so consumers can read the stable name.
        model.graph.node.append(
            helper.make_node("Identity", inputs=[old], outputs=[desired], name=f"rename_{desired}")
        )
        model.graph.output[i].name = desired
    return model


def main() -> None:
    out_dir = Path(__file__).resolve().parents[1] / "web" / "public" / "models"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "pcam_cam.onnx"

    torch.manual_seed(0)
    net = TinyCamNet().eval()

    dummy = torch.randn(1, 3, PATCH_SIZE, PATCH_SIZE)
    with torch.no_grad():
        prob, feat, weights = net(dummy)
    print(f"shapes: prob={tuple(prob.shape)} feat={tuple(feat.shape)} weights={tuple(weights.shape)}")

    # Legacy exporter → single-file ONNX (ORT Web friendly).
    torch.onnx.export(
        net,
        dummy,
        str(out_path),
        input_names=["input"],
        output_names=list(EXPECTED_OUTPUTS),
        dynamic_axes={
            "input": {0: "batch"},
            "probability": {0: "batch"},
            "features": {0: "batch"},
        },
        opset_version=18,
        dynamo=False,
    )

    sidecar = out_path.with_suffix(".onnx.data")
    if sidecar.exists():
        sidecar.unlink()

    model = onnx.load(str(out_path))
    model = ensure_output_names(model)
    onnx.save_model(model, str(out_path), save_as_external_data=False)
    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"Wrote {out_path} ({size_mb:.2f} MB) — UNTRAINED PLACEHOLDER")
    print("graph outputs:", [o.name for o in model.graph.output])

    sess = ort.InferenceSession(str(out_path), providers=["CPUExecutionProvider"])
    names = [o.name for o in sess.get_outputs()]
    assert names == list(EXPECTED_OUTPUTS), names
    outs = sess.run(None, {"input": dummy.numpy()})
    print(f"ORT outputs: {names} shapes={[o.shape for o in outs]}")

    meta = out_dir / "MODEL_STATUS.txt"
    meta.write_text(
        "STATUS=untrained_placeholder\n"
        "DESCRIPTION=Random-weight TinyCamNet for UI wiring only. Not trained on PCam.\n"
        "REPLACE_WITH=Copy your Colab export to web/public/models/pcam_cam.onnx\n"
    )
    print(f"Wrote {meta}")


if __name__ == "__main__":
    main()
