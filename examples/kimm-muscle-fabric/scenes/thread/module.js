(function () {
  const NAME = "thread", wt = w => KIT.wordT(NAME, w), D = PM_DIR;
  const style = L => { L.box.style.borderLeft = "2px solid #F0B46A"; L.box.style.fontWeight = "500"; L.line.setAttribute("stroke-width", "1.5"); L.dot.setAttribute("r", "4"); L.line.setAttribute("stroke", "#F0B46A"); L.dot.setAttribute("fill", "#F0B46A"); return L; };
  let R, S, loom, macro, cam, card, hairL, coilL, coreL, cutB, cutC, clothState = 0, feedState = 0, E;
  SCENES[NAME] = {
    duration: DATA.timeline.modules[NAME].duration,
    init(renderer, T, ov) {
      R = renderer; S = PM_STUDIO.create(R, {bokehY: [.5, 2.6], key: 2.0});
      const W = {scene: S.scene, steel: FILM.mat(0xa5b2b3, .75, .32), dark: FILM.mat(0x37474e, .2, .6), mint: FILM.mat(0x6e9a85, .2, .55)};
      loom = WEAVER(W); macro = MACRO(W);
      macro.g.remove(macro.backing); macro.g.position.set(0, .95, 0);
      S.rimWarm.intensity = 5; S.rimCool.intensity = 3.5; S.hemi.intensity = .3;
      macro.coils.traverse(o => { if (o.userData.coilIndex !== undefined) o.material.forEach(m => m.color.setHex(0x7d8789)); });
      KIT.process.part(loom.shuttle, {name: "자동 직조기", state: () => feedState});
      KIT.process.part(loom.cloth, {name: "근육옷감", state: () => feedState});
      KIT.process.part(macro.coils, {name: "옷감", state: () => clothState});
      card = D.card(ov, "wire", "형상기억합금 와이어 지름", {left: 90, top: 190});
      const opt = {color: "#0E1318", ink: "#F4F1EC", size: 26};
      hairL = style(KIT.label(ov, "머리카락", {...opt, target: macro.hair}));
      coilL = style(KIT.label(ov, "형상기억합금 코일실", {...opt, target: macro.strand}));
      coreL = style(KIT.label(ov, "천연사 중심실", {...opt, target: macro.core}));
      E = D.captionTimes(NAME);
      const dur = DATA.timeline.modules[NAME].duration, tail = D.edges(NAME).tail, lead = D.edges(NAME).lead;
      cutB = E[2] + .66; cutC = E[4] - .64;
      const A0 = D.S([1.95, 1.25, 2.75], [.55, 1.0, .1], 30), A1 = D.S([1.62, 1.16, 2.15], [.72, 1.02, .12], 28);
      const B0 = D.S([2.95, 1.7, 3.95], [0, 1.25, 0], 36), B1 = D.S([-1.7, 1.62, 4.25], [0, 1.25, 0], 36);
      const C0 = D.S([.98, 1.42, 1.65], [0, 1.08, .1], 34);
      clothState = 0; macro.coils.scale.y = 1; S.scene.updateMatrixWorld(true);
      KIT.shot.declare(NAME, [{t: 0}, {t: cutB}, {t: cutC}]);
      const c = wt("줄어듭니다");
      const mid = FILM.box(macro.coils, [.09, .045, .035], [0, -1.18, .02], FILM.mat(0xb9c2c4, .8, .3)); mid.name = "옷감 끝 집게";
      FILM.box(macro.coils, [1.14, .018, .02], [0, -1.165, .0], FILM.mat(0x3a4448, .5, .5)).name = "옷감 아래 막대";
      macro.coils.scale.y = 1 - .28; S.scene.updateMatrixWorld(true);
      const Z = KIT.shot.action(NAME, {t: c - .08, dur: 1.3, from: C0, at: mid, subject: mid.name, keep: [mid], zoom: 1.7, avoid: []});
      macro.coils.scale.y = 1; S.scene.updateMatrixWorld(true);
      cam = D.plan(NAME, A0, [
        {move: [Math.max(lead + .02, E[0] + .64), E[1] - .64], to: A1},
        {cut: cutB, to: B0},
        {move: [E[3] + .64, cutC - .06], to: B1},
        {cut: cutC, to: C0},
        {action: Z}
      ], [E[1], E[2]]);
    },
    render(t) {
      KIT.camSet(S.cam, cam(t));
      const shotA = t < cutB, shotB = t >= cutB && t < cutC;
      S.rimWarm.intensity = shotB ? 1.6 : 5; S.key.intensity = shotB ? 1.2 : 2.0;
      macro.g.visible = !shotB; macro.comparison.visible = shotA; loom.g.visible = shotB;
      const w = wt("짭니다"), el = Math.max(0, t - w);
      feedState = KIT.clamp(el / 1.2, 0, 1);
      const run = KIT.smooth(w, w + .3, t);
      loom.shuttle.position.x = .36 * Math.sin(el * 8) * run;
      loom.reed.position.z = -.05 + .055 * Math.sin(el * 8) * run;
      loom.heddles.forEach((h, i) => h.position.y = 1.44 + .055 * Math.sin(el * 8 + i * Math.PI) * run);
      loom.rollers.forEach(o => o.rotation.x = t * .35 + el * .30);
      macro.roller.rotation.x = t * .35 + el * .30;
      loom.cloth.material.map.offset.y = -el * .045;
      const c = wt("줄어듭니다");
      clothState = KIT.smooth(c, c + .9, t); macro.coils.scale.y = 1 - .28 * clothState;
      const current = KIT.smooth(wt("전기를"), wt("전기를") + .6, t);
      macro.coils.children.forEach(o => {
        if (o.userData.coilIndex !== undefined) o.material.forEach((m, k) => {
          const ph = t * 4 - o.userData.coilIndex * .12 - k * .85;
          m.emissive.setHex(0xff7a22); m.emissiveIntensity = current * (.25 + 2.4 * Math.pow(.5 + .5 * Math.sin(ph), 3));
        });
      });
      const aim = shotB ? [0, 1.15, 0] : shotA ? [1.0, 1.03, .14] : [0, 1.0, .1];
      S.animate(t, {aim, sweep: 10 * KIT.win(t, .3, 2.8, .9) + 3.5 * KIT.win(t, cutB + .1, cutB + 2.6, .8), sweepPos: shotB ? [-2.4 + 1.6 * (t - cutB), 2.6, 2.4] : [-1.2 + 1.4 * t, 2.2, 2.2], exposure: .9});
      S.scene.updateMatrixWorld(true);
      const la = D.fade(t, E[1], E[2], .3);
      card.show(la);
      const P = o => o.getWorldPosition(new THREE.Vector3());
      hairL.place(S.cam, P(macro.hair), 120, -150, la);
      coilL.place(S.cam, P(macro.strand), -330, -170, la);
      coreL.place(S.cam, P(macro.core).add(new THREE.Vector3(0, -.12, 0)), -330, 120, la);
      KIT.fx.focus(shotB ? loom.g : shotA ? macro.comparison : macro.coils);
      D.highlight(NAME, t, ["코일실", "짭니다", "전기를", "줄어듭니다"]);
      window.SIMSTATE = {shot: shotA ? "macro" : shotB ? "loom" : "contract", contraction: clothState, feed: feedState};
      R.render(S.scene, S.cam);
    },
    show() {}
  };
})();
