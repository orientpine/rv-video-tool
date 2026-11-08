#!/bin/bash
set -euo pipefail
TOOL="$(cd "$(dirname "$0")/.." && pwd)"
export TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
uv run -q --no-project --with playwright --with pillow --with numpy python "$TOOL/tests/human_detection_cases.py"
uv run -q --no-project --with playwright --with pillow python "$TOOL/tests/human_compat_probe.py"
run() { uv run -q --no-project --with playwright --with pillow python "$TOOL/lib/check_human.py" --self-test "$@"; }
run
for mutation in contacts rvPart; do
  if run --mutate "$mutation" > "$TMPDIR/$mutation.log" 2>&1; then
    printf 'HUMAN_TESTS FAIL mutation %s survived\n' "$mutation"; exit 1
  fi
  grep -q "MUTATION_CAUGHT $mutation" "$TMPDIR/$mutation.log"
  cat "$TMPDIR/$mutation.log"
done
run
# A build showing the legacy sphere+capsule figure must FAIL (LEGACY_HUMAN),
# the same scene with today's KIT.fx.human must not. Project copy = synthetic workshop (RV_TEST_PROJECT to override).
P="${RV_TEST_PROJECT:-$TOOL/tests/project}"
[ "$P" != "$TOOL/tests/project" ] || python3 "$TOOL/tests/prepare_project.py"
if [ -d "$P" ]; then
  mkdir -p "$TMPDIR/p/final" "$TMPDIR/p/test-video/shared"; cp -a "$P" "$TMPDIR/p/final/project"; PP="$TMPDIR/p/final/project"
  [ -f "$P/../../test-video/shared/rig.js" ] && cp "$P/../../test-video/shared/rig.js" "$TMPDIR/p/test-video/shared/"
  rm -rf "$PP/build/frames" "$PP/build/stills" "$PP/scenes/need/deps.json"
  cp "$TOOL/tests/fixtures/human_need.module.js" "$PP/scenes/need/module.js"
  (cd "$PP" && VIDEO_HTML="$TMPDIR/legacy.html" python3 "$TOOL/lib/build.py" . >/dev/null)
  if uv run -q --no-project --with playwright --with pillow python "$TOOL/lib/check_human.py" "$TMPDIR/legacy.html" > "$TMPDIR/legacy.log" 2>&1 \
     || ! grep -q '^LEGACY_HUMAN' "$TMPDIR/legacy.log"; then
    grep -q '^LEGACY_HUMAN' "$TMPDIR/legacy.log" || { cat "$TMPDIR/legacy.log"; printf 'HUMAN_TESTS FAIL legacy figure not reported\n'; exit 1; }
  fi
  grep '^LEGACY_HUMAN' "$TMPDIR/legacy.log"
  sed -i 's/LEGACY = true/LEGACY = false/' "$PP/scenes/need/module.js"
  (cd "$PP" && VIDEO_HTML="$TMPDIR/current.html" python3 "$TOOL/lib/build.py" . >/dev/null)
  uv run -q --no-project --with playwright --with pillow python "$TOOL/lib/check_human.py" "$TMPDIR/current.html" > "$TMPDIR/current.log" 2>&1 || true
  if grep -q '^LEGACY_HUMAN' "$TMPDIR/current.log"; then cat "$TMPDIR/current.log"; printf 'HUMAN_TESTS FAIL todays figure reported as legacy\n'; exit 1; fi
  tail -1 "$TMPDIR/current.log"
fi
printf 'HUMAN_TESTS PASS\n'
