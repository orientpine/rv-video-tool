(function () {
  const NAME = "home", wt = w => KIT.wordT(NAME, w), D = PM_DIR;
  let R, W, suit, cam, robot, range, goal, title, E, dur, tT, st, done, cutS;
  // Setting a mug on a shelf above the shoulder: the hand rises in front of the board edge holding the handle, the
  // mug body turns toward the wall (-z) over the board, then the arm lowers until the mug rests on it. The hand and
  // forearm stay in front of the edge. P = {s: lift at rest on the board, dz: step toward the camera} is solved in init.
  let P = {s: 1, dz: 0, ex: 0}, z0 = 0, SHELF_TOP = 1.645;
  const HI = .10;
  function arm(t) {
    const rise = KIT.smooth(st, st + 1.5, t), turn = KIT.smooth(st + 1.3, st + 2.1, t), set = KIT.smooth(st + 2.0, done, t);
    const lift2 = KIT.smooth(done + .2, done + .5, t), down = KIT.smooth(done + 1.1, done + 3.2, t);
    return {lift: ((P.s + HI) * rise - HI * (set - lift2)) * (1 - .9 * down), turn: turn * (1 - KIT.smooth(done + .2, done + .3, t)), up: rise};
  }
  function place(t, lift) { W.human.position.z = z0 + P.dz * KIT.smooth(st - 1.2, st, t); W.person(t, lift); }
  function pose(t) {
    const prep = .09 * (KIT.smooth(1.0, 2.2, t) - KIT.smooth(st - 1.7, st - 1.0, t));
    const q = arm(t);
    if (t >= done) {
      const r = arm(done); place(done, r.lift); W.cupAtHand([0, 0, -1], 1, P.ex);
      const placed = W.cup.position.clone(), rot = W.cup.rotation.y; placed.y = SHELF_TOP + .064;
      place(t, q.lift); W.cup.position.copy(placed); W.cup.rotation.y = rot;
    } else { place(t, prep + q.lift); W.cupAtHand([0, 0, -1], q.turn, P.ex); }
    suit.set(q.up, t); W.air(t);
    return q.up;
  }
  function clash(box) {
    const h = W.human.userData.contacts.hands[1].getWorldPosition(new THREE.Vector3());
    const e = W.human.getObjectByName("elbow_r").getWorldPosition(new THREE.Vector3());
    let worst = 1;
    for (let k = 0; k <= 10; k++) worst = Math.min(worst, box.distanceToPoint(e.clone().lerp(h, k / 10)) - (k === 10 ? .05 : .045));
    const cb = new THREE.Box3().setFromObject(W.cup);
    if (cb.intersectsBox(box)) worst = Math.min(worst, -(Math.min(cb.max.y, box.max.y) - Math.max(cb.min.y, box.min.y)) + .003);
    return worst;
  }
  function pathClear(box) {
    let ok = Infinity;
    for (let k = 0; k <= 50; k++) { const t = st - .2 + (done + 3.4 - st) * k / 50, q = arm(t); place(t, q.lift); if (t >= done) { pose(t); } else W.cupAtHand([0, 0, -1], q.turn, P.ex); ok = Math.min(ok, clash(box)); }
    return ok;
  }
  function solve() {
    z0 = W.human.position.z;
    const box = new THREE.Box3().setFromObject(W.shelf), front = box.max.z, top = box.max.y; SHELF_TOP = top;
    let best = null;
    for (const dz of [0, .03, .06, .09, .12, .15]) for (const ex of [0, .02, .04, .06]) {
      P = {s: 1, dz, ex};
      let lo = .3, hi = 1.6;
      for (let it = 0; it < 20; it++) { P.s = (lo + hi) / 2; place(done, P.s); W.cupAtHand([0, 0, -1], 1, P.ex); if (W.cup.position.y > top + .064) hi = P.s; else lo = P.s; }
      place(done, P.s); W.cupAtHand([0, 0, -1], 1, P.ex);
      const c = W.cup.position.clone(), drop = c.y - (top + .064), cupOn = c.z <= front - .03 && c.x > box.min.x + .08 && c.x < box.max.x - .08;
      // the cup bottom rests on the board at release: measured without the board overlap rule
      const ok = pathClear(box), score = (cupOn ? 0 : 10) + (ok >= .002 ? 0 : 5 - ok) + (Math.abs(drop) <= .01 ? 0 : 3) + dz * .02 + ex * .05;
      if (!best || score < best.score) best = {score, P: {...P}, ok, drop, cup: c.toArray(), front, top, head: +(box.distanceToPoint(W.human.getObjectByName("head").getWorldPosition(new THREE.Vector3())) - .12).toFixed(3)};
    }
    P = best.P; window.HOME_ARM = best;
    if (best.score >= 3) console.error("[premium] home: no arm path clears the shelf", JSON.stringify(best));
  }
  SCENES[NAME] = {
    duration: DATA.timeline.modules[NAME].duration,
    init(renderer, T, ov) {
      R = renderer; W = HOME(R, {key: 5.6}); suit = SUIT(W.human);
      const shelfLight = new THREE.SpotLight(0xffc78a, 2.2, 4, .35, .7, 1.4); shelfLight.position.set(-1.2, 2.1, .9); shelfLight.target.position.set(.45, 1.74, -.4); W.scene.add(shelfLight, shelfLight.target);
      robot = D.card(ov, "robot", "초경량 어깨 보조 로봇", {left: 90, top: 190});
      range = D.card(ov, "range", "임상 어깨 움직임 범위 개선", {left: 90, top: 190});
      goal = D.tag(ov, "목표 시나리오", {left: 1590, top: 160}); goal.box.style.fontWeight = "700";
      title = D.title(ov, {title: "근육옷감", sub: "실로 짠 근육, 다시 내 손으로", credit: "한국기계연구원 연구 · 2025년 10월 29일 발표", src: "출처: 한국기계연구원 보도자료"});
      title.box.style.top = "300px"; title.box.style.left = "100px"; title.box.style.width = "760px";
      E = D.captionTimes(NAME); dur = DATA.timeline.modules[NAME].duration;
      st = wt("임상에서"); done = st + 2.7; tT = E[4] + 2.9;
      const lead = D.edges(NAME).lead;
      const wide = D.S([2.35, 1.95, 3.95], [-.05, 1.42, -.1], 34), wide1 = D.S([2.05, 1.9, 3.5], [0, 1.45, -.1], 33);
      const shelf = D.S([.95, 1.6, .8], [.23, 1.72, .05], 30), shelf2 = D.S([.85, 1.62, .68], [.23, 1.72, .05], 29);
      const end = D.S([2.9, 2.25, 4.8], [-1.9, 1.45, -.3], 36);
      cutS = E[3] - .7;
      W.cam = new THREE.PerspectiveCamera(34, 16 / 9, .03, 140);
      solve();
      pose(done - .3); W.scene.updateMatrixWorld(true);
      KIT.shot.declare(NAME, [{t: 0}, {t: cutS}, {t: tT - .05, kind: "ui-only", end: dur}]);
      const Z = KIT.shot.action(NAME, {t: st + .25, dur: 2.4, from: wide1, at: W.cup, subject: W.cup.name, keep: [W.cup], zoom: 1.45, avoid: [[80, 170, 420, 470], [1580, 150, 1860, 240]]});
      cam = D.plan(NAME, wide, [
        {move: [Math.max(lead + .02, E[0] + .64), wt("어깨") - .64], to: wide1},
        {action: Z},
        {cut: cutS, to: shelf},
        {move: [E[3] + .64, E[4] - .64], to: shelf2},
        {move: [E[4] + .64, tT - .64], to: end}
      ], [wt("어깨"), st + .55, tT, .5]);
    },
    render(t) {
      FILM.prep(R); R.toneMappingExposure = .95;
      const u = pose(t); KIT.camSet(W.cam, cam(t));
      W.atmos.update(t, W.cam, {flare: t > done ? .6 : .4, shafts: 1.15});
      robot.show(D.fade(t, wt("어깨"), st + .55)); range.show(D.fade(t, st + .55, E[3]));
      goal.show(D.fade(t, .5, dur + 1)); title.show(D.fade(t, tT, dur + 1, .6));
      if (t < cutS || t >= tT - .64) KIT.fx.focus(W.human, W.cup); else KIT.fx.focus(W.cup); D.highlight(NAME, t, ["어깨", "임상에서", "다시"]);
      window.SIMSTATE = {assist: u, cup: W.cup.position.toArray(), targetScenario: true, arm: window.HOME_ARM};
      R.render(W.scene, W.cam);
    },
    show() {}
  };
})();
