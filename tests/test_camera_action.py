"""camera_findings: an action shot (KIT.shot.declare kind "action") lets a camera move at an action moment through
when a label appears then, and camera motion that only
follows text still FAILs. Transition camera judgement has no action exemption.
    uv run -q --no-project --with playwright --with pillow python tests/test_camera_action.py  -> CAMERA_ACTION PASS"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
import check_motion as M  # noqa: E402

FPS = 30
SCALE = 2 * math.tan(math.radians(25))   # fov 50
tl = {"total_s": 8, "order": ["a"], "modules": {"a": {"start": 0, "duration": 8}}}
TEXT = {"t": 4.0, "scene": "a", "source": "ui", "text": "contact label"}


def smooth(a, b, t):
    u = max(0, min(1, (t - a) / (b - a)))
    return u * u * (3 - 2 * u)


def rows_for(camera, subject=lambda t: [-.5 + .5 * smooth(3.0, 4.2, t), 0, 0], look=lambda t: [0, 0, 0]):
    rows = []
    for frame in range(8 * FPS):
        t = frame / FPS
        p, target, s = camera(t), look(t), subject(t)
        d = [x - y for x, y in zip(target, p)]
        n = math.dist(target, p)
        rows.append({"frame": frame, "scene": "a",
                     "camera": {"id": "cam", "p": p, "target": target, "direction": [x / n for x in d],
                                "scale": SCALE, "height": n * SCALE, "focus": n},
                     "subjects": {"arm": {"count": 1, "id": "arm", "visible": True, "p": s, "center": s,
                                          "landmarks": {"mesh": [s]}}}})
    return rows


def push(t):          # 5 m -> 2 m toward the contact point during 3.5..4.5 s
    return [0, 0, 5 - 3 * smooth(3.5, 4.5, t)]


def orbit(t):         # 30 degrees around the contact point at 3 m
    a = math.radians(30 * smooth(3.5, 4.5, t))
    return [3 * math.sin(a), 0, 3 * math.cos(a)]


def wobble(t):        # 3 cm out and back at the label, no zoom
    return [.03 * math.sin(math.pi * max(0, min(1, (t - 3.6) / .8))) ** 2, 0, 3]


def nudge(t):         # 3 cm one-way slide at the label
    return [.03 * smooth(3.6, 4.4, t), 0, 3]


def bounce(t):        # 5 m -> 2 m, then back out to 3 m inside the shot
    return [0, 0, 5 - 3 * smooth(3.5, 4.0, t) + smooth(4.0, 4.5, t)]


def late(t):          # the push continues after the declared shot ends at 4.2 s
    return [0, 0, 5 - 3 * smooth(3.5, 4.5, t)]


ACTION = {"a": [{"t": 0, "kind": "scene"}, {"t": 3.4, "end": 4.6, "kind": "action", "subject": "arm"}]}
cases = [
    ("punch-in at contact", rows_for(push), ACTION, True),
    ("orbit at contact", rows_for(orbit), ACTION, True),
    ("window wider than the shot on both sides", rows_for(push),
     {"a": [{"t": 0}, {"t": 3.5, "end": 4.5, "kind": "action", "subject": "arm"}]}, True),
    ("punch-in undeclared", rows_for(push), {}, False),
    ("ordinary declared shot", rows_for(push), {"a": [{"t": 0}, {"t": 3.4, "end": 4.6, "kind": "scene"}]}, False),
    ("action without end", rows_for(push), {"a": [{"t": 0}, {"t": 3.4, "kind": "action", "subject": "arm"}]}, False),
    ("action without subject", rows_for(push), {"a": [{"t": 0}, {"t": 3.4, "end": 4.6, "kind": "action"}]}, False),
    ("static subject", rows_for(push, subject=lambda t: [0, 0, 0]), ACTION, False),
    ("subject off-centre", rows_for(push, look=lambda t: [1.5, 0, 0]), ACTION, False),
    ("pan-in from off-centre to centred", rows_for(push, look=lambda t: [1.5 * (1 - smooth(3.5, 4.5, t)), 0, 0]), ACTION, True),
    ("subject out of picture mid-shot", rows_for(push, look=lambda t: [6.0 * smooth(3.5, 4.0, t) * (1 - smooth(4.0, 4.5, t)), 0, 0]), ACTION, False),
    ("wobble in action shot", rows_for(wobble), ACTION, False),
    ("3 cm slide in action shot", rows_for(nudge), ACTION, False),
    ("push in then bounce back", rows_for(bounce), ACTION, False),
    ("action shot over 3 s", rows_for(push), {"a": [{"t": 0}, {"t": 1.0, "end": 4.6, "kind": "action", "subject": "arm"}]}, False),
    ("camera moves outside the shot", rows_for(late), {"a": [{"t": 0}, {"t": 3.0, "end": 4.2, "kind": "action", "subject": "arm"}]}, False),
]
ok = True
for name, rows, shots, exempt in cases:
    failures, summaries = M.camera_findings(rows, [TEXT], shots, {}, tl, FPS)
    caught = [f for f in failures if f[2] == "text_camera_motion"]
    lines = [s for s in summaries if s.startswith("CAMERA_UI_EXEMPT") and "kind=action" in s]
    passed = (not caught and len(lines) == 1) if exempt else (len(caught) == 1 and not lines)
    reason = caught[0][3].split("reason=")[1][:150] if caught else (lines[0][:150] if lines else "")
    print(f"action {name}: {'PASS' if passed else 'FAIL'} exempt={not caught} want={exempt} {reason}")
    ok = ok and passed

# Transition judgement is unchanged: an action shot inside a crossfade still FAILs when its camera moves.
timeline = {"total_s": 8, "crossfade_s": .6, "order": ["z", "a"],
            "modules": {"z": {"start": 0, "duration": 3.6}, "a": {"start": 3.6, "duration": 4.4}}}
rows = rows_for(push)
for r in rows:
    r["scene"] = "z" if r["frame"] / FPS < 3.6 else "a"
found, _ = M.transition_camera_findings(rows, {"a": [{"t": 0, "end": 1.0, "kind": "action", "subject": "arm"}]},
                                        (timeline, FPS, {}, {}, 2.0))
passed = [(f[1], f[2]) for f in found] == [("a", "transition_camera_motion")]
print(f"action shot inside crossfade: {'PASS' if passed else 'FAIL'} found={[(f[1], f[2]) for f in found]}")
ok = ok and passed
print("CAMERA_ACTION", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
