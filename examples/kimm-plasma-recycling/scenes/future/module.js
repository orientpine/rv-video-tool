(function () {
  const NAME = "future", wt = w => KIT.wordT(NAME, w), D = PM_DIR;
  let R, Y, man, cam, card, goal, title, E, tT, dur;
  SCENES[NAME] = {
    duration: DATA.timeline.modules[NAME].duration,
    init(renderer, THREE_, ov) {
      R = renderer;
      Y = PM_YARD.create(R, {time: "dawn", pileFlat: .55, freshBelt: true, shafts: [],
        motes: {center: [1.5, 1.4, 1.5], size: [9, 2.8, 7], n: 700, px: .014}});
      man = PM_PEOPLE.worker(Y.scene); man.position.set(3.2, .01, 2.6); man.rotation.y = -2.55;
      card = D.card(ov, "year", "국내 장기 운전 검증 계획");
      goal = D.tag(ov, "목표 시나리오", {left: 90, top: 190}); goal.box.style.fontWeight = "700";
      title = D.title(ov, {title: "섞인 채로, 다시 원료로", sub: "100% 수소 플라즈마로 혼합 폐플라스틱을 원료로", credit: "한국기계연구원 플라즈마 활용 폐유기물 고부가가치 기초원료화 사업단", src: "출처: 한국기계연구원 보도자료, 2025-09-03"});
      title.box.style.top = "150px"; title.box.style.left = "980px";
      E = D.captionTimes(NAME); dur = DATA.timeline.modules[NAME].duration; tT = E[2] + .6;
      // The belt is backdrop under the end title here, not the subject (rv check_layout cut at 63-66 s).
      KIT.fx.decor(Y.belt.root);
      const trees = []; Y.env.traverse(o => { if (o.name === "가로수") trees.push(o); }); this._tree = trees[3] || trees[0];
      const lead = D.edges(NAME).lead;
      const est = D.S([12.5, 2.6, 15.5], [-1.2, 2.6, -4.5], 36), est2 = D.S([11.2, 2.05, 13.9], [-1.4, 2.6, -4.8], 35);
      const back = D.S([5.7, 1.4, 6.1], [-3.5, -.5, -12], 42), back2 = D.S([5.2, 1.38, 5.4], [-3.5, -.5, -12], 41);
      const sky = D.S([5.6, 3.0, 6.3], [-5, 5.5, -18], 38);
      const cutB = E[1] - .7;
      KIT.shot.declare(NAME, [{t: 0}, {t: cutB}]);
      cam = D.plan(NAME, est, [
        {move: [Math.max(lead + .02, wt("2026년") + .64), cutB - .05], to: est2},
        {cut: cutB, to: back},
        {move: [E[1] + .64, E[2] - .64], to: back2},
      ], [wt("2026년"), tT, .6]);
    },
    render(t) {
      KIT.camSet(Y.cam, cam(t));
      Y.animate(t + 40, Y.cam, {atmos: {flare: t > E[1] - .7 ? .6 : .3, shafts: 1}, craneT: 6, exposure: .8});
      // Path passes 0.84 m from the canopy column centre at (2, 1.5) (base 0.7 m square) and right of the ground litter (x <= 2.2);
      // it ends left of the end title (make14: ending at x 2.95 put his head 11-16% under the title's left edge, rv cut).
      // The worker walks slowly toward the dawn under the last lines and the title (motion beside the text).
      man.visible = true;
      man.act(t, {walk: {from: [3.2, .01, 2.6], to: [2.65, .01, .9], t0: E[1] + .3, t1: dur - .2}});
      card.show(D.fade(t, wt("2026년"), E[1], .3));
      goal.show(D.fade(t, .6, dur + 1, .35));
      title.show(D.fade(t, tT, dur + 1, .6));
      KIT.fx.focus(t < E[1] - .7 ? Y.pile : man);
      D.highlight(NAME, t, ["2026년", "실증", "목표"]); R.render(Y.scene, Y.cam);
    },
    show() {}
  };
})();
