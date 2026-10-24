#!/usr/bin/env python3
"""Build a compact threshold→metrics table from shipped ONNX test scores."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[1]
NPZ = REPO / "results" / "full_pcam_int8_v1_test_scores.npz"
OUT = REPO / "web" / "public" / "results" / "cutoff_table.json"

# 0.00 … 1.00 in 0.01 steps is 101 rows — compact enough for the browser.
STEPS = np.round(np.linspace(0.0, 1.0, 101), 2)


def main() -> None:
    data = np.load(NPZ)
    y = data["y"].astype(np.int64)
    p = data["calibrated"].astype(np.float64)
    thr_star = float(data["threshold"])
    lo = float(data["uncertain_lo"])
    hi = float(data["uncertain_hi"])
    n_pos = int((y == 1).sum())
    n_neg = int((y == 0).sum())

    rows = []
    for t in STEPS:
        pred = p >= t
        tp = int(((y == 1) & pred).sum())
        fn = n_pos - tp
        tn = int(((y == 0) & ~pred).sum())
        fp = n_neg - tn
        rows.append(
            {
                "t": float(t),
                "tp": tp,
                "fn": fn,
                "tn": tn,
                "fp": fp,
                "sensitivity": tp / max(n_pos, 1),
                "specificity": tn / max(n_neg, 1),
            }
        )

    # Exact chosen cutoff (may fall between 0.01 grid)
    pred = p >= thr_star
    tp = int(((y == 1) & pred).sum())
    fn = n_pos - tp
    tn = int(((y == 0) & ~pred).sum())
    fp = n_neg - tn
    chosen = {
        "t": thr_star,
        "tp": tp,
        "fn": fn,
        "tn": tn,
        "fp": fp,
        "sensitivity": tp / max(n_pos, 1),
        "specificity": tn / max(n_neg, 1),
    }

    payload = {
        "model_version": "full_pcam_int8_v1",
        "score": "platt_calibrated_onnx_probability",
        "n": int(len(y)),
        "n_tumor": n_pos,
        "n_normal": n_neg,
        "auc": float(data["auc_calibrated"]),
        "chosen_threshold": thr_star,
        "uncertain_band": {"lo": lo, "hi": hi},
        "chosen": chosen,
        "step": 0.01,
        "rows": rows,
        "note": (
            "Counts from the shipped INT8 ONNX model on the full official PCam test split, "
            "after Platt calibration. Educational only, not for clinical use."
        ),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print("Wrote", OUT, "rows=", len(rows))
    print(
        f"at t*={thr_star:.4f}: sens={chosen['sensitivity']:.4f} "
        f"spec={chosen['specificity']:.4f} FN={fn} FP={fp}"
    )


if __name__ == "__main__":
    main()
