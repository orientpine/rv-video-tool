"""Extract scene camera cuts as absolute video times."""

import argparse
import asyncio
import json
from pathlib import Path

from capture import CHROME, CHROME_ARGS
from playwright.async_api import async_playwright


async def main(args):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path=CHROME, headless=True, args=CHROME_ARGS)
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})
        await page.goto(Path(args.html).resolve().as_uri(), wait_until="load")
        cuts = await page.evaluate("""async () => {
            await Promise.resolve(window.renderReady);
            const modules = window.DATA.timeline.modules;
            const cuts = [];
            for (const [scene, times] of Object.entries(window.SHOTCUTS || {})) {
                for (const time of times) {
                    cuts.push({scene, t: Number((modules[scene].start + time).toFixed(4))});
                }
            }
            cuts.sort((left, right) => left.t - right.t);
            return cuts;
        }""")
        await browser.close()
    Path(args.out).write_text(json.dumps({"cuts": cuts}, ensure_ascii=False, indent=1))
    print(f"Saved {len(cuts)} camera cuts to {args.out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("html")
    parser.add_argument("--out", required=True)
    asyncio.run(main(parser.parse_args()))
