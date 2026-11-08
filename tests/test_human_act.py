"""KIT.fx.human body and act(): planted feet, fingertip contact, frame order, legacy joint writes.

Runs the real kit (vendor three.js + kit/human_body.js + kit/scene_kit.js) in Chromium:
- walk 2.6 m with act(): a sole marker that stays on the floor between two 30 fps frames moves <= 100 mm in total;
- press: the nearest hand-surface vertex is within 10 mm of the target while pressing;
- act() at t=5.3 gives the same surface after other times were posed (frames are rendered out of order);
- a legacy write to children[3] after pose() shows on the very next render and in the geometry checks read
  (scene.updateMatrixWorld without drawing), not one frame late.
Prints HUMAN_ACT PASS or HUMAN_ACT FAIL [...]; exit 1 on FAIL.
"""
import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lib"))
from capture import CHROME, CHROME_ARGS  # noqa: E402

PROBE = r"""() => {
  const errors = [], scene = new THREE.Scene(), V = (x, y, z) => new THREE.Vector3(x, y, z);
  const renderer = new THREE.WebGLRenderer(); renderer.setSize(320, 180);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, .05, 50); camera.position.set(0, 1.4, 4); camera.lookAt(0, 1, 0);
  const man = KIT.fx.human(scene, 1.75, {site: "lab"}); man.visible = true;
  const button = V(.57, 1.17, -.2);
  const spec = {walk: {from: [-2.6, 0, 0], to: [0, 0, 0], t0: .4, t1: 3.4}, look: button,
    press: {target: button, normal: [-1, 0, 0], t0: 3.9, touch: 5, press: 5.25, release: 5.6, t1: 6.6}};
  const world = o => o.getWorldPosition(V(0, 0, 0));
  const surface = re => { const out = []; man.traverse(o => { if (o.isMesh && re.test(o.userData.rvPart || "")) {
    const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) out.push(V(0, 0, 0).fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld)); } }); return out; };
  let slide = 0, last = null;
  for (let f = 0; f <= 4 * 30; f++) {
    man.act(f / 30, spec); man.updateWorldMatrix(true, true);
    const feet = man.userData.contacts.feet.map(world);
    if (last) feet.forEach((p, i) => { if (p.y < .02 && last[i].y < .02) slide += Math.hypot(p.x - last[i].x, p.z - last[i].z); });
    last = feet;
  }
  if (slide > .1) errors.push(`planted-foot slide ${(slide * 1000).toFixed(1)} mm > 100`);
  man.act(5.35, spec); man.updateWorldMatrix(true, true);
  const target = button.clone().add(V(.012, 0, 0)), tip = Math.min(...surface(/^hand_/).map(p => p.distanceTo(target)));
  if (tip > .01) errors.push(`fingertip ${(tip * 1000).toFixed(1)} mm from the pressed button`);
  const snapshot = () => surface(/./).reduce((s, p, i) => s + p.x * (i % 7 + 1) + p.y * (i % 5 + 1) + p.z, 0);
  man.act(5.3, spec); man.updateWorldMatrix(true, true); const first = snapshot();
  man.act(1.3, spec); man.act(6.8, spec); man.pose("sit");
  man.act(5.3, spec); man.updateWorldMatrix(true, true);
  if (Math.abs(snapshot() - first) > 1e-6) errors.push("act(5.3) depends on earlier frames");
  man.position.set(0, 0, 0); man.rotation.set(0, 0, 0); man.pose("stand");
  scene.updateMatrixWorld(true);
  man.children[3].rotation.z = -2.6;                      // legacy raise of the left arm after pose()
  scene.updateMatrixWorld(true);                          // what checks that sample without drawing do
  const wrist = world(man.getObjectByName("wrist_l")), hand = surface(/^hand_l$/);
  const gap = Math.min(...hand.map(p => p.distanceTo(wrist)));
  if (gap > .06) errors.push(`left hand surface ${(gap * 1000).toFixed(0)} mm away from its raised wrist`);
  renderer.render(scene, camera);
  return {errors, slide_mm: +(slide * 1000).toFixed(1), tip_mm: +(tip * 1000).toFixed(1), hand_gap_mm: +(gap * 1000).toFixed(1)};
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
        result = await page.evaluate(PROBE)
        await browser.close()
    result["errors"] += page_errors
    print("HUMAN_ACT", "FAIL" if result["errors"] else "PASS", json.dumps(result, ensure_ascii=False))
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
