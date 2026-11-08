"""Seated KIT.fx.human: default seated height and KIT.fx.seat fitting, measured with check_clearance's own rules.

Runs the real kit (vendor three.js + kit/human_body.js + kit/scene_kit.js) and check_clearance's MESH_CHECK in Chromium:
- pose("sit") puts the soles 0.39 m (old figure) below the seat contact;
- a wheelchair (cushion, seat back, footrest above the default soles, push rims): the rider placed roughly by the scene
  and declared with KIT.fx.seat({seat, floor, back}) has no human penetration, seat contact <= 20 mm and no foot
  below the footrest; without the declaration the same rider sinks its feet into the footrest (so the fit is what
  makes it pass);
- an open shell around a seated person (a cab with a door opening) is not counted as a deep penetration.
Prints HUMAN_SEAT PASS or HUMAN_SEAT FAIL [...]; exit 1 on FAIL.
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

PROBE = r"""() => {
  const errors = [], V = (x, y, z) => new THREE.Vector3(x, y, z), w = o => o.getWorldPosition(V(0, 0, 0));
  const renderer = new THREE.WebGLRenderer(); renderer.setSize(160, 90);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, .05, 50); camera.position.set(2.5, 1.2, 2.5); camera.lookAt(0, .7, 0);
  const mat = new THREE.MeshStandardMaterial({color: 0x888888});
  const box = (parent, size, at, name) => { const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat); m.position.set(...at); m.name = name; parent.add(m); return m; };
  const measure = (scene, seated) => {
    __rvClearance.begin(); KIT.fx.clearance.seats.length = 0; seated(); renderer.render(scene, camera);
    const e = __rvClearance.check(), worst = r => Math.max(0, ...e.measurements.filter(m => m.rule === r).map(m => m.mm));
    return {human: +worst('human penetration').toFixed(1), seat: +worst('seat contact').toFixed(1), foot: +worst('foot below floor').toFixed(1),
      findings: e.findings.map(f => f.rule + ' ' + f.name + ' ' + (f.mm == null ? '' : f.mm.toFixed(1)))};
  };
  // default seated height
  const lone = KIT.fx.human(new THREE.Scene(), 1.75).pose("sit"); lone.updateWorldMatrix(true, true);
  const drop = w(lone.userData.contacts.seat).y - Math.min(...lone.userData.contacts.feet.map(f => w(f).y));
  if (Math.abs(drop - .39) > .003) errors.push(`seat contact to soles ${(drop * 1000).toFixed(0)} mm, not 390`);
  // wheelchair: +Z forward, cushion top 0.50 m, footrest top 0.16 m (default soles would be at 0.11 m)
  const scene = new THREE.Scene(), chair = new THREE.Group(); scene.add(chair); chair.name = "wheelchair";
  const seat = box(chair, [.44, .045, .44], [0, .4775, .02], "cushion"), back = box(chair, [.44, .42, .04], [0, .73, -.24], "seat back");
  const foot = box(chair, [.4, .025, .26], [0, .1475, .52], "footrest");
  for (const x of [-.31, .31]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(.27, .009, 8, 48), mat); rim.rotation.y = Math.PI / 2; rim.position.set(x, .32, 0); rim.name = "push rim"; chair.add(rim); }
  const rider = KIT.fx.human(chair, 1.75, {site: "office"}); rider.visible = true;
  const place = () => { rider.pose("sit"); rider.position.set(0, .07, .02); };   // the scene's rough placement
  const bare = measure(scene, place);
  const fitted = measure(scene, () => { place(); KIT.fx.seat(rider, {seat, floor: foot, back}); });
  if (bare.human <= 10) errors.push(`undeclared rider: only ${bare.human} mm into the chair, the test proves nothing`);
  if (fitted.human > 10) errors.push(`fitted rider human penetration ${fitted.human} mm`);
  if (fitted.seat > 20) errors.push(`fitted rider seat contact ${fitted.seat} mm`);
  if (fitted.foot > 0) errors.push(`fitted rider foot ${fitted.foot} mm below the footrest`);
  if (fitted.findings.length) errors.push('fitted rider findings: ' + fitted.findings.join('; '));
  // open cockpit tub (no roof, open on -X; the head is above the walls, so it is not an enclosing room) around a
  // seated person clear of every wall: a single +X-ish ray from inside crosses one wall, so parity alone would call
  // the body deep inside it
  const cabScene = new THREE.Scene(), shell = new THREE.Group(); cabScene.add(shell);
  const panel = (w, h, rx, ry, at) => new THREE.PlaneGeometry(w, h).rotateX(rx).rotateY(ry).translate(...at);   // single-sided, like a cab model's panels
  const g = new THREE.BufferGeometry(), parts = [panel(1.2, 1.4, -Math.PI / 2, 0, [0, .02, 0]), panel(1.4, .97, 0, -Math.PI / 2, [.6, .5, 0]),
    panel(1.2, .97, 0, 0, [0, .5, -.7]), panel(1.2, .97, 0, Math.PI, [0, .5, .7])];
  const pos = [], idx = []; let n = 0;
  for (const p of parts) { const a = p.attributes.position; for (let i = 0; i < a.count; i++) pos.push(a.getX(i), a.getY(i), a.getZ(i)); for (const i of p.index.array) idx.push(i + n); n += a.count; }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const cab = new THREE.Mesh(g, mat); cab.name = "cab shell"; shell.add(cab);
  box(shell, [.44, .43, .44], [-.05, .235, -.3], "cab seat");
  const op = KIT.fx.human(shell, 1.75, {site: "construction"}); op.visible = true;
  const opSeat = measure(cabScene, () => { op.pose("sit"); op.position.set(-.05, 0, -.3); op.updateWorldMatrix(true, true);
    op.position.y += .45 - w(op.userData.contacts.seat).y; });
  if (opSeat.human > 10) errors.push(`person inside an open cab shell counted ${opSeat.human} mm deep`);
  // the same open shell must still catch a hand pushed 6 cm through its side panel
  const through = measure(cabScene, () => { op.pose("sit"); op.position.set(-.05, 0, -.3); op.updateWorldMatrix(true, true);
    op.position.y += .45 - w(op.userData.contacts.seat).y; op.position.x += .6 - .06 - Math.max(...op.userData.contacts.hands.map(p => w(p).x)) + .06 + .03; });
  if (through.human <= 10) errors.push(`hand through the open panel not caught (${through.human} mm)`);
  return {errors, drop_mm: +(drop * 1000).toFixed(1), bare, fitted, open_shell: opSeat, through_panel: through};
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
        await page.evaluate(MESH_CHECK)
        result = await page.evaluate(PROBE)
        await browser.close()
    result["errors"] += page_errors
    print("HUMAN_SEAT", "FAIL" if result["errors"] else "PASS", json.dumps(result, ensure_ascii=False))
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
