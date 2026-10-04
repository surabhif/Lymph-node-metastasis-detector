# Third-party notices

This repository’s **application code** is licensed under the MIT License (see `LICENSE` if present / repository license).

The following third-party **assets** are redistributed under their own terms.

## BodyParts3D upper-torso mesh (`web/public/models/explainer/upper_torso.glb`)

| Field | Detail |
| --- | --- |
| **Asset** | Optimized upper-torso GLB (skin + pectoral / deltoid muscles + clavicles, sternum, proximal humeri) |
| **Source database** | BodyParts3D (Anatomography), Database Center for Life Science (DBCLS) |
| **Source URL** | https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html |
| **Download page** | https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html |
| **License page (verified)** | https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html |
| **License** | Creative Commons Attribution **4.0** International (CC BY 4.0) |
| **License deed** | https://creativecommons.org/licenses/by/4.0/ |
| **Author / rights holder** | The Database Center for Life Science |
| **Required attribution** | “BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International” |
| **Upstream archives used** | `partof_BP3D_4.0_obj_99.zip`, `isa_BP3D_4.0_obj_99.zip` (polygon reduction 99%, BodyParts3D 4.0) |
| **FMA / element IDs included** | Skin `FMA7163`/`FJ2810`; right/left pectoralis major & minor; clavicular & acromial deltoid parts; clavicles; sternum body; proximal humeri |

### Changes made for this project

1. Cropped meshes to an upper-torso window (approximately mid-abdomen to mid-neck; limited arm span).
2. Quadric-decimated meshes for web performance.
3. Converted coordinates from BodyParts3D millimetres (Z-up) to metres (Y-up), chest toward +Z; recentered.
4. Packaged as glTF Binary (`.glb`) with separate skin / muscle / bone materials.
5. Compressed with **glTF-Transform Draco** (`KHR_draco_mesh_compression`).
6. Educational overlays (tumor marker, lymph vessels, axillary nodes, internal mammary hints) are **not** part of BodyParts3D; they are original scene geometry in the React/Three.js app.

### License note

CC BY 4.0 allows redistribution and adaptation with attribution. The **code** of this repository remains MIT. The **BodyParts3D-derived mesh** remains under **CC BY 4.0** (not MIT). Keep this notice and the Sources credit when redistributing the GLB.
