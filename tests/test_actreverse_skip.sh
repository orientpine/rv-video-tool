#!/usr/bin/env bash
# The actreverse mutation reverses KIT.process handles (set(u)). A scene whose named part moves by its own render or
# steps run callback (KIT.process.part, no handle) gives the mutation nothing to reverse, so it must print MUTATION_SKIP
# and exit 0, as HOWTO section 5 says for a mutation without targets, not MUTATION_NOT_CAUGHT (which fails rv check).
# The same holds when handles exist only on parts no action line names. A linked handle must still be caught.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
W="${ACTREVERSE_EVIDENCE:-$(mktemp -d)}"
mkdir -p "$W/project/build" "$W/project/scenes/proc"
export TMPDIR="${TMPDIR:-$(mktemp -d)}" PYTHONDONTWRITEBYTECODE=1
PW=(uv run -q --no-project --with playwright --with pillow python)
python3 - "$W/project" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
def save(name, data): (p/name).write_text(json.dumps(data, ensure_ascii=False))
save("script.json", {"scenes": [{"name": "proc"}]})
save("build/timeline.json", {"fps": 30, "total_s": 5, "fade_in_s": 0, "fade_out_s": 0,
    "order": ["proc"], "modules": {"proc": {"start": 0, "duration": 5}},
    "lines": [{"scene": "proc", "start": 1, "end": 4.5, "text": "뚜껑 열기"}]})
save("build/word_times.json", {"lines": [{"scene": "proc", "speech_start": 1, "speech_end": 4.5, "text": "뚜껑 열기",
    "words": [{"word": "뚜껑 열기", "t": 2, "t_scene": 2}]}]})
save("scenes/proc/deps.json", {"data": {"proc.fixture": "fixture.json"}})
PY
cat <<'JS' > "$W/project/scenes/proc/module.js"
(function(){
  let r,scene,cam,mode,pivot,lid,vent,drive;
  const u=(t,a,b)=>KIT.clamp((t-a)/(b-a),0,1);
  SCENES.proc={duration:5,init(renderer){
    r=renderer;mode=DATA["proc.fixture"].mode;
    scene=new THREE.Scene();scene.background=new THREE.Color(0x172B38);
    scene.add(new THREE.HemisphereLight(0xffffff,0x607080,2));
    pivot=new THREE.Group();pivot.position.set(-.8,1.2,0);
    const door=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.2,.08),new THREE.MeshStandardMaterial({color:0xF2A33A}));
    door.position.set(.8,0,0);pivot.add(door);scene.add(pivot);
    // part / spare: the lid moves in render() like a steps run callback and is only declared with KIT.process.part.
    if(mode==="hatch")lid=KIT.process.hatch(pivot,{axis:"y",from:0,to:1.75,name:"뚜껑"});
    // vent: the only linked handle is an exhaust, which looks the same run backwards.
    else if(mode==="vent")vent=KIT.process.exhaust(scene,{name:"뚜껑"});
    else KIT.process.part(pivot,{name:"뚜껑",state:()=>pivot.rotation.y/1.75});
    // driven: the named lid follows a handle on a part the script never names, so reversing that handle reverses the lid.
    if(mode==="driven"){drive=KIT.process.valve(scene,{name:"밸브"});drive.root.position.set(1.6,1.2,0);}
    // spare: a handle exists, but on a part the script never names.
    if(mode==="spare"){const v=KIT.process.valve(scene,{name:"밸브"});v.root.position.set(1.6,1.2,0);v.set(0);}
    cam=new THREE.PerspectiveCamera(45,16/9,.1,100);cam.position.set(0,1.6,6);cam.lookAt(0,1.2,0);
  },render(t){
    if(lid)lid.set(u(t,2.1,3.0));
    else if(drive){drive.set(u(t,2.1,3.0));pivot.rotation.y=1.75*KIT.clamp(drive.wheel.rotation.z/(Math.PI*2),0,1);}
    else pivot.rotation.y=1.75*u(t,2.1,3.0);
    if(vent)vent.set(u(t,2.1,3.0));
    r.render(scene,cam);
  }};
})();
JS
run_case() {   # run_case <name> <fixture mode> [check_motion args...]; sets rc
  local name="$1" mode="$2"; shift 2
  printf '{"mode":"%s"}\n' "$mode" > "$W/project/scenes/proc/fixture.json"
  VIDEO_HTML="$W/$name.html" python3 "$ROOT/lib/build.py" "$W/project" > "$W/$name.build.log"
  rc=0; "${PW[@]}" "$ROOT/lib/check_motion.py" "$W/$name.html" "$@" > "$W/$name.log" 2>&1 || rc=$?
  ! grep -q Traceback "$W/$name.log" || { echo "FAIL $name: traceback"; cat "$W/$name.log"; exit 1; }
}
ok=1
fail() { echo "FAIL $1"; grep -E "^(ACTION_MATCH|ACTION_MUTATION|mutation=|MUTATION_|MOTION_CHECK)" "$W/$2.log" || true; ok=0; }
run_case part part
grep -q "^ACTION_MATCH proc '뚜껑 열기' PASS target=part:'뚜껑'" "$W/part.log" || fail "part: ACTION_MATCH did not link the run-callback lid" part
run_case part_mut part --mutate actreverse
{ [ $rc = 0 ] && grep -qx MUTATION_SKIP "$W/part_mut.log" && grep -q "'handles': 0" "$W/part_mut.log" &&
  ! grep -q MUTATION_NOT_CAUGHT "$W/part_mut.log"; } || fail "part: actreverse without handles is not MUTATION_SKIP (rc=$rc)" part_mut
run_case spare_mut spare --mutate actreverse
{ [ $rc = 0 ] && grep -qx MUTATION_SKIP "$W/spare_mut.log" && grep -q "'handles': 1" "$W/spare_mut.log" &&
  ! grep -q MUTATION_NOT_CAUGHT "$W/spare_mut.log"; } || fail "spare: unlinked handle only is not MUTATION_SKIP (rc=$rc)" spare_mut
run_case vent_mut vent --mutate actreverse
{ [ $rc = 0 ] && grep -qx MUTATION_SKIP "$W/vent_mut.log" && grep -q "^ACTION_MATCH proc '뚜껑 열기' PASS target=exhaust" "$W/vent_mut.log" &&
  ! grep -q MUTATION_NOT_CAUGHT "$W/vent_mut.log"; } || fail "vent: exhaust-only linked handle is not MUTATION_SKIP (rc=$rc)" vent_mut
run_case driven_mut driven --mutate actreverse
{ [ $rc != 0 ] && grep -qx MUTATION_CAUGHT "$W/driven_mut.log" && ! grep -qx MUTATION_SKIP "$W/driven_mut.log"; } ||
  fail "driven: lid reversed through an unnamed handle is not MUTATION_CAUGHT (rc=$rc)" driven_mut
run_case hatch_mut hatch --mutate actreverse
{ [ $rc != 0 ] && grep -qx MUTATION_CAUGHT "$W/hatch_mut.log"; } || fail "hatch: reversed linked handle not caught (rc=$rc)" hatch_mut
grep -h -E "^(ACTION_MATCH|ACTION_MUTATION|mutation=|MUTATION_)" "$W"/{part,part_mut,spare_mut,vent_mut,driven_mut,hatch_mut}.log
[ "$ok" = 1 ] && echo "ACTREVERSE_SKIP_TESTS PASS" || { echo "ACTREVERSE_SKIP_TESTS FAIL"; exit 1; }
