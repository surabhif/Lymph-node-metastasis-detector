# Third-party notices

This repository’s **application code** is licensed under the MIT License (see `LICENSE` if present / repository license).

The following third-party **assets** are redistributed under their own terms.

## NIH / HuBMAP Human Reference Atlas (HRA)

| Field | Detail |
| --- | --- |
| **Assets** | `skin_torso.glb`, `mammary_r.glb`, `lymph_node.glb` under `web/public/models/explainer/` |
| **Source** | NIH/HuBMAP Human Reference Atlas 3D Reference Object Library |
| **Digital objects** | skin-female v1.5; mammary-gland-female-right v1.1; lymph-node-female v1.4 |
| **CDN asset URLs** | `https://cdn.humanatlas.io/digital-objects/ref-organ/skin-female/v1.5/assets/3d-vh-f-skin.glb`; `…/mammary-gland-female-right/v1.1/assets/3d-vh-f-mammary-gland-r.glb`; `…/lymph-node-female/v1.4/assets/3d-nih-f-lymph-node.glb` |
| **License** | Creative Commons Attribution **4.0** International (CC BY 4.0) |
| **License deed** | https://creativecommons.org/licenses/by/4.0/ |
| **License verified** | CDN directory JSON-LD `"license": "https://creativecommons.org/licenses/by/4.0/"` (checked 2026-10-04) |
| **Required attribution** | “3D Reference Organs from the NIH/HuBMAP Human Reference Atlas, licensed under CC BY 4.0” |

### Changes made for this project

1. **Skin:** cropped to an upper-torso window (approx. lower neck → mid-abdomen; arms limited), Draco-compressed.
2. **Mammary (right):** pruned to soft-tissue meshes (fat + mammary lobes); duct/ligament detail omitted for size; Draco-compressed.
3. **Lymph node:** decimated + Draco-compressed for step-3 interior.
4. Coordinates remain Visible Human Female metres (Y-up); the app recenters on the right breast (`hra_center_m` in `landmarks.json`).
5. Educational overlays (tumor, axillary vessels/nodes, deposit spheres) are **not** part of HRA.

## BodyParts3D chest cues (`web/public/models/explainer/bp3d_chest.glb`)

| Field | Detail |
| --- | --- |
| **Asset** | Optimized chest GLB (pectoralis major/minor, deltoid cues, clavicles, sternum) |
| **Source database** | BodyParts3D (Anatomography), Database Center for Life Science (DBCLS) |
| **Source URL** | https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html |
| **Download page** | https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html |
| **License page (verified)** | https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html |
| **License** | Creative Commons Attribution **4.0** International (CC BY 4.0) |
| **License deed** | https://creativecommons.org/licenses/by/4.0/ |
| **Author / rights holder** | The Database Center for Life Science |
| **Required attribution** | “BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International” |
| **Upstream archives used** | `partof_BP3D_4.0_obj_99.zip`, `isa_BP3D_4.0_obj_99.zip` (polygon reduction 99%, BodyParts3D 4.0) |

### Changes made for this project

1. Extracted pectoral / clavicle / sternum parts from the prior upper-torso build.
2. Cropped, decimated, and Draco-compressed.
3. Converted from BodyParts3D millimetres (Z-up) to metres (Y-up); lightly offset/scaled in-app to sit under HRA female skin (approximate male→female alignment).
4. Legacy full torso retained as `upper_torso.glb` (fallback companion only).

### License note

CC BY 4.0 allows redistribution and adaptation with attribution. The **code** of this repository remains MIT. **HRA-derived** and **BodyParts3D-derived** meshes remain under **CC BY 4.0** (not MIT). Keep this notice and the Sources credit when redistributing the GLBs.

## Poly Haven (optional)

| Field | Detail |
| --- | --- |
| **Asset** | Optional `studio_small_09` HDRI under `web/public/hdri/` |
| **Source** | https://polyhaven.com/a/studio_small_09 |
| **License** | CC0 1.0 (public domain dedication) — https://polyhaven.com/license |
| **Phase 1 usage** | Not required at runtime; explainer uses self-contained Lightformers for IBL |
