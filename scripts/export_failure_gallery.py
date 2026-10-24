#!/usr/bin/env python3
"""
Export the most confident false negatives and false positives from the PCam
test set under the shipped INT8 model (Platt-calibrated), with CAM overlays.
"""

from __future__ import annotations

import json
from pathlib import Path

import h5py
import numpy as np
import onnxruntime as ort
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
DATA = REPO / "pcam_data" / "pcam"
ONNX = REPO / "web" / "public" / "models" / "pcam_cam.onnx"
NPZ = REPO / "results" / "full_pcam_int8_v1_test_scores.npz"
OUT_DIR = REPO / "web" / "public" / "results" / "failures"
MANIFEST = REPO / "web" / "public" / "results" / "failure_gallery.json"

N_EACH = 8
PATCH = 96
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 3, 1, 1)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 3, 1, 1)


def heatmap_color(t: float) -> tuple[int, int, int]:
    x = max(0.0, min(1.0, t))
    if x < 0.25:
        u = x / 0.25
        return (0, int(64 + 191 * u), 255)
    if x < 0.5:
        u = (x - 0.25) / 0.25
        return (0, 255, int(255 * (1 - u)))
    if x < 0.75:
        u = (x - 0.5) / 0.25
        return (int(255 * u), 255, 0)
    u = (x - 0.75) / 0.25
    return (255, int(255 * (1 - u)), 0)


def compute_cam(features: np.ndarray, weights: np.ndarray) -> np.ndarray:
    # features: C,H,W
    cam = np.tensordot(weights, features, axes=(0, 0))
    cam = np.maximum(cam, 0)
    mn, mx = float(cam.min()), float(cam.max())
    if mx - mn < 1e-8:
        return np.zeros_like(cam)
    return (cam - mn) / (mx - mn)


def upsample_cam(cam: np.ndarray, size: int = PATCH) -> np.ndarray:
    img = Image.fromarray((cam * 255).astype(np.uint8), mode="L")
    img = img.resize((size, size), Image.BILINEAR)
    return np.asarray(img).astype(np.float32) / 255.0


def overlay(patch: np.ndarray, cam: np.ndarray, alpha: float = 0.45) -> np.ndarray:
    out = patch.astype(np.float32).copy()
    for y in range(PATCH):
        for x in range(PATCH):
            v = float(cam[y, x])
            r, g, b = heatmap_color(v)
            a = alpha * v
            out[y, x, 0] = (1 - a) * out[y, x, 0] + a * r
            out[y, x, 1] = (1 - a) * out[y, x, 1] + a * g
            out[y, x, 2] = (1 - a) * out[y, x, 2] + a * b
    return np.clip(out, 0, 255).astype(np.uint8)


def main() -> None:
    data = np.load(NPZ)
    y = data["y"].astype(np.int64)
    p = data["calibrated"].astype(np.float64)
    thr = float(data["threshold"])

    pred = (p >= thr).astype(np.int64)
    fn_mask = (y == 1) & (pred == 0)
    fp_mask = (y == 0) & (pred == 1)

    # Most confident FN: tumor, but low score (sort ascending)
    fn_idx = np.flatnonzero(fn_mask)
    fn_idx = fn_idx[np.argsort(p[fn_idx])][:N_EACH]

    # Most confident FP: normal, but high score (sort descending)
    fp_idx = np.flatnonzero(fp_mask)
    fp_idx = fp_idx[np.argsort(-p[fp_idx])][:N_EACH]

    sess = ort.InferenceSession(str(ONNX), providers=["CPUExecutionProvider"])
    in_name = sess.get_inputs()[0].name

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.png"):
        old.unlink()

    entries = []
    x_path = DATA / "camelyonpatch_level_2_split_test_x.h5"
    with h5py.File(x_path, "r") as fx:
        for kind, indices in (("fn", fn_idx), ("fp", fp_idx)):
            for rank, idx in enumerate(indices):
                patch = np.asarray(fx["x"][int(idx)])  # HWC uint8
                tensor = patch.astype(np.float32) / 255.0
                tensor = np.transpose(tensor, (2, 0, 1))[None, ...]
                tensor = (tensor - IMAGENET_MEAN) / IMAGENET_STD
                prob, feats, weights = sess.run(
                    ["probability", "features", "cam_weights"], {in_name: tensor}
                )
                cam = compute_cam(feats[0], weights)
                cam_up = upsample_cam(cam)
                heat = overlay(patch, cam_up)

                base = f"{kind}_{rank:02d}_idx{int(idx)}"
                patch_name = f"{base}_patch.png"
                heat_name = f"{base}_heatmap.png"
                # Keep images small
                Image.fromarray(patch).resize((96, 96), Image.NEAREST).save(
                    OUT_DIR / patch_name, optimize=True
                )
                Image.fromarray(heat).resize((96, 96), Image.NEAREST).save(
                    OUT_DIR / heat_name, optimize=True
                )

                entries.append(
                    {
                        "kind": kind,
                        "testIndex": int(idx),
                        "trueLabel": "tumor" if y[idx] == 1 else "normal",
                        "score": float(p[idx]),
                        "rawScore": float(data["raw"][idx]),
                        "threshold": thr,
                        "patch": f"results/failures/{patch_name}",
                        "heatmap": f"results/failures/{heat_name}",
                        "captionPlaceholder": "[Student note: write your own observation here.]",
                    }
                )
                print(
                    f"{kind} rank={rank} idx={idx} score={p[idx]:.4f} "
                    f"onnx_raw={float(prob.reshape(-1)[0]):.4f}"
                )

    manifest = {
        "model_version": "full_pcam_int8_v1",
        "threshold": thr,
        "n_false_negatives": N_EACH,
        "n_false_positives": N_EACH,
        "selection": (
            "Most confident false negatives = true tumor with the lowest calibrated scores "
            "below the threshold. Most confident false positives = true normal with the "
            "highest calibrated scores at or above the threshold. Official PCam test split."
        ),
        "credit": (
            "Patches from PatchCamelyon (PCam), CC0. Cite Veeling et al. 2018 and "
            "Bejnordi et al. 2017 / Camelyon16."
        ),
        "disclaimer": "Educational research only, not for clinical use.",
        "items": entries,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print("Wrote", MANIFEST)
    print("Wrote", OUT_DIR)


if __name__ == "__main__":
    main()
