"""Assemble project resources and the compositor into a standalone video page."""

import base64
import json
import mimetypes
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
ONLY = {name for name in os.environ.get("ONLY", "").split(",") if name}
POST = (
    "CopyShader", "Pass", "EffectComposer", "RenderPass", "ShaderPass", "MaskPass",
    "LuminosityHighPassShader", "UnrealBloomPass", "SAOShader",
    "DepthLimitedBlurShader", "UnpackDepthRGBAShader", "SAOPass", "BokehShader",
    "BokehPass",
)


def js_json(value):
    return json.dumps(value, ensure_ascii=False).replace("</", r"<\/")

def theme_runs(tl, looks):
    runs, start = [], 0.0
    for scene_name in tl["order"]:
        duration = tl["modules"][scene_name]["duration"]
        look = looks.get(scene_name, "cinema")
        if runs and runs[-1]["look"] == look:
            runs[-1]["end"] = start + duration
            runs[-1]["scenes"].append(scene_name)
        else:
            runs.append({"look": look, "start": start, "end": start + duration, "scenes": [scene_name]})
        start += duration
    return runs


def theme_violations(runs, min_hold=12.0, max_switches=2):
    errors = []
    if len(runs) > 1:
        for run in runs:
            if run["end"] - run["start"] < min_hold - 1e-6:
                errors.append("hold <12s: " + ",".join(run["scenes"]))
    switches = [r["start"] for r in runs[1:]]
    for t in switches:
        if sum(t <= s < t + 60 - 1e-6 for s in switches) > max_switches:
            errors.append(f"switches >2/60s at {t:.2f}s")
    return errors


def theme_plan(tl, script):
    """Only remove emphasis; never turn an unrequested cinema scene into relief."""
    scenes = {s["name"]: s for s in script.get("scenes", []) if isinstance(s, dict)}
    requested = {n: scenes.get(n, {}).get("look", "cinema") for n in tl["order"]}
    requested = {n: v if v in ("cinema", "relief", "clean") else "cinema" for n, v in requested.items()}
    used, warnings = dict(requested), []
    groups = {}
    for scene_name in tl["order"]:
        group = scenes.get(scene_name, {}).get("theme_group")
        if group:
            groups.setdefault(group, []).append(scene_name)
    # Explicit scene groups are indivisible. Mixed requests fall back to cinema.
    for group, names in groups.items():
        if len({used[n] for n in names}) > 1:
            warnings.append(f"group {group}: mixed looks -> cinema")
            for n in names:
                used[n] = "cinema"
    while True:
        runs = theme_runs(tl, used)
        errors = theme_violations(runs)
        if not errors:
            break
        warnings.extend(errors)
        # Merge the shortest emphasis run into cinema until the theme constraints hold.
        candidates = [r for r in runs if r["look"] != "cinema"]
        remove = min(candidates, key=lambda r: r["end"] - r["start"])
        names = set(remove["scenes"])
        for members in groups.values():
            if names.intersection(members):
                names.update(members)
        warnings.append("merge -> cinema: " + ",".join(n for n in tl["order"] if n in names))
        for n in names:
            used[n] = "cinema"
    return {"requested": requested, "used": used, "runs": runs, "warnings": warnings,
            "min_hold_s": 12, "max_switches_per_60s": 2, "blend_s": 2.0,
            "violations": theme_violations(runs)}


def main():
    project = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    destination = Path(os.environ.get("VIDEO_HTML") or project / "build/video.html").resolve()
    timeline = json.loads((project / "build/timeline.json").read_text(encoding="utf-8"))

    sys.path.insert(0, str(ROOT / "lib"))
    from check_numbers import check_say, table

    allowed = table(project)
    if allowed is not None:
        bad = check_say(project, allowed)
        if bad:
            sys.exit("Unsupported narration numbers:\n" + "\n".join(
                f"{scene}: {token}: {text}" for _, scene, token, text in bad
            ))

    script_file = project / "script.json"
    script = json.loads(script_file.read_text(encoding="utf-8")) if script_file.exists() else {}
    scenes = [entry for entry in script.get("scenes", []) if isinstance(entry, dict)]
    scene_sites = {entry["name"]: entry["site"] for entry in scenes if "site" in entry}
    scene_places = {entry["name"]: entry["place"] for entry in scenes if "place" in entry}   # KIT.place(NAME, scene) builds it
    scene_beats = {entry["name"]: entry["beat"] for entry in scenes if "beat" in entry}      # problem | inside | result | after
    transitions = {}
    for entry in scenes:
        transition = entry.get("transition")
        if transition is not None and transition != "cut":
            transitions[entry["name"]] = transition if isinstance(transition, dict) else {"type": transition}
    plan = theme_plan(timeline, script)
    report = []
    if transitions:
        report.append("Transitions: " + ", ".join(f"{name}={value['type']}" for name, value in transitions.items()))
    report.extend("Theme warning: " + warning for warning in plan["warnings"])
    report.append("Looks: " + ", ".join(f"{name}={look}" for name, look in plan["used"].items()))
    look = script.get("look")
    enabled = bool(look) and os.environ.get("RV_LOOK", "").lower() != "off"
    if isinstance(look, str):
        look = {"preset": look}

    kit = ROOT / "kit/scene_kit.js"
    portions = [
        "// kit/human_body.js\n" + (ROOT / "kit/human_body.js").read_text(encoding="utf-8"),
        "// kit/scene_kit.js\n" + kit.read_text(encoding="utf-8"),
        "// kit/process.js\n" + (ROOT / "kit/process.js").read_text(encoding="utf-8"),
        "// kit/places.js\n" + (ROOT / "kit/places.js").read_text(encoding="utf-8"),
        "// kit/fx.js\n" + (ROOT / "kit/fx.js").read_text(encoding="utf-8"),
    ]
    if allowed is not None:
        sources = json.loads((project / "sources.json").read_text(encoding="utf-8"))
        portions.append("window.SOURCES=" + js_json(sources) + ";")
    if "site" in script:
        portions.append("window.SITE=" + js_json(script["site"]) + ";")
    if scene_sites:
        portions.append("window.SCENE_SITE=" + js_json(scene_sites) + ";")
    if scene_places:
        portions.append("window.SCENE_PLACE=" + js_json(scene_places) + ";")
    # CC0 place assets (kit/assets/places/<kind>/, common/): only the kinds this project names, so video.html stays small
    place_dir, kit_assets, loaded_vendor = ROOT / "kit/assets/places", {}, set()
    for kind in sorted({"common", *scene_places.values()}):
        folder = place_dir / kind
        for path in sorted(folder.rglob("*")) if folder.is_dir() else []:
            if path.is_file() and path.suffix.lower() not in (".md", ".txt"):
                mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
                kit_assets[f"{kind}/{path.relative_to(folder).as_posix()}"] = f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")
    if kit_assets:
        portions.append("window.KIT_ASSETS=" + js_json(kit_assets) + ";")
        for name in ("GLTFLoader.js", "OBJLoader.js"):   # models in the asset folders are parsed by these (three r147 examples/js)
            path = (ROOT / "vendor" / name).resolve()
            if path not in loaded_vendor:
                loaded_vendor.add(path)
                portions.append("// vendor/" + name + "\n" + path.read_text(encoding="utf-8"))
    if scene_beats:
        portions.append("window.SCENE_BEAT=" + js_json(scene_beats) + ";")
    if transitions:
        portions.append("window.TRANSITIONS=" + js_json(transitions) + ";")
    if "aspect" in script:   # "2.35:1" letterbox / "4:3" pillarbox (kit/shell.html #matte, window.PICTURE)
        try:
            aw, ah = (float(x) for x in str(script["aspect"]).split(":"))
            assert aw > 0 and ah > 0
        except (ValueError, AssertionError):
            raise SystemExit(f'script.json "aspect" must be "W:H" with two positive numbers, e.g. "2.35:1"; got {script["aspect"]!r}')
        portions.append("window.ASPECT=" + js_json(f"{aw:g}:{ah:g}") + ";")
    if isinstance(script.get("badge"), dict):   # one label that stays on screen across the listed scenes (kit/shell.html #badge)
        portions.append("window.BADGE=" + js_json(script["badge"]) + ";")
    portions.extend([
        "window.SCENE_LOOK=" + js_json(plan["used"]) + ";",
        "window.THEME_PLAN=" + js_json(plan) + ";",
    ])
    if enabled:
        for name in POST:
            path = ROOT / "vendor/post" / (name + ".js")
            portions.append("// vendor/post/" + path.name + "\n" + path.read_text(encoding="utf-8"))
        portions.append("// kit/look.js\n" + (ROOT / "kit/look.js").read_text(encoding="utf-8"))
        portions.append("window.LOOK_CFG=" + js_json(look) + ";")

    assets, data = {}, {}
    loaded = {kit.resolve()}
    for name in timeline["order"]:
        folder = project / "scenes" / name
        module = folder / "module.js"
        if not module.exists() or (ONLY and name not in ONLY):
            report.append(f"{name}: placeholder (missing module)")
            continue
        manifest_file = folder / "deps.json"
        deps = json.loads(manifest_file.read_text(encoding="utf-8")) if manifest_file.exists() else {}
        for relative in deps.get("scripts", []):
            path = (folder / relative).resolve()
            if path not in loaded:
                loaded.add(path)
                portions.append("// " + str(path) + "\n" + path.read_text(encoding="utf-8"))
        for key, relative in deps.get("assets", {}).items():
            path = folder / relative
            mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            assets[key] = f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")
        for key, relative in deps.get("data", {}).items():
            data[key] = json.loads((folder / relative).read_text(encoding="utf-8"))
        handoff = folder / "handoff.json"
        if handoff.exists():
            data[name + ".handoff"] = json.loads(handoff.read_text(encoding="utf-8"))
        portions.append("// scenes/" + name + "/module.js\n" + module.read_text(encoding="utf-8"))
        report.append(
            f"{name}: {module.stat().st_size // 1024} KiB; "
            f"scripts={len(deps.get('scripts', []))}, "
            f"assets={len(deps.get('assets', {}))}, data={len(deps.get('data', {}))}"
        )

    data["timeline"] = timeline
    words_file = project / "build/word_times.json"
    data["words"] = json.loads(words_file.read_text(encoding="utf-8")) if words_file.exists() else {"lines": []}
    prefix = "\n".join([
        "window.TIMELINE=" + js_json(timeline) + ";",
        "window.ASSETS=" + js_json(assets) + ";",
        "window.DATA=" + js_json(data) + ";",
        "window.SCENES=window.SCENES||{};",
    ])
    bundle = prefix + "\n;\n" + "\n;\n".join(portions)
    three = (ROOT / "vendor/three-0.147.0.min.js").read_text(encoding="utf-8")
    for name, contents in (("Three library", three), ("bundle", bundle)):
        if re.search(r"</script", contents, re.IGNORECASE):
            raise SystemExit(f"Cannot embed {name}: closing script tag")
    html = (ROOT / "kit/shell.html").read_text(encoding="utf-8")
    html = html.replace("/*__THREE__*/", three, 1).replace("/*__BUNDLE__*/", bundle, 1)
    destination.write_text(html, encoding="utf-8")
    print(*report, sep="\n")
    print(f"{timeline['total_s']:.2f}s -> {destination} ({destination.stat().st_size // 1024} KiB)")


if __name__ == "__main__":
    main()
