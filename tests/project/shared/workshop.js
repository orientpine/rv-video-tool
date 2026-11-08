/* Original synthetic set: boxes, a drum, and a room made only from primitives. */
(function () {
  window.WORKSHOP = function (name, indoor) {
    let renderer, scene, camera, drum, bars;
    return {
      duration: DATA.timeline.modules[name].duration,
      init(r) {
        renderer = r;
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x102533);
        scene.add(new THREE.HemisphereLight(0xe2f5ff, 0x273340, 1.3));
        const light = new THREE.DirectionalLight(0xffffff, 1.8);
        light.position.set(-3, 7, 5); scene.add(light);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40),
          new THREE.MeshStandardMaterial({color: 0x354853, roughness: 0.9}));
        floor.rotation.x = -Math.PI / 2; scene.add(floor);
        if (indoor) {
          const room = new THREE.Mesh(new THREE.BoxGeometry(16, 12, 18),
            new THREE.MeshStandardMaterial({color: 0x182b39, side: THREE.BackSide}));
          room.position.y = 5; scene.add(room);
        }
        camera = new THREE.PerspectiveCamera(43, 16 / 9, 0.1, 150);
        camera.position.set(0, 2.8, 7); camera.lookAt(0, 1.5, 0);
        camera.userData.focus = 7;
        drum = new THREE.Group(); drum.position.y = 1.7; scene.add(drum);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.5, 48),
          new THREE.MeshStandardMaterial({color: 0x4a94ad, roughness: 0.4}));
        body.rotation.x = Math.PI / 2; drum.add(body);
        bars = new THREE.Group(); drum.add(bars);
        for (let i = 0; i < 24; i++) {
          const a = i * Math.PI / 12;
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.08),
            new THREE.MeshStandardMaterial({color: i % 2 ? 0xf5d38b : 0x172a36}));
          bar.position.set(Math.cos(a) * 1.23, Math.sin(a) * 1.23, 0.8);
          bar.rotation.z = a; bars.add(bar);
        }
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7),
          new THREE.MeshStandardMaterial({color: 0xdca855}));
        // Motion checks offset a tracked base for one frame to test teleport detection.
        box.name = "cart";
        Object.assign(box.userData, {track: true, motionRole: "base", motionName: "cart"});
        box.position.set(2.2, 0.35, 0); scene.add(box);
      },
      render(t) {
        drum.rotation.z = t * 13;
        renderer.render(scene, camera);
      },
      show() {}
    };
  };
})();
