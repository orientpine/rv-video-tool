"""CLI regressions for primitive figures and declared scene outfits."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

TOOL = Path(__file__).resolve().parents[1]
CHECKER = Path(os.environ.get("HUMAN_CHECKER", TOOL / "lib/check_human.py"))
SETUP = r"""
const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(45,16/9,.01,100);
camera.position.set(0,1,5);camera.lookAt(0,.85,0);
scene.background=new THREE.Color(0xe0e7ed);
scene.add(new THREE.HemisphereLight(0xffffff,0x555555,2));
const figure=new THREE.Group();scene.add(figure);
const material=new THREE.MeshStandardMaterial({color:0x4b6988});
const part=(geometry,x,y)=>{
 const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,0);figure.add(mesh);return mesh;
};
"""
FIGURE = r"""
part(HEAD,0,1.57);
part(new THREE.CylinderGeometry(.16,.14,.58,12),0,1.1);
for(const x of [-.24,.24])part(new THREE.CylinderGeometry(.045,.045,.55,12),x,1.08);
for(const x of [-.1,.1])part(new THREE.CylinderGeometry(.06,.06,.8,12),x,.4);
"""
CASES = [
    ("unnamed_icosahedron", FIGURE.replace("HEAD", "new THREE.IcosahedronGeometry(.13,1)"),
     {}, 1, "HUMAN_HOMEMADE", "via=shape"),
    ("named_box_head", "figure.name='worker';" + FIGURE.replace("HEAD", "new THREE.BoxGeometry(.28,.2,.2)"),
     {}, 1, "object=worker", "via=name"),
    ("named_ancestor", "const owner=new THREE.Group();owner.name='driver';scene.add(owner);owner.add(figure);"
     + "part(new THREE.BoxGeometry(.2,.4,.2),0,1);",
     {}, 1, "object=driver", "via=name"),
    ("nested_figure_once", FIGURE.replace("HEAD", "new THREE.IcosahedronGeometry(.13,1)")
     + "const owner=new THREE.Group();scene.add(owner);owner.add(figure);",
     {}, 1, "HUMAN_HOMEMADE", "rvHuman=0 homemade=1"),
    ("hidden_figure", FIGURE.replace("HEAD", "new THREE.IcosahedronGeometry(.13,1)") + "figure.visible=false;",
     {}, 0, "HUMAN_CHECK", "homemade=0"),
    ("legacy_capsules", r"""
part(new THREE.SphereGeometry(.12,12,8),0,1.25);
part(new THREE.CapsuleGeometry(.12,.38,4,8),0,.86);
""", {}, 1, "LEGACY_HUMAN", "figures"),
    ("scene_lab_override", "const human=KIT.fx.human(scene,1.7,{site:'lab'});",
     {"site": "construction", "scene_site": "lab"}, 0, "HUMAN_CHECK PASS", "rvHuman=1 homemade=0"),
    ("named_kit_parent", "figure.name='worker';const human=KIT.fx.human(figure,1.7,{site:'lab'});",
     {"site": "lab"}, 0, "HUMAN_CHECK PASS", "rvHuman=1 homemade=0"),
    ("construction_in_lab", "const human=KIT.fx.human(scene,1.7,{site:'construction'});",
     {"site": "construction", "scene_site": "lab"}, 1, "HUMAN_SITE", "outfit=construction expected=lab"),
    ("undeclared_site", "const human=KIT.fx.human(scene);",
     {}, 1, "HUMAN_SITE", "undeclared:"),
    ("sensor_5cm", r"""
part(new THREE.SphereGeometry(.008,12,8),0,.042);
part(new THREE.CylinderGeometry(.005,.005,.034,12),0,.017);
""", {}, 0, "HUMAN_CHECK", "homemade=0"),
    ("lamp_1_8m", r"""
part(new THREE.SphereGeometry(.15,12,8),0,1.65);
part(new THREE.CylinderGeometry(.025,.025,1.5,12),0,.75);
""", {}, 0, "HUMAN_CHECK", "homemade=0"),
    ("robot_arm", r"""
part(new THREE.CylinderGeometry(.13,.13,.15,12),0,.075);
part(new THREE.CylinderGeometry(.045,.045,.6,12),0,.4);
part(new THREE.SphereGeometry(.09,12,8),0,.7);
part(new THREE.CylinderGeometry(.04,.04,.6,12),.25,.9).rotation.z=-.9;
""", {}, 0, "HUMAN_CHECK", "homemade=0"),
    ("robot_link_casing", r"""
part(new THREE.CylinderGeometry(.06,.06,.11,12),0,.52).rotation.x=Math.PI/2;
part(new THREE.CapsuleGeometry(.04,.35,4,8),-.1,.38).rotation.z=-.65;
part(new THREE.BoxGeometry(.12,.2,.085),-.1,.38).rotation.z=-.65;
part(new THREE.CylinderGeometry(.05,.05,.09,12),-.2,.24).rotation.x=Math.PI/2;
part(new THREE.CapsuleGeometry(.022,.32,4,8),-.06,.14).rotation.z=.9;
""", {}, 0, "HUMAN_CHECK", "homemade=0"),
    ("wheel_bearings", r"""
part(new THREE.TorusGeometry(.65,.12,8,32),0,.95);
part(new THREE.CylinderGeometry(.07,.07,1.7,16).rotateX(Math.PI/2),0,.95);
for(let i=0;i<6;i++){
 const a=i*Math.PI/3;
 const spoke=part(new THREE.BoxGeometry(.08,.36,.14),Math.cos(a)*.36,.95+Math.sin(a)*.36);
 spoke.rotation.z=a-Math.PI/2;
}
for(const z of [-.66,.66]){
 part(new THREE.BoxGeometry(.22,.83,.2),0,.415).position.z=z;
 part(new THREE.BoxGeometry(.6,.06,.5),0,.03).position.z=z;
 part(new THREE.CylinderGeometry(.13,.13,.24,16).rotateX(Math.PI/2),0,.95).position.z=z;
}
figure.rotation.y=.55;
""", {}, 0, "HUMAN_CHECK", "homemade=0"),
    ("loaded_truck_bed", r"""
part(new THREE.BoxGeometry(1,.4,1),0,.2);
for(const [x,z,w,d] of [[-.45,0,.1,1],[.45,0,.1,1],[0,-.45,1,.1]])part(new THREE.BoxGeometry(w,.5,d),x,.65).position.z=z;
part(new THREE.SphereGeometry(.3,16,8,0,Math.PI*2,0,Math.PI/2),0,.4).name='bed-load';
""", {}, 0, "HUMAN_CHECK", "homemade=0"),
    ("unnamed_half_sphere_heap", r"""
part(new THREE.BoxGeometry(1,.4,1),0,.2);
for(const [x,z,w,d] of [[-.45,0,.1,1],[.45,0,.1,1],[0,-.45,1,.1]])part(new THREE.BoxGeometry(w,.5,d),x,.65).position.z=z;
part(new THREE.SphereGeometry(.3,16,8,0,Math.PI*2,0,Math.PI/2),0,.4);
""", {}, 0, "HUMAN_CHECK", "homemade=0"),
    # Ball-and-stick models: a ball on a ball or on a stick is not a head on a torso.
    ("ball_and_stick_models", r"""
const up=new THREE.Vector3(0,1,0);
const model=(kind,x,y,z,rx,ry,rz)=>{
 const g=new THREE.Group();g.position.set(x,y,z);g.rotation.set(rx,ry,rz);scene.add(g);
 const atom=(p,r)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(r,12,10),material);m.position.set(...p);g.add(m);};
 const bond=(a,b,r)=>{const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A);
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),8),material);
  m.position.copy(A).add(B).multiplyScalar(.5);m.quaternion.setFromUnitVectors(up,d.normalize());g.add(m);};
 if(kind===0){for(const s of [-1,1]){const c=[s*.14,0,0];atom(c,.085);
   for(const t of [-1,1]){const p=[s*.24,t*.16,0];atom(p,.05);bond(c,p,.017);}}
  for(const t of [-.03,.03])bond([-.14,t,0],[.14,t,0],.018);}
 else if(kind===1){const c=[0,0,0];atom(c,.09);
  for(const p of [[0,.27,0],[.25,-.09,0],[-.13,-.09,.22],[-.13,-.09,-.22]]){atom(p,.055);bond(c,p,.018);}}
 else{for(let i=0;i<6;i++){const a=i*Math.PI/3,b=a+Math.PI/3,p=[Math.cos(a)*.26,Math.sin(a)*.26,0],q=[Math.cos(b)*.26,Math.sin(b)*.26,0];
   atom(p,.07);bond(p,q,.02);const o=[p[0]*1.6,p[1]*1.6,0];bond(p,o,.016);atom(o,.045);}}
};
let k=0;for(let kind=0;kind<3;kind++)for(let i=0;i<16;i++){const a=i*0.83+kind,b=i*1.37,c=i*0.51;
 model(kind,-3+(k%12)*.55,.5+Math.floor(k/12)*.7,-2,a,b,c);k++;}
""", {}, 0, "HUMAN_CHECK", "homemade=0"),
    ("box_torso_figure", r"""
part(new THREE.SphereGeometry(.11,12,8),0,1.62);
part(new THREE.BoxGeometry(.38,.6,.22),0,1.2);
for(const x of [-.26,.26])part(new THREE.CylinderGeometry(.04,.04,.55,12),x,1.15);
for(const x of [-.1,.1])part(new THREE.CylinderGeometry(.06,.06,.8,12),x,.45);
""", {}, 1, "HUMAN_HOMEMADE", "via=shape"),
    # Stout, cube and stick torsos are torsos: only a second ball of about the head's size makes a model.
    ("stout_cylinder_torso", r"""
part(new THREE.SphereGeometry(.11,12,8),0,1.62);
part(new THREE.CylinderGeometry(.2,.2,.5,16),0,1.2);
for(const x of [-.26,.26])part(new THREE.CylinderGeometry(.04,.04,.55,12),x,1.15);
for(const x of [-.1,.1])part(new THREE.CylinderGeometry(.06,.06,.8,12),x,.45);
""", {}, 1, "HUMAN_HOMEMADE", "via=shape"),
    ("cube_torso", r"""
part(new THREE.SphereGeometry(.11,12,8),0,1.62);
part(new THREE.BoxGeometry(.4,.5,.4),0,1.2);
for(const x of [-.26,.26])part(new THREE.CylinderGeometry(.04,.04,.55,12),x,1.15);
for(const x of [-.1,.1])part(new THREE.CylinderGeometry(.06,.06,.8,12),x,.45);
""", {}, 1, "HUMAN_HOMEMADE", "via=shape"),
    ("stick_figure", r"""
part(new THREE.SphereGeometry(.12,12,8),0,1.6);
part(new THREE.CylinderGeometry(.02,.02,.55,8),0,1.2);
for(const x of [-.2,.2])part(new THREE.CylinderGeometry(.015,.015,.5,8),x,1.15);
for(const x of [-.1,.1])part(new THREE.CylinderGeometry(.015,.015,.8,8),x,.45);
""", {}, 1, "HUMAN_HOMEMADE", "via=shape"),
    # Sphere hands and ball joints of about half the head hang off limbs, not off the head; a snowman has no stick.
    ("sphere_hands_joints", r"""
part(new THREE.SphereGeometry(.11,12,8),0,1.62);
part(new THREE.BoxGeometry(.38,.6,.22),0,1.2);
for(const x of [-.26,.26]){part(new THREE.CylinderGeometry(.04,.04,.55,12),x,1.15);part(new THREE.SphereGeometry(.065,12,8),x,.84);}
for(const x of [-.1,.1]){part(new THREE.CylinderGeometry(.06,.06,.8,12),x,.45);part(new THREE.SphereGeometry(.06,12,8),x,.5);}
""", {}, 1, "HUMAN_HOMEMADE", "via=shape"),
    ("lying_figure", FIGURE.replace("HEAD", "new THREE.IcosahedronGeometry(.13,1)") + "figure.rotation.x=Math.PI/2;",
     {}, 1, "HUMAN_HOMEMADE", "via=shape"),
    ("browser_error_verdict", "throw new TypeError('broken scene fixture');",
     {}, 1, "HUMAN_CHECK FAIL", "HUMAN_COUNT rvHuman=0 homemade=0"),
]


def main() -> int:
    """Build isolated scenes, run the shipped checker, and report every row."""
    failures = 0
    with tempfile.TemporaryDirectory(prefix="human_cases_") as directory:
        root = Path(directory)
        for name, geometry, sites, expected, marker, detail in CASES:
            project = root / name
            (project / "scenes/probe").mkdir(parents=True)
            (project / "build").mkdir()
            script = {"scenes": [{"name": "probe"}]}
            if "site" in sites:
                script["site"] = sites["site"]
            if "scene_site" in sites:
                script["scenes"][0]["site"] = sites["scene_site"]
            (project / "script.json").write_text(json.dumps(script))
            timeline = {"order": ["probe"], "modules": {"probe": {"start": 0, "duration": 2}}, "total_s": 2}
            (project / "build/timeline.json").write_text(json.dumps(timeline))
            render = "if(typeof human!=='undefined'){KIT.fx.reset();human.visible=true;}r.render(scene,camera);"
            module = "SCENES.probe={duration:2,init(r){\n" + SETUP + geometry
            module += "\nthis.render=()=>{" + render + "};},render(){},show(){}};"
            (project / "scenes/probe/module.js").write_text(module)
            subprocess.run([sys.executable, str(TOOL / "lib/build.py"), str(project)],
                           check=True, capture_output=True, text=True)
            result = subprocess.run([sys.executable, str(CHECKER), str(project / "build/video.html")],
                                    capture_output=True, text=True, check=False)
            output = result.stdout + result.stderr
            # Baseline lacks HUMAN_COUNT; a row must fail for its behavior first.
            passed = result.returncode == expected and marker in output and detail in output
            if "HUMAN_CHECKER" in os.environ and expected == 0 and detail.startswith(("rvHuman=", "homemade=")):
                passed = result.returncode == 0 and marker in output
            if "HUMAN_CHECKER" not in os.environ:
                passed &= sum(line.startswith("HUMAN_COUNT ") for line in output.splitlines()) == 1
            print(f"HUMAN_CASE {name} {'PASS' if passed else 'FAIL'} exit={result.returncode} expected={expected}", flush=True)
            print(output, end="", flush=True)
            failures += not passed
    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())
