/* The story example's subject: a wall cabinet whose shelf swings down on two arms, driven by a small motor.
 * SHELF(THREE) -> {root, tray, path, follow()}. The scene moves the tray with KIT.process.move(tray, path, {name: "shelf"})
 * (so ACTION_MATCH sees "the shelf comes down"), then calls follow() so the arms and the motor gear match the tray.
 * Units: metres, +Y up, the cabinet's back is at z = 0, its bottom at y = 0. */
window.SHELF = function (THREE) {
  const mat = (kind, color) => KIT.place.mat(kind, {color, seed: color & 255});
  const wood = mat("wood", 0xc9a57a), white = mat("plastic", 0xeef0ee), steel = mat("metal", 0x9aa4ab);
  const root = new THREE.Group(); root.name = "cabinet";
  const box = (w, h, d, m, x, y, z, name) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true; if (name) o.name = name; return o;
  };
  root.add(box(0.8, 0.6, 0.02, white, 0, 0.3, 0.01), box(0.02, 0.6, 0.34, white, -0.39, 0.3, 0.17),
           box(0.02, 0.6, 0.34, white, 0.39, 0.3, 0.17), box(0.8, 0.02, 0.34, white, 0, 0.59, 0.17));
  const tray = new THREE.Group(); tray.name = "shelf";
  tray.add(box(0.72, 0.025, 0.28, wood, 0, 0, 0), box(0.72, 0.06, 0.012, wood, 0, 0.03, 0.134));
  const jar = new THREE.CylinderGeometry(0.045, 0.045, 0.14, 20), cup = new THREE.CylinderGeometry(0.04, 0.032, 0.09, 20);
  const colours = [0xd9643a, 0x3f7fb5, 0xe8c547, 0x6aa36b, 0xb85c8f];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(i % 2 ? cup : jar, mat("plastic", colours[i]));
    m.position.set(-0.28 + i * 0.14, i % 2 ? 0.058 : 0.083, -0.02 + (i % 3) * 0.03); m.castShadow = true; tray.add(m);
  }
  root.add(tray);
  // A real mechanism has two arms per side (a parallelogram keeps the tray level); one arm each side reads the same on screen.
  const pivots = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.37, 0.52, 0.12); root.add(pivot);
    const arm = box(0.025, 0.04, 1, steel, 0, 0, 0.5); pivot.add(arm); return pivot;
  });
  root.add(box(0.08, 0.08, 0.1, steel, -0.34, 0.52, 0.06, "motor"));
  const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 12), mat("metal", 0xf2a33a));
  gear.rotation.z = Math.PI / 2; gear.position.set(-0.2925, 0.52, 0.06); gear.name = "gear"; root.add(gear);
  const path = [[0, 0.32, 0.17], [0, 0.12, 0.42], [0, -0.38, 0.4]];   // up inside the cabinet -> out -> down at chest height
  const up = new THREE.Vector3(...path[0]), end = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1);
  function follow() {
    for (const p of pivots) {
      end.set(p.position.x, tray.position.y + 0.02, tray.position.z).sub(p.position);
      p.scale.z = end.length(); p.quaternion.setFromUnitVectors(z, end.normalize());
    }
    gear.rotation.x = tray.position.distanceTo(up) * 18;   // the motor turns with how far the tray has travelled
  }
  tray.position.copy(up); follow();
  return {root, tray, path, follow};
};
