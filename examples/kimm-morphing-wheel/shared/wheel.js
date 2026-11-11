/* Original procedural mechanism. SI metres; all poses are functions of scene time. */
(function () {
  const RADIUS = 0.32, HEIGHT = 0.18;
  const UP = new THREE.Vector3(0, 1, 0);
  function mesh(parent, geometry, material, name, p = [0, 0, 0]) {
    const m = new THREE.Mesh(geometry, material);
    m.name = name; m.position.set(...p); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  function link(m, a, b) {
    m.position.copy(a).add(b).multiplyScalar(0.5);
    const d = b.clone().sub(a);
    m.scale.y = d.length();
    m.quaternion.setFromUnitVectors(UP, d.normalize());
  }
  function wheel(parent, z, prefix) {
    const root = new THREE.Group(); root.name = prefix; root.position.z = z; parent.add(root);
    const metal = new THREE.MeshStandardMaterial({color: 0xc9cfd4, metalness: 0.92, roughness: 0.24});
    const rubber = new THREE.MeshStandardMaterial({color: 0x1b1f23, metalness: 0.04, roughness: 0.68});
    const copper = new THREE.MeshStandardMaterial({color: 0xd9a535, metalness: 0.25, roughness: 0.42});
    const anod = new THREE.MeshStandardMaterial({color: 0x2c3238, metalness: 0.7, roughness: 0.32});
    const hub = mesh(root, new THREE.CylinderGeometry(0.066, 0.066, 0.15, 48), metal, prefix + " 허브");
    hub.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
      mesh(hub, new THREE.CylinderGeometry(0.098, 0.098, 0.012, 48), anod, prefix + " 허브 플랜지", [0, s * 0.062, 0]);
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        mesh(hub, new THREE.CylinderGeometry(0.007, 0.007, 0.006, 12), metal, prefix + " 허브 볼트", [Math.cos(a) * 0.078, s * 0.07, Math.sin(a) * 0.078]);
      }
    }
    const shape = new THREE.Shape(), bw = 0.0175, bh = 0.022, br = 0.006;
    shape.moveTo(-bw + br, -bh); shape.lineTo(bw - br, -bh); shape.quadraticCurveTo(bw, -bh, bw, -bh + br);
    shape.lineTo(bw, bh - br); shape.quadraticCurveTo(bw, bh, bw - br, bh); shape.lineTo(-bw + br, bh);
    shape.quadraticCurveTo(-bw, bh, -bw, bh - br); shape.lineTo(-bw, -bh + br); shape.quadraticCurveTo(-bw, -bh, -bw + br, -bh);
    const blockGeo = new THREE.ExtrudeGeometry(shape, {depth: 0.1, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.002, bevelSegments: 2, curveSegments: 3});
    blockGeo.translate(0, 0, -0.05);
    const treadGeo = new THREE.BoxGeometry(0.006, 0.03, 0.026);
    const blocks = [], pins = [], wires = new THREE.Group();
    wires.name = prefix + " 와이어"; root.add(wires);
    const spokes = [], flexures = [];
    for (let i = 0; i < 48; i++) {
      const block = mesh(root, blockGeo, rubber, prefix + " 체인 블록 " + i);
      for (const z of [-0.031, 0.031]) mesh(block, treadGeo, rubber, prefix + " 트레드", [0.019, 0, z]).rotation.x = z > 0 ? 0.35 : -0.35;
      blocks.push(block);
      const pin = mesh(root, new THREE.CylinderGeometry(0.006, 0.006, 0.116, 8), metal, prefix + " 체인 핀 " + i);
      pin.rotation.x = Math.PI / 2; pins.push(pin);
      flexures.push([0, 1].map(() => mesh(root, new THREE.CylinderGeometry(.003, .003, 1, 6), copper, prefix + " 유연 구조체")));
    }
    for (let i = 0; i < 16; i++) {
      spokes.push([mesh(wires, new THREE.CylinderGeometry(0.0025, 0.0025, 1, 6), metal, prefix + " 와이어 안쪽 " + i),
        mesh(wires, new THREE.CylinderGeometry(0.0025, 0.0025, 1, 6), metal, prefix + " 와이어 바깥 " + i)]);
    }
    let slack = 0;
    function pose(angle, soft, cx = -2, cy = 0.34, obstacle = false, obstacleHeight = HEIGHT) {
      slack = soft;
      hub.rotation.y = angle * 0.25;
      const curve = [];
      for (let i = 0; i < 384; i++) {
        const a = angle + i * Math.PI / 192;
        const dx = Math.cos(a), dy = Math.sin(a);
        const radius = RADIUS * (1 + soft * (0.15 * Math.cos(2 * a) - 0.11 * dy));
        let x = dx * radius, y = dy * radius - soft * 0.035;
        y = Math.max(y, -cy + 0.022);
        if (obstacle && cx + x > -0.014 && cy + y < obstacleHeight + 0.022) {
          const hitY = obstacleHeight + 0.022 - cy;
          const hitX = -0.014 - cx;
          const fY = dy < 0 ? hitY / y : 1;
          const fX = dx > 0 ? hitX / x : 1;
          const f = Math.max(0.12, Math.min(1, Math.max(fY, fX)));
          x *= 1 - soft * (1 - f); y *= 1 - soft * (1 - f);
        }
        curve.push(new THREE.Vector3(x, y, 0));
      }
      curve.push(curve[0].clone());
      const lengths = [0];
      for (let i = 1; i < curve.length; i++) lengths.push(lengths[i - 1] + curve[i].distanceTo(curve[i - 1]));
      const points = [];
      let segment = 1;
      for (let i = 0; i < 48; i++) {
        const distance = lengths[384] * i / 48;
        while (lengths[segment] < distance) segment++;
        points.push(curve[segment - 1].clone().lerp(curve[segment],
          (distance - lengths[segment - 1]) / (lengths[segment] - lengths[segment - 1])));
      }
      points.forEach((p, i) => {
        const next = points[(i + 1) % 48];
        pins[i].position.copy(p);
        blocks[i].position.copy(p).add(next).multiplyScalar(0.5);
        const tangent = next.clone().sub(p);
        blocks[i].scale.y = (tangent.length() + 0.003) / 0.044;
        blocks[i].rotation.z = Math.atan2(tangent.y, tangent.x) - Math.PI / 2;
      });
      spokes.forEach(([a, b], i) => {
        const end = points[i * 3].clone();
        const inner = end.clone().normalize().multiplyScalar(0.05);
        const mid = inner.clone().lerp(end, 0.52);
        mid.y -= soft * 0.055; mid.z += soft * 0.016;
        link(a, inner, mid); link(b, mid, end);
      });
      flexures.forEach(([a, b], i) => {
        const p = points[i].clone(), q = points[(i + 2) % 48].clone();
        const mid = p.clone().add(q).multiplyScalar(.34);
        mid.z = .035; link(a, p, mid); link(b, mid, q);
      });
    }
    pose(0, 0);
    return {root, hub, wires, blocks, pose, get slack() { return slack; }};
  }
  // Conventional always-compliant wheel: continuous tread and cellular supports,
  // visually distinct from the smart chain blocks of the morphing wheel.
  function airless(parent,z,prefix) {
    const root=new THREE.Group();root.position.z=z;root.name=prefix;parent.add(root);
    const rubber=new THREE.MeshStandardMaterial({color:0x29383f,roughness:.86});
    const polymer=new THREE.MeshStandardMaterial({color:0x587d86,roughness:.65});
    const metal=new THREE.MeshStandardMaterial({color:0x87989f,metalness:.7,roughness:.3});
    const geo=new THREE.TorusGeometry(.298,.022,10,72),base=geo.attributes.position.array.slice();
    const tread=mesh(root,geo,rubber,prefix+" 연속 트레드");tread.scale.z=2.1;
    const hub=mesh(root,new THREE.CylinderGeometry(.076,.076,.13,32),metal,prefix+" 허브");hub.rotation.x=Math.PI/2;
    const cells=[];
    for(let i=0;i<18;i++)for(let j=0;j<6;j++) {
      const a=i*Math.PI/9,pa=j*Math.PI/3,pb=(j+1)*Math.PI/3;
      const point=p=>new THREE.Vector3(Math.cos(a)*.2+Math.cos(a+p)*.072,Math.sin(a)*.2+Math.sin(a+p)*.072,.045);
      cells.push({a:point(pa),b:point(pb),mesh:mesh(root,new THREE.CylinderGeometry(.007,.007,1,6),polymer,prefix+" 셀 지지대")});
    }
    let slack=1;
    function pose(angle,soft) {
      slack=soft;const c=Math.cos(angle),s=Math.sin(angle);
      const deform=p=>{
        const x=p.x*c-p.y*s,y=p.x*s+p.y*c;
        return new THREE.Vector3(x*(1+.09*soft),Math.max(-.3,y*(1-.13*soft)),p.z);
      };
      const arr=geo.attributes.position.array;
      for(let i=0;i<arr.length;i+=3) {
        const p=deform(new THREE.Vector3(base[i],base[i+1],base[i+2]));
        arr[i]=p.x;arr[i+1]=p.y;arr[i+2]=p.z;
      }
      geo.attributes.position.needsUpdate=true;geo.computeVertexNormals();
      cells.forEach(cell=>link(cell.mesh,deform(cell.a),deform(cell.b)));
    }
    pose(0,1);return {root,hub,pose,get slack(){return slack;}};
  }
  window.WHEEL_MECH = {wheel,airless};
})();

