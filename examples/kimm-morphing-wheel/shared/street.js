/* Original dusk street. SI metres; the entrance threshold starts at x=0. */
(function () {
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({color, roughness: .72, ...extra});
  function mesh(parent, geometry, material, position = [0, 0, 0]) {
    const o = new THREE.Mesh(geometry, material);
    o.position.set(...position); o.castShadow = o.receiveShadow = true; parent.add(o); return o;
  }
  const box = (p, size, m, at) => mesh(p, new THREE.BoxGeometry(...size), m, at);
  function rod(parent, a, b, m, radius = .018) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
    const o = mesh(parent, new THREE.CylinderGeometry(radius, radius, d.length(), 10), m);
    o.position.copy(A).add(B).multiplyScalar(.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return o;
  }
  function texture(kind) {
    const c = document.createElement("canvas"); c.width = c.height = 512;
    const g = c.getContext("2d"), rnd = KIT.rng(kind === "brick" ? 92 : 21);
    g.fillStyle = kind === "brick" ? "#72655f" : "#72777b"; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 12000; i++) {
      const n = Math.floor(80 + rnd() * 110);
      g.fillStyle = `rgba(${n},${n},${n},.15)`; g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1);
    }
    g.strokeStyle = kind === "brick" ? "#4a4440" : "#555c61"; g.lineWidth = 3;
    const height = kind === "brick" ? 64 : 256;
    for (let y = 0; y <= 512; y += height) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke();
      for (let x = (y / height % 2) * 64; x < 512; x += kind === "brick" ? 128 : 256) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + height); g.stroke();
      }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(kind === "brick" ? 3 : 8, kind === "brick" ? 2 : 8); t.anisotropy = 8; return t;
  }
  function plant(p, x, z, tree = false) {
    const leaf = mat(0x354d3c), dark = mat(0x24382f), trunk = mat(0x584b3d);
    if (!tree) {
      mesh(p, new THREE.CylinderGeometry(.3, .24, .43, 8), mat(0x646463), [x, .215, z]);
      mesh(p, new THREE.CylinderGeometry(.27, .27, .02, 12), mat(0x272b24), [x, .44, z]);
    }
    const h = tree ? 2.2 : .7;
    rod(p, [x, tree ? 0 : .44, z], [x, h, z], trunk, tree ? .075 : .025);
    if (tree) for (let i=0;i<5;i++) {
      const a=i*Math.PI*.4;
      rod(p,[x,1.25+i*.14,z],[x+Math.cos(a)*.65,2.3+i*.1,z+Math.sin(a)*.65],trunk,.028);
    }
    const rnd = KIT.rng(Math.round((x + z + 50) * 77));
    for (let i = 0; i < (tree ? 25 : 15); i++) {
      const a = rnd() * 6.28, r = rnd() * (tree ? .8 : .3);
      const o = mesh(p, new THREE.IcosahedronGeometry(tree ? .38 : .16, 1), i % 2 ? leaf : dark,
        [x + Math.cos(a) * r, h + rnd() * (tree ? .8 : .32), z + Math.sin(a) * r]);
      o.scale.y = tree ? .8 : 1.5; o.rotation.set(rnd(), rnd(), rnd());
    }
  }
  function create(renderer, workshop = false, atmosOpts = {}) {
    const scene = new THREE.Scene(), env = new THREE.Group(); scene.add(env);
    scene.background = new THREE.Color(workshop ? 0x111b25 : 0x182b40);
    scene.fog = new THREE.Fog(scene.background, 12, 38);
    const atmos = workshop ? null : PM_ATMOS.gold(scene, renderer, atmosOpts);
    if (workshop) scene.add(new THREE.HemisphereLight(0xb0c9e7, 0x30333a, .35));
    if (workshop) {
    const key = new THREE.DirectionalLight(0xffc38e, .85); key.position.set(-3, 6, 4);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {left: -7, right: 7, top: 7, bottom: -7, near: .2, far: 24});
    key.shadow.bias = -.0004; scene.add(key);
    const rim = new THREE.DirectionalLight(0x9dc8f4, .5); rim.position.set(4, 4, -4); scene.add(rim);
    }
    if (workshop) {
    const reflection=new THREE.Scene();reflection.background=new THREE.Color(0x15212b);
    for(const [position,color] of [[[0,4,2],0xeac8a0],[[-4,2,1],0x7698bc],[[4,2,-1],0xc59b6c]]) {
      const panel=new THREE.Mesh(new THREE.PlaneGeometry(4,2),new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(workshop?.45:1),side:THREE.DoubleSide}));
      panel.position.set(...position);panel.lookAt(0,1,0);reflection.add(panel);
    }
    const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(reflection,.05).texture;pmrem.dispose();
    }
    const steel = mat(0x61727c, {metalness: .65, roughness: .3}), stone = mat(0x777b7d);
    const floor = workshop ? box(env, [24, .16, 24], mat(0x8a7c70, {map: texture("tile"), roughness: .5}), [0, -.08, 0])
      : box(env, [80, .16, 17], new THREE.MeshStandardMaterial({map: (() => { const t = PM_BACK.pavingTex(); t.repeat.set(80 / 6, 17 / 6); return t; })(), roughness: .62}), [0, -.08, 3.6]);
    floor.name = "보도 바닥";
    const step = box(env, [3.2, .18, 3.4], mat(0x454b50, {map: texture("tile")}), [1.6, .09, 0]);
    step.name = "입구 턱";
    box(env, [.025, .009, 3.4], mat(0x929083, {metalness: .25}), [.015, .183, 0]);
    const door = new THREE.Group(); scene.add(door);
    if (workshop) {
      env.remove(step); box(env, [12, 5, .2], mat(0x404c56, {map: texture("brick")}), [0, 2, -2]);
      box(env, [3.7, .14, 1.5], mat(0x24343f, {metalness: .1,roughness:.88}), [0, .15, 0]);
      for (const x of [-1.65, 1.65]) for (const z of [-.6, .6]) box(env, [.08, .7, .08], steel, [x, -.25, z]);
      for (let i = 0; i < 3; i++) {
        box(env, [3, .06, .4], steel, [-.9, .9 + .55 * i, -1.7]);
        for (let j = 0; j < 7; j++) box(env, [.18 + j % 2 * .05, .22, .24], mat(j % 2 ? 0x77818a : 0x75634f), [-2.1 + j * .35, 1.04 + .55 * i, -1.68]);
      }
      for (const x of [-2, 2]) {
        rod(env, [x, .3, -.4], [x, 1.8, -.8], steel, .025);
        box(env, [.5, .05, .18], mat(0xffdd9c, {emissive: 0xffbf70, emissiveIntensity: 1.1}), [x, 1.8, -.8]);
        const l = new THREE.PointLight(0xffd19b, .55, 5); l.position.set(x, 1.65, -.6); scene.add(l);
      }
      for (let i = 0; i < 4; i++) box(env, [.5, .05, .02], steel, [.8 + i * .23, .235, -.3 + i * .12]).rotation.y = i * .4;
      // A working bench: drawers, vise, tool hooks, meter and an articulated task lamp.
      for (let i=0;i<3;i++) {
        box(env,[.82,.13,.55],mat(0x3a474e,{metalness:.4}),[-1.25,-.04-i*.17,.12]);
        rod(env,[-1.48,-.04-i*.17,.41],[-1.04,-.04-i*.17,.41],steel,.012);
      }
      box(env,[.23,.12,.22],steel,[1.42,.29,-.3]);
      box(env,[.3,.06,.07],mat(0x3c505c),[1.42,.38,-.3]);
      rod(env,[1.24,.32,-.3],[1.6,.32,-.3],steel,.018);
      rod(env,[1.61,.22,-.3],[1.61,.42,-.3],steel,.012);
      const peg=box(env,[1.6,1.1,.05],mat(0x344653),[1.0,1.35,-1.85]);
      for (let i=0;i<6;i++) for(let j=0;j<4;j++) mesh(env,new THREE.CylinderGeometry(.009,.009,.012,6),mat(0x192831),[.4+i*.23,1.0+j*.22,-1.81]).rotation.x=Math.PI/2;
      for(let i=0;i<5;i++) {
        const x=.48+i*.24;
        rod(env,[x,1.0,-1.77],[x,1.55,-1.77],steel,.016);
        const jaw=mesh(env,new THREE.TorusGeometry(.055,.012,6,18,Math.PI*1.5),steel,[x,1.57,-1.77]); jaw.rotation.z=-.7;
      }
      box(env,[.36,.26,.22],mat(0x4e675f),[1.32,.36,-.68]);
      box(env,[.21,.11,.012],mat(0x4e9298,{emissive:0x225963,emissiveIntensity:.45}),[1.32,.4,-.562]);
      rod(env,[-1.5,.23,.1],[-1.42,1.35,-.24],steel,.025);
      rod(env,[-1.42,1.35,-.24],[-.55,1.62,.5],steel,.02);
      const hood=mesh(env,new THREE.ConeGeometry(.2,.22,24,1,true),mat(0x395869,{metalness:.5}),[-.55,1.58,.5]);
      hood.rotation.x=.55;
      const pool=new THREE.SpotLight(0xffd7a0,1.3,5,.62,.65,1.3);
      pool.position.set(-.55,1.55,.5);pool.target.position.set(-.18,.75,0);scene.add(pool,pool.target);
      const bounce=new THREE.PointLight(0xb7d9eb,.4,3);bounce.position.set(.35,1.05,1.3);scene.add(bounce);
      peg.name="공구 걸이판";
    } else {
      const brick = mat(0x655951, {map: texture("brick"), bumpMap: texture("brick"), bumpScale: .013});
      for (const z0 of [-6.5, 1.7]) PM_BACK.facade(env, {origin: [3.08, 0, z0], facing: -Math.PI / 2, width: 4.8, floors: 1, floorH: 4.8, parapet: 0, shop: true, kind: "brick", seed: 11 + z0, pipe: false, awning: 0x5a3326});
      PM_BACK.facade(env, {origin: [3.08, 4.8, -6.5], facing: -Math.PI / 2, width: 13, floors: 2, kind: "brick", seed: 21, balcony: true, ac: true});
      PM_BACK.facade(env, {origin: [3.08, 0, 6.5], facing: -Math.PI / 2, width: 12, floors: 3, kind: "panel", seed: 31, shop: true, frame: 0x1e2226, awning: 0x2c3e4a});
      for (const [x0, w, fl, kind, seed, aw] of [[-36, 8, 5, "stucco", 41, 0x7a4a2c], [-28, 7, 3, "brick", 42, 0x3b4a3a], [-12, 6.5, 4, "stone", 44, 0x6b3a2c], [-5.5, 8.5, 5, "brick", 45, 0x4a3a5a], [3, 7, 3, "stucco", 46, 0x7a4a2c], [10, 9, 6, "panel", 47, 0x2c3e4a]])
        PM_BACK.facade(env, {origin: [x0, 0, -11.95], facing: 0, width: w, floors: fl, kind, seed, shop: true, balcony: fl > 3, ac: true, awning: aw, castShadow: false});
      PM_BACK.farCity(env); PM_BACK.props(env); PM_BACK.ground(env);
      box(env, [.24, 1.9, 3.4], brick, [3.2, 3.65, 0]);
      box(env, [1.05, .12, 4.0], steel, [2.8, 2.82, 0]);
      box(env, [.09, .38, 2.2], mat(0x364951), [3.04, 3.15, 0]);
      box(env, [3.2, .08, 3.25], mat(0x7b6b57), [4.7, .18, 0]);
      box(env, [.1, 2.8, 3.2], mat(0x5d4031), [5.2, 1.6, 0]);
      for (const z of [-1.57,1.57]) box(env,[2.1,2.65,.08],mat(0x624c3b),[4.05,1.5,z]);
      const warm = mat(0xf3c790, {emissive: 0xffb66c, emissiveIntensity: .65});
      for (const z of [-1.65, 0, 1.65]) box(env, [.11, 2.6, .055], steel, [3.02, 1.48, z]);
      box(env, [.11, .055, 3.4], steel, [3.02, 2.77, 0]);
      for (const z of [-.82, .82]) {
        const pane = box(door, [.028, 2.5, 1.56], mat(0x8da2a0, {metalness: .25, roughness: .13, transparent: true, opacity: .27}), [3.0, 1.48, z]);
        pane.castShadow = false;
        rod(door, [2.97, .95, z + .55], [2.97, 1.48, z + .55], steel, .018);
      }
      for (const z of [-1.1, 1.1]) box(env, [.08, 1.8, .04], warm, [5.94, 1.6, z]);
      const glow = new THREE.PointLight(0xffa158, 1.8, 5, 1.5); glow.position.set(3.6, 2.0, 0); scene.add(glow);
      const porch = new THREE.PointLight(0xffd5a0, .65, 5); porch.position.set(2.45, 2.65, .6); scene.add(porch);
      plant(env, 1.7, -2.2); plant(env, 1.7, 2.2);
      for (const [x, h, sd] of [[-10.2, 5.4, 7], [-6.4, 5.0, 8], [-2.7, 5.6, 9]]) PM_BACK.tree(env, x, -3.85, h, sd);
      box(env, [80, .12, .16], mat(0x8f877c, {roughness: .8}), [0, -.07, -4.82]);
      box(env, [80, .08, 5], new THREE.MeshStandardMaterial({map: PM_BACK.asphaltTex(), roughness: .82}), [0, -.18, -7.35]);
      for (let i = 0; i < 26; i++) box(env, [1.6, .005, .1], mat(0xc9c2b0), [-40 + i * 3.2, -.135, -7.35]);
      box(env, [80, .16, 2.2], new THREE.MeshStandardMaterial({map: (() => { const t = PM_BACK.pavingTex(); t.repeat.set(80 / 6, 2.2 / 6); return t; })(), roughness: .7}), [0, -.08, -10.95]);
      box(env, [80, .12, .16], mat(0x8f877c, {roughness: .8}), [0, -.07, -9.86]);
      WHEEL_CITY.lamps(scene,env);
      const bike = new THREE.Group(); bike.position.set(.7, .31, -2.9); env.add(bike);
      for (const x of [-.55, .55]) mesh(bike, new THREE.TorusGeometry(.3, .018, 8, 40), mat(0x283139), [x, 0, 0]);
      for (const [a, b] of [[[-.55,0,0],[-.22,.44,0]],[[-.22,.44,0],[.2,0,0]],[[.2,0,0],[-.55,0,0]],[[-.22,.44,0],[.34,.44,0]],[[.34,.44,0],[.55,0,0]],[[.55,0,0],[.2,0,0]]]) rod(bike, a, b, mat(0x9a674c), .019);
      box(bike, [.25, .05, .12], mat(0x263139), [-.23, .49, 0]); rod(bike, [.34,.44,0],[.3,.64,0],steel);
      rod(bike, [.3,.64,-.15],[.3,.64,.15],steel);
      box(env, [.45, .8, .45], mat(0x4d5a60), [-3.2, .4, -3.1]);
      const bollard=mesh(env,new THREE.CylinderGeometry(.065,.085,.65,16),steel,[-3.8,.325,2.6]);
      box(env,[.13,.045,.13],mat(0xc59e60),[-3.8,.53,2.6]);
      bollard.name="전경 볼라드";
    }
    env.traverse(o => { o.userData.rvProp = true; }); KIT.fx.env(env);
    const passer = workshop ? null : PM_PEOPLE.passer(scene);
    const cam = new THREE.PerspectiveCamera(40, 16 / 9, .02, 140);
    return {scene, cam, floor, step, door, env, atmos, passer, animate(t, o = {}) {
      if (passer) { passer.visible = o.passer !== false; passer.pose("walk", {t: t * .6}); passer.position.set(-6 + t * .07, 0, -10.6); passer.rotation.y = Math.PI / 2; }
      if (atmos && o.cam) atmos.update(t, o.cam, o.atmos || {});
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = o.exposure ?? (workshop ? .85 : .74);
      renderer.outputEncoding = THREE.sRGBEncoding;
    }};
  }
  window.WHEEL_STREET = {create, mesh, box, rod, mat};
})();
