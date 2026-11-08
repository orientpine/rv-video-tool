SCENES.slide = (() => {
  const NAME = "slide";
  let renderer, set, cam;
  return {
    duration: DATA.timeline.modules[NAME].duration,
    init(r, THREE) {
      renderer = r;
      set = BENCH(THREE);
      cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
    },
    render(t) {
      KIT.camSet(cam, {p: [0.4, 1.6, 3.2], l: [0.4, 0.3, 0], fov: 45});
      const go = KIT.wordT(NAME, "slides");
      window.HL = t >= go && t < go + 1.5 ? "slides" : "";
      set.probe.position.set(-0.6 + 1.2 * KIT.smooth(go, go + 6, t), 0.35, 0);
      renderer.render(set.scene, cam);
    }
  };
})();
