"""Capture composed browser frames at explicit video times."""

import argparse
import asyncio
import base64
import bisect
from concurrent.futures import ProcessPoolExecutor
import glob
import io
import json
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
# A page that starts in the middle of a scene paints text it never saw fading in differently (anti-aliasing of
# labels shown earlier in the scene), so a frame would depend on where its worker started. Every worker therefore
# draws, without capturing, the frames from the start of the scene up to its first frame; a drawn-only frame costs
# about this share of a captured one (measured: draw 35-45 ms, screenshot and write 120-190 ms per frame).
DRAW_ONLY_COST = 0.25

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


def scene_starts(html, fps):
    """First frame of every scene from the timeline.json beside the scene file; without one the video is one scene."""
    starts = {0}
    timeline = html.parent / "timeline.json"
    if timeline.exists():
        modules = json.loads(timeline.read_text(encoding="utf-8")).get("modules", {})
        starts |= {round(module["start"] * fps) for module in modules.values()}
    return sorted(starts)


def scene_start(starts, frame):
    return starts[bisect.bisect_right(starts, frame) - 1]


def draw_from(starts, last, frame):
    """First frame a page that last drew `last` (None: nothing yet) must draw so that `frame` looks as in one run."""
    start = scene_start(starts, frame)
    return start if last is None or last < start or last >= frame else last + 1


def plan(frames, starts, jobs, done):
    """Split the frames into at most `jobs` contiguous batches with the smallest largest cost, where a captured frame
    costs 1 and a frame drawn only to bring the page up to it costs DRAW_ONLY_COST; frames already on disk are drawn
    only."""
    count = len(frames)
    own = [DRAW_ONLY_COST if frame in done else 1 for frame in frames]
    first = [(frame - scene_start(starts, frame)) * DRAW_ONLY_COST + own[k] for k, frame in enumerate(frames)]
    total = [0.0]   # total[k]: cost of frames[0:k] drawn in one run, so a batch frames[i:j] costs first[i] + total[j] - total[i + 1]
    last = None
    for k, frame in enumerate(frames):
        total.append(total[-1] + (frame - draw_from(starts, last, frame)) * DRAW_ONLY_COST + own[k])
        last = frame

    def reach(i, limit):
        """End (exclusive) of the longest batch starting at index i that stays within the limit."""
        low, high = i + 1, count
        while low < high:
            middle = (low + high + 1) // 2
            if first[i] + total[middle] - total[i + 1] <= limit:
                low = middle
            else:
                high = middle - 1
        return low

    def cuts(limit):
        """Batch starts that cover every frame in the fewest batches, or None if more than `jobs` are needed. Any
        index up to the furthest end reachable with k batches can start batch k + 1, so take the start that reaches
        furthest each time."""
        if any(value > limit for value in first):
            return None
        bounds, end, scanned, best, best_end = [0], reach(0, limit), 1, 0, 0
        while end < count:
            if len(bounds) == jobs:
                return None
            for start in range(scanned, end + 1):
                ends = reach(start, limit)
                if ends > best_end:
                    best, best_end = start, ends
            scanned = end + 1
            bounds.append(best)
            end = best_end
        return bounds

    low, high = max(first), first[0] + total[count] - total[1]
    for _ in range(50):
        middle = (low + high) / 2
        if cuts(middle) is not None:
            high = middle
        else:
            low = middle
    bounds = cuts(high) + [count]
    return [frames[bounds[k]:bounds[k + 1]] for k in range(len(bounds) - 1)]


async def capture(args, html, out, batches, starts):
    errors = []
    totals = [0.0, 0.0, 0.0]
    count = 0
    drawn_only = 0
    renderer = None

    async with async_playwright() as playwright:
        async def worker(wid, batch):
            nonlocal count, renderer, drawn_only
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
                last = None
                for frame in batch:
                    target = out / f"f_{frame:05d}.png"
                    if args.skip_existing and target.exists() and target.stat().st_size > 0:
                        continue
                    first = draw_from(starts, last, frame)
                    if last is None:
                        await warm_canvas(page, protocol, first / args.fps, wid)
                    for earlier in range(first, frame):
                        await page.evaluate(RENDER_JS, earlier / args.fps)
                        drawn_only += 1
                    last = frame
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
    return count, totals, renderer, drawn_only


def capture_part(args, html, out, batches, starts):
    return asyncio.run(capture(args, html, out, batches, starts))


def capture_all(args, html, out, frames, jobs):
    starts = scene_starts(html, args.fps)
    done = {frame for frame in frames if args.skip_existing and (out / f"f_{frame:05d}.png").exists()
            and (out / f"f_{frame:05d}.png").stat().st_size > 0}
    batches = list(enumerate(plan(frames, starts, jobs, done)))
    jobs = len(batches)
    processes = -(-jobs // BROWSERS_PER_PROCESS)
    groups = [batches[k::processes] for k in range(processes)]
    began = time.perf_counter()
    if processes == 1:
        results = [capture_part(args, html, out, groups[0], starts)]
    else:
        with ProcessPoolExecutor(processes, mp_context=multiprocessing.get_context("spawn")) as pool:
            results = list(pool.map(capture_part, [args] * processes, [html] * processes, [out] * processes, groups,
                                    [starts] * processes))
    wall = time.perf_counter() - began
    count = sum(result[0] for result in results)
    totals = [sum(result[1][k] for result in results) for k in range(3)]
    renderer = results[0][2]
    drawn_only = sum(result[3] for result in results)
    print(f"Browser renderer: {renderer}")
    print(f"Captured {count} frames; bounds {frames[0]}..{frames[-1]}; {args.fps} fps; {jobs} workers in {processes} processes; elapsed {wall:.1f} s")
    print(f"Drawn without capture to start each batch from its scene start: {drawn_only} frames; batch starts {[batch[0] for _, batch in batches]}")
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
