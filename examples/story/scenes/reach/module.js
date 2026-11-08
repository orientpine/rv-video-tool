SCENES.reach = (() => {
  const NAME = "reach";
  let R, K, cam, tag, start;
  return {
    duration: DATA.timeline.modules[NAME].duration,
    async init(r, THREE, overlay) {
      R = r; K = KITCHEN(NAME, THREE, r); await K.P.ready;
      cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 200);
      start = K.view(2.1, 1.45, 3.0);
      tag = KIT.label(overlay, "맨 위 칸", {target: K.shelf.root, color: "#F2C14E", ink: "#16323C"});
    },
    render(t) {
      const top = KIT.wordT(NAME, "맨 위 칸"), cant = KIT.wordT(NAME, "닿지 않습니다");
      window.HL = t >= top && t < top + 1.5 ? "맨 위 칸" : t >= cant && t < cant + 1.5 ? "닿지 않습니다" : "";
      K.P.update(t);
      K.place(-0.05);
      // She lifts her arm toward the cups and stops short: the reach rises, then sinks back a little and holds.
      const lift = KIT.smooth(cant - 1.2, cant + 0.2, t) - 0.25 * KIT.smooth(cant + 0.8, cant + 2.0, t);
      const aim = new THREE.Vector3(...K.P.spots.wall.at).addScaledVector(K.n, 0.2); aim.y = 1.0 + 0.55 * lift;
      K.mina.pose("point", {target: aim});
      KIT.camSet(cam, start);
      tag.place(cam, new THREE.Vector3(...K.P.spots.wall.at).addScaledVector(K.n, 0.17).setY(K.P.spots.wall.at[1] + 0.3), 220, -40, KIT.win(t, top, top + 3.2, 0.3));
      R.render(K.scene, cam);
    }
  };
})();
