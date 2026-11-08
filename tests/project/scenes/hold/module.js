/* A broad sliding inspection card makes the accumulated endpoint observable.
   Basic material preserves the card's colour in the relief treatment. */
(function () {
  let renderer, scene, camera, card;
  SCENES.hold = {
    duration: DATA.timeline.modules.hold.duration,
    init(r) {
      renderer = r; scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      camera.position.z = 5; camera.userData.focus = 5;
      card = new THREE.Mesh(new THREE.PlaneGeometry(8, 5),
        new THREE.MeshBasicMaterial({color: 0x182735}));
      scene.add(card);
    },
    render(t) {
      card.position.x = Math.sin((t - this.duration + 1 / 30) * 18) * 7;
      renderer.render(scene, camera);
    },
    show() {}
  };
})();
