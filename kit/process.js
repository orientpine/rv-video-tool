/* Process poses are absolute functions of normalized step time, never dt.
 * set(u) supports seeking backwards. Pressure values are illustrative, not data.
 * steps(): reverse zero-pose reset, then chronological replay of started steps.
 * Callbacks must set absolute state (no +=, random, or frame-history effects).
 */
(function () {
  const unit = u => KIT.clamp(u, 0, 1);
  const ease = u => { u = unit(u); return u * u * (3 - 2 * u); };
  const material = color => new THREE.MeshStandardMaterial({color, roughness: .45, metalness: .35});
  // Word<->animation contract read by check_motion ACTION_MATCH: every part has names (the nouns the
  // script uses for it) and state() in 0..1, 0 = as built / closed / start / off, 1 = open / arrived / on.
  const registry = () => window.__rvProcess || (window.__rvProcess = []);
  const names = (name, defaults) => [...[].concat(name || []), ...defaults].filter(Boolean);
  function register(kind, obj, nameList, state, handle) {
    let entry = registry().find(e => e.obj === obj && e.kind === kind);
    if (!entry) registry().push(entry = {kind, obj, names: nameList, state, handles: []});
    else entry.names = [...new Set([...entry.names, ...nameList])];
    if (handle) entry.handles.push(handle);
    return handle;
  }
  function part(obj, {name, state}) {
    if (!name || typeof state !== "function") throw new Error("KIT.process.part needs {name, state: () => 0..1}");
    register("part", obj, names(name, []), () => unit(state()));
    return obj;
  }
  function valve(parent, {radius = .3, turns = 1, color = 0xF2A33A, name} = {}) {
    const root = new THREE.Group(), wheel = new THREE.Group(), m = material(color);
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(radius, radius * .12, 8, 32), m));
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.8, radius * .1, radius * .1), m);
      spoke.rotation.z = i * Math.PI / 3; wheel.add(spoke);
    }
    root.add(wheel); parent.add(root);
    return register("valve", root, names(name, ["밸브", "진공"]), () => unit(wheel.rotation.z / (turns * Math.PI * 2)),
      {root, wheel, set(u) { wheel.rotation.z = ease(u) * turns * Math.PI * 2; }});
  }
  function gauge(parent, {radius = .35, from = 0, to = 100, unit: suffix = "kPa", name} = {}) {
    const root = new THREE.Group(), canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const c = canvas.getContext("2d");
    c.fillStyle = "#f7f9f9"; c.fillRect(0, 0, 256, 256);
    c.fillStyle = "#16323c"; c.textAlign = "center"; c.font = "bold 24px sans-serif";
    for (let i = 0; i <= 4; i++) {
      const a = (-210 + i * 60) * Math.PI / 180;
      c.fillText(String(Math.round(from + (to - from) * i / 4)), 128 + 85 * Math.cos(a), 136 + 85 * Math.sin(a));
    }
    c.font = "bold 22px sans-serif"; c.fillText(suffix, 128, 215);
    const face = new THREE.Mesh(new THREE.CircleGeometry(radius, 48),
      new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(canvas)}));
    const needle = new THREE.Group(), pointer = new THREE.Mesh(
      new THREE.BoxGeometry(radius * .72, radius * .055, .015), material(0xD84B35));
    pointer.position.set(radius * .33, 0, .02); needle.add(pointer);
    root.add(face, needle); parent.add(root);
    let value = from;
    return register("gauge", root, names(name, ["게이지", "압력"]), () => unit((value - from) / (to - from)),
      {root, needle, get value() { return value; }, set(u) {
      const x = ease(u); value = from + (to - from) * x;
      // Canvas y grows down; the 3D needle's y grows up.
      needle.rotation.z = (210 - 240 * x) * Math.PI / 180;
      root.userData.processValue = {value, unit: suffix};
    }});
  }
  // Put the lid geometry below a pivot at its hinge, not at its own centre. Build it closed:
  // angles turn about the pivot's local axis from the pose it has when the first hatch is made,
  // so 0 = as built = closed even after pivot.lookAt (e.g. a hinged door).
  function hatch(pivot, {axis = "x", from = 0, to = -Math.PI * .65, name, frame} = {}) {
    if (frame) pivot.userData.rvHatchFrame = frame;
    const rest = pivot.userData.rvHatchRest || (pivot.userData.rvHatchRest = pivot.quaternion.clone());
    const turn = new THREE.Vector3(+(axis === "x"), +(axis === "y"), +(axis === "z")), q = new THREE.Quaternion();
    pivot.userData.rvHatchMax = Math.max(pivot.userData.rvHatchMax || 0, Math.abs(from), Math.abs(to));
    const opened = () => 2 * Math.acos(Math.min(1, Math.abs(rest.dot(pivot.quaternion))));
    return register("hatch", pivot, names(name, ["뚜껑", "문", "덮개", "해치"]), () => unit(opened() / pivot.userData.rvHatchMax),
      {set(u) { pivot.quaternion.copy(rest).multiply(q.setFromAxisAngle(turn, from + (to - from) * ease(u))); }});
  }
  // Supply a pick/lift/travel/lower/place polyline in the part parent's coordinates.
  function move(part, path, {name} = {}) {
    if (path.length < 2) throw new Error("KIT.process.move needs at least two path points");
    const pts = path.map(p => new THREE.Vector3(...p)), seg = new THREE.Line3(), near = new THREE.Vector3();
    const progress = () => {
      let best = Infinity, at = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        seg.set(pts[i], pts[i + 1]); const v = seg.closestPointToPointParameter(part.position, true);
        const d = seg.at(v, near).distanceTo(part.position); if (d < best - 1e-9) { best = d; at = (i + v) / (pts.length - 1); }
      }
      return at;
    };
    return register("move", part, names(name, [part.name]), progress, {set(u) {
      const x = unit(u) * (path.length - 1), i = Math.min(path.length - 2, Math.floor(x)), v = ease(x - i);
      part.position.set(...path[i].map((p, j) => p + (path[i + 1][j] - p) * v));
    }});
  }
  // Turning part (a disk, rotor, fan): set(u) turns obj u * turns full turns about its own axis from the pose it has
  // when spin is made, linearly (a steady run, not eased). Registered for ACTION_MATCH (돌리기 = 10°) under its name.
  function spin(obj, {axis = "y", turns = 1, name} = {}) {
    const rest = obj.quaternion.clone(), turn = new THREE.Vector3(+(axis === "x"), +(axis === "y"), +(axis === "z")), q = new THREE.Quaternion();
    let at = 0;
    return register("spin", obj, names(name, [obj.name, "회전"]), () => at, {set(u) {
      at = unit(u); obj.quaternion.copy(rest).multiply(q.setFromAxisAngle(turn, at * turns * Math.PI * 2));
    }});
  }
  // Arrows rising from the origin (air, gas), or with path: [[x,y,z], ...] (parent coordinates) flowing along that
  // polyline and pointing along it (a sample running into a well, coolant in a pipe).
  function exhaust(parent, {seed = 7, count = 12, length = 1, color = 0x6BD8EE, name, path} = {}) {
    const root = new THREE.Group(), random = KIT.rng(seed), arrows = [];
    const pts = path && path.map(p => new THREE.Vector3(...p)), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    const lens = pts ? pts.slice(1).map((p, i) => p.distanceTo(pts[i])) : [], total = lens.reduce((s, x) => s + x, 0);
    if (pts && !(total > 0)) throw new Error("KIT.process.exhaust path needs at least two different points");
    const along = (v, out) => {   // point at arc fraction v, direction of its segment in dir
      let d = v * total, i = 0;
      while (i < lens.length - 1 && d > lens[i]) d -= lens[i++];
      dir.subVectors(pts[i + 1], pts[i]).normalize();
      return out.copy(pts[i]).addScaledVector(dir, Math.min(d, lens[i]));
    };
    const geo = new THREE.ConeGeometry(.055, .16, 6), m = material(color);
    for (let i = 0; i < count; i++) {
      const a = new THREE.Mesh(geo, m), phase = random(), x = (random() - .5) * .3, z = (random() - .5) * .3;
      arrows.push({a, phase, x, z}); root.add(a);
    }
    parent.add(root);
    return register("exhaust", root, names(name, pts ? ["흐름", "공기", "가스"] : ["공기", "가스", "배기"]), () => +root.visible, {root, set(u) {
      root.visible = u > 0 && u < 1;
      // Flow grows in over the first 15% and out over the last 15% of u, never all arrows in one frame (POP_IN).
      const flow = ease(u / .15) * ease((1 - u) / .15);
      for (const {a, phase, x, z} of arrows) {
        const v = (unit(u) * 2 + phase) % 1;
        if (pts) { along(v, a.position); a.position.x += x * .1; a.position.z += z * .1; a.quaternion.setFromUnitVectors(up, dir); }
        else a.position.set(x * (1 + v), v * length, z * (1 + v));
        a.scale.setScalar(Math.max(1e-3, flow * (.5 + .5 * Math.sin(v * Math.PI))));
      }
    }});
  }
  function steps(scene, definitions, {overlay, left = 80, top = 160} = {}) {
    const lines = ((window.DATA.words || {}).lines || []).filter(l => l.scene === scene);
    const starts = definitions.map(s => KIT.wordT(scene, s.word, s.n || 0));
    if (starts.some(t => t >= 1e9) || starts.some((t, i) => i && t <= starts[i - 1]))
      throw new Error("KIT.process.steps needs existing, chronologically ordered script keywords");
    const items = definitions.map((s, i) => {
      const line = lines.find(l => l.words.some(w => w.word === s.word && w.t_scene === starts[i]));
      const lineEnd = line.speech_end - window.DATA.timeline.modules[scene].start;
      const end = starts[i + 1] ?? lineEnd;
      const duration = s.duration ?? end - starts[i];
      if (!(duration > 0) || starts[i] + duration > end + 1e-6)
        throw new Error("KIT.process.steps duration must fit before the next step/line end");
      let card = s.card;
      if (!card && overlay) {
        const box = document.createElement("div");
        box.dataset.rvCue = "tone";
        box.style.cssText = `position:absolute;left:${left}px;top:${top}px;padding:22px 34px;background:${KIT.info.PANEL};color:${KIT.info.INK};border-left:8px solid ${KIT.info.ACC};font:700 34px/1.3 var(--ui)`;
        box.textContent = s.text || s.word; overlay.append(box);
        card = {box, show(a) { box.style.display = a ? "block" : "none"; }};
      }
      return {...s, start: starts[i], end, duration, card};
    });
    return {items, render(t) {
      // Reset callbacks in reverse so earlier steps own the initial pose when
      // several steps operate the same hinge/gauge. Replay is seek-independent.
      for (let i = items.length - 1; i >= 0; i--) items[i].run(0);
      for (const s of items) {
        if (t >= s.start) s.run(unit((t - s.start) / s.duration));
        const on = t >= s.start && t < s.end;
        if (s.card) {
          s.card.show(on ? 1 : 0, 0);
          if (s.card.box) s.card.box.dataset.processWord = s.word;
        }
      }
    }};
  }
  KIT.process = {valve, gauge, hatch, move, exhaust, spin, steps, part};
})();
