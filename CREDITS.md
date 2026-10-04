# Credits

## NIH / HuBMAP Human Reference Atlas (HRA) 3D Reference Organs

The educational explainer’s primary female anatomy meshes come from the **NIH/HuBMAP Human Reference Atlas 3D Reference Object Library**:

| Asset | Digital object | Version | GLB used in app |
| --- | --- | --- | --- |
| Female skin (torso crop) | [skin-female](https://humanatlas.io/digital-objects/ref-organ/skin-female/v1.5) | v1.5 | `web/public/models/explainer/skin_torso.glb` |
| Right mammary gland | [mammary-gland-female-right](https://humanatlas.io/digital-objects/ref-organ/mammary-gland-female-right/v1.1) | v1.1 | `web/public/models/explainer/mammary_r.glb` |
| Female lymph node | [lymph-node-female](https://humanatlas.io/digital-objects/ref-organ/lymph-node-female/v1.4) | v1.4 | `web/public/models/explainer/lymph_node.glb` |

- **License:** [CC BY 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- **License verified on CDN JSON-LD** (`"license": "https://creativecommons.org/licenses/by/4.0/"`) for each digital object directory under `https://cdn.humanatlas.io/digital-objects/ref-organ/…` (checked 2026-10-04)
- **Coordinate space:** Visible Human Female metres (shared across skin + mammary)

**Attribution text:**  
“3D Reference Organs from the NIH/HuBMAP Human Reference Atlas, licensed under CC BY 4.0”

Meshes were cropped (skin → upper torso), pruned (mammary → fat + lobes for a soft-tissue look), quadric-decimated, and Draco-compressed for the web. Educational overlays (tumor marker, axillary lymph path, deposit spheres) are original scene geometry.

## BodyParts3D anatomy mesh (chest cues)

Pectoralis / clavicle / sternum cues under the HRA skin are derived from **BodyParts3D**:

- **Author:** The Database Center for Life Science
- **License:** [CC BY 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- **Source:** https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html
- **License verification page:** https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html (last checked for this integration: 2026-10-04)

**Attribution text:**  
“BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International”

Files: `web/public/models/explainer/bp3d_chest.glb` (active) and legacy `upper_torso.glb`.

## Poly Haven (optional HDRI)

Phase 1 uses in-scene Lightformers (no download). An optional Poly Haven `studio_small_09` 1K HDRI may be dropped under `web/public/hdri/` — **CC0** ([Poly Haven license](https://polyhaven.com/license)).

Full redistribution notes: [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
