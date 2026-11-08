SCENES.lower = (() => {
  const NAME = "lower";
  let R, K, move, cam, card, zoom, base;
  return {
    duration: DATA.timeline.modules[NAME].duration,
    async init(r, THREE, overlay) {
      R = r; K = KITCHEN(NAME, THREE, r); await K.P.ready;
      move = KIT.process.move(K.shelf.tray, K.shelf.path, {name: "선반"});
      cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 200);
      base = K.view(1.9, 1.5, 3.1);
      card = KIT.info.numCard(overlay, {id: "drop", caption: "선반이 내려오는 거리"});
      const down = KIT.wordT(NAME, "내려옵니다");
      move.set(1); K.shelf.follow();
      zoom = KIT.shot.action(NAME, {t: down - 0.2, dur: 1.5, from: base, at: K.shelf.tray, keep: [K.shelf.tray, K.mina], avoid: [[1400, 140, 1870, 360]], zoom: 1.3});
      move.set(0); K.shelf.follow();
    },
    render(t) {
      const down = KIT.wordT(NAME, "내려옵니다");
      window.HL = t >= down && t < down + 1.5 ? "내려옵니다" : "";
      K.P.update(t);
      K.place(0.35);
      const press = KIT.smooth(down - 1.6, down - 0.6, t) * (1 - KIT.smooth(down + 0.2, down + 1.0, t));
      const hand = K.button.position.clone().addScaledVector(K.n, 0.25 * (1 - press));
      K.mina.pose("point", {target: hand.lerp(new THREE.Vector3(K.mina.position.x, 0.9, K.mina.position.z), 1 - KIT.smooth(down - 2.4, down - 1.6, t))});
      move.set(KIT.smooth(down - 0.3, down + 1.8, t));
      K.shelf.follow();
      KIT.fx.focus(K.shelf.tray);
      KIT.camSet(cam, zoom.at(t));
      card.show(KIT.win(t, down + 2.6, 1e9, 0.4));
      R.render(K.scene, cam);
    }
  };
})();
