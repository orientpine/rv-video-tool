#!/bin/bash
set -u
TOOL="$(cd "$(dirname "$0")/.." && pwd)"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mk_tool() {
  mkdir -p "$1/lib"; cp "$2" "$1/rv"
  for f in check_cuts check_flicker sync_check check_clearance check_captions sheet check_layout check_numbers cutlist check_sharp check_human check_motion check_audio mix check_quality; do
    cat > "$1/lib/$f.py" <<EOF
import random, sys, time
time.sleep(random.random() * .3)
name = "$f"
mut = any(x == "--mutate" or "/mut_" in x for x in sys.argv)
print("STUB", name, " ".join(a for a in sys.argv[1:] if not a.startswith("/")))
extra = {"check_clearance": "CLEARANCE_TARGETS attach=1 human=1 seat=1 auto=0 machine=0",
         "check_human": "HUMAN_COUNT rvHuman=1",
         "check_motion": "CAMERA_UI scene=a total=2 exempted=0 unmeasured=0 caught=0\nCAMERA_TRANSITION scene=a\nACTION_SPAN a x PASS\nACTION_MATCH a x PASS m"}
print(extra.get(name, ""))
print("MUTATION_CAUGHT" if mut else "STUB PASS")
sys.exit(1 if mut else 0)
EOF
  done
}
mkdir -p "$T/bin"; printf '#!/bin/bash\nshift; while [ "$1" != python ] && [ $# -gt 0 ]; do shift; done; shift; exec python3 "$@"\n' > "$T/bin/uv"; chmod +x "$T/bin/uv"
P="$T/p"; mkdir -p "$P/build" "$P/out"
echo '{"name": "t", "checks": "strict"}' > "$P/script.json"
echo '{"total_s": 4.0, "order": ["a"], "modules": {"a": {"start": 0, "duration": 4}}}' > "$P/build/timeline.json"
ffmpeg -nostdin -v error -y -f lavfi -i testsrc=d=4:s=64x36:r=30 -f lavfi -i sine=frequency=440:duration=4 -c:v libx264 -c:a aac -shortest "$P/out/t.mp4"
printf '1\n00:00:00,000 --> 00:00:04,000\nx\n\n' > "$P/out/t.srt"
run() { mk_tool "$T/$1" "$2"; RV_CHECK_JOBS=$3 PATH="$T/bin:$PATH" bash "$T/$1/rv" check "$P" > "$T/$1.txt" 2>&1; tail -n +2 "$P/out/CHECKS.md" > "$T/$1.md"; }
fail=0
run serial "$TOOL/rv" 1
run par "$TOOL/rv" 6
echo "  하나씩 $(grep -c '^## ' "$T/serial.md") 절 · 동시 $(grep -c '^## ' "$T/par.md") 절 · 판정 $(tail -1 "$T/serial.md") / $(tail -1 "$T/par.md")"
if cmp -s "$T/serial.md" "$T/par.md" && [ "$(tail -1 "$T/par.md")" = "RV_CHECKS PASS" ]; then echo "PASS 동시 6 = 하나씩, CHECKS.md 바이트 같음"; else echo "FAIL 동시판 CHECKS.md 가 다름"; diff "$T/serial.md" "$T/par.md" | head -20; fail=1; fi
python3 - "$TOOL/rv" "$T/rv.mut" <<'EOF'
import sys; s = open(sys.argv[1]).read(); old = '( SUBS=(); R="$SEC/$id.md"'
assert s.count(old) == 2, "mutation not applied"; open(sys.argv[2], "w").write(s.replace(old, '( R="$SEC/$id.md"'))
EOF
run mut "$T/rv.mut" 6
if cmp -s "$T/serial.md" "$T/mut.md"; then echo "FAIL 되돌림(안쪽 묶음이 바깥 목록 물려받음)인데 같음 — 시험이 이어 붙이기를 안 봄"; fail=1; else echo "PASS 되돌림 → $(grep -c '^## ' "$T/mut.md") 절, 다름(잡힘)"; fi
[ $fail = 0 ] && echo "RV_PARALLEL_TESTS PASS" || { echo "RV_PARALLEL_TESTS FAIL"; exit 1; }
