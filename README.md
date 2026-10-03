# Lymph Node Metastasis Detector

**Research demo — not for clinical use.**

A high-school research project by **Surabhi**: fine-tune a small CNN on [PatchCamelyon (PCam)](https://github.com/basveeling/pcam) to score whether a 96×96 lymph-node histology patch shows metastatic tumor, export it to ONNX, and run predictions **in the browser** (with a heatmap) via a React site on GitHub Pages.

Lymph-node status matters for breast-cancer surgery planning. This project is an educational study of a public dataset — not a diagnostic tool.

[![Open in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/surabhif/Lymph-node-metastasis-detector/blob/main/notebooks/01_train_pcam.ipynb)

## What’s in this repo

| Path | Purpose |
|------|---------|
| `notebooks/01_train_pcam.ipynb` | Guided Colab teaching notebook (train, evaluate, export ONNX) |
| `web/` | React + Vite demo (ONNX Runtime Web, gallery, upload, heatmap) |
| `web/public/models/pcam_cam.onnx` | Quick Cursor-assisted baseline ONNX (replace with Surabhi’s Colab export) |
| `results/baseline_quick_run.json` | Raw metrics/config for that baseline (not Surabhi’s Results page) |
| `web/public/samples/` | Real PCam **test-set** gallery patches (CC0; regenerate via `scripts/export_gallery.py`) |
| `scripts/` | Helpers to rebuild the placeholder model / gallery / notebook |
| `.github/workflows/deploy-pages.yml` | Build & deploy the site to GitHub Pages on push to `main` |

## Honest status of the bundled model

The file at `web/public/models/pcam_cam.onnx` is a **quick baseline** trained with Cursor’s help on a **subset** of the official PCam splits (ResNet-18, 2 epochs, 4000 train / 1000 val / 4000 test). It exists so the live demo scores real patches before Surabhi finishes her own Colab run. **It is not her final model.** The site banner says so.

Raw metrics and config for this baseline (for her to beat) live in:

`results/baseline_quick_run.json`

Reproduce / replace:

```bash
# After PCam train/val/test h5 files are under ./pcam_data/pcam/
python scripts/run_baseline_quick.py   # mirrors the notebook quick-run knobs
# Or open notebooks/01_train_pcam.ipynb on Colab GPU and export yourself
```

Then overwrite `web/public/models/pcam_cam.onnx` and update `MODEL_STATUS` in `web/src/lib/constants.ts`.

Gallery images under `web/public/samples/` are **real PCam official test-set patches** (CC0), chosen at random with a fixed seed (not cherry-picked). Mosaic tiles are stitched from separate test patches for the sliding-window demo. Regenerate with `python scripts/export_gallery.py` after downloading the test `x`/`y` h5 files.

## Train in Colab

1. Open the notebook with the badge above (or upload `notebooks/01_train_pcam.ipynb`).
2. Runtime → GPU (T4 is fine).
3. Start with the knobs near the top (`MAX_TRAIN_SAMPLES`, `EPOCHS`) so a quick run finishes in well under an hour.
4. Keep PCam’s **official train / val / test splits** — never reshuffle across splits.
5. Complete the **Try this** exercises and the stain-robustness stub yourself.
6. Run the ONNX export cell; download `export/pcam_cam.onnx`.

### Drop in your trained model

```text
web/public/models/pcam_cam.onnx   ← replace with your Colab export
```

Then update the copy in `web/src/lib/constants.ts` (`MODEL_STATUS`) so the banner no longer says “untrained placeholder”.

Optional: replace gallery PNGs and edit `web/src/data/samples.json`.

## Run the site locally

```bash
cd web
npm install
npm run dev
```

Open the printed localhost URL. Click a gallery image — you should see a probability and a heatmap (meaningless with the placeholder weights, but the pipeline works).

Build:

```bash
cd web
npm run build
npm run preview
```

## Deployment (GitHub Pages)

Pushing to `main` runs `.github/workflows/deploy-pages.yml`, which builds `web/` with

`VITE_BASE=/Lymph-node-metastasis-detector/`

and deploys the `web/dist` artifact.

**One-time repo settings (Salil / repo admin):**

1. Repo → **Settings** → **Pages**
2. Under “Build and deployment”, set **Source** to **GitHub Actions** (not “Deploy from a branch”)
3. After the first green workflow on `main`, the site will be at  
   `https://surabhif.github.io/Lymph-node-metastasis-detector/`

## ONNX contract (notebook ↔ web app)

- **Input** `input`: `float32[N,3,96,96]` ImageNet-normalized RGB  
- **Output** `probability`: `float32[N,1]` P(tumor / metastasis)  
- **Output** `features`: `float32[N,C,H,W]` final conv feature maps  
- **Output** `cam_weights`: `float32[C]` weights for browser CAM  

Browser CAM (no gradients): `CAM = ReLU(Σ_c w_c · F_c)`, normalized, upsampled, overlaid.  
Images larger than ~96×96 are scanned patch-by-patch into a probability map.

## Citations & licenses

- Veeling, B. S., et al. (2018). Rotation equivariant CNNs for digital pathology. *MICCAI*. PCam (CC0): https://github.com/basveeling/pcam  
- Ehteshami Bejnordi, B., et al. (2017). Diagnostic assessment of deep learning algorithms for detection of lymph node metastases… *JAMA* (Camelyon16).  
- This repository’s code: **MIT** (see `LICENSE`).

## Credits and help

- **Surabhi** owns training, experiments, evaluation, figures, the Results/model-card write-up, and every scientific design choice she can explain.
- The **web app scaffold**, **GitHub Pages workflow**, **placeholder model/samples**, and **teaching-notebook template** were built with help from **Cursor AI** so she could focus on learning and running the ML. That help should stay disclosed in applications and mentor letters.

## Ethics (short)

Public de-identified data only. No clinic PHI. No clinical use. Don’t overclaim metrics. Prefer an honest unfinished Results page over invented numbers.
