/* Lab architecture and reference-informed narrow continuous weaving machine. */
window.LAB = (R) => {
  const F=FILM, scene=F.room(R), env=new THREE.Group();scene.add(env);KIT.fx.env(env);
  const steel=F.mat(0xa5b2b3,.75,.32), dark=F.mat(0x37474e,.2,.6), mint=F.mat(0x6e9a85,.2,.55);
  F.box(env,[15,.08,15],[0,-.05,0],F.mat(0x444e4e,0,.8,{map:F.texture("tile",[10,10])}));
  F.box(env,[15,4,.1],[0,2,-3.2],F.mat(0x354c50));
  for(let i=-3;i<=3;i++){
    F.box(env,[.06,3.7,.12],[i*1.6,1.85,-3.1],steel);
    F.box(env,[1.45,.91,.03],[i*1.6,2.1,-3.03],F.mat(0x72969c,.2,.23,{transparent:true,opacity:.35}));
  }
  for(const y of [1.6,2.61])F.box(env,[12,.045,.10],[0,y,-3.1],steel);
  for (const x of [-3,3]) {
    F.box(env,[2.2,.07,.85],[x,.91,-2.2],dark);
    for(const dx of [-.90,.90])F.box(env,[.07,.88,.65],[x+dx,.44,-2.2],steel);
    for(let i=0;i<3;i++){
      F.box(env,[.6,.19,.68],[x-.68+i*.68,.66,-2.18],mint);
      F.box(env,[.25,.02,.025],[x-.68+i*.68,.67,-1.82],steel);
    }
    const scr=F.box(env,[.65,.4,.07],[x,1.3,-2.3],dark);
    F.box(scr,[.58,.33,.009],[0,0,.041],F.mat(0x315f69,.1,.5,{emissive:0x275c64,emissiveIntensity:.4}));
    for(let i=0;i<6;i++)F.box(scr,[.04,.03+i*.025,.008],[-.23+i*.08,-.08,.049],F.mat(0x99bcb0));
    F.cyl(env,.03,.2,[x,1.03,-2.3],steel);
  }
  // Shelving, sample reels, carts, cable trays and practical ceiling strips.
  for(let j=0;j<3;j++){
    F.box(env,[1.65,.045,.5],[-4.4,.55+j*.55,-1.5],steel);
    for(let i=0;i<5;i++){
      const spool=F.cyl(env,.09,.18,[-5+i*.29,.66+j*.55,-1.5],dark);
      for(const y of [-.10,.10])F.cyl(spool,.12,.02,[0,y,0],steel);
    }
  }
  for(const x of [-5.24,-3.56])F.box(env,[.045,2.1,.045],[x,1.05,-1.5],steel);
  F.tube(env,[[-3,.15,-2],[-2.8,.04,-1.4],[-1.9,.04,-1.3],[-1.7,.18,-.7]],.018,dark);
  for(const x of [-2.5,1.8]){
    F.box(env,[1.8,.06,.25],[x,3.3,-.1],F.mat(0xabbcbb,.3,.4,{emissive:0xd9e6da,emissiveIntensity:.7}));
    const l=new THREE.PointLight(0xd4e7e5,.5,6,1.5);l.position.set(x,3.1,-.1);scene.add(l);
  }
  F.tube(env,[[-5,2.95,-3],[-2,2.95,-3],[2,2.95,-3],[5,2.95,-3]],.035,steel);
  for(const x of [-1.8,1.8]) {
    F.box(env,[.035,.008,3],[x,.001,.2],F.mat(0xbaa365));
  }
  F.plant(env,[4.2,.96,-2.1],.8);
  // Foreground sample trolley.
  F.box(env,[.85,.05,.55],[-2.3,.67,1.75],dark);
  F.box(env,[.85,.04,.55],[-2.3,.15,1.75],steel);
  for(const x of [-2.67,-1.93])for(const z of [1.53,1.97]){
    F.cyl(env,.018,.62,[x,.35,z],steel);
    const wheel=F.cyl(env,.055,.035,[x,.06,z],dark);wheel.rotation.z=Math.PI/2;
  }
  for(let i=0;i<4;i++)F.cyl(env,.065,.12,[-2.55+i*.16,.755,1.75],mint);
  return {scene,env,steel,dark,mint};
};

window.WEAVER = (W) => {
  const F=FILM,g=new THREE.Group();W.scene.add(g);const {steel,dark,mint}=W;
  F.box(g,[1.48,.65,1.28],[0,.34,0],mint);
  for(const x of [-.78,.78]) {
    F.box(g,[.16,1.18,1.62],[x,.80,.02],mint);
    for(const y of [.35,1.25])F.cyl(g,.026,.012,[x,y,.84],dark).rotation.x=Math.PI/2;
    F.box(g,[.07,1.2,.07],[x,1.8,-.50],steel);
  }
  F.box(g,[1.65,.07,.07],[0,2.37,-.50],mint);
  const rollers=[];
  for(const [z,y,r] of [[-.62,1.26,.11],[.74,1.13,.09],[.76,.84,.12]]) {
    const roll=F.cyl(g,r,1.57,[0,y,z],steel);roll.geometry.rotateZ(Math.PI/2);rollers.push(roll);
    for(let k=0;k<3;k++){
      const a=k*Math.PI*2/3;
      const tread=F.box(roll,[1.38,.012,.018],[0,r*Math.cos(a),r*Math.sin(a)],dark);tread.rotation.x=a;
    }
    for(const x of [-.80,.80]){const hub=F.cyl(g,r*1.3,.07,[x,y,z],dark);hub.rotation.z=Math.PI/2;}
  }
  const cloth=F.mesh(g,new THREE.PlaneGeometry(.48,1.05),F.fabricMat(),[0,1.17,.20]);cloth.rotation.x=-Math.PI/2;cloth.name="근육옷감";
  const apron=F.mesh(g,new THREE.PlaneGeometry(.48,.57),cloth.material,[0,.84,.86]);
  for(let i=0;i<25;i++){
    const x=-.24+i*.02;
    F.tube(g,[[x,1.28,-.66],[x,1.31,-.36],[x,1.18,-.19],[x,1.18,.2]],.0025,steel);
  }
  const heddles=[new THREE.Group(),new THREE.Group()];
  heddles.forEach((h,j)=>{
    g.add(h);h.position.set(0,1.44,-.28-j*.11);
    for(const y of [-.15,.15])F.box(h,[.67,.025,.02],[0,y,0],dark);
    for(let i=0;i<14;i++)F.box(h,[.004,.29,.004],[-.29+i*.045,0,0],steel);
  });
  const reed=new THREE.Group();g.add(reed);reed.position.set(0,1.21,-.05);
  for(const y of [-.07,.07])F.box(reed,[.64,.025,.035],[0,y,0],dark);
  for(let i=0;i<38;i++)F.box(reed,[.003,.13,.015],[-.29+i*.016,0,0],steel);
  const shuttle=F.box(g,[.18,.04,.05],[0,1.19,-.05],F.mat(0xb5a279,.45,.3));shuttle.name="직조기 북";
  const motor=F.box(g,[.30,.28,.35],[-.95,1.17,-.37],mint);
  for(let i=0;i<7;i++)F.box(motor,[.012,.20,.39],[-.13+i*.042,0,0],steel);
  F.tube(g,[[-.9,1.1,-.5],[-1,1.0,-.7],[-.8,.2,-.9],[-1.3,.04,-.8]],.018,dark);
  for(let i=0;i<3;i++)F.cyl(g,.035,.025,[.77,1.43,.35+i*.13],F.mat(i===0?0x9e443c:0x5d9775)).rotation.x=0;
  return {g,cloth,apron,rollers,heddles,reed,shuttle};
};

window.MACRO = (W) => {
  const F=FILM,g=new THREE.Group();g.position.set(4.0,1.25,0);W.scene.add(g);
  const backing=F.mesh(g,new THREE.PlaneGeometry(3.0,2.3),F.mat(0x1b2326,0,.95),[.25,0,-.65]);
  backing.castShadow=false;
  // The enlarged strip emerges from the same visible take-up assembly.
  const roller=F.cyl(g,.10,1.38,[0,.64,0],W.steel);roller.geometry.rotateZ(Math.PI/2);
  for(let k=0;k<3;k++){
    const a=k*Math.PI*2/3;
    const tread=F.box(roller,[1.18,.011,.016],[0,.1*Math.cos(a),.1*Math.sin(a)],W.dark);tread.rotation.x=a;
  }
  for(const x of [-.73,.73]){
    F.box(g,[.07,1.65,.08],[x,-.09,-.09],W.dark);
    F.box(g,[.09,.19,.20],[x,.64,0],W.steel);
    F.cyl(g,.037,.035,[x,.64,.12],W.dark).rotation.x=Math.PI/2;
  }
  F.box(g,[1.52,.07,.14],[0,-.86,-.09],W.dark);
  const coils=new THREE.Group();g.add(coils);coils.name="옷감";coils.position.set(0,.59,.10);
  const wiremat=F.mat(0xaab4b6,.75,.36,{emissive:0xb07435,emissiveIntensity:0});
  const yarn=F.mat(0xab9876,0,.9);
  for(let j=0;j<32;j++){
    const x=-.5425+j*.035,pts=[];
    for(let i=0;i<=864;i++){
      const u=i/864,a=u*Math.PI*2*72;
      pts.push([x+.016*Math.cos(a),-u*1.16,.016*Math.sin(a)]);
    }
    const wire=F.tube(coils,pts,.0028,wiremat.clone(),864);
    const materials=Array.from({length:4},()=>wiremat.clone());
    const count=wire.geometry.index.count/4;
    wire.geometry.clearGroups();
    for(let k=0;k<4;k++)wire.geometry.addGroup(k*count,count,k);
    wire.material=materials;wire.userData.coilIndex=j;
    F.tube(coils,[[x,-.002,0],[x,-1.158,0]],.004,yarn);
  }
  // Fine weft alternates in front of and behind each silver coil column.
  for(let i=0;i<46;i++){
    const pts=[];
    for(let j=0;j<=128;j++){
      const x=-.5585+j*1.117/128;
      pts.push([x,-.016-i*.025,.020*Math.cos((j/4+i)*Math.PI)]);
    }
    F.tube(coils,pts,.0014,yarn,192);
  }
  // Magnifier: one hair is 4x thicker than the wire that forms the coil,
  // not 4x thicker than the entire spring's outside diameter.
  const comparison=new THREE.Group();g.add(comparison);comparison.position.set(1.04,.09,.14);
  F.mesh(comparison,new THREE.CircleGeometry(.43,64),F.mat(0x252f32,.05,.8),[0,0,-.06]);
  F.mesh(comparison,new THREE.TorusGeometry(.44,.012,10,64),W.steel);
  F.box(comparison,[.07,.23,.035],[.31,-.40,0],W.dark).rotation.z=-.7;
  const hair=F.tube(comparison,[[.13,-.415,0],[.145,0,0],[.13,.415,0]],.030,F.mat(0x6c5037,0,.75));
  const points=[];
  for(let i=0;i<=160;i++){
    const u=i/160,a=u*Math.PI*16;
    points.push([-.15+.0325*Math.cos(a),-.19+u*.43,.0325*Math.sin(a)]);
  }
  const strand=F.tube(comparison,points,.0075,wiremat,240);
  F.tube(comparison,[[-.1175,-.30,0],[-.1175,-.19,0]],.0075,wiremat);
  const core=F.tube(comparison,[[-.15,-.19,0],[-.15,.24,0]],.024,yarn);
  return {g,coils,wiremat,hair,strand,core,comparison,roller,backing};
};

window.TESTRIG = (W) => {
  const F=FILM,g=new THREE.Group();W.scene.add(g);const {steel,dark}=W;
  F.box(g,[1.65,.12,1.12],[0,.10,0],dark);
  for(const x of [-.68,.68]){
    F.box(g,[.12,2.55,.18],[x,1.40,-.08],steel);
    F.box(g,[.025,2.30,.03],[x,1.4,.025],dark);
    for(let i=0;i<17;i++)F.box(g,[.048,.004,.005],[x, .4+i*.125,.04],F.mat(0xabb9b7));
    for(const z of [-.38,.38])F.cyl(g,.022,.04,[x,.18,z],steel);
  }
  F.box(g,[1.55,.16,.32],[0,2.63,-.08],dark);
  const top=F.box(g,[.40,.13,.18],[0,2.43,.0],steel);
  for(const x of [-.15,.15])F.cyl(top,.024,.02,[x,0,.10],dark).rotation.x=Math.PI/2;
  const fabric=F.mesh(g,new THREE.PlaneGeometry(.27,1),F.fabricMat(),[0,1.93,.04]);fabric.name=" 옷감";
  const load=new THREE.Group();g.add(load);load.name="추";
  F.box(load,[.40,.12,.18],[0,.35,0],steel);
  F.tube(load,[[0,.29,0],[0,.16,0]],.025,steel);
  for(let i=0;i<5;i++){
    const plate=F.cyl(load,.29,.048,[0,-.12+i*.063,0],F.mat(0x29353a,.75,.32));
    F.mesh(plate,new THREE.TorusGeometry(.255,.009,8,48),steel,[0,.025,0]).rotation.x=Math.PI/2;
    F.mesh(plate,new THREE.TorusGeometry(.14,.006,8,48),steel,[0,.025,0]).rotation.x=Math.PI/2;
  }
  F.cyl(load,.055,.41,[0,.02,0],steel);
  const led=F.cyl(g,.028,.015,[.48,2.64,.10],F.mat(0x7ba895,0,.5,{emissive:0x5bdbac,emissiveIntensity:.6}));
  led.rotation.x=Math.PI/2;
  F.tube(g,[[.15,2.48,.07],[.4,2.50,.07],[.7,2.3,-.12],[1,.8,-.12],[1.5,.8,-.05]],.009,F.mat(0x874d38));
  F.box(g,[.42,.35,.32],[1.30,.81,-.05],dark);
  F.box(g,[.29,.12,.01],[1.30,.88,.116],F.mat(0x396265,0,.5,{emissive:0x315653,emissiveIntensity:.4}));
  return {g,load,fabric,led};
};
