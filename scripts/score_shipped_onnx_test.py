#!/usr/bin/env python3
"""
Score the shipped INT8 ONNX model on the official PCam test split.

Produces:
  - Console summary vs published full_retrain_metrics.json numbers
  - Optional: npz of per-patch scores (raw + calibrated)
  - Used by companion scripts for stain / failures / cutoff tables

Requires:
  pcam_data/pcam/camelyonpatch_level_2_split_test_{x,y}.h5
  web/public/models/pcam_cam.onnx
  web/public/models/calibration.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import h5py
import numpy as np
import onnxruntime as ort
from sklearn.metrics import accuracy_score, roc_auc_score
from tqdm import tqdm

REPO = Path(__file__).resolve().parents[1]
DATA = REPO / "pcam_data" / "pcam"
ONNX = REPO / "web" / "public" / "models" / "pcam_cam.onnx"
CALIB = REPO / "web" / "public" / "models" / "calibration.json"
METRICS = REPO / "web" / "public" / "results" / "full_retrain_metrics.json"

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 3, 1, 1)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 3, 1, 1)


def load_calib() -> dict:
    return json.loads(CALIB.read_text())


def platt(p: np.ndarray, a: float, b: float) -> np.ndarray:
    p = np.clip(p.astype(np.float64), 1e-7, 1 - 1e-7)
    z = np.log(p / (1 - p))
    return 1.0 / (1.0 + np.exp(-(a * z + b)))


def preprocess_batch(x_uint8: np.ndarray) -> np.ndarray:
    # x: NHWC uint8 -> NCHW float ImageNet-normalized
    x = x_uint8.astype(np.float32) / 255.0
    x = np.transpose(x, (0, 3, 1, 2))
    return (x - IMAGENET_MEAN) / IMAGENET_STD


def confusion(y: np.ndarray, p: np.ndarray, thr: float) -> dict:
    pred = (p >= thr).astype(np.int64)
    tn = int(((y == 0) & (pred == 0)).sum())
    fp = int(((y == 0) & (pred == 1)).sum())
    fn = int(((y == 1) & (pred == 0)).sum())
    tp = int(((y == 1) & (pred == 1)).sum())
    sens = tp / max(tp + fn, 1)
    spec = tn / max(tn + fp, 1)
    acc = (tp + tn) / max(len(y), 1)
    return {
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "tp": tp,
        "sensitivity": sens,
        "specificity": spec,
        "accuracy": acc,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--limit", type=int, default=0, help="If >0, score only first N (smoke)")
    ap.add_argument(
        "--out-npz",
        type=Path,
        default=REPO / "results" / "full_pcam_int8_v1_test_scores.npz",
    )
    args = ap.parse_args()

    x_path = DATA / "camelyonpatch_level_2_split_test_x.h5"
    y_path = DATA / "camelyonpatch_level_2_split_test_y.h5"
    if not x_path.exists() or not y_path.exists():
        raise SystemExit(f"Missing PCam test h5 under {DATA}")

    calib = load_calib()
    a, b = float(calib["platt_a"]), float(calib["platt_b"])
    thr = float(calib["threshold"])

    sess = ort.InferenceSession(str(ONNX), providers=["CPUExecutionProvider"])
    in_name = sess.get_inputs()[0].name

    with h5py.File(y_path, "r") as fy:
        y = np.asarray(fy["y"]).reshape(-1).astype(np.int64)
    n = len(y) if args.limit <= 0 else min(args.limit, len(y))
    y = y[:n]

    raw = np.zeros(n, dtype=np.float32)
    with h5py.File(x_path, "r") as fx:
        for start in tqdm(range(0, n, args.batch_size), desc="score"):
            end = min(start + args.batch_size, n)
            batch = np.asarray(fx["x"][start:end])
            tensor = preprocess_batch(batch)
            out = sess.run(["probability"], {in_name: tensor})[0]
            raw[start:end] = out.reshape(-1)

    cal = platt(raw, a, b).astype(np.float32)
    auc_raw = float(roc_auc_score(y, raw))
    auc_cal = float(roc_auc_score(y, cal))
    cm05 = confusion(y, raw, 0.5)
    cm_youden = confusion(y, cal, thr)

    print("=== Shipped ONNX (INT8) on official test ===")
    print(f"n={n}")
    print(f"raw AUC={auc_raw:.6f}  acc@0.5={cm05['accuracy']:.6f}")
    print(
        f"calibrated AUC={auc_cal:.6f}  @t={thr:.4f}: "
        f"acc={cm_youden['accuracy']:.6f} sens={cm_youden['sensitivity']:.6f} "
        f"spec={cm_youden['specificity']:.6f}"
    )
    print(
        f"confusion @t*: TP={cm_youden['tp']} FN={cm_youden['fn']} "
        f"FP={cm_youden['fp']} TN={cm_youden['tn']}"
    )

    if METRICS.exists():
        m = json.loads(METRICS.read_text())
        pub_auc = m["test_calibrated_at_youden"]["auc"]
        pub_int8_auc = m["onnx"]["int8_test_auc_raw"]
        pub_int8_acc = m["onnx"]["int8_test_acc_raw_0p5"]
        print("--- vs published ---")
        print(f"published PyTorch AUC={pub_auc:.6f} (ranking; calib does not change AUC order)")
        print(f"published INT8 raw AUC={pub_int8_auc:.6f}  ours={auc_raw:.6f}  Δ={auc_raw - pub_int8_auc:+.6f}")
        print(f"published INT8 acc@0.5={pub_int8_acc:.6f}  ours={cm05['accuracy']:.6f}")

    args.out_npz.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.out_npz,
        y=y,
        raw=raw,
        calibrated=cal,
        platt_a=a,
        platt_b=b,
        threshold=thr,
        uncertain_lo=float(calib["uncertain_lo"]),
        uncertain_hi=float(calib["uncertain_hi"]),
        model_version="full_pcam_int8_v1",
        auc_raw=auc_raw,
        auc_calibrated=auc_cal,
    )
    print("Wrote", args.out_npz)


if __name__ == "__main__":
    main()
