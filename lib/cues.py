"""장면 리그가 실제로 움직인 순간에서 효과음 큐를 뽑아 build/cues_auto.json 에 적는다(mix.py 가 읽음).

    uv run -q --no-project --with playwright --with pillow python lib/cues.py <프로젝트>/build/video.html --out <프로젝트>/build/cues_auto.json

check_motion.py 처럼 그리지 않고 매 프레임 RIG.pose(rig, state) 에 들어온 자세만 읽는다(30 fps):
  footstep  다리가 땅에 닿는 순간 = 대각 보행에서 걸은 거리 s 가 보폭 반(STRIDE/2)을 넘을 때마다 (moving > 0.3)
  servo     몸 기준 팔 끝(arm.T)이 0.08 m/s 넘게 움직이는 구간 (0.2 s 이상, 서로 0.15 s 안이면 이음)
  click     헤드를 잡거나 놓는 순간(state.held 가 바뀜) = 센서 헤드 끼우기 딸깍
  rotor     회전 부품이 보이는 장면마다 그 장면의 회전 속도(rev/s)로 웅
  tone      숫자 카드(KIT.info.numCard, data-rv-cue="tone")가 나타나는 순간(불투명도 0.5 넘음)
장면 경계(다음 장면이 자세를 새로 정함)는 움직임으로 치지 않는다. 리그가 없는 프로젝트는 카드 큐만 나온다.
"""
import argparse
import asyncio
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture import CHROME, CHROME_ARGS  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402

HOOK = r"""
  window.LOOK_CFG = null;
  window.__cue = {sampling: false, st: null};
  const OriginalRenderer = THREE.WebGLRenderer;
  THREE.WebGLRenderer = function(...args) {
    const renderer = new OriginalRenderer(...args), raw = renderer.render;
    renderer.render = function(scene, camera) { if (window.__cue.sampling) return; return raw.call(this, scene, camera); };
    return renderer;
  };
  THREE.WebGLRenderer.prototype = OriginalRenderer.prototype;
  if (window.RIG) {
    const pose = RIG.pose;
    RIG.pose = function(rig, st) {
      let vis = true; for (let o = rig.rotor && rig.rotor.spin; o; o = o.parent) if (!o.visible) vis = false;
      window.__cue.st = {rotor: st.rotorAngle, rotorVisible: !!(rig.rotor && vis), held: Object.assign({}, st.held),
        robots: st.robots.map(r => ({x: r.x, z: r.z, yaw: r.yaw, s: r.s || 0, moving: r.moving || 0,
          T: r.arm && r.arm.T ? [r.arm.T.x, r.arm.T.y, r.arm.T.z] : null}))};
      return pose.apply(this, arguments);
    };
  }
"""

PROBE = r"""async ([frame, fps]) => {
  window.__cue.st = null;
  await window.renderAt(frame / fps);
  const ov = [...document.querySelectorAll('.overlay[data-scene]')].find(e => getComputedStyle(e).display !== 'none');
  const cards = ov ? [...ov.querySelectorAll('[data-rv-cue]')].map((e, i) => [i, e.dataset.rvCue, +getComputedStyle(e).opacity]) : [];
  return {frame, scene: ov ? ov.dataset.scene : null, st: window.__cue.st, cards};
}"""


MIN_STEP_S = .2   # 빠른 대각 보행은 발이 0.07 s 마다 닿아 소리가 윙윙거림: 실제 발 닿는 프레임만 쓰되 한 로봇당 0.2 s 에 하나


def derive(rows, fps, stride):
    cues, prev = [], None
    servo, last_step = {}, {}
    for row in rows:
        t, st = row["frame"] / fps, row["st"]
        same = prev is not None and prev["scene"] == row["scene"] and prev["frame"] == row["frame"] - 1
        if same and st and prev["st"]:
            a, b = prev["st"], st
            for i, (r0, r1) in enumerate(zip(a["robots"], b["robots"])):
                if (r1["moving"] > .3 and math.floor(2 * r1["s"] / stride) > math.floor(2 * r0["s"] / stride)
                        and t - last_step.get((row["scene"], i), -1) >= MIN_STEP_S):
                    last_step[(row["scene"], i)] = t
                    cues.append({"t": t, "sfx": "footstep", "gain_lu": -16 - 2 * (math.floor(2 * r1["s"] / stride) % 2),
                                 "why": f"{row['scene']} robot{i} foot down"})
                if r0["T"] and r1["T"]:
                    def local(r):
                        dx, dy, dz = r["T"][0] - r["x"], r["T"][1], r["T"][2] - r["z"]
                        c, s = math.cos(r["yaw"]), math.sin(r["yaw"])
                        return (c * dx - s * dz, dy, s * dx + c * dz)
                    v = math.dist(local(r0), local(r1)) * fps
                    seg = servo.setdefault((row["scene"], i), [])
                    if v > .08:
                        if seg and t - seg[-1][1] <= .15:
                            seg[-1][1] = t
                        else:
                            seg.append([t - 1 / fps, t])
            for n, who in b["held"].items():
                if a["held"].get(n) != who:
                    cues.append({"t": t, "sfx": "click", "why": f"{row['scene']} head {n} {'on' if who is not None else 'off'}"})
        for i, kind, op in row["cards"]:
            before = next((c[2] for c in prev["cards"] if c[0] == i), 0) if prev and prev["scene"] == row["scene"] else 0
            if op >= .5 > before:
                cues.append({"t": t, "sfx": kind, "why": f"{row['scene']} card {i}"})
        prev = row
    for (scene, i), segs in servo.items():
        for a, b in segs:
            if b - a >= .2:
                cues.append({"t": a, "sfx": "servo", "duration": round(min(3.0, b - a + .1), 3),
                             "why": f"{scene} robot{i} arm moves"})
    spans = []
    for row in rows:
        st = row["st"]
        if not st or not st["rotorVisible"]:
            continue
        if spans and spans[-1]["scene"] == row["scene"] and spans[-1]["b"] == row["frame"] - 1:
            spans[-1]["b"] = row["frame"]
            spans[-1]["ang"].append(st["rotor"])
        else:
            spans.append({"scene": row["scene"], "a": row["frame"], "b": row["frame"], "ang": [st["rotor"]]})
    for s in spans:
        if len(s["ang"]) < 2:
            continue
        hz = abs(s["ang"][-1] - s["ang"][0]) / (len(s["ang"]) - 1) * fps / (2 * math.pi)
        if hz > .05:
            cues.append({"t": s["a"] / fps, "sfx": "rotor", "duration": round((s["b"] - s["a"] + 1) / fps, 3),
                         "rotation_hz": round(hz, 3), "why": f"{s['scene']} rotor {hz:.2f} rev/s"})
    cues.sort(key=lambda c: c["t"])
    merged = []
    for c in cues:
        if merged and c["sfx"] == "click" == merged[-1]["sfx"] and c["t"] - merged[-1]["t"] < .08:
            continue
        c["t"] = round(c["t"], 4)
        merged.append(c)
    return merged


async def main(a):
    source = Path(a.html).resolve().read_text(encoding="utf-8")
    marker = "const TL = window.TIMELINE"
    if marker not in source:
        raise RuntimeError("page lacks the rv compositor marker")
    source = source.replace(marker, HOOK + "\n  " + marker, 1)
    source = source.replace("<head>", f'<head><base href="{Path(a.html).resolve().as_uri()}">', 1)
    errors, rows = [], []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
        p = await browser.new_page(viewport={"width": 1920, "height": 1080})
        p.on("pageerror", lambda e: errors.append(str(e)))
        await p.route("http://rv-cues.local/video.html", lambda route: route.fulfill(
            status=200, content_type="text/html", body=source))
        await p.goto("http://rv-cues.local/video.html", wait_until="load")
        await p.evaluate("Promise.resolve(window.renderReady)")
        total, stride = await p.evaluate("[window.DATA.timeline.total_s, (window.RIG && RIG.P && RIG.P.STRIDE) || 0.3]")
        await p.evaluate("window.__cue.sampling = true")
        count = math.ceil(total * a.fps - 1e-8)
        for first in range(0, count, 120):
            rows.extend(await p.evaluate("""async ([first, end, fps, code]) => {
              const sample = eval('(' + code + ')'), out = [];
              for (let i = first; i < end; i++) out.push(await sample([i, fps]));
              return out; }""", [first, min(first + 120, count), a.fps, PROBE]))
        await browser.close()
    if errors:
        for e in errors:
            print(f"PAGE_ERROR {e}")
        return 1
    cues = derive(rows, a.fps, stride)
    Path(a.out).write_text(json.dumps({"source": "lib/cues.py", "fps": a.fps, "stride_m": stride, "cues": cues},
                                      ensure_ascii=False, indent=1))
    kinds = {}
    for c in cues:
        kinds[c["sfx"]] = kinds.get(c["sfx"], 0) + 1
    print(f"CUES {len(cues)} {json.dumps(kinds)} → {a.out}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("html")
    ap.add_argument("--out", required=True)
    ap.add_argument("--fps", type=int, default=30)
    sys.exit(asyncio.run(main(ap.parse_args())))
