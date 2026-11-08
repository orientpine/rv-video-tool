"""check_clearance mesh: two separate machine bodies (machine arm / container bed) that move into each other > 20 mm FAIL;
apart, touching, or seated from the first frame (a head in its holder) PASS; loose soil/load meshes inside a bed are not machine parts.
    uv run -q --no-project --with playwright --with pillow python tests/test_machine_collision.py [tool_dir]  -> MACHINE_COLLISION PASS"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "lib"))
from playwright.async_api import async_playwright  # noqa: E402
from capture import CHROME, CHROME_ARGS  # noqa: E402
import check_clearance  # noqa: E402

CASE = r"""async ([dxs, loadDx, s = 1, bed = false, seg = 1, nogrid = false, anon = false]) => {
  window.__rvClearanceNoGrid = nogrid;
  const r = new THREE.WebGLRenderer(); r.setSize(64, 64); document.body.append(r.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, .1, 100); cam.position.set(0, 3, 9); cam.lookAt(0, 0, 0);
  const body = (name, x, k = 1) => { const g = new THREE.Group(), host = anon ? new THREE.Group() : g; host.name = name; if (anon) g.add(host);
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(k, k, k, seg, seg, seg), new THREE.MeshStandardMaterial()); m.position.set(x, i * k, 0); host.add(m); }
    scene.add(g); return g; };
  body('machine-a', 0); const truck = body('machine-b', 0, s);
  if (bed) { const g = new THREE.Group(), M = () => new THREE.MeshStandardMaterial(); g.name = 'bed'; g.position.set(1.8, 0, 0);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1, .4, 1), M()); floor.position.y = .2; g.add(floor);
    for (const [x, z, w, d] of [[-.45, 0, .1, 1], [.45, 0, .1, 1], [0, -.45, 1, .1]]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(w, .5, d), M()); wall.position.set(x, .65, z); g.add(wall); }
    const heap = new THREE.Mesh(new THREE.SphereGeometry(.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M()); heap.name = 'loose-load'; heap.position.y = .4; g.add(heap);
    truck.add(g); }
  if (loadDx !== null) { const load = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()); load.name = 'loose-load'; load.position.set(loadDx, 0, 0); truck.add(load); }
  const outs = [];
  for (const dx of dxs) { truck.position.x = dx; truck.updateMatrixWorld(true); window.__rvClearance.begin(); r.render(scene, cam); outs.push(window.__rvClearance.check()); }
  r.dispose(); r.domElement.remove();
  return outs;
}"""

BED = r"""async ([bedKind, boom, boomOpen, frames = [[6, 0], [0, 0]]]) => {
  const r = new THREE.WebGLRenderer(); r.setSize(64, 64); document.body.append(r.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, .1, 100); cam.position.set(0, 4, 12); cam.lookAt(0, 0, 0);
  const M = () => new THREE.MeshStandardMaterial();
  const open = (g, face) => { const top = g.groups[face === 'top' ? 2 : 3], cut = face === 'crack' ? 3 : top.count, src = g.toNonIndexed().attributes.position.array, keep = [];
    for (let v = 0; v < src.length / 3; v++) if (v < top.start || v >= top.start + cut) keep.push(src[3*v], src[3*v+1], src[3*v+2]);
    const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3)); return o; };
  const box = (w, h, d, x, y, z, name, hollow) => { let g = hollow === 'crack' ? new THREE.BoxGeometry(w, h, d, 6, 6, 6) : new THREE.BoxGeometry(w, h, d); if (hollow) g = open(g, hollow);
    const m = new THREE.Mesh(g, M()); m.position.set(x, y, z); if (name) m.name = name; return m; };
  const exc = new THREE.Group(); exc.name = 'machine-a';
  for (let i = 0; i < 3; i++) exc.add(box(1, 1, 1, -4, i, 0));
  const [w, h, d, x, y, z] = boom; exc.add(box(w, h, d, x, y, z, 'arm-link', boomOpen)); scene.add(exc);
  const truck = new THREE.Group(); truck.name = 'machine-b'; truck.add(box(2.4, .6, 4.6, 0, -.4, 0)); truck.add(box(2.4, .3, 4.6, 0, -.85, 0));
  if (bedKind === 'boxes') { truck.add(box(2.3, .1, 4.3, 0, .05, 0)); truck.add(box(.08, .95, 4.3, -1.11, .575, 0)); truck.add(box(.08, .95, 4.3, 1.11, .575, 0));
    truck.add(box(2.3, .95, .08, 0, .575, -2.11)); truck.add(box(2.3, .95, .08, 0, .575, 2.11)); truck.add(box(.2, .2, .2, 0, .2, 1.5)); }
  else truck.add(box(2.3, 1.05, 4.3, 0, .525, 0, null, bedKind === 'open' ? 'top' : bedKind === 'crack' ? 'crack' : false));
  scene.add(truck);
  const outs = [];
  for (const [dx, ex] of frames) { truck.position.x = dx; exc.position.x = ex; truck.updateMatrixWorld(true); exc.updateMatrixWorld(true); window.__rvClearance.begin(); r.render(scene, cam); outs.push(window.__rvClearance.check()); }
  r.dispose(); r.domElement.remove();
  return outs;
}"""


def last_frame(outs):
    """Machine rows are decided by check_clearance.machine_findings over the frames in order, as rv check does."""
    rows = [[i, None, out] for i, out in enumerate(outs)]
    check_clearance.machine_findings(rows)
    return rows[-1][2]


def machine_fails(out):
    return [[f["name"], None if f["mm"] is None else round(f["mm"], 1)] for f in out["findings"] if f["rule"] == "machine penetration"]


async def run_case(p, args):
    out = last_frame(await p.evaluate(CASE, args))
    return {"machine": out["targets"]["machine"], "humans": sum(f["rule"] == "human penetration" for f in out["findings"]),
            "fails": machine_fails(out)}


async def run_bed(p, args):
    return machine_fails(last_frame(await p.evaluate(BED, args)))


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
        p = await b.new_page()
        await p.goto("about:blank")
        await p.add_script_tag(path=str(ROOT / "vendor/three-0.147.0.min.js"))
        await p.evaluate("window.KIT = window.KIT || {fx: {clearance: {attachments: [], seats: []}}}")
        await p.evaluate(check_clearance.MESH_CHECK)
        cases = {"swings into it 0.1 m": await run_case(p, [[3.0, 0.9], None]),
                 "apart": await run_case(p, [[3.0, 3.0], None]),
                 "touching": await run_case(p, [[3.0, 1.0], None]),
                 "seated from the first frame": await run_case(p, [[0.9, 0.9], None]),
                 "load in bed overlaps arm": await run_case(p, [[3.0, 1.05], -0.05 - 1.05]),
                 "0.3 m held tool into a body": await run_case(p, [[3.0, 0.5], None, 0.1]),
                 "arm into a loaded bed (boxes + heap)": await run_case(p, [[-5.0, -2.2], None, 1, True])}
        grid_on = await run_case(p, [[3.0, 0.93], None, 1, False, 12, False])
        grid_off = await run_case(p, [[3.0, 0.93], None, 1, False, 12, True])
        anon = await run_case(p, [[3.0, 0.9], None, 1, False, 1, False, True])
        beds = {"arm in the air over a five-box bed": (await run_bed(p, ["boxes", [.3, .3, .3, 0, .5, 0], False]), False),
                "arm resting on a five-box bed floor": (await run_bed(p, ["boxes", [.3, .3, .3, 0, .25, 0], False]), False),
                "arm through a 0.08 m side wall": (await run_bed(p, ["boxes", [.3, .3, .3, 1.11, .6, 0], False]), True),
                "arm in the air inside an open-shell bed": (await run_bed(p, ["open", [.3, .3, .3, 0, .5, 0], False]), False),
                "open-bottom arm over a bed part without touching it": (await run_bed(p, ["boxes", [.9, .9, .9, 0, .6, 1.5], "bottom"]), False),
                "open-shell arm through a side wall": (await run_bed(p, ["boxes", [.3, .3, .9, 1.11, .6, 0], "top"]), True),
                "open-shell arm through an open-shell bed wall (faces cross)": (await run_bed(p, ["open", [.3, .3, .3, 1.15, .6, 0], "top"]), True),
                "cracked arm in a cracked body from the first frame, unchanged": (await run_bed(p, ["crack", [.3, .3, .3, 1.15, .6, 0], "crack", [[0, 0], [0, 0]]]), False),
                "cracked arm in a cracked body from the first frame, then 0.1 m deeper": (await run_bed(p, ["crack", [.3, .3, .3, 1.15, .6, 0], "crack", [[0, 0], [0, -.1]]]), True)}
        closed_box = await run_bed(p, ["closed", [.3, .3, .3, 0, .5, 0], False])
        await b.close()
    same = grid_on == grid_off and bool(grid_on["fails"])
    print(f"{'PASS' if same else 'FAIL'} 864-triangle boxes: grid index and full loop give the same rows: {grid_on['fails']} vs {grid_off['fails']}")
    want = {"swings into it 0.1 m": True, "apart": False, "touching": False, "seated from the first frame": False, "load in bed overlaps arm": False, "0.3 m held tool into a body": False, "arm into a loaded bed (boxes + heap)": True}
    ok = True
    for name, r in cases.items():
        passed = bool(r["fails"]) == want[name] and r["humans"] == 0
        print(f"{'PASS' if passed else 'FAIL'} {name}: machine_pairs={r['machine']} human_rows={r['humans']} fails={r['fails']}")
        ok = ok and passed
    for name, (fails, want_fail) in beds.items():
        passed = bool(fails) == want_fail and ("faces cross" not in name or all("면 교차" in f[0] for f in fails))
        print(f"{'PASS' if passed else 'FAIL'} {name}: fails={fails}")
        ok = ok and passed
    depth_same = [f[1] for f in closed_box] == [500.0]
    print(f"{'PASS' if depth_same else 'FAIL'} arm inside a closed bed box keeps its measured depth: {closed_box}")
    ok = ok and depth_same
    named = bool(anon["fails"]) and all("[machine-a / machine-b]" in f[0] for f in anon["fails"])
    print(f"{'PASS' if named else 'FAIL'} unnamed top groups: the row names the nearest named ancestors: {anon['fails']}")
    ok = ok and same and named
    # Two pages, interleaved frames: the pair is first seen apart on page 1 (frame 0) and only page 2 sees it 0.1 m in
    # (frame 30). The base must come from page 1's sighting (0 mm), so the 100 mm penetration is still a finding.
    truck, robot, fixed = [0, 0, 0, 1, 1, 1], [5, 0, 0, 6, 1, 1], [0, 0, 2, 1, 1, 3]
    seen = lambda key, boxes, **m: {"count": 1, "findings": [], "measurements": [], "machines": [dict(key=key, boxes=boxes, **m)]}
    deep = dict(head="Scene <-> Scene", worst="", cross="", depth=.1, depth_text="100", uuid="u")
    page1 = [[0, None, seen("1|2", [fixed, truck], apart=True)]]
    page2 = [[30, None, seen("1|2", [fixed, truck], **deep)]]
    expected, wanted = check_clearance.identity_checks([(page1,), (page2,)])
    rows = sorted(page1 + page2, key=lambda r: r[0])
    check_clearance.machine_findings(rows)
    split = [round(f["mm"]) for f in rows[1][2]["findings"]] == [100] and wanted == {1: {0: {1, 2}}}
    print(f"{'PASS' if split else 'FAIL'} pages split the frames: first sighting on another page sets the base, and the other page is asked about frame 0: {rows[1][2]['findings']} {wanted}")

    class Page:   # stands in for a browser page: answers the world boxes of the asked ids at the asked frame
        def __init__(self, boxes): self.boxes = boxes
        async def evaluate(self, _script, args): return [self.boxes[id_] for id_ in args[1]]
    same = (await check_clearance.same_bodies([None, Page({1: fixed, 2: truck})], expected, wanted))
    # Two models both named "Scene" load in a different order on page 2: id 2 is the robot there. Names and child
    # places match, but at frame 0 the robot's box is not the truck's, so the split is refused.
    swapped = (await check_clearance.same_bodies([None, Page({1: fixed, 2: robot})], expected, wanted))
    differ = same and not swapped
    print(f"{'PASS' if differ else 'FAIL'} a key that names another body on another page (same names, swapped load order) is caught")
    ok = ok and split and differ
    print("MACHINE_COLLISION", "PASS" if ok else "FAIL")
    return 0 if ok else 1


sys.exit(asyncio.run(main()))
