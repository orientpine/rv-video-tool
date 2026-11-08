SCENES.bench = (() => {
  const NAME = "bench";
  let renderer, set, cam, tag;
  return {
    duration: DATA.timeline.modules[NAME].duration,
    init(r, THREE, overlay) {
      renderer = r;
      set = BENCH(THREE);
      cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      tag = KIT.label(overlay, "Plate", {target: set.plate});
    },
    render(t) {
      KIT.camSet(cam, {p: [3, 2.2, 4], l: [0, 0.4, 0], fov: 45});   // a still camera while text comes and goes
      const said = KIT.wordT(NAME, "plate");
      window.HL = t >= said && t < said + 1.5 ? "plate" : "";
      tag.place(cam, set.plate.position, 420, -250, t >= said && t < this.duration - 1.5 ? 1 : 0);
      renderer.render(set.scene, cam);
    }
  };
})();
