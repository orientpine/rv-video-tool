/* Surface-following TRS garment. No matrix overrides; attach contracts each frame. */
window.SUIT = (human) => {
  const F=FILM,torso=human.getObjectByName("spine"),shoulder=human.getObjectByName("shoulder_r");
  const chest=torso.children.find(o=>o.isMesh&&o.userData.rvPart==="torso");
  const arm=shoulder.children.find(o=>o.isMesh&&o.userData.rvPart==="upperarm_r");
  const cap=shoulder.children.find(o=>o.isMesh&&o.geometry.type==="SphereGeometry");
  const profile=[[.128,0],[.139,.05],[.15,.16],[.187,.31],[.19,.38],[.165,.425],[.072,.45]];
  const vest=F.mesh(torso,new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r+.0007,y)),40),F.mat(0x263c43,0,.88,{map:F.texture("cloth",[2,2]),side:THREE.DoubleSide}));
  vest.scale.z=.63;vest.name="직물 조끼";
  const cuff=F.mesh(shoulder,new THREE.CylinderGeometry(.0576,.0576,.10,40,1,true),F.fabricMat(),[0,-.14,0]);cuff.name="어깨 보조 옷감";
  const bridge=F.mesh(shoulder,new THREE.SphereGeometry(1,32,20,0,Math.PI*2,0,Math.PI*.58),F.fabricMat(),[0,-.018,0]);
  bridge.scale.set(.0658,.0698,.0678);bridge.name="어깨 직물";
  vest.userData.rvPart="torso";cuff.userData.rvPart="upperarm_r";bridge.userData.rvPart="upperarm_r";
  // Fit to the measured body (rv v0.3 changed the human mesh): torso size in the spine frame, upper-arm radius in the
  // shoulder frame. The lathe profile is 0.19 m at its widest and 0.45 m tall; the cuff is 0.0576 m in radius.
  const localBox=(mesh,frame)=>{const b=new THREE.Box3();human.updateMatrixWorld(true);const inv=frame.matrixWorld.clone().invert();
    mesh.geometry.computeBoundingBox();const g=mesh.geometry.boundingBox,v=new THREE.Vector3();
    for(const x of [g.min.x,g.max.x])for(const y of [g.min.y,g.max.y])for(const z of [g.min.z,g.max.z])b.expandByPoint(v.set(x,y,z).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv));return b;};
  // v0.3 body: the lathe vest landed at the hip in stills (t57.6), so it stays hidden; the shoulder fabric is the robot.
  vest.visible=false;
  if(false&&chest){const b=localBox(chest,torso),sx=(b.max.x-b.min.x)/2+.008,sz=(b.max.z-b.min.z)/2+.008,h=b.max.y-b.min.y;
    vest.scale.set(sx/.19,Math.max(.6,h/.45),sz/.19);vest.position.set((b.max.x+b.min.x)/2,b.min.y,(b.max.z+b.min.z)/2);}
  if(arm){const b=localBox(arm,shoulder),r=Math.max(b.max.x-b.min.x,b.max.z-b.min.z)/2+.004;
    cuff.scale.set(r/.0576,1,r/.0576);bridge.scale.multiplyScalar(Math.max(1,r/.0576));}
  return {vest,cuff,bridge,set(u,t){
    for(const p of [cuff,bridge]){
      p.material.emissive.setHex(0x95682e);p.material.emissiveIntensity=.08+.16*u+.025*Math.sin(t*2);
    }
  }};
};
window.BULKY = (human) => {
  const F=FILM,torso=human.getObjectByName("spine"),metal=F.mat(0x566774,.7,.35),shell=F.mat(0x414a52,.3,.55);
  const pack=F.box(torso,[.38,.43,.18],[0,.24,-.20],shell);
  for(let i=0;i<8;i++)F.box(pack,[.32,.014,.025],[0,-.15+i*.04,-.10],metal);
  F.tube(torso,[[.16,.40,-.20],[.30,.47,-.10],[.30,.34,.02]],.023,F.mat(0x313a3c));
  for(const [side,s] of [["r",1],["l",-1]]){
    const shoulder=human.getObjectByName("shoulder_"+side),elbow=human.getObjectByName("elbow_"+side);
    const disk=F.cyl(shoulder,.105,.085,[s*.08,0,0],metal);disk.rotation.z=Math.PI/2;
    F.box(shoulder,[.055,.29,.10],[s*.10,-.15,0],shell);
    F.box(elbow,[.055,.24,.09],[s*.10,-.12,0],metal);
    const motor=F.cyl(elbow,.075,.085,[s*.10,0,0],shell);motor.rotation.z=Math.PI/2;
    for(const o of [disk,motor]) o.userData.rvPart=(o===disk?"upperarm_":"forearm_")+side;
    shoulder.children.forEach(o=>{if(o.isMesh&&!o.userData.rvPart)o.userData.rvPart="upperarm_"+side;});
    elbow.children.forEach(o=>{if(o.isMesh&&!o.userData.rvPart)o.userData.rvPart="forearm_"+side;});
  }
  torso.traverse(o=>{if(o.isMesh&&!o.userData.rvPart)o.userData.rvPart="torso";});
  return {pack};
};
