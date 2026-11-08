"""KIT.shot.action / KIT.shot.track: start after the scene transition, hold outside the shot,
cap at 3 s, declare themselves, and frame the zoom so every keep point stays inside the label safe area.
    uv run -q --no-project --with playwright --with pillow python tests/test_shot_parts.py  -> SHOT_PARTS PASS"""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "lib"))
from playwright.async_api import async_playwright  # noqa: E402
from capture import CHROME, CHROME_ARGS  # noqa: E402

PROBE = r"""() => {
  window.DATA = {timeline: {order: ["a", "b"], crossfade_s: 0,
    modules: {a: {start: 0, duration: 5}, b: {start: 5, duration: 6}}}, lines: []};
  window.TRANSITIONS = {b: {dur: 1}};
  const scene = new THREE.Scene();
  const part = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4)); part.name = "valve"; scene.add(part);
  const from = {p: [0, 1, 6], l: [0, 0, 0], fov: 45};
  const far = [4.6, 0, 0];
  const project = (s, q) => { const c = new THREE.PerspectiveCamera(s.fov, 16 / 9, .01, 1e4);
    c.position.set(...s.p); c.lookAt(...s.l); c.updateMatrixWorld(true);
    const v = new THREE.Vector3(...q).project(c); return [(v.x + 1) / 2 * 1920, (1 - v.y) / 2 * 1080]; };
  const dist = s => Math.hypot(...s.p.map((x, j) => x - [0, 0, 0][j]));
  const tight = KIT.shot.action("b", {t: 0.1, dur: 5, from, at: part});
  const kept = KIT.shot.action("b", {t: 3.0, dur: 1, from, at: part, keep: [part, far]});
  const ov = document.createElement("div"); document.body.append(ov);
  const air = KIT.label(ov, "공기 나가는 곳"), panel = [1380, 150, 1870, 710];
  const boxAt = (s, q, dx, dy) => { const [x, y] = project(s, q), r = air.box.getBoundingClientRect(), w = r.width || 300, h = r.height || 59;
    return [x + dx - w / 2, y + dy - h, x + dx + w / 2, y + dy]; };
  const boxed = KIT.shot.action("b", {t: 4.5, dur: 1, from, at: part, keep: [part, {at: part, label: air, dx: 420, dy: -120}], avoid: [panel], zoom: 4});
  const tight4 = KIT.shot.action("b", {t: 4.5, dur: 1, from, at: part, zoom: 4});
  const free = (b) => b[0] >= 40 && b[2] <= 1880 && b[1] >= 130 && b[3] <= 870 && !(b[0] < panel[2] && b[2] > panel[0] && b[1] < panel[3] && b[3] > panel[1]);
  const track = KIT.shot.track("a", {t: 1, dur: 1.5, subject: part});
  return {tight: {t0: tight.t0, t1: tight.t1, d: dist(tight.end), before: tight.at(tight.t0 - 0.3), after: tight.at(tight.t1 + 0.5), end: tight.end},
          kept: {d: Math.hypot(...kept.end.p.map((x, j) => x - kept.end.l[j])), d0: Math.hypot(...from.p.map((x, j) => x - kept.end.l[j])),
                 look: kept.end.l, far: project(kept.end, far), farTight: project(tight.end, far), fits: kept.fits},
          centre: [project(kept.end, [0, 0, 0]), project(boxed.end, [0, 0, 0])].map(([x, y]) => Math.hypot(x - 960, y - 540)),
          label: {boxed: free(boxAt(boxed.end, [0, 0, 0], 420, -120)), tight: free(boxAt(tight4.end, [0, 0, 0], 420, -120)), fits: boxed.fits},
          d0: dist(from), from, track: {t0: track.t0, t1: track.t1, look: track.at().l},
          kinds: window.SHOTKINDS};
}"""


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
        p = await b.new_page()
        await p.goto("about:blank")
        await p.add_script_tag(path=str(ROOT / "vendor/three-0.147.0.min.js"))
        await p.add_script_tag(path=str(ROOT / "kit/scene_kit.js"))
        r = await p.evaluate(PROBE)
        await b.close()
    print(json.dumps({k: r[k] for k in ("tight", "kept", "label", "d0", "track")}))
    inside = lambda xy: 40 <= xy[0] <= 1880 and 130 <= xy[1] <= 870
    checks = {
        "starts after the 0.5 s dip half": abs(r["tight"]["t0"] - 0.5) < 1e-9,
        "capped at 3 s": abs(r["tight"]["t1"] - r["tight"]["t0"] - 3) < 1e-9,
        "holds the start before the shot": r["tight"]["before"] == r["from"],
        "holds the end after the shot": r["tight"]["after"] == r["tight"]["end"],
        "zooms to the 2.5x limit when only the part is kept": abs(r["tight"]["d"] - r["d0"] / 2.5) < 1e-6,
        "the tight zoom pushes the far point out of frame": not inside(r["kept"]["farTight"]),
        "keep holds the far point inside the safe area": inside(r["kept"]["far"]) and r["kept"]["fits"],
        "keep zooms less than the limit": r["kept"]["d"] > r["kept"]["d0"] / 2.5 + 1e-3,
        "keep looks toward the middle of the kept group, not at the part": 0.5 < r["kept"]["look"][0] < 4.1,
        "the subject ends within 0.45 of the half height from the centre": max(r["centre"]) <= 0.45 * 540 + 1e-6,
        "label box at the 4x zoom would hit the panel": not r["label"]["tight"],
        "label box kept inside the safe area and off the panel": r["label"]["boxed"] and r["label"]["fits"],
        "declares action shots with the subject name": [s for s in r["kinds"]["b"] if s["kind"] == "action"] ==
            [{"t": 0.5, "end": 3.5, "kind": "action", "subject": "valve"}, {"t": 3.0, "end": 4.0, "kind": "action", "subject": "valve"},
             {"t": 4.5, "end": 5.5, "kind": "action", "subject": "valve"}, {"t": 4.5, "end": 5.5, "kind": "action", "subject": "valve"}],
        "track declares follow and looks at the subject": r["kinds"]["a"] == [{"t": 1, "end": 2.5, "kind": "follow", "subject": "valve"}]
            and r["track"]["look"] == [0, 0, 0],
    }
    for name, ok in checks.items():
        print(("PASS " if ok else "FAIL ") + name)
    ok = all(checks.values())
    print("SHOT_PARTS", "PASS" if ok else "FAIL")
    return 0 if ok else 1


sys.exit(asyncio.run(main()))
