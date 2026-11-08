#!/usr/bin/env bash
# Depth-tested silhouette coverage, opaque cards, own-label exclusion and legacy SKIP.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export TMPDIR="$(mktemp -d)"
W="${OCCLUSION_EVIDENCE:-$TMPDIR/occlusion}"
mkdir -p "$W"
python3 - "$ROOT" "$W" <<'PY'
import pathlib, sys
root, work = map(pathlib.Path, sys.argv[1:])
three = next((root / "vendor").glob("three*.js")).read_text()
kit = (root / "kit/scene_kit.js").read_text()
for case in ("normal", "depth75", "depth25", "dom75", "dom25", "own", "fallback",
             "group", "orthographic", "legacy", "accent45", "focus45", "look45",
             "lookoff", "arc86", "effective516", "effective430", "card39", "late",
             "accenthidden", "capcover", "fadecover", "focustiny", "looktiny",
             "letterbox", "letterboxcard", "letterboxlate", "pillarbox", "letterboxpanel",
             "glow", "glowshader", "rain", "glowdepth75", "ownparts", "shaderwall", "ownsparks",
             "selflid", "selflidblock", "selflidnear"):
    html = """<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;width:1920px;height:1080px;--ui:sans-serif}
#stage,.overlay{position:absolute;inset:0}
</style><div id="stage"></div><div class="overlay"></div>"""
    html += "<script>" + three + "</script><script>" + kit + "</script>"
    html += """<script>
const mode=MODE, scene=new THREE.Scene(), camera=mode==='orthographic'?
  new THREE.OrthographicCamera(-32/9,32/9,2,-2,.1,100):new THREE.PerspectiveCamera(45,1920/1080,.1,100);
scene.background=new THREE.Color('#80949b');
camera.position.set(0,0,5); camera.lookAt(0,0,0); camera.updateMatrixWorld();
const renderer=new THREE.WebGLRenderer(); renderer.setSize(1920,1080);
document.querySelector('#stage').append(renderer.domElement);
const automatic=['accent45','focus45','look45','lookoff','arc86','effective516','effective430','card39','late'].includes(mode);
const target=new THREE.Mesh(mode==='arc86'?new THREE.TorusGeometry(.8,.06,8,96):new THREE.PlaneGeometry(2,2),
  new THREE.MeshBasicMaterial({color:['accent45','arc86','accenthidden'].includes(mode)?0xF2A33A:0xffaa00}));
target.name=mode==='arc86'?'accent-arc':'Explained target';
const explained=mode==='group'||mode==='ownparts'?new THREE.Group():target;
if(explained!==target) explained.add(target);
scene.add(explained);
// Target partly behind a frame bar: low edge under a 2.35:1 letterbox bar, left edge under a 4:3 pillarbox bar.
if(mode.startsWith('letterbox')) explained.position.y=-1.5;
if(mode==='pillarbox') explained.position.x=-3;
// Weather behind a wall, not part of the target: big additive lamp halos (built-in or soft-particle shader points)
// and bright rain streaks. The wall hides them in the scene; they must not count as target pixels either.
const weather=['glow','glowshader','rain','glowdepth75'].includes(mode);
if(weather){
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(14,8),new THREE.MeshBasicMaterial({color:0x2a3a40}));
  wall.position.z=-1; scene.add(wall);
  const pos=[];
  if(mode==='rain') for(let i=0;i<600;i++){const x=-4+8*i/600, y=-2.5+(i*37%50)/10; pos.push(x,y,-2,x+.05,y+1.2,-2);}
  else for(let i=0;i<20;i++) for(let j=0;j<10;j++) pos.push(-4+8*i/19,-2+4*j/9,-2);
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  const glow={transparent:true,depthWrite:false,blending:THREE.AdditiveBlending};
  scene.add(mode==='rain'?new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0xffffff,opacity:.9,...glow}))
    :mode==='glowshader'?new THREE.Points(geo,new THREE.ShaderMaterial({...glow,
      vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=48.0;}',
      fragmentShader:'void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(1.,.9,.7,1.-r*r);}'}))
    :new THREE.Points(geo,new THREE.PointsMaterial({color:0xfff0d0,size:48,sizeAttenuation:false,opacity:.9,...glow})));
}
// Dark points, lines and soft-particle points that belong to the target group (beside and above the plate) are target.
if(mode==='ownparts'){
  const dark=new THREE.Color(0x203040), pts=[], lines=[], top=[];
  for(let i=0;i<5;i++) for(let j=0;j<5;j++) {pts.push(1.3+.25*i,-.5+.25*j,0); top.push(-.5+.25*i,1.2+.1*j,0);}
  for(let i=0;i<20;i++) lines.push(-2.4+.05*i,-.6,0,-2.4+.05*i,.6,0);
  const geo=a=>{const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(a,3)); return g;};
  explained.add(new THREE.Points(geo(pts),new THREE.PointsMaterial({color:dark,size:24,sizeAttenuation:false})));
  explained.add(new THREE.LineSegments(geo(lines),new THREE.LineBasicMaterial({color:dark})));
  explained.add(new THREE.Points(geo(top),new THREE.ShaderMaterial({
    vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=24.0;}',
    fragmentShader:'void main(){gl_FragColor=vec4(.125,.19,.25,1.);}'})));
}
// Soft-particle sparks of the target itself (additive, no depth write, a helper after main()), with a wall behind
// them added later: they count as target and the wall does not paint over them.
if(mode==='ownsparks'){
  const pos=[]; for(let i=0;i<6;i++) for(let j=0;j<6;j++) pos.push(1.2+.2*i,-.5+.2*j,.05);
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(pos.map((_,i)=>[.2,.3,.4][i%3]),3));   // per-spark colour
  explained.add(new THREE.Points(geo,new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,vertexColors:true,
    vertexShader:'varying vec3 vC;void main(){vC=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=20.0;}',
    fragmentShader:'varying vec3 vC;float fall(float r);\\n// void main() is below\\nvoid main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(vC,fall(r));}\\nfloat fall(float r){return 1.-r*r;}\\n// end'})));
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(14,8),new THREE.MeshBasicMaterial({color:0x2a3a40}));
  wall.position.z=-1; scene.add(wall);
}
// A real opaque block drawn by a custom shader (white, alpha 0, a helper after main(), a trailing comment) is cover.
if(mode==='shaderwall'){
  const block=new THREE.Mesh(new THREE.PlaneGeometry(1.5,2.5),new THREE.ShaderMaterial({
    vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'vec3 col();\\nvoid main(){gl_FragColor=vec4(col(),0.0);}\\nvec3 col(){return vec3(1.);}\\n// end'}));
  block.position.set(-.25,0,.01); scene.add(block);
}
if(mode.startsWith('depth')||mode==='glowdepth75'){
  const width=mode==='depth75'||mode==='glowdepth75'?1.5:.5;
  const block=new THREE.Mesh(new THREE.PlaneGeometry(width,2.5),new THREE.MeshBasicMaterial({color:0x16323c}));
  block.position.set(-1+width/2,0,.01); scene.add(block);
}
if(mode==='focustiny'||mode==='looktiny') target.scale.setScalar(.03);   // focus group a few pixels wide, hidden by the block below
if(mode==='looktiny') window.LOOK={on:true,subject:[target]};   // look.js picks the focus group as LOOK.subject
if(mode==='accenthidden'||mode==='focustiny'||mode==='looktiny'){   // accent part the scene itself hides (probe tip inside a block)
  const block=new THREE.Mesh(new THREE.PlaneGeometry(3,3),new THREE.MeshBasicMaterial({color:0x16323c}));
  block.position.set(0,0,.2); scene.add(block);
}
// Self-occlusion: a focused device whose closed lid (pivot > lid > shell) hides its inner deck, disc ring and axle,
// in a room: a back wall with bright scene particles behind it. The device's own parts hiding each other are not cover,
// and the particles behind the wall are not the device. Another object in front of most of it still is cover.
let device=null;
if(mode.startsWith('selflid')){
  target.visible=false;
  if(mode==='selflidnear'){camera.position.set(0,0,2.5); camera.updateMatrixWorld();}
  const part=(parent,geo,color,z,turn=true)=>{const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide}));
    if(turn) m.rotation.x=Math.PI/2; m.position.z=z; parent.add(m); return m;};
  device=new THREE.Group(); device.name='Closed-lid device'; scene.add(device);
  part(device,new THREE.CylinderGeometry(.9,.9,.3,48),0x9aa8b0,0);              // body
  part(device,new THREE.CylinderGeometry(.93,.93,.05,48),0x56636b,-.12);        // lower band
  part(device,new THREE.CircleGeometry(.8,48),0x3a4a52,.16,false);              // deck under the lid
  part(device,new THREE.RingGeometry(.6,.66,64),0xcdd3d8,.165,false);           // disc seat ring
  part(device,new THREE.CylinderGeometry(.05,.05,.06,16),0x222222,.18);         // axle
  const led=new THREE.Mesh(new THREE.TorusGeometry(.95,.02,8,64),new THREE.MeshBasicMaterial({color:0x1fa8ff}));
  led.position.z=.1; device.add(led);
  const pivot=new THREE.Group(), lid=new THREE.Group(); pivot.position.set(0,.9,.2); lid.position.set(0,-.9,0);
  device.add(pivot); pivot.add(lid);
  part(lid,new THREE.CylinderGeometry(.9,.88,.03,48),0xd9e7ee,.015);             // closed lid shell over the inner parts
  part(lid,new THREE.CircleGeometry(.2,24),0x88aacc,.032,false);                 // window
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(14,8),new THREE.MeshStandardMaterial({color:0x2a3a40}));
  wall.position.z=-1; scene.add(wall); scene.add(new THREE.AmbientLight(0xffffff,1.5));
  if(mode!=='selflidnear'){
    const pos=[]; for(let i=0;i<20;i++) for(let j=0;j<10;j++) pos.push(-4+8*i/19,-2+4*j/9,-2);
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xfff0d0,size:48,sizeAttenuation:false,opacity:.9,
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})));
  }
  if(mode==='selflidblock'){   // another object in front of about four fifths of the device
    const block=new THREE.Mesh(new THREE.PlaneGeometry(1.4,2.5),new THREE.MeshBasicMaterial({color:0x16323c}));
    block.position.set(-.25,0,.6); scene.add(block);
  }
}
const overlay=document.querySelector('.overlay');
const bars=[];
if(mode.startsWith('letterbox')||mode==='pillarbox')   // fixed black frame bars over the stage, outside the picture
  for(const css of mode==='pillarbox'?['left:0;top:0;width:240px;height:1080px','right:0;top:0;width:240px;height:1080px']
      :mode==='letterboxpanel'?['left:0;bottom:0;width:1920px;height:200px']   // one black panel on one edge: a card, not a bar
      :['left:0;top:0;width:1920px;height:131px','left:0;bottom:0;width:1920px;height:131px']) {
    const bar=document.createElement('div'); bar.style.cssText='position:absolute;background:#000;z-index:4;'+css;
    document.body.append(bar); bars.push(bar);
  }
if(mode==='letterboxcard'){   // a real card over the target inside the picture still covers it
  const card=document.createElement('div'); card.id='real-card'; overlay.append(card);
  card.style.cssText='position:absolute;left:700px;top:600px;width:520px;height:349px;background:rgba(10,22,30,.86)';
}
const label=KIT.label(overlay,'Explained target',mode==='fallback'?{}:{target:explained});
if(mode==='legacy'||automatic||mode.startsWith('selflid')||mode==='accenthidden'||mode==='focustiny'||mode==='looktiny') delete window.__KIT_LABELS;
if(mode==='capcover'||mode==='fadecover'){   // rv's own caption box / scene fade over the target: not explanation cards
  const ui=document.createElement('div'); ui.id=mode==='capcover'?'cap':'fade'; document.body.append(ui);
  const inner=mode==='capcover'?Object.assign(document.createElement('div'),{className:'box',textContent:'5 mm caption'}):ui;
  if(inner!==ui) ui.append(inner);
  inner.style.cssText=mode==='capcover'?'position:absolute;left:560px;top:240px;width:600px;height:600px;color:#fff;background:rgba(10,22,30,.86)'
    :'position:absolute;inset:0;background:#000;opacity:.6';
}
if(mode==='look45'||mode==='lookoff') window.LOOK={on:mode==='look45',subject:[target]};
let card;
if(mode.startsWith('dom')||automatic){
  if(mode==='arc86'){
    window.SOURCES={numbers:[{id:'angle',show:['90°'],kind:'design'}]};
    card=KIT.info.numCard(overlay,{id:'angle'}).box;
    card.style.opacity='1';
  } else {card=document.createElement('div'); overlay.append(card);}
  // Exact projected target left edge and 25/75% of its width.
  const radius=mode==='arc86'?.86:1;
  const left=new THREE.Vector3(-radius,radius,0).project(camera), right=new THREE.Vector3(radius,-radius,0).project(camera);
  const x=(left.x+1)*960,y=(1-left.y)*540,width=(right.x-left.x)*960,height=(left.y-right.y)*540;
  const fraction=mode==='dom25'?.25:mode==='card39'?.39:mode==='arc86'?.6:mode==='lookoff'?.75:automatic?.45:.75;
  card.style.cssText+=`;position:absolute;box-sizing:border-box;left:${x}px;top:${y}px;width:${width*fraction}px;height:${height}px;background:rgba(10,22,30,.86)`;
  if(mode==='effective516'||mode==='effective430'){
    const parent=document.createElement('div'); parent.style.opacity=mode==='effective516'?'.6':'.5';
    overlay.append(parent); parent.append(card);
  }
}
window.DATA={timeline:{total_s:1}};
window.renderReady=Promise.resolve();
window.renderAt=async t=>{
  KIT.fx.reset();
  if(['focus45','effective516','effective430','card39','late','focustiny','looktiny'].includes(mode)) KIT.fx.focus(target);
  if(device) KIT.fx.focus(device);
  if(mode==='late') card.style.opacity=t>=.5?'1':'0';
  if(mode==='letterboxlate') bars[1].style.opacity=t>=.5?'1':'0';   // a black strip that is not there all the time is a card
  window.HL='Explained target';
  label.place(camera,new THREE.Vector3(),mode==='own'?0:device?-760:500,mode==='own'?0:device?-420:-170,1);   // device cases: tag in the corner, off the device
  renderer.render(scene,camera);
};
</script>""".replace("MODE", repr(case))
    (work / (case + ".html")).write_text(html)
PY
PW=(uv run -q --no-project --with playwright --with pillow python)
run() {
  local name="$1" expected="$2" rc=0
  shift 2
  "${PW[@]}" "$ROOT/lib/check_layout.py" "$W/$name.html" --at .5 "$@" > "$W/$name${*:+-mutation}.log" 2>&1 || rc=$?
  local log="$W/$name${*:+-mutation}.log"
  local want="$expected"; [[ "$expected" == cut ]] && want=1   # cut: a card over 10..90% of the target (owner 2026-11-08 19:37)
  if [[ "$rc" != "$want" ]]; then
    printf 'Unexpected exit %s (wanted %s): %s\n' "$rc" "$expected" "$log"
    return 1
  fi
  grep -E 'OCCLUSION |OCCLUSION_CHECK|MUTATION_|LAYOUT_CHECK' "$log"
  if [[ "$expected" == cut ]]; then
    grep -q '| cut |' "$log" && ! grep -q '| occlude |' "$log"
  elif [[ "$expected" == 1 ]]; then
    grep -q '| occlude |' "$log"
  else
    grep -qx 'LAYOUT_CHECK PASS' "$log"
  fi
}
run normal 0
run depth75 1
run depth25 0
run dom75 1
run dom25 cut
run own 0
grep -q 'visible_fraction=1.000' "$W/own.log"
run fallback 0
grep -q 'source=world-point' "$W/fallback.log"
run group 0
grep -q 'visible_fraction=1.000' "$W/group.log"
run orthographic 0
grep -q 'visible_fraction=1.000' "$W/orthographic.log"
run legacy 0
grep -q 'OCCLUSION_CHECK 실제 SKIP' "$W/legacy.log"
run accent45 1
grep -q 'source=accent' "$W/accent45.log"
run focus45 1
grep -q 'source=focus' "$W/focus45.log"
run look45 1
grep -q 'source=LOOK.subject' "$W/look45.log"
run lookoff 0
grep -q 'OCCLUSION_CHECK 실제 SKIP' "$W/lookoff.log"
run arc86 1
grep -q "text='accent-arc'.*source=accent" "$W/arc86.log"
run effective516 1
run effective430 0
grep -q 'card_coverage=0.000' "$W/effective430.log"
run card39 cut
run focustiny 0
grep -q 'auto target too small on screen' "$W/focustiny.log"
run looktiny 0
grep -q 'auto target too small on screen' "$W/looktiny.log"
# Overlap lines name the other element (id, tag, size), not only its text.
rc=0; "${PW[@]}" "$ROOT/lib/check_layout.py" "$W/normal.html" --at .5 --mutate overlap > "$W/overlap-name.log" 2>&1 || rc=$?
[[ "$rc" == 1 ]] && grep -Eq "overlap \| with='MUTATION overlap [AB]' \([^ ]+ div [0-9]+x[0-9]+\)" "$W/overlap-name.log"
# Fixed letterbox/pillarbox bars are outside the picture: the target part under them is off-picture, not covered.
run letterbox 0
grep -q "visible_fraction=1.000000 .*card='none'" "$W/letterbox.log"
grep -q 'LAYOUT_PICTURE bars=2 ' "$W/letterbox.log"
run pillarbox 0
grep -q "visible_fraction=1.000000 .*card='none'" "$W/pillarbox.log"
run letterboxcard 1
grep -q "card='real-card'" "$W/letterboxcard.log"
run letterboxpanel 1
if grep -q 'LAYOUT_PICTURE' "$W/letterboxpanel.log"; then echo 'letterboxpanel: a lone panel read as a frame bar'; exit 1; fi
# A black strip that appears only from 0.5 s is not a frame bar: it covers the target like any card.
rc=0
"${PW[@]}" "$ROOT/lib/check_layout.py" "$W/letterboxlate.html" --from .25 --to .76 --every .25 > "$W/letterboxlate.log" 2>&1 || rc=$?
[[ "$rc" == 1 ]]
grep -q 'LAYOUT_PICTURE bars=0 ' "$W/letterboxlate.log"
grep -Eq '\| 0.500 \| Explained target \| (occlude|cut) \|' "$W/letterboxlate.log"
# Weather that is not part of the target (halo points, soft-particle points, rain lines) is not counted as target,
# so a wall hiding it is no cover. A real block in front still FAILs with the halos there. Points, lines and shader
# points under the target's own group count as target pixels.
for weather in glow glowshader rain; do
  run "$weather" 0
  grep -q "visible_fraction=1.000000 required>=0.500 pixels=$(grep -o 'pixels=[0-9]*/[0-9]*' "$W/normal.log" | head -1 | cut -d= -f2)" "$W/$weather.log"
done
run glowdepth75 1
grep -q "pixels=$(grep -o 'pixels=[0-9]*/[0-9]*' "$W/depth75.log" | head -1 | cut -d= -f2) " "$W/glowdepth75.log"
run ownparts 0
plate=$(grep -o 'pixels=[0-9]*/[0-9]*' "$W/normal.log" | head -1 | cut -d/ -f2)
owned=$(grep -o 'pixels=[0-9]*/[0-9]*' "$W/ownparts.log" | head -1 | cut -d/ -f2)
(( owned > plate + 1500 )) || { echo "ownparts: target pixels $owned, plate alone $plate"; exit 1; }
run ownsparks 0
sparks=$(grep -o 'visible_fraction=[0-9.]* required>=0.500 pixels=[0-9]*/[0-9]*' "$W/ownsparks.log" | head -1)
[[ "$sparks" == visible_fraction=1.000000* ]] && (( ${sparks##*/} > plate + 1000 )) || { echo "ownsparks: $sparks, plate alone $plate"; exit 1; }
run shaderwall 1
grep -q "pixels=$(grep -o 'pixels=[0-9]*/[0-9]*' "$W/depth75.log" | head -1 | cut -d= -f2) " "$W/shaderwall.log"
# Self-occlusion: the closed lid over the device's inner parts is the device, the particles behind the wall are not.
run selflid 0
grep -q "text='Closed-lid device' visible_fraction=1.000000 .*source=focus" "$W/selflid.log"
run selflidnear 0
grep -q "text='Closed-lid device' visible_fraction=1.000000 .*source=focus" "$W/selflidnear.log"
run selflidblock 1
grep -q '| 0.500 | Closed-lid device | occlude |' "$W/selflidblock.log"
lidded=$(grep -o 'pixels=[0-9]*/[0-9]*' "$W/selflid.log" | head -1 | cut -d/ -f2)
blocked=$(grep -o 'pixels=[0-9]*/[0-9]*' "$W/selflidblock.log" | head -1 | cut -d/ -f2)
[[ -n "$lidded" && "$lidded" == "$blocked" ]] || { echo "selflid: device pixels $lidded, with the block $blocked"; exit 1; }   # the block hides the device, it is not the device
run accenthidden 0
grep -q 'accent part hidden by the scene itself' "$W/accenthidden.log"
run capcover 0
grep -q 'card_coverage=0.000' "$W/capcover.log"
run fadecover 0
grep -q 'card_coverage=0.000' "$W/fadecover.log"
run normal 1 --mutate occlude
grep -qx MUTATION_CAUGHT "$W/normal-mutation.log"
run normal 0
# Scan both moments: the first frame is clean, the later card must fail.
rc=0
"${PW[@]}" "$ROOT/lib/check_layout.py" "$W/late.html" --from .25 --to .76 --every .25 > "$W/span.log" 2>&1 || rc=$?
[[ "$rc" == 1 ]]
grep -q 'OCCLUSION t=0.250 .*card_coverage=0.000' "$W/span.log"
grep -q '| 0.500 | Explained target | occlude |' "$W/span.log"
grep -q 'samples=3 ' "$W/span.log"
grep -qx 'LAYOUT_CHECK FAIL' "$W/span.log"
# --at retains explicit-moment semantics when a span is also supplied.
"${PW[@]}" "$ROOT/lib/check_layout.py" "$W/late.html" --from .5 --to .9 --at .25 > "$W/at.log" 2>&1
grep -q 'samples=1 ' "$W/at.log"
grep -qx 'LAYOUT_CHECK PASS' "$W/at.log"
echo "OCCLUSION_TESTS PASS"
