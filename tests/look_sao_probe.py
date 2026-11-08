"""바깥 장면(하늘 = scene.background 색 또는 먼 하늘 돔) 을 LOOK cinema 로 AO 켜고/끄고 그려 픽셀을 잰다.

    uv run -q --no-project --with playwright --with pillow python tests/look_sao_probe.py <look 켠 video.html> <lib 폴더>
출력 한 줄 JSON: {"bg": {"on": [r,g,b], "off": [...]}, "dome": {...}, "contact": {"on": l, "off": l}}
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, sys.argv[2])
from capture import CHROME, CHROME_ARGS  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

PROBE = r"""async () => {
  const shot = (dome, ao) => {
    const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
    const R = new THREE.WebGLRenderer({canvas: c, preserveDrawingBuffer: true});
    R.setPixelRatio(1); R.setSize(1920, 1080, false);
    R.toneMapping = THREE.ACESFilmicToneMapping; R.outputEncoding = THREE.sRGBEncoding;
    LOOK.install(R, ao ? {preset: 'cinema'} : {preset: 'cinema', ao: null});
    const S = new THREE.Scene(); S.background = new THREE.Color(0xd9d5d0);
    S.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(5, 10, 4); S.add(sun);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({color: 0x9a948c, roughness: 1}));
    g.rotation.x = -Math.PI / 2; S.add(g);
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({color: 0xc8b070, roughness: .8}));
    b.position.set(0, .5, 0); S.add(b);
    if (dome) S.add(new THREE.Mesh(new THREE.SphereGeometry(260, 32, 16), new THREE.MeshBasicMaterial({color: 0xd9d5d0, side: THREE.BackSide})));
    const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000); cam.position.set(0, 1.6, 4.5); cam.lookAt(0, 1.2, -6);
    cam.updateMatrixWorld(); cam.userData.focus = 4.5;
    R.render(S, cam);
    const t = document.createElement('canvas'); t.width = 1920; t.height = 1080; const x = t.getContext('2d'); x.drawImage(c, 0, 0);
    const px = (u, v) => Array.from(x.getImageData(u, v, 1, 1).data.slice(0, 3));
    const p = new THREE.Vector3(0.53, 0.01, 0.3).project(cam);
    const cu = Math.round((p.x + 1) / 2 * 1920), cv = Math.round((1 - p.y) / 2 * 1080);
    const lum = q => +(0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2]).toFixed(2);
    const out = {sky: px(960, 60), contact: lum(px(cu, cv)), at: [cu, cv]};
    R.dispose(); return out;
  };
  const r = {};
  for (const dome of [false, true]) {
    const on = shot(dome, true), off = shot(dome, false);
    r[dome ? 'dome' : 'bg'] = {on: on.sky, off: off.sky};
    if (!dome) r.contact = {on: on.contact, off: off.contact, at: on.at};
  }
  return r;
}"""


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
        p = await b.new_page(viewport={"width": 1920, "height": 1080})
        errors = []
        p.on("pageerror", lambda e: errors.append(str(e)))
        await p.goto(Path(sys.argv[1]).resolve().as_uri(), wait_until="load")
        await p.evaluate("Promise.resolve(window.renderReady)")
        r = await p.evaluate(PROBE)
        r["errors"] = errors
        print(json.dumps(r))
        await b.close()


asyncio.run(main())
