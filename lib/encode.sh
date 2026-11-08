#!/usr/bin/env bash
# Encode numbered frames with an optional padded audio track.
set -euo pipefail
FFMPEG=$(command -v ffmpeg)
HERE=$(cd "$(dirname "$0")" && pwd)
OUTDIR="$HERE/out"
FRAMES="$HERE/frames"
FPS=30
AUDIO="$HERE/out/narration.wav"
NAME="가상센싱_설명_60s"
CRF=18
COUNT=""
FADE=0
while (( $# )); do
  case "$1" in
    --outdir) OUTDIR="$2"; shift 2 ;;
    --frames) FRAMES="$2"; shift 2 ;;
    --fps) FPS="$2"; shift 2 ;;
    --audio) AUDIO="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --crf) CRF="$2"; shift 2 ;;
    --count) COUNT="$2"; shift 2 ;;
    --fade) FADE=1; shift ;;
    *) echo "지원하지 않는 옵션: $1" >&2; exit 2 ;;
  esac
done
N=$(ls "$FRAMES" | grep -Ec '^f_[0-9]{5}\.png$' || true)
N=${COUNT:-$N}
if (( N <= 0 )); then
  echo "입력 프레임을 찾지 못했습니다: $FRAMES" >&2
  exit 1
fi
LAST=$(printf 'f_%05d.png' "$((N - 1))")
if [[ ! -f "$FRAMES/f_00000.png" || ! -f "$FRAMES/$LAST" ]]; then
  echo "시작 번호 0의 필수 양끝 프레임 누락 (f_00000 ~ $LAST)" >&2
  exit 1
fi
DURATION=$(awk -v n="$N" -v fps="$FPS" 'BEGIN {printf "%.6f", n/fps}')
mkdir -p "${OUTDIR}"
echo "인코딩 입력: $N 장 · $FPS fps · $DURATION s"
VIDEO="scale=out_color_matrix=bt709"
SOUND="apad,atrim=0:$DURATION"
if (( FADE )); then
  END=$(awk -v d="$DURATION" 'BEGIN {printf "%.6f", d-0.5}')
  VIDEO+=",fade=t=in:st=0:d=0.5,fade=t=out:st=$END:d=0.5"
  SOUND+=",afade=t=in:st=0:d=0.5,afade=t=out:st=$END:d=0.5"
fi
VIDEO+=",format=yuv420p"
SOUND+=",aresample=48000"
SETTINGS=(-c:v libx264 -preset slow -crf "$CRF" -profile:v high -level:v 4.1
  -g "$((FPS * 2))" -tag:v avc1 -color_primaries bt709 -color_trc bt709
  -colorspace bt709 -movflags +faststart)
printf -v SILENT '%s/%s_무음.mp4' "$OUTDIR" "$NAME"
"$FFMPEG" -nostdin -y -v error -stats -framerate "$FPS" -start_number 0 \
  -i "$FRAMES/f_%05d.png" -vf "$VIDEO" "${SETTINGS[@]}" -an -t "$DURATION" "$SILENT"
echo "영상 저장: $SILENT"
if [[ -f "$AUDIO" ]]; then
  OUTPUT="$OUTDIR/$NAME.mp4"
  "$FFMPEG" -nostdin -y -v error -stats -framerate "$FPS" -start_number 0 \
    -i "$FRAMES/f_%05d.png" -i "$AUDIO" \
    -filter_complex "[0:v]$VIDEO[v];[1:a]$SOUND[a]" -map '[v]' -map '[a]' \
    "${SETTINGS[@]}" -c:a aac -b:a 192k -ar 48000 -t "$DURATION" "$OUTPUT"
  echo "영상 저장: $OUTPUT"
else
  echo "오디오 입력 없음, 무음 영상만 저장했습니다: $AUDIO"
fi
