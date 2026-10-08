#!/usr/bin/env python3
"""
Export a "You vs. the model" quiz pool for the React demo.

Preferred path (full PCam test split on disk):
  python scripts/export_quiz.py --data ./pcam_data/pcam

Fallback (no HDF5): reuse the committed gallery + confident-mistake PNGs and
score them with the served ONNX model so the quiz still ships offline.

Outputs
-------
  web/public/quiz/<hash>.png          patch image (neutral filename)
  web/public/quiz/<hash>_cam.png      CAM overlay
  web/src/data/quiz.json              pool + model_version
  web/public/models/model_manifest.json  (created/updated if missing)

Quiz sessions never download the ONNX file — all answers are precomputed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
OUT_DIR = REPO / "web" / "public" / "quiz"
QUIZ_JSON = REPO / "web" / "src" / "data" / "quiz.json"
MANIFEST = REPO / "web" / "public" / "models" / "model_manifest.json"
MODEL = REPO / "web" / "public" / "models" / "pcam_cam.onnx"
SAMPLES_JSON = REPO / "web" / "src" / "data" / "samples.json"
METRICS = REPO / "web" / "public" / "results" / "metrics.json"

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
PATCH = 96
MODEL_VERSION = "improved_baseline_int8_v3"
SEED = 42


def load_manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text())
    # Provisional settings until the full-PCam recalibration lands (PR C).
    data = {
        "model_version": MODEL_VERSION,
        "label": "Improved baseline",
        "threshold": 0.5,
        "uncertain_lo": 0.35,
        "uncertain_hi": 0.65,
        "calibration": {"method": "none", "note": "Raw probabilities; full calibration pending."},
        "status": "baseline",
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n")
    return data


def hash_name(test_index: int, salt: str = "pcam-quiz") -> str:
    digest = hashlib.sha256(f"{salt}:{test_index}".encode()).hexdigest()[:16]
    return digest


def image_to_tensor(arr: np.ndarray) -> np.ndarray:
    """HWC uint8 → NCHW float32 ImageNet-normalized."""
    x = arr.astype(np.float32) / 255.0
    x = (x - IMAGENET_MEAN) / IMAGENET_STD
    x = np.transpose(x, (2, 0, 1))[None, ...]
    return x.astype(np.float32)


def compute_cam(features: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """features [C,H,W], weights [C] → HxW in [0,1]."""
    cam = np.tensordot(weights, features, axes=(0, 0))
    cam = np.maximum(cam, 0)
    lo, hi = float(cam.min()), float(cam.max())
    if hi - lo < 1e-8:
        return np.zeros_like(cam, dtype=np.float32)
    return ((cam - lo) / (hi - lo)).astype(np.float32)


def jet_overlay(cam: np.ndarray, size: int = PATCH, alpha: float = 0.55) -> Image.Image:
    """Upsample CAM and paint a translucent jet-ish RGBA overlay."""
    cam_img = Image.fromarray((cam * 255).astype(np.uint8), mode="L").resize(
        (size, size), Image.BILINEAR
    )
    c = np.asarray(cam_img).astype(np.float32) / 255.0
    # Simple blue→cyan→yellow→red ramp
    r = np.clip(1.5 * c - 0.25, 0, 1)
    g = np.clip(1.5 - abs(2 * c - 1) * 1.5, 0, 1)
    b = np.clip(1.25 - 1.5 * c, 0, 1)
    a = (c * alpha * 255).astype(np.uint8)
    rgba = np.stack([(r * 255).astype(np.uint8), (g * 255).astype(np.uint8), (b * 255).astype(np.uint8), a], axis=-1)
    return Image.fromarray(rgba, mode="RGBA")


def run_onnx(session, arr: np.ndarray) -> tuple[float, np.ndarray]:
    tensor = image_to_tensor(arr)
    outs = session.run(None, {"input": tensor})
    # Contract: probability, features, cam_weights
    prob = float(np.asarray(outs[0]).reshape(-1)[0])
    features = np.asarray(outs[1])  # [1,C,H,W] or [C,H,W]
    weights = np.asarray(outs[2]).reshape(-1)
    if features.ndim == 4:
        features = features[0]
    cam = compute_cam(features, weights)
    return prob, cam


def verdict_for(p: float, t: float, lo: float, hi: float) -> str:
    if lo <= p <= hi:
        return "uncertain"
    return "tumor" if p >= t else "normal"


def stratum_for(label: int, p: float, t: float, lo: float, hi: float) -> str:
    v = verdict_for(p, t, lo, hi)
    truth = "tumor" if label else "normal"
    if v == "uncertain":
        return "uncertain"
    pred = "tumor" if p >= t else "normal"
    if pred == truth:
        return "confident_correct"
    return "model_error"


def collect_fallback_items() -> list[dict]:
    """Build a local pool from gallery patches + confident mistakes."""
    items: list[dict] = []
    samples = json.loads(SAMPLES_JSON.read_text())
    for s in samples["samples"]:
        if s.get("kind") != "patch":
            continue
        items.append(
            {
                "testIndex": int(s["testIndex"]),
                "label": 1 if s["groundTruthTumor"] else 0,
                "src": REPO / "web" / "public" / s["src"],
                "bucket_hint": None,
            }
        )
    metrics = json.loads(METRICS.read_text())
    for m in metrics.get("mistakes", []):
        items.append(
            {
                "testIndex": int(m["testIndex"]),
                "label": 1 if m["trueLabel"] == "tumor" else 0,
                "src": REPO / "web" / "public" / m["src"],
                "bucket_hint": "model_error",
            }
        )
    # Deduplicate by testIndex
    seen: set[int] = set()
    uniq = []
    for it in items:
        if it["testIndex"] in seen:
            continue
        seen.add(it["testIndex"])
        uniq.append(it)
    return uniq


def try_pcam_pool(data_dir: Path, n: int = 60) -> list[dict] | None:
    x_path = data_dir / "camelyonpatch_level_2_split_test_x.h5"
    y_path = data_dir / "camelyonpatch_level_2_split_test_y.h5"
    if not x_path.exists() or not y_path.exists():
        return None
    import h5py

    with h5py.File(y_path, "r") as yf:
        labels = np.asarray(yf["y"]).reshape(-1).astype(np.int64)
    rng = np.random.default_rng(SEED)
    tumor = np.flatnonzero(labels == 1)
    normal = np.flatnonzero(labels == 0)
    # Exclude gallery / mistake indices
    exclude = {it["testIndex"] for it in collect_fallback_items()}
    tumor = np.array([i for i in tumor if i not in exclude])
    normal = np.array([i for i in normal if i not in exclude])
    n_each = n // 2
    pick_t = sorted(rng.choice(tumor, size=min(n_each, len(tumor)), replace=False).tolist())
    pick_n = sorted(rng.choice(normal, size=min(n_each, len(normal)), replace=False).tolist())
    items = []
    with h5py.File(x_path, "r") as xf:
        for idx in pick_t + pick_n:
            arr = np.asarray(xf["x"][idx])
            items.append({"testIndex": int(idx), "label": int(labels[idx]), "arr": arr, "bucket_hint": None})
    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=REPO / "pcam_data" / "pcam")
    args = ap.parse_args()

    import onnxruntime as ort

    manifest = load_manifest()
    t = float(manifest["threshold"])
    lo = float(manifest["uncertain_lo"])
    hi = float(manifest["uncertain_hi"])
    version = manifest["model_version"]

    session = ort.InferenceSession(str(MODEL), providers=["CPUExecutionProvider"])

    pcam_items = try_pcam_pool(args.data)
    source = "pcam_test_h5"
    if pcam_items is None:
        print("PCam HDF5 not found — using gallery + mistake fallback pool.")
        source = "gallery_and_mistakes_fallback"
        raw = collect_fallback_items()
        items = []
        for it in raw:
            arr = np.asarray(Image.open(it["src"]).convert("RGB"))
            if arr.shape[0] != PATCH or arr.shape[1] != PATCH:
                arr = np.asarray(Image.fromarray(arr).resize((PATCH, PATCH), Image.BILINEAR))
            items.append({**it, "arr": arr})
    else:
        items = pcam_items

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # Clear previous quiz pngs
    for old in OUT_DIR.glob("*.png"):
        old.unlink()

    pool = []
    for it in items:
        prob, cam = run_onnx(session, it["arr"])
        stratum = it.get("bucket_hint") or stratum_for(it["label"], prob, t, lo, hi)
        # If hint was model_error but model now agrees, keep scored stratum
        if it.get("bucket_hint") == "model_error":
            stratum = stratum_for(it["label"], prob, t, lo, hi)
        name = hash_name(it["testIndex"])
        img_path = OUT_DIR / f"{name}.png"
        cam_path = OUT_DIR / f"{name}_cam.png"
        Image.fromarray(it["arr"]).save(img_path, optimize=True)
        # Composite CAM over patch for reveal
        base = Image.fromarray(it["arr"]).convert("RGBA")
        overlay = jet_overlay(cam)
        composed = Image.alpha_composite(base, overlay).convert("RGB")
        composed.save(cam_path, optimize=True)
        pool.append(
            {
                "id": name,
                "testIndex": it["testIndex"],
                "label": "tumor" if it["label"] else "normal",
                "probability": round(float(prob), 6),
                "verdict": verdict_for(prob, t, lo, hi),
                "stratum": stratum,
                "src": f"quiz/{name}.png",
                "camSrc": f"quiz/{name}_cam.png",
            }
        )

    quiz = {
        "schema_version": 1,
        "model_version": version,
        "threshold": t,
        "uncertain_lo": lo,
        "uncertain_hi": hi,
        "seed_default": SEED,
        "session_size": 10,
        "source": source,
        "disclaimer": (
            "This set deliberately includes patches the model gets wrong. "
            "It does not measure model accuracy or medical skill. Educational only — "
            "not for clinical use. Answers never leave your browser."
        ),
        "pool": pool,
    }
    QUIZ_JSON.parent.mkdir(parents=True, exist_ok=True)
    QUIZ_JSON.write_text(json.dumps(quiz, indent=2) + "\n")
    print(f"Wrote {len(pool)} quiz items → {QUIZ_JSON}")
    print(f"Assets in {OUT_DIR}")
    by = {}
    for p in pool:
        by.setdefault(f"{p['label']}/{p['stratum']}", 0)
        by[f"{p['label']}/{p['stratum']}"] += 1
    for k, v in sorted(by.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
