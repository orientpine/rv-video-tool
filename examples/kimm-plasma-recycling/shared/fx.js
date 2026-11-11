/* Soft particles as real points (smoke, steam, rain mist, plasma, sparks, lamp halos). Each particle is a pure function of
   time, so motion-blur sub-samples and parallel capture agree. Points (not sprites or flat cards) so rv's depth/normal
   passes see 1-px points instead of square quads. */
(function () {
  const VS = `
    attribute float size; attribute float alpha; attribute vec3 tint;
    uniform float uScale; varying float vA; varying vec3 vC;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(size * uScale / max(0.05, -mv.z), 1.0, 160.0);
      vA = alpha; vC = tint;
    }`;
  const FS = `
    uniform float uSoft; varying float vA; varying vec3 vC;
    void main() {
      vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
      if (r > 1.0) discard;
      float a = vA * pow(1.0 - r * r, uSoft);
      gl_FragColor = vec4(vC, a);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`;
  // cloud(parent, n, fn, o): fn(i, t, out) fills out = {p:[x,y,z], s: size m, a: alpha, c:[r,g,b]} for particle i at time t.
  function cloud(parent, n, fn, o = {}) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n), tint = new Float32Array(n * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
    geo.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute("tint", new THREE.BufferAttribute(tint, 3));
    const mat = new THREE.ShaderMaterial({vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: o.toneMapped !== false,
      uniforms: {uScale: {value: 540}, uSoft: {value: o.soft ?? 1.6}}});
    const pts = new THREE.Points(geo, mat);
    pts.name = o.name || "입자"; pts.frustumCulled = false; pts.userData.rvProp = true; pts.renderOrder = o.order ?? 3;
    parent.add(pts);
    const out = {p: [0, 0, 0], s: 0, a: 0, c: [1, 1, 1]};
    return {points: pts, update(t, cam, gain = 1) {
      mat.uniforms.uScale.value = 1080 / (2 * Math.tan(cam.fov * Math.PI / 360));
      for (let i = 0; i < n; i++) {
        out.a = 0; fn(i, t, out);
        pos[i * 3] = out.p[0]; pos[i * 3 + 1] = out.p[1]; pos[i * 3 + 2] = out.p[2];
        size[i] = out.s; alpha[i] = out.a * gain;
        tint[i * 3] = out.c[0]; tint[i * 3 + 1] = out.c[1]; tint[i * 3 + 2] = out.c[2];
      }
      for (const k of ["position", "size", "alpha", "tint"]) geo.attributes[k].needsUpdate = true;
      pts.visible = gain > 0.001;
    }};
  }
  const fract = x => x - Math.floor(x);
  const hash = i => fract(Math.sin(i * 12.9898 + 78.233) * 43758.5453);
  // Thin falling rain streaks (LineSegments; rv's mask passes hide lines). Wind tilts them a little.
  function rain(parent, o) {
    const n = o.n || 2400, geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 6);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({color: o.color ?? 0xa9bccc, transparent: true, opacity: o.opacity ?? .32, blending: THREE.AdditiveBlending, depthWrite: false});
    const ln = new THREE.LineSegments(geo, mat); ln.name = "비"; ln.frustumCulled = false; ln.userData.rvProp = true; parent.add(ln);
    const [cx, cy, cz] = o.center, [sx, sy, sz] = o.size, v = o.speed || 7.5, len = o.len || .3, wind = o.wind || .12;
    return {lines: ln, update(t, gain = 1) {
      for (let i = 0; i < n; i++) {
        const q = fract(hash(i) + t * v / sy * (.85 + .3 * hash(i + 7)));
        const x = cx + (hash(i + 1) - .5) * sx - wind * q * sy, y = cy + sy / 2 - q * sy, z = cz + (hash(i + 2) - .5) * sz;
        pos.set([x, y, z, x + wind * len, y + len, z], i * 6);
      }
      geo.attributes.position.needsUpdate = true; mat.opacity = (o.opacity ?? .32) * gain; ln.visible = gain > .001;
    }};
  }
  window.PM_FX = {cloud, rain, hash, fract};
})();
