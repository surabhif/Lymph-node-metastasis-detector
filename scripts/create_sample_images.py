#!/usr/bin/env python3
"""
Create synthetic H&E-like sample images for the demo gallery.

These are NOT real pathology patches. They exist so visitors can click and run
the detector before Surabhi exports real PCam test-set samples from her notebook.

After training, replace files in web/public/samples/ with real CC0 PCam patches
and update web/src/data/samples.json accordingly.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


RNG = np.random.default_rng(42)
OUT = Path(__file__).resolve().parents[1] / "web" / "public" / "samples"


def he_base(size: int, seed: int) -> np.ndarray:
    """Pink/purple H&E-ish background with texture."""
    r = np.random.default_rng(seed)
    # Hematoxylin (purple-blue) + eosin (pink) blend
    img = np.zeros((size, size, 3), dtype=np.float32)
    pink = np.array([0.86, 0.62, 0.72], dtype=np.float32)
    purple = np.array([0.45, 0.35, 0.55], dtype=np.float32)
    white = np.array([0.95, 0.92, 0.93], dtype=np.float32)

    noise = r.random((size, size, 1))
    mix = 0.55 * pink + 0.25 * purple + 0.20 * white
    img[:] = mix
    img += (noise - 0.5) * 0.12

    # Soft cellular blobs
    for _ in range(80):
        cy, cx = r.integers(0, size, size=2)
        rad = int(r.integers(3, 10))
        yy, xx = np.ogrid[-cy : size - cy, -cx : size - cx]
        mask = xx * xx + yy * yy <= rad * rad
        color = purple if r.random() < 0.55 else pink
        img[mask] = 0.65 * img[mask] + 0.35 * color + r.normal(0, 0.02, 3)

    img = np.clip(img, 0, 1)
    return (img * 255).astype(np.uint8)


def add_dense_nuclei(img: np.ndarray, seed: int, density: int = 120) -> np.ndarray:
    """Add darker nuclear-looking dots (stands in for 'tumor-like' texture)."""
    r = np.random.default_rng(seed)
    out = img.copy()
    h, w = out.shape[:2]
    for _ in range(density):
        cy, cx = r.integers(0, h), r.integers(0, w)
        rad = int(r.integers(2, 6))
        yy, xx = np.ogrid[-cy : h - cy, -cx : w - cx]
        mask = xx * xx + yy * yy <= rad * rad
        out[mask] = (out[mask] * 0.35 + np.array([40, 25, 70])).astype(np.uint8)
    return out


def add_sparse_stroma(img: np.ndarray, seed: int) -> np.ndarray:
    """Sparser texture standing in for 'normal-like' lymph-node stroma."""
    r = np.random.default_rng(seed)
    out = img.copy()
    h, w = out.shape[:2]
    for _ in range(35):
        cy, cx = r.integers(0, h), r.integers(0, w)
        rad = int(r.integers(2, 5))
        yy, xx = np.ogrid[-cy : h - cy, -cx : w - cx]
        mask = xx * xx + yy * yy <= rad * rad
        out[mask] = (out[mask] * 0.7 + np.array([90, 60, 110])).astype(np.uint8)
    return out


def save_png(arr: np.ndarray, path: Path) -> None:
    Image.fromarray(arr).save(path, optimize=True)


def make_large_tile(path: Path, seed: int = 7) -> None:
    """Stitch a larger synthetic tile (~288×288) with a denser region on one side."""
    tile = 96
    grid = 3
    canvas = np.zeros((tile * grid, tile * grid, 3), dtype=np.uint8)
    for gy in range(grid):
        for gx in range(grid):
            patch = he_base(tile, seed + gy * 10 + gx)
            # Right side denser — so sliding-window map can show variation
            if gx >= 1:
                patch = add_dense_nuclei(patch, seed + 100 + gy * 10 + gx, density=90 + gx * 40)
            else:
                patch = add_sparse_stroma(patch, seed + 200 + gy * 10 + gx)
            canvas[gy * tile : (gy + 1) * tile, gx * tile : (gx + 1) * tile] = patch
    # Slight blur so seams are less harsh
    img = Image.fromarray(canvas).filter(ImageFilter.GaussianBlur(radius=0.6))
    img.save(path, optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    samples = []

    # Mix of "tumor-like" and "normal-like" synthetic patches (96×96)
    specs = [
        ("syn_tumor_01.png", "tumor", True, 1, 140),
        ("syn_tumor_02.png", "tumor", True, 2, 160),
        ("syn_tumor_03.png", "tumor", True, 3, 180),
        ("syn_normal_01.png", "normal", False, 4, 30),
        ("syn_normal_02.png", "normal", False, 5, 25),
        ("syn_normal_03.png", "normal", False, 6, 35),
    ]

    for filename, label, is_tumor, seed, density in specs:
        img = he_base(96, seed)
        if is_tumor:
            img = add_dense_nuclei(img, seed + 50, density=density)
        else:
            img = add_sparse_stroma(img, seed + 50)
        save_png(img, OUT / filename)
        samples.append(
            {
                "id": filename.replace(".png", ""),
                "src": f"samples/{filename}",
                "label": label,
                "groundTruthTumor": is_tumor,
                "kind": "patch",
                "note": "Synthetic H&E-like placeholder (not real PCam). Replace after training.",
            }
        )

    make_large_tile(OUT / "syn_tile_large.png", seed=99)
    samples.append(
        {
            "id": "syn_tile_large",
            "src": "samples/syn_tile_large.png",
            "label": "mixed tile",
            "groundTruthTumor": None,
            "kind": "tile",
            "note": "Synthetic 288×288 tile for patch-wise scanning demo. Not real pathology.",
        }
    )

    # Second slightly different large tile
    make_large_tile(OUT / "syn_tile_large_2.png", seed=123)
    samples.append(
        {
            "id": "syn_tile_large_2",
            "src": "samples/syn_tile_large_2.png",
            "label": "mixed tile",
            "groundTruthTumor": None,
            "kind": "tile",
            "note": "Synthetic 288×288 tile for patch-wise scanning demo. Not real pathology.",
        }
    )

    manifest = {
        "disclaimer": (
            "Gallery images are synthetic placeholders so the demo works before real "
            "PCam test patches are exported. They are not clinical images."
        ),
        "samples": samples,
    }
    # Also write JSON into src for the app to import, and public for reference
    src_data = Path(__file__).resolve().parents[1] / "web" / "src" / "data"
    src_data.mkdir(parents=True, exist_ok=True)
    (src_data / "samples.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (OUT / "README.txt").write_text(
        "Synthetic demo samples only.\n"
        "After training in Colab, export a few labeled PCam test patches here\n"
        "and update web/src/data/samples.json (groundTruthTumor, note, etc.).\n"
    )
    print(f"Wrote {len(samples)} samples to {OUT}")
    print(f"Wrote {src_data / 'samples.json'}")


if __name__ == "__main__":
    main()
