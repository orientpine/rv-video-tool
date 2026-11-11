(function () {
  const NAME = "doorstep", wt = w => KIT.wordT(NAME, w), D = PM_DIR;
  let R, W, chair, card, cam, hit, xAt, Z;
  SCENES[NAME] = {
    duration: DATA.timeline.modules[NAME].duration,
    init(renderer, T, ov) {
      R = renderer;
      W = WHEEL_STREET.create(R, false, {shafts: [[-4.6, 2.2, -3.0, .8, .09], [-3.3, 1.9, -1.8, .6, .08], [-2.0, 1.7, -0.9, .5, .07], [-0.6, 1.9, -2.2, .7, .06]], motes: {center: [-0.8, 1.0, 0.6], size: [7, 2.2, 4.5], n: 640, px: .012}});
      chair = WHEEL_VEHICLES.wheelchair(W.scene);
      card = D.card(ov, "step", "입구의 턱");
      hit = wt("멈춥니다");
      xAt = t => { if (t >= hit) return -0.31 - .055 * KIT.smooth(hit, hit + .6, t); const tau = hit - t; return tau > 1.5 ? -0.31 - .7275 - .72 * (tau - 1.5) : -0.31 - (.25 * tau + .47 * tau * tau / 3); };
      const E = D.captionTimes(NAME), e1 = E[0], e3 = E[2], dur = DATA.timeline.modules[NAME].duration, tail = D.edges(NAME).tail;
      const follow = t => { const x = xAt(t); return D.S([x + .9, .15, 1.2], [x - .1, .46, .2], 28); };
      const est = D.S([-5.9, 1.75, 6.3], [-2.0, .8, -.5], 38);
      const side = D.S([-2.35, .52, 2.55], [-.12, .4, .1], 30);
      const back = D.S([-3.7, 1.55, 1.7], [1.6, .9, -.15], 32), back2 = D.S([-3.3, 1.5, 1.52], [1.6, .9, -.15], 31);
      chair.pose(hit + .2, {x: xAt(hit + .2)}); W.scene.updateMatrixWorld(true);
      Z = KIT.shot.action(NAME, {t: hit - .12, dur: 1.3, from: side, at: chair.wheels[1].root, subject: chair.wheels[1].root.name,
        keep: [chair.wheels[1].root], zoom: 1.9, avoid: [[1470, 170, 1850, 420]]});
      const cutC = e1 + .72, cutD = Math.max(e3, Z.declared) + .66;
      KIT.shot.declare(NAME, [{t: 0}, {t: 2.2}, {t: cutC}, {t: cutD}]);
      KIT.shot.action(NAME, {t: hit - .12, dur: 1.3, from: side, at: chair.wheels[1].root, subject: chair.wheels[1].root.name,
        keep: [chair.wheels[1].root], zoom: 1.9, avoid: [[1470, 170, 1850, 420]]});
      cam = D.plan(NAME, follow(0), [
        {follow: [0, 2.2], fn: follow},
        {cut: 2.2, to: D.S([-6.7, 3.7, 7.3], [-2.4, 1.0, -.6], 36)},
        {move: [2.24, 3.8], to: est},
        {cut: cutC, to: side},
        {action: Z},
        {cut: cutD, to: back},
        {move: [cutD + .05, dur - tail - .05], to: back2}
      ], [wt("18cm"), e3]);
      this._e3 = e3;
    },
    render(t) {
      const c = cam(t);
      KIT.camSet(W.cam, c);
      W.animate(t, {cam: W.cam, atmos: {flare: t < 2.2 ? .55 : t < 3.9 ? .35 : .2, shafts: 1}});
      const x = xAt(t), stopped = Math.max(0, t - hit);
      chair.pose(t, {x, effort: t < hit ? .25 + .1 * Math.sin(t * 4.4) : .45 * Math.exp(-stopped * 1.4)});
      chair.root.rotation.z = -.024 * Math.sin(stopped * 12) * Math.exp(-stopped * 3);
      card.show(D.fade(t, wt("18cm"), this._e3));
      KIT.fx.focus(chair.root);
      D.highlight(NAME, t, ["18cm", "멈춥니다"]); R.render(W.scene, W.cam);
    },
    show() {}
  };
})();
