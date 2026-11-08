#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
W="${MATCH_EVIDENCE:-$(mktemp -d)}"
mkdir -p "$W/project/build" "$W/project/scenes/proc"
export TMPDIR="${TMPDIR:-$(mktemp -d)}" PYTHONDONTWRITEBYTECODE=1
PW=(uv run -q --no-project --with playwright --with pillow python)
"${PW[@]}" - "$ROOT/lib" <<'PY'
import sys; sys.path.insert(0, sys.argv[1])
from check_motion import ACTION_VERBS
cases = {"항공 엔진 디스크부터 플라이휠까지, 회전하는 모든 것이 대상입니다.": False, "센서를 돌리는 장비입니다.": False,
         "축을 회전해 맞춥니다.": True, "뚜껑을 열고": True, "센서를 옮기는 동안": True, "회전하는 순간 잽니다": True}
bad = [t for t, want in cases.items() if bool(ACTION_VERBS.search(t)) != want]
print("ACTION_VERBS adnominal " + ("PASS" if not bad else f"FAIL {bad}")); sys.exit(1 if bad else 0)
PY
"${PW[@]}" - "$ROOT/lib" <<'PY'
# Verb endings come from one conjugation rule on the stem: formal (ㅂ니다/습니다) and past (ㅆ) forms are actions too,
# old spaceless forms still match (공기빼기), and no new false match: -림 nouns, 엽서, 켜켜이/빼곡, a stem inside another
# verb (지켜야, 이끕니다), stateful 붙여 둔.
import sys; sys.path.insert(0, sys.argv[1])
from check_motion import ACTION_VERBS, match_class
yes = {"추를 들어 올립니다.": "up", "컵을 선반에 올렸습니다": "up", "뚜껑을 엽니다": "rise", "축을 회전합니다": "turn", "축을 회전했고": "turn",
       "공기를 뺍니다": "rise", "센서를 옮겼다": "rise", "레버를 내립니다": "down", "밸브를 잠급니다": "fall", "밸브를 잠갔다": "fall",
       "스위치를 켭니다": "rise", "볼트를 풉니다": "rise", "문을 닫습니다": "fall", "핀을 꽂습니다": "rise", "부품을 꺼냅니다": "rise",
       "헤드를 교체했습니다": "rise", "라벨을 붙입니다": "rise", "판을 밉니다": None,
       "공기빼기": "rise", "뚜껑열기": "rise", "다시열어": "rise", "전원켜기": "rise", "덮개닫기": "fall", "핀꽂기": "rise", "볼트풀기": "rise", "공기빼야": "rise", "핀빼서": "rise"}
no = ["올림픽 경기", "엽서를 씁니다", "켜켜이 쌓인", "빼곡히 찬", "내림차순 정렬", "회전율이 높다", "열린 문", "지켜야 할 땅", "일으켜서",
      "라벨을 붙여 둔 상자", "합니다", "풀밭에서", "밀가루", "팀을 이끕니다", "모터를 작동시켜서"]
bad = [t for t in yes if not ACTION_VERBS.search(t)] + [t for t in no if ACTION_VERBS.search(t)]
bad += [t for t, c in yes.items() if c and match_class(t) != c]
print("ACTION_VERBS conjugation " + ("PASS" if not bad else f"FAIL {bad}")); sys.exit(1 if bad else 0)
PY
python3 - "$W/project" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
def save(name, data): (p/name).write_text(json.dumps(data, ensure_ascii=False))
W = [("진공 풀기", 1), ("뚜껑 열기", 2.5), ("센서 옮기기", 4), ("뚜껑 닫기", 5.5), ("공기 빼기", 7)]
text = ", ".join(w for w, _ in W)
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
  let r,scene,cam,mode,valve,open,close,move,vent;
  const u=(t,a,b)=>KIT.clamp((t-a)/(b-a),0,1);
  SCENES.proc={duration:9,init(renderer){
    r=renderer;mode=DATA["proc.fixture"].mode;
    scene=new THREE.Scene();scene.background=new THREE.Color(0x172B38);
    scene.add(new THREE.HemisphereLight(0xffffff,0x607080,2));
    const wall=new THREE.Mesh(new THREE.BoxGeometry(5,3,.1),new THREE.MeshStandardMaterial({color:0x8398A5}));
    wall.position.set(0,1.5,-.1);wall.rotation.y=-.42;scene.add(wall);
    const pivot=new THREE.Group();pivot.position.set(-.8,1.5,.25);
    pivot.lookAt(pivot.position.clone().add(new THREE.Vector3(Math.sin(-.42),0,Math.cos(-.42))));
    const door=new THREE.Mesh(new THREE.CylinderGeometry(.8,.8,.08,48),new THREE.MeshStandardMaterial({color:0xF2A33A}));
    door.rotation.x=Math.PI/2;door.position.set(.8,0,.05);pivot.add(door);scene.add(pivot);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.86,.05,8,32),new THREE.MeshStandardMaterial({color:0x9aa4aa}));
    pivot.updateMatrixWorld(true);rim.name="출입구 테";rim.position.copy(pivot.localToWorld(new THREE.Vector3(.8,0,0)));rim.quaternion.copy(pivot.quaternion);scene.add(rim);
    if(mode==="uncovered")door.position.x=-.8;
    open=KIT.process.hatch(pivot,{axis:"y",from:mode==="reverse"?1.75:0,to:mode==="reverse"?0:1.75,frame:mode==="noframe"?undefined:rim});
    close=KIT.process.hatch(pivot,{axis:"y",from:1.75,to:mode==="half"?.875:0,frame:mode==="noframe"?undefined:rim});
    valve=KIT.process.valve(scene);valve.root.position.set(1.6,1.5,.2);
    const sensor=new THREE.Mesh(new THREE.BoxGeometry(.3,.3,.3),new THREE.MeshStandardMaterial({color:0x6BD8EE}));
    sensor.name=mode==="unlinked"?"":"센서";scene.add(sensor);
    move=KIT.process.move(sensor,[[.6,.4,.8],[.6,1.2,.8],[1.4,1.2,.8],[1.4,.4,.8]]);
    vent=KIT.process.exhaust(scene,{seed:3});vent.root.position.set(1.6,1.8,.2);
    cam=new THREE.PerspectiveCamera(45,16/9,.1,100);cam.position.set(0,2,7);cam.lookAt(0,1.2,0);
  },render(t){
    valve.set(u(t,1.1,2.2)-u(t,7.1,8.3));
    if(t<5.5)open.set(u(t,2.6,3.5));else close.set(u(t,5.6,6.5));
    move.set(mode==="wrong"?0:u(t,4.1,5.3));
    if(mode==="wrong"&&t>=4&&t<5.5)open.set(1-u(t,4.1,4.6)*.5);
    if(mode==="reclose"&&t>=3.6&&t<5.5)open.set(1-u(t,3.6,3.95));
    vent.set(t>=7.1&&t<8.3?u(t,7.1,8.3):0);
    r.render(scene,cam);
  }};
})();
JS
row() { grep -c "^ACTION_MATCH proc '$2' $3 " "$W/$1.log" || true; }
run_case() {
  local name="$1"; shift
  printf '{"mode":"%s"}\n' "${MODE:-$name}" > "$W/project/scenes/proc/fixture.json"
  VIDEO_HTML="$W/$name.html" python3 "$ROOT/lib/build.py" "$W/project" > "$W/$name.build.log"
  "${PW[@]}" "$ROOT/lib/check_motion.py" "$W/$name.html" "$@" > "$W/$name.log" 2>&1 || true
  ! grep -q Traceback "$W/$name.log"
}
ok=1
want() { local case="$1" word="$2" verdict="$3"
  if [ "$(row "$case" "$word" "$verdict")" != 1 ]; then echo "FAIL $case: '$word' is not $verdict"; grep "^ACTION_MATCH" "$W/$case.log" || true; ok=0; fi; }
run_case good
for w in "진공 풀기" "뚜껑 열기" "센서 옮기기" "뚜껑 닫기" "공기 빼기"; do want good "$w" PASS; done
run_case reverse; want reverse "뚜껑 열기" FAIL; want reverse "센서 옮기기" PASS
run_case half; want half "뚜껑 닫기" FAIL; want half "뚜껑 열기" PASS
run_case reclose; want reclose "뚜껑 열기" PASS
run_case wrong; want wrong "센서 옮기기" FAIL; grep -q "target static" "$W/wrong.log" || { echo "FAIL wrong: not target static"; ok=0; }
run_case unlinked; want unlinked "센서 옮기기" FAIL; grep -q "no linked part" "$W/unlinked.log" || { echo "FAIL unlinked: no action_unlinked"; ok=0; }
grep -q "^HATCH_COVER proc PASS .*closed_coverage=" "$W/good.log" || { echo "FAIL good: closed lid does not cover its frame"; grep HATCH_COVER "$W/good.log"; ok=0; }
run_case uncovered; grep -q "^HATCH_COVER proc FAIL .*closed_coverage=" "$W/uncovered.log" || { echo "FAIL uncovered: door beside the opening not caught"; grep HATCH_COVER "$W/uncovered.log"; ok=0; }
run_case noframe; grep -q "^HATCH_COVER proc FAIL .*frame not declared" "$W/noframe.log" || { echo "FAIL noframe: missing frame not caught"; ok=0; }
MODE=good run_case actreverse --mutate actreverse
grep -qx MUTATION_CAUGHT "$W/actreverse.log" || { echo "FAIL actreverse: not caught"; ok=0; }
grep -h -E "^(ACTION_MATCH|HATCH_COVER)" "$W"/{good,reverse,half,wrong,unlinked,uncovered,noframe}.log
# A spinning wheel that carries the named part is the action, not background: the collar ('와이어') is pulled just
# before '풀어' (so it moved in the window that marks background motion) and rises in the span while the wheel turns.
# good: wheel turns, collar rises -> ACTION_SPAN PASS (before: both pinned as background, state 0, FAIL)
# pullonly: wheel holds, the collar moved just before and rises in the span -> PASS (before: the collar was pinned)
# spinonly: collar holds, only the wheel that carries it turns -> PASS (the explained part turning is the action)
# bg: wheel and collar hold, only an unrelated fan turns -> FAIL (real background motion stays background)
SP="$W/spin"; mkdir -p "$SP/build" "$SP/scenes/spin"
python3 - "$SP" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
def save(name, data): (p/name).write_text(json.dumps(data, ensure_ascii=False))
text = "와이어를 당기면, 와이어를 풀어 줍니다"
save("script.json", {"scenes": [{"name": "spin"}]})
save("build/timeline.json", {"fps": 30, "total_s": 7, "fade_in_s": 0, "fade_out_s": 0,
    "order": ["spin"], "modules": {"spin": {"start": 0, "duration": 7}},
    "lines": [{"scene": "spin", "start": 1.5, "end": 6.5, "text": text}]})
save("build/word_times.json", {"lines": [{"scene": "spin", "speech_start": 1.5, "speech_end": 6.5, "text": text,
    "words": [{"word": "당기면", "t": 2.0, "t_scene": 2.0}, {"word": "풀어", "t": 3.2, "t_scene": 3.2},
              {"word": "줍니다", "t": 4.6, "t_scene": 4.6}]}]})
save("scenes/spin/deps.json", {"data": {"spin.fixture": "fixture.json"}})
PY
cat <<'JS' > "$SP/scenes/spin/module.js"
(function(){
  let r,scene,cam,mode,wheel,fan,tension;
  const u=(t,a,b)=>KIT.clamp((t-a)/(b-a),0,1);
  SCENES.spin={duration:7,init(renderer){
    r=renderer;mode=DATA["spin.fixture"].mode;
    scene=new THREE.Scene();scene.background=new THREE.Color(0x172B38);
    scene.add(new THREE.HemisphereLight(0xffffff,0x607080,2));
    const m=c=>new THREE.MeshStandardMaterial({color:c});
    wheel=new THREE.Group();wheel.position.set(-.6,1.2,0);scene.add(wheel);
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(.9,.06,8,40),m(0x9aa4aa)));
    for(let i=0;i<6;i++){const s=new THREE.Mesh(new THREE.BoxGeometry(1.8,.04,.04),m(0xd0d6da));s.rotation.z=i*Math.PI/6;wheel.add(s);}
    const collar=new THREE.Mesh(new THREE.TorusGeometry(.12,.04,8,24),m(0xF2A33A));collar.name="와이어 고리";wheel.add(collar);
    tension=KIT.process.move(collar,[[0,.2,.08],[0,.7,.08]],{name:"와이어"});
    fan=new THREE.Group();fan.position.set(2.4,2.2,-1.5);scene.add(fan);
    for(let i=0;i<3;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(.9,.12,.03),m(0x6BD8EE));b.rotation.z=i*Math.PI/3;fan.add(b);}
    cam=new THREE.PerspectiveCamera(45,16/9,.1,100);cam.position.set(0,1.4,6);cam.lookAt(0,1.2,0);
  },render(t){
    fan.rotation.z=t*2.0;
    wheel.rotation.z=mode==="bg"||mode==="pullonly"?0:t*1.2;
    tension.set(u(t,2.0,3.0)*.4+(mode==="good"||mode==="pullonly"?u(t,3.2,4.4)*.6:0));
    r.render(scene,cam);
  }};
})();
JS
spin_case() {
  printf '{"mode":"%s"}\n' "$1" > "$SP/scenes/spin/fixture.json"
  VIDEO_HTML="$W/spin_$1.html" python3 "$ROOT/lib/build.py" "$SP" > "$W/spin_$1.build.log"
  "${PW[@]}" "$ROOT/lib/check_motion.py" "$W/spin_$1.html" > "$W/spin_$1.log" 2>&1 || true
  ! grep -q Traceback "$W/spin_$1.log"
}
spin_want() { local case="$1" verdict="$2"
  spin_case "$case" || { echo "FAIL spin $case: traceback"; ok=0; }
  if ! grep -q "^ACTION_SPAN spin '풀어' $verdict " "$W/spin_$case.log"; then
    echo "FAIL spin $case: '풀어' span is not $verdict"; grep "^ACTION_SPAN" "$W/spin_$case.log" || true; ok=0; fi
  grep "^ACTION_SPAN spin '풀어'" "$W/spin_$case.log" || true; }
spin_want good PASS
spin_want pullonly PASS
spin_want spinonly PASS
spin_want bg FAIL
[ "$ok" = 1 ] && echo "ACTION_MATCH_TESTS PASS" || { echo "ACTION_MATCH_TESTS FAIL"; exit 1; }
