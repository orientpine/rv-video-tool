(function () {
  const NAME = "torch", wt = w => KIT.wordT(NAME, w), D = PM_DIR;
  let R, S, T, cam, cards, slow, bar, label, E, ev;
  SCENES[NAME] = {
    duration: DATA.timeline.modules[NAME].duration,
    init(renderer, THREE_, ov) {
      R = renderer;
      S = PM_STUDIO.create(R, {key: 5, bokehY: [.3, 2.4]});
      T = PM_TORCH.create(S.scene);
      E = D.captionTimes(NAME);
      const dur = DATA.timeline.modules[NAME].duration, lead = D.edges(NAME).lead, tail = D.edges(NAME).tail;
      ev = {ignite: wt("100%"), fallT0: wt("플라스틱"), hitT: wt("0.01초")};
      cards = [D.card(ov, "hydrogen", "탄소 생성 억제"), D.card(ov, "temperature", "초고온에서"), D.card(ov, "speed", "혼합 플라스틱 분해")];
      const track = document.createElement("div"); track.style.cssText = "height:3px;margin-top:12px;background:rgba(240,180,106,.25)";
      bar = document.createElement("div"); bar.style.cssText = "height:3px;width:0;background:#F0B46A"; track.append(bar); cards[2].box.append(track);
      slow = D.tag(ov, "반응기 단면 · 느린 재현", {left: 90, top: 190});
      label = KIT.label(ov, "수소 플라즈마 토치", {target: T.torch, color: "#0E1318", ink: "#F4F1EC", size: 26});
      label.box.style.borderLeft = "2px solid #F0B46A"; label.box.style.fontWeight = "500"; label.line.setAttribute("stroke-width", "1.5"); label.dot.setAttribute("r", "4"); label.line.setAttribute("stroke", "#F0B46A"); label.dot.setAttribute("fill", "#F0B46A");
      const reveal0 = D.S([2.5, 1.5, 2.2], [-.25, .92, 0], 32), reveal1 = D.S([1.05, 1.2, 3.1], [-.4, .92, 0], 31);
      const close = D.S([.5, 1.22, 1.62], [-.1, 1.08, 0], 30), wide = D.S([.95, 1.1, 2.3], [.05, .85, 0], 32);
      T.pose(ev.hitT - .08, S.cam, ev); S.scene.updateMatrixWorld(true);
      const Z = KIT.shot.action(NAME, {t: ev.fallT0 - .05, dur: Math.min(1.4, ev.hitT - ev.fallT0 + .25), from: close, at: T.flake, subject: "플라스틱",
        keep: [T.flake, new THREE.Vector3(T.tipX + .1, T.TY, 0)], zoom: 1.6, avoid: [[1470, 170, 1850, 500], [80, 170, 520, 260]]});
      const cutB = E[1] - .7;
      KIT.shot.declare(NAME, [{t: 0}, {t: cutB}]);
      KIT.shot.action(NAME, {t: ev.fallT0 - .05, dur: Math.min(1.4, ev.hitT - ev.fallT0 + .25), from: close, at: T.flake, subject: "플라스틱",
        keep: [T.flake, new THREE.Vector3(T.tipX + .1, T.TY, 0)], zoom: 1.6, avoid: [[1470, 170, 1850, 500], [80, 170, 520, 260]]});
      cam = D.plan(NAME, reveal0, [
        {move: [lead + .02, E[0] - .64], to: reveal1},
        {cut: cutB, to: close},
        {action: Z},
        {move: [E[3] + .64, dur - tail - .05], to: wide}
      ], [ev.ignite]);
    },
    render(t) {
      KIT.camSet(S.cam, cam(t));
      S.animate(t, {aim: [0, .9, 0], sweep: 12 * KIT.win(t, .4, 2.8, .9), sweepPos: [-2.8 + 2.0 * t, 2.4, 2.2], exposure: .9});
      T.pose(t, S.cam, ev);
      S.scene.updateMatrixWorld(true);
      cards[0].show(D.fade(t, ev.ignite, E[1], .3));
      cards[1].show(D.fade(t, E[1], ev.hitT, .3));
      cards[2].show(D.fade(t, ev.hitT, E[3], .3));
      bar.style.width = `${(100 * KIT.smooth(ev.hitT, ev.hitT + 1.1, t)).toFixed(1)}%`;
      slow.show(D.fade(t, ev.fallT0, E[3], .3));
      label.place(S.cam, T.torch.getWorldPosition(new THREE.Vector3()).set(-1.05, T.TY + .1, 0), -40, -150, D.fade(t, ev.ignite, E[1], .3));
      KIT.fx.focus(t < E[1] - .7 ? T.torch : T.flake.visible ? T.flake : T.core);
      D.highlight(NAME, t, ["100%", "플라즈마", "플라스틱", "0.01초", "분해됩니다"]); R.render(S.scene, S.cam);
    },
    show() {}
  };
})();
