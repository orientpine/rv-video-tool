"""Browser frame sampling and targeted mutations for the human checker."""
from human_detection import HOMEMADE_HUMAN, LEGACY_HUMAN, PERSON_NAME

FRAME = "([t,mutation])=>{\nconst PERSON_NAME=" + PERSON_NAME + ";\n" + LEGACY_HUMAN + HOMEMADE_HUMAN + r"""
 const scenes=[...(window.__frameScenes||[])], humans=[];
 for(const scene of scenes)scene.traverse(o=>{
   if(o.userData.rvHuman&&humanVisible(o)){
     let mesh=false;o.traverse(m=>{if(m.isMesh&&humanVisible(m))mesh=true;});
     if(mesh)humans.push(o);
   }
 });
 const order=TIMELINE.order||Object.keys(TIMELINE.modules);
 const sceneName=order.find(n=>t<TIMELINE.modules[n].start+TIMELINE.modules[n].duration)||order.at(-1);
 const expected=window.SCENE_SITE?.[sceneName]||window.SITE;
 if(['homemade','site'].includes(mutation)&&!window.__humanMutation&&scenes.length){
   const scene=scenes[0], camera=window.__humanCameras.get(scene);
   let target=mutation==='site'?humans[0]:null;
   if(target){
     target.userData.site=expected==='lab'?'construction':'lab';
   }else{
     if(mutation==='homemade'){
       target=new THREE.Group();
       const mat=new THREE.MeshStandardMaterial({color:0x4b6988});
       const add=(geometry,x,y)=>{
         const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,0);target.add(m);
       };
       add(new THREE.IcosahedronGeometry(.13,1),0,1.57);
       add(new THREE.CylinderGeometry(.16,.14,.58,12),0,1.1);
       for(const x of [-.24,.24])add(new THREE.CylinderGeometry(.045,.045,.55,12),x,1.08);
       for(const x of [-.1,.1])add(new THREE.CylinderGeometry(.06,.06,.8,12),x,.4);
       scene.add(target);
     }else{
       target=KIT.fx.human(scene,1.7,{site:expected==='lab'?'construction':'lab'});
       target.name='rv_site_mutation';target.visible=true;humans.push(target);
     }
     camera.updateWorldMatrix(true,false);
     const position=camera.getWorldPosition(new THREE.Vector3())
       .addScaledVector(camera.getWorldDirection(new THREE.Vector3()),4);
     position.y-=.85;target.position.copy(scene.worldToLocal(position));
   }
   window.__humanMutation=target.uuid;
 }
 const label=o=>o.name||'#'+o.uuid.slice(0,8), findings=[], homemade=[];
 for(const scene of scenes){
   for(const {o,via} of homemadeHumans(scene)){
     homemade.push(o.uuid);
     findings.push({kind:'homemade',uuid:o.uuid,name:label(o),via,legacy:isLegacyHuman(o)});
   }
 }
 for(const o of humans){
   if(!expected)findings.push({kind:'site',uuid:o.uuid,name:label(o),undeclared:true});
   else if(o.userData.site!==expected)
     findings.push({kind:'site',uuid:o.uuid,name:label(o),actual:o.userData.site,expected});
 }
 return {scene:sceneName,humans:humans.map(o=>o.uuid),homemade,findings,mutation:window.__humanMutation};
}"""
