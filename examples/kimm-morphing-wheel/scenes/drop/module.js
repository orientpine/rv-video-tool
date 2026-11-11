(function () {
  const NAME = "drop", wt = w => KIT.wordT(NAME, w), D = PM_DIR;
  let R, S, drop, plate, cam, impact, e3;
  SCENES[NAME] = {
    duration: DATA.timeline.modules[NAME].duration,
    init(renderer) {
      R = renderer;
      S = PM_STUDIO.create(R, {bokehY: [.05, 1.1], key: 4});
      plate = WHEEL_STREET.mesh(S.scene, new THREE.CylinderGeometry(.75, .75, .02, 96), WHEEL_STREET.mat(0x050608, {roughness: .22, metalness: .15}), [0, .01, 0]);
      plate.name = "검은 판"; plate.userData.rvProp = true;
      drop = PM_STUDIO.droplet(S.scene);
      impact = 1.55;
      const E = D.captionTimes(NAME), dur = DATA.timeline.modules[NAME].duration; e3 = E[2];
      const a = D.S([0, .16, 1.3], [0, .08, 0], 20), b = D.S([0, .12, .98], [0, .07, 0], 19), c = D.S([.5, .17, .8], [0, .06, 0], 20);
      cam = D.plan(NAME, a, [{move: [E[0] + .64, E[1] - .64], to: b}, {move: [E[1] + .64, e3 - .64], to: c}]);
    },
    render(t) {
      KIT.camSet(W_cam(), cam(t));
      const fall = KIT.smooth(.45, impact, t) ** 1.6, soft = KIT.smooth(wt("느슨하면"), wt("느슨하면") + 1.1, t) - .12 * KIT.win(t, wt("표면장력"), wt("표면장력") + 1.4, .5);
      drop.pose(t, {fall: t < impact ? fall : 1, impact, soft: Math.max(-.12, soft), floorY: .02});
      S.animate(t, {aim: [0, .1, 0], sweep: 6 * KIT.win(t, .5, 3.2, 1.0), sweepPos: [-2.2 + 1.6 * t, 2.2, 2.0], exposure: .95});
      KIT.fx.focus(drop.mesh);
      D.highlight(NAME, t, ["물방울", "표면장력", "느슨하면"]); R.render(S.scene, S.cam);
    },
    show() {}
  };
  function W_cam() { return S.cam; }
})();
