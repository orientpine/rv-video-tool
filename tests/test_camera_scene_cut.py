"""camera_findings: a hard cut at a scene boundary is the scene change, not camera work near text; a cut inside a scene
at a caption still FAILs. Scene-boundary cuts must not inflate CAMERA_UI findings.
    python3 tests/test_camera_scene_cut.py  -> CAMERA_SCENE_CUT PASS"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
import check_motion as M  # noqa: E402

FPS = 30
tl = {"total_s": 8, "order": ["a", "b"], "modules": {"a": {"start": 0, "duration": 4}, "b": {"start": 4, "duration": 4}}}


def x_at(t):
    return 0 if t < 4 else 5 if t < 6 else 7   # boundary cut at 4 s, a cut inside scene b at 6 s


rows = [{"frame": f, "scene": "a" if f / FPS < 4 else "b",
         "camera": {"p": [x_at(f / FPS), 0, 5], "target": [x_at(f / FPS), 0, 0], "direction": [0, 0, -1]}}
        for f in range(8 * FPS)]
events = [{"t": 2.0, "scene": "a", "source": "caption", "text": "still in a"},
          {"t": 4.1, "scene": "b", "source": "caption", "text": "first text of b, 0.1 s after the boundary cut"},
          {"t": 6.0, "scene": "b", "source": "caption", "text": "cut inside b at this text"}]
failures, summaries = M.camera_findings(rows, events, {}, {}, tl, FPS)
caught = sorted(round(f[0] / FPS, 2) for f in failures if f[2] == "text_camera_motion")
print("caught text times:", caught)
print("\n".join(s for s in summaries if s.startswith("CAMERA_UI")))
ok = caught == [6.0]

# The camera object jumps inside scene b's 0.5 s dip (text at 4.2 s), then really moves at the 6 s text.
tl["crossfade_s"] = 0
spans = M.transition_spans(tl, {"b": {"type": "dip", "dur": 1.0}}, {}, 2.0)
print("spans:", spans)
ok = ok and spans == {"a": [0.0, 0.5], "b": [0.5, 0.0]}
ok = ok and M.transition_spans(tl, {"b": {"dur": 1.0}}, {"b": "relief"}, 2.0) == {"a": [0.0, 0.0], "b": [2.0, 0.0]}
ok = ok and M.transition_spans({**tl, "crossfade_s": .6}, {}, {}, 2.0)["b"] == [.6, 0.0]
for r in rows:
    t = r["frame"] / FPS
    if 4 <= t < 4.4:
        r["camera"]["p"][0] = r["camera"]["target"][0] = 5 + (t - 4)
events[1] = {"t": 4.2, "scene": "b", "source": "caption", "text": "first text of b, inside the dip"}
bare = sorted(round(f[0] / FPS, 2) for f in M.camera_findings(rows, events, {}, {}, tl, FPS)[0])
failures, summaries = M.camera_findings(rows, events, {}, {}, tl, FPS, spans)
caught = sorted(round(f[0] / FPS, 2) for f in failures if f[2] == "text_camera_motion")
print("without spans:", bare, "with spans:", caught)
print("\n".join(s for s in summaries if s.startswith("CAMERA_UI_TRANSITION")))
ok = ok and bare == [4.2, 6.0] and caught == [6.0] and any(s.startswith("CAMERA_UI_TRANSITION scene=b") for s in summaries)

# Transition judgement is independent of text clipping. The fallback lets the
# unchanged checker demonstrate the missing behaviour rather than an import error.
judge = getattr(M, "transition_camera_findings", lambda *args: ([], []))
dip = {"b": {"type": "dip", "dur": 1.0}}
transition_failures, _ = judge(rows, {}, (tl, FPS, dip, {}, 2.0))
dip_caught = [f[1] for f in transition_failures if f[2] == "transition_camera_motion"]
print("in-dip glide: text excluded; transition caught:", dip_caught)
ok = ok and dip_caught == ["b"]

for kind, transitions, looks, crossfade, duration in [
        ("dip", dip, {}, 0, .5),
        ("blend", {}, {"b": "relief"}, 0, 2.0),
        ("crossfade", {}, {}, .6, .6)]:
    timeline = {**tl, "crossfade_s": crossfade}
    for motion in ("glide", "static", "after", "dark", "tail", "look", "switch", "follow"):
        if motion in ("dark", "tail") and kind != "dip":
            continue
        samples = []
        for frame in range(8 * FPS):
            t = frame / FPS
            x = 0
            if motion == "glide" and t >= 4:
                x = min(t - 4, duration) * .3 / duration
            if motion == "after" and t > 4 + duration:
                x = (t - 4 - duration) * .3
            if motion == "dark" and 4 <= t < 4.1:
                x = .3
            if motion == "tail" and t < 4:
                x = max(0, t - 3.5)
            if motion in ("look", "switch", "follow") and t >= 4:
                x = min(t - 4, duration) * .3 / duration
            samples.append({"frame": frame, "scene": "a" if t < 4 else "b",
                            "camera": {"id": "other" if motion == "switch" and t > 4.1 else "cam",
                                       "p": [0 if motion == "look" else x, 0, 5], "target": [x, 0, 0],
                                       "direction": [0, 0, -1]},
                            "subjects": {"part": {"count": 1, "id": "part", "visible": True,
                                                  "p": [x, 0, 0], "center": [x, 0, 0],
                                                  "landmarks": {"mesh": [[x, 0, 0]]}}}})
        shots = {"b": [{"t": 0, "kind": "follow", "subject": "part"}]} if motion == "follow" else {}
        found, lines = judge(samples, shots, (timeline, FPS, transitions, looks, 2.0))
        actual = [(f[1], f[2]) for f in found]
        expected = ([("b", "transition_camera_motion")] if motion in ("glide", "look") else
                    [("a", "transition_camera_motion")] if motion == "tail" else [])
        passed = actual == expected
        print(f"transition {kind} {motion}: {'PASS' if passed else 'FAIL'} actual={actual} expected={expected}")
        ok = passed and ok

# xfade.py uses exactly n frames, even when floating addition rounds its end up.
anchor = 25 + 2 / FPS
timeline = {"total_s": 28, "crossfade_s": .6, "order": ["a", "b"],
            "modules": {"a": {"start": 0, "duration": anchor}, "b": {"start": anchor, "duration": 2}}}
samples = [{"frame": f, "scene": "b", "camera": {"id": "cam", "p": [x, 0, 5],
             "target": [x, 0, 0], "direction": [0, 0, -1]}}
           for f, x in [(768, 0), (769, 0), (770, 1)]]
found, _ = judge(samples, {}, (timeline, FPS, {}, {}, 2.0))
print("crossfade exact frame end:", "PASS" if not found else "FAIL")
ok = not found and ok
print("CAMERA_SCENE_CUT", "PASS" if ok else "FAIL (want only the in-scene cut at 6.0 s)")
sys.exit(0 if ok else 1)
