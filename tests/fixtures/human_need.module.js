/* test_human.sh fixture (replaces scene "need"): a standing figure beside a box for the whole scene.
   LEGACY = true builds the figure exactly like the pre-2026-11-05 KIT.fx.human (sphere head + five capsules, one material),
   which check_human must report as LEGACY_HUMAN; the test flips it to false to use today's KIT.fx.human. */
(function () {
  const NAME = "need", LEGACY = true;
  let R, scene, camera, man;
  function legacyHuman(sc, h = 1.75, color = 0x2a3238) {
    const m = new THREE.MeshStandardMaterial({color, roughness: 0.8, metalness: 0.05}), g = new THREE.Group(), u = h / 1.75;
    const part = (geo, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x * u, y * u, z * u); g.add(o); return o; };
    part(new THREE.SphereGeometry(0.11 * u, 20, 14), 0, 1.63, 0);
    part(new THREE.CapsuleGeometry(0.17 * u, 0.5 * u, 6, 14), 0, 1.18, 0);
    for (const s of [-1, 1]) { part(new THREE.CapsuleGeometry(0.065 * u, 0.72 * u, 6, 10), 0.1 * s, 0.45, 0);
      const a = part(new THREE.CapsuleGeometry(0.05 * u, 0.55 * u, 6, 10), 0.24 * s, 1.15, 0); a.rotation.z = 0.12 * s; }
    sc.add(g); return g;
  }
  window.SCENES[NAME] = {
    duration: window.DATA.timeline.modules[NAME].duration,
    async init(renderer) {
      R = renderer; scene = new THREE.Scene(); scene.background = new THREE.Color(0xb9c4c9);
      camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 200);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2));
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({color: 0x8a8070}));
      ground.rotation.x = -Math.PI / 2; scene.add(ground);
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5), new THREE.MeshStandardMaterial({color: 0xd0d4d8}));
      box.position.set(1.2, 0.6, 0); scene.add(box);
      man = LEGACY ? legacyHuman(scene) : KIT.fx.human(scene, 1.75);
    },
    render(t) {
      camera.position.set(0, 1.5, 5); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(true);
      man.visible = true; man.position.set(-0.6, 0, 0); if (man.pose) man.pose("stand", {t});
      R.render(scene, camera);
    },
    show() {}
  };
})();
