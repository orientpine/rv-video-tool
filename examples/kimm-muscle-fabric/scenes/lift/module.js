(function () {
  const NAME = "lift", wt = w => KIT.wordT(NAME, w), D = PM_DIR;
  let R, S, rig, cam, move, mass, load, whole, u = 0, up, E, cutW, dur;
  function pose(t) {
    u = KIT.smooth(up, up + 1.8, t); move.set(u);
    const bottom = rig.load.position.y + .41, top = 2.37, len = top - bottom;
    rig.fabric.scale.y = len; rig.fabric.position.y = (top + bottom) / 2;
    rig.fabric.material.emissive.setHex(0xbf7d3b); rig.fabric.material.emissiveIntensity = .05 + .45 * KIT.win(t, up - .2, up + 2.4, .4);
    rig.led.material.emissiveIntensity = .4 + .15 * Math.sin(t * 3);
    // After the lift the weight hangs from the fabric and swings gently; the fabric glow breathes (picture keeps moving under the cards).
    const hang = KIT.smooth(up + 1.8, up + 2.6, t);
    rig.load.position.x += .035 * Math.sin((t - up) * 2.8) * hang;
    rig.load.rotation.z = -.03 * Math.sin((t - up) * 2.8) * hang;
    rig.fabric.material.emissiveIntensity += .25 * (.5 + .5 * Math.sin(t * 2.4)) * hang;
  }
  SCENES[NAME] = {
    duration: DATA.timeline.modules[NAME].duration,
    init(renderer, T, ov) {
      R = renderer; S = PM_STUDIO.create(R, {bokehY: [.3, 3.0], key: 5.5, floor: 0x1a1d22, glow: [[0, 1.7, -3.4, 4.2, 0xffa860, .30], [-1.6, 1.2, -3.0, 2.4, 0x7fa6ff, .18]]});
      S.rimWarm.intensity = 16; S.rimCool.intensity = 11; S.hemi.intensity = .45;
      S.rimWarm.position.set(2.2, 2.4, -1.8); S.rimCool.position.set(-2.4, 2.0, -1.6); S.key.position.set(-1.8, 3.6, 2.6);
      const W = {scene: S.scene, steel: FILM.mat(0xa5b2b3, .75, .32), dark: FILM.mat(0x37474e, .2, .6)};
      rig = TESTRIG(W);
      move = KIT.process.move(rig.load, [[0, 1.05, 0], [0, 1.51, 0]], {name: "추"});
      KIT.process.part(rig.fabric, {name: "옷감", state: () => u});
      mass = D.card(ov, "fabric", "옷감 무게", {left: 90, top: 190});
      load = D.card(ov, "load", "들어 올리는 하중", {left: 90, top: 420});
      whole = D.card(ov, "whole", "팔꿈치·어깨·허리 보조", {left: 90, top: 190});
      up = wt("올립니다"); E = D.captionTimes(NAME); dur = DATA.timeline.modules[NAME].duration;
      const tail = D.edges(NAME).tail, lead = D.edges(NAME).lead, r = wt("로봇도");
      const hero = D.S([.95, .62, 2.75], [0, 1.42, 0], 36), wide = D.S([2.7, 1.75, 2.7], [0, 1.55, 0], 32), wide2 = D.S([2.15, 1.62, 3.15], [0, 1.55, 0], 32);
      cutW = E[2] + .66;
      pose(up + 1.8); S.scene.updateMatrixWorld(true);
      KIT.shot.declare(NAME, [{t: 0}, {t: cutW}]);
      const Z = KIT.shot.action(NAME, {t: up - .05, dur: 1.85, from: hero, at: rig.load, subject: rig.load.name, keep: [rig.load, rig.fabric], zoom: 1.3, avoid: [[80, 170, 420, 640]]});
      cam = D.plan(NAME, hero, [{action: Z}, {cut: cutW, to: wide}, {move: [cutW + .05, r - .64], to: wide2}], [r, E[0], E[1]]);
      this._r = r;
    },
    render(t) {
      KIT.camSet(S.cam, cam(t)); pose(t);
      S.animate(t, {aim: [0, 1.5, 0], sweep: 8 * KIT.win(t, .3, 2.6, .8), sweepPos: [-1.8 + 1.4 * t, 2.6, 2.3], exposure: 1.05});
      S.scene.updateMatrixWorld(true);
      const r = this._r;
      mass.show(D.fade(t, E[0], r)); load.show(D.fade(t, E[1], r)); whole.show(D.fade(t, r, E[4]));
      KIT.fx.focus(rig.load, rig.fabric); D.highlight(NAME, t, ["올립니다", "로봇도"]);
      window.SIMSTATE = {lift: u, height: rig.load.position.y};
      R.render(S.scene, S.cam);
    },
    show() {}
  };
})();
