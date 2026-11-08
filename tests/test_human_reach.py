"""KIT.fx.human act() hand goals: place a held bottle on a shelf above the shoulder, grip a cabinet handle, grip both
wheelchair push rims while seated. Each case is one act() call per frame, measured over every 30 fps frame with
check_clearance's own 'human penetration' rule (and the bottle against the shelf with the same depth rule):
- at touch the palm marker is within 10 mm of the goal point (place: the bottle rests on the shelf top within 3 mm);
- no frame has a human penetration finding against the shelf, cabinet or wheelchair;
- the bottle never sinks into the shelf while it is carried or left there;
- act(t) gives the same surface after other times were posed.
Prints HUMAN_REACH PASS or HUMAN_REACH FAIL [...] with the measured millimetres; exit 1 on FAIL.
"""
import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lib"))
from capture import CHROME, CHROME_ARGS  # noqa: E402
from check_clearance import MESH_CHECK  # noqa: E402

EXPOSE = MESH_CHECK.replace("window.__rvClearance = {", "window.__rvShapes = {shapes, pair};\n  window.__rvClearance = {", 1)

PROBE = r"""() => {
  const errors = [], V = (x, y, z) => new THREE.Vector3(x, y, z), w = o => o.getWorldPosition(V(0, 0, 0));
  const renderer = new THREE.WebGLRenderer(); renderer.setSize(160, 90);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, .05, 50); camera.position.set(2.5, 1.5, 3); camera.lookAt(0, 1, 0);
  const mat = new THREE.MeshStandardMaterial({color: 0x888888});
  const box = (parent, size, at, name) => { const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat); m.position.set(...at); m.name = name; parent.add(m); return m; };
  const run = (scene, man, spec, frames, extra = () => 0) => {
    let worst = 0, rows = [], more = 0;
    for (const f of frames) {
      __rvClearance.begin(); man.act(f / 30, spec(f / 30)); renderer.render(scene, camera);
      const e = __rvClearance.check();
      for (const m of e.measurements.filter(m => m.rule === 'human penetration')) { if (m.mm > worst) worst = m.mm; if (m.mm > 10) rows.push(`${(f / 30).toFixed(2)}s ${m.name} ${m.mm.toFixed(1)}`); }
      more = Math.max(more, extra());
    }
    return {worst: +worst.toFixed(1), rows: rows.slice(0, 6), extra: +more.toFixed(1)};
  };
  const frames = (a, b) => Array.from({length: Math.round((b - a) * 30) + 1}, (_, i) => Math.round(a * 30) + i);
  const out = {};
  // 1. bottle onto a shelf above the shoulder
  {
    const scene = new THREE.Scene(), shelf = box(scene, [1.0, .03, .3], [.1, 1.465, .6], "shelf");
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .24, 24).translate(0, .12, 0), mat); bottle.name = "bottle"; scene.add(bottle);
    const man = KIT.fx.human(scene, 1.75, {site: "office"}); man.visible = true;
    const spec = () => ({place: {hold: bottle, on: shelf, t0: .5, touch: 2.2, t1: 3.4}});
    const S = __rvShapes, depth = () => { bottle.updateWorldMatrix(true, true); shelf.updateWorldMatrix(true, true); let d = 0;
      for (const a of S.shapes(bottle)) for (const b of S.shapes(shelf)) d = Math.max(d, -S.pair(a, b, true)); return d * 1000; };
    const r = run(scene, man, spec, frames(0, 3.6), depth);
    man.act(2.2, spec()); man.updateWorldMatrix(true, true);
    const reach = man.userData.reach.r, top = new THREE.Box3().setFromObject(shelf).max.y, foot = new THREE.Box3().setFromObject(bottle).min.y;
    man.act(3.6, spec()); const left = w(bottle).clone();
    out.bottle = {...r, palm_mm: reach.palm_mm, bottle_gap_mm: +((foot - top) * 1000).toFixed(2), bottle_left: left.toArray().map(v => +v.toFixed(3))};
    if (reach.palm_mm > 10) errors.push(`bottle: palm ${reach.palm_mm} mm from its grip point at touch`);
    if (Math.abs(foot - top) > .003) errors.push(`bottle: rests ${((foot - top) * 1000).toFixed(1)} mm off the shelf top`);
    if (r.worst > 10) errors.push('bottle: ' + r.rows.join('; '));
    if (r.extra > 3) errors.push(`bottle: sinks ${r.extra} mm into the shelf`);
    if (left.y < top - .001) errors.push('bottle: not left on the shelf');
    const snap = () => { const p = []; man.traverse(o => { if (o.isMesh) { const a = o.geometry.attributes.position; for (let i = 0; i < a.count; i += 9) p.push(a.getX(i) + a.getY(i) * 3 + a.getZ(i) * 7); } }); return p.reduce((s, x) => s + x, 0); };
    man.act(1.6, spec()); man.updateWorldMatrix(true, true); const first = snap();
    man.act(3.0, spec()); man.act(.2, spec()); man.act(1.6, spec()); man.updateWorldMatrix(true, true);
    if (Math.abs(snap() - first) > 1e-6) errors.push('bottle: act(1.6) depends on earlier frames');
  }
  // 2. walk up to a cabinet and grip its door handle (a bar on the door), keeping the arm off the cabinet
  {
    const scene = new THREE.Scene(), cabinet = box(scene, [.8, 1.2, .4], [.15, .6, 1.15], "cabinet");
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .22, 16), mat); handle.position.set(.3, 1.0, .93); handle.name = "handle"; scene.add(handle);
    const man = KIT.fx.human(scene, 1.75, {site: "lab"}); man.visible = true;
    const spec = () => ({walk: {from: [0, 0, -.6], to: [0, 0, .6], t0: .2, t1: 2.2}, look: handle.position,
      grip: {target: handle, t0: 2.0, touch: 3.0, release: 4.0, t1: 4.8, avoid: [cabinet]}});
    const r = run(scene, man, spec, frames(0, 5));
    man.act(3.5, spec()); const reach = man.userData.reach.r, palm = w(man.userData.contacts.hands[1]);
    const gap = Math.min(...(() => { const a = handle.geometry.attributes.position, d = []; for (let i = 0; i < a.count; i++) d.push(V(0, 0, 0).fromBufferAttribute(a, i).applyMatrix4(handle.matrixWorld).distanceTo(palm)); return d; })());
    out.handle = {...r, palm_mm: reach.palm_mm, palm_to_handle_mm: +(gap * 1000).toFixed(1)};
    if (reach.palm_mm > 10) errors.push(`handle: palm ${reach.palm_mm} mm from its goal while gripping`);
    if (gap > .03) errors.push(`handle: palm ${(gap * 1000).toFixed(1)} mm from the handle`);
    if (r.worst > 10) errors.push('handle: ' + r.rows.join('; '));
  }
  // 3. seated in a wheelchair, both hands grip the push rims
  {
    const scene = new THREE.Scene(), chair = new THREE.Group(); scene.add(chair);
    const seat = box(chair, [.44, .045, .44], [0, .4775, .02], "cushion"), back = box(chair, [.44, .42, .04], [0, .73, -.24], "seat back");
    const foot = box(chair, [.4, .025, .26], [0, .1475, .52], "footrest");
    const rims = [-.31, .31].map(x => { const m = new THREE.Mesh(new THREE.TorusGeometry(.27, .011, 10, 64), mat); m.rotation.y = Math.PI / 2; m.position.set(x, .32, 0); m.name = "push rim"; chair.add(m); return m; });
    const man = KIT.fx.human(chair, 1.75, {site: "office"}); man.visible = true;
    const spec = () => ({sit: {seat, floor: foot, back, levers: rims, hand_mm: 30}, grip: [{hand: "l", target: rims[0], t0: .3, touch: 1.3}, {hand: "r", target: rims[1], t0: .3, touch: 1.3}]});
    const r = run(scene, man, () => { man.position.set(0, .07, .02); return spec(); }, frames(0, 2));
    man.position.set(0, .07, .02); man.act(1.8, spec());
    const e = (__rvClearance.begin(), renderer.render(scene, camera), __rvClearance.check());
    const hand = Math.max(0, ...e.measurements.filter(m => m.rule === 'hand lever').map(m => m.mm));
    out.pushrim = {...r, palm_l_mm: man.userData.reach.l.palm_mm, palm_r_mm: man.userData.reach.r.palm_mm, hand_lever_mm: +hand.toFixed(1),
      pose: man.userData.pose, findings: e.findings.map(f => f.rule + ' ' + f.name + ' ' + (f.mm ?? '').toString().slice(0, 6))};
    if (Math.max(man.userData.reach.l.palm_mm, man.userData.reach.r.palm_mm) > 10) errors.push('pushrim: palm off its grip point');
    if (hand > 30) errors.push(`pushrim: hand ${hand.toFixed(1)} mm from the rim`);
    if (r.worst > 10) errors.push('pushrim: ' + r.rows.join('; '));
    if (e.findings.length) errors.push('pushrim findings: ' + out.pushrim.findings.join('; '));
  }
  return {errors, ...out};
}"""


async def main():
    source = "<script>" + (ROOT / "vendor/three-0.147.0.min.js").read_text() + "</script><script>window.DATA={};"
    source += (ROOT / "kit/human_body.js").read_text() + (ROOT / "kit/scene_kit.js").read_text() + "</script>"
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=CHROME, args=CHROME_ARGS, headless=True)
        page = await browser.new_page()
        page_errors = []
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        await page.set_content(source)
        await page.evaluate(EXPOSE)
        result = await page.evaluate(PROBE)
        await browser.close()
    result["errors"] += page_errors
    print("HUMAN_REACH", "FAIL" if result["errors"] else "PASS", json.dumps(result, ensure_ascii=False))
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
