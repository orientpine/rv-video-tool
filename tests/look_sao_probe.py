"""바깥 장면(하늘 = scene.background 색 또는 먼 하늘 돔) 을 LOOK cinema 로 AO 켜고/끄고 그려 픽셀을 잰다.

    uv run -q --no-project --with playwright --with pillow python tests/look_sao_probe.py <look 켠 video.html> <lib 폴더>
출력 한 줄 JSON: {"bg": {"on": [r,g,b], "off": [...]}, "dome": {...}, "contact": {"on": l, "off": l},
                "see": {"glass": d, "clear": d, "dust": d, "beam": d, "ghost": d, "crease": {"on": l, "off": l}}}
  see: 벽 앞 유리판(불투명도 0.15)·거의 투명한 판(0.02)·입자(Points + 스프라이트)·additive 빛줄기·세기 0 렌즈 플레어 고스트(가산 스프라이트, depthTest false) 뒤에서
       AO 를 켜면 AO 끈 것보다 밝기가 8 넘게 어두워진 칸의 비율(d, 0..1). crease = 불투명 상자 앞 바닥(상자와 맞닿은 곳)의 밝기.
"""
import asyncio
import base64
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
  // see-through things in front of a flat wall: none of them may darken what is behind (old: black box / dark dots)
  const see = ao => {
    const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
    const R = new THREE.WebGLRenderer({canvas: c, preserveDrawingBuffer: true});
    R.setPixelRatio(1); R.setSize(1920, 1080, false);
    R.toneMapping = THREE.ACESFilmicToneMapping; R.outputEncoding = THREE.sRGBEncoding;
    LOOK.install(R, ao ? {preset: 'cinema'} : {preset: 'cinema', ao: null});
    const S = new THREE.Scene(); S.background = new THREE.Color(0xd9d5d0);
    S.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0); sun.position.set(2, 6, 8); S.add(sun);
    const std = (color, o) => new THREE.MeshStandardMaterial(Object.assign({color, roughness: 1}, o));
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), std(0xcbbfae)); wall.position.set(0, 3, -3); S.add(wall);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), std(0x9a948c)); floor.rotation.x = -Math.PI / 2; floor.position.z = 1; S.add(floor);
    // turned glass pane: before the fix the whole pane went black (measured 81 % of its box), a square-on pane got a dark rim
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.8), std(0xcfe8ff, {roughness: .1, transparent: true, opacity: .15, side: THREE.DoubleSide}));
    glass.position.set(-2.4, 1.8, -1.2); glass.rotation.y = 1.0; S.add(glass);
    const clear = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.8), std(0xffffff, {transparent: true, opacity: .02}));
    clear.position.set(-0.9, 2.4, -1.4); S.add(clear);
    const n = 600, pos = new Float32Array(n * 3);   // deterministic dust (no Math.random)
    for (let i = 0; i < n; i++) { const h = k => (Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
      pos[3 * i] = 0.4 + 1.6 * Math.abs(h(1)); pos[3 * i + 1] = 1.0 + 1.6 * Math.abs(h(2)); pos[3 * i + 2] = -2.2 + 1.2 * Math.abs(h(3)); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    S.add(new THREE.Points(pg, new THREE.PointsMaterial({color: 0xfff4e0, size: 0.02})));
    for (let i = 0; i < 6; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({color: 0xfff4e0, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false}));
      s.scale.set(.15, .15, 1); s.position.set(0.6 + i * 0.25, 1.3 + (i % 3) * 0.35, -1.6); S.add(s); }
    // lens-flare ghosts at strength 0: additive, depthTest false, opacity 0 (invisible with AO off; before the fix black squares on a diagonal)
    const ghosts = new THREE.Group();
    for (let i = 0; i < 4; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({color: 0xffc58a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false}));
      s.scale.set(.3, .3, 1); s.position.set(-1.6 + i * 0.45, 2.7 + i * 0.12, 0.6); ghosts.add(s); }
    S.add(ghosts);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.12, .3, 2.4, 24, 1, true), new THREE.MeshBasicMaterial({color: 0xfff0c0, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide}));
    beam.position.set(3.0, 1.7, -1.6); beam.rotation.z = .25; S.add(beam);
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(.6, .6, .6), std(0xc8b070)), b2 = b1.clone();
    b1.position.set(-0.45, .3, 0); b2.position.set(0.17, .3, 0); S.add(b1, b2);
    const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000); cam.position.set(0, 1.6, 4.5); cam.lookAt(0, 1.5, -3);
    cam.updateMatrixWorld(); cam.userData.focus = 4.5;
    R.render(S, cam);
    const t = document.createElement('canvas'); t.width = 1920; t.height = 1080; const x = t.getContext('2d'); x.drawImage(c, 0, 0);
    const d = x.getImageData(0, 0, 1920, 1080).data, L = new Float32Array(1920 * 1080);
    for (let i = 0; i < L.length; i++) L[i] = 0.2126 * d[4 * i] + 0.7152 * d[4 * i + 1] + 0.0722 * d[4 * i + 2];
    const rect = (o, pad) => { const b = new THREE.Box3().setFromObject(o), p = []; for (let i = 0; i < 8; i++) p.push(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(cam));
      const u = p.map(q => (q.x + 1) / 2 * 1920), v = p.map(q => (1 - q.y) / 2 * 1080);
      return [Math.max(0, Math.min(...u) + pad) | 0, Math.max(0, Math.min(...v) + pad) | 0, Math.min(1920, Math.max(...u) - pad) | 0, Math.min(1080, Math.max(...v) - pad) | 0]; };
    const dustBox = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.2)); dustBox.position.set(1.2, 1.8, -1.6); dustBox.updateMatrixWorld();
    const sb = new THREE.Vector3(-0.45, 0.01, 0.32).project(cam), cu = Math.round((sb.x + 1) / 2 * 1920), cv = Math.round((1 - sb.y) / 2 * 1080);
    const out = {L, rects: {glass: rect(glass, -14), clear: rect(clear, -14), dust: rect(dustBox, 0), beam: rect(beam, 0), ghost: rect(ghosts, -14)}, crease: L[cv * 1920 + cu]};
    if (window.__SAO_SHOT) out.png = c.toDataURL('image/png');
    R.dispose(); return out;
  };
  const r = {};
  {
    const on = see(true), off = see(false), s = {};
    for (const [k, [x0, y0, x1, y1]] of Object.entries(on.rects)) {
      let dark = 0, all = 0;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { all++; if (off.L[y * 1920 + x] - on.L[y * 1920 + x] > 8) dark++; }
      s[k] = all ? +(dark / all).toFixed(4) : null;
    }
    s.crease = {on: +on.crease.toFixed(2), off: +off.crease.toFixed(2)}; s.rects = on.rects;
    if (on.png) s.png = {on: on.png, off: off.png};
    r.see = s;
  }
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
        shots = Path(sys.argv[3]) if len(sys.argv) > 3 else None   # optional: save the see-through scene with AO on/off
        if shots:
            await p.evaluate("window.__SAO_SHOT = true")
        r = await p.evaluate(PROBE)
        for k, url in r["see"].pop("png", {}).items():
            shots.mkdir(parents=True, exist_ok=True)
            (shots / f"see_ao_{k}.png").write_bytes(base64.b64decode(url.split(",", 1)[1]))
        r["errors"] = errors
        print(json.dumps(r))
        await b.close()


asyncio.run(main())
