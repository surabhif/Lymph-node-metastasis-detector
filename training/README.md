# Full-PCam retrain (reproducibility)

Scripts used for the full official-split PatchCamelyon retrain shipped in the
web demo (`full_pcam_int8_v1`).

| File | Role |
| --- | --- |
| `train.py` | CPU bf16 training on all 262,144 train patches (default 8 epochs; best by val AUC). |
| `evaluate.py` | Val calibration (none / temperature / Platt), Youden threshold, full-test metrics, ONNX export + INT8 parity. |

Artifacts consumed by the site (under `web/public/`):

- `models/pcam_cam.onnx` — INT8 CAM model (`input` → `probability`, `features`, `cam_weights`)
- `models/model_manifest.json` — version, Platt `a`/`b`, threshold, uncertain band
- `models/calibration.json` — same calibration constants
- `results/full_retrain_metrics.json` — full metrics dump (source of truth for Results / Model card)
- `results/full_retrain_train_history.json` — per-epoch val AUC/acc

Educational research only — not for clinical use.
