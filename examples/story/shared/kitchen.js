/* Shared set for the kitchen scenes: KIT.place kitchen, the shelf cabinet on the free wall spot, a wall button, Mina.
 * KITCHEN(NAME, THREE, renderer) -> {scene, P, shelf, button, mina, view(dx, dy, back)}. view() gives a camera state {p, l, fov}
 * looking at the cabinet from the room, so every kitchen scene frames the same place from its own angle. */
window.KITCHEN = function (NAME, THREE, renderer) {
  const scene = new THREE.Scene(), P = KIT.place(NAME, scene, {seed: 7, renderer});
  const wall = P.spots.wall, n = new THREE.Vector3(...wall.normal).normalize();
  const shelf = SHELF(THREE);
  shelf.root.position.set(...wall.at); shelf.root.rotation.y = Math.atan2(n.x, n.z);
  scene.add(shelf.root);
  const side = new THREE.Vector3(n.z, 0, -n.x);   // along the wall, to the cabinet's right
  const button = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.03), KIT.place.mat("plastic", {color: 0xeef0ee}));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 20), KIT.place.mat("plastic", {color: 0xf2a33a}));
  cap.rotation.x = Math.PI / 2; cap.position.z = 0.02; button.add(cap); button.name = "button";
  button.position.set(...wall.at).addScaledVector(side, 0.62).addScaledVector(n, 0.015); button.position.y = 1.25;
  button.rotation.y = shelf.root.rotation.y; scene.add(button);
  const hob = P.spots.hob, steam = KIT.fx.steam(scene, {at: [hob[0] - 0.15, 1.13, hob[2] - 0.12], seed: 7});
  const mina = KIT.fx.human(scene, 1.62, {site: KIT.place.site("kitchen"), color: 0x6f8fa6});
  mina.name = "mina";
  const stand = new THREE.Vector3(...P.spots.stand);
  function place(offset = 0, back = 0) {   // Mina at the standing spot (shifted along the wall, and back from it), facing the wall
    mina.visible = true; mina.position.copy(stand).addScaledVector(side, offset).addScaledVector(n, back); mina.rotation.y = Math.atan2(-n.x, -n.z);
  }
  function view(dx = 0.6, dy = 1.45, back = 3.2, fov = 42, lookY = -0.15) {
    const look = new THREE.Vector3(...wall.at).addScaledVector(n, 0.3); look.y += lookY;
    const p = look.clone().addScaledVector(n, back).addScaledVector(side, dx); p.y = dy;
    return {p: p.toArray(), l: look.toArray(), fov};
  }
  return {scene, P, shelf, button, mina, steam, place, view, side, n};
};
