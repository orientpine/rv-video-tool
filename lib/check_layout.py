"""Sample visible DOM text, layout, safe areas, and WCAG contrast at 1080p.

uv run -q --no-project --with playwright --with pillow python lib/check_layout.py video.html
Transparent backgrounds are composited over a text-free screenshot of the canvas.
The tenth percentile of pixel contrast ratios is the worst-luminance statistic:
it works for both dark and light text, unlike always taking dark pixels.
"""
import argparse
import asyncio
import io
import math
import sys
import time
from pathlib import Path

from PIL import Image
from playwright.async_api import async_playwright
from capture import CHROME, CHROME_ARGS, warm_canvas


COLLECT = r"""() => {
  const rgba = s => {
    const n = s.match(/[\d.]+/g);
    return n ? [...n.slice(0,3).map(Number), n.length > 3 ? +n[3] : 1] : [0,0,0,0];
  };
  const rect = e => {const r=e.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]};
  const direct = e => [...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim();
  const els=[...document.querySelectorAll('body *')].filter(e=>
    !['SCRIPT','STYLE','NOSCRIPT'].includes(e.tagName) && direct(e));
  const out=[];
  for(const e of els) {
    let opacity=1, hidden=false, layers=[], chain=[];
    for(let a=e;a;a=a.parentElement) {
      const s=getComputedStyle(a);
      opacity*=+s.opacity;
      if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse') hidden=true;
      if(a!==document.body && a!==document.documentElement) layers.push([...rgba(s.backgroundColor),+s.opacity]);
      chain.push(a);
    }
    const r=rect(e), s=getComputedStyle(e);
    if(hidden||opacity<=.05||r[2]<=r[0]||r[3]<=r[1]) continue;
    const badge=chain.find(a=> {
      const z=getComputedStyle(a), q=rect(a);
      return a.textContent.trim()==='개념도 · 목표 시나리오' &&
        z.position==='absolute' && z.right==='48px' && q[1]>=0 && q[3]<=120;
    });
    const chrome=!!e.closest('#steps, #cap')||!!badge;
    // A containing card's padding also belongs inside the safe area.
    const cards=chain.filter(a=>a!==document.body && a!==document.documentElement &&
      !a.matches('.overlay,#stage,#steps,#cap') &&
      getComputedStyle(a).position==='absolute' &&
      rgba(getComputedStyle(a).backgroundColor)[3]>.05);
    const id=e.id || `${e.closest('.overlay')?.dataset.scene||'chrome'}:${els.indexOf(e)}`;
    const fg=rgba(e instanceof SVGElement?s.fill:s.color);
    if(e instanceof SVGElement) fg[3]*=+s.fillOpacity;
    if(fg[3]===0) continue;
    out.push({id,text:direct(e).replace(/\s+/g,' '),r,opacity,
      tag:e.tagName.toLowerCase()+(typeof e.className==='string'&&e.className.trim()?'.'+e.className.trim().replace(/\s+/g,'.'):''),
      fg,layers,size:parseFloat(s.fontSize),bold:+s.fontWeight>=700,
      overflow:e instanceof HTMLElement && e.clientWidth>0 && e.scrollWidth>e.clientWidth,
      sw:e.scrollWidth,cw:e.clientWidth,chrome,cards:cards.map(rect),
      ancestors:els.map((a,i)=>a!==e&&a.contains(e)?i:-1).filter(i=>i>=0),
      index:els.indexOf(e)});
  }
  return out;
}"""

# Same element ids as COLLECT, opacity only (0 when hidden). Used to tell a fade in progress from a resting state.
OPACITY = r"""() => {
  const direct = e => [...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim();
  const els=[...document.querySelectorAll('body *')].filter(e=>
    !['SCRIPT','STYLE','NOSCRIPT'].includes(e.tagName) && direct(e));
  const out={};
  els.forEach((e,i)=>{
    let opacity=1;
    for(let a=e;a;a=a.parentElement){const s=getComputedStyle(a);
      if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'){opacity=0;break;}
      opacity*=+s.opacity;}
    out[e.id || `${e.closest('.overlay')?.dataset.scene||'chrome'}:${i}`]=opacity;
  });
  return out;
}"""
# A text whose opacity differs by more than FADE_DELTA FADE_S before or after the sample is mid-fade: contrast
# and overlap are judged on its resting frames, not while it fades (a fading label read as low contrast made
# authors switch labels on in one frame instead - the pop-in the owner saw).
FADE_S, FADE_DELTA = .2, .05

MUTATE = r"""how => {
  const make=(txt,x,y,bg='#16323c',fg='#f7f9f9')=>{
    const e=document.createElement('div');e.textContent=txt;
    e.style.cssText=`position:absolute;left:${x}px;top:${y}px;width:320px;height:60px;
      font:700 32px/60px sans-serif;background:${bg};color:${fg};z-index:30;white-space:nowrap`;
    document.body.append(e);return e;
  };
  if(how==='overlap'){make('MUTATION overlap A',400,300);make('MUTATION overlap B',430,310)}
  if(how==='clip')make('MUTATION clip',1850,400);
  if(how==='contrast')make('MUTATION contrast',800,400,'#16323c','#16323c');
  if(how==='safe')make('MUTATION safe',800,20);
}"""

# Capture the unwrapped scene render before LOOK/postprocessing wraps it.
# Installed before page scripts, not in the shipping renderer.
OCCLUSION_INIT = r"""(() => {
  let three;
  window.__LAYOUT_VIEWS = new Map();
  Object.defineProperty(window, 'THREE', {configurable:true, get:()=>three, set:v=>{
    three=v;
    const wrap=Original=>new Proxy(Original, {construct(C,args) {
      const renderer=new C(...args), raw=renderer.render.bind(renderer);
      renderer.render=(scene,camera)=>{
        if(scene.isScene && camera.isCamera)
          window.__LAYOUT_VIEWS.set(camera, {scene,renderer,raw,camera});
        return raw(scene,camera);
      };
      return renderer;
    }});
    // The vendored UMD build assigns THREE={} before exporting its constructor.
    let Constructor=v.WebGLRenderer && wrap(v.WebGLRenderer);
    Object.defineProperty(v,'WebGLRenderer',{configurable:true,
      get:()=>Constructor,set:C=>{Constructor=wrap(C)}});
  }});
})()"""

OCCLUSION = r"""mutate => {
  const labels=window.__KIT_LABELS || [], results=[], skipped=[], subjects=[];
  const views=window.__LAYOUT_VIEWS, caches=new Map();
  const belongs=(o,target)=>{for(let p=o;p;p=p.parent) if(p===target)return true;return false};
  const meshesOf=view=>{
    if(!caches.has(view)) {
      view.scene.updateMatrixWorld(true);
      const meshes=[]; view.scene.traverseVisible(o=>{if(o.isMesh)meshes.push(o)});
      caches.set(view,meshes);
    }
    return caches.get(view);
  };
  const add=(target,source,text,view,own=null)=>{
    if(!target) return;
    let subject=subjects.find(s=>s.target===target && s.view===view);
    if(!subject) {subject={target,source,text,view,owns:new Set()};subjects.push(subject);}
    else if(!subject.source.split('+').includes(source)) subject.source+='+'+source;
    if(own) subject.owns.add(own);
  };
  document.querySelectorAll('[data-occlusion-mutation]').forEach(e=>e.remove());
  const shown=e=>{
    for(let a=e;a;a=a.parentElement) {
      const s=getComputedStyle(a);
      if(s.display==='none'||s.visibility!=='visible'||+s.opacity<=.05) return false;
    }
    return e.getBoundingClientRect().width>0;
  };
  const cards=[...document.querySelectorAll('body *')].filter(e=>{
    // rv's own captions, step chips and scene fade are not explanation cards (measured: 5 mm caption 1.0, fade 44 samples).
    if(!shown(e)||e instanceof SVGElement||
      e.matches('html,body,canvas,#stage,.overlay')||e.closest('#cap,#steps,#fade')) return false;
    const s=getComputedStyle(e), c=s.backgroundColor.match(/[\d.]+/g);
    let opacity=1;
    for(let a=e;a;a=a.parentElement) opacity*=+getComputedStyle(a).opacity;
    return c && (c.length<4?1:+c[3])*opacity>=.5;
  }).map(e=>{const r=e.getBoundingClientRect();
    return {e,r,name:e.id||e.textContent.trim().slice(0,60)||
      `${e.tagName}${e.className?'.'+String(e.className).trim().replace(/\s+/g,'.'):''} scene=${e.closest('[data-scene]')?.dataset.scene||'-'} ${Math.round(r.width)}x${Math.round(r.height)} bg=${getComputedStyle(e).backgroundColor}`};});
  for(const label of labels) {
    if(!label.camera || !shown(label.box)) continue;
    const view=views.get(label.camera);
    if(!view) { skipped.push(label.box.textContent+': no scene'); continue; }
    const meshes=meshesOf(view);
    let target=label.target, source='target';
    if(!target) {
      // A world-point label predates opts.target. Choose the smallest mesh
      // containing that point, not the foreground object along its screen ray.
      const candidates=meshes.map(o=>({o,b:new THREE.Box3().setFromObject(o)}))
        .filter(({b})=>b.clone().expandByScalar(.025).containsPoint(label.world));
      candidates.sort((a,b)=>a.b.getSize(new THREE.Vector3()).lengthSq()-
        b.b.getSize(new THREE.Vector3()).lengthSq());
      target=candidates[0]?.o; source='world-point';
    }
    if(!target) { skipped.push(label.box.textContent+': no target at world point'); continue; }
    add(target,source,label.box.textContent,view,label.box);
  }
  const em=window.KIT?.fx?.emphasis, accent=new THREE.Color(0xF2A33A);
  for(const view of views.values()) {
    const meshes=meshesOf(view), extra=[...(em?.extra||[])];
    for(const target of extra)
      if(meshes.some(o=>belongs(o,target))) add(target,'focus',target.name||target.type,view);
    for(const o of meshes) {
      // Match emphasis.isFocus's accent tolerance, including material arrays.
      const hot=(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.color &&
        Math.abs(m.color.r-accent.r)+Math.abs(m.color.g-accent.g)+Math.abs(m.color.b-accent.b)<.12);
      if(hot) add(o,'accent',o.name||o.type,view);
    }
    if(window.LOOK?.on) for(const target of [].concat(window.LOOK.subject||[]))
      if(meshes.some(o=>belongs(o,target))) add(target,'LOOK.subject',target.name||target.type,view);
  }
  // A subject discovered through focus/accent can also have a KIT.label.
  // Exempt only labels attached to this subject (or its parent/child group).
  const labelledSubjects=subjects.filter(s=>s.owns.size).map(s=>({...s,owns:[...s.owns]}));
  for(const s of subjects) for(const labelled of labelledSubjects)
    if(s.view===labelled.view && (belongs(s.target,labelled.target)||belongs(labelled.target,s.target)))
      for(const own of labelled.owns) s.owns.add(own);
  for(const subject of subjects) {
    const {target,source,text,view,owns}=subject, {scene,renderer,raw,camera}=view;
    const meshes=meshesOf(view), parts=meshes.filter(o=>belongs(o,target));
    if(!parts.length) { skipped.push(text+': target not in visible scene'); continue; }
    if(mutate==='occlude') {
      const bounds=new THREE.Box3().setFromObject(target), points=[];
      for(const x of [bounds.min.x,bounds.max.x])
        for(const y of [bounds.min.y,bounds.max.y])
          for(const z of [bounds.min.z,bounds.max.z])
            points.push(new THREE.Vector3(x,y,z).project(camera));
      const left=Math.max(0,Math.min(...points.map(p=>(p.x+1)*960))-8),
        top=Math.max(0,Math.min(...points.map(p=>(1-p.y)*540))-8),
        right=Math.min(1920,Math.max(...points.map(p=>(p.x+1)*960))+8),
        bottom=Math.min(1080,Math.max(...points.map(p=>(1-p.y)*540))+8);
      const card=document.createElement('div');
      card.dataset.occlusionMutation='';
      card.style.cssText=`position:absolute;z-index:999;left:${left}px;top:${top}px;
        width:${Math.max(0,right-left)}px;height:${Math.max(0,bottom-top)}px;background:#16323c`;
      document.body.append(card); cards.push({e:card,r:card.getBoundingClientRect(),name:'MUTATION occlude'});
    }
    // Two depth-tested ID passes at quarter resolution: target alone, then
    // target white/rest black. Counts are silhouette pixels, not bounding boxes.
    const w=480,h=270, rt=new THREE.WebGLRenderTarget(w,h),
      alone=new Uint8Array(w*h*4), full=new Uint8Array(w*h*4);
    const saved=meshes.map(o=>[o,o.material,o.visible]);
    const materials=[], oldRT=renderer.getRenderTarget(),
      bg=scene.background, fog=scene.fog, override=scene.overrideMaterial,
      tone=renderer.toneMapping, scissor=renderer.getScissorTest(),
      auto=renderer.autoClear, clear=renderer.getClearColor(new THREE.Color()),
      alpha=renderer.getClearAlpha();
    try {
      scene.background=new THREE.Color(0); scene.fog=null; scene.overrideMaterial=null;
      renderer.toneMapping=THREE.NoToneMapping; renderer.autoClear=true;
      renderer.setScissorTest(false); renderer.setClearColor(0,1); renderer.setRenderTarget(rt);
      for(const [o,original] of saved) {
        const mask=m=>{
          const mat=new THREE.MeshBasicMaterial({color:belongs(o,target)?0xffffff:0,
            side:m.side, visible:m.visible, depthTest:m.depthTest, depthWrite:m.depthWrite,
            transparent:m.transparent, opacity:m.opacity, alphaTest:m.alphaTest,
            map:m.map, alphaMap:m.alphaMap});
          // Color textures must not darken the ID; retain only cutout alpha.
          mat.map=null; materials.push(mat); return mat;
        };
        o.material=Array.isArray(original)?original.map(mask):mask(original);
        if(!belongs(o,target)) o.visible=false;
      }
      raw(scene,camera); renderer.readRenderTargetPixels(rt,0,0,w,h,alone);
      for(const [o,,visible] of saved) o.visible=visible;
      raw(scene,camera); renderer.readRenderTargetPixels(rt,0,0,w,h,full);
    } finally {
      for(const [o,material,visible] of saved) {o.material=material;o.visible=visible;}
      scene.background=bg; scene.fog=fog; scene.overrideMaterial=override;
      renderer.setRenderTarget(oldRT); renderer.setScissorTest(scissor);
      renderer.setClearColor(clear,alpha); renderer.toneMapping=tone; renderer.autoClear=auto;
      rt.dispose(); materials.forEach(m=>m.dispose());
    }
    let total=0, depth=0, visible=0;
    const covering=cards.filter(({e})=>![...owns].some(own=>e===own||e.contains(own))),
      cardPixels=new Uint32Array(covering.length);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
      const i=(y*w+x)*4;
      if(alone[i]<128) continue;
      total++;
      if(full[i]<128) continue;
      depth++;
      const px=(x+.5)*4, py=(h-y-.5)*4;
      let covered=false;
      covering.forEach(({r},j)=>{
        if(px>=r.left&&px<r.right&&py>=r.top&&py<r.bottom) {cardPixels[j]++;covered=true;}
      });
      if(!covered) visible++;
    }
    if(!total) {skipped.push(text+': no on-screen target pixels');continue;}
    // An unlabelled accent/focus target a few pixels across is not something the viewer is shown (measured:
    // 1-14 px focus groups). A visibly drawn one under a card still FAILs (owner: the explained part must not be hidden).
    // LOOK.subject is look.js's own pick (often the KIT.fx.focus groups), so only a label's target is exempt from the size floor.
    const labelled=/(^|\+)(target|world-point)(\+|$)/.test(source);
    if(!labelled && total<50) {skipped.push(text+': auto target too small on screen ('+total+' px)');continue;}
    // An accent part nobody labelled or focused is explained only when the scene shows it: one the 3D scene itself hides
    // (probe tip inside a block: visible 0, card 0 in 1904 measured samples) is not an explained target.
    if(source==='accent' && depth<.5*total) {skipped.push(text+': accent part hidden by the scene itself');continue;}
    const covered=Math.max(0,...cardPixels), cardIndex=cardPixels.indexOf(covered);
    results.push({text,source,total,depth,visible,covered,
      card:covered?covering[cardIndex].name:'none',cardFraction:depth?covered/depth:0,
      fraction:visible/total, mutation:mutate==='occlude'&&covered>0});
  }
  return {results,skipped};
}"""


def luminance(rgb):
    v = [x / 255 for x in rgb]
    v = [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in v]
    return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]


def composite(fg, bg):
    return tuple(fg[i] * fg[3] + bg[i] * (1 - fg[3]) for i in range(3))


def over(front, back):
    alpha = front[3] + back[3] * (1 - front[3])
    if not alpha:
        return (0, 0, 0, 0)
    return (*((front[i] * front[3] + back[i] * back[3] * (1 - front[3])) / alpha
              for i in range(3)), alpha)


def contrast(row, image):
    opaque = any(c[3] >= 1 for c in row["layers"]) and row["opacity"] >= 1
    pixels = [(0, 0, 0)]
    if not opaque:
        left, t, r, b = row["r"]
        box = (max(0, min(1919, int(left))), max(0, min(1079, int(t))),
               max(1, min(1920, math.ceil(r))), max(1, min(1080, math.ceil(b))))
        if box[2] > box[0] and box[3] > box[1]:
            crop = image.crop(box)
            # At most 1024 deterministic spatial samples per text box.
            pixels = [crop.getpixel((x, y))
                      for y in range(0, crop.height, max(1, math.ceil(crop.height / 32)))
                      for x in range(0, crop.width, max(1, math.ceil(crop.width / 32)))]
    # Compose each CSS opacity group separately. Multiplying all opacities onto
    # the whole card would incorrectly fade an opaque parent background when
    # only a child number/text is fading.
    background, foreground = (0, 0, 0, 0), tuple(row["fg"])
    for layer in row["layers"]:
        background = over(background, layer)
        foreground = over(foreground, layer)
        background = (*background[:3], background[3] * layer[4])
        foreground = (*foreground[:3], foreground[3] * layer[4])
    ratios = []
    for pixel in pixels:
        bg = composite(background, pixel)
        fg = composite(foreground, pixel)
        a, b = luminance(fg), luminance(bg)
        ratios.append((max(a, b) + .05) / (min(a, b) + .05))
    ratios.sort()
    return ratios[int((len(ratios) - 1) * .1)]


async def main(a):
    start = time.monotonic()
    failures, samples, text_count, mutation_caught = [], 0, 0, False
    occlusion_count, occlusion_skips = 0, set()
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
        p = await browser.new_page(viewport={"width": 1920, "height": 1080})
        await p.add_init_script(OCCLUSION_INIT)
        errors = []
        p.on("pageerror", lambda e: errors.append(str(e)))
        await p.goto(Path(a.html).resolve().as_uri(), wait_until="load")
        await p.evaluate("Promise.resolve(window.renderReady)")
        total = await p.evaluate("window.DATA.timeline.total_s")
        await warm_canvas(p, await p.context.new_cdp_session(p), min(1, total / 2))
        if a.mutate:
            await p.evaluate(MUTATE, a.mutate)
        begin, end = a.start, min(total, a.end if a.end is not None else total)
        times = a.at if a.at is not None else [
            begin + i * a.every for i in range(math.ceil(max(0, end - begin) / a.every))
            if begin + i * a.every < end]
        for t in times:
            await p.evaluate("""async t => {window.__LAYOUT_VIEWS.clear(); await window.renderAt(t);
                await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}""", t)
            rows = await p.evaluate(COLLECT)
            occlusion = await p.evaluate(OCCLUSION, a.mutate)
            occlusion_skips.update(occlusion["skipped"])
            for target in occlusion["results"]:
                occlusion_count += 1
                values = (f"visible_fraction={target['fraction']:.6f} required>=0.500 "
                          f"pixels={target['visible']}/{target['total']} "
                          f"depth_visible={target['depth']} "
                          f"card_coverage={target['cardFraction']:.6f} required<0.400 "
                          f"card_pixels={target['covered']}/{target['depth']} "
                          f"card={target['card']!r} source={target['source']}")
                print(f"OCCLUSION t={t:.3f} text={target['text']!r} {values}")
                if target["fraction"] < .5 or target["cardFraction"] >= .4:
                    failures.append((t, target["text"], "occlude", values))
                    mutation_caught |= target["mutation"]
            fading = set()
            if any(.05 < row["opacity"] < 1 - FADE_DELTA for row in rows):
                around = []
                for dt in (-FADE_S, FADE_S):
                    await p.evaluate("async t => {window.__LAYOUT_VIEWS.clear(); await window.renderAt(t);}", max(0, t + dt))
                    around.append(await p.evaluate(OPACITY))
                await p.evaluate("""async t => {window.__LAYOUT_VIEWS.clear(); await window.renderAt(t);
                    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}""", t)
                fading = {row["id"] for row in rows if row["opacity"] < 1 - FADE_DELTA and
                          any(abs(o.get(row["id"], 0) - row["opacity"]) > FADE_DELTA for o in around)}
                for row in rows:
                    if row["id"] in fading:
                        print(f"LAYOUT_FADE t={t:.3f} text={row['text'][:60]!r} opacity={row['opacity']:.3f} "
                              f"(mid-fade: contrast/overlap judged on resting frames)")
            image = None
            if any(row["opacity"] < 1 or not any(c[3] >= 1 for c in row["layers"]) for row in rows):
                # Hide DOM while preserving canvas and layout, so foreground glyphs
                # cannot pollute background samples. Keep renderAt at this exact t.
                hidden_style = await p.add_style_tag(content="body *:not(#stage):not(canvas){visibility:hidden!important}")
                image = Image.open(io.BytesIO(await p.screenshot())).convert("RGB")
                await hidden_style.evaluate("e=>e.remove()")
            for j, row in enumerate(rows):
                def bad(rule, values):
                    nonlocal mutation_caught
                    failures.append((t, row["text"], rule, values))
                    if row["text"].startswith("MUTATION " + str(a.mutate)) and rule == a.mutate:
                        mutation_caught = True
                left, top, r, b = row["r"]
                if left < 0 or top < 0 or r > 1920 or b > 1080 or row["overflow"]:
                    bad("clip", f"rect={row['r']} scroll/client={row['sw']}/{row['cw']}")
                if not row["chrome"]:
                    for box in [row["r"], *row["cards"]]:
                        if box[0] < 40 or box[1] < 130 or box[2] > 1880 or box[3] > 870:
                            bad("safe", f"rect={box}; required x=40..1880 y=130..870")
                            break
                if row["id"] in fading:
                    continue
                ratio = contrast(row, image)
                threshold = 3 if row["size"] >= 24 and row["bold"] else 4.5
                if ratio < threshold:
                    bad("contrast", f"ratio={ratio:.3f} required={threshold} size={row['size']} bold={row['bold']}")
                for other in rows[j + 1:]:
                    if other["id"] in fading:
                        continue
                    if (row["index"] in other["ancestors"]
                            or other["index"] in row["ancestors"]):
                        continue
                    q = other["r"]
                    area = max(0, min(r, q[2]) - max(left, q[0])) * max(0, min(b, q[3]) - max(top, q[1]))
                    if area > 4:
                        w, h = round(q[2] - q[0]), round(q[3] - q[1])
                        bad("overlap", f"with={other['text']!r} ({other['id']} {other['tag']} {w}x{h}) area={area:.2f}px^2")
            samples += 1
            text_count += len(rows)
        await browser.close()
    print("| t (s) | text | rule | values |")
    print("|---:|---|---|---|")
    for t, text, rule, values in failures:
        print(f"| {t:.3f} | {text.replace('|', '/')} | {rule} | {values.replace('|', '/')} |")
    for err in errors:
        print(f"PAGE_ERROR {err}")
    if not occlusion_count:
        print("OCCLUSION_CHECK 실제 SKIP no resolvable explained targets (legacy project)")
    for reason in sorted(occlusion_skips):
        print(f"OCCLUSION_SKIP {reason}")
    if a.mutate:
        print("MUTATION_CAUGHT" if mutation_caught else "MUTATION_NOT_CAUGHT")
    ok = bool(text_count) and not failures and not errors
    print(f"samples={samples} text_boxes={text_count} failures={len(failures)} runtime_s={time.monotonic()-start:.3f}")
    print("LAYOUT_CHECK " + ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("html")
    ap.add_argument("--every", type=float, default=.5)
    ap.add_argument("--from", dest="start", type=float, default=0,
                    help="sample from this second (inclusive)")
    ap.add_argument("--to", dest="end", type=float,
                    help="sample until this second (exclusive)")
    ap.add_argument("--at", type=float, nargs="+", help="이 시각들만 잰(초). 없으면 --every 간격으로 전체")
    ap.add_argument("--mutate", choices=["overlap", "clip", "contrast", "safe", "occlude"])
    a = ap.parse_args()
    if not math.isfinite(a.every) or a.every <= 0:
        ap.error("--every must be finite and positive")
    if not math.isfinite(a.start) or a.start < 0:
        ap.error("--from must be finite and nonnegative")
    if a.end is not None and (not math.isfinite(a.end) or a.end <= a.start):
        ap.error("--to must be finite and greater than --from")
    if a.at is not None and any(not math.isfinite(t) or t < 0 for t in a.at):
        ap.error("--at values must be finite and nonnegative")
    sys.exit(asyncio.run(main(a)))
