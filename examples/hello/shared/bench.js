/* Original neutral set for the hello example: a plate on a bench and a probe. */
window.BENCH = function (THREE) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2a33);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.6));
  const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 2.4),
    new THREE.MeshStandardMaterial({color: 0x52606b}));
  bench.name = "bench";
  bench.position.y = -0.45;                 // top face at y = -0.05, right under the plate
  scene.add(bench);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 2),
    new THREE.MeshStandardMaterial({color: 0x8899aa}));
  plate.name = "plate";
  scene.add(plate);
  const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6),
    new THREE.MeshStandardMaterial({color: 0xe0a040}));
  probe.name = "probe";                     // the checks look a moving subject up by name
  probe.position.set(0, 0.9, 0);
  scene.add(probe);
  return {scene, plate, probe};
};
