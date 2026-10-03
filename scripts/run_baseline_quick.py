#!/usr/bin/env python3
"""
Quick baseline training run — faithful to notebooks/01_train_pcam.ipynb knobs/code path.

Runs on this VM (CPU) so the live demo can ship a real (subset) model.
Surabhi should re-run the notebook herself on Colab GPU and beat these numbers.
"""

from __future__ import annotations

import json
import platform
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import accuracy_score, confusion_matrix, roc_auc_score
from torch.utils.data import DataLoader, Subset
from torchvision import datasets, models, transforms
from tqdm.auto import tqdm

# === Knobs matching the notebook's quick-run defaults ===
BACKBONE = "resnet18"
EPOCHS = 2
BATCH_SIZE = 64
LEARNING_RATE = 1e-3
MAX_TRAIN_SAMPLES = 4000
MAX_VAL_SAMPLES = 1000
MAX_TEST_SAMPLES = 4000  # fixed-seed subset of official test (full 32k is slow on CPU)
NUM_WORKERS = 0  # safer on memory-constrained VMs
SEED = 42

REPO = Path(__file__).resolve().parents[1]
DATA_ROOT = REPO / "pcam_data"
EXPORT_DIR = REPO / "export"
RESULTS_DIR = REPO / "results"
WEB_MODEL = REPO / "web" / "public" / "models" / "pcam_cam.onnx"

IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def set_seed(seed: int = 42) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def subset_indices(n_total: int, n_keep: int | None, seed: int) -> list[int]:
    idx = list(range(n_total))
    rng = random.Random(seed)
    rng.shuffle(idx)  # shuffle *within* the split only
    if n_keep is None or n_keep >= n_total:
        return idx
    return idx[:n_keep]


class CamClassifier(nn.Module):
    """Same structure as the notebook."""

    def __init__(self, backbone_name: str = "resnet18", pretrained: bool = True):
        super().__init__()
        self.backbone_name = backbone_name
        weights_resnet = models.ResNet18_Weights.IMAGENET1K_V1 if pretrained else None
        weights_mnet = models.MobileNet_V2_Weights.IMAGENET1K_V1 if pretrained else None

        if backbone_name == "resnet18":
            net = models.resnet18(weights=weights_resnet)
            feat_dim = net.fc.in_features
            self.features = nn.Sequential(*list(net.children())[:-2])
            self.classifier = nn.Linear(feat_dim, 1)
        elif backbone_name == "mobilenet_v2":
            net = models.mobilenet_v2(weights=weights_mnet)
            feat_dim = net.last_channel
            self.features = net.features
            self.classifier = nn.Linear(feat_dim, 1)
        else:
            raise ValueError(f"Unknown backbone: {backbone_name}")

    def forward_features(self, x: torch.Tensor) -> torch.Tensor:
        return self.features(x)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        feat = self.forward_features(x)
        pooled = F.adaptive_avg_pool2d(feat, 1).flatten(1)
        return self.classifier(pooled).squeeze(1)

    def cam_weights(self) -> torch.Tensor:
        return self.classifier.weight.squeeze(0)


class OnnxExportWrapper(nn.Module):
    def __init__(self, core: CamClassifier):
        super().__init__()
        self.core = core

    def forward(self, x: torch.Tensor):
        feat = self.core.forward_features(x)
        pooled = F.adaptive_avg_pool2d(feat, 1).flatten(1)
        logits = self.core.classifier(pooled)
        prob = torch.sigmoid(logits)
        weights = self.core.classifier.weight.squeeze(0) * 1.0
        return prob, feat, weights


@torch.no_grad()
def collect_probs(model: CamClassifier, loader: DataLoader) -> tuple[np.ndarray, np.ndarray]:
    model.eval()
    ys, ps = [], []
    for x, y in tqdm(loader, desc="eval", leave=False):
        x = x.to(DEVICE)
        logits = model(x)
        prob = torch.sigmoid(logits)
        ys.append(y.numpy())
        ps.append(prob.cpu().numpy())
    return np.concatenate(ys), np.concatenate(ps)


def epoch_train(model, loader, criterion, optimizer) -> float:
    model.train()
    total, n = 0.0, 0
    for x, y in tqdm(loader, desc="train", leave=False):
        x = x.to(DEVICE)
        y = y.float().to(DEVICE)
        optimizer.zero_grad(set_to_none=True)
        logits = model(x)
        loss = criterion(logits, y)
        loss.backward()
        optimizer.step()
        total += loss.item() * x.size(0)
        n += x.size(0)
    return total / max(n, 1)


def ensure_output_names(onnx_path: Path) -> None:
    import onnx
    import onnxruntime as ort
    from onnx import helper

    expected = ["probability", "features", "cam_weights"]
    model = onnx.load(str(onnx_path))
    current = [o.name for o in model.graph.output]
    if current != expected:
        for i, desired in enumerate(expected):
            if i >= len(model.graph.output):
                break
            old = model.graph.output[i].name
            if old == desired:
                continue
            model.graph.node.append(
                helper.make_node("Identity", inputs=[old], outputs=[desired], name=f"rename_{desired}")
            )
            model.graph.output[i].name = desired
        onnx.save_model(model, str(onnx_path), save_as_external_data=False)

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    names = [o.name for o in sess.get_outputs()]
    assert names == expected, names


def main() -> None:
    set_seed(SEED)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    print("Device:", DEVICE)
    print("Config:", BACKBONE, EPOCHS, "epochs | train", MAX_TRAIN_SAMPLES, "| val", MAX_VAL_SAMPLES, "| test", MAX_TEST_SAMPLES)

    train_tfms = transforms.Compose(
        [
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ]
    )
    eval_tfms = transforms.Compose(
        [
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ]
    )

    t_data0 = time.time()
    train_full = datasets.PCAM(root=str(DATA_ROOT), split="train", transform=train_tfms, download=False)
    val_full = datasets.PCAM(root=str(DATA_ROOT), split="val", transform=eval_tfms, download=False)
    test_full = datasets.PCAM(root=str(DATA_ROOT), split="test", transform=eval_tfms, download=False)
    print(f"Official split sizes: train={len(train_full)} val={len(val_full)} test={len(test_full)}")

    train_idx = subset_indices(len(train_full), MAX_TRAIN_SAMPLES, SEED)
    val_idx = subset_indices(len(val_full), MAX_VAL_SAMPLES, SEED + 1)
    test_idx = subset_indices(len(test_full), MAX_TEST_SAMPLES, SEED + 2)

    train_ds = Subset(train_full, train_idx)
    val_ds = Subset(val_full, val_idx)
    test_ds = Subset(test_full, test_idx)

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=NUM_WORKERS, pin_memory=False)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS)
    test_loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS)
    print("Using subsets:", len(train_ds), "train |", len(val_ds), "val |", len(test_ds), "test")
    print(f"Dataset ready in {time.time() - t_data0:.1f}s")

    model = CamClassifier(BACKBONE, pretrained=True).to(DEVICE)
    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)

    history = {"train_loss": [], "val_auc": [], "val_acc": []}
    best_val_auc = -1.0
    best_path = EXPORT_DIR / "best_model.pt"
    t_train0 = time.time()

    for epoch in range(1, EPOCHS + 1):
        t0 = time.time()
        train_loss = epoch_train(model, train_loader, criterion, optimizer)
        y_val, p_val = collect_probs(model, val_loader)
        val_auc = float(roc_auc_score(y_val, p_val))
        val_acc = float(accuracy_score(y_val, (p_val >= 0.5).astype(int)))
        history["train_loss"].append(train_loss)
        history["val_auc"].append(val_auc)
        history["val_acc"].append(val_acc)
        print(
            f"Epoch {epoch}/{EPOCHS}  loss={train_loss:.4f}  val_auc={val_auc:.4f}  "
            f"val_acc={val_acc:.4f}  ({time.time() - t0:.1f}s)"
        )
        if val_auc > best_val_auc:
            best_val_auc = val_auc
            torch.save({"model": model.state_dict(), "backbone": BACKBONE, "val_auc": val_auc}, best_path)
            print("  saved best →", best_path)

    train_seconds = time.time() - t_train0
    ckpt = torch.load(best_path, map_location=DEVICE, weights_only=False)
    model.load_state_dict(ckpt["model"])
    model.eval()
    print("Loaded best val AUC:", ckpt.get("val_auc"))

    # Test evaluation (once)
    y_true, y_prob = collect_probs(model, test_loader)
    y_pred = (y_prob >= 0.5).astype(int)
    acc = float(accuracy_score(y_true, y_pred))
    auc = float(roc_auc_score(y_true, y_prob))

    rng = np.random.default_rng(SEED)
    boot = []
    n = len(y_true)
    for _ in range(200):
        idx = rng.integers(0, n, n)
        if len(np.unique(y_true[idx])) < 2:
            continue
        boot.append(roc_auc_score(y_true[idx], y_prob[idx]))
    lo, hi = [float(x) for x in np.percentile(boot, [2.5, 97.5])]
    cm = confusion_matrix(y_true, y_pred).tolist()
    print(f"Test accuracy: {acc:.4f}")
    print(f"Test ROC-AUC:  {auc:.4f}")
    print(f"Bootstrap 95% CI for AUC: [{lo:.4f}, {hi:.4f}]  (n_boot={len(boot)})")

    # ONNX export (notebook cell)
    wrapper = OnnxExportWrapper(model).to("cpu").eval()
    dummy = torch.randn(1, 3, 96, 96)
    onnx_path = EXPORT_DIR / "pcam_cam.onnx"
    torch.onnx.export(
        wrapper,
        dummy,
        str(onnx_path),
        input_names=["input"],
        output_names=["probability", "features", "cam_weights"],
        dynamic_axes={
            "input": {0: "batch"},
            "probability": {0: "batch"},
            "features": {0: "batch"},
        },
        opset_version=18,
        dynamo=False,
    )
    sidecar = onnx_path.with_suffix(".onnx.data")
    if sidecar.exists():
        sidecar.unlink()
    ensure_output_names(onnx_path)

    WEB_MODEL.parent.mkdir(parents=True, exist_ok=True)
    WEB_MODEL.write_bytes(onnx_path.read_bytes())
    size_mb = WEB_MODEL.stat().st_size / (1024 * 1024)
    print(f"Wrote {WEB_MODEL} ({size_mb:.2f} MB)")

    meta = WEB_MODEL.parent / "MODEL_STATUS.txt"
    meta.write_text(
        "STATUS=quick_baseline\n"
        "DESCRIPTION=Quick baseline trained with Cursor's help on a PCam subset "
        f"({MAX_TRAIN_SAMPLES} train / {MAX_VAL_SAMPLES} val / {MAX_TEST_SAMPLES} test, "
        f"{EPOCHS} epochs, {BACKBONE}). To be replaced by Surabhi's own training run.\n"
        f"TEST_AUC={auc:.4f}\n"
    )

    results = {
        "run_id": "baseline_quick_run",
        "note": (
            "Quick baseline produced with Cursor's help so the live demo has a real model. "
            "Not Surabhi's final results — she should beat these numbers with her own Colab run."
        ),
        "hardware": {
            "device": str(DEVICE),
            "cuda_available": torch.cuda.is_available(),
            "platform": platform.platform(),
            "processor": platform.processor() or platform.machine(),
            "python": platform.python_version(),
            "torch": torch.__version__,
        },
        "config": {
            "backbone": BACKBONE,
            "epochs": EPOCHS,
            "batch_size": BATCH_SIZE,
            "learning_rate": LEARNING_RATE,
            "seed": SEED,
            "augmentation": ["RandomHorizontalFlip", "RandomVerticalFlip"],
            "loss": "BCEWithLogitsLoss",
            "optimizer": "Adam",
            "pretrained": "ImageNet",
            "official_splits_respected": True,
        },
        "subset_sizes": {
            "train_used": len(train_ds),
            "val_used": len(val_ds),
            "test_used": len(test_ds),
            "train_official": len(train_full),
            "val_official": len(val_full),
            "test_official": len(test_full),
            "max_train_samples_knob": MAX_TRAIN_SAMPLES,
            "max_val_samples_knob": MAX_VAL_SAMPLES,
            "max_test_samples_knob": MAX_TEST_SAMPLES,
            "test_selection": (
                f"fixed-seed random subset of official test (seed={SEED + 2}); "
                "not the full 32768-patch test split"
            ),
        },
        "runtime_seconds": {
            "train_and_val_selection": round(train_seconds, 1),
            "total_script": None,  # filled below
        },
        "metrics": {
            "best_val_auc": float(best_val_auc),
            "history": history,
            "test_accuracy": acc,
            "test_roc_auc": auc,
            "test_roc_auc_bootstrap_95ci": [lo, hi],
            "bootstrap_resamples": len(boot),
            "confusion_matrix_normal_tumor": cm,
            "decision_threshold": 0.5,
        },
        "artifacts": {
            "checkpoint": str(best_path.relative_to(REPO)),
            "onnx": str(WEB_MODEL.relative_to(REPO)),
            "onnx_size_mb": round(size_mb, 2),
        },
    }
    # total filled by caller wrapper; approximate here
    results["runtime_seconds"]["total_script"] = round(time.time() - t_data0, 1)

    out_json = RESULTS_DIR / "baseline_quick_run.json"
    out_json.write_text(json.dumps(results, indent=2) + "\n")
    print("Wrote", out_json)
    print(json.dumps({k: results["metrics"][k] for k in ("test_accuracy", "test_roc_auc", "test_roc_auc_bootstrap_95ci")}, indent=2))

    # Also refresh the web Results page data files (ROC, calibration, mistakes gallery).
    try:
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            "export_web_results", Path(__file__).resolve().parent / "export_web_results.py"
        )
        assert spec and spec.loader
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mod.main()
    except Exception as exc:  # pragma: no cover
        print("Note: could not auto-export web/public/results/metrics.json:", exc)
        print("Run: python scripts/export_web_results.py")


if __name__ == "__main__":
    main()
