#!/usr/bin/env python3
"""
Export a small honest gallery of real PatchCamelyon (PCam) *test-set* patches
for the React demo.

PCam is CC0. Cite Veeling et al. 2018 and Bejnordi et al. 2017 / Camelyon16.

Usage
-----
1. Put the official test split under DATA_ROOT (default: ./pcam_data/pcam/):

     camelyonpatch_level_2_split_test_x.h5
     camelyonpatch_level_2_split_test_y.h5

   Download only those two files from Zenodo (record 2546921) or via:

     python -c "from torchvision.datasets import PCAM; PCAM('./pcam_data', split='test', download=True)"

2. Run:

     python scripts/export_gallery.py

3. Commit the new PNGs under web/public/samples/ and web/src/data/samples.json

Selection is random with a fixed seed (not cherry-picked). Larger "tiles" are
clearly labeled mosaics stitched from separate test patches (not contiguous tissue).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import h5py
import numpy as np
from PIL import Image


SEED = 42
N_PER_CLASS = 4
PATCH = 96
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = REPO_ROOT / "pcam_data" / "pcam"
OUT_DIR = REPO_ROOT / "web" / "public" / "samples"
MANIFEST_PATH = REPO_ROOT / "web" / "src" / "data" / "samples.json"

X_NAME = "camelyonpatch_level_2_split_test_x.h5"
Y_NAME = "camelyonpatch_level_2_split_test_y.h5"


def load_labels(y_path: Path) -> np.ndarray:
    with h5py.File(y_path, "r") as f:
        return np.asarray(f["y"]).reshape(-1).astype(np.int64)


def read_patch(x_file: h5py.File, index: int) -> np.ndarray:
    return np.asarray(x_file["x"][index])  # uint8 HWC


def choose_indices(labels: np.ndarray, seed: int, n_per_class: int) -> dict[str, list[int]]:
    rng = np.random.default_rng(seed)
    tumor = np.flatnonzero(labels == 1)
    normal = np.flatnonzero(labels == 0)
    if len(tumor) < n_per_class or len(normal) < n_per_class:
        raise RuntimeError("Not enough labeled patches in the test split.")
    tumor_idx = sorted(rng.choice(tumor, size=n_per_class, replace=False).tolist())
    normal_idx = sorted(rng.choice(normal, size=n_per_class, replace=False).tolist())
    return {"tumor": tumor_idx, "normal": normal_idx}


def save_png(arr: np.ndarray, path: Path) -> None:
    Image.fromarray(arr).save(path, optimize=True)


def stitch_mosaic(x_file: h5py.File, indices: list[int], grid: int = 3) -> np.ndarray:
    """Stitch separate test patches into a grid. Not a contiguous tissue region."""
    assert len(indices) >= grid * grid
    canvas = np.zeros((PATCH * grid, PATCH * grid, 3), dtype=np.uint8)
    k = 0
    for gy in range(grid):
        for gx in range(grid):
            patch = read_patch(x_file, indices[k])
            canvas[gy * PATCH : (gy + 1) * PATCH, gx * PATCH : (gx + 1) * PATCH] = patch
            k += 1
    return canvas


def clear_old_samples(out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for p in out_dir.glob("*.png"):
        p.unlink()
    readme = out_dir / "README.txt"
    if readme.exists():
        readme.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-root", type=Path, default=DEFAULT_DATA, help="Folder containing PCam test h5 files")
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--n-per-class", type=int, default=N_PER_CLASS)
    args = parser.parse_args()

    x_path = args.data_root / X_NAME
    y_path = args.data_root / Y_NAME
    if not x_path.exists() or not y_path.exists():
        raise SystemExit(
            f"Missing test split files under {args.data_root}.\n"
            f"Expected:\n  {X_NAME}\n  {Y_NAME}\n"
            "Download from Zenodo record 2546921 or torchvision PCAM(download=True)."
        )

    labels = load_labels(y_path)
    chosen = choose_indices(labels, args.seed, args.n_per_class)
    print(f"Seed={args.seed}")
    print(f"Tumor test indices:  {chosen['tumor']}")
    print(f"Normal test indices: {chosen['normal']}")

    clear_old_samples(OUT_DIR)
    samples: list[dict] = []

    with h5py.File(x_path, "r") as x_file:
        for label_name, indices in chosen.items():
            is_tumor = label_name == "tumor"
            for rank, idx in enumerate(indices, start=1):
                arr = read_patch(x_file, idx)
                fname = f"pcam_test_{label_name}_{rank:02d}_idx{idx}.png"
                save_png(arr, OUT_DIR / fname)
                samples.append(
                    {
                        "id": fname.replace(".png", ""),
                        "src": f"samples/{fname}",
                        "label": label_name,
                        "groundTruthTumor": is_tumor,
                        "kind": "patch",
                        "testIndex": idx,
                        "note": (
                            f"Real PCam official test-split patch (index {idx}, CC0). "
                            "Selected at random with a fixed seed — not cherry-picked."
                        ),
                    }
                )

        # Mosaic tiles: draw extra random patches (also fixed-seed) so visitors can try sliding-window mode.
        rng = np.random.default_rng(args.seed + 7)
        all_idx = np.arange(len(labels))

        def mosaic_indices(mix_tumor_frac: float, count: int = 9) -> list[int]:
            n_tumor = int(round(count * mix_tumor_frac))
            n_normal = count - n_tumor
            t = rng.choice(np.flatnonzero(labels == 1), size=n_tumor, replace=False)
            n = rng.choice(np.flatnonzero(labels == 0), size=n_normal, replace=False)
            idxs = np.concatenate([t, n])
            rng.shuffle(idxs)
            return idxs.tolist()

        mosaics = [
            ("pcam_test_mosaic_01.png", 0.55, "mixed mosaic"),
            ("pcam_test_mosaic_02.png", 0.33, "mixed mosaic"),
        ]
        for fname, frac, label in mosaics:
            idxs = mosaic_indices(frac)
            tile = stitch_mosaic(x_file, idxs, grid=3)
            save_png(tile, OUT_DIR / fname)
            samples.append(
                {
                    "id": fname.replace(".png", ""),
                    "src": f"samples/{fname}",
                    "label": label,
                    "groundTruthTumor": None,
                    "kind": "tile",
                    "testIndices": idxs,
                    "note": (
                        "Stitched mosaic of 9 separate PCam test-set patches (CC0), "
                        f"indices {idxs}. Not a contiguous tissue region — for sliding-window demo only."
                    ),
                }
            )

    manifest = {
        "disclaimer": (
            "Gallery images are real PatchCamelyon (PCam) official test-set patches (CC0), "
            "chosen at random with a fixed seed — not cherry-picked. "
            "Mosaic tiles are stitched from separate patches, not contiguous slides. "
            "Inference still runs locally in your browser."
        ),
        "seed": args.seed,
        "source": "PCam official test split (Veeling et al. 2018; Camelyon16 / Bejnordi et al. 2017)",
        "samples": samples,
    }
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n")

    (OUT_DIR / "README.txt").write_text(
        "Real PCam official test-set patches (CC0).\n"
        "Regenerate with: python scripts/export_gallery.py\n"
        f"Selection seed: {args.seed}\n"
        "Mosaic tiles are stitched separate patches, not contiguous tissue.\n"
    )

    print(f"Wrote {len(samples)} gallery entries → {OUT_DIR}")
    print(f"Wrote {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
