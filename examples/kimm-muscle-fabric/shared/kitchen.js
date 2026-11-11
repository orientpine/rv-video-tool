/* A lived-in kitchen at golden hour, shared by the problem and the target scenario (premium: copied from the base
   film's kitchen). The low sun comes through a real window opening in the back wall, so the muntins throw light on
   the person and the counter; outside are a patio, a garden wall, a hedge, trees, a street, facades and the far city. */
window.HOME_SUN = [-0.64, 0.36, -0.68];
window.HOME = (R, o = {}) => {
  const F = FILM, scene = new THREE.Scene(), env = new THREE.Group(); scene.add(env); KIT.fx.env(env);
  const atmos = PM_ATMOS.gold(scene, R, {sun: HOME_SUN, key: o.key ?? 5.0, fogNear: 30, fogFar: 110,
    shafts: [[-1.25, 1.45, -.35, .5, .12], [-.75, 1.05, .15, .38, .10], [-1.55, 1.75, -.55, .3, .08]],
    motes: {center: [-.9, 1.2, .2], size: [2.4, 1.8, 2.4], n: 560, px: .007}});
  // Indoor reflections: a dark room with one bright warm window, not the open sky (the sky stays as the background).
  {const es=new THREE.Scene();es.background=new THREE.Color(0x15120f);
   for(const [p,col,s] of [[[-3.0,2.0,-3.4],0xffc07a,[3,2.2]],[[0,4,0],0x34343c,[8,8]],[[3,1.5,3.5],0x4a3d31,[4,3]]]){const m=new THREE.Mesh(new THREE.PlaneGeometry(...s),new THREE.MeshBasicMaterial({color:col,side:THREE.DoubleSide}));m.position.set(...p);m.lookAt(0,1.2,0);es.add(m);}
   const pm=new THREE.PMREMGenerator(R);scene.environment=pm.fromScene(es,.04).texture;pm.dispose();}
  atmos.hemi.intensity = .16;
  scene.add(new THREE.HemisphereLight(0xb8b4c8, 0x3a2c24, .08));
  const fill = new THREE.DirectionalLight(0xffdcb8, o.fill ?? .16); fill.position.set(3, 2.6, 6); scene.add(fill);
  const wood = F.mat(0xbca285, 0, .65, {map:F.texture("wood", [2, 3])});
  const oak = F.mat(0xa08668, 0, .65, {map:F.texture("wood", [2, 2])});
  const cabinet = F.mat(0x334c49), stone = F.mat(0x424b49, .05, .5);
  const steel = F.mat(0x9aa7a6, .8, .25), dark = F.mat(0x34423f), ceramic = F.mat(0xc5bba6, .1, .25);
  F.box(env, [11,.08,6.95], [0,-.052,2.525], F.mat(0x44483d, 0, .85, {map:F.texture("wood",[8,8])}));
  const wall=F.mat(0x4b5554,0,.9,{emissive:0x172329,emissiveIntensity:.12});
  // Back wall built around a real window opening x -2.6..-0.9, y 1.0..2.55.
  F.box(env,[.9,3.4,.10],[-3.05,1.7,-.90],wall);F.box(env,[4.4,3.4,.10],[1.3,1.7,-.90],wall);
  F.box(env,[1.7,1.0,.10],[-1.75,.5,-.90],wall);F.box(env,[1.7,.85,.10],[-1.75,2.975,-.90],wall);
  F.box(env,[.10,3.4,4.95],[3.55,1.7,1.575],wall);F.box(env,[7.2,.1,5.1],[0,3.43,1.6],wall);
  // Build an actual opening in the side wall rather than a black rectangle.
  F.box(env,[.10,3.4,1.03],[-3.4,1.7,-.385],wall);
  F.box(env,[.10,3.4,2.65],[-3.4,1.7,2.725],wall);
  F.box(env,[.10,1.13,1.3],[-3.4,2.835,.75],wall);
  const hall=F.mat(0x645e52,0,.85,{emissive:0x3c3025,emissiveIntensity:.10});
  F.box(env,[.08,2.7,1.4],[-5.35,1.35,.75],hall);
  F.box(env,[2.0,.06,1.4],[-4.35,-.01,.75],oak);
  F.box(env,[2.0,2.7,.08],[-4.35,1.35,.04],hall);
  for(const z of [.09,1.41])F.box(env,[.14,2.3,.065],[-3.33,1.15,z],oak);
  F.box(env,[.14,.09,1.39],[-3.33,2.28,.75],oak);
  const door=new THREE.Group();door.position.set(-3.38,0,.14);door.rotation.y=-1.1;env.add(door);
  F.box(door,[.04,2.18,1.18],[0,1.09,.59],F.mat(0x6d6859,0,.8));
  F.cyl(door,.023,.08,[.06,1.05,1.04],steel).rotation.z=Math.PI/2;
  // Hallway console, framed print and a distant warm sconce give the opening depth.
  F.box(env,[.20,.62,.72],[-5.12,.34,.75],F.mat(0x455256));
  F.box(env,[.055,.43,.48],[-5.27,1.55,.75],oak);
  F.box(env,[.06,.34,.39],[-5.23,1.55,.75],F.mat(0x637b7e));
  const hallLight=new THREE.PointLight(0xffd5aa,.60,4.5,1.3);hallLight.position.set(-4.65,2.05,.75);scene.add(hallLight);
  F.mesh(env,new THREE.SphereGeometry(.06,16,10),F.mat(0xd3b48b,0,.7,{emissive:0xffcc92,emissiveIntensity:1.0}),[-5.20,2.10,.75]);
  const tile=F.mat(0x506862, .05, .7, {map:F.texture("tile",[4,1])});
  F.box(env, [3.85,.73,.035], [1.025,1.27,-.83], tile); F.box(env, [.35,.73,.035], [-2.775,1.27,-.83], tile);
  // Base cupboards leave the protagonist's standing space clear.
  for (const x of [-2.55,-1.75,-.95,.95,1.75,2.55]) {
    F.box(env,[.77,.80,.64],[x,.44,-.51],cabinet);
    F.box(env,[.73,.70,.025],[x,.47,-.172],cabinet);
    F.box(env,[.24,.018,.028],[x,.74,-.145],steel);
  }
  F.box(env,[6.35,.07,.79],[0,.895,-.46],stone);
  // Recessed sink, rim and articulated tap at the left.
  F.box(env,[.80,.012,.47],[-1.3,.937,-.38],steel);
  F.box(env,[.68,.018,.36],[-1.3,.947,-.38],dark);
  F.tube(env,[[-1.65,.95,-.65],[-1.65,1.24,-.65],[-1.48,1.29,-.60],[-1.43,1.16,-.43]],.025,steel);
  for (const x of [1.65,2.5]) {
    const y=x<0?2.72:2.19;
    F.box(env,[.79,.68,.36],[x,y,-.62],cabinet);
    F.box(env,[.75,.63,.025],[x,y,-.423],cabinet);
    F.box(env,[.018,.17,.032],[x+.25,y-.07,-.397],steel);
  }
  // Open shelf: its front edge remains in the same place in both bookend scenes.
  // Shelf unit lowered 16 cm (board top 1.645 m): still above the shoulder, but an arm can clear its front edge.
  const shelf=F.box(env,[1.5,.045,.84],[.49,1.6225,-.28],oak);shelf.name="선반";
  F.box(env,[1.5,.045,.56],[.49,2.08,-.36],oak);
  for (const x of [-.23,1.21]) F.box(env,[.035,.66,.56],[x,1.84,-.36],oak);
  for (let i=0;i<4;i++) {
    const jar = F.cyl(env,.07,.14,[.10+i*.21,2.175,-.40],F.mat(0x8a9e91,.05,.35));
    F.cyl(jar,.075,.025,[0,.082,0],wood);
  }
  F.box(env,[.09,.33,.22],[.96,1.81,-.52],F.mat(0xa97c57));
  F.box(env,[.07,.29,.23],[1.05,1.79,-.52],F.mat(0x687e8a));
  // Window: frame, muntins, faint reflective glass (casts no shadow, so the sun reaches the room) and a deep sill.
  const frameM=F.mat(0x6b5a48,0,.6);
  for (const x of [-2.6,-1.75,-.9]) F.box(env,[.06,1.6,.09],[x,1.775,-.86],frameM);
  for (const y of [1.0,1.86,2.55]) F.box(env,[1.76,.06,.09],[-1.75,y,-.86],frameM);
  const glass=F.mesh(env,new THREE.PlaneGeometry(1.7,1.55),new THREE.MeshStandardMaterial({color:0xdfe8ec,metalness:.9,roughness:.05,transparent:true,opacity:.09,envMapIntensity:1.3,depthWrite:false}),[-1.75,1.775,-.872]);
  glass.castShadow=glass.receiveShadow=false;glass.name="창 유리";glass.renderOrder=3;
  F.box(env,[1.9,.05,.28],[-1.75,.985,-.74],oak);
  F.plant(env,[-2.3,1.01,-.74],.62);
  F.plant(env,[-1.02,1.01,-.74],.46);
  // Outside the window: patio, garden wall, hedge, trees, a street, facades (gap where the sun sets) and the far city.
  const out=new THREE.Group();out.name="창밖";env.add(out);
  const pave=new THREE.MeshStandardMaterial({map:(()=>{const t=PM_BACK.pavingTex();t.repeat.set(3,.7);return t;})(),roughness:.7});
  F.box(out,[16,.1,3.25],[-1,-.08,-2.58],pave);
  F.box(out,[16,.6,.26],[-1,.28,-4.2],F.mat(0x8f8273,0,.9,{map:F.texture("tile",[16,1])}));
  F.box(out,[16,.05,.32],[-1,.6,-4.2],F.mat(0xa59a8a,0,.8));
  const hedge=[],hr=KIT.rng(6612);
  const leafG=new THREE.IcosahedronGeometry(1,0),twig=new THREE.CylinderGeometry(1,1,1,5);
  for(let i=0;i<70;i++){const x=-9+i*.24+(hr()-.5)*.12,z=-4.62+(hr()-.5)*.25,h=.9+hr()*.6;
    hedge.push({geo:twig,m:new THREE.Matrix4().compose(new THREE.Vector3(x,h/2,z),new THREE.Quaternion().setFromEuler(new THREE.Euler((hr()-.5)*.4,0,(hr()-.5)*.4)),new THREE.Vector3(.012,h,.012)),color:0x4a3a2a});
    for(let k=0;k<26;k++){const s=.045+.05*hr(),a=hr()*6.28,r=.05+.2*hr();
      hedge.push({geo:leafG,m:new THREE.Matrix4().compose(new THREE.Vector3(x+Math.cos(a)*r,.45+hr()*(h-.3),z+Math.sin(a)*r*.7),new THREE.Quaternion().setFromEuler(new THREE.Euler(hr()*3,hr()*3,hr()*3)),new THREE.Vector3(s*1.4,s*.35,s)),color:[0x3b5530,0x4f6a34,0x2f4428,0x6f7f3a,0x8a8a3c,0x5d7136][Math.floor(hr()*6)]});}}
  const hedgeM=new THREE.Mesh(PM_BACK.merge(hedge),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85}));hedgeM.name="산울타리";hedgeM.castShadow=hedgeM.receiveShadow=true;out.add(hedgeM);
  F.box(out,[70,.08,8],[0,-.12,-9.0],new THREE.MeshStandardMaterial({map:PM_BACK.asphaltTex(),roughness:.82}));
  for(let i=0;i<22;i++)F.box(out,[1.6,.005,.1],[-34+i*3.2,-.075,-9.0],F.mat(0xc9c2b0));
  F.box(out,[70,.14,3],[0,-.08,-14.0],new THREE.MeshStandardMaterial({map:(()=>{const t=PM_BACK.pavingTex();t.repeat.set(12,.5);return t;})(),roughness:.7}));
  PM_BACK.tree(out,-2.6,-5.6,5.6,7);PM_BACK.tree(out,1.8,-6.0,4.8,9);PM_BACK.tree(out,-6.4,-5.4,5.2,8);PM_BACK.tree(out,-10.5,-6.2,5.8,12);
  for (const [x0,w,fl,kind,seed,aw] of [[-27,7,5,"brick",46,0x3b4a3a],[-11,6,4,"stucco",41,0x7a4a2c],[-4.5,7,3,"brick",42,0x4a3a5a],[3,6.5,5,"stone",44,0x6b3a2c],[10,8,4,"panel",45,0x2c3e4a]])
    PM_BACK.facade(out,{origin:[x0,0,-15.6],facing:0,width:w,floors:fl,kind,seed,shop:true,balcony:fl>3,ac:true,awning:aw,castShadow:false});
  PM_BACK.farCity(out);
  out.traverse(m=>{m.userData.rvProp=true;});
  // Fridge has door gaskets, separate freezer, handle and small paper notes.
  F.box(env,[.73,1.9,.73],[3.0,.95,-.3],F.mat(0x465953,.3,.42));
  for (const [y,h] of [[.73,1.38],[1.69,.43]]) {
    F.box(env,[.69,h,.025],[3,y,.08],F.mat(0x5a6d62,.25,.42));
    F.box(env,[.022,h*.55,.04],[2.77,y,.115],steel);
  }
  F.box(env,[.18,.23,.006],[3.09,1.28,.098],F.mat(0xc4b89b));
  // Kettle, steam, cutting board, hanging utensils and tea towel.
  const kettle = F.mesh(env,new THREE.SphereGeometry(.13,28,18),steel,[-.80,1.045,-.44]); kettle.scale.y=.8; kettle.name="주전자";
  F.cyl(env,.08,.03,[-.80,1.16,-.44],dark);
  F.tube(env,[[-.9,1.09,-.44],[-1.01,1.26,-.44],[-.67,1.26,-.44],[-.69,1.08,-.44]],.016,dark);
  F.tube(env,[[-.70,1.06,-.44],[-.58,1.09,-.44],[-.54,1.17,-.44]],.025,steel);
  F.box(env,[.35,.025,.24],[1.93,.95,-.32],wood);
  F.tube(env,[[1.38,1.32,-.78],[2.55,1.32,-.78]],.016,steel);
  for(let i=0;i<4;i++) {
    F.box(env,[.018,.19,.018],[1.52+i*.23,1.19,-.76],steel);
    const spoon=F.mesh(env,new THREE.SphereGeometry(1,12,8),steel,[1.52+i*.23,1.07,-.76]);spoon.scale.set(.035,.055,.012);
  }
  F.box(env,[.30,.40,.012],[2.1,.65,-.126],F.mat(0xb8a184,0,.95,{map:F.texture("cloth")}));
  F.plant(env,[2.40,.94,-.52],.7);
  // Practical lamp and foreground dining furniture establish three depth layers.
  F.cyl(env,.009,.52,[.2,2.91,.25],dark);
  F.mesh(env,new THREE.ConeGeometry(.24,.20,40,1,true),F.mat(0x7a6651,.3,.45,{side:THREE.DoubleSide}),[.2,2.61,.25]);
  F.mesh(env,new THREE.SphereGeometry(.045,16,10),F.mat(0xf7cf8b,0,.5,{emissive:0xffbe65,emissiveIntensity:1.5}),[.2,2.53,.25]);
  const lamp=new THREE.PointLight(0xffcc89,.7,4,1.5);lamp.position.set(.2,2.45,.25);scene.add(lamp);
  const pool=new THREE.SpotLight(0xffd4a2,1.1,4,.8,.8,1.3);
  pool.position.set(.2,2.46,.25);pool.target.position.set(.28,.90,-.28);scene.add(pool,pool.target);
  // A shaded floor lamp fills the far corner without becoming foreground clutter.
  F.cyl(env,.13,.035,[-3.04,.025,-.28],dark);
  F.cyl(env,.013,1.4,[-3.04,.73,-.28],steel);
  F.mesh(env,new THREE.ConeGeometry(.19,.24,32,1,true),F.mat(0x927b5c,0,.9,{side:THREE.DoubleSide,emissive:0x986637,emissiveIntensity:.15}),[-3.04,1.49,-.28]);
  const corner=new THREE.PointLight(0xffd7a3,.40,3.4,1.3);corner.position.set(-3.04,1.42,-.28);scene.add(corner);
  for(const x of [1.95]){
    const y=x<0?2.366:1.836;
    F.box(env,[1.42,.016,.06],[x,y,-.47],F.mat(0xe7b27c,0,.65,{emissive:0xffb96c,emissiveIntensity:.8}));
    const strip=new THREE.PointLight(0xffc58b,.24,1.8,1.7);strip.position.set(x,y-.06,-.38);scene.add(strip);
  }
  F.box(env,[1.5,.065,.85],[-1.85,.77,2.0],oak);
  for (const x of [-2.45,-1.25]) for(const z of [1.7,2.30]) F.box(env,[.06,.75,.06],[x,.38,z],dark);
  F.box(env,[.47,.05,.43],[-1.27,.46,2.68],wood);
  F.box(env,[.47,.44,.05],[-1.27,.77,2.89],wood);
  for(const x of [-1.47,-1.07]) for(const z of [2.50,2.85])F.box(env,[.04,.45,.04],[x,.225,z],dark);
  F.plant(env,[-2.2,.81,2.1],.9);
  const steam = [],smoke=document.createElement("canvas");smoke.width=smoke.height=64;
  const sc=smoke.getContext("2d"),sglow=sc.createRadialGradient(32,32,0,32,32,32);
  sglow.addColorStop(0,"rgba(210,224,226,.6)");sglow.addColorStop(.4,"rgba(210,224,226,.18)");sglow.addColorStop(1,"rgba(210,224,226,0)");
  sc.fillStyle=sglow;sc.fillRect(0,0,64,64);
  const smokeTexture=new THREE.CanvasTexture(smoke);
  for(let i=0;i<14;i++){
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:smokeTexture,transparent:true,opacity:.15,depthWrite:false}));
    env.add(s);steam.push(s);
  }
  const human=PM_PEOPLE.hero(scene);
  human.traverse(o=>{
    if(o.material&&!Array.isArray(o.material))o.material.envMapIntensity=.25;
    if((o.userData.rvPart==="foot_l"||o.userData.rvPart==="foot_r")&&o.material&&o.material.color)o.material.color.setHex(0x050608);
    if(o.userData.rvPart==="head")o.receiveShadow=false;
  });
  // Stands clear of the lowered shelf's left end (board x from -.26). Facing straight ahead: the make4 checks
  // (head +82 mm, arm path +3 mm) were measured this way.
  human.position.set(-.45,.005,.10); human.rotation.y=0;
  // Face touch-ups only for the old rv human (v0.2.x sphere head with a hair cap); the v0.3 CC0 mannequin keeps its own head.
  const head=human.getObjectByName("head");
  const hairCap=head&&head.children.find(o=>o.isMesh&&o.geometry.type==="SphereGeometry"&&Math.abs((o.geometry.parameters||{}).radius-.097)<.00001);
  if(hairCap){
    const skin=head.children[0].material;
    hairCap.scale.set(1,1.05,1.08);hairCap.position.z=.008;
    for(const x of [-.030,.030]){
      const eye=F.mesh(head,new THREE.SphereGeometry(.004,8,6),F.mat(0x252a2a),[x,.015,.089]);eye.userData.rvPart="head";
      const brow=F.box(head,[.020,.003,.004],[x,.032,.086],F.mat(0x403a32));brow.userData.rvPart="head";
    }
    const nose=F.mesh(head,new THREE.SphereGeometry(.010,10,8),skin,[0,-.008,.094]);nose.scale.set(.7,1.2,1.25);nose.userData.rvPart="head";
  }
  const cup=new THREE.Group();cup.name="컵";scene.add(cup);
  const profile=[[.048,-.064],[.053,-.054],[.055,.06],[.048,.067],[.046,.06],[.045,-.051],[0,-.051]];
  F.mesh(cup,new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),40),ceramic);
  const handle=F.mesh(cup,new THREE.TorusGeometry(.032,.009,10,24),ceramic,[-.064,.003,0]);handle.scale.y=1.18;
  F.cyl(cup,.044,.002,[0,.055,0],F.mat(0x463b2e));
  let armState=0;
  KIT.process.part(cup,{name:"컵",state:()=>armState});
  KIT.process.part(human.getObjectByName("shoulder_r"),{name:"어깨",state:()=>armState});
  function person(t, lift, tremble=0, bend=0) {
    armState=lift;
    human.pose("stand",{t});human.visible=true;
    const spine=human.getObjectByName("spine"),neck=human.getObjectByName("neck");
    spine.rotation.x=bend;
    neck.rotation.z=-.06-.06*lift;neck.rotation.y=1.55+.10*lift;
    human.getObjectByName("shoulder_r").rotation.set(-.02+bend,0,.78+1.62*lift+tremble);
    human.getObjectByName("elbow_r").rotation.set(-.05,0,-.10);
    human.getObjectByName("wrist_r").rotation.z=-.25;
    human.getObjectByName("shoulder_l").rotation.x=-.10-.04*Math.sin(t*.9);
    human.updateMatrixWorld(true);
    // KIT's compatibility roots are direct children: propagate the edited spine/neck TRS.
    for(const [side,s] of [["l",-1],["r",1]]) {
      const target=spine.localToWorld(new THREE.Vector3(s*.205,.405,0));
      human.getObjectByName("shoulder_"+side).position.copy(human.worldToLocal(target));
    }
    const head=human.getObjectByName("head");
    head.position.copy(human.worldToLocal(neck.localToWorld(new THREE.Vector3(0,.155,0))));
    head.quaternion.copy(spine.quaternion).multiply(neck.quaternion);
    human.updateMatrixWorld(true);
  }
  function cupAtHand(toward = null, w = 0, extra = 0) {
    // Cup body goes just past the right hand's bounding box, on the side away from the body, so the
    // hand never sinks into it in any pose; the handle points away from the hand.
    const c=human.userData.contacts.hands[1].getWorldPosition(new THREE.Vector3());
    const box=new THREE.Box3();human.traverse(o=>{if(o.isMesh&&o.userData.rvPart==="hand_r")box.expandByObject(o);});
    const n=c.clone().sub(human.getObjectByName("spine").getWorldPosition(new THREE.Vector3()));n.y=0;
    if(n.lengthSq()<1e-8)n.set(1,0,0);n.normalize();
    if(toward&&w>0){n.lerp(new THREE.Vector3(...toward),w);n.y=0;n.normalize();}
    let far=0;for(const x of [box.min.x,box.max.x])for(const z of [box.min.z,box.max.z])far=Math.max(far,(x-c.x)*n.x+(z-c.z)*n.z);
    cup.position.copy(c).addScaledVector(n,far+.055+.006+extra*w);cup.position.y+=.030;
    cup.rotation.set(0,Math.atan2(n.z,-n.x),0);
  }
  function air(t) {
    steam.forEach((s,i)=>{
      const u=(t*.25+i/14)%1;
      s.position.set(-.54+.035*Math.sin(u*7+i),1.17+u*.53,-.44+.025*Math.cos(i+u*6));
      s.scale.setScalar(.045+Math.sin(Math.PI*u)*.095);
      s.material.opacity=.12*Math.sin(Math.PI*u);
    });
  }
  return {scene,human,cup,person,cupAtHand,air,env,atmos,glass,fill,kettle,shelf};
};
