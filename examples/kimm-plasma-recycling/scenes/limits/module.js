(function () {
  const NAME = "limits", wt = w => KIT.wordT(NAME, w), D = PM_DIR;
  let R, Y, cam, cards, smoke, flames, kiln, feed, mols, useful = 0, E, feedU = 0;
  const H = i => PM_FX.hash(i), F = x => PM_FX.fract(x);
  const KX = -1, KY = 1.45, KZ = -3.6, KL = 6.2;
  SCENES[NAME] = {
    duration: DATA.timeline.modules[NAME].duration,
    init(renderer, THREE_, ov) {
      R = renderer;
      Y = PM_YARD.create(R, {time: "night", pile: false, rainN: 2200});
      const S = Y.scene, steel = new THREE.MeshStandardMaterial({color: 0x3a3f44, roughness: .45, metalness: .6}), dark = new THREE.MeshStandardMaterial({color: 0x26292c, roughness: .7, metalness: .3});
      const plant = new THREE.Group(); plant.name = "소각 시설"; S.add(plant);
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(.8, 1.1, 22, 40), new THREE.MeshStandardMaterial({color: 0x5f5d5a, roughness: .85}));
      stack.position.set(19, 11, -15); stack.castShadow = true; stack.name = "굴뚝"; plant.add(stack);
      for (const y of [5, 10, 15, 20]) { const r = new THREE.Mesh(new THREE.TorusGeometry(1.06 - y * .012, .07, 8, 40), dark); r.rotation.x = Math.PI / 2; r.position.set(19, y, -15); plant.add(r); }
      const flood = new THREE.SpotLight(0xffb070, 3.5, 30, .3, .6, 1.2); flood.position.set(15, .5, -11); flood.target.position.set(19, 14, -15); S.add(flood, flood.target);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), new THREE.MeshBasicMaterial({color: 0xff3a2a, toneMapped: false})); beacon.position.set(19, 22.1, -15); plant.add(beacon);
      plant.traverse(m => { m.userData.rvProp = true; });
      smoke = PM_FX.cloud(S, 520, (i, t, o) => {
        const q = F(H(i) + t * .045), w = H(i + 2) - .5;
        o.p = [19 - q * 7 + w * 2.0 * q + .3 * Math.sin(t * .3 + i), 22.4 + q * 7 + 1.0 * Math.sin(i) * q, -15 + q * 2 + (H(i + 4) - .5) * 2.2 * q];
        o.s = .9 + 6.5 * q * (.6 + .6 * H(i + 6)); const lit = Math.max(0, 1 - q * 2.2);
        o.c = [.46 + .3 * lit, .4 + .16 * lit, .38 + .06 * lit]; o.a = .32 * Math.min(1, q * 10) * (1 - q) * (1 - q);
      }, {soft: 1.1, name: "굴뚝 연기"});
      kiln = new THREE.Group(); kiln.name = "기존 열분해로"; kiln.position.set(KX, KY, KZ); kiln.rotation.z = -Math.PI / 2; S.add(kiln);
      const shell = new THREE.Group(); shell.position.y = -KL / 2; kiln.add(shell);
      shell.add(PM_TORCH.sector(1.0, 1.04, KL, steel, "가마 외벽", 1.15));
      shell.add(PM_TORCH.sector(.88, 1.0, KL, new THREE.MeshStandardMaterial({color: 0xb7a578, roughness: .95}), "단열층", 1.15));
      const ref = PM_TORCH.brickMat({emissive: new THREE.Color(0xff5a1e), emissiveIntensity: .22, color: 0x8a8a8a});
      shell.add(PM_TORCH.sector(.7, .88, KL, ref, "내화 벽돌", 1.15));
      for (const y of [-2.1, 0, 2.1]) { const tyre = new THREE.Mesh(new THREE.TorusGeometry(1.08, .07, 10, 64), steel); tyre.rotation.x = Math.PI / 2; tyre.position.y = y; kiln.add(tyre); }
      for (const x of [-2.1, 2.1]) for (const z of [-.75, .75]) { const roll = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .28, 24), dark); roll.rotation.x = Math.PI / 2; roll.position.set(KX + x, .5, KZ + z); roll.name = "받침 롤러"; S.add(roll); }
      for (const x of [-2.1, 2.1]) { const base = new THREE.Mesh(new THREE.BoxGeometry(.9, .4, 2.2), dark); base.position.set(KX + x, .2, KZ); S.add(base); }
      const hood = new THREE.Mesh(new THREE.CylinderGeometry(.75, 1.15, 1.6, 32), dark); hood.rotation.z = Math.PI / 2; hood.position.set(KX + KL / 2 + .7, KY, KZ); hood.name = "배출 후드"; S.add(hood);
      const burner = new THREE.Mesh(new THREE.CylinderGeometry(.35, .5, 1.2, 24), steel); burner.rotation.z = Math.PI / 2; burner.position.set(KX - KL / 2 - .55, KY, KZ); S.add(burner);
      const chute = new THREE.Mesh(new THREE.BoxGeometry(2.4, .08, .8), steel); chute.position.set(KX - KL / 2 - .2, KY + 1.35, KZ); chute.rotation.z = -.45; S.add(chute);
      feed = new THREE.Group(); feed.name = "혼합 플라스틱"; S.add(feed);
      for (let i = 0; i < 14; i++) { const p = P2.plastic(feed, i); p.scale.setScalar(.38); p.position.set((H(i) - .5) * .5, (H(i + 1)) * .25, (H(i + 2) - .5) * .5); p.rotation.set(i, i * 2, i * .5);
        p.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.multiplyScalar(.6); } }); }
      KIT.process.part(feed, {name: ["혼합 플라스틱", "플라스틱"], state: () => feedU});
      const glow = new THREE.PointLight(0xff7a30, 3.2, 7, 1.5); glow.position.set(KX, KY, KZ + .9); S.add(glow); this._glow = glow;
      flames = PM_FX.cloud(S, 900, (i, t, o) => {
        const q = F(H(i) + t * .55), a = H(i + 3) * 6.283, r = .62 * Math.sqrt(H(i + 5));
        o.p = [KX - KL / 2 + .2 + q * (KL - .3), KY - .35 + Math.abs(r * Math.sin(a)) * .9 + q * .1 + .05 * Math.sin(t * 7 + i), KZ + r * Math.cos(a) * .9];
        o.s = .12 + .24 * H(i + 7) * (1 - q * .5); o.c = [1, .42 + .3 * (1 - q), .12]; o.a = (.28 + .25 * this._roar) * (1 - q) * Math.min(1, q * 8);
      }, {additive: true, soft: 1.5, name: "가마 불꽃", toneMapped: false});
      this._roar = 0;
      mols = Array.from({length: 26}, (_, i) => {
        const good = i % 4 === 0, g = new THREE.Group(); S.add(g);
        const m = P2R.molecule(g, i % 3 === 0, good ? 0x7fe3d8 : [0x8a7a6e, 0x7a6a7e, 0x6e7a6a][i % 3]);
        m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); if (!good) o.material.color.multiplyScalar(.7); } });
        g.userData = {good, m}; g.name = good ? "쓸 수 있는 분자" : "섞인 분자"; return g;
      });
      cards = [D.card(ov, "rate", "화학적 재활용률"), D.card(ov, "old-temperature", "기존 열분해 온도"), D.card(ov, "old-useful", "실제로 쓸 수 있는 화학물질")];
      E = D.captionTimes(NAME);
      const dur = DATA.timeline.modules[NAME].duration, tail = D.edges(NAME).tail, roar = wt("열분해");
      const sky = D.S([12.0, 1.4, 8.5], [18, 16.5, -15], 48);
      const kilnA = D.S([-.6, 2.1, 3.4], [-1.6, 1.4, -3.6], 40);
      const exitA = D.S([6.6, 2.6, 4.4], [3.6, 2.2, -3.2], 36), exitB = D.S([6.0, 2.45, 3.6], [3.7, 2.3, -3.2], 34);
      // '20~30%' card goes to a spot clear of the whole molecule stream (render(): x 5.1~10.6, y 1.3~3.8, z KZ+-1.2, plus molecule size),
      // checked from both cameras the card is shown under (rv check_layout cut).
      const flow = new THREE.Mesh(new THREE.BoxGeometry(6.1, 3.1, 3.0)); flow.position.set(7.85, 2.55, KZ);
      KIT.info.clear(cards[2], {from: exitA, objects: [flow]}); KIT.info.clear(cards[2], {from: exitB, objects: [flow]});
      this._feedAt = t => KIT.smooth(roar - .5, roar + 1.1, t);
      feedU = 1; this._poseFeed(roar + 1.1); S.updateMatrixWorld(true);
      const Z = KIT.shot.action(NAME, {t: roar - .5, dur: 1.6, from: kilnA, at: feed, subject: "혼합 플라스틱", keep: [feed, new THREE.Vector3(KX - KL / 2 + .5, KY, KZ)], zoom: 1.5, avoid: [[1470, 170, 1850, 470]]});
      const cutB = E[1] - .7, cutC = E[2] - .7;
      // '450~600℃' card stays top right (the feed zoom avoids it) and leaves before the cut to the exit view, so it never sits over the molecule stream (rv check_layout cut 21.5 s).
      this._cutC = cutC;
      KIT.shot.declare(NAME, [{t: 0}, {t: cutB}, {t: cutC}]);
      KIT.shot.action(NAME, {t: roar - .5, dur: 1.6, from: kilnA, at: feed, subject: "혼합 플라스틱", keep: [feed, new THREE.Vector3(KX - KL / 2 + .5, KY, KZ)], zoom: 1.5, avoid: [[1470, 170, 1850, 470]]});
      cam = D.plan(NAME, sky, [
        {cut: cutB, to: kilnA},
        {action: Z},
        {cut: cutC, to: exitA},
        {move: [Math.max(E[2], wt("20~30%")) + .64, E[3] - .64], to: exitB}
      ], [wt("1%"), wt("20~30%")]);
    },
    _poseFeed(t) {
      const u = this._feedAt(t); feedU = u;
      feed.position.set(KX - KL / 2 - 1.2 + 1.3 * u, KY + 1.9 - 1.1 * u - .3 * u * u, KZ); feed.rotation.set(t * .3, t * .5, 0);
    },
    render(t) {
      KIT.camSet(Y.cam, cam(t));
      Y.animate(t, Y.cam, {exposure: .95, atmos: {lamp: .7}});
      this._roar = KIT.smooth(wt("열분해") + .2, wt("열분해") + .9, t);
      this._glow.intensity = 3.2 + 2.5 * this._roar + .4 * Math.sin(t * 9);
      this._poseFeed(t); KIT.fx.reveal(feed, 1 - KIT.smooth(wt("열분해") + .9, wt("열분해") + 1.3, t));
      smoke.update(t, Y.cam); flames.update(t, Y.cam);
      useful = KIT.smooth(wt("20~30%"), wt("20~30%") + .6, t);
      mols.forEach((g, i) => {
        const q = F(H(i + 30) + t * .07), x = KX + KL / 2 + .9 + q * 5.5, y = KY + .2 + q * 1.8 + .35 * Math.sin(i * 1.9 + t * .4), z = KZ + (H(i + 40) - .5) * 2.4;
        g.position.set(x, y, z); g.rotation.set(t * .3 + i, t * .4, i); g.scale.setScalar(.55 * (g.userData.good ? 1 + .25 * useful : 1));
        KIT.fx.reveal(g.userData.m, KIT.smooth(0, .08, q) * (1 - KIT.smooth(.85, 1, q)) * (g.userData.good ? 1 : 1 - .45 * useful));
        if (g.userData.good) g.userData.m.traverse(o => { if (o.isMesh && o.material.emissive) { o.material.emissive.setHex(0x3fd0c0); o.material.emissiveIntensity = .9 * useful; } });
      });
      cards[0].show(D.fade(t, wt("1%"), E[1], .3));
      cards[1].show(D.fade(t, E[1], this._cutC, .3));
      cards[2].show(D.fade(t, wt("20~30%"), E[3], .3));
      KIT.fx.focus(t < E[1] - .7 ? Y.scene.getObjectByName("굴뚝") : kiln);
      D.highlight(NAME, t, ["1%", "열분해", "20~30%"]); R.render(Y.scene, Y.cam);
    },
    show() {}
  };
})();
