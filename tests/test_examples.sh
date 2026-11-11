#!/usr/bin/env bash
# Every examples/<name> project, checked on a copy: script.json parses, every scene it names has scenes/<scene>/module.js
# and deps.json, every line points at a listed scene, sources.json (when there is one) parses, and `rv still` builds the
# project (speech, timeline, page) and draws one moment to a PNG. No video is rendered or encoded.
# An example with audio/score.py keeps no .wav in git: like a user, the test runs `rv tts` and then the script, which
# writes audio/*.wav from build/timeline.json, before `rv still` mixes the sound.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
failed=()
for dir in "$ROOT"/examples/*/; do
  name="$(basename "$dir")"
  cp -r "$dir" "$WORK/$name"
  rm -rf "$WORK/$name/build" "$WORK/$name/out"
  if ! python3 - "$WORK/$name" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1])
s = json.loads((p / "script.json").read_text())
scenes = [x["name"] for x in s["scenes"]]
missing = [f"scenes/{n}/{f}" for n in scenes for f in ("module.js", "deps.json") if not (p / "scenes" / n / f).is_file()]
stray = sorted({l["scene"] for l in s["lines"]} - set(scenes))
if (p / "sources.json").exists():
    json.loads((p / "sources.json").read_text())
if missing or stray:
    sys.exit(f"SCRIPT FAIL missing={missing} lines_without_scene={stray}")
print(f"SCRIPT OK {p.name} scenes={','.join(scenes)} lines={len(s['lines'])}")
PY
  then failed+=("$name"); continue; fi
  if [[ -f "$WORK/$name/audio/score.py" ]] && ! { bash "$ROOT/rv" tts "$WORK/$name" < /dev/null &&
      uv run -q --no-project --with numpy python "$WORK/$name/audio/score.py" "$WORK/$name"; } > "$WORK/$name.sound.log" 2>&1; then
    tail -n 20 "$WORK/$name.sound.log"; echo "SOUND FAIL $name"; failed+=("$name"); continue
  fi
  if ! bash "$ROOT/rv" still "$WORK/$name" 1 < /dev/null > "$WORK/$name.still.log" 2>&1; then
    tail -n 20 "$WORK/$name.still.log"; echo "STILL FAIL $name"; failed+=("$name"); continue
  fi
  png="$WORK/$name/build/stills/t0001.00.png"
  size=$(stat -c %s "$png" 2>/dev/null || echo 0)
  if (( size < 10000 )); then echo "STILL FAIL $name png=$size bytes"; failed+=("$name"); continue; fi
  echo "STILL OK $name png=$size bytes"
done
if (( ${#failed[@]} )); then echo "EXAMPLES FAIL ${failed[*]}"; exit 1; fi
echo "EXAMPLES PASS"
