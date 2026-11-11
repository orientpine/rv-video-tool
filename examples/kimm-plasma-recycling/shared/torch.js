/* Hydrogen plasma reactor as a studio hero: a vertical vessel with a real cut wedge (steel shell, insulation and refractory
   layers each show their cut faces), a torch entering from -X, a particle plasma jet, a hero plastic flake that falls in slow
   motion and breaks into particles, and ethylene/benzene ball-and-stick molecules that leave through the outlet.
   Explanatory reconstruction, not the dimensions of the research apparatus. Reactor axis = +Y through the origin. */
(function () {
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({color, roughness: .45, metalness: .6, ...o});
  function mesh(parent, geo, m, p = [0, 0, 0], name) {
    const o = new THREE.Mesh(geo, m); o.position.set(...p); o.castShadow = o.receiveShadow = true; if (name) o.name = name; parent.add(o); return o;
  }
  const OPEN = 1.05;
  function sector(ri, ro, h, m, name, open = OPEN) {
    const a0 = -Math.PI / 2 + open, a1 = 1.5 * Math.PI - open, s = new THREE.Shape();
    s.moveTo(Math.cos(a0) * ro, Math.sin(a0) * ro); s.absarc(0, 0, ro, a0, a1, false);
    s.lineTo(Math.cos(a1) * ri, Math.sin(a1) * ri); s.absarc(0, 0, ri, a1, a0, true);
    const g = new THREE.ExtrudeGeometry(s, {depth: h, bevelEnabled: false, curveSegments: 72});
    g.rotateX(-Math.PI / 2);
    const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; o.name = name; return o;
  }
  function brickCanvas(kind) {
    const c = document.createElement("canvas"); c.width = c.height = 512; const x = c.getContext("2d"), rnd = KIT.rng(kind === "color" ? 811 : 812);
    x.fillStyle = kind === "color" ? "#1a110d" : kind === "bump" ? "#000" : "#fff"; x.fillRect(0, 0, 512, 512);
    for (let r = 0; r < 8; r++) for (let k = 0; k < 5; k++) {
      const off = (r % 2) * 51, X = k * 102 + off + 5, Y = r * 64 + 5, W = 92, Hh = 54;
      for (const dx of [0, -512]) {
        if (kind === "color") { const sh = 52 + ((r * 7 + k * 13) % 5) * 7 + 10 * rnd(); x.fillStyle = `rgb(${sh + 40},${sh - 18},${sh - 40})`; x.fillRect(X + dx, Y, W, Hh);
          for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(${rnd() > .5 ? 255 : 0},${rnd() > .5 ? 200 : 0},0,.08)`; x.fillRect(X + dx + rnd() * W, Y + rnd() * Hh, 2 + rnd() * 5, 1 + rnd() * 3); } }
        else if (kind === "bump") { const g = x.createLinearGradient(0, Y, 0, Y + Hh); g.addColorStop(0, "#9a9a9a"); g.addColorStop(.12, "#ffffff"); g.addColorStop(.88, "#f0f0f0"); g.addColorStop(1, "#8a8a8a"); x.fillStyle = g; x.fillRect(X + dx, Y, W, Hh); }
        else { x.fillStyle = `rgb(${200 + rnd() * 40},${200 + rnd() * 40},${200 + rnd() * 40})`; x.fillRect(X + dx, Y, W, Hh); }
      }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 3); if (kind === "color") t.encoding = THREE.sRGBEncoding; return t;
  }
  const brickTex = () => brickCanvas("color");
  function brickMat(o = {}) {
    return new THREE.MeshStandardMaterial({map: brickTex(), bumpMap: brickCanvas("bump"), bumpScale: .012, roughnessMap: brickCanvas("rough"), color: 0x7a7a7a, roughness: 1, metalness: 0, ...o});
  }
  function create(scene) {
    const root = new THREE.Group(); root.name = "수소 플라즈마 반응기"; scene.add(root);
    const H = 1.4, Y0 = .28, steel = mat(0x5d666c, {roughness: .3, metalness: .85}), dark = mat(0x2b3034, {roughness: .5}), copper = mat(0xc08a5a, {roughness: .28, metalness: .9});
    const refr = brickMat({emissive: new THREE.Color(0xff5a1e), emissiveIntensity: 0});
    const wall = new THREE.Group(); wall.position.y = Y0; root.add(wall);
    wall.add(sector(.6, .625, H, steel, "반응기 외벽"));
    wall.add(sector(.52, .6, H, new THREE.MeshStandardMaterial({color: 0xc9b98a, roughness: .95, metalness: 0}), "단열층"));
    const lining = sector(.41, .52, H, refr, "내화 벽돌"); wall.add(lining);
    for (const y of [0, H]) {
      const f = sector(.36, .7, .05, steel, "플랜지"); f.position.y = y - .025; wall.add(f);
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < OPEN + .05) continue;
        mesh(wall, new THREE.CylinderGeometry(.018, .018, .08, 8), dark, [Math.cos(a) * .665, y + .02, -Math.sin(a) * .665]);
      }
    }
    const floor = mesh(root, new THREE.CylinderGeometry(.41, .2, .22, 48, 1, true, Math.PI / 2 + OPEN, 2 * Math.PI - 2 * OPEN), new THREE.MeshStandardMaterial({color: 0x2a1a14, roughness: .9, side: THREE.DoubleSide, emissive: 0x401408, emissiveIntensity: .4}), [0, Y0 + .11, 0], "반응기 바닥");
    mesh(root, new THREE.CylinderGeometry(.72, .78, .2, 64), dark, [0, .1, 0], "받침");
    for (const a of [.4, 2.2, 4.0]) mesh(root, new THREE.BoxGeometry(.08, .2, .08), steel, [Math.cos(a) * .55, .19, Math.sin(a) * .55]);
    const feed = new THREE.Group(); feed.name = "투입구"; root.add(feed);
    mesh(feed, new THREE.CylinderGeometry(.075, .075, .55, 32), steel, [-.05, Y0 + H + .27, -.05]);
    mesh(feed, new THREE.CylinderGeometry(.26, .075, .26, 40, 1, true), mat(0x55606a, {side: THREE.DoubleSide}), [-.05, Y0 + H + .66, -.05]);
    const out = new THREE.Group(); out.name = "생성물 배출구"; root.add(out);
    const pipe = mesh(out, new THREE.CylinderGeometry(.085, .085, .9, 32), steel, [1.05, .62, -.12]); pipe.rotation.z = Math.PI / 2;
    mesh(out, new THREE.TorusGeometry(.1, .02, 10, 32), dark, [.68, .62, -.12]).rotation.y = Math.PI / 2;
    const torch = new THREE.Group(); torch.name = "수소 플라즈마 토치"; root.add(torch);
    const TY = .98, tipX = -.43;
    for (let i = 0; i < 9; i++) {
      const r = i === 8 ? .07 : i % 2 ? .1 : .115, seg = mesh(torch, new THREE.CylinderGeometry(r, r, .1, 40), i % 2 ? copper : steel, [-1.32 + i * .1, TY, 0]);
      seg.rotation.z = Math.PI / 2;
    }
    const nozzle = mesh(torch, new THREE.CylinderGeometry(.045, .07, .14, 32), copper, [tipX - .02, TY, 0], "토치 노즐"); nozzle.rotation.z = Math.PI / 2;
    mesh(torch, new THREE.BoxGeometry(.24, .28, .3), dark, [-1.52, TY, 0]);
    const hose = (pts, r, m) => { const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))); return mesh(torch, new THREE.TubeGeometry(c, 48, r, 12), m); };
    hose([[-1.6, TY + .08, .08], [-1.85, TY + .1, .25], [-2.0, .5, .5], [-2.1, .03, .7]], .028, mat(0x2f5e8c, {roughness: .4, metalness: .1}));
    hose([[-1.6, TY - .05, -.1], [-1.8, .7, -.3], [-1.95, .03, -.5]], .02, mat(0x2a2d30, {roughness: .7, metalness: 0}));
    hose([[-1.6, TY - .1, .02], [-1.9, .55, .0], [-2.05, .03, .1]], .02, mat(0x2a2d30, {roughness: .7, metalness: 0}));
    const glow = new THREE.PointLight(0xb9a6ff, 0, 3.2, 1.6); glow.position.set(-.05, TY + .05, .2); root.add(glow);
    const hot = new THREE.PointLight(0xff7a3a, 0, 2.2, 1.6); hot.position.set(0, .6, .1); root.add(hot);
    const core = mesh(root, new THREE.ConeGeometry(.016, .5, 24), new THREE.MeshBasicMaterial({color: 0xffffff, toneMapped: false, transparent: true}), [tipX + .25, TY, 0], "플라즈마"); core.rotation.z = -Math.PI / 2; core.castShadow = false;
    const sheathMesh = mesh(root, new THREE.ConeGeometry(.045, .62, 32, 1, true), new THREE.MeshBasicMaterial({color: 0xb7a2ff, toneMapped: false, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide}), [tipX + .31, TY, 0], "플라즈마 외피"); sheathMesh.rotation.z = -Math.PI / 2; sheathMesh.castShadow = false;
    const H_ = PM_FX.hash, F_ = PM_FX.fract;
    let on = 0, burstT = Infinity, hitP = [-.06, TY, 0];
    const jet = PM_FX.cloud(root, 2400, (i, t, o) => {
      const glowP = i < 60, q = F_(H_(i) + t * (glowP ? .9 : 2.6)), ang = H_(i + 3) * 6.283 + t * 3;
      if (glowP) { o.p = [tipX + .05 + q * .55, TY, 0]; o.s = .22 + .12 * (1 - q); o.c = [.55, .42, 1]; o.a = on * .07 * (1 - q); return; }
      const rad = (.004 + .055 * Math.pow(q, 1.1)) * Math.sqrt(H_(i + 5));
      o.p = [tipX + .02 + q * .66 + .01 * Math.sin(t * 13 + i), TY + rad * Math.sin(ang), rad * Math.cos(ang)];
      o.s = .006 + .016 * q; const core = 1 - Math.min(1, rad / .02);
      o.c = [.7 + .3 * core, .62 + .38 * core, 1.0]; o.a = on * Math.pow(1 - q, 1.4) * (.12 + .5 * core);
    }, {additive: true, soft: 1.4, name: "플라즈마 입자", toneMapped: false});
    const sparks = PM_FX.cloud(root, 700, (i, t, o) => {
      const dt = t - burstT; if (dt < 0 || dt > 1.4) return;
      const th = H_(i + 1) * 6.283, ph = Math.acos(2 * H_(i + 2) - 1), v = .25 + .9 * H_(i + 4), d = v * (1 - Math.exp(-dt * 3.2)) / 3.2 * 3;
      o.p = [hitP[0] + Math.sin(ph) * Math.cos(th) * d + dt * .5, hitP[1] + Math.cos(ph) * d * .7, hitP[2] - Math.abs(Math.sin(ph) * Math.sin(th)) * d * .35];
      const k = Math.exp(-dt * 2.6); o.s = .012 + .02 * H_(i + 6); o.c = [1, .55 + .45 * k, .25 + .7 * k]; o.a = .85 * k * Math.min(1, dt / .04);
    }, {additive: true, soft: 1.8, name: "분해 입자", toneMapped: false});
    const flake = new THREE.Group(); flake.name = "플라스틱"; root.add(flake);
    {
      const g = new THREE.CylinderGeometry(.11, .11, .13, 24, 6, true, 0, 1.6), shard = mesh(flake, g, new THREE.MeshPhysicalMaterial({color: 0x3f86b8, roughness: .2, metalness: 0, transmission: .35, thickness: .02, clearcoat: 1, side: THREE.DoubleSide}));
      shard.position.set(-.08, 0, -.05);
      const label = mesh(flake, new THREE.CylinderGeometry(.112, .112, .05, 24, 1, true, .2, 1.1), new THREE.MeshStandardMaterial({color: 0xe8e2d4, roughness: .8, metalness: 0, side: THREE.DoubleSide}));
      label.position.set(-.08, -.01, -.05);
      const cap = mesh(flake, new THREE.CylinderGeometry(.03, .03, .025, 20), mat(0xd24a3a, {metalness: 0, roughness: .5}), [.04, .05, .03]); cap.rotation.x = .7;
      const film = new THREE.PlaneGeometry(.12, .09, 6, 6), fa = film.attributes.position; for (let i = 0; i < fa.count; i++) fa.setZ(i, .015 * Math.sin(fa.getX(i) * 40 + fa.getY(i) * 30)); film.computeVertexNormals();
      mesh(flake, film, new THREE.MeshStandardMaterial({color: 0xd8dccf, roughness: .35, metalness: 0, transparent: true, opacity: .75, side: THREE.DoubleSide}), [.0, -.04, .05]).rotation.set(.4, .6, .2);
    }
    let flakeU = 0;
    KIT.process.part(flake, {name: ["플라스틱"], state: () => flakeU});
    KIT.process.part(torch, {name: ["플라즈마", "토치"], state: () => on});
    const mols = Array.from({length: 10}, (_, i) => P2R.molecule(root, i % 2 === 1, 0x7fe3d8));
    return {root, torch, nozzle, flake, core, wall, lining, out, tipX, TY, hitP, mols,
      // pose(t, cam, {ignite, fallT0, hitT}) - absolute scene times
      pose(t, cam, o) {
        on = KIT.smooth(o.ignite, o.ignite + .45, t);
        const pulse = .5 + .5 * Math.sin(t * 23);
        core.scale.set(1, .25 + .75 * on, 1); core.material.opacity = on * (.85 + .15 * pulse); core.visible = on > .01;
        sheathMesh.scale.set(1 + .08 * pulse, .3 + .7 * on, 1 + .08 * pulse); sheathMesh.material.opacity = on * (.22 + .08 * pulse); sheathMesh.visible = on > .01;
        glow.intensity = on * (2.4 + .6 * pulse); hot.intensity = 1.2 * on + .8 * KIT.smooth(o.hitT, o.hitT + .3, t) * Math.exp(-Math.max(0, t - o.hitT) * .8);
        refr.emissiveIntensity = .02 + .2 * on;
        burstT = o.hitT; jet.update(t, cam); sparks.update(t, cam);
        const u = KIT.smooth(o.fallT0, o.hitT, t), y = 1.42 - (1.42 - TY - .02) * (u * u * (3 - 2 * u) * .6 + u * .4);
        flake.position.set(-.06 + .02 * Math.sin(t * 1.3), t < o.fallT0 ? 1.42 : y, .0);
        flake.rotation.set(.4 + t * .9, t * .6, .2 + t * .4);
        flakeU = KIT.smooth(o.hitT, o.hitT + .5, t); flake.scale.setScalar(1 - .8 * flakeU);
        KIT.fx.reveal(flake, (1 - KIT.smooth(o.hitT + .5, o.hitT + .9, t)) * KIT.smooth(o.fallT0 - .6, o.fallT0 - .2, t));
        mols.forEach((m, k) => {
          const born = o.hitT + .12 + k * .09, q = Math.max(0, t - born), s = q > 0 ? Math.min(1, q / .35) : 0;
          const path = Math.min(1, q * .2), ex = hitP[0] + .1 + path * 1.15, ey = hitP[1] - .36 * path + .1 * Math.sin(k * 2.1), ez = -.08 + .08 * Math.cos(k * 1.7) - .12 * path;
          m.position.set(ex, ey, ez); m.rotation.set(t * .5 + k, t * .7, k * .4);
          m.scale.setScalar(.13 * (.55 + .45 * s)); KIT.fx.reveal(m, s * (1 - KIT.smooth(.88, 1, path)));
        });
      }};
  }
  window.PM_TORCH = {create, sector, brickTex, brickMat};
})();
