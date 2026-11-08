#!/usr/bin/env bash
set -euo pipefail
TOOL="$(cd "$(dirname "$0")/.." && pwd)"
W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
export TMPDIR="${TMPDIR:-$(mktemp -d)}"
export PYTHONDONTWRITEBYTECODE=1
python3 - "$TOOL" "$W" <<'PY'
import json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1] + "/lib")
from build import theme_plan, theme_runs, theme_violations

def fixture(durations, looks, groups=None):
    names = [f"s{i}" for i in range(len(durations))]
    tl = {"order": names, "modules": dict(zip(names, [{"duration": d} for d in durations]))}
    scenes = [{"name": n, "look": look} for n, look in zip(names, looks)]
    if groups:
        for s, group in zip(scenes, groups):
            s["theme_group"] = group
    return tl, {"scenes": scenes}

tl, script = fixture([20, 8, 20], ["cinema", "relief", "cinema"])
plan = theme_plan(tl, script)
assert set(plan["used"].values()) == {"cinema"}
assert plan["warnings"] and not plan["violations"]
tl, script = fixture([20] * 5, ["cinema", "relief", "cinema", "clean", "cinema"])
plan = theme_plan(tl, script)
assert len(plan["runs"]) - 1 <= 2
assert not theme_violations(plan["runs"])
assert all(v == "cinema" or v == plan["requested"][n] for n, v in plan["used"].items())
tl, script = fixture([20, 20, 20], ["cinema", "relief", "cinema"], ["a", "a", "b"])
assert set(theme_plan(tl, script)["used"].values()) == {"cinema"}
tl, script = fixture([20, 8, 20], ["cinema", "relief", "cinema"])
assert theme_violations(theme_runs(tl, {s["name"]: s["look"] for s in script["scenes"]}))

p = Path(sys.argv[2])
(p / "build").mkdir()
tl, script = fixture([20, .8, 19.2, 20], ["cinema", "relief", "relief", "cinema"],
                     ["intro", "principle", "principle", "end"])
tl.update(fps=30, total_s=60, captions=[], steps=[], fade_in_s=0, fade_out_s=0)
start = 0
for i, n in enumerate(tl["order"]):
    duration = tl["modules"][n]["duration"]
    tl["modules"][n]["start"] = start
    start += duration
    folder = p / "scenes" / n
    folder.mkdir(parents=True)
    (folder / "module.js").write_text("""
SCENES.%s={duration:%s,init(r,T,overlay){
this.r=r;this.s=new T.Scene();this.s.background=new T.Color(0x18303b);
this.c=new T.PerspectiveCamera(45,16/9,.1,100);this.c.position.set(0,1,5);this.c.lookAt(0,0,0);
this.s.add(new T.HemisphereLight(0xffffff,0x334455,1));
this.s.add(new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({color:0x657789})));
this.dim=document.createElement('div');this.dim.style.cssText='position:absolute;inset:0;background:#0a161e;opacity:0';
overlay.appendChild(this.dim);
},render(t){this.dim.style.opacity=%s ? Math.min(.8,Math.max(0,(t-this.duration+3)*.4)) : 0;
this.r.render(this.s,this.c)},show(){}};
""" % (n, duration, "true" if n == "s2" else "false"))
(p / "script.json").write_text(json.dumps(script))
(p / "build" / "timeline.json").write_text(json.dumps(tl))
print("PASS theme policy: short runs, rolling rate, cinema default, scene groups")
PY
python3 "$TOOL/lib/build.py" "$W" > "$W/build.log"
PW=(uv run -q --no-project --with playwright --with pillow python)
"${PW[@]}" "$TOOL/lib/check_cuts.py" "$W/build/video.html" --theme > "$W/positive.log"
grep '^THEME_' "$W/positive.log"
set +e
"${PW[@]}" "$TOOL/lib/check_cuts.py" "$W/build/video.html" --theme --mutate theme > "$W/mutation.log"
rc=$?
set -e
grep '^THEME_\|^MUTATION_' "$W/mutation.log"
[[ "$rc" == 1 ]]
grep -qx 'MUTATION_CAUGHT' "$W/mutation.log"
"${PW[@]}" - "$W/build/video.html" "$TOOL/lib" <<'PY'
import asyncio, io, sys
from pathlib import Path
sys.path.insert(0, sys.argv[2])
from capture import CHROME, CHROME_ARGS, RENDER_JS, warm_canvas
from playwright.async_api import async_playwright
from PIL import Image, ImageChops

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
        p = await b.new_page(viewport={"width":1920,"height":1080})
        await p.goto(Path(sys.argv[1]).as_uri())
        await p.evaluate("Promise.resolve(window.renderReady)")
        await warm_canvas(p, await p.context.new_cdp_session(p), 21)
        await p.evaluate(RENDER_JS, 20.8)
        first = Image.open(io.BytesIO(await p.screenshot())).convert("RGB")
        await p.evaluate(RENDER_JS, 42)
        await p.evaluate(RENDER_JS, 20.8)
        second = Image.open(io.BytesIO(await p.screenshot())).convert("RGB")
        assert ImageChops.difference(first, second).getbbox() is None, "seek changed blend"
        await b.close()
asyncio.run(main())
print("PASS theme blend is independent of render order")
PY

# Picture acceptance must not trust the HTML's two-switch plan. Synthesize a
# 120-second four-block sequence from a synthetic workshop still.
PROJECT="${THEME_TEST_PROJECT:-$TOOL/tests/project}"
[ "$PROJECT" != "$TOOL/tests/project" ] || python3 "$TOOL/tests/prepare_project.py"
"${PW[@]}" "$TOOL/lib/still.py" "$PROJECT/build/video.html" --t 10.2 --out "$W/source" > "$W/source.log"
"${PW[@]}" - "$W" "$TOOL/lib" <<'PY'
import json, subprocess, sys
from pathlib import Path
from PIL import Image
sys.path.insert(0, sys.argv[2])
from check_cuts import picture_metrics, picture_runs

assert picture_metrics(bytes([240, 230, 220]) * 100) == 1  # warm off-white
assert picture_metrics(bytes([255, 255, 160]) * 100) == 0  # bright yellow is not white
assert picture_metrics(bytes([170, 170, 170]) * 100) == 0
assert picture_metrics(bytes([171, 171, 171]) * 100) == 1
assert picture_metrics(bytes([188, 188, 186]) * 100) == 1  # grey-white close-up (luma < 200: old rule missed it)
assert picture_metrics(bytes([240, 240, 211]) * 100) == 1
assert picture_metrics(bytes([240, 240, 210]) * 100) == 0
assert picture_runs([0, 0, 1, 0, 0], 1.25)[0]["look"] == "real"
assert len(picture_runs([0, 0, 1, 1, 0, 0], 1.5)) == 3
assert picture_runs([.25] * 8, 2)[0]["look"] == "real"
assert picture_runs([.26] * 8, 2)[0]["look"] == "white"

w = Path(sys.argv[1])
original = Image.open(next((w / "source").glob("*.png"))).convert("RGB").resize((320, 180))
real = original.point(lambda value: round(value * .7))
white = Image.blend(real, Image.new("RGB", real.size, "#ece8e4"), .9)
ratios = {"real": picture_metrics(real.tobytes()), "white": picture_metrics(white.tobytes())}
assert ratios["real"] < .25 and ratios["white"] > .25, ratios
(w / "calibration.json").write_text(json.dumps(ratios, indent=2))
real.save(w / "real.png"); white.save(w / "white.png")
print("THEME_CALIBRATION", json.dumps(ratios, sort_keys=True))

blocks = [(18, 24), (45, 51), (70, 76), (94, 100)]
for name in ("alternation", "calm"):
    encoder = subprocess.Popen(["ffmpeg", "-nostdin", "-v", "error", "-y",
        "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", "320x180",
        "-framerate", "30", "-i", "-", "-an", "-c:v", "libx264", "-threads", "2",
        "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", str(w / f"{name}.mp4")],
        stdin=subprocess.PIPE)
    for frame in range(120 * 30):
        t = frame / 30
        if name == "alternation":
            alpha = float(any(a <= t < b for a, b in blocks))
        else:
            u = min(1, max(0, (t - 40) / 2), max(0, (62 - t) / 2))
            alpha = u * u * (3 - 2 * u)
        image = real if alpha == 0 else white if alpha == 1 else Image.blend(real, white, alpha)
        encoder.stdin.write(image.tobytes())
    encoder.stdin.close()
    assert encoder.wait() == 0
print("PASS synthesized synthetic picture reproduction: 4 white blocks /120s; calm 2s blends")
PY
python3 "$TOOL/lib/check_cuts.py" --theme --mp4 "$W/calm.mp4" --evidence "$W/calm-evidence" > "$W/picture-calm.log"
set +e
python3 "$TOOL/lib/check_cuts.py" "$W/build/video.html" --theme --mp4 "$W/alternation.mp4" \
  --evidence "$W/alternation-evidence" > "$W/picture-alternation.log"
picture_rc=$?
python3 "$TOOL/lib/check_cuts.py" --theme --mp4 "$W/calm.mp4" --mutate theme \
  --evidence "$W/picture-mutation" > "$W/picture-mutation.log"
mutation_rc=$?
set -e
cat "$W/picture-calm.log" "$W/picture-alternation.log" "$W/picture-mutation.log"
[[ "$picture_rc" == 1 && "$mutation_rc" == 1 ]]
grep -qx 'THEME_CHECK PASS' "$W/picture-calm.log"
grep -qx 'THEME_CHECK FAIL' "$W/picture-alternation.log"
grep -qx 'MUTATION_CAUGHT' "$W/picture-mutation.log"
python3 - "$W" <<'PY'
import json, sys
from pathlib import Path
w = Path(sys.argv[1])
bad = json.loads((w / "alternation-evidence/theme-picture.json").read_text())
white = [r for r in bad["runs"] if r["look"] == "white"]
assert len(white) == 4, white
for run, (a, b) in zip(white, [(18, 24), (45, 51), (70, 76), (94, 100)]):
    assert abs(run["start"] - a) <= .25 and abs(run["end"] - b) <= .25, run
assert any("hold" in e for e in bad["errors"]) and any("switches" in e for e in bad["errors"])
calm = json.loads((w / "calm-evidence/theme-picture.json").read_text())
assert len(calm["runs"]) == 3 and not calm["errors"], calm["errors"]
print("PASS picture acceptance: four white blocks found despite the two-switch HTML plan")
PY
# Grey-white 170-200 blocks (synthetic grey panel close-up) must count as white; bright accent colour must not.
seg=(); i=0; for spec in 203040:14 bcbcba:6 203040:20 bcbcba:6 f2a33a:6 203040:14 bcbcba:6 203040:20 bcbcba:6 203040:12; do
  seg+=(-f lavfi -i "color=c=0x${spec%%:*}:s=320x180:r=30:d=${spec##*:}"); i=$((i + 1)); done
ffmpeg -nostdin -v error -y "${seg[@]}" -filter_complex "$(for k in $(seq 0 $((i - 1))); do printf '[%d:v]' $k; done)concat=n=$i:v=1:a=0" \
  -c:v libx264 -pix_fmt yuv420p "$W/greywhite.mp4"
set +e; python3 "$TOOL/lib/check_cuts.py" --theme --mp4 "$W/greywhite.mp4" > "$W/picture-greywhite.log"; gw_rc=$?; set -e
cat "$W/picture-greywhite.log"
n_white=$(grep -c '^THEME_WHITE' "$W/picture-greywhite.log" || true)
[[ "$gw_rc" == 1 && "$n_white" == 4 ]] || { echo "FAIL grey-white blocks: rc=$gw_rc white_runs=$n_white (want 1, 4)"; exit 1; }
echo "PASS grey-white (RGB 188) blocks counted as white, orange accent block not"
# A bright picture that fades through black between scenes (1.6 s dips) and at both
# ends keeps one theme: the dips are not white->real->white switches. The same dips
# as hard cuts are still short real runs with a luma jump.
dur=120; soft="max(0,1-T)+max(0,1-($dur-T))"; hard="lt(T,1)+gt(T,$dur-1)"
for c in 20 40 60 80 100; do soft+="+max(0,1-abs(T-$c)/0.8)"; hard+="+between(T,$c-0.8,$c+0.8)"; done
for kind in soft hard; do
  [[ "$kind" == soft ]] && a="min(1,$soft)" || a="min(1,$hard)"
  ffmpeg -nostdin -v error -y -f lavfi -i "color=c=0xe6e2dc:s=160x90:r=30:d=$dur" -f lavfi -i "color=c=black:s=160x90:r=30:d=$dur" \
    -filter_complex "[0:v][1:v]blend=all_expr='A*(1-($a))+B*($a)'" -c:v libx264 -threads 2 -preset ultrafast -pix_fmt yuv420p "$W/dip-$kind.mp4"
  set +e; python3 "$TOOL/lib/check_cuts.py" --theme --mp4 "$W/dip-$kind.mp4" > "$W/picture-dip-$kind.log"; rc=$?; set -e
  cat "$W/picture-dip-$kind.log"
  if [[ "$kind" == soft ]]; then
    [[ "$rc" == 0 && "$(grep -c '^THEME_DIP ' "$W/picture-dip-$kind.log")" == 7 && "$(grep -c '^THEME_WHITE ' "$W/picture-dip-$kind.log")" == 1 ]] \
      || { echo "FAIL soft dips: rc=$rc (want 0, 7 dips, one white run)"; exit 1; }
    grep -qx 'THEME_FATIGUE PASS' "$W/picture-dip-$kind.log"
  else
    [[ "$rc" == 1 && "$(grep -c '^THEME_DIP ' "$W/picture-dip-$kind.log")" == 0 ]] && grep -q '^THEME_VIOLATION hold <12s' "$W/picture-dip-$kind.log" \
      || { echo "FAIL hard dips: rc=$rc (want 1, no dip, hold violation)"; exit 1; }
  fi
done
echo "PASS 1.6 s fades through black keep one theme; the same dips as hard cuts fail"
if [[ -n "${THEME_EVIDENCE:-}" ]]; then
  mkdir -p "$THEME_EVIDENCE"
  cp -a "$W"/{calm.mp4,alternation.mp4,real.png,white.png,calibration.json,picture-calm.log,picture-alternation.log,picture-mutation.log,calm-evidence,alternation-evidence,picture-mutation} "$THEME_EVIDENCE/"
fi
# Exercise the encoded-picture CLI: neutral periodic screens, coloured screens,
# a tolerated single excursion, and a mutation invisible to the white classifier.
python3 - "$TOOL/lib" <<'PY'
import sys
sys.path.insert(0, sys.argv[1])
from check_cuts import picture_fatigue

# Dips, real alternation, and flashes are independent counting contracts;
# all luminances stay within mismatch 3:1, so only bright pacing can fail.
for name, intervals, runs, flashes, failed in [
    ("threshold dip and short gap", [(20,40,100), (25,28,77.5), (32,33.5,60)], 1, 0, False),
    ("real alternation", [(20,25,100), (35,40,100), (50,55,100)], 3, 0, True),
    ("sub-two-second flash", [(20,21,100)], 0, 1, False),
    # A short dark start does not join a flash under 2 s into a bright run.
    ("flash after a short dark start", [(.75,2.25,100)], 0, 1, False),
    ("flash before a short dark end", [(77.75,79.25,100)], 0, 1, False),
    # The neighbour is judged after inside gaps join: 1.5 s + 1 s gap + 10 s is one 12.5 s run.
    ("short dark start before a joined run", [(.75,2.25,100), (3.25,13.25,100)], 1, 0, False),
]:
    luminances = [35.] * 320
    for start, end, luminance in intervals:
        luminances[int(start * 4):int(end * 4)] = [luminance] * int((end - start) * 4)
    result = picture_fatigue(luminances, 80)
    assert result.bright_runs == runs and len(result.flashes) == flashes, result
    assert bool(result.errors) == failed and all(e.startswith("bright_") for e in result.errors), result
    print(f"PASS fatigue {name}")
PY
python3 - "$W" "$TOOL/lib/check_cuts.py" <<'PY'
import json, subprocess, sys
from pathlib import Path

w, checker = Path(sys.argv[1]), Path(sys.argv[2])
cases = [
    ("periodic", "eeeeee", [(20, 32), (80, 92), (140, 152), (200, 212)], "FAIL"),
    ("blue", "b9d2f0", [(20 + i * 20, 26 + i * 20) for i in range(10)], "FAIL"),
    # A moderate surround permits one round trip; a very dark surround can
    # legitimately exceed the registered 25-second adaptation window.
    ("single", "b9d2f0", [(40, 60)], "PASS"),
    ("steady", "203040", [], "PASS"),
    ("bright", "b9d2f0", [], "PASS"),
    ("shift", "eeeeee", [(68, 88)], "PASS"),
]
for name, color, blocks, verdict in cases:
    # Each interval is the full-colour plateau, with two-second fades outside it.
    alpha = "+".join(
        f"max(0,min(1,min((T-{a - 2})/2,({b + 2}-T)/2)))"
        for a, b in blocks) or "0"
    video = w / f"fatigue-{name}.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y",
        "-f", "lavfi", "-i", f"color=c=0x{'b9d2f0' if name in ('bright', 'shift') else '406080' if name == 'single' else '203040'}:s=160x90:r=10:d=240",
        "-f", "lavfi", "-i", f"color=c=0x{color}:s=160x90:r=10:d=240",
        "-filter_complex", f"[0:v][1:v]blend=all_expr='A*(1-({alpha}))+B*({alpha})'",
        "-c:v", "libx264", "-threads", "2", "-preset", "ultrafast",
        "-pix_fmt", "yuv420p", str(video)], check=True)
    result = subprocess.run(["python3", str(checker), "--theme", "--mp4", str(video), "--evidence", str(w / f"fatigue-{name}-evidence")],
                            capture_output=True, text=True)
    (w / f"fatigue-{name}.log").write_text(result.stdout + result.stderr)
    assert result.returncode == (1 if verdict == "FAIL" else 0), (name, result.stdout)
    assert f"THEME_FATIGUE {verdict}\n" in result.stdout, (name, result.stdout)
    assert "THEME_VIOLATION" not in result.stdout, (name, result.stdout)
    print(f"PASS fatigue {name}: {verdict}")
for name, color in (("steady", "0xb9d2f0"), ("bright", "0x101828"), ("shift", "0x101828")):
    result = subprocess.run(["python3", str(checker), "--theme", "--mp4",
                             str(w / f"fatigue-{name}.mp4"), "--mutate", "fatigue", "--evidence", str(w / f"fatigue-mutation-{name}")],
                            capture_output=True, text=True)
    (w / f"fatigue-mutation-{name}.log").write_text(result.stdout + result.stderr)
    assert result.returncode == 1 and "MUTATION_CAUGHT fatigue\n" in result.stdout, result.stdout
    assert f"color={color} " in result.stdout, result.stdout
    if name == "shift":
        white = next(r for r in json.loads((w / "fatigue-shift-evidence/theme-picture.json").read_text())["runs"] if r["look"] == "white")
        mutation = json.loads((w / "fatigue-mutation-shift/theme-picture.json").read_text())["mutation"]
        assert [start for start, _ in mutation["blocks"]] == [10, white["end"] + 2, 130, 190], mutation
        assert f"starts=10.000,{white['end'] + 2:.3f},130.000,190.000 " in result.stdout, result.stdout
        assert mutation["white_before"] == mutation["white_after"] == 1, mutation
    print(f"PASS fatigue {name} mutation chooses {color} and is caught")
# Videos under 86 s had room for one 12 s block only, so the mutation failed as NOT_CAUGHT.
for seconds, base, want in ((60, "203040", "MUTATION_CAUGHT fatigue\n"), (80, "203040", "MUTATION_CAUGHT fatigue\n"),
                           (20, "203040", "MUTATION_CAUGHT fatigue\n"), (30, "eeeeee", "MUTATION_SKIP\n")):
    video = w / f"fatigue-short{seconds}.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=0x{base}:s=160x90:r=10:d={seconds}",
                    "-c:v", "libx264", "-threads", "2", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(video)], check=True)
    result = subprocess.run(["python3", str(checker), "--theme", "--mp4", str(video), "--mutate", "fatigue"], capture_output=True, text=True)
    (w / f"fatigue-mutation-short{seconds}.log").write_text(result.stdout + result.stderr)
    assert want in result.stdout, (seconds, result.stdout)
    assert result.returncode == (0 if want == "MUTATION_SKIP\n" else 1), (seconds, result.stdout)
    print(f"PASS fatigue mutation on a {seconds} s video: {want.strip()}")
# A bright video with one grey stretch: the 10 s and 70 s blocks both move past the first
# white run to the same spot. That is one block, not two, so the mutation is skipped.
video = w / "fatigue-one-gap.mp4"
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0xe6e2dc:s=160x90:r=10:d=180",
                "-vf", "drawbox=x=0:y=0:w=iw:h=ih:color=0x9a9a9a:t=fill:enable='between(t,80,110)'", "-c:v", "libx264",
                "-threads", "2", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(video)], check=True)
result = subprocess.run(["python3", str(checker), "--theme", "--mp4", str(video), "--mutate", "fatigue"], capture_output=True, text=True)
(w / "fatigue-mutation-one-gap.log").write_text(result.stdout + result.stderr)
assert result.returncode == 0 and "found 1" in result.stdout and "MUTATION_SKIP\n" in result.stdout, result.stdout
print("PASS fatigue mutation counts blocks moved to one spot once: MUTATION_SKIP")
PY
if [[ -n "${THEME_EVIDENCE:-}" ]]; then
  cp "$W"/fatigue-*.log "$THEME_EVIDENCE/"
fi
echo "THEME_TESTS PASS"
