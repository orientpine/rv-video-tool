#!/bin/bash
# rv 가 도는 중에 rv 파일이 제자리에서 바뀌어도 끝까지 도는지(본문을 main 으로 감싸 시작 때 다 읽는지) 시험.
#   bash tests/test_rv_live_edit.sh [rv 경로]     기본: 이 도구의 rv. 고침 전 판(main 없음)을 주면 FAIL 이어야 정상.
# 재현: rv 가 맨 위 단순 명령(NAME=$(python3 …))을 도는 동안 파일을 짧게 덮어쓰면, main 없는 판은 bash 가 옛 바이트 위치부터
# 새 파일을 읽어 짝이 안 맞아 "unexpected EOF" 로 죽는다. 가짜 python3 가 첫 호출에서 FIFO 로 '시작함'을 알리고 '계속'을 기다리므로
# 파일 교체는 반드시 그 순간에 일어난다(시간 맞추기 없음). lib 는 가짜(PASS 만 찍음)라 인터넷·GPU 없이 끝난다.
set -u
RV_SRC="${1:-$(cd "$(dirname "$0")/.." && pwd)/rv}"
REAL_PY="$(command -v python3)"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/tool/lib" "$T/bin" "$T/proj/build" "$T/proj/out"
cp "$RV_SRC" "$T/tool/rv"; chmod +x "$T/tool/rv"
mkfifo "$T/started" "$T/go"
for f in check_cuts check_flicker sync_check check_clearance check_captions sheet check_layout check_audio check_motion check_numbers; do printf 'print("STUB PASS")\n' > "$T/tool/lib/$f.py"; done
cat > "$T/bin/python3" <<EOF
#!/bin/bash
if [ ! -e "$T/once" ]; then : > "$T/once"; echo x > "$T/started"; read -r _ < "$T/go"; fi
exec "$REAL_PY" "\$@"
EOF
printf '#!/bin/bash\nshift; while [ "$1" != python ] && [ $# -gt 0 ]; do shift; done; shift; exec python3 "$@"\n' > "$T/bin/uv"
chmod +x "$T/bin/python3" "$T/bin/uv"
echo '{"name": "t"}' > "$T/proj/script.json"
echo '{"total_s": 1.0, "order": ["a"], "modules": {"a": {"start": 0, "duration": 1}}}' > "$T/proj/build/timeline.json"
ffmpeg -v error -f lavfi -i testsrc=d=1:s=64x36:r=30 -f lavfi -i anullsrc=r=48000:cl=stereo -t 1 -c:v libx264 -c:a aac -shortest "$T/proj/out/t.mp4"
printf '1\n00:00:00,000 --> 00:00:01,000\nx\n\n' > "$T/proj/out/t.srt"
PATH="$T/bin:$PATH" bash "$T/tool/rv" check "$T/proj" > "$T/out.txt" 2> "$T/err.txt" &
PID=$!
read -r _ < "$T/started"
{ head -1 "$RV_SRC"; grep -v '^#' "$RV_SRC"; } > "$T/new"     # 주석 줄을 빼 파일을 짧게(편집기·cat > 처럼 제자리 덮어쓰기)
cat "$T/new" > "$T/tool/rv"
echo go > "$T/go"
wait $PID; RC=$?
if grep -q "RV_CHECKS" "$T/out.txt" && ! grep -qiE "syntax error|unexpected" "$T/err.txt"; then
  echo "RV_LIVE_EDIT PASS (exit $RC, $(tail -1 "$T/proj/out/CHECKS.md"))"; exit 0
fi
echo "RV_LIVE_EDIT FAIL (exit $RC)"; tail -3 "$T/err.txt"; exit 1
