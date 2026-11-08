"""Build the default synthetic test project offline, with cached original speech."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROJECT = ROOT / "tests" / "project"
BUILD = PROJECT / "build"


def main():
    BUILD.mkdir(exist_ok=True)
    script = json.loads((PROJECT / "script.json").read_text())
    modules, captions, steps = {}, [], []
    start = 0
    for scene, line in zip(script["scenes"], script["lines"]):
        name, duration = scene["name"], scene["extra_s"]
        modules[name] = {"start": start, "duration": duration}
        captions.extend([{"t": start + 1, "text": line["text"]},
                         {"t": start + 4, "text": ""}])
        steps.append({"n": line["step"], "label": script["steps"][str(line["step"])],
                      "start": start + 1, "end": start + duration})
        start += duration
    timeline = {"fps": 30, "total_s": start, "order": list(modules), "modules": modules,
                "captions": captions, "steps": steps, "fade_in_s": 0, "fade_out_s": 0}
    (BUILD / "timeline.json").write_text(json.dumps(timeline, indent=2))
    # The committed lossless recording contains only our original fixture text.
    audio = BUILD / "narration.wav"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y",
                    "-i", str(PROJECT / "narration.flac"), "-ar", "48000",
                    "-ac", "2", str(audio)], check=True)
    subprocess.run(["python3", str(ROOT / "lib" / "build.py"), str(PROJECT)], check=True)


if __name__ == "__main__":
    main()
