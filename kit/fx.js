/* kit/fx.js — realistic effect parts for KIT.fx (loaded right after kit/places.js). three r147, global THREE. Metres, +Y up.
 * Every visual is a pure function of t (KIT.rng seeds, no Math.random, no frame history). update(t, on) with on 0..1
 * fades a whole effect in and out, so nothing pops on in one frame. Objects carry userData.rvFx = "smoke" | "steam" |
 * "dust" | "flame" | "section-cap" (check_quality tells kit effects from hand-made flat panels by it) and particle
 * sprites / helpers carry userData.rvProp = true so look.js never picks them as the focus subject.
 *
 *   const S = KIT.fx.smoke(parent, {at: [x, y, z], dir: [0, 1, 0], kind: "smoke" | "steam" | "dust", seed, rate (puffs/s),
 *     life (s), size0, size1 (puff diameter in m at birth / death), rise (m/s along dir), spread (m/s sideways),
 *     wind: [x, y, z] (m/s), lift (m/s² along +Y), color, opacity, shade: [top, bottom]})   -> {group, update(t, on = 1)}
 *     S.update(t, KIT.win(t, a, b, 0.6)) in render(t). A volumetric-looking plume: many camera-facing soft noise
 *     billboards (one instanced draw, sorted back to front per camera), rotating, growing, rising, drifting with the
 *     wind, fading in and out over their life, lit from above (lighter top, darker underside). Presets: smoke = dark grey,
 *     long-lived · steam = white, short-lived · dust = warm, slow, settling. KIT.fx.steam(parent, o) = kind "steam".
 *   const F = KIT.fx.flame(parent, {at, dir, length, radius, color: "plasma" | "fire" | hex, seed, flicker, light})
 *                                                                                   -> {group, light, update(t, on = 1)}
 *     A jet: additive core / mantle / glow cones + soft hot spots, flicker from smooth noise of t, HDR colours (> 1) so
 *     look.js bloom catches it, plus a flickering point light on the surroundings. plasma = violet-white core, fire =
 *     yellow-white core with an orange mantle, a hex colour = that tint.
 *   const C = KIT.fx.section(root, {normal: [0, 0, -1], offset: 0, capColor, hatch: true, pitch: 0.06, renderer})
 *                                                                                   -> {set(amount), plane, cap, reset()}
 *     A real cutaway: every mesh under root is clipped by one plane AND the cut faces get solid caps (stencil parity:
 *     back faces +1, front faces -1, a cap drawn where the count is not 0), so a cut cylinder shows its solid wall
 *     cross-section and what is inside, never a hollow shell or a glass panel. amount 0 = whole object, 1 = cut at
 *     offset; in between the plane slides in from the object's far edge. Plane = THREE.Plane(normal, offset): points with
 *     normal·p + offset < 0 are removed, so with normal [0, 0, -1] the cut sits at z = offset and the +Z half (the side a
 *     camera at +Z is on) is removed. Call C.set(amount) in every render(t) (KIT.fx.reset turns it off between scenes).
 *     Meshes must be closed solids (Cylinder, Box, Lathe, Extrude, Sphere, Torus; an open-ended cylinder has no inside to
 *     cap). Caps need a stencil buffer: the canvas has one; a render target needs {stencilBuffer: true} (without it the
 *     cap is skipped, the object only looks clipped). Pass the renderer (opts.renderer or section(renderer, root, opts))
 *     so localClippingEnabled is on before the first frame.
 */
(function () {
  if (!window.KIT || !KIT.fx) throw new Error("kit/fx.js: load kit/scene_kit.js first");
  if (KIT.fx.smoke) return;   // loaded twice
  const TAU = Math.PI * 2, clamp = (v, a, b) => Math.min(Math.max(v, a), b), lerp = (a, b, u) => a + (b - a) * u;
  const sm = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
  const V3 = (a, d = [0, 0, 0]) => a && a.isVector3 ? a.clone() : new THREE.Vector3(...(a || d));
  // Effects left in a shared world: the compositor calls KIT.fx.reset() before every scene render; these hide themselves
  // there, so only an effect whose update(t) / set(amount) ran this frame is drawn (nothing leaks into the next scene).
  const live = [], baseReset = KIT.fx.reset;
  function reset() { baseReset(); for (const x of live) x.reset(); }
  // Run fn(camera, renderer) right before three builds the render list of obj's scene (scene.onBeforeRender: matrices are
  // current and attributes written here are uploaded in this same render). A scene's own onBeforeRender keeps working.
  const HOOKS = new WeakMap();
  function preRender(obj, fn) {
    let s = obj; while (s.parent) s = s.parent;
    if (!s.isScene) return false;
    let set = HOOKS.get(s);
    if (!set) {
      HOOKS.set(s, set = new Set());
      let own = Object.prototype.hasOwnProperty.call(s, "onBeforeRender") ? s.onBeforeRender : null;
      const run = function (renderer, scene, camera, target) { for (const f of set) f(camera, renderer); if (own) own.call(this, renderer, scene, camera, target); };
      Object.defineProperty(s, "onBeforeRender", {configurable: true, get: () => run, set: v => { own = v; }});
    }
    set.add(fn); return true;
  }

  // ── deterministic noise: 1-D for flicker (sampled at t), 2-D lattice fbm for textures
  function noise1(seed) {
    const r = KIT.rng(seed), lat = new Float32Array(256);
    for (let i = 0; i < 256; i++) lat[i] = r();
    const n = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), a = lat[i & 255], b = lat[(i + 1) & 255]; return a + (b - a) * u; };
    return x => n(x) * 0.5 + n(x * 2.13 + 71.7) * 0.3 + n(x * 4.37 + 19.1) * 0.2;   // 0..1, smooth
  }
  function noise2(seed, N = 64) {   // N power of two = lattice period (sampling x in [0, N) tiles)
    const r = KIT.rng(seed), lat = new Float32Array(N * N), M = N - 1;
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    const at = (x, y) => lat[(y & M) * N + (x & M)];
    const n = (x, y) => {
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1), top = a + (b - a) * sx;
      return top + (c + (d - c) * sx - top) * sy;
    };
    return (x, y, oct = 5) => { let s = 0, a = 0.5, f = 1, w = 0; for (let i = 0; i < oct; i++) { s += a * n(x * f + 17 * i, y * f + 31 * i); w += a; a *= 0.5; f *= 2; } return s / w; };
  }
  const TEX = {};
  function canvasTex(w, h, draw) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; t.userData.rvSurface = true; return t;
  }
  const softTex = () => TEX.soft || (TEX.soft = canvasTex(64, 64, g => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.55)"); gr.addColorStop(0.7, "rgba(255,255,255,.12)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }));
  // 2x2 atlas of soft noise puffs: rgb = luminance lit from the upper left (a slope-shaded height field), a = coverage
  function puffAtlas(kind) {
    const key = "puff:" + kind; if (TEX[key]) return TEX[key];
    const S = 192, soft = kind === "steam" ? 0.36 : kind === "dust" ? 0.4 : 0.27, field = new Float32Array(S * S);
    const f = (x, y) => field[clamp(y, 0, S - 1) * S + clamp(x, 0, S - 1)], L = [-0.42, -0.62, 0.66];
    return TEX[key] = canvasTex(S * 2, S * 2, (g, W, H) => {
      const img = g.createImageData(W, H), d = img.data;
      for (let v = 0; v < 4; v++) {
        const F = noise2(1201 + v * 53 + kind.length * 7), Wp = noise2(3301 + v * 29), ox = (v & 1) * S, oy = (v >> 1) * S;
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const px = (x + 0.5) / S, py = (y + 0.5) / S, rr = Math.hypot(px - 0.5, py - 0.5) * 2;
          const wx = (Wp(px * 3 + 11, py * 3, 3) - 0.5) * 0.5, wy = (Wp(px * 3, py * 3 + 7, 3) - 0.5) * 0.5;   // warped rim: lumpy, not round
          const n = F((px + wx) * 3.5, (py + wy) * 3.5, 5), disc = 1 - sm(0.18, 1.0, rr);
          field[y * S + x] = sm(0.3 - soft, 0.3 + soft, disc * (0.45 + n));
        }
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const gx = (f(x + 2, y) - f(x - 2, y)) * 5, gy = (f(x, y + 2) - f(x, y - 2)) * 5, il = 1 / Math.hypot(gx, gy, 1);
          const ndl = Math.max(0, (-gx * L[0] - gy * L[1] + L[2]) * il), a = field[y * S + x];
          const lum = (0.52 + 0.48 * ndl) * (1 - 0.18 * a), i = ((oy + y) * W + ox + x) * 4;   // dense core a shade darker
          d[i] = d[i + 1] = d[i + 2] = Math.round(lum * 255); d[i + 3] = Math.round(a * 255);
        }
      }
      g.putImageData(img, 0, 0);
    });
  }
  const flameTex = () => TEX.flame || (TEX.flame = (() => {   // tileable streak noise, stretched along the jet
    const F = noise2(4711, 8), t = canvasTex(128, 256, (g, W, H) => {
      const img = g.createImageData(W, H), d = img.data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const n = F(x / W * 8, y / H * 8, 4), i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = Math.round(clamp((n - 0.2) * 1.6, 0, 1) * 255); d[i + 3] = 255; }
      g.putImageData(img, 0, 0); });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })());
  const hatchTex = () => TEX.hatch || (TEX.hatch = (() => {   // one 45° line per tile = an engineering section hatch
    const t = canvasTex(64, 64, g => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, 64, 64); g.strokeStyle = "#474c52"; g.lineWidth = 7;
      g.beginPath(); g.moveTo(-16, -16); g.lineTo(80, 80); g.stroke(); });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })());

  // ── smoke / steam / dust: one instanced billboard draw per plume
  const SMOKE = {
    smoke: {rate: 18, life: 5.5, size0: 0.35, size1: 1.7, rise: 1.1, spread: 0.26, wind: [0.5, 0, 0], lift: 0.1, color: 0x3b3f44, opacity: 0.55, shade: [1.3, 0.5], swirl: 0.6},
    steam: {rate: 34, life: 2.6, size0: 0.2, size1: 1.1, rise: 1.5, spread: 0.32, wind: [0.2, 0, 0], lift: 0.3, color: 0xeef1f3, opacity: 0.75, shade: [1.1, 0.6], swirl: 0.9},
    dust: {rate: 10, life: 3.5, size0: 0.4, size1: 1.5, rise: 0.3, spread: 0.6, wind: [0.3, 0, 0], lift: -0.06, color: 0x9d8d6e, opacity: 0.3, shade: [1.1, 0.75], swirl: 0.4},
  };
  const SMOKE_VERT = `
    attribute vec2 corner; attribute vec3 iPos; attribute vec4 iA;
    varying vec2 vUv; varying vec2 vLocal; varying float vAlpha; varying float vBright;
    #include <fog_pars_vertex>
    void main() {
      float c = cos(iA.y), s = sin(iA.y);
      vec2 r = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c);
      vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
      mvPosition.xy += r * iA.x;
      float v = floor(iA.w);
      vUv = (corner + 0.5) * 0.5 + vec2(mod(v, 2.0), 1.0 - floor(v * 0.5)) * 0.5;
      vLocal = r; vAlpha = iA.z; vBright = fract(iA.w) * 2.0;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;
  const SMOKE_FRAG = `
    uniform sampler2D map; uniform vec3 color; uniform float opacity; uniform vec2 shade;
    varying vec2 vUv; varying vec2 vLocal; varying float vAlpha; varying float vBright;
    #include <fog_pars_fragment>
    void main() {
      vec4 tex = texture2D(map, vUv);
      float a = tex.a * vAlpha * opacity; if (a < 0.004) discard;
      float lit = tex.r * vBright * mix(shade.y, shade.x, smoothstep(-0.5, 0.5, vLocal.y));
      gl_FragColor = vec4(color * lit, a);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
      #include <fog_fragment>
    }`;
  function smoke(parent, o = {}) {
    const kind = SMOKE[o.kind] ? o.kind : "smoke", cfg = Object.assign({at: [0, 0, 0], dir: [0, 1, 0], seed: 1}, SMOKE[kind], o);
    const n = Math.max(4, Math.round(cfg.rate * cfg.life)), r = KIT.rng((cfg.seed | 0) * 7919 + 17), ph = r() * TAU;
    const birth = new Float32Array(n), ang = new Float32Array(n), rad = new Float32Array(n), rot0 = new Float32Array(n), rotV = new Float32Array(n), szJ = new Float32Array(n), wob = new Float32Array(n), vb = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      birth[i] = (i + r() * 0.8) / n * cfg.life; ang[i] = r() * TAU; rad[i] = Math.sqrt(r()); rot0[i] = r() * TAU; rotV[i] = (r() - 0.5) * 0.7;
      szJ[i] = 0.75 + r() * 0.5; wob[i] = r() * TAU; vb[i] = Math.floor(r() * 4) + clamp(0.85 + r() * 0.3, 0, 1.98) * 0.5;   // atlas tile + brightness
    }
    const dir = V3(cfg.dir, [0, 1, 0]).normalize(), e1 = new THREE.Vector3(1, 0, 0), e2 = new THREE.Vector3(), wind = V3(cfg.wind);
    if (Math.abs(dir.x) > 0.9) e1.set(0, 0, 1);
    e2.crossVectors(dir, e1).normalize(); e1.crossVectors(e2, dir).normalize();
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(12), 3));   // zero: degenerate under any foreign material (mask / clay passes)
    geo.setAttribute("corner", new THREE.Float32BufferAttribute([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const iPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), iA = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    iPos.setUsage(THREE.DynamicDrawUsage); iA.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iPos", iPos); geo.setAttribute("iA", iA); geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {map: {value: null}, color: {value: new THREE.Color(cfg.color)}, opacity: {value: 0}, shade: {value: new THREE.Vector2(cfg.shade[0], cfg.shade[1])}}]),
      vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, transparent: true, depthWrite: false, fog: true});
    mat.uniforms.map.value = puffAtlas(kind);
    const group = new THREE.Group(), mesh = new THREE.Mesh(geo, mat);
    group.name = cfg.name || kind; mesh.name = kind + " puffs";
    group.userData.rvFx = mesh.userData.rvFx = kind; group.userData.rvProp = mesh.userData.rvProp = true;
    mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false;
    group.position.copy(V3(cfg.at)); group.add(mesh); parent.add(group); group.visible = false;
    const pos = new Float32Array(n * 3), dat = new Float32Array(n * 4), idx = new Int32Array(n), depth = new Float32Array(n), mv = new THREE.Matrix4();
    let update = function (t, on = 1) {
      on = clamp(on, 0, 1); group.visible = on > 0.001; if (!group.visible) return;
      mat.uniforms.opacity.value = cfg.opacity * sm(0, 1, on);
      const L = cfg.life, sw = cfg.swirl * cfg.size1 * 0.35;
      for (let i = 0; i < n; i++) {
        let a = (t - birth[i]) % L; if (a < 0) a += L;
        const u = a / L, k = 1 - Math.pow(1 - u, 1.8), bt = t - a;   // age, eased growth, birth time
        const along = cfg.rise * a * (1 - 0.35 * u), w = a * Math.min(1, 0.35 + 0.65 * u);   // buoyant rise slows, wind takes over
        const lat = (cfg.spread * Math.pow(a, 0.85) + cfg.size0 * 0.25) * rad[i];
        const mx = Math.sin(bt * 0.7 + ph) * sw * u + Math.sin(t * 0.9 + wob[i]) * 0.08 * cfg.size1 * u;   // the column meanders
        const mz = Math.cos(bt * 0.55 + ph * 1.7) * sw * u + Math.cos(t * 1.1 + wob[i] * 1.3) * 0.08 * cfg.size1 * u;
        const c = Math.cos(ang[i]) * lat + mx, s = Math.sin(ang[i]) * lat + mz, lift = 0.5 * cfg.lift * a * a;
        pos[i * 3] = dir.x * along + e1.x * c + e2.x * s + wind.x * w;
        pos[i * 3 + 1] = dir.y * along + e1.y * c + e2.y * s + wind.y * w + lift;
        pos[i * 3 + 2] = dir.z * along + e1.z * c + e2.z * s + wind.z * w;
        const size = lerp(cfg.size0, cfg.size1, k) * szJ[i];
        dat[i * 4] = size; dat[i * 4 + 1] = rot0[i] + rotV[i] * a;
        dat[i * 4 + 2] = sm(0, 0.12, u) * (1 - sm(0.45, 1, u)) * Math.pow(cfg.size0 / size, 0.35);   // fade in, thin out as it grows, fade out
        dat[i * 4 + 3] = vb[i];
      }
    }
    function sortFor(camera) {   // back to front for this camera: a function of t and the camera only, written before the upload
      if (!group.visible) return;
      mesh.updateWorldMatrix(true, false);
      mv.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld); const e = mv.elements;
      for (let i = 0; i < n; i++) { idx[i] = i; depth[i] = e[2] * pos[i * 3] + e[6] * pos[i * 3 + 1] + e[10] * pos[i * 3 + 2] + e[14]; }
      idx.sort((p, q) => depth[p] - depth[q] || p - q);
      const P = iPos.array, D = iA.array;
      for (let k = 0; k < n; k++) { const i = idx[k]; P[k * 3] = pos[i * 3]; P[k * 3 + 1] = pos[i * 3 + 1]; P[k * 3 + 2] = pos[i * 3 + 2]; D[k * 4] = dat[i * 4]; D[k * 4 + 1] = dat[i * 4 + 1]; D[k * 4 + 2] = dat[i * 4 + 2]; D[k * 4 + 3] = dat[i * 4 + 3]; }
      iPos.needsUpdate = true; iA.needsUpdate = true;
    }
    let hooked = false;
    const updateT = update;
    update = function (t, on = 1) { updateT(t, on); if (!hooked && group.visible) hooked = preRender(group, sortFor); };
    mesh.onBeforeRender = (renderer, scene, camera) => { if (!hooked) sortFor(camera); };   // fallback when the group is not under a Scene (one render late)
    const api = {group, mesh, kind, update, reset() { group.visible = false; }};
    live.push(api); return api;
  }
  const steam = (parent, o = {}) => smoke(parent, Object.assign({}, o, {kind: "steam"}));

  // ── flame / plasma jet: additive layered cones + hot spots + a point light, all HDR
  const FLAME = {
    plasma: {core: [2.6, 2.3, 3.2], mantle: [1.3, 0.55, 2.4], glow: [0.5, 0.22, 1.1], light: 0x9a6cff},
    fire: {core: [3.0, 2.5, 1.3], mantle: [2.3, 0.95, 0.2], glow: [1.2, 0.32, 0.06], light: 0xff9a3c},
  };
  const FLAME_VERT = `
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
  const FLAME_FRAG = `
    uniform vec3 color; uniform float uT, uBoost, alpha, power, speed, seed; uniform sampler2D map;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main() {
      float facing = pow(abs(dot(normalize(vN), normalize(vV))), power);                 // centre bright, rim fades: reads as a volume
      float n1 = texture2D(map, vec2(vUv.x * 2.0 + seed, vUv.y * 1.6 - uT * speed)).r;
      float n2 = texture2D(map, vec2(vUv.x * 3.0 + 0.37 - seed * 0.7, vUv.y * 2.5 - uT * speed * 1.7)).r;
      float n = n1 * 0.6 + n2 * 0.4;
      float tongues = smoothstep(0.25 + 0.6 * vUv.y, 0.55 + 0.6 * vUv.y, n + 0.5);   // towards the tip only the dense streaks survive
      float a = facing * alpha * uBoost * mix(0.75, 1.3, n) * tongues * (1.0 - smoothstep(0.85, 1.0, vUv.y));
      gl_FragColor = vec4(color, a);
    }`;
  const GLOW_VERT = `
    attribute vec2 corner; attribute vec3 iPos; attribute vec4 iA; attribute vec3 iCol;
    varying vec2 vUv; varying float vAlpha; varying vec3 vCol;
    void main() { vec4 mv = modelViewMatrix * vec4(iPos, 1.0); mv.xy += corner * iA.x; vUv = corner + 0.5; vAlpha = iA.z; vCol = iCol; gl_Position = projectionMatrix * mv; }`;
  const GLOW_FRAG = `
    uniform sampler2D map; varying vec2 vUv; varying float vAlpha; varying vec3 vCol;
    void main() { float a = texture2D(map, vUv).a * vAlpha; if (a < 0.002) discard; gl_FragColor = vec4(vCol, a); }`;
  function glowSpots(n) {   // n additive soft billboards in one draw; position attribute is zero so foreign materials draw nothing
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    geo.setAttribute("corner", new THREE.Float32BufferAttribute([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const iPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), iA = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4), iCol = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    iPos.setUsage(THREE.DynamicDrawUsage); iA.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iPos", iPos); geo.setAttribute("iA", iA); geo.setAttribute("iCol", iCol); geo.instanceCount = n;
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({uniforms: {map: {value: softTex()}}, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
    mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false;
    return {mesh, iPos, iA, iCol};
  }
  function flame(parent, o = {}) {
    const preset = typeof o.color === "string" && FLAME[o.color] ? FLAME[o.color] : null;
    let pal = preset || FLAME.plasma;
    if (!preset && o.color != null) { const c = new THREE.Color(o.color); pal = {core: [1.7 + c.r, 1.7 + c.g, 1.7 + c.b], mantle: [c.r * 2.2, c.g * 2.2, c.b * 2.2], glow: [c.r, c.g, c.b], light: c.getHex()}; }
    const cfg = Object.assign({at: [0, 0, 0], dir: [0, 1, 0], length: 1.2, radius: 0.12, seed: 1, flicker: 0.15, light: true, lightIntensity: 1.2}, o);
    const group = new THREE.Group(), aim = new THREE.Group(), body = new THREE.Group();   // aim: points +Y along dir · body: flicker scale + wander
    group.name = cfg.name || "flame"; group.userData.rvFx = "flame"; group.userData.rvProp = true;
    group.position.copy(V3(cfg.at)); aim.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), V3(cfg.dir, [0, 1, 0]).normalize());
    group.add(aim); aim.add(body); parent.add(group); group.visible = false;
    // unit jet profile (radius 1, length 1): narrow at the nozzle, bulging, tapering to a point
    const pts = [new THREE.Vector2(0, 0)];
    for (let i = 0; i <= 20; i++) { const u = i / 20, s = (0.5 + 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.6)) * (1 - sm(0.6, 1, u)); pts.push(new THREE.Vector2(Math.max(i === 20 ? 0 : 0.01, s), u)); }
    const geo = new THREE.LatheGeometry(pts, 28), tex = flameTex(), layers = [];
    const layer = (col, scale, alpha, power, speed, weight) => {
      const m = new THREE.ShaderMaterial({uniforms: {color: {value: new THREE.Color(...col)}, uT: {value: 0}, uBoost: {value: 0}, alpha: {value: alpha}, power: {value: power}, speed: {value: speed}, seed: {value: (cfg.seed % 7) * 0.13}, map: {value: tex}},
        vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide});
      const mesh = new THREE.Mesh(geo, m); mesh.scale.set(scale[0], scale[1], scale[0]); mesh.userData.rvFx = "flame"; mesh.userData.rvProp = true; mesh.name = "flame layer";
      mesh.frustumCulled = false; body.add(mesh); layers.push({mesh, m, weight}); return mesh; };
    layer(pal.glow, [1.9, 1.12], 0.3, 2.6, 0.9, 1.0);
    layer(pal.mantle, [1.0, 1.0], 0.55, 1.8, 1.4, 1.0);
    layer(pal.core, [0.4, 0.9], 1.0, 1.2, 2.2, 1.1);
    for (const L of layers) L.mesh.onBeforeRender = (renderer, scene, camera, geometry) => geometry.setDrawRange(0, scene.overrideMaterial ? 0 : Infinity);   // a volume: not in depth / normal / AO passes
    // hot spots: additive billboards in metres under the unscaled aim node (a Sprite under the scaled body would stretch)
    const SPOTS = [[0.02, 5.0, pal.core, 0.55], [0.38, 3.4, pal.mantle, 0.5], [0.72, 2.6, pal.glow, 0.45]];
    const spots = glowSpots(SPOTS.length);
    spots.mesh.name = "flame glow"; spots.mesh.userData.rvFx = "flame"; spots.mesh.userData.rvProp = true; aim.add(spots.mesh);
    SPOTS.forEach(([u, k, col], i) => spots.iCol.array.set(col, i * 3)); spots.iCol.needsUpdate = true;
    const light = new THREE.PointLight(pal.light, 0, cfg.length * 5, 2); light.visible = !!cfg.light; aim.add(light);
    const N1 = noise1(cfg.seed * 31 + 5), N2 = noise1(cfg.seed * 31 + 9), N3 = noise1(cfg.seed * 31 + 13), N4 = noise1(cfg.seed * 31 + 21);
    function update(t, on = 1) {
      on = clamp(on, 0, 1); group.visible = on > 0.001; if (!group.visible) { light.intensity = 0; return; }
      const k = sm(0, 1, on), f = cfg.flicker, len = cfg.length * (1 + f * (N1(t * 7.3) - 0.5) * 2) * (0.35 + 0.65 * k), wid = cfg.radius * (1 + f * 0.8 * (N2(t * 11.7) - 0.5) * 2);
      const boost = (0.88 + 0.3 * N3(t * 5.1)) * k, bend = f * 0.35 * (N4(t * 3.3) - 0.5);
      body.scale.set(wid, len, wid); body.rotation.z = bend;   // a slightly wandering jet
      for (const L of layers) { L.m.uniforms.uT.value = t; L.m.uniforms.uBoost.value = boost * L.weight; }
      SPOTS.forEach(([u, sz, col, op], i) => { const flick = 0.85 + 0.3 * N2(t * 9.1 + u * 17), P = spots.iPos.array, A = spots.iA.array;
        P[i * 3] = Math.sin(bend) * -u * len; P[i * 3 + 1] = Math.cos(bend) * u * len; P[i * 3 + 2] = 0;   // along the (bent) jet, in metres
        A[i * 4] = sz * wid * flick; A[i * 4 + 1] = 0; A[i * 4 + 2] = op * boost * flick; A[i * 4 + 3] = 0; });
      spots.iPos.needsUpdate = true; spots.iA.needsUpdate = true;
      light.intensity = cfg.lightIntensity * boost; light.position.set(0, 0.3 * len, 0);
    }
    const api = {group, body, light, update, reset() { group.visible = false; light.intensity = 0; }};
    live.push(api); return api;
  }

  // ── section: clip + stencil-capped cut faces
  const ctxStencil = new WeakMap();
  function hasStencil(renderer) {
    const rt = renderer.getRenderTarget(); if (rt) return !!rt.stencilBuffer;
    let s = ctxStencil.get(renderer);
    if (s === undefined) { const a = renderer.getContext().getContextAttributes(); s = !a || a.stencil !== false; ctxStencil.set(renderer, s); }
    return s;
  }
  let sections = 0; const warned = new WeakSet();
  function section(root, o = {}) {
    let R = null;
    if (root && root.isWebGLRenderer) { R = root; root = o; o = arguments[2] || {}; }   // section(renderer, root, opts) like KIT.fx.cutaway
    R = o.renderer || R; if (R) R.localClippingEnabled = true;
    const normal = V3(o.normal, [0, 0, -1]).normalize(), plane = new THREE.Plane(normal.clone(), 1e6), base = -1000 + 2 * sections++;
    let offset = o.offset || 0, lazyWarned = false;
    const writers = [], guard = (renderer, scene, camera, geometry) => {   // skip the stencil work in depth / normal passes and without a stencil buffer
      if (!R && !renderer.localClippingEnabled) { renderer.localClippingEnabled = true; if (!lazyWarned) { lazyWarned = true; console.warn("KIT.fx.section: pass the renderer ({renderer}) so clipping is on from the first frame"); } }
      const ok = !scene.overrideMaterial && hasStencil(renderer);
      if (!ok && !scene.overrideMaterial) { const rt = renderer.getRenderTarget(); if (rt && !warned.has(rt)) { warned.add(rt);
        console.warn(`KIT.fx.section: render target "${rt.texture.name || "unnamed"}" has no stencil buffer: cut faces stay uncapped there (a look.js main target needs stencilBuffer: true; SAOPass's own beauty target can be ignored)`); } }
      geometry.setDrawRange(0, ok ? Infinity : 0); return ok; };
    root.traverse(m => {
      if (!m.isMesh || m.userData.rvFx === "section-cap" || m.isInstancedMesh || m.isSkinnedMesh) return;
      m.material = Array.isArray(m.material) ? m.material.map(x => x.clone()) : m.material.clone();   // shared materials: clip only this object
      for (const x of [].concat(m.material)) { x.clippingPlanes = [plane]; x.clipShadows = true; }
      const shared = new THREE.BufferGeometry();   // same buffers as m.geometry (no second upload) but its own drawRange, so the guard never blanks m itself
      shared.index = m.geometry.index; for (const k in m.geometry.attributes) shared.setAttribute(k, m.geometry.attributes[k]);
      shared.boundingSphere = m.geometry.boundingSphere || (m.geometry.computeBoundingSphere(), m.geometry.boundingSphere);
      for (const [side, op] of [[THREE.BackSide, THREE.IncrementWrapStencilOp], [THREE.FrontSide, THREE.DecrementWrapStencilOp]]) {
        const w = new THREE.Mesh(shared, new THREE.MeshBasicMaterial({side, depthWrite: false, depthTest: false, colorWrite: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op, clippingPlanes: [plane]}));
        w.name = "section-cap"; w.userData.rvFx = "section-cap"; w.userData.rvProp = true; w.renderOrder = base; w.matrixAutoUpdate = false; w.castShadow = w.receiveShadow = false; w.frustumCulled = m.frustumCulled;
        w.onBeforeRender = guard; w.visible = false; m.add(w); writers.push(w);
      }
    });
    // transparent (opacity 1): drawn in the transparent pass after every opaque writer, and still after the writers when a
    // KIT.fx.reveal fade turns their materials into transparent copies (renderOrder keeps writers < cap in both lists)
    const capMat = new THREE.MeshStandardMaterial({color: o.capColor ?? 0xb4bac0, map: o.hatch === false ? null : hatchTex(), roughness: 0.72, metalness: 0.1, side: THREE.DoubleSide, transparent: true, depthWrite: true,
      stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp});
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), capMat);
    cap.name = "section-cap"; cap.userData.rvFx = "section-cap"; cap.userData.rvProp = true; cap.renderOrder = base + 1; cap.frustumCulled = false; cap.castShadow = false; cap.receiveShadow = true; cap.visible = false;
    cap.onBeforeRender = function (renderer, scene, camera, geometry, material) {
      if (guard(renderer, scene, camera, geometry) && material !== capMat && !material.stencilWrite) {   // relief / clean clay copy: keep the stencil test
        material.stencilWrite = true; material.stencilRef = 0; material.stencilFunc = THREE.NotEqualStencilFunc;
        material.stencilFail = material.stencilZFail = material.stencilZPass = THREE.ReplaceStencilOp; }
    };
    cap.onAfterRender = renderer => renderer.clearStencil();   // the next section's count starts clean
    const box = new THREE.Box3(), tb = new THREE.Box3(), sphere = new THREE.Sphere(), Z = new THREE.Vector3(0, 0, 1), back = new THREE.Vector3(), pitch = o.pitch || 0.06;
    function set(amount, n, off) {
      if (n) normal.copy(V3(n)).normalize(); if (off != null) offset = off;
      amount = clamp(amount, 0, 1); const active = amount > 0.001;
      plane.normal.copy(normal); cap.visible = active; for (const w of writers) w.visible = active;
      if (!active) { plane.constant = 1e6; return; }
      if (!cap.parent) (root.parent || root).add(cap);
      root.updateWorldMatrix(true, true); box.makeEmpty();
      root.traverse(m => { if (!m.isMesh || m.userData.rvFx === "section-cap" || m.userData.rvProp) return;
        const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); if (g.boundingBox.isEmpty()) return; tb.copy(g.boundingBox).applyMatrix4(m.matrixWorld); box.union(tb);
        for (const x of [].concat(m.material)) if (x.clippingPlanes && x.clippingPlanes.length === 1 && x.clippingPlanes[0] !== plane && x.clippingPlanes[0].normal.dot(plane.normal) > 0.9999) x.clippingPlanes = [plane]; });   // reveal() copies carry a frozen clone of this plane
      if (box.isEmpty()) { plane.constant = offset; return; }
      box.getBoundingSphere(sphere); const c = sphere.center, Rr = sphere.radius;
      let nearest = Infinity;   // the object's real extent along the normal (box corners), so the plane starts at its far edge, not at the sphere's
      for (let i = 0; i < 8; i++) nearest = Math.min(nearest, normal.x * (i & 1 ? box.max.x : box.min.x) + normal.y * (i & 2 ? box.max.y : box.min.y) + normal.z * (i & 4 ? box.max.z : box.min.z));
      const start = Math.max(offset, -nearest + 0.02);   // constant that removes nothing yet
      plane.constant = lerp(start, offset, amount);
      cap.position.copy(c).addScaledVector(normal, -(normal.dot(c) + plane.constant));   // centre projected onto the plane
      cap.quaternion.setFromUnitVectors(Z, back.copy(normal).negate());   // faces the removed side (the camera)
      const size = 2 * Rr + 0.1; cap.scale.set(size, size, 1);
      if (capMat.map) capMat.map.repeat.set(size / pitch, size / pitch);
      if (cap.parent) cap.parent.updateWorldMatrix(true, false);
      cap.updateMatrixWorld(true);
    }
    const api = {plane, cap, writers, set, reset() { plane.constant = 1e6; cap.visible = false; for (const w of writers) w.visible = false; }};
    live.push(api); return api;
  }

  Object.assign(KIT.fx, {smoke, steam, flame, section, reset});
})();
