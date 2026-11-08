"""Capture composed browser frames at explicit video times."""

import argparse
import asyncio
import base64
from concurrent.futures import ProcessPoolExecutor
import glob
import io
import multiprocessing
import os
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import workers  # noqa: E402

# One Python process decodes and writes every frame of its browsers; past about four browsers that one process
# becomes the queue, so larger --jobs runs several processes of up to this many browsers each.
BROWSERS_PER_PROCESS = 4

from PIL import Image
from playwright.async_api import async_playwright


CHROME = os.environ.get("RV_CHROME")
if not CHROME:
    _installed = sorted(glob.glob(os.path.expanduser(
        "~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome"
    )))
    CHROME = _installed[-1] if _installed else None
CHROME_ARGS = [
    "--use-gl=angle",
    "--use-angle=gl-egl",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--font-render-hinting=none",
]

RENDER_JS = """async seconds => {
    await window.renderAt(seconds);
    await new Promise(done => {
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
    });
}"""

RENDERER_JS = """() => {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") || probe.getContext("webgl");
    if (!gl) return "NO WEBGL";
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
}"""


async def warm_canvas(
    page, cdp, t, wid=0
):
    await page.evaluate("""() => {
        document.body.style.background = "#ff00ff";
        const rule = document.createElement("style");
        rule.id = "__warm";
        rule.textContent = "body *:not(#stage):not(canvas){visibility:hidden!important}";
        document.head.appendChild(rule);
    }""")
    good = 0
    for attempt in range(1, 301):
        await page.evaluate(expression=RENDER_JS, arg=t)
        shot = await cdp.send("Page.captureScreenshot", {
            "format": "png",
            "clip": {"x": 0, "y": 0, "width": 4, "height": 4, "scale": 1},
        })
        image = Image.open(io.BytesIO(base64.b64decode(shot["data"]))).convert("RGB")
        red, green, blue = image.getpixel((1, 1))
        good = 0 if red > 200 and green < 60 and blue > 200 else good + 1
        if good == 3:
            await page.evaluate("""() => {
                document.body.style.background = "";
                document.getElementById("__warm").remove();
            }""")
            return
    raise RuntimeError(f"Worker {wid}: canvas composition did not settle after 300 attempts")


async def capture(args, html, out, batches):
    errors = []
    totals = [0.0, 0.0, 0.0]
    count = 0
    renderer = None

    async with async_playwright() as playwright:
        async def worker(wid, batch):
            nonlocal count, renderer
            browser = await playwright.chromium.launch(
                executable_path=CHROME, headless=True, args=CHROME_ARGS)
            try:
                page = await browser.new_page(
                    viewport={"width": args.width, "height": args.height},
                    device_scale_factor=1)
                page.on("pageerror", lambda error: errors.append(
                    f"Worker {wid} pageerror: {error}"))

                def console(message):
                    if message.type == "error":
                        errors.append(f"Worker {wid} console.error: {message.text}")
                    elif wid == 0 and message.type == "warning":
                        print("Scene warning: " + message.text, file=sys.stderr)

                page.on("console", console)
                await page.goto(html.as_uri(), wait_until="load")
                await page.evaluate("document.fonts.ready")
                await page.evaluate("""async () => {
                    if (window.renderReady !== undefined) await window.renderReady;
                }""")
                if not await page.evaluate('typeof window.renderAt === "function"'):
                    raise RuntimeError("The scene must provide a window.renderAt function")
                if wid == 0:
                    renderer = await page.evaluate(RENDERER_JS)
                protocol = await page.context.new_cdp_session(page=page)
                await warm_canvas(page, protocol, batch[0] / args.fps, wid)
                for frame in batch:
                    target = out / f"f_{frame:05d}.png"
                    if args.skip_existing and target.exists() and target.stat().st_size > 0:
                        continue
                    tick = time.perf_counter()
                    await page.evaluate(RENDER_JS, frame / args.fps)
                    drawn = time.perf_counter()
                    shot = await protocol.send("Page.captureScreenshot", {
                        "format": "png", "optimizeForSpeed": True,
                        "captureBeyondViewport": False,
                    })
                    snapped = time.perf_counter()
                    partial = target.with_suffix(".png.part")
                    partial.write_bytes(base64.b64decode(shot["data"]))
                    partial.replace(target)
                    written = time.perf_counter()
                    totals[0] += drawn - tick
                    totals[1] += snapped - drawn
                    totals[2] += written - snapped
                    count += 1
                    if errors:
                        raise RuntimeError(next(iter(errors)))
            finally:
                await browser.close()

        await asyncio.gather(*(worker(wid, batch) for wid, batch in batches))
    return count, totals, renderer


def capture_part(args, html, out, batches):
    return asyncio.run(capture(args, html, out, batches))


def capture_all(args, html, out, frames, jobs):
    quotient, remainder = divmod(len(frames), jobs)
    batches, offset = [], 0
    for wid in range(jobs):
        size = quotient + (wid < remainder)
        batches.append((wid, frames[offset:offset + size]))
        offset += size
    processes = -(-jobs // BROWSERS_PER_PROCESS)
    groups = [batches[k::processes] for k in range(processes)]
    began = time.perf_counter()
    if processes == 1:
        results = [capture_part(args, html, out, groups[0])]
    else:
        with ProcessPoolExecutor(processes, mp_context=multiprocessing.get_context("spawn")) as pool:
            results = list(pool.map(capture_part, [args] * processes, [html] * processes, [out] * processes, groups))
    wall = time.perf_counter() - began
    count = sum(result[0] for result in results)
    totals = [sum(result[1][k] for result in results) for k in range(3)]
    renderer = results[0][2]
    print(f"Browser renderer: {renderer}")
    print(f"Captured {count} frames; bounds {frames[0]}..{frames[-1]}; {args.fps} fps; {jobs} workers in {processes} processes; elapsed {wall:.1f} s")
    if count:
        render_ms, shot_ms, write_ms = (value * 1000 / count for value in totals)
        print(f"Mean worker milliseconds: render {render_ms:.1f}, screenshot {shot_ms:.1f}, write {write_ms:.1f}; throughput {count / wall:.1f} frames/s; elapsed {wall * 1000 / count:.1f} ms/frame")
    if "SwiftShader" in renderer or "llvmpipe" in renderer or renderer == "NO WEBGL":
        print("Software graphics detected; rendering speed and pixels may differ from a GPU", file=sys.stderr)
    missing = [frame for frame in frames if not (out / f"f_{frame:05d}.png").exists()]
    if missing:
        sys.exit(f"Missing {len(missing)} requested frames; examples: {missing[:5]}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("html")
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--start", type=float, default=0.0)
    parser.add_argument("--end", type=float, default=60.0)
    parser.add_argument("--out", default=str(Path(__file__).parent / "frames"))
    parser.add_argument("--jobs", type=int, default=None,
                        help="browsers at once (default: from this machine's cores and free memory, lib/workers.py)")
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--frames", default="")
    args = parser.parse_args()
    html, out = Path(args.html).resolve(), Path(args.out).resolve()
    if html.exists() is False:
        sys.exit(f"Scene input does not exist: {html}")
    out.mkdir(exist_ok=True, parents=True)
    if args.frames:
        frames = sorted({int(value) for value in args.frames.split(",") if value.strip()})
        frames[0], frames[-1]
    else:
        frames = list(range(round(args.start * args.fps), round(args.end * args.fps)))
        if not frames:
            sys.exit("No frames in the requested interval; choose an earlier start or later end")
    jobs = min(len(frames), max(1, args.jobs if args.jobs is not None else workers.capture_jobs()))
    capture_all(args, html, out, frames, jobs)


if __name__ == "__main__":
    main()
