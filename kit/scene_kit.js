/* Shared scene primitives. Positions and UI dimensions are in composition pixels. */
(function () {
  const clamp = (value, lower, upper) => Math.min(Math.max(lower, value), upper);
  function smooth(beginning, ending, time) {
    const fraction = clamp((time - beginning) / (ending - beginning), 0, 1);
    return fraction * fraction * (3 - 2 * fraction);
  }
  function win(time, beginning, ending, feather = 0.4) {
    return Math.max(Math.min(smooth(beginning, beginning + feather, time), 1 - smooth(ending - feather, ending, time)), 0);
  }
  const linesOf = sceneName => ((DATA.words && DATA.words.lines) || []).filter(line => line.scene === sceneName);
  function wordT(sceneName, keyword, occurrence = 0) {
    const times = [];
    for (const line of linesOf(sceneName)) for (const entry of line.words) if (entry.word === keyword) times.push(entry.t_scene);
    if (times[occurrence] !== undefined) return times[occurrence];
    console.error(`Missing word ${JSON.stringify(keyword)} in scene ${sceneName}`);
    return 1e9;
  }
  function lineSpan(sceneName, index) {
    const start = DATA.timeline.modules[sceneName].start, line = linesOf(sceneName)[index];
    return line ? [line.speech_start - start, line.speech_end - start] : [1e9, 1e9];
  }
  function label(layer, content, options = {}) {
    const leaderSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    leaderSvg.setAttribute("height", "1080"); leaderSvg.setAttribute("width", "1920");
    leaderSvg.style.cssText = "overflow:visible;position:absolute;top:0;left:0";
    const leaderLine = document.createElementNS(leaderSvg.namespaceURI, "line");
    const anchorDot = document.createElementNS(leaderSvg.namespaceURI, "circle");
    const leaderColor = options.color || "#16323C";
    leaderLine.setAttribute("stroke-width", "3"); leaderLine.setAttribute("stroke", leaderColor);
    anchorDot.setAttribute("r", "7"); anchorDot.setAttribute("fill", leaderColor);
    leaderSvg.append(leaderLine, anchorDot);
    const textNode = document.createElement("div");
    textNode.style.cssText = `position:absolute;white-space:nowrap;font:700 ${options.size || 36}px/1.2 var(--ui);color:${options.ink || "#F7F9F9"};background:${leaderColor};padding:8px 16px;transform:translate(-50%,-100%)`;
    textNode.textContent = content;
    layer.append(leaderSvg, textNode);
    const record = {box: textNode, target: options.target || null, world: new THREE.Vector3(), camera: null};
    (window.__KIT_LABELS = window.__KIT_LABELS || []).push(record);
    const projected = new THREE.Vector3();
    return {box: textNode, line: leaderLine, dot: anchorDot,
      set(content, nextColor) {
        if (textNode.textContent !== content) textNode.textContent = content;
        if (nextColor) {
          anchorDot.setAttribute("fill", nextColor);
          leaderLine.setAttribute("stroke", nextColor);
          textNode.style.background = nextColor;
        }
      },
      place(view, point, offsetX, offsetY, alpha) {
        record.world.copy(point); record.camera = view;
        projected.copy(point).project(view);
        const anchorX = (projected.x + 1) * 960, anchorY = (1 - projected.y) * 540;
        textNode.style.display = leaderSvg.style.display = alpha > 0.001 ? "block" : "none";
        const measured = textNode.getBoundingClientRect(), width = measured.width || 200, height = measured.height || 50;
        const textX = clamp(anchorX + offsetX, Math.ceil(40 + width / 2 + 0.5), Math.floor(1880 - width / 2 - 0.5));
        const textY = clamp(anchorY + offsetY, Math.ceil(130 + height + 0.5), Math.floor(870 - 0.5));
        for (const [attribute, coordinate] of Object.entries({x1: anchorX, y1: anchorY, x2: textX, y2: textY})) {
          leaderLine.setAttribute(attribute, coordinate);
        }
        anchorDot.setAttribute("cx", anchorX); anchorDot.setAttribute("cy", anchorY);
        textNode.style.top = `${textY}px`; textNode.style.left = `${textX}px`;
        textNode.style.opacity = leaderSvg.style.opacity = alpha.toFixed(3);
      }};
  }
  // 3D name plate that is never hidden by what stands in front of it (a pipe before a tank, check_quality TEXT_HIDDEN):
  // KIT.sign(parent, text, {at: [x,y,z], width: 0.8, color, ink, face: "camera" | [nx,ny,nz]}) -> mesh with set(text) and
  // place(camera, alpha). Drawn after the scene with no depth test, so it reads like a label fixed to the object. For a tag
  // that follows the screen, KIT.label (page overlay) is still the first choice.
  function sign(parent, content, o = {}) {
    const cv = document.createElement("canvas"), g = cv.getContext("2d"), tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.MeshBasicMaterial({map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false});
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    plate.renderOrder = 50; plate.userData.rvSign = true; plate.name = o.name || "sign";
    const draw = text => {
      g.font = "700 64px var(--ui), sans-serif"; const w = Math.ceil(g.measureText(text).width) + 72;
      cv.width = w; cv.height = 112; g.font = "700 64px var(--ui), sans-serif";
      g.fillStyle = o.color || "#16323C"; g.fillRect(0, 0, w, 112);
      g.fillStyle = o.ink || "#F7F9F9"; g.textBaseline = "middle"; g.fillText(text, 36, 58);
      const width = o.width ?? Math.min(1.2, 0.18 * text.length + 0.2); plate.scale.set(width, width * 112 / w, 1); tex.needsUpdate = true;
    };
    draw(content); if (o.at) plate.position.set(...o.at); parent.add(plate);
    const face = o.face ?? "camera";
    if (Array.isArray(face)) plate.lookAt(plate.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(...face)));
    plate.set = text => draw(text);
    plate.place = (camera, alpha = 1) => {
      if (face === "camera") plate.quaternion.copy(camera.quaternion);
      mat.opacity = alpha; plate.visible = alpha > 0.001;
    };
    return plate;
  }
  function rng(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6D2B79F5) | 0;
      let u = Math.imul(state ^ (state >>> 15), state | 1);
      u ^= u + Math.imul(u ^ (u >>> 7), u | 61);
      return ((u ^ (u >>> 14)) >>> 0) / 4294967296;
    };
  }
  // ── 카메라 ──
  const cr = (p0, p1, p2, p3, u) => {   // centripetal 아닌 uniform Catmull-Rom (열쇠 간격이 고르지 않아도 시간 축 재매개화로 속도 맞춤)
    const u2 = u * u, u3 = u2 * u;
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  };
  const ease3 = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  function camAt(K, t, o = {}) {
    if (K.length === 1) return {p: K[0][1].slice(), l: K[0][2].slice(), fov: K[0][3]};
    const T0 = K[0][0], T1 = K[K.length - 1][0];
    let tt = clamp(t, T0, T1);
    if (o.ease !== false && !o.hold) tt = T0 + (T1 - T0) * easeEnds((tt - T0) / Math.max(1e-6, T1 - T0), o.ramp ?? Math.min(0.25, 1.2 / Math.max(1e-6, T1 - T0)));
    let i = 0;
    while (i < K.length - 2 && tt >= K[i + 1][0]) i++;
    const a = K[i], b = K[i + 1];
    let u = clamp((tt - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1);
    if (o.hold) u = ease3(u);
    const k0 = K[Math.max(0, i - 1)], k3 = K[Math.min(K.length - 1, i + 2)];
    const f = j => cr(k0[1][j], a[1][j], b[1][j], k3[1][j], u), g = j => cr(k0[2][j], a[2][j], b[2][j], k3[2][j], u);
    return {p: [f(0), f(1), f(2)], l: [g(0), g(1), g(2)], fov: cr(k0[3], a[3], b[3], k3[3], u)};
  }
  // 전체 구간을 등속으로 가되 앞뒤 ramp 비율만 가감속(속도 연속, 위치 0→1)
  function easeEnds(u, r) {
    r = clamp(r, 1e-3, 0.5); const v = 1 / (1 - r);   // 가운데 속도
    if (u < r) return v * u * u / (2 * r);
    if (u > 1 - r) { const w = 1 - u; return 1 - v * w * w / (2 * r); }
    return v * (u - r / 2);
  }
  // 손 흔들림: 서로 나누어지지 않는 주파수 사인 합(결정론, 저주파 0.2~0.9 Hz)
  const wob = (t, s) => Math.sin(t * 1.31 + s) * 0.5 + Math.sin(t * 2.97 + s * 1.7) * 0.3 + Math.sin(t * 5.23 + s * 2.3) * 0.2;
  const _prev = {};
  function camSet(cam, s, o = {}) {
    const sh = o.shake ?? 0, t = o.t ?? 0;
    cam.position.set(s.p[0] + sh * wob(t, 1), s.p[1] + sh * wob(t, 2) * 0.6, s.p[2] + sh * wob(t, 3));
    cam.fov = s.fov; cam.aspect = 1920 / 1080; cam.updateProjectionMatrix();
    const lx = s.l[0] + sh * 0.6 * wob(t, 4), ly = s.l[1] + sh * 0.6 * wob(t, 5), lz = s.l[2] + sh * 0.6 * wob(t, 6);
    cam.lookAt(lx, ly, lz); cam.updateMatrixWorld(true);
    cam.userData.focus = o.focus ?? Math.hypot(cam.position.x - s.l[0], cam.position.y - s.l[1], cam.position.z - s.l[2]);
    cam.userData.focusFrom = o.focus != null ? "scene" : "look";   // "look" = 바라보는 점까지 거리(기본값) → look.js 가 주인공(KIT.fx.focus·자동)을 먼저 따름. o.focus 를 준 장면은 그 값 그대로
    window.CAMSTATE = {p: [cam.position.x, cam.position.y, cam.position.z].map(x => +x.toFixed(4)), l: s.l.map(x => +x.toFixed(4)), fov: +s.fov.toFixed(3), focus: +cam.userData.focus.toFixed(3)};
    return cam;
  }
  // 샷 문법 부품: 모두 t0(시작)·t1(끝) 과 대상 점 c=[x,y,z] 를 받아 열쇠 K 를 돌려준다
  const rad = d => d * Math.PI / 180;
  const around = (c, r, az, h) => [c[0] + r * Math.sin(rad(az)), c[1] + h, c[2] + r * Math.cos(rad(az))];
  const shot = {
    // 전경: 넓게 보며 천천히 옆으로 흘러감(az0→az1)
    establish: (t0, t1, c, {r = 6, h = 3, az0 = -20, az1 = 10, fov = 50} = {}) => [[t0, around(c, r, az0, h), c, fov], [(t0 + t1) / 2, around(c, r * 0.97, (az0 + az1) / 2, h * 0.97), c, fov], [t1, around(c, r * 0.94, az1, h * 0.94), c, fov]],
    // 밀어 들어가기: 같은 방향에서 거리 r0→r1, 화각도 살짝 좁힘
    pushIn: (t0, t1, c, {r0 = 5, r1 = 1.6, az = 0, h0 = 1.6, h1 = 0.4, fov0 = 50, fov1 = 40} = {}) => [[t0, around(c, r0, az, h0), c, fov0], [t1, around(c, r1, az, h1), c, fov1]],
    // 돌아보기: 대상 둘레를 az0→az1 도는 호(중간 열쇠를 촘촘히 넣어 원호 유지)
    orbit: (t0, t1, c, {r = 3, h = 1.2, az0 = -40, az1 = 40, fov = 45, n = 4} = {}) => Array.from({length: n + 1}, (_, i) => [t0 + (t1 - t0) * i / n, around(c, r, az0 + (az1 - az0) * i / n, h), c, fov]),
    // Raise the viewpoint while pulling back slightly to reveal the surrounding scene.
    crane: (t0, t1, c, {r = 4, az = 0, h0 = 0.3, h1 = 3.5, fov = 50} = {}) => [[t0, around(c, r, az, h0), c, fov], [t1, around(c, r * 1.1, az, h1), c, fov]],
    // 되돌아보기: 카메라는 거의 제자리, 시선만 c0→c1 로 돌린다
    lookback: (t0, t1, p, c0, c1, {fov = 50} = {}) => [[t0, p, c0, fov], [t1, [p[0] * 0.98, p[1], p[2] * 0.98], c1, fov]],
    // 여러 샷 이어 붙이기(앞 샷 끝 열쇠와 뒤 샷 첫 열쇠가 같은 시각이면 뒤 것을 씁니다)
    chain: (...Ks) => Ks.flat().sort((a, b) => a[0] - b[0]).filter((k, i, A) => i === 0 || k[0] - A[i - 1][0] > 1e-6),
    // 따라가기: target(t) 가 돌려주는 점을 off 만큼 떨어져 뒤따름(0.25 s 마다 열쇠, camAt 곡선이 잇음). look 은 target 위 lookY
    follow: (t0, t1, target, {off = [0, 1.2, 2.5], lookY = 0.5, fov = 45, step = 0.25} = {}) => {
      const K = []; for (let t = t0; t <= t1 + 1e-6; t += step) { const p = target(t);
        K.push([t, [p[0] + off[0], p[1] + off[1], p[2] + off[2]], [p[0], p[1] + lookY, p[2]], fov]); } return K; },
  };
  // 박자 컷: 샷 목록 [{t: 시작, K: 열쇠, o: camAt 옵션}] 에서 t 에 맞는 샷을 고름(샷 사이는 끊는 컷). 샷 시작은 낱말 시각(KIT.wordT)에 맞춘다
  // 의도한 컷 선언: 장면 init 에서 KIT.shot.declare(NAME, SH) → window.SHOTCUTS[장면] = 장면 안 컷 시각. check_cuts 가 이 프레임의 밝기 급변은 의도로 본다(검은 프레임은 여전히 잡음)
  // ui-only 는 카메라 고정. follow/explode 예외는 subject:"물체 이름" + 실제 움직임·시선 추적 검증이 필요. 보통 컷 선언은 자막 때 카메라 이동의 예외가 아님.
  // action(동작 순간 줌·돌기, HOWTO 4-0): {t, end, kind:"action", subject:"물체 이름"} — 3 s 이하, 대상이 실제로 움직이고 샷 내내 화면 안·끝에 가운데, 카메라가 한 방향으로 크게일 때만 예외. 손으로 적기보다 KIT.shot.action 부품.
  shot.declare = (scene, shots) => {
    (window.SHOTCUTS = window.SHOTCUTS || {})[scene] = shots.slice(1).map(s => s.t);
    (window.SHOTKINDS = window.SHOTKINDS || {})[scene] = shots.map(s =>
      ({t: s.t, ...(s.end == null ? {} : {end: s.end}), kind: s.kind || "scene",
        ...(typeof s.subject === "string" ? {subject: s.subject} : {})}));
  };
  // 장면 전환이 차지하는 앞·뒤 초(check_motion transition_spans 와 같은 셈법): 크로스페이드 · 테마 섞기 · dip 절반
  function transitionEdges(scene) {
    const tl = (window.DATA && window.DATA.timeline) || window.TIMELINE || {}, order = tl.order || [], i = order.indexOf(scene);
    const looks = window.SCENE_LOOK || {}, tr = window.TRANSITIONS || {}, blend = Math.max(1.5, (window.THEME_PLAN && window.THEME_PLAN.blend_s) || 2);
    const look = n => looks[n] || "cinema", cross = +tl.crossfade_s || 0;
    let lead = 0, tail = 0;
    if (i > 0) lead = look(scene) !== look(order[i - 1]) ? Math.max(cross, blend) : Math.max(cross, tr[scene] ? (tr[scene].dur || 0.6) / 2 : 0);
    const next = order[i + 1];
    if (next && look(next) === look(scene) && tr[next]) tail = (tr[next].dur || 0.6) / 2;
    return {lead, tail, duration: ((tl.modules || {})[scene] || {}).duration ?? Infinity};
  }
  function declareMore(scene, s) {   // 있던 선언을 두고 하나 더(시각 순)
    const kinds = ((window.SHOTKINDS = window.SHOTKINDS || {})[scene] = (window.SHOTKINDS[scene] || []).concat([s]).sort((a, b) => a.t - b.t));
    (window.SHOTCUTS = window.SHOTCUTS || {})[scene] = kinds.slice(1).map(k => k.t);
  }
  const vec = k => k && k.isObject3D ? new THREE.Box3().setFromObject(k).getCenter(new THREE.Vector3()) : k && k.isVector3 ? k.clone() : new THREE.Vector3(...k);
  function keepItems(keep) {   // Object3D → 상자 꼭짓점 8개 · Vector3·[x,y,z] → 점 · {at, label, dx, dy} → 이름표 점 + 그 자리에 놓일 글자 상자
    const pts = [], labels = [];
    for (const k of [].concat(keep || [])) {
      if (k && k.isObject3D) { k.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(k); if (b.isEmpty()) continue;
        for (let j = 0; j < 8; j++) pts.push(new THREE.Vector3(j & 1 ? b.max.x : b.min.x, j & 2 ? b.max.y : b.min.y, j & 4 ? b.max.z : b.min.z)); }
      else if (k && k.label) { const box = k.label.box || k.label, prev = box.style.display; box.style.display = "block";
        const r = box.getBoundingClientRect(); box.style.display = prev;
        const w = r.width || box.textContent.length * 24 + 32, h = r.height || 59, p = vec(k.at);
        pts.push(p); labels.push({p, dx: k.dx || 0, dy: k.dy || 0, w, h}); }
      else if (k) pts.push(vec(k));
    }
    return {pts, labels};
  }
  const SAFE = {x0: 40, x1: 1880, y0: 130, y1: 870};   // KIT.label 안전 영역(위 단계 띠·아래 자막)
  // avoid 항목: [x0, y0, x1, y1] px · 카드 DOM 요소 · {box: 요소}(numCard·label 이 돌려주는 것). 요소는 숨김(display:none)이어도 잠깐 켜서 잰다.
  // 장면 overlay 가 아직 안 보여 크기 0 으로 재지면 null(다음 render 에서 다시)
  function measure(el) {   // 화면 상자: 자신이나 조상(장면 overlay)이 display:none 이어도 잠깐 켜고, 들어오는 중 transform 은 빼고 잰다(어느 시각에 재도 같게)
    const kept = [];
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.display === "none" || s.transform !== "none") { kept.push([a, a.style.display, a.style.transform]); if (s.display === "none") a.style.display = "block"; a.style.transform = "none"; }
    }
    const r = el.getBoundingClientRect();
    for (const [a, d, tr] of kept) { a.style.display = d; a.style.transform = tr; }
    return r;
  }
  function avoidRects(avoid, strict = true) {   // strict: an element measuring 0x0 makes the whole list null (retry later); else it is skipped with a warning
    const out = [];
    for (const a of [].concat(avoid || [])) {
      const el = a && a.nodeType === 1 ? a : a && a.box && a.box.nodeType === 1 ? a.box : null;
      if (!el) { if (Array.isArray(a) && a.length === 4) out.push(a); continue; }
      const r = measure(el);
      if (!(r.width > 0 && r.height > 0)) { if (strict) return null; console.warn("KIT: avoid 요소 크기 0 — 빼고 잼"); continue; }
      out.push([r.left, r.top, r.right, r.bottom]);
    }
    return out;
  }
  function framed(p, c, fov, keep, avoid, subject) {
    const cam = new THREE.PerspectiveCamera(fov, 1920 / 1080, 0.01, 1e4);
    cam.position.copy(p); cam.lookAt(c); cam.updateMatrixWorld(true);
    const px = q => { const v = q.clone().project(cam); return v.z < 1 ? [(v.x + 1) / 2 * 1920, (1 - v.y) / 2 * 1080] : null; };
    const hit = (x0, y0, x1, y1) => avoid.some(([a, b, c2, d]) => x0 < c2 && x1 > a && y0 < d && y1 > b);
    // check_motion SUBJECT_FRAME: the explained subject ends in the middle 30% of the frame (|x-.5|, |y-.5| <= .15), with a 10% margin
    if (subject) { const v = px(subject); if (!v || Math.abs(v[0] - 960) > 0.9 * 0.15 * 1920 || Math.abs(v[1] - 540) > 0.9 * 0.15 * 1080) return false; }
    for (const q of keep.pts) { const v = px(q); if (!v || v[0] < SAFE.x0 || v[0] > SAFE.x1 || v[1] < SAFE.y0 || v[1] > SAFE.y1 || hit(v[0], v[1], v[0], v[1])) return false; }
    for (const l of keep.labels) {   // 글자 상자: 가운데 x+dx, 아래 y+dy(KIT.label 의 translate(-50%,-100%)) — 안전 영역에 밀려나지 않고 피할 영역과 안 겹쳐야
      const v = px(l.p), x0 = v[0] + l.dx - l.w / 2, x1 = v[0] + l.dx + l.w / 2, y1 = v[1] + l.dy, y0 = y1 - l.h;
      if (x0 < SAFE.x0 || x1 > SAFE.x1 || y0 < SAFE.y0 || y1 > SAFE.y1 || hit(x0, y0, x1, y1)) return false; }
    return true;
  }
  function freeRects(avoid) {   // 안전 영역에서 avoid 를 뺀 빈 직사각형들(넓은 순)
    let rects = [[SAFE.x0, SAFE.y0, SAFE.x1, SAFE.y1]];
    for (const [a, b, c, d] of avoid) {
      const next = [];
      for (const [x0, y0, x1, y1] of rects) {
        if (!(a < x1 && c > x0 && b < y1 && d > y0)) { next.push([x0, y0, x1, y1]); continue; }
        if (a > x0) next.push([x0, y0, a, y1]); if (c < x1) next.push([c, y0, x1, y1]);
        if (b > y0) next.push([x0, y0, x1, b]); if (d < y1) next.push([x0, d, x1, y1]);
      }
      rects = next;
    }
    return rects.sort((p, q) => (q[2] - q[0]) * (q[3] - q[1]) - (p[2] - p[0]) * (p[3] - p[1]));
  }
  function panned(p, c, fov, keep, [tx, ty]) {   // keep 의 화면 상자 가운데를 화면 점 (tx, ty) 로: 카메라와 바라보는 점을 같이 옆·위아래로 옮김
    const cam = new THREE.PerspectiveCamera(fov, 1920 / 1080, 0.01, 1e4);
    cam.position.copy(p); cam.lookAt(c); cam.updateMatrixWorld(true);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    const px = q => { const v = q.clone().project(cam); return [(v.x + 1) / 2 * 1920, (1 - v.y) / 2 * 1080]; };
    for (const q of keep.pts) add(...px(q));
    for (const l of keep.labels) { const [x, y] = px(l.p); add(x + l.dx - l.w / 2, y + l.dy - l.h); add(x + l.dx + l.w / 2, y + l.dy); }
    const k = 2 * p.distanceTo(c) * Math.tan(fov * Math.PI / 360) / 1080, sx = tx - (x0 + x1) / 2, sy = ty - (y0 + y1) / 2;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const delta = right.multiplyScalar(-sx * k).add(up.multiplyScalar(sy * k));
    return [p.clone().add(delta), c.clone().add(delta)];
  }
  // 동작 순간 줌 부품(HOWTO 4-0): KIT.shot.action(NAME, {t, dur, from, at, subject, keep, avoid, zoom}) → {t0, t1, end, fits, at(t, base)}
  //   t: 동작 순간(예 KIT.wordT(NAME, "닿") - 0.3) · dur: 다가가는 시간(기본 1, 최대 3) · from: 시작 카메라 {p, l, fov}(base 를 주면 base(t0))
  //   at: 다가갈 대상(물체나 점) · subject: 실제로 움직이는 물체 이름(없으면 at.name)
  //   keep: 화면 안에 둘 것 — 물체·점·{at, label, dx, dy}(이름표: place 에 주는 dx·dy 그대로). 샷 끝 자세로 두고 부름
  //   avoid: 겹치면 안 되는 화면 영역 [[x0, y0, x1, y1], …] px(카드·패널) · zoom: 최대 다가감 배수(기본 2.5)
  //   바라보는 점 = keep 전체의 가운데. 끝 구도 = keep 이 모두 안전 영역(가로 40~1880, 세로 130~870 px) 안·이름표 상자가 밀려나지 않음·avoid 와 안 겹침을
  //   지키는 가장 가까운 거리. 시작 구도에서도 못 지키면 다가가지 않고 fits = false. 전환 구간이 끝난 뒤 시작, 샷 앞은 base 그대로·뒤는 끝 구도에 멈춤
  //   (글자 ±0.6 s 에 흔들림 없음), kind "action" 으로 스스로 선언.
  shot.action = (scene, o) => {
    const e = transitionEdges(scene), dur = Math.min(3, Math.max(0.3, o.dur ?? 1));
    const t0 = Math.max(o.t, e.lead), t1 = Math.min(t0 + dur, e.duration - e.tail);
    const st = s => Array.isArray(s) ? {p: s[0], l: s[1], fov: s[2]} : s;
    const from = st(o.from || (o.base && o.base(t0)));
    const keep = keepItems(o.keep ?? o.at), avoid = avoidRects(o.avoid, false);
    const c = keep.pts.length ? new THREE.Box3().setFromPoints(keep.pts).getCenter(new THREE.Vector3()) : vec(o.at);
    const p0 = new THREE.Vector3(...from.p), d0 = p0.distanceTo(c), u = p0.clone().sub(c).normalize(), fov = o.fov ?? from.fov;
    const rects = freeRects(avoid), sc = vec(o.at);
    const place = d => {   // 바라보는 점을 묶음 가운데에서 주인공 쪽으로 옮겨 가며: 그대로 → 빈 직사각형마다 가운데로 옮겨 봄
      for (const w of [0, .25, .5, .75, 1]) {
        const cw = c.clone().lerp(sc, w), p = cw.clone().addScaledVector(u, d);
        if (framed(p, cw, fov, keep, avoid, sc)) return [p, cw];
        for (const r of rects) for (const b of [0, .25, .5, .75, 1]) {   // 빈 직사각형 가운데 → 화면 가운데(주인공이 가운데 절반에 남게)
          const [q, cc] = panned(p, cw, fov, keep, [(r[0] + r[2]) / 2 * (1 - b) + 960 * b, (r[1] + r[3]) / 2 * (1 - b) + 540 * b]);
          if (framed(q, cc, fov, keep, avoid, sc)) return [q, cc]; }
      }
      return null; };
    const ok = d => !!place(d);
    let lo = d0 / (o.zoom ?? 2.5), hi = d0, fits = true;
    if (ok(lo)) hi = lo;
    else if (!ok(d0)) { fits = false; console.warn(`KIT.shot.action ${scene}: keep/avoid 를 시작 구도에서도 못 지킴 — 다가가지 않음`); }
    else for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
    const best = fits && place(hi), end = best ? {p: best[0].toArray(), l: best[1].toArray(), fov} : from;
    const subject = o.subject || (o.at && o.at.name);
    // 자막이 줌 끝 뒤 0.6 s 안에 바뀌면 선언 끝을 그 자막까지 늘림(카메라는 이미 멈춤, 3 s 안에서) — 밖이면 글자마다 카메라로 잡힘
    const tl = (window.DATA && window.DATA.timeline) || window.TIMELINE || {}, start = ((tl.modules || {})[scene] || {}).start || 0;
    const late = (tl.captions || []).map(cap => cap.t - start).filter(x => x > t1 && x <= t1 + 0.6);
    const declared = Math.min(Math.max(t1, ...late.map(x => x + 0.05)), t0 + 3, e.duration - e.tail);
    declareMore(scene, {t: t0, end: declared, kind: "action", ...(subject ? {subject} : {})});
    const mix = (a, b, w) => a.map((x, j) => x + (b[j] - x) * w);
    return {t0, t1, declared, end, fits: !!best,
      at(t, base) {
        const s0 = base ? st(base(Math.min(t, t0))) : from;
        if (t <= t0) return s0;
        if (t >= t1) return end;
        const w = smooth(t0, t1, t);
        return {p: mix(s0.p, end.p, w), l: mix(s0.l, end.l, w), fov: s0.fov + (end.fov - s0.fov) * w};
      }};
  };
  // 글자 옆 구도 부품(HOWTO 4-2): KIT.shot.free(NAME, {from, at, avoid, keep}) → {at(t), fits, centred}
  //   글자(카드·이름표)가 떠 있는 동안 서 있는 카메라 자리. from 구도({p, l, fov})를 그대로 두거나 옆·위아래로만 옮겨(거리·화각은 그대로)
  //   at(주인공)이 avoid(카드 요소나 px 상자)에 안 가리고 안전 영역 안에 다 들어오게 한다. 먼저 주인공이 화면 가운데 30% 안(SUBJECT_FRAME)인
  //   자리를 찾고, 없으면 안 가리는 자리만. 둘 다 없으면 from 그대로·fits = false(콘솔 경고). 카드 크기는 처음 보이는 render 에서 재고 기억한다.
  //   render: KIT.camSet(cam, F.at(t)) — 글자 구간 내내 같은 값(카메라 고정). 움직임은 주인공에: KIT.fx.pulse · KIT.process.spin · exhaust({path})
  shot.free = (scene, o) => {
    const st = s => Array.isArray(s) ? {p: s[0], l: s[1], fov: s[2]} : s;
    let done = null;
    const solve = () => {
      const from = st(o.from), avoid = avoidRects(o.avoid);
      if (!avoid) return null;
      const keep = keepItems(o.keep ?? o.at), sc = vec(o.at), fov = from.fov;
      const p = new THREE.Vector3(...from.p), c = new THREE.Vector3(...from.l), rects = freeRects(avoid);
      for (const [centre, order] of [[sc, [1, .75, .5, .25, 0]], [null, [0, .25, .5, .75, 1]]]) {
        if (framed(p, c, fov, keep, avoid, centre)) return {p: from.p.slice(), l: from.l.slice(), fov, fits: true, centred: !!centre};
        for (const r of rects) for (const b of order) {
          const [q, cc] = panned(p, c, fov, keep, [(r[0] + r[2]) / 2 * (1 - b) + 960 * b, (r[1] + r[3]) / 2 * (1 - b) + 540 * b]);
          if (framed(q, cc, fov, keep, avoid, centre)) return {p: q.toArray(), l: cc.toArray(), fov, fits: true, centred: !!centre};
        }
      }
      console.warn(`KIT.shot.free ${scene}: 주인공을 카드에 안 가리게 둘 자리가 없음 — from 그대로`);
      return {p: from.p.slice(), l: from.l.slice(), fov, fits: false, centred: false};
    };
    const get = () => done || (done = solve()) || {...st(o.from), fits: false, centred: false};
    return {at: () => get(), get fits() { return get().fits; }, get centred() { return get().centred; }};
  };
  // 따라가기 부품: KIT.shot.track(NAME, {t, dur, subject: 물체, off, fov}) → {t0, t1, at(t)} — 움직이는 물체 중심을 늘 바라보며 off 만큼 떨어져 따름.
  //   전환 뒤에 시작, kind "follow" 로 선언(검사가 시선 오차 5 cm 안·물체 실제 움직임을 확인). 물체에 .name 이 있어야 함.
  shot.track = (scene, o) => {
    const e = transitionEdges(scene), t0 = Math.max(o.t, e.lead), t1 = Math.min(t0 + (o.dur ?? 2), e.duration - e.tail);
    declareMore(scene, {t: t0, end: t1, kind: "follow", subject: o.subject.name});
    const off = o.off || [0, 1.2, 2.5];
    return {t0, t1, at() { const c = vec(o.subject); return {p: [c.x + off[0], c.y + off[1], c.z + off[2]], l: c.toArray(), fov: o.fov ?? 45}; }};
  };
  function shotAt(shots, t) { let s = shots[0]; for (const x of shots) if (t >= x.t) s = x; return {shot: s, idx: shots.indexOf(s), state: camAt(s.K, t, s.o || {})}; }

  // ── 정보 디자인(4단계): 한 틀. 글자 크기는 1080p 기준 4단(큰 숫자 96 · 제목 44 · 본문 34 · 꼬리표 26), 색은 shell 토큰
  const TYPE = {num: 96, title: 44, body: 34, tag: 26};
  const ACC = "#F2A33A", PANEL = "rgba(10,22,30,.86)", INK = "#F7F9F9", MUTE = "#B8C7CD";
  function source(id) {
    const n = ((window.SOURCES || {}).numbers || []).find(x => x.id === id);
    if (!n) { console.error(`[scene_kit] sources.json 에 '${id}' 가 없습니다 — 출처 없는 숫자는 화면에 못 넣습니다`); return null; }
    return n;
  }
  // 숫자 카드: 값은 출처표에서만(id + show 순번). 출처 꾸리표는 자동(fetched = "출처: …", design = "설계 목표")
  // 기본은 작게(숫자 64 px, 너비 ≤ 440 px ≈ 화면 4%) 오른쪽 위: 가운데 주인공을 안 가림(check_quality QUALITY_CARD 6%).
  // left/top 을 주면 그 자리, right 를 주면 오른쪽에서. size: "l" 은 예전 큰 카드(숫자 96 px, 한 장면에 숫자 하나뿐일 때만)
  function numCard(ov, o) {
    const n = source(o.id), val = n ? n.show[o.i || 0] : "?", big = o.size === "l";
    const T = big ? TYPE : {num: 64, body: 28, tag: 20};
    const cardBox = document.createElement("div");
    cardBox.dataset.rvCue = "tone";   // lib/cues.py: 카드가 나타나는 순간 짧은 톤
    const x = o.left != null ? `left:${o.left}px` : `right:${o.right ?? 64}px`;
    cardBox.style.cssText = `position:absolute;${x};top:${o.top ?? 150}px;background:${PANEL};border-left:${big ? 8 : 6}px solid ${ACC};` +
      `padding:${big ? "22px 34px 20px" : "14px 22px 12px"};max-width:${big ? 760 : 440}px;opacity:0;font-family:var(--ui)`;
    cardBox.innerHTML = `<div style="font:700 ${T.num}px/1 var(--ui);color:${ACC};letter-spacing:-2px">${val}</div>` +
      (o.caption ? `<div style="font:700 ${T.body}px/1.3 var(--ui);color:${INK};margin-top:${big ? 12 : 8}px">${o.caption}</div>` : "") +
      (o.sub ? `<div style="font:600 ${T.tag + 4}px/1.3 var(--ui);color:${INK};margin-top:6px">${o.sub}</div>` : "") +
      `<div style="font:500 ${T.tag}px/1.3 var(--ui);color:${MUTE};margin-top:${big ? 12 : 8}px;overflow-wrap:anywhere">${n && n.kind === "fetched" ? "출처: " + n.src : "설계 목표"}</div>`;
    ov.append(cardBox);
    return {box: cardBox, show(a, rise = 24) { cardBox.style.opacity = a.toFixed(3); cardBox.style.transform = `translateY(${((1 - a) * rise).toFixed(1)}px)`; }};
  }
  // 정지 그림(HOWTO 4-2): 움직임으로 보여 주기 힘든 뜻은 그 뜻을 풍부하게 그린 그림으로. src = deps.json assets 의 이름(ASSETS) 또는 data:/url.
  //   KIT.info.picture(ov, {src: "clinic", left, top, width, height, caption}) → {box, show(a)}. render 에서 show(KIT.win(t, a, b, 0.5))
  //   (서서히 나타나고 사라짐). check_motion PICTURE: 다 보이는 시간 3 s 이상 · 화면 8% 이상 · 그림이 채워져 있고 색이 다양(빈 판·글자만 아님).
  //   그림이 떠 있는 동안은 TEXT_MOTION 이 의도된 내용으로 본다. 글자(카드·자막)를 가리지 않는 자리에 둔다(check_layout).
  let pictureCount = 0;
  function picture(ov, o) {
    const box = document.createElement("div"), img = document.createElement("img");
    const w = o.width ?? 720, h = o.height ?? 480;
    box.dataset.rvPicture = o.src; box.dataset.rvPictureId = `${o.src}#${++pictureCount}`;   // one id per picture box
    box.style.cssText = `position:absolute;left:${o.left ?? 80}px;top:${o.top ?? 170}px;width:${w}px;background:${PANEL};padding:14px;opacity:0;` +
      `border-left:8px solid ${ACC};transform-origin:50% 60%`;
    img.src = (window.ASSETS || {})[o.src] || o.src;
    img.style.cssText = `display:block;width:${w}px;height:${h}px;object-fit:${o.fit || "cover"}`;
    box.append(img);
    if (o.caption) { const c = document.createElement("div"); c.textContent = o.caption;
      c.style.cssText = `font:600 ${TYPE.tag + 4}px/1.3 var(--ui);color:${INK};margin-top:10px`; box.append(c); }
    ov.append(box);
    return {box, img, show(a) { box.style.opacity = a.toFixed(3); box.style.transform = `scale(${(.96 + .04 * a).toFixed(4)})`;
      box.style.display = a > 0 ? "block" : "none"; }};
  }
  // 빈 자리에 카드 놓기(HOWTO 4-2): KIT.info.clear(카드 요소|{box}, {from: {p, l, fov}, objects: [물체…], pad: .1, spots})
  //   init 에서 물체를 그 글자 구간 자세로 놓고 부른다. 물체들의 화면 상자(합, 각 변 pad 비만큼 넓힘)와 안 겹치는 자리로 카드를 옮긴다:
  //   지금 자리 → spots(기본: 안전 영역 네 구석·위 가운데) 순. 도는·떠다니는 무리는 모두 objects 에(돌아도 묶음 상자 안). 못 찾으면 가장 덜 겹치는 자리·fits false.
  //   check_layout OCCLUSION 이 카드에 일부 가려진(10~90%) 설명·움직이는 물체를 cut 으로 잡는다.
  function clear(card, o) {
    const el = card && card.nodeType === 1 ? card : card.box, s = Array.isArray(o.from) ? {p: o.from[0], l: o.from[1], fov: o.from[2]} : o.from;
    const cam = new THREE.PerspectiveCamera(s.fov, 1920 / 1080, .01, 1e4); cam.position.set(...s.p); cam.lookAt(...s.l); cam.updateMatrixWorld(true);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const obj of [].concat(o.objects || [])) {
      obj.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(obj); if (b.isEmpty()) continue;
      for (let j = 0; j < 8; j++) { const v = new THREE.Vector3(j & 1 ? b.max.x : b.min.x, j & 2 ? b.max.y : b.min.y, j & 4 ? b.max.z : b.min.z).project(cam);
        const x = (v.x + 1) / 2 * 1920, y = (1 - v.y) / 2 * 1080; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    const pad = o.pad ?? .1, px = (x1 - x0) * pad, py = (y1 - y0) * pad; x0 -= px; x1 += px; y0 -= py; y1 += py;
    const r = measure(el), w = r.width, h = r.height, ov = measure(el.offsetParent || el.parentElement);
    const spots = [[r.left - ov.left, r.top - ov.top], ...(o.spots || [[SAFE.x0 + 40, SAFE.y0 + 40], [SAFE.x1 - 40 - w, SAFE.y0 + 40],
      [SAFE.x0 + 40, SAFE.y1 - 24 - h], [SAFE.x1 - 40 - w, SAFE.y1 - 24 - h], [960 - w / 2, SAFE.y0 + 40]])];
    const hit = ([l, t]) => Math.max(0, Math.min(l + w, x1) - Math.max(l, x0)) * Math.max(0, Math.min(t + h, y1) - Math.max(t, y0));
    const best = spots.reduce((a, b) => hit(b) < hit(a) ? b : a);
    const pick = spots.find(q => hit(q) === 0) || best;
    el.style.left = `${Math.round(pick[0])}px`; el.style.top = `${Math.round(pick[1])}px`; el.style.right = "auto";
    if (hit(pick) > 0) console.warn("KIT.info.clear: 카드를 물체와 안 겹치게 둘 자리가 없음 — 가장 덜 겹치는 자리");
    return {left: pick[0], top: pick[1], fits: hit(pick) === 0};
  }
  const info = {TYPE, ACC, PANEL, INK, MUTE, source, numCard, picture, clear};

  // ── 보여 주는 방식(3단계 보강): 기준 A·B 가 쓰는 투시·분해·크기 대비·앞 물체 깊이·박자 컷. 모두 t 의 순수 함수로 쓰고 render 마다 다시 정한다
  // 투시·단면: root 아래 메시 재질에 자르는 면을 달아 카메라 쪽 벽을 걷어 냄. cut.set(amount, normal, offset) — amount 0 이면 안 자름
  const live = [];   // 공용 세계에 남는 효과들: 합성기가 장면 render 전마다 reset() 으로 끔(앞 장면 상태에 안 기대게)
  function cutaway(R, root) {
    R.localClippingEnabled = true;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e6), mats = new Set();
    root.traverse(o => { if (!o.isMesh) return;   // Clone shared materials before adding per-object clipping planes.
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.clippingPlanes = [plane]; m.clipShadows = true; mats.add(m); }); });
    const api = {plane, set(amount, normal = [0, 0, -1], offset = 0) {
      plane.normal.set(...normal).normalize(); plane.constant = amount > 0.001 ? offset + (1 - amount) * 40 : 1e6; }, reset() { plane.constant = 1e6; }};
    live.push(api); return api;
  }
  // 분해 보기: 그룹 자식들을 가운데에서 바깥으로 dist 만큼 벌림(원래 자리는 처음 한 번 기억). 돌려놓기는 set(0)
  function explode(group, axis = [1, 0, 0]) {
    const base = group.children.map(c => c.position.clone()), ctr = base.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, base.length));
    const ax = new THREE.Vector3(...axis).normalize();
    const api = {set(dist) { group.children.forEach((c, i) => { const along = base[i].clone().sub(ctr).dot(ax);
      c.position.copy(base[i]).addScaledVector(ax, Math.sign(along) * dist * (0.4 + Math.abs(along) * 6)); }); }, reset() { api.set(0); }};
    live.push(api); return api;
  }
  // KIT.fx.human 의 act(t, spec): 걷기·고개·버튼 누르기를 t 만의 함수로. 발자국을 경로에서 미리 정해 디딘 발은
  // 바닥에 고정(다리 2뼈 IK), 몸 속도는 서서히 출발·정지, 손끝은 최소저크 경로로 목표에 닿았다 뗀다(팔 2뼈 IK).
  //   spec = {walk: {from:[x,y,z], to:[x,y,z], t0, t1}, look: Vector3, press: {target: Vector3, normal: Vector3,
  //           t0, touch, press, release, t1, depth = .012, hand = "r"}}
  const HUMAN_MOTION = (() => {
    const Vc = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion();
    const X = Vc(1, 0, 0), Y = Vc(0, 1, 0);
    const rot = (axis, a) => Q().setFromAxisAngle(axis, a);
    const step = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
    const mjerk = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * u * (10 - 15 * u + 6 * u * u); };
    function travel(t, t0, t1, D, acc = .7, dec = .9) {   // eased distance: cosine speed ramps around a constant speed
      const T = t1 - t0, v = D / (T - acc / 2 - dec / 2), x = clamp(t - t0, 0, T), P = Math.PI;
      if (x < acc) return v * (x / 2 - acc / (2 * P) * Math.sin(P * x / acc));
      if (x < T - dec) return v * acc / 2 + v * (x - acc);
      const y = x - (T - dec);
      return v * acc / 2 + v * (T - dec - acc) + v * (y / 2 + dec / (2 * P) * Math.sin(P * y / dec));
    }
    const plans = new Map(), vec = v => v.isVector3 ? v.clone() : Vc(...v);
    function plan(w) {
      const key = JSON.stringify([w.from, w.to, w.t0, w.t1]);
      if (plans.has(key)) return plans.get(key);
      const from = vec(w.from), to = vec(w.to), D = from.distanceTo(to);
      const n = Math.max(2, Math.round(D / .54)), L = D / n;
      const tAt = s => { let a = w.t0, b = w.t1; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; travel(m, w.t0, w.t1, D) < s ? a = m : b = m; } return (a + b) / 2; };
      const steps = [], last = {r: 0, l: 0};
      for (let k = 1; k <= n + 1; k++) {   // footprint k lands .3 stride ahead of the body, lifts 1.25 strides before
        const side = k % 2 ? "r" : "l", f = Math.min(k * L, D);
        let tl, td;
        if (k <= n) { td = tAt(Math.max(.05, f - .3 * L)); tl = k === 1 ? w.t0 : tAt(Math.max(0, f - 1.25 * L)); }
        else { tl = steps[k - 2].td + .04; td = Math.max(tl + .42, w.t1 + .05); }
        steps.push({side, a: last[side], b: f, tl, td}); last[side] = f;
      }
      const p = {from, to, D, L, steps, dir: to.clone().sub(from).normalize()};
      plans.set(key, p); return p;
    }
    function foot(p, side, t) {   // distance along the path, lift, toe pitch, how much weight it carries
      let z = 0;
      for (const st of p.steps) {
        if (st.side !== side) continue;
        if (t >= st.td) { z = st.b; continue; }
        if (t > st.tl) {
          const u = (t - st.tl) / (st.td - st.tl);
          return {z: st.a + (st.b - st.a) * step(0, .88, u),
            lift: .035 * (1 - step(0, .3, u)) + .075 * Math.sin(Math.PI * u) ** 1.3 * clamp((st.b - st.a) / p.L, .4, 1),
            pitch: .3 * (1 - step(0, .45, u)) - .22 * step(.5, .9, u) * (1 - step(.9, 1, u)), ground: 1 - Math.sin(Math.PI * u)};
        }
        const heel = step(st.tl - .16, st.tl, t);
        return {z: st.a, lift: .035 * heel, pitch: .3 * heel, ground: 1};
      }
      return {z, lift: 0, pitch: 0, ground: 1};
    }
    function twoBone(S, T, a, b, pole) {
      const d = clamp(S.distanceTo(T), 1e-4, (a + b) * .9995), dir = T.clone().sub(S).normalize();
      const x = (a * a - b * b + d * d) / (2 * d), r = Math.sqrt(Math.max(0, a * a - x * x));
      const pd = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
      return {E: S.clone().add(dir.multiplyScalar(x)).add(pd.multiplyScalar(r)), d};
    }
    function frame(y, ref) {   // basis with +Y along y and +Z toward ref (perpendicular part)
      const z = ref.clone().sub(y.clone().multiplyScalar(ref.dot(y))).normalize(), x = Vc().crossVectors(y, z).normalize();
      return new THREE.Matrix4().makeBasis(x, y, Vc().crossVectors(x, y));
    }
    // rotation turning a limb whose rest bone runs along restDir (bend opening to +Z) onto root S -> joint E -> end T;
    // sign -1 for a knee (end folds back), +1 for an elbow (end folds forward); a small forward bias keeps a straight limb stable
    function limbQ(S, E, T, sign, restDir) {
      const now = frame(S.clone().sub(E).normalize(), T.clone().sub(E).multiplyScalar(sign).add(Vc(0, 0, .03)));
      const rest = frame(restDir.clone().negate().normalize(), Vc(0, 0, 1));
      return Q().setFromRotationMatrix(now.multiply(rest.transpose()));
    }
    const interior = (a, b, d) => Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
    // Hand goals. Obstacles are the boxes of the meshes in avoid (oriented with each mesh); signed distance, < 0 inside.
    function obstacles(list) {
      const out = [];
      for (const root of list || []) if (root) root.traverse(o => { if (!o.isMesh || !o.visible) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        o.updateWorldMatrix(true, false); out.push({box: o.geometry.boundingBox, m: o.matrixWorld.clone(), inv: o.matrixWorld.clone().invert(), k: o.matrixWorld.getMaxScaleOnAxis()}); });
      return out;
    }
    function clearance(p, obs) {
      let best = Infinity; const l = Vc(), c = Vc();
      for (const o of obs) {
        l.copy(p).applyMatrix4(o.inv); c.copy(l).clamp(o.box.min, o.box.max);
        const d = c.equals(l) ? -o.k * Math.min(l.x - o.box.min.x, o.box.max.x - l.x, l.y - o.box.min.y, o.box.max.y - l.y, l.z - o.box.min.z, o.box.max.z - l.z)
          : c.applyMatrix4(o.m).distanceTo(p);
        if (d < best) best = d;
      }
      return best;
    }
    const segClear = (a, b, obs, r, n = 6) => { let m = Infinity; for (let i = 0; i <= n; i++) m = Math.min(m, clearance(a.clone().lerp(b, i / n), obs) - r); return m; };
    // Points along a polyline by arc length, u in 0..1.
    function along(pts, u) {
      const L = []; let total = 0;
      for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); L.push(d); total += d; }
      let s = clamp(u, 0, 1) * total;
      for (let i = 0; i < L.length; i++) { if (s <= L[i] || i === L.length - 1) return pts[i].clone().lerp(pts[i + 1], L[i] ? clamp(s / L[i], 0, 1) : 1); s -= L[i]; }
      return pts[pts.length - 1].clone();
    }
    // From a (palm at rest) to b (approach point) in world space: where the straight way runs into an obstacle, lift
    // the worst point over it (along world up), twice at most. extra: points carried with the palm (a held object).
    function route(a, b, obs, extra = []) {
      const pts = [a.clone(), b.clone()], up = Vc(0, 1, 0);
      for (let pass = 0; pass < 2 && obs.length; pass++) {
        let worst = 0, at = null, seg = 0;
        for (let i = 1; i < pts.length; i++) for (let k = 1; k < 12; k++) {
          const p = pts[i - 1].clone().lerp(pts[i], k / 12);
          for (const [off, r] of [[Vc(), .06], ...extra]) { const c = clearance(p.clone().add(off), obs) - r - .03; if (c < worst) { worst = c; at = p; seg = i; } }
        }
        if (!at) break;
        pts.splice(seg, 0, at.clone().addScaledVector(up, -worst + .04));
      }
      return pts;
    }
    function act(g, t, {walk, look, press, grip, place, sit} = {}, {R, M, joints, tips, deform}) {
      if (sit) { g.pose("sit", {}, true); fx.seat(g, sit); }
      else g.pose("stand", {}, true);
      const J = n => joints[n], V = (a, b) => Vc(R[a][0] - (b ? R[b][0] : 0), R[a][1] - (b ? R[b][1] : 0), R[a][2] - (b ? R[b][2] : 0));
      const TH = V("knee_r", "hip_r").length(), SH = V("ankle_r", "knee_r").length(), ANK = R.ankle_r[1];
      const UA = V("elbow_r", "shoulder_r").length(), FA = V("wrist_r", "elbow_r").length() + Vc(...M.tip_r).sub(V("wrist_r")).length();
      const sideSign = {r: 1, l: -1};
      let s = 0, p = null, fr = {z: 0, lift: 0, pitch: 0, ground: 1}, fl = fr, vnorm = 0;
      if (walk) {
        p = plan(walk); s = travel(t, walk.t0, walk.t1, p.D);
        vnorm = (travel(t + .01, walk.t0, walk.t1, p.D) - travel(t - .01, walk.t0, walk.t1, p.D)) / .02 / (p.D / (walk.t1 - walk.t0));
        g.position.copy(p.from).addScaledVector(p.dir, s);
        g.rotation.set(0, Math.atan2(p.dir.x, p.dir.z), 0);
        fr = foot(p, "r", t); fl = foot(p, "l", t);
      }
      g.updateWorldMatrix(true, false);
      const k = g.scale.x, rw = press ? mjerk(press.t0, press.touch, t) * (1 - mjerk(press.release + .08, press.t1, t)) : 0;
      const feet = {r: fr, l: fl}, footPos = {};
      for (const f of ["r", "l"]) footPos[f] = Vc(R["ankle_" + f][0], ANK + feet[f].lift, R["ankle_" + f][2] + (feet[f].z - s) / k);
      const stride = p ? (footPos.r.z - footPos.l.z) * k / p.L : 0, yaw = -.11 * stride;
      const sway = .02 * (fr.ground - fl.ground) + .006 * Math.sin(2 * Math.PI * t / 5.3) * (1 - vnorm);
      const spread = p ? clamp(Math.abs(stride), 0, 1.2) : 0;
      const hipY = R.hip_r[1] - .006 - .006 * vnorm - .026 * spread * spread;
      const pelvisPos = sit ? J("pelvis").position.clone() : Vc(sway, hipY + (R.pelvis[1] - R.hip_r[1]), R.pelvis[2] + .02 * rw);
      if (!sit) { J("pelvis").position.copy(pelvisPos); J("pelvis").quaternion.copy(rot(Y, yaw)); }
      for (const f of sit ? [] : ["r", "l"]) {
        const hip = J("hip_" + f), knee = J("knee_" + f), ankle = J("ankle_" + f);
        const H = pelvisPos.clone().add(V("hip_" + f, "pelvis").applyAxisAngle(Y, yaw));
        hip.position.copy(H);
        const T = footPos[f].clone(), reach = (TH + SH) * .995, flat = Math.hypot(T.x - H.x, T.z - H.z);
        let toe = 0;
        if (T.distanceTo(H) > reach) {   // out of reach: the heel rises and the foot rolls on its toes
          const y = H.y - Math.sqrt(Math.max(0, reach * reach - flat * flat));
          toe = Math.asin(clamp((y - T.y) / .14, 0, .9)); T.y = y;
          if (T.distanceTo(H) > reach) T.sub(H).setLength(reach * .9999).add(H);
        }
        const kp = Vc(0, .15, 1), {E, d} = twoBone(H, T, TH, SH, kp);
        const qh = limbQ(H, E, T, -1, V("knee_" + f, "hip_" + f));
        hip.quaternion.copy(qh);
        knee.rotation.set(Math.PI - interior(TH, SH, d), 0, 0);
        ankle.quaternion.copy(qh.clone().multiply(knee.quaternion).invert().multiply(rot(X, Math.max(feet[f].pitch, toe))));
      }
      const goals = [];   // grip / place, one per hand
      for (const [kind, specs] of [["grip", grip], ["place", place]]) for (const s of specs ? [].concat(specs) : []) goals.push({kind, s, f: s.hand || "r"});
      const reachW = x => x.s.t0 === undefined ? 1 : mjerk(x.s.t0 - .2, x.s.touch, t) * (1 - (x.s.release === undefined ? 0 : mjerk(x.s.release, x.s.t1 ?? x.s.release + 1, t)));
      const gw = Math.max(0, ...goals.map(reachW));
      const lean = .05 * vnorm + .09 * Math.max(rw, .6 * gw) + .012 * Math.sin(2 * Math.PI * t / 3.9) * (1 - vnorm);
      const qT = rot(Y, -.55 * yaw).multiply(rot(X, lean)), torsoPos = sit ? J("spine").position.clone() : pelvisPos.clone().add(V("spine", "pelvis"));
      J("spine").position.copy(torsoPos); J("spine").quaternion.copy(qT);
      const carry = (o, off) => o.position.copy(torsoPos).add(off.clone().applyQuaternion(qT));
      let qN = Q();
      if (look) {
        const lw = (walk ? .55 * step(walk.t0, walk.t0 + .8, t) : .55) + .45 * (press ? step(press.t0 - .45, press.t0 + .1, t) * (1 - step(press.t1, press.t1 + .6, t)) : 0);
        const eye = g.localToWorld(torsoPos.clone().add(V("neck", "spine").add(Vc(0, .14, .08)).applyQuaternion(qT)));
        const dirL = vec(look).sub(eye).normalize().transformDirection(new THREE.Matrix4().copy(g.matrixWorld).invert()).applyQuaternion(qT.clone().invert());
        qN = rot(Y, .75 * clamp(Math.atan2(dirL.x, dirL.z), -1, 1) * lw).multiply(rot(X, .4 * clamp(-Math.asin(clamp(dirL.y, -1, 1)), -.5, .6) * lw));
      }
      J("neck").quaternion.copy(qN);
      carry(J("head"), V("neck", "spine").add(V("head", "neck").applyQuaternion(qN)));
      J("head").quaternion.copy(qT.clone().multiply(qN));
      for (const f of ["r", "l"]) {
        const sh = J("shoulder_" + f), el = J("elbow_" + f), wr = J("wrist_" + f), sg = sideSign[f];
        const sitQ = sh.quaternion.clone(), sitEl = el.rotation.x, sitWr = wr.quaternion.clone();
        const S = carry(sh, V("shoulder_" + f, "spine")).clone();
        const swing = -.36 * (f === "r" ? -stride : stride);
        const restQ = sit ? qT.clone().multiply(sitQ) : qT.clone().multiply(Q().setFromEuler(new THREE.Euler(swing, 0, sg * .02)));
        const restEl = sit ? sitEl : -.12 - .3 * Math.max(0, -swing);
        const goal = goals.find(x => x.f === f);
        if (goal) { reach(f, goal, S, restQ, restEl, sit ? sitWr : Q()); continue; }
        if (press && f === (press.hand || "r") && rw > 0) {
          const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), goal = vec(press.target).applyMatrix4(inv);
          const n = vec(press.normal).transformDirection(inv);
          const approach = .035 * (1 - mjerk(press.touch - .25, press.press, t)) + .035 * mjerk(press.release, press.release + .14, t);
          const push = (press.depth ?? .012) * step(press.press, press.press + .08, t) * (1 - step(press.release, press.release + .1, t));
          goal.addScaledVector(n, (approach - push) / k);
          const tipRest = V("wrist_" + f, "elbow_" + f).add(Vc(...M["tip_" + f]).sub(V("wrist_" + f)));
          const restTip = S.clone().add(V("elbow_" + f, "shoulder_" + f).applyQuaternion(restQ)).add(tipRest.applyQuaternion(restQ.clone().multiply(rot(X, restEl))));
          const want = restTip.lerp(goal, rw), T = want.clone(), ep = Vc(sg * .55, -1, -.35), b = step(0, .2, rw);
          for (let pass = 0; pass < 3; pass++) {   // the fingertip is not on the forearm line: aim, measure the real tip, re-aim
            const {E, d} = twoBone(S, T, UA, FA, ep);
            sh.quaternion.copy(restQ.clone().slerp(limbQ(S, E, T, 1, V("elbow_" + f, "shoulder_" + f)), b));
            el.rotation.set(restEl + (-(Math.PI - interior(UA, FA, d)) - restEl) * b, 0, 0);
            wr.rotation.set(.05 * b, 0, 0);
            g.updateWorldMatrix(true, true);
            T.add(want.clone().sub(g.worldToLocal(tips[f].getWorldPosition(Vc()))).multiplyScalar(b));
          }
        } else { sh.quaternion.copy(restQ); el.rotation.set(restEl, 0, 0); if (sit) wr.quaternion.copy(sitWr); }
      }
      g.userData.pose = sit ? "sit" : rw > .02 || gw > .02 ? "point" : walk && t > walk.t0 && t < p.steps[p.steps.length - 1].td ? "walk" : "stand";
      deform(); return g;

      // One hand to a grip or place goal: palm marker on the goal point, palm facing the surface, the arm's elbow
      // swung away from the avoid boxes, the way there lifted over them. A held object rides in the palm until touch.
      function reach(f, {kind, s}, S, restQ, restEl, restWr) {
        const sh = J("shoulder_" + f), el = J("elbow_" + f), wr = J("wrist_" + f), sg = sideSign[f], palm = g.userData.contacts.hands[f === "l" ? 0 : 1];
        const W = v => g.localToWorld(v.clone()), Lc = v => g.worldToLocal(v.clone()), up = Vc(0, 1, 0);
        const FW = V("wrist_" + f, "elbow_" + f).length(), palmOff = Vc(...M["palm_" + f]).sub(V("wrist_" + f));
        sh.quaternion.copy(restQ); el.rotation.set(restEl, 0, 0); wr.quaternion.copy(restWr); g.updateWorldMatrix(true, true);
        const Hr = palm.getWorldPosition(Vc()), Sw = W(S);
        const handRest = restQ.clone().multiply(el.quaternion).multiply(restWr);
        // goal point P, outward normal N (from the surface toward the hand), finger direction F; all world space
        let P, N, obj = null, rest = null, off = null, extra = [];
        const obs = obstacles(s.avoid ?? (kind === "place" ? [s.on] : []));
        if (kind === "grip") {
          if (s.at) { P = vec(s.at); N = s.normal ? vec(s.normal).normalize() : Sw.clone().sub(P).normalize(); }
          else {   // nearest surface vertex of the target to the shoulder, with its normal
            let best = Infinity; const v = Vc(), n = Vc();
            s.target.updateWorldMatrix(true, true);
            s.target.traverse(o => { if (!o.isMesh) return; const pa = o.geometry.attributes.position, na = o.geometry.attributes.normal, nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
              for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); const d = v.distanceTo(Sw);
                if (d < best) { best = d; P = v.clone(); N = na ? n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize().clone() : Sw.clone().sub(v).normalize(); } } });
            if (s.normal) N = vec(s.normal).normalize();
          }
        } else {
          obj = s.hold; obj.updateWorldMatrix(true, true);
          const ob = new THREE.Box3().setFromObject(obj), size = ob.getSize(Vc()), r = Math.max(size.x, size.z) / 2, at = obj.getWorldPosition(Vc());
          const bottom = at.y - ob.min.y, center = ob.getCenter(Vc()).sub(at);
          let spot;
          if (s.on) {
            const top = new THREE.Box3().setFromObject(s.on), inset = r + .02;
            spot = s.at ? vec(s.at) : Vc(clamp(Sw.x, top.min.x + inset, top.max.x - inset), 0, clamp(Sw.z, top.min.z + inset, top.max.z - inset));
            spot.y = top.max.y + bottom;
          } else spot = vec(s.at);
          rest = spot;
          N = Sw.clone().sub(spot).setY(0).normalize();
          P = spot.clone().add(center).setY(spot.y - bottom + size.y * .45).addScaledVector(N, r + .004);
          off = P.clone().sub(spot);   // palm minus the object's origin, while held
          extra = [[Vc(0, -bottom + .01, 0).sub(off).add(Vc(center.x, 0, center.z)), r], [Vc(0, size.y - bottom - .01, 0).sub(off).add(Vc(center.x, 0, center.z)), r]];
        }
        let F = kind === "place" ? up.clone().cross(N).multiplyScalar(-sg) : P.clone().sub(Sw);
        F.addScaledVector(N, -F.dot(N)); if (F.lengthSq() < 1e-8) F = up.clone().addScaledVector(N, -N.y); F.normalize();
        // way there and back
        const pre = kind === "place" ? P.clone().addScaledVector(up, .07) : P.clone().addScaledVector(N, .09);
        const there = route(Hr, pre, obs, extra).concat([P]);
        const touch = s.touch, t0 = s.t0 ?? touch - 1, release = s.release ?? (kind === "place" ? touch + .15 : undefined), t1 = s.t1 ?? (release ?? touch) + 1;
        const go = mjerk(t0, touch, t), back = release === undefined ? 0 : mjerk(release, t1, t);
        const away = P.clone().addScaledVector(N, .09), home = [P, away].concat(route(away, Hr, obs).slice(1));
        const H = back > 0 ? along(home, back) : along(there, go);
        const held = kind === "place" && t < touch;
        const turn = kind === "place" ? 1 - step(.3, 1, back) : step(0, .35, go) * (1 - step(.65, 1, back));
        // hand frame: rest palm normal -X (right) / +X (left), fingers -Y; goal palm normal -N, fingers F (g-local)
        const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), nl = N.clone().transformDirection(inv).negate(), fl = F.clone().transformDirection(inv);
        const basis = (a, b) => new THREE.Matrix4().makeBasis(a, b, Vc().crossVectors(a, b));
        const handGoal = Q().setFromRotationMatrix(basis(nl, fl).multiply(basis(Vc(-sg, 0, 0), Vc(0, -1, 0)).transpose()));
        const handQ = handRest.clone().slerp(handGoal, turn);
        const want = Lc(H), obsL = obs.length;
        const axisOf = T => T.clone().sub(S).normalize();
        let T = want.clone().sub(palmOff.clone().applyQuaternion(handQ));
        for (let pass = 0; pass < 3; pass++) {
          // elbow swivel: weighted toward the angles whose upper arm and forearm stay clear of the obstacles
          const ax = axisOf(T), base = Vc(sg * .55, -1, -.35);
          let sum = 0, wsum = 0;
          for (let a = -1.2; a <= 1.2001; a += .2) {
            const pole = base.clone().applyAxisAngle(ax, a), {E} = twoBone(S, T, UA, FW, pole);
            const c = obsL ? Math.min(segClear(W(S), W(E), obs, .055), segClear(W(E), W(T), obs, .045)) : 1;
            const cost = Math.max(0, .02 - c) * 400 + Math.abs(a) * .3, wgt = Math.exp(-cost / .08);
            sum += a * wgt; wsum += wgt;
          }
          const pole = base.clone().applyAxisAngle(ax, wsum > 1e-12 ? sum / wsum : 0), {E, d} = twoBone(S, T, UA, FW, pole);
          sh.quaternion.copy(limbQ(S, E, T, 1, V("elbow_" + f, "shoulder_" + f)));
          el.rotation.set(-(Math.PI - interior(UA, FW, d)), 0, 0);
          wr.quaternion.copy(sh.quaternion.clone().multiply(el.quaternion).invert().multiply(handQ));
          g.updateWorldMatrix(true, true);
          T.add(want.clone().sub(Lc(palm.getWorldPosition(Vc()))));
        }
        if (obj) {
          const to = held ? palm.getWorldPosition(Vc()).sub(off) : rest;
          obj.position.copy(obj.parent ? obj.parent.worldToLocal(to.clone()) : to); obj.updateWorldMatrix(false, true);
        }
        g.userData.reach = g.userData.reach || {};
        g.userData.reach[f] = {kind, goal: P.toArray(), palm_mm: +(palm.getWorldPosition(Vc()).distanceTo(H) * 1000).toFixed(2), touched: go >= 1 && back === 0};
      }
    }
    return {act, plan, travel};
  })();
  // +Y 위, +Z 정면. h 는 맨머리 키, 안전모는 그 위에 쓴다. 모든 자세는 이전 프레임과 무관하다.
  // human(scene,h,color,{site,suit}) 또는 human(scene,h,{site,color,suit}); 예전 세 인수 호출도 그대로.
  // 몸 겉모양은 kit/human_body.js(Quaternius UAL 마네킹, CC0)를 관절 피벗으로 CPU 에서 변형한 보통 메시라
  // 검사기가 자세 그대로의 표면을 읽는다. 동작은 pose(이름) 또는 act(t, {walk, look, press}).
  function human(scene, h = 1.75, color = 0x2a3238, opts = {}) {
    if (color && typeof color === "object" && !color.isColor) { opts = color; color = opts.color ?? 0x2a3238; }
    const site = opts.site || window.SITE || "construction", clean = site === "lab" && opts.suit === "cleanroom";
    const BODY = window.HUMAN_BODY, R = BODY.rest, M = BODY.markers;
    const g = new THREE.Group(), body = new THREE.Group(), joints = {};
    g.scale.setScalar(h / 1.75); g.add(body);
    g.userData.rvHuman = true; g.userData.site = site;
    const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({color: c, roughness: 0.78, metalness: 0, ...extra});
    const shade = (c, k) => new THREE.Color(c).multiplyScalar(k);
    const cloth = mat(clean ? 0xe2e9eb : color), skin = mat(0xb68a70), boot = mat(0x242b30);
    const glove = mat(site === "office" ? 0xb68a70 : clean ? 0xd4dfe3 : 0x69777a);
    const helmet = mat(site === "lab" ? 0xf0f2ec : 0xefbd35), hi = mat(0xe9ad25), trim = mat(0xbfcbd1), face = mat(0xb68a70);
    const seam = m => mat(shade(m.color, .72), {roughness: .6});
    const V = (a, b) => new THREE.Vector3(R[a][0] - (b ? R[b][0] : 0), R[a][1] - (b ? R[b][1] : 0), R[a][2] - (b ? R[b][2] : 0));
    function mesh(parent, part, geo, material, x = 0, y = 0, z = 0) {
      const o = new THREE.Mesh(geo, material); o.position.set(x, y, z);
      o.userData.rvPart = part; o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
    }
    function pivot(parent, name, v) {
      const o = new THREE.Group(); o.name = name; o.position.copy(v); parent.add(o); joints[name] = o; return o;
    }
    const pelvis = pivot(body, "pelvis", V("pelvis"));
    const torso = pivot(pelvis, "spine", V("spine", "pelvis"));
    const neck = pivot(torso, "neck", V("neck", "spine"));
    const head = pivot(neck, "head", V("head", "neck"));
    for (const s of ["l", "r"]) {
      const sh = pivot(torso, "shoulder_" + s, V("shoulder_" + s, "spine"));
      const el = pivot(sh, "elbow_" + s, V("elbow_" + s, "shoulder_" + s));
      pivot(el, "wrist_" + s, V("wrist_" + s, "elbow_" + s));
      const hp = pivot(pelvis, "hip_" + s, V("hip_" + s, "pelvis"));
      const kn = pivot(hp, "knee_" + s, V("knee_" + s, "hip_" + s));
      pivot(kn, "ankle_" + s, V("ankle_" + s, "knee_" + s));
    }
    // Skin: one ordinary Mesh per body part and surface (main / joint seams), deformed from the pivots.
    const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
    const pivots = BODY.pivots.map(n => joints[n]);
    const restInv = BODY.pivots.map(n => new THREE.Matrix4().makeTranslation(-R[n][0], -R[n][1], -R[n][2]));
    const surfaceOf = p => /^hand/.test(p.part) ? glove : /^foot/.test(p.part) ? boot : p.pivot === "head" ? skin : cloth;
    const seams = new Map(), skins = [];
    for (const p of BODY.parts) {
      const rest = new Float32Array(bytes(p.pos)), n8 = new Int8Array(bytes(p.nrm));
      const nrm = Float32Array.from(n8, x => x / 127), geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(rest.slice(), 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(nrm.slice(), 3));
      geo.setIndex(new THREE.BufferAttribute(new Uint16Array(bytes(p.idx)), 1));
      const base = surfaceOf(p);
      let material = base;
      if (p.kind !== "main") { if (!seams.has(base)) seams.set(base, seam(base)); material = seams.get(base); }
      const o = mesh(g, p.part, geo, material);
      o.userData.rvSkin = true;
      skins.push({o, rest, nrm, piv: new Uint8Array(bytes(p.piv)), wgt: new Uint8Array(bytes(p.wgt))});
    }
    const D = pivots.map(() => new THREE.Matrix4()), inv = new THREE.Matrix4(), seen = new Float64Array(pivots.length * 16).fill(NaN);
    function deform() {
      g.updateWorldMatrix(true, true);
      inv.copy(g.matrixWorld).invert();
      let same = true;
      pivots.forEach((pv, i) => { D[i].multiplyMatrices(inv, pv.matrixWorld).multiply(restInv[i]);
        const e = D[i].elements; for (let k = 0; k < 16; k++) if (seen[16 * i + k] !== e[k]) { same = false; seen[16 * i + k] = e[k]; } });
      if (same) return;
      for (const s of skins) {
        const pos = s.o.geometry.attributes.position.array, nor = s.o.geometry.attributes.normal.array;
        for (let v = 0, n = s.rest.length / 3; v < n; v++) {
          const x = s.rest[3 * v], y = s.rest[3 * v + 1], z = s.rest[3 * v + 2];
          const a = s.nrm[3 * v], b = s.nrm[3 * v + 1], c = s.nrm[3 * v + 2];
          let px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0;
          for (let k = 0; k < 4; k++) {
            const w = s.wgt[4 * v + k]; if (!w) continue;
            const e = D[s.piv[4 * v + k]].elements, f = w / 255;
            px += f * (e[0] * x + e[4] * y + e[8] * z + e[12]); py += f * (e[1] * x + e[5] * y + e[9] * z + e[13]); pz += f * (e[2] * x + e[6] * y + e[10] * z + e[14]);
            nx += f * (e[0] * a + e[4] * b + e[8] * c); ny += f * (e[1] * a + e[5] * b + e[9] * c); nz += f * (e[2] * a + e[6] * b + e[10] * c);
          }
          const l = Math.hypot(nx, ny, nz) || 1;
          pos[3 * v] = px; pos[3 * v + 1] = py; pos[3 * v + 2] = pz; nor[3 * v] = nx / l; nor[3 * v + 1] = ny / l; nor[3 * v + 2] = nz / l;
        }
        s.o.geometry.attributes.position.needsUpdate = true; s.o.geometry.attributes.normal.needsUpdate = true;
        s.o.geometry.computeBoundingBox(); s.o.geometry.computeBoundingSphere();
      }
    }
    // Joints moved directly after pose() (legacy children[0..5]) reach the surface whenever the scene updates its
    // matrices: before culling and upload in a render, and in checks that sample without drawing.
    g.updateMatrixWorld = function (force) { THREE.Object3D.prototype.updateMatrixWorld.call(this, force); deform(); };
    // Outfit pieces ride on the head and torso pivots, sized from the body's measured head and chest.
    const hc = new THREE.Vector3().addVectors(new THREE.Vector3(...M.head_min), new THREE.Vector3(...M.head_max)).multiplyScalar(.5).sub(V("head"));
    const hr = (M.head_max[0] - M.head_min[0]) / 2, top = M.head_max[1] - R.head[1];
    if (clean) {
      const hood = mesh(head, "head", new THREE.SphereGeometry(hr * 1.14, 24, 16, 0, Math.PI), cloth, 0, hc.y, hc.z - .012);
      hood.rotation.y = Math.PI; hood.scale.set(1, 1.3, 1.25);
    }
    if (site !== "office") {
      const hat = new THREE.Group(); hat.position.set(0, top - .095, hc.z); head.add(hat);
      const cap = mesh(hat, "head", new THREE.SphereGeometry(hr * 1.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), helmet);
      cap.scale.set(1, 1.02, 1.32);
      mesh(hat, "head", new THREE.CylinderGeometry(hr * 1.3, hr * 1.3, .012, 32), helmet, 0, .004, .012).scale.z = 1.4;
      mesh(hat, "head", new THREE.BoxGeometry(.026, .022, hr * 2.4), helmet, 0, hr * 1.2, 0);
    } else {
      const hair = mesh(head, "head", new THREE.SphereGeometry(hr * 1.07, 20, 12, 0, Math.PI * 2, 0, 1.25), boot, 0, hc.y + .012, hc.z - .006);
      hair.scale.set(1, 1.08, 1.25);
    }
    const tw = (M.torso_max[0] - M.torso_min[0]) / 2, td = (M.torso_max[2] - M.torso_min[2]) / 2;
    const tz = (M.torso_max[2] + M.torso_min[2]) / 2 - R.spine[2], ty0 = M.torso_min[1] - R.spine[1];
    if (site === "construction") {   // hi-vis vest: the chest surface pushed out 12 mm, deformed with the body
      const src = BODY.parts.find(p => p.pivot === "spine" && p.kind === "main"), base = skins.find(s => s.o.userData.rvPart === "torso" && s.o.material === cloth);
      const y0 = M.torso_min[1] + .03, y1 = M.torso_max[1] - .1, rest = base.rest.slice(), keep = [];
      for (let v = 0; v < rest.length / 3; v++) for (let c = 0; c < 3; c++) rest[3 * v + c] += base.nrm[3 * v + c] * .012;
      const idx = new Uint16Array(bytes(src.idx)), inside = v => rest[3 * v + 1] > y0 && rest[3 * v + 1] < y1;
      for (let i = 0; i < idx.length; i += 3) if (inside(idx[i]) && inside(idx[i + 1]) && inside(idx[i + 2])) keep.push(idx[i], idx[i + 1], idx[i + 2]);
            const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(rest.slice(), 3)); geo.setAttribute("normal", new THREE.BufferAttribute(base.nrm.slice(), 3));
      geo.setIndex(keep);
      const vest = mesh(g, "torso", geo, hi);
      vest.userData.rvSkin = true;
      skins.push({o: vest, rest, nrm: base.nrm, piv: base.piv, wgt: base.wgt});
    }
    const tablet = mesh(torso, "torso", new THREE.BoxGeometry(.24, .16, .014), boot, 0, .2, tz + td + .24);
    mesh(tablet, "torso", new THREE.BoxGeometry(.213, .131, .003), mat(0x588695), 0, 0, .009);
    const feet = [], hands = [];
    function marker(parent, at, from) { const o = new THREE.Object3D(); o.position.set(at[0] - R[from][0], at[1] - R[from][1], at[2] - R[from][2]); parent.add(o); return o; }
    for (const s of ["l", "r"]) {
      hands.push(marker(joints["wrist_" + s], M["palm_" + s], "wrist_" + s));
      feet.push(marker(joints["ankle_" + s], M["sole_" + s], "ankle_" + s));
    }
    g.userData.contacts = {seat: marker(pelvis, M.seat, "pelvis"), feet, hands};
    const tips = {l: marker(joints.wrist_l, M.tip_l, "wrist_l"), r: marker(joints.wrist_r, M.tip_r, "wrist_r")};
    // Old scenes address children[0..5]: head, torso, left leg/arm, right leg/arm.
    // Keep the actual part/joint roots there, with hip/shoulder rotation centres.
    const controls = [head, torso, joints.hip_l, joints.shoulder_l, joints.hip_r, joints.shoulder_r];
    for (const o of controls) g.attach(o);
    g.remove(body); g.add(body);
    for (const s of skins) { g.remove(s.o); g.add(s.o); }
    const rest = controls.map(o => o.position.clone()), restPelvis = R.pelvis[1];
    const headFromNeck = V("head", "neck"), sitPelvis = (R.knee_l[1] - R.ankle_l[1]) + R.ankle_l[1] + (R.pelvis[1] - R.hip_l[1]);
    const SIT_DROP = .39;   // seat contact to soles, metres at h = 1.75 (old figure)
    const SIT_PALM = [.2817, .2042, .2446];   // right palm from the seat contact (old figure): where scenes put levers
    let shinOpen = 0, sitArm = [.12, .2, -1.35];
    // The target of point is a world-space Vector3 (or [x,y,z]).
    g.pose = function(name, {t = 0, target} = {}, keep) {
      for (const o of Object.values(joints)) o.rotation.set(0, 0, 0);
      controls.forEach((o, i) => o.position.copy(rest[i]));
      pelvis.position.set(...R.pelvis); tablet.visible = false;
      for (const [side, s] of [["l", -1], ["r", 1]]) {
        joints["shoulder_" + side].rotation.z = s * .02;
        joints["elbow_" + side].rotation.x = -.08;
      }
      if (name === "walk") {
        const phase = t * Math.PI * 2, swing = Math.sin(phase) * .48;
        pelvis.position.y += .018 * (1 - Math.cos(phase * 2));
        for (const [side, s] of [["l", -1], ["r", 1]]) {
          joints["hip_" + side].rotation.x = s * swing;
          joints["knee_" + side].rotation.x = Math.max(0, -s * Math.sin(phase)) * .7;
          joints["shoulder_" + side].rotation.x = -s * swing * .75;
        }
      } else if (name === "sit" || name === "tablet") {
        for (const side of ["l", "r"]) {
          joints["shoulder_" + side].rotation.x = -.35;
          joints["elbow_" + side].rotation.x = -1.22;
        }
        if (name === "sit") {
          pelvis.position.y = sitPelvis;
          for (const [side, s] of [["l", -1], ["r", 1]]) {
            joints["hip_" + side].rotation.x = -Math.PI / 2;
            joints["knee_" + side].rotation.x = Math.PI / 2 - shinOpen;   // shins forward, soles kept flat
            joints["ankle_" + side].rotation.x = shinOpen;
            joints["shoulder_" + side].rotation.set(sitArm[0], 0, s * sitArm[1]);
            joints["elbow_" + side].rotation.x = sitArm[2];
            joints["wrist_" + side].rotation.y = -s * Math.PI / 2;   // palms (inward at rest) turn down onto the controls
          }
        } else {
          tablet.visible = true; tablet.rotation.x = -.6;
          neck.rotation.x = .38;
          for (const [side, s] of [["l", -1], ["r", 1]]) {
            joints["shoulder_" + side].rotation.z = -s * .14;
            joints["elbow_" + side].rotation.x = -1.55;
          }
        }
      } else if (name === "point") {
        g.updateWorldMatrix(true, true);
        const aim = target ? (target.isVector3 ? target.clone() : new THREE.Vector3(...target)) : g.localToWorld(new THREE.Vector3(-.7, 1.4, 1));
        const shoulder = joints.shoulder_l;
        shoulder.parent.worldToLocal(aim); aim.sub(shoulder.position).normalize();
        shoulder.quaternion.setFromUnitVectors(V("elbow_l", "shoulder_l").normalize(), aim);
        joints.elbow_l.rotation.set(0, 0, 0);
      } else if (name !== "stand") throw new Error("Unknown human pose: " + name);
      // Direct legacy roots still follow the pelvis height and neck in pose().
      for (const o of controls) o.position.y += pelvis.position.y - restPelvis;
      head.position.copy(headFromNeck).applyQuaternion(neck.quaternion).add(neck.position).applyQuaternion(torso.quaternion).add(torso.position);
      head.quaternion.copy(torso.quaternion).multiply(neck.quaternion);
      g.userData.pose = name; if (!keep) deform(); return g;
    };
    g.act = (t, spec) => HUMAN_MOTION.act(g, t, spec, {R, M, joints, tips, deform});
    // Seated legs: by default the shins open forward until the soles sit SIT_DROP below the seat contact, the old
    // figure's seated height (seats in existing scenes were built for it). seatFit puts the seat contact on the seat
    // top and opens the knees until the soles reach the floor top under them (KIT.fx.seat calls it).
    const sole = () => Math.min(...feet.map(f => g.worldToLocal(f.getWorldPosition(new THREE.Vector3())).y));
    const seatY = () => g.worldToLocal(g.userData.contacts.seat.getWorldPosition(new THREE.Vector3())).y;
    // Shin opening where f, which rises with the opening, reaches 0 (the ends when it never does).
    function openTo(f, lo = 0, hi = 1.1) {
      if (f(lo) >= 0) return lo;
      if (f(hi) <= 0) return hi;
      for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; f(m) > 0 ? hi = m : lo = m; }
      return (lo + hi) / 2;
    }
    const legs = open => { for (const s of ["l", "r"]) { joints["knee_" + s].rotation.x = Math.PI / 2 - open; joints["ankle_" + s].rotation.x = open; }
      g.updateWorldMatrix(true, true); };
    // Knees up by a (radians; below 0 = thighs down), shins vertical, soles flat: the soles rise about thigh * sin(a)
    // while staying where they are front to back, the way a wheelchair user sits on a high footrest.
    const knees = a => { for (const s of ["l", "r"]) { joints["hip_" + s].rotation.x = -Math.PI / 2 - a; joints["knee_" + s].rotation.x = Math.PI / 2 + a; joints["ankle_" + s].rotation.x = 0; }
      g.updateWorldMatrix(true, true); };
    g.pose("sit", {}, true);
    shinOpen = openTo(o => { legs(o); return SIT_DROP - (seatY() - sole()); });
    {   // seated arms: shoulder pitch, shoulder spread, elbow so the palms sit where the old figure's did (Gauss-Newton)
      const miss = a => { sitArm = a; g.pose("sit", {}, true); g.updateWorldMatrix(true, true);
        const c = g.worldToLocal(g.userData.contacts.seat.getWorldPosition(new THREE.Vector3()));
        return g.worldToLocal(hands[1].getWorldPosition(new THREE.Vector3())).sub(c).sub(new THREE.Vector3(...SIT_PALM)); };
      let a = sitArm.slice();
      for (let it = 0; it < 12; it++) {
        const r0 = miss(a), Jc = [0, 1, 2].map(k => { const b = a.slice(); b[k] += 1e-4; return miss(b).sub(r0).divideScalar(1e-4); });
        const Jm = new THREE.Matrix3().set(Jc[0].x, Jc[1].x, Jc[2].x, Jc[0].y, Jc[1].y, Jc[2].y, Jc[0].z, Jc[1].z, Jc[2].z);
        if (Math.abs(Jm.determinant()) < 1e-12) break;
        const d = r0.clone().applyMatrix3(Jm.invert());
        a = [a[0] - d.x, a[1] - d.y, a[2] - d.z];
        if (d.length() < 1e-6) break;
      }
      sitArm = a;
    }
    g.seatFit = function ({seat, floor, back} = {}) {
      if (g.userData.pose !== "sit") return g;
      for (const o of [seat, floor, back]) if (o) o.updateWorldMatrix(true, true);   // a chair that moved this frame
      g.updateWorldMatrix(true, true);
      if (back) {   // slide forward (body +Z) until the back and buttocks are out of the seat back's box
        deform();
        const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), box = new THREE.Box3().setFromObject(back).applyMatrix4(inv), v = new THREE.Vector3();
        let rear = Infinity;
        for (const s of skins) if (/^(torso|pelvis)/.test(s.o.userData.rvPart)) {
          const p = s.o.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i);
            if (v.x > box.min.x && v.x < box.max.x && v.y > box.min.y && v.y < box.max.y && v.z < rear) rear = v.z; }
        }
        if (rear < box.max.z + .003) {
          const w = new THREE.Vector3(0, 0, box.max.z + .003 - rear).applyMatrix4(g.matrixWorld), o = new THREE.Vector3().applyMatrix4(g.matrixWorld);
          g.position.add(g.parent ? g.parent.worldToLocal(w).sub(g.parent.worldToLocal(o)) : w.sub(o)); g.updateWorldMatrix(true, true);
        }
      }
      const down = new THREE.Vector3(0, -1, 0).transformDirection(g.matrixWorld), k = g.matrixWorld.getMaxScaleOnAxis(), ray = new THREE.Raycaster();
      const below = (root, p, reach) => {   // first surface of root under p within reach, as a world point
        ray.set(p, down); ray.far = reach;
        const hit = ray.intersectObject(root, true).find(h => h.object.isMesh && h.object.visible);
        return hit ? hit.point : null;
      };
      if (seat) {
        const c = g.userData.contacts.seat.getWorldPosition(new THREE.Vector3()), top = below(seat, c.clone().addScaledVector(down, -.25 * k), .6 * k);
        if (top) {
          const move = g.parent ? g.parent.worldToLocal(top.clone()).sub(g.parent.worldToLocal(c.clone())) : top.clone().sub(c);
          g.position.add(move); g.updateWorldMatrix(true, true);
        }
      }
      if (floor) {   // f = how far the floor top lies below the lower sole, body metres (rises as the shins open)
        const f = () => Math.min(...feet.map(o => { const p = o.getWorldPosition(new THREE.Vector3()), q = below(floor, p.clone().addScaledVector(down, -.35 * k), .9 * k);
          return q ? q.sub(p).dot(down) / k : Infinity; }));
        const KNEES = [-.25, .75], at = a => { knees(a); return f(); };
        const solve = (lo, hi) => { if (at(lo) >= 0) return lo; if (at(hi) <= 0) return hi; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; at(m) > 0 ? hi = m : lo = m; } return (lo + hi) / 2; };
        // f rises with a; f(a) = 0 puts the lower sole on the floor top. A floor out of reach keeps the nearest end.
        knees(solve(...KNEES));
      }
      deform(); return g;
    };
    g.pose("stand"); g.visible = false; scene.add(g);
    live.push({reset() { g.visible = false; }}); return g;
  }
  // 앞 물체: 카메라 가까이 스치는 세운 기둥(피사계 심도로 흐려져 깊이감). 보일 때만 visible
  function prop(scene, {r = 0.07, h = 4, color = 0x9aa3a9} = {}) {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), new THREE.MeshStandardMaterial({color, roughness: 0.35, metalness: 0.9}));
    o.position.y = h / 2; o.castShadow = true; o.visible = false; o.userData.rvProp = true;   // rvProp: look.js 주인공 고르기에서 빠짐(일부러 흐리는 앞 물체)
    scene.add(o); live.push({reset() { o.visible = false; }}); return o;
  }
  // 강조 모드(구성 · 뺄셈): script.json scenes[].look = "relief" | "clean" 이면 합성기가 emphasis.mode 를 켜고, 본 화면 렌더를 wrap 이 감쌌다
  //   relief: 주제만 원래 재질, 나머지는 밝은 클레이(모양만 남고 색·질감 빠짐) + 밝은 배경 · clean: relief + fx.env 로 등록한 환경(챔버) 숨김 + 바닥 그림자만
  //   주제 = 강조색(#F2A33A 근처) 재질을 쓴 물체(말하는 순간 강조가 곧 주제) + 그 프레임에 fx.focus(obj) 로 더한 것과 그 자식
  const ACCENT = new THREE.Color(0xF2A33A), EMB = {relief: 0xE6EAEC, clean: 0xEEF1F2};   // 바탕은 밝게, 클레이는 한 단 어둡게 → 흰 주제가 밝기 대비로 앞에 섬
  const emphasis = {mode: null, extra: new Set(), env: new Set(), clay: new Map(), catcher: null,
    active() { return !!this.mode; },
    isFocus(o) { for (let x = o; x; x = x.parent) if (this.extra.has(x)) return true;
      const m = o.material; return !!(m && m.color && Math.abs(m.color.r - ACCENT.r) + Math.abs(m.color.g - ACCENT.g) + Math.abs(m.color.b - ACCENT.b) < 0.12); },
    clayFor(m) { let c = this.clay.get(m); if (!c) { c = new THREE.MeshStandardMaterial({color: 0xB9C0C5, roughness: 0.9, metalness: 0.0, envMapIntensity: 0.6});
      c.clippingPlanes = m.clippingPlanes; c.clipShadows = m.clipShadows; c.side = m.side; this.clay.set(m, c); } c.clippingPlanes = m.clippingPlanes;
      c.transparent = !!m.transparent; c.opacity = m.transparent ? m.opacity : 1; c.depthWrite = m.depthWrite !== false; c.visible = m.visible; return c; },   // a fading part stays faded in clay; a material look.js switched off for the SAO passes stays off
    wrap(s, c, raw) {
      const swapped = [], hidden = [], bg = s.background, fog = s.fog, env = s.environment;
      s.traverse(o => { if (!o.isMesh || !o.visible || o.material.isMeshBasicMaterial || o.material.isShadowMaterial || this.isFocus(o)) return;
        swapped.push([o, o.material]); o.material = Array.isArray(o.material) ? o.material.map(m => this.clayFor(m)) : this.clayFor(o.material); });
      if (this.mode === "clean") { for (const e of this.env) if (e.visible) { e.visible = false; hidden.push(e); }
        if (!this.catcher) { this.catcher = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({opacity: 0.22})); this.catcher.rotation.x = -Math.PI / 2; this.catcher.receiveShadow = true; s.add(this.catcher); }
        this.catcher.visible = true; }
      s.background = new THREE.Color(EMB[this.mode] || EMB.relief); const fz = (c.userData && c.userData.focus) || 5; s.fog = this.mode === "relief" ? new THREE.Fog(EMB.relief, fz + 1.5, fz + 14) : null;   // 먼 배경은 바탕색으로 녹고 가까운 주제만 대비가 남음(뺄셈)
      try { raw(s, c); } finally {
        for (const [o, m] of swapped) o.material = m; for (const e of hidden) e.visible = true;
        if (this.catcher) this.catcher.visible = false; s.background = bg; s.fog = fog; s.environment = env; }
    }};
  live.push({reset() { emphasis.extra.clear(); }});
  // 접촉 계약은 render(t) 안에서 매번 선언한다. 이전 장면의 계약을 다음 프레임에 남기지 않는다.
  const clearance = {attachments: [], seats: []};
  // Default entrance for a 3D element: KIT.fx.reveal(obj, KIT.win(t, a, b, 0.4)) fades it in while u goes 0 -> 1
  // (hidden at 0, own materials at 1). Geometry and pose stay as they are, so contact and clearance checks see the
  // real part. Call it after the scene assigns materials for the frame. Switching obj.visible on in one frame is a
  // pop (check_motion POP_IN).
  // Copies are kept per mesh, so meshes that share a material can fade at different times.
  const revealCopies = new WeakMap(), revealOriginal = new WeakMap(), pulseBase = new WeakMap(), pulseCopies = new WeakMap();
  const ownOf = m => { for (let x = revealOriginal.get(m) || pulseBase.get(m); x; x = revealOriginal.get(m) || pulseBase.get(m)) m = x; return m; };
  function reveal(obj, u) {
    const k = smooth(0, 1, clamp(u, 0, 1));
    obj.visible = k > 0;
    obj.traverse(o => {
      if (!o.material) return;
      let copies = revealCopies.get(o);
      const fade = m => {
        const own = ownOf(m);
        if (k >= 1) return own;
        if (!copies) revealCopies.set(o, copies = new Map());
        let copy = copies.get(own);
        if (!copy) { copy = own.clone(); copies.set(own, copy); revealOriginal.set(copy, own); }
        copy.color && own.color && copy.color.copy(own.color);
        copy.transparent = true; copy.opacity = own.opacity * k; copy.depthWrite = own.depthWrite && k > .5;
        return copy;
      };
      o.material = Array.isArray(o.material) ? o.material.map(fade) : fade(o.material);
    });
    return obj;
  }
  // Emphasis that keeps moving while text is on screen (TEXT_MOTION): KIT.fx.pulse(obj, t, {on: KIT.win(t, a, b, 0.4)})
  // lights obj's meshes in the accent colour, breathing 0 -> amount -> 0 every period seconds (emissive, no geometry
  // change, so contact checks see the real part). on (0..1) scales it, so it fades in and out instead of switching on.
  // Call it every render, after KIT.fx.reveal. Materials without emissive (MeshBasic) are left as they are.
  const accent = new THREE.Color();
  function pulse(obj, t, {on = 1, period = 1.6, amount = .55, color = 0xF2A33A} = {}) {
    const k = clamp(on, 0, 1) * amount * (.5 - .5 * Math.cos(2 * Math.PI * t / period));
    accent.set(color);
    obj.traverse(o => {
      if (!o.isMesh || !o.material) return;
      let copies = pulseCopies.get(o);
      const light = m => {
        const base = pulseBase.get(m) || m;
        if (k < 1e-3 || !base.emissive) return base;
        if (!copies) pulseCopies.set(o, copies = new Map());
        let copy = copies.get(base);
        if (!copy) { copy = base.clone(); copies.set(base, copy); pulseBase.set(copy, base); }
        copy.color && base.color && copy.color.copy(base.color).lerp(accent, .5 * k);   // tint too: glow alone is lost on white parts
        copy.transparent = base.transparent; copy.opacity = base.opacity; copy.depthWrite = base.depthWrite;
        copy.emissive.copy(base.emissive).lerp(accent, k); copy.emissiveIntensity = Math.max(1, base.emissiveIntensity || 0);
        return copy;
      };
      o.material = Array.isArray(o.material) ? o.material.map(light) : light(o.material);
    });
    return obj;
  }
  // 배경 장식 선언: 일부러 카드 뒤에 깔거나 흐리게 둔 물체는 check_layout 의 가림·잘림(cut) 대상에서 빠진다.
  const decor = (...objs) => { for (const o of objs) if (o) o.userData.rvDecor = true; return objs[0]; };
  const fx = {cutaway, explode, human, prop, emphasis, reveal, pulse, decor, focus(...objs) { for (const o of objs) if (o) emphasis.extra.add(o); }, env(...objs) { for (const o of objs) if (o) emphasis.env.add(o); },
    clearance,
    attach(part, support, {tol_mm = 2} = {}) { clearance.attachments.push({part, support, tol_mm}); },
    seat(human, {seat, floor, back, levers = [], hand_mm = 150, up = [0, 1, 0]} = {}) {
      if (human && human.seatFit) human.seatFit({seat, floor, back});   // a seated KIT human sits on the seat top, soles on the floor
      clearance.seats.push({human, seat, floor, levers, hand_mm, up}); },
    reset() { clearance.attachments.length = 0; clearance.seats.length = 0; for (const x of live) x.reset(); }};

  // Merge assigned helper overrides into the stable object so unrelated effect hooks remain available.
  // An override replaces matching functions without removing the compositor's emphasis and reset APIs.
  const K = {clamp, smooth, win, wordT, lineSpan, label, sign, rng, camAt, camSet, shot, shotAt, easeEnds, info, fx};
  Object.defineProperty(window, "KIT", {configurable: true, get: () => K, set: v => { Object.assign(K, v); }});
})();
