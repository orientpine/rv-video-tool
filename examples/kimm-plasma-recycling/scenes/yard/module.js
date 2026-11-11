(function () {
  const NAME = "yard", wt = w => KIT.wordT(NAME, w), D = PM_DIR;
  let R, Y, man, cam, Z, grabAt;
  SCENES[NAME] = {
    duration: DATA.timeline.modules[NAME].duration,
    init(renderer, T, ov) {
      R = renderer;
      Y = PM_YARD.create(R, {time: "night"});
      man = PM_PEOPLE.worker(Y.scene); man.position.set(.4, .01, 3.0); man.rotation.y = -2.87;
      this._hero = P2.plastic(Y.scene, 0); this._hero.name = "젖은 병"; this._hero.scale.setScalar(.7); this._hero.position.set(-1.05, .09, 2.35); this._hero.rotation.set(Math.PI / 2, 0, .6);
      this._hero.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.roughness = .12; m.material.envMapIntensity = 1.6; } });
      const E = D.captionTimes(NAME), dur = DATA.timeline.modules[NAME].duration, tail = D.edges(NAME).tail;
      grabAt = wt("선별") + .35;
      const macro0 = D.S([-.75, .2, 3.55], [-1.1, .12, 2.0], 30), macro1 = D.S([-.55, .5, 4.6], [-1.1, .2, 1.7], 34);
      const est = D.S([12.5, 2.6, 15.5], [-1.2, 2.6, -4.5], 36), est2 = D.S([11.4, 2.15, 14.2], [-1.2, 2.5, -4.5], 35);
      const side = D.S([-.5, 1.8, 7.6], [-2.2, 3.6, -2.4], 40);
      const back = D.S([1.9, 1.5, 8.2], [-1.4, .9, -4.2], 40), back2 = D.S([1.7, 1.45, 7.6], [-1.4, .9, -4.2], 39);
      Y.crane.animate(grabAt + .6); Y.scene.updateMatrixWorld(true);
      Z = KIT.shot.action(NAME, {t: grabAt - .45, dur: 1.5, from: side, at: Y.crane.head, subject: Y.crane.head.name, keep: [Y.crane.head], zoom: 1.45});
      const cutB = E[0] - .7, cutC = E[1] - .7, cutD = Math.max(Z.declared || 0, Z.t1 || 0) + .2;
      KIT.shot.declare(NAME, [{t: 0}, {t: cutB}, {t: cutC}, {t: cutD}]);
      KIT.shot.action(NAME, {t: grabAt - .45, dur: 1.5, from: side, at: Y.crane.head, subject: Y.crane.head.name, keep: [Y.crane.head], zoom: 1.45});
      cam = D.plan(NAME, macro0, [
        {move: [0, cutB - .05], to: macro1},
        {cut: cutB, to: est},
        {move: [E[0] + .64, cutC - .05], to: est2},
        {cut: cutC, to: side},
        {action: Z},
        {cut: cutD, to: back},
        {move: [Math.max(cutD + .05, E[2] + .64), dur - tail - .05], to: back2}
      ]);
    },
    render(t) {
      const c = cam(t); KIT.camSet(Y.cam, c);
      Y.animate(t, Y.cam, {craneT: t < grabAt - 2 ? grabAt - 2 : t});
      man.visible = true;
      man.pose("point", {t, target: [-1.4, 1.8 + .1 * Math.sin(t * .6), -3.4]});
      KIT.fx.focus(t < 2.75 ? this._hero : t >= Z.t0 - .05 && t < Z.declared + .3 ? Y.crane.head : Y.pile);
      D.highlight(NAME, t, ["폐플라스틱", "선별"]); R.render(Y.scene, Y.cam);
    },
    show() {}
  };
})();
