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
             "accenthidden", "capcover", "fadecover", "focustiny", "looktiny"):
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
const explained=mode==='group'?new THREE.Group():target;
if(explained!==target) explained.add(target);
scene.add(explained);
if(mode.startsWith('depth')){
  const width=mode==='depth75'?1.5:.5;
  const block=new THREE.Mesh(new THREE.PlaneGeometry(width,2.5),new THREE.MeshBasicMaterial({color:0x16323c}));
  block.position.set(-1+width/2,0,.01); scene.add(block);
}
if(mode==='focustiny'||mode==='looktiny') target.scale.setScalar(.03);   // focus group a few pixels wide, hidden by the block below
if(mode==='looktiny') window.LOOK={on:true,subject:[target]};   // look.js picks the focus group as LOOK.subject
if(mode==='accenthidden'||mode==='focustiny'||mode==='looktiny'){   // accent part the scene itself hides (probe tip inside a block)
  const block=new THREE.Mesh(new THREE.PlaneGeometry(3,3),new THREE.MeshBasicMaterial({color:0x16323c}));
  block.position.set(0,0,.2); scene.add(block);
}
const overlay=document.querySelector('.overlay');
const label=KIT.label(overlay,'Explained target',mode==='fallback'?{}:{target:explained});
if(mode==='legacy'||automatic||mode==='accenthidden'||mode==='focustiny'||mode==='looktiny') delete window.__KIT_LABELS;
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
  if(mode==='late') card.style.opacity=t>=.5?'1':'0';
  window.HL='Explained target';
  label.place(camera,new THREE.Vector3(),mode==='own'?0:500,mode==='own'?0:-170,1);
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
  if [[ "$rc" != "$expected" ]]; then
    printf 'Unexpected exit %s (wanted %s): %s\n' "$rc" "$expected" "$log"
    return 1
  fi
  grep -E 'OCCLUSION |OCCLUSION_CHECK|MUTATION_|LAYOUT_CHECK' "$log"
  if [[ "$expected" == 1 ]]; then
    grep -q '| occlude |' "$log"
  else
    grep -qx 'LAYOUT_CHECK PASS' "$log"
  fi
}
run normal 0
run depth75 1
run depth25 0
run dom75 1
run dom25 0
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
run card39 0
run focustiny 0
grep -q 'auto target too small on screen' "$W/focustiny.log"
run looktiny 0
grep -q 'auto target too small on screen' "$W/looktiny.log"
# Overlap lines name the other element (id, tag, size), not only its text.
rc=0; "${PW[@]}" "$ROOT/lib/check_layout.py" "$W/normal.html" --at .5 --mutate overlap > "$W/overlap-name.log" 2>&1 || rc=$?
[[ "$rc" == 1 ]] && grep -Eq "overlap \| with='MUTATION overlap [AB]' \([^ ]+ div [0-9]+x[0-9]+\)" "$W/overlap-name.log"
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
