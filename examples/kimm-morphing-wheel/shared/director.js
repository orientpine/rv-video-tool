/* Camera plans that keep the owner's rule by construction: the camera moves only between text changes
   (caption, card, label, title) with a 0.62 s guard, never during the incoming/outgoing dip, and cuts land
   outside those windows too. Overlays use one restrained type system. */
(function () {
  const GUARD = .62;
  const mod = name => DATA.timeline.modules[name];
  function captionTimes(name) {
    const m = mod(name);
    return (DATA.timeline.captions || []).map(c => c.t - m.start).filter(t => t > -.01 && t < m.duration + .01);
  }
  function edges(name) {
    const order = DATA.timeline.order, i = order.indexOf(name), tr = window.TRANSITIONS || {}, next = order[i + 1];
    return {lead: tr[name] ? (tr[name].dur || .6) / 2 : 0, tail: next && tr[next] ? (tr[next].dur || .6) / 2 : 0, dur: mod(name).duration};
  }
  const lineStart = (name, i) => KIT.lineSpan(name, i)[0];
  const lineEnd = (name, i) => KIT.lineSpan(name, i)[1] + DATA.timeline.tail_s;
  const S = (p, l, fov) => ({p, l, fov});
  const mixS = (a, b, w) => ({p: a.p.map((x, j) => x + (b.p[j] - x) * w), l: a.l.map((x, j) => x + (b.l[j] - x) * w), fov: a.fov + (b.fov - a.fov) * w});
  // plan(name, start, items, textTimes): items = {cut: t, to} | {move: [a, b], to, ease?} | {action: Z} | {follow: [a, b], fn}
  function plan(name, start, items, textTimes) {
    const e = edges(name), events = captionTimes(name).concat(textTimes || []);
    const busy = (a, b) => events.filter(x => a < x + GUARD && b > x - GUARD);
    for (const it of items) {
      const [a, b] = it.cut != null ? [it.cut, it.cut] : it.move || it.follow || [it.action.t0, it.action.t1];
      if (it.action) continue;
      const hit = busy(a, b);
      if (hit.length) console.error(`[premium] ${name}: camera ${it.cut != null ? "cut" : "move"} ${a.toFixed(2)}-${b.toFixed(2)} overlaps text at ${hit.map(x => x.toFixed(2))}`);
      if (a < e.lead - 1e-3 && (it.move || it.follow)) console.error(`[premium] ${name}: camera moves in the incoming dip (${a.toFixed(2)} < ${e.lead})`);
      if (b > e.dur - e.tail + 1e-3) console.error(`[premium] ${name}: camera moves in the outgoing dip (${b.toFixed(2)} > ${(e.dur - e.tail).toFixed(2)})`);
    }
    const sorted = items.slice().sort((x, y) => (x.cut ?? (x.move || x.follow || [x.action.t0])[0]) - (y.cut ?? (y.move || y.follow || [y.action.t0])[0]));
    return t => {
      let s = start;
      for (const it of sorted) {
        if (it.cut != null) { if (t >= it.cut) s = it.to; else break; continue; }
        if (it.action) { if (t < it.action.t0) break; const base = s; s = it.action.at(t, () => base); if (t < it.action.t1) break; s = it.action.end; continue; }
        const [a, b] = it.move || it.follow;
        if (t <= a) break;
        if (it.follow) { s = it.fn(Math.min(t, b)); if (t < b) break; continue; }
        const u = KIT.clamp((t - a) / (b - a), 0, 1), w = it.ease === "linear" ? u : u * u * u * (u * (u * 6 - 15) + 10);
        if (t < b) { s = mixS(s, it.to, w); break; }
        s = it.to;
      }
      return s;
    };
  }
  const ACC = "#F0B46A";
  function panel(ov, left, top, width) {
    const e = document.createElement("div");
    e.style.cssText = `position:absolute;left:${left}px;top:${top}px;${width ? `width:${width}px;` : ""}padding:16px 22px 14px 20px;` +
      `background:rgba(8,11,14,.82);border-left:2px solid ${ACC};opacity:0;font-family:var(--ui);color:#F4F1EC`;
    ov.append(e); return e;
  }
  function card(ov, id, caption, {left = 1490, top = 190} = {}) {
    const n = KIT.info.source(id), e = panel(ov, left, top, 300);
    e.dataset.rvCue = "tone";
    e.innerHTML = `<div style="font:300 60px/1 var(--ui);letter-spacing:-1px;color:${ACC}">${n ? n.show[0] : "?"}</div>` +
      `<div style="font:500 26px/1.35 var(--ui);margin-top:10px;color:#F4F1EC">${caption}</div>` +
      `<div style="font:400 20px/1.3 var(--ui);margin-top:8px;color:#E2DCD3">출처: 한국기계연구원</div>`;
    return {box: e, show(a) { e.style.opacity = a.toFixed(3); e.style.transform = `translateY(${((1 - a) * 14).toFixed(1)}px)`; }};
  }
  function tag(ov, html, {left = 90, top = 190} = {}) {
    const e = panel(ov, left, top);
    e.style.font = "500 26px/1.4 var(--ui)"; e.innerHTML = html;
    return {box: e, show(a) { e.style.opacity = a.toFixed(3); e.style.transform = `translateY(${((1 - a) * 14).toFixed(1)}px)`; }};
  }
  function title(ov) {
    const e = document.createElement("div");
    e.style.cssText = "position:absolute;left:520px;top:330px;width:880px;padding:38px 0 34px;text-align:center;background:rgba(8,10,13,.6);backdrop-filter:blur(14px) brightness(.62) saturate(.75);-webkit-backdrop-filter:blur(14px) brightness(.62) saturate(.75);border-radius:2px;opacity:0;font-family:var(--ui);color:#F6F2EA";
    e.innerHTML = `<div style="font:700 84px/1 var(--ui);letter-spacing:6px">모핑 휠</div>` +
      `<div style="width:64px;height:2px;background:${ACC};margin:22px auto 20px"></div>` +
      `<div style="font:400 32px/1.4 var(--ui);letter-spacing:1px">턱 앞에서 멈추지 않는 바퀴</div>` +
      `<div style="font:400 22px/1.4 var(--ui);color:#CFC6BA;margin-top:14px">한국기계연구원 연구 · 사이언스 로보틱스 2024년 8월호 표지논문</div>` +
      `<div style="font:400 18px/1.4 var(--ui);color:#E2DAD0;margin-top:6px">출처: Science Robotics 9(93), 2024-08-14</div>`;
    ov.append(e);
    return {box: e, show(a) { e.style.opacity = a.toFixed(3); e.style.transform = `scale(${(.985 + .015 * a).toFixed(4)})`; }};
  }
  function fade(t, a, b, f = .35) { return KIT.win(t, a, b, f); }
  function highlight(name, t, words) {
    window.HL = "";
    for (const w of words) if (t >= KIT.wordT(name, w) - .08 && t < KIT.wordT(name, w) + 1.8) window.HL = w;
  }
  window.PM_DIR = {GUARD, mod, edges, captionTimes, lineStart, lineEnd, S, mixS, plan, card, tag, title, fade, highlight};
})();
