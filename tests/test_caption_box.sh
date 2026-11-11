#!/usr/bin/env bash
# script.json "caption": {size, bottom, width} sets the caption box (kit/shell.html #cap); out-of-range values stop the build.
#   bash tests/test_caption_box.sh   -> last line CAPTION_BOX_TESTS PASS
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
PW=(uv run -q --no-project --with playwright --with pillow python)

project() {   # dir, caption json ("" = none)
  local P="$1"; mkdir -p "$P/build" "$P/scenes/a"
  local cap=""; [[ -n "$2" ]] && cap=",\"caption\":$2"
  echo "{\"name\":\"c\",\"checks\":\"strict\"$cap,\"scenes\":[{\"name\":\"a\"}],\"lines\":[]}" > "$P/script.json"
  echo '{"fps":30,"total_s":2,"order":["a"],"modules":{"a":{"start":0,"duration":2}},"captions":[{"t":0,"text":"자막 상자 크기와 자리"}],"steps":[],"fade_in_s":0,"fade_out_s":0}' > "$P/build/timeline.json"
  echo 'SCENES.a = (() => { let R, s, cam; return {duration: 2, init(r, THREE) { R = r; s = new THREE.Scene(); cam = new THREE.PerspectiveCamera(45, 16 / 9, .1, 50); }, render(t) { R.render(s, cam); }}; })();' > "$P/scenes/a/module.js"
}
box() {   # html -> "font-size bottom-edge max-width"
  "${PW[@]}" - "$1" "$ROOT/lib" <<'PY'
import asyncio, sys
sys.path.insert(0, sys.argv[2])
from capture import CHROME, CHROME_ARGS
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, args=CHROME_ARGS, headless=True)
        p = await b.new_page(viewport={"width": 1920, "height": 1080})
        await p.goto("file://" + sys.argv[1]); await p.evaluate("Promise.resolve(window.renderReady)")
        await p.evaluate("window.renderAt(0.5)")
        print(await p.evaluate("""() => { const e = document.querySelector('#cap .box'), s = getComputedStyle(e), r = e.getBoundingClientRect();
          return [parseFloat(s.fontSize), Math.round(1080 - r.bottom), s.maxWidth].join(' '); }"""))
        await b.close()
asyncio.run(main())
PY
}
fails=0
ok() { if [[ "$2" == "$3" ]]; then echo "PASS $1 ($2)"; else echo "FAIL $1: got '$2' want '$3'"; fails=$((fails + 1)); fi; }

project "$TMPDIR/default" ""
python3 "$ROOT/lib/build.py" "$TMPDIR/default" > /dev/null
ok "default caption box" "$(box "$TMPDIR/default/build/video.html")" "44 56 1560px"

project "$TMPDIR/set" '{"size":56,"bottom":200,"width":1200}'
python3 "$ROOT/lib/build.py" "$TMPDIR/set" > /dev/null
ok "caption size 56, bottom 200, width 1200" "$(box "$TMPDIR/set/build/video.html")" "56 200 1200px"

for bad in '{"size":20}' '{"bottom":900}' '{"height":40}' '{"size":true}' '"big"'; do
  project "$TMPDIR/bad" "$bad"
  if out=$(python3 "$ROOT/lib/build.py" "$TMPDIR/bad" 2>&1); then ok "refuse $bad" "built" "refused"
  else ok "refuse $bad" "$(grep -c 'script.json "caption" takes' <<< "$out")" "1"; fi
done
if (( fails )); then echo "CAPTION_BOX_TESTS FAIL ($fails)"; exit 1; fi
echo "CAPTION_BOX_TESTS PASS"
