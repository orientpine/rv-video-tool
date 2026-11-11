/* Golden-hour atmosphere: painted sky with the sun low over the street (-Z), a warm low key light that throws long
   shadows toward the camera, light shafts, dust motes, a soft lens flare and a 2.35:1 letterbox. Everything is a
   pure function of time and camera; nothing reads the previous frame. SI metres, +Y up. */
(function () {
  const SUN = new THREE.Vector3(-0.62, 0.19, -0.76).normalize();
  const lerp = (a, b, u) => a + (b - a) * u;
  function mix3(a, b, u) { return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)]; }
  function hex(c) { return [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255]; }
  // Equirectangular sky: three's equirect lookup is u = atan2(z, x) / 2pi + .5, v = asin(y) / pi + .5.
  function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const GOLD = {zen: 0x27375a, upper: 0x6d6d86, hor: 0xf2a65e, horFar: 0xb07a72, low: 0x3a2c2a, cloudDark: [.42, .33, .42], cloudLit: [1.0, .62, .38], halo: 1, cloud: .85};
  const NIGHT = {zen: 0x04070f, upper: 0x0b1222, hor: 0x5a3c2c, horFar: 0x1c2234, low: 0x0a0a0c, cloudDark: [.07, .08, .12], cloudLit: [.36, .24, .17], halo: 0, cloud: .9};
  function skyTexture(pal = GOLD) {
    const W = 1024, H = 512, c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"), img = g.createImageData(W, H), d = img.data;
    const zen = hex(pal.zen), upper = hex(pal.upper), hor = hex(pal.hor), horFar = hex(pal.horFar), low = hex(pal.low);
    const sx = Math.atan2(SUN.z, SUN.x), sy = Math.asin(SUN.y);
    for (let j = 0; j < H; j++) {
      const v = 1 - (j + .5) / H, el = (v - .5) * Math.PI;
      for (let i = 0; i < W; i++) {
        const az = ((i + .5) / W - .5) * 2 * Math.PI;
        const dir = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
        const toward = Math.max(0, dir[0] * SUN.x + dir[1] * SUN.y + dir[2] * SUN.z);
        const side = Math.pow(toward, 1.6);
        let col;
        if (el >= 0) {
          const h = Math.pow(el / (Math.PI / 2), .45);
          const horizon = mix3(horFar, hor, side);
          col = h < .35 ? mix3(horizon, upper, h / .35) : mix3(upper, zen, (h - .35) / .65);
        } else col = mix3(mix3(horFar, hor, side), low, Math.min(1, -el / .25));
        const ang = Math.acos(Math.min(1, toward || 0));
        const halo = pal.halo * (Math.exp(-ang * ang / .09) * .55 + Math.exp(-ang * ang / .006) * .9 + (ang < .022 ? 2.5 : 0));
        col = [col[0] + halo * 1.0, col[1] + halo * .72, col[2] + halo * .38];
        if (el > -.02 && el < .55) {
          const fx = az * 2.2, fy = el * 26;
          let n = 0, amp = .5, fq = 1;
          for (let o = 0; o < 5; o++) { n += amp * vnoise(fx * fq + o * 7.1, fy * fq * .35 + o * 3.3); amp *= .5; fq *= 2.03; }
          const band = Math.exp(-Math.pow((el - .13) / .1, 2)) * .9 + Math.exp(-Math.pow((el - .32) / .07, 2)) * .5;
          const d = Math.max(0, Math.min(1, (n - .48) * 3.2)) * band;
          const lit = mix3(pal.cloudDark, pal.cloudLit, Math.pow(side, .7));
          const rim = Math.pow(side, 4) * .6 * pal.halo;
          col = mix3(col, [lit[0] + rim, lit[1] + rim * .7, lit[2] + rim * .4], d * pal.cloud);
        }
        const k = (j * W + i) * 4;
        d[k] = Math.min(255, col[0] * 255); d[k + 1] = Math.min(255, col[1] * 255); d[k + 2] = Math.min(255, col[2] * 255); d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.encoding = THREE.sRGBEncoding;
    return {texture: t, sunUV: [sx / (2 * Math.PI) + .5, sy / Math.PI + .5]};
  }
  function radial(stops, size = 256) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d"), r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [at, col] of stops) r.addColorStop(at, col);
    g.fillStyle = r; g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }
  function shaftTexture() {
    const c = document.createElement("canvas"); c.width = 64; c.height = 512;
    const g = c.getContext("2d"), img = g.createImageData(64, 512), d = img.data;
    for (let j = 0; j < 512; j++) for (let i = 0; i < 64; i++) {
      const x = (i + .5) / 64 - .5, y = (j + .5) / 512;
      const a = Math.exp(-x * x / .03) * Math.sin(Math.PI * y) * Math.pow(1 - y, .6);
      const k = (j * 64 + i) * 4; d[k] = 255; d[k + 1] = 214; d[k + 2] = 160; d[k + 3] = Math.round(255 * a);
    }
    g.putImageData(img, 0, 0); return new THREE.CanvasTexture(c);
  }
  // Night: city-glow sky (no sun disc), dim moonlight fill, sodium lamps (o.lamps: [[x,y,z, ax,ay,az, shadow]]), lamp halos.
  function night(scene, renderer, o = {}) {
    const sky = skyTexture(NIGHT);
    scene.background = sky.texture;
    scene.fog = new THREE.Fog(o.fogColor ?? 0x1a1a22, o.fogNear ?? 14, o.fogFar ?? 70);
    const hemi = new THREE.HemisphereLight(0x33405e, 0x1c140e, .32); scene.add(hemi);
    const moon = new THREE.DirectionalLight(0x7a90c0, .35); moon.position.set(8, 14, 6); scene.add(moon);
    const lamps = [];
    for (const [x, y, z, ax, ay, az, sh, I] of (o.lamps || [])) {
      const s = new THREE.SpotLight(0xffa955, I ?? 7, 34, .62, .55, 1.6); s.position.set(x, y, z); s.target.position.set(ax, ay, az);
      if (sh) { s.castShadow = true; s.shadow.mapSize.set(2048, 2048); s.shadow.bias = -.0003; s.shadow.normalBias = .02; s.shadow.radius = 3; }
      scene.add(s, s.target); lamps.push(s);
    }
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(sky.texture).texture; pm.dispose();
    const halos = PM_FX.cloud(scene, (o.lamps || []).length, (i, t, out) => {
      const L = o.lamps[i]; out.p = [L[0], L[1] - .12, L[2]]; out.s = 1.1; out.a = .3; out.c = [1.0, .66, .34];
    }, {additive: true, soft: 2.4, name: "가로등 빛무리", toneMapped: false});
    return {hemi, moon, lamps, halos, update(t, cam, u = {}) { halos.update(t, cam, u.halo ?? 1); for (const s of lamps) s.intensity = (u.lamp ?? 1) * (s.userData.I ?? (s.userData.I = s.intensity)); }};
  }
  function gold(scene, renderer, o = {}) {
    const sky = skyTexture();
    scene.background = sky.texture;
    scene.fog = new THREE.Fog(0x9c7868, o.fogNear ?? 20, o.fogFar ?? 78);
    const hemi = new THREE.HemisphereLight(0x9fa6c4, 0x5a3e2c, .34); scene.add(hemi);
    const key = new THREE.DirectionalLight(0xff9a4c, 4.6);
    key.position.copy(SUN).multiplyScalar(22); key.target.position.set(0, 0, 0);
    key.castShadow = true; key.shadow.mapSize.set(4096, 4096);
    Object.assign(key.shadow.camera, {left: -9, right: 9, top: 9, bottom: -9, near: .5, far: 48});
    key.shadow.bias = -.00025; key.shadow.normalBias = .02; key.shadow.radius = 3;
    scene.add(key, key.target);
    const bounce = new THREE.DirectionalLight(0xffc49a, .38); bounce.position.set(4, 2.2, 9); scene.add(bounce);
    const refl = new THREE.Scene(); refl.background = new THREE.Color(0x2a2a36);
    for (const [p, col, s] of [[SUN.clone().multiplyScalar(6), 0xffc27a, [6, 2.2]], [[0, 6, 0], 0x6f7fa3, [10, 10]], [[0, -3, 0], 0x5a3d2c, [10, 10]], [[-5, 1.5, 4], 0x45506a, [6, 3]]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(...s), new THREE.MeshBasicMaterial({color: col, side: THREE.DoubleSide}));
      m.position.set(...(Array.isArray(p) ? p : p.toArray())); m.lookAt(0, 0, 0); refl.add(m);
    }
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(sky.texture).texture; pm.dispose();
    const shafts = new THREE.Group(); shafts.name = "빛줄기"; scene.add(shafts);
    const stex = shaftTexture();
    for (const [i, at] of (o.shafts || []).entries()) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(at[3] || .9, 14), new THREE.MeshBasicMaterial({map: stex, color: 0xffcf98,
        transparent: true, opacity: (at[4] || .11) * 2.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false}));
      m.userData.base = new THREE.Vector3(at[0], at[1], at[2]); m.userData.rvProp = true; m.renderOrder = 5;
      m.castShadow = m.receiveShadow = false; m.userData.seed = i; shafts.add(m);
    }
    const M = o.motes || {center: [0, 1, 0], size: [6, 2.4, 5], n: 520};
    const geo = new THREE.BufferGeometry(), N = M.n, base = new Float32Array(N * 3), pos = new Float32Array(N * 3), rnd = KIT.rng(7713);
    for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) base[i * 3 + k] = M.center[k] + (rnd() - .5) * M.size[k];
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const motes = new THREE.Points(geo, new THREE.PointsMaterial({color: 0xffd9a8, size: M.px || .02, map: radial([[0, "rgba(255,255,255,1)"], [.5, "rgba(255,255,255,.35)"], [1, "rgba(255,255,255,0)"]], 64),
      transparent: true, opacity: .75, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true}));
    motes.name = "먼지 입자"; motes.userData.rvProp = true; motes.frustumCulled = false; scene.add(motes);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({map: radial([[0, "rgba(255,246,226,1)"], [.12, "rgba(255,214,150,.85)"], [.4, "rgba(255,170,90,.22)"], [1, "rgba(255,140,60,0)"]]),
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true, fog: false}));
    core.userData.rvProp = true; scene.add(core);
    const ghostTex = radial([[0, "rgba(255,220,170,.0)"], [.55, "rgba(255,210,150,.10)"], [.8, "rgba(255,190,120,.34)"], [1, "rgba(255,180,110,0)"]], 128);
    const ghosts = [[.45, .05, 0xffc58a], [.8, .028, 0x9fd0ff], [1.25, .09, 0xffb070], [1.6, .04, 0xffe0b0]].map(([f, s, col]) => {
      const g = new THREE.Sprite(new THREE.SpriteMaterial({map: ghostTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0, fog: false}));
      g.userData = {f, s, rvProp: true}; g.renderOrder = 20; scene.add(g); return g;
    });
    const v = new THREE.Vector3(), dirCam = new THREE.Vector3();
    return {key, hemi, shafts, motes, sun: SUN, update(t, cam, u = {}) {
      key.intensity = u.key ?? 4.6;
      for (const m of shafts.children) {
        const b = m.userData.base; m.position.copy(b);
        const axis = SUN.clone(), toCam = cam.position.clone().sub(b); toCam.addScaledVector(axis, -toCam.dot(axis)).normalize();
        const x = new THREE.Vector3().crossVectors(axis, toCam).normalize();
        m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, axis, toCam));
        m.material.opacity = (u.shafts ?? 1) * (.75 + .25 * Math.sin(t * .37 + m.userData.seed * 1.7)) * (m.userData.op ?? (m.userData.op = m.material.opacity));
      }
      const p = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const s = i * 1.618;
        p[i * 3] = base[i * 3] + .18 * Math.sin(t * .21 + s) + .03 * t;
        p[i * 3 + 1] = base[i * 3 + 1] + .12 * Math.sin(t * .17 + s * 2.3);
        p[i * 3 + 2] = base[i * 3 + 2] + .15 * Math.cos(t * .19 + s * 1.3);
      }
      geo.attributes.position.needsUpdate = true;
      motes.material.opacity = .75 * (u.motes ?? 1);
      core.position.copy(cam.position).addScaledVector(SUN, 70); core.scale.setScalar(u.coreScale ?? 13);
      core.material.opacity = u.core ?? .9;
      v.copy(core.position).project(cam);
      cam.getWorldDirection(dirCam);
      const front = dirCam.dot(SUN), onScreen = Math.max(0, 1 - Math.max(Math.abs(v.x), Math.abs(v.y)) / 1.35);
      const amt = .35 * (u.flare ?? 0) * (front > 0 ? onScreen : 0);
      for (const g of ghosts) {
        const q = new THREE.Vector3(-v.x * g.userData.f, -v.y * g.userData.f, .2).unproject(cam);
        const d = q.sub(cam.position).normalize();
        g.position.copy(cam.position).addScaledVector(d, 2);
        g.scale.setScalar(g.userData.s * 2 * 2 * Math.tan(cam.fov * Math.PI / 360) * 3);
        g.material.opacity = amt;
      }
    }};
  }
  // 2.35:1 letterbox over the stage, under captions (#cap z 6) and the badge (z 5).
  function letterbox() {
    if (document.getElementById("pm-lbx-top")) return;
    for (const [id, css] of [["pm-lbx-top", "top:0"], ["pm-lbx-bot", "bottom:0"]]) {
      const e = document.createElement("div"); e.id = id;
      e.style.cssText = `position:absolute;left:0;width:1920px;height:131px;${css};background:#000;z-index:4;pointer-events:none`;
      document.body.append(e);
    }
  }
  window.PM_ATMOS = {gold, night, letterbox, radial, SUN};
})();
