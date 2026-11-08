"""Exercise incoming transition delays using preseeded speech caches."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


LIB = Path(os.environ.get("RV_LIB") or Path(__file__).resolve().parent.parent / "lib")
VOICE = "ko-KR-InJoonNeural"


def render(first, second, crossfade=0.0):
    with tempfile.TemporaryDirectory() as directory:
        project = Path(directory)
        cache = project / "build" / "tts"
        cache.mkdir(parents=True)
        spoken = "alpha beta"
        key = hashlib.sha1(f"{VOICE}|+0%|+0Hz|{spoken}".encode()).hexdigest()[:12]
        for extension in ("mp3", "wav"):
            (cache / f"{key}.{extension}").touch()
        (cache / f"{key}.json").write_text(json.dumps({
            "words": [
                {"text": "alpha", "t": 0.1, "d": 0.2},
                {"text": "beta", "t": 0.9, "d": 0.2},
            ],
        }))
        script = {
            "voice": VOICE, "intro_s": 0.5, "lead_s": 0.3, "tail_s": 0.5,
            "crossfade_s": crossfade,
            "scenes": [
                {"name": "a", "extra_s": 5.0, **first},
                {"name": "b", **second},
                {"name": "silent", "extra_s": 1, "lead_s": None, "transition": {"dur": None}},
            ],
            "lines": [
                {"scene": "b", "text": "alpha|beta", "keywords": ["beta"], "step": 1},
                {"scene": "b", "text": "alpha beta"},
            ],
        }
        if first.get("narrated"):
            script["lines"].insert(0, {"scene": "a", "text": "alpha beta"})
        (project / "script.json").write_text(json.dumps(script))
        subprocess.run(
            [sys.executable, str(LIB / "timeline.py"), str(project)],
            check=True, capture_output=True, text=True,
        )
        return tuple(
            json.loads((project / "build" / name).read_text())
            for name in ("timeline.json", "word_times.json", "narration.json")
        )


cases = [
    ("cut", {}, {"transition": "cut"}, 0, 5.3),
    ("missing transition", {}, {}, 0, 5.3),
    ("null transition", {}, {"transition": None}, None, 5.3),
    ("dip", {}, {"transition": {"dur": 1.0}}, 0, 5.8),
    ("default mapping duration", {}, {"transition": {}}, 0, 5.6),
    ("string transition", {}, {"transition": "dip"}, 0, 5.6),
    ("false transition", {}, {"transition": False}, 0, 5.6),
    ("zero transition duration", {}, {"transition": {"dur": 0}}, 0, 5.3),
    ("different looks", {}, {"look": "studio"}, 0, 7.3),
    ("look change takes precedence", {}, {"look": "studio", "transition": {"dur": 10}}, 0, 7.3),
    ("matching looks", {"look": "studio"}, {"look": "studio"}, 0, 5.3),
    ("crossfade", {}, {"transition": {"dur": 1}}, 3.0, 8.3),
    ("numeric string crossfade", {}, {}, "3.0", 8.3),
    ("scene minimum", {}, {"lead_s": 4, "transition": {"dur": 1}}, 0, 9.0),
    ("small scene minimum", {}, {"lead_s": 0.1, "transition": {"dur": 1}}, 0, 5.8),
    ("zero scene minimum", {}, {"lead_s": 0}, 0, 5.3),
    ("null look differs from missing", {}, {"look": None}, 0, 7.3),
]

for label, first, second, crossfade, expected in cases:
    timeline, words, narration = render(first, second, crossfade)
    row, following = timeline["lines"]
    assert row["speech_start"] == expected, label
    assert row["speech_end"] == round(expected + 1, 3), label
    assert following["speech_start"] == round(expected + 1.8, 3), label
    assert [event for event in timeline["captions"] if event["text"]][:2] == [
        {"t": round(expected - 0.15, 3), "text": "alpha"},
        {"t": round(expected + 0.65, 3), "text": "beta"},
    ], label
    assert words["lines"][0]["words"][0] == {
        "word": "beta", "t": round(expected + 0.8, 2),
        "t_scene": round(expected - 5 + 0.8, 2),
    }, label
    assert narration["lines"][0]["start_s"] == round(expected - 0.1, 3), label
    assert timeline["steps"][0]["start"] == round(expected - 0.3, 3), label
    print(f"  {label}: speech_start={expected}")

timeline, _, _ = render(
    {"narrated": True, "lead_s": 99, "transition": {"dur": None}},
    {"lead_s": 0}, 3,
)
assert timeline["lines"][0]["speech_start"] == 0.5
assert timeline["lines"][0]["speech_end"] == 1.5
assert timeline["lines"][1]["speech_start"] == 10.3
print("TIMELINE_TRANSITION PASS")
