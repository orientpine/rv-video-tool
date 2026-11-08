SCENES.after = (() => {
  const NAME = "after";
  let R, K, move, cam, cup, home, view;
  return {
    duration: DATA.timeline.modules[NAME].duration,
    async init(r, THREE) {
      R = r; K = KITCHEN(NAME, THREE, r); await K.P.ready;
      move = KIT.process.move(K.shelf.tray, K.shelf.path, {name: "선반"});
      move.set(1); K.shelf.follow();
      cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 200);
      view = K.view(-2.2, 1.4, 3.3, 40, -0.3);
      cup = K.shelf.tray.children.find(o => o.geometry && o.geometry.type === "CylinderGeometry" && o.position.y < 0.07);
      home = cup.position.clone();
    },
    render(t) {
      const take = KIT.wordT(NAME, "컵");
      window.HL = t >= take && t < take + 1.5 ? "컵" : "";
      K.P.update(t); K.steam.update(t, 1);
      K.place(0);
      // Her hand goes to the cup on the lowered shelf, and the cup comes up and towards her.
      const reach = KIT.smooth(take - 0.8, take + 0.4, t), lift = KIT.smooth(take + 0.4, take + 1.8, t);
      cup.position.copy(home).add(new THREE.Vector3(0, 0.12 * lift, 0.18 * lift));
      const target = cup.getWorldPosition(new THREE.Vector3()).lerp(new THREE.Vector3(K.mina.position.x, 1.0, K.mina.position.z), 1 - reach);
      K.mina.pose("point", {target});
      KIT.fx.pulse(K.shelf.root, t, {period: 1.4, amount: 0.7});
      KIT.camSet(cam, view);
      R.render(K.scene, cam);
    }
  };
})();
