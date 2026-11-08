"""Build kit/human_body.js from the Quaternius Universal Animation Library mannequin (CC0 1.0).

  uv run -q --no-project --with numpy python scripts/human_body.py <AnimationLibrary_Godot_Standard.gltf> [kit/human_body.js]

Source: https://quaternius.com/packs/universalanimationlibrary.html (free version, CC0 1.0), as mirrored in
https://github.com/J-Ponzo/gltf-universal-animation-library (commit e24c23c, glTF/AnimationLibrary_Godot_Standard.gltf).
Only the mesh and its skin weights are used; no animation clip is kept.

What it writes: the mannequin re-posed from its T-pose to rv's rest pose (arms hanging, bare-head height 1.75 m,
soles at y=0, facing +Z), split by dominant joint into KIT.fx.human's 15 body parts, with every vertex weighted to
KIT's own joint pivots (pelvis, spine, neck, head, shoulder/elbow/wrist, hip/knee/ankle). The kit deforms these
vertices on the CPU from the pivots each pose, so checks read the real posed surface.
"""
import base64
import json
import sys
from pathlib import Path

import numpy as np

HEIGHT = 1.75
ARM_OUT_DEG = 6.0
PIVOTS = ["pelvis", "spine", "neck", "head", "shoulder_l", "shoulder_r", "elbow_l", "elbow_r", "wrist_l", "wrist_r",
          "hip_l", "hip_r", "knee_l", "knee_r", "ankle_l", "ankle_r"]
PART_OF = {"pelvis": "pelvis", "spine": "torso", "neck": "head", "head": "head", "shoulder": "upperarm",
           "elbow": "forearm", "wrist": "hand", "hip": "thigh", "knee": "shin", "ankle": "foot"}
COMPONENT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def accessor(gltf, blob, index):
    a = gltf["accessors"][index]
    view = gltf["bufferViews"][a["bufferView"]]
    dtype, width = COMPONENT[a["componentType"]], WIDTH[a["type"]]
    start = view.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = view.get("byteStride", 0)
    item = np.dtype(dtype).itemsize * width
    if stride and stride != item:
        raw = np.frombuffer(blob, np.uint8, count=stride * a["count"], offset=start).reshape(a["count"], stride)[:, :item]
        out = np.frombuffer(raw.tobytes(), dtype).reshape(a["count"], width)
    else:
        out = np.frombuffer(blob, dtype, count=width * a["count"], offset=start).reshape(a["count"], width)
    if a.get("normalized") and dtype != np.float32:
        out = out.astype(np.float64) / np.iinfo(dtype).max
    return out


def trs(node):
    m = np.eye(4)
    if "matrix" in node:
        return np.array(node["matrix"], float).reshape(4, 4).T
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m[:3, :3] = r * np.array(node.get("scale", [1, 1, 1]))
    m[:3, 3] = node.get("translation", [0, 0, 0])
    return m


def rotation_between(a, b):
    a, b = a / np.linalg.norm(a), b / np.linalg.norm(b)
    v, c = np.cross(a, b), float(np.dot(a, b))
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k / (1 + c)


def pivot_of(bone, x):
    side = "r" if x > 0 else "l"     # KIT faces +Z with its "_r" side at +X
    for key, pivot in [("hips", "pelvis"), ("spine", "spine"), ("shoulder.", "spine"), ("neck", "neck"),
                       ("head", "head"), ("upper_arm", "shoulder"), ("forearm", "elbow"), ("hand", "wrist"),
                       ("f_", "wrist"), ("thumb", "wrist"), ("thigh", "hip"), ("shin", "knee"), ("foot", "ankle"),
                       ("toe", "ankle")]:
        if key in bone:
            return pivot if pivot in ("pelvis", "spine", "neck", "head") else pivot + "_" + side
    return "pelvis"


def b64(array):
    return base64.b64encode(np.ascontiguousarray(array).tobytes()).decode("ascii")


def main(source, out):
    gltf = json.loads(Path(source).read_text())
    blob = (Path(source).parent / gltf["buffers"][0]["uri"]).read_bytes()
    nodes, skin = gltf["nodes"], gltf["skins"][0]
    parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}
    world = {}

    def world_of(i):
        if i not in world:
            world[i] = (world_of(parent[i]) if i in parent else np.eye(4)) @ trs(nodes[i])
        return world[i]

    joints = skin["joints"]
    names = [nodes[j]["name"] for j in joints]
    W = np.array([world_of(j) for j in joints])
    ibm = accessor(gltf, blob, skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
    head = lambda name: W[names.index(name)][:3, 3]
    # T-pose -> arms hanging slightly out: rotate each upper-arm subtree about its shoulder.
    children = {j: [] for j in range(len(joints))}
    for k, j in enumerate(joints):
        if j in parent and parent[j] in joints:
            children[joints.index(parent[j])].append(k)
    def subtree(k):
        return [k] + [d for c in children[k] for d in subtree(c)]
    for side in ("L", "R"):
        k = names.index(f"DEF-upper_arm.{side}")
        p, e = head(f"DEF-upper_arm.{side}"), head(f"DEF-forearm.{side}")
        sx = np.sign(e[0] - p[0])
        target = np.array([sx * np.sin(np.radians(ARM_OUT_DEG)), -np.cos(np.radians(ARM_OUT_DEG)), 0.0])
        d = np.eye(4); d[:3, :3] = rotation_between(e - p, target); d[:3, 3] = p - d[:3, :3] @ p
        for s in subtree(k):
            W[s] = d @ W[s]
    skinning = W @ ibm

    prims = []
    for prim_index, prim in enumerate(gltf["meshes"][0]["primitives"]):
        a = prim["attributes"]
        pos, nrm = accessor(gltf, blob, a["POSITION"]).astype(float), accessor(gltf, blob, a["NORMAL"]).astype(float)
        jnt, wgt = accessor(gltf, blob, a["JOINTS_0"]).astype(int), accessor(gltf, blob, a["WEIGHTS_0"]).astype(float)
        wgt = wgt / wgt.sum(1, keepdims=True)
        mats = np.einsum("vk,vkij->vij", wgt, skinning[jnt])
        p = np.einsum("vij,vj->vi", mats[:, :3, :3], pos) + mats[:, :3, 3]
        n = np.einsum("vij,vj->vi", mats[:, :3, :3], nrm)
        n /= np.linalg.norm(n, axis=1, keepdims=True)
        prims.append(dict(pos=p, nrm=n, jnt=jnt, wgt=wgt, idx=accessor(gltf, blob, prim["indices"]).astype(int).reshape(-1, 3),
                          kind="main" if prim_index == 0 else "joint"))
    allp = np.vstack([q["pos"] for q in prims])
    scale = HEIGHT / (allp[:, 1].max() - allp[:, 1].min())
    floor = allp[:, 1].min()
    centre = np.array([0.0, floor, 0.0])
    to_kit = lambda v: (v - centre) * scale
    joint_pos = {nm: to_kit(W[k][:3, 3]) for k, nm in enumerate(names)}
    pick = {"pelvis": "DEF-hips", "spine": "DEF-spine.001", "neck": "DEF-neck", "head": "DEF-head"}
    for side, s in (("l", "L"), ("r", "R")):
        pick.update({f"shoulder_{side}": f"DEF-upper_arm.{s}", f"elbow_{side}": f"DEF-forearm.{s}",
                     f"wrist_{side}": f"DEF-hand.{s}", f"hip_{side}": f"DEF-thigh.{s}", f"knee_{side}": f"DEF-shin.{s}",
                     f"ankle_{side}": f"DEF-foot.{s}"})
    pivots = {}
    for pv, bone in pick.items():
        pivots[pv] = joint_pos[bone].copy()
    if pivots["shoulder_r"][0] < 0:      # mirror labels so "_r" is the +X side
        for a in ("shoulder", "elbow", "wrist", "hip", "knee", "ankle"):
            pivots[a + "_l"], pivots[a + "_r"] = pivots[a + "_r"], pivots[a + "_l"]
    for a in ("shoulder", "elbow", "wrist", "hip", "knee", "ankle"):   # exact left/right symmetry
        l, r = pivots[a + "_l"], pivots[a + "_r"]
        x, y, z = (r[0] - l[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2
        pivots[a + "_l"], pivots[a + "_r"] = np.array([-x, y, z]), np.array([x, y, z])
    for a in ("pelvis", "spine", "neck", "head"):
        pivots[a][0] = 0.0
    bone_pivot = [PIVOTS.index(pivot_of(nm, joint_pos[nm][0])) for nm in names]

    parts, markers = [], {}
    for q in prims:
        p = to_kit(q["pos"])
        piv = np.array(bone_pivot)[q["jnt"]]
        w = np.zeros((len(p), len(PIVOTS)))
        np.add.at(w, (np.repeat(np.arange(len(p)), 4), piv.ravel()), q["wgt"].ravel())
        order = np.argsort(-w, axis=1)[:, :4]
        top = np.take_along_axis(w, order, 1)
        top /= top.sum(1, keepdims=True)
        q8 = np.round(top * 255).astype(int)
        q8[:, 0] += 255 - q8.sum(1)
        dominant = order[:, 0]
        bone_dom = q["jnt"][np.arange(len(p)), np.argmax(q["wgt"], 1)]
        tri_piv = dominant[q["idx"][:, 0]]
        for pv in range(len(PIVOTS)):
            name = PIVOTS[pv]
            base = name.split("_")[0]
            tris = q["idx"][tri_piv == pv]
            if not len(tris):
                continue
            used = np.unique(tris)
            remap = np.full(len(p), -1); remap[used] = np.arange(len(used))
            part = PART_OF[base] + (("_" + name[-1]) if "_" in name else "")
            parts.append({"part": part, "pivot": name, "kind": q["kind"], "count": int(len(used)),
                          "pos": b64(p[used].astype(np.float32)),
                          "nrm": b64(np.round(q["nrm"][used] * 127).astype(np.int8)),
                          "piv": b64(order[used].astype(np.uint8)), "wgt": b64(q8[used].astype(np.uint8)),
                          "idx": b64(remap[tris].astype(np.uint16))})
        if q["kind"] != "main":
            continue
        for side in ("l", "r"):
            sx = -1 if side == "l" else 1
            feet = p[(dominant == PIVOTS.index("ankle_" + side)) & (p[:, 1] < .015)]
            markers["sole_" + side] = [float(feet[:, 0].mean()), 0.0, float(feet[:, 2].mean())]
            palm = p[(dominant == PIVOTS.index("wrist_" + side)) & np.array([names[b].startswith("DEF-hand") for b in bone_dom])]
            inward = -sx * palm[:, 0]
            near = palm[inward >= np.quantile(inward, .85)]
            markers["palm_" + side] = near[np.argmin(np.linalg.norm(near - near.mean(0), axis=1))].tolist()
            hand = p[dominant == PIVOTS.index("wrist_" + side)]
            tip = hand[np.argmin(hand[:, 1])]
            markers["tip_" + side] = tip.tolist()
        pelvis = p[dominant == PIVOTS.index("pelvis")]
        low = pelvis[pelvis[:, 1] <= pelvis[:, 1].min() + .004]
        markers["seat"] = [0.0, float(low[:, 1].mean()), float(low[:, 2].mean())]
        headv = p[dominant == PIVOTS.index("head")]
        markers["head_min"], markers["head_max"] = headv.min(0).tolist(), headv.max(0).tolist()
        torso = p[dominant == PIVOTS.index("spine")]
        markers["torso_min"], markers["torso_max"] = torso.min(0).tolist(), torso.max(0).tolist()
    body = {"version": 1, "source": "Quaternius Universal Animation Library (CC0 1.0), mannequin mesh only",
            "pivots": PIVOTS, "rest": {k: [round(float(c), 6) for c in v] for k, v in pivots.items()},
            "markers": markers, "parts": parts}
    text = ("// Generated by scripts/human_body.py from the Quaternius Universal Animation Library mannequin (CC0 1.0,\n"
            "// https://quaternius.com/packs/universalanimationlibrary.html). Do not edit by hand.\n"
            "window.HUMAN_BODY = " + json.dumps(body, separators=(",", ":")) + ";\n")
    Path(out).write_text(text)
    verts = sum(p["count"] for p in parts)
    print(f"HUMAN_BODY parts={len(parts)} verts={verts} bytes={len(text)} scale={scale:.4f} -> {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).resolve().parents[1] / "kit/human_body.js"))
