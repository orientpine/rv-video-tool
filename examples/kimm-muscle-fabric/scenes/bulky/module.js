(function () {
  const NAME = "bulky", wt = w => KIT.wordT(NAME, w), D = PM_DIR;
  let R, W, rig, cam, burden = 0, h;
  function pose(t) {
    burden = KIT.smooth(h, h + 1.0, t);
    W.person(t, .12 + .03 * Math.sin(t * 2), 0, .22 * burden); W.human.updateMatrixWorld(true); W.cupAtHand(); W.air(t);
  }
  SCENES[NAME] = {
    duration: DATA.timeline.modules[NAME].duration,
    init(renderer) {
      R = renderer; W = HOME(R, {key: 1.4, fill: .55}); W.fill.color.setHex(0x9fb6d8);
      rig = BULKY(W.human); rig.pack.name = "모터 팩";
      KIT.process.part(rig.pack, {name: "모터", state: () => burden});
      h = wt("무겁고");
      const E = D.captionTimes(NAME), dur = DATA.timeline.modules[NAME].duration, tail = D.edges(NAME).tail;
      const low = D.S([1.35, 1.0, 2.25], [-.3, 1.38, -.08], 36), side = D.S([1.75, 1.25, 1.55], [-.35, 1.3, -.1], 34);
      pose(h + 1.0); W.scene.updateMatrixWorld(true);
      KIT.shot.declare(NAME, [{t: 0}]);
      const Z = KIT.shot.action(NAME, {t: h - .1, dur: 1.3, from: low, at: rig.pack, subject: rig.pack.name, keep: [rig.pack], zoom: 1.35, avoid: []});
      cam = D.plan(NAME, low, [{action: Z}, {move: [E[1] + .64, Math.min(E[2] - .64, dur - tail - .05)], to: side}]);
      W.cam = new THREE.PerspectiveCamera(36, 16 / 9, .03, 140);
    },
    render(t) {
      FILM.prep(R); R.toneMappingExposure = .82;
      pose(t); KIT.camSet(W.cam, cam(t));
      W.atmos.update(t, W.cam, {flare: 0, shafts: .45, motes: .6});
      KIT.fx.focus(W.human); D.highlight(NAME, t, ["무겁고"]);
      R.render(W.scene, W.cam);
    },
    show() {}
  };
})();
