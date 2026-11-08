/* Original synthetic exposure target: a thin luminous ring under a pulsed lamp. */
(function () {
  let renderer, scene, camera, material;
  SCENES.chamber = {
    duration: DATA.timeline.modules.chamber.duration,
    init(r) {
      renderer = r;
      scene = new THREE.Scene(); scene.background = new THREE.Color(0x050a10);
      camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      camera.position.z = 5; camera.userData.focus = 5;
      const room = new THREE.Mesh(new THREE.BoxGeometry(18, 14, 18),
        new THREE.MeshStandardMaterial({color: 0x050a10, side: THREE.BackSide}));
      scene.add(room);
      material = new THREE.MeshBasicMaterial({color: 0xffffff});
      scene.add(new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.045, 8, 160), material));
    },
    render(t) {
      const intensity = 0.5 + 0.5 * Math.cos(2 * Math.PI * 15 * t);
      material.color.setRGB(intensity, intensity, intensity);
      renderer.render(scene, camera);
    },
    show() {}
  };
})();
