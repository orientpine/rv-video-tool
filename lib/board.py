"""콘티(렌더 전 정지 화면 줄): 장면마다 시작 +0.3 s · 키워드가 들리는 순간 +0.3 s · 끝 −0.3 s 를 그려 한 장으로.

    python lib/board.py <프로젝트>/build/video.html --build <프로젝트>/build --out <폴더> [--scene hold,robots] [--w 480]
출력: board_<장면>.jpg (칸마다 t= · 키워드 · 그 순간 자막 · 카메라 위치·초점) + board.json
렌더(rv make)는 몇 분이 걸리지만 콘티는 몇 초라, 연출을 콘티에서 고친 뒤 렌더한다.
"""
import argparse
import asyncio
import io
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture import CHROME, CHROME_ARGS, RENDER_JS, warm_canvas  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

FONT = next((f for f in ["/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
                         "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"] if Path(f).exists()), None)
RENDER = """() => {
    const caption = document.querySelector("#cap .box");
    return {
        HL: window.HL ?? null,
        CAM: window.CAMSTATE ?? null,
        cap: caption ? caption.textContent : ""
    };
}"""


def beats(tl, wt, only):
    out = {}
    for n in tl["order"]:
        if only and n not in only:
            continue
        m = tl["modules"][n]
        a, d = m["start"], m["duration"]
        items = [(a + 0.3, "시작")]
        for ln in wt["lines"]:
            if ln["scene"] != n:
                continue
            for word in ln["words"]:
                if word["word"] in (ln.get("keywords") or []) or not ln.get("keywords"):
                    items.append((word["t"] + 0.3, word["word"]))
        items.append((a + d - 0.3, "끝"))
        out[n] = sorted({round(t, 2): lab for t, lab in items}.items())
    return out


async def main(a: argparse.Namespace):
    B, output = Path(a.build), Path(a.out)
    output.mkdir(parents=True, exist_ok=True)
    tl = json.loads((B / "timeline.json").read_text())
    wt = json.loads((B / "word_times.json").read_text())
    kw, slook = {}, {}
    sj = B.parent / "script.json"
    if sj.exists():
        sjd = json.loads(sj.read_text())
        slook = {s["name"]: s.get("look", "cinema") for s in sjd.get("scenes", []) if isinstance(s, dict)}   # 장면 구성(기본 cinema)을 칸마다 표시
        for ln in sjd.get("lines", []):
            kw.setdefault(ln["scene"], set()).update(ln.get("keywords", []))
    for ln in wt["lines"]:
        ln["keywords"] = sorted(kw.get(ln["scene"], []))
    plan = beats(tl, wt, set(filter(None, (a.scene or "").split(","))))
    f = ImageFont.truetype(FONT, 18) if FONT else ImageFont.load_default()
    report, errors = {}, []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path=CHROME, args=CHROME_ARGS, headless=True)
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})
        page.on("pageerror", lambda error: errors.append("pageerror: " + str(error)))
        await page.goto(Path(a.html).resolve().as_uri(), wait_until="load")
        await page.evaluate("async () => { await window.renderReady; }")
        theme = await page.evaluate("() => window.THEME_PLAN || null")
        if theme:
            slook = theme["used"]
            for note in theme["warnings"]:
                print(f"Theme note: {note}")
            errors.extend(f"THEME_VIOLATION {issue}" for issue in theme["violations"])
            print(f"Theme schedule: {len(theme['runs']) - 1} switches; minimum hold 12 s, at most 2 per 60 s, blend 2 s")
            (output / "theme-plan.json").write_text(json.dumps(theme, ensure_ascii=False, indent=1))
        protocol = await page.context.new_cdp_session(page=page)
        await warm_canvas(page, protocol, next(iter(plan.values()))[0][0])
        for n, items in plan.items():
            cells = []
            for t, lab in items:
                await page.evaluate(expression=RENDER_JS, arg=t)
                st = await page.evaluate(RENDER)
                picture = await page.screenshot()
                im = Image.open(io.BytesIO(picture)).convert("RGB")
                im = im.resize((a.w, a.w * 1080 // 1920))
                cam = st.get("CAM") or {}
                sub = f"cam {cam.get('p')} f={cam.get('focus')}" if cam else "cam ?"
                used = slook.get(n, "cinema")
                requested = theme["requested"].get(n, "cinema") if theme else used
                run = next((r for r in theme["runs"] if n in r["scenes"]), None) if theme else None
                flag = " !MERGED" if requested != used else ""
                span = f" {run['end'] - run['start']:.1f}s" if run else ""
                cells.append((im, f"t={t:.2f} {lab} [{used}{span}{flag}]", sub, st.get("cap", "")))
                report.setdefault(n, []).append({"t": t, "label": lab, "theme": used,
                                                "requested_theme": requested, "theme_run": run, **st})
            cols = 4
            rows = (len(cells) + cols - 1) // cols
            h = cells[0][0].height
            sheet = Image.new("RGB", (cols * a.w, rows * (h + 66)), "white")
            d = ImageDraw.Draw(sheet)
            for i, (im, l1, l2, cap) in enumerate(cells):
                x, y = (i % cols) * a.w, (i // cols) * (h + 66)
                d.text((x + 6, y + 2), l1, fill="black", font=f)
                d.text((x + 6, y + 22), l2, fill="#555", font=f)
                d.text((x + 6, y + 42), cap[:40], fill="#1F5566", font=f)
                sheet.paste(im, (x, y + 66))
            path = output / f"board_{n}.jpg"
            sheet.save(path, quality=86)
            print(path)
        await browser.close()
    (output / "board.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))
    for issue in errors:
        print(f"ERR {issue}")
    raise SystemExit(int(bool(errors)))


ap = argparse.ArgumentParser()
ap.add_argument("html", type=str)
ap.add_argument("--build", required=True)
ap.add_argument("--out", type=str, required=True)
ap.add_argument("--scene")
ap.add_argument("--w", type=int, default=480)
asyncio.run(main(a=ap.parse_args()))
