#!/usr/bin/env bash
# POP_IN (an element appears in one frame) and SUBJECT_FRAME (the explained part near the camera centre) in check_motion,
# the kit defaults that avoid them (KIT.fx.reveal, KIT.process.exhaust flow fade) and check_layout leaving mid-fade text
# to its resting frames. One synthetic scene, switched by fixture mode.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
W="${POP_EVIDENCE:-$(mktemp -d)}"
mkdir -p "$W/project/build" "$W/project/scenes/proc"
export TMPDIR="${TMPDIR:-$(mktemp -d)}" PYTHONDONTWRITEBYTECODE=1
PW=(uv run -q --no-project --with playwright --with pillow python)
"${PW[@]}" - "$ROOT/lib" <<'PY'
import sys; sys.path.insert(0, sys.argv[1])
from check_motion import ACTION_VERBS, match_class
cases = {"로봇이 필요할 때 스스로 바꿔 끼웁니다.": True, "헤드를 교체합니다": True, "센서 헤드를 갈아 끼우고": True,
         "측정 위치를 바꾸려면": False}
bad = [t for t, want in cases.items() if bool(ACTION_VERBS.search(t)) != want]
bad += [t for t in ("바꿔 끼웁니다", "헤드를 교체합니다") if match_class(t) != "rise"]
print("ACTION_VERBS swap " + ("PASS" if not bad else f"FAIL {bad}")); sys.exit(1 if bad else 0)
PY
python3 - "$W/project" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
def save(name, data): (p/name).write_text(json.dumps(data, ensure_ascii=False))
W = [("밸브를 돌리고", 1.1), ("기다립니다", 3.0)]
text = " ".join(w for w, _ in W)
save("script.json", {"scenes": [{"name": "proc"}]})
save("build/timeline.json", {"fps": 30, "total_s": 9, "fade_in_s": 0, "fade_out_s": 0,
    "order": ["proc"], "modules": {"proc": {"start": 0, "duration": 9}},
    "lines": [{"scene": "proc", "start": 1, "end": 8.5, "text": text}]})
save("build/word_times.json", {"lines": [{"scene": "proc", "speech_start": 1, "speech_end": 8.5, "text": text,
    "words": [{"word": w, "t": t, "t_scene": t} for w, t in W]}]})
save("scenes/proc/deps.json", {"data": {"proc.fixture": "fixture.json"}})
PY
cat <<'JS' > "$W/project/scenes/proc/module.js"
(function(){
  let r,scene,cam,mode,valve,vent,box,tag;
  const u=(t,a,b)=>KIT.clamp((t-a)/(b-a),0,1);
  SCENES.proc={duration:9,init(renderer,THREE_,overlay){
    r=renderer;mode=DATA["proc.fixture"].mode;
    scene=new THREE.Scene();scene.background=new THREE.Color(0x172B38);
    scene.add(new THREE.HemisphereLight(0xffffff,0x607080,2));
    const wall=new THREE.Mesh(new THREE.BoxGeometry(6,3,.1),new THREE.MeshStandardMaterial({color:0x8398A5}));
    wall.position.set(0,1.5,-.3);scene.add(wall);
    valve=KIT.process.valve(scene,{radius:.35});valve.root.position.set(0,1.5,0);
    box=new THREE.Mesh(new THREE.BoxGeometry(.6,.6,.6),new THREE.MeshStandardMaterial({color:0xF2A33A}));
    box.position.set(-1.6,1.2,.3);scene.add(box);
    vent=KIT.process.exhaust(scene,{seed:3});vent.root.position.set(1.4,1.0,.2);
    tag=document.createElement("div");tag.textContent="밸브 이름표";
    tag.style.cssText="position:absolute;left:220px;top:300px;padding:14px 24px;font:700 34px/1.2 sans-serif;color:#F7F9F9;background:#16323C;opacity:0";
    overlay.append(tag);
    cam=new THREE.PerspectiveCamera(45,16/9,.1,100);cam.position.set(0,1.8,6);
    cam.lookAt(mode==="offcenter"?new THREE.Vector3(-2.3,1.2,0):new THREE.Vector3(0,1.5,0));
  },render(t){
    valve.set(u(t,1.1,2.2));
    tag.style.opacity=String(mode==="pop"?(t>=3&&t<6?1:0):KIT.win(t,3,6,.4));
    if(mode==="pop3d")box.visible=t>=4;else KIT.fx.reveal(box,KIT.win(t,4,8.5,.4));
    vent.set(t>=6.5&&t<8.3?u(t,6.5,8.3):0);
    r.render(scene,cam);
  }};
})();
JS
run_case() {
  local name="$1"; shift
  printf '{"mode":"%s"}\n' "${MODE:-$name}" > "$W/project/scenes/proc/fixture.json"
  VIDEO_HTML="$W/$name.html" python3 "$ROOT/lib/build.py" "$W/project" > "$W/$name.build.log"
  "${PW[@]}" "$ROOT/lib/check_motion.py" "$W/$name.html" "$@" > "$W/$name.log" 2>&1 || true
  ! grep -q Traceback "$W/$name.log"
}
ok=1
need() { grep -Eq "$2" "$W/$1.log" || { echo "FAIL $1: missing /$2/"; grep -E "^(POP_IN|SUBJECT_FRAME)" "$W/$1.log" || true; ok=0; }; }
none() { ! grep -Eq "$2" "$W/$1.log" || { echo "FAIL $1: unexpected /$2/"; grep -E "$2" "$W/$1.log"; ok=0; }; }
run_case good
need good "^POP_IN_CHECK PASS "; need good "^SUBJECT_FRAME proc '밸브를 돌리고' PASS subject=valve:'밸브'"
run_case pop;    need pop "^POP_IN proc t=3\.000s kind=ui element='밸브 이름표' .* FAIL$"
run_case pop3d;  need pop3d "^POP_IN proc t=4\.000s kind=3d .* FAIL$"; none pop3d "^POP_IN proc t=3\.000s"
run_case offcenter; need offcenter "^SUBJECT_FRAME proc '밸브를 돌리고' FAIL subject=valve:'밸브' centred=0\.00"
MODE=good run_case popin --mutate popin;         need popin "^MUTATION_CAUGHT$"
MODE=good run_case turned --mutate offcenter;    need turned "^MUTATION_CAUGHT$"
# A label in the middle of its 0.4 s fade is not judged for contrast; the same label at rest still is.
MODE=good; printf '{"mode":"good"}\n' > "$W/project/scenes/proc/fixture.json"
"${PW[@]}" "$ROOT/lib/check_layout.py" "$W/good.html" --at 3.1 4.5 > "$W/layout.log" 2>&1 || true
need layout "^LAYOUT_FADE t=3\.100 text='밸브 이름표'"; none layout "^\| 3\.100 \| 밸브 이름표 \| contrast"
need layout "^LAYOUT_CHECK PASS"
grep -h -E "^(POP_IN|SUBJECT_FRAME|MUTATION_CAUGHT|LAYOUT_)" "$W"/{good,pop,pop3d,offcenter,popin,turned,layout}.log
[ "$ok" = 1 ] && echo "POP_FRAMING_TESTS PASS" || { echo "POP_FRAMING_TESTS FAIL"; exit 1; }
