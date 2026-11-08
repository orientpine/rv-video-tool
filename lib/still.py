"""Save viewport images and scene state for an ordered list of times."""

import argparse
import asyncio
import json
from pathlib import Path

from capture import CHROME, CHROME_ARGS, RENDER_JS, warm_canvas
from playwright.async_api import async_playwright


async def main(args):
    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True)
    times = list(args.t or [])
    if args.every:
        current = args.from_
        while current <= args.to + 1e-9:
            times.append(round(current, 3))
            current += args.every
    errors = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path=CHROME, headless=True, args=CHROME_ARGS)
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})
        page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
        page.on("console", lambda message: errors.append("console.error: " + message.text)
                if message.type == "error" else None)
        await page.goto(Path(args.html).resolve().as_uri(), wait_until="load")
        await page.evaluate("Promise.resolve(window.renderReady)")
        await warm_canvas(page, await page.context.new_cdp_session(page), times[0])
        for seconds in times:
            await page.evaluate(RENDER_JS, seconds)
            state = await page.evaluate("() => ({HL: window.HL ?? null, SIM: window.SIMSTATE ?? null})")
            target = output / f"t{seconds:07.2f}.png"
            await page.screenshot(path=str(target))
            print(json.dumps({"t": seconds, **state, "png": str(target)}, ensure_ascii=False))
        await browser.close()
    for error in errors:
        print("ERR", error)
    return int(bool(errors))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("html")
    parser.add_argument("--out", required=True)
    parser.add_argument("--t", nargs="*", type=float)
    parser.add_argument("--every", type=float)
    parser.add_argument("--from", dest="from_", type=float, default=0)
    parser.add_argument("--to", type=float, default=0)
    raise SystemExit(asyncio.run(main(parser.parse_args())))
