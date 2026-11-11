/* Product studio: dark cyclorama, warm/cool rim lights, softbox reflections and out-of-focus practical bokeh. */
(function () {
  const {mesh, mat} = WHEEL_STREET;
  function create(renderer, o = {}) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07090c);
    scene.fog = new THREE.Fog(0x07090c, 6, 16);
    const env = new THREE.Group(); scene.add(env);
    const cyc = new THREE.Shape(); cyc.moveTo(-8, 0); cyc.lineTo(2.2, 0); cyc.quadraticCurveTo(4, 0, 4, 1.8); cyc.lineTo(4, 6); cyc.lineTo(-8, 6);
    const cove = new THREE.Mesh(new THREE.ExtrudeGeometry(cyc, {depth: 14, bevelEnabled: false, curveSegments: 24}),
      mat(0x0c0d10, {roughness: .3, metalness: .15, side: THREE.DoubleSide}));
    cove.rotation.y = Math.PI / 2; cove.position.set(-7, 0, -1.2); cove.receiveShadow = true; cove.name = "스튜디오 바닥"; env.add(cove);
    const hemi = new THREE.HemisphereLight(0x8090a8, 0x0b0c0e, .18); scene.add(hemi);
    const key = new THREE.SpotLight(0xffc489, o.key ?? 9, 12, .42, .75, 1.6); key.position.set(-2.4, 3.1, 1.6); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0002; scene.add(key, key.target);
    const rimWarm = new THREE.SpotLight(0xff9a4a, 14, 9, .35, .6, 1.4); rimWarm.position.set(2.6, 1.6, -2.4); scene.add(rimWarm, rimWarm.target);
    const rimCool = new THREE.SpotLight(0x8fb6ff, 7, 9, .38, .6, 1.4); rimCool.position.set(-2.8, 1.2, -2.2); scene.add(rimCool, rimCool.target);
    const sweep = new THREE.SpotLight(0xfff1dc, 0, 7, .22, .5, 1.2); sweep.position.set(0, 2.6, 2.4); scene.add(sweep, sweep.target);
    const refl = new THREE.Scene(); refl.background = new THREE.Color(0x050608);
    for (const [p, col, s] of [[[-3, 3, 2], 0xffd2a0, [3, 1.2]], [[3, 1.5, -2], 0xff9a50, [.6, 3]], [[-3, 1.5, -2], 0x9cbcff, [.5, 3]], [[0, 4, 0], 0x30343c, [6, 6]]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(...s), new THREE.MeshBasicMaterial({color: col, side: THREE.DoubleSide}));
      m.position.set(...p); m.lookAt(0, .6, 0); refl.add(m);
    }
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(refl, .02).texture; pm.dispose();
    const bokehTex = PM_ATMOS.radial([[0, "rgba(255,255,255,.95)"], [.72, "rgba(255,255,255,.75)"], [.86, "rgba(255,255,255,.18)"], [1, "rgba(255,255,255,0)"]], 128);
    const bokeh = new THREE.Group(); bokeh.name = "뒤 빛망울"; env.add(bokeh);
    const rnd = KIT.rng(4471);
    for (let i = 0; i < 26; i++) {
      const col = [0xffb46a, 0xffd29a, 0xff9850, 0x9fbfff][i % 4];
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: bokehTex, color: col, transparent: true, opacity: .35 + .35 * rnd(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false}));
      s.position.set(-5 + rnd() * 10, (o.bokehY || [.4, 3])[0] + rnd() * ((o.bokehY || [.4, 3])[1] - (o.bokehY || [.4, 3])[0]), -3.0 - rnd() * 1.8); s.scale.setScalar(.05 + rnd() * .08); s.userData.rvProp = true; bokeh.add(s);
    }
    env.traverse(o => { o.userData.rvProp = true; }); KIT.fx.env(env);
    const cam = new THREE.PerspectiveCamera(30, 16 / 9, .01, 60);
    return {scene, cam, env, key, rimWarm, rimCool, sweep, hemi, animate(t, o = {}) {
      key.target.position.set(...(o.aim || [0, .5, 0])); rimWarm.target.position.copy(key.target.position); rimCool.target.position.copy(key.target.position);
      sweep.target.position.copy(key.target.position);
      sweep.intensity = o.sweep || 0; if (o.sweepPos) sweep.position.set(...o.sweepPos);
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = o.exposure ?? .95;
      renderer.outputEncoding = THREE.sRGBEncoding;
    }};
  }
  function droplet(scene) {
    const geo = new THREE.SphereGeometry(1, 96, 64), base = geo.attributes.position.array.slice();
    const drop = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({color: 0xffffff, metalness: 0, roughness: .02, transmission: 1, thickness: .35,
      ior: 1.33, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 1.6, attenuationColor: new THREE.Color(0xd8ecf2), attenuationDistance: 1.2}));
    drop.name = "물방울"; drop.castShadow = true; drop.receiveShadow = false; scene.add(drop);
    const R = .1;
    let state = 0;
    KIT.process.part(drop, {name: "물방울", state: () => state});
    // Shape: fall (stretched along y) -> impact squash with damped ripple -> sessile bead; soft spreads it into a lens.
    // soft < 0 (surface tension pulling the bead rounder) shows in the shape only; the process state stays 0..1.
    function pose(t, {fall = 1, impact = 0, soft = 0, floorY = 0}) {
      state = Math.max(0, soft);
      const arr = geo.attributes.position.array;
      const c = KIT.smooth(impact - .07, impact + .1, t);
      const since = Math.max(0, t - impact), ring = c * Math.exp(-since * 3.2) * Math.sin(since * 15);
      const flat = KIT.clamp(.18 + .55 * soft + .22 * ring, 0, .86);
      const syB = 1 - flat, sxB = Math.sqrt(1 / Math.max(.2, syB));
      const sy = 1.22 + (syB - 1.22) * c, sx = .9 + (sxB - .9) * c, floor = -1 + (.45 + .35 * soft) * c;
      for (let i = 0; i < arr.length; i += 3) {
        const x = base[i], y = base[i + 1], z = base[i + 2];
        const bottom = Math.max(0, -y) * c, pinch = 1 - (1 - c) * (y > 0 ? .32 * y * y : 0);
        arr[i] = x * R * sx * pinch * (1 + .08 * bottom); arr[i + 2] = z * R * sx * pinch * (1 + .08 * bottom);
        arr[i + 1] = Math.max(y, floor) * R * sy;
      }
      geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
      drop.position.y = floorY - floor * R * sy + (1 - Math.min(1, fall)) * 1.6;
    }
    return {mesh: drop, pose};
  }
  window.PM_STUDIO = {create, droplet};
})();
