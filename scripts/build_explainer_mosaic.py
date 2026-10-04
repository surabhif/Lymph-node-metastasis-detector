#!/usr/bin/env python3
"""Build the explainer Step 5 WSI-stand-in mosaic from gallery PCam patches.

Uses real H&E PatchCamelyon test patches already exported under web/public/samples/.
The center tile is a known tumor-labeled patch (for highlight + demo CTA).

Regenerate:
  python scripts/build_explainer_mosaic.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "web" / "public" / "samples"
OUT_PNG = SAMPLES / "explainer_pcam_mosaic.png"
OUT_META = ROOT / "web" / "src" / "explainer" / "patchesMeta.json"
PATCH = 96
GRID = 3

# Center (1,1) is the hot tumor tile linked from the explainer CTA.
LAYOUT = [
    (0, 0, "pcam_test_normal_01_idx3223.png", False, "pcam_test_normal_01_idx3223"),
    (0, 1, "pcam_test_tumor_02_idx14435.png", True, "pcam_test_tumor_02_idx14435"),
    (0, 2, "pcam_test_normal_02_idx6714.png", False, "pcam_test_normal_02_idx6714"),
    (1, 0, "pcam_test_normal_03_idx17222.png", False, "pcam_test_normal_03_idx17222"),
    (1, 1, "pcam_test_tumor_01_idx2883.png", True, "pcam_test_tumor_01_idx2883"),
    (1, 2, "pcam_test_normal_04_idx22939.png", False, "pcam_test_normal_04_idx22939"),
    (2, 0, "pcam_test_tumor_03_idx21314.png", True, "pcam_test_tumor_03_idx21314"),
    (2, 1, "pcam_test_tumor_04_idx25314.png", True, "pcam_test_tumor_04_idx25314"),
    (2, 2, "pcam_test_normal_01_idx3223.png", False, "pcam_test_normal_01_idx3223"),
]


def main() -> None:
    canvas = np.zeros((PATCH * GRID, PATCH * GRID, 3), dtype=np.uint8)
    tiles: list[dict] = []
    for r, c, fname, is_tumor, gid in LAYOUT:
        path = SAMPLES / fname
        if not path.exists():
            raise SystemExit(f"Missing gallery patch: {path}")
        arr = np.asarray(Image.open(path).convert("RGB"))
        if arr.shape[:2] != (PATCH, PATCH):
            raise SystemExit(f"Expected {PATCH}×{PATCH}, got {arr.shape} for {fname}")
        canvas[r * PATCH : (r + 1) * PATCH, c * PATCH : (c + 1) * PATCH] = arr
        tiles.append(
            {
                "row": r,
                "col": c,
                "isTumor": is_tumor,
                "galleryId": gid,
                "src": f"samples/{fname}",
                "hot": r == 1 and c == 1,
            }
        )

    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(canvas).save(OUT_PNG, optimize=True)
    hot = next(t for t in tiles if t["hot"])
    meta = {
        "mosaicSrc": "samples/explainer_pcam_mosaic.png",
        "grid": GRID,
        "patchPx": PATCH,
        "label": "Mosaic of real PCam patches standing in for a whole-slide image",
        "disclaimer": (
            "Stitched from separate PatchCamelyon (PCam) official test-set patches (CC0). "
            "Not a contiguous whole-slide region — an honest stand-in for tiling."
        ),
        "labelingRule": (
            "In PCam, a patch is labeled tumor if the center 32×32 region contains tumor tissue."
        ),
        "source": "PCam official test split (Veeling et al. 2018; Camelyon16 / Bejnordi et al. 2017)",
        "hotTile": {
            "row": hot["row"],
            "col": hot["col"],
            "galleryId": hot["galleryId"],
            "src": hot["src"],
        },
        "tiles": tiles,
    }
    OUT_META.parent.mkdir(parents=True, exist_ok=True)
    OUT_META.write_text(json.dumps(meta, indent=2) + "\n")
    print(f"Wrote {OUT_PNG} ({OUT_PNG.stat().st_size} bytes)")
    print(f"Wrote {OUT_META}")
    print(f"Hot tumor tile → {hot['galleryId']}")


if __name__ == "__main__":
    main()
