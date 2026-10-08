#!/usr/bin/env python3
"""
Fit temperature / Platt calibration when validation logits are available.

This environment does not ship PCam HDF5 or stored val logits, so the script
exits cleanly with a status file rather than inventing parameters.

Usage (Colab / machine with logits NPZ):
  python scripts/calibrate_current_baseline.py \\
    --val-logits path/to/val_logits.npz \\
    --out web/public/models/model_manifest.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--val-logits", type=Path, default=None)
    ap.add_argument(
        "--out",
        type=Path,
        default=Path("web/public/models/model_manifest.json"),
    )
    args = ap.parse_args()

    if args.val_logits is None or not args.val_logits.exists():
        print(
            "No validation logits available — leaving calibration.method=none. "
            "Full temperature/Platt fit requires val logits from the GPU retrain."
        )
        return

    data = np.load(args.val_logits)
    logits = np.asarray(data["logits"]).reshape(-1)
    labels = np.asarray(data["labels"]).reshape(-1).astype(np.float64)

    # Deferred heavy deps — only when actually fitting
    import torch
    from sklearn.linear_model import LogisticRegression

    z = torch.tensor(logits, dtype=torch.float64)
    y = torch.tensor(labels, dtype=torch.float64)
    log_t = torch.nn.Parameter(torch.zeros(()))
    opt = torch.optim.LBFGS([log_t], lr=0.5, max_iter=50)

    def closure():
        opt.zero_grad()
        t = log_t.exp().clamp(min=1e-3)
        p = torch.sigmoid(z / t)
        nll = -(y * p.clamp(1e-7).log() + (1 - y) * (1 - p).clamp(1e-7).log()).mean()
        nll.backward()
        return nll

    opt.step(closure)
    T = float(log_t.exp().clamp(min=1e-3).item())
    p_temp = 1 / (1 + np.exp(-(logits / T)))
    nll_temp = float(
        -(labels * np.log(np.clip(p_temp, 1e-7, 1)) + (1 - labels) * np.log(np.clip(1 - p_temp, 1e-7, 1))).mean()
    )

    clf = LogisticRegression(solver="lbfgs")
    clf.fit(logits.reshape(-1, 1), labels.astype(int))
    a = float(clf.coef_.ravel()[0])
    b = float(clf.intercept_.ravel()[0])
    p_platt = 1 / (1 + np.exp(-(a * logits + b)))
    nll_platt = float(
        -(labels * np.log(np.clip(p_platt, 1e-7, 1)) + (1 - labels) * np.log(np.clip(1 - p_platt, 1e-7, 1))).mean()
    )

    if nll_platt <= nll_temp:
        cal = {"method": "platt", "a": a, "b": b, "val_nll": nll_platt, "alt_temperature_T": T, "alt_val_nll": nll_temp}
    else:
        cal = {"method": "temperature", "T": T, "val_nll": nll_temp, "alt_platt_a": a, "alt_platt_b": b, "alt_val_nll": nll_platt}

    manifest = {}
    if args.out.exists():
        manifest = json.loads(args.out.read_text())
    manifest["calibration"] = cal
    args.out.write_text(json.dumps(manifest, indent=2) + "\n")
    print("Wrote", args.out)
    print(cal)


if __name__ == "__main__":
    main()
