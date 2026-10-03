#!/usr/bin/env python3
"""
Export web/public/results/metrics.json (+ mistake gallery images) from a trained checkpoint.

Faithful to the notebook evaluation section. Surabhi's Colab run should overwrite these
artifacts when she exports; do not invent interpretations here.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    roc_auc_score,
    roc_curve,
)
from torch.utils.data import DataLoader, Subset
from torchvision import datasets, models, transforms

REPO = Path(__file__).resolve().parents[1]
DATA_ROOT = REPO / "pcam_data"
CKPT = REPO / "export" / "best_model.pt"
OUT_DIR = REPO / "web" / "public" / "results"
MISTAKES_DIR = OUT_DIR / "mistakes"
BASELINE_JSON = REPO / "results" / "baseline_quick_run.json"

# Match run_baseline_quick / notebook quick-run evaluation subset
SEED = 42
MAX_TEST_SAMPLES = 4000
BATCH_SIZE = 64
DEVICE = torch.device("cpu")
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


class CamClassifier(nn.Module):
    def __init__(self, backbone_name: str = "resnet18", pretrained: bool = False):
        super().__init__()
        if backbone_name == "resnet18":
            net = models.resnet18(weights=None)
            feat_dim = net.fc.in_features
            self.features = nn.Sequential(*list(net.children())[:-2])
            self.classifier = nn.Linear(feat_dim, 1)
        elif backbone_name == "mobilenet_v2":
            net = models.mobilenet_v2(weights=None)
            feat_dim = net.last_channel
            self.features = net.features
            self.classifier = nn.Linear(feat_dim, 1)
        else:
            raise ValueError(backbone_name)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        feat = self.features(x)
        pooled = F.adaptive_avg_pool2d(feat, 1).flatten(1)
        return self.classifier(pooled).squeeze(1)


def subset_indices(n_total: int, n_keep: int, seed: int) -> list[int]:
    idx = list(range(n_total))
    rng = random.Random(seed)
    rng.shuffle(idx)
    return idx[:n_keep]


@torch.no_grad()
def collect(model, loader):
    model.eval()
    ys, ps = [], []
    for x, y in loader:
        logits = model(x.to(DEVICE))
        prob = torch.sigmoid(logits).cpu().numpy()
        ys.append(y.numpy())
        ps.append(prob)
    return np.concatenate(ys), np.concatenate(ps)


def reliability_bins(y_true, y_prob, n_bins=10):
    bins = np.linspace(0, 1, n_bins + 1)
    out = []
    for i in range(n_bins):
        lo, hi = bins[i], bins[i + 1]
        mask = (y_prob >= lo) & (y_prob < hi if i < n_bins - 1 else y_prob <= hi)
        count = int(mask.sum())
        if count == 0:
            continue
        out.append(
            {
                "bin_start": float(lo),
                "bin_end": float(hi),
                "center": float((lo + hi) / 2),
                "mean_predicted": float(y_prob[mask].mean()),
                "fraction_positive": float(y_true[mask].mean()),
                "count": count,
            }
        )
    return out


def main() -> None:
    if not CKPT.exists():
        raise SystemExit(f"Missing checkpoint {CKPT}")

    baseline_meta = {}
    if BASELINE_JSON.exists():
        baseline_meta = json.loads(BASELINE_JSON.read_text())

    ckpt = torch.load(CKPT, map_location=DEVICE, weights_only=False)
    backbone = ckpt.get("backbone", "resnet18")
    model = CamClassifier(backbone, pretrained=False).to(DEVICE)
    model.load_state_dict(ckpt["model"])
    model.eval()

    eval_tfms = transforms.Compose(
        [transforms.ToTensor(), transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD)]
    )
    test_full = datasets.PCAM(root=str(DATA_ROOT), split="test", transform=eval_tfms, download=False)
    test_idx = subset_indices(len(test_full), MAX_TEST_SAMPLES, SEED + 2)
    test_ds = Subset(test_full, test_idx)
    loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

    y_true, y_prob = collect(model, loader)
    y_pred = (y_prob >= 0.5).astype(int)
    acc = float(accuracy_score(y_true, y_pred))
    auc = float(roc_auc_score(y_true, y_prob))

    rng = np.random.default_rng(SEED)
    boot = []
    n = len(y_true)
    for _ in range(200):
        bi = rng.integers(0, n, n)
        if len(np.unique(y_true[bi])) < 2:
            continue
        boot.append(roc_auc_score(y_true[bi], y_prob[bi]))
    lo, hi = [float(x) for x in np.percentile(boot, [2.5, 97.5])]

    fpr, tpr, thr = roc_curve(y_true, y_prob)
    # Downsample ROC points for the web JSON
    step = max(1, len(fpr) // 200)
    roc_points = [
        {"fpr": float(fpr[i]), "tpr": float(tpr[i]), "threshold": float(thr[i]) if i < len(thr) else 0.0}
        for i in range(0, len(fpr), step)
    ]
    if roc_points[-1]["fpr"] != float(fpr[-1]):
        roc_points.append({"fpr": float(fpr[-1]), "tpr": float(tpr[-1]), "threshold": 0.0})

    cm = confusion_matrix(y_true, y_pred).tolist()
    cal = reliability_bins(y_true, y_prob)

    # Mistakes gallery — most confident errors
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MISTAKES_DIR.mkdir(parents=True, exist_ok=True)
    for old in MISTAKES_DIR.glob("*.png"):
        old.unlink()

    test_vis = datasets.PCAM(
        root=str(DATA_ROOT), split="test", transform=transforms.ToTensor(), download=False
    )
    wrong = np.where(y_pred != y_true)[0]
    mistakes = []
    if len(wrong):
        conf = np.where(y_pred[wrong] == 1, y_prob[wrong], 1 - y_prob[wrong])
        order = wrong[np.argsort(-conf)[:8]]
        for rank, local_i in enumerate(order, start=1):
            orig_i = test_idx[int(local_i)]
            img_t, _ = test_vis[orig_i]
            arr = (img_t.permute(1, 2, 0).numpy() * 255).clip(0, 255).astype(np.uint8)
            fname = f"mistake_{rank:02d}_idx{orig_i}.png"
            Image.fromarray(arr).save(MISTAKES_DIR / fname, optimize=True)
            mistakes.append(
                {
                    "src": f"results/mistakes/{fname}",
                    "testIndex": int(orig_i),
                    "trueLabel": "tumor" if int(y_true[local_i]) == 1 else "normal",
                    "predictedLabel": "tumor" if int(y_pred[local_i]) == 1 else "normal",
                    "probability": float(y_prob[local_i]),
                    "confidence": float(conf[np.where(wrong == local_i)[0][0]]),
                }
            )

    payload = {
        "schema_version": 1,
        "label": "Cursor-assisted quick baseline",
        "disclaimer": (
            "These metrics come from a quick subset/epochs baseline trained with Cursor's help. "
            "They are a reference point — not Surabhi's final reported results. "
            "When she retrains, overwrite this file via the notebook export / scripts/export_web_results.py."
        ),
        "surabhi_prompts": [
            "Write 2–3 sentences on what the ROC curve and AUC mean for this problem.",
            "Does the reliability diagram look well-calibrated? Where does it deviate?",
            "What patterns do you notice in the confident-mistake gallery?",
            "What would you change next (data, augmentation, backbone, epochs)?",
        ],
        "config": baseline_meta.get("config")
        or {
            "backbone": backbone,
            "epochs": 2,
            "batch_size": 64,
            "learning_rate": 0.001,
            "seed": SEED,
        },
        "subset_sizes": baseline_meta.get("subset_sizes")
        or {
            "train_used": 4000,
            "val_used": 1000,
            "test_used": MAX_TEST_SAMPLES,
            "test_selection": f"fixed-seed random subset of official test (seed={SEED + 2})",
        },
        "hardware": baseline_meta.get("hardware"),
        "runtime_seconds": baseline_meta.get("runtime_seconds"),
        "metrics": {
            "test_accuracy": acc,
            "test_roc_auc": auc,
            "test_roc_auc_bootstrap_95ci": [lo, hi],
            "bootstrap_resamples": len(boot),
            "decision_threshold": 0.5,
            "confusion_matrix": {
                "labels": ["normal", "tumor"],
                "matrix": cm,
                "row_means_true": True,
            },
            "best_val_auc": float(ckpt.get("val_auc", baseline_meta.get("metrics", {}).get("best_val_auc", 0))),
        },
        "roc_curve": roc_points,
        "calibration": cal,
        "mistakes": mistakes,
    }

    out_path = OUT_DIR / "metrics.json"
    out_path.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {out_path}")
    print(f"acc={acc:.4f} auc={auc:.4f} CI=[{lo:.4f},{hi:.4f}] mistakes={len(mistakes)}")


if __name__ == "__main__":
    main()
