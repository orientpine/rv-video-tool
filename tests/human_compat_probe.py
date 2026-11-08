"""Exercise the pre-2026-11-05 direct-child controls on a rendered human."""
import argparse
import asyncio
import json
import sys
from pathlib import Path

TOOL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOL / "lib"))
from capture import CHROME, CHROME_ARGS
from playwright.async_api import async_playwright

PROBE = r"""() => {
 const scene=new THREE.Scene();
 scene.background=new THREE.Color(0xe7ecef);
 scene.add(new THREE.HemisphereLight(0xffffff,0x536577,1.4));
 const sun=new THREE.DirectionalLight(0xffffff,1);sun.position.set(-3,5,4);scene.add(sun);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.MeshStandardMaterial({color:0xc8d0d5}));
 floor.rotation.x=-Math.PI/2;floor.position.y=-.003;scene.add(floor);
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1280,720);document.body.append(renderer.domElement);
 const camera=new THREE.PerspectiveCamera(35,1280/720,.01,30);
 camera.position.set(1.5,1.45,4.1);camera.lookAt(0,.95,0);camera.updateMatrixWorld();
 const man=KIT.fx.human(scene,1.75,0x466675,{site:'construction'});man.visible=true;
 const pos=o=>o.getWorldPosition(new THREE.Vector3()),errors=[];
 const before=man.userData.contacts.hands.map(pos);
 try {
   // These are the exact old-style writes used by existing scene modules.
   man.children[3].rotation.z=-1.2;
   man.children[5].rotation.z=1.2;
 } catch(error) {errors.push(error.message);}
 scene.updateMatrixWorld(true);renderer.render(scene,camera);
 const up=man.userData.contacts.hands.map((o,i)=>pos(o).y-before[i].y);
 if(up.some(d=>d<=.2))errors.push('legacy arm raise did not lift both palms by >0.2 m');
 // Each of the six position/rotation controls must drive its real body pivot.
 const names=['head','spine','hip_l','shoulder_l','hip_r','shoulder_r'];
 const rotations=names.map(n=>man.getObjectByName(n).rotation.clone());
 for(let i=0;i<6;i++){
   const control=man.children[i],joint=man.getObjectByName(names[i]);
   if(!control){errors.push('missing legacy child '+i);continue;}
   const before=pos(joint),saved=control.position.clone();
   control.position.x+=.07;scene.updateMatrixWorld(true);
   if(Math.abs(pos(joint).x-before.x-.07)>1e-6)errors.push('position control '+i);
   control.position.copy(saved);
   const angle=control.rotation.x;
   control.rotation.x=angle+.3;scene.updateMatrixWorld(true);
   if(Math.abs(joint.rotation.x-angle-.3)>1e-6)errors.push('rotation control '+i);
   control.rotation.x=angle;
 }
 names.forEach((n,i)=>man.getObjectByName(n).rotation.copy(rotations[i]));
 scene.updateMatrixWorld(true);renderer.render(scene,camera);
 window.__compat={scene,renderer,camera,man};
 return {children:man.children.length,hand_up_m:up,errors};
}"""

async def main(a):
    source = "<style>body{margin:0}canvas{display:block}</style><script>"
    source += (TOOL / "vendor/three-0.147.0.min.js").read_text() + "</script><script>window.DATA={};"
    source += (TOOL / "kit/scene_kit.js").read_text() + "</script>"
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=CHROME, args=CHROME_ARGS, headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 720})
        browser_errors = []
        page.on("pageerror", lambda error: browser_errors.append(str(error)))
        page.on("console", lambda message: browser_errors.append(message.text) if message.type == "error" else None)
        await page.set_content(source)
        result = await page.evaluate(PROBE)
        await page.evaluate("""()=>new Promise(resolve=>requestAnimationFrame(()=>{
          const {renderer,scene,camera}=window.__compat;renderer.render(scene,camera);
          renderer.getContext().finish();
          requestAnimationFrame(()=>resolve());
        }))""")
        if a.shot:
            await page.screenshot(path=str(Path(a.shot).resolve()))
        # pose() must still control the same limbs after legacy writes.
        pose = await page.evaluate("""()=>{
          const {man}=window.__compat;man.pose('sit');
          return ['l','r'].map(s=>man.getObjectByName('knee_'+s).rotation.x);
        }""")
        if any(abs(angle - 1.5707963267948966) > 1e-6 for angle in pose):
            result["errors"].append("sit pose lost its knee controls")
        result["errors"].extend(browser_errors)
        await browser.close()
    print("HUMAN_COMPAT " + ("FAIL " if result["errors"] else "PASS ") + json.dumps(result))
    return 1 if result["errors"] else 0

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--shot")
    raise SystemExit(asyncio.run(main(parser.parse_args())))
