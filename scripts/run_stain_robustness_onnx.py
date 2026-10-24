#!/usr/bin/env python3
"""
Stain / colour robustness on the shipped INT8 ONNX model (full_pcam_int8_v1).

Same perturbations as run_stain_robustness.py, evaluated on a fixed-seed subset
of the official PCam test split. Uses ONNX Runtime instead of a .pt checkpoint.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import h5py
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import onnxruntime as ort
from PIL import Image
from sklearn.metrics import accuracy_score, roc_auc_score
from torchvision.transforms import functional as TF
from tqdm import tqdm

REPO = Path(__file__).resolve().parents[1]
DATA = REPO / "pcam_data" / "pcam"
ONNX = REPO / "web" / "public" / "models" / "pcam_cam.onnx"
CALIB = REPO / "web" / "public" / "models" / "calibration.json"
RESULTS_DIR = REPO / "results"
WEB_RESULTS = REPO / "web" / "public" / "results"

SEED = 42
INDEX_SEED = 49  # same as prior experiment
MAX_EVAL = 4000  # larger than the earlier 2000-patch subset
BATCH_SIZE = 64
DECISION_THRESHOLD = 0.5  # raw ONNX probability (matches prior report)

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 3, 1, 1)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 3, 1, 1)

PERTURBATIONS = [
    "clean",
    "mild_color_jitter",
    "strong_color_jitter",
    "he_channel_scale",
    "hue_shift_warm",
    "hue_shift_cool",
]


def apply_perturbation(img: Image.Image, name: str, rng: random.Random) -> Image.Image:
    if name == "clean":
        return img
    if name == "mild_color_jitter":
        return TF.adjust_brightness(
            TF.adjust_contrast(
                TF.adjust_saturation(
                    TF.adjust_hue(img, rng.uniform(-0.04, 0.04)),
                    rng.uniform(0.85, 1.15),
                ),
                rng.uniform(0.9, 1.1),
            ),
            rng.uniform(0.9, 1.1),
        )
    if name == "strong_color_jitter":
        return TF.adjust_brightness(
            TF.adjust_contrast(
                TF.adjust_saturation(
                    TF.adjust_hue(img, rng.uniform(-0.08, 0.08)),
                    rng.uniform(0.65, 1.35),
                ),
                rng.uniform(0.75, 1.25),
            ),
            rng.uniform(0.8, 1.2),
        )
    if name == "he_channel_scale":
        arr = np.asarray(img).astype(np.float32)
        h_scale = rng.uniform(0.75, 1.25)
        e_scale = rng.uniform(0.75, 1.25)
        out = arr.copy()
        out[..., 0] = np.clip(arr[..., 0] * e_scale, 0, 255)
        out[..., 1] = np.clip(arr[..., 1] * (0.5 * h_scale + 0.5 * e_scale), 0, 255)
        out[..., 2] = np.clip(arr[..., 2] * h_scale, 0, 255)
        return Image.fromarray(out.astype(np.uint8))
    if name == "hue_shift_warm":
        return TF.adjust_hue(img, 0.06)
    if name == "hue_shift_cool":
        return TF.adjust_hue(img, -0.06)
    raise ValueError(name)


def subset_indices(n_total: int, n_keep: int, seed: int) -> list[int]:
    idx = list(range(n_total))
    rng = random.Random(seed)
    rng.shuffle(idx)
    return idx[:n_keep]


def to_tensor_batch(pils: list[Image.Image]) -> np.ndarray:
    arr = np.stack([np.asarray(p, dtype=np.uint8) for p in pils], axis=0)
    x = arr.astype(np.float32) / 255.0
    x = np.transpose(x, (0, 3, 1, 2))
    return (x - IMAGENET_MEAN) / IMAGENET_STD


def main() -> None:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    WEB_RESULTS.mkdir(parents=True, exist_ok=True)

    x_path = DATA / "camelyonpatch_level_2_split_test_x.h5"
    y_path = DATA / "camelyonpatch_level_2_split_test_y.h5"
    with h5py.File(y_path, "r") as fy:
        y_all = np.asarray(fy["y"]).reshape(-1).astype(np.int64)
    idx = subset_indices(len(y_all), MAX_EVAL, INDEX_SEED)
    y = y_all[idx]

    sess = ort.InferenceSession(str(ONNX), providers=["CPUExecutionProvider"])
    in_name = sess.get_inputs()[0].name

    # Load selected patches once as PIL
    with h5py.File(x_path, "r") as fx:
        patches = [Image.fromarray(np.asarray(fx["x"][i])) for i in tqdm(idx, desc="load")]

    rows = []
    clean_probs = None

    for name in PERTURBATIONS:
        probs = np.zeros(len(patches), dtype=np.float32)
        for start in range(0, len(patches), BATCH_SIZE):
            end = min(start + BATCH_SIZE, len(patches))
            batch_imgs = []
            for j, base in enumerate(patches[start:end]):
                rng = random.Random(SEED + (start + j) * 17)
                batch_imgs.append(apply_perturbation(base, name, rng))
            tensor = to_tensor_batch(batch_imgs)
            out = sess.run(["probability"], {in_name: tensor})[0]
            probs[start:end] = out.reshape(-1)

        pred = (probs >= DECISION_THRESHOLD).astype(int)
        acc = float(accuracy_score(y, pred))
        auc = float(roc_auc_score(y, probs))
        row = {
            "perturbation": name,
            "n": int(len(y)),
            "accuracy": acc,
            "roc_auc": auc,
            "mean_probability": float(probs.mean()),
        }
        if name == "clean":
            clean_probs = probs
            row["delta_accuracy_vs_clean"] = 0.0
            row["delta_auc_vs_clean"] = 0.0
            row["mean_abs_prob_delta_vs_clean"] = 0.0
        else:
            assert clean_probs is not None
            row["delta_accuracy_vs_clean"] = acc - rows[0]["accuracy"]
            row["delta_auc_vs_clean"] = auc - rows[0]["roc_auc"]
            row["mean_abs_prob_delta_vs_clean"] = float(np.mean(np.abs(probs - clean_probs)))
        rows.append(row)
        print(
            f"{name:22s}  acc={acc:.4f}  auc={auc:.4f}  "
            f"Δacc={row['delta_accuracy_vs_clean']:+.4f}  Δauc={row['delta_auc_vs_clean']:+.4f}"
        )

    # Plots
    fig, ax = plt.subplots(figsize=(8, 4.2))
    names = [r["perturbation"] for r in rows]
    aucs = [r["roc_auc"] for r in rows]
    colors = ["#9B5654" if n == "clean" else "#6B5B4F" for n in names]
    ax.bar(range(len(names)), aucs, color=colors)
    ax.set_xticks(range(len(names)))
    ax.set_xticklabels(names, rotation=25, ha="right", fontsize=8)
    ax.set_ylabel("ROC-AUC")
    ax.set_ylim(0.5, 1.0)
    ax.set_title("Stain / colour robustness — full_pcam_int8_v1 (official test subset)")
    ax.axhline(aucs[0], color="#9B5654", linestyle="--", linewidth=1, alpha=0.6)
    fig.tight_layout()
    plot_path = RESULTS_DIR / "stain_robustness_auc.png"
    fig.savefig(plot_path, dpi=140)
    fig.savefig(WEB_RESULTS / "stain_robustness_auc.png", dpi=140)
    plt.close(fig)

    fig2, axes = plt.subplots(2, 4, figsize=(8, 4))
    for col in range(4):
        pil = patches[col]
        strong = apply_perturbation(pil, "strong_color_jitter", random.Random(SEED + col))
        axes[0, col].imshow(pil)
        axes[0, col].set_title("clean", fontsize=8)
        axes[0, col].axis("off")
        axes[1, col].imshow(strong)
        axes[1, col].set_title("strong jitter", fontsize=8)
        axes[1, col].axis("off")
    fig2.suptitle("Example H&E colour perturbations (illustrative)", fontsize=10)
    fig2.tight_layout()
    mosaic_path = RESULTS_DIR / "stain_robustness_examples.png"
    fig2.savefig(mosaic_path, dpi=140)
    fig2.savefig(WEB_RESULTS / "stain_robustness_examples.png", dpi=140)
    plt.close(fig2)

    method = (
        "Held-out fixed-seed subset of the official PCam test split. "
        "Perturbations: mild/strong ColorJitter (hue/saturation/brightness/contrast), "
        "approximate H&E RGB channel scaling, and fixed warm/cool hue shifts. "
        "Not full Macenko or Vahadane stain normalization — those were out of scope; "
        "a simpler colour jitter is used instead."
    )

    report = {
        "experiment": "stain_colour_robustness",
        "model_version": "full_pcam_int8_v1",
        "method": method,
        "knobs": {
            "max_eval_samples": MAX_EVAL,
            "seed": SEED,
            "index_seed": INDEX_SEED,
            "batch_size": BATCH_SIZE,
            "decision_threshold": DECISION_THRESHOLD,
            "backbone": "resnet18",
            "onnx": str(ONNX.relative_to(REPO)),
            "source_run_id": "full_pcam_int8_v1",
        },
        "what_was_tested": [
            "mild_color_jitter",
            "strong_color_jitter",
            "he_channel_scale (RGB approximation)",
            "hue_shift_warm / hue_shift_cool",
        ],
        "what_was_not_tested": [
            "Macenko stain normalization",
            "Vahadane stain separation",
            "scanner-specific colour profiles",
            "cross-lab external cohorts",
        ],
        "rows": rows,
        "artifacts": {
            "auc_plot": str(plot_path.relative_to(REPO)),
            "examples_plot": str(mosaic_path.relative_to(REPO)),
        },
    }

    json_path = RESULTS_DIR / "stain_robustness.json"
    json_path.write_text(json.dumps(report, indent=2) + "\n")

    md_lines = [
        "# Stain / colour robustness",
        "",
        "> Educational research check, not a clinical validation.",
        "",
        "## Method",
        "",
        method,
        "",
        f"- Evaluation subset: **{MAX_EVAL}** patches from the official PCam **test** split "
        f"(fixed seed `{INDEX_SEED}`; within-split shuffle only).",
        f"- Model: shipped `web/public/models/pcam_cam.onnx` (`full_pcam_int8_v1`, ResNet-18 INT8).",
        f"- Decision threshold: {DECISION_THRESHOLD} on raw ONNX probability.",
        "",
        "## Settings",
        "",
        "```json",
        json.dumps(report["knobs"], indent=2),
        "```",
        "",
        "## Results",
        "",
        "| Perturbation | Accuracy | ROC-AUC | Δ Acc vs clean | Δ AUC vs clean | Mean |ΔP| vs clean |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for r in rows:
        md_lines.append(
            f"| `{r['perturbation']}` | {r['accuracy']:.4f} | {r['roc_auc']:.4f} | "
            f"{r['delta_accuracy_vs_clean']:+.4f} | {r['delta_auc_vs_clean']:+.4f} | "
            f"{r['mean_abs_prob_delta_vs_clean']:.4f} |"
        )
    md_lines.extend(
        [
            "",
            f"![AUC by perturbation]({plot_path.name})",
            "",
            f"![Example perturbations]({mosaic_path.name})",
            "",
            "## What this does *not* cover",
            "",
        ]
    )
    for item in report["what_was_not_tested"]:
        md_lines.append(f"- {item}")
    md_lines.extend(
        [
            "",
            "## Takeaway",
            "",
            "If AUC or accuracy drops under strong colour / H&E-ish shifts, the model is partly "
            "relying on stain appearance rather than morphology alone. Mild shifts should stay "
            "closer to clean performance.",
            "",
        ]
    )
    md_path = RESULTS_DIR / "stain_robustness.md"
    md_path.write_text("\n".join(md_lines) + "\n")

    summary = {
        "label": "Stain and colour checks (full_pcam_int8_v1)",
        "disclaimer": (
            "Colour jitter and approximate H&E RGB scaling on a held-out official-test subset, "
            "not Macenko/Vahadane or external labs. Run on the live INT8 model. Educational only."
        ),
        "model_version": "full_pcam_int8_v1",
        "n": MAX_EVAL,
        "rows": [
            {
                "perturbation": r["perturbation"],
                "accuracy": r["accuracy"],
                "roc_auc": r["roc_auc"],
                "delta_auc_vs_clean": r["delta_auc_vs_clean"],
            }
            for r in rows
        ],
        "plots": {
            "auc": "results/stain_robustness_auc.png",
            "examples": "results/stain_robustness_examples.png",
        },
    }
    summary_path = WEB_RESULTS / "stain_robustness_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n")
    print("Wrote", json_path)
    print("Wrote", md_path)
    print("Wrote", summary_path)


if __name__ == "__main__":
    main()
