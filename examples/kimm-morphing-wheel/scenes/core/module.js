(function () {
  const NAME = "core", wt = w => KIT.wordT(NAME, w), D = PM_DIR;
  let R, S, wheel, tension, collar, wires, blocks, cam, loose = 1, e3;
  SCENES[NAME] = {
    duration: DATA.timeline.modules[NAME].duration,
    init(renderer, T, ov) {
      R = renderer;
      S = PM_STUDIO.create(R);
      wheel = WHEEL_MECH.wheel(S.scene, 0, "모핑 휠"); wheel.root.scale.setScalar(1.7); wheel.root.position.set(0, .342 * 1.7, 0);
      collar = new THREE.Mesh(new THREE.CylinderGeometry(.092, .092, .02, 48), new THREE.MeshStandardMaterial({color: 0x9aa4ab, metalness: .85, roughness: .28}));
      collar.rotation.x = Math.PI / 2; collar.name = "허브 구동판"; collar.castShadow = true; wheel.root.add(collar);
      tension = KIT.process.move(collar, [[0, 0, .11], [0, 0, .082]], {name: ["와이어", "허브"]});
      KIT.process.part(wheel.root, {name: "바퀴", state: () => loose});
      wires = KIT.label(ov, "바퀴살 와이어", {target: wheel.wires, color: "#0E1318", ink: "#F4F1EC", size: 26});
      blocks = KIT.label(ov, "스마트 체인 블록", {target: wheel.blocks[12], color: "#0E1318", ink: "#F4F1EC", size: 26});
      for (const L of [wires, blocks]) { L.box.style.borderLeft = "2px solid #F0B46A"; L.box.style.fontWeight = "500"; L.line.setAttribute("stroke-width", "1.5"); L.dot.setAttribute("r", "4"); L.line.setAttribute("stroke", "#F0B46A"); L.dot.setAttribute("fill", "#F0B46A"); }
      const E = D.captionTimes(NAME), dur = DATA.timeline.modules[NAME].duration, tail = D.edges(NAME).tail; e3 = E[2];
      const pull = wt("당기면");
      const reveal = D.S([2.0, 1.05, 2.5], [0, .56, 0], 30), front = D.S([.7, .78, 2.8], [0, .56, 0], 30);
      const close = D.S([.52, .7, 2.3], [0, .55, 0], 30), low = D.S([.36, .4, 2.45], [0, .55, 0], 31);
      cam = D.plan(NAME, reveal, [
        {move: [D.edges(NAME).lead + .02, E[0] - .64], to: front},
        {move: [pull + .64, E[1] - .64], to: close}
      ], [pull]);
    },
    render(t) {
      KIT.camSet(S.cam, cam(t));
      const pull = wt("당기면"), release = wt("풀어");
      const tight = KIT.smooth(pull, pull + 1.0, t); loose = 1 - tight + KIT.smooth(release, release + 1.0, t);
      tension.set(loose);
      const spin = t * .22;
      wheel.pose(-spin, loose, -3, .342);
      S.animate(t, {aim: [0, .56, 0], sweep: 11 * KIT.win(t, .3, 2.6, .9), sweepPos: [-2.6 + 2.0 * t, 2.4, 2.2], exposure: .95});
      S.scene.updateMatrixWorld(true);
      const a = D.fade(t, pull, e3, .3);
      // Name tags sit at fixed screen spots outside the ring (upper left / upper right) for every camera of the window;
      // block 12 stays on the upper right arc (110 -> 30 deg) while the tags are up, in view of every camera (rv check_layout cut/occlude 29-35 s).
      const hubP = wheel.hub.getWorldPosition(new THREE.Vector3()), blockP = wheel.blocks[12].getWorldPosition(new THREE.Vector3());
      const scr = p => { const v = p.clone().project(S.cam); return [(v.x + 1) * 960, (1 - v.y) * 540]; };
      const [hx, hy] = scr(hubP), [bx, by] = scr(blockP);
      wires.place(S.cam, hubP, 240 - hx, 330 - hy, a);
      blocks.place(S.cam, blockP, 1690 - bx, 330 - by, a);
      KIT.fx.focus(wheel.root);
      D.highlight(NAME, t, ["당기면", "풀어"]); R.render(S.scene, S.cam);
    },
    show() {}
  };
})();
