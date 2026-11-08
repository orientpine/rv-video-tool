#!/bin/bash
# 렌더 회귀 고침마다: 지금 도구로는 PASS, 그 고침만 되돌린 도구 사본으로는 FAIL 이어야 한다(되돌림 변이).
#   bash tests/test_rv_best.sh [--fast]        → 마지막 줄 RV_BEST_TESTS PASS
#   RV_TEST_PROJECT=<프로젝트>  (기본: 합성 작업장 tests/project, look·sources.json·dip 이 켜진 것)
#   --fast 는 1분 넘는 셔터 시험을 건너뛴다(건너뛴 것은 SKIP 로 따로 적고 PASS 로 치지 않음 → 마지막 줄 RV_BEST_TESTS PARTIAL)
set -uo pipefail
TOOL="$(cd "$(dirname "$0")/.." && pwd)"
P="${RV_TEST_PROJECT:-$TOOL/tests/project}"
[ "$P" != "$TOOL/tests/project" ] || python3 "$TOOL/tests/prepare_project.py"
FAST=0; [ "${1:-}" = "--fast" ] && FAST=1
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
UVPW=(uv run -q --no-project --with playwright --with pillow --with numpy python)
pass=0; fail=0; skip=0
ok()   { echo "PASS $1"; pass=$((pass+1)); }
bad()  { echo "FAIL $1"; fail=$((fail+1)); }
mutant() { rm -rf "$W/tool"; cp -a "$TOOL" "$W/tool"; rm -rf "$W/tool/.git"; }   # 되돌림 변이를 넣을 도구 사본

# 프로젝트 사본(빌드 산출물만 바꾸고 원본은 안 건드림). 장면 deps 가 ../../../../test-video/shared 를 가리키면 그 자리도 따라 만든다
mkdir -p "$W/p/final" "$W/p/test-video/shared"; cp -a "$P" "$W/p/final/project"; PP="$W/p/final/project"
[ -f "$P/../../test-video/shared/rig.js" ] && cp "$P/../../test-video/shared/rig.js" "$W/p/test-video/shared/"
rm -rf "$PP/build/frames" "$PP/build/stills" "$PP"/build/clip_* "$PP"/build/scrub_*

# (lum 은 쓰지 않음)
lum() { "${UVPW[@]}" -c "import sys,numpy as n;from PIL import Image;a=n.asarray(Image.open(sys.argv[1]).convert('L'),float)[300:800,200:1700];print(round(a.mean(),1))" "$1"; }
still() { "${UVPW[@]}" "$1/lib/still.py" "$2" --t "$3" --out "$4" >/dev/null 2>&1; ls "$4"/*.png | head -1; }

# 1) 모션 블러가 제대로 걸림: 10.2 s 에서 mb 8 표본 그림과 mb 끔 그림의 평균 차이가 0.5~40 (블러는 움직이는 가장자리만 바꿈).
#    되돌림: 누적 결과 복사 패스의 textureID 고침을 빼면 ShaderPass 가 tDiffuse 를 readBuffer 로 덮어 블러가 사라짐(버퍼 교대에 따라 검은 화면이 되기도 함)
setmb() { python3 - "$PP/script.json" "$1" <<'EOF'
import json,sys; p=sys.argv[1]; d=json.load(open(p)); d['look']={'preset':'cinema','mb':{'samples':int(sys.argv[2])}}; json.dump(d,open(p,'w'),ensure_ascii=False)
EOF
}
t1() { local T="$1" tag="$2"; cp "$PP/script.json" "$W/sj1.keep"
  setmb 8; (cd "$PP" && VIDEO_HTML="$W/${tag}_mb.html" python3 "$T/lib/build.py" . >/dev/null)
  setmb 0; (cd "$PP" && VIDEO_HTML="$W/${tag}_nomb.html" python3 "$T/lib/build.py" . >/dev/null); cp "$W/sj1.keep" "$PP/script.json"
  local f1 f2; f1=$(still "$T" "$W/${tag}_mb.html" 10.2 "$W/s_${tag}_mb"); f2=$(still "$T" "$W/${tag}_nomb.html" 10.2 "$W/s_${tag}_nomb")
  [ -n "$f1" ] && [ -n "$f2" ] || return 2
  local d s; read -r d s < <("${UVPW[@]}" -c "import sys,numpy as n;from PIL import Image
a,b=[n.asarray(Image.open(x).convert('L'),float)[150:870] for x in sys.argv[1:]]
S=lambda g:((-4*g[1:-1,1:-1]+g[:-2,1:-1]+g[2:,1:-1]+g[1:-1,:-2]+g[1:-1,2:])**2).mean()/g.var()
print(round(abs(a-b).mean(),3), round(S(a)/S(b),3))" "$f1" "$f2")
  echo "  블러 차이 $d · 선명도 비(mb/끔) $s"; awk -v d="$d" -v s="$s" 'BEGIN{exit !(d<40 && s<0.85)}'; }
  # 블러가 걸렸다 = 선명도(라플라시안/분산) 비 < 0.85, 화면이 안 깨졌다 = 차이 < 40.
  # 평균 차이만으로는 깨진 누적 버퍼를 구별할 수 없어 선명도 비도 함께 검사한다.
t1 "$TOOL" cur && ok "모션 블러가 실제로 걸림" || bad "모션 블러가 실제로 걸림"
mutant; sed -i '/copyPass.textureID = "__accRT";/d' "$W/tool/kit/look.js"
grep -q 'textureID = "__accRT"' "$W/tool/kit/look.js" && bad "변이를 못 넣음"
t1 "$W/tool" mut && bad "되돌림(textureID)인데 블러가 멀쩡함" || ok "되돌림(textureID) → 블러 사라지거나 화면 깨짐(잡힘)"

# 2) 출처 없는 숫자 관문: 나레이션에 '12 kW' 넣으면 빌드 실패. 되돌림: build.py 의 관문 줄 제거 → 빌드 성공(못 막음)
cp "$PP/script.json" "$W/script.keep"
python3 - "$PP/script.json" <<'EOF'
import json,sys; p=sys.argv[1]; d=json.load(open(p)); d['lines'][0]['text'] += ' 출력은 12 kW 입니다.'; json.dump(d,open(p,'w'),ensure_ascii=False)
EOF
(cd "$PP" && python3 "$TOOL/lib/build.py" . >/dev/null 2>&1) && bad "관문이 12 kW 를 통과시킴" || ok "관문이 12 kW 를 막음"
mutant; python3 - "$W/tool/lib/build.py" <<'EOF'
import sys; p=sys.argv[1]; s=open(p).read(); s=s.replace('        if bad:\n            sys.exit(', '        if False:\n            sys.exit('); open(p,'w').write(s)
EOF
(cd "$PP" && python3 "$W/tool/lib/build.py" . >/dev/null 2>&1) && ok "되돌림(관문 끔) → 12 kW 통과(잡힘)" || bad "되돌림인데도 막힘(시험이 관문을 안 봄)"
cp "$W/script.keep" "$PP/script.json"

# 3) 카메라 곡선: 실제 장면처럼 고르지 않은 간격의 열쇠 5개를 지나는 동안 멈춤-출발 0. 되돌림: camAt 을 열쇠마다 멈추는 hold 모드로 → 1 이상
cam() { node - "$1/kit/scene_kit.js" <<'EOF'
const fs = require("fs"), vm = require("vm"), path = require("path"); const ctx = {console}; ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(path.dirname(process.argv[2]), "../vendor/three-0.147.0.min.js"), "utf8"), ctx);   // scene_kit 은 싣자마자 THREE.Color 를 씀
vm.runInContext(fs.readFileSync(process.argv[2], "utf8"), ctx); const KIT = ctx.window.KIT;
const K = [[0, [-0.6, 2, 4.6], [-2.2, 0.9, 1.2], 50], [4.26, [-1, 1.6, 2.9], [-2, 1, 0.4], 44], [6.65, [1.2, 2.2, 4.6], [1, 0.9, 1.4], 52], [9.89, [0.2, 3.2, 5.4], [0, 1, 0.3], 54], [12.9, [-0.4, 3, 5.2], [-0.6, 1, 0.3], 52]];
const P = []; for (let f = 3; f < 12.9 * 30 - 3; f++) P.push(KIT.camAt(K, f / 30).p);
const sp = P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1], p[2] - P[i][2]) * 30), mx = Math.max(...sp);
let n = 0; for (let i = 1; i < sp.length - 1; i++) if (sp[i] < 0.08 * mx && Math.max(...sp.slice(0, i)) > 0.3 * mx && Math.max(...sp.slice(i)) > 0.3 * mx && sp[i] <= sp[i - 1] && sp[i] <= sp[i + 1]) n++;
console.log(n);
EOF
}
n=$(cam "$TOOL"); echo "  멈춤-출발 $n"; [ "$n" = 0 ] && ok "카메라 곡선 멈춤-출발 0" || bad "카메라 곡선 멈춤-출발 $n"
mutant; sed -i 's/function camAt(K, t, o = {}) {/function camAt(K, t, o = {}) { o = Object.assign({}, o, {hold: true});/' "$W/tool/kit/scene_kit.js"
n=$(cam "$W/tool"); echo "  되돌림 멈춤-출발 $n"; [ "${n:-0}" -ge 1 ] && ok "되돌림(열쇠마다 멈춤) → 멈춤-출발 $n(잡힘)" || bad "되돌림인데 멈춤-출발 0"

# 4) 바뀐 장면만: 처음 전부 · 그대로 0 · 한 장면 고치면 그 장면만 · kit 바꾸면 전부. 되돌림: 지문 비교를 늘 '다름'으로 → 그대로인데 다시 찍음
mkdir -p "$PP/build/frames"; for i in $(seq 0 99); do : > "$PP/build/frames/$(printf 'f_%05d.png' $i)"; done
python3 "$TOOL/lib/scenecache.py" "$PP" >/dev/null
r2=$(python3 "$TOOL/lib/scenecache.py" "$PP"); echo "  $r2"; echo "$r2" | grep -q "다시 - " && ok "그대로면 다시 찍는 장면 없음" || bad "그대로인데 다시 찍음"
echo "// t" >> "$PP/scenes/hold/module.js"; r3=$(python3 "$TOOL/lib/scenecache.py" "$PP"); echo "  $r3"
echo "$r3" | grep -q "다시 hold · " && ok "hold 만 다시" || bad "hold 만 다시가 아님"
mutant; sed -i 's/old.get(n, {}).get("hash") != new\[n\]\["hash"\]/True/' "$W/tool/lib/scenecache.py"
r4=$(python3 "$W/tool/lib/scenecache.py" "$PP"); echo "$r4" | grep -q "다시 - " && bad "되돌림인데 그대로로 봄" || ok "되돌림(지문 무시) → 전부 다시(잡힘)"

# 5) 셔터 1.0: chamber 9~10.7 s 깜빡임 0. 되돌림: 셔터 0.5 → 깜빡임 ≥ 1 (1분 넘게 걸림)
flick() { local T="$1" tag="$2"; (cd "$PP" && VIDEO_HTML="$W/f_$tag.html" python3 "$T/lib/build.py" . >/dev/null) || return 2
  "${UVPW[@]}" "$T/lib/still.py" "$W/f_$tag.html" --every 0.033333 --from 9 --to 10.7 --out "$W/ff_$tag" >/dev/null 2>&1
  ffmpeg -v error -y -framerate 30 -pattern_type glob -i "$W/ff_$tag/*.png" -c:v libx264 -crf 18 -pix_fmt yuv420p "$W/f_$tag.mp4"
  "${UVPW[@]}" "$T/lib/check_flicker.py" "$W/f_$tag.mp4" | tail -1; }
if [ $FAST = 1 ]; then skip=$((skip+1)); echo "SKIP 셔터(--fast)"; else
  # 고정 카메라와 미세 발광 고리로 노출 간격의 빈틈을 검사한다.
  cp "$TOOL/tests/fixtures/shutter_ring.module.js" "$PP/scenes/chamber/module.js"
  v=$(flick "$TOOL" cur); echo "  $v"; [ "$v" = "FLICKER_CHECK PASS" ] && ok "셔터 1.0 깜빡임 0" || bad "셔터 1.0 인데 $v"
  mutant; sed -i 's/mb: {samples: 8, shutter: 1.0, weights: "flat",/mb: {samples: 6, shutter: 0.5, weights: "flat",/' "$W/tool/kit/look.js"; grep -q 'samples: 6, shutter: 0.5, weights' "$W/tool/kit/look.js" || bad "셔터 되돌림 변이가 안 들어감(look.js mb 줄 모양 바뀜)"
  v=$(flick "$W/tool" mut); echo "  되돌림 $v"; [ "$v" = "FLICKER_CHECK FAIL" ] && ok "되돌림(셔터 0.5) → 깜빡임(잡힘)" || bad "되돌림인데 $v"
fi

# 6) 테마 섞기 첫 프레임 = 나가는 장면의 실제 마지막 프레임(모션 블러 포함): relief hold → cinema map 경계 밝기 차 ≤ 1.
#    되돌림: 섞기 나가는 끝을 블러 없이 한 번 그리기(옛 판) → 차 > 3
seam() { (cd "$PP" && VIDEO_HTML="$W/$2_seam.html" python3 "$1/lib/build.py" . >/dev/null) || return 2
  "${UVPW[@]}" - "$1" "$W/$2_seam.html" <<'PY'
import asyncio, io, math, sys
sys.path.insert(0, sys.argv[1] + "/lib")
from PIL import Image, ImageStat
from playwright.async_api import async_playwright
from capture import CHROME, CHROME_ARGS, RENDER_JS
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
        p = await b.new_page(viewport={"width": 1920, "height": 1080})
        await p.goto("file://" + sys.argv[2], wait_until="load"); await p.evaluate("Promise.resolve(window.renderReady)")
        tl = await p.evaluate("window.TIMELINE"); fps = tl.get("fps", 30)
        first = math.ceil(tl["modules"]["map"]["start"] * fps - 1e-6); v = []
        for f in (first - 1, first):
            await p.evaluate(RENDER_JS, f / fps); v.append(ImageStat.Stat(Image.open(io.BytesIO(await p.screenshot())).convert("L")).mean[0])
        await b.close(); print(round(abs(v[1] - v[0]), 3))
asyncio.run(main())
PY
}
d=$(seam "$TOOL" cur); echo "  섞기 이음새 밝기 차 $d"; awk -v d="${d:-99}" 'BEGIN{exit !(d<=1)}' && ok "섞기 첫 프레임 = 실제 마지막 프레임 (차 $d)" || bad "섞기 이음새 차 $d"
mutant; python3 - "$W/tool/kit/shell.html" <<'EOF'
import sys; p=sys.argv[1]; s=open(p).read(); a="await draw(previous, end);"; assert a in s
open(p,"w").write(s.replace(a, "KIT.fx.reset(); await previous.m.render(Math.max(0, previous.dur - 1 / FPS));"))
EOF
d=$(seam "$W/tool" mut); echo "  되돌림 차 $d"; awk -v d="${d:-0}" 'BEGIN{exit !(d>3)}' && ok "되돌림(블러 없이 한 번) → 차 $d(잡힘)" || bad "되돌림인데 차 $d"

# 7) 프레임 캐시: 새 길이 뒤 옛 프레임은 늘 지움, --range 는 그 구간도. 되돌림: 뒤쪽 지우기·구간 지우기를 빼면 남음
stale() { local T="$1" FR="$PP/build/frames"; python3 "$T/lib/scenecache.py" "$PP" >/dev/null
  local n; n=$(python3 -c "import json;print(round(json.load(open('$PP/build/timeline.json'))['total_s']*30))")
  for k in 10 $((n-1)) $n $((n+100)) $((n+299)); do : > "$FR/$(printf 'f_%05d.png' "$k")"; done
  python3 "$T/lib/scenecache.py" "$PP" >/dev/null
  local left; left=$(ls "$FR" | grep -c "^f_\($(printf '%05d' "$n")\|$(printf '%05d' $((n+100)))\|$(printf '%05d' $((n+299)))\)\.png$")
  [ -f "$FR/$(printf 'f_%05d.png' $((n-1)))" ] && [ -f "$FR/f_00010.png" ] || left="keep-missing"
  python3 "$T/lib/scenecache.py" "$PP" --range 0 1 >/dev/null 2>&1; local inrange; inrange=$([ -f "$FR/f_00010.png" ] && echo 1 || echo 0)
  rm -f "$FR"/f_*.png; echo "$left $inrange"; }
read left inr < <(stale "$TOOL"); echo "  새 길이 뒤 남은 옛 프레임 $left · --range 안 남음 $inr"
[ "$left" = 0 ] && [ "$inr" = 0 ] && ok "길이 뒤 옛 프레임 0 · 구간 프레임 지움" || bad "새 길이 뒤 $left · 구간 $inr"
mutant; python3 - "$W/tool/lib/scenecache.py" <<'EOF'
import sys; p = sys.argv[1]; s = open(p).read(); a = 'int(p.stem[2:]) >= count]'; b = 'ks.update(range(max(0, round(a.range[0] * a.fps) - 1), round(a.range[1] * a.fps) + 2))'
assert a in s and b in s; open(p, "w").write(s.replace(a, 'False]').replace(b, 'pass'))
EOF
read left inr < <(stale "$W/tool"); echo "  되돌림 남은 옛 프레임 $left · 구간 남음 $inr"
[ "$left" = 3 ] && [ "$inr" = 1 ] && ok "되돌림(뒤·구간 안 지움) → 옛 프레임 $left · 구간 $inr(잡힘)" || bad "되돌림인데 $left · $inr"

# 8) 끝 장면 뒤 빈 구간(total_s > 끝 장면 끝): 끝 장면이 바뀌면 그 구간 옛 프레임도 지움.
#    되돌림: 끝 장면 범위를 장면 길이까지만 → 빈 구간 프레임 남음
tailgap() { local T="$1" FR="$PP/build/frames" TL="$PP/build/timeline.json"; cp "$TL" "$W/tl8.keep"
  python3 - "$TL" <<'EOF'
import json, sys; p = sys.argv[1]; t = json.load(open(p)); t["total_s"] = round(t["total_s"] + 2.0, 4); json.dump(t, open(p, "w"))
EOF
  python3 "$T/lib/scenecache.py" "$PP" >/dev/null
  local last k; last=$(python3 -c "import json;t=json.load(open('$TL'));n=t['order'][-1];m=t['modules'][n];print(n, round((m['start']+m['duration'])*30)+20)")
  read last k <<< "$last"; : > "$FR/$(printf 'f_%05d.png' "$k")"
  echo "// t8" >> "$PP/scenes/$last/module.js"; python3 "$T/lib/scenecache.py" "$PP" >/dev/null
  local left; left=$([ -f "$FR/$(printf 'f_%05d.png' "$k")" ] && echo 1 || echo 0)
  sed -i '$ d' "$PP/scenes/$last/module.js"; cp "$W/tl8.keep" "$TL"; rm -f "$FR"/f_*.png; python3 "$T/lib/scenecache.py" "$PP" >/dev/null; echo "$left"; }
left=$(tailgap "$TOOL"); echo "  끝 장면 뒤 빈 구간 옛 프레임 남음 $left"
[ "$left" = 0 ] && ok "끝 장면 뒤 빈 구간 옛 프레임 지움" || bad "빈 구간 옛 프레임 남음"
mutant; python3 - "$W/tool/lib/scenecache.py" <<'EOF'
import sys; p = sys.argv[1]; s = open(p).read(); a = 'end = tl["total_s"] if i == len(order) - 1 else m["start"] + m["duration"]'
assert a in s; open(p, "w").write(s.replace(a, 'end = m["start"] + m["duration"]'))
EOF
left=$(tailgap "$W/tool"); echo "  되돌림 빈 구간 옛 프레임 남음 $left"
[ "$left" = 1 ] && ok "되돌림(끝 장면 = 장면 길이까지) → 옛 프레임 남음(잡힘)" || bad "되돌림인데 남음 $left"

echo "통과 $pass · 실패 $fail · 건너뜀 $skip"
if [ $fail -gt 0 ]; then echo "RV_BEST_TESTS FAIL"; exit 1; elif [ $skip -gt 0 ]; then echo "RV_BEST_TESTS PARTIAL"; exit 0; else echo "RV_BEST_TESTS PASS"; fi
