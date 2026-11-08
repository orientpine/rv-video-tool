#!/usr/bin/env bash
# Baseline findings are evidence, not a reason to weaken the checks.
# A mutation must exit 1, emit its checker FAIL, and identify MUTATION_CAUGHT.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${PROJECT:-$ROOT/tests/project}"
[ "$PROJECT" != "$ROOT/tests/project" ] || python3 "$ROOT/tests/prepare_project.py"
EVIDENCE="${EVIDENCE:-$ROOT/tests/project/build/checks}"
# Chromium's Unix socket must fit sockaddr_un even in a deeply nested checkout.
if [[ -z "${TMPDIR:-}" ]]; then
  export TMPDIR="$(mktemp -d /tmp/rv-checks.XXXXXX)"
  trap 'rm -rf "$TMPDIR"' EXIT
fi
export PYTHONDONTWRITEBYTECODE=1
mkdir -p "$EVIDENCE" "$TMPDIR"
HTML="$PROJECT/build/video.html"
AUDIO="${AUDIO:-$PROJECT/build/narration.wav}"
PW=(uv run -q --no-project --with playwright --with pillow python)
failed=0
printf 'case\texit\tseconds\tverdict\tcommand\n' > "$EVIDENCE/summary.tsv"
run_case() {
  local name="$1" checker="$2" mutation="$3"
  shift 3
  local started=$SECONDS rc=0 log="$EVIDENCE/$name.log" verdict command
  printf -v command '%q ' "$@"
  printf 'WORKING: checks - %s\n' "$name"
  "$@" > "$log" 2>&1 || rc=$?
  verdict="$(grep -E "^${checker}_CHECK (PASS|FAIL)$" "$log" || true)"
  printf '%s\t%s\t%s\t%s\t%s\n' "$name" "$rc" "$((SECONDS-started))" "$verdict" "$command" >> "$EVIDENCE/summary.tsv"
  printf '%s: exit=%s runtime=%ss %s\n' "$name" "$rc" "$((SECONDS-started))" "${verdict:-NO_VERDICT}"
  if [[ "$mutation" == yes ]]; then
    if [[ "$rc" == 1 && "$verdict" == "${checker}_CHECK FAIL" ]] && grep -qx MUTATION_CAUGHT "$log"; then
      printf 'MUTATION_CAUGHT %s\n' "$name"
    else
      printf 'MUTATION_NOT_CAUGHT %s (see %s)\n' "$name" "$log"
      failed=1
      return 1
    fi
  elif [[ "$rc" == 0 && "$verdict" == "${checker}_CHECK PASS" ]]; then
    printf 'BASELINE_PASS %s\n' "$name"
  elif [[ "$rc" == 1 && "$verdict" == "${checker}_CHECK FAIL" ]] && ! grep -qE 'PAGE_ERROR|PROBE_ERROR|AUDIO_ERROR|Traceback' "$log"; then
    printf 'BASELINE_FINDINGS %s (see %s)\n' "$name" "$log"
  else
    printf 'BASELINE_ERROR %s (see %s)\n' "$name" "$log"
    failed=1
    return 1
  fi
  return 0
}
run_case audio AUDIO no python3 "$ROOT/lib/check_audio.py" "$AUDIO" || failed=1
run_case audio_gain AUDIO yes python3 "$ROOT/lib/check_audio.py" "$AUDIO" --mutate gain || failed=1
run_case motion MOTION no "${PW[@]}" "$ROOT/lib/check_motion.py" "$HTML" || failed=1
run_case motion_teleport MOTION yes "${PW[@]}" "$ROOT/lib/check_motion.py" "$HTML" --mutate teleport || failed=1
run_case layout LAYOUT no "${PW[@]}" "$ROOT/lib/check_layout.py" "$HTML" || failed=1
# Independent browser processes and distinct logs; one atomic TSV append per
# case. Four local workers fit this 20-core workstation and avoid rendering
# the same full timeline serially for every independent injected defect.
export -f run_case
export ROOT HTML EVIDENCE
if ! printf '%s\n' overlap clip contrast safe | xargs -n 1 -P 4 bash -c '
  mutation="$1"
  run_case "layout_$mutation" LAYOUT yes uv run -q --no-project --with playwright --with pillow \
    python "$ROOT/lib/check_layout.py" "$HTML" --mutate "$mutation"
' _; then
  failed=1
fi
if [[ "$failed" == 0 ]]; then
  echo "NEW_CHECKS PASS"
else
  echo "NEW_CHECKS FAIL"
  exit 1
fi
