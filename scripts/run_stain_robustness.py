#!/usr/bin/env python3
"""
Stain / colour robustness check on a held-out official-test subset.

Completes the notebook §8 stub with a scripted, reproducible experiment.
Uses principled H&E-aware colour jitter (hue/saturation/brightness/contrast) plus a
simple hematoxylin–eosin channel scaling in RGB approximation — not full Macenko /
Vahadane stain separation (those libraries are heavier; limits are documented in the report).

Requires export/best_model.pt from a prior training run.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from sklearn.metrics import accuracy_score, roc_auc_score
from torch.utils.data import DataLoader, Dataset, Subset
from torchvision import datasets, models, transforms
from torchvision.transforms import functional as TF

REPO = Path(__file__).resolve().parents[1]
DATA_ROOT = REPO / "pcam_data"
CKPT = REPO / "export" / "best_model.pt"
RESULTS_DIR = REPO / "results"
WEB_RESULTS = REPO / "web" / "public" / "results"
FULLER_JSON = RESULTS_DIR / "baseline_fuller_run.json"
QUICK_JSON = RESULTS_DIR / "baseline_quick_run.json"

SEED = 42
MAX_EVAL = 2000  # held-out official-test subset for this experiment
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


class PerturbedPCAM(Dataset):
    """Wrap a PIL-returning PCAM subset and apply a named perturbation before normalize."""

    def __init__(self, base: Subset, perturb_name: str, seed: int):
        self.base = base
        self.perturb_name = perturb_name
        self.seed = seed

    def __len__(self) -> int:
        return len(self.base)

    def __getitem__(self, i: int):
        # Force PIL path: underlying PCAM with ToTensor would already be tensor;
        # we construct base with transform=None / identity and convert here.
        img, y = self.base[i]
        if isinstance(img, torch.Tensor):
            arr = (img.permute(1, 2, 0).numpy() * 255).clip(0, 255).astype(np.uint8)
            img = Image.fromarray(arr)
        elif not isinstance(img, Image.Image):
            img = Image.fromarray(np.asarray(img))

        rng = random.Random(self.seed + i * 17)
        img = apply_perturbation(img, self.perturb_name, rng)
        t = transforms.Compose(
            [
                transforms.ToTensor(),
                transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
            ]
        )
        return t(img), y


def apply_perturbation(img: Image.Image, name: str, rng: random.Random) -> Image.Image:
    """Apply a named stain-/colour-shift. Documented in the markdown report."""
    if name == "clean":
        return img

    if name == "mild_color_jitter":
        # Mild H&E-ish colour jitter
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
        # Approximate H&E channel scaling in RGB: boost/attenuate purple-blue (H)
        # vs pink-red (E) axes without a full stain matrix decomposition.
        arr = np.asarray(img).astype(np.float32)
        h_scale = rng.uniform(0.75, 1.25)  # hematoxylin-ish (B/G)
        e_scale = rng.uniform(0.75, 1.25)  # eosin-ish (R)
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


PERTURBATIONS = [
    "clean",
    "mild_color_jitter",
    "strong_color_jitter",
    "he_channel_scale",
    "hue_shift_warm",
    "hue_shift_cool",
]


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


def main() -> None:
    if not CKPT.exists():
        raise SystemExit(f"Missing checkpoint {CKPT}")

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    WEB_RESULTS.mkdir(parents=True, exist_ok=True)

    meta = {}
    for p in (FULLER_JSON, QUICK_JSON):
        if p.exists():
            meta = json.loads(p.read_text())
            break

    ckpt = torch.load(CKPT, map_location=DEVICE, weights_only=False)
    backbone = ckpt.get("backbone", "resnet18")
    model = CamClassifier(backbone, pretrained=False).to(DEVICE)
    model.load_state_dict(ckpt["model"])
    model.eval()

    # Raw PIL patches from official test split
    test_full = datasets.PCAM(root=str(DATA_ROOT), split="test", transform=None, download=False)
    # Use a different seed offset than the main test eval so this is a complementary held-out look
    idx = subset_indices(len(test_full), MAX_EVAL, SEED + 7)
    base = Subset(test_full, idx)

    rows = []
    clean_probs = None
    clean_y = None

    for name in PERTURBATIONS:
        ds = PerturbedPCAM(base, name, seed=SEED)
        loader = DataLoader(ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)
        y_true, y_prob = collect(model, loader)
        y_pred = (y_prob >= 0.5).astype(int)
        acc = float(accuracy_score(y_true, y_pred))
        auc = float(roc_auc_score(y_true, y_prob))
        mean_p = float(y_prob.mean())
        row = {
            "perturbation": name,
            "n": int(len(y_true)),
            "accuracy": acc,
            "roc_auc": auc,
            "mean_probability": mean_p,
        }
        if name == "clean":
            clean_probs = y_prob
            clean_y = y_true
            row["delta_accuracy_vs_clean"] = 0.0
            row["delta_auc_vs_clean"] = 0.0
            row["mean_abs_prob_delta_vs_clean"] = 0.0
        else:
            assert clean_probs is not None
            row["delta_accuracy_vs_clean"] = acc - rows[0]["accuracy"]
            row["delta_auc_vs_clean"] = auc - rows[0]["roc_auc"]
            row["mean_abs_prob_delta_vs_clean"] = float(np.mean(np.abs(y_prob - clean_probs)))
        rows.append(row)
        print(
            f"{name:22s}  acc={acc:.4f}  auc={auc:.4f}  "
            f"Δacc={row['delta_accuracy_vs_clean']:+.4f}  Δauc={row['delta_auc_vs_clean']:+.4f}"
        )

    # Plot: AUC by perturbation
    fig, ax = plt.subplots(figsize=(8, 4.2))
    names = [r["perturbation"] for r in rows]
    aucs = [r["roc_auc"] for r in rows]
    colors = ["#2a6f6f" if n == "clean" else "#8b5a2b" for n in names]
    ax.bar(range(len(names)), aucs, color=colors)
    ax.set_xticks(range(len(names)))
    ax.set_xticklabels(names, rotation=25, ha="right", fontsize=8)
    ax.set_ylabel("ROC-AUC")
    ax.set_ylim(0.5, 1.0)
    ax.set_title("Stain / colour robustness (held-out official test subset)")
    ax.axhline(aucs[0], color="#2a6f6f", linestyle="--", linewidth=1, alpha=0.6)
    fig.tight_layout()
    plot_path = RESULTS_DIR / "stain_robustness_auc.png"
    fig.savefig(plot_path, dpi=140)
    fig.savefig(WEB_RESULTS / "stain_robustness_auc.png", dpi=140)
    plt.close(fig)

    # Example mosaic: clean vs strong jitter for first 4 patches
    fig2, axes = plt.subplots(2, 4, figsize=(8, 4))
    for col in range(4):
        raw, _ = base[col]
        if isinstance(raw, torch.Tensor):
            arr = (raw.permute(1, 2, 0).numpy() * 255).clip(0, 255).astype(np.uint8)
            pil = Image.fromarray(arr)
        else:
            pil = raw if isinstance(raw, Image.Image) else Image.fromarray(np.asarray(raw))
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

    report = {
        "experiment": "stain_colour_robustness",
        "method": (
            "Held-out fixed-seed subset of the official PCam test split. "
            "Perturbations: mild/strong ColorJitter (hue/saturation/brightness/contrast), "
            "approximate H&E RGB channel scaling, and fixed warm/cool hue shifts. "
            "Not full Macenko or Vahadane stain normalization — those were out of scope for "
            "this CPU VM; a principled simpler colour jitter is used instead."
        ),
        "knobs": {
            "max_eval_samples": MAX_EVAL,
            "seed": SEED,
            "index_seed": SEED + 7,
            "batch_size": BATCH_SIZE,
            "decision_threshold": 0.5,
            "backbone": backbone,
            "checkpoint": str(CKPT.relative_to(REPO)),
            "source_run_id": meta.get("run_id"),
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

    # Markdown write-up
    md_lines = [
        "# Stain / colour robustness (draft experiment)",
        "",
        "> Educational research check — not a clinical validation. Surabhi owns interpretation and can extend this.",
        "",
        "## Method",
        "",
        report["method"],
        "",
        f"- Evaluation subset: **{MAX_EVAL}** patches from the official PCam **test** split "
        f"(fixed seed `{SEED + 7}`; within-split shuffle only).",
        f"- Checkpoint: `{CKPT.relative_to(REPO)}` (backbone `{backbone}`"
        + (f", run `{meta.get('run_id')}`" if meta.get("run_id") else "")
        + ").",
        "- Decision threshold: 0.5.",
        "",
        "## Knobs",
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
            "## Takeaway (honest, draft)",
            "",
            "If AUC or accuracy drops under strong colour / H&E-ish shifts, the model is partly "
            "relying on stain appearance rather than morphology alone. Mild shifts should stay "
            "closer to clean performance. Surabhi can use this table when writing Results limitations "
            "and when planning stain-augmentation for a future Colab run.",
            "",
        ]
    )
    md_path = RESULTS_DIR / "stain_robustness.md"
    md_path.write_text("\n".join(md_lines) + "\n")
    print("Wrote", json_path)
    print("Wrote", md_path)
    print("Wrote", plot_path)

    # Compact summary for the web Results JSON (optional merge key)
    summary_path = WEB_RESULTS / "stain_robustness_summary.json"
    summary = {
        "label": "Stain / colour robustness (draft)",
        "disclaimer": (
            "Principled colour jitter and approximate H&E RGB scaling on a held-out official-test "
            "subset — not Macenko/Vahadane or external labs. Educational only."
        ),
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
    summary_path.write_text(json.dumps(summary, indent=2) + "\n")
    print("Wrote", summary_path)


if __name__ == "__main__":
    main()
