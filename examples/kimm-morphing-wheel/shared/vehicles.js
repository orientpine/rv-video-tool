/* Same wheelchair and rider in all street scenes; +X is forward. */
(function () {
  const {box, mesh, rod, mat} = WHEEL_STREET;
  function wheelchair(scene) {
    const root = new THREE.Group(); root.name = "휠체어"; scene.add(root);
    const frame = mat(0xc3c8cb, {metalness: .92, roughness: .2}), fabric = mat(0x1f2c36, {roughness: .9});
    const seat = box(root, [.44, .045, .49], fabric, [-.09, .5705, 0]); seat.name = "좌석";
    const back = box(root, [.045, .39, .49], fabric, [-.3, .765, 0]); back.name = "등받이";
    const wheels = [-.36, .36].map(z => {
      const w = WHEEL_MECH.wheel(root, z, z>0 ? "접촉 바퀴" : "반대 바퀴"); w.root.position.y = .342;
      const rim = mesh(root, new THREE.TorusGeometry(.27, .009, 8, 56), frame, [0, .342, z + Math.sign(z) * .1]);
      rim.name = "푸시 림"; return {...w, rim};
    });
    for (const z of [-.235, .235]) {
      rod(root, [-.3,.3,z], [-.3,1.0,z], frame);
      rod(root, [-.3,.28,z], [.37,.215,z], frame);
      rod(root, [-.3,.3,z], [.15,.555,z], frame);
    }
    rod(root, [0,.34,-.36],[0,.34,.36],frame,.025);
    const footrest = box(root, [.23,.025,.44], mat(0x52616a), [.39,.2016,0]);
    const rider = PM_PEOPLE.rider(root);
    // rv human: left hand is local -X (sideSign l = -1); turned +90 deg about Y it sits on world +Z, the rim of wheel 1.
    const RIM_L = 1;
    rider.rotation.y = Math.PI / 2;
    let state = 0;
    KIT.process.part(root, {name: ["휠체어", "바퀴"], state: () => state});
    return {root, rider, seat, footrest, wheels, pose(t, {x, y = 0, soft = 0, obstacle = false, effort = 0}) {
      state = soft; root.position.set(x, y, 0);
      wheels.forEach(w => { w.pose(-(x + 1.5) / .32, soft, x, y + .342, obstacle); });
      rider.visible = true; rider.position.set(-.12, .185, 0);
      const [rimA, rimB] = wheels.map(w => w.rim);
      root.updateMatrixWorld(true);   // grip reads the rims' world matrices: this frame's chair pose, not the last one
      // Hands on the push rims the way riders hold them: palm on the outer face of the rim at its top-front, facing in,
      // fingers down along the rim, so the hand stays off the tyre (rv clearance: the nearest-vertex default put them into the tread).
      // Already gripping when the scene opens (t0/touch before 0).
      const grip = (hand, rim) => {
        const s = Math.sign(rim.position.z), a = .35;
        const at = root.localToWorld(new THREE.Vector3(.27 * Math.sin(a), .342 + .27 * Math.cos(a), rim.position.z + s * .009));
        // palm on the rim's outer face (normal mostly outward): the hand stays outboard of the rim, 5 cm clear of the chain blocks
        const normal = new THREE.Vector3(.25 * Math.sin(a), .25 * Math.cos(a), s).normalize().transformDirection(root.matrixWorld);
        return {hand, target: rim, at: at.toArray(), normal: normal.toArray(), t0: -1, touch: -.5};
      };
      rider.act(t, {sit: {seat, floor: footrest, back, levers: [rimA, rimB]},
                    grip: [grip("l", RIM_L === 0 ? rimA : rimB), grip("r", RIM_L === 0 ? rimB : rimA)]});
      const spine = rider.getObjectByName("spine");
      spine.rotation.x += effort * .12 + .012 * Math.sin(t * 1.3);
    }};
  }
  function robot(scene, scale = 1, alwaysSoft = false) {
    const root = new THREE.Group(); root.name = "배송 이동체"; root.scale.setScalar(scale); scene.add(root);
    const body = new THREE.Group(); root.add(body);
    const shell = mat(0xadb5b6, {metalness: .2, roughness: .38}), trim = mat(0x365361, {metalness: .35});
    box(body, [.84,.5,.55], shell, [0,.55,0]);
    box(body, [.91,.07,.58], trim, [0,.35,0]);
    box(body, [.72,.025,.5], trim, [0,.817,0]);
    box(body, [.025,.11,.4], mat(0x182831, {metalness: .4}), [.43,.61,0]);
    for (const z of [-.17,.17]) {
      const lens = mesh(body, new THREE.CylinderGeometry(.033,.033,.027,20), mat(0x739cac, {emissive: 0x4c829e, emissiveIntensity: .6}), [.45,.62,z]);
      lens.rotation.z = Math.PI / 2;
    }
    for (let i = 0; i < 6; i++) box(body, [.22,.013,.013], trim, [-.2,.43 + i * .035,.279]);
    mesh(body, new THREE.CylinderGeometry(.065,.065,.05,24), trim, [.15,.85,0]);
    const wheels = [];
    for (const x of [-.32,.32]) for (const z of [-.34,.34]) {
      const w = alwaysSoft ? WHEEL_MECH.airless(root,z,"유연 바퀴") : WHEEL_MECH.wheel(root,z,"이동체 바퀴");
      w.root.scale.setScalar(.54); w.root.position.set(x,.184,z); wheels.push(w);
    }
    let state = 0; KIT.process.part(root, {name: ["이동체", "바퀴"], state: () => state});
    return {root, wheels, pose(t, x, {climb = false, soft = 1, z = -.8} = {}) {
      state = soft; root.position.set(x,0,z);
      const rise = climb ? KIT.smooth(-.42,.15,x) * .18 : 0;
      root.position.y = rise; body.position.y = climb ? .007 * Math.sin(t * 3) : .023 * Math.sin(t * 10);
      body.rotation.z = climb ? -.08 * Math.sin(KIT.clamp((x + .4) / .9,0,1) * Math.PI) : .025 * Math.sin(t * 8);
      wheels.forEach((w,i) => {
        const s = climb ? soft : .7 + .22 * Math.sin(t * 7 + i);
        const unit=.54*scale;
        w.pose(-x / (.173*scale),s,(x+w.root.position.x*scale)/unit,(rise+.184*scale)/unit,climb,.18/unit);
      });
    }};
  }
  window.WHEEL_VEHICLES = {wheelchair, robot};
})();
