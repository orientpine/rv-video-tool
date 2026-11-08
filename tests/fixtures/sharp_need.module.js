/* test_sharp.sh fixture (replaces scene "need" in a project copy): outdoor ground, a textured machine off-centre at ~6 m that turns
   slowly (motion blur), and a KIT.fx.prop pole 1.2 m in front of the lens at the centre. A centre-ray focus lands on the pole and
   softens the machine; the subject focus keeps it sharp. */
(function () {
  const NAME = "need";
  let R, scene, camera, machine, pole;
  function checker() {
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? "#d8dde0" : "#3b4248"; g.fillRect(x * 16, y * 16, 16, 16); }
    g.strokeStyle = "#f2a33a"; g.lineWidth = 3; for (let k = 0; k < 256; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(0, k); g.stroke(); }
    return new THREE.CanvasTexture(c);
  }
  window.SCENES[NAME] = {
    duration: window.DATA.timeline.modules[NAME].duration,
    async init(renderer) {
      R = renderer; scene = new THREE.Scene(); scene.background = new THREE.Color(0xb9c4c9);
      camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 400);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(6, 10, 4); scene.add(sun);
      const gt = checker(); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(60, 60);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({map: gt, color: 0x9a8a72, roughness: 1}));
      ground.rotation.x = -Math.PI / 2; scene.add(ground);
      const tex = checker(), mat = new THREE.MeshStandardMaterial({map: tex, roughness: 0.6});
      machine = new THREE.Group(); machine.name = "machine";
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.6), mat); body.position.y = 0.9; machine.add(body);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 2.4), mat); arm.position.set(0.6, 1.4, 1.4); machine.add(arm);
      machine.position.set(1.6, 0, -6); scene.add(machine);
      pole = KIT.fx.prop(scene, {r: 0.05, h: 3});
    },
    render(t) {
      camera.position.set(0, 1.4, 0.4); camera.lookAt(0, 1.0, -6); camera.updateMatrixWorld(true);
      machine.rotation.y = 0.35 * t; pole.visible = true; pole.position.set(0.02, 1.5, -0.8);
      R.render(scene, camera);
    },
    show() {}
  };
})();
