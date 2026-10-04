# Lymph Node Metastasis Detector

**Research demo — not for clinical use.**

A high-school research project by **Surabhi**: fine-tune a small CNN on [PatchCamelyon (PCam)](https://github.com/basveeling/pcam) to score whether a 96×96 lymph-node histology patch shows metastatic tumor, export it to ONNX, and run predictions **in the browser** (with a heatmap) via a React site on GitHub Pages.

Lymph-node status matters for breast-cancer surgery planning. This project is an educational study of a public dataset — not a diagnostic tool.

[![Open in Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/surabhif/Lymph-node-metastasis-detector/blob/main/notebooks/01_train_pcam.ipynb)

## What’s in this repo

| Path | Purpose |
|------|---------|
| `notebooks/01_train_pcam.ipynb` | Guided Colab teaching notebook (train, evaluate, export ONNX) |
| `web/` | React + Vite research site (3D educational landing, guided demo, Results, About) |
| `web/src/explainer/` | Lazy-loaded Three.js / R3F lymph-node metastasis explainer (BodyParts3D torso + overlays) |
| `web/public/models/pcam_cam.onnx` | Quick Cursor-assisted baseline ONNX (**INT8**, ~11 MB) |
| `web/public/results/metrics.json` | Data-driven Results page (ROC, calibration, CM, mistakes) |
| `results/baseline_quick_run.json` | Raw baseline training metrics/config |
| `results/quantization_report.json` | FP32→INT8 size and gallery score deltas |
| `web/public/samples/` | Real PCam **test-set** gallery patches (CC0) |
| `scripts/` | Training, gallery export, results export, quantization helpers |
| `.github/workflows/deploy-pages.yml` | Build & deploy the site to GitHub Pages on push to `main` |

## Third-party anatomy asset

The landing explainer’s upper-torso mesh is derived from **BodyParts3D** (CC BY 4.0). See [`CREDITS.md`](./CREDITS.md) and [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) for attribution, license verification URLs, and how the GLB was cropped/compressed. Application code remains MIT; the mesh stays under CC BY 4.0.

## Honest status of the bundled model

The file at `web/public/models/pcam_cam.onnx` is a **quick baseline** trained with Cursor’s help on a **subset** of the official PCam splits (ResNet-18, 2 epochs, 4000 train / 1000 val / 4000 test), then **dynamically quantized to INT8** (~11 MB, down from ~43 MB FP32; gallery max |ΔP| ≈ 0.025). **It is not Surabhi’s final model.** The site banner stays visitor-facing; technical paths and quantization notes live here and under Model card → Current served model.

Reference metrics:

- `results/baseline_quick_run.json` — training run dump  
- `web/public/results/metrics.json` — powers the Results page (overwrite after your run)

```bash
python scripts/run_baseline_quick.py      # train quick baseline (mirrors notebook knobs)
python scripts/export_web_results.py      # refresh Results JSON + mistake images
python scripts/quantize_onnx.py           # optional INT8 shrink + delta report
```

Then overwrite `web/public/models/pcam_cam.onnx` and update `MODEL_STATUS` in `web/src/lib/constants.ts`.

The notebook also documents a **MobileNetV2** backbone option (`BACKBONE = "mobilenet_v2"`) if you want a smaller unquantized export.

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

Then update the copy in `web/src/lib/constants.ts` (`MODEL_STATUS`) and refresh Results with `python scripts/export_web_results.py`.

Optional: replace gallery PNGs and edit `web/src/data/samples.json`.

## Run the site locally

```bash
cd web
npm install
npm run dev
```

Open the printed localhost URL. Use **Try the detector** / `/demo` — gallery samples should show differentiated scores and a heatmap.

Build with the GitHub Pages base path:

```bash
cd web
VITE_BASE=/Lymph-node-metastasis-detector/ npm run build
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
