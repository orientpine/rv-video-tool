// Text on screen, and the explained part keeps working in the space the text leaves free (TEXT_MOTION, HOWTO 4-2).
// mode.json {"mode": "kit"} uses the KIT parts; {"mode": "still"} is the same scene without them: the camera is the
// plain base shot (a card covers part of the device) and nothing moves while the cards are up, which check_motion
// reports as TEXT_MOTION FAIL. tests/test_text_motion.sh runs both.
SCENES.device = (() => {
  const NAME = "device";
  let renderer, scene, cam, mode, lid, disk, mover, spinner, flows = [], wells, body, cardA, cardB, pic, shot, base;
  const card = (overlay, text, left) => {
    const box = document.createElement("div");
    box.style.cssText = `position:absolute;left:${left}px;top:170px;width:520px;padding:22px 34px;background:${KIT.info.PANEL};` +
      `border-left:8px solid ${KIT.info.ACC};color:${KIT.info.INK};font:700 40px/1.3 var(--ui);opacity:0`;
    box.textContent = text; overlay.append(box);
    return box;
  };
  return {
    duration: DATA.timeline.modules[NAME].duration,
    init(r, THREE, overlay) {
      renderer = r; mode = (DATA["device.mode"] || {}).mode || "kit";
      scene = new THREE.Scene(); scene.background = new THREE.Color(0x1B2B35);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x50606a, .8));
      const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(2, 4, 3); scene.add(sun);
      const desk = new THREE.Mesh(new THREE.BoxGeometry(4, .06, 2.4), new THREE.MeshStandardMaterial({color: 0x6E6A62, roughness: .8}));
      desk.position.y = -.03; scene.add(desk);
      const white = new THREE.MeshStandardMaterial({color: 0xE9EDEF, roughness: .45});
      body = new THREE.Mesh(new THREE.CylinderGeometry(.5, .54, .18, 48), white); body.position.y = .09; body.name = "device"; scene.add(body);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(.45, .02, 8, 48), new THREE.MeshStandardMaterial({color: 0x5A6670}));
      rim.rotation.x = Math.PI / 2; rim.position.y = .19; scene.add(rim);
      const pivot = new THREE.Group(); pivot.position.set(0, .2, -.5); scene.add(pivot);
      const cover = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .03, 48), white); cover.position.z = .5; pivot.add(cover);
      lid = KIT.process.hatch(pivot, {axis: "x", to: -Math.PI * .6, name: "lid", frame: rim});
      disk = new THREE.Group(); disk.name = "disk"; scene.add(disk);
      disk.add(new THREE.Mesh(new THREE.CylinderGeometry(.38, .38, .02, 48), new THREE.MeshStandardMaterial({color: 0xF4F6F7, roughness: .3})));
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .03, 24), new THREE.MeshStandardMaterial({color: 0x26343C}));
      disk.add(hub);
      wells = new THREE.Group(); disk.add(wells);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, x = .27 * Math.cos(a), z = .27 * Math.sin(a);
        const well = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .03, 24), new THREE.MeshStandardMaterial({color: 0x9FB4BF, roughness: .4}));
        well.position.set(x, .01, z); wells.add(well);
        flows.push(KIT.process.exhaust(disk, {seed: 11 + i, count: 3, color: 0x6BD8EE, name: "sample", path: [[.07 * Math.cos(a), .03, .07 * Math.sin(a)], [x, .03, z]]}));
      }
      mover = KIT.process.move(disk, [[0, .5, .7], [0, .5, 0], [0, .2, 0]], {name: "disk"});
      spinner = KIT.process.spin(disk, {axis: "y", turns: 3, name: "disk"});
      cardA = card(overlay, "Light enough to carry in one hand", 1250);
      cardB = card(overlay, "Spinning sends the sample into every well", 80);
      // A meaning that is hard to show by motion ("the whole clinic sees it") gets a rich still picture instead.
      pic = KIT.info.picture(overlay, {src: "clinic", left: 1080, top: 170, width: 720, height: 480});
      cam = new THREE.PerspectiveCamera(40, 16 / 9, .05, 50);
      base = {p: [-.6, 1.5, 2.1], l: [-.75, -.05, 0], fov: 40};   // the plain shot: the device sits under the right card
      // One still shot for the whole scene, moved sideways so neither card covers the device (and it stays central).
      shot = KIT.shot.free(NAME, {from: base, at: body, avoid: [cardA, cardB]});
    },
    render(t) {
      const open = KIT.wordT(NAME, "Open"), light = KIT.wordT(NAME, "light"), spins = KIT.wordT(NAME, "spins");
      const phone = KIT.wordT(NAME, "phone"), kit = mode === "kit", end = phone - .3;
      lid.set(KIT.clamp((t - open) / 1, 0, 1));
      mover.set(KIT.clamp((t - open - .8) / 1.2, 0, 1));
      KIT.fx.reveal(disk, KIT.win(t, open + .2, 1e9, .5));   // the disk fades in while the lid opens, then goes in
      spinner.set(kit ? KIT.clamp((t - open - 2) / (end - open - 2), 0, 1) : 0);   // runs from the moment the disk is in
      for (const f of flows) f.set(kit && t >= spins ? KIT.clamp((t - spins) / (end - .3 - spins), 0, 1) : 0);
      cardA.style.opacity = KIT.win(t, light, spins - .3, .4).toFixed(3);
      cardB.style.opacity = KIT.win(t, spins, end - .3, .4).toFixed(3);
      pic.show(kit ? KIT.win(t, phone, this.duration - .3, .5) : 0);
      if (kit) {
        KIT.fx.pulse(body, t, {on: Math.max(KIT.win(t, 0, open, .4), KIT.win(t, light, spins - .3, .4))});   // emphasis while the device is introduced and while "light" is on screen
        KIT.fx.pulse(wells, t, {on: KIT.win(t, spins, end, .4), period: 1.2});   // the wells fill and glow
      }
      KIT.camSet(cam, kit ? shot.at(t) : base);
      renderer.render(scene, cam);
    }
  };
})();
