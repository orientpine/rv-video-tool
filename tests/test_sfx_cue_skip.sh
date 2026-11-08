#!/bin/bash
# 효과음 큐가 0개인 프로젝트(리그 없음·숫자 카드 없음)에서 "변이: 효과음 −25 dB" 가 MUTATION_NOT_CAUGHT(FAIL) 가 아니라
# SKIP 인지, 큐가 있으면 예전처럼 잡히는지 시험.
#   bash tests/test_sfx_cue_skip.sh [도구 폴더]     기본: 이 도구. 고침 전 판을 주면 "큐 0" 이 FAIL 이어야 정상.
# 진짜 rv · lib/mix.py · lib/check_audio.py 로 줄기를 만들고 rv check 를 돌린다. 브라우저가 필요한 검사(장면·글자·움직임 등)는
# 가짜(기본 PASS, --mutate 나 rv 가 만든 mut_*.mp4 면 MUTATION_CAUGHT + 종료 1)라 인터넷·GPU 없이 1분 안에 끝난다.
set -u
TOOL="$(cd "${1:-$(dirname "$0")/..}" && pwd)"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/tool/lib" "$T/bin"
cp "$TOOL/rv" "$T/tool/rv"; cp "$TOOL/lib/mix.py" "$TOOL/lib/check_audio.py" "$TOOL/lib/workers.py" "$T/tool/lib/"
for f in check_cuts check_flicker sync_check check_clearance check_captions sheet check_layout check_motion check_numbers cutlist check_sharp check_human check_quality; do
  printf 'import sys\nm = any(x == "--mutate" or "/mut_" in x for x in sys.argv)\nprint("MUTATION_CAUGHT" if m else "STUB PASS")\nsys.exit(1 if m else 0)\n' > "$T/tool/lib/$f.py"
done
printf '#!/bin/bash\nshift; while [ "$1" != python ] && [ $# -gt 0 ]; do shift; done; shift; exec python3 "$@"\n' > "$T/bin/uv"
chmod +x "$T/bin/uv"
fail=0
case_run() {   # case_run <이름> <cues_auto.json 내용> <기대: skip|caught>
  local name="$1" cues="$2" want="$3" P="$T/$1"
  mkdir -p "$P/build" "$P/out"
  echo '{"name": "t", "sound": {"music": "synth:ambient", "auto_cues": true}}' > "$P/script.json"
  echo '{"total_s": 6.0, "order": ["a"], "modules": {"a": {"start": 0, "duration": 6}}}' > "$P/build/timeline.json"
  echo "$cues" > "$P/build/cues_auto.json"
  # 말 비슷한 소리(배음 있는 220 Hz, 0.5~2.3 s · 3.2~5.0 s), 그 사이는 말 틈
  ffmpeg -nostdin -v error -y -f lavfi -i "aevalsrc='(between(t,0.5,2.3)+between(t,3.2,5.0))*0.2*(sin(2*PI*220*t)+0.5*sin(2*PI*440*t)+0.3*sin(2*PI*880*t)+0.2*sin(2*PI*1760*t))':s=48000:d=6" -ac 1 "$P/build/narration.wav"
  (cd "$P" && python3 "$T/tool/lib/mix.py" "$P" --narration build/narration.wav --out build/mix.wav > "$T/$name.mix.txt" 2>&1) \
    || { echo "SFX_CUE_SKIP $name MIX_ERROR"; cat "$T/$name.mix.txt"; fail=1; return; }
  ffmpeg -nostdin -v error -y -f lavfi -i testsrc=d=6:s=64x36:r=30 -i "$P/build/mix.wav" -c:v libx264 -c:a aac -b:a 192k -shortest "$P/out/t.mp4"
  printf '1\n00:00:00,000 --> 00:00:06,000\nx\n\n' > "$P/out/t.srt"
  PATH="$T/bin:$PATH" bash "$T/tool/rv" check "$P" > "$T/$name.rv.txt" 2>&1; local rc=$?
  local R="$P/out/CHECKS.md" sec
  sec=$(awk '/^## 변이: 효과음 −25 dB/{f=1;print;next} /^## /{f=0} f' "$R")
  local verdict; verdict=$(tail -1 "$R")
  if [ "$want" = skip ]; then
    if [ $rc = 0 ] && [ "$verdict" = "RV_CHECKS PASS" ] && grep -q "SFX_MUTATION SKIP no cues" <<<"$sec" && ! grep -q MUTATION_NOT_CAUGHT "$R"; then
      echo "SFX_CUE_SKIP $name PASS (큐 0 → $(grep -m1 'SFX_MUTATION' <<<"$sec"), $verdict)"
    else
      echo "SFX_CUE_SKIP $name FAIL (exit $rc, $verdict)"; echo "$sec" | head -12; fail=1
    fi
  else
    if [ $rc = 0 ] && [ "$verdict" = "RV_CHECKS PASS" ] && grep -qx "MUTATION_CAUGHT" <<<"$sec" && ! grep -q "SKIP" <<<"$sec"; then
      echo "SFX_CUE_SKIP $name PASS (큐 있음 → 효과음 −25 dB MUTATION_CAUGHT, $verdict)"
    else
      echo "SFX_CUE_SKIP $name FAIL (exit $rc, $verdict)"; echo "$sec" | head -12; fail=1
    fi
  fi
}
case_run no_cues '{"cues": []}' skip
case_run one_cue '{"cues": [{"t": 2.6, "sfx": "click", "why": "test"}]}' caught
if [ $fail = 0 ]; then echo "SFX_CUE_SKIP_TESTS PASS 2/2"; else echo "SFX_CUE_SKIP_TESTS FAIL"; exit 1; fi
