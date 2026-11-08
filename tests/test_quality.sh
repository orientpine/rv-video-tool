#!/usr/bin/env bash
# check_quality on two offline projects: a thin one (one box on a plain background, a big card, no story)
# must get every QUALITY_* rule; a full one (four beats in KIT.place sets, people, a small card) must pass.
# Exceptions need a reason of at least 15 characters. The three mutations must be caught on the full project.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
W="$TMPDIR/quality"
PW=(uv run -q --no-project --with playwright --with pillow --with numpy python)

make_project() {   # name, script.json, then scene=js pairs
  local dir="$W/$1" script="$2"; shift 2
  mkdir -p "$dir/build"
  printf '%s' "$script" > "$dir/script.json"
  for pair in "$@"; do
    local scene="${pair%%=*}"
    mkdir -p "$dir/scenes/$scene"
    printf '%s' "${pair#*=}" > "$dir/scenes/$scene/module.js"
  done
  python3 - "$dir" <<'PY'
import json, sys
from pathlib import Path
d = Path(sys.argv[1]); s = json.loads((d / "script.json").read_text())
modules, t = {}, 0.0
for sc in s["scenes"]:
    modules[sc["name"]] = {"start": t, "duration": 4.0}; t += 4.0
(d / "build/timeline.json").write_text(json.dumps({"fps": 30, "total_s": t, "order": list(modules), "modules": modules,
    "captions": [], "steps": [], "fade_in_s": 0, "fade_out_s": 0}))
PY
  python3 "$ROOT/lib/build.py" "$dir" > /dev/null
}

THIN_SCENE='SCENES.NAME = (() => { let R, s, cam; return {duration: 4,
  init(r, THREE, ov) { R = r; s = new THREE.Scene(); s.background = new THREE.Color(0x35566a);
    s.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.5));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({color: 0xb9ad98}));
    floor.rotation.x = -Math.PI / 2; s.add(floor);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({color: 0x8899aa}));
    box.position.y = .5; s.add(box);
    const card = document.createElement("div"); card.textContent = "18cm wheel step";
    card.style.cssText = "position:absolute;left:1100px;top:150px;width:600px;height:330px;background:#0a161e;color:#fff;font:700 96px sans-serif";
    ov.append(card);
    cam = new THREE.PerspectiveCamera(45, 16 / 9, .1, 100); cam.position.set(0, 2, 6); cam.lookAt(0, .5, 0); },
  render(t) { R.render(s, cam); }}; })();'

FULL_SCENE='SCENES.NAME = (() => { let R, s, cam, P, man; return {duration: 4,
  async init(r, THREE, ov) { R = r; s = new THREE.Scene(); P = KIT.place("NAME", s); await P.ready;
    man = KIT.fx.human(s, 1.75, {site: KIT.place.site(P.kind)});
    const fc = document.createElement("canvas"); fc.width = fc.height = 64; fc.getContext("2d").fillRect(0, 0, 32, 32);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 32), new THREE.MeshStandardMaterial({map: new THREE.CanvasTexture(fc)}));
    floor.rotation.x = -Math.PI / 2; floor.position.set(P.stage[0], 0.002, P.stage[2]); s.add(floor);   // textured floor: not a name board
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), new THREE.MeshBasicMaterial({color: 0, transparent: true, opacity: .28}));
    blob.rotation.x = -Math.PI / 2; blob.position.set(P.stage[0], 0.004, P.stage[2] + 1); s.add(blob);   // shadow disc: not a fake panel
    const card = document.createElement("div"); card.textContent = "design target";
    card.style.cssText = "position:absolute;right:64px;top:150px;padding:14px 22px;background:#0a161e;color:#fff;font:700 28px sans-serif";
    ov.append(card);
    cam = new THREE.PerspectiveCamera(45, 16 / 9, .1, 200);
    cam.position.set(P.stage[0] + 1.5, 1.7, P.stage[2] + 6); cam.lookAt(P.stage[0], 1, P.stage[2]); },
  render(t) { P.update(t); man.visible = true; man.position.set(P.stage[0] + .9, 0, P.stage[2]); man.pose("walk", {t});
    R.render(s, cam); }}; })();'

scene() { printf '%s' "${2//NAME/$1}"; }

THIN_SCRIPT='{"name":"thin","checks":"strict","site":"lab","scenes":[{"name":"a"},{"name":"b"}],"lines":[]}'
make_project thin "$THIN_SCRIPT" "a=$(scene a "$THIN_SCENE")" "b=$(scene b "$THIN_SCENE")"

FULL_SCRIPT='{"name":"full","checks":"strict","scenes":[
 {"name":"street","beat":"problem","place":"sidewalk","site":"office"},
 {"name":"inside","beat":"inside","place":"lab","site":"lab"},
 {"name":"yard","beat":"result","place":"recycling","site":"construction"},
 {"name":"home","beat":"after","place":"kitchen","site":"office"}],"lines":[]}'
make_project full "$FULL_SCRIPT" "street=$(scene street "$FULL_SCENE")" "inside=$(scene inside "$FULL_SCENE")" \
  "yard=$(scene yard "$FULL_SCENE")" "home=$(scene home "$FULL_SCENE")"

WIDE_SCRIPT="${FULL_SCRIPT/\"checks\":\"strict\",/\"checks\":\"strict\",\"aspect\":\"2.35:1\",}"
WIDE_SCRIPT="${WIDE_SCRIPT/\"name\":\"full\"/\"name\":\"wide\"}"
make_project wide "$WIDE_SCRIPT" "street=$(scene street "$FULL_SCENE")" "inside=$(scene inside "$FULL_SCENE")" \
  "yard=$(scene yard "$FULL_SCENE")" "home=$(scene home "$FULL_SCENE")"

EXEMPT_SCRIPT='{"name":"exempt","checks":"strict","site":"lab","quality_ok":{"STORY":"short"},
 "scenes":[{"name":"a","quality_ok":{"EMPTY":"one machine part alone, by design of this test"}}],"lines":[]}'
make_project exempt "$EXEMPT_SCRIPT" "a=$(scene a "$THIN_SCENE")"

FAKE_SCENE='SCENES.NAME = (() => { let R, s, cam, P; return {duration: 4,
  async init(r, THREE) { R = r; s = new THREE.Scene(); P = KIT.place("NAME", s); await P.ready;
    const smoke = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.4), new THREE.MeshStandardMaterial({color: 0x333333}));
    smoke.name = "chimney smoke"; smoke.position.set(P.stage[0] - 1, 2.2, P.stage[2]); s.add(smoke);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.6, 32), new THREE.MeshStandardMaterial({color: 0x556677}));
    drum.position.set(P.stage[0] + 0.6, 0.8, P.stage[2]); s.add(drum);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.2), new THREE.MeshStandardMaterial({color: 0x9fb8ff, transparent: true, opacity: 0.4}));
    pane.position.set(P.stage[0] + 0.6, 0.8, P.stage[2] + 0.65); s.add(pane);
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64; const g = cv.getContext("2d");
    g.fillStyle = "#7fa8b0"; g.fillRect(0, 0, 256, 64); g.fillStyle = "#123"; g.font = "40px sans-serif"; g.fillText("BENZENE", 20, 46);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(cv)}));
    plate.name = "benzene plate"; plate.position.set(P.stage[0] - 1.6, 1.4, P.stage[2]); s.add(plate);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 16), new THREE.MeshStandardMaterial({color: 0x445566}));
    pipe.position.set(P.stage[0] - 1.6, 1.5, P.stage[2] + 0.5); s.add(pipe);
    const ok = KIT.sign(s, "ETHYLENE", {at: [P.stage[0] + 1.8, 1.4, P.stage[2]], name: "ethylene sign"});
    const pipe2 = pipe.clone(); pipe2.position.x = P.stage[0] + 1.8; s.add(pipe2);
    cam = new THREE.PerspectiveCamera(45, 16 / 9, .1, 200); cam.position.set(P.stage[0], 1.6, P.stage[2] + 4.5); cam.lookAt(P.stage[0], 1.1, P.stage[2]); },
  render(t) { P.update(t); s.getObjectByName("ethylene sign").place(cam, 1); R.render(s, cam); }}; })();'
FAKE_SCRIPT='{"name":"fake","checks":"strict","scenes":[{"name":"plant","beat":"inside","place":"factory","site":"lab"}],"lines":[]}'
make_project fake "$FAKE_SCRIPT" "plant=$(scene plant "$FAKE_SCENE")"

COPIED_SCRIPT='{"name":"copied","checks":"strict","site":"lab",
 "quality_ok":{"EMPTY":"hello is the smallest API demo (a probe on a plate); examples/story is the full video (examples/hello only)"},
 "scenes":[{"name":"a"}],"lines":[]}'
make_project copied "$COPIED_SCRIPT" "a=$(scene a "$THIN_SCENE")"

check() {   # name, expected exit, extra args
  local name="$1" expected="$2" rc=0; shift 2
  "${PW[@]}" "$ROOT/lib/check_quality.py" "$W/${name%%-*}/build/video.html" --every 1 --shards 2 "$@" > "$W/$name.log" 2>&1 || rc=$?
  if [[ "$rc" != "$expected" ]]; then echo "Unexpected exit $rc (wanted $expected): $name"; cat "$W/$name.log"; return 1; fi
  grep -E '^QUALITY_|^MUTATION_|^PAGE_ERROR' "$W/$name.log" || true
  ! grep -q '^PAGE_ERROR' "$W/$name.log"
}

check thin 1
for rule in EMPTY SPARSE CARD PLACE; do
  grep -q "^QUALITY_$rule scene=a " "$W/thin.log"; grep -q "^QUALITY_$rule scene=b " "$W/thin.log"
done
grep -q '^QUALITY_NO_PEOPLE scene=(video)' "$W/thin.log"
grep -q '^QUALITY_STORY scene=(video) scenes\[\].beat' "$W/thin.log"
grep -q "^QUALITY_CARD scene=a t=.* card='18cm wheel step'" "$W/thin.log"

check full 0
grep -q '^QUALITY_CHECK PASS warnings=0' "$W/full.log"
for s in street inside yard home; do grep -q "^QUALITY_SCENE scene=$s .*people_max=[1-9]" "$W/full.log"; done

check wide 0   # letterbox bars (aspect 2.35:1) are neither empty background nor a card
grep -q '^QUALITY_CHECK PASS warnings=0' "$W/wide.log"
grep -q 'window.ASPECT="2.35:1"' "$W/wide/build/video.html"

check exempt 1
grep -q "^QUALITY_EXEMPT rule=EMPTY scene=a reason='one machine part alone" "$W/exempt.log"
! grep -q '^QUALITY_EMPTY scene=a' "$W/exempt.log"
grep -q "^QUALITY_EXEMPT_BAD rule=STORY scene=- reason='short'" "$W/exempt.log"
grep -q '^QUALITY_STORY scene=(video)' "$W/exempt.log"

check fake 1
grep -q "^QUALITY_FAKE_FX scene=plant .*chimney smoke: flat" "$W/fake.log"
grep -q "^QUALITY_FAKE_FX scene=plant .*flat translucent panel" "$W/fake.log"
grep -q "^QUALITY_TEXT_HIDDEN scene=plant .*benzene plate [0-9]*% covered" "$W/fake.log"
! grep -q "ethylene sign" "$W/fake.log"
! grep -q '^QUALITY_FAKE_FX' "$W/full.log"

check copied 1
grep -q '^QUALITY_EXEMPT_BAD rule=EMPTY scene=a reason copied from examples/hello' "$W/copied.log"
grep -q '^QUALITY_EMPTY scene=a ' "$W/copied.log"

for m in card empty people; do
  check "full-$m" 1 --mutate "$m"
  grep -qx MUTATION_CAUGHT "$W/full-$m.log"
done
check "thin-people" 0 --mutate people
grep -qx MUTATION_SKIP "$W/thin-people.log"
echo "QUALITY_TESTS PASS"
