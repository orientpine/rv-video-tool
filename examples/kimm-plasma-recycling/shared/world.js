/* Original industrial sets. All poses are evaluated from absolute scene time. */
(function () {
  const palette = [0x4c9b9e, 0xe2ded0, 0xb9c7d0, 0xba7850, 0x487ca5, 0xc5a443, 0x7d9f68, 0xa4575c];
  const mat = (color, metalness = 0.15, roughness = 0.65) => new THREE.MeshStandardMaterial({color, metalness, roughness});
  function mesh(parent, geometry, material, p = [0, 0, 0]) {
    const o = new THREE.Mesh(geometry, material);
    o.position.set(...p); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  }
  const box = (p, size, m, xyz) => mesh(p, new THREE.BoxGeometry(...size), m, xyz);
  const cylinder = (p, r, h, m, xyz, r2 = r) => mesh(p, new THREE.CylinderGeometry(r, r2, h, 32), m, xyz);
  function tube(parent, a, b, r = 0.08, material = mat(0x8d9ca1, 0.75, 0.32)) {
    const v = new THREE.Vector3(...a), w = new THREE.Vector3(...b);
    const o = cylinder(parent, r, v.distanceTo(w), material, v.clone().add(w).multiplyScalar(0.5).toArray());
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), w.sub(v).normalize()); return o;
  }
  function canvasTexture(kind) {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d"), rng = KIT.rng(kind === "ground" ? 93 : 131);
    ctx.fillStyle = kind === "ground" ? "#485154" : "#65716f"; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 12000; i++) {
      const v = Math.floor(38 + rng() * 65); ctx.fillStyle = `rgba(${v},${v + 5},${v + 6},.2)`;
      ctx.fillRect(rng() * 512, rng() * 512, 1 + rng() * 4, 1 + rng() * 3);
    }
    ctx.strokeStyle = "rgba(20,26,26,.25)"; ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const y = i * 48 + rng() * 20; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y + rng() * 15); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 8); return t;
  }
  function sign(parent, text, position, width = 2.2, color = "#bfcdd0", background = "#233b43") {
    const c = document.createElement("canvas"); c.width = 768; c.height = 192;
    const x = c.getContext("2d"); x.fillStyle = background; x.fillRect(0, 0, 768, 192);
    x.fillStyle = color; x.textAlign = "center"; x.textBaseline = "middle"; x.font = "bold 66px sans-serif";
    x.fillText(text, 384, 96);
    return mesh(parent, new THREE.PlaneGeometry(width, width / 4), new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(c)}), position);
  }
  function world(indoor = false, renderer) {
    const scene = new THREE.Scene(), bg = indoor ? 0x101c25 : 0x303e45;
    scene.background = new THREE.Color(bg); scene.fog = new THREE.Fog(bg, indoor ? 20 : 26, 65);
    if (!indoor) {
      const sky = document.createElement("canvas"); sky.width = 4; sky.height = 512;
      const x = sky.getContext("2d"), g = x.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0, "#142431"); g.addColorStop(.65, "#38474e"); g.addColorStop(1, "#566061");
      x.fillStyle = g; x.fillRect(0, 0, 4, 512); scene.background = new THREE.CanvasTexture(sky);
    }
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.add(new THREE.HemisphereLight(indoor ? 0x9dbbd2 : 0xaec4ce, 0x242a24, indoor ? 0.42 : 0.38));
    const key = new THREE.DirectionalLight(indoor ? 0xdad8c4 : 0xffd6a2, indoor ? .85 : .95);
    key.position.set(-7, 13, 8); scene.add(key);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {left: -23, right: 23, top: 22, bottom: -18, near: 1, far: 55});
    key.shadow.bias = -.00015; key.shadow.normalBias = .045;
    const rim = new THREE.DirectionalLight(0x7aa7be, .42); rim.position.set(7, 7, -9); scene.add(rim);
    const groundMat = mat(indoor ? 0x4d5b5c : 0x515d5c, 0.10, 0.82); groundMat.map = canvasTexture("ground");
    const floor = box(scene, [65, 0.18, 55], groundMat, [0, -0.12, 0]); floor.name = "industrial floor";
    const steel = mat(0x40545c, 0.75, 0.42), back = new THREE.Group(); back.name = "shed structure"; scene.add(back);
    for (let x = -18; x <= 18; x += 6) {
      box(back, [0.23, 8, 0.3], steel, [x, 4, -8]);
      box(back, [0.23, 6, 0.3], steel, [x, 3, -16]);
      tube(back, [x, 7.5, -8], [x, 6, -16], 0.11, steel);
      tube(back, [x, 6, -8], [x + 5.7, 7.5, -8], 0.045, steel);
    }
    for (let z = -8; z >= -16; z -= 2) box(back, [40, 0.14, 0.12], steel, [0, 7.5 + (z + 8) * 0.19, z]);
    for (let x = -17; x < 18; x += 5) box(back, [4.65, .1, 7.5], mat(0x273c46, .5, .75), [x, 7.0, -12]);
    const wallMat = mat(0x465657, 0.25, 0.82); wallMat.map = canvasTexture("wall");
    box(back, [40, 4.5, 0.14], wallMat, [0, 2.25, -16]);
    if (indoor) {
      box(back, [.15, 7, 24], wallMat, [-17, 3.5, -4]);
      for (let z = -14; z < 7; z += 3) {
        box(back, [.18, 7, .15], steel, [-16.85, 3.5, z]);
        tube(back, [-16.7, 2.3, z], [-16.7, 2.3, z + 2.8], .07, steel);
      }
    }
    for (let x = -17; x < 18; x += 2) {
      box(back, [1.8, 1.4, 0.1], mat(indoor ? 0x536f7b : 0x66797c, 0.2, 0.5), [x, 5.15, -15.8]);
      box(back, [0.06, 1.4, 0.14], steel, [x, 5.15, -15.68]);
    }
    for (let x = -12; x <= 12; x += 6) {
      const panel = box(back, [2.2, 0.06, 0.3], new THREE.MeshStandardMaterial({color: 0xe2dac1, emissive: 0xffd394, emissiveIntensity: 1.8}), [x, 6.5, -7]);
      const light = new THREE.PointLight(0xffd69a, indoor ? 0.55 : 0.3, 10); light.position.copy(panel.position).y -= 0.4; back.add(light);
    }
    for (let i = 0; i < 4; i++) {
      const p = box(scene, [1.4, 1.6, 0.8], mat(0x536d73, 0.4), [-12 + i * 1.8, 0.8, -10]);
      sign(p, "자원 순환", [0, 0.15, 0.41], 1.1);
    }
    // Wheel marks, drain channels and wet patches motivate the yard surface.
    for (const x of [-9, -8.5, 7, 7.5]) box(scene, [0.07, 0.012, 22], mat(0x303e42, 0.05, 0.9), [x, -0.018, 0]);
    for (const x of [-10, 10]) for (let z = -8; z < 10; z += 1) box(scene, [0.65, 0.012, 0.1], mat(0xc4aa60), [x, 0.005, z]);
    for (let i = 0; i < 4; i++) {
      const wet = mat(0x354c54, 0.4, 0.24); wet.transparent = true; wet.opacity = .18;
      const puddle = mesh(scene, new THREE.CircleGeometry(0.5 + (i % 4) * 0.25, 24), wet, [(i * 7 % 19) - 9, -0.011, (i * 5 % 15) - 5]);
      puddle.rotation.x = -Math.PI / 2; puddle.scale.x = 1.7; puddle.castShadow = false; puddle.receiveShadow = false;
    }
    const dustGeo = new THREE.BufferGeometry(), pts = [], random = KIT.rng(77);
    for (let i = 0; i < 150; i++) pts.push((random() - 0.5) * 26, random() * 8, (random() - 0.5) * 22);
    dustGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({color: 0xcbd6d0, size: 0.026, transparent: true, opacity: 0.28, depthWrite: false}));
    scene.add(dust);
    const cam = new THREE.PerspectiveCamera(43, 16 / 9, 0.08, 100);
    KIT.fx.env(floor, back);
    return {scene, cam, floor, dust, animate(t) {renderer.toneMappingExposure = indoor ? 1.0 : .85; dust.position.x = Math.sin(t * 0.1) * 0.35; dust.position.y = Math.sin(t * 0.18) * 0.12;}};
  }
  function bottleGeo() {
    const profile = [[0, 0], [.1, 0], [.12, .035], [.12, .29], [.10, .34], [.045, .40], [.045, .47], [0, .47]];
    return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 12);
  }
  function filmGeo() {
    const g = new THREE.PlaneGeometry(0.38, 0.42, 4, 4), a = g.attributes.position;
    for (let i = 0; i < a.count; i++) a.setZ(i, Math.sin(a.getX(i) * 30 + a.getY(i) * 19) * 0.055);
    g.computeVertexNormals(); return g;
  }
  function plastic(parent, i = 0) {
    const group = new THREE.Group(), material = mat(palette[i % palette.length], 0.05, 0.53);
    switch (i % 4) {
      case 0:
        mesh(group, bottleGeo(), material);
        cylinder(group, 0.05, 0.035, mat(0xc6c9b8), [0, 0.47, 0]);
        cylinder(group, 0.121, 0.11, mat(0xc1c8b6), [0, 0.18, 0]);
        break;
      case 1: {
        material.side = THREE.DoubleSide; mesh(group, filmGeo(), material).rotation.x = 0.3; break;
      }
      case 2: cylinder(group, 0.13, 0.07, material); break;
      case 3: {
        const o = box(group, [0.30, 0.17, 0.22], material); o.rotation.z = 0.13;
        box(group, [0.31, 0.025, 0.23], mat(0xc6c4b6), [0, 0.09, 0]); break;
      }
    }
    group.name = "mixed plastic load"; parent.add(group); return group;
  }
  function pile(parent, count = 1800, size = 1, tone = 1) {
    const root = new THREE.Group(); root.name = "mixed plastic load mound"; parent.add(root);
    const rng = KIT.rng(241), dummy = new THREE.Object3D(), color = new THREE.Color();
    const geos = [bottleGeo(), filmGeo(), new THREE.CylinderGeometry(0.13, 0.13, 0.07, 12), new THREE.BoxGeometry(0.32, 0.18, 0.24)];
    for (let kind = 0; kind < 4; kind++) {
      const n = Math.ceil(count / 4), m = mat(0xffffff, 0.08, tone < 1 ? 0.3 : 0.64); m.side = THREE.DoubleSide; if (tone < 1) m.envMapIntensity = 1.3;
      const inst = new THREE.InstancedMesh(geos[kind], m, n); inst.castShadow = true; root.add(inst);
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, rad = Math.sqrt(rng()), height = Math.pow(1 - rad, 0.7) * 3.9;
        dummy.position.set(Math.cos(a) * rad * 5.4, 0.13 + rng() * height, Math.sin(a) * rad * 3.3);
        dummy.rotation.set(rng() * 6, rng() * 6, rng() * 6); dummy.scale.setScalar((0.75 + rng() * 0.7) * size);
        dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix); color.setHex(palette[Math.floor(rng() * palette.length)]).multiplyScalar(tone); inst.setColorAt(i, color);
      }
      inst.instanceMatrix.needsUpdate = true;
    }
    return root;
  }
  function bale(parent, xyz, index = 0) {
    const root = new THREE.Group(); root.position.set(...xyz); root.name = "compressed mixed plastic load"; parent.add(root);
    const rng = KIT.rng(512 + index);
    box(root, [1.9, 1.15, 1.25], mat(0x677a78), [0, 0.6, 0]);
    for (let i = 0; i < 75; i++) {
      const o = plastic(root, i); o.scale.setScalar(0.65 + rng() * 0.5);
      o.position.set((rng() - .5) * 1.9, .12 + rng() * 1.1, (rng() - .5) * 1.3); o.rotation.set(rng() * 6, rng() * 6, rng() * 6);
    }
    for (const x of [-0.65, 0, 0.65]) {
      box(root, [0.025, 1.22, 1.33], mat(0xb4b4a0, 0.75), [x, 0.62, 0]);
    }
    return root;
  }
  function belt(parent, xyz = [5, 0, 0], length = 9, fresh = false) {
    const root = new THREE.Group(); root.position.set(...xyz); parent.add(root);
    const steel = mat(0x587079, 0.65), rubber = mat(0x2e383d, 0.02, 0.95);
    box(root, [1.45, .18, length], rubber, [0, 1.05, 0]);
    for (const x of [-.85, .85]) box(root, [.15, .4, length + .4], steel, [x, 1, 0]);
    for (const z of [-length / 2 + .4, 0, length / 2 - .4]) {
      for (const x of [-.7, .7]) box(root, [.12, 1, .12], steel, [x, .5, z]);
      tube(root, [-.8, .95, z], [.8, .95, z], .17, steel);
    }
    const ribs = [];
    for (let i = 0; i < 22; i++) ribs.push(box(root, [1.4, .04, .06], mat(0x727976), [0, 1.16, 0]));
    const items = Array.from({length: 24}, (_, i) => {
      const p = plastic(root, fresh ? 0 : i); p.position.x = ((i * 7 % 11) / 11 - .5) * 1.0;
      if (fresh) p.traverse(o => {if (o.isMesh) o.material = mat(0xa0d2d0, .1, .24);});
      return p;
    });
    KIT.process.part(root, {name: fresh ? ["새 병", "원료"] : ["컨베이어", "플라스틱"], state: () => root.userData.progress || 0});
    return {root, animate(t) {
      root.userData.progress = (t * .12) % 1;
      ribs.forEach((o, i) => {o.position.z = ((i / ribs.length + t * .10) % 1 - .5) * length;});
      items.forEach((p, i) => {
        const q = (i / items.length + t * .10) % 1;
        p.position.z = (q - .5) * length; p.position.y = 1.22;
        p.rotation.set(fresh ? 0 : i * .8, fresh ? 0 : i * 2.1, fresh ? 0 : i);
        p.scale.setScalar(0.85 * KIT.smooth(0, .04, q) * (1 - KIT.smooth(.96, 1, q)));
      });
    }};
  }
  function crane(parent) {
    const root = new THREE.Group(); root.position.set(-2, 0, -2); parent.add(root);
    const steel = mat(0x797e72, .7), yellow = mat(0xc5a34d, .4);
    for (const z of [-3, 3]) box(root, [12, .35, .26], yellow, [0, 6.5, z]);
    const trolley = new THREE.Group(); root.add(trolley); box(trolley, [1.8, .45, 2.2], yellow, [0, 6.1, 0]);
    const head = new THREE.Group(); head.name = "집게"; trolley.add(head);
    cylinder(head, .30, .45, steel);
    const jaws = [];
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group(); pivot.rotation.y = i * Math.PI / 2; head.add(pivot);
      const jaw = new THREE.Group(); jaw.position.x = .20; pivot.add(jaw);
      tube(jaw, [0, 0, 0], [.55, -.6, 0], .09, yellow); tube(jaw, [.55, -.6, 0], [.12, -.95, 0], .11, steel); jaws.push(jaw);
    }
    const cable = cylinder(trolley, .025, 1, steel, [0, 4.8, 0]);
    const load = new THREE.Group(); load.name = "plastic load in grab"; head.add(load);
    for (let i = 0; i < 20; i++) {const o = plastic(load, i); o.position.set(Math.sin(i * 2) * .35, -.5 + Math.cos(i) * .2, Math.cos(i * 2) * .35); o.rotation.set(i, i * .3, i);}
    KIT.process.part(head, {name: ["집게", "짐"], state: () => head.userData.u || 0});
    return {head, animate(t) {
      const u = .5 + .5 * Math.sin(t * .42 - 1.2); head.userData.u = u;
      trolley.position.x = -1.8 + u * 3.6; head.position.y = 3.9 + Math.sin(u * Math.PI) * .7;
      cable.position.y = (6 + head.position.y) / 2; cable.scale.y = 6 - head.position.y;
      jaws.forEach(j => {j.rotation.z = -.15 - .25 * u;});
    }};
  }
  function truck(parent, xyz = [-6, 0, 2]) {
    const root = new THREE.Group(); root.position.set(...xyz); parent.add(root);
    const steel = mat(0x657f83, .55), dark = mat(0x26343a), rubber = mat(0x20292c, 0, .95);
    box(root, [2.2, .3, 5], dark, [0, .75, 0]); box(root, [2.05, 1.7, 1.6], steel, [0, 1.65, 1.8]);
    box(root, [1.8, .7, .02], mat(0x718e9b, .5, .15), [0, 2, 2.62]);
    box(root, [2.15, .2, .2], mat(0xb7c0b9, .7), [0, .85, 2.65]);
    for (const x of [-1.1, 1.1]) for (const z of [-1.7, -.8, 1.7]) {
      const tire = cylinder(root, .5, .26, rubber, [x, .53, z]); tire.rotation.z = Math.PI / 2;
      const hub = cylinder(root, .25, .28, steel, [x, .53, z]); hub.rotation.z = Math.PI / 2;
    }
    const bed = new THREE.Group(); bed.position.set(0, 1, -1.9); root.add(bed);
    box(bed, [2.2, .15, 3.3], steel, [0, 0, 1.65]);
    for (const x of [-1.05, 1.05]) {
      box(bed, [.1, 1, 3.3], steel, [x, .5, 1.65]);
      for (let z = .3; z < 3.3; z += .5) box(bed, [.13, 1, .06], mat(0x9aaaa8, .6), [x * 1.04, .5, z]);
    }
    box(bed, [2.1, 1, .1], steel, [0, .5, 3.3]);
    for (let i = 0; i < 50; i++) {const o = plastic(bed, i); o.position.set(Math.sin(i * 4) * .8, .3 + (i % 3) * .2, .2 + (i / 50) * 2.8); o.rotation.set(i, i * .7, i * .2);}
    KIT.process.part(bed, {name: ["적재함", "트럭"], state: () => -bed.rotation.x / .6});
    return {root, bed};
  }
  function card(ov, id, caption, top = 170) {
    const c = KIT.info.numCard(ov, {id, caption, left: 1490, top});
    c.box.style.cssText += ";width:340px;box-sizing:border-box;padding:18px 20px;border-left-width:4px;overflow-wrap:anywhere";
    c.box.children[0].style.cssText = "font:700 43px/1.1 var(--ui);color:#b8e5e9;letter-spacing:-1px";
    c.box.children[1].style.cssText = "font:600 27px/1.35 var(--ui);color:#edf5ee;margin-top:10px";
    const src = c.box.lastElementChild; src.style.cssText = "font:500 20px/1.3 var(--ui);color:#c4d1d2;margin-top:10px";
    src.textContent = "출처: 기계연 보도자료";
    return c;
  }
  function note(ov, text, left = 80, top = 160) {
    const o = document.createElement("div"); o.textContent = text;
    o.style.cssText = `position:absolute;left:${left}px;top:${top}px;max-width:650px;font:600 30px/1.4 var(--ui);color:#d3e0df;letter-spacing:2px;opacity:0;text-shadow:0 2px 8px #10202a;background:rgba(12,24,32,.78);padding:8px 16px`;
    ov.append(o); return o;
  }
  function fade(name, t, start = 1, end = Infinity) {
    return KIT.win(t, Math.max(name === "yard" ? .3 : .85, start), Math.min(end, DATA.timeline.modules[name].duration - 1.1), .4);
  }
  function highlight(name, words, t) {
    window.HL = words.slice().reverse().find(w => {const at = KIT.wordT(name, w); return t >= at && t < at + 1.5;}) || "";
  }
  window.P2 = {mat, mesh, box, cylinder, tube, sign, world, plastic, pile, bale, belt, crane, truck, card, note, fade, highlight};
})();
