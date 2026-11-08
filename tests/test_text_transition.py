import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "lib"))
import check_motion as M  # noqa: E402

FPS = 30
TL = {"order": ["a", "b"], "modules": {"a": {"start": 0, "duration": 5}, "b": {"start": 5, "duration": 5}}}
DIP = {"b": {"type": "dip", "dur": 1.0}}
CHIP = {"id": "chip", "text": "① 왜 필요한가", "source": "chip"}


def rows(spans, chip_from=0.0):
    out = []
    for f in range(10 * FPS):
        t = f / FPS
        ui = ([CHIP] if t >= chip_from else []) + [{"id": i, "text": text, "source": "caption"} for i, text, a, b in spans if a <= t < b]
        out.append({"frame": f, "scene": "a" if t < 5 else "b", "ui": ui})
    return out


def judge(spans, transitions=DIP, looks=None, chip_from=0.0):
    starts = M.transition_starts(TL, transitions, looks or {}, 2.0)
    fails, lines = M.text_transition_findings(rows(spans, chip_from), starts, FPS)
    return sorted({f[2] for f in fails}), lines


cases = [
    ("text still on screen when the dip starts", [("c1", "다음 장면으로 넘어갑니다", 2.0, 5.0)], ["text_during_transition"]),
    ("text read and gone before the dip", [("c1", "다음 장면으로 넘어갑니다", 1.0, 4.2)], []),
    ("short text flashed just before the dip", [("c2", "확인", 3.8, 4.3)], ["text_unread"]),
    ("only the persistent step chip", [], []),
    ("next scene's first caption inside the dip's second half", [("c4", "새 장면 첫 자막", 5.3, 8.0)], ["text_during_transition"]),
    ("next scene's first caption after the dip ends", [("c4", "새 장면 첫 자막", 5.8, 8.0)], []),
    ("text over a theme blend start", [("c3", "섞기 직전 글자", 3.0, 5.2)], ["text_during_transition"]),
]
ok = True
for name, spans, want in cases:
    looks = {"b": "relief"} if "blend" in name else None
    got, lines = judge(spans, {} if looks else DIP, looks)
    passed = got == want
    ok = ok and passed
    print(f"{'PASS' if passed else 'FAIL'} {name}: got={got} want={want} | {lines[0] if lines else 'no transition'}")
got, lines = judge([], DIP, None, chip_from=4.2)
passed = got == ["text_during_transition", "text_unread"]
ok = ok and passed
print(f"{'PASS' if passed else 'FAIL'} step chip opening 0.3 s before the dip and staying: got={got} | {lines[0]}")
got, lines = judge([("c1", "다음 장면으로 넘어갑니다", 2.0, 5.0)], {}, None)
ok = ok and got == [] and not lines
print(f"{'PASS' if got == [] and not lines else 'FAIL'} hard cut is not a transition: got={got}")
print("TEXT_TRANSITION_TESTS", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
