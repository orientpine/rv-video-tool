"""Inspect adjacent-frame luma changes or dispatch to theme inspection."""
import argparse
import json
import math
import re
import subprocess
import tempfile
from pathlib import Path
from dataclasses import dataclass
from statistics import median
from typing import Final

# allow: SIZE_OK — Existing picture, HTML, and cuts CLI modes share this entrypoint;
# this change is restricted to this file and its shell test by the worktree owner.
LINEAR: Final = tuple(v / 255 / 12.92 if v / 255 <= .04045
                      else ((v / 255 + .055) / 1.055) ** 2.4 for v in range(256))

def picture_metrics(rgb):
    """Measured white definition: min(RGB) > 170 and RGB spread < 30. A
    "white relief" pallet and 5 mm close-ups are 170-200 grey-white, which the earlier luma > 200 rule missed."""
    white = 0
    for r, g, b in zip(rgb[0::3], rgb[1::3], rgb[2::3]):
        white += min(r, g, b) > 170 and max(r, g, b) - min(r, g, b) < 30
    return white / (len(rgb) // 3)


def decoded_frames(video, filters, size):
    with tempfile.TemporaryFile() as error:
        process = subprocess.Popen(["ffmpeg", "-nostdin", "-v", "error", "-threads", "2",
                                    "-i", str(video), "-an", "-vf", filters, "-threads", "2",
                                    "-f", "rawvideo", "-"], stdout=subprocess.PIPE, stderr=error)
        try:
            while frame := process.stdout.read(size):
                if len(frame) != size:
                    raise RuntimeError("incomplete decoded video frame")
                yield frame
            if process.wait():
                error.seek(0)
                raise RuntimeError(error.read().decode(errors="replace").strip())
        finally:
            process.stdout.close()
            if process.poll() is None:
                process.kill()
            process.wait()


def picture_runs(ratios, duration, majority=True):
    # Three-sample majority at 4 fps removes isolated 0.25 s threshold noise;
    # two-sample (0.5 s) flashes survive and remain hold violations.
    raw = [ratio > 0.25 for ratio in ratios]
    smooth = [sum(raw[max(0, min(len(raw) - 1, i + d))] for d in (-1, 0, 1)) >= 2
              for i in range(len(raw))] if majority else raw
    runs = []
    for i, white in enumerate(smooth):
        look = "white" if white else "real"
        if not runs or runs[-1]["look"] != look:
            runs.append({"look": look, "start": i / 4, "end": 0,
                         "scenes": [f"{look}@{i / 4:.2f}"]})
        runs[-1]["end"] = min(duration, (i + 1) / 4)
    return runs


@dataclass(frozen=True, slots=True)
class BrightRun:
    """A measured bright interval or a separately reported flash."""
    start: float
    end: float


@dataclass(frozen=True, slots=True)
class FatiguePlacementError(RuntimeError):
    """A white-safe mutation must retain at least two complete blocks."""
    block_count: int

    def __str__(self) -> str:
        return f"fatigue mutation needs >=2 complete white-safe blocks; found {self.block_count}"


@dataclass(frozen=True, slots=True)
class Fatigue:
    """Registered display adaptation measurements, independent of white classification."""
    unadapted: float
    percent: float
    worst60: float
    at: float
    median_luminance: float
    bright_runs: int
    bright_intervals: tuple[BrightRun, ...]
    flashes: tuple[BrightRun, ...]
    errors: tuple[str, ...]


def picture_fatigue(luminances: list[float], duration: float) -> Fatigue:
    """Integrate log luminance adaptation at the same four samples per second."""
    from build import theme_violations
    adaptation = math.log10(luminances[0])
    cumulative = [0.0]
    for i, luminance in enumerate(luminances):
        target = math.log10(luminance)
        dt = min(.25, max(0, duration - i / 4))
        tau = 5 if target > adaptation else 20
        adaptation += (target - adaptation) * -math.expm1(-dt / tau)
        cumulative.append(cumulative[-1] + (dt if abs(target - adaptation) > math.log10(3) else 0))
    worst, index = max((cumulative[min(len(luminances), i + 240)] - cumulative[i], -i)
                       for i in range(len(luminances)))
    percent = cumulative[-1] / duration * 100
    errors = []
    if percent > 15:
        errors.append(f"total {percent:.3f}% >15%")
    if worst > 25:
        errors.append(f"window60 {worst:.3f}s >25s at {-index / 4:.2f}s")
    active, states = False, []
    for i in range(len(luminances)):
        smoothed = median(luminances[max(0, min(len(luminances) - 1, i + d))]
                          for d in (-1, 0, 1))
        active = smoothed > 80 or (active and smoothed >= 64)
        states.append(active)
    bright = picture_runs(states, duration, majority=False)
    # A dark gap under 2 s inside joins the bright runs; a fade under 2 s at either end joins
    # the bright run next to it only when that run is not itself a flash under 2 s.
    for i, run in enumerate(bright if len(bright) > 1 else []):
        near = bright[1] if i == 0 else bright[-2] if i == len(bright) - 1 else None
        if near and near["end"] - near["start"] < 2:
            continue
        if run["look"] == "real" and run["end"] - run["start"] < 2:
            first, end = int(run["start"] * 4), math.ceil(run["end"] * 4)
            states[first:end] = [True] * (end - first)
    bright = picture_runs(states, duration, majority=False)
    flashes = tuple(BrightRun(r["start"], r["end"]) for r in bright
                    if r["look"] == "white" and r["end"] - r["start"] < 2)
    for flash in flashes:
        first, end = int(flash.start * 4), min(len(states), math.ceil(flash.end * 4))
        states[first:end] = [False] * (end - first)
    bright = picture_runs(states, duration, majority=False)
    intervals = tuple(BrightRun(r["start"], r["end"]) for r in bright if r["look"] == "white")
    errors.extend("bright_" + error for error in theme_violations(bright))
    return Fatigue(unadapted=cumulative[-1], percent=percent, worst60=worst, at=-index / 4,
                   median_luminance=median(luminances), bright_runs=len(intervals),
                   bright_intervals=intervals, flashes=flashes, errors=tuple(errors))


def merge_dips(runs, jumps, limit):
    """A real run under 2 s whose edges stay within the luma-jump limit is a fade
    through dark (a scene dip, or the fade in/out at either end), not a theme."""
    merged, dips = [], []
    for i, run in enumerate(runs):
        edges = [jumps[r["start"]] for r in (run, runs[i + 1] if i + 1 < len(runs) else None)
                 if r is not None and r["start"] in jumps]
        if (len(runs) > 1 and run["look"] == "real" and run["end"] - run["start"] < 2
                and edges and max(e["max_luma_jump"] for e in edges) <= limit):
            dips.append({"start": run["start"], "end": run["end"],
                         "max_luma_jump": max(e["max_luma_jump"] for e in edges)})
            run = {**run, "look": "white", "scenes": []}
        if merged and merged[-1]["look"] == run["look"]:
            merged[-1]["end"] = run["end"]
            merged[-1]["scenes"] += run["scenes"]
        else:
            merged.append({**run, "scenes": list(run["scenes"])})
    for run in merged:
        run["scenes"] = run["scenes"] or [f"{run['look']}@{run['start']:.2f}"]
    return merged, dips


def inspect_picture(video, evidence=None, limit=12.0):
    from fractions import Fraction
    from build import theme_violations
    info = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
        "stream=avg_frame_rate,duration:format=duration", "-of", "json", str(video)], text=True))
    stream = info["streams"][0]
    duration = float(stream.get("duration") or info["format"]["duration"])
    fps = float(Fraction(stream["avg_frame_rate"]))
    frames = decoded_frames(video, "fps=4,scale=96:54,format=rgb24", 96 * 54 * 3)
    ratios, luminances = [], []
    for frame in frames:
        ratios.append(picture_metrics(frame))
        mean_y = sum(.2126 * LINEAR[r] + .7152 * LINEAR[g] + .0722 * LINEAR[b]
                     for r, g, b in zip(frame[0::3], frame[1::3], frame[2::3])) / (96 * 54)
        luminances.append(.5 + 200 * mean_y)
    if not ratios:
        raise RuntimeError("no decoded picture samples")
    runs = picture_runs(ratios, duration)
    switches = [r["start"] for r in runs[1:]]
    measurements, dips = [], []
    if switches:
        # Do not apply a per-frame limit to 0.25 s sample differences: that would
        # reject a valid slow dissolve. Decode native-rate mean luma separately.
        luma = [sum(frame) / len(frame) for frame in decoded_frames(
            video, f"fps={fps:.9f},scale=160:90:flags=area,format=gray", 160 * 90)]
        for boundary in switches:
            first = max(1, int((boundary - 2) * fps))
            end = min(len(luma), int((boundary + 2) * fps) + 1)
            peak, at = max((abs(luma[i] - luma[i - 1]), i / fps) for i in range(first, end))
            measurements.append({"boundary": boundary, "max_luma_jump": peak, "at": at})
        runs, dips = merge_dips(runs, {m["boundary"]: m for m in measurements}, limit)
        kept = {r["start"] for r in runs[1:]}
        measurements = [m for m in measurements if m["boundary"] in kept]
    errors = theme_violations(runs)
    result = {"mode": "picture", "video": str(video), "duration": duration, "fps": fps,
              "sample_fps": 4, "min_rgb": 170, "max_rgb_spread": 30, "sample_size": "96x54",
              "white_ratio_threshold": 0.25, "smoothing": "3-sample majority",
              "ratios": ratios, "luminances": luminances, "runs": runs, "dips": dips,
              "measurements": measurements, "errors": errors}
    from dataclasses import asdict
    result["fatigue"] = asdict(picture_fatigue(luminances, duration))
    if evidence:
        evidence = Path(evidence)
        evidence.mkdir(parents=True, exist_ok=True)
        # Save representative source pictures, not a rendered script-plan proxy.
        for i, run in enumerate(r for r in runs if r["look"] == "white"):
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss",
                            str((run["start"] + run["end"]) / 2), "-i", str(video),
                            "-frames:v", "1", "-vf", "scale=480:-2",
                            str(evidence / f"white-{i:02d}.png")], check=True)
    return result


def check_picture(a):
    source = Path(a.mp4 or a.video).resolve()
    try:
        original = inspect_picture(source, a.evidence if not a.mutate else None, a.limit)
        result, injected = original, []
        if a.mutate == "fatigue":
            duration = original["duration"]
            median_luminance = original["fatigue"]["median_luminance"]
            color = "0x101828" if median_luminance > 40 else "0xb9d2f0"
            scale = min(1, duration / 86)
            for planned in range(10, math.ceil(duration / scale) - 15, 60):
                start = planned * scale
                # Runs are chronological: moving right cannot hit an earlier run again.
                for run in original["runs"]:
                    if (run["look"] == "white" and start <= run["end"] and
                            start + 16 * scale >= run["start"]):
                        start = run["end"] + 2
                # Two planned blocks pushed past the same white run land on one spot: count it once.
                if start + 16 * scale <= duration and not (injected and start < injected[-1][1] + 4 * scale):
                    injected.append((start, start + 12 * scale))
            if len(injected) < 2:
                raise FatiguePlacementError(len(injected))
            filters = ["[1:v][0:v]scale2ref[block][source]",
                       "[block]format=yuva420p,split=" + str(len(injected)) +
                       "".join(f"[color{i}]" for i in range(len(injected)))]
            previous = "[source]"
            for i, (start, end) in enumerate(injected):
                filters.append(f"[color{i}]fade=t=in:st={start}:d={2 * scale}:alpha=1,"
                               f"fade=t=out:st={end + 2 * scale}:d={2 * scale}:alpha=1[block{i}]")
                filters.append(f"{previous}[block{i}]overlay=shortest=1:"
                               f"enable='between(t,{start},{end + 4 * scale})'[v{i}]")
                previous = f"[v{i}]"
            with tempfile.TemporaryDirectory(prefix="rv-fatigue-mutation-") as tmp:
                mutant = Path(tmp) / "fatigue.mp4"
                subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(source),
                                "-f", "lavfi", "-i", f"color=c={color}:s=96x54:r={original['fps']}",
                                "-filter_complex_threads", "1", "-filter_complex", ";".join(filters),
                                "-map", previous,
                                "-an", "-c:v", "libx264", "-threads", "2",
                                "-preset", "ultrafast", "-crf", "18", str(mutant)], check=True)
                result = inspect_picture(mutant, a.evidence, a.limit)
            white_before = sum(r["look"] == "white" for r in original["runs"])
            white_after = sum(r["look"] == "white" for r in result["runs"])
            result["mutation"] = {"color": color, "median_luminance": median_luminance,
                                  "blocks": injected, "white_before": white_before,
                                  "white_after": white_after}
            print(f"THEME_MUTATION fatigue blocks={len(injected)} color={color}"
                  f" starts={','.join(f'{start:.3f}' for start, _ in injected)}"
                  f" median_L={median_luminance:.3f}cd/m2 white_runs={white_before}->{white_after}")
        elif a.mutate:
            # Toggle four short blocks inside the longest stable picture run.
            # This also works on a uniformly white source by inserting dark blocks.
            run = max(original["runs"], key=lambda r: r["end"] - r["start"])
            span = run["end"] - run["start"]
            if span < 8:
                raise RuntimeError("theme mutation needs a stable picture run >=8s")
            length = min(2, span / 20)
            injected = [(run["start"] + span * f, run["start"] + span * f + length)
                        for f in (.15, .35, .55, .75)]
            color = "0xeeeeee" if run["look"] == "real" else "0x203848"
            filters = ",".join(f"drawbox=x=0:y=0:w=iw:h=ih:color={color}:t=fill:"
                               f"enable='gte(t,{start:.6f})*lt(t,{end:.6f})'"
                               for start, end in injected)
            with tempfile.TemporaryDirectory(prefix="rv-theme-mutation-") as tmp:
                mutant = Path(tmp) / "theme.mp4"
                subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(source),
                                "-an", "-vf", filters, "-c:v", "libx264", "-threads", "2",
                                "-preset", "ultrafast", "-crf", "18", str(mutant)], check=True)
                result = inspect_picture(mutant, a.evidence, a.limit)
            print(f"THEME_MUTATION blocks={len(injected)} color={color}")
        for measurement in result["measurements"]:
            if measurement["max_luma_jump"] > a.limit:
                result["errors"].append(f"luma jump {measurement['max_luma_jump']:.3f} >{a.limit:g}"
                                        f" at {measurement['at']:.3f}s")
        print(f"THEME_PICTURE samples={len(result['ratios'])} fps=4 96x54 min(RGB)>170 spread<30 ratio>0.25 smooth=3")
        for run in result["runs"]:
            if run["look"] == "white":
                print(f"THEME_WHITE {run['start']:.2f}-{run['end']:.2f}s hold={run['end'] - run['start']:.2f}s")
        for dip in result["dips"]:
            print(f"THEME_DIP {dip['start']:.2f}-{dip['end']:.2f}s max_luma_jump={dip['max_luma_jump']:.3f}/255"
                  f" (fade under 2 s, not a switch)")
        print(f"THEME_PICTURE_PLAN switches={len(result['runs']) - 1} min_hold=12s max=2/60s")
        for row in result["measurements"]:
            print(f"THEME_PICTURE_BLEND t={row['boundary']:.2f} max_luma_jump={row['max_luma_jump']:.3f}/255"
                  f" at={row['at']:.3f} limit={a.limit:g}")
        for error in result["errors"]:
            print("THEME_VIOLATION", error)
        fatigue = result["fatigue"]
        print("THEME_FATIGUE_MODEL L=0.5+200*meanY tau_up=5 tau_down=20 unadapted>0.477"
              " limits total<=15% window60<=25s bright_enter>80 exit<64 gap<2s flash<2s")
        print(f"THEME_FATIGUE unadapted={fatigue['unadapted']:.3f}s ({fatigue['percent']:.3f}%)"
              f" worst60={fatigue['worst60']:.3f}s at={fatigue['at']:.2f}"
              f" median_L={fatigue['median_luminance']:.3f}cd/m2 bright_runs={fatigue['bright_runs']}")
        for flash in fatigue["flashes"]:
            print(f"THEME_FATIGUE_FLASH {flash['start']:.2f}-{flash['end']:.2f}s"
                  f" hold={flash['end'] - flash['start']:.2f}s")
        for error in fatigue["errors"]:
            print("THEME_FATIGUE_VIOLATION", error)
        print("THEME_FATIGUE " + ("FAIL" if fatigue["errors"] else "PASS"))
        failed = bool(result["errors"] or fatigue["errors"])
        print("THEME_CHECK " + ("FAIL" if failed else "PASS"))
        # Existing findings alone cannot satisfy the mutation protocol.
        caught = a.mutate == "theme" and failed and any(
            r["look"] != run["look"] and r["end"] - r["start"] < 12 and
            any(r["start"] < end and r["end"] > start for start, end in injected)
            for r in result["runs"])
        if caught:
            print("MUTATION_CAUGHT")
        if a.mutate == "fatigue" and fatigue["errors"] and white_before == white_after:
            print("MUTATION_CAUGHT fatigue")
        if a.evidence:
            (Path(a.evidence) / "theme-picture.json").write_text(json.dumps(result, indent=2))
        return 1 if failed else 0
    except FatiguePlacementError as error:
        print(f"THEME_MUTATION_SKIP fatigue: {error} (video {original['duration']:.1f}s)")
        print("MUTATION_SKIP")
        return 0
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.CalledProcessError) as error:
        print("THEME_PICTURE_ERROR", error)
        print("THEME_CHECK FAIL")
        return 1


async def check_theme(a):
    import io
    import math
    from PIL import Image, ImageStat
    from playwright.async_api import async_playwright
    from capture import CHROME, CHROME_ARGS, RENDER_JS, warm_canvas
    from build import theme_runs, theme_violations

    errors, measured = [], []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True, args=CHROME_ARGS, executable_path=CHROME,
        )
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})
        page.on("pageerror", lambda e: errors.append("PAGE_ERROR " + str(e)))
        await page.goto(Path(a.video).resolve().as_uri(), wait_until="load")
        await page.evaluate("Promise.resolve(window.renderReady)")
        tl, looks, plan = await page.evaluate("[window.TIMELINE, window.SCENE_LOOK||{}, window.THEME_PLAN||null]")
        runs = theme_runs(tl, looks)
        errors.extend(theme_violations(runs))
        switches = [r["start"] for r in runs[1:]]
        print(f"THEME_PLAN switches={len(switches)} min_hold=12s max=2/60s")
        if not switches:
            await browser.close()
            print("THEME_CHECK 실제 SKIP no theme changes")
            return 0
        blend = plan["blend_s"] if plan else 2.0
        if blend < 1.5:
            errors.append(f"blend {blend}s <1.5s")
        if a.mutate:
            await page.evaluate("window.__THEME_HARD_CUT=true")
        await warm_canvas(page, await page.context.new_cdp_session(page), max(0.1, switches[0] - 1))
        output = Path(a.evidence) if a.evidence else None
        if output:
            output.mkdir(parents=True, exist_ok=True)
        for index, boundary in enumerate(switches):
            fps = tl.get("fps", 30)
            first = math.floor(boundary * fps) - 1
            last = math.ceil((boundary + blend) * fps) + 1
            values, frames = [], []
            for frame in range(first, last + 1):
                t = frame / fps
                if t >= tl["total_s"]:
                    break
                await page.evaluate(
                    RENDER_JS, t,
                )
                image = Image.open(io.BytesIO(await page.screenshot())).convert("RGB")
                values.append((t, ImageStat.Stat(image.convert("L")).mean[0]))
                if output and (frame - first) % max(1, round(fps / 3)) == 0:
                    frames.append((t, image.resize((384, 216))))
            jumps = [(values[i][0], abs(values[i][1] - values[i - 1][1])) for i in range(1, len(values))]
            peak_t, peak = max(jumps, key=lambda pair: pair[1])
            measured.append({"boundary": boundary, "max_luma_jump": peak, "at": peak_t, "samples": values})
            print(f"THEME_BLEND t={boundary:.3f} max_luma_jump={peak:.3f}/255 at={peak_t:.3f} limit={a.limit:g}")
            if peak > a.limit:
                errors.append(f"luma jump {peak:.3f} >{a.limit:g} at {peak_t:.3f}s")
            if output:
                from PIL import ImageDraw
                sheet = Image.new("RGB", (384 * len(frames), 240), "white")
                draw = ImageDraw.Draw(sheet)
                for i, (t, image) in enumerate(frames):
                    sheet.paste(image, (384 * i, 24))
                    draw.text((384 * i + 4, 4), f"t={t:.3f}s", fill="black")
                sheet.save(output / f"switch-{index}.jpg", quality=90)
        await browser.close()
    if a.evidence:
        (Path(a.evidence) / "theme-check.json").write_text(json.dumps(
            {"switches": switches, "measurements": measured, "errors": errors}, indent=2))
    for error in errors:
        print("THEME_VIOLATION", error)
    print("THEME_CHECK " + ("FAIL" if errors else "PASS"))
    if a.mutate and any("luma jump" in error for error in errors):
        print("MUTATION_CAUGHT")
    return 1 if errors else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", nargs="?")
    parser.add_argument("--limit", type=float, default=12.0)
    parser.add_argument("--timeline")
    parser.add_argument("--cuts")
    parser.add_argument("--offset", type=float, default=0.0)
    parser.add_argument("--theme", action="store_true")
    parser.add_argument("--mp4")
    parser.add_argument("--mutate", choices=("theme", "fatigue"))
    parser.add_argument("--evidence")
    args = parser.parse_args()
    if not (args.video or args.mp4):
        parser.error("a video or HTML input is needed (positional path or --mp4)")
    if args.theme:
        if args.mp4 or Path(args.video).suffix.lower() != ".html":
            return check_picture(args)
        import asyncio
        return asyncio.run(check_theme(args))
    if not args.timeline:
        parser.error("brightness inspection needs --timeline")
    timeline = json.loads(Path(args.timeline).read_text(encoding="utf-8"))
    result = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "info", "-i", args.video, "-an",
         "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    values = [float(value) for value in re.findall(r"lavfi\.signalstats\.YAVG=([0-9.]+)",
                                                 result.stderr)]
    print(f"측정 {len(values)} 장 · 휘도 범위 {min(values):.0f}~{max(values):.0f}"
          f" · 시작 {values[0]:.0f} / 마지막 {values[-1]:.0f}")
    exempt = set()
    fps = timeline["fps"]
    if args.cuts and Path(args.cuts).exists():
        cuts = json.loads(Path(args.cuts).read_text(encoding="utf-8"))
        for cut in cuts["cuts"]:
            frame = int((cut["t"] - args.offset) * fps)
            exempt.update(range(frame - 1, frame + 3))
    if exempt:
        print(f"선언된 전환 {len(exempt) // 4} 곳 제외 (검정 전환은 계속 검사)")

    def where(time):
        for name in timeline["order"]:
            module = timeline["modules"][name]
            if time < module["start"] + module["duration"]:
                return f"{name} {time - module['start']:.2f}"
        return "?"

    hits = 0
    for index in range(1, len(values)):
        previous, current = values[index - 1], values[index]
        difference = current - previous
        if abs(difference) <= args.limit:
            continue
        if index in exempt and min(previous, current) >= 8:
            continue
        hits += 1
        time = index / fps
        print(f"  {time:6.2f} s (측정 번호 {index}, {where(time)}) 휘도"
              f" {previous:.0f} → {current:.0f} ({difference:+.0f})")
    print(f"검출 {hits} 곳 (허용 변화 ±{args.limit:g})")
    print("CUTS_CHECK FAIL" if hits else "CUTS_CHECK PASS")
    return 1 if hits else 0


if __name__ == "__main__":
    raise SystemExit(main())
