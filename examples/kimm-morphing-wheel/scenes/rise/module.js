(function () {
  const NAME = "rise", wt = w => KIT.wordT(NAME, w), D = PM_DIR;
  let R, W, chair, card, cam, hit, up, dur, e3, Z, cutC;
  const pathAt = t => {
    const c = KIT.smooth(hit, up + .55, t), dep = KIT.smooth(up + .55, dur, t);
    const x = t < hit ? -.30 - .9 * (hit - t) : -.30 + .64 * c + .55 * dep;
    return {x, y: .18 * Math.sqrt(c), c};
  };
  SCENES[NAME] = {
    duration: DATA.timeline.modules[NAME].duration,
    init(renderer, T, ov) {
      R = renderer;
      W = WHEEL_STREET.create(R, false, {shafts: [[-4.6, 2.2, -3.0, .8, .09], [-3.3, 1.9, -1.8, .6, .08], [-2.0, 1.7, -0.9, .5, .07], [-0.6, 1.9, -2.2, .7, .06]], motes: {center: [-0.8, 1.0, 0.6], size: [7, 2.2, 4.5], n: 640, px: .012}});
      chair = WHEEL_VEHICLES.wheelchair(W.scene);
      card = D.card(ov, "step", "휠체어 실험");
      hit = wt("닿는 순간"); up = wt("오릅니다"); dur = DATA.timeline.modules[NAME].duration;
      const E = D.captionTimes(NAME), lead = D.edges(NAME).lead, tail = D.edges(NAME).tail; e3 = E[2];
      const follow = t => { const p = pathAt(t); return D.S([p.x + .95, .27, 1.3], [p.x + .25, .32, .3], 28); };
      const hero = D.S([-.32, .3, 2.15], [-.18, .3, .3], 34);
      const p0 = pathAt(hit + .9); chair.pose(hit + .9, {x: p0.x, y: p0.y, soft: .9, obstacle: true}); W.scene.updateMatrixWorld(true);
      // Cut to the door view 0.66 s after the second caption starts, and bring the '18cm' card up 0.66 s after the cut:
      // no camera change within 0.6 s of any text change (rv text_camera_motion 45.9 s), card read time 2.2 s.
      cutC = E[1] + .66;
      KIT.shot.declare(NAME, [{t: 0}, {t: E[0] - .7}, {t: cutC}]);
      Z = KIT.shot.action(NAME, {t: hit + .1, dur: 2.2, from: hero, at: chair.wheels[1].root, subject: chair.wheels[1].root.name,
        keep: [chair.wheels[1].root], zoom: 1.35, avoid: [[1470, 170, 1850, 420]]});
      const door = D.S([-2.9, 1.5, 3.3], [1.2, .75, -.2], 32), door2 = D.S([-2.55, 1.45, 3.0], [1.3, .75, -.2], 32);
      cam = D.plan(NAME, follow(lead), [
        {follow: [lead + .02, E[0] - .72], fn: follow},
        {cut: E[0] - .7, to: hero},
        {action: Z},
        {cut: cutC, to: door},
        {move: [e3 + .64, dur - tail - .05], to: door2}
      ], [cutC + .66, e3]);   // the card's own appear/leave times
    },
    render(t) {
      KIT.camSet(W.cam, cam(t));
      W.animate(t + 22, {cam: W.cam, atmos: {flare: t < hit + .1 ? .45 : .7, shafts: 1}});
      const p = pathAt(t), soft = KIT.smooth(hit, hit + .5, t) * (1 - KIT.smooth(up + .4, up + 1.4, t));
      chair.pose(t, {x: p.x, y: p.y, soft, obstacle: true, effort: .2 + soft * .45});
      chair.root.rotation.z = .02 * Math.sin(p.c * Math.PI);
      // The '18cm' card comes up in the door shot after the cut, never across it over the climbing chair (rv check_layout cut 45.5 s).
      card.show(D.fade(t, cutC + .66, e3));
      KIT.fx.focus(chair.wheels[1].root);
      D.highlight(NAME, t, ["닿는 순간", "감싸", "오릅니다", "18cm"]); R.render(W.scene, W.cam);
    },
    show() {}
  };
})();
