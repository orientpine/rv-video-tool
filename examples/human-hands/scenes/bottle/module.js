SCENES.bottle = (() => {
  const NAME = "bottle";
  let renderer, set, man, bottle, shelf, tag;
  return {
    duration: DATA.timeline.modules[NAME].duration,
    init(r, THREE, overlay) {
      renderer = r;
      set = HAND_STUDIO(THREE);
      shelf = set.box([1, 0.03, 0.3], [0.1, 1.465, 0.6], "shelf");
      set.box([0.035, 1.45, 0.035], [-0.36, 0.725, 0.72], "shelf support");
      set.box([0.035, 1.45, 0.035], [0.56, 0.725, 0.72], "shelf support");
      bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 24).translate(0, 0.12, 0),
        new THREE.MeshStandardMaterial({color: 0xf2a33a, roughness: 0.3}));
      bottle.name = "bottle";
      set.scene.add(bottle);
      man = KIT.fx.human(set.scene, 1.75, {site: "office", color: 0x4e91aa});
      KIT.process.move(bottle, [[0.3, 0.9, 0.2], [0.1, 1.48, 0.6]], {name: "bottle"});
      tag = KIT.label(overlay, "Shelf", {target: shelf});
    },
    render(t) {
      const start = KIT.wordT(NAME, "puts"), touch = KIT.wordT(NAME, "shelf");
      man.visible = true;
      man.act(t, {place: {hold: bottle, on: shelf, t0: start, touch, t1: touch + 1.2}});
      KIT.camSet(set.camera, {p: [2.8, 2.1, 3.2], l: [0.1, 1.25, 0.35], fov: 39});
      window.HL = ["shelf", "puts", "goal"].find(k => t >= KIT.wordT(NAME, k) && t < KIT.wordT(NAME, k) + 1.2) || "";
      tag.place(set.camera, shelf.position, 300, -130, KIT.win(t, touch, this.duration - 1.5, 0.3));
      KIT.fx.pulse(bottle, t, {on: KIT.win(t, 0, this.duration, 0.4), amount: 0.7});
      KIT.fx.pulse(man, t, {on: KIT.win(t, 0, this.duration, 0.4), amount: 0.35});
      KIT.fx.focus(bottle);
      renderer.render(set.scene, set.camera);
    }
  };
})();
