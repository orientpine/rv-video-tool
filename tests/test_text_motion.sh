#!/usr/bin/env bash
# TEXT_MOTION in check_motion (while text is on screen and the camera holds, the picture the text leaves free must not
# stand still for 2 s) and the kit parts that keep it moving (KIT.shot.free, KIT.fx.pulse, KIT.process.spin,
# KIT.process.exhaust path). Runs examples/text-motion with a fixed timeline in its two modes.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
W="${TEXT_MOTION_EVIDENCE:-$(mktemp -d)}"
mkdir -p "$W/project/build" "$W/project/scenes"
export TMPDIR="${TMPDIR:-$(mktemp -d)}" PYTHONDONTWRITEBYTECODE=1
PW=(uv run -q --no-project --with playwright --with pillow python)
cp -r "$ROOT/examples/text-motion/scenes/device" "$W/project/scenes/"
cp "$ROOT/examples/text-motion/script.json" "$W/project/"
python3 - "$W/project" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
lines = [("This is a palm-sized test device.", .5, 1.9), ("Open the lid, and a disk goes in.", 2.0, 4.8),
         ("It is light enough to carry in one hand.", 5.0, 8.3), ("Then the disk spins, and the sample runs into every well.", 8.5, 12.4),
         ("Results go to a phone, so the whole clinic can see them.", 12.6, 18.4)]
words = []
for text, a, b in lines:
    ws = text.split()
    words.append({"scene": "device", "speech_start": a, "speech_end": b, "text": text,
                  "words": [{"word": w.strip(",."), "t": a + (b - a) * i / len(ws), "t_scene": a + (b - a) * i / len(ws)}
                            for i, w in enumerate(ws)]})
(p / "build/timeline.json").write_text(json.dumps({"fps": 30, "total_s": 19.5, "fade_in_s": 0, "fade_out_s": 0,
    "order": ["device"], "modules": {"device": {"start": 0, "duration": 19.5}},
    "captions": [{"t": a, "text": text} for text, a, _ in lines],
    "lines": [{"scene": "device", "start": a, "end": b, "text": text} for text, a, b in lines]}))
(p / "build/word_times.json").write_text(json.dumps({"lines": words}))
PY
run_case() {
  local name="$1" mode="$2"; shift 2
  printf '{"mode":"%s"}\n' "$mode" > "$W/project/scenes/device/mode.json"
  VIDEO_HTML="$W/$name.html" python3 "$ROOT/lib/build.py" "$W/project" > "$W/$name.build.log"
  "${PW[@]}" "$ROOT/lib/check_motion.py" "$W/$name.html" "$@" > "$W/$name.log" 2>&1 || true
  ! grep -q Traceback "$W/$name.log"
}
ok=1
need() { grep -Eq "$2" "$W/$1.log" || { echo "FAIL $1: missing /$2/"; grep -E "^(TEXT_MOTION|PAGE_ERROR|MUTATION)" "$W/$1.log" || true; ok=0; }; }
none() { ! grep -Eq "$2" "$W/$1.log" || { echo "FAIL $1: unexpected /$2/"; grep -E "$2" "$W/$1.log"; ok=0; }; }
run_case still still
need still "^TEXT_MOTION device window=.* still=([2-9]|[1-9][0-9])[0-9.]*s@.* FAIL$"; need still "^TEXT_MOTION_CHECK FAIL "
run_case kit kit
need kit "^TEXT_MOTION device window=.* PASS$"; need kit "^TEXT_MOTION_CHECK PASS "; none kit "PAGE_ERROR|^POP_IN .* FAIL$"
need kit "^HATCH_COVER device PASS"; need kit "subjects=\\[.*'lid'@0\\.[3-6][0-9],0\\.[3-6][0-9]"; none kit "\\(covered\\)"
need kit "^PICTURE device picture='clinic' .* PASS$"; need kit "pictured=[0-9.]+ "
M="$W/project/scenes/device/module.js"; cp "$M" "$W/module.orig.js"
# Without the picture the last line stands still; a text-only or a 1.5 s picture is not enough either.
sed -i 's|pic.show(kit ? |pic.show(false \&\& kit ? |' "$M"; run_case nopic kit
need nopic "^TEXT_MOTION device window=.* FAIL$"; none nopic "^PICTURE "
cp "$W/module.orig.js" "$M"; sed -i 's|KIT.win(t, phone, this.duration - .3, .5)|KIT.win(t, phone, phone + 1.5, .3)|' "$M"; run_case shortpic kit
need shortpic "^PICTURE device picture='clinic' .* FAIL short$"
cp "$W/module.orig.js" "$M"; cp "$W/project/scenes/device/clinic.svg" "$W/clinic.orig.svg"
printf '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480"><rect width="720" height="480" fill="#fff"/><text x="40" y="250" font-size="44" font-family="sans-serif">The whole clinic sees it</text></svg>' > "$W/project/scenes/device/clinic.svg"
run_case poorpic kit; need poorpic "^PICTURE device picture='clinic' .* FAIL poor$"; need poorpic "^TEXT_MOTION device window=.* FAIL$"
cp "$W/clinic.orig.svg" "$W/project/scenes/device/clinic.svg"
run_case textstill kit --mutate textstill; need textstill "^MUTATION_CAUGHT$"
# An intended hold on the text (declared ui-only shot) is not a still window.
sed -i 's|^    init(r, THREE, overlay) {$|&\n      KIT.shot.declare(NAME, [{t: 0, kind: "ui-only", end: 1e3}]);|' "$W/project/scenes/device/module.js"
run_case hold still; need hold "^TEXT_MOTION device .* EXEMPT declared_hold"; need hold "^TEXT_MOTION_CHECK PASS "
# A card over part of a moving part looks like it covers it (check_layout cut); declared decoration is left out.
layout_case() {
  local name="$1"
  printf '{"mode":"kit"}\n' > "$W/project/scenes/device/mode.json"
  VIDEO_HTML="$W/$name.html" python3 "$ROOT/lib/build.py" "$W/project" > "$W/$name.build.log"
  "${PW[@]}" "$ROOT/lib/check_layout.py" "$W/$name.html" --from 9 --to 12.5 --every .5 --shards 1 > "$W/$name.log" 2>&1 || true
  ! grep -q Traceback "$W/$name.log"
}
cp "$W/module.orig.js" "$M"; layout_case layoutkit; need layoutkit "^LAYOUT_CHECK PASS"; none layoutkit "\| cut \|"
sed -i 's|cardB = card(overlay, "Spinning sends the sample into every well", 80);|&\n      cardB.style.left = "620px"; cardB.style.top = "560px";|' "$M"
layout_case cutcard; need cutcard "\| cut \| .*source=moving"; need cutcard "^LAYOUT_CHECK FAIL"
sed -i 's|^      cardB.style.left = "620px"; cardB.style.top = "560px";$|&\n      KIT.fx.decor(disk);|' "$M"
layout_case decor; none decor "\| cut \| .*source=moving"
cp "$W/module.orig.js" "$M"
grep -h -E "^(TEXT_MOTION|PICTURE|MUTATION_CAUGHT|mutation=)" "$W"/{still,kit,nopic,shortpic,poorpic,textstill,hold}.log
[ "$ok" = 1 ] && echo "TEXT_MOTION_TESTS PASS" || { echo "TEXT_MOTION_TESTS FAIL"; exit 1; }
