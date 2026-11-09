#!/bin/bash
# 초점 회귀 검사: 지금 도구는 PASS, 그 고침만 되돌린 사본은 FAIL 이어야 한다.
#   bash tests/test_sharp.sh        → 마지막 줄 SHARP_TESTS PASS
#   RV_TEST_PROJECT=<look 켠 프로젝트> (기본: 합성 작업장 tests/project)
# ① 주인공 초점: 가운데 앞 기둥(KIT.fx.prop) 뒤 6 m 기계가 또렷(check_sharp PASS). 되돌림: 초점 = 가운데 광선 → 기계 흐림 FAIL
# ② 초점 빗나감 변이(--mutate focus) → MUTATION_CAUGHT
# ③ 예전 프로젝트가 window.KIT 를 통째로 바꿔도 렌더됨. 되돌림: KIT 합치기 없음 → 페이지 오류
# ④ 셔터: 바깥 장면은 outdoor 셔터, 챔버 안은 1.0 (MBENV)
# ⑤ 디스코드 나눔: 한 파일이면 바닥 아래인 영상 → 조각마다 ≤ 한도 · 바닥 이상 · 길이 합 = 원본. 되돌림: 예전 discord.sh(한 파일) → 바닥 아래
# ⑦ 0.3 Mb/s 변이: 어두운 큰 면 장면 → 해상도 낮춰 잡힘 · 평평한 화면 → 이유 붙은 SKIP · 흐린 판 → FAIL. 되돌림: 0.3 Mb/s 한 단계 → 안 잡힘
set -uo pipefail
TOOL="$(cd "$(dirname "$0")/.." && pwd)"
P="${RV_TEST_PROJECT:-$TOOL/tests/project}"
[ "$P" != "$TOOL/tests/project" ] || python3 "$TOOL/tests/prepare_project.py"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
UVPW=(uv run -q --no-project --with playwright --with pillow --with numpy python)
pass=0; fail=0
ok()  { echo "PASS $1"; pass=$((pass+1)); }
bad() { echo "FAIL $1"; fail=$((fail+1)); }
mutant() { rm -rf "$W/tool"; cp -a "$TOOL" "$W/tool"; rm -rf "$W/tool/.git"; }
mkdir -p "$W/p/final" "$W/p/test-video/shared"; cp -a "$P" "$W/p/final/project"; PP="$W/p/final/project"
[ -f "$P/../../test-video/shared/rig.js" ] && cp "$P/../../test-video/shared/rig.js" "$W/p/test-video/shared/"
rm -rf "$PP/build/frames" "$PP/build/stills"
cp "$TOOL/tests/fixtures/sharp_need.module.js" "$PP/scenes/need/module.js"; rm -f "$PP/scenes/need/deps.json"
T1=$(python3 -c "import json;m=json.load(open('$PP/build/timeline.json'))['modules']['need'];print(round(m['start']+2,2), round(m['start']+6,2))")
html() { (cd "$PP" && VIDEO_HTML="$W/$2.html" python3 "$1/lib/build.py" . >/dev/null 2>&1) && echo "$W/$2.html"; }
sharp() { local log="$W/sharp_$(basename "$2" .html)${3:-}.log"; "${UVPW[@]}" "$1/lib/check_sharp.py" "$2" --t $T1 "${@:3}" > "$log" 2>&1; local e=$?; tail -1 "$log"; return $e; }

H=$(html "$TOOL" cur) || { echo "FAIL 빌드"; echo "SHARP_TESTS FAIL"; exit 1; }
v=$(sharp "$TOOL" "$H"); echo "  $v"; [ "$v" = "SHARP_CHECK PASS" ] && ok "주인공 초점 → 기계 또렷" || bad "주인공 초점인데 $v ($W/sharp_cur.log)"
v=$(sharp "$TOOL" "$H" --mutate focus); echo "  $v"; echo "$v" | grep -q MUTATION_CAUGHT && ok "초점 빗나감 변이 잡힘" || bad "변이인데 $v"
mutant; python3 - "$W/tool/kit/look.js" <<'EOF'
import sys; p = sys.argv[1]; s = open(p).read()
old = "    const F = focusOf(scene, camera);"
new = old + "\n    { ray.setFromCamera(center, camera); const h = ray.intersectObjects(scene.children, true).find(h => h.object.visible && h.object.isMesh && h.distance > camera.near); F.f = h ? h.distance : 8; F.half = 0; F.from = 'ray'; }"
assert old in s, "mutation not applied"; open(p, "w").write(s.replace(old, new, 1))
EOF
HM=$(html "$W/tool" mut_focus); v=$(sharp "$W/tool" "$HM"); echo "  되돌림 $v"
[ "$v" = "SHARP_CHECK FAIL" ] && ok "되돌림(가운데 광선 초점) → 기계 흐림 FAIL(잡힘)" || bad "되돌림인데 $v"

echo 'window.KIT = {clamp: (x, a, b) => Math.min(b, Math.max(a, x))};' > "$PP/scenes/need/oldkit.js"
echo '{"scripts": ["oldkit.js"]}' > "$PP/scenes/need/deps.json"
still_ok() { "${UVPW[@]}" "$1/lib/still.py" "$2" --t $T1 --out "$W/st_$3" > "$W/still_$3.log" 2>&1; }
H2=$(html "$TOOL" oldkit) && still_ok "$TOOL" "$H2" cur && ok "예전 프로젝트 window.KIT 교체에도 렌더" || bad "window.KIT 교체로 렌더 실패 ($W/still_cur.log)"
mutant; python3 - "$W/tool/kit/scene_kit.js" <<'EOF'
import re, sys; p = sys.argv[1]; s = open(p).read()
s2 = re.sub(r'  Object\.defineProperty\(window, "KIT".*?\n', '  window.KIT = K;\n', s)
assert s2 != s, "mutation not applied"; open(p, "w").write(s2)
EOF
H3=$(html "$W/tool" mut_kit) && still_ok "$W/tool" "$H3" mut && bad "되돌림인데 렌더됨" || ok "되돌림(KIT 통째 교체) → 렌더 실패(잡힘)"
rm -f "$PP/scenes/need/oldkit.js" "$PP/scenes/need/deps.json"

env_of() { "${UVPW[@]}" - "$1" "$TOOL/lib" "$2" <<'EOF'
import asyncio, sys
from pathlib import Path
sys.path.insert(0, sys.argv[2])
from capture import CHROME, CHROME_ARGS
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS); p = await b.new_page(viewport={"width": 1920, "height": 1080})
        await p.goto(Path(sys.argv[1]).resolve().as_uri(), wait_until="load"); await p.evaluate("Promise.resolve(window.renderReady)")
        print(await p.evaluate("async ts => { const o = []; for (const t of ts) { await window.renderAt(t); } return JSON.stringify(window.MBENV); }", [float(x) for x in sys.argv[3].split()]))
        await b.close()
asyncio.run(main())
EOF
}
TR=$(python3 -c "import json;m=json.load(open('$PP/build/timeline.json'))['modules']['chamber'];print(round(m['start']+3,2))")
e=$(env_of "$H" "${T1%% *} $TR"); echo "  MBENV $e"
echo "$e" | grep -q '"need":"outdoor"' && echo "$e" | grep -q '"chamber":"indoor"' && ok "바깥 = outdoor 셔터, 챔버 안 = indoor" || bad "실내/바깥 판정 $e"

ffmpeg -nostdin -v error -y -f lavfi -i testsrc2=size=1920x1080:rate=30:duration=40 -f lavfi -i sine=frequency=440:duration=40 -c:v libx264 -crf 12 -c:a aac -shortest "$W/long.mp4"
bash "$TOOL/lib/discord.sh" "$W/long.mp4" "$W/long_discord.mp4" 1 --min-kbps 150 > "$W/disc.log" 2>&1 || cat "$W/disc.log"
if [ -f "$W/long_discord_parts.json" ] && python3 - "$W" <<'EOF'
import json, subprocess, sys
w = sys.argv[1]; P = json.load(open(f"{w}/long_discord_parts.json")); ok = len(P) >= 2
for p in P:
    f = f"{w}/{p['file']}"; sz = __import__("os").path.getsize(f)
    d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], capture_output=True, text=True).stdout)
    print(f"  {p['file']} {sz} B {p['kbps']}k {d:.2f} s"); ok &= sz <= 1048576 and p["kbps"] >= 140
total = sum(p["dur"] for p in P); print(f"  합 {total:.2f} s"); ok &= abs(total - 40) < 0.1
sys.exit(0 if ok else 1)
EOF
then ok "나눔: 조각 ≥ 2, 조각마다 ≤ 1 MiB · ≥ 바닥, 길이 합 40 s"; else bad "나눔 실패 ($W/disc.log)"; fi
mutant; cat > "$W/tool/lib/discord.sh" <<'EOF'
#!/bin/bash
set -euo pipefail
IN="$1"; OUT="$2"; LIM="${3:-20}"; DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN"); P="$(dirname "$OUT")/.2pass-$$"
V=$(awk -v l="$LIM" -v d="$DUR" 'BEGIN{printf "%d", (l*1048576*8*0.96/d - 128000)/1000}')
ffmpeg -nostdin -v error -y -i "$IN" -c:v libx264 -b:v ${V}k -pass 1 -passlogfile "$P" -an -f mp4 /dev/null
ffmpeg -nostdin -v error -y -i "$IN" -c:v libx264 -b:v ${V}k -pass 2 -passlogfile "$P" -c:a aac -b:a 128k "$OUT"; rm -f "$P"*; echo "DISCORD ${V}k"
EOF
rm -f "$W"/long_discord*; out=$(bash "$W/tool/lib/discord.sh" "$W/long.mp4" "$W/long_discord.mp4" 1 --min-kbps 150 2>&1 | tail -1); echo "  되돌림 $out"
k=$(echo "$out" | sed -n 's/.*DISCORD \([0-9-]*\)k.*/\1/p'); [ ! -f "$W/long_discord_parts.json" ] && [ "${k:-0}" -lt 150 ] && ok "되돌림(한 파일) → ${k}k < 바닥 150k (잡힘)" || bad "되돌림인데 $out"
# ⑤-2 원본이 조각 한도에 들어가면 다시 인코딩하지 않고 키프레임에서 복사로 나눔: 이어 붙인 그림 = 원본(framemd5). 되돌림: 복사 안 함 → 다시 인코딩 → 다름
ffmpeg -nostdin -v error -y -f lavfi -i testsrc2=size=1920x1080:rate=30:duration=40 -f lavfi -i sine=frequency=440:duration=40 -c:v libx264 -b:v 600k -g 60 -c:a aac -shortest "$W/fit.mp4"
frames_of() { for f in "$@"; do echo "file '$f'"; done > "$W/fit.list"; ffmpeg -nostdin -v error -f concat -safe 0 -i "$W/fit.list" -map 0:v -f framemd5 - | grep -v '^#' | awk -F, '{print $NF}'; }
copy_case() { rm -f "$W"/fit_discord*; bash "$1/lib/discord.sh" "$W/fit.mp4" "$W/fit_discord.mp4" 1 --min-kbps 150 > "$W/fit.log" 2>&1 || cat "$W/fit.log"
  [ -f "$W/fit_discord_parts.json" ] && python3 -c "import json,os,sys;P=json.load(open(sys.argv[1]));sys.exit(0 if len(P)>=2 and all(os.path.getsize(os.path.join(sys.argv[2],p['file']))<=1048576 and p['kbps']>=150 for p in P) else 1)" "$W/fit_discord_parts.json" "$W" \
    && [ "$(frames_of $(ls "$W"/fit_discord_part*.mp4 | sort -V) | md5sum)" = "$(frames_of "$W/fit.mp4" | md5sum)" ]; }
if copy_case "$TOOL"; then ok "복사 나눔: $(grep -c '^DISCORD part' "$W/fit.log") 조각 ≤ 1 MiB · ≥ 바닥, 이어 붙인 그림 = 원본"; else bad "복사 나눔 실패 ($W/fit.log)"; fi
# 복사 나눔의 음성: 조각마다 자기 구간의 소리가 빠지지 않아야 한다(AAC 패킷만 복사하면 조각 시작의 Skip Samples 가 소리를 지움)
python3 - "$W/fit.mp4" "$W/fit_discord_parts.json" <<'EOF' >> "$W/audio.log" 2>&1 && ok "복사 나눔 음성: 조각마다 구간 소리 보존(샘플 부족 0)" || bad "복사 나눔 음성 손실 ($W/audio.log)"
import json, subprocess, sys
src, manifest = sys.argv[1], sys.argv[2]
parts = json.load(open(manifest))
rate = int(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate",
                           "-of", "csv=p=0", src], capture_output=True, text=True).stdout.strip())
def samples(path):
    channels = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels",
                               "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip()
    out = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-threads", "1", "-i", path, "-map", "0:a:0",
                          "-f", "s16le", "-acodec", "pcm_s16le", "-"], capture_output=True, check=True).stdout
    return len(out) // (2 * int(channels))
def duration(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                                capture_output=True, text=True).stdout)
total = 0
for p in parts:
    f = manifest.rsplit("/", 1)[0] + "/" + p["file"]
    n, expected = samples(f), duration(f) * rate
    print(f"{p['file']}: {n} samples, interval about {expected:.0f}")
    assert n >= expected - 1024, f"{p['file']} lost {expected - n} samples of audible content"
    total += n
original = samples(src)
print(f"original {original}, parts {total}")
assert total >= original - 1024, f"lost {original - total} samples over all parts"
assert total - original <= 1024 * len(parts), "too much padding at the cuts"
EOF
mutant; rm -f "$W/tool/lib/discord_copy.py"
if copy_case "$W/tool"; then bad "되돌림(복사 없음)인데 같음 — 시험이 복사를 안 봄"; else ok "되돌림(복사 없음) → 다시 인코딩, 그림 다름 (잡힘)"; fi

# ⑥ 주인공 마스크는 화면에 보이는 것만: KIT.fx.focus 묶음에 아직 안 보이는(불투명도 0) 판이
# 들어 있어도 주인공 메시에 안 들어가야 한다(LOOK.subjectParts — subjectMask 가 흰색으로 칠하는 집합, GPU 읽기 없이 결정적).
# 되돌림: 묶음의 모든 메시를 주인공으로 → 안 보이는 판이 주인공이 됨
sed -e 's|machine.position.set(1.6, 0, -6); scene.add(machine);|machine.position.set(1.6, 0, -6); scene.add(machine); const ghost = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({transparent: true, opacity: 0})); ghost.name = "ghost"; ghost.position.set(-4.2, 1.2, 0); machine.add(ghost);|' \
    -e 's|machine.rotation.y = 0.35 \* t;|machine.rotation.y = 0.35 * t; KIT.fx.focus(machine);|' "$TOOL/tests/fixtures/sharp_need.module.js" > "$PP/scenes/need/module.js"
grep -q 'ghost.name' "$PP/scenes/need/module.js" && grep -q 'KIT.fx.focus(machine)' "$PP/scenes/need/module.js" || bad "안 보이는 판 고정물 만들기"
parts() {   # <html> -> "<주인공 메시 수> <ghost 가 주인공인가 0|1>"
  "${UVPW[@]}" - "$1" "${T1%% *}" "$TOOL/lib" <<'PY'
import asyncio, sys
from pathlib import Path
from playwright.async_api import async_playwright
sys.path.insert(0, sys.argv[3])
from capture import CHROME, CHROME_ARGS
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, args=CHROME_ARGS, headless=True); p = await b.new_page(viewport={"width": 1920, "height": 1080})
        await p.goto(Path(sys.argv[1]).resolve().as_uri()); await p.evaluate("Promise.resolve(window.renderReady)")
        n, g = await p.evaluate("async t => { await window.renderAt(t); const {inS} = window.LOOK.subjectParts(); return [inS.size, [...inS].some(m => m.name === 'ghost') ? 1 : 0]; }", float(sys.argv[2]))
        await b.close(); print(n, g)
asyncio.run(main())
PY
}
HG=$(html "$TOOL" ghost_cur) && r=$(parts "$HG" 2>&1 | tail -1); echo "  주인공 메시 수 · 안 보이는 판이 주인공: $r"
[ "${r##* }" = 0 ] && [ "${r%% *}" -ge 2 ] 2>/dev/null && ok "안 보이는 focus 부품은 주인공 밖, 기계 메시는 안" || bad "안 보이는 판인데 $r"
mutant; python3 - "$W/tool/kit/look.js" <<'EOF'
import sys; p = sys.argv[1]; s = open(p).read()
old = "if (seen(m)) inS.add(m); else unseen.add(m);"
assert old in s, "mutation not applied"; open(p, "w").write(s.replace(old, "inS.add(m);", 1))
EOF
HGM=$(html "$W/tool" ghost_mut) && r=$(parts "$HGM" 2>&1 | tail -1); echo "  되돌림 $r"
[ "${r##* }" = 1 ] && ok "되돌림(묶음 전부 주인공) → 안 보이는 판이 주인공(잡힘)" || bad "되돌림인데 $r"
cp "$TOOL/tests/fixtures/sharp_need.module.js" "$PP/scenes/need/module.js"

r=$(cd "$TOOL/lib" && "${UVPW[@]}" - 2>&1 <<'PY'
from check_sharp import off_transitions
from check_motion import transition_spans
tl = {"order": ["hard", "vision", "end"], "modules": {"hard": {"start": 0, "duration": 32.83},
      "vision": {"start": 32.83, "duration": 20}, "end": {"start": 52.83, "duration": 10}}}
spans = transition_spans(tl, {"vision": {"dur": .8}}, {"end": "relief"}, 2.0)
ts, moved = off_transitions([3.0, 33.0, 32.6, 45.0, 53.0], tl, spans, 0.0, 62.8)
print(ts, moved)
assert 33.0 not in ts and 32.6 not in ts and 53.0 not in ts and 3.0 in ts and 45.0 in ts, ts
assert all(not (32.43 <= t <= 33.23) and not (52.83 <= t <= 54.83) for t in ts), ts
print("SHIFT_OK")
PY
)
echo "  $r"; echo "$r" | grep -q SHIFT_OK && ok "선명도 표본이 전환(dip 앞뒤 절반·테마 섞기)에 걸리면 비킴" || bad "전환 안 표본 $r"
masks() { "${UVPW[@]}" - "$1" "${T1%% *}" "$TOOL/lib" <<'PY'
import asyncio, base64, io, sys
from PIL import Image
sys.path.insert(0, sys.argv[3])
from capture import CHROME, CHROME_ARGS, warm_canvas
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
        p = await b.new_page(viewport={"width": 1920, "height": 1080})
        await p.goto("file://" + sys.argv[1]); await p.evaluate("Promise.resolve(window.renderReady)")
        await warm_canvas(p, await p.context.new_cdp_session(p), float(sys.argv[2]))
        areas = []
        for _ in range(6):
            url = await p.evaluate("async t => { LOOK.probe = {noGrain: true}; await renderAt(t); return LOOK.subjectMask(); }", float(sys.argv[2]))
            im = Image.open(io.BytesIO(base64.b64decode(url.split(",")[1]))).convert("L")
            areas.append(round(sum(1 for x in im.getdata() if x > 128) / (1920 * 1080), 5))
        await b.close()
    print("MASK_AREAS", areas, "SAME" if areas[0] > 0 and len(set(areas)) == 1 else "DIFFERENT")
asyncio.run(main())
PY
}
r=$(masks "$H" 2>/dev/null | tail -1); echo "  $r"; echo "$r" | grep -q SAME && ok "주인공 마스크 같은 자세 6 번 첫 장부터 면적 같음" || bad "마스크 면적이 장마다 다름 $r"
# ⑦ 0.3 Mb/s 변이는 장면 결에 맞춘다: 어둡고 큰 면뿐인 장면은 0.3 Mb/s 로 거의 안 상하므로(실제 어두운 렌더 장면에서 거짓 NOT_CAUGHT)
#    해상도를 1/2·1/4 로 낮춰 화면이 실제로 상한 단계로 잰다 → MUTATION_CAUGHT. 평평한 화면은 손상이 성립하지 않으니 이유 붙은
#    MUTATION_SKIP(종료 0). 같은 장면을 흐린 판은 지금처럼 SHARP_CHECK FAIL. 되돌림: 0.3 Mb/s 한 단계만 → 안 잡힘. (합성 영상만)
#    잴 순간은 6 · 6.5 s: 0.3 Mb/s 인코딩의 첫 2~3 s 는 x264 비트 배분이 아직 덜 차 더 거칠다(같은 판이 2 s 0.75, 6 s 0.92).
"${UVPW[@]}" "$TOOL/tests/fixtures/sharp_dark.py" "$W/dark.mp4" 10
ffmpeg -nostdin -v error -y -f lavfi -i color=c=0x30363a:size=1920x1080:rate=30:duration=10 -c:v libx264 -crf 18 -pix_fmt yuv420p "$W/flat.mp4"
ffmpeg -nostdin -v error -y -i "$W/dark.mp4" -vf gblur=sigma=3 -c:v libx264 -crf 18 -pix_fmt yuv420p "$W/dark_blur.mp4"
v=$(sharp "$TOOL" "$H" --mutate bitrate --ref "$W/dark.mp4" --t 6 6.5); echo "  $v"; grep '^SHARP_MUTATION' "$W/sharp_cur--mutate.log" | sed 's/^/    /'
echo "$v" | grep -q '^MUTATION_CAUGHT bitrate' && ok "어두운 큰 면 장면: 해상도 낮춘 손상 잡힘" || bad "어두운 장면 bitrate 변이인데 $v"
v=$(sharp "$TOOL" "$H" --mutate bitrate --ref "$W/flat.mp4" --t 6 6.5); e=$?; echo "  $v"; grep '^SHARP_MUTATION_SKIP' "$W/sharp_cur--mutate.log" | sed 's/^/    /'
[ "$v" = MUTATION_SKIP ] && [ $e = 0 ] && grep -q '^SHARP_MUTATION_SKIP bitrate: ' "$W/sharp_cur--mutate.log" && ok "평평한 화면: 이유 붙은 MUTATION_SKIP" || bad "평평한 화면인데 $v (종료 $e)"
v=$(sharp "$TOOL" "$H" --mp4 "$W/dark_blur.mp4" --ref "$W/dark.mp4" --t 6 6.5); echo "  $v"
[ "$v" = "SHARP_CHECK FAIL" ] && ok "흐린 인코딩 → SHARP_CHECK FAIL" || bad "흐린 인코딩인데 $v"
mutant; python3 - "$W/tool/lib/check_sharp.py" <<'EOF'
import sys; p = sys.argv[1]; s = open(p).read()
old = "LADDER = ((300, 1), (300, 2), (300, 4))"
assert old in s, "mutation not applied"; open(p, "w").write(s.replace(old, "LADDER = ((300, 1),)", 1))
EOF
v=$(sharp "$W/tool" "$H" --mutate bitrate --ref "$W/dark.mp4" --t 6 6.5); echo "  되돌림 $v"
echo "$v" | grep -q '^MUTATION_CAUGHT' && bad "되돌림(0.3 Mb/s 한 단계)인데 잡힘 $v" || ok "되돌림(0.3 Mb/s 한 단계) → 어두운 장면 안 잡힘"
echo "통과 $pass · 실패 $fail"
[ $fail = 0 ] && echo "SHARP_TESTS PASS" || { echo "SHARP_TESTS FAIL"; exit 1; }
