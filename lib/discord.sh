#!/bin/bash
# 같은 해상도로 2패스 → LIMIT MiB 이하(기본 20, 여유 4%). 넘으면 비트레이트를 줄여 한 번 더.
#   lib/discord.sh in.mp4 out.mp4 [LIMIT_MIB] [--min-kbps 1200] [--timeline build/timeline.json]
# 화질 바닥(--min-kbps, 1080p30 영상 비트레이트): 한 파일로 넣으면 바닥 아래가 되는 긴 영상은 바닥 위가 되도록
# N 조각으로 나눈다 → out_part1.mp4 … out_partN.mp4 + out_parts.json(조각마다 시작·길이·크기). 조각 경계는
# 같은 몫 근처의 장면 경계(timeline)에 맞춘다. 측정 예: 4분 3초 영상이 한 파일 0.54 Mb/s 로 뭉개짐.
set -euo pipefail
IN="$1"; OUT="$2"; shift 2
LIM=20; MIN=1200; TL=""
if [ $# -gt 0 ] && [[ "$1" != --* ]]; then LIM="$1"; shift; fi
while [ $# -gt 0 ]; do case "$1" in --min-kbps) MIN="$2"; shift 2;; --timeline) TL="$2"; shift 2;; *) echo "모르는 인자 $1" >&2; exit 2;; esac; done
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
P="$(dirname "$OUT")/.2pass-$$"
BASE="${OUT%.mp4}"

enc() {   # enc <in> <out> <ss> <t>  → 한 파일 2패스, 크기 LIM 이하. 넘으면 비트레이트를 줄여 다시
  local in="$1" out="$2" ss="$3" t="$4" f V SZ
  for f in 0.96 0.90 0.82; do
    V=$(awk -v l="$LIM" -v d="$t" -v f="$f" 'BEGIN{printf "%d", (l*1048576*8*f/d - 128000)/1000}')
    ffmpeg -nostdin -v error -y -i "$in" -ss "$ss" -t "$t" -c:v libx264 -preset slow -b:v ${V}k -pass 1 -passlogfile "$P" -an -f mp4 /dev/null
    ffmpeg -nostdin -v error -y -i "$in" -ss "$ss" -t "$t" -c:v libx264 -preset slow -b:v ${V}k -pass 2 -passlogfile "$P" -profile:v high -pix_fmt yuv420p \
      -tag:v avc1 -movflags +faststart -c:a aac -b:a 128k "$out"
    SZ=$(stat -c %s "$out")
    if [ "$SZ" -le $((LIM*1048576)) ]; then rm -f "$P"*; echo "$V $SZ"; return 0; fi
  done
  rm -f "$P"*; echo "DISCORD 실패: $out $SZ B > $LIM MiB" >&2; return 1
}

N=$(awk -v l="$LIM" -v d="$DUR" -v m="$MIN" 'BEGIN{n=d*(m+128)*1000/(l*1048576*8*0.96); k=int(n); if (k<n) k++; if (k<1) k=1; print k}')
rm -f "$BASE"_part*.mp4 "$BASE"_parts.json
if [ "$N" -le 1 ]; then
  read -r V SZ < <(enc "$IN" "$OUT" 0 "$DUR")
  echo "DISCORD ${V}k → $SZ B (≤ $LIM MiB)"; exit 0
fi
rm -f "$OUT"   # 나눈 판만 남김(예전 한 파일이 남아 검사·발송에 섞이지 않게)
CUTS=$(python3 - "$DUR" "$N" "$TL" <<'EOF'
import json, sys
dur, n, tl = float(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
bounds = []
if tl:
    t = json.load(open(tl)); bounds = sorted(m["start"] for m in t["modules"].values() if m["start"] > 0)
cuts, prev = [0.0], 0.0
for k in range(1, n):
    want = dur * k / n
    near = [b for b in bounds if abs(b - want) <= 0.15 * dur / n and b > prev + 1]
    c = min(near, key=lambda b: abs(b - want)) if near else want
    c = round(c * 30) / 30   # 프레임 경계
    cuts.append(c); prev = c
cuts.append(dur)
print(" ".join(f"{c:.4f}" for c in cuts))
EOF
)
read -r -a C <<< "$CUTS"
echo "[" > "$BASE"_parts.json
for k in $(seq 1 "$N"); do
  S=${C[$((k-1))]}; E=${C[$k]}; T=$(awk -v a="$S" -v b="$E" 'BEGIN{printf "%.4f", b-a}')
  F="${BASE}_part${k}.mp4"
  read -r V SZ < <(enc "$IN" "$F" "$S" "$T")
  sep=","; [ "$k" = "$N" ] && sep=""
  printf '  {"file": "%s", "start": %s, "dur": %s, "bytes": %s, "kbps": %s}%s\n' "$(basename "$F")" "$S" "$T" "$SZ" "$V" "$sep" >> "$BASE"_parts.json
  echo "DISCORD part$k ${S}~${E} s ${V}k → $SZ B (≤ $LIM MiB)"
done
echo "]" >> "$BASE"_parts.json
echo "DISCORD_SPLIT $N 조각 (한 파일이면 $(awk -v l="$LIM" -v d="$DUR" 'BEGIN{printf "%d", (l*1048576*8*0.96/d - 128000)/1000}')k < 바닥 ${MIN}k) → ${BASE}_parts.json"
