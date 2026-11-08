"""Compare sampled page highlights against the embedded word timing data."""

import argparse
import asyncio
import json
from pathlib import Path
import tempfile

from capture import CHROME, CHROME_ARGS
from playwright.async_api import async_playwright


def embedded_data(html):
    lines = Path(html).read_text(encoding="utf-8").split("\n")
    index = next(i for i, line in enumerate(lines) if line.startswith("window.DATA="))
    return lines, index, json.loads(lines[index][len("window.DATA="):-1])


def mutate(html, how):
    lines, index, data = embedded_data(html)
    if how in ("shift",):
        for line in data["words"]["lines"]:
            for word in line["words"]:
                word["t_scene"] += 1.2
    value = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    lines[index] = "window.DATA=" + value + ";"
    target = Path(tempfile.mkdtemp()) / "video_shift.html"
    target.write_text("\n".join(lines), encoding="utf-8")
    return target


async def sample(html, scenes, tl):
    rows, errors = {}, []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path=CHROME, headless=True, args=CHROME_ARGS)
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text)
                if message.type == "error" else None)
        await page.goto(Path(html).resolve().as_uri(), wait_until="load")
        await page.evaluate("Promise.resolve(window.renderReady)")
        for scene in scenes:
            module = tl["modules"][scene]
            rows[scene] = await page.evaluate("""async ({start, duration}) => {
                const rows = [];
                for (let i = 0; i * (1 / 30) < duration; i++) {
                    const relative = i / 30;
                    await window.renderAt(start + relative);
                    rows.push([relative, window.HL || ""]);
                }
                return rows;
            }""", {"start": module["start"], "duration": module["duration"]})
        await browser.close()
    return rows, errors


async def main(args):
    _, _, data = embedded_data(args.html)
    timeline = data["timeline"]
    lines = data["words"]["lines"]
    scenes = args.scene or [
        scene for scene in timeline["order"]
        if any(line["scene"] == scene and line["words"] for line in lines)
    ]
    html = mutate(args.html, args.mutate) if args.mutate else Path(args.html)
    rows, errors = await sample(html, scenes, timeline)
    details, failures = [], []
    for line in lines:
        scene = line["scene"]
        if scene not in scenes:
            continue
        for word in line["words"]:
            text, expected = word["word"], word["t_scene"]
            found = next((t for t, highlight in rows[scene] if highlight == text), None)
            difference = found - expected if found is not None else None
            passed = difference is not None and abs(difference) <= args.tol
            if not passed:
                failures.append(f"{scene}:{text}")
            highlight = f"{found:6.2f} s" if found is not None else "missing"
            delta = f"{difference:+.2f}" if difference is not None else "-"
            details.append(
                f"  {scene:<10} {text:<14} expected {expected:6.2f} s  observed {highlight}  delta {delta}  "
                + ("ok" if passed else "FAIL"))
    name = "shifted" if args.mutate else "baseline"
    print(f"SYNC_CHECK {name}: scenes={len(scenes)}, words={len(details)}, errors={len(errors)}")
    print("\n".join(details))
    passed = bool(details) and not failures and not errors
    verdict = f"SYNC_CHECK {name} " + ("PASS" if passed else "FAIL")
    if failures:
        verdict += f" ({len(failures)} failed words: {', '.join(failures[:8])})"
    if errors:
        verdict += f" browser errors: {errors[:2]}"
    print(verdict)
    return int(not passed)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("html")
    parser.add_argument("--scene", nargs="*")
    parser.add_argument("--mutate", choices=["shift"])
    parser.add_argument("--tol", type=float, default=0.5)
    raise SystemExit(asyncio.run(main(parser.parse_args())))
