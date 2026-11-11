/* Background set dressing for the golden-hour street. Everything is procedural; repeated parts are merged into
   plain meshes (real triangles, so rv's clearance/occlusion checkers see true geometry, unlike InstancedMesh). */
(function () {
  const M4 = THREE.Matrix4, V3 = THREE.Vector3;
  function merge(parts) {
    const pos = [], nor = [], col = [], idx = [];
    let base = 0;
    const n3 = new THREE.Matrix3(), v = new V3(), c = new THREE.Color();
    for (const {geo, m, color} of parts) {
      const g = geo.index ? geo : geo;
      const P = g.attributes.position, N = g.attributes.normal;
      n3.getNormalMatrix(m); c.set(color ?? 0xffffff);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(N, i).applyMatrix3(n3).normalize(); nor.push(v.x, v.y, v.z);
        col.push(c.r, c.g, c.b);
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
      else for (let i = 0; i < P.count; i++) idx.push(base + i);
      base += P.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    out.setIndex(idx); out.computeBoundingBox(); out.computeBoundingSphere();
    return out;
  }
  const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 10), ICO = new THREE.IcosahedronGeometry(1, 2);
  const at = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) =>
    new M4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz));
  const std = (o = {}) => new THREE.MeshStandardMaterial({vertexColors: true, roughness: .8, ...o});
  function addMesh(parent, geo, mat, name, shadow = true) {
    const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = shadow; m.receiveShadow = true; m.userData.rvProp = true; parent.add(m); return m;
  }
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.encoding = THREE.sRGBEncoding;
    if (repeat) t.repeat.set(...repeat); return t;
  }
  function wallTex(kind, seed) {
    const rnd = KIT.rng(seed);
    return canvasTex(512, 512, (g, w, h) => {
      const base = {brick: "#7a5446", stucco: "#b49c86", panel: "#5d6670", stone: "#9a8f80"}[kind];
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { const n = rnd(); g.fillStyle = `rgba(${n > .5 ? 255 : 0},${n > .5 ? 240 : 0},${n > .5 ? 220 : 0},${.025 + .03 * rnd()})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 4, 1 + rnd() * 2); }
      if (kind === "brick") {
        for (let y = 0; y < h; y += 16) for (let x = (y / 16 % 2) * 24; x < w; x += 48) {
          const k = .8 + .35 * rnd(); g.fillStyle = `rgba(${Math.round(122 * k)},${Math.round(80 * k)},${Math.round(66 * k)},1)`; g.fillRect(x + 1, y + 1, 46, 14);
        }
      } else if (kind === "panel") {
        g.strokeStyle = "rgba(20,24,28,.6)"; g.lineWidth = 2; for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
        for (let y = 0; y <= h; y += 256) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      } else if (kind === "stone") {
        g.strokeStyle = "rgba(60,52,44,.5)"; g.lineWidth = 2; for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      }
      const grime = g.createLinearGradient(0, 0, 0, h); grime.addColorStop(0, "rgba(0,0,0,0)"); grime.addColorStop(1, "rgba(30,20,10,.18)"); g.fillStyle = grime; g.fillRect(0, 0, w, h);
    });
  }
  // facade(parent, {origin, facing, width, floors, kind, seed, shop}) : local x along the street, y up, +z out of the wall
  function facade(parent, o) {
    const g = new THREE.Group(); g.position.set(...o.origin); g.rotation.y = o.facing; parent.add(g);
    const rnd = KIT.rng(o.seed), W = o.width, FH = o.floorH || 3.1, H = FH * o.floors + (o.parapet ?? .8), D = o.depth || 6;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshStandardMaterial({map: (() => { const t = wallTex(o.kind, o.seed); t.repeat.set(W / 4, H / 4); return t; })(), roughness: .9}));
    wall.position.set(W / 2, H / 2, -D / 2); wall.castShadow = o.castShadow !== false; wall.receiveShadow = true; wall.userData.rvProp = true; wall.name = "건물 벽"; g.add(wall);
    const frames = [], glassParts = [], lit = [], trim = [];
    const frameCol = o.frame ?? 0x2b2f33, trimCol = o.trim ?? 0xcfc4b4;
    const winW = o.winW || 1.1, winH = o.winH || 1.55, step = o.winStep || 1.75;
    const cols = Math.floor((W - .6) / step), x0 = (W - (cols - 1) * step) / 2;
    for (let f = o.shop ? 1 : 0; f < o.floors; f++) {
      const y = f * FH + 1.0;
      trim.push({geo: BOX, m: at(W / 2, f * FH + .02, .09, W, .14, .18), color: trimCol});
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * step;
        if (o.skip && o.skip(f, c)) continue;
        const on = rnd() < (o.litRatio ?? .45);
        const warm = [0xffc27a, 0xffb067, 0xffd59a, 0xf7a45c][Math.floor(rnd() * 4)];
        lit.push({geo: BOX, m: at(x, y + winH / 2, -.16, winW - .04, winH - .04, .02), color: on ? warm : [0x1d2a33, 0x2a2f3a, 0x24303a][Math.floor(rnd() * 3)]});
        if (on && rnd() < .5) lit.push({geo: BOX, m: at(x - winW * .25, y + winH / 2, -.14, winW * .42, winH - .1, .02), color: 0x7a5a44});
        glassParts.push({geo: BOX, m: at(x, y + winH / 2, -.06, winW, winH, .012), color: 0xffffff});
        for (const [dx, dy, sx, sy] of [[-winW / 2, winH / 2, .07, winH + .07], [winW / 2, winH / 2, .07, winH + .07], [0, 0, winW + .07, .07], [0, winH, winW + .07, .07], [0, winH * .62, winW, .045], [0, winH / 2, .045, winH]])
          frames.push({geo: BOX, m: at(x + dx, y + dy, -.03, sx, sy, .1), color: frameCol});
        trim.push({geo: BOX, m: at(x, y - .06, .06, winW + .22, .07, .2), color: trimCol});
        if (o.balcony && f >= 1 && c % 3 === 1) {
          trim.push({geo: BOX, m: at(x, y - .12, .45, step * 1.6, .1, .9), color: 0x8e8a82});
          for (let k = 0; k <= 8; k++) frames.push({geo: BOX, m: at(x - step * .8 + k * step * .2, y + .35, .88, .025, .9, .025), color: 0x2a2d30});
          frames.push({geo: BOX, m: at(x, y + .82, .88, step * 1.6, .04, .05), color: 0x2a2d30});
        }
        if (o.ac && rnd() < .12) trim.push({geo: BOX, m: at(x + .2, y - .45, .25, .7, .45, .45), color: 0x9fa3a4});
      }
    }
    if (o.shop) {
      const sw = W - 1.2;
      lit.push({geo: BOX, m: at(W / 2, 1.45, -.2, sw, 2.3, .02), color: 0xf3b878});
      for (let k = 0; k <= Math.round(sw / 1.6); k++) frames.push({geo: BOX, m: at(.6 + k * sw / Math.round(sw / 1.6), 1.45, -.03, .07, 2.4, .1), color: frameCol});
      glassParts.push({geo: BOX, m: at(W / 2, 1.45, -.06, sw, 2.3, .012), color: 0xffffff});
      trim.push({geo: BOX, m: at(W / 2, 2.95, .1, sw + .2, .5, .16), color: 0x262a2e});
      lit.push({geo: BOX, m: at(W / 2, 2.68, .19, sw * .8, .025, .02), color: 0xffe2b0});
      trim.push({geo: BOX, m: at(W / 2, 3.35, .6, sw + .3, .06, 1.2, 0, -.18), color: o.awning ?? 0x6b3a2c});
    }
    trim.push({geo: BOX, m: at(W / 2, H - .1, .15, W + .1, .22, .32), color: trimCol});
    if (o.pipe !== false) for (const x of [.25]) trim.push({geo: CYL, m: at(x, H / 2, .12, .05, H, .05), color: 0x4a4f53});
    const mats = {frames: std({roughness: .5, metalness: .4}), trim: std({roughness: .8}), lit: new THREE.MeshBasicMaterial({vertexColors: true}),
      glass: new THREE.MeshStandardMaterial({color: 0x9fb2bd, metalness: .95, roughness: .06, transparent: true, opacity: .42, envMapIntensity: 1.4})};
    if (frames.length) addMesh(g, merge(frames), mats.frames, "창틀", o.castShadow !== false);
    if (trim.length) addMesh(g, merge(trim), mats.trim, "건물 장식", o.castShadow !== false);
    if (lit.length) addMesh(g, merge(lit), mats.lit, "실내 빛", false);
    if (glassParts.length) { const gl = addMesh(g, merge(glassParts), mats.glass, "창 유리", false); gl.renderOrder = 2; }
    return g;
  }
  function tree(parent, x, z, h, seed) {
    const rnd = KIT.rng(seed), bark = [], leaves = [];
    function branch(p, dir, len, r, depth) {
      const end = p.clone().addScaledVector(dir, len), mid = p.clone().add(end).multiplyScalar(.5);
      const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize());
      bark.push({geo: CYL, m: new M4().compose(mid, q, new V3(r, len, r)), color: 0x4e3e30});
      if (depth === 0) {
        for (let k = 0; k < 11; k++) {
          const s = .24 + .26 * rnd(), off = new V3((rnd() - .5) * .9, (rnd() - .3) * .6, (rnd() - .5) * .9);
          const tone = [0x4f6a34, 0x3b5530, 0x6f7f3a, 0x8a8a3c, 0x2f4428][Math.floor(rnd() * 5)];
          leaves.push({geo: ICO, m: at(end.x + off.x, end.y + off.y, end.z + off.z, s * 1.2, s * .85, s * 1.1, rnd() * 6, rnd() * 3), color: tone});
        }
        return;
      }
      const n = depth === 3 ? 4 : 3;
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2 + rnd() * .8, tilt = .45 + .35 * rnd();
        const d = new V3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).normalize();
        branch(end, d, len * (.62 + .1 * rnd()), r * .62, depth - 1);
      }
    }
    branch(new V3(x, 0, z), new V3(0, 1, 0), h * .38, .11, 3);
    const t = new THREE.Group(); t.name = "가로수"; parent.add(t);
    addMesh(t, merge(bark), std({roughness: .95}), "나무 줄기");
    addMesh(t, merge(leaves), std({roughness: .8}), "나뭇잎");
    const grate = merge([{geo: BOX, m: at(x, .012, z, 1.2, .024, 1.2), color: 0x2c2e30}]);
    addMesh(t, grate, std({metalness: .6, roughness: .5}), "나무 덮개");
    return t;
  }
  function props(parent) {
    const p = [];
    const bench = (x, z, ry) => {
      const B = (dx, dy, dz, sx, sy, sz, c) => { const v = new V3(dx, dy, dz).applyAxisAngle(new V3(0, 1, 0), ry); p.push({geo: BOX, m: at(x + v.x, dy, z + v.z, sx, sy, sz, ry), color: c}); };
      for (let k = 0; k < 4; k++) B(0, .45, -.18 + k * .12, 1.6, .035, .09, 0x8a5e3c);
      for (let k = 0; k < 3; k++) B(0, .62 + k * .12, -.26, 1.6, .09, .03, 0x8a5e3c);
      for (const s of [-.7, .7]) { B(s, .22, 0, .05, .45, .5, 0x2a2c2e); B(s, .55, -.26, .05, .5, .04, 0x2a2c2e); }
    };
    bench(-2.7, -3.3, 0); bench(-9.5, -3.3, 0);
    for (const x of [-.6, .1, .8]) { for (const [a, b] of [[-.3, 0], [.3, 0]]) p.push({geo: CYL, m: at(x, .4, -3.55 + a, .02, .8, .02), color: 0x3a3e42}); p.push({geo: CYL, m: at(x, .8, -3.55, .02, .6, .02, 0, Math.PI / 2), color: 0x3a3e42}); }
    for (const x of [-7.5, -5.2, -1.2, 1.2]) p.push({geo: CYL, m: at(x, .45, -4.45, .07, .9, .07), color: 0x33373a});
    p.push({geo: CYL, m: at(-4.4, .45, -4.2, .26, .9, .26), color: 0x2f3a35});
    addMesh(parent, merge(p), std({roughness: .6, metalness: .3}), "거리 소품");
  }
  function ground(parent) {
    const rnd = KIT.rng(5531), leaves = [];
    for (let i = 0; i < 260; i++) {
      const x = -12 + rnd() * 16, z = -4.7 + rnd() * 6.5;
      if (x > -.6 && z > -1.9) continue;
      leaves.push({geo: BOX, m: at(x, .004, z, .05 + .03 * rnd(), .004, .035, rnd() * 6), color: [0xb0662c, 0x8c4f26, 0xc4883a, 0x6d5a2c][Math.floor(rnd() * 4)]});
    }
    addMesh(parent, merge(leaves), std({roughness: .9}), "낙엽", false);
    const wet = new THREE.MeshStandardMaterial({color: 0x1c1d1f, metalness: .85, roughness: .04, envMapIntensity: 1.6, transparent: true, opacity: .85});
    for (const [x, z, s, seed] of [[-2.2, 1.0, 1.0, 1], [-5.0, -1.5, 1.4, 2], [-.9, 2.6, .7, 3], [-7.4, .8, 1.1, 4]]) {
      const r = KIT.rng(seed * 77), sh = new THREE.Shape();
      for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2, rr = s * (.55 + .25 * Math.sin(a * 3 + r() * 6) + .12 * r()); k ? sh.lineTo(Math.cos(a) * rr * 1.5, Math.sin(a) * rr) : sh.moveTo(Math.cos(a) * rr * 1.5, Math.sin(a) * rr); }
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 6), wet); m.rotation.x = -Math.PI / 2; m.position.set(x, .003, z); m.receiveShadow = true; m.name = "물웅덩이"; m.userData.rvProp = true; parent.add(m);
    }
  }
  function pavingTex() {
    const rnd = KIT.rng(2207);
    return canvasTex(1024, 1024, (g, w, h) => {
      g.fillStyle = "#4a4440"; g.fillRect(0, 0, w, h);
      const T = 128;
      for (let y = 0; y < h; y += T / 2) for (let x = ((y / (T / 2)) % 2) * T / 2; x < w + T; x += T) {
        const k = .82 + .3 * rnd(); g.fillStyle = `rgb(${Math.round(150 * k)},${Math.round(140 * k)},${Math.round(128 * k)})`;
        g.fillRect(x + 2, y + 2, T - 4, T / 2 - 4);
      }
      for (let i = 0; i < 26000; i++) { const n = rnd(); g.fillStyle = `rgba(${n > .5 ? 255 : 20},${n > .5 ? 245 : 18},${n > .5 ? 230 : 16},${.04 + .05 * rnd()})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 2); }
      for (let i = 0; i < 40; i++) { const r = g.createRadialGradient(0, 0, 0, 0, 0, 40 + 60 * rnd()); r.addColorStop(0, "rgba(40,30,20,.16)"); r.addColorStop(1, "rgba(40,30,20,0)"); g.save(); g.translate(rnd() * w, rnd() * h); g.scale(1.6, 1); g.fillStyle = r; g.fillRect(-120, -120, 240, 240); g.restore(); }
    }, [12, 12]);
  }
  function asphaltTex() {
    const rnd = KIT.rng(901);
    return canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#33302f"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 30000; i++) { const n = 30 + 70 * rnd(); g.fillStyle = `rgba(${n},${n * .96},${n * .92},.35)`; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
    }, [30, 3]);
  }
  function farCity(parent) {
    const rnd = KIT.rng(30303), parts = [], lit = [];
    for (const [z, n, hmin, hmax, col] of [[-26, 18, 7, 18, 0x4a4a5c], [-38, 22, 10, 28, 0x5a5468], [-55, 26, 14, 40, 0x6a6070]]) {
      for (let i = 0; i < n; i++) {
        const w = 3 + rnd() * 5, h = hmin + rnd() * (hmax - hmin), x = -45 + i * (90 / n) + rnd() * 2;
        if (Math.abs(x - (-6 + .816 * z)) < 4.5 + w / 2) continue;
        parts.push({geo: BOX, m: at(x, h / 2, z - rnd() * 4, w, h, 4), color: col});
        for (let y = 2; y < h - 1; y += 1.6) for (let k = 0; k < Math.floor(w / 1.2); k++) if (rnd() < .22)
          lit.push({geo: BOX, m: at(x - w / 2 + .6 + k * 1.2, y, z + 2.02, .5, .7, .02), color: [0xffb46a, 0xffd08a, 0xe89a58][Math.floor(rnd() * 3)]});
      }
    }
    const g = new THREE.Group(); g.name = "먼 도시"; parent.add(g);
    addMesh(g, merge(parts), std({roughness: .9}), "먼 건물", false);
    const lm = addMesh(g, merge(lit), new THREE.MeshBasicMaterial({vertexColors: true, fog: true}), "먼 창 불빛", false);
    lm.material.color.setScalar(.75);
    return g;
  }
  window.PM_BACK = {merge, facade, tree, props, ground, pavingTex, asphaltTex, farCity};
})();
