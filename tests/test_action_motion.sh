#!/usr/bin/env bash
# Isolated renderer fixtures: DOM motion/camera motion must not impersonate action.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
W="${ACTION_EVIDENCE:-$(mktemp -d)}"
mkdir -p "$W/project/build" "$W/project/scenes/process"
export TMPDIR="$(mktemp -d)"
export PYTHONDONTWRITEBYTECODE=1
PW=(uv run -q --no-project --with playwright --with pillow python)
python3 - "$W/project" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
def save(name, data): (p/name).write_text(json.dumps(data, ensure_ascii=False))
save("script.json", {"scenes":[{"name":"process"}]})
save("build/timeline.json", {"fps":30,"total_s":8,"fade_in_s":0,"fade_out_s":0,
    "order":["process"],"modules":{"process":{"start":0,"duration":8}},
    "steps":[{"n":1,"label":"공정","start":0,"end":8}],
    "captions":[{"t":1,"text":"첫 번째 안내"},{"t":3,"text":"다음 안내"},{"t":5,"text":"마지막 안내"}],
    "lines":[{"scene":"process","start":1,"end":7,"text":"뚜껑 열기"}]})
save("build/word_times.json", {"lines":[{"scene":"process","speech_start":1,"speech_end":7,
    "text":"진공 풀기, 뚜껑 열기, 공기 빼기","words":[
    {"word":w,"t":t,"t_scene":t} for w,t in [("진공 풀기",1),("뚜껑 열기",3),("공기 빼기",5)]]}]})
save("scenes/process/deps.json", {"data":{"process.fixture":"fixture.json"}})
PY
cat <<'JS' > "$W/project/scenes/process/module.js"
(function(){
  let r,scene,cam,valve,gauge,lid,part,vent,steps,card,mode,ambient,label,num,chip,parent,trackingGroup,split;
  SCENES.process={duration:8,init(renderer,T,ov){
    r=renderer;mode=DATA["process.fixture"].mode;
    scene=new THREE.Scene();scene.background=new THREE.Color(0x172B38);
    scene.add(new THREE.HemisphereLight(0xffffff,0x607080,2));
    ambient=new THREE.Mesh(new THREE.BoxGeometry(.5,.8,.4),new THREE.MeshStandardMaterial({color:0x8398A5}));
    ambient.position.set(2.5,1,0);scene.add(ambient);
    if(mode.startsWith("caption_follow"))ambient.name="tracking-subject";
    if(mode==="caption_explode"){
      trackingGroup=new THREE.Group();trackingGroup.name="tracking-subject";trackingGroup.position.y=1;
      for(const x of [-.4,.4]){
        const piece=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),new THREE.MeshStandardMaterial({color:0x6BD8EE}));
        piece.position.x=x;trackingGroup.add(piece);
      }
      scene.add(trackingGroup);split=KIT.fx.explode(trackingGroup,[1,0,0]);
    }
    cam=new THREE.PerspectiveCamera(45,16/9,.1,100);cam.position.set(0,2,7);cam.lookAt(0,1,0);
    parent=new THREE.Group();scene.add(parent);parent.add(cam);
    valve=KIT.process.valve(scene);valve.root.position.set(-1.6,1.5,.2);
    gauge=KIT.process.gauge(scene);gauge.root.position.set(-.7,1.5,.2);
    lid=new THREE.Group();lid.position.set(.5,1,0);scene.add(lid);
    const hatchMesh=new THREE.Mesh(new THREE.BoxGeometry(1.5,.12,1),new THREE.MeshStandardMaterial({color:0xF2A33A}));
    hatchMesh.position.z=.5;lid.add(hatchMesh);
    const rim=new THREE.Mesh(new THREE.BoxGeometry(1.4,.02,.9),new THREE.MeshStandardMaterial({color:0x607080}));rim.position.set(.5,.92,.5);scene.add(rim);
    const hinge=KIT.process.hatch(lid,{frame:rim}), close=KIT.process.hatch(lid,{from:-Math.PI*.65,to:0,frame:rim});
    part=new THREE.Mesh(new THREE.BoxGeometry(.3,.3,.3),new THREE.MeshStandardMaterial({color:0x6BD8EE}));scene.add(part);
    const move=KIT.process.move(part,[[.8,.6,.7],[.8,1.8,.7],[1.8,1.8,.7],[1.8,.6,.7]]);
    vent=KIT.process.exhaust(scene,{seed:23});vent.root.position.set(-1.6,1.7,.2);
    steps=DATA.words.lines.length?KIT.process.steps("process",[
      {word:"진공 풀기",run:u=>{valve.set(u);gauge.set(u);vent.set(u)}},
      {word:"뚜껑 열기",run:u=>{hinge.set(u);move.set(u)}},
      {word:"공기 빼기",run:u=>{close.set(u);valve.set(1-u);gauge.set(1-u);vent.set(u)}}
    ],{overlay:ov,left:80,top:150}):{render(){}};
    card=document.createElement("div");card.style.cssText="position:absolute;left:80px;top:300px;color:white;font:40px sans-serif";ov.append(card);
    label=KIT.label(ov,"부품 설명");
    SOURCES={numbers:[{id:"fixture",show:["100 kPa"],kind:"design"}]};
    num=KIT.info.numCard(ov,{id:"fixture",caption:"압력 안내",left:80,top:150});
    chip=document.createElement("span");chip.className="chip";chip.textContent="부품 안내";document.getElementById("steps").append(chip);
    if(mode==="cuts")KIT.shot.declare("process",[{t:0},{t:2},{t:4}]);
    if(mode.startsWith("ui_only"))KIT.shot.declare("process",[{t:0,kind:"ui-only"}]);
    if(mode==="caption_declared")KIT.shot.declare("process",[{t:0},{t:3,kind:"scene"}]);
    if(mode.startsWith("caption_follow")||mode==="caption_explode")
      KIT.shot.declare("process",[{t:0,kind:mode==="caption_explode"?"explode":"follow",
        subject:mode==="caption_follow_missing"?undefined:"tracking-subject"}]);
    window.PROCESS_FIXTURE={scene,steps,valve,gauge,vent,part,lid,renderer:r,cam,ambient};
  },render(t){
    steps.render(["static","camera","camera_parent","cuts","ambient","matrix"].includes(mode)?0:t);
    const starts=[1,3,5],pulse=starts.reduce((sum,a)=>{const u=(t-a)/.8;return sum+(u>0&&u<1?Math.sin(Math.PI*u)**2:0)},0);
    cam.position.set(0,2,7);parent.rotation.y=mode==="camera_parent"?t*.01:0;
    ambient.rotation.z=mode==="ambient"?t:0;
    if(mode==="matrix"){
      const u=KIT.clamp((t-1)/6,0,1);
      part.matrixAutoUpdate=false;
      part.matrix.makeTranslation(.8+u,.6+Math.sin(Math.PI*u)*.5,.7);
      part.matrixWorldNeedsUpdate=true;
      const a=ambient.geometry.attributes.position;
      for(let i=0;i<a.count;i++)a.setY(i,(i%2?.4:-.4)*(1+u));
      a.needsUpdate=true;ambient.material.color.setRGB(.4+u*.3,.6,.7-u*.3);
    }
    if(mode==="hidden"){scene.children.forEach(o=>{if(o.isGroup)o.visible=false});part.visible=false;}
    if(mode==="camera"){cam.position.x=t*.1;cam.lookAt(0,1,0);}
    if(["nudge","labelnudge","numcardnudge","chipnudge","plain_nudge"].includes(mode))cam.position.x=pulse*.12;
    if(mode==="large")cam.position.x=pulse*2;
    if(mode==="continuous")cam.position.x=t*.025;
    if(mode==="caption_drift")cam.position.x=t*.04;
    if(mode==="caption_large")cam.position.x=2*KIT.smooth(3,3.3,t);
    if(mode==="caption_declared")cam.position.x=t>=3?2:0;
    if(mode==="caption_gap")cam.position.x=t>=2?2:0;
    if(mode.startsWith("caption_follow")){
      ambient.position.set(mode==="caption_follow_static"?0:t*.1,1,0);
      cam.position.copy(ambient.position).add(new THREE.Vector3(mode==="caption_follow_static"?t*.04:0,1,7));
      cam.lookAt(ambient.position.clone().add(new THREE.Vector3(mode==="caption_follow_bad"?1:0,0,0)));
    }
    if(mode==="caption_explode"){
      split.set(t*.1);
      cam.position.set(7*Math.sin(t*.03),2,7*Math.cos(t*.03));cam.lookAt(trackingGroup.position);
    }
    if(mode==="eased_nudge")cam.position.x=starts.reduce((sum,a)=>sum+.12*KIT.smooth(a,a+2,t),0);
    if(mode==="single")cam.position.x=t>1&&t<1.8?.12*Math.sin(Math.PI*(t-1)/.8)**2:0;
    if(mode==="ui_only")cam.position.x=t*1e-5;
    if(["labelnudge","numcardnudge","chipnudge","plain_nudge","plain_good"].includes(mode))
      for(const s of steps.items||[])s.card.box.style.display="none";
    if(mode.startsWith("caption_"))
      for(const s of steps.items||[])s.card.box.style.display="none";
    if(mode==="caption_inset_move")cam.position.x=t*.04;
    const fade=starts.reduce((sum,a)=>sum+KIT.smooth(a,a+.15,t)*(1-KIT.smooth(a+1,a+1.15,t)),0);
    cam.updateMatrixWorld(true);
    label.place(cam,new THREE.Vector3(0,1,0),0,-80,mode==="labelnudge"?fade:0);
    num.show(mode==="numcardnudge"?fade:0);
    chip.style.display=mode==="chipnudge"&&fade>.15?"inline-block":"none";
    card.textContent=mode==="cuts"?["진공 풀기","뚜껑 열기","공기 빼기"][Math.min(2,Math.floor(t/2))]:
      mode.startsWith("plain_")&&fade>.15?"상태 안내":"";
    if(mode==="telemetry")card.innerHTML="<span>온도 "+t.toFixed(1)+" °C</span>";
    // Visible animated DOM must not hide a frozen WebGL scene.
    card.style.transform=`translateX(${t*20}px)`;
    r.render(scene,cam);
    if(mode.startsWith("caption_inset")&&t>=3){   // 5 mm zoom inset drawn last by an origin camera
      const ic=window.__insetCam||(window.__insetCam=new THREE.OrthographicCamera(-1,1,1,-1,.1,50));
      ic.position.set(0,3,5.3);ic.lookAt(0,0,0);ic.updateMatrixWorld(true);
      r.setScissorTest(true);r.setViewport(1500,700,360,300);r.setScissor(1500,700,360,300);
      r.render(scene,ic);
      r.setViewport(0,0,1920,1080);r.setScissor(0,0,1920,1080);r.setScissorTest(false);
    }
  }};
})();
JS
run_case() {
  local name="$1" mode="$2" expected="$3"; shift 3
  printf '{"mode":"%s"}\n' "$mode" > "$W/project/scenes/process/fixture.json"
  VIDEO_HTML="$W/$name.html" python3 "$ROOT/lib/build.py" "$W/project" > "$W/$name.build.log"
  local rc=0
  "${PW[@]}" "$ROOT/lib/check_motion.py" "$W/$name.html" "$@" > "$W/$name.log" 2>&1 || rc=$?
  if [[ "$expected" == SKIP ]]; then
    [[ "$rc" == 0 ]] && grep -q "ACTION_MOTION_CHECK 실제 SKIP" "$W/$name.log"
  elif [[ "$expected" == PASS ]]; then
    [[ "$rc" == 0 ]] && grep -qx "MOTION_CHECK PASS" "$W/$name.log"
  else
    [[ "$rc" == 1 ]] && grep -qx "MOTION_CHECK FAIL" "$W/$name.log"
  fi
  printf '%s exit=%s expected=%s\n' "$name" "$rc" "$expected"
}
if [[ "${CAMERA_TEXT_BASELINE:-0}" == 1 ]]; then
  run_case caption_drift caption_drift PASS
  run_case caption_large caption_large PASS
  echo "CAMERA_TEXT_BASELINE false PASSs reproduced"
  exit 0
fi
run_case good good PASS
run_case caption_drift caption_drift FAIL
run_case caption_large caption_large FAIL
run_case caption_still caption_still PASS
run_case caption_inset caption_inset PASS
run_case caption_inset_move caption_inset_move FAIL
run_case caption_declared caption_declared FAIL
grep -q "declared shot, but text changes" "$W/caption_declared.log"
run_case caption_gap caption_gap PASS
run_case caption_follow caption_follow PASS
grep -q "^CAMERA_UI_EXEMPT .*kind=follow subject='tracking-subject'" "$W/caption_follow.log"
run_case caption_follow_bad caption_follow_bad FAIL
grep -q "invalid follow" "$W/caption_follow_bad.log"
run_case caption_follow_missing caption_follow_missing FAIL
grep -q "missing named subject" "$W/caption_follow_missing.log"
run_case caption_follow_static caption_follow_static FAIL
grep -q "subject_motion=0.000000m" "$W/caption_follow_static.log"
run_case caption_explode caption_explode PASS
grep -q "^CAMERA_UI_EXEMPT .*kind=explode" "$W/caption_explode.log"
run_case freeze good FAIL --mutate freeze
grep -qx MUTATION_CAUGHT "$W/freeze.log"
run_case camnudge good FAIL --mutate camnudge
grep -qx MUTATION_CAUGHT "$W/camnudge.log"
grep -q text_camera_motion "$W/camnudge.log"
run_case nudge nudge FAIL
run_case eased_nudge eased_nudge FAIL
grep -q text_camera_motion "$W/eased_nudge.log"
run_case labelnudge labelnudge FAIL
run_case numcardnudge numcardnudge FAIL
run_case chipnudge chipnudge FAIL
run_case ui_only ui_only FAIL
grep -q ui_only_camera "$W/ui_only.log"
run_case ui_only_good ui_only_good PASS
run_case large large FAIL
run_case continuous continuous FAIL
run_case single single FAIL
run_case telemetry telemetry PASS
grep -q "total=4 " "$W/telemetry.log"
run_case static static FAIL
run_case camera camera FAIL
grep -q "action_static" "$W/camera.log"
run_case camera_parent camera_parent FAIL
grep -q "action_static" "$W/camera_parent.log"
run_case matrix matrix PASS
run_case matrix_freeze matrix FAIL --mutate freeze
grep -qx MUTATION_CAUGHT "$W/matrix_freeze.log"
run_case ambient ambient FAIL
run_case hidden hidden FAIL
run_case cuts cuts FAIL
grep -q repeated_card_cut "$W/cuts.log"
# Missing alignment still checks the timeline narration.
cp "$W/project/build/word_times.json" "$W/words.json"
printf '{"lines":[]}\n' > "$W/project/build/word_times.json"
run_case timeline static FAIL
grep -q source=timeline "$W/timeline.log"
# No narration action: visible action cards are still checked.
printf '{"fps":30,"total_s":8,"fade_in_s":0,"fade_out_s":0,"order":["process"],"modules":{"process":{"start":0,"duration":8}}}\n' > "$W/project/build/timeline.json"
run_case cards cuts FAIL
grep -q source=card "$W/cards.log"
run_case no_action static SKIP
run_case plain_nudge plain_nudge FAIL
grep -q text_camera_motion "$W/plain_nudge.log"
run_case plain_good plain_good PASS
# Binder requires alignment; restore it for a deterministic seek/card test.
cp "$W/words.json" "$W/project/build/word_times.json"
run_case good good PASS
"${PW[@]}" - "$W/good.html" "$ROOT/lib" "$W/matrix.html" <<'PY'
import asyncio,sys
from pathlib import Path
sys.path.insert(0,sys.argv[2])
from capture import CHROME, CHROME_ARGS
from playwright.async_api import async_playwright
from check_motion import ACTION_PROBE
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(executable_path=CHROME,headless=True,args=CHROME_ARGS)
        p=await b.new_page()
        await p.goto(Path(sys.argv[1]).as_uri());await p.evaluate("window.renderReady")
        result=await p.evaluate("""async()=>{
          const snap=async t=>{await renderAt(t);const f=PROCESS_FIXTURE;
            return JSON.stringify({wheel:f.valve.wheel.rotation.z,value:f.gauge.value,lid:f.lid.rotation.x,
              part:f.part.position.toArray(),vent:f.vent.root.children.map(o=>o.position.toArray()),
              cards:f.steps.items.map(s=>getComputedStyle(s.card.box).display)});};
          const a=await snap(3.6);await snap(6.9);await snap(.5);const b=await snap(3.6);
          if(a!==b)throw Error('seeking changes process pose');
          await renderAt(.999);if(PROCESS_FIXTURE.steps.items.some(s=>getComputedStyle(s.card.box).display!=='none'))throw Error('card early');
          await renderAt(1);if(getComputedStyle(PROCESS_FIXTURE.steps.items[0].card.box).display==='none')throw Error('card late');
          const g=PROCESS_FIXTURE.gauge;g.set(0);
          if(g.value!==0||Math.abs(g.needle.rotation.z-7*Math.PI/6)>1e-9)throw Error('gauge min');
          g.set(1);if(g.value!==100||Math.abs(g.needle.rotation.z+Math.PI/6)>1e-9)throw Error('gauge max');
          return 'PROCESS_KIT deterministic seek, exact word card, gauge endpoints PASS';
        }""")
        print(result)
        await p.goto(Path(sys.argv[3]).as_uri());await p.evaluate("window.renderReady")
        await p.evaluate("""()=>{
          window.__motion={};
          const r=PROCESS_FIXTURE.renderer,raw=r.render;
          r.render=function(scene,camera){
            Object.assign(__motion,{scene,camera,renderer:r,raw});
            return raw.call(r,scene,camera);
          };
        }""")
        frozen=await p.evaluate("code=>eval('('+code+')')([[1,1.5,2,2.5,3],true,true])",ACTION_PROBE)
        assert frozen["state"]==0 and frozen["pixels"]==0 and frozen["rgb"]<.02, frozen
        moving=await p.evaluate("code=>eval('('+code+')')([[1,1.5,2,2.5,3],false,true])",ACTION_PROBE)
        assert moving["state"]>.1 and moving["pixels"]>=.001, moving
        print("PROCESS_FREEZE manual matrices, buffer geometry, material snapshot PASS")
        await b.close()
asyncio.run(main())
PY
"${PW[@]}" "$ROOT/tests/test_camera_scene_cut.py"
"${PW[@]}" "$ROOT/tests/test_camera_action.py"
"${PW[@]}" "$ROOT/tests/test_shot_parts.py"
echo "ACTION_MOTION_TESTS PASS"
