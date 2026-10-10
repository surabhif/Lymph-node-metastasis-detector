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
| `web/src/explainer/` | Lazy-loaded Three.js / R3F lymph-node metastasis explainer (HRA female anatomy + overlays) |
| `web/public/models/pcam_cam.onnx` | Live full-PCam retrain ONNX (INT8 ~10.7 MB; see Results / Model card) |
| `web/public/results/full_retrain_metrics.json` | Full official-split test metrics for the live model |
| `web/public/results/metrics.json` | Earlier subset baseline (side-by-side comparison on Results) |
| `results/baseline_fuller_run.json` | Raw improved-baseline training metrics/config (historical) |
| `results/baseline_quick_run.json` | Original quick stub run (historical reference) |
| `results/stain_robustness.md` | Stain / colour robustness experiment write-up |
| `results/quantization_report.json` | FP32→INT8 size and gallery score deltas |
| `web/public/samples/` | Real PCam **test-set** gallery patches (CC0) |
| `scripts/` | Training, gallery export, results export, quantization helpers |
| `.github/workflows/deploy-pages.yml` | Build & deploy the site to GitHub Pages on push to `main` |

## Third-party anatomy assets

The landing explainer uses **NIH/HuBMAP Human Reference Atlas** female skin, right mammary gland, and lymph-node meshes (**CC BY 4.0**), plus BodyParts3D chest cues (**CC BY 4.0**) under the skin. See [`CREDITS.md`](./CREDITS.md) and [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) for attribution, license verification URLs, and how the GLBs were cropped/compressed. Application code remains MIT; the meshes stay under CC BY 4.0.

## Honest status of the bundled model

The file at `web/public/models/pcam_cam.onnx` is the **full-PCam retrain** shipped to the live demo: ResNet-18 trained on **all 262,144** official train patches (8 epochs, CPU bf16; epoch 3 by val AUC **0.9587**), evaluated on the full **32,768** official test set (AUC **0.9401**, 95% CI 0.9373–0.9428). Served as dynamic INT8 (~10.7 MB). Platt calibration, threshold **0.5201**, and uncertain band **0.4879–0.5522** were chosen on validation. INT8 scores test AUC **0.9368** / acc 83.56% @ 0.5 vs PyTorch 0.9401 — reported on Results / Model card. Educational research only — not for clinical use.

An earlier **subset baseline** (larger-than-stub train subset; 8k-sample test eval, AUC ≈ 0.9103) remains on Results for side-by-side comparison only; it is not what the browser downloads.

Reference metrics:

- `web/public/results/full_retrain_metrics.json` — live model (source of truth)  
- `training/train.py`, `training/evaluate.py` — reproducibility scripts  
- `results/baseline_fuller_run.json` / `web/public/results/metrics.json` — earlier subset baseline  
- `results/baseline_quick_run.json` — original quick stub (historical)  
- `results/stain_robustness.md` — colour / stain-shift stress test (baseline-era)

```bash
python scripts/run_baseline_fuller.py    # historical subset baseline helpers
python scripts/run_baseline_quick.py     # original quick stub knobs
python scripts/export_web_results.py     # refresh baseline Results JSON + mistake images
python scripts/quantize_onnx.py          # optional INT8 shrink + delta report
python scripts/run_stain_robustness.py   # colour / stain-shift experiment + report
```

To replace the live weights: overwrite `web/public/models/pcam_cam.onnx`, update `web/public/models/model_manifest.json` and `MODEL_STATUS` in `web/src/lib/constants.ts`, then regenerate quiz scores with `python scripts/export_quiz.py`.

The notebook also documents a **MobileNetV2** backbone option (`BACKBONE = "mobilenet_v2"`) if you want a smaller unquantized export.

## Train in Colab

1. Open the notebook with the badge above (or upload `notebooks/01_train_pcam.ipynb`).
2. Runtime → GPU (T4 is fine).
3. Start with the knobs near the top (`MAX_TRAIN_SAMPLES`, `EPOCHS`) so a quick run finishes in well under an hour.
4. Keep PCam’s **official train / val / test splits** — never reshuffle across splits.
5. Complete the **Try this** exercises; the stain-robustness stub is also implemented as `scripts/run_stain_robustness.py`.
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

After the Vite build, `web/scripts/spa-gh-pages-fallback.mjs` copies the built
`index.html` to:

- `404.html` — GitHub Pages SPA catch-all for unknown client paths
- `results/index.html`, `about/index.html`, `demo/index.html`, `model-card/index.html` —
  so refresh / shared deep links under those routes return **HTTP 200** with the app shell
  (not GitHub’s default 404). Existing files under `public/results/` (metrics, mistakes) are kept.

**Verify after deploy (or locally):**

```bash
cd web
VITE_BASE=/Lymph-node-metastasis-detector/ npm run build
python3 -m http.server 8765 --directory dist
# In another terminal:
curl -s -o /tmp/results.html -w '%{http_code}\n' http://127.0.0.1:8765/results/
curl -s -o /tmp/about.html -w '%{http_code}\n' http://127.0.0.1:8765/about/
grep -q 'id="root"' /tmp/results.html && echo 'results: SPA shell OK'
grep -q 'id="root"' /tmp/about.html && echo 'about: SPA shell OK'
```

On the live site, the same checks apply to  
`https://surabhif.github.io/Lymph-node-metastasis-detector/results/` and `/about/`.

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
