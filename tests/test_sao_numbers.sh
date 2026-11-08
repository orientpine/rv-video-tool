#!/bin/bash
# 공용 rv 회귀 검사: 지금 도구는 PASS, 고침만 되돌린 사본은 FAIL 이어야 한다.
#   bash tests/test_sao_numbers.sh        → 마지막 줄 SAO_NUMBERS PASS
#   RV_TEST_PROJECT=<look 켠 프로젝트> (기본: 합성 작업장 tests/project)
# ① look cinema SAO: 바깥 장면 하늘(scene.background 색 · 260 m 하늘 돔)이 AO 를 켜도 AO 끈 것과 같고(±2), 상자 옆 접촉 그림자는 남음
#    되돌림: 예전 look.js → 하늘이 검게(0,0,0)
#    반투명 유리판·거의 투명한 판·입자(Points·스프라이트)·additive 빛줄기 뒤는 AO 를 켜도 어두워지지 않고(어두워진 칸 ≤ 1 %),
#    불투명 상자 앞 모서리 그늘은 남음(≥ 5). 되돌림: 비치는 것을 AO 패스에 넣음 → 유리판이 검게(어두워진 칸 ≥ 30 %)
# ② check_numbers 토큰: "4,096대" "17만 명" "10 cm" "2.5초" "3억 원" 을 한 덩어리로, 표에 있으면 통과·한 글자 다르면 걸림
#    되돌림: 예전 TOKEN 식 → "4" + "096대" 등으로 쪼개 표에 있는 것도 걸림
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
mutant() { rm -rf "$W/tool"; cp -a "$TOOL" "$W/tool"; rm -rf "$W/tool/.git"; }

sao() {   # $1 도구 → "bg_on_off_diff dome_diff contact_drop glass clear dust beam crease_drop"
  (cd "$PP" && VIDEO_HTML="$W/sao.html" python3 "$1/lib/build.py" . >/dev/null 2>&1) || { echo "ERR"; return; }
  "${UVPW[@]}" "$TOOL/tests/look_sao_probe.py" "$W/sao.html" "$TOOL/lib" | python3 -c "
import json,sys; r=json.loads(sys.stdin.read().strip().splitlines()[-1]); assert not r['errors'], r['errors']
d=lambda k: max(abs(a-b) for a,b in zip(r[k]['on'], r[k]['off']))
s=r['see']
print(d('bg'), d('dome'), round(r['contact']['off']-r['contact']['on'],2), s['glass'], s['clear'], s['dust'], s['beam'], round(s['crease']['off']-s['crease']['on'],2))"; }
read b d c gl cl du be cr < <(sao "$TOOL"); echo "  하늘 차이(배경 색) $b · (하늘 돔) $d · 접촉 그림자 $c"
[ "$b" != ERR ] && [ "${b:-99}" -le 2 ] && [ "${d:-99}" -le 2 ] && ok "AO 켜도 하늘 그대로" || bad "AO 가 하늘을 바꿈 ($b, $d)"
awk -v c="${c:-0}" 'BEGIN{exit !(c >= 5)}' && ok "접촉 그림자는 남음 (≥ 5)" || bad "접촉 그림자 사라짐 ($c)"
echo "  비치는 것 뒤 어두워진 칸: 유리판 $gl · 투명판 $cl · 입자 $du · 빛줄기 $be · 상자 모서리 그늘 $cr"
awk -v a="${gl:-1}" -v b="${cl:-1}" -v c="${du:-1}" -v e="${be:-1}" 'BEGIN{exit !(a <= .01 && b <= .01 && c <= .01 && e <= .01)}' \
  && ok "반투명·입자·빛줄기 뒤 검은 AO 없음 (≤ 1 %)" || bad "비치는 것 뒤가 AO 로 어두움 ($gl $cl $du $be)"
awk -v c="${cr:-0}" 'BEGIN{exit !(c >= 5)}' && ok "불투명 상자 모서리 그늘은 남음 (≥ 5)" || bad "모서리 그늘 사라짐 ($cr)"
mutant; python3 - "$W/tool/kit/look.js" <<'EOF'
import sys; p = sys.argv[1]; s = open(p).read()
s2 = s.replace("for (const o of hid) o.visible = false;", "")
assert s2 != s, "mutation not applied"; open(p, "w").write(s2)
EOF
read b d c gl cl du be cr < <(sao "$W/tool"); echo "  되돌림 유리판 $gl · 투명판 $cl · 입자 $du · 빛줄기 $be"
[ "$b" != ERR ] && awk -v a="${gl:-0}" 'BEGIN{exit !(a >= .3)}' && ok "되돌림(비치는 것도 AO 패스에) → 유리판 검게(잡힘)" || bad "되돌림인데 유리판 $gl"
mutant; python3 - "$W/tool/kit/look.js" <<'EOF'
import re, sys; p = sys.argv[1]; s = open(p).read()
s2 = re.sub(r"\n      // 빈 곳·먼 곳은 AO 에서 뺀다.*?sm\.needsUpdate = true;", "", s, flags=re.S)
assert s2 != s, "mutation not applied"; open(p, "w").write(s2)
EOF
read b d c < <(sao "$W/tool"); echo "  되돌림 하늘 차이 $b · $d"
[ "$b" != ERR ] && [ "${b:-0}" -ge 50 ] && ok "되돌림(깊이 끝 안 뺌) → 하늘 검게(잡힘)" || bad "되돌림인데 하늘 차이 $b"

nums() {   # $1 도구 lib → 걸린 토큰 수(표에 있는 줄) / 걸린 토큰 수(한 글자 다른 줄)
  RV_LIB="$1" python3 - <<'EOF'
import json, os, sys, tempfile
from pathlib import Path
sys.path.insert(0, os.environ["RV_LIB"]); import check_numbers as cn
d = Path(tempfile.mkdtemp())
(d / "sources.json").write_text(json.dumps({"numbers": [{"id": "x", "kind": "design", "show": ["4,096대", "17만 명", "10 cm", "2.5초", "3억 원"]}]}, ensure_ascii=False))
good = "장비 4,096대를 17만 명이 10 cm 앞에서 2.5초 만에 3억 원으로."
badl = "장비 4,097대를 18만 명이 11 cm 앞에서."
(d / "script.json").write_text(json.dumps({"lines": [{"scene": "a", "text": good}]}, ensure_ascii=False))
g = cn.check_say(d, cn.table(d))
(d / "script.json").write_text(json.dumps({"lines": [{"scene": "a", "text": badl}]}, ensure_ascii=False))
b = cn.check_say(d, cn.table(d))
print(len(g), len(b), "|".join(x[2] for x in g + b))
EOF
}
read g b toks < <(nums "$TOOL/lib"); echo "  표에 있는 줄 걸림 $g · 다른 줄 걸림 $b ($toks)"
[ "$g" = 0 ] && ok "쉼표·만·단위 숫자를 한 덩어리로 읽어 표와 맞음" || bad "표에 있는데 걸림 $g ($toks)"
[ "$b" = 3 ] && ok "한 글자 다른 숫자 3개는 걸림" || bad "다른 숫자 걸림 $b (3 이어야)"
mutant; python3 - "$W/tool/lib/check_numbers.py" <<'EOF'
import sys; p = sys.argv[1]; s = open(p, encoding="utf-8").read().split("\n")
i = [k for k, l in enumerate(s) if l.startswith("TOKEN = re.compile(")][0]
s[i] = 'TOKEN = re.compile(r"\\d+천분의\\s*\\d+|\\d+/\\d+|\\d+(?:\\.\\d+)?(?:\\s*~\\s*\\d+(?:\\.\\d+)?)?\\s*(?:mTorr|mm|도|°|일|번|회|대|층|개|%|kW|rpm)?")'
open(p, "w", encoding="utf-8").write("\n".join(s))
EOF
read g b toks < <(nums "$W/tool/lib"); echo "  되돌림 표에 있는 줄 걸림 $g ($toks)"
[ "${g:-0}" -gt 0 ] && ok "되돌림(예전 TOKEN) → 표에 있는 숫자도 쪼개져 걸림(잡힘)" || bad "되돌림인데 안 걸림"

echo "통과 $pass · 실패 $fail"
[ $fail = 0 ] && echo "SAO_NUMBERS PASS" || { echo "SAO_NUMBERS FAIL"; exit 1; }
