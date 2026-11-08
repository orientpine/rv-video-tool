/* look.js — 실사 렌더 단계(2단계 "그림"). script.json 에 "look" 이 있을 때만 실린다(없으면 예전 그림 그대로 = 하위 호환).
 *
 *   "look": "cinema"                      기본 묶음
 *   "look": {"preset":"cinema", "dof": {"aperture": 0.00012}, "mb": {"samples": 0}, ...}   항목별로 덮어쓰기
 *   RV_LOOK=off rv still ...               (환경 변수) 이번 빌드만 끄기 — 미리보기·비교용
 *
 * 하는 일(장면 모듈은 고치지 않는다): 장면이 화면에 R.render(scene, camera) 를 부르면 가로채서
 *   1) 선형 HDR 렌더 타깃(MSAA 4)에 그리고
 *   2) SAO  접촉 그림자(물체가 바닥·받침에 앉게)
 *   3) DOF  피사계 심도 — 초점 = camera.userData.focus(m) 또는 화면 가운데 광선이 처음 닿는 곳
 *   4) Bloom 밝은 조명만 살짝 번짐
 *   5) Grade ACES 톤 매핑(R.toneMappingExposure) · 대비 · 채도 · 그림자/밝은 곳 색 · 비네트 · 결정론 필름 결
 *   6) 모션 블러는 shell.html 의 renderAt 가 셔터 안 시각 여러 개를 그려 LOOK 이 평균한다(mb.samples).
 * 가위(scissor) 를 켠 렌더(확대 상자)·렌더 타깃 렌더는 가로채지 않는다 → 확대 상자는 예전처럼 위에 그려진다.
 * 결정론: 모든 값이 t(또는 프레임 번호)만의 함수. Math.random 없음.
 */
(function () {
  const PRESETS = {
    cinema: {
      ao: {intensity: 0.012, scale: 1.0, kernelRadius: 8, minResolution: 0, blur: true, blurRadius: 4, blurStdDev: 2, bias: 0.5, fade: [40, 80]},   // 커널 16·흐림 8 은 흰 몸체에 얼룩을 번지게 해 주인공 세부 −14% → 8·4   // fade: 이 거리(m)부터 AO 를 줄여 끝에서 0 (접촉 그림자는 가까운 것만)
      dof: {k: 0.004, maxblur: 0.007, autofocus: true, subjectTol: 1.0},   // subjectTol: 주인공 앞뒤 끝 흐림 상한(px) → 조리개를 조임   // 조리개 = k / 초점² : 가까이 찍을수록 얕은 심도(실제 렌즈처럼), 먼 전경은 거의 다 또렷
      bloom: {strength: 0.22, radius: 0.5, threshold: 0.92},
      grade: {exposure: 1.12, contrast: 1.05, saturation: 1.1, shadows: [0.98, 1.0, 1.025], highlights: [1.035, 1.0, 0.965], vignette: 0.18, grain: 0.01},
      mb: {samples: 8, shutter: 1.0, weights: "flat", outdoor: {shutter: 0.5}},   // outdoor: 벽(챔버 같은 안쪽을 보는 면)이 없는 장면은 셔터 0.5 → 번짐 절반(깜빡임 0곳 확인). envOf 참고. weights: flat | tent | 숫자 p (tent·p 는 회전 부품 고리가 깜빡여 기본 안 함)     // 셔터 = 프레임 간격 비율. 0.5(180°)는 프레임 사이 노출 빈틈 → 회전 부품 고리 같은 주기 무늬가 반짝임(측정 예: 53.4 s 3곳), 1.0 연속 노출이면 0곳
      msaa: 4,                            // 렌더 타깃 다중 표본(가는 줄무늬가 움직일 때 반짝임 줄임)     // 셔터 = 프레임 간격의 비율(180° 셔터 = 0.5)
    },
  };
  const merge = (a, b) => { const o = JSON.parse(JSON.stringify(a)); for (const k in b || {}) o[k] = (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) ? Object.assign({}, o[k], b[k]) : b[k]; return o; };

  const GradeShader = {
    uniforms: {tDiffuse: {value: null}, exposure: {value: 1}, contrast: {value: 1}, saturation: {value: 1},
      shadows: {value: new THREE.Vector3(1, 1, 1)}, highlights: {value: new THREE.Vector3(1, 1, 1)},
      vignette: {value: 0}, grain: {value: 0}, seed: {value: 0}},
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float exposure, contrast, saturation, vignette, grain, seed;
      uniform vec3 shadows, highlights; varying vec2 vUv;
      // three r147 ACESFilmicToneMapping 과 같은 식 (renderer 가 화면에 직접 그릴 때와 같은 밝기)
      vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
      vec3 aces(vec3 c){
        const mat3 I = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
        const mat3 O = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
        c *= exposure/0.6; c = I*c; c = RRTAndODTFit(c); c = O*c; return clamp(c,0.0,1.0); }
      vec3 toSRGB(vec3 c){ return mix(pow(c, vec3(0.41666))*1.055-vec3(0.055), c*12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
      float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)+seed); p += dot(p, p+45.32); return fract(p.x*p.y); }
      void main(){
        vec3 c = aces(texture2D(tDiffuse, vUv).rgb);
        float l = dot(c, vec3(0.2126,0.7152,0.0722));
        c = mix(vec3(l), c, saturation);                       // 채도
        c *= mix(shadows, highlights, smoothstep(0.1, 0.8, l)); // 그림자 차갑게 · 밝은 곳 따뜻하게(한 분위기)
        c = (c-0.5)*contrast+0.5;                              // 대비(톤 매핑 뒤, 중간 회색 기준)
        vec2 d = vUv-0.5; c *= 1.0 - vignette*smoothstep(0.35, 0.85, length(d*vec2(1.0,0.75))*1.4);
        c = clamp(c, 0.0, 1.0);
        vec3 s = toSRGB(c);
        s += (hash(gl_FragCoord.xy)-0.5)*grain;                // 결정론 필름 결(seed = 프레임 번호)
        gl_FragColor = vec4(s, 1.0); }`,
  };
  const AccumShader = {   // 모션 블러: 하위 프레임을 1/N 씩 더한다
    uniforms: {tDiffuse: {value: null}, weight: {value: 1}},
    vertexShader: GradeShader.vertexShader,
    fragmentShader: "uniform sampler2D tDiffuse; uniform float weight; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb*weight, weight); }",
  };

  let lastScene = null, lastCamera = null;
  let R, cfg, composer, hdrRT, accRT, renderPass, sao, bokeh, bloom, grade, accQuad, accMat, copyPass, raw, inAccum = null;
  const ray = new THREE.Raycaster(), center = new THREE.Vector2(0, 0);

  // Subject (focus target). Before 2026-11-05 the focus was the first hit of a ray through the screen centre:
  // with the machine off-centre that was the ground behind it, so the machine itself went soft.
  // Order: focus the scene set itself (o.focus / hand-set userData.focus) > declared subject (KIT.fx.focus(obj),
  // scene.userData.subject) > nearest large solid object around the centre > camSet look-at distance > centre ray.
  const box = new THREE.Box3(), cv = new THREE.Vector3();
  const solid = m => [].concat(m.material).some(x => x && !x.isMeshBasicMaterial && !x.isShadowMaterial && !x.isLineBasicMaterial && !(x.transparent && x.opacity < 0.5));
  const shown = o => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  function extent(objs, camera) {   // view depth range + clipped NDC rect of the objects' solid meshes
    let near = Infinity, far = -Infinity, x0 = 1, x1 = -1, y0 = 1, y1 = -1, any = false;
    for (const o of objs) o.traverse(m => {
      if (!m.isMesh || !shown(m) || !solid(m) || m.userData.rvProp) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
      for (let i = 0; i < 8; i++) {
        cv.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(camera.matrixWorldInverse);
        const d = -cv.z; if (d <= camera.near) continue;
        any = true; near = Math.min(near, d); far = Math.max(far, d);
        cv.applyMatrix4(camera.projectionMatrix);
        x0 = Math.min(x0, cv.x); x1 = Math.max(x1, cv.x); y0 = Math.min(y0, cv.y); y1 = Math.max(y1, cv.y);
      }
    });
    if (!any) return null;
    x0 = Math.max(x0, -1); x1 = Math.min(x1, 1); y0 = Math.max(y0, -1); y1 = Math.min(y1, 1);
    return {near, far, area: Math.max(0, x1 - x0) * Math.max(0, y1 - y0) / 4, rect: [x0, y0, x1, y1]};
  }
  function autoSubject(scene, camera) {   // nearest large solid object overlapping the central half of the frame
    let best = null;
    const visit = (o, depth) => {
      if (!o.visible || o.isLight || o.isCamera || o.userData.rvProp || o.userData.rvEnv) return;
      const e = extent([o], camera); if (!e) return;
      const sz = box.setFromObject(o).getSize(new THREE.Vector3()).length() / 2, dist = box.distanceToPoint(camera.position);
      const ext = box.getSize(new THREE.Vector3()), lo = Math.min(ext.x, ext.y, ext.z), hi = Math.max(ext.x, ext.y, ext.z);
      if (hi > 2 && lo < 0.05 * hi) return;   // flat layer on the ground (tracks, decals, height-map patch) is not a subject
      if (dist <= 0 || sz > 40 || sz > 3 * Math.max(dist, 0.1)) {   // environment-sized (ground, chamber, world root): look inside
        if (depth < 3) for (const c of o.children) visit(c, depth + 1); return; }
      const c = e.rect, central = c[0] < 0.5 && c[2] > -0.5 && c[1] < 0.5 && c[3] > -0.5;
      if (!central || e.area < 0.04) return;
      if (!best || e.near < best.e.near) best = {o, e};
    };
    for (const c of scene.children) visit(c, 0);
    return best;
  }
  // indoor = the set has walls: a solid inward-facing (BackSide/DoubleSide) mesh 2..60 m across, e.g. a room around a machine.
  // Content, not camera position: a scene may start with the camera outside the BackSide wall and fly in.
  // script.json "site" wins: construction -> outdoor, lab/office -> indoor. shell.html asks once per scene (at its t = 0)
  function envOf(scene) {
    const site = window.SITE && (window.SITE.site || window.SITE);
    if (site === "construction") return "outdoor";
    if (site === "lab" || site === "office") return "indoor";
    let walls = false;
    const visit = (o, depth) => { if (walls || !o.visible) return;
      if (o.isMesh && solid(o) && [].concat(o.material).some(m => m.side !== THREE.FrontSide)) {
        box.setFromObject(o); const s = box.getSize(new THREE.Vector3());
        if (Math.min(s.x, s.y, s.z) > 2 && Math.max(s.x, s.y, s.z) <= 60) walls = true; }
      if (depth < 4) for (const c of o.children) visit(c, depth + 1); };
    for (const c of scene.children) visit(c, 0);
    return walls ? "indoor" : "outdoor";
  }
  // What the narration explains: visible KIT.label boxes on this camera (opts.target, else the label's 3D point).
  // Measured at t=33: auto picked the foreground bearing block (1.7 m) while the labelled X sensor went soft.
  const lray = new THREE.Raycaster(), lv = new THREE.Vector3();
  function pointTarget(scene, camera, world) {   // the solid mesh a label's 3D point sits on: first hit along camera -> point, within 10 % of the distance
    lv.copy(world).sub(camera.position); const dist = lv.length(); if (dist < 1e-6) return null;
    lray.set(camera.position, lv.normalize()); lray.far = dist * 1.1;
    const h = lray.intersectObjects(scene.children, true).find(h => h.object.isMesh && shown(h.object) && solid(h.object) && !h.object.userData.rvProp);
    return h && Math.abs(h.distance - dist) < 0.1 * dist ? h.object : null;
  }
  function labelSubject(scene, camera) {
    const L = (window.__KIT_LABELS || []).filter(l => l.camera === camera && l.box && l.box.offsetParent !== null && +(l.box.style.opacity || 1) > 0.3);   // offsetParent: hidden scene overlays too
    if (!L.length) return null;
    const tg = L.map(l => l.target || pointTarget(scene, camera, l.world)).filter(o => o && shown(o)), e = tg.length ? extent(tg, camera) : null;
    if (e) return {o: tg, e, from: "label"};
    const d = L.map(l => -cv.copy(l.world).applyMatrix4(camera.matrixWorldInverse).z).filter(x => x > camera.near);
    if (!d.length) return null;
    return {o: [], e: {near: Math.min(...d), far: Math.max(...d)}, from: "label"};
  }
  function focusOf(scene, camera) {
    const ud = camera.userData || {};
    LOOK.subject = null;
    if (ud.focus && ud.focusFrom !== "look") return {f: ud.focus, from: "scene"};
    const fx = window.KIT && KIT.fx && KIT.fx.emphasis, dec = [...(fx ? fx.extra : []), ...[].concat(scene.userData.subject || [])].filter(shown);
    let s = dec.length ? {o: dec, e: extent(dec, camera), from: "declared"} : null;
    if (!s || !s.e) s = labelSubject(scene, camera);
    if (!s || !s.e) { const a = autoSubject(scene, camera); s = a ? {o: [a.o], e: a.e, from: "auto"} : null; }
    if (s && s.e) { LOOK.subject = s.o.length ? s.o : null; return {f: (s.e.near + s.e.far) / 2, half: (s.e.far - s.e.near) / 2, from: s.from}; }
    if (ud.focus) return {f: ud.focus, from: "look"};
    ray.setFromCamera(center, camera);
    const hit = ray.intersectObjects(scene.children, true).find(h => h.object.visible && h.object.isMesh && h.distance > camera.near);
    return {f: hit ? hit.distance : 8, from: "ray"};
  }

  function install(renderer, options) {
    R = renderer; cfg = merge(PRESETS[(options && options.preset) || "cinema"] || PRESETS.cinema, options || {});
    const W = 1920, H = 1080;
    const mk = () => new THREE.WebGLRenderTarget(W, H, {type: THREE.HalfFloatType, samples: cfg.msaa || 4, stencilBuffer: true});
    hdrRT = mk();
    accRT = new THREE.WebGLRenderTarget(W, H, {type: THREE.HalfFloatType});   // 누적 타깃(반정밀이면 충분). 검은 화면의 진짜 원인은 아래 textureID 였음(Float32 의심은 2026-11-04 시험으로 반증)
    composer = new THREE.EffectComposer(R, hdrRT);
    composer.setPixelRatio(1); composer.setSize(W, H);
    renderPass = new THREE.RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    composer.addPass(renderPass);
    // 모션 블러가 켜져 있으면 RenderPass 대신 쌓아 둔 accRT 를 복사해 넣는다
    copyPass = new THREE.ShaderPass(THREE.CopyShader); copyPass.enabled = false; composer.addPass(copyPass);
    copyPass.textureID = "__accRT";   // ShaderPass 는 textureID 유니폼을 readBuffer 로 덮는다 → tDiffuse 를 못 덮게(덮으면 빈 버퍼 = 검은 화면)
    if (cfg.ao) {
      sao = new THREE.SAOPass(new THREE.Scene(), new THREE.PerspectiveCamera(), false, true, new THREE.Vector2(W, H));
      const a = cfg.ao; Object.assign(sao.params, {saoIntensity: a.intensity, saoScale: a.scale, saoKernelRadius: a.kernelRadius,
        saoMinResolution: a.minResolution, saoBlur: a.blur, saoBlurRadius: a.blurRadius, saoBlurStdDev: a.blurStdDev, saoBias: a.bias});
      // 빈 곳·먼 곳은 AO 에서 뺀다(바깥 하늘이 0,0,0 이던 문제). 깊이 패스는 RGBA 포장이라 빈 픽셀이 깊이 1 이어야
      // SAOShader 가 버리는데, 클리어가 0x000000 이고 scene.background(색)가 그 패스에서 배경색으로 다시 칠해 중간 깊이로 읽혔음.
      // → 깊이 패스는 배경 없이 흰색(=깊이 1)으로 지우고, 하늘 돔처럼 먼 면은 fade 거리에서 AO 를 0 으로.
      sao.depthMaterial.clearColor = 0xffffff;
      // 비치는 것은 AO 깊이·법선 패스에서 뺀다. 덮어쓰기 재질(overrideMaterial)이 모든 물체를 불투명 면으로 그려
      // 반투명 유리는 판 전체가 검게(비스듬히 돌린 판 81 %), 스프라이트는 검은 네모, 입자(Points)는 검은 점, additive 빛줄기는 검은 줄이 됐음.
      // 불투명 물체는 그대로 두므로 접촉 그림자·모서리 그늘은 전과 같다. 수치는 tests/test_sao_numbers.sh.
      // 불투명도 경계 0.5 = 위 solid() 와 KIT 페이드(반 넘게 보이면 depthWrite)와 같은 기준: 나타나는 부품의 접촉 그림자가
      // 페이드 끝 한 프레임에 톡 생기지 않고 반쯤 보일 때 들어온다.
      const seeThrough = x => !x || (x.transparent && x.opacity < 0.5) || x.transmission > 0 || x.depthWrite === false || x.blending === THREE.AdditiveBlending;
      const override = sao.renderOverride.bind(sao);
      // 물체가 아니라 재질을 끈다(three 는 덮어쓰기 전에 원래 재질의 visible 을 본다): 유리 판 아래 불투명 자식, 유리·금속 섞인 메시의 불투명 쪽은 그대로 AO 를 받는다
      sao.renderOverride = (r, m, t, c, al) => { const bg = sao.scene.background, hid = new Set();
        try {
          if (m === sao.depthMaterial) sao.scene.background = null;
          sao.scene.traverseVisible(o => { for (const x of [].concat(o.material || [])) if (x && x.visible && (o.isPoints || o.isSprite || seeThrough(x))) hid.add(x); });
          for (const x of hid) x.visible = false;
          override(r, m, t, c, al);
        } finally { sao.scene.background = bg; for (const x of hid) x.visible = true; } };
      const sm = sao.saoMaterial;
      sm.uniforms.aoFade = {value: new THREE.Vector2(...(a.fade || [1e9, 2e9]))};
      sm.fragmentShader = sm.fragmentShader.replace("uniform float bias;", "uniform float bias;\nuniform vec2 aoFade;")
        .replace("gl_FragColor.xyz *=  1.0 - ambientOcclusion;", "gl_FragColor.xyz *= 1.0 - ambientOcclusion * (1.0 - smoothstep(aoFade.x, aoFade.y, -centerViewZ));");
      if (!sm.fragmentShader.includes("aoFade.x")) throw new Error("look.js: SAOShader 모양이 바뀌어 AO 거리 줄임을 못 넣음");
      sm.needsUpdate = true;
      composer.addPass(sao);
    }
    if (cfg.dof) { bokeh = new THREE.BokehPass(new THREE.Scene(), new THREE.PerspectiveCamera(), {focus: 5, aperture: 0.0001, maxblur: cfg.dof.maxblur, width: W, height: H});
      // r147 BokehPass writes into writeBuffer but has needsSwap = false: in the middle of the chain the next pass read the
      // unblurred readBuffer, so depth of field did nothing at all (dof off == dof on, byte for byte)
      bokeh.needsSwap = true; composer.addPass(bokeh); }
    if (cfg.bloom) { const b = cfg.bloom; bloom = new THREE.UnrealBloomPass(new THREE.Vector2(W, H), b.strength, b.radius, b.threshold); composer.addPass(bloom); }
    grade = new THREE.ShaderPass(GradeShader);
    const g = cfg.grade; grade.uniforms.contrast.value = g.contrast; grade.uniforms.saturation.value = g.saturation;
    grade.uniforms.shadows.value.fromArray(g.shadows); grade.uniforms.highlights.value.fromArray(g.highlights);
    grade.uniforms.vignette.value = g.vignette; grade.uniforms.grain.value = g.grain;
    composer.addPass(grade);
    accMat = new THREE.ShaderMaterial(Object.assign({}, AccumShader, {uniforms: THREE.UniformsUtils.clone(AccumShader.uniforms),
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false}));
    accQuad = new THREE.FullScreenQuad(accMat);

    raw = R.render.bind(R);
    R.render = function (scene, camera) {
      if (R.getRenderTarget() !== null || R.getScissorTest() || !camera.isPerspectiveCamera) return raw(scene, camera);
      if (LOOK.probe && LOOK.probe.raw) { raw(scene, camera); if (LOOK.grab) LOOK.grabbed = R.domElement.toDataURL("image/png"); return; }   // check_sharp reference: no post at all
      if (inAccum && !inAccum.last) { accumulate(scene, camera); return; }
      if (inAccum) accumulate(scene, camera);
      post(scene, camera);
    };
    window.LOOK.on = true; window.LOOK.cfg = cfg;
  }

  function accumulate(scene, camera) {      // 이번 하위 프레임을 HDR 로 그려 accRT 에 1/N 더함
    const prevAuto = R.autoClear;
    R.setRenderTarget(hdrRT); R.clear(); raw(scene, camera);
    const n = inAccum.n, wp = {flat: 0, tent: 1}[cfg.mb.weights] ?? (+cfg.mb.weights || 0);   // 무게 (i+1)^p / 합 : flat p=0, tent p=1, 숫자는 그 p
    let sum = 0; for (let k = 1; k <= n; k++) sum += Math.pow(k, wp);
    const w = Math.pow(inAccum.i + 1, wp) / sum;
    accMat.uniforms.tDiffuse.value = hdrRT.texture; accMat.uniforms.weight.value = w;
    R.setRenderTarget(accRT); if (inAccum.first) { R.setClearColor(0x000000, 0); R.clear(); inAccum.first = false; }
    R.autoClear = false; accQuad.render(R); R.autoClear = prevAuto;
    R.setRenderTarget(null);
  }

  function post(scene, camera) {
    const clear = new THREE.Color(); R.getClearColor(clear); const alpha = R.getClearAlpha();
    const exposure = R.toneMappingExposure;
    const blur = !!inAccum;
    renderPass.enabled = !blur; copyPass.enabled = blur;
    if (blur) copyPass.uniforms.tDiffuse.value = accRT.texture;
    renderPass.scene = scene; renderPass.camera = camera;
    if (sao) { sao.scene = scene; sao.camera = camera; }
    lastScene = scene; lastCamera = camera;
    const F = focusOf(scene, camera);   // 심도를 꺼도 주인공은 정함(check_sharp 가 씀)
    if (LOOK.wantEnv) { LOOK.lastEnv = envOf(scene); LOOK.wantEnv = false; }
    grade.uniforms.grain.value = LOOK.probe && LOOK.probe.noGrain ? 0 : cfg.grade.grain;
    if (bokeh) {
      bokeh.scene = scene; bokeh.camera = camera;
      const u = bokeh.uniforms, mf = (LOOK.mutate && LOOK.mutate.focusScale) || 1, f = F.f * mf;   // mutate: check_sharp 변이(초점 일부러 빗나감)
      u.focus.value = f; u.nearClip.value = camera.near; u.farClip.value = camera.far;
      u.aspect.value = camera.aspect;
      let ap = (camera.userData && camera.userData.aperture) || cfg.dof.aperture || cfg.dof.k / (f * f);
      // BokehShader 탭 반지름 = 0.4 · |초점 차| · 조리개 (UV) → 주인공 앞뒤 끝(half m)에서 subjectTol px 을 넘지 않게
      if (F.half > 0 && mf === 1) ap = Math.min(ap, (cfg.dof.subjectTol || 1) / (0.4 * 1920 * F.half));
      if (mf !== 1) ap = (LOOK.mutate.blurPx || 4) / (0.4 * 1920 * Math.abs(F.f - f));   // 변이: 주인공이 반지름 4 px 로 흐려지게(눈에 띄는 초점 빗나감)
      u.aperture.value = ap;
      bokeh.enabled = !(LOOK.probe && LOOK.probe.sharp);
      window.LOOK.last = {focus: +f.toFixed(3), aperture: ap, from: F.from, subject: (LOOK.subject || []).map(o => o.name || o.type).join(",")};
    }
    const em = window.KIT && KIT.fx.emphasis.mode;   // 부조·깔끔 장면: 대비·채도·비네트를 낮춰 실사 장면과 같은 집안 톤(밝은 바탕이 회색으로 죽지 않게)
    grade.uniforms.contrast.value = em ? 1.04 : cfg.grade.contrast; grade.uniforms.saturation.value = em ? 1.0 : cfg.grade.saturation; grade.uniforms.vignette.value = em ? 0.06 : cfg.grade.vignette;
    grade.uniforms.exposure.value = exposure * (cfg.grade.exposure || 1);
    grade.uniforms.seed.value = (window.__LOOK_FRAME || 0) % 97 * 0.013;
    const tm = R.toneMapping; R.toneMapping = THREE.NoToneMapping;   // 톤 매핑은 Grade 가 한 번만
    composer.render();
    if (LOOK.grab) LOOK.grabbed = R.domElement.toDataURL("image/png");   // check_sharp: read in the same task as the draw (later the canvas may show an older composited frame)
    R.toneMapping = tm; R.setClearColor(clear, alpha);
  }

  // shell.html 이 모션 블러 때 부른다: LOOK.blur(n, i) — i = 0..n-1, 마지막(i = n-1)이 그 프레임 시각 t
  function blurStep(n, i) { inAccum = n > 1 && !(LOOK.probe && (LOOK.probe.sharp || LOOK.probe.raw)) ? {n, i, first: i === 0, last: i === n - 1} : null; }   // probe.sharp: 블러 없이 매 하위 프레임을 그림 → 마지막(t)이 남음

  // check_sharp 용: 마지막 프레임의 주인공만 흰색, 나머지 검정(가림 반영) PNG data URL. 화면을 덮어쓰므로 부른 뒤 다시 renderAt
  // Only what the frame actually shows counts as subject: a KIT.fx.focus group whose parts are not shown yet (hidden child,
  // material faded below 0.5) must not paint background pixels as subject (measured at 129 s: map dots).
  const seen = m => shown(m) && [].concat(m.material).some(x => x && x.visible !== false && !(x.transparent && x.opacity < 0.5));
  function subjectParts() {
    const inS = new Set(), unseen = new Set();
    for (const o of LOOK.subject || []) o.traverse(m => { if (!m.isMesh) return; if (seen(m)) inS.add(m); else unseen.add(m); });
    return {inS, unseen};
  }
  function subjectMask() {
    if (!LOOK.subject || !lastScene) return null;
    const s = lastScene, sw = [], hid = [], W = new THREE.MeshBasicMaterial({color: 0xffffff}), B = new THREE.MeshBasicMaterial({color: 0x000000});
    const {inS, unseen} = subjectParts();
    s.traverse(m => { if (m.isMesh && unseen.has(m)) { if (m.visible) { hid.push(m); m.visible = false; } }
      else if (m.isMesh) { sw.push([m, m.material]); m.material = inS.has(m) ? W : B; } else if ((m.isLine || m.isPoints || m.isSprite) && m.visible) { hid.push(m); m.visible = false; } });
    const bg = s.background, fog = s.fog, tm = R.toneMapping, em = window.KIT && KIT.fx && KIT.fx.emphasis, mode = em && em.mode;
    s.background = new THREE.Color(0); s.fog = null; R.toneMapping = THREE.NoToneMapping; if (em) em.mode = null;
    // Read the mask from an offscreen target: toDataURL on the default framebuffer here (GB10 ANGLE) sometimes returns a blank or
    // stale buffer (seen as an empty first capture, and occasionally mid-run).
    const size = R.getDrawingBufferSize(new THREE.Vector2()), w = size.x, h = size.y;
    let url; try {
      const rt = new THREE.WebGLRenderTarget(w, h), px = new Uint8Array(w * h * 4);
      R.setRenderTarget(rt); raw(s, lastCamera); R.readRenderTargetPixels(rt, 0, 0, w, h, px); R.setRenderTarget(null); rt.dispose();
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const g = c.getContext("2d"), img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      g.putImageData(img, 0, 0); url = c.toDataURL("image/png");
    }
    finally { for (const [m, mat] of sw) m.material = mat; for (const m of hid) m.visible = true; s.background = bg; s.fog = fog; R.toneMapping = tm; if (em) em.mode = mode; }
    return url;
  }
  function blurEnd() { inAccum = null; }

  window.LOOK = {install, blurStep, blurEnd, subjectMask, subjectParts, envOf, last3d: () => [lastScene, lastCamera], PRESETS, on: false, cfg: null, subject: null, probe: null, mutate: null};
})();
