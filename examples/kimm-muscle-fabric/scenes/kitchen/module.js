(function () {
  const NAME = "kitchen", wt = w => KIT.wordT(NAME, w), D = PM_DIR;
  let R, W, cam, a, u = 0, E0c = 0, Ec = 0;
  // Reach -> tremble -> the arm gives out; a second, weaker try during the second line. Absolute in t.
  function reach(t) {
    const r = KIT.smooth(a, a + .65, t), fall = KIT.smooth(a + 1.1, a + 2.1, t);
    const retry = KIT.smooth(a + 3.2, a + 4.2, t) - KIT.smooth(a + 5.1, a + 6.0, t);
    const prep = .07 * KIT.smooth(3.4, 5.6, t) * (1 - r);
    return {u: prep + .28 * r * (1 - fall) + .16 * retry, tremble: .035 * Math.sin(t * 27) * KIT.win(t, a + .25, a + 1.7, .25) + .02 * Math.sin(t * 23) * KIT.win(t, a + 3.6, a + 5.2, .3)};
  }
  function pose(t) { const p = reach(t); u = p.u; W.person(t, p.u, p.tremble); W.cupAtHand(); W.air(t); }
  SCENES[NAME] = {
    duration: DATA.timeline.modules[NAME].duration,
    init(renderer) {
      R = renderer; W = HOME(R, {key: 5.0});
      a = wt("올리기도");
      const E = D.captionTimes(NAME), dur = DATA.timeline.modules[NAME].duration, tail = D.edges(NAME).tail;
      pose(0); W.scene.updateMatrixWorld(true);
      const c = W.cup.getWorldPosition(new THREE.Vector3());
      const V = (o, d) => [o.x + d[0], o.y + d[1], o.z + d[2]];
      // Macro with the window straight behind the cup: camera on the line window -> cup, a little below.
      const wdir = c.clone().sub(new THREE.Vector3(-1.75, 1.78, -.9)).normalize();
      const at = k => V(c, [wdir.x * k, wdir.y * k - .06, wdir.z * k]);
      // Opener: steam rising from the kettle against the low sun in the window (particles, backlit).
      const macro0 = D.S([-1.95, 1.44, .8], [-.95, 1.2, -.5], 30), macro1 = D.S([-1.74, 1.4, .52], [-.93, 1.2, -.5], 29);
      const wide = D.S([2.35, 1.95, 3.95], [-.05, 1.42, -.1], 34);
      const ots = D.S([-1.75, 1.45, 2.15], [.4, 1.76, -.3], 36), ots2 = D.S([-1.55, 1.47, 1.9], [.42, 1.78, -.3], 34);
      const cut1 = E[0] - .64, cutO = E[3] + .66; E0c = cut1; Ec = cutO;
      pose(a + .7); W.scene.updateMatrixWorld(true);
      KIT.shot.declare(NAME, [{t: 0}, {t: cut1}, {t: cutO}]);
      const Z = KIT.shot.action(NAME, {t: Math.max(a + .1, E[1] + .64), dur: 1.4, from: wide, at: W.cup, subject: W.cup.name, keep: [W.cup], zoom: 1.6, avoid: [[1460, 170, 1870, 470]]});
      cam = D.plan(NAME, macro0, [
        {move: [.02, cut1 - .04], to: macro1},
        {cut: cut1, to: wide},
        {action: Z},
        {cut: cutO, to: ots},
        {move: [E[4] + .64, dur - tail - .05], to: ots2}
      ]);
    },
    render(t) {
      FILM.prep(R); R.toneMappingExposure = .85;
      pose(t);
      const c = cam(t); KIT.camSet(W.cam || (W.cam = new THREE.PerspectiveCamera(34, 16 / 9, .03, 140)), c);
      W.atmos.update(t, W.cam, {flare: t < 2.8 ? .35 : .2, shafts: 1});
      if (t < E0c) KIT.fx.focus(W.kettle); else if (t < Ec) KIT.fx.focus(W.human, W.cup); else KIT.fx.focus(W.shelf); D.highlight(NAME, t, ["올리기도", "어깨는"]);
      window.SIMSTATE = {reach: u, cup: W.cup.position.toArray(), problem: "컵이 선반에 닿지 못함"};
      R.render(W.scene, W.cam);
    },
    show() {}
  };
})();
