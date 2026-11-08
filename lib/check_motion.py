"""Probe world-space trajectories at every frame without rasterizing each frame.

uv run -q --no-project --with playwright --with pillow python lib/check_motion.py video.html
The original file is never changed. An in-memory page intercepts the renderer
instance before LOOK wraps it, and tags the unnamed objects returned by RIG.build.
The generic scene traversal also includes userData.track and named robot/head
objects. Median speed is computed separately for each object and timeline scene.
"""
import argparse
import asyncio
import math
import re
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Literal, NamedTuple, assert_never

from playwright.async_api import async_playwright
from capture import CHROME, CHROME_ARGS

# One vocabulary for narration keywords, timeline text, and visible step cards.
# Verbs are listed by stem (어간) and every form is made by one conjugation rule (verb_forms), so a narration that says
# "올립니다", "올렸습니다", "엽니다" or "회전합니다" is read like "올리고"/"열어"/"회전해" (before, each ending was a listed
# syllable: "올[리려]" never matched 립 or 렸, and only 끼우 had its 웁/웠 written in by hand).
# Match action forms, not nouns such as "기계"/"회전수": a one-syllable stem (열, 풀, 빼, 켜) needs an ending, a formal
# ending must go on to 니/시 ("엽니다", not "엽서"), "-림" nouns ("올림픽", "내림차순") are no verb form, and a short form
# of a one-syllable stem starts its word ("지켜야" is not 켜다, "이끕니다" not 끄다).
# A verb in adnominal form describing a noun ("회전하는 모든 것", "돌리는 장비") is not a command; time nouns
# ("옮기는 동안", "회전하는 순간") still narrate the action.
_G, _J, _B, _T = 0xAC00, 21 * 28, 28, "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"


def _jamo(c):
    n = ord(c) - _G
    return n // _J, n % _J // _B, n % _B


def _syl(lead, vowel, tail=0):
    return chr(_G + lead * _J + vowel * _B + tail)


def _aeo(stem):
    """The 아/어 form: 열->열어, 닫->닫아, 올리->올려, 끼우->끼워, 잠그->잠가, 끄->꺼, 하->해, 켜/빼/꺼내 stay."""
    *head, last = stem
    lead, vowel, tail = _jamo(last)
    bright = _T[vowel] in "ㅏㅗ"
    if tail:
        return stem + ("아" if bright else "어")
    if last == "하":
        return "".join(head) + "해"
    v = {"ㅣ": "ㅕ", "ㅜ": "ㅝ", "ㅗ": "ㅘ"}.get(_T[vowel])
    if _T[vowel] == "ㅡ":
        v = "ㅏ" if head and _T[_jamo(head[-1])[1]] in "ㅏㅗ" else "ㅓ"
    return "".join(head) + (_syl(lead, _T.index(v)) if v else last)


_ENDS_NO_VERB = {"빼"}   # only the rare 내빼다 ends in 빼, so 공기빼야/핀빼서 keep matching written together


def verb_forms(stem):
    """Regex alternatives for one stem: 기/고, the 아/어 form, formal ㅂ니다/습니다 and past ㅆ (all stems), plus the bare
    stem when it has two or more syllables (old behaviour: 옮기는 동안, 돌리면)."""
    *head, last = stem
    lead, vowel, tail = _jamo(last)
    aeo = _aeo(stem)
    if tail == 8:                      # ㄹ stem drops ㄹ before ㅂ: 열 -> 엽니다, 풀 -> 풉니다, 밀 -> 밉니다
        formal = "".join(head) + _syl(lead, vowel, 17) + "[니시]"
    elif tail:                         # 닫 -> 닫습니다, 꽂 -> 꽂습니다
        formal = stem + "습니"
    else:                              # 올리 -> 올립니다, 켜 -> 켭니다, 회전하 -> 회전합니다
        formal = "".join(head) + _syl(lead, vowel, 17) + "[니시]"
    a_lead, a_vowel, _ = _jamo(aeo[-1])
    past = aeo[:-1] + _syl(a_lead, a_vowel, 20)   # 올렸, 열었, 회전했, 잠갔
    short = [formal, past] + ([] if len(aeo) > 1 else [aeo + "[서야도]"])   # 켜서/꺼야: a bare 켜/꺼 is also 켜켜이/꺼냅니다
    if len(stem) > 1:
        return [stem + "[기고]", aeo, stem] + short
    # One-syllable stems keep their old forms anywhere (공기빼기, 뚜껑열기, 다시열어), but a short form must start
    # the word: 지켜야/일으켜서 end in 켜, 이끕니다 in 끕니 and are other verbs.
    guard = "" if stem in _ENDS_NO_VERB else r"(?<![가-힣])"
    return [stem + "[기고]"] + ([aeo] if len(aeo) > 1 else []) + [guard + f for f in short]


def verb_pattern(stems, extra=()):
    return "|".join([f for stem in stems for f in verb_forms(stem)] + list(extra))


ACTION_STEMS = ("풀", "열", "옮기", "빼", "돌리", "닫", "올리", "내리", "밀", "잠그", "분리하", "이동하", "회전하", "개방하",
                "배기하", "감압하", "끼우", "꽂", "켜", "꺼내", "교체하")
# 붙여 둔/있는/놓은 is a state, not the act; 갈아 끼우다 may have a space.
ACTION_VERBS = re.compile(
    "(?:" + verb_pattern(ACTION_STEMS, (r"붙(?:이|여(?!\s*(?:둔|있는|놓))|입[니시]|였)", r"갈아\s*끼")) + ")"
    r"(?!는\s+(?!동안|순간|때|중|사이|모습|장면|과정)\S)")
# At 160x90: >=15 pixels changing by >12/255 and mean RGB delta >=.02/255.
# Both reject raster rounding noise; a visible mesh transform must also change.
ACTION_PIXEL_FRACTION = .001
ACTION_RGB_DELTA = .02
# Word<->animation match (ACTION_MATCH, owner 2026-11-07 16:24 KST): KIT.process parts expose names and
# state 0..1 (0 = as built/closed/start/off). Verb classes decide the expected change of the named part.
MATCH_RISE = re.compile(verb_pattern(("열", "풀", "켜", "옮기", "이동하", "빼", "꺼내", "분리하", "끼우", "꽂", "넣", "붙이"),
                                     ("열리", "개방", "장착", "교체", r"갈아\s*끼")))
MATCH_FALL = re.compile(verb_pattern(("닫", "덮", "잠그", "끄")))
MATCH_UP = re.compile(verb_pattern(("올리",)))
MATCH_DOWN = re.compile(verb_pattern(("내리",)))
MATCH_TURN = re.compile(verb_pattern(("돌리", "회전하")))
MATCH_REST, MATCH_FULL, MATCH_MOVE = .05, .95, .2
MATCH_LIFT_M, MATCH_TURN_DEG, MATCH_NOUN_CHARS = .02, 10.0, 25
MATCH_HEAD_S, MATCH_TAIL_S = 1.0, 3.0
# Closed hatch must cover its declared frame opening (criteria M9): share of opening points with the hatch within 0.5 m.
HATCH_COVER_MIN = .80
# Text on screen when a transition starts, or shown too briefly before it (criteria M10, owner 2026-11-07 18:53 KST).
TEXT_READ_MIN_S, TEXT_READ_BASE_S, TEXT_READ_PER_CHAR_S = 1.5, .25, .15
# These projects use metres. No size, velocity, repetition or cut exemption:
# every visible text change checks the full +/-0.6s camera window.
CAMERA_TEXT_DISTANCE = .02
CAMERA_UI_WINDOW = .6
CAMERA_LOOK_DISTANCE = 10.0
# Named follow/explode subjects must really move and stay within 5cm of aim.
# This is a modelling/aim allowance, not a camera-motion allowance.
CAMERA_TRACK_DISTANCE = .05
# Action shot: zoom when the robot arm touches the machine; text-only camera motion stays a FAIL.
# A short declared shot whose named subject really moves, stays in the picture for the whole shot and ends in the
# central half of the frame, and that the camera covers with one directed move: >= 1.25x framing change or >= 15
# degrees around the action point.
# A back-and-forth path (> 1.5x its chord) is a wobble, not a move.
ACTION_SHOT_MAX = 3.0
ACTION_FRAME = .5
ACTION_FRAME_ANY = 1.0
ACTION_PATH_RATIO = 1.5
ACTION_ZOOM = 1.25
ACTION_ORBIT_DEG = 15.0
ACTION_PATH_STEP = .2
# Pop-in (owner: an element suddenly appears with no transition). Weight = on-screen area share x opacity of one
# overlay element or 3D mesh. A pop rises from <= 5% to >= 50% of its peak (max over the next 0.5 s) within
# POP_FRAMES frames; simultaneous pops of one group (overlay child / top 3D object) are summed and must reach
# POP_MIN_WEIGHT (0.2% of the frame, about a 64x64 px card) to count. Scene transitions, declared shot cuts and
# camera cuts (a one-frame camera jump) are not pops: the whole picture changes there.
POP_FRAMES = 2
POP_RISE = .5
POP_FROM = .05
POP_MIN_WEIGHT = .002
POP_PEAK_S = .5
POP_ONSET = 1e-6
POP_CUT_M, POP_CUT_DEG = .25, 8.0
# Explained subject near the centre (owner: while the script explains a part, that part must come to the camera
# centre). For every action span with a linked subject (ACTION_MATCH target, else the declared action/follow shot
# subject), after a lead-in for the camera to arrive, the subject's screen centre stays inside the central box
# |x - .5| <= .15, |y - .5| <= .15 (frame fractions; the middle 30%) in at least half of the samples. A subject
# on a rule-of-thirds line (x = .34) is not the centre.
FRAME_BOX = .15
FRAME_SHARE = .5
FRAME_LEAD_S = .5
# Motion beside the text (TEXT_MOTION, owner 2026-11-08 19:13 KST: while text is shown, meaningful animation in the part
# of the picture the text does not cover). A text window = consecutive frames of one scene, outside its transitions,
# with a card, label or caption on screen (step chips and the badge are only masked; gaps up to TEXT_GAP_S between
# lines join) while the camera is held (<= CAMERA_TEXT_DISTANCE from the window's first frame). Every TEXT_STEP_S the
# 3D picture is drawn without the DOM, camera locked; the screen boxes of all texts seen in the window (painted card,
# else the glyph box) are masked. A sample moves when >= TEXT_MOVE_SHARE of the uncovered pixels differ by > 12/255
# from the last moving sample; the longest stretch with no move must stay below TEXT_STILL_S. EXEMPT: a declared
# ui-only shot (an intended hold on the text) or text covering more than 1 - TEXT_FREE_MIN of the frame.
TEXT_STEP_S = .25
TEXT_STILL_S = 2.0
TEXT_MOVE_SHARE = .005
TEXT_FREE_MIN = .2
TEXT_GAP_S = .5
# Still picture for a meaning that motion cannot show (owner 2026-11-08 19:26 KST): KIT.info.picture boxes
# ([data-rv-picture]). Thresholds fixed before any measurement: fully shown (opacity >= .95) for >= PICTURE_MIN_S at
# the 4 Hz card samples, >= PICTURE_MIN_AREA of the frame, and rich: >= PICTURE_FILL of the image differs from its
# dominant colour and >= PICTURE_COLORS colour bins (4 bits per channel) hold >= .2% of its pixels each (an empty panel
# or a text-only image has one dominant colour and few bins). While a rich picture of that size is shown (opacity >= .5)
# TEXT_MOTION counts the time as intended content.
PICTURE_MIN_S = 3.0
PICTURE_MIN_AREA = .08
PICTURE_FILL = .30
PICTURE_COLORS = 24


HOOK = r"""
  // State inspection uses the same scene poses, but no LOOK shutter subframes.
  window.LOOK_CFG = null;
  window.__motion = {scene:null,sampling:false,mutation:null,targets:new WeakMap(),subjectNames:[]};
  const originalLookAt=THREE.Object3D.prototype.lookAt;
  THREE.Object3D.prototype.lookAt=function(x,y,z) {
    const result=originalLookAt.call(this,x,y,z);
    if(this.isCamera)window.__motion.targets.set(this,
      x && x.isVector3?x.toArray():[x,y,z]);
    return result;
  };
  const OriginalRenderer = THREE.WebGLRenderer;
  THREE.WebGLRenderer = function(...args) {
    const renderer = new OriginalRenderer(...args), raw = renderer.render;
    renderer.render = function(scene,camera) {
      if(scene.isScene && (camera.isPerspectiveCamera || camera.isOrthographicCamera)) {
        // The main camera draws the whole screen. An inset (small viewport or scissor, e.g. a 5 mm zoom window drawn
        // last by an origin camera) or an off-screen render target must not replace it.
        const size=renderer.getDrawingBufferSize(new THREE.Vector2()), v=renderer.getCurrentViewport(new THREE.Vector4());
        const sc=renderer.getScissor(new THREE.Vector4()), pr=renderer.getPixelRatio();
        const full=renderer.getRenderTarget()===null && v.z>=.9*size.x && v.w>=.9*size.y &&
          (!renderer.getScissorTest() || (sc.z*pr>=.9*size.x && sc.w*pr>=.9*size.y));
        if(full || !window.__motion.camera || window.__motion.scene!==scene)
          Object.assign(window.__motion,{scene,camera,renderer,raw});
      }
      if(window.__motion.sampling) return;
      return raw.call(this,scene,camera);
    };
    return renderer;
  };
  THREE.WebGLRenderer.prototype = OriginalRenderer.prototype;
  if(window.RIG) {
    const build = RIG.build;
    RIG.build = function(...args) {
      const rig = build.apply(this,args);
      const tag=(o,name,role)=>{
        if(!o)return;
        o.userData.track=true;o.userData.motionName=name;o.userData.motionRole=role;
      };
      rig.robots.forEach((r,i)=>{
        tag(r.root,`robot${i}.base`,'base');tag(r.body,`robot${i}.body`,'body');
        tag(r.arm.flange,`robot${i}.end_effector`,'end_effector');
      });
      for(const [n,h] of Object.entries(rig.heads)) tag(h,`head${n}`,'head');
      tag(rig.rotor.spin,'rotor','rotor');
      return rig;
    };
  }
"""

UI_SNAPSHOT = r"""() => {
  const out=[],seen=new Set();
  for(const root of document.querySelectorAll('.overlay[data-scene], #steps, #cap, #badge')) {
    if(getComputedStyle(root).display==='none')continue;
    const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walk.nextNode()) {
      const el=walk.currentNode.parentElement;
      if(seen.has(el))continue;seen.add(el);
      const text=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE)
        .map(n=>n.textContent).join(' ').trim().replace(/\s+/g,' ');
      if(!text || /^(SCRIPT|STYLE)$/.test(el.tagName))continue;
      const r=el.getBoundingClientRect();
      let left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),
        top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom),alpha=1;
      for(let a=el;a;a=a.parentElement) {
        const s=getComputedStyle(a);alpha*=+s.opacity;
        if(s.display==='none'||s.visibility==='hidden'){alpha=0;break;}
        const ar=a.getBoundingClientRect();
        // The compositor reveals step chips with an inset clip, not opacity.
        const inset=s.clipPath.match(/^inset\(([^)]+)\)$/);
        if(inset) {
          const v=inset[1].trim().split(/\s+/),four=[v[0],v[1]||v[0],v[2]||v[0],v[3]||v[1]||v[0]];
          const px=(x,size)=>parseFloat(x)*(x.endsWith('%')?size/100:1);
          left=Math.max(left,ar.left+px(four[3],ar.width));right=Math.min(right,ar.right-px(four[1],ar.width));
          top=Math.max(top,ar.top+px(four[0],ar.height));bottom=Math.min(bottom,ar.bottom-px(four[2],ar.height));
        }
        if(s.overflow==='hidden'||s.overflow==='clip') {
          left=Math.max(left,ar.left);right=Math.min(right,ar.right);
          top=Math.max(top,ar.top);bottom=Math.min(bottom,ar.bottom);
        }
      }
      if(alpha<.15||right-left<4||bottom-top<4)continue;
      // Screen area the text hides: its painted card (background alpha >= .3, under 60% of the frame), else the glyphs.
      let box=[left,top,right,bottom];
      for(let a=el;a&&a!==root.parentElement;a=a.parentElement) {
        const bg=getComputedStyle(a).backgroundColor.match(/[\d.]+/g);
        if(!bg||(bg.length>3&&+bg[3]<.3))continue;
        const ar=a.getBoundingClientRect();
        if(ar.width*ar.height>.6*innerWidth*innerHeight)continue;
        box=[Math.min(box[0],ar.left),Math.min(box[1],ar.top),Math.max(box[2],ar.right),Math.max(box[3],ar.bottom)];
      }
      box=[Math.max(0,box[0])/innerWidth,Math.max(0,box[1])/innerHeight,
        Math.min(innerWidth,box[2])/innerWidth,Math.min(innerHeight,box[3])/innerHeight].map(v=>+v.toFixed(4));
      // A live angle/counter update is not a new card. Text replacement is.
      const identity=root.id==='cap'?text:text.replace(/[+\-−]?\d+(?:\.\d+)?/g,'#');
      // Stable under innerHTML replacement of telemetry spans each render.
      const path=[];
      for(let a=el;a!==root;a=a.parentElement)
        path.unshift(a.tagName+':'+[...a.parentElement.children].indexOf(a));
      out.push({id:(root.dataset.scene||root.id)+'/'+path.join('/')+':'+identity,
        text:text.slice(0,120),source:root.id==='cap'?'caption':'ui',root:root.id||'overlay',box});
    }
  }
  return out;
}"""

PICTURE_SNAPSHOT = r"""async () => {
  const cache = window.__motion.picCache || (window.__motion.picCache = new WeakMap()), out = [];
  for (const box of document.querySelectorAll('[data-rv-picture]')) {
    let alpha = 1;
    for (let e = box; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') { alpha = 0; break; } alpha *= +s.opacity; }
    if (alpha <= .01) continue;
    const r = box.getBoundingClientRect();
    const area = Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.left)) * Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top)) / (innerWidth * innerHeight);
    const img = box.tagName === 'IMG' ? box : box.querySelector('img');
    let m = img && cache.get(img);
    if (img && (!m || m.src !== img.src)) {
      try { await img.decode(); } catch (e) {}
      let fill = 0, colors = 0;
      let d = null;
      if (img.naturalWidth) try {   // a cross-origin file taints the canvas: unreadable counts as poor (use deps.json assets)
        const c = document.createElement('canvas'); c.width = 96; c.height = 64;
        const x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(img, 0, 0, 96, 64);
        d = x.getImageData(0, 0, 96, 64).data;
      } catch (e) { d = null; }
      if (d) {
        const n = 96 * 64, bins = new Map();
        for (let i = 0; i < d.length; i += 4) { const k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4; bins.set(k, (bins.get(k) || 0) + 1); }
        let top = 0, key = 0; for (const [k, v] of bins) if (v > top) { top = v; key = k; }
        const br = (key >> 8) * 16 + 8, bg = ((key >> 4) & 15) * 16 + 8, bb = (key & 15) * 16 + 8;
        for (let i = 0; i < d.length; i += 4) if ((Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb)) / 3 > 24) fill++;
        fill /= n; for (const v of bins.values()) if (v >= .002 * n) colors++;
      }
      m = {src: img.src, fill, colors}; cache.set(img, m);
    }
    out.push({id: box.dataset.rvPictureId || box.dataset.rvPicture || 'picture', name: box.dataset.rvPicture || 'picture', alpha: +alpha.toFixed(3), area: +area.toFixed(4),
      fill: m ? +m.fill.toFixed(3) : 0, colors: m ? m.colors : 0});
  }
  return out;
}"""


def picture_rich(pic):
    return pic["area"] >= PICTURE_MIN_AREA and pic["fill"] >= PICTURE_FILL and pic["colors"] >= PICTURE_COLORS


# Per frame: on-screen weight (clipped area share x opacity) of every painted overlay element and visible 3D mesh.
# A tracker keeps the last weight per key and records each onset (weight leaving ~0) with the next weights, so a
# pop is judged later without sending every frame's weights out of the page.
POP_STEP = r"""(frame, scene, cam) => {
  const P = window.__motion.pop || (window.__motion.pop = {last: new Map(), open: [], done: [], ids: new WeakMap(), n: 0});
  const id = o => { let v = P.ids.get(o); if (v === undefined) { v = ++P.n; P.ids.set(o, v); } return v; };
  const W = innerWidth, H = innerHeight, now = new Map();
  const straddle = new Set();
  const put = (key, w, name, group) => { if (w <= 0) return; const e = now.get(key); if (e) e[0] += w; else now.set(key, [w, name, group]); };
  const alpha = new Map();
  const alphaOf = el => {
    if (!el || el === document.documentElement) return 1;
    if (alpha.has(el)) return alpha.get(el);
    const s = getComputedStyle(el);
    const f = /opacity\(([\d.]+)(%?)\)/.exec(s.filter || '');   // CSS filter: opacity() fades as well as opacity does
    const v = s.display === 'none' || s.visibility === 'hidden' ? 0 :
      (+s.opacity) * (f ? +f[1] / (f[2] ? 100 : 1) : 1) * alphaOf(el.parentElement);
    alpha.set(el, v); return v;
  };
  const skip = /^(svg|g|defs|mask|marker|stop|clippath|pattern|lineargradient|radialgradient|filter|style|script|br)$/;
  for (const ov of document.querySelectorAll('.overlay[data-scene]')) {
    if (getComputedStyle(ov).display === 'none') continue;
    [...ov.children].forEach((top, i) => {
      const group = 'ui:' + ov.dataset.scene + '/' + i;
      const name = (top.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) || top.tagName.toLowerCase() + '#' + i;
      for (const el of [top, ...top.querySelectorAll('*')]) {
        const tag = el.tagName.toLowerCase();
        if (skip.test(tag) || el.closest('defs,mask,marker,clipPath,pattern')) continue;
        const s = getComputedStyle(el), bg = s.backgroundColor;
        // Boxes, shapes and pictures only. Bare text (no background of its own) is read like a caption: its text
        // may change or start in one frame (counters, readouts, a line of text) without counting as a pop.
        const painted = el instanceof SVGElement || /^(img|canvas|video)$/.test(tag) ||
          (bg && bg !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(bg));
        if (!painted) continue;
        const a = alphaOf(el); if (a <= 0) continue;
        // Visible part only: clip-path inset() and overflow-clipping ancestors (wipes, masks) cut the box.
        const b = el.getBoundingClientRect();
        let x0 = Math.max(0, b.left), x1 = Math.min(W, b.right), y0 = Math.max(0, b.top), y1 = Math.min(H, b.bottom);
        for (let e = el; e && e !== document.body; e = e.parentElement) {
          const z = e === el ? s : getComputedStyle(e), q = e.getBoundingClientRect();
          const inset = z.clipPath && z.clipPath.match(/^inset\(([^)]+)\)$/);
          if (inset) {
            const v = inset[1].trim().split(/\s+/), f = [v[0], v[1] || v[0], v[2] || v[0], v[3] || v[1] || v[0]];
            const px = (x, n) => parseFloat(x) * (x.endsWith('%') ? n / 100 : 1);
            x0 = Math.max(x0, q.left + px(f[3], q.width)); x1 = Math.min(x1, q.right - px(f[1], q.width));
            y0 = Math.max(y0, q.top + px(f[0], q.height)); y1 = Math.min(y1, q.bottom - px(f[2], q.height));
          }
          if (e !== el && /hidden|clip/.test(z.overflow)) { x0 = Math.max(x0, q.left); x1 = Math.min(x1, q.right); y0 = Math.max(y0, q.top); y1 = Math.min(y1, q.bottom); }
        }
        const w = Math.max(0, x1 - x0) * Math.max(0, y1 - y0) / (W * H);
        // Keyed by place in the overlay, not by node: a box rebuilt with innerHTML every frame is the same box.
        let path = '';
        for (let e = el; e && e !== ov; e = e.parentElement) path = e.tagName + ':' + [...e.parentElement.children].indexOf(e) + '/' + path;
        // Cut by the screen edge: it slides in or the camera reveals it, it does not pop - unless it is big and mostly
        // on screen already (a card placed a few px past the edge that switches on in one frame still pops).
        const full = Math.max(1e-9, b.width * b.height / (W * H));
        if ((b.left < 0 || b.right > W || b.top < 0 || b.bottom > H) && (w < .03 || w < .5 * full))
          straddle.add('u' + ov.dataset.scene + '/' + path);
        put('u' + ov.dataset.scene + '/' + path, w * a, name, group);
      }
    });
  }
  if (scene && cam) {
    cam.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    scene.traverse(o => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.geometry) return;
      let named = null, top = o;
      for (let a = o; a && a !== scene; a = a.parent) { if (!a.visible) return; if (!named && a.name) named = a; top = a; }
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox; if (!b || b.isEmpty()) return;
      let x0 = 1, x1 = -1, y0 = 1, y1 = -1, front = 0;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z)
          .applyMatrix4(o.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
        if (cam.isPerspectiveCamera && v.z > -cam.near) continue;
        v.applyMatrix4(cam.projectionMatrix); front++;
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      if (!front) return;
      // Cut by the screen edge: a part sliding in or revealed by the camera, not a pop (small parts cross the edge in 1-2 frames).
      const area = Math.max(0, Math.min(1, x1) - Math.max(-1, x0)) * Math.max(0, Math.min(1, y1) - Math.max(-1, y0)) / 4;
      if ((x0 < -1 || x1 > 1 || y0 < -1 || y1 > 1) && (area < .03 || area < .5 * (x1 - x0) * (y1 - y0) / 4))
        straddle.add('m' + id(o));
      // A box reaching behind the camera (a room or a big body the camera is close to) has no reliable screen
      // area: corners swap sides as the camera moves. No onset is counted for it in this frame or the next.
      if (front < 8) straddle.add('m' + id(o));
      let op = 0;
      for (const m of [].concat(o.material || [])) if (m && m.visible !== false) op = Math.max(op, m.transparent ? m.opacity : 1);
      const label = (named && named.name) || o.name || (g.type + '#' + o.id);
      put('m' + id(o), area * op, label, '3d:' + id(top));
    });
  }
  for (const c of P.open) { const e = now.get(c.key); c.ws.push(e ? e[0] : 0); }
  P.done.push(...P.open.filter(c => c.ws.length >= c.need));
  P.open = P.open.filter(c => c.ws.length < c.need);
  for (const [key, [w, name, group]] of now) {
    const prev = P.last.get(key) || 0;
    if (prev <= window.__motion.popOnset && w > window.__motion.popOnset && !straddle.has(key) && !(P.straddle || new Set()).has(key))
      P.open.push({key, frame, prev, name, group, ws: [w], need: window.__motion.popNeed});
  }
  P.last = new Map([...now].map(([k, e]) => [k, e[0]]));
  P.straddle = straddle;
}"""

# Mutation popin: one steady overlay element is hidden for 0.6 s and then shown again in one frame.
POP_HIDE = r"""([sel, a, b]) => {
  const render = window.renderAt;
  window.renderAt = async function(t) {
    await render(t);
    const el = document.querySelector(sel);
    if (el) el.style.visibility = t >= a && t < b ? 'hidden' : '';
  };
}"""

# Find an overlay element that is fully shown and steady at both t - .7 s and t, to hide before t (mutation popin).
POP_PICK = r"""async (times) => {
  for (const t of times) {
    const seen = [];
    for (const at of [t - .7, t]) {
      await window.renderAt(at);
      const list = new Map();
      for (const ov of document.querySelectorAll('.overlay[data-scene]')) {
        if (getComputedStyle(ov).display === 'none') continue;
        for (const el of ov.querySelectorAll('div')) {
          if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
          const bg = getComputedStyle(el).backgroundColor;
          if (!bg || bg === 'transparent' || /^rgba\(.*,\s*0\)$/.test(bg)) continue;   // a box, as POP_STEP counts
          let a = 1; for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') { a = 0; break; } a *= +s.opacity; }
          const r = el.getBoundingClientRect();
          if (a >= .99 && r.width * r.height >= .004 * innerWidth * innerHeight && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight) {
            if (!el.dataset.rvPopPick) el.dataset.rvPopPick = 'p' + Math.random().toString(36).slice(2);
            list.set(el.dataset.rvPopPick, Math.round(r.left) + ',' + Math.round(r.top));
          }
        }
      }
      seen.push(list);
    }
    for (const [k, pos] of seen[1]) if (seen[0].get(k) === pos) return {t, sel: `[data-rv-pop-pick="${k}"]`};
  }
  return null;
}"""

# Screen centre (0..1, y down) of explained subjects: KIT.process part indices and/or object names.
SUBJECT_PROBE = r"""async ([times, parts, names]) => {
  const all = window.__rvProcess || [], out = [];
  for (const t of times) {
    window.__motion.scene = null; await window.renderAt(t);
    const scene = window.__motion.scene, cam = window.__motion.camera;
    if (!scene || !cam) { out.push(null); continue; }
    scene.updateMatrixWorld(true); cam.updateMatrixWorld(true);
    const box = new THREE.Box3(), objs = parts.map(i => all[i] && all[i].obj).filter(Boolean);
    for (const n of names) scene.traverse(o => { if (o.name === n) objs.push(o); });
    for (const o of objs) {
      let root = o, shown = true; for (let a = o; a; a = a.parent) { if (!a.visible) shown = false; root = a; }
      if (root === scene && shown) box.expandByObject(o);
    }
    if (box.isEmpty()) { out.push(null); continue; }
    const c = box.getCenter(new THREE.Vector3()), v = c.clone().applyMatrix4(cam.matrixWorldInverse);
    if (cam.isPerspectiveCamera && v.z > -cam.near) { out.push({x: null, y: null}); continue; }
    c.project(cam);
    out.push({x: (c.x + 1) / 2, y: (1 - c.y) / 2});
  }
  return out;
}"""

# Mutation offcenter: inside each explanation span the camera turns 25 degrees away from what it looked at.
CAM_TURN = r"""spans => {
  const render = window.renderAt;
  let previous;
  window.renderAt = async function(t) {
    if (previous) { previous.c.quaternion.copy(previous.q); previous.c.updateMatrixWorld(true); }
    await render(t);
    const c = window.__motion.camera;
    if (!window.__motion.scene || !c) return;
    previous = {c, q: c.quaternion.clone()};
    if (window.__camTurnOn && spans.some(([a, b]) => t >= a && t <= b)) c.rotateY(25 * Math.PI / 180);
    c.updateMatrixWorld(true);
  };
}"""


# TEXT_MOTION: the 3D picture (no DOM) at each time with the first time's camera, 160x90; pixels inside text boxes are
# masked. moved[i] = the uncovered picture changed enough since the last moving sample (the first sample is one).
# Subjects (KIT.process parts, KIT.fx.focus, scene.userData.subject) are listed with their screen centre and whether
# a text box covers it.
TEXT_PROBE = r"""async ([times, boxes, share, rich]) => {
  const q = window.__motion, W = 160, H = 90, mask = new Uint8Array(W * H);
  const inBox = (u, v) => boxes.some(b => u >= b[0] && u <= b[2] && v >= b[1] && v <= b[3]);
  let free = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const m = inBox((x + .5) / W, (y + .5) / H) ? 0 : 1; mask[y * W + x] = m; free += m; }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', {willReadFrequently: true});
  let cam = null, anchor = null, x0 = W, y0 = H, x1 = -1, y1 = -1, subjects = [];
  const moved = [], shares = [], pictured = [];
  for (const t of times) {
    q.scene = null; await window.renderAt(t);
    pictured.push((await q.pictureSnapshot()).some(p => p.alpha >= .5 && p.area >= rich[0] && p.fill >= rich[1] && p.colors >= rich[2] && !rich[3].includes(p.id)));
    if (!q.scene || !q.camera) { moved.push(null); shares.push(null); continue; }
    if (!cam) {
      cam = q.camera.clone();
      cam.position.copy(q.camera.getWorldPosition(new THREE.Vector3()));
      cam.quaternion.copy(q.camera.getWorldQuaternion(new THREE.Quaternion()));
      cam.updateMatrixWorld(true);
      const objs = new Map();
      for (const e of window.__rvProcess || []) objs.set(e.obj, e.names[0] || e.kind);
      for (const o of (window.KIT && KIT.fx && KIT.fx.emphasis && KIT.fx.emphasis.extra) || []) if (!objs.has(o)) objs.set(o, o.name || 'focus');
      if (q.scene.userData.subject && !objs.has(q.scene.userData.subject)) objs.set(q.scene.userData.subject, q.scene.userData.subject.name || 'subject');
      q.scene.updateMatrixWorld(true);
      for (const [o, name] of objs) {
        let root = o, shown = true; for (let a = o; a; a = a.parent) { if (!a.visible) shown = false; root = a; }
        if (root !== q.scene || !shown) continue;
        const b = new THREE.Box3().expandByObject(o); if (b.isEmpty()) continue;
        const p = b.getCenter(new THREE.Vector3()), v = p.clone().applyMatrix4(cam.matrixWorldInverse);
        if (v.z > -cam.near) continue;
        p.project(cam); const u = (p.x + 1) / 2, w = (1 - p.y) / 2;
        if (u < 0 || u > 1 || w < 0 || w > 1) continue;
        subjects.push({name: String(name).slice(0, 40), x: +u.toFixed(2), y: +w.toFixed(2), covered: inBox(u, w)});
      }
    }
    q.scene.updateMatrixWorld(true);
    q.raw.call(q.renderer, q.scene, cam);
    q.renderer.getContext().finish();
    ctx.drawImage(q.renderer.domElement, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    if (!anchor) { anchor = d; moved.push(true); shares.push(0); continue; }
    let n = 0; const hit = [];
    for (let i = 0; i < W * H; i++) {
      if (!mask[i]) continue;
      const j = i * 4;
      if ((Math.abs(d[j] - anchor[j]) + Math.abs(d[j + 1] - anchor[j + 1]) + Math.abs(d[j + 2] - anchor[j + 2])) / 3 > 12) { n++; hit.push(i); }
    }
    const s = free ? n / free : 0; shares.push(+s.toFixed(5));
    if (s >= share) {
      anchor = d; moved.push(true);
      for (const i of hit) { const x = i % W, y = (i - x) / W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    } else moved.push(false);
  }
  return {free: free / (W * H), moved, shares, subjects, pictured,
    bbox: x1 < 0 ? null : [x0 / W, y0 / H, (x1 + 1) / W, (y1 + 1) / H].map(v => +v.toFixed(2))};
}"""

# Mutation textstill: inside one text window the page shows its first instant (3D, camera and text all stand still).
TEXT_FREEZE = r"""([a, b]) => {
  const render = window.__rvTextRender || (window.__rvTextRender = window.renderAt);
  window.renderAt = b == null ? render : async t => render(t >= a && t <= b ? a : t);
}"""


def text_windows(rows, tl, fps, edges):
    """Text windows: (scene, begin, end, {box: text}) with the camera held while text is shown (see TEXT_MOTION)."""
    out, cur = [], None
    gap = round(TEXT_GAP_S * fps)

    def close():
        if cur and (cur["last"] - cur["first"]) / fps >= TEXT_STILL_S:
            out.append((cur["scene"], cur["first"] / fps, cur["last"] / fps, cur["boxes"]))
    for r in rows:
        f, scene, cam = r["frame"], r["scene"], r.get("camera")
        t, ui = f / fps, r.get("ui") or []
        texts = [e for e in ui if e.get("box") and e.get("root") not in ("steps", "badge")]
        ok = False
        if scene in tl["modules"] and cam:
            s0, (lead, tail) = tl["modules"][scene]["start"], edges.get(scene, (0, 0))
            ok = s0 + lead <= t <= s0 + tl["modules"][scene]["duration"] - tail
        held = (cur and ok and scene == cur["scene"] and f == cur["prev"] + 1 and cam.get("id") == cur["cam"].get("id")
                and math.dist(cam["p"], cur["cam"]["p"]) <= CAMERA_TEXT_DISTANCE
                and math.dist(look_points([r])[0], cur["look"]) <= CAMERA_TEXT_DISTANCE)
        if held and (texts or f - cur["last"] <= gap):
            cur["prev"] = f
        else:
            close()
            cur = {"scene": scene, "first": f, "last": f, "prev": f, "cam": cam, "look": look_points([r])[0],
                   "boxes": {}} if ok and texts else None
        if cur and texts:
            cur["last"] = f
            for e in ui:
                if e.get("box"):
                    cur["boxes"].setdefault(tuple(e["box"]), e["text"])
    close()
    return out


def still_stretch(times, moved):
    """Longest time between moving samples (or the window end): (seconds, begin, end)."""
    seen = [(t, m) for t, m in zip(times, moved) if m is not None]
    if not seen:
        return 0.0, None, None
    best, anchor = (0.0, seen[0][0], seen[0][0]), seen[0][0]
    for t, m in seen[1:] + [(seen[-1][0], True)]:
        if m:
            if t - anchor > best[0]:
                best = (t - anchor, anchor, t)
            anchor = t
    return best


def camera_cut(a, b):
    """A one-frame camera jump: the whole picture changes, so nothing in it 'pops'."""
    if not a or not b:
        return True
    dot = min(1.0, abs(sum(x * y for x, y in zip(a["q"], b["q"]))))
    return math.dist(a["p"], b["p"]) > POP_CUT_M or 2 * math.degrees(math.acos(dot)) > POP_CUT_DEG


def pop_findings(records, rows, tl, fps, spans, cuts, lo=0):
    """Group simultaneous onsets per overlay child / top 3D object; a group whose summed peak >= POP_MIN_WEIGHT
    and whose members rise to POP_RISE of their peak within POP_FRAMES frames is a pop (unless exempt)."""
    by_frame = {r["frame"]: r for r in rows}
    need = max(POP_FRAMES, round(POP_PEAK_S * fps))
    groups = defaultdict(list)
    for c in records:
        ws = c["ws"] + [0] * (need - len(c["ws"]))
        peak = max(ws)
        if peak <= 0 or c["prev"] > POP_FROM * peak or max(ws[:POP_FRAMES]) < POP_RISE * peak:
            continue
        groups[(c["frame"], c["group"])].append((peak, c["name"]))
    # Groups that pop in the same frame are one event (a label's leader line and its text box, a card's parts).
    frames = defaultdict(list)
    for (frame, group), items in groups.items():
        if sum(p for p, _ in items) >= POP_MIN_WEIGHT:
            frames[frame].append((group, items))
    failures, rows_out, exempt = [], [], 0
    for frame, members in sorted(frames.items()):
        items = [x for _, its in members for x in its]
        group = "ui:" if all(g.startswith("ui:") for g, _ in members) else "3d" if not any(
            g.startswith("ui:") for g, _ in members) else "mixed"
        weight = sum(p for p, _ in items)
        t = frame / fps
        scene = next((s for s in reversed(tl["order"]) if t + 1e-7 >= tl["modules"][s]["start"]), tl["order"][0])
        start = tl["modules"][scene]["start"]
        end = start + tl["modules"][scene]["duration"]
        lead, tail = spans.get(scene, (0, 0))
        names = []
        for _, n in sorted(items, reverse=True):
            if n not in names:
                names.append(n)
        names = [n for n in names if not re.fullmatch(r"svg#\d+", n)] or names   # leader lines: name the text
        kind = "ui" if group == "ui:" else group
        here, before = by_frame.get(frame), by_frame.get(frame - 1)
        reason = ("scene_start" if frame <= max(lo, math.ceil(start * fps - 1e-6)) or (before and here and before.get("scene") != here.get("scene")) else
                  "transition" if t < start + lead or t > end - tail else
                  "declared_cut" if any(abs(start + c - t) <= 1.5 / fps for c in cuts.get(scene, [])) else
                  "camera_cut" if here and before and here.get("camera") and camera_cut(here["camera"], before.get("camera")) else "")
        line = (f"POP_IN {scene} t={t:.3f}s kind={kind} element={names[0]!r}"
                f"{' +' + str(len(names) - 1) + ' more' if len(names) > 1 else ''} weight={weight:.4f} "
                f"need_fade>={POP_FRAMES + 1}frames min_weight={POP_MIN_WEIGHT}")
        if reason:
            exempt += 1
            rows_out.append(f"{line} EXEMPT {reason}")
            continue
        rows_out.append(f"{line} FAIL")
        failures.append((frame, scene, "pop_in", f"{kind} element={names[0]!r} weight={weight:.4f} "
                         f"appears within {POP_FRAMES} frames with no fade/slide/camera reveal"))
    return failures, rows_out, exempt


def frame_verdict(samples):
    """Share of the samples where the subject is shown (None = hidden, e.g. an exhaust between puffs) that have its
    centre inside the central box; behind the camera counts as outside. Also the mean centre."""
    shown = [s for s in samples if s]
    seen = [s for s in shown if s.get("x") is not None]
    inside = [s for s in seen if abs(s["x"] - .5) <= FRAME_BOX and abs(s["y"] - .5) <= FRAME_BOX]
    share = len(inside) / len(shown) if shown else 0.0
    mx = statistics.mean(s["x"] for s in seen) if seen else float("nan")
    my = statistics.mean(s["y"] for s in seen) if seen else float("nan")
    return share, mx, my, len(seen)


CAM_NUDGE = r"""events => {
  const render=window.renderAt;
  let previous;
  window.renderAt=async function(t) {
    if(previous) {
      previous.camera.position.copy(previous.position);
      previous.camera.updateMatrixWorld(true);
    }
    await render(t);
    const q=window.__motion,c=q.camera;
    if(!q.scene||!c)return;
    previous={camera:c,position:c.position.clone()};
    const offset=events.reduce((sum,event)=>{
      const u=(t-event.t)/.8;
      return sum+(u>0&&u<1?Math.max(.04,event.height*.025)*Math.sin(Math.PI*u)**2:0);
    },0);
    c.translateX(offset);
    c.updateMatrixWorld(true);
  };
}"""

TRANS_GLIDE = r"""([begin,end]) => {
  const render=window.renderAt;
  let previous;
  window.renderAt=async function(t) {
    if(previous) {
      previous.camera.position.copy(previous.position);
      previous.camera.updateMatrixWorld(true);
    }
    await render(t);
    const c=window.__motion.camera;
    if(!window.__motion.scene||!c)return;
    previous={camera:c,position:c.position.clone()};
    if(t>=begin && t<end)c.translateX(.30*(t-begin)/(end-begin));
    c.updateMatrixWorld(true);
  };
}"""

CARD_TEXT = r"""pattern => {
  const out=[], action=new RegExp(pattern);
  for(const ov of document.querySelectorAll('.overlay[data-scene]')) {
    if(getComputedStyle(ov).display==='none')continue;
    const walk=document.createTreeWalker(ov,NodeFilter.SHOW_TEXT);
    while(walk.nextNode()) {
      const n=walk.currentNode,e=n.parentElement;
      // Read action cards, not telemetry/counters. A changing angle readout is
      // neither a new process step nor a hard cut.
      if(!action.test(n.textContent)||!e.getBoundingClientRect().width)continue;
      let visible=true;
      for(let a=e;a;a=a.parentElement) {
        const s=getComputedStyle(a);
        if(s.display==='none'||s.visibility==='hidden'||+s.opacity<.05)visible=false;
      }
      if(visible)out.push(n.textContent.trim());
    }
  }
  return out.join(' | ');
}"""

ACTION_PROBE = r"""async ([times,freeze,lockCamera,linked,said]) => {
  const q=window.__motion, frames=[], poses=[];
  let cam, frozen, ambient=[];
  // The span's own subject is never background: the parts its line names (KIT.process, by registry index), a
  // KIT.label whose text the line says, what they are attached to, and what carries them or hangs off them.
  // A spinning wheel that carries the named wire is the action, not a rotor in the back.
  const own=new Set(), seen=new Set(), mark=o=>{
    if(!o||seen.has(o))return;
    seen.add(o);
    for(let a=o;a&&!a.isScene;a=a.parent)own.add(a);
    o.traverse(c=>own.add(c));
  };
  if(lockCamera && times.length>2) {
    // Remove already-running background motion (e.g. a continuously spinning
    // rotor). Otherwise a rotor would "prove" that a stationary lid opened.
    const before=new Map();
    await window.renderAt(Math.max(0,times[0]-.8));
    const reg=window.__rvProcess||[], subjects=[];
    for(const i of linked||[])if(reg[i])subjects.push(reg[i].obj);
    for(const l of window.__KIT_LABELS||[]){const w=(l.box&&l.box.textContent||'').trim();if(l.target&&w&&said&&said.includes(w))subjects.push(l.target);}
    const att=(window.KIT&&KIT.fx&&KIT.fx.clearance&&KIT.fx.clearance.attachments)||[];
    for(const o of subjects.slice())for(const d of att)if(d.part===o)subjects.push(d.support);
    subjects.forEach(mark);
    if(q.scene)q.scene.traverse(o=>{
      if(!o.matrixAutoUpdate)return;
      o.updateMatrix();before.set(o.uuid,o.matrix.elements.slice());
    });
    await window.renderAt(Math.max(0,times[0]-.4));
    if(q.scene)q.scene.traverse(o=>{
      if(!o.matrixAutoUpdate)return;
      o.updateMatrix();const m=before.get(o.uuid);
      if(m && !o.isCamera && !own.has(o) && m.some((v,i)=>Math.abs(v-o.matrix.elements[i])>1e-4))ambient.push(o);
    });
  }
  let ambientPose;
  for(const t of times) {
    q.scene=null;
    await window.renderAt(t);
    if(!q.scene)continue;
    let scene=q.scene;
    if(!cam) {
      cam=q.camera.clone();
      cam.position.copy(q.camera.getWorldPosition(new THREE.Vector3()));
      cam.quaternion.copy(q.camera.getWorldQuaternion(new THREE.Quaternion()));
      cam.updateMatrixWorld(true);
    }
    if(!ambientPose)ambientPose=ambient.map(o=>[o,o.position.clone(),o.quaternion.clone(),o.scale.clone()]);
    for(const [o,p,r,s] of ambientPose) {o.position.copy(p);o.quaternion.copy(r);o.scale.copy(s);}
    if(freeze) {
      if(!frozen) {
        // A TRS hold does not freeze matrixAutoUpdate=false rigs (URDF), nor
        // terrain/fan BufferGeometry updated each render. Render a genuinely
        // independent snapshot while the original scene and DOM keep advancing.
        frozen=scene.clone(true);
        const geometries=new Map(),materials=new Map();
        const copyMaterial=m=>{
          if(!materials.has(m))materials.set(m,m.clone());
          return materials.get(m);
        };
        frozen.traverse(o=>{
          if(o.geometry) {
            if(!geometries.has(o.geometry))geometries.set(o.geometry,o.geometry.clone());
            o.geometry=geometries.get(o.geometry);
          }
          if(o.material)o.material=Array.isArray(o.material)?o.material.map(copyMaterial):copyMaterial(o.material);
        });
      }
      scene=frozen;
    }
    scene.updateMatrixWorld(true);
    const pose={};
    scene.traverse(o=>{
      if(!o.isMesh && !o.isPoints && !o.isLine)return;
      for(let a=o;a;a=a.parent)if(!a.visible||a.isCamera)return;
      pose[o.uuid]=o.matrixWorld.elements.slice();
    });
    poses.push(pose);
    // Direct renderer canvas only: DOM cards, captions, fades and CSS are absent.
    // Locking the camera prevents a camera push from passing for part motion.
    q.raw.call(q.renderer,scene,lockCamera ? cam : q.camera);
    // Shader/texture uploads can settle on the first direct draw after the
    // non-raster trajectory pass. Read a completed GPU frame, not that upload.
    q.renderer.getContext().finish();
    const c=document.createElement('canvas');c.width=160;c.height=90;
    const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(q.renderer.domElement,0,0,160,90);
    frames.push(ctx.getImageData(0,0,160,90).data);
  }
  let rgb=0,pixels=0,state=0;
  for(let i=1;i<frames.length;i++) {
    let sum=0,n=0;
    for(let j=0;j<frames[i].length;j+=4) {
      const d=Math.abs(frames[i][j]-frames[0][j])+Math.abs(frames[i][j+1]-frames[0][j+1])+Math.abs(frames[i][j+2]-frames[0][j+2]);
      sum+=d;if(d/3>12)n++;
    }
    rgb=Math.max(rgb,sum/(160*90*3));pixels=Math.max(pixels,n/(160*90));
    for(const [id,m] of Object.entries(poses[i])) {
      if(!poses[0][id]) {state=Math.max(state,1);continue;}
      for(let j=0;j<16;j++)state=Math.max(state,Math.abs(m[j]-poses[0][id][j]));
    }
    if(Object.keys(poses[0]).some(id=>!poses[i][id]))state=Math.max(state,1);
  }
  return {rgb,pixels,state,samples:frames.length,ambient:ambient.length,own:own.size};
}"""

PROCESS_PROBE = r"""async (times) => {
  const all = window.__rvProcess || [], out = [];
  for (const t of times) {
    window.__motion.scene = null; await window.renderAt(t);
    out.push(all.map(e => {
      let root = e.obj; for (let a = e.obj; a; a = a.parent) { if (!a.visible && e.kind !== 'exhaust') return null; root = a; }
      if (root !== window.__motion.scene) return null;
      e.obj.updateWorldMatrix(true, false);
      const q = e.obj.getWorldQuaternion(new THREE.Quaternion());
      return {s: e.state(), y: e.obj.getWorldPosition(new THREE.Vector3()).y, q: [q.x, q.y, q.z, q.w]};
    }));
  }
  return {parts: all.map(e => ({kind: e.kind, names: e.names, handles: e.handles.length})), rows: out};
}"""

HATCH_COVER_PROBE = r"""async (times) => {
  const out = {}, all = window.__rvProcess || [];
  for (const t of times) {
    window.__motion.scene = null; await window.renderAt(t);
    all.forEach((e, i) => {
      if (e.kind !== 'hatch' || out[i]) return;
      let root = e.obj; for (let a = e.obj; a; a = a.parent) root = a;
      if (root !== window.__motion.scene) return;
      const f = e.obj.userData.rvHatchFrame, label = e.obj.name || e.names[0];
      if (!f) { out[i] = {t, name: label, frame: null}; return; }
      const keep = e.obj.quaternion.clone();
      e.obj.quaternion.copy(e.obj.userData.rvHatchRest); root.updateMatrixWorld(true);
      const g = f.geometry; g.computeBoundingBox();
      const bb = g.boundingBox, size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
      const axes = ['x', 'y', 'z'].sort((a, b) => size[a] - size[b]), q = g.parameters || {};
      let r = Math.min(size[axes[1]], size[axes[2]]) / 2;
      if (g.type === 'TorusGeometry') r = q.radius - q.tube;
      else if (g.type === 'RingGeometry') r = q.innerRadius;
      else if (g.type === 'CircleGeometry') r = q.radius;
      const unitAxis = a => new THREE.Vector3(+(a === 'x'), +(a === 'y'), +(a === 'z'));
      const w = f.matrixWorld, centre = c.clone().applyMatrix4(w);
      const n = unitAxis(axes[0]).transformDirection(w), e1 = unitAxis(axes[1]).transformDirection(w), e2 = unitAxis(axes[2]).transformDirection(w);
      const sc = f.getWorldScale(new THREE.Vector3()), rw = r * .95 * Math.min(sc[axes[1]], sc[axes[2]]);
      const meshes = []; e.obj.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
      const ray = new THREE.Raycaster(); let hit = 0, total = 0;
      for (let a = -7; a <= 7; a++) for (let b = -7; b <= 7; b++) {
        const u = a / 7.5, v = b / 7.5; if (u * u + v * v > 1) continue;
        const pt = centre.clone().addScaledVector(e1, u * rw).addScaledVector(e2, v * rw); total++;
        ray.set(pt.clone().addScaledVector(n, -.5), n); ray.far = 1.0;
        if (ray.intersectObjects(meshes, false).length) hit++;
      }
      e.obj.quaternion.copy(keep); root.updateMatrixWorld(true);
      out[i] = {t, name: label, frame: f.name || f.geometry.type, coverage: total ? hit / total : 0, points: total};
    });
  }
  return Object.values(out);
}"""


ACT_REVERSE = r"""() => { let n = 0;
  for (const e of window.__rvProcess || []) for (const h of e.handles) { const f = h.set; h.set = function(u) { return f.call(this, 1 - u); }; n++; }
  return n; }"""


def match_class(text):
    found = [k for k, rx in (("rise", MATCH_RISE), ("fall", MATCH_FALL), ("up", MATCH_UP),
                             ("down", MATCH_DOWN), ("turn", MATCH_TURN)) if rx.search(text)]
    return found[0] if len(found) == 1 else None


def match_targets(parts, text, context):
    hits = [i for i, part in enumerate(parts) if any(n and n in text for n in part["names"])]
    if hits or not context:
        return hits
    at = context.find(text)
    if at < 0:
        verb = ACTION_VERBS.search(context)
        at = verb.start() if verb else len(context)
    window = context[max(0, at - MATCH_NOUN_CHARS):at]
    window = re.split(r"[,.|\n·;]", window)[-1] + context[at:at + len(text)]
    best = {}
    for i, part in enumerate(parts):
        for n in part["names"]:
            k = window.rfind(n) if n else -1
            if k >= 0:
                best[i] = max(best.get(i, -1), k)
    return [max(best, key=best.get)] if best else []


def match_run(values, inside, sign, step):
    lo, hi, best, i = inside[0], inside[-1], None, 0
    while i < len(values) - 1:
        j = i
        while j + 1 < len(values) and sign * (values[j + 1] - values[j]) >= -step:
            j += 1
        if any(sign * (values[k + 1] - values[k]) > step for k in range(max(i, lo), min(j, hi))):
            first, last = max(i, lo), min(j, hi)
            while first > i and sign * (values[first] - values[first - 1]) > step:
                first -= 1
            while last < j and sign * (values[last + 1] - values[last]) > step:
                last += 1
            if best is None or sign * (values[last] - values[first]) > sign * (values[best[1]] - values[best[0]]):
                best = (first, last)
        i = j if j > i else i + 1
    if best:
        return best
    first, last = lo, hi
    while first > 0 and sign * (values[first] - values[first - 1]) > step:
        first -= 1
    while last + 1 < len(values) and sign * (values[last + 1] - values[last]) > step:
        last += 1
    return first, last


def match_part(kind, cls, times, samples, begin, end):
    inside = [i for i, t in enumerate(times) if begin - 1e-9 <= t <= end + 1e-9]
    if not inside or any(samples[i] is None for i in inside):
        return False, "target not visible in span"
    known = [i for i, x in enumerate(samples) if x is not None]
    lo, hi = known[0], known[-1]
    seq = list(range(lo, hi + 1))
    if any(samples[i] is None for i in seq):
        seq = inside
    inside = [seq.index(i) for i in inside]
    ts = [times[i] for i in seq]
    st = [samples[i]["s"] for i in seq]
    if kind == "exhaust":
        on = any(st[i] >= .5 for i in inside)
        return on, f"active_in_span={on}"
    if cls in ("up", "down"):
        ys = [samples[i]["y"] for i in seq]
        sign = 1 if cls == "up" else -1
        a, b = match_run(ys, inside, sign, 1e-4)
        dy = ys[b] - ys[a]
        return sign * dy >= MATCH_LIFT_M, f"dy={dy:+.3f}m@{ts[a]:.2f}..{ts[b]:.2f}s need {sign * MATCH_LIFT_M:+.3f}m"
    if cls == "turn":
        q0 = samples[seq[inside[0]]]["q"]
        deg = max(2 * math.degrees(math.acos(min(1, abs(sum(x * y for x, y in zip(q0, samples[seq[i]]["q"]))))))
                  for i in inside)
        moved = deg >= MATCH_TURN_DEG or max(st[i] for i in inside) - min(st[i] for i in inside) >= MATCH_MOVE
        return moved, f"turn={deg:.1f}deg need {MATCH_TURN_DEG}deg"
    span = max(st[i] for i in inside) - min(st[i] for i in inside)
    if span < MATCH_MOVE:
        return False, f"target static s_range={span:.2f} need {MATCH_MOVE}"
    if cls not in ("rise", "fall"):
        return True, f"s_range={span:.2f}"
    sign = 1 if cls == "rise" else -1
    a, b = match_run(st, inside, sign, .002)
    s0, s1 = st[a], st[b]
    ok = (s0 <= MATCH_REST and s1 >= MATCH_FULL and s1 - s0 >= MATCH_MOVE) if cls == "rise" else \
        (s0 - s1 >= MATCH_MOVE and s1 <= MATCH_REST)
    return ok, f"s={s0:.2f}@{ts[a]:.2f}s->{s1:.2f}@{ts[b]:.2f}s"


def transition_starts(tl, transitions, looks, blend_s):
    out = []
    for prev, nxt in zip(tl["order"], tl["order"][1:]):
        anchor = tl["modules"][nxt]["start"]
        crossfade = float(tl.get("crossfade_s") or 0)
        if (looks.get(nxt) or "cinema") != (looks.get(prev) or "cinema"):
            out.append((prev, nxt, "blend", anchor, anchor + blend_s))
        elif nxt in transitions:
            half = (transitions[nxt].get("dur") or .6) / 2
            out.append((prev, nxt, "dip", anchor - half, anchor + half))
        elif crossfade > 0:
            out.append((prev, nxt, "crossfade", anchor, anchor + crossfade))
    return out


def read_time(text):
    return max(TEXT_READ_MIN_S, TEXT_READ_BASE_S + TEXT_READ_PER_CHAR_S * len("".join(text.split())))


def text_transition_findings(rows, starts, fps):
    frames = {r["frame"]: r for r in rows if r.get("ui") is not None}
    fails, lines = [], []
    for prev, nxt, kind, t0, t1 in starts:
        f0 = round(t0 * fps)
        before, after = frames.get(f0 - 1), frames.get(round(t1 * fps) + 1)
        if before is None:
            lines.append(f"TEXT_TRANSITION {prev}->{nxt} kind={kind} t={t0:.2f}s SKIP unmeasured")
            continue
        shown = {(e["id"], e["text"]) for e in before["ui"]}
        since = {}
        for f in range(f0 - 1, max(-1, f0 - 1 - round(10 * fps)), -1):
            row = frames.get(f)
            here = {(e["id"], e["text"]) for e in row["ui"]} if row else set()
            for key in shown:
                if key in here and since.get(key, f + 1) == f + 1:
                    since[key] = f
        persist = {k for k in shown & {(e["id"], e["text"]) for e in (after["ui"] if after else [])}
                   if t0 - since.get(k, f0) / fps >= read_time(k[1])}
        during = [e["text"] for e in before["ui"] if (e["id"], e["text"]) not in persist and e["text"].strip()]
        for f in range(f0, round(t1 * fps) + 1):
            row = frames.get(f)
            for e in (row["ui"] if row else []):
                if (e["id"], e["text"]) not in shown and e["text"].strip() and e["text"] not in during:
                    during.append(e["text"])
        seen, unread = set(), []
        for f in range(max(0, f0 - round(10 * fps)), f0):
            row = frames.get(f)
            if row is None:
                continue
            now = {(e["id"], e["text"]) for e in row["ui"]}
            for key in now - seen:
                if key not in persist and key[1].strip() and t0 - f / fps < read_time(key[1]):
                    unread.append((key[1], t0 - f / fps, read_time(key[1])))
            seen = now
        ok = not during and not unread
        detail = (f"kind={kind} start={t0:.2f}s during={during!r} "
                  f"unread={[(x[0], round(x[1], 2), round(x[2], 2)) for x in unread]!r} read_s=max({TEXT_READ_MIN_S},{TEXT_READ_BASE_S}+{TEXT_READ_PER_CHAR_S}*chars)")
        lines.append(f"TEXT_TRANSITION {prev}->{nxt} {'PASS' if ok else 'FAIL'} {detail}")
        if during:
            fails.append((f0, prev, "text_during_transition", detail))
        if unread:
            fails.append((f0, prev, "text_unread", detail))
    return fails, lines


TEXT_CUT = r"""([scene, a, b]) => {
  const ov = [...document.querySelectorAll('.overlay[data-scene]')].find(e => e.dataset.scene === scene);
  if (!ov) return false;
  const el = document.createElement('div');
  el.textContent = '변이 글자 전환 직전'; el.style.cssText = 'position:absolute;left:200px;top:300px;font:700 40px sans-serif;color:#fff;background:#123;padding:10px;display:none';
  ov.append(el);
  const orig = window.renderAt;
  window.renderAt = async function (t) { el.style.display = t >= a && t < b ? 'block' : 'none'; return orig.call(this, t); };
  return true;
}"""


def ui_appearances(rows, fps):
    """Every visible text-change instant, including captions and scene entry."""
    events, previous = [], set()
    for row in rows:
        if row.get("ui") is None:
            continue
        current = {e["id"] for e in row["ui"]}
        new = [e for e in row["ui"] if e["id"] not in previous]
        if new:
            events.append({"scene": row["scene"], "t": row["frame"] / fps,
                           "text": " | ".join(e["text"] for e in new),
                           "source": "+".join(sorted({e["source"] for e in new}))})
        previous = current
    return events


def camera_delta(a, b):
    """Camera-only screen displacement estimate; independent of object animation."""
    distance = math.dist(a["p"], b["p"])
    dot = min(1, abs(sum(x * y for x, y in zip(a["q"], b["q"]))))
    angle = 2 * math.acos(dot)
    height = max(1e-6, a["height"])
    translation = distance / height
    rotation = angle * a["focus"] / height
    zoom = abs(b["scale"] / a["scale"] - 1)
    return max(translation, rotation, zoom), distance, math.degrees(angle)


def point_span(points):
    return max((math.dist(a, b) for i, a in enumerate(points) for b in points[i+1:]), default=0)


def look_points(samples, distance=CAMERA_LOOK_DISTANCE):
    # Never let moving mesh depths manufacture camera motion. The fallback
    # distance is fixed for the complete window, not recomputed each frame.
    explicit = all(r["camera"]["target"] is not None for r in samples)
    return [r["camera"]["target"] if explicit else
            [p + d * distance for p, d in zip(r["camera"]["p"], r["camera"]["direction"])]
            for r in samples]


def tracking_check(samples, shot):
    name = shot.get("subject")
    if not isinstance(name, str) or not name:
        return False, "missing named subject"
    subjects = [r.get("subjects", {}).get(name) for r in samples]
    if any(s is None or s["count"] != 1 or not s["visible"] or not s["landmarks"] for s in subjects):
        return False, "subject missing, ambiguous, hidden, or without visible geometry"
    if len({s["id"] for s in subjects}) != 1:
        return False, "subject object changes across window"
    depth = math.dist(samples[0]["camera"]["p"], subjects[0]["center"])
    errors, movement = [], 0
    for row, subject in zip(samples, subjects):
        camera = row["camera"]
        target = camera["target"]
        if target is None:
            target = [p + d * depth for p, d in zip(camera["p"], camera["direction"])]
        errors.append(min(math.dist(target, subject["p"]), math.dist(target, subject["center"])))
        for key in subjects[0]["landmarks"].keys() & subject["landmarks"].keys():
            movement = max(movement, max(math.dist(a, b) for a, b in
                zip(subjects[0]["landmarks"][key], subject["landmarks"][key])))
    error = max(errors)
    detail = f"tracking_error={error:.6f}m subject_motion={movement:.6f}m tolerance={CAMERA_TRACK_DISTANCE}m"
    return error <= CAMERA_TRACK_DISTANCE and movement > CAMERA_TEXT_DISTANCE, detail


def path_ratio(points):
    chord = math.dist(points[0], points[-1])
    path = sum(math.dist(a, b) for a, b in zip(points, points[1:]))
    return path / chord if chord > 1e-9 else math.inf


def action_check(window, shot_rows, shot, begin, end, fps):
    """Camera motion in an action shot passes only with a real, framed action and one directed move."""
    name = shot.get("subject")
    if not isinstance(name, str) or not name or "end" not in shot:
        return False, "action shot needs subject and end"
    if end - begin > ACTION_SHOT_MAX + 1e-9:
        return False, f"action shot {end - begin:.3f}s > {ACTION_SHOT_MAX}s"
    inside = shot_rows
    before = [r for r in window if r["frame"] / fps < begin - 1e-8]
    after = [r for r in window if r["frame"] / fps > end + 1e-8]
    beyond = max(max(point_span([r["camera"]["p"] for r in side]), point_span(look_points(side))) for side in (before, after))
    if beyond > CAMERA_TEXT_DISTANCE:
        return False, f"camera moves {beyond:.6f}m outside the action shot"
    if len(inside) < 2:
        return False, "action shot not sampled"
    subjects = [r.get("subjects", {}).get(name) for r in inside]
    if any(s is None or s.get("count") != 1 or not s["visible"] or not s["landmarks"] for s in subjects):
        return False, "subject missing, ambiguous, hidden, or without visible geometry"
    movement = max((math.dist(a, b) for s in subjects for key in subjects[0]["landmarks"].keys() & s["landmarks"].keys()
                    for a, b in zip(subjects[0]["landmarks"][key], s["landmarks"][key])), default=0)
    offsets = []
    for row, subject in zip(inside, subjects):
        camera = row["camera"]
        v = [c - p for c, p in zip(subject["center"], camera["p"])]
        along = sum(x * d for x, d in zip(v, camera["direction"]))
        perp = math.sqrt(max(0, sum(x * x for x in v) - along * along))
        offsets.append(perp / (along * camera["scale"] / 2) if along > 1e-9 else math.inf)
    frame, frame_end = max(offsets), offsets[-1]
    step = max(1, round(ACTION_PATH_STEP * fps))
    coarse = inside[::step] + ([inside[-1]] if (len(inside) - 1) % step else [])
    position_ratio = path_ratio([r["camera"]["p"] for r in coarse])
    looks = look_points(coarse)
    look_ratio = path_ratio(looks) if point_span(looks) > CAMERA_TEXT_DISTANCE else 1.0
    point = subjects[-1]["center"]
    first, last = inside[0]["camera"], inside[-1]["camera"]
    a, b = [x - y for x, y in zip(first["p"], point)], [x - y for x, y in zip(last["p"], point)]
    na, nb = math.hypot(*a), math.hypot(*b)
    zoom = max(na * first["scale"], 1e-9) / max(nb * last["scale"], 1e-9)
    zoom = max(zoom, 1 / zoom)
    orbit = math.degrees(math.acos(max(-1, min(1, sum(x * y for x, y in zip(a, b)) / max(na * nb, 1e-12)))))
    detail = (f"subject_motion={movement:.6f}m frame_offset={frame:.3f} frame_end={frame_end:.3f} path_ratio={max(position_ratio, look_ratio):.3f} "
              f"zoom={zoom:.3f}x orbit={orbit:.1f}deg shot={end - begin:.3f}s")
    valid = (movement > CAMERA_TEXT_DISTANCE and frame <= ACTION_FRAME_ANY and frame_end <= ACTION_FRAME and
             max(position_ratio, look_ratio) <= ACTION_PATH_RATIO and (zoom >= ACTION_ZOOM or orbit >= ACTION_ORBIT_DEG))
    return valid, detail


def transition_spans(tl, transitions, looks, blend_s):
    """Seconds at each scene's start and end taken by its transition, as kit/shell.html and lib/xfade.py play them."""
    spans = {name: [0.0, 0.0] for name in tl["order"]}
    for previous, name in zip(tl["order"], tl["order"][1:]):
        lead = float(tl.get("crossfade_s") or 0)
        if (looks.get(name) or "cinema") != (looks.get(previous) or "cinema"):
            lead = max(lead, blend_s)
        elif name in transitions:
            half = (transitions[name].get("dur") or .6) / 2
            lead = max(lead, half)
            spans[previous][1] = half
        spans[name][0] = lead
    return spans


class TransitionSpan(NamedTuple):
    scene: str
    kind: Literal["dip", "blend", "crossfade"]
    side: Literal["lead", "tail"]
    begin: float
    end: float
    anchor: float
    duration: float
    depth: float


def transition_camera_findings(rows, kinds, context):
    """Judge live camera motion where the transition picture weight is >= .2.

    Context carries the compositor timeline, sampling fps, dip declarations,
    scene looks and blend duration. Frozen outgoing dissolve frames are absent.
    """
    tl, fps, transitions, looks, blend_s = context
    failures, summaries, spans = [], [], []
    for previous, scene in zip(tl["order"], tl["order"][1:]):
        anchor = tl["modules"][scene]["start"]
        crossfade = float(tl.get("crossfade_s") or 0)
        if crossfade > 0:
            spans.append(TransitionSpan(scene, "crossfade", "lead", anchor, anchor + crossfade, anchor, crossfade, 1))
        if (looks.get(scene) or "cinema") != (looks.get(previous) or "cinema"):
            spans.append(TransitionSpan(scene, "blend", "lead", anchor, anchor + blend_s, anchor, blend_s, 1))
        elif scene in transitions:
            half = (transitions[scene].get("dur") or .6) / 2
            depth = transitions[scene].get("depth", 1)
            spans.extend([TransitionSpan(scene, "dip", "lead", anchor, anchor + half, anchor, half, depth),
                          TransitionSpan(previous, "dip", "tail", anchor - half, anchor, anchor, half, depth)])
    for scene, kind, side, begin, end, anchor, duration, depth in spans:
        samples, ids = [], set()
        for row in rows:
            t = row["frame"] / fps
            if row["scene"] != scene or not row.get("camera"):
                continue
            match kind:
                case "dip":
                    if not begin <= t < end:
                        continue
                    u = max(0, min(1, 1 - abs(t - anchor) / duration))
                    weight = 1 - depth * u * u * (3 - 2 * u)
                case "blend":
                    if not begin <= t < end:
                        continue
                    u = max(0, min(1, (t - anchor) / duration))
                    weight = u * u * (3 - 2 * u)
                case "crossfade":
                    render_fps = tl.get("fps", fps)
                    n = max(1, round(duration * render_fps))
                    k = round(t * render_fps) - round(anchor * render_fps)
                    if not 0 <= k < n:
                        continue
                    weight = (k + 1) / (n + 1)
                case unreachable:
                    assert_never(unreachable)
            ids.add(row["camera"].get("id"))
            if weight >= .2:
                samples.append(row)
        detail = f"kind={kind} side={side} span={begin:.3f}..{end:.3f}"
        if len(ids) > 1:
            summaries.append(f"CAMERA_TRANSITION scene={scene} {detail} position=unmeasured look_at=unmeasured "
                             f"verdict=PASS cameras={len(ids)} camera_switch=true")
            continue
        position = point_span([r["camera"]["p"] for r in samples])
        look = point_span(look_points(samples))
        moving = len(samples) >= 2 and max(position, look) > CAMERA_TEXT_DISTANCE
        exemption = ""
        if moving:
            declared = kinds.get(scene, [])
            scene_start = tl["modules"][scene]["start"]
            for i, shot in enumerate(declared):
                shot_begin = scene_start + shot["t"]
                shot_end = scene_start + shot.get("end", declared[i+1]["t"] if i+1 < len(declared)
                                                else tl["modules"][scene]["duration"])
                if (shot.get("kind") in ("follow", "explode") and
                        shot_begin <= samples[0]["frame"] / fps and samples[-1]["frame"] / fps < shot_end):
                    valid, tracking = tracking_check(samples, shot)
                    if valid:
                        moving = False
                        exemption = f" exempt={shot['kind']} subject={shot['subject']!r} {tracking}"
                        break
        values = (f"{detail} position={position:.6f}m look_at={look:.6f}m "
                  f"visible_frames={len(samples)} threshold={CAMERA_TEXT_DISTANCE}m")
        if moving:
            failures.append((samples[0]["frame"], scene, "transition_camera_motion", values))
        summaries.append(f"CAMERA_TRANSITION scene={scene} {values} verdict={'FAIL' if moving else 'PASS'}{exemption}")
    summaries.append(f"CAMERA_TRANSITION_TOTAL caught={len(failures)} spans={len(spans)}")
    summaries.append("CAMERA_TRANSITION_CHECK " + ("실제 SKIP no transitions" if not spans else
                                                 "FAIL" if failures else "PASS"))
    return failures, summaries


def camera_findings(rows, events, kinds, cuts, tl, fps, spans=None):
    failures, summaries = [], []
    cameras = [r for r in rows if r.get("camera")]
    total_caught = total_exempted = total_unmeasured = 0
    for scene in tl["order"]:
        scene_events = [e for e in events if e["scene"] == scene]
        caught = exempted = unmeasured = 0
        declared = kinds.get(scene, [])
        scene_start = tl["modules"][scene]["start"]
        scene_end = scene_start + tl["modules"][scene]["duration"]
        lead, tail = (spans or {}).get(scene, (0, 0))
        clipped = 0
        for event in scene_events:
            t = event["t"]
            # The window stays inside the text's own scene: the cut between scenes is the scene change, not camera
            # work (a measured project had 34 of 39 findings at its 13 scene-boundary cuts). Cuts inside a scene still count.
            begin, end = max(0, scene_start, t - CAMERA_UI_WINDOW), min(tl["total_s"], scene_end - 1e-6, t + CAMERA_UI_WINDOW)
            # A transition (dip, dissolve, crossfade) belongs to the scene change too: scenes sharing one camera object
            # leave values there that are not this scene's camera work (all 8 remaining findings in a measured project).
            inner_begin, inner_end = max(begin, scene_start + lead), min(end, scene_end - tail)
            clipped += (inner_begin, inner_end) != (begin, end)
            begin, end = inner_begin, inner_end
            if end <= begin:
                continue
            window = [r for r in cameras if begin - 1e-8 <= r["frame"] / fps <= end + 1e-8]
            if len(window) < 2:
                unmeasured += 1
                continue
            ids = {r["camera"].get("id") for r in window}
            if len(ids) > 1:   # a different full-screen camera took over: listed, not counted as camera motion
                summaries.append(f"CAMERA_UI_SWITCH t={t:.3f} scene={scene} cameras={len(ids)} window={begin:.3f}..{end:.3f}s "
                                 f"text={event['text'][:60]!r}")
                continue
            position = point_span([r["camera"]["p"] for r in window])
            look = point_span(look_points(window))
            if max(position, look) <= CAMERA_TEXT_DISTANCE:
                continue
            active = [s for i, s in enumerate(declared)
                      if scene_start + s["t"] <= t < scene_start + s.get(
                          "end", declared[i+1]["t"] if i+1 < len(declared)
                          else tl["modules"][scene]["duration"])]
            shot = active[-1] if active else None
            cut_declared = any(abs(scene_start + cut - t) <= CAMERA_UI_WINDOW for cut in cuts.get(scene, []))
            was_declared = shot is not None or cut_declared
            reason = (f"declared shot, but text changes at t={t:.3f} within 0.6 s; "
                      "ordinary declarations do not exempt camera motion") if was_declared else "camera moves near text"
            if shot and shot.get("kind") in ("follow", "explode"):
                valid, detail = tracking_check(window, shot)
                if valid:
                    exempted += 1
                    summaries.append(f"CAMERA_UI_EXEMPT t={t:.3f} scene={scene} kind={shot['kind']} "
                        f"subject={shot['subject']!r} window={begin:.3f}..{end:.3f}s "
                        f"position={position:.6f}m look_at={look:.6f}m {detail}")
                    continue
                reason = f"declared shot, but text changes at t={t:.3f} within 0.6 s; invalid {shot['kind']}: {detail}"
            if shot and shot.get("kind") == "action":
                i = declared.index(shot)
                shot_end = shot.get("end", declared[i+1]["t"] if i+1 < len(declared) else tl["modules"][scene]["duration"])
                shot_begin = scene_start + shot["t"]
                shot_rows = [r for r in cameras if r["scene"] == scene and
                             shot_begin - 1e-8 <= r["frame"] / fps <= scene_start + shot_end + 1e-8]
                valid, detail = action_check(window, shot_rows, shot, shot_begin, scene_start + shot_end, fps)
                if valid:
                    exempted += 1
                    summaries.append(f"CAMERA_UI_EXEMPT t={t:.3f} scene={scene} kind=action "
                        f"subject={shot['subject']!r} window={begin:.3f}..{end:.3f}s "
                        f"position={position:.6f}m look_at={look:.6f}m {detail}")
                    continue
                reason = f"declared shot, but text changes at t={t:.3f} within 0.6 s; invalid action: {detail}"
            caught += 1
            failures.append((round(t * fps), scene, "text_camera_motion",
                f"text_t={t:.3f}s window={begin:.3f}..{end:.3f}s position={position:.6f}m "
                f"look_at={look:.6f}m threshold={CAMERA_TEXT_DISTANCE}m declared={str(was_declared).lower()} "
                f"source={event['source']} reason={reason!r} text={event['text'][:100]!r}"))
        samples = [r for r in cameras if r["scene"] == scene]
        for i, shot in enumerate(declared):
            if shot.get("kind") != "ui-only":
                continue
            begin = scene_start + shot["t"]
            end = scene_start + shot.get("end", declared[i+1]["t"] if i+1 < len(declared)
                                         else tl["modules"][scene]["duration"])
            hold = [r for r in samples if begin <= r["frame"] / fps < end]
            if len(hold) < 2:
                continue
            base = hold[0]["camera"]
            values = [camera_delta(base, r["camera"]) for r in hold]
            amplitude, distance, angle = map(max, zip(*values))
            # Numerical tolerance, not a perceptual allowance: ui-only is a hold.
            raw = max(abs(x-y) for r in hold for x, y in zip(base["pose"], r["camera"]["pose"]))
            if raw > 1e-7:
                failures.append((hold[0]["frame"], scene, "ui_only_camera",
                    f"span={begin:.3f}..{end:.3f}s frame_fraction={amplitude:.6f} "
                    f"translation={distance:.6f}m rotation={angle:.6f}deg pose_delta={raw:.9f}"))
        if clipped:
            summaries.append(f"CAMERA_UI_TRANSITION scene={scene} texts={clipped} excluded_start={lead:.3f}s excluded_end={tail:.3f}s")
        summaries.append(f"CAMERA_UI scene={scene} caught={caught} total={len(scene_events)} "
                         f"exempted={exempted} unmeasured={unmeasured} appearances={len(scene_events)}")
        total_caught += caught
        total_exempted += exempted
        total_unmeasured += unmeasured
    summaries.append(f"CAMERA_UI_TOTAL caught={total_caught} total={len(events)} "
                     f"exempted={total_exempted} unmeasured={total_unmeasured}")
    return failures, summaries


def action_spans(tl, words, cards):
    """Prefer aligned keywords; fall back to speech/timeline lines, then cards."""
    spans = []
    for line in words.get("lines", []):
        scene = line["scene"]
        start = tl["modules"][scene]["start"]
        hits = line.get("words", [])
        aligned = [w for w in hits if ACTION_VERBS.search(w["word"])]
        for w in aligned:
            a = w["t"] if "t" in w else start + w["t_scene"]
            following = [x["t"] if "t" in x else start + x["t_scene"] for x in hits]
            b = min([t for t in following if t > a] + [line["speech_end"]])
            spans.append((scene, a, max(a + .25, b), w["word"], "word"))
        text = line.get("text", "")
        # "Transfer learned experience into a policy" is not a part transfer.
        abstract_transfer = ("옮겨" in text and re.search(r"감각|지식|경험|정책", text)
                             and not re.search(r"센서|부품|뚜껑|로봇|버킷|챔버|측정 위치", text))
        if not aligned and ACTION_VERBS.search(text) and not abstract_transfer:
            spans.append((scene, line["speech_start"], line["speech_end"], line["text"], "line"))
    if not words.get("lines"):
        for line in tl.get("lines", []):
            if ACTION_VERBS.search(line.get("text", "")):
                spans.append((line["scene"], line.get("speech_start", line.get("start")),
                              line.get("speech_end", line.get("end")), line["text"], "timeline"))
    for scene, a, b, text in cards:
        if ACTION_VERBS.search(text) and b - a >= .25 and not any(
                s == scene and x < b and y > a for s, x, y, _, _ in spans):
            spans.append((scene, a, b, text[:160], "card"))
    return spans

PROBE = r"""async ([frame,fps,mutate]) => {
  const t=frame/fps, probe=window.__motion;
  probe.scene=null;window.CLEAR=null;
  await window.renderAt(t);
  const scene=probe.scene;
  const sceneName=[...document.querySelectorAll('.overlay[data-scene]')]
    .find(e=>getComputedStyle(e).display!=='none')?.dataset.scene;
  const ui=probe.uiSnapshot();
  if(!scene){probe.popStep(frame,null,null);return {frame,scene:sceneName,objects:[],clear:window.CLEAR,ui,camera:null};}
  scene.updateMatrixWorld(true);
  probe.popStep(frame,scene,probe.camera);
  const tracked=[];
  scene.traverse(o=>{
    if(o.userData.track===true || /robot|end.?effector|held.?head|rotor/i.test(o.name||'')) {
      let visible=true;
      for(let a=o;a;a=a.parent) if(!a.visible)visible=false;
      if(visible)tracked.push(o);
    }
  });
  // Offset an actual robot transform, not a serialized measurement. Restore it
  // before the next render so the mutation is exactly one sampled frame.
  const robot=tracked.find(o=>o.userData.motionRole==='base'||/robot/i.test(o.name));
  let changed=false;
  if(mutate && !probe.mutation && robot && t>=1) {
    robot.position.x+=1;robot.updateMatrixWorld(true);changed=true;
    probe.mutation={frame,name:robot.userData.motionName||robot.name||robot.uuid};
  }
  const v=new THREE.Vector3();
  const objects=tracked.map(o=>({
    id:o.uuid,name:o.userData.motionName||o.name||o.uuid,
    role:o.userData.motionRole||o.name||'tracked',
    p:o.getWorldPosition(v).toArray()
  }));
  if(changed){robot.position.x-=1;robot.updateMatrixWorld(true)}
  const c=probe.camera, depths=[];
  c.updateMatrixWorld(true);
  scene.traverse(o=>{
    if(!o.isMesh)return;
    for(let a=o;a;a=a.parent)if(!a.visible||a.isCamera)return;
    o.getWorldPosition(v).applyMatrix4(c.matrixWorldInverse);
    if(-v.z>c.near && -v.z<c.far)depths.push(-v.z);
  });
  depths.sort((a,b)=>a-b);
  const focus=c.userData.focus||depths[Math.floor(depths.length/2)]||1,
    scale=c.isPerspectiveCamera?2*Math.tan(c.fov*Math.PI/360)/c.zoom:(c.top-c.bottom)/c.zoom;
  const worldPosition=c.getWorldPosition(new THREE.Vector3()),
    worldDirection=c.getWorldDirection(new THREE.Vector3()),
    position=worldPosition.toArray(),quaternion=c.getWorldQuaternion(new THREE.Quaternion()).toArray();
  let target=probe.targets.get(c)||null;
  if(target) {
    const offset=new THREE.Vector3(...target).sub(worldPosition),along=offset.dot(worldDirection);
    // A stale lookAt followed by a manual rotation/nudge is not an explicit aim.
    if(along<=0 || offset.addScaledVector(worldDirection,-along).length()>1e-5)target=null;
  }
  const camera={id:c.uuid,p:position,q:quaternion,focus,height:c.isPerspectiveCamera?focus*scale:scale,scale,
    target,direction:worldDirection.toArray(),pose:position.concat(quaternion,c.projectionMatrix.elements)};
  const subjects={};
  for(const name of probe.subjectNames) {
    const matches=[];scene.traverse(o=>{if(o.name===name)matches.push(o);});
    if(matches.length!==1){subjects[name]={count:matches.length};continue;}
    const root=matches[0],landmarks={};
    let visible=true;for(let a=root;a;a=a.parent)if(!a.visible)visible=false;
    const bounds=new THREE.Box3();
    root.traverse(o=>{
      if(!o.isMesh || !o.geometry)return;
      for(let a=o;a;a=a.parent)if(!a.visible)return;
      if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
      const b=o.geometry.boundingBox;
      if(!b || b.isEmpty())return;
      landmarks[o.uuid]=[
        [b.min.x,b.min.y,b.min.z],[b.max.x,b.min.y,b.min.z],
        [b.min.x,b.max.y,b.min.z],[b.min.x,b.min.y,b.max.z]
      ].map(p=>new THREE.Vector3(...p).applyMatrix4(o.matrixWorld).toArray());
      bounds.union(b.clone().applyMatrix4(o.matrixWorld));
    });
    subjects[name]={count:1,id:root.uuid,visible,landmarks,
      p:root.getWorldPosition(new THREE.Vector3()).toArray(),
      center:bounds.isEmpty()?root.getWorldPosition(new THREE.Vector3()).toArray():bounds.getCenter(new THREE.Vector3()).toArray()};
  }
  return {frame,scene:sceneName,objects,clear:window.CLEAR,ui,camera,subjects};
}"""


async def main(a):
    start = time.monotonic()
    source = Path(a.html).resolve().read_text(encoding="utf-8")
    marker = "const TL = window.TIMELINE"
    if marker not in source:
        raise RuntimeError("page lacks the rv compositor marker")
    source = source.replace(marker, HOOK + "\nwindow.__motion.uiSnapshot=" + UI_SNAPSHOT + ";\nwindow.__motion.popStep=" +
                            POP_STEP + ";\nwindow.__motion.pictureSnapshot=" + PICTURE_SNAPSHOT + ";\n  " + marker, 1)
    errors, rows = [], []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
        p = await browser.new_page(viewport={"width": 1920, "height": 1080})
        p.on("pageerror", lambda e: errors.append(str(e)))
        # Fulfill just the self-contained document; relative URLs keep their
        # original base URI. There is no server, upload, or external publication.
        source = source.replace("<head>", f'<head><base href="{Path(a.html).resolve().as_uri()}">', 1)
        await p.route("http://rv-motion.local/video.html", lambda route: route.fulfill(
            status=200, content_type="text/html", body=source))
        await p.goto("http://rv-motion.local/video.html", wait_until="load")
        await p.evaluate("Promise.resolve(window.renderReady)")
        tl, params, words = await p.evaluate("[window.DATA.timeline, window.RIG?.P||{}, window.DATA.words||{}]")
        if a.scene and a.scene not in tl["modules"]:
            raise ValueError(f"unknown scene: {a.scene}")
        kinds, cuts = await p.evaluate("[window.SHOTKINDS||{},window.SHOTCUTS||{}]")
        await p.evaluate("""kinds=>{
          window.__motion.subjectNames=[...new Set(Object.values(kinds).flat()
            .filter(s=>['follow','explode','action'].includes(s.kind)&&typeof s.subject==='string').map(s=>s.subject))];
        }""", kinds)
        await p.evaluate("window.__motion.sampling=true")
        await p.evaluate("([onset, need]) => { window.__motion.popOnset = onset; window.__motion.popNeed = need; }",
                         [POP_ONSET, max(POP_FRAMES, round(POP_PEAK_S * a.fps))])
        transitions, looks, blend_s = await p.evaluate(
            "[window.TRANSITIONS||{}, window.SCENE_LOOK||{}, Math.max(1.5, window.THEME_PLAN?.blend_s||2)]")
        if a.mutate == "popin":
            # Inside scenes, away from declared cuts and transition edges (a pop there is exempt and would not be caught).
            edges = transition_spans(tl, transitions, looks, blend_s)
            mids = [(s, tl["modules"][s]["start"] + tl["modules"][s]["duration"] * f) for s in tl["order"]
                    for f in (.5, .7, .35) if not a.scene or s == a.scene]
            mids = [m for s, m in mids
                    if tl["modules"][s]["start"] + edges[s][0] + 1.0 <= m - .6
                    and m <= tl["modules"][s]["start"] + tl["modules"][s]["duration"] - edges[s][1] - 1.0
                    and not any(abs(tl["modules"][s2]["start"] + c - x) <= 1.0
                                for s2, cs in cuts.items() if s2 in tl["modules"] for c in cs
                                for x in (m, m - .6))]
            pick = await p.evaluate(POP_PICK, mids)
            if not pick:
                print("POP_MUTATION SKIP no steady overlay element to hide")
                print("MUTATION_SKIP")
                await browser.close()
                return 0
            await p.evaluate(POP_HIDE, [pick["sel"], pick["t"] - .6, pick["t"]])
            pop_mutation = round(pick["t"] * a.fps)
        if a.mutate == "transglide":
            leads = transition_spans(tl, transitions, looks, blend_s)
            scene = next((s for s in tl["order"] if leads[s][0] > 0), None)
            if scene is None:
                print("CAMERA_TRANSITION_TOTAL caught=0 spans=0")
                print("CAMERA_TRANSITION_CHECK 실제 SKIP no transitions")
                print("TRANSITION_MUTATION SKIP no transitions")
                print("MUTATION_SKIP")
                await browser.close()
                return 0
            begin = tl["modules"][scene]["start"]
            await p.evaluate(TRANS_GLIDE, [begin, begin + leads[scene][0]])
            mutation_scene = scene
        starts = transition_starts(tl, transitions, looks, blend_s)
        if a.mutate == "textcut":
            if not starts:
                print("TEXT_TRANSITION_CHECK 실제 SKIP no transitions")
                print("TEXT_TRANSITION_MUTATION SKIP no transitions")
                print("MUTATION_SKIP")
                await browser.close()
                return 0
            cut = starts[0]
            await p.evaluate(TEXT_CUT, [cut[0], cut[3] - .4, cut[3] + .5])
        count = math.ceil(tl["total_s"] * a.fps - 1e-8)
        lo = math.ceil(tl["modules"][a.scene]["start"] * a.fps) if a.scene else 0
        if a.scene:
            count = math.ceil((tl["modules"][a.scene]["start"] + tl["modules"][a.scene]["duration"]) * a.fps - 1e-8)
        # Batches bound message size without skipping any frame.
        for first in range(lo, count, 120):
            batch = await p.evaluate("""async ([first,end,fps,mutate,code])=>{
              const sample=eval('('+code+')'),out=[];
              for(let i=first;i<end;i++)out.push(await sample([i,fps,mutate]));
              return out;
            }""", [first, min(first + 120, count), a.fps, a.mutate == "teleport", PROBE])
            rows.extend(batch)
        mutation = await p.evaluate("window.__motion.mutation")
        if a.mutate == "popin":
            mutation = {"kind": "popin", "frame": pop_mutation}
        if a.mutate == "transglide":
            mutation = {"kind": "transglide", "scene": mutation_scene}
        ui_events = ui_appearances(rows, a.fps)
        if a.mutate == "camnudge":
            cameras = {r["frame"]: r["camera"] for r in rows if r.get("camera")}
            nudges = [{"t": e["t"], "height": cameras[round(e["t"] * a.fps)]["height"]}
                      for e in ui_events if round(e["t"] * a.fps) in cameras]
            await p.evaluate(CAM_NUDGE, nudges)
            rows = []
            await p.evaluate("window.__motion.pop = null")
            for first in range(lo, count, 120):
                rows.extend(await p.evaluate("""async ([first,end,fps,code])=>{
                  const sample=eval('('+code+')'),out=[];
                  for(let i=first;i<end;i++)out.push(await sample([i,fps,false]));
                  return out;
                }""", [first, min(first + 120, count), a.fps, PROBE]))
            mutation = {"kind": "camnudge", "appearances": len(nudges)}
        pop_records = await p.evaluate("(() => { const P = window.__motion.pop; return P ? P.done.concat(P.open).map("
                                       "c => ({frame: c.frame, prev: c.prev, name: c.name, group: c.group, ws: c.ws})) : []; })()")
        await p.evaluate("window.__motion.pop = null")
        pop_failures, pop_rows, pop_exempt = pop_findings(
            pop_records, rows, tl, a.fps, transition_spans(tl, transitions, looks, blend_s), cuts, lo)
        camera_failures, camera_rows = camera_findings(rows, ui_events, kinds, cuts, tl, a.fps,
                                                       transition_spans(tl, transitions, looks, blend_s))
        camera_caught = a.mutate == "camnudge" and any(
            f[2] in ("text_camera_motion", "ui_only_camera") for f in camera_failures)
        transition_failures, transition_rows = transition_camera_findings(
            rows, kinds, (tl, a.fps, transitions, looks, blend_s))
        camera_failures.extend(transition_failures)
        camera_rows.extend(transition_rows)
        if a.mutate == "transglide":
            camera_caught = any(f[1] == mutation_scene and f[2] == "transition_camera_motion"
                                for f in transition_failures)
        cards, active, pictures = [], None, {}
        # Four DOM observations per second, independent of 30-fps trajectory tests.
        step = max(1, round(a.fps / 4))
        for frame in range(lo, count, step):
            t = frame / a.fps
            await p.evaluate("(t)=>window.renderAt(t)", t)
            text = await p.evaluate(CARD_TEXT, ACTION_VERBS.pattern)
            for pic in await p.evaluate("window.__motion.pictureSnapshot()"):
                rec = pictures.setdefault(pic["id"], {"first": t, "run": 0, "best": 0, "last": None, "pic": pic})
                full = pic["alpha"] >= .95
                rec["run"] = rec["run"] + 1 if full and rec["last"] == frame - step else (1 if full else 0)
                rec["last"] = frame if full else None
                rec["best"] = max(rec["best"], rec["run"])
                if pic["area"] > rec["pic"]["area"]:
                    rec["pic"] = pic
            scene = next(s for s in reversed(tl["order"]) if t + 1e-7 >= tl["modules"][s]["start"])
            if active and (active[0] != scene or active[2] != text):
                cards.append((active[0], active[1], t, active[2]))
                active = None
            if not active:
                active = (scene, t, text)
        if active:
            cards.append((active[0], active[1], count / a.fps, active[2]))
        spans = action_spans(tl, words, cards)
        if a.scene:
            spans = [s for s in spans if s[0] == a.scene]
        action_failures, action_rows, freeze_caught = list(camera_failures), [], False
        match_linked = match_caught = False
        act_linked = 0   # action spans whose linked part has a KIT.process handle the mutation reverses
        if a.mutate == "actreverse":
            mutation = {"kind": "actreverse", "handles": await p.evaluate(ACT_REVERSE)}
            if not mutation["handles"]:
                # KIT.process.part and steps run callbacks have no set(u) to reverse: nothing to break.
                print(f"mutation={mutation}")
                print("ACTION_MUTATION SKIP no KIT.process handle to reverse (parts move by KIT.process.part/steps run callbacks)")
                print("MUTATION_SKIP")
                await browser.close()
                return 0
        if a.mutate == "offcenter":
            await p.evaluate(CAM_TURN, [[b, e] for _, b, e, _, _ in spans])
            await p.evaluate("window.__camTurnOn = true")
            mutation = {"kind": "offcenter", "spans": len(spans)}
        frame_rows, frame_failures, offcenter_caught = [], [], False
        for scene, begin, end, text, origin in spans:
            end = min(end, tl["modules"][scene]["start"] + tl["modules"][scene]["duration"] - 1 / a.fps)
            if end <= begin:
                continue
            times = [begin + (end - begin) * i / max(8, math.ceil((end - begin) * 8))
                     for i in range(max(8, math.ceil((end - begin) * 8)) + 1)]
            scene_lo = tl["modules"][scene]["start"]
            head = max(scene_lo, begin - MATCH_HEAD_S)
            tail = min(scene_lo + tl["modules"][scene]["duration"] - 1 / a.fps, end + MATCH_TAIL_S)
            n = max(1, math.ceil((tail - head) * 8))
            # Grid times closer than 20 ms to the span edges are dropped: a near-duplicate sample shows almost no
            # change and stopped match_run from extending a rise back to where it started.
            hts = sorted({x for x in (head + (tail - head) * i / n for i in range(n + 1))
                          if abs(x - begin) > .02 and abs(x - end) > .02} | {begin, end})
            probe = await p.evaluate(PROCESS_PROBE, hts)
            live = [i for i in range(len(probe["parts"])) if any(r[i] is not None for r in probe["rows"])]
            parts = [probe["parts"][i] for i in live]
            context = next((ln.get("text", "") for ln in words.get("lines", []) if ln["scene"] == scene and
                            ln["speech_start"] - .05 <= begin <= ln["speech_end"] + .05), "")
            targets = [live[i] for i in match_targets(parts, text, context)]
            # Freeze one real scene span, never the card. Subsequent spans stay normal.
            freeze = a.mutate == "freeze" and not freeze_caught
            at = context.find(text)
            said = context[max(0, at - MATCH_NOUN_CHARS):at + len(text)] if at >= 0 else text
            values = await p.evaluate(ACTION_PROBE, [times, freeze, True, targets, said])
            moving = (values["pixels"] >= ACTION_PIXEL_FRACTION and
                      values["rgb"] >= ACTION_RGB_DELTA and values["state"] > 1e-4)
            detail = (f"span={begin:.3f}..{end:.3f}s source={origin} rgb={values['rgb']:.6f} "
                      f"changed={values['pixels']:.6f} state={values['state']:.6f} ambient={values['ambient']} own={values['own']} "
                      f"threshold_rgb={ACTION_RGB_DELTA} threshold_changed={ACTION_PIXEL_FRACTION}")
            action_rows.append(f"ACTION_SPAN {scene} {text!r} {'PASS' if moving else 'FAIL'} {detail}")
            cls = match_class(text)
            if not targets:
                md = (f"no linked part: script noun not in names of {[p_['names'] for p_ in parts]} "
                      f"(name the part: KIT.process.*(..., {{name}}) or KIT.process.part(obj, {{name, state}}))")
                action_rows.append(f"ACTION_MATCH {scene} {text!r} FAIL {md}")
                action_failures.append((round(begin * a.fps), scene, "action_unlinked", md + f" action={text!r}"))
            else:
                # An exhaust is active in the span whichever way it runs, so reversing it breaks nothing.
                act_linked += any(probe["parts"][k]["handles"] and probe["parts"][k]["kind"] != "exhaust" for k in targets)
                results = []
                for k in targets:
                    part = probe["parts"][k]
                    ok, why = match_part(part["kind"], cls, hts, [r[k] for r in probe["rows"]], begin, end)
                    results.append((ok, f"target={part['kind']}:{part['names'][0]!r} want={cls or 'move'} {why}"))
                ok, md = next((r for r in results if r[0]), results[0])
                chosen = targets[next((i for i, r in enumerate(results) if r[0]), 0)]
                md += f" thresholds rest<={MATCH_REST} full>={MATCH_FULL} move>={MATCH_MOVE}"
                action_rows.append(f"ACTION_MATCH {scene} {text!r} {'PASS' if ok else 'FAIL'} {md}")
                if ok:
                    match_linked = True
                else:
                    action_failures.append((round(begin * a.fps), scene, "action_mismatch", md + f" action={text!r}"))
                    match_caught = match_caught or a.mutate == "actreverse"
            # Explained subject near the camera centre: the linked part, else the declared action/follow subject.
            scene_lo = tl["modules"][scene]["start"]
            if targets:
                parts_, names_ = [chosen], []
                label = f"{probe['parts'][chosen]['kind']}:{probe['parts'][chosen]['names'][0]!r}"
            else:
                shots = kinds.get(scene, [])
                names_ = sorted({s["subject"] for i, s in enumerate(shots)
                                 if s.get("kind") in ("action", "follow") and isinstance(s.get("subject"), str)
                                 and scene_lo + s["t"] <= end and scene_lo + s.get("end", shots[i + 1]["t"] if i + 1 < len(shots)
                                                                         else tl["modules"][scene]["duration"]) >= begin})
                parts_, label = [], "declared:" + ",".join(repr(n) for n in names_)
            if parts_ or names_:
                lead_in = min(FRAME_LEAD_S, .4 * (end - begin))
                n = max(4, math.ceil((end - begin - lead_in) * 8))
                fts = [begin + lead_in + (end - begin - lead_in) * i / n for i in range(n + 1)]
                if a.mutate == "offcenter":   # caught only where the unmutated camera passed and the turned one fails
                    await p.evaluate("window.__camTurnOn = false")
                    base_ok = frame_verdict(await p.evaluate(SUBJECT_PROBE, [fts, parts_, names_]))[0] >= FRAME_SHARE
                    await p.evaluate("window.__camTurnOn = true")
                share, mx, my, seen = frame_verdict(await p.evaluate(SUBJECT_PROBE, [fts, parts_, names_]))
                fok = share >= FRAME_SHARE
                if a.mutate == "offcenter" and base_ok and not fok:
                    offcenter_caught = True
                fd = (f"subject={label} centred={share:.2f} need>={FRAME_SHARE} box=|x-.5|,|y-.5|<={FRAME_BOX} "
                      f"mean_x={mx:.2f} mean_y={my:.2f} samples={len(fts)} seen={seen} span={begin + lead_in:.3f}..{end:.3f}s")
                frame_rows.append(f"SUBJECT_FRAME {scene} {text!r} {'PASS' if fok else 'FAIL'} {fd}")
                if not fok:
                    frame_failures.append((round(begin * a.fps), scene, "subject_off_center", fd + f" action={text!r}"))
            else:
                frame_rows.append(f"SUBJECT_FRAME {scene} {text!r} SKIP no linked or declared subject "
                                  f"(name the part: KIT.process.part(obj, {{name, state}}))")
            if not moving:
                action_failures.append((round(begin * a.fps), scene, "action_static", detail + f" action={text!r}"))
                if freeze:
                    freeze_caught = True
                    mutation = {"kind": "freeze", "scene": scene, "span": [begin, end]}
        action_failures.extend(frame_failures + pop_failures)
        action_rows.extend(frame_rows + pop_rows)
        if a.mutate == "offcenter":
            match_caught = offcenter_caught
        if a.mutate == "popin":
            match_caught = any(abs(f[0] - pop_mutation) <= 1 and f[2] == "pop_in" for f in pop_failures)
        picture_bad, bad_pictures, picture_rows = 0, [], []
        for pid, rec in pictures.items():
            pic, shown = rec["pic"], max(0, rec["best"] - 1) * step / a.fps   # n samples span n-1 steps
            scene_ = next(s_ for s_ in reversed(tl["order"]) if rec["first"] + 1e-7 >= tl["modules"][s_]["start"])
            why = [w for w, bad in (("short", shown < PICTURE_MIN_S), ("small", pic["area"] < PICTURE_MIN_AREA),
                                    ("poor", pic["fill"] < PICTURE_FILL or pic["colors"] < PICTURE_COLORS)) if bad]
            pd = (f"picture={pic['name']!r} t={rec['first']:.2f}s shown={shown:.2f}s need>={PICTURE_MIN_S}s area={pic['area']:.3f} "
                  f"need>={PICTURE_MIN_AREA} fill={pic['fill']:.2f} need>={PICTURE_FILL} colors={pic['colors']} need>={PICTURE_COLORS}")
            picture_rows.append(f"PICTURE {scene_} {pd} {'FAIL ' + ','.join(why) if why else 'PASS'}")
            if why:
                picture_bad += 1
                bad_pictures.append(pid)
                action_failures.append((round(rec["first"] * a.fps), scene_, "picture_" + why[0], pd))
        # Meaningful motion beside the text (TEXT_MOTION).
        text_motion_rows, text_still = [], 0
        edges = transition_spans(tl, transitions, looks, blend_s)
        for scene, begin, end, boxes in text_windows(rows, tl, a.fps, edges):
            if a.mutate == "textstill" and match_caught:
                break
            n = max(2, math.ceil((end - begin) / TEXT_STEP_S))
            times = [begin + (end - begin) * i / n for i in range(n + 1)]
            rich = [PICTURE_MIN_AREA, PICTURE_FILL, PICTURE_COLORS, bad_pictures]   # a picture failing PICTURE is no stand-in
            v = await p.evaluate(TEXT_PROBE, [times, list(boxes), TEXT_MOVE_SHARE, rich])
            scene_lo, shots = tl["modules"][scene]["start"], kinds.get(scene, [])
            # A declared ui-only shot is an intended hold on the text: its samples restart the still clock.
            holds = [(scene_lo + s["t"], scene_lo + s.get("end", shots[i + 1]["t"] if i + 1 < len(shots)
                                                          else tl["modules"][scene]["duration"]))
                     for i, s in enumerate(shots) if s.get("kind") == "ui-only"]
            in_hold = [any(h0 - 1e-6 <= t <= h1 + 1e-6 for h0, h1 in holds) for t in times]
            hold, pictured = all(in_hold), all(v["pictured"])
            # A rich still picture on screen (KIT.info.picture) is intended content too.
            still, s0, s1 = still_stretch(times, [True if h or pc else m for m, h, pc in zip(v["moved"], in_hold, v["pictured"])])
            covered = {}
            for b, txt in sorted(boxes.items(), key=lambda kv: -(kv[0][2] - kv[0][0]) * (kv[0][3] - kv[0][1])):
                covered.setdefault(txt, b)   # one box per text (a moving label leaves many)
            covered = [(b, txt) for txt, b in covered.items()]
            region = " ".join(f"x{b[0]:.2f}-{b[2]:.2f},y{b[1]:.2f}-{b[3]:.2f}:{txt[:24]!r}" for b, txt in covered[:3])
            subj = " ".join(f"{s['name']!r}@{s['x']:.2f},{s['y']:.2f}{'(covered)' if s['covered'] else ''}"
                            for s in v["subjects"][:6])
            moved = v["bbox"] and f"x{v['bbox'][0]:.2f}-{v['bbox'][2]:.2f},y{v['bbox'][1]:.2f}-{v['bbox'][3]:.2f}"
            detail = (f"window={begin:.2f}..{end:.2f}s still={still:.2f}s" +
                      (f"@{s0:.2f}..{s1:.2f}s" if s0 is not None else "") +
                      f" need<{TEXT_STILL_S}s free={v['free']:.2f} moved_at={moved or 'none'} "
                      f"max_change={max([x for x in v['shares'] if x is not None] or [0]):.4f} need>={TEXT_MOVE_SHARE} " +
                      (f"held={sum(in_hold) / len(times):.2f} " if any(in_hold) else "") +
                      (f"pictured={sum(v['pictured']) / len(times):.2f} " if any(v["pictured"]) else "") + f"texts={len(covered)} [{region}] subjects=[{subj}]")
            if v["free"] < TEXT_FREE_MIN or hold or pictured:
                why = ("declared_hold (ui-only shot)" if hold else "picture (KIT.info.picture shown throughout)" if pictured
                       else f"covered (free<{TEXT_FREE_MIN})")
                text_motion_rows.append(f"TEXT_MOTION {scene} {detail} EXEMPT {why}")
                continue
            ok = still < TEXT_STILL_S
            text_motion_rows.append(f"TEXT_MOTION {scene} {detail} {'PASS' if ok else 'FAIL'}")
            if not ok:
                text_still += 1
                action_failures.append((round((s0 if s0 is not None else begin) * a.fps), scene, "text_still",
                                        detail + " (animate the uncovered subject: HOWTO 4-2)"))
            elif a.mutate == "textstill":
                await p.evaluate(TEXT_FREEZE, [begin, end])
                frozen = await p.evaluate(TEXT_PROBE, [times, list(boxes), TEXT_MOVE_SHARE, rich])
                await p.evaluate(TEXT_FREEZE, [0, None])
                fs = still_stretch(times, [True if h or pc else m for m, h, pc in zip(frozen["moved"], in_hold, frozen["pictured"])])[0]
                mutation = {"kind": "textstill", "scene": scene, "window": [round(begin, 3), round(end, 3)], "still_s": round(fs, 2)}
                match_caught = fs >= TEXT_STILL_S
                if match_caught:   # rv counts a mutation as caught only when the checker also exits 1 (rv mut)
                    action_failures.append((round(begin * a.fps), scene, "text_still",
                                            f"mutation textstill window={begin:.2f}..{end:.2f}s still={fs:.2f}s"))
        action_rows.extend(text_motion_rows + picture_rows)
        text_summary = (f"TEXT_MOTION_CHECK {'FAIL' if text_still or picture_bad else 'PASS' if text_motion_rows or pictures else '실제 SKIP'} "
                        f"windows={len(text_motion_rows)} still={text_still} "
                        f"exempt={sum(' EXEMPT ' in r for r in text_motion_rows)} pictures={len(pictures)} "
                        f"pictures_failed={picture_bad}")
        mids = [tl["modules"][s_]["start"] + tl["modules"][s_]["duration"] / 2 for s_ in tl["order"] if not a.scene or s_ == a.scene]
        for hc in await p.evaluate(HATCH_COVER_PROBE, mids):
            scene_ = next(s_ for s_ in reversed(tl["order"]) if hc["t"] + 1e-7 >= tl["modules"][s_]["start"])
            if not hc["frame"]:
                hd = f"hatch={hc['name']!r} frame not declared (KIT.process.hatch(pivot, {{frame: 출입구 테두리}}))"
                ok = False
            else:
                ok = hc["coverage"] >= HATCH_COVER_MIN
                hd = f"hatch={hc['name']!r} frame={hc['frame']!r} closed_coverage={hc['coverage']:.2f} need>={HATCH_COVER_MIN} points={hc['points']}"
            action_rows.append(f"HATCH_COVER {scene_} {'PASS' if ok else 'FAIL'} {hd}")
            if not ok:
                action_failures.append((round(hc["t"] * a.fps), scene_, "hatch_cover", hd))
        text_fails, text_rows = text_transition_findings(
            rows, [x for x in starts if not a.scene or x[0] == a.scene], a.fps)
        action_failures.extend(text_fails)
        action_rows.extend(text_rows)
        if a.mutate == "textcut":
            mutation = {"kind": "textcut", "transition": starts[0][:4]}
            caught_text = any(f[1] == starts[0][0] and f[0] == round(starts[0][3] * a.fps) for f in text_fails)
            match_caught = match_caught or caught_text
        # Repeated short declared shots/card cuts with unchanged 3D composition.
        cuts = await p.evaluate("window.SHOTCUTS||{}")
        for scene in tl["order"]:
            if a.scene and scene != a.scene:
                continue
            scene_start = tl["modules"][scene]["start"]
            declared = [scene_start + t for t in cuts.get(scene, [])]
            card_cuts = [b for s, _, b, text in cards if s == scene and text]
            if len(card_cuts) < 2:
                continue
            candidates = []
            for cut in sorted(set(declared + card_cuts)):
                if not candidates or cut - candidates[-1] > .3:
                    candidates.append(cut)
            similar = []
            for t in candidates:
                if t <= scene_start or t >= scene_start + tl["modules"][scene]["duration"] - 1 / a.fps:
                    continue
                v = await p.evaluate(ACTION_PROBE, [[t - 1 / a.fps, t + 1 / a.fps], False, False])
                # Card changes can be fades; only count instant text changes with
                # unchanged 3D, or an explicitly declared hard shot boundary.
                if v["samples"] == 2 and v["pixels"] < .01 and v["rgb"] < 1:
                    similar.append((t, v))
            for (a0, _), (b0, v) in zip(similar, similar[1:]):
                if .1 < b0 - a0 <= 2.5:
                    # Do not penalize same-camera cuts when parts actually moved.
                    motion = await p.evaluate(ACTION_PROBE, [[a0 + .04, (a0 + b0) / 2, b0 - .04], False, True])
                    if motion["state"] <= 1e-4 and motion["pixels"] < ACTION_PIXEL_FRACTION:
                        action_failures.append((round(b0 * a.fps), scene, "repeated_card_cut",
                            f"interval={b0-a0:.3f}s changed={v['pixels']:.6f} rgb={v['rgb']:.6f} "
                            f"composition_threshold=0.01 between_cut_changed={motion['pixels']:.6f}"))
        await browser.close()
    def scene_at(t):
        return next((s for s in reversed(tl["order"]) if t + 1e-7 >= tl["modules"][s]["start"]), tl["order"][0])
    previous, speeds, movements, failures = {}, defaultdict(list), [], list(action_failures)
    objects_seen = set()
    for row in rows:
        frame, objects = row["frame"], row["objects"]
        # The compositor sums rounded module durations. At a boundary this can
        # differ from the rounded timeline start by a fraction of a frame.
        # Use its active overlay so the first newly rendered scene frame is
        # excluded exactly, rather than reporting the cut as a teleport.
        scene = row["scene"] or scene_at(frame / a.fps)
        for obj in objects:
            key, pos = (scene, obj["id"]), obj["p"]
            objects_seen.add((scene, obj["name"]))
            if key in previous and previous[key][0] == frame - 1:
                d = math.dist(pos, previous[key][1])
                speeds[key].append(d)
                movements.append((frame, key, obj["name"], d))
            previous[key] = (frame, pos)
            if pos[1] < -.005:
                failures.append((frame, obj["name"], "floor", f"y={pos[1]:.6f}m < -0.005m"))
            # Rotor's own origin is necessarily inside the rotor; this is a
            # trajectory target, not an obstacle collision with itself.
            if obj["role"] == "rotor" or "rotor" in obj["role"].lower():
                continue
            if all(k in params for k in ("AXIS_Y", "SHAFT_R", "ROTOR_R", "ROTOR_L", "BEARING_X")):
                x, y, z = pos
                radial = math.hypot(y - params["AXIS_Y"], z)
                shaft = abs(x) < params["BEARING_X"] + .3 and radial < params["SHAFT_R"]
                rotor = abs(x) < params["ROTOR_L"] / 2 and radial < params["ROTOR_R"]
                if shaft or rotor:
                    failures.append((frame, obj["name"], "penetration",
                                     f"position={pos} radial={radial:.6f}m inside {'shaft' if shaft else 'rotor'}"))
        # Signed finite-volume clearances also cover probe tips and arm links,
        # not only the world origins of the tracked rigid objects.
        clear = row["clear"]
        if clear and clear["min_mm"] < 0:
            failures.append((frame, clear["part"], "penetration", f"signed_clearance={clear['min_mm']:.3f}mm"))
    medians = {key: statistics.median(ds) for key, ds in speeds.items()}
    caught = freeze_caught or camera_caught or match_caught
    for frame, key, name, d in movements:
        threshold = max(.25, 6 * medians[key])
        if d > threshold:
            failures.append((frame, name, "teleport",
                             f"displacement={d:.6f}m threshold={threshold:.6f}m median_speed={medians[key]*a.fps:.6f}m/s"))
            if mutation and frame == mutation.get("frame") and name == mutation.get("name"):
                caught = True
    failures.sort(key=lambda r: (r[0], r[1], r[2]))
    print("| t (s) | object | rule | values |")
    print("|---:|---|---|---|")
    for frame, name, rule, values in failures:
        print(f"| {frame/a.fps:.4f} | {name} | {rule} | {values} |")
    for err in errors:
        print(f"PAGE_ERROR {err}")
    for line in action_rows:
        print(line)
    for line in camera_rows:
        print(line)
    if not ui_events and not any(s.get("kind") == "ui-only" for shots in kinds.values() for s in shots):
        print("CAMERA_UI_CHECK 실제 SKIP (새 UI 표시/선언된 ui-only 구간 없음)")
    else:
        print("CAMERA_UI_CHECK " + ("FAIL" if camera_failures else "PASS"))
    if not spans:
        print("ACTION_MOTION_CHECK 실제 SKIP (동작 낱말/단계 카드 없음)")
    print(f"POP_IN_CHECK {'FAIL' if pop_failures else 'PASS'} pops={len(pop_failures)} exempt={pop_exempt} "
          f"onsets={len(pop_records)}")
    print(text_summary)
    framed = [r for r in frame_rows if " SKIP " not in r]
    print(f"SUBJECT_FRAME_CHECK {'FAIL' if frame_failures else 'PASS' if framed else '실제 SKIP'} "
          f"spans={len(framed)} off_center={len(frame_failures)} skipped={len(frame_rows) - len(framed)}")
    if not objects_seen and spans and not errors:
        print("MOTION_CHECK 실제 SKIP (추적할 물체 없음; 동작 화면 검사는 별도 수행)")
    if not objects_seen and not errors and not spans and not failures and not ui_events:
        print("PROBE_ERROR no trackable objects observed")
        print("MOTION_CHECK 실제 SKIP (추적할 물체 없음)")
        return 0
    if not objects_seen and not spans and not ui_events:
        print("PROBE_ERROR no trackable objects observed")
    # A part declared with KIT.process.part can follow a handle on another, unnamed part; a catch through it counts.
    skip = a.mutate == "actreverse" and not act_linked and not caught
    if a.mutate:
        if skip:
            mutation["linked"] = 0
        print(f"mutation={mutation}")
        if skip:   # reversed handles sit on parts no action line names, so no ACTION_MATCH can see them
            print("ACTION_MUTATION SKIP no action line is linked to a part with a reversible KIT.process handle (exhaust runs the same backwards)")
            print("MUTATION_SKIP")
        else:
            print("MUTATION_CAUGHT" if caught else "MUTATION_NOT_CAUGHT")
    print(f"frames={len(rows)} scene_objects={len(objects_seen)} failures={len(failures)} "
          f"fps={a.fps} runtime_s={time.monotonic()-start:.3f}")
    ok = bool(objects_seen or spans or ui_events) and not failures and not errors
    print("MOTION_CHECK " + ("PASS" if ok else "FAIL"))
    return 0 if ok or skip else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("html")
    ap.add_argument("--fps", type=float, default=30)
    ap.add_argument("--mutate", choices=["teleport", "freeze", "camnudge", "transglide", "actreverse", "textcut",
                                         "popin", "offcenter", "textstill"])
    ap.add_argument("--scene", help="limit trajectory/action probes to one timeline scene")
    a = ap.parse_args()
    if a.fps <= 0:
        ap.error("--fps must be positive")
    sys.exit(asyncio.run(main(a)))
