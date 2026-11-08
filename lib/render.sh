#!/bin/bash
# 캡처 → 인코딩 → 깜빡임 검사 → 걸린 프레임만 다시 찍기(최대 2번) → 다시 인코딩. 예약된 작업 슬롯 안에서 rv make 가 부른다.
#   lib/render.sh <video.html> <frames> <N> <narration.wav> <outdir> <name> <jobs> <from> <to>
# 이 PC(GB10 ANGLE)에서 드물게 한 프레임이 덜 그려진 채 찍힌다(측정 예: 프레임 1215: 물체가 납작하게 검게,
# 같은 t 를 다시 그리면 정상). 다시 찍어도 남는 깜빡임은 장면 문제이므로 그대로 FAIL 로 둔다.
set -euo pipefail
L="$(cd "$(dirname "$0")" && pwd)"
HTML="$1"; FR="$2"; N="$3"; AUD="$4"; OUT="$5"; NAME="$6"; JOBS="$7"; FROM="$8"; TO="$9"
UVPW=(uv run -q --no-project --with playwright --with pillow python)
"${UVPW[@]}" "$L/capture.py" "$HTML" --fps 30 --start "$FROM" --end "$TO" --jobs "$JOBS" --out "$FR" --skip-existing   # 바뀐 장면만: rv make 가 지운 프레임만 찍힘
TLJ="$(dirname "$HTML")/timeline.json"
python3 "$L/xfade.py" "$FR" "$TLJ"   # 장면 경계 크로스페이드(crossfade_s > 0 일 때만, 프레임에서 결정론적으로)
for round in 1 2; do
  "$L/encode.sh" --frames "$FR" --count "$N" --audio "$AUD" --outdir "$OUT" --name "$NAME"
  LOG=$(uv run -q --no-project --with numpy python "$L/check_flicker.py" "$OUT/${NAME}_무음.mp4" || true)
  echo "$LOG" | tail -3
  BAD=$(echo "$LOG" | sed -n 's/.*(프레임 \([0-9]*\)) \([12]\)프레임 튐.*/\1 \2/p' | awk '{for(k=0;k<$2;k++) printf "%d,", $1+k}')
  [ -z "$BAD" ] && { echo "RENDER_FLICKER_CLEAN round $round"; exit 0; }
  echo "RENDER_RECAPTURE round $round frames ${BAD%,}"
  for f in ${BAD//,/ }; do rm -f "$FR/$(printf 'f_%05d.png' "$f")"; done
  "${UVPW[@]}" "$L/capture.py" "$HTML" --fps 30 --frames "${BAD%,}" --jobs 1 --out "$FR"
  python3 "$L/xfade.py" "$FR" "$TLJ"
done
"$L/encode.sh" --frames "$FR" --count "$N" --audio "$AUD" --outdir "$OUT" --name "$NAME"
echo "RENDER_FLICKER_REMAINS (검사 단계에서 FAIL 로 보고됨)"
