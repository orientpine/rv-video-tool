"""timeline.py 단계 칩 틈 회귀 시험 (인터넷 없이: tts 캐시를 미리 채움)

    uv run -q --no-project --with edge-tts python tests/test_timeline_steps.py      (RV_LIB=<lib 사본> 으로 다른 판 시험)

잡는 것: steps 를 문장 slot 으로만 만들어 장면 경계·extra_s 구간에 틈이 생기고, shell 이 그 틈에 칩을 꺼서
한 프레임~수 초 깜빡이던 버그.
기대: 이웃한 두 step 사이에 칩 없는 문장이 없으면 틈 0. 칩 없는 문장이 끼면 틈을 남긴다(의도한 꺼짐).
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

LIB = Path(os.environ.get("RV_LIB") or Path(__file__).resolve().parent.parent / "lib")
VOICE, RATE, PITCH = "ko-KR-InJoonNeural", "+0%", "+0Hz"


def seed(tts, spoken):
    key = hashlib.sha1(f"{VOICE}|{RATE}|{PITCH}|{spoken}".encode()).hexdigest()[:12]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "3", "-q:a", "9",
                    str(tts / f"{key}.mp3")], check=True)
    words = [{"text": w, "t": 0.1 + 0.37 * k, "d": 0.3} for k, w in enumerate(spoken.split())]
    (tts / f"{key}.json").write_text(json.dumps({"text": spoken, "voice": VOICE, "words": words}, ensure_ascii=False))


p = Path(tempfile.mkdtemp())
tts = p / "build" / "tts"
tts.mkdir(parents=True)
lines = [("a", 1, "가 문장 하나."), ("b", 1, "나 문장 둘."), ("c", 2, "다 문장 셋."), ("d", None, "라 칩 없는 문장."), ("e", 2, "마 문장 다섯.")]
for _, _, t in lines:
    seed(tts, t)
sp = {"voice": VOICE, "rate": RATE, "pitch": PITCH, "intro_s": 0.5, "lead_s": 0.3, "tail_s": 0.5, "steps": {"1": "① 하나", "2": "② 둘"},
      "scenes": [{"name": "a", "extra_s": 1.5}, {"name": "b"}, {"name": "c"}, {"name": "d"}, {"name": "e"}],
      "lines": [{"scene": s, "text": t, **({"step": n} if n else {})} for s, n, t in lines]}
(p / "script.json").write_text(json.dumps(sp, ensure_ascii=False))
r = subprocess.run([sys.executable, str(LIB / "timeline.py"), str(p)], capture_output=True, text=True)
if r.returncode:
    print("TIMELINE_STEPS FAIL 실행 실패:", r.stdout[-400:], r.stderr[-400:])
    sys.exit(1)
st = json.loads((p / "build" / "timeline.json").read_text())["steps"]
gaps = [round(b["start"] - a["end"], 3) for a, b in zip(st, st[1:])]
want = [("① a→① b (장면 경계 + extra_s 1.5 s)", 0.0), ("① b→② c (번호 바뀜, 사이 문장 없음)", 0.0), ("② c→② e (칩 없는 문장 d 가 낌)", "keep")]
fails = []
for (name, w), g in zip(want, gaps):
    ok = (g <= 0) if w == 0.0 else (g > 0.5)
    print(f"  {name:36} 틈 {g:6.3f} s  {'ok' if ok else 'FAIL'}")
    if not ok:
        fails.append(name)
print("TIMELINE_STEPS " + ("PASS" if not fails and len(gaps) == 3 else "FAIL " + "; ".join(fails)))
sys.exit(0 if not fails and len(gaps) == 3 else 1)
