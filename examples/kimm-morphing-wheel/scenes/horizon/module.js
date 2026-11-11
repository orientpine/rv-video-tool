(function () {
  const NAME = "horizon", wt = w => KIT.wordT(NAME, w), D = PM_DIR;
  let R, W, chair, robot, card, paper, title, goal, cam, e3, tT, dur, c1, c2;
  SCENES[NAME] = {
    duration: DATA.timeline.modules[NAME].duration,
    init(renderer, T, ov) {
      R = renderer;
      W = WHEEL_STREET.create(R, false, {shafts: [[-4.6, 2.2, -3.0, .8, .09], [-3.3, 1.9, -1.8, .6, .08], [-2.0, 1.7, -0.9, .5, .07], [-0.6, 1.9, -2.2, .7, .06]], motes: {center: [-0.8, 1.0, 0.6], size: [7, 2.2, 4.5], n: 640, px: .012}});
      chair = WHEEL_VEHICLES.wheelchair(W.scene); robot = WHEEL_VEHICLES.robot(W.scene, .8);
      card = D.card(ov, "ratio", "네 바퀴 이동체 · 바퀴 반지름 대비", {left: 90, top: 190});
      paper = D.tag(ov, "Science Robotics · 표지논문", {left: 90, top: 190});
      goal = D.tag(ov, "목표 시나리오", {left: 1590, top: 160}); goal.box.style.fontWeight = "700";
      title = D.title(ov); title.box.style.top = "176px";
      const E = D.captionTimes(NAME); e3 = E[2]; dur = DATA.timeline.modules[NAME].duration;
      tT = e3 + 2.25;
      const wide = D.S([-3.9, 2.2, 5.6], [.9, 1.0, -.05], 44), low = D.S([-1.25, .34, 2.75], [.15, .32, 1.0], 32);
      const end0 = D.S([-5.3, 1.55, 7.3], [.7, 1.15, -1.0], 40), end1 = D.S([-6.1, 3.05, 8.5], [.6, 1.75, -2.6], 40);
      c1 = wt("1.3배") + 1.27; c2 = E[1] + .66;
      KIT.shot.declare(NAME, [{t: 0}, {t: c1}, {t: c2}]);
      cam = D.plan(NAME, wide, [{cut: c1, to: low}, {cut: c2, to: end0}, {move: [e3 + .64, tT - .64], to: end1}],
        [wt("1.3배"), wt("표지논문"), tT, .5]);
    },
    render(t) {
      KIT.camSet(W.cam, cam(t));
      W.animate(t + 34, {cam: W.cam, atmos: {flare: t > e3 ? .6 : .3, shafts: 1}});
      const ratio = wt("1.3배");
      const x = -1.25 + 2.05 * KIT.smooth(.6, Math.max(ratio + 2.2, 9), t);
      // After the approach both keep rolling slowly toward the door, so the picture beside the end title stays alive (rv TEXT_MOTION).
      robot.pose(t, x + .12 * Math.max(0, t - 9), {climb: true, soft: KIT.win(t, ratio - .9, ratio + 3.2, .7), z: 1.02});
      chair.pose(t, {x: .85 + 2.9 * KIT.smooth(.5, 9.5, t) + .12 * Math.max(0, t - 9.5), y: .18});
      chair.root.position.z = -.62;
      W.door.position.z = 1.65 * KIT.smooth(1.2, 4.2, t);
      card.show(D.fade(t, ratio, wt("표지논문") - .02 > ratio ? Math.min(e3, wt("표지논문")) : e3));
      paper.show(D.fade(t, wt("표지논문"), e3));
      title.show(D.fade(t, tT, dur + 1, .6));
      goal.show(D.fade(t, .5, dur + 1, .35));
      // The low shot (c1..c2) is about the four-wheel robot climbing; the chair passing behind it is not its subject (rv occlude 56-57 s).
      if (t >= c1 && t < c2) KIT.fx.focus(robot.root); else KIT.fx.focus(robot.root, chair.root);
      D.highlight(NAME, t, ["1.3배", "표지논문"]); R.render(W.scene, W.cam);
    },
    show() {}
  };
})();
