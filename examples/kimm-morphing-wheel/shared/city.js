/* Dusk sky, inhabited skyline and motivated street lighting. */
(function () {
  function sky(scene) {
    const canvas=document.createElement("canvas");canvas.width=512;canvas.height=256;
    const g=canvas.getContext("2d"),gradient=g.createLinearGradient(0,0,0,256);
    for(const [at,color] of [[0,"#071221"],[.47,"#10233b"],[.5,"#94694d"],[.62,"#292e36"],[1,"#0c1520"]]) gradient.addColorStop(at,color);
    g.fillStyle=gradient;g.fillRect(0,0,512,256);
    const texture=new THREE.CanvasTexture(canvas);
    texture.mapping=THREE.EquirectangularReflectionMapping;
    scene.background=texture;
    scene.fog=new THREE.Fog(0x101b2a,16,48);
  }
  function skyline(env) {
    const {box,mat,mesh,rod}=WHEEL_STREET,rnd=KIT.rng(12083);
    const frames=mat(0x26313b,{metalness:.3,roughness:.55});
    const unlit=mat(0x14232d,{metalness:.18,roughness:.3});
    const lit=[0xd19a5c,0xb8864f,0xe2b877].map(color=>mat(color,{emissive:color,emissiveIntensity:.65,roughness:.4}));
    for(let i=0;i<10;i++) {
      const x=-13+i*3.2,h=3+(i%4)*1.3;
      box(env,[2.8,h,2.5],mat(i%2?0x3e4a56:0x4c5058),[x,h/2,-13]);
      for(const z of [-14.23,-11.77]) box(env,[2.92,.13,.13],frames,[x,h+.065,z]);
      for(const sx of [-1,1]) box(env,[.13,.13,2.5],frames,[x+sx*1.39,h+.065,-13]);
      for(let y=1;y<h;y+=.75)for(let k=0;k<3;k++) {
        const wx=x-.8+k*.8,on=rnd()<.4;
        box(env,[.46,.46,.04],frames,[wx,y,-11.735]);
        box(env,[.37,.36,.025],on?lit[Math.floor(rnd()*lit.length)]:unlit,[wx,y,-11.705]);
        if(on&&rnd()<.35) box(env,[.045,.36,.008],frames,[wx-.05,y,-11.687]);
      }
      const ac=mat(i%2?0x62666a:0x4d5862,{metalness:.45,roughness:.6});
      box(env,[.72,.34,.54],ac,[x-.5,h+.23,-12.6]);
      box(env,[.82,.045,.62],frames,[x-.5,h+.425,-12.6]);
      for(let j=0;j<6;j++) box(env,[.52,.016,.015],frames,[x-.5,h+.12+j*.04,-12.321]);
      const vent=mesh(env,new THREE.CylinderGeometry(.065,.065,.46,10),frames,[x+.7,h+.23,-13.3]);
      rod(env,[x+.7,h+.47,-13.3],[x+.93,h+.47,-13.3],frames,.067);
      vent.name="옥상 배기 덕트";
    }
  }
  function lamps(scene,env) {
    const {box,mat,rod,mesh}=WHEEL_STREET;
    const steel=mat(0x435663,{metalness:.65,roughness:.35});
    const diffuser=mat(0xf2cc93,{emissive:0xffb468,emissiveIntensity:1.4,roughness:.45});
    for(const x of [-1.9,-7]) {
      rod(env,[x,0,-3],[x,3.4,-3],steel,.045);
      rod(env,[x,3.4,-3],[x+.55,3.4,-3],steel,.035);
      box(env,[.62,.1,.28],steel,[x+.55,3.4,-3]);
      box(env,[.48,.018,.18],diffuser,[x+.55,3.342,-3]);
      const bulb=mesh(env,new THREE.SphereGeometry(.045,12,8),diffuser,[x+.55,3.32,-3]);
      bulb.castShadow=false;
      const glow=new THREE.PointLight(0xffc58b,.75,6,1.5);
      glow.position.set(x+.55,3.26,-3);scene.add(glow);
      const pool=new THREE.SpotLight(0xffc58b,2.2,8,.57,.8,1.3);
      pool.position.copy(glow.position);pool.target.position.set(x+1.7,.01,-.7);
      scene.add(pool,pool.target);
    }
  }
  window.WHEEL_CITY={sky,skyline,lamps};
})();
