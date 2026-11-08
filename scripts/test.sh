#!/usr/bin/env bash
# Runs every rv test from the repository root and prints one line per test:
#   TEST <name> exit=<code> last=<last line of its log>
# then RV_TESTS PASS (all exit 0) or RV_TESTS FAIL <names>. Logs go to ${RV_TEST_LOGS:-$TMPDIR/rv-test-logs}.
#   bash scripts/test.sh [name ...]     run only the named tests (file name without test_ and extension)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOGS="${RV_TEST_LOGS:-${TMPDIR:-/tmp}/rv-test-logs}"
mkdir -p "$LOGS"
PW=(uv run -q --no-project --with playwright --with pillow --with numpy python)
TTS=(uv run -q --no-project --with edge-tts python)

failed=()
ran=0
run() {
  local name="$1"; shift
  if [[ ${#ONLY[@]} -gt 0 && ! " ${ONLY[*]} " =~ " $name " ]]; then return; fi
  ran=$((ran + 1))
  "$@" > "$LOGS/$name.log" 2>&1
  local code=$?
  printf 'TEST %s exit=%s last=%s\n' "$name" "$code" "$(tail -n 1 "$LOGS/$name.log")"
  [[ $code == 0 ]] || failed+=("$name")
}

ONLY=("$@")
for f in tests/test_*.sh; do
  n="$(basename "$f" .sh)"; run "${n#test_}" bash "$f"
done
for f in tests/test_*.py; do
  n="$(basename "$f" .py)"
  case "$n" in
    test_timeline_*) run "${n#test_}" "${TTS[@]}" "$f" ;;
    *)               run "${n#test_}" "${PW[@]}" "$f" ;;
  esac
done

if [[ $ran == 0 ]]; then echo "RV_TESTS FAIL no test matched: ${ONLY[*]}"; exit 1; fi
if [[ ${#failed[@]} == 0 ]]; then echo "RV_TESTS PASS ($ran)"; else echo "RV_TESTS FAIL ${failed[*]}"; exit 1; fi
