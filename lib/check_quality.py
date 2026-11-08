"""Quality signals for a short-brief video: place, story, people, density and card size.

Every other rv check asks "is anything broken". This one asks "is there enough on screen": a video can pass every
strict check while showing one object on a bare floor in front of a flat wall, with no person, no story and number
cards covering a big part of the frame. It samples build/video.html at --every
seconds inside each scene (away from transitions) and reports per scene:

  QUALITY_EMPTY      flat screen tiles (no texture, no edges) over --empty of the frame: bare floor, plain wall, empty sky
  QUALITY_SPARSE     fewer than --objects distinct things on screen (a set is many objects at several depths)
  QUALITY_NO_PEOPLE  no KIT.fx.human in the whole video, or none in a scene whose beat is "problem" or "after"
  QUALITY_CARD       cards (opaque text panels, not captions or pictures) cover more than --card of the frame
  QUALITY_STORY      script.json scenes[].beat missing, or the beats lack problem / inside / result / after, or "problem" not first
  QUALITY_FAKE_FX    a flat plate named smoke/steam/flame/section, or a large flat translucent panel, instead of KIT.fx.smoke/
                     steam/flame/section (a smoke plate, a glass box standing in for a cut)
  QUALITY_TEXT_HIDDEN 3D text (a sign plate with canvas text) at least 15% behind another solid, measured by depth rays
                     (a pipe passing in front of a tank's name plate); KIT.label and KIT.sign are always on top
  QUALITY_PLACE      a scene has no scenes[].place (where the story happens), or names a KIT.place kind it never builds

Exceptions with a reason: script.json scenes[].quality_ok = {"EMPTY": "why this scene may be empty"} for one scene,
or top-level "quality_ok" = {"NO_PEOPLE": "..."} for the whole video. A reason under 15 characters does not count.
Each exception is printed as QUALITY_EXEMPT so a reader sees it.

Mutations (self-tests, rv runs them): --mutate card (a 900x500 opaque card on every frame) must give QUALITY_CARD;
Exemptions (quality_ok) are ignored while a mutation runs.
--mutate empty (every mesh and scene.background hidden) must give QUALITY_EMPTY and QUALITY_SPARSE in every sampled scene;
--mutate people (every KIT.fx.human hidden) must give QUALITY_NO_PEOPLE (MUTATION_SKIP when the video has no people).
"""
import argparse
import asyncio
import io
import json
import math
import os
import statistics
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture import CHROME, CHROME_ARGS  # noqa: E402

BEATS = ("problem", "inside", "result", "after")
PEOPLE_BEATS = ("problem", "after")
REASON_MIN = 15
HELLO_ONLY = "(examples/hello only)"   # marks the demo's own reasons; copied into another project they do not count

HOOK = r"""
window.__qScenes=new Map();
const QualityRenderer=THREE.WebGLRenderer;
THREE.WebGLRenderer=function(...args){
 const r=new QualityRenderer(...args),raw=r.render;
 r.render=function(s,c){
  if(!s.isScene||!c||!c.isCamera) return raw.call(this,s,c);
  window.__qScenes.set(s,c);
  const mut=window.__qMutate, hidden=[], bg=s.background;
  if(mut==='empty'){ s.background=null; s.traverse(o=>{if(o.isMesh&&o.visible){o.visible=false;hidden.push(o);}}); }
  if(mut==='people') s.traverse(o=>{if(o.userData&&o.userData.rvHuman&&o.visible){o.visible=false;hidden.push(o);}});
  try {return raw.call(this,s,c);} finally {for(const o of hidden)o.visible=true; if(mut==='empty') s.background=bg;}
 };
 return r;
};
THREE.WebGLRenderer.prototype=QualityRenderer.prototype;
"""

FRAME = r"""mutate => {
 const shown=o=>{for(let x=o;x;x=x.parent) if(!x.visible) return false; return true;};
 const solid=m=>[].concat(m.material).some(x=>x&&x.visible!==false&&!(x.transparent&&x.opacity<.05));
 const human=o=>{for(let x=o;x;x=x.parent) if(x.userData&&x.userData.rvHuman) return x; return null;};
 const place=o=>{for(let x=o;x;x=x.parent) if(x.userData&&x.userData.rvPlace) return x.userData.rvPlace; return null;};
 const box=new THREE.Box3(), v=new THREE.Vector3(), size=new THREE.Vector3();
 function screen(o,cam){   // clipped NDC area fraction (0..1) of o's world box, or 0 when behind the camera / outside
  box.setFromObject(o); if(box.isEmpty()) return 0;
  let x0=1,x1=-1,y0=1,y1=-1,any=false;
  for(let i=0;i<8;i++){
   v.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).applyMatrix4(cam.matrixWorldInverse);
   if(-v.z<=cam.near) continue; any=true; v.applyMatrix4(cam.projectionMatrix);
   x0=Math.min(x0,v.x);x1=Math.max(x1,v.x);y0=Math.min(y0,v.y);y1=Math.max(y1,v.y);}
  if(!any) return 0;
  x0=Math.max(x0,-1);x1=Math.min(x1,1);y0=Math.max(y0,-1);y1=Math.min(y1,1);
  return Math.max(0,x1-x0)*Math.max(0,y1-y0)/4;
 }
 const out={objects:0,names:[],humans:0,places:[],fake:[],hidden:[]};
 const FXNAME=/smoke|연기|매연|steam|증기|fume|exhaust|배기|flame|불꽃|불길|plasma|플라즈마|cutaway|section|단면|투시/i;
 const tagged=o=>{for(let x=o;x;x=x.parent){const u=x.userData||{}; if(u.rvFx||u.rvEnv||u.rvPlace||u.rvHuman) return true;} return false;};
 const fxNamed=o=>{for(let x=o;x;x=x.parent) if(x.name&&FXNAME.test(x.name)) return x.name; return null;};
 const humans=new Set(), places=new Set(), mutHidden=[];
 let realHumans=0;
 for(const [scene] of window.__qScenesFrame||[]) scene.traverse(o=>{
  if(o.userData&&o.userData.rvHuman&&o.visible) realHumans++;
  if(o.visible&&((mutate==='empty'&&o.isMesh)||(mutate==='people'&&o.userData&&o.userData.rvHuman))){o.visible=false;mutHidden.push(o);}
 });
 // Only scenes drawn for this frame (renderAt draws the current scene; a transition draws two).
 for(const [scene,cam] of window.__qScenesFrame||[]){
  cam.updateMatrixWorld(true);
  const shownMesh=o=>o.isMesh&&shown(o)&&solid(o);
  const hasShown=o=>{let f=false;o.traverse(m=>{if(!f&&shownMesh(m))f=true;});return f;};
  // A "thing": a child of the scene, or for an environment-sized root (place kit, world set, ground) its children,
  // two levels deep. A thing counts when it is drawn and covers at least 0.1% of the frame.
  const visit=(o,depth)=>{
   if(!o.visible||o.isLight||o.isCamera) return;
   const h=human(o); if(h){ if(hasShown(h)&&screen(h,cam)>=.002) humans.add(h.uuid); return; }
   const p=place(o); if(p) places.add(p);
   box.setFromObject(o); if(box.isEmpty()) return;
   const diag=box.getSize(size).length();
   if((o.userData.rvEnv||o.userData.rvPlace||diag>20||o.children.length>=8)&&depth<2&&o.children.length){   // a fleet or a set counts by its members
    for(const c of o.children) visit(c,depth+1); if(!o.isMesh) return; }
   if(!hasShown(o)) return;
   const a=screen(o,cam); if(a<.001) return;
   out.objects++; if(out.names.length<12) out.names.push(o.name||o.type);
  };
  for(const c of scene.children) visit(c,0);
  // 3D text (a flat mesh showing a canvas texture: sign plates, name boards) hidden behind other solids (a pipe in
  // front of a tank's name plate). Rays from the camera to a 7x3 grid on the plate; a ray that hits another solid first
  // counts as covered. Plates drawn on top (depthTest false, KIT.sign) and parts of the same KIT.process gauge are not counted.
  const ray=new THREE.Raycaster(), solids=[];
  scene.traverse(m=>{ if(m.isMesh&&!m.isInstancedMesh&&shown(m)&&[].concat(m.material).some(x=>x&&x.visible!==false&&!(x.transparent&&x.opacity<.5))&&!(m.userData&&m.userData.rvProp)) solids.push(m); });
  const gaugeRoot=o=>{for(let x=o;x;x=x.parent) if((window.__rvProcess||[]).some(e=>e.obj===x)) return x; return null;};
  const inside=(o,root)=>{for(let x=o;x;x=x.parent) if(x===root) return true; return false;};
  const cp=cam.getWorldPosition(new THREE.Vector3());
  scene.traverse(m=>{
   if(!m.isMesh||!shown(m)||tagged(m)) return;
   const mat=[].concat(m.material)[0]; if(!mat||!mat.map||mat.depthTest===false) return;
   const img=mat.map.image; if(!(mat.map.isCanvasTexture||(img&&img.tagName==='CANVAS'))||mat.map.userData.rvSurface) return;   // kit surface textures (wood, paint, hatch) carry no text
   if(!m.geometry.boundingBox) m.geometry.computeBoundingBox();
   const bb=m.geometry.boundingBox, d=bb.getSize(new THREE.Vector3()), dd=[d.x,d.y,d.z].sort((a,b)=>a-b);
   if(!(dd[2]>0.05&&dd[0]<0.05*dd[2])) return;
   const ws=new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
   if(Math.max(ws.x,ws.y,ws.z)>3||ws.y<=Math.min(ws.x,ws.z)) return;   // a name board: at most 3 m and standing up (not a textured floor)
   if(screen(m,cam)<.0008) return;
   const g=gaugeRoot(m); let total=0, covered=0;
   for(let i=0;i<7;i++) for(let j=0;j<3;j++){
    const lp=new THREE.Vector3(), u=(i+.5)/7, w=(j+.5)/3;
    lp.x=d.x===dd[0]?(bb.min.x+bb.max.x)/2:bb.min.x+(bb.max.x-bb.min.x)*u;
    lp.y=d.y===dd[0]?(bb.min.y+bb.max.y)/2:bb.min.y+(bb.max.y-bb.min.y)*(d.x===dd[0]?u:w);
    lp.z=d.z===dd[0]?(bb.min.z+bb.max.z)/2:bb.min.z+(bb.max.z-bb.min.z)*w;
    const wp=m.localToWorld(lp), ndc=wp.clone().project(cam); if(Math.abs(ndc.x)>1||Math.abs(ndc.y)>1||ndc.z>1) continue;
    const dir=wp.clone().sub(cp), dist=dir.length(); ray.set(cp,dir.normalize()); ray.far=dist-0.01;
    total++;
    const hit=ray.intersectObjects(solids,false).find(h=>h.object!==m&&!(g&&inside(h.object,g)));
    if(hit) covered++;
   }
   if(total>=6&&covered/total>=.15) out.hidden.push(`${m.name||(m.parent&&m.parent.name)||'text plate'} ${Math.round(100*covered/total)}% covered`);
  });
  // Cheap stand-ins for effects: smoke as one flat plate, a "cutaway" as a translucent panel in front of a solid.
  scene.traverse(m=>{
   if(!m.isMesh||m.isInstancedMesh||!shown(m)||tagged(m)) return;
   box.setFromObject(m); if(box.isEmpty()) return;
   const s3=box.getSize(size), dims=[s3.x,s3.y,s3.z].sort((a,b)=>a-b), flat=dims[2]>0.15&&dims[0]<0.03*dims[2];
   if(!flat||s3.y===dims[0]) return;   // lying flat (floor decal, shadow disc) is not a stand-in for smoke or a cut
   const mats=[].concat(m.material), clear=mats.some(x=>x&&x.transparent&&x.opacity>0.08&&x.opacity<0.85);
   const named=fxNamed(m), a=screen(m,cam);
   if(named&&a>=.003) out.fake.push(`${named}: flat ${dims[2].toFixed(2)} m panel`);
   else if(clear&&a>=.02){   // a see-through panel stands in for a cut only when a solid part sits right behind it (not a far haze card)
    const c=box.getCenter(new THREE.Vector3()), cp2=cam.getWorldPosition(new THREE.Vector3()), dir=c.clone().sub(cp2), dist=dir.length();
    const rc=new THREE.Raycaster(cp2,dir.normalize(),dist+0.001,dist+1.5); rc.camera=cam;
    const behind=rc.intersectObjects(scene.children,true).find(h=>h.object!==m&&h.object.isMesh&&shown(h.object)&&!tagged(h.object)&&[].concat(h.object.material).some(x=>x&&!(x.transparent&&x.opacity<.5)));
    if(behind) out.fake.push(`${m.name||m.type}: flat translucent panel ${(a*100).toFixed(1)}% of frame in front of ${behind.object.name||behind.object.type}`);
   }
  });
 }
 for(const o of mutHidden) o.visible=true;
 out.realHumans=realHumans; out.humans=humans.size; out.places=[...places];
 // Cards: opaque panels with text (the definition check_layout OCCLUSION uses), not rv's captions/steps/fade,
 // not the scene badge and not still pictures (KIT.info.picture, data-rv-picture: they are content, sized by check_motion).
 if(mutate==='card'&&!document.querySelector('[data-quality-mutation]')){
  const c=document.createElement('div'); c.dataset.qualityMutation=''; c.textContent='MUTATION card';
  c.style.cssText='position:absolute;z-index:999;left:120px;top:160px;width:900px;height:500px;background:#0a161e;color:#fff;font:700 60px sans-serif';
  document.body.append(c);}
 const visible=e=>{for(let a=e;a;a=a.parentElement){const s=getComputedStyle(a);if(s.display==='none'||s.visibility!=='visible'||+s.opacity<=.05)return false;}return e.getBoundingClientRect().width>0;};
 const cards=[...document.querySelectorAll('body *')].filter(e=>{
  if(!visible(e)||e instanceof SVGElement||e.matches('html,body,canvas,#stage,.overlay,#badge')||e.closest('#cap,#steps,#fade,#matte,[data-rv-picture]')) return false;
  if(!e.textContent.trim()) return false;
  const c=getComputedStyle(e).backgroundColor.match(/[\d.]+/g); let op=1;
  for(let a=e;a;a=a.parentElement) op*=+getComputedStyle(a).opacity;
  return c&&(c.length<4?1:+c[3])*op>=.5;});
 const W=240,H=135,grid=new Uint8Array(W*H); let big={name:'',area:0};
 for(const e of cards){const r=e.getBoundingClientRect();
  const a=Math.max(0,Math.min(1920,r.right)-Math.max(0,r.left))*Math.max(0,Math.min(1080,r.bottom)-Math.max(0,r.top));
  if(a>big.area) big={name:(e.textContent.trim().replace(/\s+/g,' ').slice(0,40)),area:a};
  for(let y=Math.max(0,Math.floor(r.top/8));y<Math.min(H,Math.ceil(r.bottom/8));y++)
   for(let x=Math.max(0,Math.floor(r.left/8));x<Math.min(W,Math.ceil(r.right/8));x++) grid[y*W+x]=1;}
 const PIC=window.PICTURE||{w:1920,h:1080}; out.card=grid.reduce((s,x)=>s+x,0)/(W*H)*(1920*1080)/(PIC.w*PIC.h); out.cardName=big.name;
 return out;
}"""


def flat_fraction(png, picture=None):
    """Share of 48x48 px tiles with no visible structure inside the picture (letterbox bars of "aspect" left out):
    8x8 block means (grain averages out), tile range < 5 levels."""
    g = np.asarray(Image.open(io.BytesIO(png)).convert("L").resize((1920, 1080)), dtype=np.float32)
    blocks = g.reshape(135, 8, 240, 8).mean(axis=(1, 3))                 # 135 x 240 block means
    tiles = blocks[:132].reshape(22, 6, 40, 6)                            # 48 px tiles (bottom 24 px dropped)
    spread = tiles.max(axis=(1, 3)) - tiles.min(axis=(1, 3))
    if picture:
        x, y, w, h = picture["x"], picture["y"], picture["w"], picture["h"]
        cy = (np.arange(22) * 48 + 24)[:, None]; cx = (np.arange(40) * 48 + 24)[None, :]
        inside = (cy >= y) & (cy < y + h) & (cx >= x) & (cx < x + w)
        return float((spread[inside] < 5).mean()) if inside.any() else 0.0
    return float((spread < 5).mean())


def scene_spans(timeline):
    spans, t = [], 0.0
    for name in timeline["order"]:
        d = timeline["modules"][name]["duration"]
        start = timeline["modules"][name].get("start", t)
        spans.append((name, start, start + d))
        t = start + d
    return spans


def sample_times(spans, every, guard=0.8):
    out = []
    for name, a, b in spans:
        lo, hi = a + guard, b - guard
        if hi <= lo:
            lo = hi = (a + b) / 2
        n = max(1, math.floor((hi - lo) / every) + 1)
        step = (hi - lo) / max(1, n - 1) if n > 1 else 0
        out += [(round(lo + i * step, 3), name) for i in range(n)]
    return out


async def measure(pw, html, mutate, jobs, shard, shards):
    browser = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
    page = await browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    source = Path(html).resolve().read_text(encoding="utf-8")
    marker = "const TL = window.TIMELINE"
    if marker not in source:
        raise SystemExit("check_quality: shell.html marker not found (rv version mismatch)")
    await page.set_content(source.replace(marker, HOOK + "\n" + marker, 1), wait_until="load")
    await page.evaluate("Promise.resolve(window.renderReady).then(()=>0)")
    await page.evaluate("m => { window.__qMutate = m; }", mutate)
    rows = []
    for t, name in jobs[shard::shards]:
        await page.evaluate("""async t => { window.__qScenes.clear(); await window.renderAt(t);
            window.__qScenesFrame = [...window.__qScenes];
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }""", t)
        frame = await page.evaluate(FRAME, mutate)
        style = await page.add_style_tag(content="body *:not(#stage):not(canvas){visibility:hidden!important}")
        png = await page.screenshot()
        await style.evaluate("e => e.remove()")
        picture = await page.evaluate("() => window.PICTURE || null")
        rows.append({"t": t, "scene": name, "empty": flat_fraction(png, picture), **frame})
    await browser.close()
    return rows, errors


def exemptions(script):
    top = script.get("quality_ok")
    top = top if isinstance(top, dict) else {}
    per = {s["name"]: s["quality_ok"] if isinstance(s.get("quality_ok"), dict) else {}
           for s in script.get("scenes", []) if isinstance(s, dict) and "name" in s}
    return top, per


def main(a):
    t0 = time.monotonic()
    html = Path(a.html).resolve()
    project = Path(a.project).resolve() if a.project else html.parent.parent
    script = json.loads((project / "script.json").read_text(encoding="utf-8"))
    timeline = json.loads((project / "build/timeline.json").read_text(encoding="utf-8"))
    spans = scene_spans(timeline)
    jobs = sample_times(spans, a.every)
    shards = 1 if a.mutate else max(1, min(a.shards, len(jobs)))

    async def run():
        async with async_playwright() as pw:
            return await asyncio.gather(*(measure(pw, html, a.mutate, jobs, k, shards) for k in range(shards)))
    parts = asyncio.run(run())
    rows = sorted((r for p in parts for r in p[0]), key=lambda r: r["t"])
    errors = [e for p in parts for e in p[1]]

    scenes = {s["name"]: s for s in script.get("scenes", []) if isinstance(s, dict)}
    top_ok, scene_ok = exemptions(script)
    warns, exempt, bad_reasons = [], [], []

    is_hello = project.name == "hello" and project.parent.name == "examples"

    def warn(rule, scene, text):
        if a.mutate:
            warns.append((rule, scene, text))
            return
        reason = (scene_ok.get(scene, {}) if scene else {}).get(rule) or top_ok.get(rule)
        if isinstance(reason, str) and HELLO_ONLY in reason and not is_hello:
            bad_reasons.append(f"QUALITY_EXEMPT_BAD rule={rule} scene={scene or '-'} reason copied from examples/hello "
                               "-> 그 예외를 지우고 장소·사람·이야기를 넣음 (examples/story 참고)")
            warns.append((rule, scene, text))
            return
        if isinstance(reason, str) and len(reason.strip()) >= REASON_MIN:
            exempt.append(f"QUALITY_EXEMPT rule={rule} scene={scene or '-'} reason={reason.strip()!r}")
            return
        if reason is not None:
            bad_reasons.append(f"QUALITY_EXEMPT_BAD rule={rule} scene={scene or '-'} reason={reason!r} "
                               f"(이유는 {REASON_MIN}자 이상: 왜 이 장면은 이래도 되는지)")
        warns.append((rule, scene, text))

    if a.verbose:
        for r in rows:
            print(f"QUALITY_SAMPLE t={r['t']:.2f} scene={r['scene']} empty={r['empty']:.3f} objects={r['objects']} "
                  f"humans={r['humans']} card={r['card']:.3f} places={','.join(r['places']) or '-'}")
    any_people = any(r["humans"] for r in rows)
    beats = []
    for name, start, end in spans:
        mine = [r for r in rows if r["scene"] == name]
        if not mine:
            continue
        meta = scenes.get(name, {})
        beat, where = meta.get("beat"), meta.get("place")
        if beat:
            beats.append((beat, name))
        em = statistics.median(r["empty"] for r in mine)
        ob = statistics.median(r["objects"] for r in mine)
        people = max(r["humans"] for r in mine)
        worst = max(mine, key=lambda r: r["card"])
        built = sorted({p for r in mine for p in r["places"]})
        span = f"t={start:.1f}-{end:.1f}"
        print(f"QUALITY_SCENE scene={name} beat={beat or '-'} place={where or '-'} {span} samples={len(mine)} "
              f"empty_median={em:.3f} objects_median={ob:g} people_max={people} card_max={worst['card']:.3f} "
              f"kit_places={','.join(built) or '-'} things={','.join(mine[len(mine) // 2]['names'][:8])}")
        if em > a.empty:
            flat = max(mine, key=lambda r: r["empty"])
            warn("EMPTY", name, f"{span} empty_median={em:.3f} limit={a.empty} worst t={flat['t']:.2f} empty={flat['empty']:.3f} "
                 "-> 실제 장소로: scenes[].place + KIT.place(NAME, scene) (앞·중·뒤 층, 소품, 빛, 공기)")
        if ob < a.objects:
            warn("SPARSE", name, f"{span} objects_median={ob:g} limit={a.objects} "
                 "-> 주인공 곁에 장소의 물건·사람·주변 움직임을 더함 (KIT.place, KIT.fx.human)")
        if any_people and beat in PEOPLE_BEATS and not people:
            warn("NO_PEOPLE", name, f"{span} beat={beat} people_max=0 -> 누가 곤란한지/누가 좋아졌는지 보이게 KIT.fx.human")
        if worst["card"] > a.card:
            warn("CARD", name, f"t={worst['t']:.2f} card_cover={worst['card']:.3f} limit={a.card} card={worst['cardName']!r} "
                 "-> 카드 기본값(KIT.info.numCard 작게·한쪽)으로, 숫자 하나에 카드 하나")
        hidden = [(r["t"], f) for r in mine for f in r.get("hidden", [])]
        if hidden:
            first = {}
            for t, f in hidden:
                first.setdefault(f.rsplit(" ", 2)[0], (t, f))
            items = "; ".join(f"t={t:.2f} {f}" for t, f in list(first.values())[:3])
            warn("TEXT_HIDDEN", name, f"{span} {items} -> 이름표는 KIT.label(화면 위 글자) 또는 KIT.sign(3D 판, 늘 위에 그림), 아니면 가리는 물체·카메라를 옮김")
        fakes = [(r["t"], f) for r in mine for f in r.get("fake", [])]
        if fakes:
            first = {}
            for t, f in fakes:
                first.setdefault(f, t)
            items = "; ".join(f"t={t:.2f} {f}" for f, t in list(first.items())[:3])
            warn("FAKE_FX", name, f"{span} {items} -> 연기·증기·불꽃은 KIT.fx.smoke/steam/flame, 단면은 KIT.fx.section (납작한 판·반투명 상자 대신)")
        if not where:
            warn("PLACE", name, f"{span} scenes[].place 없음 -> 이 장면이 일어나는 곳을 적고(KIT.place 종류나 말로) 그곳을 그림")
        elif where in KINDS and where not in built:
            warn("PLACE", name, f"{span} place={where} 인데 KIT.place 로 만든 장소가 화면에 없음 -> KIT.place(NAME, scene)")
    if not any_people:
        warn("NO_PEOPLE", None, "영상 전체에 KIT.fx.human 사람 0 -> 문제를 겪는 사람·쓰는 사람을 장면에")
    if not beats:
        warn("STORY", None, "scenes[].beat 없음 -> 장면마다 beat: problem(문제 장면) · inside(기술 속) · result(결과 순간) · after(바뀐 모습)")
    else:
        have = [b for b, _ in beats]
        missing = [b for b in BEATS if b not in have]
        if missing:
            warn("STORY", None, f"빠진 박자 {','.join(missing)} (있는 것 {','.join(have)})")
        if have[0] != "problem":
            warn("STORY", None, f"첫 박자가 problem 이 아님 ({beats[0][1]}={have[0]}) -> 실제 장소에서 사람이 겪는 문제로 엶")
        unknown = sorted({b for b in have if b not in BEATS})
        if unknown:
            warn("STORY", None, f"모르는 박자 {','.join(unknown)} (쓸 수 있는 것 {','.join(BEATS)})")

    for rule, scene, text in warns:
        print(f"QUALITY_{rule} scene={scene or '(video)'} {text}")
    for line in exempt + bad_reasons:
        print(line)
    for e in errors:
        print(f"PAGE_ERROR {e}")
    status = 0
    if a.mutate:
        rules = {r for r, _, _ in warns}
        sampled = {r["scene"] for r in rows}
        if a.mutate == "people" and not any(r["realHumans"] for r in rows):
            print("QUALITY_CHECK no KIT.fx.human to hide")
            print("MUTATION_SKIP")
            return 0
        caught = {
            "card": "CARD" in rules,
            # every scene loses its things (SPARSE); grain or a gradient clear colour may keep a few scenes over the EMPTY limit, so one is enough
            "empty": all(any(w[0] == "SPARSE" and w[1] == s for w in warns) for s in sampled)
                     and any(w[0] == "EMPTY" for w in warns),
            "people": "NO_PEOPLE" in rules,
        }[a.mutate]
        print(f"QUALITY_CHECK FAIL mutation {a.mutate}" if caught else "QUALITY_CHECK mutation not caught")
        print("MUTATION_CAUGHT" if caught else "MUTATION_NOT_CAUGHT")
        status = 1 if caught else 0
    else:
        ok = not warns and not errors
        print(f"QUALITY_CHECK {'PASS' if ok else 'FAIL'} warnings={len(warns)} exempt={len(exempt)} samples={len(rows)} "
              f"runtime_s={time.monotonic() - t0:.1f}")
        status = 0 if ok else 1
    return status


KINDS = ("sidewalk", "factory", "recycling", "clinic", "kitchen", "lab")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("html")
    ap.add_argument("--project", help="project folder (default: two levels above the html)")
    ap.add_argument("--every", type=float, default=1.0, help="seconds between samples inside a scene")
    ap.add_argument("--empty", type=float, default=0.45, help="limit: median share of flat tiles per scene")
    ap.add_argument("--objects", type=float, default=10, help="limit: median distinct things on screen per scene")
    ap.add_argument("--card", type=float, default=0.06, help="limit: share of the frame cards may cover")
    ap.add_argument("--mutate", choices=["card", "empty", "people"])
    ap.add_argument("--verbose", action="store_true", help="one QUALITY_SAMPLE line per sample")
    ap.add_argument("--shards", type=int, default=int(os.environ.get("RV_CHECK_SHARDS", "4")))
    a = ap.parse_args()
    if not (a.every > 0 and math.isfinite(a.every)):
        ap.error("--every must be positive")
    sys.exit(main(a))
