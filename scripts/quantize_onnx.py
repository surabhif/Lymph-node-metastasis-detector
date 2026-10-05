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

    print(f"FP32 size: {fp32_path.stat().st_size / 1e6:.2f} MB")

    def run_quant(op_types: list[str] | None, label: str) -> Path:
        out = REPO / "export" / f"pcam_cam_int8_{label}.onnx"
        if out.exists():
            out.unlink()
        kwargs = dict(
            model_input=str(fp32_path),
            model_output=str(out),
            weight_type=QuantType.QUInt8,
            extra_options={"WeightSymmetric": True},
        )
        if op_types is not None:
            kwargs["op_types_to_quantize"] = op_types
        quantize_dynamic(**kwargs)
        print(f"INT8 ({label}) size: {out.stat().st_size / 1e6:.2f} MB")
        return out

    # Prefer MatMul/Gemm-only (keeps Conv float for CAM maps). If size barely drops —
    # typical for ResNet where almost all weights are Conv — fall back to default ops
    # including Conv, same as the earlier quick-baseline browser shrink.
    quant_path = run_quant(["MatMul", "Gemm"], "matmul_gemm")
    method = "onnxruntime.quantization.quantize_dynamic MatMul/Gemm QUInt8"
    if quant_path.stat().st_size >= fp32_path.stat().st_size * 0.95:
        quant_path = run_quant(None, "default_ops")
        method = "onnxruntime.quantization.quantize_dynamic default ops (incl. Conv) QUInt8"

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
        "method": method,
        "gallery_deltas": deltas,
        "mean_abs_delta": float(np.mean(abs_deltas)) if abs_deltas else None,
        "max_abs_delta": float(np.max(abs_deltas)) if abs_deltas else None,
    }

    # Adopt int8 if size dropped and max abs delta is modest (<0.08)
    adopt = report["int8_mb"] < report["fp32_mb"] * 0.95 and (report["max_abs_delta"] or 1) < 0.08
    report["adopted_for_web"] = bool(adopt)
    if adopt:
        shutil.copy2(quant_path, DST)
        (REPO / "web" / "public" / "models" / "MODEL_STATUS.txt").write_text(
            "STATUS=improved_baseline_int8\n"
            "DESCRIPTION=Improved Cursor-assisted baseline (dynamic INT8 quantization for browser size). "
            "Surabhi can still replace with her own Colab export. "
            "See results/baseline_fuller_run.json for train/val/test counts and epochs.\n"
            f"METHOD={method}\n"
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
