#!/usr/bin/env python3
"""Generate the Colab teaching notebook notebooks/01_train_pcam.ipynb."""

from __future__ import annotations

import json
from pathlib import Path


def md(source: str) -> dict:
    return {
        "cell_type": "markdown",
        "metadata": {},
        "source": [line + "\n" for line in source.strip("\n").split("\n")],
    }


def code(source: str) -> dict:
    lines = source.strip("\n").split("\n")
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [line + "\n" for line in lines[:-1]] + ([lines[-1]] if lines else []),
    }


cells: list[dict] = []

cells.append(
    md(
        """
# PatchCamelyon (PCam) lymph-node metastasis detector — teaching notebook

**Author space:** Surabhi · high-school research project  
**Goal:** Fine-tune a small CNN on PCam, evaluate it honestly, and export an ONNX model the React demo can run in the browser (with class-activation maps).

> **Research only — not for clinical use.** Never use this model on real patients.

This notebook is written so you can **explain every design choice**. Markdown cells before each step say *what* and *why*. Cells marked **Try this** are where *you* choose an experiment and record what happened.

### How to use on Google Colab
1. Upload this notebook to Colab **or** open it from GitHub with the README badge.
2. Runtime → Change runtime type → **GPU** (T4 is fine on the free tier).
3. Start with the **quick-run knobs** (subset + few epochs) to finish in well under an hour.
4. When you are ready for a serious run, increase `MAX_TRAIN_SAMPLES` / `EPOCHS` and keep the official splits.
"""
    )
)

cells.append(
    md(
        """
## 0. Setup

We install the libraries Colab needs for training, metrics, plots, and ONNX export.
"""
    )
)

cells.append(
    code(
        """
# Colab: install extras (torch/torchvision are usually preinstalled)
import subprocess, sys
pkgs = ["onnx", "onnxscript", "scikit-learn", "matplotlib", "tqdm", "seaborn"]
subprocess.check_call([sys.executable, "-m", "pip", "-q", "install", *pkgs])

import os, math, time, random, json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Subset
from torchvision import datasets, models, transforms
from tqdm.auto import tqdm

import matplotlib.pyplot as plt

print("torch", torch.__version__)
print("cuda available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("GPU:", torch.cuda.get_device_name(0))
"""
    )
)

cells.append(
    md(
        """
## 1. What is a CNN? (plain language)

A **convolutional neural network (CNN)** looks at an image in small sliding windows ("filters"). Early layers tend to notice edges and stains; deeper layers combine those into patterns that can correlate with "tumor" vs "normal" tissue in this dataset.

We will not train a huge network from scratch. **Transfer learning** starts from weights learned on ImageNet (everyday photos) and adapts them to PCam. That usually needs less data and less time than training from random weights — a good fit for a first project on free Colab.
"""
    )
)

cells.append(
    md(
        """
## 2. Design knobs (quick run vs full run)

These variables control how long training takes. For a first pass, keep the subset small and epochs low so you can finish the whole notebook. Later, raise them for a real experiment.

**Important:** Even when you subset, we take examples **from within** the official train/valid/test splits — we never mix or reshuffle across splits.
"""
    )
)

cells.append(
    code(
        """
# === Knobs you can change ===
BACKBONE = "resnet18"       # Try this later: "resnet18" or "mobilenet_v2"
EPOCHS = 2                  # Try this: 1 for a smoke test, 5–15 for a serious run
BATCH_SIZE = 64
LEARNING_RATE = 1e-3
MAX_TRAIN_SAMPLES = 4000    # None = use full official train split (much slower)
MAX_VAL_SAMPLES = 1000
MAX_TEST_SAMPLES = 1000     # for notebook evaluation; report which subset you used
NUM_WORKERS = 2
SEED = 42
DATA_ROOT = Path("./pcam_data")
EXPORT_DIR = Path("./export")  # ONNX lands here; download and put in web/public/models/

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("Device:", DEVICE)
print("Backbone:", BACKBONE, "| epochs:", EPOCHS, "| max train:", MAX_TRAIN_SAMPLES)
"""
    )
)

cells.append(
    code(
        """
def set_seed(seed: int = 42) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)

set_seed(SEED)
"""
    )
)

cells.append(
    md(
        """
## 3. Dataset: PatchCamelyon (PCam)

PCam contains **327,680** 96×96 lymph-node patches from the Camelyon16 challenge, labeled tumor vs normal. License: **CC0**. Cite Veeling et al. 2018 and Bejnordi et al. 2017.

`torchvision.datasets.PCAM` downloads the official files and exposes splits: `"train"`, `"val"`, `"test"`.

### Why splits matter (leakage)

If you shuffle all patches together and then split randomly, patches from the **same slide / patient region** can land in both train and test. The model can look accurate by memorizing slide quirks, not by learning metastasis. **Always keep PCam's official splits.**
"""
    )
)

cells.append(
    code(
        """
# ImageNet normalization — standard for torchvision pretrained models
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)

train_tfms = transforms.Compose([
    transforms.RandomHorizontalFlip(),
    transforms.RandomVerticalFlip(),
    # Try this: add ColorJitter or RandomRotation and re-run a short experiment
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])

eval_tfms = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])

DATA_ROOT.mkdir(parents=True, exist_ok=True)

# First run downloads several GB — be patient. Files are cached afterward.
train_full = datasets.PCAM(root=str(DATA_ROOT), split="train", transform=train_tfms, download=True)
val_full = datasets.PCAM(root=str(DATA_ROOT), split="val", transform=eval_tfms, download=True)
test_full = datasets.PCAM(root=str(DATA_ROOT), split="test", transform=eval_tfms, download=True)

print(len(train_full), len(val_full), len(test_full))
"""
    )
)

cells.append(
    code(
        """
def subset_indices(n_total: int, n_keep: int | None, seed: int) -> list[int]:
    idx = list(range(n_total))
    rng = random.Random(seed)
    rng.shuffle(idx)  # shuffle *within* the split only
    if n_keep is None or n_keep >= n_total:
        return idx
    return idx[:n_keep]

train_ds = Subset(train_full, subset_indices(len(train_full), MAX_TRAIN_SAMPLES, SEED))
val_ds = Subset(val_full, subset_indices(len(val_full), MAX_VAL_SAMPLES, SEED + 1))
test_ds = Subset(test_full, subset_indices(len(test_full), MAX_TEST_SAMPLES, SEED + 2))

train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=NUM_WORKERS, pin_memory=True)
val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS)
test_loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS)

print("Using:", len(train_ds), "train |", len(val_ds), "val |", len(test_ds), "test")
"""
    )
)

cells.append(
    md(
        """
### Peek at a few patches

Always look at your data. Labels: `0` = normal (no metastasis in the patch center region), `1` = tumor.
"""
    )
)

cells.append(
    code(
        """
# Visualize a few *unnormalized* samples from the raw split for intuition
raw_vis = datasets.PCAM(root=str(DATA_ROOT), split="train", transform=transforms.ToTensor(), download=False)
fig, axes = plt.subplots(2, 4, figsize=(10, 5))
for ax, i in zip(axes.ravel(), range(8)):
    img, y = raw_vis[i]
    ax.imshow(img.permute(1, 2, 0).numpy())
    ax.set_title("tumor" if int(y) == 1 else "normal")
    ax.axis("off")
plt.tight_layout()
plt.show()
"""
    )
)

cells.append(
    md(
        """
## 4. Build the model (transfer learning + CAM-friendly head)

We replace the final classifier with a single logit (tumor probability via sigmoid).

For the **web demo**, we need more than a class score. Class activation mapping (CAM) without gradients needs:
1. the **final convolutional feature maps**, and  
2. the **classifier weights** for the tumor class.

Then the browser (and this notebook) can compute:

\\[ \\mathrm{CAM}(h,w) = \\sum_c w_c \\, F_{c}(h,w) \\]

**Grad-CAM** (below, optional) uses gradients instead; it is great for comparison in the notebook, but the exported ONNX path uses weight-based CAM so the browser does not need autograd.
"""
    )
)

cells.append(
    code(
        """
class CamClassifier(nn.Module):
    \"\"\"Wrap a torchvision backbone so we can read features + CAM weights.\"\"\"

    def __init__(self, backbone_name: str = "resnet18", pretrained: bool = True):
        super().__init__()
        self.backbone_name = backbone_name
        weights_resnet = models.ResNet18_Weights.IMAGENET1K_V1 if pretrained else None
        weights_mnet = models.MobileNet_V2_Weights.IMAGENET1K_V1 if pretrained else None

        if backbone_name == "resnet18":
            net = models.resnet18(weights=weights_resnet)
            feat_dim = net.fc.in_features
            # Keep everything except the pooled classifier
            self.features = nn.Sequential(*list(net.children())[:-2])  # ends at layer4 conv maps
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
        return self.classifier.weight.squeeze(0)  # [C]


model = CamClassifier(BACKBONE, pretrained=True).to(DEVICE)
n_params = sum(p.numel() for p in model.parameters())
print(f"Parameters: {n_params:,}")
"""
    )
)

cells.append(
    md(
        """
## 5. Loss, optimizer, and what "overfitting" means

- **Loss:** `BCEWithLogitsLoss` — binary classification (tumor vs normal) with a single logit. It is more numerically stable than sigmoid + BCE separately.
- **Optimizer:** Adam with a learning rate you can tune (`LEARNING_RATE`).
- **Overfitting:** training loss keeps falling while validation metrics stall or worsen. Watching **validation AUC** each epoch is one way to notice it. If you overfit, try fewer epochs, more augmentation, or a smaller learning rate.

### Try this
Change `LEARNING_RATE` (e.g. `3e-4` vs `1e-3`) or swap `BACKBONE`, re-run training for the same number of epochs, and write the val AUC of each run in your lab notes.
"""
    )
)

cells.append(
    code(
        """
criterion = nn.BCEWithLogitsLoss()
optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)


@torch.no_grad()
def collect_probs(loader) -> tuple[np.ndarray, np.ndarray]:
    model.eval()
    ys, ps = [], []
    for x, y in loader:
        x = x.to(DEVICE)
        logits = model(x)
        prob = torch.sigmoid(logits)
        ys.append(y.numpy())
        ps.append(prob.cpu().numpy())
    return np.concatenate(ys), np.concatenate(ps)


def epoch_train() -> float:
    model.train()
    total, n = 0.0, 0
    for x, y in tqdm(train_loader, desc="train", leave=False):
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


from sklearn.metrics import roc_auc_score, accuracy_score

history = {"train_loss": [], "val_auc": [], "val_acc": []}
best_val_auc = -1.0
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
best_path = EXPORT_DIR / "best_model.pt"

for epoch in range(1, EPOCHS + 1):
    t0 = time.time()
    train_loss = epoch_train()
    y_val, p_val = collect_probs(val_loader)
    val_auc = roc_auc_score(y_val, p_val)
    val_acc = accuracy_score(y_val, (p_val >= 0.5).astype(int))
    history["train_loss"].append(train_loss)
    history["val_auc"].append(val_auc)
    history["val_acc"].append(val_acc)
    print(f"Epoch {epoch}/{EPOCHS}  loss={train_loss:.4f}  val_auc={val_auc:.4f}  val_acc={val_acc:.4f}  ({time.time()-t0:.1f}s)")
    if val_auc > best_val_auc:
        best_val_auc = val_auc
        torch.save({"model": model.state_dict(), "backbone": BACKBONE, "val_auc": val_auc}, best_path)
        print("  saved best checkpoint →", best_path)

print("Best val AUC so far:", best_val_auc)
"""
    )
)

cells.append(
    code(
        """
# Reload best checkpoint for evaluation / export
ckpt = torch.load(best_path, map_location=DEVICE, weights_only=False)
model.load_state_dict(ckpt["model"])
model.eval()
print("Loaded best val AUC:", ckpt.get("val_auc"))
"""
    )
)

cells.append(
    md(
        """
## 6. Evaluation (held-out test split)

You will compute:
- **Accuracy** — easy to read, but can mislead if classes are imbalanced.
- **ROC-AUC** — ranking quality across thresholds; we add a **bootstrap confidence interval** so one number is not treated as exact truth.
- **Reliability / calibration plot** — do predicted probabilities match observed frequencies?
- **Confusion matrix**
- **Confident mistakes gallery** — the errors the model was most sure about (great for learning and for your write-up)

> Do **not** tune hyperparameters on the test set. Use validation for choices; use test once for reporting.
"""
    )
)

cells.append(
    code(
        """
from sklearn.metrics import confusion_matrix, RocCurveDisplay, ConfusionMatrixDisplay

y_true, y_prob = collect_probs(test_loader)
y_pred = (y_prob >= 0.5).astype(int)

acc = accuracy_score(y_true, y_pred)
auc = roc_auc_score(y_true, y_prob)
print(f"Test accuracy: {acc:.4f}")
print(f"Test ROC-AUC:  {auc:.4f}")

# Bootstrap 95% CI for AUC
rng = np.random.default_rng(SEED)
boot = []
n = len(y_true)
for _ in range(200):
    idx = rng.integers(0, n, n)
    if len(np.unique(y_true[idx])) < 2:
        continue
    boot.append(roc_auc_score(y_true[idx], y_prob[idx]))
lo, hi = np.percentile(boot, [2.5, 97.5])
print(f"Bootstrap 95% CI for AUC: [{lo:.4f}, {hi:.4f}]  (n_boot={len(boot)})")
print("\\nRecord these numbers yourself on the Results page — do not invent extras.")
"""
    )
)

cells.append(
    code(
        """
fig, axes = plt.subplots(1, 3, figsize=(14, 4))

RocCurveDisplay.from_predictions(y_true, y_prob, ax=axes[0])
axes[0].set_title("ROC curve (test)")

cm = confusion_matrix(y_true, y_pred)
ConfusionMatrixDisplay(cm, display_labels=["normal", "tumor"]).plot(ax=axes[1], colorbar=False)
axes[1].set_title("Confusion matrix")

# Reliability diagram (calibration)
bins = np.linspace(0, 1, 11)
centers, accs, counts = [], [], []
for i in range(len(bins) - 1):
    m = (y_prob >= bins[i]) & (y_prob < bins[i + 1] if i < len(bins) - 2 else y_prob <= bins[i + 1])
    if m.sum() == 0:
        continue
    centers.append((bins[i] + bins[i + 1]) / 2)
    accs.append(y_true[m].mean())
    counts.append(m.sum())
axes[2].plot([0, 1], [0, 1], "--", color="gray", label="perfect")
axes[2].plot(centers, accs, "o-", label="model")
axes[2].set_xlabel("Predicted probability")
axes[2].set_ylabel("Observed frequency")
axes[2].set_title("Reliability diagram")
axes[2].legend()
plt.tight_layout()
plt.show()
print("Bin counts:", counts)
"""
    )
)

cells.append(
    code(
        """
# Gallery of most confident mistakes
wrong = np.where(y_pred != y_true)[0]
if len(wrong) == 0:
    print("No mistakes on this test subset — try a larger MAX_TEST_SAMPLES.")
else:
    conf = np.where(y_pred[wrong] == 1, y_prob[wrong], 1 - y_prob[wrong])
    order = wrong[np.argsort(-conf)[:8]]

    # Need raw-ish tensors with undo-able display: reload test with ToTensor only for display
    test_vis = datasets.PCAM(root=str(DATA_ROOT), split="test", transform=transforms.ToTensor(), download=False)
    # Map subset index → original index in test_full
    subset_map = list(test_ds.indices)

    fig, axes = plt.subplots(2, 4, figsize=(10, 5))
    for ax, local_i in zip(axes.ravel(), order):
        orig_i = subset_map[local_i]
        img, y = test_vis[orig_i]
        ax.imshow(img.permute(1, 2, 0).numpy())
        ax.set_title(f"true={int(y_true[local_i])} pred={y_prob[local_i]:.2f}")
        ax.axis("off")
    plt.suptitle("Most confident mistakes (from current test subset)")
    plt.tight_layout()
    plt.show()
"""
    )
)

cells.append(
    md(
        """
## 7. Grad-CAM in the notebook (optional comparison)

Grad-CAM uses the **gradient** of the tumor score w.r.t. the feature maps. Compare it visually to the weight-based CAM you will export. They often agree roughly but are not identical.
"""
    )
)

cells.append(
    code(
        """
def grad_cam(model: CamClassifier, x: torch.Tensor) -> np.ndarray:
    \"\"\"x: [1,3,96,96] on DEVICE. Returns HxW numpy map normalized to [0,1].\"\"\"
    model.eval()
    feats = None
    grads = None

    def fwd_hook(_m, _i, o):
        nonlocal feats
        feats = o

    def bwd_hook(_m, _gi, go):
        nonlocal grads
        grads = go[0]

    handle_f = model.features.register_forward_hook(fwd_hook)
    # last conv-ish module: hook the whole features block output via tensor hook after forward
    x = x.requires_grad_(True)
    feat = model.forward_features(x)
    feat.register_hook(lambda g: bwd_hook(None, None, (g,)))
    pooled = F.adaptive_avg_pool2d(feat, 1).flatten(1)
    logit = model.classifier(pooled).squeeze()
    model.zero_grad(set_to_none=True)
    logit.backward()
    handle_f.remove()

    # Grad-CAM: weights = mean gradient over spatial dims
    assert grads is not None and feat is not None
    w = grads.mean(dim=(2, 3), keepdim=True)
    cam = (w * feat).sum(dim=1, keepdim=False)
    cam = F.relu(cam).detach().cpu().numpy()[0]
    cam -= cam.min()
    cam /= (cam.max() + 1e-8)
    return cam


def weight_cam(model: CamClassifier, x: torch.Tensor) -> np.ndarray:
    model.eval()
    with torch.no_grad():
        feat = model.forward_features(x)[0]  # [C,H,W]
        w = model.cam_weights()[:, None, None]
        cam = (w * feat).sum(0)
        cam = F.relu(cam).cpu().numpy()
        cam -= cam.min()
        cam /= (cam.max() + 1e-8)
    return cam


# Show both CAMs on one test patch
example_local = 0
orig_i = list(test_ds.indices)[example_local]
x_disp, y_disp = test_vis[orig_i]
x_model = eval_tfms(transforms.ToPILImage()(x_disp)).unsqueeze(0).to(DEVICE)

gcam = grad_cam(model, x_model)
wcam = weight_cam(model, x_model)

fig, axes = plt.subplots(1, 3, figsize=(9, 3))
axes[0].imshow(x_disp.permute(1, 2, 0).numpy())
axes[0].set_title(f"patch (y={int(y_disp)})")
axes[1].imshow(x_disp.permute(1, 2, 0).numpy())
axes[1].imshow(gcam, cmap="jet", alpha=0.45)
axes[1].set_title("Grad-CAM")
axes[2].imshow(x_disp.permute(1, 2, 0).numpy())
axes[2].imshow(wcam, cmap="jet", alpha=0.45)
axes[2].set_title("Weight CAM (export style)")
for ax in axes:
    ax.axis("off")
plt.tight_layout()
plt.show()
"""
    )
)

cells.append(
    md(
        """
## 8. Stain-color robustness test

Pathology slides are stained with hematoxylin & eosin (H&E). Color can shift across labs and scanners. A model that only memorizes one stain look may fail on another.

A reproducible scripted experiment lives at `scripts/run_stain_robustness.py` (colour jitter + approximate H&E RGB scaling; **not** full Macenko/Vahadane). It writes `results/stain_robustness.md` and a Results-page summary.

### Guidance
1. Take a batch of test patches.
2. Apply a **color perturbation** that mimics stain shift.
3. Measure AUC **before vs after** on the **same** images.
4. Write what changed and what that means for real-world use.

### Try this
Run the helper below (mirrors the scripted mild jitter), or from a shell: `python scripts/run_stain_robustness.py`.
"""
    )
)

cells.append(
    code(
        """
def evaluate_under_colorjitter(jitter_strength: float = 0.2) -> None:
    \"\"\"Mild colour-jitter AUC vs clean on the same test subset indices.\"\"\"
    from torchvision import transforms as T
    jitter = T.Compose([
        T.ColorJitter(
            brightness=jitter_strength,
            contrast=jitter_strength,
            saturation=jitter_strength,
            hue=min(0.08, jitter_strength / 2),
        ),
        T.ToTensor(),
        T.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    test_j = datasets.PCAM(root=str(DATA_ROOT), split="test", transform=jitter, download=False)
    indices = getattr(test_ds, "indices", list(range(min(2000, len(test_j)))))
    loader_j = DataLoader(Subset(test_j, indices), batch_size=BATCH_SIZE, shuffle=False)
    y_j, p_j = collect_probs(model, loader_j)
    auc_j = float(roc_auc_score(y_j, p_j))
    print(f"Colour-jitter strength={jitter_strength}: AUC={auc_j:.4f}")
    print("For the fuller table (mild/strong/H&E-approx/hue), run: python scripts/run_stain_robustness.py")

evaluate_under_colorjitter(0.2)
"""
    )
)

cells.append(
    md(
        """
## 9. Export to ONNX (for the React app)

The web app expects a **single** file:

`web/public/models/pcam_cam.onnx`

with:
- **input** `input`: float32 `[N,3,96,96]` (ImageNet-normalized RGB)
- **output** `probability`: float32 `[N,1]` — P(tumor)
- **output** `features`: float32 `[N,C,H,W]` — final conv maps
- **output** `cam_weights`: float32 `[C]` — classifier weights for CAM

After export, download the file from Colab and replace the placeholder in the repo. Then flip the UI copy / `MODEL_STATUS` so visitors know it is your trained model.
"""
    )
)

cells.append(
    code(
        """
class OnnxExportWrapper(nn.Module):
    def __init__(self, core: CamClassifier):
        super().__init__()
        self.core = core

    def forward(self, x: torch.Tensor):
        feat = self.core.forward_features(x)
        pooled = F.adaptive_avg_pool2d(feat, 1).flatten(1)
        logits = self.core.classifier(pooled)
        prob = torch.sigmoid(logits)
        weights = self.core.classifier.weight.squeeze(0)
        return prob, feat, weights


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
print("Wrote", onnx_path, f"({onnx_path.stat().st_size / 1024:.1f} KB)")
print("Download this file → place at web/public/models/pcam_cam.onnx in the repo")
"""
    )
)

cells.append(
    md(
        """
## 10. Optional: export a few labeled test patches for the website gallery

Replace the synthetic placeholders in `web/public/samples/` with real **CC0** PCam test patches. Keep filenames stable or update `web/src/data/samples.json`.
"""
    )
)

cells.append(
    code(
        """
from PIL import Image

gallery_dir = EXPORT_DIR / "gallery_patches"
gallery_dir.mkdir(parents=True, exist_ok=True)

# Save a few tumor and normal examples from the official test split
test_pil = datasets.PCAM(root=str(DATA_ROOT), split="test", transform=None, download=False)
saved = {"tumor": 0, "normal": 0}
manifest = []
for i in range(len(test_pil)):
    img, y = test_pil[i]
    label = "tumor" if int(y) == 1 else "normal"
    if saved[label] >= 3:
        if saved["tumor"] >= 3 and saved["normal"] >= 3:
            break
        continue
    fname = f"pcam_test_{label}_{saved[label]+1:02d}.png"
    img.save(gallery_dir / fname)
    manifest.append({
        "id": fname.replace(".png", ""),
        "src": f"samples/{fname}",
        "label": label,
        "groundTruthTumor": label == "tumor",
        "kind": "patch",
        "note": "Official PCam test-split patch (CC0).",
    })
    saved[label] += 1

(gallery_dir / "samples_fragment.json").write_text(json.dumps(manifest, indent=2))
print("Saved gallery patches to", gallery_dir)
print(saved)
"""
    )
)

cells.append(
    md(
        """
## 11. Your write-up checklist (no conclusions filled in for you)

Use your own words in the site Results page, model card, and any application essay:

1. What question did you ask?
2. What did you choose (backbone, augments, LR, epochs) and why?
3. What metrics did you get on the **official test split** (with CI)?
4. What did the mistake gallery teach you?
5. What are the limits (patch ≠ patient, stain shift, not for clinical use)?
6. What would you try next?

**Credits:** Say clearly what you did vs what tools/people helped with (including AI scaffolding help, if any).
"""
    )
)

cells.append(
    md(
        """
## 12. Full-PCam GPU retrain (Colab)

The subset baseline used only a few percent of the official training split. This section trains on the **full** official train/val/test splits with a GPU recipe: AdamW, cosine LR with warm-up, mixed precision, flips + 90° rotations + light colour jitter, early stopping on val AUC, and Drive checkpoints so a disconnect does not wipe the run.

Record **measured** GPU type and per-epoch wall-time in `run.json`. Do not invent numbers.
"""
    )
)

cells.append(
    code(
        """
# --- Full-PCam knobs (override the quick-run knobs from section 2) ---
FULL_PCAM = True  # set True on a GPU runtime with Drive space
FULL_EPOCHS = 20
FULL_BATCH = 256
FULL_LR = 3e-4
FULL_WARMUP_EPOCHS = 2
FULL_EARLY_STOP_PATIENCE = 5
DRIVE_CKPT = Path("/content/drive/MyDrive/pcam_full_retrain")  # adjust

if FULL_PCAM:
    from google.colab import drive  # type: ignore
    drive.mount("/content/drive")
    DRIVE_CKPT.mkdir(parents=True, exist_ok=True)

    # Copy HDF5 once per session to local disk for fast workers
    import shutil
    local_pcam = Path("/content/pcam_local")
    local_pcam.mkdir(exist_ok=True)
    # Expect official files under DATA_ROOT; copy if not already local
    print("Prepare full DataLoaders with MAX_* = None (entire official splits).")
    print("Use AdamW + cosine schedule + GradScaler; checkpoint each epoch to", DRIVE_CKPT)
    print("Resume: load model/optim/scheduler/scaler/epoch/RNG from the latest .pt")
else:
    print("FULL_PCAM is False — skipping. Flip the flag on a GPU Colab runtime.")
"""
    )
)

cells.append(
    md(
        """
## 13. Calibration: temperature vs Platt

Fit on **validation logits only**, then report on the full test split:

- Temperature scaling: `σ(z / T)`
- Platt scaling: `σ(a·z + b)`

Keep the method with lower validation NLL. Report ECE (15 + 10 bins), MCE, Brier, NLL, and reliability diagrams before/after.

CAM is unchanged: positive scaling of the logit scales `cam_weights` uniformly; `computeCam` min-max normalises; a bias term never reaches the CAM.
"""
    )
)

cells.append(
    code(
        """
def fit_temperature(logits: np.ndarray, labels: np.ndarray) -> float:
    \"\"\"Minimize NLL of σ(z/T) on validation.\"\"\"
    z = torch.tensor(logits, dtype=torch.float64)
    y = torch.tensor(labels, dtype=torch.float64)
    log_t = torch.nn.Parameter(torch.zeros((), dtype=torch.float64))
    opt = torch.optim.LBFGS([log_t], lr=0.5, max_iter=50)

    def closure():
        opt.zero_grad()
        t = log_t.exp().clamp(min=1e-3)
        p = torch.sigmoid(z / t)
        nll = -(y * p.clamp(1e-7).log() + (1 - y) * (1 - p).clamp(1e-7).log()).mean()
        nll.backward()
        return nll

    opt.step(closure)
    return float(log_t.exp().clamp(min=1e-3).item())

def fit_platt(logits: np.ndarray, labels: np.ndarray) -> tuple[float, float]:
    \"\"\"Minimize NLL of σ(a·z + b) on validation.\"\"\"
    from sklearn.linear_model import LogisticRegression
    clf = LogisticRegression(solver="lbfgs")
    clf.fit(logits.reshape(-1, 1), labels.astype(int))
    a = float(clf.coef_.ravel()[0])
    b = float(clf.intercept_.ravel()[0])
    return a, b

def nll_of(p: np.ndarray, y: np.ndarray) -> float:
    p = np.clip(p, 1e-7, 1 - 1e-7)
    return float(-(y * np.log(p) + (1 - y) * np.log(1 - p)).mean())

# Example wiring (requires val_logits, val_labels, test_logits from your full run):
# T = fit_temperature(val_logits, val_labels)
# a, b = fit_platt(val_logits, val_labels)
# Choose lower val NLL; write params into web/public/models/model_manifest.json
print("Calibration helpers ready. Run after you have validation logits from section 12.")
"""
    )
)

cells.append(
    md(
        """
## 14. Validation-chosen threshold and uncertain band

- `t*` on validation only (default: Youden's J). Also show a “sensitivity ≥ X” operating point as a teaching trade-off — never as a clinical claim.
- Uncertain band `[t_lo, t_hi]`: smallest interval around `t*` that reaches a target selective accuracy outside the band on val, capped at e.g. ≤ 20% coverage flagged.
- All values live in `model_manifest.json`. The UI never hard-codes them.
"""
    )
)

cells.append(
    code(
        """
def youden_threshold(y_true: np.ndarray, scores: np.ndarray) -> float:
    from sklearn.metrics import roc_curve
    fpr, tpr, thr = roc_curve(y_true, scores)
    j = tpr - fpr
    return float(thr[int(np.argmax(j))])

def uncertain_band(y_true, scores, t_star, target_acc=0.9, max_flag=0.2):
    \"\"\"Grow a symmetric band around t* until selective accuracy hits target or coverage cap.\"\"\"
    order = np.argsort(np.abs(scores - t_star))
    n = len(scores)
    best = (t_star, t_star)
    for k in range(1, n):
        flagged = order[:k]
        mask = np.ones(n, dtype=bool)
        mask[flagged] = False
        if mask.sum() == 0:
            break
        coverage_loss = 1 - mask.mean()
        if coverage_loss > max_flag:
            break
        pred = (scores[mask] >= t_star).astype(int)
        acc = (pred == y_true[mask]).mean()
        lo = float(scores[flagged].min())
        hi = float(scores[flagged].max())
        if acc >= target_acc:
            best = (lo, hi)
            break
    return best

print("Threshold / band helpers ready for validation scores.")
"""
    )
)

cells.append(
    md(
        """
## 15. Macenko stain normalisation

Fit a reference stain matrix + max concentrations on a fixed set of training patches (`torchstain`, MIT). Export the numbers into the model manifest for optional in-browser before/after.

Serving decision: keep the raw + stain-augmentation trained model as the primary export; offer Macenko as an **optional** Demo toggle rather than requiring it on every inference.
"""
    )
)

cells.append(
    code(
        """
# pip install torchstain  # MIT
try:
    import torchstain
    print("torchstain available — fit MacenkoNormalizer on a fixed train subset and export:")
    print("  stain_matrix_target (3x2), maxC_target (2,), Io / source intensity")
except ImportError:
    print("Install torchstain in Colab to fit Macenko: pip install torchstain")
"""
    )
)

cells.append(
    md(
        """
## 16. Export model_manifest.json for the web app

After the full run, write one manifest the Demo and Results pages read:

```json
{
  "model_version": "full_pcam_v4",
  "label": "Full PCam retrain",
  "threshold": 0.42,
  "uncertain_lo": 0.30,
  "uncertain_hi": 0.55,
  "calibration": { "method": "platt", "a": 1.1, "b": -0.2 },
  "status": "ready"
}
```

Until that run finishes, the site keeps the baseline weights and shows **full retrain in progress** on Results — never placeholder metrics.
"""
    )
)

cells.append(
    code(
        """
manifest_path = Path("model_manifest.json")
# Fill from real calibration / threshold cells — do not invent numbers.
example = {
    "model_version": "full_pcam_v4",
    "label": "Full PCam retrain",
    "threshold": None,
    "uncertain_lo": None,
    "uncertain_hi": None,
    "calibration": {"method": "none"},
    "status": "in_progress",
    "note": "Replace nulls with validation-chosen values after section 12–14 complete.",
}
manifest_path.write_text(json.dumps(example, indent=2))
print("Wrote template", manifest_path)
"""
    )
)

nb = {
    "nbformat": 4,
    "nbformat_minor": 5,
    "metadata": {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "pygments_lexer": "ipython3"},
        "colab": {"provenance": [], "gpuType": "T4"},
    },
    "cells": cells,
}

out = Path("/workspace/notebooks/01_train_pcam.ipynb")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(nb, indent=1) + "\n")
print("Wrote", out, "cells=", len(cells))
