"""Check rv human metadata, contact markers and articulated poses in Chromium."""
import argparse
import asyncio
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import assert_never

from playwright.async_api import Error as BrowserError, async_playwright
from capture import CHROME, CHROME_ARGS
from human_frames import FRAME

TOOL = Path(__file__).resolve().parents[1]
HOOK = r"""
window.__humanScenes=new Set();
window.__humanCameras=new Map();
const HumanRenderer=THREE.WebGLRenderer;
THREE.WebGLRenderer=function(...args){
 const r=new HumanRenderer(...args),raw=r.render;
 r.render=function(s,c){if(s.isScene){window.__humanScenes.add(s);window.__humanCameras.set(s,c);(window.__frameScenes=window.__frameScenes||new Set()).add(s);}return raw.call(this,s,c);};
 return r;
};
THREE.WebGLRenderer.prototype=HumanRenderer.prototype;
"""
CHECK = r"""([humans,mutation]) => {
 const errors=[], required=['head','torso','pelvis','upperarm_l','upperarm_r','forearm_l','forearm_r','hand_l','hand_r','thigh_l','thigh_r','shin_l','shin_r','foot_l','foot_r'];
 if(['contacts','rvPart'].includes(mutation) && humans.length){
   if(mutation==='contacts')delete humans[0].userData.contacts;
   else {let first;humans[0].traverse(o=>{if(o.isMesh&&!first)first=o;});first.userData.rvPart='wrong_part';}
 }
 const v=o=>o.getWorldPosition(new THREE.Vector3());
 for(const [i,g] of humans.entries()){
   const fail=s=>errors.push(`human ${i}: ${s}`), parts=new Set();
   if(!g.isGroup||g.userData.rvHuman!==true)fail('not an rvHuman Group');
   if(!['stand','walk','point','tablet','sit'].includes(g.userData.pose))fail('invalid pose');
   g.traverse(o=>{if(o.isMesh){const p=o.userData.rvPart;if(!required.includes(p))fail('invalid rvPart '+p);else parts.add(p);}});
   for(const p of required)if(!parts.has(p))fail('missing '+p);
   const c=g.userData.contacts;
   if(!c||!c.seat?.isObject3D||c.feet?.length!==2||c.hands?.length!==2) {fail('missing contacts');continue;}
   for(const m of [c.seat,...c.feet,...c.hands]){
     let ancestor=m;while(ancestor&&ancestor!==g)ancestor=ancestor.parent;
     if(ancestor!==g)fail('contact not attached to human');
   }
   if(g.userData.pose==='sit'){
     for(const side of ['l','r']){
       const hip=g.getObjectByName('hip_'+side),knee=g.getObjectByName('knee_'+side),ankle=g.getObjectByName('ankle_'+side);
       const a=v(hip).sub(v(knee)).normalize(),b=v(ankle).sub(v(knee)).normalize();
       const angle=Math.acos(THREE.MathUtils.clamp(a.dot(b),-1,1))*180/Math.PI;
       // Seated range: knees bent 45..150 degrees, thighs within -15..45 degrees of level (KIT.fx.seat fits them to
       // the seat and floor); a standing or walking figure labelled sit stays outside it.
       if(angle<45||angle>150)fail('sit knee '+angle);
       const lift=-hip.rotation.x-Math.PI/2;
       if(lift<-.27||lift>.8)fail('sit hip '+(90+lift*180/Math.PI)+' degrees');
     }
   }
 }
 return {count:humans.length,errors};
}"""

SELF = r"""() => {
 const scene=new THREE.Scene(), all=[], errors=[];
 for(const site of ['lab','construction','office']){
   for(const pose of ['stand','walk','point','tablet','sit']){
     const h=KIT.fx.human(scene,1.75,{site,suit:site==='lab'?'cleanroom':undefined,color:0x466675});
     if(h.visible)errors.push('human initially visible');
     h.pose(pose,{t:.23,target:[-1,1.4,1]});all.push(h);
   }
 }
 const h=all[0], position=o=>o.getWorldPosition(new THREE.Vector3());
 h.pose('stand');
 const bounds=new THREE.Box3().setFromObject(h);
 if(bounds.getSize(new THREE.Vector3()).y<1.72||bounds.getSize(new THREE.Vector3()).y>1.85)errors.push('8-head height');
 if(h.userData.contacts.feet.some(o=>Math.abs(position(o).y)>.002))errors.push('soles not on floor');
 const surface=part=>{const out=[];h.traverse(o=>{if(o.isMesh&&o.userData.rvPart===part){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)out.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));}});return out;};
 const nearest=(v,pts)=>Math.min(...pts.map(p=>p.distanceTo(v)));
 const pelvisSkin=surface('pelvis'), bottom=Math.min(...pelvisSkin.map(p=>p.y));
 const seatAt=position(h.userData.contacts.seat);if(seatAt.y-bottom>.02||nearest(seatAt,pelvisSkin)>.004)errors.push('seat marker not on pelvis bottom');
 h.userData.contacts.hands.forEach((palm,i)=>{if(nearest(position(palm),surface(i?'hand_r':'hand_l'))>.004)errors.push('palm marker not on surface');});
 const wristL=position(h.getObjectByName('wrist_l')), handL=surface('hand_l');
 if(!handL.length||Math.max(...handL.map(p=>p.distanceTo(wristL)))<.15)errors.push('palm/fingers/thumb missing');
 const old=KIT.fx.human(scene,1.75,0x123456);
 const cloth=[];old.traverse(o=>{if(o.isMesh&&o.userData.rvPart==='pelvis')cloth.push(o.material.color.getHex());});
 if(!cloth.includes(0x123456))errors.push('legacy base colour');
 window.SITE='office';
 const defaultSite=KIT.fx.human(scene),overrideSite=KIT.fx.human(scene,1.75,{site:'lab'});
 if(defaultSite.userData.site!=='office'||overrideSite.userData.site!=='lab')errors.push('site default or override');
 delete window.SITE;
 const scaled=KIT.fx.human(scene,.875);scaled.pose('stand');
 if(Math.abs(new THREE.Box3().setFromObject(scaled).getSize(new THREE.Vector3()).y/bounds.getSize(new THREE.Vector3()).y-.5)>.02)errors.push('height scaling');
 const gait=all.find(o=>o.userData.pose==='walk');
 gait.pose('walk',{t:.25});const q=gait.getObjectByName('hip_l').quaternion.clone();
 gait.pose('walk',{t:.75});if(q.angleTo(gait.getObjectByName('hip_l').quaternion)<.8)errors.push('gait does not alternate');
 gait.pose('walk',{t:.25});if(q.angleTo(gait.getObjectByName('hip_l').quaternion)>1e-6)errors.push('gait is not deterministic');
 const point=all.find(o=>o.userData.pose==='point');
 point.position.set(2,0,1);point.rotation.y=.4;point.scale.setScalar(.8);
 const target=new THREE.Vector3(1,1.4,3);point.pose('point',{target});
 const a=position(point.getObjectByName('shoulder_l')),b=position(point.getObjectByName('elbow_l'));
 if(b.sub(a).normalize().dot(target.sub(a).normalize())<.999)errors.push('point target not world-space');
 for(const o of [h,...all,old,scaled])o.visible=true;
 KIT.fx.reset();if([h,...all,old,scaled].some(o=>o.visible))errors.push('reset visibility');
 window.__testHumans=all;
 return {errors};
}"""

async def main(a):
    build_errors = []
    if a.self_test:
        # Exercise the real builder in a temporary project; omitted site must not
        # select the outdoor shutter in LOOK, while an explicit site is exported.
        with tempfile.TemporaryDirectory(prefix="rv_human_") as directory:
            project = Path(directory)
            (project / "build").mkdir()
            (project / "build/timeline.json").write_text(json.dumps({"order": [], "modules": {}, "total_s": 0}))
            for script, expected in [({}, None), ({"site": "lab"}, 'window.SITE="lab";')]:
                (project / "script.json").write_text(json.dumps(script))
                subprocess.run([sys.executable, str(TOOL / "lib/build.py"), str(project)], check=True, capture_output=True)
                html = (project / "build/video.html").read_text()
                if expected is None and "window.SITE=" in html:
                    build_errors.append("unspecified site exported")
                elif expected is not None and expected not in html:
                    build_errors.append("explicit site not exported")
    errors, visible_humans, homemade = build_errors, set(), set()
    mutation_caught = False
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(executable_path=CHROME, args=CHROME_ARGS, headless=True)
            page = await browser.new_page()
            if a.self_test:
                source = "<script>" + (TOOL / "vendor/three-0.147.0.min.js").read_text() + "</script><script>window.DATA={};"
                source += (TOOL / "kit/human_body.js").read_text() + (TOOL / "kit/scene_kit.js").read_text() + "</script>"
                await page.set_content(source)
                errors.extend((await page.evaluate(SELF))["errors"])
                result = await page.evaluate(f"mutation=>({CHECK})([window.__testHumans,mutation])", a.mutate)
                errors.extend(result["errors"])
                visible_humans.update(range(result["count"]))
                mutation_caught = bool(result["errors"]) and a.mutate in ("contacts", "rvPart")
            else:
                source = Path(a.html).resolve().read_text()
                source = source.replace("const TL = window.TIMELINE", HOOK + "\nconst TL = window.TIMELINE", 1)
                await page.set_content(source, wait_until="load")
                await page.evaluate("Promise.resolve(window.renderReady).then(()=>0)")
                times = await page.evaluate("Object.values(TIMELINE.modules).map(m=>m.start+m.duration*.5)")
                total = await page.evaluate("TIMELINE.total_s")
                times = sorted(set(times + [k + .5 for k in range(int(total))]))
                reported, legacy = set(), set()
                for t in times:
                    await page.evaluate("()=>{window.__frameScenes=new Set();}")
                    await page.evaluate("t=>window.renderAt(t)", t)
                    frame = await page.evaluate(FRAME, [t, a.mutate])
                    visible_humans.update(frame["humans"])
                    homemade.update(frame["homemade"])
                    for finding in frame["findings"]:
                        prefix = f"t={t:.2f} scene={frame['scene']} object={finding['name']}"
                        match finding["kind"]:
                            case "homemade":
                                scope = ""
                                line = f"HUMAN_HOMEMADE {prefix} via={finding['via']} -> KIT.fx.human 으로 만드세요"
                                if finding["legacy"]:
                                    legacy.add(finding["uuid"])
                            case "site":
                                scope = frame["scene"]
                                detail = ("undeclared: 사람이 나오면 script.json site(또는 scenes[].site)를 적으세요 (KIT.fx.human 기본 construction)"
                                          if finding.get("undeclared") else f"outfit={finding.get('actual')} expected={finding['expected']}")
                                line = f"HUMAN_SITE {prefix} {detail}"
                            case unreachable:
                                assert_never(unreachable)
                        key = (scope, finding["kind"], finding["uuid"])
                        if key in reported:
                            continue
                        reported.add(key)
                        print(line)
                        errors.append(line)
                        mutation_caught |= finding["uuid"] == frame["mutation"] and (
                            (a.mutate == "homemade" and finding["kind"] == "homemade" and finding["via"] == "shape")
                            or (a.mutate == "site" and finding["kind"] == "site"))
                if legacy:
                    print(f"LEGACY_HUMAN {len(legacy)} figures (sphere head + capsule/box body, no joints/outfit)")
                result = await page.evaluate(f"""mutation=>{{
                  const humans=[];for(const scene of window.__humanScenes)scene.traverse(o=>{{if(o.userData.rvHuman)humans.push(o);}});
                  return ({CHECK})([humans,mutation]);
                }}""", a.mutate)
                errors.extend(result["errors"])
                mutation_caught |= bool(result["errors"]) and a.mutate in ("contacts", "rvPart")
            await browser.close()
    except BrowserError as error:
        errors.append(f"browser: {error}")
    count = len(visible_humans) + len(homemade)
    print(f"HUMAN_COUNT rvHuman={len(visible_humans)} homemade={len(homemade)}")
    if errors:
        print("HUMAN_CHECK FAIL " + json.dumps(errors, ensure_ascii=False))
        if mutation_caught:
            print("MUTATION_CAUGHT " + a.mutate)
        return 1
    if not count:
        print("HUMAN_CHECK 실제 SKIP no KIT.fx.human figures"); return 0
    if a.mutate:
        print("HUMAN_CHECK FAIL mutation was not caught"); return 1
    print(f"HUMAN_CHECK PASS {count} figures; 15 parts, contacts, poses")
    return 0

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("html", nargs="?")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--mutate", choices=["contacts", "rvPart", "homemade", "site"])
    args = parser.parse_args()
    if not args.self_test and not args.html:
        parser.error("html or --self-test is required")
    raise SystemExit(asyncio.run(main(args)))
