#!/usr/bin/env python3
"""Rebuild web/public/models/explainer/upper_torso.glb from BodyParts3D OBJ archives.

Prerequisites (download once from the official archive — CC BY 4.0):
  https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
  - partof_BP3D_4.0_obj_99.zip
  - isa_BP3D_4.0_obj_99.zip (for some deltoid element files)
  - partof_element_parts.txt / isa_element_parts.txt

Place archives under /tmp/bp3d/ (or set BP3D_DIR), then run this script.
Requires: trimesh, numpy, fast_simplification, pygltflib
Optional: npx @gltf-transform/cli for Draco compression.

This script documents the exact processing applied for THIRD_PARTY_NOTICES.md.
"""
from __future__ import annotations

import json
import os
import subprocess
import zipfile
from pathlib import Path

import numpy as np
import trimesh
from pygltflib import (
    ARRAY_BUFFER,
    ELEMENT_ARRAY_BUFFER,
    FLOAT,
    UNSIGNED_INT,
    VEC3,
    SCALAR,
    Accessor,
    Asset,
    Attributes,
    Buffer,
    BufferView,
    GLTF2,
    Material,
    Mesh,
    Node,
    PbrMetallicRoughness,
    Primitive,
    Scene,
)

ROOT = Path(__file__).resolve().parents[1]
BP3D_DIR = Path(os.environ.get('BP3D_DIR', '/tmp/bp3d'))
OUT_GLB = ROOT / 'web/public/models/explainer/upper_torso.glb'
OUT_LANDMARKS = ROOT / 'web/src/explainer/landmarks.json'

Z_MIN, Z_MAX, X_LIM = 1080.0, 1420.0, 280.0

SPECS = [
    # name, FMA, element preferred, face target, kind, humerus crop?
    ('skin', 'FMA7163', 'FJ2810', 12000, 'skin', False),
    ('pec_major_r', 'FMA13373', 'FJ1464', 3000, 'muscle', False),
    ('pec_major_l', 'FMA13374', 'FJ1464M', 3000, 'muscle', False),
    ('pec_minor_r', 'FMA13375', 'FJ1456', 2000, 'muscle', False),
    ('pec_minor_l', 'FMA13376', 'FJ1456M', 2000, 'muscle', False),
    ('deltoid_r', 'FMA34680', 'FJ1468', 1400, 'muscle', False),
    ('deltoid_l', 'FMA34681', 'FJ1468M', 1400, 'muscle', False),
    ('deltoid_r2', 'FMA34682', 'FJ1467', 700, 'muscle', False),
    ('deltoid_l2', 'FMA34683', 'FJ1467M', 700, 'muscle', False),
    ('clav_r', 'FMA13322', 'FJ3362', 600, 'bone', False),
    ('clav_l', 'FMA13323', 'FJ3237', 600, 'bone', False),
    ('sternum', 'FMA7487', 'FJ3178', 1000, 'bone', False),
    ('hum_r', 'FMA23130', 'FJ3368', 1000, 'bone', True),
    ('hum_l', 'FMA23131', 'FJ3262', 1000, 'bone', True),
]


def ensure_raw() -> Path:
    raw = BP3D_DIR / 'raw'
    raw.mkdir(parents=True, exist_ok=True)
    needed = [s[2] + '.obj' for s in SPECS]
    missing = [n for n in needed if not (raw / f'*_{n.replace(".obj","")}.obj' )]
    # if any missing, extract from zips
    part = zipfile.ZipFile(BP3D_DIR / 'partof_BP3D_4.0_obj_99.zip')
    isa = zipfile.ZipFile(BP3D_DIR / 'isa_BP3D_4.0_obj_99.zip')
    part_map = {Path(n).stem: n for n in part.namelist() if n.endswith('.obj')}
    isa_map = {Path(n).stem: n for n in isa.namelist() if n.endswith('.obj')}
    for name, fma, eid, *_ in SPECS:
        out = raw / f'{fma}_{eid}.obj'
        if out.exists():
            continue
        if eid in part_map:
            out.write_bytes(part.read(part_map[eid]))
        elif eid in isa_map:
            out.write_bytes(isa.read(isa_map[eid]))
        else:
            raise FileNotFoundError(eid)
        print('extracted', out.name)
    return raw


def load_mesh(path: Path) -> trimesh.Trimesh:
    m = trimesh.load(str(path), force='mesh')
    if isinstance(m, trimesh.Scene):
        m = trimesh.util.concatenate(tuple(m.geometry.values()))
    m.remove_unreferenced_vertices()
    return m


def crop(m: trimesh.Trimesh, zmin=Z_MIN, zmax=Z_MAX, xlim=X_LIM) -> trimesh.Trimesh:
    cents = m.vertices[m.faces].mean(axis=1)
    mask = (cents[:, 2] >= zmin) & (cents[:, 2] <= zmax) & (np.abs(cents[:, 0]) <= xlim)
    return m if mask.sum() < 10 else m.submesh([mask], append=True)


def to_three(v: np.ndarray) -> np.ndarray:
    return np.column_stack([v[:, 0] / 1000.0, v[:, 2] / 1000.0, -v[:, 1] / 1000.0])


def simplify(m: trimesh.Trimesh, n: int) -> trimesh.Trimesh:
    return m if len(m.faces) <= n else m.simplify_quadric_decimation(face_count=n)


def main() -> None:
    raw = ensure_raw()
    meshes: list[tuple[str, str, trimesh.Trimesh]] = []
    for name, fma, eid, faces, kind, hum in SPECS:
        m = load_mesh(raw / f'{fma}_{eid}.obj')
        if hum:
            cents = m.vertices[m.faces].mean(axis=1)
            m = m.submesh([(cents[:, 2] >= 1180) & (cents[:, 2] <= Z_MAX)], append=True)
        else:
            m = crop(m)
        m = simplify(m, faces)
        m.vertices = to_three(m.vertices)
        m.fix_normals()
        meshes.append((name, kind, m))
        print(name, len(m.faces))

    all_v = np.vstack([m.vertices for _, _, m in meshes])
    center = np.array([0.0, float(all_v[:, 1].mean()), float(all_v[:, 2].mean())])
    for _, _, m in meshes:
        m.vertices -= center

    def lm(x: float, y: float, z: float) -> list[float]:
        p = to_three(np.array([[x, y, z]], float))[0] - center
        return [round(float(p[0]), 4), round(float(p[1]), 4), round(float(p[2]), 4)]

    landmarks = {
        'tumor': lm(-125, -205, 1195),
        'sentinel': lm(-155, -115, 1225),
        'level2': lm(-105, -100, 1265),
        'level3': lm(-55, -95, 1315),
        'vessel_mid1': lm(-140, -170, 1205),
        'vessel_mid2': lm(-150, -140, 1215),
        'im_1': lm(-18, -200, 1175),
        'im_2': lm(-18, -200, 1220),
        'im_3': lm(-18, -200, 1265),
    }
    OUT_LANDMARKS.parent.mkdir(parents=True, exist_ok=True)
    OUT_LANDMARKS.write_text(
        json.dumps(
            {
                'landmarks': landmarks,
                'center_m': center.tolist(),
                'units': 'meters_y_up',
                'notes': 'Derived from BodyParts3D v4.0; patient-right = -X',
            },
            indent=2,
        )
        + '\n'
    )

    mat_defs = {
        'skin': ([0.80, 0.68, 0.58, 0.42], True),
        'muscle': ([0.70, 0.36, 0.36, 1.0], False),
        'bone': ([0.90, 0.86, 0.78, 1.0], False),
    }
    blob = bytearray()

    def align4() -> None:
        while len(blob) % 4:
            blob.append(0)

    accessors: list = []
    bufferViews: list = []
    gl_meshes: list = []
    nodes: list = []
    materials = []
    mat_index = {k: i for i, k in enumerate(mat_defs)}
    for key, (color, transparent) in mat_defs.items():
        materials.append(
            Material(
                name=key,
                pbrMetallicRoughness=PbrMetallicRoughness(
                    baseColorFactor=list(color),
                    metallicFactor=0.0,
                    roughnessFactor=0.85,
                ),
                alphaMode='BLEND' if transparent else 'OPAQUE',
                doubleSided=True,
            )
        )

    for name, kind, m in meshes:
        v = m.vertices.astype(np.float32)
        nrm = m.vertex_normals.astype(np.float32)
        faces = m.faces.astype(np.uint32).reshape(-1)
        align4()
        v_off = len(blob)
        blob.extend(v.tobytes())
        align4()
        n_off = len(blob)
        blob.extend(nrm.tobytes())
        align4()
        i_off = len(blob)
        blob.extend(faces.tobytes())
        bv_v = len(bufferViews)
        bufferViews.append(BufferView(buffer=0, byteOffset=v_off, byteLength=v.nbytes, target=ARRAY_BUFFER))
        bv_n = len(bufferViews)
        bufferViews.append(BufferView(buffer=0, byteOffset=n_off, byteLength=nrm.nbytes, target=ARRAY_BUFFER))
        bv_i = len(bufferViews)
        bufferViews.append(BufferView(buffer=0, byteOffset=i_off, byteLength=faces.nbytes, target=ELEMENT_ARRAY_BUFFER))
        a_v = len(accessors)
        accessors.append(
            Accessor(
                bufferView=bv_v,
                componentType=FLOAT,
                count=len(v),
                type=VEC3,
                min=v.min(axis=0).tolist(),
                max=v.max(axis=0).tolist(),
            )
        )
        a_n = len(accessors)
        accessors.append(Accessor(bufferView=bv_n, componentType=FLOAT, count=len(nrm), type=VEC3))
        a_i = len(accessors)
        accessors.append(Accessor(bufferView=bv_i, componentType=UNSIGNED_INT, count=len(faces), type=SCALAR))
        mesh_idx = len(gl_meshes)
        gl_meshes.append(
            Mesh(
                name=name,
                primitives=[
                    Primitive(
                        attributes=Attributes(POSITION=a_v, NORMAL=a_n),
                        indices=a_i,
                        material=mat_index[kind],
                    )
                ],
            )
        )
        nodes.append(Node(name=name, mesh=mesh_idx))

    align4()
    named = BP3D_DIR / 'out' / 'torso_named.glb'
    named.parent.mkdir(parents=True, exist_ok=True)
    gltf = GLTF2(
        asset=Asset(generator='scripts/build_upper_torso.py', version='2.0'),
        scenes=[Scene(nodes=list(range(len(nodes))))],
        scene=0,
        nodes=nodes,
        meshes=gl_meshes,
        materials=materials,
        accessors=accessors,
        bufferViews=bufferViews,
        buffers=[Buffer(byteLength=len(blob))],
    )
    gltf.set_binary_blob(bytes(blob))
    gltf.save(str(named))

    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    # Prefer Draco via gltf-transform when available
    try:
        subprocess.check_call(
            ['npx', '--yes', '@gltf-transform/cli', 'draco', str(named), str(OUT_GLB)],
            cwd=str(ROOT),
        )
    except Exception as e:
        print('gltf-transform unavailable, copying uncompressed GLB', e)
        OUT_GLB.write_bytes(named.read_bytes())
    print('wrote', OUT_GLB, OUT_GLB.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
