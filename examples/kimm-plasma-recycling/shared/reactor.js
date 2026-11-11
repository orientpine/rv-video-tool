/* Explanatory cutaway, not a dimensional reconstruction of the research apparatus. */
(function () {
  function molecule(parent, benzene = false, color = 0x77d9dd) {
    const root = new THREE.Group(); parent.add(root);
    const carbon = P2.mat(0x465f6a, .55, .28), hydrogen = P2.mat(0xdfede5, .15, .3), bond = P2.mat(color, .5, .3);
    const sphere = (p, r, m) => P2.mesh(root, new THREE.SphereGeometry(r, 12, 10), m, p);
    if (benzene) {
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3, b = (i + 1) * Math.PI / 3;
        const p = [Math.cos(a) * .29, Math.sin(a) * .29, 0], q = [Math.cos(b) * .29, Math.sin(b) * .29, 0];
        sphere(p, .075, carbon); P2.tube(root, p, q, .022, bond);
        P2.tube(root, p, [p[0] * 1.6, p[1] * 1.6, 0], .017, bond); sphere([p[0] * 1.6, p[1] * 1.6, 0], .047, hydrogen);
        if (i % 2 === 0) P2.tube(root, p.map(v => v * .79), q.map(v => v * .79), .015, bond);
      }
    } else {
      for (const x of [-.15, .15]) {
        sphere([x, 0, 0], .09, carbon);
        for (const y of [-.17, .17]) {
          const p = [x * 1.65, y, 0]; sphere(p, .052, hydrogen); P2.tube(root, [x, 0, 0], p, .018, bond);
        }
      }
      for (const y of [-.033, .033]) P2.tube(root, [-.15, y, 0], [.15, y, 0], .019, bond);
    }
    return root;
  }
  function reactor(parent, small = false) {
    const root = new THREE.Group(); root.name = "hydrogen plasma reactor"; parent.add(root);
    const steel = P2.mat(0x849b9e, .82, .3), dark = P2.mat(0x354f5a, .7), copper = P2.mat(0xb49672, .75, .29);
    const wall = new THREE.Group(); root.add(wall);
    // Open front arc exposes the refractory lining while the rear remains substantial.
    const shell = P2.mesh(wall, new THREE.CylinderGeometry(1.65, 1.65, 3.7, 64, 1, true, Math.PI * .52, Math.PI * .96), steel, [.45, 2.2, 0]);
    shell.material.side = THREE.DoubleSide;
    const liner = P2.mesh(wall, new THREE.CylinderGeometry(1.43, 1.43, 3.4, 48, 1, true, Math.PI * .53, Math.PI * .94), P2.mat(0x79695b, .1, .93), [.45, 2.2, .02]);
    liner.material.side = THREE.DoubleSide;
    {
      // Refractory brick courses on the inner wall so the curve reads as a real cut cylinder, not a flat pane.
      const c = document.createElement("canvas"); c.width = 256; c.height = 256; const x = c.getContext("2d");
      x.fillStyle = "#7b5644"; x.fillRect(0, 0, 256, 256);
      for (let r = 0; r < 8; r++) for (let k = 0; k < 5; k++) {
        const off = (r % 2) * 25, shade = 96 + ((r * 7 + k * 13) % 5) * 9;
        x.fillStyle = `rgb(${shade + 30},${shade - 10},${shade - 30})`; x.fillRect(k * 51 + off + 2, r * 32 + 2, 47, 28);
      }
      const map = new THREE.CanvasTexture(c); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(6, 4);
      liner.material.map = map; liner.material.color.setHex(0xffffff); liner.material.roughness = .95;
      liner.material.emissive = new THREE.Color(0x5a2a12); liner.material.emissiveIntensity = .25;
    }
    // Cut faces of the opened wall: a thick steel lip on both edges shows the wall section instead of a thin shell.
    for (const a of [Math.PI * .52, Math.PI * 1.48]) {
      const lip = P2.box(wall, [.07, 3.7, .24], P2.mat(0x5c4c40, .3, .7), [.45 + Math.sin(a) * 1.54, 2.2, Math.cos(a) * 1.54]);
      lip.rotation.y = a; lip.name = "반응기 절단면";
    }
    for (const y of [.3, .48, 3.95, 4.1]) {
      const ring = P2.mesh(root, new THREE.TorusGeometry(1.66, .09, 8, 64), steel, [.45, y, 0]); ring.rotation.x = Math.PI / 2;
      for (let i = 0; i < 14; i++) {const a = i * Math.PI * 2 / 14; P2.cylinder(root, .045, .11, dark, [.45 + Math.cos(a) * 1.66, y + .06, Math.sin(a) * 1.66]);}
    }
    P2.cylinder(root, 1.62, .19, dark, [.45, .25, 0]);
    for (const x of [-.8, 1.7]) for (const z of [-.8, .8]) P2.box(root, [.16, .25, .16], steel, [x, .08, z]);
    const torch = new THREE.Group(); torch.position.set(-1.7, 2.15, 0); root.add(torch);
    for (let i = 0; i < 7; i++) {
      const o = P2.cylinder(torch, i === 6 ? .18 : .28, .14, i % 2 ? copper : steel, [-.85 + i * .16, 0, 0]); o.rotation.z = Math.PI / 2;
    }
    P2.tube(root, [-3.3, .3, -.4], [-3.3, 2.15, -.4], .10, dark);
    P2.tube(root, [-3.3, 2.15, -.4], [-2.45, 2.15, -.4], .10, dark);
    for (const z of [-.30, .30]) {
      P2.tube(root, [-2.1, 2.4, z], [-2.1, 3.3, z], .045, copper);
      P2.tube(root, [-2.1, 3.3, z], [-3.4, 3.3, z], .045, copper);
    }
    const valve = KIT.process.valve(root, {radius: .18, turns: .6, name: "수소"}); valve.root.position.set(-3.3, 1.55, -.27);
    const jet = new THREE.Group(); jet.name = "플라즈마"; jet.position.set(-.35, 2.15, 0); root.add(jet);
    const core = P2.mesh(jet, new THREE.ConeGeometry(.10, 2.1, 32), new THREE.MeshBasicMaterial({color: 0xf1efff, toneMapped: false}));
    core.rotation.z = -Math.PI / 2;
    const sheath = P2.mesh(jet, new THREE.ConeGeometry(.27, 2.4, 32), new THREE.MeshBasicMaterial({color: 0x7c65ff, transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}));
    sheath.rotation.z = -Math.PI / 2;
    const lamp = new THREE.PointLight(0xb5a0ff, 1.4, 4.5); lamp.position.set(.0, 2.15, .35); root.add(lamp);
    const hopper = P2.cylinder(root, .85, .9, dark, [.4, 4.8, -.15], .34);
    const rim = P2.mesh(root, new THREE.TorusGeometry(.85, .06, 8, 32), steel, [.4, 5.25, -.15]); rim.rotation.x = Math.PI / 2;
    P2.tube(root, [.4, 4.35, -.15], [.4, 3.7, -.15], .30, steel);
    const feed = new THREE.Group(); feed.name = "투입 플라스틱"; root.add(feed);
    for (let i = 0; i < 5; i++) {const p = P2.plastic(feed, i); p.position.set(Math.sin(i * 2) * .16, i * .10, Math.cos(i * 3) * .13); p.rotation.set(i, i * 2, i);}
    KIT.process.part(feed, {name: ["플라스틱", "혼합 플라스틱"], state: () => feed.userData.u || 0});
    KIT.process.part(jet, {name: ["플라즈마", "불꽃", "토치"], state: () => jet.userData.u || 0});
    const flakes = Array.from({length: 25}, (_, i) => {const o = P2.plastic(root, i + 1); o.scale.setScalar(.33); return o;});
    const products = Array.from({length: 9}, (_, i) => molecule(root, i % 2 === 0));
    P2.tube(root, [1.8, .8, -.3], [3.6, .8, -.3], .17, dark);
    if (small) root.scale.setScalar(.72);
    return {root, feed, jet, hopper, animate(t, hit = 4, ignite = 0) {
      const on = KIT.smooth(ignite, ignite + .8, t), pulse = .5 + .5 * Math.sin(t * 12.1);
      jet.userData.u = on; jet.scale.set(1, .9 + pulse * .14, .9 + pulse * .14);
      KIT.fx.reveal(jet, on); lamp.intensity = on * (1 + pulse * .35); valve.set(KIT.smooth(.8, 3, t));
      const u = KIT.smooth(hit - .7, hit + .45, t); feed.userData.u = u;
      feed.position.set(.35, 4.2 - 2.05 * u, .25); feed.rotation.set(t * .25, t * .6, t * .2);
      const burn = KIT.smooth(hit + .20, hit + .65, t); KIT.fx.reveal(feed, 1 - burn);
      flakes.forEach((p, i) => {
        const q = (t * .17 + i / flakes.length) % 1;
        p.position.set(.35 + Math.sin(i * 9) * .35, 4.35 - q * 2.3, -.25 + Math.cos(i * 4) * .30);
        p.rotation.set(i + t * .4, i * .8 + t * .7, i);
        p.scale.setScalar(.4 * KIT.smooth(0, .09, q) * (1 - KIT.smooth(.88, 1, q)));
      });
      products.forEach((p, i) => {
        const q = (t * .12 + i / products.length) % 1, size = KIT.smooth(0, .1, q) * (1 - KIT.smooth(.9, 1, q)) * on;
        p.position.set(.55 + q * 2.7, 1.6 - q * .7 + .15 * Math.sin(i * 4), .4 + Math.sin(i) * .17);
        p.rotation.set(t * .2 + i, t * .45, i); p.scale.setScalar(size * .65);
      });
    }};
  }
  function tank(parent, xyz, label) {
    const root = new THREE.Group(); root.position.set(...xyz); parent.add(root);
    const steel = P2.mat(0x809a9f, .7, .34), dark = P2.mat(0x3b5962, .6);
    P2.cylinder(root, .83, 3.0, steel, [0, 2.0, 0]);
    const dome = P2.mesh(root, new THREE.SphereGeometry(.83, 32, 16), steel, [0, 3.5, 0]); dome.scale.y = .38;
    for (const y of [.6, 1.3, 2.7, 3.4]) {
      const o = P2.mesh(root, new THREE.TorusGeometry(.84, .035, 8, 40), dark, [0, y, 0]); o.rotation.x = Math.PI / 2;
    }
    for (const x of [-.55, .55]) P2.box(root, [.15, .6, .15], dark, [x, .3, 0]);
    P2.box(root, [.18, 2.3, .14], dark, [.45, 2.0, .81]);
    const level = P2.box(root, [.075, 2.1, .06], new THREE.MeshBasicMaterial({color: 0x8cf0df}), [.45, 2, .91]);
    // Name plate sits in front of the level gauge and above it; feed pipes enter the dome from above, never cross it.
    const name = P2.sign(root, label, [-.1, 3.22, 1.0], 1.7, "#dceae8", "#244450");
    return {root, level, name, animate(t) {const u = .15 + KIT.smooth(2, 10, t) * .75; level.scale.y = u; level.position.y = .95 + 1.05 * u;}};
  }
  function flow(parent, points, count = 32) {
    const material = new THREE.MeshBasicMaterial({color: 0x8de5d7, toneMapped: false});
    const dots = Array.from({length: count}, () => P2.mesh(parent, new THREE.SphereGeometry(.045, 8, 6), material));
    for (let i = 0; i + 1 < points.length; i++) P2.tube(parent, points[i], points[i + 1], .11);
    return {animate(t) {
      dots.forEach((o, i) => {
        const q = (t * .12 + i / count) % 1, s = q * (points.length - 1), k = Math.min(points.length - 2, Math.floor(s)), u = s - k;
        o.position.set(...points[k].map((v, j) => v + (points[k + 1][j] - v) * u));
        o.scale.setScalar(KIT.smooth(0, .05, q) * (1 - KIT.smooth(.95, 1, q)));
      });
    }};
  }
  window.P2R = {molecule, reactor, tank, flow};
})();
