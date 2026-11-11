(function () {
  const NAME = "plant", wt = w => KIT.wordT(NAME, w), D = PM_DIR;
  let R, S, cam, cards, labels, tanks, flow, stream, heap, heapU = 0, E, levels;
  const H = i => PM_FX.hash(i), F = x => PM_FX.fract(x);
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({color: c, roughness: .45, metalness: .7, ...o});
  function box(p, s, m, at, name) { const o = new THREE.Mesh(new THREE.BoxGeometry(...s), m); o.position.set(...at); o.castShadow = o.receiveShadow = true; if (name) o.name = name; p.add(o); return o; }
  function cyl(p, r, h, m, at, name, r2 = r, seg = 40) { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, seg), m); o.position.set(...at); o.castShadow = o.receiveShadow = true; if (name) o.name = name; p.add(o); return o; }
  function hall(R) {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05080b); scene.fog = new THREE.Fog(0x071016, 9, 34);
    const env = new THREE.Group(); env.name = "공정동"; scene.add(env);
    scene.add(new THREE.HemisphereLight(0x52707e, 0x0c0e10, .38));
    const key = new THREE.SpotLight(0xffd6a8, 6, 30, .55, .6, 1.4); key.position.set(6, 9, 6); key.target.position.set(1, 1.5, -1); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0003; scene.add(key, key.target);
    const rim = new THREE.SpotLight(0x5fd7d0, 5, 26, .6, .6, 1.4); rim.position.set(-6, 6, -9); rim.target.position.set(2, 2, 0); scene.add(rim, rim.target);
    const floor = box(env, [60, .2, 40], std(0x1d2226, {roughness: .22, metalness: .35}), [0, -.1, -4], "공정동 바닥");
    const wall = box(env, [60, 14, .3], new THREE.MeshStandardMaterial({map: PM_YARD.corrugatedTex("#3a4248", 91), roughness: .6, metalness: .45}), [0, 7, -11], "공정동 벽");
    wall.material.map.repeat.set(18, 1);
    const glow = [], steel = [];
    for (let x = -14; x <= 14; x += 3.5) { glow.push({geo: new THREE.BoxGeometry(1, 1, 1), m: new THREE.Matrix4().compose(new THREE.Vector3(x, 10.2, -10.8), new THREE.Quaternion(), new THREE.Vector3(2.6, 1.3, .05)), color: 0x3a6a88});
      steel.push({geo: new THREE.BoxGeometry(1, 1, 1), m: new THREE.Matrix4().compose(new THREE.Vector3(x, 6, -10.4), new THREE.Quaternion(), new THREE.Vector3(.35, 12, .35)), color: 0x3a464d}); }
    for (const y of [4.6, 4.85, 5.1]) steel.push({geo: new THREE.CylinderGeometry(1, 1, 1, 12), m: new THREE.Matrix4().compose(new THREE.Vector3(0, y, -9.4), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), new THREE.Vector3(.09, 40, .09)), color: 0x56636a});
    const sm = new THREE.Mesh(PM_BACK.merge(steel), new THREE.MeshStandardMaterial({vertexColors: true, roughness: .5, metalness: .7})); sm.castShadow = sm.receiveShadow = true; sm.name = "철골과 배관"; env.add(sm);
    const gm = new THREE.Mesh(PM_BACK.merge(glow), new THREE.MeshBasicMaterial({vertexColors: true, toneMapped: false})); gm.name = "높은 창"; env.add(gm);
    const strips = [];
    for (const [x, z] of [[-6, -6], [0, -6], [6, -6], [-3, 0], [3, 0]]) strips.push({geo: new THREE.BoxGeometry(1, 1, 1), m: new THREE.Matrix4().compose(new THREE.Vector3(x, 8.6, z), new THREE.Quaternion(), new THREE.Vector3(2.4, .06, .22)), color: 0xfff0d8});
    const st = new THREE.Mesh(PM_BACK.merge(strips), new THREE.MeshBasicMaterial({vertexColors: true, toneMapped: false})); st.name = "천장 조명"; env.add(st);
    const refl = new THREE.Scene(); refl.background = new THREE.Color(0x06090c);
    for (const [p, col, s] of [[[0, 6, 0], 0xfff0d8, [8, 2]], [[-6, 3, -6], 0x3fb8b0, [3, 4]], [[6, 3, 4], 0xffc890, [3, 3]]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(...s), new THREE.MeshBasicMaterial({color: col, side: THREE.DoubleSide})); m.position.set(...p); m.lookAt(0, 1, 0); refl.add(m); }
    const pm = new THREE.PMREMGenerator(R); scene.environment = pm.fromScene(refl, .03).texture; pm.dispose();
    env.traverse(o => { o.userData.rvProp = true; }); KIT.fx.env(env);
    return scene;
  }
  SCENES[NAME] = {
    duration: DATA.timeline.modules[NAME].duration,
    init(renderer, THREE_, ov) {
      R = renderer; S = hall(R); S.cam = new THREE.PerspectiveCamera(38, 16 / 9, .03, 120);
      const steel = std(0x9aa6ac, {roughness: .28, metalness: .9}), dark = std(0x2c3338), glass = new THREE.MeshPhysicalMaterial({color: 0xbfe8e6, roughness: .05, metalness: 0, transmission: .85, thickness: .05, transparent: true, opacity: .55});
      const col = new THREE.Group(); col.name = "정제탑"; S.add(col);
      cyl(col, .55, 7.2, steel, [-1.6, 3.6, -3.4], "정제탑 몸통");
      for (let y = 1; y < 7; y += 1.2) { const r = cyl(col, .62, .08, dark, [-1.6, y, -3.4]); r.name = "정제탑 띠"; }
      for (const y of [2.4, 4.8]) { box(col, [1.6, .06, 1.6], dark, [-1.6, y, -3.4]); for (let k = 0; k < 4; k++) cyl(col, .02, .9, std(0xc9a64a), [-2.35 + (k % 2) * 1.5, y + .45, -4.15 + Math.floor(k / 2) * 1.5]); }
      tanks = []; levels = [];
      for (const [x, nm] of [[2.4, "에틸렌 저장 탱크"], [5.2, "벤젠 저장 탱크"]]) {
        const g = new THREE.Group(); g.name = nm; S.add(g);
        cyl(g, 1.0, 3.6, steel, [x, 2.0, -3.8]); const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), steel); dome.position.set(x, 3.8, -3.8); dome.scale.y = .4; g.add(dome);
        for (const y of [.8, 1.8, 2.8]) { const r = new THREE.Mesh(new THREE.TorusGeometry(1.01, .03, 8, 48), dark); r.rotation.x = Math.PI / 2; r.position.set(x, y, -3.8); g.add(r); }
        for (const dx of [-.6, .6]) box(g, [.14, .3, .14], dark, [x + dx, .15, -3.8]);
        box(g, [.18, 2.6, .08], dark, [x + .55, 2.0, -2.86]);
        const lv = box(g, [.08, 2.4, .03], new THREE.MeshBasicMaterial({color: 0x7ff0e2, toneMapped: false}), [x + .55, 2.0, -2.8], "액위계"); levels.push(lv);
        tanks.push(g);
      }
      flow = PM_FX.cloud(S, 360, (i, t, o) => {
        const q = F(H(i) + t * .32), k = i % 2, x1 = k ? 5.2 : 2.4, pts = [[-1.6, 5.6, -2.85], [x1 - .1, 5.6, -2.85], [x1 - .1, 4.25, -3.4]];
        const sg = q < .75 ? 0 : 1, u = sg ? (q - .75) / .25 : q / .75, a = pts[sg], b = pts[sg + 1];
        o.p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u + .03 * Math.sin(i), a[2] + (b[2] - a[2]) * u + .03 * Math.cos(i)];
        o.s = .05; o.c = k ? [.55, 1, .9] : [.6, .95, 1]; o.a = .55 * Math.min(1, t * .8);
      }, {additive: true, soft: 1.8, name: "원료 흐름", toneMapped: false});
      for (const x1 of [2.4, 5.2]) {
        const a = new THREE.Vector3(-1.6, 5.6, -2.85), b = new THREE.Vector3(x1 - .1, 5.6, -2.85), c = new THREE.Vector3(x1 - .1, 4.25, -3.4);
        for (const [p, q] of [[a, b], [b, c]]) { const len = p.distanceTo(q), m = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, len, 20, 1, true), glass); m.position.copy(p).add(q).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.clone().sub(p).normalize()); m.name = "유리 배관"; m.userData.rvProp = true; S.add(m); }
      }
      const spout = new THREE.Group(); spout.name = "원료 배출구"; S.add(spout);
      cyl(spout, .5, .9, steel, [8.6, 2.75, .4], "호퍼", .14); cyl(spout, .14, .5, steel, [8.6, 2.05, .4]);
      box(spout, [.12, .12, 1.7], dark, [8.6, 2.95, -.45]); box(spout, [.2, 3.1, .2], dark, [8.6, 1.55, -1.3]);
      const tray = new THREE.Mesh(new THREE.CylinderGeometry(.75, .8, .04, 48), std(0x3a4248, {roughness: .35})); tray.position.set(8.6, .02, .4); tray.name = "받침 판"; tray.userData.rvProp = true; S.add(tray);
      const parts = [], rr = KIT.rng(515);
      for (let i = 0; i < 900; i++) { const a = rr() * 6.283, r = .55 * Math.sqrt(rr()), h = .5 * (1 - r / .55) ** 1.2 * rr() ;
        parts.push({geo: new THREE.SphereGeometry(1, 8, 6), m: new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(.016, .012, .016)), color: [0xf2f4ee, 0xe6efe9, 0xdfe9ef][i % 3]}); }
      heap = new THREE.Mesh(PM_BACK.merge(parts), new THREE.MeshPhysicalMaterial({vertexColors: true, roughness: .18, transmission: .25, thickness: .01, clearcoat: .8}));
      heap.position.set(8.6, .04, .4); heap.name = "새 원료 알갱이"; heap.castShadow = true; S.add(heap);
      KIT.process.part(heap, {name: ["원료", "알갱이"], state: () => heapU});
      const pellLamp = new THREE.SpotLight(0xfff1dc, 7, 8, .38, .5, 1.3); pellLamp.position.set(10.6, 4.2, 3.2); pellLamp.target.position.set(8.6, .6, .4); S.add(pellLamp, pellLamp.target);
      stream = PM_FX.cloud(S, 420, (i, t, o) => {
        const q = F(H(i) + t * 1.4); o.p = [8.6 + (H(i + 1) - .5) * .06, 1.78 - q * 1.3, .4 + (H(i + 2) - .5) * .06];
        o.s = .022; o.c = [.95, .98, .96]; o.a = .9 * Math.min(1, q * 6);
      }, {soft: 3, name: "알갱이 줄기"});
      cards = [D.card(ov, "yield", "생성물 중 에틸렌·벤젠", {left: 90, top: 190}), D.card(ov, "purity", "정제 후 순도", {left: 90, top: 190})];
      labels = [["에틸렌", tanks[0]], ["벤젠", tanks[1]]].map(([txt, tk]) => {
        const L = KIT.label(ov, txt, {target: tk, color: "#0E1318", ink: "#F4F1EC", size: 28});
        L.box.style.borderLeft = "2px solid #7FE3D8"; L.box.style.fontWeight = "500"; L.line.setAttribute("stroke-width", "1.5"); L.dot.setAttribute("r", "4"); L.line.setAttribute("stroke", "#7FE3D8"); L.dot.setAttribute("fill", "#7FE3D8");
        return L;
      });
      E = D.captionTimes(NAME);
      const lead = D.edges(NAME).lead, pour = wt("원료");
      const wideA = D.S([9.6, 3.3, 10.2], [1.4, 2.7, -2.6], 38), wideB = D.S([8.6, 3.05, 8.9], [1.6, 2.7, -2.6], 37);
      const pell = D.S([10.9, 1.7, 3.6], [8.6, .8, .4], 30);
      // Pellets pour from the cut on (motion beside the purity text, rv TEXT_MOTION); the heap keeps growing through the zoom.
      const cutB = E[1] + .66; this._cutB = cutB;
      this._heapAt = t => KIT.smooth(cutB, pour + 2.4, t);
      heapU = 1; this._poseHeap(pour + 1.1); S.updateMatrixWorld(true);
      // Shallower zoom that lands before the hero hold: mid-push motion blur at 51 s failed rv SHARP (fidelity 0.16, then 0.28
      // with a 2.0 s push). The push sits between the caption chunk change (49.06 s) and the caption end (51.50 s), 0.6 s clear of both.
      const Z = KIT.shot.action(NAME, {t: pour - .57, dur: 1.2, from: pell, at: heap, subject: "새 원료 알갱이", keep: [heap], zoom: 1.35, avoid: [[80, 170, 520, 420]]});
      KIT.shot.declare(NAME, [{t: 0}, {t: cutB}]);
      KIT.shot.action(NAME, {t: pour - .57, dur: 1.2, from: pell, at: heap, subject: "새 원료 알갱이", keep: [heap], zoom: 1.35, avoid: [[80, 170, 520, 420]]});
      cam = D.plan(NAME, wideA, [
        {move: [wt("70~80%") + .64, wt("에틸렌") - .64], to: wideB},
        {cut: cutB, to: pell},
        {action: Z}
      ], [wt("70~80%"), wt("에틸렌"), wt("벤젠"), wt("99%")]);
    },
    _poseHeap(t) { const u = this._heapAt(t); heapU = u; heap.scale.set(.75 + .25 * u, .25 + .75 * u, .75 + .25 * u); },
    render(t) {
      KIT.camSet(S.cam, cam(t));
      R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = .95; R.outputEncoding = THREE.sRGBEncoding;
      flow.update(t, S.cam);
      const pour = wt("원료"); this._poseHeap(t);
      stream.update(t, S.cam, KIT.smooth(this._cutB, this._cutB + .4, t));
      // Gauges rise in the wide shot only; after the cut they stand still behind the purity card.
      const tl = Math.min(t, this._cutB);
      levels.forEach((lv, k) => { const u = .25 + .65 * KIT.smooth(.5, 9, tl + k * .6); lv.scale.y = u; lv.position.y = .8 + 1.2 * u; });
      // Each tank glows while its label is up (motion beside the text in the held wide shot).
      KIT.fx.pulse(tanks[0], t, {on: D.fade(t, wt("에틸렌"), E[1], .3), color: 0x7FE3D8});
      KIT.fx.pulse(tanks[1], t, {on: D.fade(t, wt("벤젠"), E[1], .3), color: 0x7FE3D8});
      cards[0].show(D.fade(t, wt("70~80%"), E[1], .3));
      cards[1].show(D.fade(t, wt("99%"), E[3], .3));
      S.updateMatrixWorld(true);
      labels[0].place(S.cam, new THREE.Vector3(2.4, 4.2, -3.2), -150, -70, D.fade(t, wt("에틸렌"), E[1], .3));
      labels[1].place(S.cam, new THREE.Vector3(5.2, 4.2, -3.2), 60, -90, D.fade(t, wt("벤젠"), E[1], .3));
      KIT.fx.focus(t < E[1] + .66 ? tanks[0] : heap);
      D.highlight(NAME, t, ["70~80%", "에틸렌", "벤젠", "99%", "원료"]); R.render(S, S.cam);
    },
    show() {}
  };
})();
