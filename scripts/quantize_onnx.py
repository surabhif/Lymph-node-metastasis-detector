#!/usr/bin/env python3
"""
Quantize the demo ONNX model for faster browser download and compare gallery scores.

Tries ONNX Runtime dynamic int8 quantization (weights). Reports size and per-sample
probability deltas on the shipped gallery patches. Keeps CAM outputs intact.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "web" / "public" / "models" / "pcam_cam.onnx"
DST = REPO / "web" / "public" / "models" / "pcam_cam.onnx"
BACKUP = REPO / "export" / "pcam_cam_fp32.onnx"
REPORT = REPO / "results" / "quantization_report.json"
SAMPLES = REPO / "web" / "src" / "data" / "samples.json"

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def preprocess(path: Path) -> np.ndarray:
    img = np.asarray(Image.open(path).convert("RGB").resize((96, 96)), dtype=np.float32) / 255.0
    x = (img - MEAN) / STD
    return x.transpose(2, 0, 1)[None].astype(np.float32)


def score(session: ort.InferenceSession, path: Path) -> float:
    outs = session.run(["probability"], {"input": preprocess(path)})
    return float(outs[0].ravel()[0])


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing {SRC}")

    BACKUP.parent.mkdir(parents=True, exist_ok=True)
    if not BACKUP.exists() or BACKUP.stat().st_size < SRC.stat().st_size:
        shutil.copy2(SRC, BACKUP)

    fp32_path = BACKUP
    quant_path = REPO / "export" / "pcam_cam_int8.onnx"
    # ORT dynamic quant writes a new file
    if quant_path.exists():
        quant_path.unlink()

    print(f"FP32 size: {fp32_path.stat().st_size / 1e6:.2f} MB")
    quantize_dynamic(
        model_input=str(fp32_path),
        model_output=str(quant_path),
        weight_type=QuantType.QUINT8,
        # Keep Conv as float for CAM feature-map quality / browser stability; quantize MatMul/Gemm.
        op_types_to_quantize=["MatMul", "Gemm"],
        extra_options={"WeightSymmetric": True},
    )
    print(f"INT8 (MatMul/Gemm) size: {quant_path.stat().st_size / 1e6:.2f} MB")

    # Validate outputs exist
    m = onnx.load(str(quant_path))
    print("outputs:", [o.name for o in m.graph.output])

    sess_fp32 = ort.InferenceSession(str(fp32_path), providers=["CPUExecutionProvider"])
    sess_q = ort.InferenceSession(str(quant_path), providers=["CPUExecutionProvider"])

    manifest = json.loads(SAMPLES.read_text())
    deltas = []
    for s in manifest["samples"]:
        if s.get("kind") != "patch":
            continue
        path = REPO / "web" / "public" / s["src"]
        p0 = score(sess_fp32, path)
        p1 = score(sess_q, path)
        deltas.append(
            {
                "id": s["id"],
                "label": s["label"],
                "fp32": p0,
                "int8": p1,
                "delta": p1 - p0,
                "abs_delta": abs(p1 - p0),
            }
        )
        print(f"{s['label']:6} {s['id']}: fp32={p0:.4f} int8={p1:.4f} Δ={p1-p0:+.4f}")

    abs_deltas = [d["abs_delta"] for d in deltas]
    report = {
        "fp32_path": str(fp32_path.relative_to(REPO)),
        "int8_path": str(quant_path.relative_to(REPO)),
        "fp32_bytes": fp32_path.stat().st_size,
        "int8_bytes": quant_path.stat().st_size,
        "fp32_mb": round(fp32_path.stat().st_size / (1024 * 1024), 2),
        "int8_mb": round(quant_path.stat().st_size / (1024 * 1024), 2),
        "method": "onnxruntime.quantization.quantize_dynamic MatMul/Gemm QUINT8",
        "gallery_deltas": deltas,
        "mean_abs_delta": float(np.mean(abs_deltas)) if abs_deltas else None,
        "max_abs_delta": float(np.max(abs_deltas)) if abs_deltas else None,
    }

    # Adopt int8 if size dropped and max abs delta is modest (<0.05 preferred)
    adopt = report["int8_mb"] < report["fp32_mb"] * 0.95 and (report["max_abs_delta"] or 1) < 0.08
    report["adopted_for_web"] = bool(adopt)
    if adopt:
        shutil.copy2(quant_path, DST)
        (REPO / "web" / "public" / "models" / "MODEL_STATUS.txt").write_text(
            "STATUS=quick_baseline_int8\n"
            "DESCRIPTION=Quick Cursor-assisted baseline (dynamic INT8 MatMul/Gemm quantization for browser size). "
            "Replace with Surabhi's own Colab export when ready.\n"
            f"FP32_MB={report['fp32_mb']}\n"
            f"INT8_MB={report['int8_mb']}\n"
            f"GALLERY_MAX_ABS_DELTA={report['max_abs_delta']:.4f}\n"
        )
        print(f"Adopted INT8 → {DST}")
    else:
        print("Keeping FP32 for web (quantization not adopted)")

    REPORT.write_text(json.dumps(report, indent=2) + "\n")
    print("Wrote", REPORT)


if __name__ == "__main__":
    main()
