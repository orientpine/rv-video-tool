#!/bin/bash
# Default number cards and tags: beside the subject at readable sizes, the same for a frame whatever ran before it.
#   bash tests/test_text_layout.sh   -> last line TEXT_LAYOUT_TESTS PASS
# A kit page (three + kit/scene_kit.js), a box as the subject, a still camera:
#  1 sizes: card 80/36/24 px, KIT.label 40 px
#  2 beside: a default card does not cover the subject, sits 48 px from it, 96 px or more from the left/right edge;
#    subject on the left -> card on its right, subject on the right -> card on its left
#  3 explicit: left/top kept, top only -> right 64 px (as before), size 26 kept
#  4 order: frame A, then B, then A again == A on a fresh page; KIT.info.clear on a card settled elsewhere == on a fresh card
#  5 between scenes: KIT.fx.reset forgets the camera, so a frame with no camSet puts the card beside the middle box
#  6 script.json caption raised (bottom 400): a default card moves above the tallest caption box (measured)
set -uo pipefail
TOOL="$(cd "$(dirname "$0")/.." && pwd)"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
THREE="$(ls "$TOOL"/vendor/three-*.min.js | head -1)"
cat > "$W/page.html" <<EOF
<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:1920px;height:1080px;overflow:hidden;--ui:sans-serif}</style>
<script src="file://$THREE"></script><script src="file://$TOOL/kit/scene_kit.js"></script></head><body>
<div id="ov" style="position:absolute;left:0;top:0;width:1920px;height:1080px"></div>
<div id="cap" style="position:absolute;left:0;right:0;bottom:56px;display:flex;justify-content:center"><div class="box" style="max-width:1560px;font:600 44px/1.36 sans-serif;padding:14px 36px 16px;white-space:pre-line"></div></div>
<script>
window.DATA = {timeline: {modules: {}, order: [], captions: [{t: 0, text: "자막 상자 위로 카드가 비켜 놓임"}]}, words: {lines: []}};
window.SOURCES = {numbers: [{id: "w", show: ["25"], kind: "fetched", src: "https://www.example.org/a/b/12345"}]};
const ov = document.getElementById("ov"), scene = new THREE.Scene(), box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, .4));
scene.add(box); const cam = new THREE.PerspectiveCamera(40, 16 / 9, .05, 100);
const rect = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(v => Math.round(v)); };
function subjectBox() { const b = new THREE.Box3().setFromObject(box); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let j = 0; j < 8; j++) { const v = new THREE.Vector3(j & 1 ? b.max.x : b.min.x, j & 2 ? b.max.y : b.min.y, j & 4 ? b.max.z : b.min.z).project(cam);
    x0 = Math.min(x0, (v.x + 1) * 960); x1 = Math.max(x1, (v.x + 1) * 960); y0 = Math.min(y0, (1 - v.y) * 540); y1 = Math.max(y1, (1 - v.y) * 540); }
  return [x0, y0, x1, y1]; }
const card = KIT.info.numCard(ov, {id: "w", caption: "wire diameter"});
window.frame = (x, withCam = true) => {   // one frame: the subject at x, the camera still
  box.position.set(x, 1, 0); scene.updateMatrixWorld(true); KIT.fx.reset();
  if (withCam) { KIT.camSet(cam, {p: [0, 1, 6], l: [0, 1, 0], fov: 40}); KIT.fx.focus(box); }
  card.show(1); KIT.info.settle(ov); return {card: rect(card.box), subject: subjectBox()}; };
window.sizes = () => { const t = KIT.label(ov, "tag"), s = KIT.label(ov, "small", {size: 26}), f = n => parseFloat(getComputedStyle(n).fontSize);
  const c = [...card.box.children].map(f); return {num: c[0], caption: c[1], source: c[c.length - 1], tag: f(t.box), small: f(s.box), src: card.box.lastElementChild.textContent}; };
window.explicit = () => { const a = KIT.info.numCard(ov, {id: "w", left: 100, top: 200}), b = KIT.info.numCard(ov, {id: "w", top: 300});
  a.show(1); b.show(1); KIT.info.settle(ov); return {a: [a.box.style.left, a.box.style.top], b: [b.box.style.right, b.box.style.top, b.box.style.left]}; };
window.cleared = () => { const c = KIT.info.numCard(ov, {id: "w", caption: "wire diameter"}); c.box.style.display = "none";
  box.position.set(0, 1, 0); scene.updateMatrixWorld(true);
  return KIT.info.clear(c, {from: {p: [0, 1, 6], l: [0, 1, 0], fov: 40}, objects: [box]}); };
window.clearedSettled = (x) => { frame(x); return KIT.info.clear(card, {from: {p: [0, 1, 6], l: [0, 1, 0], fov: 40}, objects: [(box.position.set(0, 1, 0), box)]}); };
</script></body></html>
EOF
uv run -q --no-project --with playwright --with pillow python - "$W/page.html" "$TOOL/lib" <<'EOF'
import asyncio, json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[2])
from capture import CHROME, CHROME_ARGS
from playwright.async_api import async_playwright
fails = []
def check(name, ok, value):
    print(("PASS " if ok else "FAIL ") + name + " " + json.dumps(value))
    if not ok: fails.append(name)
def over(a, b): return max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
def gap(a, b): return max(b[0] - a[2], a[0] - b[2], b[1] - a[3], a[1] - b[3])
async def page(pw):
    b = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
    p = await b.new_page(viewport={"width": 1920, "height": 1080})
    errors = []; p.on("pageerror", lambda e: errors.append(str(e)))
    await p.goto(Path(sys.argv[1]).resolve().as_uri(), wait_until="load")
    return b, p, errors
async def main():
    async with async_playwright() as pw:
        b, p, errors = await page(pw)
        s = await p.evaluate("sizes()")
        check("sizes card 80/36/24 tag 40", [s["num"], s["caption"], s["source"], s["tag"]] == [80, 36, 24, 40], s)
        check("explicit tag size 26 kept", s["small"] == 26, s["small"])
        check("web source shows its site", s["src"] == "출처: example.org", s["src"])
        for x, side in ((0, "right"), (-1.6, "right"), (1.6, "left")):
            f = await p.evaluate(f"frame({x})")
            c, S = f["card"], f["subject"]
            check(f"x={x} card clear of the subject", over(c, S) == 0, f)
            check(f"x={x} card 48 px beside it", abs(gap(c, S) - 48) <= 1, gap(c, S))
            check(f"x={x} card on the {side}", c[0] >= S[2] if side == "right" else c[2] <= S[0], f)
            check(f"x={x} 96 px or more from the edges", min(c[0], 1920 - c[2]) >= 96, c)
        a1 = await p.evaluate("frame(-1.6)"); await p.evaluate("frame(1.6)"); a2 = await p.evaluate("frame(-1.6)")
        check("frame A after frame B == frame A", a1["card"] == a2["card"], [a1["card"], a2["card"]])
        reset = await p.evaluate("frame(0, false)")
        check("no camera after reset: beside the middle box", reset["card"][0] == round(960 + .15 * 1920 + 48), reset["card"])
        settled = await p.evaluate("clearedSettled(1.6)")
        e = await p.evaluate("explicit()")
        check("left/top kept", e["a"] == ["100px", "200px"], e["a"])
        check("top only: right 64 px as before", e["b"][:2] == ["64px", "300px"] and e["b"][2] in ("", "auto"), e["b"])
        await b.close()
        b2, p2, errors2 = await page(pw)
        raised = await p2.evaluate("""(() => { window.CAPTION = {bottom: 400}; document.getElementById("cap").style.bottom = "400px";
          const f = frame(0); return {...f, top: KIT.info.captionTop()}; })()""")
        want = 1080 - 400 - (44 * 1.36 + 30) - 8   # one 44 px line in the box, 8 px gap
        check("caption raised to 400 px: the card moves up above its box", raised["card"][3] <= raised["top"] + .5 and abs(raised["top"] - want) < 1, [raised["card"], raised["top"], round(want, 1)])
        low = await p2.evaluate("""(() => { const t = KIT.label(ov, "low tag"); t.place(cam, new THREE.Vector3(0, -3, 0), 0, 400, 1);
          return {tag: t.box.getBoundingClientRect().bottom, top: KIT.info.captionTop()}; })()""")
        check("caption raised: a tag pushed down stays above the caption box", low["tag"] <= low["top"] + .5, low)
        moved = await p2.evaluate("""(() => { const c = KIT.info.numCard(ov, {id: "w", caption: "moved", left: 900, top: 500}); c.show(1);
          const thing = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .2)); thing.position.set(0, .75, 0); scene.add(thing); scene.updateMatrixWorld(true);
          KIT.info.clear(c, {from: {p: [0, 1, 6], l: [0, 1, 0], fov: 40}, objects: [thing]}); scene.remove(thing);
          return {card: c.box.getBoundingClientRect().bottom, top: KIT.info.captionTop()}; })()""")
        check("caption raised: KIT.info.clear moves a card beside the object and above the caption box", moved["card"] <= moved["top"] + .5, moved)
        await p2.evaluate("delete window.CAPTION")
        fresh = await p2.evaluate("cleared()")
        check("clear on a settled card == on a fresh card", settled == fresh, [settled, fresh])
        await b2.close()
        check("no page errors", not errors and not errors2, errors + errors2)
    print("TEXT_LAYOUT_TESTS " + ("FAIL " + ", ".join(fails) if fails else "PASS"))
    sys.exit(1 if fails else 0)
asyncio.run(main())
EOF
