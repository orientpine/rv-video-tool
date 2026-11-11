/* Original visual vocabulary. Metres, Y up; all animated poses are absolute. */
window.FILM = (() => {
  const mat = (color, metalness = 0, roughness = .65, extra = {}) =>
    new THREE.MeshStandardMaterial({color, metalness, roughness, envMapIntensity:.28, ...extra});
  function mesh(parent, geo, material, p = [0, 0, 0]) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(...p); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  const box = (p, s, at, m) => mesh(p, new THREE.BoxGeometry(...s), m, at);
  const cyl = (p, r, h, at, m) => mesh(p, new THREE.CylinderGeometry(r, r, h, 40), m, at);
  function tube(parent, points, r, material, segments = 64) {
    return mesh(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, r, 8, false), material);
  }
  function texture(kind, repeat = [1, 1]) {
    const c = document.createElement("canvas"); c.width = c.height = 512;
    const g = c.getContext("2d"), rnd = KIT.rng(47);
    g.fillStyle = kind === "wood" ? "#806448" : kind === "cloth" ? "#9a926f" : "#778480";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = `rgba(${rnd() > .5 ? "230,219,188" : "26,39,42"},${.04 + rnd() * .10})`;
      g.fillRect(rnd() * 512, rnd() * 512, kind === "wood" ? 80 + rnd() * 200 : 1, 1);
    }
    if (kind === "cloth") {
      for (let k = 0; k < 512; k += 8) {
        g.fillStyle = "#c0b78e"; g.fillRect(k, 0, 2, 512);
        g.fillStyle = "#615f50"; g.fillRect(0, k, 512, 2);
        g.fillStyle = "#d3c89b"; g.fillRect(k + 2, 0, 1, 512);
      }
    }
    if (kind === "tile") {
      g.strokeStyle = "#3c5555"; g.lineWidth = 5;
      for (let k = 0; k <= 512; k += 128) {
        g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 512); g.stroke();
        g.beginPath(); g.moveTo(0, k); g.lineTo(512, k); g.stroke();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 8;
    return t;
  }
  const fabricMat = () => mat(0x677878, .35, .65, {map: texture("cloth", [2, 3]), side: THREE.DoubleSide});
  let environment;
  function room(R, home = false) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(home ? 0x1c2b36 : 0x24333d);
    scene.fog = new THREE.Fog(scene.background, 10, 25);
    scene.add(new THREE.HemisphereLight(0xb9cadb, 0x444d49, .35));
    const key = new THREE.DirectionalLight(home ? 0xffd2a0 : 0xffe5c7, 1.05);
    key.position.set(-3, 4, 2); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {left:-6, right:6, top:6, bottom:-6, near:.1, far:18});
    key.shadow.bias = -.0003; key.shadow.normalBias=.006; scene.add(key);
    const rim = new THREE.DirectionalLight(0x98b8d7, .28);
    rim.position.set(3, 3, -2); scene.add(rim);
    // Broad neutral bounce from the unseen fourth wall retains readable dark surfaces.
    const bounce=new THREE.DirectionalLight(0xd5d9d2,.58);
    bounce.position.set(1.5,2.5,5);scene.add(bounce);
    if (!environment) {
      const es = new THREE.Scene(); es.background = new THREE.Color(0x18212a);
      for (const [x, color] of [[-4, 0xffddb2], [4, 0xc7e5ff]]) {
        const p = mesh(es, new THREE.PlaneGeometry(5, 4), new THREE.MeshBasicMaterial({color, side:THREE.DoubleSide}), [x, 3, 0]);
        p.lookAt(0, 1, 0);
      }
      const pm = new THREE.PMREMGenerator(R); environment = pm.fromScene(es, .05).texture; pm.dispose();
    }
    scene.environment = environment;
    return scene;
  }
  function prep(R) {
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = .85;
    R.outputEncoding = THREE.sRGBEncoding; R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  function card(ov, id, caption, top = 190) {
    const c = KIT.info.numCard(ov, {id, caption, left:1470, top});
    c.box.style.width = "300px"; c.box.style.padding = "18px 22px";
    c.box.style.borderLeftWidth = "4px";
    c.box.children[0].style.fontSize = "58px";
    c.box.children[0].style.letterSpacing = "-1px";
    c.box.children[1].style.fontSize = "28px";
    c.box.children[1].style.wordBreak = "keep-all";
    c.box.lastElementChild.textContent = "출처: 한국기계연구원";
    c.box.lastElementChild.style.fontSize = "24px";
    return c;
  }
  function tag(ov, text, left = 80, top = 160) {
    const e = document.createElement("div");
    e.textContent = text;
    e.style.cssText = `position:absolute;left:${left}px;top:${top}px;font:600 30px/1.4 var(--ui);color:#eef2ed;background:rgba(23,36,40,.85);padding:12px 20px;border-left:3px solid #d0b87a;opacity:0`;
    ov.append(e); return e;
  }
  function fade(name, t, start, end = Infinity) {
    return KIT.win(t, Math.max(name === "kitchen" ? .1 : .85, start), Math.min(DATA.timeline.modules[name].duration - 1, end), .3);
  }
  function hl(name, keys, t) {
    window.HL = keys.find(k => t >= KIT.wordT(name, k) - .1 && t < KIT.wordT(name, k) + 1.3) || "";
  }
  function plant(parent, at, scale = 1) {
    const g = new THREE.Group(); g.position.set(...at); g.scale.setScalar(scale); parent.add(g);
    mesh(g, new THREE.CylinderGeometry(.12, .085, .18, 24), mat(0x9a6651), [0, .09, 0]);
    const stem = mat(0x465746), leaf = mat(0x56775a);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, x = Math.sin(a) * .13, z = Math.cos(a) * .13, y = .3 + i * .035;
      tube(g, [[0,.16,0], [x*.5,y-.04,z*.5], [x,y,z]], .007, stem);
      const l = mesh(g, new THREE.SphereGeometry(1, 14, 8), leaf, [x, y, z]);
      l.scale.set(.035, .10, .015); l.rotation.set(.3, a, -.4);
    }
    return g;
  }
  return {mat, mesh, box, cyl, tube, texture, fabricMat, room, prep, card, tag, fade, hl, plant};
})();
