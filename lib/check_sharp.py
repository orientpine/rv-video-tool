"""주인공 선명도: 주인공(초점 대상)이 그림 단계(심도·모션 블러)와 인코딩(디스코드판)에서 뭉개지지 않았는지 프레임마다 잰다.

    uv run -q --no-project --with playwright --with pillow --with numpy python lib/check_sharp.py <video.html>
        [--every 3] [--t 12.0 40.5] [--mp4 out/x_discord.mp4 --ref out/x.mp4 [--offset 0]] [--mutate focus|bitrate] [--save <폴더>]

재는 값 = 결 충실도: 1.5 px 가우스로 낟알을 지운 뒤 라플라시안(가장자리·결)을 기준 그림과 상관(1 = 같은 결). 흐림도 얼룩도 낮춘다.
  같은 파이프라인끼리만 비교한다(실사 단계를 끈 그림과 비교하면 접촉 그림자·색 보정의 차이까지 '흐림'으로 셈 — 2026-11-05 반증).
  · 그림 단계(--mp4 없음): 보통 그림 대 같은 그림에서 심도·모션 블러만 끈 것(LOOK.probe.sharp). 주인공 영역(LOOK.subjectMask 를 3 px 깎은 몸체 속).
    FAIL: 주인공 충실도 < --render-min(기본 0.70) 그리고 결 에너지 < --energy-min(기본 0.60) 그리고 (배경보다 0.05 넘게 낮음 또는 충실도 < 0.5·에너지 < 0.5).
    한 순간이 걸리면 한 번 더 재어 두 번 다 걸려야 FAIL(이 PC GPU 가 가끔 덜 그린 프레임을 줌).
  · 인코딩(--mp4): 그 판의 프레임 대 원본(--ref, 기본 rv 가 만든 out/<name>.mp4 crf 18) 같은 프레임.
    FAIL: 주인공 충실도 < --enc-min(기본 0.82) 또는 (배경 충실도 − 주인공 충실도 > 0.10 그리고 주인공이 배경보다 결 에너지를 0.01 넘게 더 잃음)
    (주인공이 배경보다 먼저 뭉개짐). 도는 주인공은 결이 남아도 상관이 낮게 나오므로 에너지 손실이 있어야 차를 셈(2026-11-07).
    측정 예(84.5~87.5 s): 0.54 Mb/s 주인공 0.70~0.85·차 0.13~0.22, 1.3 Mb/s 0.84~0.90·차 ≤ 0.07, crf 18 0.89~0.93.
--mutate focus: 초점을 주인공 거리의 3배(뒤쪽)로(주인공 반지름 4 px 흐림) · --mutate bitrate: --ref 를 0.3 Mb/s 로 다시 인코딩해 잼. 걸려야 정상(MUTATION_CAUGHT).
  bitrate 손상은 장면 결에 맞춘다: 0.3 Mb/s → 0.3 Mb/s·해상도 1/2 → 1/4 차례로, 화면 전체 결 충실도 중앙이 --enc-min 아래가 되는 첫 단계.
  어둡고 큰 면뿐인 장면은 0.3 Mb/s 로도 화면이 거의 안 상한다(측정: 화면 0.88~0.93, 1/4 에서 0.67~0.73).
  먼저 대조: 원본을 crf 18 로 다시 인코딩한 판이 화면 충실도 ≥ --enc-min 이어야 잰다(결이 없거나 잡음뿐인 화면은 자기 자신과도 안 맞음).
  대조가 안 맞거나 1/4 로도 안 상하면 손상이 성립하지 않으니 이유를 붙여 MUTATION_SKIP.
  (결과 본 뒤 바꾼 정의, 2026-11-08: 옛 정의는 늘 0.3 Mb/s 한 단계 → 어두운 장면에서 MUTATION_NOT_CAUGHT.)
look 이 없는 프로젝트·주인공이 없는 순간은 건너뜀(전부 없으면 SHARP_CHECK 실제 SKIP).
"""
import argparse, asyncio, atexit, base64, io, json, shutil, subprocess, sys, tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture import CHROME, CHROME_ARGS, warm_canvas  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402
from check_motion import transition_spans  # noqa: E402

SHOT = """async ([t, probe, mutate]) => { window.LOOK.probe = probe; window.LOOK.mutate = mutate; window.LOOK.grab = true; window.LOOK.grabbed = null;
  await window.renderAt(t);
  const img = window.LOOK.grabbed; window.LOOK.grab = false;
  const mask = probe && probe.sharp ? null : window.LOOK.subjectMask();
  const last = window.LOOK.last; window.LOOK.probe = null; window.LOOK.mutate = null;
  return {img, mask, last}; }"""


def off_transitions(ts, tl, spans, lo, hi):
    bad = []
    for name in tl["order"]:
        a, d = tl["modules"][name]["start"], tl["modules"][name]["duration"]
        lead, tail = spans[name]
        if lead > 0:
            bad.append((a, a + lead, name))
        if tail > 0:
            bad.append((a + d - tail, a + d, name))
    inside = lambda t: next((w for w in bad if w[0] - 1e-6 <= t <= w[1] + 1e-6), None)
    out, moved = [], []
    for t in ts:
        w = inside(t)
        if w:
            cands = [c for c in (round(w[0] - 1 / 15, 3), round(w[1] + 1 / 15, 3)) if lo <= c <= hi and not inside(c)]
            if not cands:
                moved.append((t, None, w[2])); continue
            n = min(cands, key=lambda c: abs(c - t)); moved.append((t, n, w[2])); t = n
        if t not in out:
            out.append(t)
    return out, moved


def soft(im):
    return np.asarray(im.convert("L").filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float32)


def png(url):
    return Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1])))


def lap(g):   # 4-이웃 라플라시안
    return np.pad(-4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:], 1)


def fid(a, b, m):   # 두 그림 라플라시안의 상관(영역 m 안)
    x, y = a[m] - a[m].mean(), b[m] - b[m].mean()
    return float((x * y).sum() / np.sqrt((x * x).sum() * (y * y).sum() + 1e-9))


def grow(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


# Damage ladder for --mutate bitrate, gentlest first. Before it, a control: the reference re-encoded at crf 18 (rv's own master
# quality) must read as itself; a flat or noise-only picture does not (measured: flat 0.0, a heavily blurred dark clip 0.07),
# while sparse large dark shapes do (0.96) even though their mean edge energy is low (0.42 vs a heavy blur's 0.26).
LADDER = ((300, 1), (300, 2), (300, 4))


def damaged(a, ts):
    """Encode --ref until the whole picture is visibly damaged; return (path, None) or (None, reason)."""
    refs = [(t, frame(a.ref, t, a.ref_offset)) for t in ts]
    refs = [(t, lap(soft(r))) for t, r in refs if r is not None]
    if not refs:
        return None, "잴 원본 프레임이 없음"
    full = np.ones(refs[0][1].shape, bool)
    d = Path(tempfile.mkdtemp())
    atexit.register(shutil.rmtree, d, True)

    def encode(name, rate, vf):
        out = d / f"{name}.mp4"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(max(0.0, a.offset - a.ref_offset)), "-t", "30", "-i", a.ref,
                        *vf, "-c:v", "libx264", *rate, "-an", str(out)], check=True)
        fs = [fid(lap(soft(g)), r, full) for t, r in refs if (g := frame(str(out), t, a.offset)) is not None]
        return str(out), (float(np.median(fs)) if fs else None)

    _, ctrl = encode("control", ["-crf", "18"], [])
    if ctrl is None:
        return None, "다시 인코딩한 판에서 잴 프레임을 못 읽음"
    print(f"SHARP_MUTATION bitrate 대조 crf 18 화면 결 충실도 중앙 {ctrl:.3f} (잴 수 있음 ≥ {a.enc_min})")
    if ctrl < a.enc_min:
        return None, f"원본을 crf 18 로 다시 인코딩해도 화면 결 충실도 중앙 {ctrl:.3f} < {a.enc_min}: 화면에 잴 결이 없거나 잡음뿐이라 손상을 알아볼 수 없음"
    for kbps, scale in LADDER:
        vf = [] if scale == 1 else ["-vf", f"scale=iw/{scale}:ih/{scale},scale=1920:1080:flags=bicubic"]
        out, med = encode(f"low_{kbps}k_{scale}", ["-b:v", f"{kbps}k"], vf)
        if med is None:
            return None, f"{kbps}k 1/{scale} 판에서 잴 프레임을 못 읽음"
        print(f"SHARP_MUTATION bitrate {kbps}k 1/{scale} 화면 결 충실도 중앙 {med:.3f} (손상 기준 < {a.enc_min})")
        if med < a.enc_min:
            return out, None
    return None, f"1/{LADDER[-1][1]} 해상도·{LADDER[-1][0]}k 로도 화면 결 충실도 중앙 {med:.3f} ≥ {a.enc_min}: 이 장면엔 알아볼 손상을 못 넣음"


def frame(path, t, offset):
    n = round((t - offset) * 30)
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", path, "-vf", f"select=eq(n\\,{n})", "-frames:v", "1",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return Image.frombytes("RGB", (1920, 1080), raw) if len(raw) == 1920 * 1080 * 3 else None


async def measure(a, ts, mutate):
    rows = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
        p = await b.new_page(viewport={"width": 1920, "height": 1080})
        errs = []
        p.on("pageerror", lambda e: errs.append(str(e)))
        await p.goto(Path(a.html).resolve().as_uri(), wait_until="load")
        await p.evaluate("Promise.resolve(window.renderReady).then(() => 0)")
        if not await p.evaluate("!!(window.LOOK && window.LOOK.on)"):
            await b.close(); return None
        if not a.t:
            transitions, looks, blend_s = await p.evaluate(
                "[window.TRANSITIONS||{}, window.SCENE_LOOK||{}, Math.max(1.5, window.THEME_PLAN?.blend_s||2)]")
            ts, moved = off_transitions(ts, a.timeline, transition_spans(a.timeline, transitions, looks, blend_s), a.lo, a.hi)
            for t, n, scene in moved:
                print(f"SHARP_SHIFT t={t:.2f} -> {'skip' if n is None else f'{n:.2f}'} (transition at {scene})")
            if not ts:
                await b.close(); return []
        await warm_canvas(p, await p.context.new_cdp_session(p), ts[0])
        mut = {"focusScale": 3.0} if mutate == "focus" else None   # focus behind the subject (as the old centre ray did: it hit the ground behind the machine)
        async def one(t):
            real = await p.evaluate(SHOT, [t, {"noGrain": True}, mut])
            if not real["mask"]:
                return None
            m = np.asarray(png(real["mask"]).convert("L")) > 128
            if m.mean() < 0.005:
                return None
            if a.mp4:
                gi, ri = frame(a.mp4, t, a.offset), frame(a.ref, t, a.ref_offset)
                if gi is None or ri is None:
                    return None
            else:
                gi, ri = png(real["img"]), png((await p.evaluate(SHOT, [t, {"sharp": True, "noGrain": True}, None]))["img"])
            g, r = lap(soft(gi)), lap(soft(ri))
            subj, bg = ~grow(~m, 3), ~grow(m, 8)
            if subj.sum() < 200:
                return None
            last = real["last"] or {}   # LOOK.last is set by the depth-of-field pass; a look with "dof": false has none
            return m, gi, ri, {"t": t, "subject": last.get("subject", ""), "from": last.get("from"), "focus": last.get("focus"),
                         "area": round(float(m.mean()), 4), "fid_subject": round(fid(g, r, subj), 3), "fid_bg": round(fid(g, r, bg), 3),
                         "energy_subject": round(float((g[subj] ** 2).sum() / max((r[subj] ** 2).sum(), 1e-9)), 3),
                         "energy_bg": round(float((g[bg] ** 2).sum() / max((r[bg] ** 2).sum(), 1e-9)), 3)}
        for t in ts:
            got = await one(t)
            # This PC's GPU (GB10 ANGLE) now and then hands over a half-drawn frame (render.sh recaptures them too):
            # a moment that fails is measured once more and only a second failure counts (a sample at t=63 read 0.0/0.0 once).
            if got and judge([got[3]], a):
                again = await one(t)
                if again:
                    again[3]["retried"] = True; got = again
            if not got:
                continue
            m, gi, ri, row = got
            rows.append(row)
            if a.save:
                d = Path(a.save); d.mkdir(parents=True, exist_ok=True)
                gi.convert("RGB").save(d / f"t{t:07.2f}_real.png"); ri.convert("RGB").save(d / f"t{t:07.2f}_ref.png")
                Image.fromarray((m * 255).astype(np.uint8)).save(d / f"t{t:07.2f}_mask.png")
        await b.close()
    for e in errs:
        print("ERR", e)
    return rows


def judge(rows, a):
    if a.mp4:
        # The gap only counts when the subject also lost more edge energy than the background: a spinning subject changes every
        # frame (measured at 129/159 s: 30x the background's change) and loses fine-scale correlation at any bitrate
        # (12000k still 0.114 behind) while its edges and energy survive (energy 0.998/1.001, crops identical). Changed after
        # seeing results: old rule was the gap alone. 0.01 = noise floor (|diff| <= 0.006 at 12000k).
        return [r for r in rows if r["fid_subject"] < a.enc_min or (r["fid_bg"] - r["fid_subject"] > 0.10
                and r.get("energy_bg", 1.0) - r["energy_subject"] > 0.01)]
    # render stage: blur removes edge energy; a sub-pixel shift (camera shake inside the shutter on smooth relief surfaces) only
    # lowers the correlation. FAIL needs both (measured: fid 0.14 at t=117 with energy kept, stills identical)
    # and the subject must lose more than the background: a camera move softens everything alike (measured at t=27: 0.666 vs 0.707).
    # Changed after seeing results: old rule was fid_subject < 0.8 alone -> 17/26 sampled moments FAILed;
    # then 0.8/0.75 flapped at the margin (t=171: 0.77/0.976 one run, 0.772/0.71 the next) -> 0.70/0.60. Focus mutation reads ~0.2/0.25.
    # while old/new stills were indistinguishable.
    # A subject that lost over half its edge energy is a defect whatever the background does (fixture: foreground ground and
    # pole blur too when focus is pushed behind the machine, fid 0.305 vs bg 0.225, energy 0.252).
    return [r for r in rows if r["fid_subject"] < a.render_min and r["energy_subject"] < a.energy_min
            and (r["fid_subject"] < r["fid_bg"] - 0.05 or (r["fid_subject"] < 0.5 and r["energy_subject"] < 0.5))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("html"); ap.add_argument("--every", type=float, default=3.0); ap.add_argument("--t", type=float, nargs="*")
    ap.add_argument("--energy-min", dest="energy_min", type=float, default=0.60)
    ap.add_argument("--mp4"); ap.add_argument("--ref"); ap.add_argument("--offset", type=float, default=0.0)
    ap.add_argument("--ref-offset", type=float, default=0.0)
    ap.add_argument("--render-min", type=float, default=0.70); ap.add_argument("--enc-min", type=float, default=0.82)
    ap.add_argument("--mutate", choices=["focus", "bitrate"]); ap.add_argument("--save")
    a = ap.parse_args()
    line = next(l for l in Path(a.html).read_text(encoding="utf-8").split("\n") if l.startswith("window.DATA="))
    data = json.loads(line[len("window.DATA="):-1])
    total = data["timeline"]["total_s"]
    ts = a.t or [round(x * a.every + a.every / 2, 2) for x in range(int(total // a.every))]
    if a.mutate == "bitrate":   # 원본을 장면 결에 맞춰 눌러(0.3 Mb/s → 해상도 1/2 → 1/4) 인코딩 단계가 잡는지(앞 30 s 만)
        a.ref = a.ref or a.mp4
        if not a.ref:
            ap.error("--mutate bitrate needs --ref (rv: out/<name>.mp4)")
        ts = [t for t in ts if a.offset <= t < a.offset + 29]
        a.mp4, why = damaged(a, ts)
        if a.mp4 is None:
            print(f"SHARP_MUTATION_SKIP bitrate: {why}"); print("MUTATION_SKIP"); return 0
    dur = total
    if a.mp4:
        if not a.ref:
            ap.error("--mp4 needs --ref (rv: out/<name>.mp4)")
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.mp4], capture_output=True, text=True).stdout)
        ts = [t for t in ts if a.offset <= t < a.offset + dur - 1 / 30]
    a.timeline, a.lo, a.hi = data["timeline"], (a.offset if a.mp4 else 0.0), (a.offset + dur - 1 / 30 if a.mp4 else total - 1 / 30)
    rows = asyncio.run(measure(a, ts, a.mutate))
    if rows is None:
        print("SHARP_CHECK 실제 SKIP look 없음(실사 단계 꺼짐 → 심도·모션 블러 없음)"); return 0
    if not rows:
        print("SHARP_CHECK 실제 SKIP 주인공 없음(잴 순간 0)"); return 0
    for r in rows:
        print(json.dumps(r, ensure_ascii=False))
    bad = judge(rows, a)
    fs = sorted(r["fid_subject"] for r in rows)
    stage = f"인코딩 {a.mp4} 대 {a.ref}" if a.mp4 else "그림 단계(심도·모션 블러)"
    rule = f"주인공 ≥ {a.enc_min} 그리고 (배경과 차 ≤ 0.10 또는 결 에너지를 배경보다 0.01 넘게 더 잃지 않음)" if a.mp4 else f"주인공 ≥ {a.render_min} 또는 결 에너지 ≥ {a.energy_min}(배경과 비교)"
    print(f"{stage} · 순간 {len(rows)} · 주인공 충실도 최저 {fs[0]:.3f} 중앙 {fs[len(fs) // 2]:.3f} · 기준 {rule}")
    if a.mutate:
        if bad:
            print(f"MUTATION_CAUGHT {a.mutate} {len(bad)}/{len(rows)} 순간 FAIL"); return 1
        print(f"MUTATION_NOT_CAUGHT {a.mutate} 인데 통과"); return 0
    for r in bad:
        print(f"FAIL t={r['t']} 주인공 {r['subject'] or '?'}({r['from']}) 충실도 {r['fid_subject']} · 배경 {r['fid_bg']}"
              f" · 결 에너지 {r['energy_subject']}/{r.get('energy_bg', '-')}")
    print("SHARP_CHECK FAIL" if bad else "SHARP_CHECK PASS")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
