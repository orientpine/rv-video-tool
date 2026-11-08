SCENES.probe = (() => {
  const NAME = "probe";
  let renderer, set, cam, tag, zoom;
  const start = {p: [3, 2.2, 4], l: [0, 0.4, 0], fov: 45};
  return {
    duration: DATA.timeline.modules[NAME].duration,
    init(r, THREE, overlay) {
      renderer = r;
      set = BENCH(THREE);
      cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      tag = KIT.label(overlay, "Probe", {target: set.probe, color: "#F2C14E", ink: "#16323C"});
      const hit = KIT.wordT(NAME, "touches");
      set.probe.position.set(0, 0.35, 0);   // pose at the end of the zoom
      zoom = KIT.shot.action(NAME, {t: hit - 1, dur: 2, from: start, at: set.probe, keep: [set.probe]});
    },
    render(t) {
      const hit = KIT.wordT(NAME, "touches");
      window.HL = t >= hit && t < hit + 1.5 ? "touches" : "";
      set.probe.position.y = 0.9 - 0.55 * KIT.smooth(hit - 1, hit, t);
      KIT.camSet(cam, zoom.at(t));
      tag.place(cam, set.probe.position, -40, -120, KIT.win(t, hit, hit + 2, 0.3));   // fade in and out (POP_IN)
      renderer.render(set.scene, cam);
    }
  };
})();
