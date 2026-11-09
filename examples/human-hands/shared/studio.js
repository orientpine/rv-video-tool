/* Primitive office set shared by the hand-goal examples. */
window.HAND_STUDIO = function (THREE) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x20313d);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x526475, 1.8));
  const light = new THREE.DirectionalLight(0xffeed9, 2);
  light.position.set(-3, 5, 4);
  scene.add(light);
  const box = (size, at, name) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size),
      new THREE.MeshStandardMaterial({color: 0x718896, roughness: 0.65}));
    mesh.position.set(...at);
    mesh.name = name;
    scene.add(mesh);
    return mesh;
  };
  box([12, 0.08, 12], [0, -0.04, 0], "office floor");
  const camera = new THREE.PerspectiveCamera(39, 16 / 9, 0.05, 50);
  return {scene, box, camera};
};
