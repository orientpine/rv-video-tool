"""Shared browser-side recognition of pre-contract, primitive human figures."""

PERSON_NAME = r"/operator|driver|person|human|worker|man\b|운전자|사람/i"

LEGACY_HUMAN = r"""
const isLegacyHuman = g => {
  if(!g.isGroup)return false;
  for(let p=g;p;p=p.parent)if(p.userData.rvHuman)return false;
  // A heap of soil/load (container bed: wall boxes + half-sphere load mesh) is not a head.
  const loose=/soil|load|grain|dirt|heap|pile|흙|모래|더미/i, full=c=>{const q=c.geometry.parameters||{};
    return (q.phiLength??Math.PI*2)>=Math.PI*2-1e-3&&(q.thetaLength??Math.PI)>=Math.PI-1e-3;};
  if(g.children.some(c=>c.isMesh&&loose.test(c.name||'')))return false;
  const ms=g.children.filter(c=>c.isMesh), heads=ms.filter(c=>c.geometry.type==='SphereGeometry'&&full(c));
  const bodies=ms.filter(c=>['CapsuleGeometry','BoxGeometry'].includes(c.geometry.type));
  if(heads.length!==1 || !bodies.length || ms.length!==heads.length+bodies.length)return false;
  // Preserve the original KIT figure detector, including its single material.
  if(g.children.length===6 && bodies.every(c=>c.geometry.type==='CapsuleGeometry') &&
    new Set(ms.map(c=>c.material)).size===1)return true;
  // Home-made seated drivers often have only a head and torso. Their local up
  // can be Y or Z; require the sphere to sit above a body, not beside a joint.
  const box=c=>{
    if(!c.geometry.boundingBox)c.geometry.computeBoundingBox();
    if(c.matrixAutoUpdate)c.updateMatrix();
    return c.geometry.boundingBox.clone().applyMatrix4(c.matrix);
  };
  const head=box(heads[0]), size=head.getSize(new THREE.Vector3()), centre=head.getCenter(new THREE.Vector3());
  return bodies.some(c=>{
    const body=box(c), extent=body.getSize(new THREE.Vector3());
    return ['y','z'].some(up=>{
      const across=up==='y'?['x','z']:['x','y'];
      return extent[up]>=size[up]*.75 && head.min[up]>=body.getCenter(new THREE.Vector3())[up] &&
        centre[up]>=body.max[up] && head.min[up]-body.max[up]<=size[up] &&
        across.every(k=>centre[k]>=body.min[k]-size[k]*.5 && centre[k]<=body.max[k]+size[k]*.5);
    });
  });
};
"""

HOMEMADE_HUMAN = r"""
const humanVisible = o => {
  for(let p=o;p;p=p.parent)if(!p.visible)return false;
  return !o.isMesh || (Array.isArray(o.material)?o.material:[o.material])
    .some(m=>m.visible&&(!m.transparent||m.opacity>0));
};
const insideRvHuman = o => {
  for(let p=o;p;p=p.parent)if(p.userData.rvHuman)return true;
  return false;
};
const humanMeshes = root => {
  const out=[];root.traverse(o=>{
    if(o.isMesh&&humanVisible(o)&&!insideRvHuman(o))out.push(o);
  });return out;
};
const isHomemadeHuman = g => {
  if(g.isScene||!humanVisible(g)||insideRvHuman(g))return false;
  let kit=false;g.traverse(o=>{if(o.userData.rvHuman)kit=true;});if(kit)return false;
  const meshes=humanMeshes(g);if(!meshes.length||meshes.length>40)return false;
  g.updateWorldMatrix(true,true);
  const boxes=meshes.map(o=>{
    if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
    return o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
  });
  // A limb has one long axis; a thin joint cap has two wide axes.
  const elongated=meshes.map(o=>{
    const d=o.geometry.boundingBox.getSize(new THREE.Vector3()).toArray().sort((a,b)=>a-b);
    return d[2]/d[1]>=2.5;
  });
  const roundish=meshes.map(o=>{
    const d=o.geometry.boundingBox.getSize(new THREE.Vector3()).toArray();
    return Math.max(...d)/Math.min(...d)<=1.35;
  });
  // A ball: sphere-like geometry that is still round in world space (an egg-scaled sphere is no ball).
  const balls=meshes.map((o,i)=>{
    if(!/^(Sphere|Icosahedron|Dodecahedron|Octahedron)Geometry$/.test(o.geometry.type))return 0;
    const d=boxes[i].getSize(new THREE.Vector3()).toArray();
    return Math.max(...d)/Math.min(...d)<=1.35?Math.max(...d):0;
  });
  const ancestor=(a,b)=>{for(let p=b;p;p=p.parent)if(p===a)return true;return false;};
  const separateLimbs=(a,b)=>{
    const x=meshes[a.j].parent,y=meshes[b.j].parent;
    return x===y||(!ancestor(x,y)&&!ancestor(y,x));
  };
  const bounds=new THREE.Box3();boxes.forEach(b=>bounds.union(b));
  const size=bounds.getSize(new THREE.Vector3()), legacy=isLegacyHuman(g);
  return ['y','z'].some(up=>{
    const height=size[up];if(height<.3||height>2.5)return false;
    return boxes.some((head,i)=>{
      const extent=head.getSize(new THREE.Vector3()), lengths=extent.toArray();
      const diameter=Math.max(...lengths), centre=head.getCenter(new THREE.Vector3());
      if(!roundish[i]||diameter/Math.min(...lengths)>1.35||diameter<height*.08||diameter>height*.25||
        centre[up]<bounds.max[up]-height*.2)return false;
      // A ball-and-stick model: another ball of about the head's size joined to it by a stick (one long part
      // touching both). Hands and joints hang off limbs, and a snowman has no stick between its balls.
      const stick=j=>elongated.some((e,k)=>e&&k!==i&&k!==j&&boxes[k].intersectsBox(boxes[i])&&boxes[k].intersectsBox(boxes[j]));
      if(balls.some((b,j)=>j!==i&&b>=diameter*.5&&stick(j)))return false;
      const below=boxes.map((box,j)=>({box,j,centre:box.getCenter(new THREE.Vector3())}))
        .filter(b=>b.j!==i&&b.centre[up]<head.min[up]);
      if(!below.length)return false;
      // The torso and its limbs must be separate parts. A robot link's
      // co-located casing is not a torso with that same link as a limb.
      return legacy||below.some(body=>{
        const across=['x','y','z'].filter(axis=>axis!==up);
        if(body.box.max[up]>centre[up]||
          !across.every(axis=>centre[axis]>=body.box.min[axis]&&centre[axis]<=body.box.max[axis]))return false;
        const limbs=below.filter(limb=>limb.j!==body.j&&elongated[limb.j]&&
          limb.centre[up]<body.centre[up]&&!body.box.containsPoint(limb.centre));
        return limbs.some((a,j)=>limbs.slice(j+1).some(b=>separateLimbs(a,b)));
      });
    });
  });
};
const homemadeHumans = scene => {
  const matches=new Map();
  scene.traverse(o=>{
    if(isHomemadeHuman(o)||(humanVisible(o)&&isLegacyHuman(o)&&humanMeshes(o).length))matches.set(o,'shape');
    else if(!o.isScene&&humanVisible(o)&&!insideRvHuman(o)&&PERSON_NAME.test(o.name)&&humanMeshes(o).length)
      matches.set(o,'name');
  });
  return [...matches].filter(([o])=>{
    for(let p=o.parent;p;p=p.parent)if(matches.has(p))return false;
    return true;
  }).map(([o,via])=>({o,via}));
};
"""
