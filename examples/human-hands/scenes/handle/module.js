SCENES.handle = (() => {
  const NAME = "handle";
  let renderer, set, man, cabinet, handle, hinge, doorMotion;
  return {
    duration: DATA.timeline.modules[NAME].duration,
    init(r, THREE, overlay) {
      renderer = r;
      set = HAND_STUDIO(THREE);
      cabinet = new THREE.Group();
      cabinet.name = "cabinet";
      cabinet.position.set(0.15, 0.6, 1.25);
      set.scene.add(cabinet);
      const panels = [
        [[0.03, 1.2, 0.6], [-0.385, 0, 0]],
        [[0.03, 1.2, 0.6], [0.385, 0, 0]],
        [[0.8, 0.03, 0.6], [0, 0.585, 0]],
        [[0.8, 0.03, 0.6], [0, -0.585, 0]],
        [[0.8, 1.2, 0.03], [0, 0, 0.285]]
      ];
      for (const [size, at] of panels) cabinet.add(set.box(size, at, "cabinet frame"));
      const rim = new THREE.Shape([[-0.4, -0.6], [0.4, -0.6], [0.4, 0.6], [-0.4, 0.6]].map(([x, y]) => new THREE.Vector2(x, y)));
      rim.holes.push(new THREE.Path([[-0.37, -0.57], [-0.37, 0.57], [0.37, 0.57], [0.37, -0.57]].map(([x, y]) => new THREE.Vector2(x, y))));
      const doorFrame = new THREE.Mesh(new THREE.ExtrudeGeometry(rim, {depth: 0.01, bevelEnabled: false}),
        new THREE.MeshStandardMaterial({color: 0x718896, roughness: 0.65}));
      doorFrame.position.set(0, 0, -0.3);
      doorFrame.name = "door frame";
      cabinet.add(doorFrame);
      hinge = new THREE.Group();
      hinge.position.set(-0.25, 0.6, 0.935);
      hinge.name = "door";
      set.scene.add(hinge);
      const door = set.box([0.8, 1.2, 0.025], [0.4, 0, 0], "door panel");
      hinge.add(door);
      handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 16),
        new THREE.MeshStandardMaterial({color: 0xf2a33a}));
      handle.position.set(0.55, 0.4, -0.02);
      handle.name = "handle";
      hinge.add(handle);
      man = KIT.fx.human(set.scene, 1.75, {site: "office", color: 0x4e91aa});
      doorMotion = KIT.process.hatch(hinge, {axis: "y", to: -0.65, frame: doorFrame, name: ["door", "handle"]});
    },
    render(t) {
      const walk = KIT.wordT(NAME, "approaches"), grip = KIT.wordT(NAME, "grips");
      const release = KIT.wordT(NAME, "release"), open = KIT.wordT(NAME, "opens");
      doorMotion.set(KIT.smooth(open, open + 2, t));
      set.scene.updateMatrixWorld(true);
      man.visible = true;
      man.act(t, {walk: {from: [0, 0, -0.6], to: [0, 0, 0.6], t0: walk, t1: grip},
        look: handle.getWorldPosition(new THREE.Vector3()),
        grip: {target: handle, t0: grip - 0.6, touch: grip + 0.6, release: release - 0.5, t1: release + 0.2, avoid: [cabinet]}});
      KIT.camSet(set.camera, {p: [2.8, 1.9, -2.5], l: [0.15, 1, 0.65], fov: 39});
      window.HL = ["opens", "release", "grips", "approaches"].find(k => t >= KIT.wordT(NAME, k) && t < KIT.wordT(NAME, k) + 1.2) || "";
      KIT.fx.pulse(cabinet, t, {on: KIT.win(t, 0, this.duration, 0.4), amount: 0.45});
      KIT.fx.focus(t < release ? handle : hinge);
      renderer.render(set.scene, set.camera);
    }
  };
})();
