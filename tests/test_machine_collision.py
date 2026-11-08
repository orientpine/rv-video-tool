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
  let out;
  for (const dx of dxs) { truck.position.x = dx; truck.updateMatrixWorld(true); window.__rvClearance.begin(); r.render(scene, cam); out = window.__rvClearance.check(); }
  r.dispose(); r.domElement.remove();
  return {machine: out.targets.machine, humans: out.findings.filter(f => f.rule === 'human penetration').length, fails: out.findings.filter(f => f.rule === 'machine penetration').map(f => [f.name, +f.mm.toFixed(1)])};
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
  let out;
  for (const [dx, ex] of frames) { truck.position.x = dx; exc.position.x = ex; truck.updateMatrixWorld(true); exc.updateMatrixWorld(true); window.__rvClearance.begin(); r.render(scene, cam); out = window.__rvClearance.check(); }
  r.dispose(); r.domElement.remove();
  return out.findings.filter(f => f.rule === 'machine penetration').map(f => [f.name, f.mm === null ? null : +f.mm.toFixed(1)]);
}"""


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
        p = await b.new_page()
        await p.goto("about:blank")
        await p.add_script_tag(path=str(ROOT / "vendor/three-0.147.0.min.js"))
        await p.evaluate("window.KIT = window.KIT || {fx: {clearance: {attachments: [], seats: []}}}")
        await p.evaluate(check_clearance.MESH_CHECK)
        cases = {"swings into it 0.1 m": await p.evaluate(CASE, [[3.0, 0.9], None]),
                 "apart": await p.evaluate(CASE, [[3.0, 3.0], None]),
                 "touching": await p.evaluate(CASE, [[3.0, 1.0], None]),
                 "seated from the first frame": await p.evaluate(CASE, [[0.9, 0.9], None]),
                 "load in bed overlaps arm": await p.evaluate(CASE, [[3.0, 1.05], -0.05 - 1.05]),
                 "0.3 m held tool into a body": await p.evaluate(CASE, [[3.0, 0.5], None, 0.1]),
                 "arm into a loaded bed (boxes + heap)": await p.evaluate(CASE, [[-5.0, -2.2], None, 1, True])}
        grid_on = await p.evaluate(CASE, [[3.0, 0.93], None, 1, False, 12, False])
        grid_off = await p.evaluate(CASE, [[3.0, 0.93], None, 1, False, 12, True])
        anon = await p.evaluate(CASE, [[3.0, 0.9], None, 1, False, 1, False, True])
        beds = {"arm in the air over a five-box bed": (await p.evaluate(BED, ["boxes", [.3, .3, .3, 0, .5, 0], False]), False),
                "arm resting on a five-box bed floor": (await p.evaluate(BED, ["boxes", [.3, .3, .3, 0, .25, 0], False]), False),
                "arm through a 0.08 m side wall": (await p.evaluate(BED, ["boxes", [.3, .3, .3, 1.11, .6, 0], False]), True),
                "arm in the air inside an open-shell bed": (await p.evaluate(BED, ["open", [.3, .3, .3, 0, .5, 0], False]), False),
                "open-bottom arm over a bed part without touching it": (await p.evaluate(BED, ["boxes", [.9, .9, .9, 0, .6, 1.5], "bottom"]), False),
                "open-shell arm through a side wall": (await p.evaluate(BED, ["boxes", [.3, .3, .9, 1.11, .6, 0], "top"]), True),
                "open-shell arm through an open-shell bed wall (faces cross)": (await p.evaluate(BED, ["open", [.3, .3, .3, 1.15, .6, 0], "top"]), True),
                "cracked arm in a cracked body from the first frame, unchanged": (await p.evaluate(BED, ["crack", [.3, .3, .3, 1.15, .6, 0], "crack", [[0, 0], [0, 0]]]), False),
                "cracked arm in a cracked body from the first frame, then 0.1 m deeper": (await p.evaluate(BED, ["crack", [.3, .3, .3, 1.15, .6, 0], "crack", [[0, 0], [0, -.1]]]), True)}
        closed_box = await p.evaluate(BED, ["closed", [.3, .3, .3, 0, .5, 0], False])
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
    print("MACHINE_COLLISION", "PASS" if ok else "FAIL")
    return 0 if ok else 1


sys.exit(asyncio.run(main()))
