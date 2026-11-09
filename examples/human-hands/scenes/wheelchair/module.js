SCENES.wheelchair = (() => {
  const NAME = "wheelchair";
  let renderer, set, rider, seat, back, footrest, rims, wheels, tyres, tag;
  return {
    duration: DATA.timeline.modules[NAME].duration,
    init(r, THREE, overlay) {
      renderer = r;
      set = HAND_STUDIO(THREE);
      seat = set.box([0.44, 0.045, 0.44], [0, 0.4775, 0.02], "cushion");
      back = set.box([0.44, 0.42, 0.04], [0, 0.73, -0.24], "seat back");
      footrest = set.box([0.4, 0.025, 0.26], [0, 0.1475, 0.52], "footrest");
      rims = [-0.31, 0.31].map(x => {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.011, 10, 64),
          new THREE.MeshStandardMaterial({color: 0xf2a33a, metalness: 0.5, roughness: 0.35}));
        rim.rotation.y = Math.PI / 2;
        rim.position.set(x, 0.32, 0);
        rim.name = "push rims";
        set.scene.add(rim);
        return rim;
      });
      tyres = [];
      wheels = [-0.41, 0.41].map(x => {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 10, 48),
          new THREE.MeshStandardMaterial({color: 0x273842, roughness: 0.7}));
        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(x, 0.32, 0);
        wheel.name = "wheels";
        tyres.push(wheel);
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.012, 0.012),
          new THREE.MeshStandardMaterial({color: 0xc5d3db, metalness: 0.5, roughness: 0.4}));
        spoke.name = "wheel spoke";
        wheel.add(spoke);
        set.scene.add(wheel);
        return KIT.process.spin(wheel, {axis: "z", turns: 0.2, name: "wheels"});
      });
      rider = KIT.fx.human(set.scene, 1.75, {site: "office", color: 0x4e91aa});
      tag = KIT.label(overlay, "Push rim", {target: rims[1]});
    },
    render(t) {
      const grip = KIT.wordT(NAME, "grips"), turn = KIT.wordT(NAME, "turn");
      for (const wheel of wheels) wheel.set(KIT.smooth(turn, turn + 2.5, t));
      rider.visible = true;
      rider.position.set(0, 0.07, 0.02);
      rider.act(t, {sit: {seat, floor: footrest, back, levers: t >= grip + 0.5 ? rims : [], hand_mm: 30},
        grip: [{hand: "l", target: rims[0], t0: grip - 0.7, touch: grip + 0.5, avoid: [tyres[0]]},
          {hand: "r", target: rims[1], t0: grip - 0.7, touch: grip + 0.5, avoid: [tyres[1]]}]});
      KIT.camSet(set.camera, {p: [2, 1.8, 2.7], l: [0, 0.8, 0.05], fov: 36});
      window.HL = ["turn", "grips", "cushion"].find(k => t >= KIT.wordT(NAME, k) && t < KIT.wordT(NAME, k) + 1.2) || "";
      tag.place(set.camera, rims[1].position, 330, -90, KIT.win(t, grip + 0.5, this.duration - 1.5, 0.3));
      for (const rim of rims) KIT.fx.pulse(rim, t, {on: KIT.win(t, 0, this.duration, 0.4), amount: 0.8});
      KIT.fx.pulse(rider, t, {on: KIT.win(t, 0, this.duration, 0.4), amount: 0.35});
      KIT.fx.focus(rider);
      renderer.render(set.scene, set.camera);
    }
  };
})();
