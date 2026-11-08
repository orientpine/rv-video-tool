#!/usr/bin/env bash
# script.json "badge": one label drawn once above the scenes. It stays still through the transitions, so
# TEXT_TRANSITION does not list it, and it is chrome for the safe area. The same label put into each scene's own
# layer (what a scene does without the default) fades out and back in with every transition and is listed.
#   bash tests/test_badge.sh [tool_dir]  -> BADGE_TESTS PASS
set -euo pipefail
TOOL="$(cd "${1:-$(dirname "$0")/..}" && pwd)"
W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
export TMPDIR="${TMPDIR:-$(mktemp -d)}"
export PYTHONDONTWRITEBYTECODE=1
cp -a "$TOOL/tests/project" "$W/p"
python3 - "$TOOL" "$W/p" <<'PY'
import json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1] + "/tests")
import prepare_project as prep
prep.PROJECT = Path(sys.argv[2]); prep.BUILD = prep.PROJECT / "build"
script = json.loads((prep.PROJECT / "script.json").read_text())
script["badge"] = {"text": "Concept view", "scenes": ["need", "chamber", "hold"]}
(prep.PROJECT / "script.json").write_text(json.dumps(script, indent=2))
prep.main()
PY
H="$W/p/build/video.html"
# Without the default: the same label as a copy inside every scene layer.
python3 - "$H" "$W/per-scene.html" <<'PY'
import sys
html = open(sys.argv[1], encoding="utf-8").read()
copy = """<script>window.renderReady.then(() => { document.getElementById("badge").remove();
  for (const ov of document.querySelectorAll(".overlay[data-scene]")) { const b = document.createElement("div");
    b.textContent = "Concept view"; b.style.cssText = "position:absolute;right:48px;top:40px;font:700 30px/1 sans-serif"; ov.append(b); } });</script>"""
open(sys.argv[2], "w", encoding="utf-8").write(html.replace("</body>", copy + "</body>"))
PY
PW=(uv run -q --no-project --with playwright --with pillow --with numpy python)
"${PW[@]}" "$TOOL/lib/check_motion.py" "$H" > "$W/chrome.log" 2>&1 || true
"${PW[@]}" "$TOOL/lib/check_motion.py" "$W/per-scene.html" > "$W/scene.log" 2>&1 || true
ok=1
for t in need-\>chamber chamber-\>hold hold-\>map; do
  grep -Eq "^TEXT_TRANSITION ${t} (PASS|FAIL) " "$W/chrome.log" || { echo "FAIL no measured TEXT_TRANSITION ${t} line"; ok=0; }
done
if grep -E '^TEXT_TRANSITION (need->chamber|chamber->hold) ' "$W/chrome.log" | grep -q "'Concept view'"; then echo "FAIL the badge default is listed between two listed scenes"; ok=0
else echo "PASS the badge default stays through the transitions between listed scenes"; fi
if grep -E '^TEXT_TRANSITION hold->map ' "$W/chrome.log" | grep -q "'Concept view'"; then echo "PASS the badge leaving with a scene change is still listed"
else echo "FAIL the badge leaving at hold->map was not listed"; ok=0; fi
if grep '^TEXT_TRANSITION ' "$W/scene.log" | grep -q "'Concept view'"; then echo "PASS a per-scene copy of the label is listed in a transition"
else echo "FAIL a per-scene copy of the label was not listed"; ok=0; fi
"${PW[@]}" "$TOOL/lib/check_layout.py" "$H" --at 1 6 > "$W/layout.log" 2>&1 || true
if grep -q '| Concept view | safe |' "$W/layout.log"; then echo "FAIL the badge default is judged against the scene safe area"; ok=0
else echo "PASS the badge default is chrome for the safe area"; fi
grep -q 'samples=2 ' "$W/layout.log" || { echo "FAIL check_layout did not run"; tail -3 "$W/layout.log"; ok=0; }
shown=$("${PW[@]}" - "$H" <<'PY'
import asyncio, sys
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); p = await b.new_page(viewport={"width": 1920, "height": 1080})
        await p.goto(Path(sys.argv[1]).resolve().as_uri()); await p.evaluate("Promise.resolve(window.renderReady)")
        out = []
        for t in (1, 30):   # need (listed), map (not listed)
            await p.evaluate("t => window.renderAt(t)", t)
            out.append(await p.evaluate("() => { const b = document.getElementById('badge'); return b.offsetParent !== null && b.textContent; }"))
        print(out); await b.close()
asyncio.run(main())
PY
)
if [ "$shown" = "['Concept view', False]" ]; then echo "PASS the badge is drawn in the listed scenes and hidden in the others"
else echo "FAIL badge visibility $shown"; ok=0; fi
# A number in the badge is screen text of the scenes it shows on: without a source it fails the number check.
sed 's/window.BADGE={"text": *"Concept view"/window.BADGE={"text":"Concept view 47 kW"/' "$H" > "$W/number.html"
grep -q 'Concept view 47 kW' "$W/number.html" || { echo "FAIL could not put a number into the badge"; ok=0; }
"${PW[@]}" "$TOOL/lib/check_numbers.py" "$W/p" --html "$W/number.html" --every 2 > "$W/numbers.log" 2>&1 || true
if grep -q '^screen | .*47' "$W/numbers.log"; then echo "PASS a number in the badge without a source fails the number check"
else echo "FAIL a number in the badge was not checked"; tail -3 "$W/numbers.log"; ok=0; fi
[ "$ok" = 1 ] && echo "BADGE_TESTS PASS" || { echo "BADGE_TESTS FAIL"; exit 1; }
