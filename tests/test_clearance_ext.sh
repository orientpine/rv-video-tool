#!/bin/bash
# Standalone browser fixtures cover contracted and home-made human figures.
set -euo pipefail
TOOL="$(cd "$(dirname "$0")/.." && pwd)"
export TMPDIR="${TMPDIR:-$(mktemp -d)}"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
python3 - "$TOOL" "$W" <<'PY'
from pathlib import Path
import sys
tool, work = map(Path, sys.argv[1:])
three = (tool / "vendor/three-0.147.0.min.js").read_text()
kit = (tool / "kit/scene_kit.js").read_text()
fixture = r"""
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45,16/9,.01,100);
camera.position.set(3,2,3); camera.lookAt(0,.7,0);
const renderer = new THREE.WebGLRenderer(); renderer.setSize(960,540); document.body.append(renderer.domElement);
scene.background = new THREE.Color(0xeeeeee); scene.add(new THREE.HemisphereLight(0xffffff,0x666666,2));
const box = (name,size,pos,color=0x888888,parent=scene) => {
 const o = new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color}));
 o.name=name; o.position.set(...pos); parent.add(o); return o;
};
const support=box('holder',[.2,.1,.2],[-.8,.45,0]);
const sensor=box('X sensor',[.05,.08,.05],[-.8,.54,0],0xffaa22);
const seat=box('seat',[.6,.1,.6],[.3,.45,0]);
const floor=box('floor',[2,.05,2],[.3,-.025,0]);
const levers=[box('lever L',[.04,.08,.04],[.05,.85,.3]),box('lever R',[.04,.08,.04],[.55,.85,.3])];
const h=new THREE.Group(); h.name='operator'; h.userData.rvHuman=true; h.userData.pose='sit'; scene.add(h);
const pelvis=box('pelvis',[.3,.16,.25],[.3,.58,0],0x4477aa,h); pelvis.userData.rvPart='pelvis';
const torso=box('torso',[.3,.4,.2],[.3,.86,0],0x4477aa,h); torso.userData.rvPart='torso';
const marker=(p)=>{const o=new THREE.Object3D();o.position.set(...p);h.add(o);return o;};
h.userData.contacts={seat:marker([.3,.5,0]),feet:[marker([.2,0,.5]),marker([.4,0,.5])],
 hands:[marker([.05,.9,.3]),marker([.55,.9,.3])]};
const wall=box('cabin wall',[.1,1,.8],[1.2,.7,0]);
const mode=MODE, overlay=document.createElement('div');document.body.append(overlay);
const autoLabel=KIT.label(overlay,'explained X sensor',['auto-explicit','auto-descendant','auto-ancestor'].includes(mode)?{target:sensor}:{});
const second=mode==='auto-two'?box('second part',[.05,.08,.05],[-1.3,.56,0]):null;
const secondLabel=second?KIT.label(overlay,'second part',{target:second}):null;
if(mode==='auto-descendant')box('own child',[.01,.01,.01],[0,0,0],0x888888,sensor);
if(mode==='auto-ancestor'){
 const parent=box('own ancestor',[.01,.01,.01],[-.8,.54,0]);parent.attach(sensor);
}
if(mode==='auto-held')box('robot hand',[.06,.04,.06],[-.8,.58,.05]);
if(mode==='auto-hollow'){
 const shell=new THREE.Mesh(new THREE.CylinderGeometry(2,2,3,24,1,true),new THREE.MeshStandardMaterial({side:THREE.BackSide}));
 shell.position.y=.7;scene.add(shell);
}
if(mode==='auto-instance'){
 const inst=new THREE.InstancedMesh(new THREE.BoxGeometry(.2,.1,.2),new THREE.MeshStandardMaterial(),2);
 inst.setMatrixAt(0,new THREE.Matrix4());inst.setMatrixAt(1,new THREE.Matrix4().makeTranslation(-.8,.45,0));scene.add(inst);
}
if(mode==='auto-effect'){
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.03,.002,8,16),
   new THREE.MeshBasicMaterial({transparent:true,opacity:.8,depthWrite:false}));
 ring.rotation.y=Math.PI/2;ring.position.copy(sensor.position);scene.add(ring);
}
if(mode==='auto-zero-instance'){
 const inst=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshStandardMaterial(),1);
 inst.setMatrixAt(0,new THREE.Matrix4().compose(sensor.position,new THREE.Quaternion(),new THREE.Vector3(0,0,0)));scene.add(inst);
}
if(['env-chamber','env-open'].includes(mode)){
 const chamber=new THREE.Mesh(new THREE.CylinderGeometry(7.6,7.6,9.2,32,1,true),
   new THREE.MeshStandardMaterial({side:mode==='env-chamber'?THREE.BackSide:THREE.FrontSide}));
 chamber.name='chamber wall';chamber.position.y=4.6;scene.add(chamber);
}
if(mode==='env-double'){
 const sheet=box('two-sided sheet',[.1,1,.8],[.3,.7,0]);sheet.material.side=THREE.DoubleSide;
}
if(mode==='env-flat')box('flat drawing sheet',[.02,2,2],[.3,.7,0]);
if(mode==='env-human')box('surrounding environment',[2,3,2],[.3,.7,0]);
if(mode==='env-camera')box('camera environment',[4,3,4],[2.25,1,1.5]);
if(mode==='solid-sphere'){
 const joint=new THREE.Mesh(new THREE.SphereGeometry(.15,16,12),new THREE.MeshStandardMaterial());
 joint.name='machine spherical joint';joint.position.set(.3,.86,0);scene.add(joint);
}
if(mode.startsWith('legacy-')){
 delete h.userData.rvHuman;
 h.traverse(o=>{delete o.userData.rvPart;});
 const head=new THREE.Mesh(new THREE.SphereGeometry(.12,12,8),pelvis.material);
 head.name='head';head.position.set(.3,1.25,0);h.add(head);
 if(['legacy-shape','legacy-cab','legacy-cab-unnamed'].includes(mode)){
   h.clear();h.add(head);
   const limbs=mode==='legacy-shape'?
     [[.3,.86,0,.12,.38],[.08,.82,0,.055,.25],[.52,.82,0,.055,.25],
      [.2,.4,.3,.06,.4],[.4,.4,.3,.06,.4]]:[[.3,.86,0,.12,.38]];
   for(const [x,y,z,r,length] of limbs){
     const part=new THREE.Mesh(new THREE.CapsuleGeometry(r,length,4,8),pelvis.material);
     part.position.set(x,y,z);h.add(part);
   }
   if(mode==='legacy-shape')h.name='';
   else {
     h.name=mode==='legacy-cab'?'operator':'';
     box('cab frame',[.2,.4,.6],[.3,.72,0]);
   }
 }
 if(mode==='legacy-box')h.name='';
 if(mode==='legacy-ancestor'){
   h.remove(head);
   h.name='';const owner=new THREE.Group();owner.name='운전자';scene.add(owner);owner.add(h);
 }
 if(mode==='legacy-named')h.remove(head);
}
window.renderReady=Promise.resolve();
window.renderAt=async t=>{
 KIT.fx.reset(); h.visible=true;
 sensor.position.y=.54; h.position.y=0;
 autoLabel.box.style.display='none';
 if(mode.startsWith('auto-')){
   h.visible=false;
   if(mode==='auto-ancestor')sensor.position.y=0;
   if(['auto-float','auto-descendant','auto-ancestor','auto-invisible','auto-hollow','auto-two'].includes(mode))sensor.position.y+=.02;
   if(mode==='auto-instance')support.position.y=.2;
   if(['auto-five','auto-held'].includes(mode))support.position.y=.445;
   if(mode==='auto-over-five')support.position.y=.4449;
   if(mode==='auto-hidden-parent')overlay.style.opacity='.01';
   if(mode==='auto-invisible'){wall.position.copy(sensor.position);wall.visible=false;}
   camera.updateMatrixWorld();
   autoLabel.place(camera,mode==='auto-explicit'?new THREE.Vector3(9,9,9):sensor.getWorldPosition(new THREE.Vector3()),100,-40,mode==='auto-hidden'?0:1);
   if(secondLabel)secondLabel.place(camera,second.position,100,-100,1);
   renderer.render(scene,camera);return;
 }
 if(mode==='skip'){h.visible=false;renderer.render(scene,camera);return;}
 if(mode.startsWith('legacy-')){
   if(['legacy-sunk','legacy-named','legacy-ancestor','legacy-shape','legacy-box','legacy-hidden'].includes(mode))h.position.y=-.1;
   if(mode==='legacy-hidden')h.visible=false;
   renderer.render(scene,camera);return;
 }
 KIT.fx.attach(sensor,support,{tol_mm:2});
 KIT.fx.seat(h,{seat,floor,levers});
 if(mode==='float')sensor.position.y+=.02;
 if(mode==='threshold')sensor.position.y+=.0015;
 if(mode==='attach-penetration')sensor.position.y-=.02;
 if(mode==='contain')sensor.position.y=.45;
 if(mode==='diagonal'){
   support.geometry=new THREE.SphereGeometry(.1,16,12); support.position.set(-.8,.5,0);
   sensor.geometry=new THREE.SphereGeometry(.04,16,12); sensor.position.set(-.69,.61,0);
 }
 if(mode==='sink')h.position.y=-.1;
 if(mode==='wall')wall.position.x=.3;
 if(mode==='human-threshold')wall.position.x=.495;
 if(mode==='hand')h.userData.contacts.hands[0].position.x=2;
 if(mode==='foot')h.userData.contacts.feet[0].position.y=-.03;
 if(mode==='offseat')h.userData.contacts.seat.position.x=3;
 if(mode==='self')box('internal human detail',[.1,.1,.1],[.3,.86,0],0x4477aa,h);
 if(mode==='invisible') {wall.position.x=.3;wall.visible=false;}
 if(mode==='reset'){KIT.fx.reset();h.visible=false;}
 renderer.render(scene,camera);
};
"""
for mode in ["normal","float","threshold","attach-penetration","contain","diagonal","sink","wall","human-threshold","hand","foot","offseat","self","invisible","skip","reset",
             "auto-contact","auto-explicit","auto-float","auto-five","auto-over-five","auto-held","auto-hidden","auto-hidden-parent","auto-descendant","auto-ancestor","auto-invisible","auto-hollow","auto-instance","auto-effect","auto-two","auto-zero-instance",
             "env-chamber","env-open","env-double","env-flat","env-human","env-camera","solid-sphere",
             "legacy-seated","legacy-sunk","legacy-cab","legacy-cab-unnamed","legacy-shape","legacy-box","legacy-named","legacy-ancestor","legacy-hidden"]:
    js = fixture.replace("MODE",repr(mode))
    html = "<html><head><meta charset=\"utf-8\"></head><body><script>"+three+"</script><script>\nwindow.DATA={\"timeline\":{\"total_s\":0.1}};\n"+kit+"\n"+js+"</script></body></html>"
    (work / (mode+".html")).write_text(html)
(work / "lost.html").write_text((work / "normal.html").read_text().replace("</body>", """<script>
window.renderReady = new Promise(resolve => {
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); resolve(); }, {once: true});
  renderer.forceContextLoss();
});
</script></body>"""))
PY
run() {
  local mode="$1" expected="$2"; shift 2
  local status=0
  uv run -q --no-project --with playwright --with pillow python "$TOOL/lib/check_clearance.py" "$W/$mode.html" "$@" >"$W/result.log" 2>&1 || status=$?
  cat "$W/result.log"
  [ "$status" = "$expected" ] || { echo "FAIL $mode exit $status expected $expected"; exit 1; }
  if [ "$expected" = 1 ]; then grep -q 'CLEARANCE_CHECK .* FAIL' "$W/result.log"; fi
}
for mode in legacy-sunk legacy-cab legacy-cab-unnamed legacy-shape legacy-box legacy-named legacy-ancestor; do
  run "$mode" 1 --rules mesh; grep -q 'human penetration' "$W/result.log"
done
run legacy-seated 0 --rules mesh; grep -q 'human=3' "$W/result.log"
run legacy-hidden 0 --rules mesh; grep -q 'human=0' "$W/result.log"
run normal 0
run lost 1 --rules mesh; grep -q 'PAGE_ERROR WebGL context lost' "$W/result.log"
run normal 1 --mutate detach; grep -q MUTATION_CAUGHT "$W/result.log"
run normal 1 --mutate sink; grep -q MUTATION_CAUGHT "$W/result.log"
run float 0 --rules legacy; grep -q SKIP "$W/result.log"
run float 1 --rules mesh
for mode in float attach-penetration contain diagonal sink wall hand foot offseat; do run "$mode" 1; done
for mode in threshold human-threshold self invisible; do run "$mode" 0; done
for mode in skip reset; do run "$mode" 0; grep -q SKIP "$W/result.log"; done
for mode in env-chamber env-open env-double env-flat env-human env-camera; do
  run "$mode" 0 --rules mesh
  ! grep -q 'human penetration' "$W/result.log"
done
run solid-sphere 1 --rules mesh; grep -q 'human penetration' "$W/result.log"
for mode in auto-contact auto-explicit auto-five auto-held auto-instance auto-effect auto-zero-instance; do run "$mode" 0 --rules mesh; grep -q 'auto=3' "$W/result.log"; done
for mode in auto-float auto-over-five auto-descendant auto-ancestor auto-invisible auto-hollow; do run "$mode" 1 --rules mesh; grep -q 'auto floating' "$W/result.log"; done
for mode in auto-hidden auto-hidden-parent; do run "$mode" 0 --rules mesh; grep -q SKIP "$W/result.log"; done
run auto-float 0 --rules legacy; grep -q SKIP "$W/result.log"
run auto-contact 1 --rules mesh --mutate detach; grep -q MUTATION_CAUGHT "$W/result.log"
run auto-effect 1 --rules mesh --mutate detach; grep -q MUTATION_CAUGHT "$W/result.log"
run auto-zero-instance 1 --rules mesh --mutate detach; grep -q MUTATION_CAUGHT "$W/result.log"
run auto-two 1 --rules mesh
python3 - "$W/result.log" <<'PY'
import json, sys
rows = [json.loads(line.split(" ", 1)[1]) for line in open(sys.argv[1])
        if line.startswith("CLEARANCE_AUTO_FAIL ")]
assert len(rows) == 2, rows
assert all(r["start_s"] == 0 and r["end_s"] == .1 and r["min_gap_mm"] > 5 for r in rows), rows
PY
echo "CLEARANCE_EXT_TESTS PASS"
