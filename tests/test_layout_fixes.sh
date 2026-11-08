#!/bin/bash
# 공용 rv 배치 회귀 검사: 지금 도구는 PASS, 고침만 되돌린 사본은 FAIL 이어야 한다.
#   bash tests/test_layout_fixes.sh        → 마지막 줄 LAYOUT_FIXES PASS
#   RV_TEST_PROJECT=<프로젝트> (기본: 합성 작업장 tests/project, 단계 칩이 있는 것)
# ① 단계 칩이 나타나는 중(열리기 시작한 뒤 0.2 s, 들어오는 전환 끝 뒤로 미뤄진 때를 화면에서 찾음) 칩 글자 대비 ≥ 4.5 — 되돌림: 묶음 불투명도 페이드 → 어두운 장면과 섞여 contrast FAIL
# ② KIT.label 을 위 130 px 에 가둘 때 실제 상자 위끝 ≥ 130 — 되돌림: 반올림 offsetHeight + 안쪽 반올림 없는 가두기 → 129.8 (safe 위반)
# ③ 왼쪽 가두기: 소수 폭 상자(글 5개 × 30~40 px) 가장 작은 왼끝 ≥ 40 — 되돌림: 안쪽 반올림 없는 가두기 → 안전 영역 위반
set -uo pipefail
TOOL="$(cd "$(dirname "$0")/.." && pwd)"
P="${RV_TEST_PROJECT:-$TOOL/tests/project}"
[ "$P" != "$TOOL/tests/project" ] || python3 "$TOOL/tests/prepare_project.py"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
UVPW=(uv run -q --no-project --with playwright --with pillow python)
pass=0; fail=0
ok()  { echo "PASS $1"; pass=$((pass+1)); }
bad() { echo "FAIL $1"; fail=$((fail+1)); }
mkdir -p "$W/p/final" "$W/p/test-video/shared"; cp -a "$P" "$W/p/final/project"; PP="$W/p/final/project"
[ -f "$P/../../test-video/shared/rig.js" ] && cp "$P/../../test-video/shared/rig.js" "$W/p/test-video/shared/"
rm -rf "$PP/build/frames" "$PP/build/stills" "$PP"/build/clip_* "$PP"/build/frames_clip "$PP"/build/stems*
LABELS=$(python3 -c "import json;s=json.load(open('$PP/build/timeline.json'))['steps'];print('|'.join(sorted({x['label'] for x in s})))")

html() { (cd "$PP" && VIDEO_HTML="$W/$2.html" python3 "$1/lib/build.py" . >/dev/null 2>&1) && echo "$W/$2.html"; }
chip_contrast_failures() {
  "${UVPW[@]}" "$1/lib/check_layout.py" "$2" --at "$T_MID" > "$W/layout_$3.log" 2>&1
  grep -q "LAYOUT_CHECK" "$W/layout_$3.log" || { echo "ERR"; return; }
  grep -E "\| contrast \|" "$W/layout_$3.log" | grep -cE "\| ($LABELS) \|" || true; }
label_top() {
  "${UVPW[@]}" - "$1" "$TOOL/lib" <<'EOF'
import asyncio, sys
from pathlib import Path
sys.path.insert(0, sys.argv[2])
from capture import CHROME, CHROME_ARGS
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS); p = await b.new_page(viewport={"width": 1920, "height": 1080})
        await p.goto(Path(sys.argv[1]).resolve().as_uri(), wait_until="load"); await p.evaluate("Promise.resolve(window.renderReady)")
        print(await p.evaluate("""() => { const ov = document.createElement('div'); ov.style.cssText='position:absolute;left:0;top:0;width:1920px;height:1080px';
          document.body.append(ov); const l = KIT.label(ov, '상자를 선반 위에'); const cam = new THREE.PerspectiveCamera(50, 16/9, .1, 100);
          cam.position.set(0, 0, 5); cam.updateMatrixWorld(); l.place(cam, new THREE.Vector3(0, 0, 0), 0, -800, 1);
          const r = l.box.getBoundingClientRect(); let left = 1e9;
          for (const text of ['상자 배치', '상자를 선반 위에', '상자 놓이는 곳', '작은 파란 상자 + 큰 상자 (2개)', 'X 상자']) for (let size = 30; size <= 40; size += 0.5) {
            const e = KIT.label(ov, text, {size}); e.place(cam, new THREE.Vector3(0, 0, 0), -3000, 0, 1); left = Math.min(left, e.box.getBoundingClientRect().left); e.box.remove(); }
          return r.top.toFixed(3) + ' ' + r.height.toFixed(3) + ' ' + left.toFixed(4); }"""))
        await b.close()
asyncio.run(main())
EOF
}
mutant() { rm -rf "$W/tool"; cp -a "$TOOL" "$W/tool"; rm -rf "$W/tool/.git"; }
chip_opening_t() {
  "${UVPW[@]}" - "$1" "$TOOL/lib" "$2" <<'EOF'
import asyncio, sys
from pathlib import Path
sys.path.insert(0, sys.argv[2])
from capture import CHROME, CHROME_ARGS
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS); p = await b.new_page(viewport={"width": 1920, "height": 1080})
        await p.goto(Path(sys.argv[1]).resolve().as_uri(), wait_until="load"); await p.evaluate("Promise.resolve(window.renderReady)")
        t = float(sys.argv[3]) - 0.4
        while t < float(sys.argv[3]) + 4:
            await p.evaluate("t => window.renderAt(t)", t)
            if await p.evaluate("() => getComputedStyle(document.getElementById('steps')).opacity === '1'"):
                print(f"{t + 0.2:.3f}"); break
            t += 1 / 30
        await b.close()
asyncio.run(main())
EOF
}

H=$(html "$TOOL" cur) || { echo "FAIL 빌드"; echo "LAYOUT_FIXES FAIL"; exit 1; }
FIRST=$(python3 -c "import json;s=json.load(open('$PP/build/timeline.json'))['steps'];print(min(x['start'] for x in s))")
T_MID=$(chip_opening_t "$H" "$FIRST")
[ -n "$T_MID" ] || { echo "FAIL 단계 칩이 첫 단계 뒤 4 s 안에 안 열림"; echo "LAYOUT_FIXES FAIL"; exit 1; }
n=$(chip_contrast_failures "$TOOL" "$H" cur); echo "  칩 대비 실패(t=$T_MID) $n"
[ "$n" = 0 ] && ok "단계 칩 나타나는 중 대비" || bad "단계 칩 나타나는 중 대비 ($n, $W/layout_cur.log)"
mutant; python3 - "$W/tool/kit/shell.html" <<'EOF'
import re, sys; p = sys.argv[1]; s = open(p).read()
s2, count = re.subn(r'stepsEl\.style\.opacity = String\(Number\(reveal > 0\)\);\n\s*stepsEl\.style\.clipPath = [^\n]*', 'stepsEl.style.opacity = reveal.toFixed(3);', s)
assert count == 1, "chip opacity mutation target must occur once"
assert s2 != s, "mutation not applied"; open(p, "w").write(s2)
print("MUTATION_APPLIED chip opacity fade")
EOF
HM=$(html "$W/tool" mut_chip); n=$(chip_contrast_failures "$W/tool" "$HM" mut); echo "  되돌림 칩 대비 실패 $n"
[ "$n" != 0 ] && [ "$n" != ERR ] && ok "되돌림(불투명도 페이드) → 칩 대비 FAIL(잡힘)" || bad "되돌림인데 칩 대비 통과"

read top h left < <(label_top "$H"); echo "  이름표 위끝 $top 높이 $h 왼끝 $left"
awk -v t="$left" 'BEGIN{exit !(t >= 40 - 1e-6)}' && ok "이름표 왼끝 ≥ 40(소수 폭 글 5 × 크기 21)" || bad "이름표 왼끝 $left < 40"
awk -v t="$top" 'BEGIN{exit !(t >= 130 - 1e-6)}' && ok "이름표 위끝 ≥ 130" || bad "이름표 위끝 $top < 130"
mutant
python3 - "$W/tool/kit/scene_kit.js" <<'EOF'
import sys; p = sys.argv[1]; s = open(p).read()
measurement = 'const measured = textNode.getBoundingClientRect(), width = measured.width || 200, height = measured.height || 50;'
assert measurement in s
assert s.count(measurement) == 1, "fractional measurement target must occur once"
s = s.replace(measurement, 'const width = textNode.offsetWidth || 200, height = textNode.offsetHeight || 50;', 1)
print("MUTATION_APPLIED rounded label measurement")
top = 'const textY = clamp(anchorY + offsetY, Math.ceil(130 + height + 0.5), Math.floor(870 - 0.5));'
assert top in s
assert s.count(top) == 1, "top clamp target must occur once"
open(p, "w").write(s.replace(top, 'const textY = clamp(anchorY + offsetY, 130 + height, 870);', 1))
print("MUTATION_APPLIED top inward rounding removed")
EOF
grep -q "height = textNode.offsetHeight" "$W/tool/kit/scene_kit.js" || bad "변이를 못 넣음"
HM=$(html "$W/tool" mut_label); read top h left < <(label_top "$HM"); echo "  되돌림 이름표 위끝 $top 높이 $h 왼끝 $left"
awk -v t="$top" 'BEGIN{exit !(t < 130 - 1e-6)}' && ok "되돌림(offsetHeight·안쪽 반올림 없음) → 위끝 < 130(잡힘)" || bad "되돌림인데 위끝 $top ≥ 130"
mutant; python3 - "$W/tool/kit/scene_kit.js" <<'EOF'
import sys; p = sys.argv[1]; s = open(p).read()
left = 'const textX = clamp(anchorX + offsetX, Math.ceil(40 + width / 2 + 0.5), Math.floor(1880 - width / 2 - 0.5));'
assert left in s
assert s.count(left) == 1, "left clamp target must occur once"
open(p, "w").write(s.replace(left, 'const textX = clamp(anchorX + offsetX, 40 + width / 2, 1880 - width / 2);', 1))
print("MUTATION_APPLIED left inward rounding removed")
EOF
HM=$(html "$W/tool" mut_edge); read top h left < <(label_top "$HM"); echo "  되돌림(안쪽 반올림 없음) 왼끝 $left"
awk -v t="$left" 'BEGIN{exit !(t < 40 - 1e-6)}' && ok "되돌림(안쪽 반올림 없음) → 왼끝 < 40(잡힘)" || bad "되돌림인데 왼끝 $left ≥ 40"

echo "통과 $pass · 실패 $fail"
[ $fail = 0 ] && echo "LAYOUT_FIXES PASS" || { echo "LAYOUT_FIXES FAIL"; exit 1; }
