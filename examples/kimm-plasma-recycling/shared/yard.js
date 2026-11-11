/* Original sorting yard (night with rain, or dawn after rain). SI metres, +Y up; the mixed-plastic mountain sits under an
   open steel canopy at the origin, the camera side is +Z. Background layers: fence, container stacks, trees, far city, sky. */
(function () {
  const {merge} = PM_BACK, V3 = THREE.Vector3, M4 = THREE.Matrix4;
  const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 16);
  const at = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) =>
    new M4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz));
  const std = (o = {}) => new THREE.MeshStandardMaterial({vertexColors: true, roughness: .75, ...o});
  function add(parent, parts, mat, name, shadow = true) {
    const m = new THREE.Mesh(merge(parts), mat); m.name = name; m.castShadow = shadow; m.receiveShadow = true; m.userData.rvProp = true; parent.add(m); return m;
  }
  function tex(w, h, draw, repeat) {
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.encoding = THREE.sRGBEncoding;
    if (repeat) t.repeat.set(...repeat); return t;
  }
  function concreteTex() {
    const rnd = KIT.rng(6113);
    return tex(1024, 1024, (g, w, h) => {
      g.fillStyle = "#47453f"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40000; i++) { const n = rnd(); g.fillStyle = `rgba(${n > .5 ? 230 : 20},${n > .5 ? 225 : 20},${n > .5 ? 215 : 22},${.03 + .05 * rnd()})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 2); }
      for (let i = 0; i < 70; i++) { const r = g.createRadialGradient(0, 0, 0, 0, 0, 30 + 90 * rnd()); r.addColorStop(0, `rgba(25,22,18,${.12 + .14 * rnd()})`); r.addColorStop(1, "rgba(25,22,18,0)"); g.save(); g.translate(rnd() * w, rnd() * h); g.scale(1 + rnd(), 1); g.fillStyle = r; g.fillRect(-140, -140, 280, 280); g.restore(); }
      g.strokeStyle = "rgba(20,20,22,.55)"; g.lineWidth = 3;
      for (let x = 0; x <= w; x += 256) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 0; y <= h; y += 256) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.strokeStyle = "rgba(210,170,60,.55)"; g.lineWidth = 10; g.beginPath(); g.moveTo(0, 900); g.lineTo(w, 900); g.stroke();
    }, [14, 10]);
  }
  function roughTex() {
    const rnd = KIT.rng(4417);
    return tex(512, 512, (g, w, h) => {
      g.fillStyle = "#6a6a6a"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) { const r = g.createRadialGradient(0, 0, 0, 0, 0, 40 + 80 * rnd()); r.addColorStop(0, "rgba(0,0,0,.95)"); r.addColorStop(1, "rgba(0,0,0,0)"); g.save(); g.translate(rnd() * w, rnd() * h); g.scale(1.8, 1); g.fillStyle = r; g.fillRect(-160, -160, 320, 320); g.restore(); }
    }, [7, 5]);
  }
  function corrugatedTex(base, seed) {
    const rnd = KIT.rng(seed);
    return tex(256, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 8) { g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(x, 0, 3, h); g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(x + 4, 0, 2, h); }
      for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(90,50,25,${.08 + .12 * rnd()})`; g.fillRect(rnd() * w, rnd() * h * .6 + h * .4, 4 + rnd() * 30, 20 + rnd() * 80); }
    });
  }
  function canopy(env) {
    const steel = [], roof = [];
    for (const x of [-10, -4, 2, 8]) for (const z of [-9, 1.5]) {
      steel.push({geo: BOX, m: at(x, 3.75, z, .32, 7.5, .32), color: 0x3e4a50});
      steel.push({geo: BOX, m: at(x, 3.75, z, .1, 7.5, .5), color: 0x3a454b});
      steel.push({geo: BOX, m: at(x, .12, z, .7, .24, .7), color: 0x5b5955});
    }
    for (const z of [-9, 1.5]) steel.push({geo: BOX, m: at(-1, 7.55, z, 18.6, .45, .3), color: 0x3e4a50});
    for (const x of [-10, -4, 2, 8]) {
      steel.push({geo: BOX, m: at(x, 7.9, -3.75, .26, .3, 11.4), color: 0x3e4a50});
      for (let k = 0; k < 7; k++) { const z = -9 + k * 1.75; steel.push({geo: BOX, m: at(x, 7.6, z + .87, .06, .7, .06, 0, k % 2 ? .78 : -.78), color: 0x47535a}); }
    }
    for (let k = 0; k < 8; k++) steel.push({geo: BOX, m: at(-1, 8.08, -9 + k * 1.5, 18.6, .12, .08), color: 0x47535a});
    add(env, steel, std({metalness: .55, roughness: .45}), "차양 철골");
    for (let k = 0; k < 6; k++) roof.push({geo: BOX, m: at(-1, 8.2, -9.6 + k * 2.2, 19.4, .05, 2.25, 0, .02), color: 0xffffff});
    const r = add(env, roof, new THREE.MeshStandardMaterial({map: corrugatedTex("#6d7378", 31), roughness: .55, metalness: .5, side: THREE.DoubleSide}), "차양 지붕");
    r.material.map.repeat.set(16, 1);
  }
  function containers(env, z0) {
    const box = [], colors = ["#7a3a2a", "#2f4a5c", "#3f5a3a", "#8a6a2c", "#5a3f4a", "#43494f"], rnd = KIT.rng(812);
    const g = new THREE.Group(); g.name = "컨테이너 더미"; env.add(g);
    for (let s = 0; s < 6; s++) for (let lv = 0; lv < (s % 3) + 1; lv++) {
      const col = colors[Math.floor(rnd() * colors.length)], m = new THREE.Mesh(new THREE.BoxGeometry(6.06, 2.6, 2.44),
        new THREE.MeshStandardMaterial({map: corrugatedTex(col, 40 + s * 7 + lv), roughness: .7, metalness: .35}));
      m.material.map.repeat.set(5, 1); m.position.set(-22 + s * 7.2 + rnd() * .6, 1.3 + lv * 2.6, z0 - (s % 2) * 2.9); m.rotation.y = (rnd() - .5) * .06;
      m.castShadow = m.receiveShadow = true; m.userData.rvProp = true; g.add(m);
      for (const dx of [-3.0, 3.0]) box.push({geo: BOX, m: at(m.position.x + dx, m.position.y, m.position.z + 1.23, .1, 2.6, .06), color: 0x2a2c2e});
    }
    add(g, box, std({metalness: .5}), "컨테이너 모서리");
  }
  function fence(env, z) {
    const p = [];
    for (let x = -30; x <= 24; x += 3) { p.push({geo: CYL, m: at(x, 1.3, z, .05, 2.6, .05), color: 0x5a6266}); }
    for (const y of [.15, 2.55]) p.push({geo: CYL, m: at(-3, y, z, .03, 54, .03, 0, 0, Math.PI / 2), color: 0x5a6266});
    add(env, p, std({metalness: .6, roughness: .4}), "울타리 기둥");
    const mesh = tex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = "rgba(140,150,155,.9)"; g.lineWidth = 2; for (let k = -w; k < w * 2; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); g.beginPath(); g.moveTo(k + h, 0); g.lineTo(k, h); g.stroke(); } }, [54 / 1.2, 2.4 / 1.2]);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(54, 2.4), new THREE.MeshStandardMaterial({map: mesh, transparent: true, alphaTest: .35, metalness: .5, roughness: .5, side: THREE.DoubleSide}));
    net.position.set(-3, 1.35, z); net.name = "울타리 망"; net.userData.rvProp = true; net.receiveShadow = true; env.add(net);
  }
  function props(env) {
    const p = [], rnd = KIT.rng(77);
    for (let k = 0; k < 4; k++) { const x = 10.5 + (k % 2) * 1.3, z = -6 + Math.floor(k / 2) * 1.3;
      for (let e = 0; e < 4; e++) p.push({geo: BOX, m: at(x + (e % 2 ? .55 : -.55), .65, z + (e > 1 ? .55 : -.55), .03, 1.2, .03), color: 0x7d8487});
      p.push({geo: BOX, m: at(x, .62, z, 1.02, 1.0, 1.02), color: 0xd8d6cc}); p.push({geo: BOX, m: at(x, .07, z, 1.2, .14, 1.2), color: 0x3a3c3e}); }
    for (let k = 0; k < 9; k++) p.push({geo: BOX, m: at(-12.2 + rnd() * .3, .07 + k * .145, 4.2, 1.2, .13, 1.0, rnd() * .1), color: 0x8a6e4c});
    for (const [x, z] of [[-5.6, 5.4], [-4.6, 5.4], [12.6, 4.6]]) { p.push({geo: CYL, m: at(x, .5, z, .34, 1.0, .34), color: [0x2f5a6a, 0x5a3a2c, 0x2f5a6a][Math.floor(rnd() * 3)]}); p.push({geo: CYL, m: at(x, 1.0, z, .36, .05, .36), color: 0x23292c}); }
    for (let k = 0; k < 7; k++) p.push({geo: BOX, m: at(8.5 + k * 1.1, .55, 3.9, .1, 1.1, .1), color: 0xd6a92e});
    p.push({geo: BOX, m: at(11.8, 1.05, 3.9, 6.8, .1, .1), color: 0xd6a92e}); p.push({geo: BOX, m: at(11.8, .55, 3.9, 6.8, .08, .08), color: 0x22262a});
    add(env, p, std({roughness: .6, metalness: .25}), "선별장 소품");
  }
  function lampPoles(env, poles) {
    const p = [], lit = [];
    for (const [x, z, h] of poles) {
      p.push({geo: CYL, m: at(x, h / 2, z, .11, h, .11), color: 0x4a5257});
      p.push({geo: BOX, m: at(x + .55, h, z, 1.3, .1, .14), color: 0x4a5257});
      p.push({geo: BOX, m: at(x + 1.0, h - .12, z, .6, .14, .34), color: 0x2a2e31});
      lit.push({geo: BOX, m: at(x + 1.0, h - .2, z, .52, .02, .26), color: 0xffc58a});
    }
    add(env, p, std({metalness: .5, roughness: .5}), "가로등");
    add(env, lit, new THREE.MeshBasicMaterial({vertexColors: true, toneMapped: false}), "가로등 등갓", false);
  }
  function highBays(env, list) {
    const p = [], lit = [];
    for (const [x, y, z] of list) {
      p.push({geo: CYL, m: at(x, y + .45, z, .02, .9, .02), color: 0x30363a});
      p.push({geo: CYL, m: at(x, y + .05, z, .32, .22, .32), color: 0x30363a});
      lit.push({geo: CYL, m: at(x, y - .07, z, .27, .02, .27), color: 0xffcf98});
    }
    add(env, p, std({metalness: .6, roughness: .4}), "천장 등");
    add(env, lit, new THREE.MeshBasicMaterial({vertexColors: true, toneMapped: false}), "천장 등 빛", false);
  }
  function puddles(env, list) {
    const wet = new THREE.MeshStandardMaterial({color: 0x101113, metalness: .9, roughness: .03, envMapIntensity: 1.8, transparent: true, opacity: .9});
    for (const [x, z, s, seed] of list) {
      const r = KIT.rng(seed * 77), sh = new THREE.Shape();
      for (let k = 0; k <= 28; k++) { const a = k / 28 * Math.PI * 2, rr = s * (.55 + .25 * Math.sin(a * 3 + r() * 6) + .12 * r()); k ? sh.lineTo(Math.cos(a) * rr * 1.6, Math.sin(a) * rr) : sh.moveTo(Math.cos(a) * rr * 1.6, Math.sin(a) * rr); }
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 6), wet); m.rotation.x = -Math.PI / 2; m.position.set(x, .004, z); m.receiveShadow = true; m.name = "물웅덩이"; m.userData.rvProp = true; env.add(m);
    }
  }
  // create(renderer, {time: "night"|"dawn", pile: true, pileFlat: 0..1}) -> {scene, cam, env, pile, crane, belt, atmos, animate(t, cam, u)}
  function create(renderer, o = {}) {
    const scene = new THREE.Scene(), env = new THREE.Group(); env.name = "선별장"; scene.add(env);
    const dawn = o.time === "dawn";
    const LAMPS = [[-3.2, 9.6, -12.4, -.5, 0, -1, true, 7.5], [9.2, 9.6, -12.4, 4, 0, -2, false, 5], [-1, 7.1, -6.5, -1, 0, -4, false, 4.2], [-1, 7.1, .2, 0, 0, 1.5, false, 4.6], [6.5, 7.1, -3, 6.5, 0, -2, false, 3.2]];
    const atmos = dawn ? PM_ATMOS.gold(scene, renderer, {fogNear: 24, fogFar: 95, shafts: o.shafts, motes: o.motes}) : PM_ATMOS.night(scene, renderer, {lamps: LAMPS, fogColor: 0x17161c, fogNear: 16, fogFar: 72});
    if (dawn) { atmos.key.shadow.camera.left = -16; atmos.key.shadow.camera.right = 16; atmos.key.shadow.camera.top = 16; atmos.key.shadow.camera.bottom = -16; atmos.key.shadow.camera.far = 70; atmos.key.position.copy(PM_ATMOS.SUN).multiplyScalar(36); }
    const floorMat = new THREE.MeshStandardMaterial({map: concreteTex(), roughnessMap: roughTex(), roughness: dawn ? .45 : .3, metalness: .18, envMapIntensity: dawn ? 1.1 : 1.5});
    const floor = new THREE.Mesh(new THREE.BoxGeometry(90, .16, 60), floorMat); floor.position.set(0, -.08, -6); floor.receiveShadow = true; floor.name = "선별장 바닥"; floor.userData.rvProp = true; env.add(floor);
    canopy(env); containers(env, -17); fence(env, -13.5);
    for (const [x, z, h, s] of [[-26, -21, 6.5, 3], [-19, -22.5, 7.5, 4], [-12, -21.5, 6, 5], [-5, -23, 8, 6], [3, -22, 6.8, 7], [11, -23, 7.4, 8], [18, -21.5, 6.2, 9]]) PM_BACK.tree(env, x, z, h, s);
    const city = PM_BACK.farCity(scene); city.traverse(m => { m.userData.rvProp = true; });
    city.traverse(m => { if (m.isMesh && m.name === "먼 건물") m.material = new THREE.MeshBasicMaterial({color: dawn ? 0x4a3a40 : 0x0b0c11, fog: true}); if (m.isMesh && m.name === "먼 창 불빛") m.material.color.setScalar(dawn ? .15 : .32); });
    lampPoles(env, [[-4.2, -12.4, 9.6], [8.2, -12.4, 9.6]]);
    highBays(env, [[-1, 7.1, -6.5], [-1, 7.1, .2], [6.5, 7.1, -3]]);
    props(env);
    puddles(env, [[3.2, 3.6, 1.1, 1], [-3.8, 3.0, 1.4, 2], [.6, 6.4, .9, 3], [-7.6, 1.6, 1.0, 4], [6.2, 7.2, 1.2, 5]]);
    const shedWall = new THREE.Mesh(new THREE.BoxGeometry(.3, 6.5, 12), new THREE.MeshStandardMaterial({map: corrugatedTex("#5c6266", 51), roughness: .6, metalness: .4}));
    shedWall.material.map.repeat.set(6, 1); shedWall.position.set(-13.5, 3.25, -4); shedWall.castShadow = shedWall.receiveShadow = true; shedWall.name = "창고 벽"; shedWall.userData.rvProp = true; env.add(shedWall);
    const door = new THREE.Mesh(new THREE.BoxGeometry(.05, 3.2, 3.6), new THREE.MeshBasicMaterial({color: dawn ? 0x6a4a30 : 0xb06a32, toneMapped: false}));
    door.position.set(-13.33, 1.6, -2.2); door.name = "창고 문 빛"; door.userData.rvProp = true; env.add(door);
    const doorLight = new THREE.PointLight(0xffb06a, dawn ? .4 : 1.6, 9, 1.4); doorLight.position.set(-12.3, 1.8, -2.2); scene.add(doorLight);
    let pile = null, bales = [], belt = null, crane = null;
    if (o.pile !== false) {
      pile = P2.pile(env, o.pileCount || 9000, .5, dawn ? .8 : .62); pile.position.set(-1.6, 0, -4.2); pile.scale.set(1.2, 1.15 * (1 - (o.pileFlat || 0)), 1.25);
      belt = P2.belt(env, [6.6, 0, -2.4], 11, !!o.freshBelt);
      crane = P2.crane(env);
    }
    const litter = new THREE.Group(); litter.name = "폐플라스틱 조각"; env.add(litter);
    if (o.pile !== false) { const rr = KIT.rng(9090);
      for (let i = 0; i < 26; i++) { const p = P2.plastic(litter, i); p.scale.setScalar(.42 + .2 * rr()); p.position.set(-1.2 + rr() * 3.4, .05, -.4 + rr() * 1.6); p.rotation.set(rr() * 6, rr() * 6, rr() * 6);
        p.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.multiplyScalar(.62); m.material.roughness = .22; m.material.envMapIntensity = 1.4; } }); } }
    env.traverse(m => { m.userData.rvProp = true; }); KIT.fx.env(env);
    const rain = dawn ? null : PM_FX.rain(scene, {center: [0, 4.5, -1], size: [26, 9.5, 22], n: o.rainN || 2600, speed: 7.8, len: .34, wind: .1, opacity: .2});
    const mist = PM_FX.cloud(scene, 260, (i, t, out) => {
      const H = PM_FX.hash, q = PM_FX.fract(H(i) + t * .012);
      out.p = [-14 + H(i + 3) * 28 + 2.2 * Math.sin(t * .05 + i), .25 + H(i + 5) * 1.4, -12 + H(i + 9) * 18 + q * 2];
      out.s = 2.2 + 2.4 * H(i + 11); out.a = dawn ? 0 : .045 * Math.sin(Math.PI * q); out.c = dawn ? [1.0, .82, .66] : [.62, .55, .52];
    }, {soft: 1.2, name: "물안개"});
    const cam = new THREE.PerspectiveCamera(40, 16 / 9, .03, 180);
    return {scene, env, cam, floor, pile, bales, belt, crane, atmos, rain, mist, door, animate(t, c, u = {}) {
      if (atmos.update) atmos.update(t, c, u.atmos || {});
      if (rain) rain.update(t, u.rain ?? 1);
      mist.update(t, c, dawn ? 0 : (u.mist ?? 1));
      if (belt) belt.animate(t);
      if (crane && u.crane !== false) crane.animate(u.craneT ?? t);
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = u.exposure ?? (dawn ? .78 : 1.05);
      renderer.outputEncoding = THREE.sRGBEncoding;
    }};
  }
  window.PM_YARD = {create, tex, corrugatedTex};
})();
