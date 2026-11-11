SCENES.lower = (() => {
  const NAME = "lower";
  let R, K, move, cam, card, zoom, base;
  return {
    duration: DATA.timeline.modules[NAME].duration,
    async init(r, THREE, overlay) {
      R = r; K = KITCHEN(NAME, THREE, r); await K.P.ready;
      move = KIT.process.move(K.shelf.tray, K.shelf.path, {name: "선반"});
      cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 200);
      base = K.view(-1.9, 1.5, 3.1);
      card = KIT.info.numCard(overlay, {id: "drop", caption: "선반 높이 차"});
      const down = KIT.wordT(NAME, "내려옵니다");
      move.set(1); K.shelf.follow();
      K.scene.updateMatrixWorld(true);
      zoom = KIT.shot.action(NAME, {t: down - 0.2, dur: 1.5, from: base, at: K.shelf.tray, keep: [K.shelf.tray, K.mina], avoid: [[1400, 140, 1870, 360]], zoom: 1.3});
      move.set(0); K.shelf.follow();
    },
    render(t) {
      const down = KIT.wordT(NAME, "내려옵니다");
      window.HL = t >= down && t < down + 1.5 ? "내려옵니다" : "";
      K.P.update(t); K.steam.update(t, 1);
      K.place(0.35, 0.3);   // a step back from the wall: the shelf comes down in front of her, not onto her
      // her fingertip on the button's cap (front face), pressed 6 mm, then back
      K.mina.act(t, {look: K.button.position, press: {target: K.button.position.clone().addScaledVector(K.n, 0.026), normal: K.n,
        t0: down - 2.4, touch: down - 1.0, press: down - 0.6, release: down + 0.2, t1: down + 1.0, depth: 0.006, hand: "l"}});
      move.set(KIT.smooth(down - 0.3, down + 1.8, t));
      K.shelf.follow();
      KIT.fx.pulse(K.shelf.root, t, {period: 1.4, amount: 0.7});
      KIT.fx.focus(K.shelf.tray);
      KIT.camSet(cam, zoom.at(t));
      card.show(KIT.win(t, down + 2.6, DATA.timeline.modules[NAME].duration - 1.4, 0.4));
      R.render(K.scene, cam);
    }
  };
})();
