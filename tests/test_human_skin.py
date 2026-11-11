"""KIT.fx.human skin at the wrist: a gripping hand rolled far from its forearm must not show see-through triangles.

Runs the real kit (vendor three.js + kit/human_body.js + kit/scene_kit.js) in Chromium on two synthetic scenes, every
30 fps frame of act():
- a cup on a counter gripped with the trunk bent forward (the wrist turns about 175 degrees from the forearm);
- a mug on a side table gripped from standing.
Each frame, every hand skin triangle that faces against its own vertex normals (folded inside out) is looked at from
12 cm outside, along those normals, with only the hand and forearm drawn on a magenta background. Magenta in the
centre 16 x 16 px means the triangle is a hole one sees through up close. A frame where that patch has 6 px or more
fails. Prints HUMAN_SKIN PASS or HUMAN_SKIN FAIL [...]; exit 1 on FAIL.
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
  const V = (x, y, z) => new THREE.Vector3(x, y, z), mat = new THREE.MeshStandardMaterial({color: 0x8899aa});
  const box = (scene, s, p) => { const m = new THREE.Mesh(new THREE.BoxGeometry(...s), mat); m.position.set(...p); scene.add(m); return m; };
  const cup = (scene, r0, r1, h, p) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 32).translate(0, h / 2, 0), mat); m.position.set(...p); scene.add(m); return m; };
  const cases = {
    cup_trunk: () => { const scene = new THREE.Scene(); box(scene, [.9, .04, .32], [.18, .90, .42]);
      const c = cup(scene, .055, .055, .13, [.2, .92, .36]);
      return {scene, spec: () => ({trunk: {bend: .5}, grip: {target: c, t0: .4, touch: 1.4}}), T: 2.4}; },
    mug_side: () => { const scene = new THREE.Scene(); box(scene, [.6, .04, .6], [.45, .88, .1]);
      const c = cup(scene, .06, .055, .12, [.42, .9, .02]);
      return {scene, spec: () => ({grip: {target: c, t0: .3, touch: 1.3}}), T: 2.2}; },
  };
  const renderer = new THREE.WebGLRenderer({preserveDrawingBuffer: true}); renderer.setSize(96, 96);
  const gl = renderer.getContext(), buf = new Uint8Array(96 * 96 * 4), out = {};
  for (const [name, make] of Object.entries(cases)) {
    const c = make(), man = KIT.fx.human(c.scene, 1.75, {site: "office"}); man.visible = true;
    c.scene.background = new THREE.Color(0xff00ff); c.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2));
    const bad = [];
    for (let f = 0; f <= Math.round(c.T * 30); f++) {
      man.act(f / 30, c.spec()); man.updateMatrixWorld(true);
      const hidden = [], folded = [];
      c.scene.traverse(o => { if (o.isMesh && o.visible && !(o.userData.rvSkin && /^(hand|forearm)/.test(o.userData.rvPart))) { o.visible = false; hidden.push(o); } });
      man.traverse(o => { if (!o.isMesh || !o.userData.rvSkin || !/^hand/.test(o.userData.rvPart)) return;
        const P = o.geometry.attributes.position.array, N = o.geometry.attributes.normal.array, idx = o.geometry.index.array;
        for (let t = 0; t < idx.length; t += 3) { const [i, j, k] = [idx[t], idx[t + 1], idx[t + 2]];
          const a = V(P[3 * i], P[3 * i + 1], P[3 * i + 2]), b = V(P[3 * j], P[3 * j + 1], P[3 * j + 2]), d = V(P[3 * k], P[3 * k + 1], P[3 * k + 2]);
          const face = b.clone().sub(a).cross(d.clone().sub(a));
          const n = V(N[3 * i] + N[3 * j] + N[3 * k], N[3 * i + 1] + N[3 * j + 1] + N[3 * k + 1], N[3 * i + 2] + N[3 * j + 2] + N[3 * k + 2]).normalize();
          if (face.length() > 1e-12 && face.dot(n) < 0) folded.push({at: a.add(b).add(d).divideScalar(3).applyMatrix4(o.matrixWorld), n: n.transformDirection(o.matrixWorld), part: o.userData.rvPart + ":" + o.userData.rvPivot});
        } });
      let worst = 0, part = "";
      for (const q of folded) {
        const cam = new THREE.PerspectiveCamera(20, 1, .005, 10); cam.position.copy(q.at).addScaledVector(q.n, .12); cam.lookAt(q.at);
        renderer.render(c.scene, cam); gl.readPixels(0, 0, 96, 96, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let px = 0; for (let y = 40; y < 56; y++) for (let x = 40; x < 56; x++) { const i = 4 * (y * 96 + x); if (buf[i] > 200 && buf[i + 1] < 60 && buf[i + 2] > 200) px++; }
        if (px > worst) { worst = px; part = q.part; }
      }
      hidden.forEach(o => { o.visible = true; });
      if (worst >= 6) bad.push(`f${f} ${part} ${worst}px`);
    }
    out[name] = bad;
  }
  return out;
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
    errors = [f"{name}: see-through hand skin at {', '.join(bad)}" for name, bad in result.items() if bad] + page_errors
    print("HUMAN_SKIN", "FAIL" if errors else "PASS", json.dumps({"errors": errors, **result}, ensure_ascii=False))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
