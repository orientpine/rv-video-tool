SCENES.inside = (() => {
  const NAME = "inside";
  let R, scene, P, shelf, move, cam, tag, base, zoom;
  return {
    duration: DATA.timeline.modules[NAME].duration,
    async init(r, THREE, overlay) {
      R = r; scene = new THREE.Scene(); P = KIT.place(NAME, scene, {seed: 3, renderer: r}); await P.ready;
      const bench = P.spots.bench;
      shelf = SHELF(THREE);
      // On a test frame above the bench, high enough that the lowered shelf clears the bench top.
      shelf.root.position.set(bench.at[0], bench.at[1] + 0.62, bench.at[2] - 0.2); scene.add(shelf.root);
      const frame = KIT.place.mat("metal", {color: 0x55606a});
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.24, 0.04), frame);
        post.position.set(bench.at[0] + s * 0.42, bench.at[1] + 0.62, bench.at[2] - 0.19); post.castShadow = true; scene.add(post);
      }
      move = KIT.process.move(shelf.tray, shelf.path, {name: "선반"});
      cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 200);
      const c = shelf.root.position;
      base = {p: [c.x + 1.0, c.y + 0.25, c.z + 1.9], l: [c.x, c.y + 0.1, c.z + 0.3], fov: 40};
      tag = KIT.label(overlay, "모터", {target: shelf.root.getObjectByName("motor"), color: "#F2C14E", ink: "#16323C"});
      const down = KIT.wordT(NAME, "내려옵니다");
      move.set(1); shelf.follow();
      zoom = KIT.shot.action(NAME, {t: down - 0.2, dur: 1.6, from: base, at: shelf.tray, keep: [shelf.tray], zoom: 1.6});
      move.set(0); shelf.follow();
    },
    render(t) {
      const motor = KIT.wordT(NAME, "모터"), pull = KIT.wordT(NAME, "끌어냅니다"), down = KIT.wordT(NAME, "내려옵니다");
      window.HL = t >= motor && t < motor + 1.5 ? "모터" : t >= pull && t < pull + 1.5 ? "끌어냅니다" : t >= down && t < down + 1.5 ? "내려옵니다" : "";
      P.update(t);
      // Out first (with "끌어냅니다"), then down (with "내려옵니다"): path point 1 is half way.
      move.set(0.5 * KIT.smooth(pull - 0.4, pull + 1.0, t) + 0.5 * KIT.smooth(down - 0.3, down + 1.4, t));
      shelf.follow();
      KIT.fx.focus(shelf.tray);
      KIT.camSet(cam, zoom.at(t));
      const m = shelf.root.getObjectByName("motor").getWorldPosition(new THREE.Vector3());
      tag.place(cam, m, -260, -60, KIT.win(t, motor, pull - 0.6, 0.3));
      R.render(scene, cam);
    }
  };
})();
