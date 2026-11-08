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
  function numCard(ov, o) {
    const n = source(o.id), val = n ? n.show[o.i || 0] : "?";
    const cardBox = document.createElement("div");
    cardBox.dataset.rvCue = "tone";   // lib/cues.py: 카드가 나타나는 순간 짧은 톤
    cardBox.style.cssText = `position:absolute;left:${o.left ?? 80}px;top:${o.top ?? 160}px;background:${PANEL};border-left:8px solid ${ACC};padding:22px 34px 20px;opacity:0;font-family:var(--ui)`;
    cardBox.innerHTML = `<div style="font:700 ${TYPE.num}px/1 var(--ui);color:${ACC};letter-spacing:-2px">${val}</div>` +
      (o.caption ? `<div style="font:700 ${TYPE.body}px/1.3 var(--ui);color:${INK};margin-top:12px">${o.caption}</div>` : "") +
      (o.sub ? `<div style="font:600 ${TYPE.tag + 4}px/1.3 var(--ui);color:${INK};margin-top:6px">${o.sub}</div>` : "") +
      `<div style="font:500 ${TYPE.tag}px/1.3 var(--ui);color:${MUTE};margin-top:12px">${n && n.kind === "fetched" ? "출처: " + n.src : "설계 목표"}</div>`;
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
  // +Y 위, +Z 정면. h 는 맨머리 키(8등신), 안전모는 그 위에 쓴다. 모든 자세는 이전 프레임과 무관하다.
  // human(scene,h,color,{site,suit}) 또는 human(scene,h,{site,color,suit}); 예전 세 인수 호출도 그대로.
  function human(scene, h = 1.75, color = 0x2a3238, opts = {}) {
    if (color && typeof color === "object" && !color.isColor) { opts = color; color = opts.color ?? 0x2a3238; }
    const site = opts.site || window.SITE || "construction", clean = site === "lab" && opts.suit === "cleanroom";
    const g = new THREE.Group(), body = new THREE.Group(), joints = {};
    g.scale.setScalar(h / 1.75); g.add(body);
    g.userData.rvHuman = true; g.userData.site = site;
    const mat = c => new THREE.MeshStandardMaterial({color: c, roughness: 0.82, metalness: 0});
    const cloth = mat(clean ? 0xe2e9eb : color), skin = mat(0xb68a70), boot = mat(0x242b30);
    const glove = mat(site === "office" ? 0xb68a70 : clean ? 0xd4dfe3 : 0x69777a);
    const trim = mat(0xbfcbd1), hi = mat(0xe9ad25), helmet = mat(site === "lab" ? 0xf0f2ec : 0xefbd35);
    function mesh(parent, part, geo, material, x = 0, y = 0, z = 0) {
      const o = new THREE.Mesh(geo, material); o.position.set(x, y, z);
      o.userData.rvPart = part; o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
    }
    function oval(parent, part, material, x, y, z, rx, ry, rz) {
      const o = mesh(parent, part, new THREE.SphereGeometry(1, 20, 14), material, x, y, z);
      o.scale.set(rx, ry, rz); return o;
    }
    function pivot(parent, name, x, y, z) {
      const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); parent.add(o); joints[name] = o; return o;
    }
    function limb(parent, part, length, radius, material) {
      return mesh(parent, part, new THREE.CapsuleGeometry(radius, length - 2 * radius, 6, 16), material, 0, -length / 2);
    }
    const pelvis = pivot(body, "pelvis", 0, .94, 0);
    oval(pelvis, "pelvis", cloth, 0, 0, 0, .168, .13, .105);
    const torso = pivot(pelvis, "spine", 0, .08, 0);
    const profile = [[.128,0],[.139,.05],[.15,.16],[.187,.31],[.19,.38],[.165,.425],[.072,.45]];
    const chest = mesh(torso, "torso", new THREE.LatheGeometry(profile.map(([r,y]) => new THREE.Vector2(r,y)), 24), cloth);
    chest.scale.z = .63;
    // Front seam, collar and pockets follow the jacket, not the world.
    mesh(torso, "torso", new THREE.BoxGeometry(.009,.34,.008), trim, 0,.21,.105);
    for (const s of [-1,1]) {
      const collar = mesh(torso, "torso", new THREE.BoxGeometry(.068,.045,.018), cloth, s*.046,.414,.055);
      collar.rotation.z=s*.35;
      mesh(torso, "torso", new THREE.BoxGeometry(.072,.069,.015), cloth, s*.092,.29,.115);
    }
    const neck = pivot(torso, "neck", 0, .46, 0);
    limb(neck, "head", .09, .045, clean ? cloth : skin).position.y = .025;
    const head = pivot(neck, "head", 0, .155, 0);
    // Narrow chin, jaw, cheek and cranium: a contour rather than a ball, without facial features.
    const skull = [[.042,-.105],[.062,-.092],[.081,-.057],[.093,-.012],[.095,.043],[.078,.091],[.035,.11],[0,.114]];
    const face = mesh(head, "head", new THREE.LatheGeometry(skull.map(([r,y])=>new THREE.Vector2(r,y)),24), skin,0,0,.008);
    face.scale.z = .87;
    for (const s of [-1,1]) oval(head,"head",skin,s*.094,-.015,0,.014,.026,.016);
    if (clean) {
      // Hood leaves the face opening visible; the rear shell covers hair/ears and joins the collar.
      const hood = mesh(head,"head",new THREE.SphereGeometry(.106,24,16,0,Math.PI),cloth,0,.002,-.009);
      hood.rotation.y=Math.PI; hood.scale.set(1,1.12,1);
    }
    if (site !== "office") {
      const cap = mesh(head,"head",new THREE.SphereGeometry(.116,24,12,0,Math.PI*2,0,Math.PI/2),helmet,0,.051,0);
      cap.scale.y=.72;
      mesh(head,"head",new THREE.CylinderGeometry(.126,.126,.014,32),helmet,0,.052,.008);
      mesh(head,"head",new THREE.BoxGeometry(.028,.025,.15),helmet,0,.129,0);
    } else {
      const hair=mesh(head,"head",new THREE.SphereGeometry(.097,20,12,0,Math.PI*2,0,1.25),boot,0,.025,0);
      hair.scale.z=.9;
    }
    if (site === "construction") {
      const vest = mesh(torso,"torso",new THREE.LatheGeometry([[.145,.04],[.16,.18],[.199,.32],[.198,.38]].map(([r,y])=>new THREE.Vector2(r,y)),24),hi);
      vest.scale.z=.65;
      for (const y of [.13,.2]) {
        const band=mesh(torso,"torso",new THREE.CylinderGeometry(y===.13?.159:.175,y===.13?.159:.175,.026,24,1,true),trim,0,y,0);
        band.scale.z=.66;
      }
      for (const s of [-1,1]) mesh(torso,"torso",new THREE.BoxGeometry(.027,.17,.012),trim,s*.108,.31,.125);
    }
    const feet=[], hands=[];
    function marker(parent,x,y,z) { const o=new THREE.Object3D();o.position.set(x,y,z);parent.add(o);return o; }
    for (const [side,s] of [["l",-1],["r",1]]) {
      const shoulder=pivot(torso,"shoulder_"+side,s*.205,.405,0);
      limb(shoulder,"upperarm_"+side,.29,.057,cloth);
      oval(shoulder,"upperarm_"+side,cloth,0,-.018,0,.065,.069,.067);
      const elbow=pivot(shoulder,"elbow_"+side,0,-.29,0);
      oval(elbow,"forearm_"+side,cloth,0,0,0,.046,.053,.047);
      limb(elbow,"forearm_"+side,.265,.045,cloth);
      const wrist=pivot(elbow,"wrist_"+side,0,-.265,0);
      oval(wrist,"hand_"+side,glove,0,0,0,.028,.032,.025);
      oval(wrist,"hand_"+side,glove,0,-.041,.007,.038,.052,.023);
      // Four joined fingers with rounded tips, and a separate opposed thumb.
      for (let i=0;i<4;i++) {
        const finger=mesh(wrist,"hand_"+side,new THREE.CapsuleGeometry(.008,.032,4,8),glove,(i-1.5)*.017,-.087,.008);
        finger.rotation.x=-.15;
      }
      const thumb=mesh(wrist,"hand_"+side,new THREE.CapsuleGeometry(.011,.031,4,8),glove,-s*.039,-.04,.022);
      thumb.rotation.z=-s*.65;
      hands.push(marker(wrist,0,-.041,.03));
      const hip=pivot(pelvis,"hip_"+side,s*.095,-.04,0);
      limb(hip,"thigh_"+side,.42,.076,cloth);
      const knee=pivot(hip,"knee_"+side,0,-.42,0);
      oval(knee,"shin_"+side,cloth,0,0,0,.062,.069,.066);
      limb(knee,"shin_"+side,.39,.056,cloth);
      const ankle=pivot(knee,"ankle_"+side,0,-.39,0);
      oval(ankle,"foot_"+side,boot,0,-.04,.046,.061,.05,.125);
      limb(ankle,"foot_"+side,.12,.055,boot).position.y=.008;
      feet.push(marker(ankle,0,-.09,.046));
      if (site !== "office") {
        mesh(elbow,"forearm_"+side,new THREE.CylinderGeometry(.046,.046,.025,16),trim,0,-.225,0);
        mesh(knee,"shin_"+side,new THREE.CylinderGeometry(.058,.058,.026,16),trim,0,-.31,0);
      }
    }
    const tablet=mesh(torso,"torso",new THREE.BoxGeometry(.24,.16,.014),boot,0,.21,.37);
    mesh(tablet,"torso",new THREE.BoxGeometry(.213,.131,.003),mat(0x588695),0,0,.009);
    g.userData.contacts={seat:marker(pelvis,0,-.13,0),feet,hands};
    // Old scenes address children[0..5]: head, torso, left leg/arm, right leg/arm.
    // Keep the actual part/joint roots there, with hip/shoulder rotation centres.
    const controls=[head,torso,joints.hip_l,joints.shoulder_l,joints.hip_r,joints.shoulder_r];
    for (const o of controls) g.attach(o);
    g.remove(body);g.add(body);
    const rest=controls.map(o=>o.position.clone());
    // The target of point is a world-space Vector3 (or [x,y,z]).
    g.pose = function(name, {t = 0, target} = {}) {
      for (const o of Object.values(joints)) o.rotation.set(0,0,0);
      controls.forEach((o,i)=>o.position.copy(rest[i]));
      pelvis.position.y=.94; tablet.visible=false;
      for (const [side,s] of [["l",-1],["r",1]]) {
        joints["shoulder_"+side].rotation.z=s*.075;
        joints["elbow_"+side].rotation.x=-.08;
      }
      if (name === "walk") {
        const phase=t*Math.PI*2, swing=Math.sin(phase)*.48;
        pelvis.position.y+=.018*(1-Math.cos(phase*2));
        for (const [side,s] of [["l",-1],["r",1]]) {
          joints["hip_"+side].rotation.x=s*swing;
          joints["knee_"+side].rotation.x=Math.max(0,-s*Math.sin(phase))*.7;
          joints["shoulder_"+side].rotation.x=-s*swing*.75;
        }
      } else if (name === "sit" || name === "tablet") {
        for (const side of ["l","r"]) {
          joints["shoulder_"+side].rotation.x=-.35;
          joints["elbow_"+side].rotation.x=-1.22;
        }
        if (name === "sit") {
          pelvis.position.y=.55;
          for (const [side,s] of [["l",-1],["r",1]]) {
            joints["hip_"+side].rotation.x=-Math.PI/2;
            joints["knee_"+side].rotation.x=Math.PI/2;
            joints["shoulder_"+side].rotation.set(.12,0,s*.2);
            joints["elbow_"+side].rotation.x=-1.35;
            joints["wrist_"+side].rotation.y=Math.PI;
          }
        } else {
          tablet.visible=true;tablet.rotation.x=-.6;
          neck.rotation.x=.38;
          for (const [side,s] of [["l",-1],["r",1]]) {
            joints["shoulder_"+side].rotation.z=-s*.14;
            joints["elbow_"+side].rotation.x=-1.55;
          }
        }
      } else if (name === "point") {
        g.updateWorldMatrix(true,true);
        const aim=target ? (target.isVector3 ? target.clone() : new THREE.Vector3(...target)) : g.localToWorld(new THREE.Vector3(-.7,1.4,1));
        const shoulder=joints.shoulder_l;
        shoulder.parent.worldToLocal(aim);aim.sub(shoulder.position).normalize();
        shoulder.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),aim);
        joints.elbow_l.rotation.set(0,0,0);
      } else if (name !== "stand") throw new Error("Unknown human pose: "+name);
      // Direct legacy roots still follow the pelvis height and neck in pose().
      for (const o of controls) o.position.y+=pelvis.position.y-.94;
      head.position.set(0,.155,0).applyQuaternion(neck.quaternion).add(neck.position).add(torso.position);
      head.quaternion.copy(neck.quaternion);
      g.userData.pose=name;g.updateWorldMatrix(true,true);return g;
    };
    g.pose("stand"); g.visible=false; scene.add(g);
    live.push({reset() { g.visible=false; }}); return g;
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
      c.transparent = !!m.transparent; c.opacity = m.transparent ? m.opacity : 1; c.depthWrite = m.depthWrite !== false; return c; },   // a fading part stays faded in clay
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
    seat(human, {seat, floor, levers = [], hand_mm = 150, up = [0, 1, 0]} = {}) {
      clearance.seats.push({human, seat, floor, levers, hand_mm, up}); },
    reset() { clearance.attachments.length = 0; clearance.seats.length = 0; for (const x of live) x.reset(); }};

  // Merge assigned helper overrides into the stable object so unrelated effect hooks remain available.
  // An override replaces matching functions without removing the compositor's emphasis and reset APIs.
  const K = {clamp, smooth, win, wordT, lineSpan, label, rng, camAt, camSet, shot, shotAt, easeEnds, info, fx};
  Object.defineProperty(window, "KIT", {configurable: true, get: () => K, set: v => { Object.assign(K, v); }});
})();
