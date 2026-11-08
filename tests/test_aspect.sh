#!/usr/bin/env bash
# script.json "aspect": rv draws the bars once (#matte), window.PICTURE is the picture inside them, check_layout does not read a
# bar as a card over the subject, and the flicker mutation lands inside the picture (a 1:2 pillarbox puts the old 16:9 spot,
# x = iw/8..iw/4, entirely in the left bar, where a black box changes nothing and check_flicker cannot catch it).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
T="$TMPDIR"
PW=(uv run -q --no-project --with playwright --with pillow --with numpy python)

# A: 2.35:1 page, bars and PICTURE; a labelled box partly under the top bar is not "covered by a card"
P="$T/wide"; mkdir -p "$P/build" "$P/scenes/a"
echo '{"name":"wide","checks":"strict","aspect":"2.35:1","scenes":[{"name":"a"}],"lines":[]}' > "$P/script.json"
echo '{"fps":30,"total_s":2,"order":["a"],"modules":{"a":{"start":0,"duration":2}},"captions":[],"steps":[],"fade_in_s":0,"fade_out_s":0}' > "$P/build/timeline.json"
cat > "$P/scenes/a/module.js" <<'JS'
SCENES.a = (() => { let R, s, cam, tag, box; return {duration: 2,
  init(r, THREE, ov) { R = r; s = new THREE.Scene(); s.background = new THREE.Color(0x40505a);
    s.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.5));
    box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({color: 0xF2A33A}));
    box.position.set(0, 1.55, 0); box.name = "top box"; s.add(box);
    cam = new THREE.PerspectiveCamera(45, 16 / 9, .1, 50); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0);
    tag = KIT.label(ov, "Top box", {target: box}); },
  render(t) { tag.place(cam, new THREE.Vector3(0, 1.55, 0.6), 300, 260, 1); R.render(s, cam); }}; })();
JS
python3 "$ROOT/lib/build.py" "$P" > /dev/null
"${PW[@]}" - "$P/build/video.html" "$ROOT/lib" <<'PY'
import asyncio, json, sys
sys.path.insert(0, sys.argv[2])
from capture import CHROME, CHROME_ARGS
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, args=CHROME_ARGS, headless=True)
        p = await b.new_page(viewport={"width": 1920, "height": 1080})
        await p.goto("file://" + sys.argv[1]); await p.evaluate("Promise.resolve(window.renderReady)")
        got = await p.evaluate("() => ({pic: window.PICTURE, bars: [...document.querySelectorAll('#matte .bar')].map(b => { const r = b.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })})")
        await b.close()
    want_h = round(1920 / 2.35); y = (1080 - want_h) // 2
    assert got["pic"] == {"x": 0, "y": y, "w": 1920, "h": want_h}, got
    assert got["bars"] == [[0, 0, 1920, y], [0, y + want_h, 1920, 1080 - y - want_h]], got
    print("ASPECT_PAGE PASS", json.dumps(got))
asyncio.run(main())
PY
"${PW[@]}" "$ROOT/lib/check_layout.py" "$P/build/video.html" --at 1 --shards 1 > "$T/layout.log" 2>&1 || true
grep -E 'OCCLUSION |LAYOUT_CHECK' "$T/layout.log"
grep -q 'OCCLUSION t=1.000 .*card_coverage=0.000' "$T/layout.log"

# B: flicker mutation inside a 1:2 pillarbox picture, with the real check_flicker and every other checker stubbed
mkdir -p "$T/tool/lib"; cp "$ROOT/rv" "$T/tool/rv"; cp "$ROOT/lib/check_flicker.py" "$T/tool/lib/"
for f in check_cuts sync_check check_clearance check_captions sheet check_layout check_numbers cutlist check_sharp check_human check_motion check_audio mix check_quality; do
  printf 'import sys\nm = any(x == "--mutate" or "/mut_" in x for x in sys.argv)\nprint("MUTATION_CAUGHT" if m else "STUB PASS")\nsys.exit(1 if m else 0)\n' > "$T/tool/lib/$f.py"
done
Q="$T/tall"; mkdir -p "$Q/build" "$Q/out"
echo '{"name":"t","checks":"strict","aspect":"1:2"}' > "$Q/script.json"
echo '{"total_s":4.0,"order":["a"],"modules":{"a":{"start":0,"duration":4}}}' > "$Q/build/timeline.json"
ffmpeg -nostdin -v error -y -f lavfi -i "color=c=0x808890:s=1920x1080:r=30:d=4" -f lavfi -i sine=frequency=440:duration=4 \
  -vf "drawbox=x=0:y=0:w=690:h=ih:color=black:t=fill,drawbox=x=1230:y=0:w=690:h=ih:color=black:t=fill" -c:v libx264 -c:a aac -shortest "$Q/out/t.mp4"
printf '1\n00:00:00,000 --> 00:00:04,000\nx\n\n' > "$Q/out/t.srt"
bash "$T/tool/rv" check "$Q" > "$T/rv.log" 2>&1 || true
sec=$(awk '/^## 변이: 프레임 .* 작은 자리 깜빡임/{f=1;print;next} /^## /{f=0} f' "$Q/out/CHECKS.md")
echo "$sec" | tail -3
grep -qx MUTATION_CAUGHT <<<"$sec"

# C: no "aspect", bars drawn by the scenes themselves. The mutation box goes to the same relative spot inside the picture
# (the frame minus edge-to-edge black rows/columns), white on a dark spot; CHECKS.md names it on a MUTATION_BOX line.
flick() {   # flick <name> <picture colour> <filters>: rv check on a 4 s video, prints its flicker mutation section
  local R="$T/$1"; mkdir -p "$R/build" "$R/out"
  echo '{"name":"d","checks":"strict"}' > "$R/script.json"
  echo '{"total_s":4.0,"order":["a"],"modules":{"a":{"start":0,"duration":4}}}' > "$R/build/timeline.json"
  ffmpeg -nostdin -v error -y -f lavfi -i "color=c=$2:s=1920x1080:r=30:d=4" -f lavfi -i sine=frequency=440:duration=4 \
    -vf "$3" -c:v libx264 -c:a aac -shortest "$R/out/d.mp4"
  printf '1\n00:00:00,000 --> 00:00:04,000\nx\n\n' > "$R/out/d.srt"
  bash "$T/tool/rv" check "$R" > "$T/rv-$1.log" 2>&1 || true
  awk '/^## 변이: 프레임 .* 작은 자리 깜빡임/{f=1;print;next} /^## /{f=0} f' "$R/out/CHECKS.md"
}
# C1: 2.35:1 bars (131 px, a caption box inside the bottom one) and a dark set where the box lands: inside the picture, white.
sec=$(flick drawn 0x606060 "drawbox=x=0:y=560:w=900:h=300:color=black:t=fill,drawbox=x=0:y=0:w=iw:h=131:color=black:t=fill,drawbox=x=0:y=949:w=iw:h=131:color=black:t=fill,drawbox=x=440:y=960:w=1040:h=60:color=0x808080:t=fill")
echo "$sec" | grep -E 'MUTATION_BOX|MUTATION_'
grep -q 'MUTATION_BOX x=0.0000\*iw+1.0000\*iw/8:y=0.1213\*ih+0.7574\*ih\*5/8:.*:color=white$' <<<"$sec"
grep -qx MUTATION_CAUGHT <<<"$sec"
# C2: side bars 690 px wide: the old spot (x = iw/8..iw/4) lies wholly in the left bar; the box goes inside the picture.
sec=$(flick pillar 0xa0a0a0 "drawbox=x=0:y=0:w=690:h=ih:color=black:t=fill,drawbox=x=1230:y=0:w=690:h=ih:color=black:t=fill")
echo "$sec" | grep -E 'MUTATION_BOX|MUTATION_'
grep -q 'MUTATION_BOX x=0.3594\*iw+0.2812\*iw/8:y=0.0000\*ih+1.0000\*ih\*5/8:.*:color=black$' <<<"$sec"
grep -qx MUTATION_CAUGHT <<<"$sec"
# C3: a bright 16:9 video keeps the old box: x = iw/8, y = ih*5/8, black.
sec=$(flick plain 0xa0a0a0 null)
grep -qx 'MUTATION_BOX x=0.0000\*iw+1.0000\*iw/8:y=0.0000\*ih+1.0000\*ih\*5/8:w=1.0000\*iw/8:h=1.0000\*ih/8:color=black' <<<"$sec"
grep -qx MUTATION_CAUGHT <<<"$sec"
echo "ASPECT_TESTS PASS"
