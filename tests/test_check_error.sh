#!/bin/bash
# A checker that crashes (Traceback, page error) must not count as a pass in rv checks.
# Real rv, stub checkers like test_sfx_cue_skip.sh; check_motion's stub crashes.
#   bash tests/test_check_error.sh   -> CHECK_ERROR_TESTS PASS. Reverting the crash detection in run() must FAIL this test.
set -u
TOOL="$(cd "$(dirname "$0")/.." && pwd)"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fail=0
mk_tool() {   # mk_tool <dir> <rv file>
  mkdir -p "$1/lib"; cp "$2" "$1/rv"; cp "$TOOL/lib/mix.py" "$TOOL/lib/check_audio.py" "$1/lib/"
  for f in check_cuts check_flicker sync_check check_clearance check_captions sheet check_layout check_numbers cutlist check_sharp check_human check_quality; do
    printf 'import sys\nm = any(x == "--mutate" or "/mut_" in x for x in sys.argv)\nprint("MUTATION_CAUGHT" if m else "STUB PASS")\nsys.exit(1 if m else 0)\n' > "$1/lib/$f.py"
  done
  printf 'import sys\nif any(x == "--mutate" for x in sys.argv):\n    print("MUTATION_CAUGHT"); sys.exit(1)\nraise TypeError("Cannot read properties of undefined (reading rotation)")\n' > "$1/lib/check_motion.py"
}
mkdir -p "$T/bin"; printf '#!/bin/bash\nshift; while [ "$1" != python ] && [ $# -gt 0 ]; do shift; done; shift; exec python3 "$@"\n' > "$T/bin/uv"; chmod +x "$T/bin/uv"
P="$T/p"; mkdir -p "$P/build" "$P/out"
echo '{"name": "t"}' > "$P/script.json"
echo '{"total_s": 6.0, "order": ["a"], "modules": {"a": {"start": 0, "duration": 6}}}' > "$P/build/timeline.json"
ffmpeg -nostdin -v error -y -f lavfi -i testsrc=d=6:s=64x36:r=30 -f lavfi -i sine=frequency=440:duration=6 -c:v libx264 -c:a aac -shortest "$P/out/t.mp4"
printf '1\n00:00:00,000 --> 00:00:06,000\nx\n\n' > "$P/out/t.srt"
run_case() {   # run_case <name> <rv file> -> prints verdict line, sets $R
  mk_tool "$T/$1" "$2"; PATH="$T/bin:$PATH" bash "$T/$1/rv" check "$P" > "$T/$1.txt" 2>&1; R="$P/out/CHECKS.md"; cp "$R" "$T/$1.CHECKS.md"; tail -1 "$R"; }
v=$(run_case cur "$TOOL/rv"); echo "  지금 판: $v · $(grep -c CHECK_ERROR "$T/cur.CHECKS.md") CHECK_ERROR"
if [ "$v" = "RV_CHECKS FAIL" ] && grep -q CHECK_ERROR "$T/cur.CHECKS.md"; then echo "PASS 죽은 검사기 → CHECK_ERROR · RV_CHECKS FAIL"; else echo "FAIL 죽은 검사기인데 $v"; fail=1; fi
python3 - "$TOOL/rv" "$T/rv.mut" <<'EOF'
import sys; s = open(sys.argv[1]).read()
old = 'if grep -Eq "$CRASH_RE" "$tmp"; then'
assert old in s, "mutation not applied"; open(sys.argv[2], "w").write(s.replace(old, 'if false; then', 1))
EOF
v=$(run_case mut "$T/rv.mut"); echo "  되돌림 판: $v"
if [ "$v" = "RV_CHECKS PASS" ]; then echo "PASS 되돌림(오류 감지 뺌) → 죽은 검사가 PASS 로 셈(잡힘)"; else echo "FAIL 되돌림인데 $v (시험이 오류 감지를 안 봄)"; fail=1; fi
grep -q "MUTATION_CAUGHT" "$T/cur.CHECKS.md" && grep -A3 "변이" "$T/cur.CHECKS.md" | grep -q "STUB\|MUTATION" && echo "PASS 변이 출력이 CHECKS.md 에 남음" || { echo "FAIL 변이 출력이 CHECKS.md 에 없음"; fail=1; }
[ $fail = 0 ] && echo "CHECK_ERROR_TESTS PASS" || { echo "CHECK_ERROR_TESTS FAIL"; exit 1; }
