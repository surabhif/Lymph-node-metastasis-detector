#!/usr/bin/env python3
"""
Build educational pseudo-slide regions for the /slide viewer.

Preferred path (full CAMELYON16 WSI + OpenSlide): extract an 8192² region
from a PCam-test-linked slide. This environment does not ship WSIs, so the
script falls back to a stitched mosaic of CC0 PCam test patches already in
web/public/samples/ — clearly labelled as a pseudo-slide, not contiguous tissue.

Outputs under web/public/slides/<id>/:
  display.png   full-resolution display image
  meta.json     license, source, grid, µm/px (approx), verification date
  outline.json  simple educational polygon (tumor tiles bounding box)
  mask.bin      1 byte per patch cell (1=tissue)
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
SAMPLES = REPO / "web" / "public" / "samples"
OUT = REPO / "web" / "public" / "slides"
PATCH = 96
VERIFIED = "2026-10-08"


def load_rgb(name: str) -> np.ndarray:
    return np.asarray(Image.open(SAMPLES / name).convert("RGB"))


def stitch(grid: list[list[str]], out_name: str, meta: dict) -> None:
    rows = len(grid)
    cols = len(grid[0])
    canvas = np.zeros((rows * PATCH, cols * PATCH, 3), dtype=np.uint8)
    mask = np.ones((rows, cols), dtype=np.uint8)
    tumor_cells = []
    for r, row in enumerate(grid):
        for c, fname in enumerate(row):
            tile = load_rgb(fname)
            canvas[r * PATCH : (r + 1) * PATCH, c * PATCH : (c + 1) * PATCH] = tile
            if "tumor" in fname:
                tumor_cells.append((c, r))

    dest = OUT / out_name
    dest.mkdir(parents=True, exist_ok=True)
    Image.fromarray(canvas).save(dest / "display.png", optimize=True)
    (dest / "mask.bin").write_bytes(mask.tobytes())

    # Bounding box of tumor tiles as a simple educational "expert outline"
    if tumor_cells:
        xs = [t[0] for t in tumor_cells]
        ys = [t[1] for t in tumor_cells]
        x0, x1 = min(xs) * PATCH, (max(xs) + 1) * PATCH
        y0, y1 = min(ys) * PATCH, (max(ys) + 1) * PATCH
        outline = {
            "type": "Polygon",
            "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
            "note": "Educational bounding box around tumor-labelled patches in this pseudo-slide — not a CAMELYON16 XML annotation.",
        }
    else:
        outline = {"type": "Polygon", "coordinates": [], "note": "No tumor tiles in this region."}

    (dest / "outline.json").write_text(json.dumps(outline, indent=2) + "\n")
    meta = {
        **meta,
        "id": out_name,
        "width": int(canvas.shape[1]),
        "height": int(canvas.shape[0]),
        "patch_size": PATCH,
        "grid": [rows, cols],
        "display": "display.png",
        "um_per_px_approx": 1.0,  # PCam patches are ~10×; absolute µm not claimed
        "pseudo_slide": True,
        "license": "CC0",
        "license_verified": VERIFIED,
        "license_sources": [
            "https://camelyon17.grand-challenge.org/Data/ (CAMELYON16/17: made available under CC0)",
            "https://registry.opendata.aws/camelyon/ (License: CC0)",
        ],
        "attribution": "Bejnordi et al., JAMA 2017; Litjens et al., GigaScience 2018; Veeling et al. 2018 (PCam).",
        "warning": "Stitched from separate PCam official-test patches — not a contiguous whole-slide region. Educational only; not for clinical use.",
    }
    (dest / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print("Wrote", dest, canvas.shape)


def main() -> None:
    tumor = [
        "pcam_test_tumor_01_idx2883.png",
        "pcam_test_tumor_02_idx14435.png",
        "pcam_test_tumor_03_idx21314.png",
        "pcam_test_tumor_04_idx25314.png",
    ]
    normal = [
        "pcam_test_normal_01_idx3223.png",
        "pcam_test_normal_02_idx6714.png",
        "pcam_test_normal_03_idx17222.png",
        "pcam_test_normal_04_idx22939.png",
    ]

    # Region A: metastasis-containing (tumor tiles clustered)
    a = [
        [normal[0], normal[1], normal[2], normal[3], normal[0], normal[1]],
        [normal[2], tumor[0], tumor[1], tumor[2], normal[3], normal[0]],
        [normal[1], tumor[3], tumor[0], tumor[1], tumor[2], normal[2]],
        [normal[3], normal[0], tumor[3], tumor[0], normal[1], normal[2]],
        [normal[0], normal[1], normal[2], normal[3], normal[0], normal[1]],
        [normal[2], normal[3], normal[0], normal[1], normal[2], normal[3]],
    ]
    stitch(
        a,
        "pseudo-metastasis-a",
        {
            "title": "Pseudo-region A (contains metastasis patches)",
            "kind": "metastasis",
            "source": "PCam official test patches (CC0), stitched",
        },
    )

    # Region B: normal-only
    b = [
        [normal[i % 4] for i in range(c, c + 6)]
        for c in range(0, 36, 6)
    ]
    stitch(
        b,
        "pseudo-normal-b",
        {
            "title": "Pseudo-region B (normal patches only)",
            "kind": "normal",
            "source": "PCam official test patches (CC0), stitched",
        },
    )

    index = {
        "regions": [
            {
                "id": "pseudo-metastasis-a",
                "title": "A · contains metastasis patches",
                "path": "slides/pseudo-metastasis-a/",
            },
            {
                "id": "pseudo-normal-b",
                "title": "B · normal node patches",
                "path": "slides/pseudo-normal-b/",
            },
        ],
        "note": "Pseudo-slides pending CAMELYON16 WSI extraction. License CC0 re-verified "
        + VERIFIED
        + ".",
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.json").write_text(json.dumps(index, indent=2) + "\n")
    print("Wrote", OUT / "index.json")


if __name__ == "__main__":
    main()
