/* kit/places.js — procedural "place kits": a real location around the story subject, from code only.
 *
 *   const P = KIT.place(NAME, scene, opts)   // NAME = scene name; kind = opts.kind || window.SCENE_PLACE?.[NAME] || "lab"
 *   kinds (KIT.place.kinds): sidewalk | factory | recycling | clinic | kitchen | lab
 *   opts: {kind, seed = 1, time: "day" | "golden" | "dusk" | "night" (default day; sidewalk defaults to golden), stage: [x, y, z] (subject point, default origin),
 *          clear = 2.5 (m around the stage kept free of props), air = true (dust, steam, light shafts),
 *          life = true (ambient movers), lights = true, renderer (pass it from init: switches shadow maps on)}
 *   P = {root, kind, site, stage, spots: {name: [x, y, z] | {at, normal}}, ground, lights, sun, tris, update(t)}
 *   P.update(t) is a pure function of t (cars, forklift, conveyor, leaves, dust, steam): call it from render(t).
 *   Spots: sidewalk entrance/door/curb/lamp/tree/car · factory machine/crane/pallet/rack/bench · recycling pile/conveyor/
 *   bale/skip/loader · clinic bed/bars/chair/cabinet/window/chart · kitchen wall{at,normal}/stand/counter/shelf/fridge/
 *   table/window/hob/sink (kitchen stage = stand, 0.55 m in front of the free wall spot) · lab bench{at,normal}/hood/shelf/monitor.
 *   Everything is a function of seed and t: no Math.random, no external assets (canvas textures only). Metres, +Y up, ground y = 0.
 *   root ("place_<kind>", userData.rvEnv/rvPlace) is registered with KIT.fx.env so relief/clean emphasis can hide it and
 *   look.js never picks it as the focus subject; lights live outside the root so clean mode keeps its shadows.
 *   No people here: add them with KIT.fx.human(scene, h, {site: KIT.place.site(kind)}).
 *   KIT.place.mat(kind, {color, seed, roughness, metalness}) -> MeshStandardMaterial with a procedural canvas texture
 *   (concrete asphalt metal plastic wood tile fabric glass plaster brick corrugated gravel grass leaf rubber waste).
 *   KIT.place.texture(kind, seed) -> that CanvasTexture (RepeatWrapping, 1 repeat = material.userData.tile metres).
 */
(function () {
  const TAU = Math.PI * 2, clamp = (v, a, b) => Math.min(Math.max(v, a), b), lerp = (a, b, u) => a + (b - a) * u;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), C = c => c && c.isColor ? c : new THREE.Color(c);
  const hex = (h, s, l) => new THREE.Color().setHSL(h, s, l);
  // ── tokens: one palette per place (linear hex, like every material in this kit), time-of-day recipes, texture tiles
  const PAL = {
    sidewalk: {pave: 0x9a9690, curb: 0xa8a49c, asphalt: 0x3a3c3f, roadPaint: 0xd8d2bf, facade: [0xb9a98c, 0x8d6f5c, 0x9fa6a8, 0xc7bfae, 0x6f7f8a], glass: 0x6f8aa0,
      metal: 0x44484c, leaf: 0x3f7a35, bark: 0x5a4636, hedge: 0x37692f, car: [0xb8bcc0, 0x1f2a44, 0x8a1e1e, 0xe8e6e0, 0x2c2c2c], awning: 0x7a2a2a, sign: 0xf2a33a},
    factory: {floor: 0x6f7174, line: 0xe4b429, wall: 0xa9adaf, steel: 0x5b6b78, crane: 0xd8b02c, pipe: [0x9aa4ab, 0x3f6fa8, 0xb8352c, 0xe3b22a], machine: [0x5f8f8a, 0x7b8790, 0x4d5d84, 0xc9c6bf], pallet: 0xa07c4e, drum: [0x2f5aa8, 0xb33a2c, 0x5e6b6b], safety: 0xe0392f},
    recycling: {apron: 0x7c7d7b, gravel: 0x8c8678, steel: 0x6a7278, roof: 0x9ea5a8, bale: 0xbcc4c8, skip: [0x2d6a3e, 0x3a5fa0, 0xb0442e], loader: 0xe0a51a, belt: 0x2a2c2e, fence: 0x8a9298,
      plastics: [0x2f6fd6, 0x4ea84a, 0xe8e8e2, 0xd9342b, 0xf2c23a, 0x8d9aa5, 0x1f9bd0, 0xf38a2a, 0xdedede, 0x6a4ba8]},
    clinic: {floor: 0xc9c6bd, wall: 0xdfe5e4, band: 0xa9c7c3, ceiling: 0xf0f2f2, bed: 0x3f5f8f, bedFrame: 0xb8bcc0, cabinet: 0xd8dcd8, counter: 0x9fa6aa, steel: 0x9aa0a4, chair: 0x4d7fa6, plant: 0x3d7a3a, wood: 0xa37b55},
    kitchen: {floor: 0xa47a52, wall: 0xe4dccc, tile: 0xdde3e6, counter: 0x6a6d70, cabinet: 0xcfd6d0, upper: 0xe9ebe6, fridge: 0xc8ccd0, wood: 0x8a6240, chair: 0x4b4f56, steel: 0xa4a8ac, lamp: 0x2d3338, fruit: [0xd63b2f, 0xe8b623, 0x6fa83a]},
    lab: {floor: 0xb9bcc0, wall: 0xe6e8e6, bench: 0x2f3338, benchBody: 0xd9dcd8, steel: 0xa8acb0, hood: 0xcfd4d6, shelf: 0xb4b8bc, screen: 0x1b2a3a, bottles: [0x7fb0d8, 0xe9c13b, 0xcf5b3b, 0xcfd8dc, 0x4f9c5a, 0x9b6fd0], chair: 0x30343a},
  };
  // Colours here are linear values before look.js (ACES, exposure x1.87): diffuse albedo is scaled by ALBEDO once, in the
  // builder / mat() / room(); sky and fog stops are chosen pre-exposure so the sky stays blue instead of washing out.
  const ALBEDO = 0.34;
  const TIME = {   // sky gradient (top, middle, horizon), sun direction/colour/intensity, hemisphere, fog, lamp emissive factor
    day: {sky: ["#0d2a7a", "#2a54a4", "#5276ae"], sun: [-0.55, 0.8, 0.45], sunColor: 0xfff1dc, sunInt: 1.3, hemi: [0xbfd6f0, 0x6b6a60, 0.4], fog: 0x7f9fc4, lamps: 0, fill: 0.14, glow: [0xe8f1fa, 1.5], key: [0xfff0e0, 0.95]},
    dusk: {sky: ["#101a4e", "#5a3468", "#d0783a"], sun: [-0.9, 0.22, 0.35], sunColor: 0xffb067, sunInt: 1.1, hemi: [0x7f8fc4, 0x4a3e3a, 0.36], fog: 0x8a6a6e, lamps: 1, fill: 0.1, glow: [0xffbf7a, 1.3], key: [0xffb070, 0.7]},
    night: {sky: ["#02030a", "#060a1a", "#101828"], sun: [0.3, 0.8, -0.4], sunColor: 0x8fa6d6, sunInt: 0.22, hemi: [0x2b3a5c, 0x141414, 0.16], fog: 0x0a0e18, lamps: 1.5, fill: 0.05, glow: [0x24385c, 0.5], key: [0xf4f6ff, 0.0]},
    golden: {sky: ["#163070", "#5068a8", "#c0763e"], sun: [-0.75, 0.42, 0.5], sunColor: 0xffbe78, sunInt: 1.4, hemi: [0x9aa8d0, 0x5a4a3c, 0.44], fog: 0x9a868c, lamps: 0.5, fill: 0.12, glow: [0xffd9a8, 1.3], key: [0xffd0a0, 0.85]},   // golden hour: low warm sun, lamps just coming on
  };
  const TILE = {concrete: 2, asphalt: 3, metal: 1, plastic: 0.5, wood: 1, tile: 1, fabric: 0.5, glass: 1, plaster: 2, brick: 0.6, corrugated: 1, gravel: 1.5, grass: 1.5, leaf: 1, rubber: 1, waste: 1, stone: 1.2, paving: 1.5, tactile: 0.3, grate: 0.3, stripes: 0.6, slab: 4, board: 0.6};
  const BUMP = {concrete: 0.012, asphalt: 0.01, metal: 0.003, plastic: 0.002, wood: 0.008, tile: 0.012, fabric: 0.006, glass: 0, plaster: 0.004, brick: 0.02, corrugated: 0.02, gravel: 0.02, grass: 0.01, leaf: 0.01, rubber: 0.004, waste: 0.01, stone: 0.02, paving: 0.015, tactile: 0.03, grate: 0.02, stripes: 0.002, slab: 0.014, board: 0.01};
  const ROUGH = {concrete: .95, asphalt: .95, metal: .45, plastic: .55, wood: .7, tile: .35, fabric: .95, glass: .1, plaster: .9, brick: .9, corrugated: .55, gravel: 1, grass: .95, leaf: .8, rubber: .9, waste: .7, stone: .85, paving: .9, tactile: .7, grate: .6, stripes: .9, slab: .92, board: .75};
  const METAL = {metal: .25, corrugated: .3, glass: .1};   // no environment map in this pipeline: high metalness only darkens

  // ── procedural textures: seamless value noise (lattice period = texture size) + canvas drawing, cached by kind|seed
  function noiseMaker(seed) {
    const r = KIT.rng(seed), N = 64, lat = new Float32Array(N * N);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    const at = (x, y) => lat[(y & (N - 1)) * N + (x & (N - 1))];
    const n = (x, y) => {
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1), top = a + (b - a) * sx;
      return top + (c + (d - c) * sx - top) * sy;
    };
    return (x, y, oct = 4) => { let s = 0, a = 0.5, f = 1, w = 0; for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); w += a; a *= 0.5; f *= 2; } return s / w; };
  }
  const TEX = new Map();
  function canvasTex(w, h, draw) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    draw(cv.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.userData.rvSurface = true; return t;
  }
  function texture(kind, seed = 1) {
    const key = kind + "|" + seed; if (TEX.has(key)) return TEX.get(key);
    const S = 256, r = KIT.rng(seed * 7919 + kind.length * 131), F = noiseMaker(seed * 31 + kind.length);
    const t = canvasTex(S, S, (g) => {
      const img = g.createImageData(S, S), d = img.data, k = 64 / S;   // lattice units per pixel: one lattice period per tile
      const N = (x, y, s = 1, o = 4) => F(x * k * s, y * k * s, o) - 0.5;
      const fill = f => { for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i += 4) { const v = f(x, y); const c = Array.isArray(v) ? v : [v, v, v]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; } g.putImageData(img, 0, 0); };
      const line = (x0, y0, x1, y1, w, a, col = "#000") => { g.strokeStyle = col; g.globalAlpha = a; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.globalAlpha = 1; };
      const blot = (x, y, rad, a, col = "#000") => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)"); g.globalAlpha = a; g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.globalAlpha = 1; };
      switch (kind) {
        case "concrete": fill((x, y) => 212 + N(x, y) * 44 + N(x, y, 6, 2) * 20);
          for (let i = 0; i < 5; i++) blot(r() * S, r() * S, 20 + r() * 50, 0.06 + r() * 0.08);
          for (let i = 0; i < 3; i++) { let x = r() * S, y = r() * S; for (let j = 0; j < 6; j++) { const nx = x + (r() - 0.5) * 50, ny = y + (r() - 0.5) * 50; line(x, y, nx, ny, 1, 0.25); x = nx; y = ny; } } break;
        case "asphalt": fill((x, y) => 205 + N(x, y, 8, 2) * 80 + N(x, y, 1.5, 2) * 24); for (let i = 0; i < 4; i++) blot(r() * S, r() * S, 30 + r() * 40, 0.1); break;
        case "metal": fill((x, y) => 226 + N(x * 0.12, y * 3) * 22 + N(x, y, 10, 1) * 8);
          for (let i = 0; i < 14; i++) { const x = r() * S, y = r() * S, a = r() * TAU, l = 10 + r() * 60; line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 1, 0.12, r() < 0.5 ? "#000" : "#fff"); } break;
        case "plastic": fill((x, y) => 232 + N(x, y, 2, 3) * 14); break;
        case "rubber": fill((x, y) => 200 + N(x, y, 6, 2) * 12 + ((y % 16) < 2 ? -10 : 0)); break;
        case "wood": { const P = 6, ph = S / P, off = Array.from({length: P}, () => r() * 200);
          fill((x, y) => { const p = Math.floor(y / ph); return 206 + 30 * Math.sin((x * 0.09 + N(x, y, 3, 2) * 9 + off[p])) + N(x, y, 8, 2) * 14 - (y % ph < 1.5 ? 50 : 0); });
          for (let p = 0; p < P; p++) { const x = r() * S; line(x, p * ph, x, (p + 1) * ph, 1.5, 0.35); } break; }
        case "tile": { const T = 3, tw = S / T, tone = Array.from({length: T * T}, () => (r() - 0.5) * 24);
          fill((x, y) => { const i = Math.floor(x / tw), j = Math.floor(y / tw); const grout = x % tw < 5 || y % tw < 5; return grout ? 148 + N(x, y, 4, 2) * 12 : 226 + tone[j * T + i] + N(x, y, 3, 3) * 14; }); break; }
        case "fabric": fill((x, y) => 216 + ((Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? 7 : -7) + N(x, y, 6, 2) * 16); break;
        case "glass": fill((x, y) => 242 + N(x, y, 1, 2) * 8); break;
        case "plaster": fill((x, y) => 226 + N(x, y, 1.5, 4) * 28 + N(x, y, 6, 2) * 10); for (let i = 0; i < 6; i++) blot(r() * S, r() * S, 30 + r() * 70, 0.05 + r() * 0.05, r() < 0.5 ? "#000" : "#fff"); break;
        case "slab": { fill((x, y) => 208 + N(x, y, 1.2, 4) * 40 + N(x, y, 6, 2) * 18);
          for (let i = 0; i < 6; i++) blot(r() * S, r() * S, 24 + r() * 60, 0.08 + r() * 0.1);
          for (let i = 0; i < 4; i++) { let x = r() * S, y = r() * S; for (let j = 0; j < 7; j++) { const nx = x + (r() - 0.5) * 40, ny = y + (r() - 0.5) * 40; line(x, y, nx, ny, 1, 0.3); x = nx; y = ny; } }
          g.fillStyle = "rgba(60,58,54,0.85)"; g.fillRect(0, 0, S, 4); g.fillRect(0, 0, 4, S); g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(0, 4, S, 1); g.fillRect(4, 0, 1, S); break; }
        case "board": { fill((x, y) => 222 + N(x, y, 2, 3) * 14 + 6 * Math.sin(x / S * TAU * 8));
          for (let i = 0; i < 8; i++) { const x = i * S / 8; g.fillStyle = "rgba(0,0,0,0.42)"; g.fillRect(x, 0, 3, S); g.fillStyle = "rgba(255,255,255,0.3)"; g.fillRect(x + 3, 0, 1, S); } break; }
        case "brick": { const H = S / 8, W = H * 2.2;   // coloured: bricks + light mortar (use with a white or light tint)
          fill((x, y) => { const row = Math.floor(y / H), xo = x + (row % 2 ? W / 2 : 0), col = Math.floor(xo / W);
            if (y % H < 3 || xo % W < 3) return [214, 208, 198].map(v => v + N(x, y, 4, 2) * 14);
            const s = Math.sin(col * 12.9898 + row * 78.233) * 43758.5453, v = s - Math.floor(s), base = [172 + v * 30, 96 + v * 24, 74 + v * 16];
            return base.map(c => c + N(x, y, 5, 3) * 30); }); break; }
        case "corrugated": fill((x, y) => 210 + 46 * Math.sin(x / S * TAU * 12) + N(x, y, 3, 2) * 16 + N(x * 0.2, y * 2, 1, 2) * 12); break;
        case "stone": { const H = S / 4, W = S / 2;   // ashlar blocks, light grey, offset courses
          fill((x, y) => { const row = Math.floor(y / H), xo = x + (row % 2 ? W / 2 : 0), col = Math.floor(xo / W);
            if (y % H < 3 || xo % W < 3) return 150 + N(x, y, 4, 2) * 16;
            const s = Math.sin(col * 12.9898 + row * 78.233) * 43758.5453, v = s - Math.floor(s); return 206 + v * 22 + N(x, y, 5, 3) * 22; }); break; }
        case "paving": { const Tn = 3, tw = S / Tn, tone = Array.from({length: Tn * Tn}, () => (r() - 0.5) * 22);   // 0.5 m slabs with dark joints, stains
          fill((x, y) => { const i = Math.floor(x / tw), j = Math.floor(y / tw); const joint = x % tw < 4 || y % tw < 4; return joint ? 128 + N(x, y, 4, 2) * 16 : 206 + tone[j * Tn + i] + N(x, y, 3, 3) * 18 + N(x, y, 10, 1) * 10; });
          for (let i = 0; i < 6; i++) blot(r() * S, r() * S, 16 + r() * 40, 0.08 + r() * 0.1); break; }
        case "tactile": { fill((x, y) => 200 + N(x, y, 6, 2) * 16); g.fillStyle = "rgba(255,255,255,0.55)";   // dome grid (bump map lifts them)
          for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { g.beginPath(); g.arc(S / 12 + i * S / 6, S / 12 + j * S / 6, S / 18, 0, TAU); g.fill(); } break; }
        case "grate": { fill((x, y) => 190 + N(x, y, 6, 2) * 14); g.fillStyle = "#1a1a1a"; for (let i = 0; i < 7; i++) g.fillRect(S / 16, S / 14 + i * S / 7, S - S / 8, S / 16); break; }
        case "stripes": { fill((x, y) => 228 + N(x, y, 6, 2) * 10); g.fillStyle = "rgba(40,40,40,0.75)"; for (let i = 0; i < 4; i++) g.fillRect(i * S / 4, 0, S / 8, S); break; }
        case "gravel": fill((x, y) => 196 + N(x, y, 4, 3) * 30);
          g.globalAlpha = 0.9; for (let i = 0; i < 400; i++) { const v = 150 + r() * 90; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.ellipse(r() * S, r() * S, 2 + r() * 5, 2 + r() * 3, r() * TAU, 0, TAU); g.fill(); } g.globalAlpha = 1; break;
        case "grass": fill((x, y) => 196 + N(x, y, 10, 2) * 60 + N(x * 0.3, y * 4, 1, 3) * 20); break;
        case "leaf": fill((x, y) => 204 + N(x, y, 3, 3) * 70 + N(x, y, 12, 1) * 20); break;
        case "waste": { fill((x, y) => 120 + N(x, y, 4, 2) * 30);   // compressed mixed plastics: coloured patches under a grey web
          const cols = PAL.recycling.plastics; for (let i = 0; i < 160; i++) { const c = new THREE.Color(cols[Math.floor(r() * cols.length)]); g.fillStyle = `rgb(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0})`; g.globalAlpha = 0.75;
            g.save(); g.translate(r() * S, r() * S); g.rotate(r() * TAU); g.fillRect(-4 - r() * 14, -3 - r() * 8, 8 + r() * 28, 6 + r() * 16); g.restore(); }
          g.globalAlpha = 1; for (let i = 0; i < 40; i++) line(r() * S, r() * S, r() * S, r() * S, 1, 0.25, "#222"); break; }
        default: fill(() => 220);
      }
    });
    TEX.set(key, t); return t;
  }
  // Sky as an equirectangular CanvasTexture: v = 1 zenith, 0.5 horizon, 0 nadir (fog colour). three draws it through its camera-centred
  // box, which stays out of look.js's override passes (a plain 2D background texture is drawn as a plane mesh that the SAO normal
  // pass renders as a 2 x 2 m quad at the origin and turns into a black rectangle at the stage).
  function skyTex(stops, fog, {clouds = 0, seed = 1, warm = false} = {}) {
    const f = "#" + C(fog).getHexString(), r = KIT.rng(seed + 4242);
    const t = canvasTex(clouds ? 1024 : 32, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, stops[0]); gr.addColorStop(0.3, stops[1]); gr.addColorStop(0.49, stops[2]); gr.addColorStop(0.52, f); gr.addColorStop(1, f); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < clouds; i++) {
        const cx = r() * w, cy = h * (0.5 - 0.01 - r() * 0.16), rx = 40 + r() * 110, ry = 6 + r() * 14, a = 0.3 + r() * 0.34;
        for (let j = 0; j < 3; j++) { const ox = (r() - 0.5) * rx, oy = (r() - 0.5) * ry * 0.6, k = 0.6 + r() * 0.6;
          const cg = g.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rx * k); cg.addColorStop(0, warm ? `rgba(255,214,186,${a})` : `rgba(246,248,252,${a})`); cg.addColorStop(0.55, warm ? `rgba(226,170,160,${a * 0.5})` : `rgba(228,232,240,${a * 0.5})`); cg.addColorStop(1, "rgba(0,0,0,0)");
          g.save(); g.translate(cx + ox, cy + oy); g.scale(1, ry / rx); g.translate(-(cx + ox), -(cy + oy)); g.fillStyle = cg; g.fillRect(cx + ox - rx * k, cy + oy - rx * k, rx * k * 2, rx * k * 2); g.restore(); } } });
    t.mapping = THREE.EquirectangularReflectionMapping; t.wrapT = THREE.ClampToEdgeWrapping; return t;
  }
  function noPost(o) {
    o.onBeforeRender = (rd, s, c, g, m) => { const own = Array.isArray(o.material) ? o.material.indexOf(m) >= 0 : m === o.material; if (!own) g.setDrawRange(0, 0); };
    o.onAfterRender = (rd, s, c, g) => { g.setDrawRange(0, Infinity); };
    if (o.isSprite) o.raycast = () => {};
    return o;
  }
  function gradientTex(stops, w = 16, h = 256) {   // vertical gradient: stops top → bottom (window glow, shafts)
    return canvasTex(w, h, (g) => { const gr = g.createLinearGradient(0, 0, 0, h); stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c)); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  }
  const MAT = new Map();
  function mat(kind, o = {}) {   // public: KIT.place.mat(kind, {color, seed, roughness, metalness, vertex})
    const key = [kind, o.seed || 1, o.color ?? "", o.roughness ?? "", o.metalness ?? "", !!o.vertex, o.side || 0, o.transparent ? o.opacity : ""].join("|");
    if (!o.unique && MAT.has(key)) return MAT.get(key);
    const tx = texture(kind, o.seed || 1);
    const m = new THREE.MeshStandardMaterial({map: tx, bumpMap: BUMP[kind] ? tx : null, bumpScale: BUMP[kind] || 0, color: o.vertex ? 0xffffff : C(o.color ?? 0xffffff).clone().multiplyScalar(ALBEDO),
      roughness: o.roughness ?? ROUGH[kind] ?? 0.8, metalness: o.metalness ?? METAL[kind] ?? 0, vertexColors: !!o.vertex, side: o.side || THREE.FrontSide,
      transparent: !!o.transparent, opacity: o.opacity ?? 1});
    m.userData.tile = TILE[kind] || 1; m.name = "place:" + kind;
    if (!o.unique) MAT.set(key, m); return m;
  }
  const glow = (color, intensity = 1, o = {}) => Object.assign(new THREE.MeshStandardMaterial({color: o.color ?? 0x202020, emissive: color, emissiveIntensity: intensity, roughness: 0.6, vertexColors: !!o.vertex, side: o.side || THREE.FrontSide, map: o.map || null, emissiveMap: o.map || null}), {userData: {tile: 1}});

  // ── builder: collects parts per material and emits one merged mesh per material (vertex colours carry the tint)
  const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1), CYL = {}, SPH = {};
  const cylGeo = (seg = 12, open = false) => CYL[seg + (open ? "o" : "")] || (CYL[seg + (open ? "o" : "")] = new THREE.CylinderGeometry(1, 1, 1, seg, 1, open));
  const sphGeo = (detail = 1) => SPH[detail] || (SPH[detail] = new THREE.IcosahedronGeometry(1, detail));
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = V(), _s = V(), _e = new THREE.Euler();
  const compose = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  function builder(parent, M) {   // M: {name: material} shared for the place (vertex-coloured)
    const groups = new Map(), out = [];
    const api = {parent,
      add(geo, material, matrix, color = 0xffffff, uv = null) { let L = groups.get(material); if (!L) groups.set(material, L = []); L.push({geo, matrix, color: C(color).clone().multiplyScalar(ALBEDO), uv}); return api; },
      // box(w, h, d, material, color, x, y, z, ry = 0, rx = 0, rz = 0): y is the box centre
      box(w, h, d, material, color, x, y, z, ry = 0, rx = 0, rz = 0) {
        const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];   // px nx py ny pz nz face sizes for world-scale UVs
        return api.add(UNIT_BOX, material, compose(x, y, z, rx, ry, rz, w, h, d), color, (i, tile) => { const f = dims[i >> 2]; return [f[0] / tile, f[1] / tile]; }); },
      cyl(r, h, material, color, x, y, z, seg = 12, rx = 0, rz = 0, r2 = r) {
        const geo = r2 === r ? cylGeo(seg) : new THREE.CylinderGeometry(r2, r, 1, seg), sc = r2 === r ? r : 1, torso = (seg + 1) * 2;
        return api.add(geo, material, compose(x, y, z, rx, 0, rz, sc, h, sc), color, (i, tile) => i < torso ? [TAU * r / tile, h / tile] : [2 * r / tile, 2 * r / tile]); },
      sphere(r, material, color, x, y, z, detail = 1, sy = r, sz = r) { return api.add(sphGeo(detail), material, compose(x, y, z, 0, 0, 0, r, sy, sz), color, () => [1, 1]); },
      plane(w, h, material, color, x, y, z, ry = 0, rx = 0) { return api.add(PLANE, material, compose(x, y, z, rx, ry, 0, w, h, 1), color, (i, tile) => [w / tile, h / tile]); },
      flush(opts = {}) {
        for (const [material, parts] of groups) {
          let nv = 0, ni = 0;
          for (const p of parts) { nv += p.geo.attributes.position.count; ni += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count; }
          const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
          const nm = new THREE.Matrix3(), v = V(), tile = material.userData.tile || 1;
          let vo = 0, io = 0;
          for (const p of parts) {
            const P = p.geo.attributes.position, Nn = p.geo.attributes.normal, U = p.geo.attributes.uv, n = P.count; nm.getNormalMatrix(p.matrix);
            for (let i = 0; i < n; i++) {
              v.fromBufferAttribute(P, i).applyMatrix4(p.matrix); pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
              v.fromBufferAttribute(Nn, i).applyMatrix3(nm).normalize(); nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
              const s = p.uv ? p.uv(i, tile) : [1, 1]; uv[(vo + i) * 2] = (U ? U.getX(i) : 0) * s[0]; uv[(vo + i) * 2 + 1] = (U ? U.getY(i) : 0) * s[1];
              col[(vo + i) * 3] = p.color.r; col[(vo + i) * 3 + 1] = p.color.g; col[(vo + i) * 3 + 2] = p.color.b;
            }
            if (p.geo.index) for (let i = 0; i < p.geo.index.count; i++) idx[io + i] = p.geo.index.getX(i) + vo; else for (let i = 0; i < n; i++) idx[io + i] = vo + i;
            vo += n; io += p.geo.index ? p.geo.index.count : n;
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
          geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
          const mesh = new THREE.Mesh(geo, material); mesh.castShadow = opts.cast !== false; mesh.receiveShadow = opts.receive !== false; mesh.name = opts.name || material.name;
          if (opts.far || material.userData.noPost) noPost(mesh);
          parent.add(mesh); out.push(mesh);
        }
        groups.clear(); return out;
      }};
    return api;
  }
  const PLANE = new THREE.PlaneGeometry(1, 1);
  // material set for one place: every entry is vertex-coloured so one merged mesh carries many tints
  function materials(seed) {
    const M = {};
    for (const k of Object.keys(TILE)) M[k] = mat(k, {seed, vertex: true});
    M.glassy = mat("glass", {seed, vertex: true, transparent: true, opacity: 0.45, roughness: 0.08, metalness: 0.2, side: THREE.DoubleSide});
    M.dark = mat("plastic", {seed, vertex: true, roughness: 0.4, metalness: 0.1});
    M.wallB = mat("plaster", {seed, vertex: true, side: THREE.BackSide}); M.glow = {};
    M.light = (color, intensity, o = {}) => { const k = color + "|" + intensity + "|" + (o.map ? o.map.uuid : ""); return M.glow[k] || (M.glow[k] = glow(color, intensity, {vertex: true, map: o.map || null})); };
    return M;
  }

  // ── lights: hemisphere + shadowed key + fill + practicals; outside root (clean emphasis hides root, keeps shadows)
  function rig(scene, o) {
    const L = new THREE.Group(); L.name = "place_lights"; L.userData.rvEnv = true;
    const T = TIME[o.time] || TIME.day, st = V(...o.stage), R = o.radius || 10, G = o.gain || 1;
    const hemi = new THREE.HemisphereLight(o.hemi ? o.hemi[0] : T.hemi[0], o.hemi ? o.hemi[1] : T.hemi[1], (o.hemi ? o.hemi[2] : T.hemi[2]) * G); L.add(hemi);
    const dir = V(...(o.sun || T.sun)).normalize(), sun = new THREE.DirectionalLight(o.sunColor ?? T.sunColor, (o.sunInt ?? T.sunInt) * G);
    sun.position.copy(st).addScaledVector(dir, 28); sun.target.position.copy(st); L.add(sun, sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sun.shadow.radius = 2;
    const sc = sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 4; sc.far = 70; sc.updateProjectionMatrix();
    const fill = new THREE.DirectionalLight(o.fillColor ?? 0xcfdcea, (o.fill ?? T.fill) * G); fill.position.copy(st).add(V(-dir.x * 20, 10, -dir.z * 20)); fill.target.position.copy(st); L.add(fill, fill.target);
    for (const p of o.practical || []) {
      const l = p.spot ? new THREE.SpotLight(p.color, p.intensity * G, p.distance || 12, p.angle || 0.7, 0.5, 1) : new THREE.PointLight(p.color, p.intensity * G, p.distance || 10, 1);
      l.position.set(...p.at); if (p.spot) { l.target.position.set(...(p.target || [p.at[0], 0, p.at[2]])); L.add(l.target); } L.add(l);
    }
    scene.add(L); return {group: L, sun, hemi, fill};
  }
  // ── air: dust motes (Points), light shafts (additive quads), steam (Sprites). All pure functions of t.
  const softTex = () => TEX.get("soft") || (TEX.set("soft", canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.5, "rgba(255,255,255,.35)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); })), TEX.get("soft"));
  function dust(parent, anim, {seed = 1, count = 320, box = [16, 5, 16], at = [0, 2.5, 0], color = 0xfff4e0, size = 0.03, opacity = 0.4} = {}) {
    const r = KIT.rng(seed + 101), base = new Float32Array(count * 3), ph = new Float32Array(count * 3), pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { base[i * 3] = at[0] + (r() - 0.5) * box[0]; base[i * 3 + 1] = at[1] + (r() - 0.5) * box[1]; base[i * 3 + 2] = at[2] + (r() - 0.5) * box[2]; ph[i * 3] = r() * TAU; ph[i * 3 + 1] = r() * TAU; ph[i * 3 + 2] = r() * TAU; }
    const geo = new THREE.BufferGeometry(); const attr = new THREE.BufferAttribute(pos, 3); geo.setAttribute("position", attr);
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({color, size, sizeAttenuation: true, map: softTex(), transparent: true, opacity, depthWrite: false}));
    pts.name = "dust"; pts.frustumCulled = false; noPost(pts); parent.add(pts);
    anim.push(t => { for (let i = 0; i < count; i++) { const j = i * 3; pos[j] = base[j] + 0.25 * Math.sin(0.31 * t + ph[j]); pos[j + 1] = base[j + 1] + 0.12 * Math.sin(0.23 * t + ph[j + 1]) - 0.1 * Math.sin(0.07 * t + ph[j]); pos[j + 2] = base[j + 2] + 0.25 * Math.cos(0.27 * t + ph[j + 2]); } attr.needsUpdate = true; });
    return pts;
  }
  function shaft(parent, from, to, w, {color = 0xfff2d8, opacity = 0.12, top = 1.6} = {}) {   // a slanted quad from a window edge (from) to the floor (to)
    const a = V(...from), b = V(...to), dir = b.clone().sub(a), len = dir.length(), mid = a.clone().add(b).multiplyScalar(0.5);
    const g = new THREE.PlaneGeometry(w, len), m = new THREE.MeshBasicMaterial({map: gradientTex(["rgba(255,255,255,1)", "rgba(255,255,255,0)"]), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false});
    m.map.wrapS = m.map.wrapT = THREE.ClampToEdgeWrapping; const q = new THREE.Mesh(g, m); q.position.copy(mid); q.scale.y = 1; q.name = "shaft";
    q.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize().negate()); q.scale.set(1, 1, 1); q.userData.rvProp = true; parent.add(noPost(q));
    const wide = q.clone(); wide.scale.x = top; wide.material = m.clone(); wide.material.opacity = opacity * 0.5; parent.add(noPost(wide));
    return q;
  }
  function steam(parent, anim, at, {seed = 1, count = 10, height = 1.6, period = 3.2, size = 0.35, opacity = 0.32, color = 0xffffff, drift = 0.25} = {}) {
    const r = KIT.rng(seed + 303), puffs = [];
    for (let i = 0; i < count; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({map: softTex(), color, transparent: true, opacity: 0, depthWrite: false})); s.userData.rvProp = true; parent.add(noPost(s)); puffs.push({s, ph: i / count, dx: (r() - 0.5) * drift, dz: (r() - 0.5) * drift, sz: size * (0.8 + r() * 0.5)}); }
    anim.push(t => { for (const p of puffs) { const u = (t / period + p.ph) % 1, k = Math.sin(u * Math.PI);
      p.s.position.set(at[0] + p.dx * u * 3 + 0.05 * Math.sin(t * 1.3 + p.ph * 9), at[1] + u * height, at[2] + p.dz * u * 3); p.s.scale.setScalar(p.sz * (0.5 + u * 1.6)); p.s.material.opacity = opacity * k * (1 - u * 0.6); } });
  }
  // light pool: an additive soft disc on a surface under a lamp (fog off, not a focus subject)
  function pool(parent, at, radius, color = 0xfff0d8, opacity = 0.18, normal = "y") {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({map: softTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false}));
    q.position.set(at[0], at[1] + 0.004, at[2]); if (normal === "y") q.rotation.x = -Math.PI / 2; q.userData.rvProp = true; q.name = "pool"; parent.add(noPost(q)); return q;
  }
  // layered skyline cards: far silhouettes with baked haze, lit windows at dusk/night. Three layers = aerial perspective.
  function skylineCards(root, seed, time, T, {dist = [85, 120, 170], y = 0} = {}) {   // inside a far = 200 camera
    const night = time === "night", dusk = time === "dusk" || time === "golden", fog = C(T.fog), sky = C(T.sky[1]);
    dist.forEach((D, L) => {
      const r = KIT.rng(seed * 7 + L * 31), k = 0.62 + L * 0.15, col = fog.clone().lerp(sky, 0.35).multiplyScalar(night ? 0.35 : 1).lerp(fog, k);   // further = closer to the haze
      const tex = canvasTex(2048, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = `rgb(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0})`; const rects = [];
        for (let x = 0; x < w;) { const bw = 30 + r() * 90, bh = 40 + r() * (L === 0 ? 150 : 110) * (r() < 0.15 ? 1.4 : 1); g.fillRect(x, h - bh, bw, bh); rects.push([x, h - bh, bw, bh]);
          if (r() < 0.3) g.fillRect(x + bw * 0.4, h - bh - 18, 3, 18); if (r() < 0.25) g.fillRect(x + bw * 0.2, h - bh - 8, bw * 0.6, 8); x += bw + (r() < 0.3 ? 8 + r() * 20 : 0); }
        if (dusk || night) { g.fillStyle = night ? "rgba(255,220,160,0.9)" : "rgba(255,230,190,0.5)";
          for (const [bx, by, bw, bh] of rects) for (let i = 0, k = Math.floor(bw * bh / 220); i < k; i++) if (r() < 0.6) g.fillRect(bx + 3 + r() * (bw - 6), by + 4 + r() * (bh - 8), 2, 3); } });
      tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
      for (const side of [[0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]]) {   // a ring of four cards
        const m = new THREE.Mesh(new THREE.PlaneGeometry(D * 2.4, D * 0.36), new THREE.MeshBasicMaterial({map: tex, transparent: true, opacity: night ? 1 : 0.88, depthWrite: false, fog: false, side: THREE.DoubleSide}));
        m.position.set(side[0] * D, y + D * 0.18 - 2, side[2] * D); m.lookAt(0, m.position.y, 0); m.userData.rvProp = true; m.name = "skyline"; root.add(noPost(m));
      }
    });
  }
  function skyDress(root, anim, T, time, seed) {   // sun or moon disc far along the light direction + drifting clouds (bounded sinusoid, no wrap)
    const r = KIT.rng(seed + 909), night = time === "night", dir = V(...T.sun).normalize();
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({map: softTex(), color: night ? 0xdfe8ff : time === "dusk" ? 0xffb060 : 0xfff6e0, transparent: true, depthWrite: false, fog: false}));
    sun.position.copy(dir).multiplyScalar(300); sun.scale.setScalar(night ? 14 : 36); sun.userData.rvProp = true; sun.name = "sun_disc"; root.add(noPost(sun));
    const warm = time === "dusk" || time === "golden";
    if (!night) for (let i = 0; i < 9; i++) {   // each cloud = a few overlapping soft puffs in one group
      const grp = new THREE.Group(), x0 = (r() - 0.5) * 600, z = (r() - 0.5) * 600, s = 50 + r() * 80, ph = r() * TAU; grp.position.set(x0, 110 + r() * 70, z); root.add(grp);
      for (let j = 0; j < 4; j++) { const c = new THREE.Sprite(new THREE.SpriteMaterial({map: softTex(), color: warm ? 0xffc8a0 : 0xffffff, transparent: true, opacity: 0.16 + r() * 0.16, depthWrite: false, fog: false}));
        c.scale.set(s * (1.0 + r() * 0.8), s * (0.35 + r() * 0.3), 1); c.position.set((j - 1.5) * s * 0.5, (r() - 0.5) * s * 0.2, (r() - 0.5) * 20); c.userData.rvProp = true; c.name = "cloud"; grp.add(noPost(c)); }
      anim.push(t => { grp.position.x = x0 + 40 * Math.sin(t * 0.02 + ph); });
    }
  }
  // tree v2: tapered trunk, branching (main + secondary), clustered leaf masses at the tips, gentle sway
  function tree2(parent, B, M, anim, x, z, {h = 7, seed = 1, spread = 1, leaf = PAL.sidewalk.leaf, far = false, detail = 1} = {}) {
    const r = KIT.rng(seed), trunkH = h * 0.36, cg = new THREE.Group(); cg.position.set(x, trunkH, z); parent.add(cg);
    B.cyl(0.2 * spread, trunkH, M.wood, PAL.sidewalk.bark, x, trunkH / 2, z, 9, 0, 0, 0.12 * spread).cyl(0.3 * spread, 0.25, M.wood, PAL.sidewalk.bark, x, 0.12, z, 9, 0, 0, 0.2 * spread);
    const cb = builder(cg, M), up = V(0, 1, 0), q = new THREE.Quaternion(), tips = [];
    const branch = (from, dir, len, r0, r1) => { const d = dir.clone().normalize(), mid = from.clone().addScaledVector(d, len / 2); q.setFromUnitVectors(up, d);
      cb.add(new THREE.CylinderGeometry(r1, r0, 1, 7), M.wood, new THREE.Matrix4().compose(mid, q, V(1, len, 1)), PAL.sidewalk.bark, (i, tile) => [1, len / tile]); return from.clone().addScaledVector(d, len); };
    const nMain = 4 + Math.floor(r() * 2);
    for (let i = 0; i < nMain; i++) { const a = i / nMain * TAU + (r() - 0.5) * 0.6, el = 0.55 + r() * 0.5, L1 = h * (0.24 + r() * 0.1) * spread;
      const d1 = V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), tip1 = branch(V(0, -0.1, 0), d1, L1, 0.09 * spread, 0.05 * spread); tips.push(tip1);
      for (let j = 0; j < 2; j++) { const a2 = a + (j ? 0.7 : -0.7) + (r() - 0.5) * 0.4, el2 = el + 0.25 + r() * 0.3, L2 = L1 * (0.5 + r() * 0.3);
        const d2 = V(Math.cos(a2) * Math.cos(el2), Math.sin(el2), Math.sin(a2) * Math.cos(el2)); tips.push(branch(tip1.clone().addScaledVector(d1, -L1 * 0.25), d2, L2, 0.05 * spread, 0.025 * spread)); } }
    for (const p of tips) for (let k = 0; k < 3; k++) { const s = (0.42 + r() * 0.42) * spread; cb.sphere(s, M.leaf, vary(leaf, r, 0.16), p.x + (r() - 0.5) * 0.7, p.y + (r() - 0.3) * 0.6, p.z + (r() - 0.5) * 0.7, detail, s * (0.6 + r() * 0.3), s * (0.8 + r() * 0.35)); }
    for (let k = 0; k < 3; k++) { const s = (0.8 + r() * 0.5) * spread; cb.sphere(s, M.leaf, vary(leaf, r, 0.1), (r() - 0.5) * spread, h * 0.4 + r() * h * 0.15, (r() - 0.5) * spread, detail, s * 0.7, s); }
    cb.flush({name: "canopy", far}); sway(cg, anim, 0.01, 0.55 + r() * 0.3, r() * TAU); return cg;
  }
  // facade v2: the wall body sits back R behind the front plane; piers and spandrels are flush, so every window is a real
  // recess with frame, sill, tinted glass and (at dusk/night) a lit interior. Ground floor: storefront with sign band and awning,
  // or a plain lobby. Cornice, parapet, drainpipes, AC units, balconies, roof plant. One face per call (normal n = [nx, nz]).
  function facade(B, M, r, o) {
    const {cx, cz, n, w, floors, time, style = "plaster", tint = 0xcfc6b4, floorH = 3.3, shop = true, lobby = false, base = 0, signColor = 0x7a2a2a, skipBays = []} = o;
    const t = [n[1], -n[0]], ry = Math.atan2(n[0], n[1]), R = 0.25, on = (TIME[time] || TIME.day).lamps, T = TIME[time] || TIME.day;
    const put = (u, y, depth, su, sy, sn, mat, col, rx = 0) => B.box(su, sy, sn, mat, col, cx + t[0] * u - n[0] * depth, y, cz + t[1] * u - n[1] * depth, ry, rx);   // depth > 0 goes into the wall
    const wallMat = style === "brick" ? M.brick : style === "stone" ? M.stone : M.plaster, wallCol = style === "brick" ? 0xffffff : tint, trimCol = C(tint).clone().multiplyScalar(style === "brick" ? 0.9 : 0.8);
    const cols = Math.max(2, Math.round(w / 3.4)), bay = w / cols, h = base + floors * floorH, gf = shop || lobby ? floorH + 0.9 : floorH;   // taller ground floor
    const yOf = f => base + (f === 0 ? 0 : gf + (f - 1) * floorH), hOf = f => f === 0 ? gf : floorH;
    put(0, (base + h) / 2 + 0.3, R + 0.25, w, h - base + 0.6, 0.5, wallMat, wallCol);   // recessed face slab behind the openings
    for (let i = 0; i <= cols; i++) put(-w / 2 + i * bay, (base + h) / 2, 0.25, i === 0 || i === cols ? 0.6 : 0.45, h - base, 0.5, wallMat, wallCol);   // piers
    for (let f = 0; f <= floors; f++) { const y = f === floors ? h : yOf(f), sp = f === 0 ? 0.35 : 1.0; put(0, y + sp / 2 - (f === floors ? 0.3 : 0), 0.25, w, sp, 0.5, wallMat, wallCol); if (f > 0) put(0, y + 1.0, 0.15, w, 0.1, 0.35, M.concrete, trimCol); }   // spandrels + ledges
    for (let f = 0; f < floors; f++) for (let i = 0; i < cols; i++) {
      const u = -w / 2 + bay * (i + 0.5), y0 = yOf(f) + (f === 0 ? 0.35 : 1.0), wh = hOf(f) - (f === 0 ? 0.35 + 0.6 : 1.0 + 0.3), ww = bay - 0.45;
      if (f === 0 && (!shop || skipBays.includes(i))) { put(u, y0 + wh / 2, 0.1, ww, wh, 0.1, M.plaster, trimCol); continue; }   // plain lobby bay
      const lit = f === 0 || r() < (time === "night" ? 0.5 : on ? 0.35 : 0.08), inner = lit ? M.light(0xffd9a0, (f === 0 ? 0.25 : 0.5) + on * 0.6) : M.dark;
      put(u, y0 + wh / 2, R - 0.05, ww, wh, 0.1, inner, lit ? 0xffe0b0 : 0x3a4450);   // interior tint / lit room
      put(u, y0 + wh / 2, 0.1, ww, wh, 0.02, M.glassy, 0x8fa8bc);   // glass
      for (const s of [-1, 1]) { put(u + s * ww / 2, y0 + wh / 2, 0.08, 0.07, wh + 0.07, 0.08, M.plastic, 0xe8e8e4); put(u, y0 + (s > 0 ? wh : 0), 0.08, ww + 0.07, 0.07, 0.08, M.plastic, 0xe8e8e4); }   // frame
      if (f > 0) { put(u, y0 + wh / 2, 0.09, 0.04, wh, 0.05, M.plastic, 0xe8e8e4); put(u, y0 - 0.06, -0.08, ww + 0.2, 0.08, 0.3, M.concrete, trimCol); }   // mullion, sill
      if (f === 0) { put(u, y0 + wh + 0.5, -0.1, bay - 0.2, 0.7, 0.2, M.plastic, signColor); put(u, y0 + wh + 0.5, -0.21, bay - 0.9, 0.3, 0.02, M.light(0xfff0d0, 0.4 + on * 0.8), 0xfff0d0);   // fascia + lit sign strip
        for (let k = 0; k < 2; k++) { put(u, y0 + 0.9 + k * 0.9, R - 0.08, ww - 0.3, 0.04, 0.3, M.wood, 0x8a6a48); for (let j = 0; j < 4; j++) put(u - ww / 2 + 0.4 + j * (ww - 0.6) / 3, y0 + 1.05 + k * 0.9, R - 0.08, 0.18 + r() * 0.15, 0.2 + r() * 0.2, 0.18, M.plastic, pick(r, [0xd9534f, 0x3f7fbf, 0xe8c15a, 0x6fa83a, 0xf4f4f0])); }   // display shelves behind the glass
        if (r() < 0.6) put(u, y0 + wh + 0.05, -0.75, bay - 0.5, 0.06, 1.3, M.stripes, pick(r, [0x8a2a2a, 0x2a4a7a, 0x3a6a3a, 0xa08030]), 0.3); put(u, y0 + 0.2, -0.02, ww, 0.4, 0.06, M.concrete, 0x3a3d40); }   // awning, plinth
      else if (r() < 0.18) { put(u + (r() - 0.5) * 0.4, y0 - 0.4, -0.2, 0.7, 0.5, 0.4, M.metal, 0xcfd3d6); put(u, y0 - 0.4, -0.42, 0.45, 0.45, 0.02, M.grate, 0x8a8e92); }   // AC unit
      else if (style !== "brick" && r() < 0.15) { put(u, y0 - 0.05, -0.6, ww + 0.3, 0.12, 1.2, M.concrete, trimCol); for (let k = 0; k <= 6; k++) put(u - (ww + 0.3) / 2 + k * (ww + 0.3) / 6, y0 + 0.45, -1.15, 0.03, 1.0, 0.03, M.metal, 0x3a3d40); put(u, y0 + 0.95, -1.15, ww + 0.3, 0.04, 0.04, M.metal, 0x3a3d40); }   // balcony
    }
    put(0, h + 0.12, -0.15, w + 0.6, 0.25, 0.8, M.concrete, trimCol); put(0, h + 0.32, -0.05, w + 0.3, 0.16, 0.6, M.concrete, trimCol); put(0, h + 0.75, 0.3, w, 0.7, 0.4, wallMat, wallCol);   // cornice + parapet
    for (const s of [-1, 1]) { put(s * (w / 2 - 0.35), (base + h) / 2, -0.2, 0.09, h - base, 0.09, M.metal, 0x4a4e52); for (let y = base + 2; y < h; y += 3) put(s * (w / 2 - 0.35), y, -0.1, 0.16, 0.08, 0.2, M.metal, 0x4a4e52); }   // drainpipes
    return {h: h + 1.1, cols, bay};
  }
  function bicycle(B, M, x, z, ry, color = 0x2a4a7a) {   // simple bike: two thin wheels, frame tubes, bars, saddle
    const p = (lx, ly, lz) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, ly, z - Math.sin(ry) * lx + Math.cos(ry) * lz];
    for (const wx of [-0.5, 0.5]) { const q = p(wx, 0.34, 0); B.cyl(0.34, 0.03, M.rubber, 0x1a1a1a, q[0], q[1], q[2], 18, Math.PI / 2, 0); B.cyl(0.29, 0.035, M.metal, 0xc8ccd0, q[0], q[1], q[2], 18, Math.PI / 2, 0); }
    for (const [ax, ay, bx, by] of [[-0.5, 0.34, -0.1, 0.85], [-0.1, 0.85, 0.42, 0.78], [0.42, 0.78, 0.5, 0.34], [-0.1, 0.85, 0.05, 0.4], [0.05, 0.4, 0.5, 0.34], [-0.5, 0.34, 0.05, 0.4]]) {
      const q = p((ax + bx) / 2, (ay + by) / 2, 0), L = Math.hypot(bx - ax, by - ay); B.box(L, 0.03, 0.03, M.metal, color, q[0], q[1], q[2], ry, 0, Math.atan2(by - ay, bx - ax)); }
    let q = p(-0.12, 0.92, 0); B.box(0.22, 0.05, 0.12, M.plastic, 0x2a2d30, q[0], q[1], q[2], ry); q = p(0.45, 0.95, 0); B.box(0.04, 0.03, 0.5, M.metal, 0x3a3d40, q[0], q[1], q[2], ry);
  }
  // whole building with a detailed street face, plain body elsewhere, roof plant. front: [0, 1] faces +z, [0, -1] faces -z
  function building2(B, M, r, o) {
    const {x, z, w, d, floors, time, style, tint, front = [0, 1], shop = true, lobby = false, floorH = 3.3, seed = 1, skipBays = [], far = false} = o, h = floors * floorH + (shop || lobby ? 0.9 : 0);
    const cx = x + front[0] * d / 2, cz = z + front[1] * d / 2;   // centre of the street face
    const F = facade(B, M, r, {cx, cz, n: front, w, floors, time, style, tint, shop, lobby, floorH, skipBays, signColor: pick(r, [0x7a2a2a, 0x2a4a7a, 0x3a6a3a, 0x6a5a2a, 0x2a2a2a])});
    const wallMat = style === "brick" ? M.brick : style === "stone" ? M.stone : M.plaster, wallCol = style === "brick" ? 0xffffff : tint;
    B.box(front[0] ? d - 0.6 : w, F.h, front[1] ? d - 0.6 : w, wallMat, wallCol, x - front[0] * 0.3, F.h / 2, z - front[1] * 0.3);   // body
    const sideTex = facadeTex(seed, Math.max(1, Math.round((front[0] ? w : d) / 3.2)), floors, tint, time), em = time === "night" ? 1.2 : TIME[time].lamps ? 0.7 : 0;   // textured windows on the side walls
    const sm = new THREE.MeshStandardMaterial({map: sideTex.map, emissiveMap: sideTex.em, emissive: 0xffffff, emissiveIntensity: em, roughness: 0.85, color: new THREE.Color(ALBEDO, ALBEDO, ALBEDO)});
    const sg = new THREE.PlaneGeometry(front[0] ? w : d, floors * floorH), sides = front[0] ? [[x, z + w / 2 + 0.01, 0], [x, z - w / 2 - 0.01, Math.PI]] : [[x + w / 2 + 0.01, z, Math.PI / 2], [x - w / 2 - 0.01, z, -Math.PI / 2]];
    for (const [sx, sz, sry] of sides) { const m = new THREE.Mesh(sg, sm); m.position.set(sx, floors * floorH / 2 + (shop || lobby ? 0.9 : 0), sz); m.rotation.y = sry; m.receiveShadow = true; m.name = "side_windows"; if (far) noPost(m); B.parent.add(m); }
    for (let i = 0; i < 3; i++) { const bx = x + (r() - 0.5) * (w - 4), bz = z + (r() - 0.5) * (d - 4); B.box(1.2 + r(), 0.8 + r() * 0.6, 1.0 + r(), M.metal, 0x9aa0a4, bx, F.h + 0.5, bz).cyl(0.35, 0.04, M.grate, 0x6a6e72, bx, F.h + 0.95 + r() * 0.3, bz, 16); }   // roof AC units
    if (floors >= 6) B.cyl(1.0, 1.6, M.metal, 0x8a7a6a, x + w * 0.25, F.h + 1.4, z - d * 0.2, 12).cyl(0.04, 4, M.metal, 0x4a4e52, x - w * 0.3, F.h + 2, z + d * 0.2, 6);   // water tank, antenna
    B.box(2.2, 2.4, 2.4, wallMat, wallCol, x - w * 0.3, F.h + 1.2, z - d * 0.3);   // stair bulkhead
    return {h: F.h};
  }
  // ── small helpers shared by the kinds
  const keep = (x, z, r, clear, cx = 0, cz = 0) => Math.hypot(x - cx, z - cz) - r >= clear;   // prop footprint stays outside the clear circle
  const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
  const vary = (c, r, amt = 0.06) => C(c).clone().offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * amt, (r() - 0.5) * amt);
  function sway(group, anim, amp = 0.02, speed = 0.7, phase = 0) { anim.push(t => { group.rotation.z = amp * Math.sin(t * speed + phase); group.rotation.x = amp * 0.6 * Math.sin(t * speed * 0.73 + phase * 1.7); }); }
  function tris(root) { let n = 0; root.traverse(o => { if (!o.isMesh && !o.isPoints) return; const g = o.geometry, c = g.index ? g.index.count : g.attributes.position.count; n += (o.isPoints ? 0 : c / 3) * (o.isInstancedMesh ? o.count : 1); }); return Math.round(n); }
  // room: inward-facing box (BackSide) so look.js reads the set as indoor; floor/ceiling/walls get their own materials and world-scale UVs
  const BACK = new Map();   // BackSide twins of the shared materials: a room is seen from inside, FrontSide faces would be culled
  const backOf = m => { let b = BACK.get(m); if (!b) { b = m.clone(); b.side = THREE.BackSide; b.userData = {tile: m.userData.tile}; b.name = m.name + ":back"; BACK.set(m, b); } return b; };
  function room(parent, w, h, d, {floor, wall, ceiling}, {x = 0, z = 0, y = -0.2, glow = 0} = {}) {   // each entry [material, tint]; box bottom sits at y (under the floor slab)
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]], faces = [wall, wall, ceiling, floor, wall, wall];
    const col = new Float32Array(uv.count * 3);
    for (let i = 0; i < uv.count; i++) { const f = i >> 2, tile = faces[f][0].userData.tile || 1, c = C(faces[f][1]).clone().multiplyScalar(ALBEDO); uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mats = faces.map(f => backOf(f[0]));
    if (glow) { const cm = mats[2].clone(); cm.emissive = new THREE.Color(0xffffff); cm.emissiveIntensity = glow; cm.emissiveMap = cm.map; cm.userData = {tile: mats[2].userData.tile}; cm.name = mats[2].name + ":lit"; mats[2] = cm; }
    const box = new THREE.Mesh(g, mats); box.position.set(x, y + h / 2, z); box.receiveShadow = true; box.castShadow = false; box.name = "room"; parent.add(box); return box;
  }
  // ── prop library (B = builder of the static merged set, M = materials(seed); movers get their own group + builder)
  function tree(parent, B, M, anim, x, z, {h = 6, seed = 1, spread = 1} = {}) {
    const r = KIT.rng(seed), trunkH = h * 0.42, cg = new THREE.Group(); cg.position.set(x, trunkH, z); parent.add(cg);
    B.cyl(0.18 * spread, trunkH, M.wood, PAL.sidewalk.bark, x, trunkH / 2, z, 8, 0, 0, 0.12 * spread);
    const cb = builder(cg, M);
    for (let i = 0; i < 6; i++) { const a = r() * TAU, rr = (0.2 + r() * 0.9) * spread, y = (0.3 + r() * 0.75) * (h - trunkH);
      cb.sphere((0.9 + r() * 0.8) * spread, M.leaf, vary(PAL.sidewalk.leaf, r, 0.12), Math.cos(a) * rr, y, Math.sin(a) * rr, 1, (0.7 + r() * 0.4) * spread, (0.9 + r() * 0.6) * spread); }
    for (let i = 0; i < 3; i++) { const a = r() * TAU; cb.cyl(0.04, 1.4, M.wood, PAL.sidewalk.bark, Math.cos(a) * 0.3, 0.6, Math.sin(a) * 0.3, 6, Math.cos(a) * 0.6, Math.sin(a) * 0.6); }
    cb.flush({name: "canopy"}); sway(cg, anim, 0.012, 0.6 + r() * 0.3, r() * TAU); return cg;
  }
  function car(parent, M, {seed = 1, color = 0xb8bcc0, x = 0, z = 0, ry = 0, lights = 0} = {}) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g); const b = builder(g, M), r = KIT.rng(seed);
    const paint = M.metal, body = vary(color, r, 0.04);
    b.box(4.3, 0.5, 1.8, paint, body, 0, 0.58, 0).box(2.2, 0.55, 1.7, M.glassy, 0x7f93a3, -0.2, 1.1, 0).box(2.2, 0.06, 1.72, paint, body, -0.2, 1.4, 0)
      .box(0.9, 0.5, 1.72, paint, body, 1.0, 1.08, 0, 0, 0, 0.35).box(0.7, 0.5, 1.72, paint, body, -1.65, 1.08, 0, 0, 0, -0.5)
      .box(0.35, 0.22, 1.9, M.dark, 0x1a1c1e, 2.1, 0.45, 0).box(0.35, 0.22, 1.9, M.dark, 0x1a1c1e, -2.1, 0.45, 0).box(4.0, 0.3, 1.6, M.dark, 0x151617, 0, 0.3, 0);
    for (const [wx, wz] of [[1.4, 0.8], [1.4, -0.8], [-1.4, 0.8], [-1.4, -0.8]]) { b.cyl(0.33, 0.22, M.rubber, 0x1a1a1a, wx, 0.33, wz, 14, Math.PI / 2); b.cyl(0.2, 0.24, M.metal, 0xb0b4b8, wx, 0.33, wz, 10, Math.PI / 2); }
    for (const s of [-1, 1]) { b.box(0.08, 0.18, 0.4, M.light(0xfff2c8, 0.5 + lights * 1.2), 0xe8e8e8, 2.16, 0.7, s * 0.6).box(0.06, 0.14, 0.35, M.light(0xff2a1a, 0.4 + lights), 0x6a1010, -2.16, 0.7, s * 0.62); }
    for (const m of b.flush({name: "car"})) m.userData.rvProp = true;
    return g;
  }
  function lampPost(B, M, x, z, h, on, {ax = 1.2, az = 0, color = 0x2e3236} = {}) {   // arm reaches (ax, az) from the pole
    B.cyl(0.11, h, M.metal, color, x, h / 2, z, 10, 0, 0, 0.08).cyl(0.2, 0.08, M.metal, color, x, 0.04, z, 12)
      .box(Math.abs(ax) + 0.08, 0.08, Math.abs(az) + 0.08, M.metal, color, x + ax / 2, h - 0.1, z + az / 2).box(0.6, 0.14, 0.35, M.metal, color, x + ax, h - 0.08, z + az)
      .box(0.5, 0.04, 0.28, M.light(0xffe3b0, 0.4 + on * 2.2), 0xfff0d0, x + ax, h - 0.16, z + az);
  }
  function bench(B, M, x, z, ry, {wood = 0x8a6a48, metal = 0x30343a} = {}) {
    const g = (lx, ly, lz) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, ly, z - Math.sin(ry) * lx + Math.cos(ry) * lz];
    for (const dz of [-0.2, -0.05, 0.1, 0.25]) { const p = g(0, 0.45, dz); B.box(1.8, 0.04, 0.12, M.wood, wood, p[0], p[1], p[2], ry); }
    for (const dz of [0.0, 0.14]) { const p = g(0, 0.72 + dz * 1.5, -0.33 - dz * 0.4); B.box(1.8, 0.1, 0.04, M.wood, wood, p[0], p[1], p[2], ry); }
    for (const dx of [-0.75, 0.75]) { const p = g(dx, 0.23, 0); B.box(0.06, 0.46, 0.5, M.metal, metal, p[0], p[1], p[2], ry); const q = g(dx, 0.62, -0.32); B.box(0.06, 0.4, 0.06, M.metal, metal, q[0], q[1], q[2], ry); }
  }
  function chair(B, M, x, z, ry, color = 0x4d7fa6, legs = 0x8a8e92) {
    const p = (lx, ly, lz) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, ly, z - Math.sin(ry) * lx + Math.cos(ry) * lz];
    let q = p(0, 0.45, 0); B.box(0.44, 0.04, 0.44, M.plastic, color, q[0], q[1], q[2], ry);
    q = p(0, 0.72, -0.2); B.box(0.44, 0.42, 0.03, M.plastic, color, q[0], q[1], q[2], ry);
    for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) { q = p(lx, 0.22, lz); B.box(0.03, 0.44, 0.03, M.metal, legs, q[0], q[1], q[2], ry); }
  }
  function table(B, M, x, z, w, d, h, top = 0x8a6240, legs = 0x3a3d42, ry = 0) {
    B.box(w, 0.04, d, M.wood, top, x, h - 0.02, z, ry);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const lx = sx * (w / 2 - 0.06), lz = sz * (d / 2 - 0.06); B.box(0.05, h - 0.04, 0.05, M.metal, legs, x + Math.cos(ry) * lx + Math.sin(ry) * lz, (h - 0.04) / 2, z - Math.sin(ry) * lx + Math.cos(ry) * lz, ry); }
  }
  function plant(parent, M, anim, x, z, {h = 1.2, seed = 1, pot = 0x8a5a3c, leaf = 0x3d7a3a} = {}) {
    const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g); const b = builder(g, M), r = KIT.rng(seed);
    b.cyl(0.13, 0.32, M.plastic, pot, 0, 0.16, 0, 12, 0, 0, 0.16).cyl(0.14, 0.04, M.concrete, 0x3b2d22, 0, 0.33, 0, 12);
    const lg = new THREE.Group(); lg.position.y = 0.34; g.add(lg); const lb = builder(lg, M);
    for (let i = 0; i < 9; i++) { const a = r() * TAU, tilt = 0.5 + r() * 0.6, L = (h - 0.4) * (0.5 + r() * 0.5);
      lb.cyl(0.012, L, M.plastic, 0x3a6a2c, Math.cos(a) * Math.sin(tilt) * L / 2, Math.cos(tilt) * L / 2, Math.sin(a) * Math.sin(tilt) * L / 2, 5, Math.sin(a) * tilt, -Math.cos(a) * tilt);
      lb.sphere(0.07, M.leaf, vary(leaf, r, 0.1), Math.cos(a) * Math.sin(tilt) * L, Math.cos(tilt) * L, Math.sin(a) * Math.sin(tilt) * L, 1, 0.025, 0.2); }
    b.flush({name: "pot"}); lb.flush({name: "leaves"}); sway(lg, anim, 0.03, 1.1, r() * TAU); return g;
  }
  function monitor(B, M, x, y, z, ry, screen, {w = 0.55, h = 0.33} = {}) {
    const p = (lx, ly, lz) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, y + ly, z - Math.sin(ry) * lx + Math.cos(ry) * lz];
    let q = p(0, 0.02, 0); B.box(0.22, 0.02, 0.16, M.dark, 0x24272a, q[0], q[1], q[2], ry); q = p(0, 0.1, -0.03); B.box(0.05, 0.16, 0.03, M.dark, 0x24272a, q[0], q[1], q[2], ry);
    q = p(0, 0.18 + h / 2, 0); B.box(w + 0.03, h + 0.03, 0.03, M.dark, 0x1b1d20, q[0], q[1], q[2], ry); q = p(0, 0.18 + h / 2, 0.018); B.box(w, h, 0.005, screen, 0xffffff, q[0], q[1], q[2], ry);
  }
  function shelfUnit(B, M, x, y, z, w, h, d, n, color, ry = 0, back = true) {
    const p = (lx, ly, lz) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, y + ly, z - Math.sin(ry) * lx + Math.cos(ry) * lz];
    for (const s of [-1, 1]) { const q = p(s * (w / 2 - 0.01), h / 2, 0); B.box(0.02, h, d, M.metal, color, q[0], q[1], q[2], ry); }
    for (let i = 0; i <= n; i++) { const q = p(0, i * h / n, 0); B.box(w, 0.025, d, M.metal, color, q[0], q[1] + 0.012, q[2], ry); }
    if (back) { const q = p(0, h / 2, -d / 2 + 0.01); B.box(w, h, 0.015, M.metal, C(color).clone().multiplyScalar(0.85), q[0], q[1], q[2], ry); }
  }
  function bottles(B, M, r, x0, x1, y, z, n, colors, {ry = 0, cx = 0, cz = 0, size = 1} = {}) {   // a row of flasks and bottles; ry rotates the row about (cx, cz)
    for (let i = 0; i < n; i++) { const u = n === 1 ? 0.5 : i / (n - 1), lx = x0 + (x1 - x0) * u + (r() - 0.5) * 0.05, rad = (0.03 + r() * 0.035) * size, hh = (0.12 + r() * 0.2) * size;
      const wx = cx + Math.cos(ry) * (lx - cx) + Math.sin(ry) * (z - cz), wz = cz - Math.sin(ry) * (lx - cx) + Math.cos(ry) * (z - cz), col = pick(r, colors), kind = r();
      if (kind < 0.35) B.cyl(rad * 1.4, hh, M.glassy, col, wx, y + hh / 2, wz, 8, 0, 0, rad * 0.3);   // erlenmeyer
      else B.cyl(rad, hh, kind < 0.7 ? M.glassy : M.plastic, col, wx, y + hh / 2, wz, 8);
      B.cyl(rad * 0.45, 0.025, M.plastic, kind < 0.5 ? 0xe8e8e8 : 0x2a2d30, wx, y + hh + 0.012, wz, 8); }
  }
  // base/upper cabinets along x: doors are drawn as shallow panels with gaps and handles
  function cabinets(B, M, x0, x1, y0, h, d, zFront, {door = 0.6, color = 0xcfd6d0, handle = 0x9a9ea2, top = null, topH = 0.04, toe = 0.08, ry = 0, cx = 0, cz = 0} = {}) {
    const p = (lx, ly, lz) => [cx + Math.cos(ry) * (lx - cx) + Math.sin(ry) * (lz - cz), ly, cz - Math.sin(ry) * (lx - cx) + Math.cos(ry) * (lz - cz)];
    const w = x1 - x0, xm = (x0 + x1) / 2, zc = zFront - d / 2, n = Math.max(1, Math.round(w / door)), dw = w / n;
    let q = p(xm, y0 + toe / 2, zc - 0.03); if (toe) B.box(w, toe, d - 0.06, M.plastic, 0x3a3d40, q[0], q[1], q[2], ry);
    q = p(xm, y0 + toe + (h - toe) / 2, zc); B.box(w, h - toe, d, M.plastic, C(color).clone().multiplyScalar(0.9), q[0], q[1], q[2], ry);
    for (let i = 0; i < n; i++) { const dx = x0 + dw * (i + 0.5); q = p(dx, y0 + toe + (h - toe) / 2, zFront + 0.009); B.box(dw - 0.02, h - toe - 0.02, 0.018, M.plastic, color, q[0], q[1], q[2], ry);
      q = p(dx + (i % 2 ? -1 : 1) * (dw / 2 - 0.06), y0 + toe + (h - toe) * (y0 > 1 ? 0.15 : 0.85), zFront + 0.03); B.box(0.02, 0.12, 0.02, M.metal, handle, q[0], q[1], q[2], ry); }
    if (top) { q = p(xm, y0 + h + topH / 2, zc - 0.01); B.box(w + 0.02, topH, d + 0.04, top.mat || M.tile, top.color || 0x6a6d70, q[0], q[1], q[2], ry); }
    return {top: y0 + h + (top ? topH : 0)};
  }
  function doorUnit(B, M, x, z, ry, {w = 0.95, h = 2.1, color = 0xd8dcd8, frame = 0x8a8e92, glass = false, open = 0} = {}) {
    const p = (lx, ly, lz) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, ly, z - Math.sin(ry) * lx + Math.cos(ry) * lz];
    for (const s of [-1, 1]) { const q = p(s * (w / 2 + 0.04), h / 2, 0); B.box(0.08, h, 0.14, M.plastic, frame, q[0], q[1], q[2], ry); }
    let q = p(0, h + 0.04, 0); B.box(w + 0.16, 0.08, 0.14, M.plastic, frame, q[0], q[1], q[2], ry);
    q = p(0, h / 2, 0); B.box(w, h - 0.02, 0.05, glass ? M.glassy : M.plastic, glass ? 0x8fa6b8 : color, q[0], q[1], q[2], ry + open);
    q = p(w / 2 - 0.1, 1.02, 0.06); B.box(0.14, 0.03, 0.04, M.metal, 0xb8bcc0, q[0], q[1], q[2], ry);
  }
  // window: frame + glowing pane (the outside light) + mullions + sill + optional blinds; ry 0 faces +z
  function windowUnit(B, M, x, y, z, w, h, ry, glowMat, {sill = true, blinds = 0, frame = 0xe8e8e8, cols = 2, rows = 2} = {}) {
    const p = (lx, ly, lz) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, y + ly, z - Math.sin(ry) * lx + Math.cos(ry) * lz];
    let q = p(0, 0, -0.02); B.box(w, h, 0.02, glowMat, 0xffffff, q[0], q[1], q[2], ry);
    for (const s of [-1, 1]) { q = p(s * w / 2, 0, 0.03); B.box(0.06, h + 0.06, 0.1, M.plastic, frame, q[0], q[1], q[2], ry); q = p(0, s * h / 2, 0.03); B.box(w + 0.06, 0.06, 0.1, M.plastic, frame, q[0], q[1], q[2], ry); }
    for (let i = 1; i < cols; i++) { q = p(-w / 2 + w * i / cols, 0, 0.02); B.box(0.035, h, 0.05, M.plastic, frame, q[0], q[1], q[2], ry); }
    for (let i = 1; i < rows; i++) { q = p(0, -h / 2 + h * i / rows, 0.02); B.box(w, 0.035, 0.05, M.plastic, frame, q[0], q[1], q[2], ry); }
    if (sill) { q = p(0, -h / 2 - 0.05, 0.08); B.box(w + 0.2, 0.04, 0.2, M.plastic, frame, q[0], q[1], q[2], ry); }
    if (blinds) { const n = Math.round(h * blinds / 0.04); for (let i = 0; i < n; i++) { q = p(0, h / 2 - 0.02 - i * 0.04, 0.09); B.box(w - 0.04, 0.012, 0.03, M.plastic, 0xeeeeea, q[0], q[1], q[2], ry, 0.25); } }
  }
  function pallet(B, M, x, z, ry, {stack = 0, seed = 1, color = PAL.factory.pallet} = {}) {
    const r = KIT.rng(seed), p = (lx, ly, lz) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, ly, z - Math.sin(ry) * lx + Math.cos(ry) * lz];
    for (const dz of [-0.5, 0, 0.5]) { const q = p(0, 0.05, dz); B.box(1.2, 0.1, 0.1, M.wood, color, q[0], q[1], q[2], ry); }
    for (const dx of [-0.55, -0.18, 0.18, 0.55]) { const q = p(dx, 0.125, 0); B.box(0.1, 0.03, 1.0, M.wood, color, q[0], q[1], q[2], ry); }
    if (stack === "boxes") for (let i = 0; i < 2; i++) for (const [bx, bz] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) { const q = p(bx, 0.14 + 0.4 * i + 0.2, bz); B.box(0.56, 0.38, 0.46, M.fabric, vary(0xb08858, r, 0.05), q[0], q[1], q[2], ry + (r() - 0.5) * 0.08); }
    if (stack === "drums") for (const [bx, bz] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) { const q = p(bx, 0.14 + 0.44, bz); B.cyl(0.28, 0.88, M.metal, pick(r, PAL.factory.drum), q[0], q[1], q[2], 14); for (const yy of [0.3, 0.6]) B.cyl(0.29, 0.03, M.metal, 0x8a8e92, q[0], 0.14 + yy, q[2], 14); }
    if (stack === "sacks") for (let i = 0; i < 3; i++) for (const [bx, bz] of [[-0.3, -0.25], [0.3, 0.25], [0.3, -0.25], [-0.3, 0.25]]) { const q = p(bx, 0.14 + 0.22 * i + 0.11, bz); B.sphere(0.32, M.fabric, vary(0xd8d2c0, r, 0.05), q[0], q[1], q[2], 1, 0.12, 0.26); }
  }
  function machine(B, M, x, z, ry, seed, {w = 2.4, h = 2.0, d = 1.4} = {}) {   // a generic shop-floor machine: cabinet, head, control panel with a lit screen, pipes
    const r = KIT.rng(seed), col = pick(r, PAL.factory.machine), p = (lx, ly, lz) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, ly, z - Math.sin(ry) * lx + Math.cos(ry) * lz];
    let q = p(0, 0.08, 0); B.box(w, 0.16, d, M.metal, 0x2a2d30, q[0], q[1], q[2], ry);
    q = p(0, h * 0.4, 0); B.box(w, h * 0.65, d, M.metal, col, q[0], q[1], q[2], ry);
    q = p(-w * 0.2, h * 0.86, 0); B.box(w * 0.5, h * 0.3, d * 0.8, M.metal, C(col).clone().multiplyScalar(0.8), q[0], q[1], q[2], ry);
    q = p(w * 0.28, h * 0.78, -d * 0.1); B.box(w * 0.3, h * 0.12, d * 0.6, M.glassy, 0x9ab4c4, q[0], q[1], q[2], ry);
    q = p(w / 2 + 0.12, 1.25, d * 0.25); B.box(0.08, 0.4, 0.5, M.dark, 0x2a2d30, q[0], q[1], q[2], ry); q = p(w / 2 + 0.165, 1.3, d * 0.25); B.box(0.01, 0.22, 0.34, M.light(0x7fd3ff, 0.9), 0x203040, q[0], q[1], q[2], ry);
    q = p(w / 2 + 0.08, 0.7, d * 0.25); B.box(0.06, 1.1, 0.06, M.metal, 0x3a3d40, q[0], q[1], q[2], ry);
    for (let i = 0; i < 3; i++) { q = p(-w / 2 + 0.2 + i * 0.3, h * 0.65 + 0.4, -d / 2 + 0.1); B.cyl(0.04, 0.8, M.metal, pick(r, PAL.factory.pipe), q[0], q[1], q[2], 8); }
    q = p(0, h * 0.72 + 0.01, 0); B.box(w * 0.9, 0.02, d * 0.9, M.light(0xe0c040, 0.2), 0xe4b429, q[0], q[1], q[2], ry);
    for (const yy of [h * 0.22, h * 0.5]) { q = p(0, yy, d / 2 + 0.005); B.box(w * 0.94, 0.025, 0.01, M.dark, 0x24272a, q[0], q[1], q[2], ry); }
    q = p(-w * 0.3, h * 0.36, d / 2 + 0.008); B.box(0.36, 0.14, 0.006, M.stripes, PAL.factory.line, q[0], q[1], q[2], ry); q = p(w * 0.25, h * 0.36, d / 2 + 0.008); B.box(0.28, 0.2, 0.006, M.plastic, 0xf2f2f2, q[0], q[1], q[2], ry);
  }
  function forklift(parent, M, {seed = 1, color = 0xe0a51a} = {}) {   // faces +x, forks ahead
    const g = new THREE.Group(); parent.add(g); const b = builder(g, M);
    b.box(1.6, 0.5, 1.05, M.metal, color, -0.2, 0.55, 0).box(0.7, 0.5, 1.05, M.metal, 0x3a3d40, -0.75, 1.0, 0).box(0.9, 0.08, 0.5, M.plastic, 0x2a2d30, -0.1, 0.85, 0).box(0.5, 0.5, 0.5, M.fabric, 0x2a2d30, -0.55, 1.1, 0)
      .box(0.3, 1.4, 0.9, M.metal, 0x2a2d30, -0.1, 1.55, 0);
    for (const s of [-1, 1]) b.box(0.08, 2.4, 0.1, M.metal, 0x3a3d40, 0.65, 1.2, s * 0.42).box(0.08, 2.2, 0.08, M.metal, 0x2a2d30, -0.95, 1.95, s * 0.48).box(1.9, 0.05, 0.08, M.metal, 0x3a3d40, 0.0, 2.1, s * 0.48);
    b.box(1.9, 0.04, 0.9, M.metal, 0x3a3d40, 0, 2.12, 0).box(0.12, 0.02, 0.9, M.metal, 0x3a3d40, 0.65, 2.4, 0);
    for (const s of [-1, 1]) b.box(1.1, 0.04, 0.12, M.metal, 0x5a5e62, 1.25, 0.08, s * 0.3).box(0.04, 0.6, 0.12, M.metal, 0x5a5e62, 0.72, 0.36, s * 0.3);
    for (const [wx, wz, rr] of [[0.45, 0.55, 0.3], [0.45, -0.55, 0.3], [-0.85, 0.5, 0.24], [-0.85, -0.5, 0.24]]) { b.cyl(rr, 0.22, M.rubber, 0x1a1a1a, wx, rr, wz, 12, Math.PI / 2); b.cyl(rr * 0.55, 0.24, M.metal, 0xb0b4b8, wx, rr, wz, 8, Math.PI / 2); }
    b.box(0.2, 0.12, 0.12, M.light(0xffb020, 0.8), 0xffb020, -0.95, 2.46, 0);
    for (const m of b.flush({name: "forklift"})) m.userData.rvProp = true;
    return g;
  }
  function loader(parent, M, anim, {x = 0, z = 0, ry = 0, color = 0xe0a51a} = {}) {   // wheel loader silhouette with a slowly working boom
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g); const b = builder(g, M);
    b.box(2.4, 1.3, 2.0, M.metal, color, -1.6, 1.4, 0).box(2.0, 0.9, 2.0, M.metal, color, 0.6, 1.1, 0).box(1.4, 1.3, 1.6, M.glassy, 0x7f93a3, -1.4, 2.6, 0).box(1.5, 0.1, 1.7, M.metal, 0x2a2d30, -1.4, 3.3, 0)
      .box(0.5, 0.6, 1.5, M.metal, 0x2a2d30, -3.0, 1.4, 0).cyl(0.12, 1.2, M.metal, 0x2a2d30, -2.3, 2.6, 0.5, 8);
    for (const [wx, wz] of [[1.0, 1.15], [1.0, -1.15], [-2.0, 1.15], [-2.0, -1.15]]) { b.cyl(0.75, 0.6, M.rubber, 0x1a1a1a, wx, 0.75, wz, 16, Math.PI / 2); b.cyl(0.4, 0.62, M.metal, 0x8a8e92, wx, 0.75, wz, 10, Math.PI / 2); }
    b.flush({name: "loader"});
    const arm = new THREE.Group(); arm.position.set(1.2, 1.9, 0); g.add(arm); const ab = builder(arm, M);
    for (const s of [-1, 1]) ab.box(2.6, 0.22, 0.2, M.metal, color, 1.3, 0, s * 0.7, 0, 0, -0.3);
    ab.box(0.9, 0.9, 2.6, M.metal, 0x5a5e62, 2.75, -0.9, 0).box(0.1, 0.5, 2.6, M.metal, 0x6a6e72, 3.2, -0.4, 0);
    ab.box(0.12, 1.3, 0.12, M.metal, 0x8a8e92, 0.6, 0.5, 0, 0, 0, 0.5);
    ab.flush({name: "boom"}); g.traverse(o => { if (o.isMesh) o.userData.rvProp = true; });
    anim.push(t => { arm.rotation.z = 0.12 * Math.sin(t * 0.35) - 0.05; }); return g;
  }
  function conveyor(parent, M, anim, {x = 0, z = 0, ry = 0, length = 8, rise = 2.2, w = 0.9, seed = 1, speed = 0.5} = {}) {   // belt climbs from (0,0.7) to (length, 0.7 + rise)
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g); const b = builder(g, M), r = KIT.rng(seed);
    const y0 = 0.7, ang = Math.atan2(rise, length), L = Math.hypot(length, rise);
    for (const s of [-1, 1]) b.box(L, 0.16, 0.06, M.metal, 0x3f6fa8, length / 2, y0 + rise / 2, s * (w / 2 + 0.03), 0, 0, ang);
    for (let i = 0; i <= 4; i++) { const u = i / 4, lx = u * length, ly = y0 + u * rise; for (const s of [-1, 1]) b.box(0.08, ly, 0.08, M.metal, 0x3a3d40, lx, ly / 2, s * (w / 2 + 0.1)); b.box(0.08, 0.08, w + 0.2, M.metal, 0x3a3d40, lx, 0.3, 0); }
    const belt = new THREE.Mesh(new THREE.PlaneGeometry(L, w), mat("rubber", {seed, unique: true, color: 0x2a2c2e, side: THREE.DoubleSide})); belt.material.map = belt.material.map.clone(); belt.material.map.needsUpdate = true; belt.material.map.repeat.set(L, w); belt.material.bumpMap = belt.material.map;
    belt.position.set(length / 2, y0 + rise / 2 + 0.09, 0); belt.rotation.set(-Math.PI / 2, 0, ang, "ZYX"); belt.receiveShadow = true; belt.name = "belt"; g.add(belt);
    const roll = new THREE.InstancedMesh(cylGeo(8), mat("metal", {seed, color: 0x8a8e92}), Math.floor(L / 0.5) + 1), m4 = new THREE.Matrix4();
    for (let i = 0; i < roll.count; i++) { const u = i / (roll.count - 1); roll.setMatrixAt(i, m4.compose(V(u * length, y0 + u * rise + 0.04, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V(0.05, w, 0.05))); }
    roll.castShadow = true; g.add(roll);
    const n = Math.round(L / 0.45), pieces = new THREE.InstancedMesh(UNIT_BOX, mat("plastic", {seed, vertex: false}), n), ph = [], sz = [], cols = PAL.recycling.plastics;
    for (let i = 0; i < n; i++) { ph.push(r()); sz.push([0.1 + r() * 0.18, 0.06 + r() * 0.1, 0.08 + r() * 0.14, (r() - 0.5) * w * 0.7, r() * TAU]); pieces.setColorAt(i, C(pick(r, cols)).clone().multiplyScalar(ALBEDO)); }
    pieces.instanceColor.needsUpdate = true; pieces.castShadow = true; g.add(pieces);
    b.flush({name: "conveyor"}); g.traverse(o => { if (o.isMesh) o.userData.rvProp = true; });
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    anim.push(t => { belt.material.map.offset.x = -(t * speed) % 1;
      for (let i = 0; i < n; i++) { const u = (t * speed / L + ph[i]) % 1, s = sz[i], fade = Math.min(1, u * 12, (1 - u) * 12);
        pieces.setMatrixAt(i, m4.compose(V(u * length, y0 + u * rise + 0.13 + s[1] / 2, s[3]), q.setFromEuler(e.set(0, s[4], ang)), V(s[0] * fade, s[1] * fade, s[2] * fade))); }
      pieces.instanceMatrix.needsUpdate = true; });
    return {group: g, end: [length, y0 + rise, 0], start: [0, y0, 0]};
  }
  function skip(B, M, x, z, ry, color, seed = 1) {   // open-top container with corrugated sides and a load of plastics
    const r = KIT.rng(seed), p = (lx, ly, lz) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, ly, z - Math.sin(ry) * lx + Math.cos(ry) * lz], L = 5.5, W = 2.3, H = 1.6;
    let q = p(0, 0.1, 0); B.box(L, 0.2, W, M.metal, color, q[0], q[1], q[2], ry);
    for (const s of [-1, 1]) { q = p(0, H / 2, s * (W / 2 - 0.03)); B.box(L, H, 0.06, M.corrugated, color, q[0], q[1], q[2], ry); q = p(s * (L / 2 - 0.03), H / 2, 0); B.box(0.06, H, W, M.corrugated, color, q[0], q[1], q[2], ry); q = p(0, H + 0.03, s * (W / 2)); B.box(L + 0.1, 0.1, 0.12, M.metal, color, q[0], q[1], q[2], ry); }
    for (let i = 0; i < 4; i++) { q = p(-L / 2 + 0.3 + i * 1.6, 0.4, W / 2 + 0.05); B.box(0.1, 0.8, 0.06, M.metal, C(color).clone().multiplyScalar(0.8), q[0], q[1], q[2], ry); }
    q = p(0, H - 0.3, 0); B.box(L - 0.2, 0.5, W - 0.2, M.waste, 0xffffff, q[0], q[1], q[2], ry);
    for (let i = 0; i < 24; i++) { q = p((r() - 0.5) * (L - 0.6), H - 0.02 + r() * 0.12, (r() - 0.5) * (W - 0.6)); B.box(0.15 + r() * 0.25, 0.08 + r() * 0.1, 0.1 + r() * 0.2, M.plastic, pick(r, PAL.recycling.plastics), q[0], q[1], q[2], ry + r() * TAU, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6); }
  }
  function bale(B, M, x, y, z, ry, seed = 1) {
    const r = KIT.rng(seed), p = (lx, ly, lz) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, y + ly, z - Math.sin(ry) * lx + Math.cos(ry) * lz];
    let q = p(0, 0.42, 0); B.box(1.15, 0.84, 1.05, M.waste, 0xffffff, q[0], q[1], q[2], ry + (r() - 0.5) * 0.06);
    for (const dx of [-0.35, 0, 0.35]) { q = p(dx, 0.42, 0); B.box(0.03, 0.86, 1.07, M.metal, 0x6a6e72, q[0], q[1], q[2], ry); }
  }
  function pile(parent, M, {x = 0, z = 0, rx = 5, rz = 4, h = 2.6, count = 1200, seed = 1} = {}) {   // many small varied pieces over a solid mound core
    const r = KIT.rng(seed), core = new THREE.Mesh(sphGeo(2), mat("waste", {seed, color: 0x6a6660})); core.position.set(x, 0, z); core.scale.set(rx * 0.92, h * 0.9, rz * 0.92); core.castShadow = core.receiveShadow = true; parent.add(core);
    const geos = [UNIT_BOX, cylGeo(6), new THREE.OctahedronGeometry(1, 0), new THREE.CylinderGeometry(0.5, 0.7, 1, 6)], per = Math.ceil(count / geos.length), out = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const geo of geos) { const im = new THREE.InstancedMesh(geo, mat("plastic", {seed, roughness: 0.5}), per);
      for (let i = 0; i < per; i++) { const a = r() * TAU, rr = Math.sqrt(r()), px = Math.cos(a) * rr * rx, pz = Math.sin(a) * rr * rz, py = h * Math.pow(Math.max(0, 1 - rr * rr), 1.1) + 0.03;
        const s = 0.12 + r() * 0.22; im.setMatrixAt(i, m4.compose(V(x + px, py, z + pz), q.setFromEuler(e.set(r() * TAU, r() * TAU, r() * TAU)), V(s * (0.6 + r()), s * (0.4 + r() * 0.8), s * (0.6 + r()))));
        im.setColorAt(i, C(pick(r, PAL.recycling.plastics)).clone().offsetHSL(0, 0, (r() - 0.5) * 0.15).multiplyScalar(ALBEDO)); }
      im.instanceColor.needsUpdate = true; im.castShadow = im.receiveShadow = true; im.name = "pile"; parent.add(im); out.push(im); }
    return {top: [x, h, z], meshes: out};
  }
  function fence(B, M, pts, h = 2.0, color = 0x8a9298) {   // chain-link run through points [[x, z], ...]
    const link = TEX.get("link") || (TEX.set("link", canvasTex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.strokeStyle = "#d8dde0"; g.lineWidth = 2.5; for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); } })), TEX.get("link"));
    const mesh = MAT.get("fence") || (MAT.set("fence", Object.assign(new THREE.MeshStandardMaterial({map: link, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, color, roughness: 0.6, metalness: 0.2, vertexColors: true}), {userData: {tile: 0.25, noPost: true}})), MAT.get("fence"));
    for (let i = 0; i + 1 < pts.length; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), n = Math.ceil(len / 3);
      B.plane(len, h, mesh, 0xffffff, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, ry).box(len, 0.04, 0.04, M.metal, color, (x0 + x1) / 2, h, (z0 + z1) / 2, ry);
      for (let j = 0; j <= n; j++) { const u = j / n; B.cyl(0.03, h + 0.1, M.metal, color, x0 + (x1 - x0) * u, (h + 0.1) / 2, z0 + (z1 - z0) * u, 6); } }
  }
  // building block with a window texture; emissive windows come on at dusk/night. Front faces +z.
  const FACADE = new Map();
  function facadeTex(seed, cols, rows, wall, time) {
    const key = [seed, cols, rows, wall, time].join("|"); if (FACADE.has(key)) return FACADE.get(key);
    const r = KIT.rng(seed * 17 + cols), W = 64 * cols, H = 64 * rows, wc = C(wall), ws = `rgb(${wc.r * 255 | 0},${wc.g * 255 | 0},${wc.b * 255 | 0})`, lit = [];
    const map = canvasTex(W, H, (g) => { g.fillStyle = ws; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.08})`; g.fillRect(r() * W, r() * H, 2 + r() * 8, 2 + r() * 8); }
      for (let j = 0; j < rows; j++) { g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(0, j * 64 + 60, W, 4);
        for (let i = 0; i < cols; i++) { const x = i * 64 + 14, y = j * 64 + 12, on = r() < (time === "night" ? 0.55 : time === "dusk" ? 0.4 : 0); lit.push(on);
          g.fillStyle = "#2a2e33"; g.fillRect(x - 3, y - 3, 42, 46); const gr = g.createLinearGradient(0, y, 0, y + 40); gr.addColorStop(0, "#6f8aa0"); gr.addColorStop(1, "#38474f"); g.fillStyle = gr; g.fillRect(x, y, 36, 40);
          g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(x, y, 36, 8); g.fillStyle = "#2a2e33"; g.fillRect(x + 17, y, 2, 40); } } });
    const em = canvasTex(W, H, (g) => { g.fillStyle = "#000"; g.fillRect(0, 0, W, H); let k = 0;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++, k++) if (lit[k]) { g.fillStyle = r() < 0.5 ? "#ffd9a0" : "#f3f0e0"; g.fillRect(i * 64 + 14, j * 64 + 12, 36, 40); } });
    const out = {map, em}; FACADE.set(key, out); return out;
  }
  function skylineMat(seed, time) {   // one shared window texture for far blocks: merged into the set, tinted per block by vertex colour
    const tx = facadeTex(seed * 3 + 1, 4, 4, 0xffffff, time), em = time === "night" ? 1.3 : time === "dusk" ? 0.8 : 0;
    const m = new THREE.MeshStandardMaterial({map: tx.map, emissiveMap: tx.em, emissive: 0xffffff, emissiveIntensity: em, roughness: 0.85, vertexColors: true}); m.userData.tile = 12.4; m.name = "place:skyline"; return m;
  }
  function building(parent, M, {x = 0, z = 0, w = 12, d = 10, floors = 5, seed = 1, wall = 0xb9a98c, time = "day", floorH = 3.2, base = 0, shop = false, far = false} = {}, shared = null) {
    const h = floors * floorH, cols = Math.max(1, Math.round(w / 3.0)), tx = facadeTex(seed, cols, floors, wall, time), em = time === "night" ? 1.3 : time === "dusk" ? 0.8 : 0;
    const face = new THREE.MeshStandardMaterial({map: tx.map, emissiveMap: tx.em, emissive: 0xffffff, emissiveIntensity: em, roughness: 0.85, color: new THREE.Color(ALBEDO, ALBEDO, ALBEDO)}), side = face.clone(), roof = mat("concrete", {seed, color: 0x6a6a66});
    side.map = tx.map.clone(); side.map.needsUpdate = true; side.emissiveMap = tx.em.clone(); side.emissiveMap.needsUpdate = true; side.map.repeat.set(d / w, 1); side.emissiveMap.repeat.set(d / w, 1);
    const g = new THREE.BoxGeometry(w, h, d), b = new THREE.Mesh(g, [side, side, roof, roof, face, face]); b.position.set(x, base + h / 2, z); b.castShadow = b.receiveShadow = true; b.name = "building"; if (far) noPost(b); parent.add(b);
    const B = shared || builder(parent, M), r = KIT.rng(seed);
    B.box(w + 0.3, 0.3, d + 0.3, M.concrete, C(wall).clone().multiplyScalar(0.8), x, base + h + 0.1, z);   // parapet
    for (let j = 1; j < floors; j++) if (r() < 0.6) B.box(w + 0.1, 0.12, 0.25, M.concrete, C(wall).clone().multiplyScalar(0.85), x, base + j * floorH, z + d / 2 + 0.1);   // ledges
    if (shop) { B.box(w - 0.4, 2.6, 0.1, M.glassy, 0x8fa6b8, x, base + 1.5, z + d / 2 + 0.05).box(w - 0.4, 0.5, 0.2, M.plastic, pick(r, [0x7a2a2a, 0x2a4a7a, 0x3a5a3a, 0x6a5a2a]), x, base + 3.0, z + d / 2 + 0.1);
      for (let i = 0; i < Math.floor(w / 4); i++) B.box(3.2, 0.1, 1.2, M.fabric, pick(r, [0x8a2a2a, 0x2a4a7a, 0x3a6a3a, 0xa08030]), x - w / 2 + 2.2 + i * 4, base + 2.9, z + d / 2 + 0.7, 0, 0.3); }
    for (let i = 0; i < 2; i++) B.box(0.8 + r() * 1.5, 0.5 + r() * 1.5, 0.8 + r() * 1.2, M.metal, 0x8a8e92, x + (r() - 0.5) * (w - 3), base + h + 0.6, z + (r() - 0.5) * (d - 3));   // roof plant
    if (!shared) B.flush({name: "building_trim"}); return b;
  }
  function skyline(B, M, sky, {x, z, w, d, floors, wall, floorH = 3.1}) { const h = floors * floorH; B.box(w, h, d, sky, wall, x, h / 2, z).box(w + 0.3, 0.3, d + 0.3, M.concrete, C(wall).clone().multiplyScalar(0.8), x, h + 0.1, z); }
  const uvScale = (geo, su, sv) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; };
  function fadeSet(seed) {   // private transparent copies of the car materials, so one mover can fade in/out far from the stage
    const S = {metal: mat("metal", {seed, vertex: true, unique: true, transparent: true}), glassy: mat("glass", {seed, vertex: true, unique: true, transparent: true, opacity: 0.45, roughness: 0.08, metalness: 0.2, side: THREE.DoubleSide}),
      rubber: mat("rubber", {seed, vertex: true, unique: true, transparent: true}), dark: mat("plastic", {seed, vertex: true, unique: true, transparent: true, roughness: 0.4}), glows: []};
    S.light = (c, i) => { const m = glow(c, i, {vertex: true}); m.transparent = true; S.glows.push(m); return m; };
    S.fade = a => { for (const m of [S.metal, S.glassy, S.rubber, S.dark, ...S.glows]) { m.opacity = (m === S.glassy ? 0.45 : 1) * a; m.visible = a > 0.002; } };
    return S;
  }

  // ── kinds. Local frame: stage at the origin (kitchen: the stand point), camera usually on +z looking at -z.
  const KINDS = {};
  KINDS.sidewalk = X => {
    // z layout from the stage: facade at -F, curb at K, parking strip, a wide shoulder (cameras 3-8 m out stay clear of traffic),
    // traffic tracks at K + 6.5 and K + 9.3, opposite parking and pavement, buildings across the street, skyline
    const {B, M, r, seed, time, T, C, anim, root, air, life, spots} = X, P = PAL.sidewalk, F = C + 1.8, K = C + 0.5, on = T.lamps, RW = 13.5, E = -F, Z2 = K + RW + 4.5, FB = builder(root, M);
    // ground layers: pavement (top y = 0) · curbs · road (y = -0.14) · opposite pavement · far ground
    const gb = builder(root, M); gb.box(96, 0.2, F + K + 0.4, M.paving, P.pave, 0, -0.1, (K - F - 0.4) / 2); const [ground] = gb.flush({name: "ground", cast: false});   // 0.5 m paving slabs
    B.box(96, 0.1, RW, M.asphalt, P.asphalt, 0, -0.19, K + RW / 2).box(96, 0.2, 4.5, M.paving, P.pave, 0, -0.1, K + RW + 2.25);
    for (let x = -48; x < 48; x += 1) { B.box(0.96, 0.16, 0.3, M.concrete, vary(P.curb, r, 0.05), x + 0.5, -0.07, K - 0.15); B.box(0.96, 0.16, 0.3, M.concrete, vary(P.curb, r, 0.05), x + 0.5, -0.07, K + RW + 0.15); }   // kerb stones
    B.box(4.4, 0.012, 0.6, M.tactile, 0xd8b23a, 0, 0.006, E + 1.95).box(8, 0.012, 0.6, M.tactile, 0xd8b23a, -17, 0.006, K - 0.5).box(8, 0.012, 0.6, M.tactile, 0xd8b23a, -17, 0.006, K + RW + 0.5);   // tactile paving at the steps and the crossing
    skylineCards(root, seed, time, T);
    for (let x = -45; x < 48; x += 6) B.box(3, 0.01, 0.12, M.plastic, P.roadPaint, x, -0.135, K + 7.9);   // centre line
    for (let x = -47; x < 48; x += 2) B.box(1, 0.01, 0.1, M.plastic, P.roadPaint, x, -0.135, K + 5.2);   // shoulder line
    B.box(96, 0.01, 0.1, M.plastic, P.roadPaint, 0, -0.135, K + 2.5).box(96, 0.01, 0.1, M.plastic, P.roadPaint, 0, -0.135, K + RW - 2.3);
    for (let x = -24; x <= 24; x += 6) B.box(0.1, 0.01, 2.4, M.plastic, P.roadPaint, x + 3, -0.135, K + 1.25).box(0.1, 0.01, 2.2, M.plastic, P.roadPaint, x, -0.135, K + RW - 1.15);
    for (let i = 0; i < 8; i++) B.box(0.5, 0.01, RW - 0.6, M.plastic, P.roadPaint, -20.5 + i, -0.135, K + RW / 2);   // zebra crossing
    const far = new THREE.Mesh(uvScale(new THREE.PlaneGeometry(400, 400), 130, 130), mat("asphalt", {seed, color: 0x45484b})); far.rotation.x = -Math.PI / 2; far.position.y = -0.17; far.receiveShadow = true; far.name = "far_ground"; root.add(far);
    // buildings: entrance block behind the stage, neighbours, the other side of the street, fogged skyline
    building2(B, M, r, {x: 0, z: E - 6, w: 18, d: 12, floors: 5, seed: seed + 1, style: "stone", tint: 0xd8d0c0, time, shop: true, lobby: true, skipBays: [2]});   // entrance block: shops either side of the lobby bay
    building2(B, M, r, {x: -20.5, z: E - 7, w: 22, d: 14, floors: 7, seed: seed + 2, style: "brick", tint: 0xffffff, time});
    building2(B, M, r, {x: 20.5, z: E - 6.5, w: 22, d: 13, floors: 4, seed: seed + 3, style: "plaster", tint: P.facade[2], time});
    building2(B, M, r, {x: -44, z: E - 8, w: 24, d: 16, floors: 9, seed: seed + 4, style: "plaster", tint: P.facade[3], time});
    building2(B, M, r, {x: 44, z: E - 8, w: 24, d: 16, floors: 6, seed: seed + 5, style: "brick", tint: 0xffffff, time});
    building2(FB, M, r, {x: -16, z: Z2 + 7, w: 26, d: 14, floors: 6, seed: seed + 6, style: "plaster", tint: P.facade[0], time, front: [0, -1], far: true});
    building2(FB, M, r, {x: 14, z: Z2 + 6, w: 24, d: 12, floors: 4, seed: seed + 7, style: "stone", tint: 0xcfc8ba, time, front: [0, -1], far: true});
    building2(FB, M, r, {x: 42, z: Z2 + 8, w: 28, d: 16, floors: 8, seed: seed + 8, style: "brick", tint: 0xffffff, time, front: [0, -1], far: true});
    building2(FB, M, r, {x: -44, z: Z2 + 8, w: 26, d: 16, floors: 5, seed: seed + 9, style: "plaster", tint: P.facade[4], time, front: [0, -1], far: true});
    const sky = skylineMat(seed, time);   // far blocks share one window texture and merge into the set
    for (let i = 0; i < 8; i++) skyline(FB, M, sky, {x: -70 + i * 20 + (r() - 0.5) * 6, z: Z2 + 32 + r() * 20, w: 14 + r() * 10, d: 14, floors: 8 + Math.floor(r() * 10), wall: pick(r, P.facade)});
    for (let i = 0; i < 6; i++) skyline(FB, M, sky, {x: -60 + i * 24 + (r() - 0.5) * 6, z: E - 32 - r() * 20, w: 16 + r() * 10, d: 14, floors: 9 + Math.floor(r() * 8), wall: pick(r, P.facade)});
    // entrance: step + landing, glass double door with a lit lobby behind it, canopy, sign, shop windows with awnings
    B.box(4.4, 0.15, 0.45, M.concrete, P.curb, 0, 0.075, E + 1.4).box(4.0, 0.3, 1.2, M.concrete, P.curb, 0, 0.15, E + 0.6);
    for (const s of [-1, 1]) B.box(0.12, 2.5, 0.16, M.metal, 0x2e3236, s * 1.3, 1.55, E + 0.1).cyl(0.08, 0.9, M.metal, 0x2e3236, s * 2.6, 0.45, E + 1.7, 10).box(0.03, 0.5, 0.03, M.metal, 0xb8bcc0, s * 0.18, 1.3, E + 0.17);
    B.box(2.72, 0.12, 0.16, M.metal, 0x2e3236, 0, 2.86, E + 0.1).box(2.4, 2.3, 0.04, M.glassy, 0x9fb4c4, 0, 1.47, E + 0.1).box(0.04, 2.3, 0.05, M.metal, 0x2e3236, 0, 1.47, E + 0.12);
    B.box(2.6, 2.4, 0.02, M.light(0xffe2b8, 0.35 + on * 0.5), 0xd8c8a8, 0, 1.5, E + 0.03);
    B.box(5.0, 0.12, 2.0, M.metal, 0x2e3236, 0, 3.2, E + 1.0).box(4.6, 0.02, 0.4, M.light(0xfff0d0, 0.3 + on), 0xfff0d0, 0, 3.13, E + 1.4).box(3.2, 0.55, 0.12, M.light(P.sign, 0.5 + on * 0.9), 0xf2a33a, 0, 3.95, E + 0.08);
    for (const s of [-1, 1]) { B.cyl(0.02, 1.9, M.metal, 0x2e3236, s * 2.2, 3.9, E + 1.0, 6, 0.8);
      B.box(1.4, 0.5, 0.6, M.concrete, 0x8a8782, s * 3.0, 0.25, E + 0.5).box(1.3, 0.45, 0.5, M.leaf, P.hedge, s * 3.0, 0.7, E + 0.5);   // planters
      for (let i = 0; i < 4; i++) B.sphere(0.22, M.leaf, vary(P.hedge, r, 0.1), s * 3.0 - 0.5 + i * 0.33, 0.92, E + 0.5 + (r() - 0.5) * 0.2, 1, 0.16, 0.2);
      bench(B, M, s * 8.5, E + 0.9, 0); lampPost(B, M, s * 9, K - 0.6, 6.5, on, {ax: 0, az: 1.4}); lampPost(B, M, s * 27, K - 0.6, 6.5, on, {ax: 0, az: 1.4}); lampPost(B, M, s * 4 + 1, K + RW + 0.6, 6.5, on, {ax: 0, az: -1.4}); }
    for (let x = -6; x <= 6; x += 1.5) B.cyl(0.07, 0.95, M.metal, 0x2e3236, x, 0.47, K - 0.4, 10).cyl(0.075, 0.06, M.light(0xffffff, 0.3), 0xdddddd, x, 0.85, K - 0.4, 10);   // bollards
    const trees = [[-5.5, K - 1.0], [5.5, K - 1.0], [-14, K - 1.0], [14, K - 1.0], [-22, K - 1.0], [22, K - 1.0], [9, Z2 - 1.2], [-9, Z2 - 1.2], [-24, Z2 - 1.2], [26, Z2 - 1.2]];
    trees.forEach(([x, z], i) => { const far = i >= 6, TB = far ? FB : B; tree2(root, TB, M, anim, x, z, {h: 6 + (i % 3) * 1.1, spread: 0.9 + (i % 4) * 0.12, seed: seed + 60 + i, far, detail: i < 2 ? 2 : 1}); TB.box(1.3, 0.03, 1.3, M.grate, 0x3a3d40, x, 0.01, z); });
    B.cyl(0.3, 0.95, M.metal, 0x2f5a3a, 4.8, 0.47, K - 1.1, 12).cyl(0.32, 0.06, M.metal, 0x2a2d30, 4.8, 0.97, K - 1.1, 12);   // bin
    B.cyl(0.1, 0.75, M.metal, 0xb33a2c, -4, 0.37, K - 0.9, 10).cyl(0.12, 0.08, M.metal, 0xb33a2c, -4, 0.78, K - 0.9, 10).cyl(0.05, 0.3, M.metal, 0xb33a2c, -4, 0.5, K - 0.9, 8, 0, Math.PI / 2);   // hydrant
    B.cyl(0.03, 2.6, M.metal, 0x8a8e92, -2.6, 1.3, K - 0.45, 8).cyl(0.3, 0.02, M.plastic, 0x2a4a9a, -2.6, 2.4, K - 0.45, 20, Math.PI / 2).cyl(0.3, 0.02, M.plastic, 0xb33a2c, 12.5, 2.4, K - 0.45, 20, Math.PI / 2).cyl(0.03, 2.6, M.metal, 0x8a8e92, 12.5, 1.3, K - 0.45, 8);   // signs
    for (let i = 0; i < 3; i++) { B.box(0.05, 0.75, 0.6, M.metal, 0x5a5e62, 10.5 + i * 0.7, 0.4, K - 1.2); if (i < 2) bicycle(B, M, 10.85 + i * 0.7, K - 1.2, Math.PI / 2, i ? 0x8a2a2a : 0x2a4a7a); }   // bike rack with bikes
    B.box(4, 0.1, 1.6, M.metal, 0x2e3236, 17, 2.5, K - 1.3).box(4, 2.2, 0.03, M.glassy, 0x9fb4c4, 17, 1.4, K - 2.05).box(3.4, 0.05, 0.4, M.metal, 0x5a5e62, 17, 0.45, K - 1.8).box(0.9, 1.6, 0.1, M.light(0xf0f0ff, 0.3 + on * 0.6), 0xd8d8e8, 19.05, 1.4, K - 1.3);   // bus shelter
    for (const [dx, dz] of [[-1.9, -0.7], [1.9, -0.7], [-1.9, 0.7], [1.9, 0.7]]) B.box(0.06, 2.5, 0.06, M.metal, 0x2e3236, 17 + dx, 1.25, K - 1.3 + dz);
    B.box(2.4, 2.5, 1.8, M.metal, 0x3a5a3a, -15, 1.25, E + 1.1).box(2.0, 0.9, 0.02, M.light(0xffe0b0, 0.3 + on * 0.6), 0xe8d8b0, -15, 1.5, E + 2.02).box(2.8, 0.06, 1.0, M.fabric, 0x8a2a2a, -15, 2.4, E + 2.3, 0, 0.3);   // kiosk
    for (const [x, z] of [[3, K + 3.5], [-12, K + 6]]) B.cyl(0.35, 0.02, M.metal, 0x4a4d50, x, -0.13, z, 16).cyl(0.42, 0.012, M.metal, 0x5a5e62, x, -0.134, z, 16);   // manholes
    for (const x of [-6, 6, 18]) B.box(0.6, 0.02, 0.35, M.grate, 0x8a8e92, x, -0.13, K + 0.3);   // gully grates
    B.box(0.8, 0.02, 0.8, M.grate, 0x8a8e92, -6.5, -0.13, K + 2.2);
    if (on) { for (const x of [-9, 9]) pool(root, [x, -0.14, K + 0.8], 3.5, 0xffd9a8, 0.1 * on); pool(root, [0, 0, E + 2.75], 1.0, 0xfff0d0, 0.12 * on); }   // lamp pools (coplanar with road / pavement)
    car(root, M, {seed: seed + 41, color: P.car[1], x: 9.5, z: K + 1.25}); car(root, M, {seed: seed + 42, color: P.car[2], x: -11, z: K + 1.25});
    const across = [car(root, M, {seed: seed + 43, color: P.car[0], x: 4, z: K + RW - 1.2, ry: Math.PI}), car(root, M, {seed: seed + 44, color: P.car[3], x: -15, z: K + RW - 1.2, ry: Math.PI})];
    if (life) for (const [track, dir, v, off, col] of [[K + 6.5, 1, 7.5, 0, P.car[4]], [K + 9.3, -1, 6.5, 37, P.car[3]]]) {   // traffic: fades in and out 46 m away, 0.25 m per frame
      const S = fadeSet(seed + Math.round(track * 10)), g = car(root, S, {seed: seed + 50 + Math.round(track), color: col, z: track, ry: dir > 0 ? 0 : Math.PI, lights: on}), span = 92; across.push(g);
      anim.push(t => { const u = ((t * v + off) % span) / span, x = -46 + u * span; g.position.x = dir > 0 ? x : -x; S.fade(clamp(Math.min(u, 1 - u) * 8 - 0.1, 0, 1)); });   // fully invisible across the wrap
    }
    for (const g of across) g.traverse(o => { if (o.isMesh) noPost(o); });
    if (air) { dust(root, anim, {seed, count: 220, box: [18, 4, 14], at: [0, 2, 0], opacity: 0.2, size: 0.05}); steam(root, anim, [-6.5, -0.1, K + 2.2], {seed, count: 8, height: 1.4, size: 0.45, opacity: 0.16}); }
    skyDress(root, anim, T, time, seed); FB.flush({name: "far", far: true});
    Object.assign(spots, {entrance: [0, 0.3, E + 0.6], door: [0, 0.3, E + 0.2], steps: [0, 0, E + 1.6], curb: [0, 0, K], road: [0, -0.14, K + 4], lamp: [9, 0, K - 0.6], tree: [5.5, 0, K - 1.0], car: [9.5, 0, K + 1.25], bench: [8.5, 0, E + 0.9], shelter: [17, 0, K - 1.3], planter: [3.6, 0.5, E + 0.5]});
    const practical = on ? [{at: [9, 6.3, K + 0.8], color: 0xffd9a8, intensity: 0.9 * on, distance: 16}, {at: [-9, 6.3, K + 0.8], color: 0xffd9a8, intensity: 0.9 * on, distance: 16}, {at: [0, 3.0, E + 1.2], color: 0xfff0d0, intensity: 0.7 * on, distance: 8}] : [];
    return {ground, sky: T.sky, fog: [T.fog, 20, 150], radius: 12, practical, indoor: false};
  };
  KINDS.factory = X => {
    const {B, M, r, seed, time, T, anim, root, air, life, spots} = X, P = PAL.factory, W = 40, H = 12, D = 30, ZC = -7, Z0 = ZC - D / 2, Z1 = ZC + D / 2, on = T.lamps, night = time === "night";
    room(root, W, H, D, {floor: [M.slab, P.floor], wall: [M.plaster, P.wall], ceiling: [M.corrugated, 0x8a8e90]}, {z: ZC, glow: 0.03});
    const gb = builder(root, M); gb.box(W, 0.1, D, M.slab, P.floor, 0, -0.05, ZC); const [ground] = gb.flush({name: "ground", cast: false});
    for (const z of [Z0 + 0.15, Z1 - 0.15]) B.box(W, 1.2, 0.3, M.concrete, 0x7a7e80, 0, 0.6, z);   // lower wall band
    for (const x of [-W / 2 + 0.15, W / 2 - 0.15]) B.box(0.3, 1.2, D, M.concrete, 0x7a7e80, x, 0.6, ZC);
    const cols = [];   // perimeter columns every 6 m + two interior rows, trusses on each column line, purlins
    for (let z = Z0 + 1; z <= Z1 - 1; z += 6) for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) cols.push([x, z]);
    for (const x of [-9, 9]) for (const z of [-5, -11, -17]) cols.push([x, z]);
    for (const [x, z] of cols) { B.box(0.4, 10, 0.4, M.metal, P.steel, x, 5, z).box(0.5, 0.5, 0.5, M.concrete, 0x7a7e80, x, 0.25, z).box(0.44, 1.0, 0.44, M.stripes, P.line, x, 1.0, z); if (Math.abs(x) < 15 && r() < 0.6) B.box(0.42, 0.6, 0.05, M.plastic, 0xf2f2f2, x, 2.0, z + 0.22); }   // hazard-striped column feet
    for (let z = Z0 + 1; z <= Z1 - 1; z += 6) { B.box(W, 0.15, 0.15, M.metal, P.steel, 0, 10, z).box(W, 0.15, 0.15, M.metal, P.steel, 0, 11.5, z);
      for (let x = -W / 2 + 1.25, i = 0; x < W / 2; x += 2.5, i++) B.box(0.08, 1.8, 0.08, M.metal, P.steel, x, 10.75, z, 0, 0, i % 2 ? 0.85 : -0.85); }
    for (let x = -16; x <= 16; x += 4) B.box(0.1, 0.12, D, M.metal, P.steel, x, 11.7, ZC);
    for (const z of [-2, -14]) { B.box(W, 0.4, 0.3, M.metal, P.steel, 0, 8.5, z); for (const [x] of cols.filter(c => Math.abs(c[0]) > 15)) B.box(0.6, 0.3, 0.3, M.metal, P.steel, x > 0 ? x - 0.4 : x + 0.4, 8.2, z); }   // crane rails
    const crane = new THREE.Group(); crane.name = "crane"; root.add(crane); const cb = builder(crane, M);
    cb.box(0.6, 0.7, 12.6, M.metal, P.crane, 0, 9.1, -8).box(0.6, 0.7, 12.6, M.metal, P.crane, 1.0, 9.1, -8).box(1.2, 0.8, 1.2, M.metal, 0x3a3d40, 0.5, 9.0, -9).cyl(0.02, 4.0, M.metal, 0x8a8e92, 0.5, 6.6, -9, 6).box(0.3, 0.5, 0.2, M.metal, 0x2a2d30, 0.5, 4.4, -9); cb.flush({name: "crane"});
    crane.position.x = -5; if (life) anim.push(t => { crane.position.x = -5 + 3.5 * Math.sin(t * 0.09); });
    for (let i = 0; i < 4; i++) B.cyl(0.08 + i * 0.03, W - 2, M.metal, P.pipe[i], 0, 5.4 + i * 0.5, Z0 + 0.9 + i * 0.25, 10, 0, Math.PI / 2);   // pipe racks
    for (let x = -18; x <= 18; x += 6) B.box(0.12, 2.4, 0.12, M.metal, P.steel, x, 6.4, Z0 + 1.6).box(0.12, 0.12, 1.4, M.metal, P.steel, x, 5.2, Z0 + 1.0);
    for (let i = 0; i < 3; i++) B.cyl(0.07 + i * 0.02, D - 2, M.metal, P.pipe[(i + 1) % 4], -W / 2 + 1.0 + i * 0.3, 6.0 + i * 0.4, ZC, 10, Math.PI / 2);
    for (const x of [-12, 6]) B.cyl(0.1, 5.0, M.metal, P.pipe[1], x, 2.6, Z0 + 0.7, 10).cyl(0.25, 0.08, M.metal, P.pipe[2], x + 0.3, 1.6, Z0 + 0.7, 12, 0, Math.PI / 2);
    B.cyl(0.12, 2.0, M.metal, 0x8a8e92, -16, 6.0, Z0 + 1.2, 8);
    const G = M.light(...T.glow), shafts = [];   // clerestory windows and their light shafts
    for (let i = 0; i < 6; i++) { const x = -17.5 + i * 7; windowUnit(B, M, x, 8.6, Z0 + 0.08, 5.2, 2.6, 0, G, {sill: false, cols: 4, rows: 2, frame: 0x6a6e72}); shafts.push([x, 8.6, Z0 + 0.1]); }
    for (let i = 0; i < 4; i++) windowUnit(B, M, -W / 2 + 0.08, 8.6, Z0 + 4.5 + i * 7, 5.2, 2.6, Math.PI / 2, G, {sill: false, cols: 4, rows: 2, frame: 0x6a6e72});
    if (air && !night) for (const s of shafts) shaft(root, s, [s[0] + 4.3, 0, s[2] + 7.6], 4.8, {opacity: time === "dusk" ? 0.07 : 0.1, color: time === "dusk" ? 0xffc08a : 0xfff2d8});
    for (const [x, z, ry, w, h] of [[-13, -15, 0.15, 3.2, 2.4], [-5.5, -16.5, 0, 2.6, 2.0], [3.5, -15.5, -0.1, 2.8, 2.2], [12, -15, 0.2, 3.6, 2.6], [-15.5, -8.5, 1.4, 2.4, 1.9], [15.5, -9, -1.5, 2.4, 2.1]]) machine(B, M, x, z, ry, seed + Math.round(x * 3 + z), {w, h, d: 1.5});
    machine(B, M, -5, -10, 0, seed + 77, {w: 5.0, h: 1.4, d: 1.2});
    table(B, M, -16.5, -2, 2.2, 0.8, 0.9, 0x8a6a48, 0x3a3d40); B.box(2.2, 1.2, 0.05, M.plastic, 0xc8b89a, -16.5, 1.6, -2.4);   // workbench + pegboard with tools
    for (let i = 0; i < 8; i++) B.box(0.05 + r() * 0.1, 0.15 + r() * 0.25, 0.04, M.metal, pick(r, [0x2a2d30, 0xb33a2c, 0x8a8e92]), -17.4 + i * 0.26, 1.5 + r() * 0.3, -2.36);
    B.box(0.9, 1.8, 0.5, M.metal, P.safety, -18.5, 0.9, 2.5).box(0.4, 0.5, 0.3, M.metal, 0xb8bcc0, -18.5, 1.4, 2.95);
    for (let i = 0; i < 5; i++) B.box(0.8, 2.0, 0.5, M.metal, 0x9aa0a4, W / 2 - 0.55, 1.0, -12 + i * 0.85).box(0.5, 0.3, 0.02, M.light(0x7fd3ff, 0.6), 0x203040, W / 2 - 0.81, 1.5, -12 + i * 0.85);   // control cabinets
    for (let i = 0; i < 6; i++) B.box(0.4, 1.8, 0.5, M.metal, 0x6f7f8a, -W / 2 + 0.55, 0.9, 4 + i * 0.42);   // lockers
    for (const [x, z] of [[-9, -5], [9, -11]]) B.cyl(0.08, 0.5, M.metal, P.safety, x + 0.3, 1.2, z + 0.25, 10).box(0.3, 0.3, 0.02, M.plastic, P.safety, x, 1.9, z + 0.22);
    for (const z of [-16, -19]) { shelfUnit(B, M, W / 2 - 0.7, 0, z, 2.6, 4.0, 1.0, 3, 0x3f6fa8, -Math.PI / 2, false);
      for (const y of [0.05, 1.38, 2.72]) for (let i = 0; i < 3; i++) if (r() < 0.8) B.box(0.7, 0.4 + r() * 0.3, 0.6 + r() * 0.2, M.fabric, vary(0xb08858, r, 0.06), W / 2 - 0.7, y + 0.27, z - 0.85 + i * 0.85); }
    pallet(B, M, 14, 3, 0.1, {stack: "boxes", seed: seed + 1}); pallet(B, M, 15.6, 5.6, -0.2, {stack: "drums", seed: seed + 2}); pallet(B, M, -14, 5, 0.3, {stack: "sacks", seed: seed + 3}); pallet(B, M, 12, -6, 0.05, {stack: "boxes", seed: seed + 4}); pallet(B, M, -11, -7.5, 0, {seed: seed + 5});
    for (const [x, z] of [[17, -3], [17.8, -4.2], [16.6, -5]]) B.cyl(0.28, 0.88, M.metal, pick(r, P.drum), x, 0.44, z, 14);
    const L = (w, d, x, z) => B.box(w, 0.004, d, M.plastic, P.line, x, 0.003, z);   // yellow aisle lines around the work cell
    L(36, 0.1, 0, 5.5); L(36, 0.1, 0, -5.5); L(0.1, 11, 7, 0); L(0.1, 11, -7, 0); L(0.1, 16, -18, -13); L(28, 0.1, -4, 7.5);
    for (const x of [-12, -4, 4, 12]) for (const z of [-15, -7, 1]) B.cyl(0.38, 0.35, M.metal, 0x3a3d40, x, 9.2, z, 14, 0, 0, 0.18).cyl(0.34, 0.03, M.light(0xfff0dc, 0.9 + on * 0.8), 0xfff0dc, x, 9.02, z, 14).cyl(0.015, 2.5, M.metal, 0x2a2d30, x, 10.6, z, 6);   // high bays
    for (const x of [-12, -4, 4, 12]) for (const z of [-15, -7, 1]) pool(root, [x, 0, z], 4.5, 0xfff0dc, 0.07 + on * 0.05);   // light pools under the high bays
    // mezzanine along the back-left: platform on posts, railing, a stair down to the floor
    B.box(10, 0.3, 4, M.metal, 0x5f6b78, -13, 4.5, -18).box(10, 0.04, 4, M.grate, 0x8a8e92, -13, 4.67, -18);
    for (const [px, pz] of [[-17.5, -16.2], [-13, -16.2], [-8.5, -16.2], [-17.5, -19.8], [-8.5, -19.8]]) B.box(0.25, 4.35, 0.25, M.metal, P.steel, px, 2.17, pz);
    for (let i = 0; i <= 10; i++) B.box(0.05, 1.1, 0.05, M.metal, P.line, -18 + i, 5.2, -16.05); B.box(10, 0.05, 0.05, M.metal, P.line, -13, 5.75, -16.05).box(10, 0.05, 0.05, M.metal, P.line, -13, 5.2, -16.05);
    for (let i = 0; i < 14; i++) B.box(1.0, 0.06, 0.3, M.grate, 0x8a8e92, -7.5, 0.3 + i * 0.32, -16.0 + i * 0.3).box(0.04, 0.9, 0.04, M.metal, P.line, -7.0, 0.75 + i * 0.32, -16.0 + i * 0.3);
    B.box(0.04, 0.05, 4.6, M.metal, P.line, -7.0, 3.4, -13.9, 0, 0.82);
    for (let i = 0; i < 4; i++) B.box(0.8, 0.6 + r() * 0.4, 0.6, M.fabric, vary(0xb08858, r, 0.06), -16.5 + i * 2.2, 5.0, -18.5 + (r() - 0.5) * 0.8); B.box(1.2, 1.9, 0.5, M.metal, 0x9aa0a4, -10, 5.65, -19.6);   // stored boxes, cabinet
    B.box(1.2, 0.5, 0.05, M.plastic, 0x2f6f3f, -W / 2 + 0.3, 2.6, 6).box(0.5, 0.2, 0.03, M.light(0x40e080, 0.9), 0x206030, -W / 2 + 0.3, 3.2, 6);   // exit sign + board
    for (let i = 0; i < 3; i++) B.cyl(0.45, 0.6, M.wood, 0x9a7a4a, -16 + i * 1.1, 0.3, 0.5, 12).cyl(0.2, 0.62, M.metal, 0x3a3d40, -16 + i * 1.1, 0.3, 0.5, 10);   // cable reels
    const fk = forklift(root, M, {seed: seed + 8}); fk.position.set(14, 0, 7); fk.rotation.y = 2.4;
    const mv = forklift(root, M, {seed: seed + 9}); mv.position.set(-2, 0, -12.5); if (life) anim.push(t => { mv.position.x = -2 + 9 * Math.sin(t * 0.09); });
    if (air) { steam(root, anim, [-16, 7.0, Z0 + 1.2], {seed, count: 10, height: 2.4, size: 0.55, opacity: 0.18}); dust(root, anim, {seed, count: 360, box: [24, 8, 18], at: [0, 4.5, -7], opacity: 0.3, size: 0.07}); }
    Object.assign(spots, {machine: [-5.5, 0, -16.5], line: [-5, 0, -10], crane: [-5, 8.6, -8], pallet: [14, 0.14, 3], rack: [W / 2 - 0.7, 1.4, -16], bench: [-16.5, 0.9, -2], window: [0, 8.6, Z0], column: [9, 0, -5], forklift: [14, 0, 7]});
    const practical = [[-4, 8.8, -7], [4, 8.8, 1], [-12, 8.8, 1]].map(at => ({at, color: 0xfff0dc, intensity: 0.5 + on * 0.45, distance: 22}));
    return {ground, sky: ["#2a3034", "#1e2326", "#161a1c"], fog: [night ? 0x1a1e22 : 0x3a4046, 16, 80], radius: 14, practical, indoor: true,
      sun: night ? [0.25, 1, 0.15] : [-0.35, 0.7, -0.62], sunColor: night ? 0xf4f6ff : T.key[0], sunInt: night ? 0.6 : T.key[1], hemi: night ? [0x8090a8, 0x303030, 0.22] : [0xd0d8e0, 0x6a6a66, 0.32]};
  };
  KINDS.recycling = X => {
    const {B, M, r, seed, time, T, anim, root, air, life, spots} = X, P = PAL.recycling, on = T.lamps, night = time === "night", FB = builder(root, M);
    const gb = builder(root, M); gb.box(44, 0.2, 34, M.slab, P.apron, 0, -0.1, -4); const [ground] = gb.flush({name: "ground", cast: false});   // concrete apron, gravel yard beyond
    const far = new THREE.Mesh(uvScale(new THREE.PlaneGeometry(400, 400), 260, 260), mat("gravel", {seed, color: P.gravel})); far.rotation.x = -Math.PI / 2; far.position.y = -0.05; far.receiveShadow = true; far.name = "far_ground"; root.add(far);
    // open shed over the stage: columns, beams, purlins, corrugated roof with skylight strips, gutter and downpipes
    // open shed behind the stage (stage and the main pile stay in the sun): columns, beams, purlins, corrugated roof with skylight strips
    const SZ = -17;   // shed centre z; roof spans z -22.5 .. -11.5
    for (const x of [-12, 12]) for (const z of [-22, -17, -12]) B.box(0.35, 8, 0.35, M.metal, P.steel, x, 4, z).box(0.6, 0.4, 0.6, M.concrete, 0x6a6c6a, x, 0.2, z).cyl(0.06, 7.6, M.metal, 0x5a6066, x + (x > 0 ? 0.3 : -0.3), 3.8, z, 8);
    for (const z of [-22, -17, -12]) B.box(26, 0.5, 0.25, M.metal, P.steel, 0, 7.75, z);
    for (const x of [-12, 12]) B.box(0.25, 0.5, 11, M.metal, P.steel, x, 7.75, SZ);
    for (let x = -12; x <= 12; x += 3) B.box(0.08, 0.12, 11, M.metal, P.steel, x, 8.05, SZ);
    const roof = new THREE.Mesh(uvScale(new THREE.PlaneGeometry(27, 12), 27, 12), mat("corrugated", {seed, color: P.roof, side: THREE.DoubleSide})); roof.rotation.set(-Math.PI / 2 + 0.05, 0, 0); roof.position.set(0, 8.25, SZ); roof.castShadow = roof.receiveShadow = true; roof.name = "roof"; root.add(roof);
    for (const z of [-20, -14]) B.box(24, 0.02, 1.2, M.light(...T.glow), 0xffffff, 0, 8.12, z);   // skylight strips seen from below
    B.box(27, 0.15, 0.2, M.metal, 0x7a8086, 0, 7.5, SZ + 5.9);
    if (air && !night) for (const z of [-20, -14]) shaft(root, [0, 8.1, z], [5.5, 0, z - 4.5], 1.6, {opacity: time === "dusk" ? 0.06 : 0.09, top: 1.3});
    // the material: a big sunlit mixed-plastics pile behind the stage in front of the shed, two side piles, bales, skips, a feed conveyor into a baler
    const main = pile(root, M, {x: 0, z: -11.5, rx: 7, rz: 4.5, h: 3.0, count: 1500, seed: seed + 1}); pile(root, M, {x: -16, z: -4, rx: 4, rz: 3.5, h: 2.0, count: 600, seed: seed + 2}); pile(root, M, {x: 15.5, z: -9, rx: 3.5, rz: 3, h: 1.8, count: 500, seed: seed + 3});
    for (let i = 0; i < 5; i++) for (const [z, y] of [[3, 0], [4.2, 0], [3.6, 0.84]]) if (!(y > 0 && i === 4)) bale(B, M, 7 + i * 1.25, y, z, 0, seed + i * 7 + z * 3);
    for (let i = 0; i < 3; i++) for (const y of [0, 0.84]) bale(B, M, -9 - i * 1.25, y, 6.5, 0.1, seed + 50 + i * 3 + y);
    const conv = conveyor(root, M, anim, {x: -4, z: -5.5, ry: 0, length: 8, rise: 2.4, seed: seed + 5, speed: life ? 0.5 : 0});
    machine(B, M, 6.4, -5.5, 0, seed + 6, {w: 2.6, h: 3.0, d: 2.2}); B.box(1.8, 0.9, 1.8, M.metal, 0x6a7278, 5.0, 3.0, -5.5).box(1.6, 0.05, 1.6, M.waste, 0xffffff, 5.0, 3.2, -5.5);   // baler + hopper
    skip(B, M, -14, 7, 0.2, P.skip[0], seed + 11); skip(B, M, 16.5, 1.5, -1.3, P.skip[1], seed + 12); skip(B, M, -3, 11, 0.1, P.skip[2], seed + 13);
    loader(root, M, anim, {x: 9.5, z: -15, ry: 2.5, color: P.loader});
    for (let i = 0; i < 2; i++) B.box(6, 2.5, 2.4, M.corrugated, i ? 0x8a3a2e : 0x2f5a8a, -19, 1.25 + i * 2.5, -13).box(6.04, 0.1, 2.44, M.metal, 0x3a3d40, -19, 2.5 + i * 2.5, -13);   // stacked containers
    fence(B, M, [[-24, 15], [-24, -23], [24, -23], [24, 15]], 2.2, P.fence);
    for (let x = -22; x <= 22; x += 2.2) B.box(2.0, 0.8, 0.5, M.concrete, 0x9a9a94, x, 0.4, -21.5);   // barriers
    B.box(4, 3, 3, M.metal, 0xd8dcd8, 20, 1.5, 11).box(1.6, 1.0, 0.02, M.light(0xffe0b0, 0.3 + on * 0.6), 0xe8d8b0, 18.0, 1.7, 11).box(4.4, 0.2, 3.4, M.metal, 0x3a3d40, 20, 3.1, 11);   // gate office
    for (const x of [-14, 14]) B.cyl(0.12, 10, M.metal, 0x5a6066, x, 5, 7.5, 8).box(0.5, 0.3, 0.3, M.metal, 0x3a3d40, x, 10, 7.2).box(0.4, 0.04, 0.26, M.light(0xfff0dc, 0.3 + on * 2.0), 0xfff0dc, x, 9.84, 7.2);   // floodlight poles
    for (let i = 0; i < 9; i++) tree2(root, FB, M, anim, -26 + i * 6.5 + (r() - 0.5) * 2, -29 - r() * 3, {h: 7 + r() * 3, seed: seed + 70 + i, spread: 1.1 + r() * 0.4, far: true});
    skylineCards(root, seed, time, T, {dist: [95, 130, 175]});
    if (on) for (const x of [-14, 14]) pool(root, [x * 0.6, 0.004, 1.5], 7, 0xfff0dc, 0.08 * on);
    building(root, M, {x: -8, z: -40, w: 34, d: 16, floors: 3, floorH: 4.2, seed: seed + 8, wall: 0x9aa0a4, time, far: true}, FB); building(root, M, {x: 30, z: -38, w: 20, d: 14, floors: 2, floorH: 4.5, seed: seed + 9, wall: 0xb0a090, time, far: true}, FB);
    FB.cyl(1.1, 26, M.concrete, 0x8a7a70, -32, 13, -42, 14, 0, 0, 0.8); if (air) steam(root, anim, [-32, 26, -42], {seed, count: 12, height: 9, size: 3.0, opacity: 0.2, period: 9, drift: 1.5});   // chimney
    B.box(40, 0.06, 6, M.asphalt, 0x45484b, 0, -0.02, 17);   // access road
    B.box(1.2, 0.8, 0.05, M.plastic, 0xe4b429, 11.8, 2.2, -11.75).box(1.2, 0.8, 0.05, M.plastic, 0xe4b429, -11.8, 2.2, -11.75);   // yard signs on the shed columns
    if (air) dust(root, anim, {seed, count: 420, box: [24, 6, 20], at: [0, 3, -6], opacity: 0.3, size: 0.07, color: 0xf0e6d0});
    skyDress(root, anim, T, time, seed); FB.flush({name: "far", far: true});
    Object.assign(spots, {pile: main.top, conveyor: [0, 1.9, -5.5], belt: [conv.start[0] - 4, conv.start[1], -5.5], bale: [7.6, 0, 3.6], skip: [-14, 0, 7], loader: [9.5, 0, -15], baler: [6.4, 0, -5.5], shed: [0, 0, SZ], flood: [14, 0, 7.5]});
    const practical = on ? [-14, 14].map(x => ({spot: true, at: [x, 9.8, 7.2], target: [0, 0, -2], color: 0xfff0dc, intensity: 1.1 * on, distance: 34, angle: 0.55})) : [];
    return {ground, sky: T.sky, fog: [T.fog, 25, 160], radius: 14, practical, indoor: false};
  };
  // textures drawn once for the room kinds: a wall chart, a monitor screen, a whiteboard
  const PLAIN = (map, roughness = 0.9) => new THREE.MeshStandardMaterial({map, roughness, color: new THREE.Color(ALBEDO, ALBEDO, ALBEDO)});
  function chartTex(seed) {
    return canvasTex(256, 384, (g, w, h) => { const r = KIT.rng(seed + 5); g.fillStyle = "#f7f7f2"; g.fillRect(0, 0, w, h); g.fillStyle = "#2f6f8f"; g.fillRect(0, 0, w, 44);
      g.fillStyle = "#fff"; g.fillRect(16, 16, 120, 12); g.strokeStyle = "#2a2e33"; g.lineWidth = 3; g.beginPath(); g.arc(90, 120, 22, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(90, 142); g.lineTo(90, 230); g.moveTo(90, 160); g.lineTo(40, 200); g.moveTo(90, 160); g.lineTo(150, 120); g.moveTo(90, 230); g.lineTo(60, 300); g.moveTo(90, 230); g.lineTo(120, 300); g.stroke();
      g.strokeStyle = "#d9534f"; g.lineWidth = 2; g.beginPath(); g.arc(90, 160, 60, -Math.PI * 0.9, -Math.PI * 0.2); g.stroke();
      for (let i = 0; i < 6; i++) { g.fillStyle = "#8a8e92"; g.fillRect(170, 70 + i * 22, 40 + r() * 40, 8); } for (let i = 0; i < 5; i++) { g.fillStyle = "#5a5e62"; g.fillRect(24, 320 + i * 12, 60 + r() * 150, 5); } });
  }
  function screenTex(seed, tint = "#3fd0ff") {
    return canvasTex(256, 160, (g, w, h) => { const r = KIT.rng(seed + 9); g.fillStyle = "#0e1a24"; g.fillRect(0, 0, w, h); g.fillStyle = "#16283a"; g.fillRect(0, 0, w, 18); g.fillStyle = tint; g.fillRect(8, 6, 50, 6);
      g.strokeStyle = "#22384a"; g.lineWidth = 1; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(16, 30 + i * 20); g.lineTo(240, 30 + i * 20); g.stroke(); }
      g.strokeStyle = tint; g.lineWidth = 2; g.beginPath(); for (let x = 16; x <= 240; x += 8) { const y = 100 - 40 * Math.sin(x / 30) * (0.5 + r() * 0.5) - r() * 10; x === 16 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
      g.fillStyle = "#e8c15a"; for (let i = 0; i < 8; i++) g.fillRect(20 + i * 28, 150 - r() * 30, 14, 150); g.fillStyle = "#dfe6ea"; for (let i = 0; i < 4; i++) g.fillRect(170, 28 + i * 14, 30 + r() * 40, 5); });
  }
  function artTex(seed) {
    return canvasTex(128, 160, (g, w, h) => { const r = KIT.rng(seed + 21); const sky = g.createLinearGradient(0, 0, 0, h * 0.6); sky.addColorStop(0, "#5c7fb0"); sky.addColorStop(1, "#e8d2a8"); g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.fillStyle = "#4a6a3a"; g.beginPath(); g.moveTo(0, h * 0.62); for (let x = 0; x <= w; x += 8) g.lineTo(x, h * (0.55 + 0.12 * Math.sin(x / 19 + seed) + 0.05 * r())); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      g.fillStyle = "#2f4a2a"; g.beginPath(); g.moveTo(0, h * 0.78); for (let x = 0; x <= w; x += 6) g.lineTo(x, h * (0.74 + 0.08 * Math.sin(x / 11 + seed * 2) + 0.04 * r())); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      g.fillStyle = "rgba(255,240,200,0.9)"; g.beginPath(); g.arc(w * (0.25 + r() * 0.5), h * 0.25, 9, 0, TAU); g.fill();
      g.fillStyle = "#f4f1ea"; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h); });
  }
  function boardTex(seed) {
    return canvasTex(512, 256, (g, w, h) => { const r = KIT.rng(seed + 13); g.fillStyle = "#f4f6f6"; g.fillRect(0, 0, w, h); const cols = ["#2a3e9a", "#1b1d20", "#c0392b", "#1f8a4c"];
      for (let i = 0; i < 9; i++) { g.strokeStyle = pick(r, cols); g.lineWidth = 3; g.beginPath(); let x = 30 + r() * 300, y = 30 + r() * 180; g.moveTo(x, y); for (let j = 0; j < 5; j++) { x += 10 + r() * 60; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
      g.strokeStyle = "#2a3e9a"; g.lineWidth = 3; g.strokeRect(330, 60, 140, 90); g.beginPath(); g.moveTo(330, 150); g.lineTo(470, 60); g.stroke(); g.beginPath(); g.arc(120, 140, 40, 0, TAU); g.stroke(); });
  }
  KINDS.clinic = X => {
    const {B, M, r, seed, time, T, anim, root, air, spots} = X, P = PAL.clinic, on = T.lamps, night = time === "night", W = 10, H = 3.2, D = 12, ZC = 0.5, Z0 = ZC - D / 2;
    const ceil = mat("tile", {seed, vertex: true, unique: true}); ceil.userData.tile = 1.8;
    room(root, W, H, D, {floor: [M.tile, P.floor], wall: [M.plaster, P.wall], ceiling: [ceil, P.ceiling]}, {z: ZC, glow: 0.1});
    const gb = builder(root, M); gb.box(W, 0.1, D, M.tile, P.floor, 0, -0.05, ZC); const [ground] = gb.flush({name: "ground", cast: false});
    for (const [w, d, x, z] of [[W, 0.03, 0, Z0 + 0.015], [W, 0.03, 0, ZC + D / 2 - 0.015], [0.03, D, -W / 2 + 0.015, ZC], [0.03, D, W / 2 - 0.015, ZC]]) B.box(w, 1.0, d, M.plaster, P.band, x, 0.5, z).box(w, 0.1, d + 0.02, M.plastic, 0x4a4e52, x, 0.05, z).box(w, 0.04, d + 0.05, M.wood, P.wood, x, 1.02, z);   // wainscot, skirting, rail
    for (const [x, z] of [[-2, -3.5], [2, -3.5], [-2, 0.5], [2, 0.5], [-2, 4.5], [2, 4.5]]) B.box(1.2, 0.02, 0.6, M.light(0xf4f6ff, 1.0 + on * 0.6), 0xffffff, x, H - 0.03, z).box(1.26, 0.03, 0.66, M.plastic, 0xe8eaea, x, H - 0.01, z);   // ceiling panels
    chair(B, M, 3.3, 6.0, Math.PI, P.chair); chair(B, M, 3.9, 6.0, Math.PI, P.chair); chair(B, M, 4.5, 6.0, Math.PI, P.chair); B.box(0.5, 0.5, 0.5, M.wood, P.wood, 2.4, 0.25, 6.1).cyl(0.16, 1.0, M.plastic, 0xe8ecec, 1.5, 0.5, 6.1, 12).cyl(0.15, 0.4, M.glassy, 0x9fc4e0, 1.5, 1.2, 6.1, 12);
    const G = M.light(...T.glow); windowUnit(B, M, 1.0, 1.75, Z0 + 0.08, 3.2, 1.6, 0, G, {blinds: 0.45, cols: 3, rows: 2});   // window with blinds, radiator, curtains
    B.box(1.6, 0.6, 0.1, M.metal, 0xe6e8e8, 1.0, 0.45, Z0 + 0.12); for (let i = 0; i < 14; i++) B.box(0.04, 0.56, 0.12, M.metal, 0xdadcdc, 0.3 + i * 0.1, 0.45, Z0 + 0.13);
    for (const x of [-0.95, 2.95]) B.box(0.5, 2.3, 0.18, M.fabric, 0x9ab8b4, x, 1.5, Z0 + 0.2); B.box(4.4, 0.04, 0.04, M.metal, 0xb8bcc0, 1.0, 2.68, Z0 + 0.2);
    if (air && !night) shaft(root, [1.0, 2.3, Z0 + 0.1], [1.9, 0, Z0 + 2.2], 3.0, {opacity: time === "dusk" ? 0.05 : 0.07, top: 1.2});
    const BX = -3.2, BZ = -3.0;   // exam bed along z
    B.box(0.8, 0.08, 2.0, M.metal, P.bedFrame, BX, 0.7, BZ).box(0.78, 0.12, 1.4, M.fabric, P.bed, BX, 0.8, BZ + 0.3).box(0.78, 0.12, 0.62, M.fabric, P.bed, BX, 0.95, BZ - 0.75, 0, -0.55).box(0.5, 0.1, 0.3, M.fabric, 0xf0f0ec, BX, 1.08, BZ - 0.6, 0, -0.55);
    for (const [dx, dz] of [[-0.3, -0.85], [0.3, -0.85], [-0.3, 0.85], [0.3, 0.85]]) B.box(0.06, 0.66, 0.06, M.metal, P.bedFrame, BX + dx, 0.33, BZ + dz); B.cyl(0.07, 0.6, M.plastic, 0xf4f4f0, BX, 1.35, BZ - 1.05, 10, 0, Math.PI / 2).cyl(0.02, 1.0, M.metal, P.bedFrame, BX, 1.0, BZ - 1.05, 6, 0, Math.PI / 2);
    B.box(0.03, 0.03, 2.8, M.metal, 0xb8bcc0, BX + 0.9, 2.4, BZ).box(0.05, 1.9, 1.2, M.fabric, 0xbfd4cf, BX + 0.9, 1.43, BZ + 0.8);   // curtain rail and a half-drawn curtain
    B.cyl(0.18, 0.05, M.fabric, 0x3a4e68, -2.1, 0.56, -4.4, 14).cyl(0.03, 0.53, M.metal, 0xb8bcc0, -2.1, 0.27, -4.4, 8).cyl(0.22, 0.03, M.metal, 0xb8bcc0, -2.1, 0.015, -4.4, 12);   // stool
    cabinets(B, M, 1.5, 5.3, 0, 0.9, 0.6, -4.4, {door: 0.5, color: P.cabinet, top: {mat: M.plastic, color: P.counter}, ry: Math.PI / 2});   // cabinet run along the left wall (front at x = -4.4)
    cabinets(B, M, 1.5, 5.3, 1.5, 0.7, 0.35, -4.65, {door: 0.5, color: P.cabinet, toe: 0, ry: Math.PI / 2});
    B.box(0.4, 0.02, 0.5, M.metal, 0xcfd3d6, -4.7, 0.93, -2.3).cyl(0.015, 0.3, M.metal, 0xcfd3d6, -4.85, 1.1, -2.3, 8).box(0.25, 0.1, 0.15, M.plastic, 0x3f7fbf, -4.7, 0.99, -3.5).cyl(0.06, 0.18, M.plastic, 0xe8e8e8, -4.7, 1.03, -4.2, 10).box(0.18, 0.22, 0.14, M.plastic, 0xd9d9d4, -4.7, 1.05, -4.9);
    const chart = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), PLAIN(chartTex(seed))); chart.position.set(-1.6, 1.65, Z0 + 0.03); chart.name = "chart"; root.add(chart); B.box(0.66, 0.96, 0.02, M.metal, 0x3a3d40, -1.6, 1.65, Z0 + 0.02);
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), PLAIN(boardTex(seed))); poster.position.set(-4.97, 1.7, 0.5); poster.rotation.y = Math.PI / 2; root.add(poster);
    for (const dx of [-0.3, 0.3]) { B.cyl(0.02, 3.6, M.metal, P.steel, 3.0 + dx, 0.95, -0.5, 8, Math.PI / 2); for (const dz of [-1.7, -0.6, 0.6, 1.7]) B.cyl(0.025, 0.93, M.metal, P.steel, 3.0 + dx, 0.47, -0.5 + dz, 8).box(0.25, 0.02, 0.25, M.metal, P.steel, 3.0 + dx, 0.01, -0.5 + dz); }   // parallel bars
    B.box(1.3, 0.02, 3.9, M.fabric, 0x3a5e8a, 3.0, 0.01, -0.5);
    chair(B, M, 4.2, 1.6, -Math.PI / 2, P.chair); chair(B, M, 4.2, 2.3, -Math.PI / 2, P.chair); chair(B, M, -2.4, -4.8, 0, P.chair);
    table(B, M, 3.6, -4.4, 1.4, 0.7, 0.75, 0xd8dcd8, 0x8a8e92); monitor(B, M, 3.6, 0.75, -4.55, 0, M.light(0xffffff, 0.9, {map: screenTex(seed), vertex: true})); chair(B, M, 3.6, -3.6, Math.PI, 0x2a2d30);
    B.box(0.3, 0.02, 0.2, M.plastic, 0x2a2d30, 3.3, 0.76, -4.2).box(0.35, 0.03, 0.12, M.plastic, 0xdddddd, 3.9, 0.765, -4.25);
    plant(root, M, anim, -4.3, 2.8, {h: 1.4, seed: seed + 3, leaf: P.plant}); plant(root, M, anim, 4.4, -4.9, {h: 1.1, seed: seed + 4, leaf: P.plant});
    B.sphere(0.33, M.plastic, 0x3f7fbf, -3.6, 0.33, 1.2, 2).sphere(0.25, M.plastic, 0xd9534f, -4.2, 0.25, 1.9, 2);   // physio balls
    shelfUnit(B, M, -1.0, 0, -5.3, 1.2, 1.0, 0.35, 2, 0x8a8e92, 0, true); for (let i = 0; i < 5; i++) B.cyl(0.05 + i * 0.012, 0.16, M.metal, 0x2a2d30, -1.45 + i * 0.22, 0.6, -5.3, 10, 0, Math.PI / 2).cyl(0.05 + i * 0.012, 0.16, M.metal, 0x2a2d30, -1.45 + i * 0.22, 0.1, -5.3, 10, 0, Math.PI / 2);   // dumbbells
    doorUnit(B, M, W / 2 - 0.03, 0.5, -Math.PI / 2, {color: 0xd8dcd8, frame: 0x8a8e92}); B.box(0.02, 0.18, 0.5, M.light(0x40e080, 0.9), 0x206030, W / 2 - 0.06, 2.3, 0.5);   // door + exit sign
    B.cyl(0.16, 0.03, M.plastic, 0xf4f4f0, W / 2 - 0.03, 2.3, -3.0, 20, 0, Math.PI / 2).cyl(0.02, 0.12, M.plastic, 0x2a2d30, W / 2 - 0.06, 2.3, -3.0, 6, 0, Math.PI / 2);   // clock
    B.box(0.12, 0.26, 0.1, M.plastic, 0xf0f0f0, W / 2 - 0.08, 1.3, -1.6).box(0.1, 0.14, 0.08, M.plastic, 0x3f7fbf, W / 2 - 0.08, 1.35, -1.6);   // sanitiser
    for (const [x, z] of [[-2, -3.5], [2, -3.5], [-2, 0.5], [2, 0.5], [-2, 4.5], [2, 4.5]]) pool(root, [x, 0, z], 2.2, 0xf4f6ff, 0.06 + on * 0.05);
    for (const [w, d, x, z] of [[W, 0.04, 0, Z0 + 0.02], [W, 0.04, 0, ZC + D / 2 - 0.02], [0.04, D, -W / 2 + 0.02, ZC], [0.04, D, W / 2 - 0.02, ZC]]) B.box(w, 0.08, d, M.plastic, 0xf4f4f0, x, H - 0.04, z);   // cornice
    B.box(0.5, 0.9, 0.45, M.metal, 0xd8dcd8, -3.9, 0.45, 0.4).box(0.5, 0.03, 0.45, M.metal, 0xb8bcc0, -3.9, 0.92, 0.4); for (const [dx, dz] of [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]]) B.cyl(0.04, 0.03, M.rubber, 0x1a1a1a, -3.9 + dx, 0.04, 0.4 + dz, 8, Math.PI / 2);   // trolley
    bottles(B, M, r, -4.1, -3.7, 0.935, 0.4, 3, [0xe8e8e8, 0x7fb0d8, 0xcf5b3b], {size: 0.8});
    for (let i = 0; i < 6; i++) B.box(0.06, 0.3, 0.24, M.plastic, pick(r, [0x2a4a9a, 0xb33a2c, 0x3a6a3a, 0xe8e4dc]), -1.5 + i * 0.08, 0.66, -5.3);   // binders on the shelf
    B.cyl(0.14, 0.32, M.plastic, 0x9aa0a4, 4.6, 0.16, -1.2, 12).box(0.12, 0.06, 0.02, M.plastic, 0xf4f4f0, W / 2 - 0.05, 1.25, -2.2).box(0.08, 0.12, 0.02, M.plastic, 0xf4f4f0, W / 2 - 0.05, 0.4, -2.2);   // bin, switch, socket
    if (air) dust(root, anim, {seed, count: 160, box: [6, 2.6, 6], at: [1.2, 1.4, Z0 + 2.5], opacity: 0.22, size: 0.045});
    Object.assign(spots, {bed: [BX, 0.87, BZ + 0.3], bars: [3.0, 0.95, -0.5], chair: [4.2, 0, 1.6], cabinet: [-4.4, 0.95, -3.4], window: [1.0, 1.75, Z0], chart: [-1.6, 1.65, Z0], plant: [-4.3, 0, 2.8], door: [W / 2, 0, 0.5], desk: [3.6, 0.75, -4.4], ball: [-3.6, 0.33, 1.2], stool: [-2.1, 0.58, -4.4]});
    const practical = [[-2, 2.9, -1.5], [2, 2.9, -1.5]].map(at => ({at, color: 0xf4f6ff, intensity: 0.45 + on * 0.35, distance: 11}));
    return {ground, sky: ["#6a7a88", "#56626c", "#444c54"], fog: [0x8a9296, 12, 50], radius: 8, practical, indoor: true,
      sun: night ? [0.2, 1, 0.1] : [-0.3, 0.7, -0.65], sunColor: night ? 0xf4f6ff : T.key[0], sunInt: night ? 0.5 : T.key[1], hemi: night ? [0x9aa4b0, 0x404040, 0.24] : [0xe8eef2, 0xa8a29a, 0.32]};
  };
  // Kitchen frame: free wall spot at x = 0 on the back wall (z = -3.5); the stage is the stand point 0.55 m in front of it.
  // Counter run with sink window, hob and open high shelf to the left (x <= -1.4), fridge and pantry to the right (x >= 1.4).
  KINDS.kitchen = X => {
    const {B, M, r, seed, time, T, anim, root, air, spots} = X, P = PAL.kitchen, on = T.lamps, night = time === "night", W = 7.9, H = 2.7, D = 7, XC = -1.05, Z0 = -3.5, ZF = -2.9;
    room(root, W, H, D, {floor: [M.wood, P.floor], wall: [M.plaster, P.wall], ceiling: [M.plaster, 0xf4f2ee]}, {x: XC, z: 0, glow: 0.14});
    const gb = builder(root, M); gb.box(W, 0.1, D, M.wood, P.floor, XC, -0.05, 0); const [ground] = gb.flush({name: "ground", cast: false});
    const WB = 0xd8d2c4, RL = 0xf4f2ee;
    B.box(2.9, 0.95, 0.015, M.board, WB, 0, 0.475, Z0 + 0.0075).box(2.9, 0.05, 0.03, M.plastic, RL, 0, 0.97, Z0 + 0.015).box(0.015, 0.95, D, M.board, WB, -4.9925, 0.475, 0).box(0.03, 0.05, D, M.plastic, RL, -4.985, 0.97, 0).box(W, 0.95, 0.015, M.board, WB, XC, 0.475, 3.4925).box(W, 0.05, 0.03, M.plastic, RL, XC, 0.97, 3.485);
    for (const [z0, z1] of [[-3.5, 0.24], [1.36, 3.5]]) B.box(0.015, 0.95, z1 - z0, M.board, WB, 2.8825, 0.475, (z0 + z1) / 2).box(0.03, 0.05, z1 - z0, M.plastic, RL, 2.875, 0.97, (z0 + z1) / 2);
    for (const z of [-1.7, 0.7]) B.box(W, 0.14, 0.12, M.wood, 0x7a5a3c, XC, H - 0.07, z);
    shelfUnit(B, M, 2.69, 0, -1.9, 1.0, 1.9, 0.36, 4, 0xd8d2c4, -Math.PI / 2, true);
    for (const y of [0.5, 0.975, 1.45]) bottles(B, M, r, 2.27, 3.11, y, -1.9, 4, [0xe8d8b0, 0xc8a060, 0xd0d0c8, 0xa86a3a, 0xb33a2c, 0x6fa83a], {ry: -Math.PI / 2, cx: 2.69, cz: -1.9, size: 1.2});
    for (let i = 0; i < 3; i++) B.box(0.22, 0.14 + r() * 0.1, 0.2, M.plastic, pick(r, [0xe8e4dc, 0xc9d8e8, 0xd9c3a0]), 2.69, 1.925 + 0.1, -2.2 + i * 0.3);
    [-0.9, -0.35].forEach((z, i) => { const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.52), PLAIN(artTex(seed + i), 0.7)); pic.position.set(2.868, 1.6, z); pic.rotation.y = -Math.PI / 2; pic.name = "picture"; root.add(pic); B.box(0.02, 0.58, 0.48, M.wood, 0x3a2a1c, 2.88, 1.6, z); });
    B.box(W, 0.08, 0.02, M.plastic, 0xf4f2ee, XC, 0.04, Z0 + 0.01).box(W, 0.08, 0.02, M.plastic, 0xf4f2ee, XC, 0.04, 3.49).box(0.02, 0.08, D, M.plastic, 0xf4f2ee, -4.99, 0.04, 0).box(0.02, 0.08, D, M.plastic, 0xf4f2ee, 2.89, 0.04, 0);   // skirting
    cabinets(B, M, -5.0, -1.4, 0, 0.9, 0.6, ZF, {door: 0.6, color: P.cabinet, top: {mat: M.plastic, color: P.counter}});   // base run
    B.box(3.6, 0.6, 0.015, M.tile, P.tile, -3.2, 1.2, Z0 + 0.01);   // backsplash (x -5 .. -1.4 only)
    // back wall, left to right: upper cabinets, hob + hood with open shelves above, window over the sink, then the free wall (x -1.4 .. 1.4), fridge, pantry
    const HOB = -3.3, SINK = -2.0;
    cabinets(B, M, -5.0, -3.9, 1.5, 0.7, 0.35, Z0 + 0.35, {door: 0.55, color: P.upper, toe: 0});
    for (const y of [1.85, 2.1]) { B.box(1.1, 0.03, 0.3, M.wood, P.wood, HOB, y, Z0 + 0.15); for (const dx of [-0.48, 0.48]) B.box(0.03, 0.12, 0.26, M.metal, 0x3a3d40, HOB + dx, y - 0.075, Z0 + 0.15); }   // open high shelf
    bottles(B, M, r, HOB - 0.45, HOB + 0.45, 1.865, Z0 + 0.15, 5, [0xe8d8b0, 0xc8a060, 0xd0d0c8, 0xa86a3a], {size: 1.3});
    for (let i = 0; i < 3; i++) B.box(0.18, 0.1 + r() * 0.12, 0.2, M.plastic, pick(r, [0xe8e4dc, 0xc9d8e8, 0xd9c3a0]), HOB - 0.38 + i * 0.38, 2.115 + 0.08, Z0 + 0.15);
    const G = M.light(...T.glow); windowUnit(B, M, SINK, 1.75, Z0 + 0.08, 1.2, 0.9, 0, G, {cols: 2, rows: 1}); B.box(0.3, 1.1, 0.08, M.fabric, 0xd9b8a0, SINK - 0.75, 1.75, Z0 + 0.16);   // sink window + curtain
    B.box(0.7, 0.02, 0.45, M.metal, 0xcfd3d6, SINK, 0.945, ZF - 0.3).box(0.6, 0.15, 0.36, M.metal, 0xb8bcc0, SINK, 0.86, ZF - 0.3).cyl(0.015, 0.3, M.metal, 0xcfd3d6, SINK, 1.1, ZF - 0.52, 8).cyl(0.012, 0.22, M.metal, 0xcfd3d6, SINK, 1.25, ZF - 0.42, 8, Math.PI / 2);   // sink + tap
    B.box(0.34, 0.3, 0.25, M.metal, 0xcfd3d6, -1.62, 1.09, ZF - 0.4); for (let i = 0; i < 4; i++) B.cyl(0.11, 0.01, M.plastic, 0xf4f4f0, -1.62, 1.1 + i * 0.015, ZF - 0.5 + i * 0.05, 16, Math.PI / 2 - 0.3);   // dish rack
    B.box(0.6, 0.02, 0.5, M.dark, 0x1a1c1e, HOB, 0.945, ZF - 0.3); for (const [dx, dz] of [[-0.15, -0.12], [0.15, -0.12], [-0.15, 0.12], [0.15, 0.12]]) B.cyl(0.09, 0.012, M.metal, 0x3a3d40, HOB + dx, 0.96, ZF - 0.3 + dz, 16);   // hob
    B.cyl(0.12, 0.14, M.metal, 0x9aa0a4, HOB - 0.15, 1.04, ZF - 0.42, 16).cyl(0.125, 0.015, M.metal, 0x6a6e72, HOB - 0.15, 1.12, ZF - 0.42, 16).cyl(0.1, 0.2, M.metal, 0xb8bcc0, -2.6, 1.05, ZF - 0.25, 12, 0, 0, 0.07).box(0.3, 0.015, 0.2, M.wood, 0xb08858, -4.4, 0.945, ZF - 0.15);   // pot, kettle, board
    B.box(0.56, 0.42, 0.02, M.dark, 0x1a1c1e, HOB, 0.5, ZF + 0.02).box(0.5, 0.02, 0.03, M.metal, 0xb8bcc0, HOB, 0.7, ZF + 0.04).box(0.6, 0.25, 0.5, M.metal, 0xb0b4b8, HOB, 1.63, Z0 + 0.25).box(0.3, 0.45, 0.3, M.metal, 0xb0b4b8, HOB, 2.45, Z0 + 0.15);   // oven door, hood, duct above the shelves
    B.box(0.75, 1.85, 0.7, M.metal, P.fridge, 1.775, 0.925, Z0 + 0.35).box(0.74, 0.01, 0.02, M.dark, 0x4a4e52, 1.775, 1.3, Z0 + 0.7).box(0.02, 0.5, 0.03, M.metal, 0x8a8e92, 1.45, 1.6, Z0 + 0.72).box(0.02, 0.5, 0.03, M.metal, 0x8a8e92, 1.45, 0.75, Z0 + 0.72);   // fridge
    B.box(0.65, 2.2, 0.6, M.plastic, P.cabinet, 2.5, 1.1, Z0 + 0.3).box(0.01, 2.1, 0.01, M.plastic, 0x8a8e92, 2.5, 1.1, Z0 + 0.605).box(0.02, 0.12, 0.02, M.metal, 0x9a9ea2, 2.4, 1.1, Z0 + 0.62);   // pantry
    windowUnit(B, M, -4.92, 1.6, 0.5, 1.4, 1.1, Math.PI / 2, G, {cols: 2, rows: 2}); plant(root, M, anim, -4.75, 0.5, {h: 0.55, seed: seed + 3, leaf: 0x4a8a3a}).position.y = 1.02;   // side window with a plant on the sill
    doorUnit(B, M, 2.87, 0.8, -Math.PI / 2, {color: 0xe8e4dc, frame: 0xd8d4cc}); B.box(0.02, 0.5, 0.35, M.plastic, 0xf4f4f0, 2.88, 1.75, 0.05); B.cyl(0.14, 0.03, M.plastic, 0xf4f4f0, 2.88, 2.2, 2.4, 20, 0, Math.PI / 2);   // door, calendar, clock
    const TX = -2.6, TZ = 1.6; table(B, M, TX, TZ, 1.5, 0.9, 0.75, P.wood, 0x3a3d42); B.box(2.4, 0.01, 1.8, M.fabric, 0x8a5a4a, TX, 0.005, TZ);
    chair(B, M, TX, TZ - 0.65, 0, P.chair, 0x8a6240); chair(B, M, TX, TZ + 0.65, Math.PI, P.chair, 0x8a6240); chair(B, M, TX - 0.95, TZ, Math.PI / 2, P.chair, 0x8a6240); chair(B, M, TX + 0.95, TZ, -Math.PI / 2, P.chair, 0x8a6240);
    B.cyl(0.16, 0.06, M.plastic, 0xe8e4dc, TX, 0.78, TZ, 16, 0, 0, 0.1); for (let i = 0; i < 5; i++) B.sphere(0.045, M.plastic, pick(r, P.fruit), TX + (r() - 0.5) * 0.18, 0.84, TZ + (r() - 0.5) * 0.18, 1);   // fruit bowl
    B.cyl(0.005, 0.9, M.metal, 0x2a2d30, TX, 2.25, TZ, 6).cyl(0.22, 0.25, M.metal, P.lamp, TX, 1.72, TZ, 16, 0, 0, 0.08).sphere(0.04, M.light(0xffd9a0, 1.6 + on * 0.6), 0xffe0b0, TX, 1.66, TZ, 1);   // pendant
    for (const x of [-4.2, -3.0, -1.8, 0.6]) { B.cyl(0.07, 0.02, M.light(0xfff0dc, 0.8 + on * 0.6), 0xffffff, x, H - 0.02, ZF + 0.3, 12).cyl(0.085, 0.01, M.metal, 0xdddddd, x, H - 0.005, ZF + 0.3, 12); pool(root, [x, 0, ZF + 0.5], 1.0, 0xfff0dc, 0.07 + on * 0.05); }   // ceiling spots + pools on the floor below them (pools must lie on a real surface)
    pool(root, [TX, 0.75, TZ], 0.42, 0xffd9a0, 0.14 + on * 0.08);
    B.box(0.5, 0.3, 0.42, M.metal, 0xcfd3d6, 1.775, 2.0, Z0 + 0.36).box(0.3, 0.18, 0.01, M.dark, 0x1a1c1e, 1.7, 2.0, Z0 + 0.575);   // microwave on the fridge
    B.box(0.4, 0.03, 0.02, M.metal, 0x5a5e62, -4.3, 1.25, Z0 + 0.02); for (let i = 0; i < 4; i++) B.box(0.02, 0.18, 0.01, M.metal, 0xc8ccd0, -4.42 + i * 0.08, 1.15, Z0 + 0.03);   // knife strip
    B.box(0.03, 0.35, 0.22, M.fabric, 0xc85a4a, -1.42, 0.7, ZF - 0.35).box(0.12, 0.06, 0.02, M.plastic, 0xf4f4f0, -0.9, 1.25, Z0 + 0.02).box(0.08, 0.12, 0.02, M.plastic, 0xf4f4f0, 1.0, 0.4, Z0 + 0.02);   // towel, switch, socket
    for (const [w, d, x, z] of [[W, 0.04, XC, Z0 + 0.02], [W, 0.04, XC, 3.48], [0.04, D, -4.98, 0], [0.04, D, 2.88, 0]]) B.box(w, 0.08, d, M.plastic, 0xf4f2ee, x, H - 0.04, z);   // cornice
    if (air) { steam(root, anim, [HOB - 0.15, 1.14, ZF - 0.42], {seed, count: 8, height: 0.9, size: 0.22, opacity: 0.25, period: 2.6, drift: 0.12}); dust(root, anim, {seed, count: 120, box: [5, 2.4, 5], at: [-2.0, 1.3, -1.5], opacity: 0.18, size: 0.05}); }
    Object.assign(spots, {wall: {at: [0, 1.55, Z0], normal: [0, 0, 1]}, stand: [0, 0, Z0 + 0.55], counter: [-4.4, 0.92, ZF - 0.3], shelf: [HOB, 2.1, Z0 + 0.15], fridge: [1.775, 0, Z0 + 0.35], table: [TX, 0.75, TZ], window: [SINK, 1.75, Z0],
      hob: [HOB, 0.955, ZF - 0.3], sink: [SINK, 0.92, ZF - 0.3], lamp: [TX, 1.72, TZ], chair: [TX, 0, TZ - 0.65], door: [2.9, 0, 0.8], pantry: [2.5, 0, Z0 + 0.3]});
    const practical = [{at: [TX, 1.6, TZ], color: 0xffd9a0, intensity: 0.55 + on * 0.5, distance: 7}, {at: [-3.0, 2.5, ZF + 0.3], color: 0xfff0dc, intensity: 0.45 + on * 0.5, distance: 7}, {at: [0.6, 2.5, ZF + 0.3], color: 0xfff0dc, intensity: 0.45 + on * 0.5, distance: 7}];
    return {ground, stageLocal: [0, 0, Z0 + 0.55], sky: ["#6a6058", "#524a44", "#3e3832"], fog: [0x7a7068, 10, 40], radius: 7, practical, indoor: true,
      sun: night ? [0.2, 1, 0.3] : [-0.7, 0.75, 0.35], sunColor: night ? 0xfff0dc : T.key[0], sunInt: night ? 0.5 : T.key[1], hemi: night ? [0x9a9080, 0x3a3630, 0.24] : [0xf0e8dc, 0x9a8a78, 0.32]};
  };
  KINDS.lab = X => {
    const {B, M, r, seed, time, T, C, anim, root, air, life, spots} = X, P = PAL.lab, on = T.lamps, night = time === "night", W = 12, H = 3.4, D = 12, ZC = 0.5, Z0 = ZC - D / 2, BZ = -(C + 0.8);
    const ceil = mat("tile", {seed, vertex: true, unique: true}); ceil.userData.tile = 1.8;
    room(root, W, H, D, {floor: [M.tile, P.floor], wall: [M.plaster, P.wall], ceiling: [ceil, 0xf2f4f4]}, {z: ZC, glow: 0.1});
    const gb = builder(root, M); gb.box(W, 0.1, D, M.tile, P.floor, 0, -0.05, ZC); const [ground] = gb.flush({name: "ground", cast: false});
    for (const [x, z] of [[-2, -4], [2, -4], [-2, -1], [2, -1], [-2, 2], [2, 2], [-2, 5], [2, 5]]) B.box(1.2, 0.02, 0.6, M.light(0xf4f6ff, 1.0 + on * 0.6), 0xffffff, x, H - 0.03, z).box(1.26, 0.03, 0.66, M.plastic, 0xe8eaea, x, H - 0.01, z);
    // island bench behind the stage: the clear 1.0 x 0.6 m area is its top centre (spots.bench); instruments sit at |x| >= 0.9
    cabinets(B, M, -1.5, 1.5, 0, 0.86, 1.2, BZ + 0.6, {door: 0.5, color: P.benchBody, top: {mat: M.plastic, color: P.bench}, toe: 0.1});
    B.box(3.0, 0.03, 0.25, M.plastic, P.shelf, 0, 1.15, BZ - 0.47); for (const dx of [-1.4, 1.4]) B.box(0.04, 0.25, 0.04, M.metal, P.steel, dx, 1.025, BZ - 0.47);
    bottles(B, M, r, -1.3, 1.3, 1.165, BZ - 0.47, 8, P.bottles, {size: 0.9}); B.box(0.3, 0.05, 0.08, M.plastic, 0xf4f4f0, 0.5, 1.2, BZ - 0.47);
    B.box(0.22, 0.04, 0.3, M.metal, 0xe8eaea, -1.15, 0.92, BZ + 0.1).box(0.06, 0.3, 0.06, M.metal, 0x3a3d40, -1.15, 1.09, BZ - 0.02, 0, 0.3).cyl(0.025, 0.22, M.metal, 0x2a2d30, -1.15, 1.17, BZ + 0.1, 10, 0.35);   // microscope
    B.box(0.42, 0.3, 0.46, M.plastic, 0xdcdfe0, 1.1, 1.05, BZ).cyl(0.17, 0.04, M.plastic, 0xbfc4c8, 1.1, 1.22, BZ, 20).box(0.08, 0.05, 0.06, M.light(0x7fd3ff, 0.8), 0x203040, 1.1, 1.1, BZ + 0.24);   // centrifuge
    for (let i = 0; i < 6; i++) B.cyl(0.012, 0.12, M.glassy, pick(r, P.bottles), -0.95 + i * 0.05, 0.98, BZ + 0.4, 6); B.box(0.34, 0.06, 0.1, M.plastic, 0xf4f4f0, -0.83, 0.93, BZ + 0.4);   // test tube rack
    B.box(0.32, 0.015, 0.24, M.plastic, 0xd9d9d4, 1.0, 0.91, BZ + 0.38); B.box(0.3, 0.2, 0.01, M.dark, 0x2a2d30, 1.0, 1.02, BZ + 0.27, 0, -0.3);   // laptop
    // back bench along the back wall with shelf units full of bottles and a window in the middle
    cabinets(B, M, -5.8, 5.8, 0, 0.86, 0.75, Z0 + 0.75, {door: 0.6, color: P.benchBody, top: {mat: M.plastic, color: P.bench}});
    const G = M.light(...T.glow); windowUnit(B, M, 0, 1.95, Z0 + 0.08, 2.4, 1.3, 0, G, {blinds: 0.35, cols: 3, rows: 2});
    for (const x of [-4.4, -2.4, 2.4, 4.4]) { shelfUnit(B, M, x, 1.25, Z0 + 0.2, 1.8, 1.1, 0.35, 2, P.shelf, 0, true); for (const y of [1.27, 1.82]) bottles(B, M, r, x - 0.8, x + 0.8, y, Z0 + 0.2, 7, P.bottles); }
    B.box(0.3, 0.1, 0.3, M.plastic, 0xdcdfe0, -1.4, 0.95, Z0 + 0.6).cyl(0.11, 0.14, M.glassy, 0x7fb0d8, -1.4, 1.07, Z0 + 0.6, 12).box(0.28, 0.04, 0.24, M.metal, 0xe8eaea, 1.5, 0.92, Z0 + 0.6).box(0.2, 0.1, 0.16, M.glassy, 0xcfd8dc, 1.5, 0.99, Z0 + 0.6);   // hot plate with beaker, balance
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6), mat("plastic", {seed, color: 0xf4f4f0})); bar.rotation.z = Math.PI / 2; bar.position.set(-1.4, 1.012, Z0 + 0.6); root.add(bar); if (life) anim.push(t => { bar.rotation.y = (t * 7) % TAU; });   // stir bar
    for (const x of [-3.0, 3.5]) B.cyl(0.18, 0.05, M.plastic, 0x2a2d30, x, 0.72, Z0 + 1.6, 14).cyl(0.03, 0.7, M.metal, P.steel, x, 0.36, Z0 + 1.6, 8).cyl(0.24, 0.03, M.metal, P.steel, x, 0.015, Z0 + 1.6, 12);   // stools
    // fume hood on the left wall: base cabinet, open enclosure with a lit back, half-open sash, duct
    const HX = -5.2, HZ = -1.2;
    B.box(1.6, 0.86, 0.9, M.plastic, P.benchBody, HX, 0.43, HZ).box(1.64, 0.04, 0.94, M.plastic, P.bench, HX, 0.88, HZ).box(0.04, 1.5, 0.9, M.metal, P.hood, HX - 0.78, 1.65, HZ).box(1.6, 0.06, 0.9, M.metal, P.hood, HX, 2.37, HZ);
    for (const s of [-1, 1]) B.box(1.6, 1.5, 0.04, M.metal, P.hood, HX, 1.65, HZ + s * 0.43); B.box(0.02, 1.3, 0.8, M.light(0xe0fff0, 0.7), 0xd0e8d8, HX - 0.75, 1.6, HZ).box(0.03, 0.9, 0.82, M.glassy, 0xa0b8c8, HX + 0.78, 1.85, HZ).box(0.06, 0.06, 0.9, M.metal, P.hood, HX + 0.78, 1.4, HZ);
    bottles(B, M, r, HX - 0.6, HX + 0.1, 0.9, HZ, 3, P.bottles, {size: 1.2}); B.cyl(0.15, 1.0, M.metal, 0x9aa0a4, HX, 2.9, HZ, 12);
    B.cyl(0.04, 0.3, M.metal, P.steel, HX + 0.3, 1.2, HZ + 0.9, 8).box(0.16, 0.16, 0.02, M.plastic, 0x1f8a4c, HX + 0.9, 1.6, HZ + 0.9);   // eyewash + sign
    for (const [dz, col] of [[0, 0x8a8e92], [0.3, 0x2f6f4f]]) B.cyl(0.12, 1.5, M.metal, col, -5.5, 0.75, -4.6 + dz, 12).cyl(0.04, 0.12, M.metal, 0x3a3d40, -5.5, 1.56, -4.6 + dz, 8); B.box(0.1, 0.03, 0.5, M.metal, 0x3a3d40, -5.5, 1.1, -4.45);   // gas cylinders
    // desk with two monitors against the right wall, equipment rack, whiteboard, door, coats
    table(B, M, 5.55, -0.5, 1.8, 0.8, 0.75, 0xd8dcd8, 0x8a8e92, Math.PI / 2); const screen = M.light(0xffffff, 0.9, {map: screenTex(seed), vertex: true});
    monitor(B, M, 5.7, 0.75, -0.9, -Math.PI / 2, screen); monitor(B, M, 5.7, 0.75, -0.1, -Math.PI / 2, screen); B.box(0.3, 0.02, 0.12, M.plastic, 0xdddddd, 5.3, 0.76, -0.5).box(0.2, 0.45, 0.45, M.dark, 0x2a2d30, 5.75, 0.23, 0.35).box(0.01, 0.02, 0.02, M.light(0x40ff80, 1.2), 0x40ff80, 5.64, 0.4, 0.3);
    chair(B, M, 4.8, -0.5, Math.PI / 2, P.chair, 0x3a3d40); if (life) anim.push(t => { screen.map.offset.x = (t * 0.03) % 1; });
    shelfUnit(B, M, 5.65, 0, 2.2, 0.6, 1.8, 0.6, 3, P.steel, -Math.PI / 2, true); for (const y of [0.1, 0.7, 1.3]) B.box(0.5, 0.25, 0.5, M.metal, 0xd0d4d6, 5.65, y + 0.14, 2.2).box(0.02, 0.02, 0.1, M.light(0x7fd3ff, 1.2), 0x203040, 5.38, y + 0.2, 2.35);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), PLAIN(boardTex(seed), 0.6)); board.position.set(5.97, 1.7, -3.5); board.rotation.y = -Math.PI / 2; board.name = "whiteboard"; root.add(board);
    B.box(0.03, 1.16, 1.86, M.metal, 0xb8bcc0, 5.985, 1.7, -3.5).box(0.06, 0.03, 1.6, M.metal, 0xb8bcc0, 5.94, 1.12, -3.5);
    doorUnit(B, M, -3.5, ZC + D / 2 - 0.03, Math.PI, {color: 0xd8dcd8, frame: 0x8a8e92}); B.box(0.3, 0.4, 0.02, M.glassy, 0x9fb4c4, -3.5, 1.6, ZC + D / 2 - 0.06);
    for (const x of [2.0, 2.5]) B.box(0.42, 1.0, 0.14, M.fabric, 0xf0f0ec, x, 1.35, ZC + D / 2 - 0.12).cyl(0.02, 0.1, M.metal, P.steel, x, 1.9, ZC + D / 2 - 0.08, 6, Math.PI / 2);   // lab coats
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), PLAIN(chartTex(seed + 1))); poster.position.set(3.8, 1.7, ZC + D / 2 - 0.03); poster.rotation.y = Math.PI; root.add(poster);
    B.cyl(0.08, 0.5, M.metal, 0xb33a2c, -5.8, 1.1, 1.5, 10).box(0.3, 0.3, 0.02, M.plastic, 0xb33a2c, -5.97, 1.7, 1.5);   // extinguisher
    for (const [x, z] of [[-2, -4], [2, -4], [-2, -1], [2, -1], [-2, 2], [2, 2], [-2, 5], [2, 5]]) pool(root, [x, 0, z], 2.2, 0xf4f6ff, 0.05 + on * 0.05);
    for (const x of [-3, 3]) B.box(0.3, 0.08, D - 0.4, M.grate, 0x9aa0a4, x, H - 0.3, ZC);   // cable trays
    B.box(0.7, 1.9, 0.7, M.metal, 0xdcdfe0, -5.6, 0.95, 2.6).box(0.5, 1.2, 0.02, M.glassy, 0x9fb4c4, -5.24, 1.2, 2.6).box(0.46, 1.1, 0.02, M.light(0xd0f0ff, 0.5), 0xa0c0d0, -5.3, 1.2, 2.6);   // lab fridge with a lit glass door
    for (let i = 0; i < 7; i++) B.box(0.06, 0.3, 0.24, M.plastic, pick(r, [0x2a4a9a, 0xb33a2c, 0x3a6a3a, 0xe8e4dc]), -4.9 + i * 0.08, 1.86, Z0 + 0.25);   // binders on a shelf
    B.box(1.2, 0.012, 0.6, M.stripes, 0xe4b429, -3.5, 0.006, ZC + D / 2 - 0.5).box(0.12, 0.06, 0.02, M.plastic, 0xf4f4f0, -4.3, 1.25, ZC + D / 2 - 0.02);   // hazard strip at the door, switch
    for (const [w, d, x, z] of [[W, 0.04, 0, Z0 + 0.02], [W, 0.04, 0, ZC + D / 2 - 0.02], [0.04, D, -W / 2 + 0.02, ZC], [0.04, D, W / 2 - 0.02, ZC]]) B.box(w, 0.08, d, M.plastic, 0xf4f4f0, x, H - 0.04, z);   // cornice
    if (air) { dust(root, anim, {seed, count: 150, box: [5, 2.6, 5], at: [0, 1.5, -4], opacity: 0.2, size: 0.045}); if (!night) shaft(root, [0, 2.5, Z0 + 0.1], [0.9, 0, Z0 + 2.4], 2.2, {opacity: time === "dusk" ? 0.04 : 0.06, top: 1.2}); }
    Object.assign(spots, {bench: {at: [0, 0.9, BZ], normal: [0, 1, 0]}, hood: [HX + 0.5, 0.9, HZ], shelf: [-4.4, 1.82, Z0 + 0.2], monitor: [5.6, 1.0, -0.9], window: [0, 1.95, Z0], backbench: [0, 0.9, Z0 + 0.4], desk: [5.55, 0.75, -0.5], door: [-3.5, 0, ZC + D / 2], cylinders: [-5.5, 0, -4.6], board: [5.97, 1.7, -3.5], stool: [-3.0, 0.74, Z0 + 1.6]});
    const practical = [[-2, 3.1, -2.5], [2, 3.1, 0.5]].map(at => ({at, color: 0xf4f6ff, intensity: 0.45 + on * 0.35, distance: 11}));
    return {ground, sky: ["#5a6670", "#48525a", "#363e44"], fog: [0x8a9298, 12, 50], radius: 8, practical, indoor: true,
      sun: night ? [0.2, 1, 0.1] : [-0.35, 0.7, -0.6], sunColor: night ? 0xf4f6ff : T.key[0], sunInt: night ? 0.5 : T.key[1], hemi: night ? [0x9aa4b0, 0x404040, 0.24] : [0xe6ecf2, 0xa8a8a2, 0.32]};
  };

  // ── public API
  const SITE = {sidewalk: "office", kitchen: "office", clinic: "office", factory: "lab", lab: "lab", recycling: "construction"};
  function place(NAME, scene, opts = {}) {
    const kind = opts.kind || (window.SCENE_PLACE && window.SCENE_PLACE[NAME]) || "lab";
    if (!KINDS[kind]) throw new Error(`KIT.place: unknown kind "${kind}" (have ${Object.keys(KINDS).join(", ")})`);
    const seed = opts.seed ?? 1, time = TIME[opts.time] ? opts.time : kind === "sidewalk" ? "golden" : "day", T = TIME[time], C = Math.max(0.5, opts.clear ?? 2.5), stage = opts.stage || [0, 0, 0];
    const looked = !!(window.LOOK && window.LOOK.on) || !!(opts.renderer && opts.renderer.toneMapping !== THREE.NoToneMapping), gain = opts.gain ?? (looked ? 1 : 2.6);
    const root = new THREE.Group(); root.name = "place_" + kind; root.userData.rvEnv = true; root.userData.rvPlace = kind;
    const M = materials(seed), B = builder(root, M), anim = [], spots = {}, r = KIT.rng(seed * 101 + 7);
    const K = KINDS[kind]({root, M, B, anim, spots, r, seed, time, T, C, air: opts.air !== false, life: opts.life !== false, scene});
    B.flush({name: "set"});
    const local = K.stageLocal || [0, 0, 0], off = [stage[0] - local[0], -local[1], stage[2] - local[2]];   // the ground stays at world y = 0
    root.position.set(off[0], off[1], off[2]); scene.add(root); root.updateMatrixWorld(true); KIT.fx.env(root);
    const toWorld = p => Array.isArray(p) ? [p[0] + off[0], p[1] + off[1], p[2] + off[2]] : {at: toWorld(p.at), normal: p.normal.slice()};
    const S = {}; for (const k in spots) S[k] = toWorld(spots[k]);
    const at = S.stand || [stage[0], stage[1], stage[2]];
    scene.background = skyTex(K.sky || T.sky, K.fog ? K.fog[0] : T.fog, {clouds: K.indoor ? 0 : 24, seed, warm: time === "golden" || time === "dusk"});
    scene.fog = K.fog ? new THREE.Fog(K.fog[0], K.fog[1], K.fog[2]) : null;
    const lights = opts.lights === false ? null : rig(scene, {time, stage: at, radius: K.radius || 10, sun: K.sun, sunColor: K.sunColor, sunInt: K.sunInt, hemi: K.hemi, fill: K.fill, gain,
      practical: (K.practical || []).map(p => Object.assign({}, p, {at: toWorld(p.at), target: p.target ? toWorld(p.target) : undefined}))});
    if (opts.renderer) { opts.renderer.shadowMap.enabled = true; opts.renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    const P = {root, kind, site: SITE[kind], stage: at, spots: S, ground: K.ground, lights: lights && lights.group, sun: lights && lights.sun, gain, tris: tris(root), update(t) { for (const f of anim) f(t); }};
    P.update(0); return P;
  }
  place.kinds = Object.keys(KINDS); place.site = kind => SITE[kind] || "lab";
  place.mat = (kind, o) => mat(kind, o); place.texture = texture; place.TIME = TIME; place.PAL = PAL;
  KIT.place = place;
})();
