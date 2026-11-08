"""timeline.py 자막 조각 시각 회귀 시험 (인터넷 없이: tts 캐시를 미리 채움)

    uv run -q --no-project --with edge-tts python tests/test_timeline_captions.py

잡는 것: "|" 뒤 자막 조각의 첫 낱말이 읽는 글과 다를 때(say 로 따로 읽기 · say_replace) 조각 시각이
문장 시작으로 떨어져 앞 조각이 한 번도 안 보이던 버그.
"""
import hashlib
import os
import json
import subprocess
import sys
import tempfile
from pathlib import Path

LIB = Path(os.environ.get("RV_LIB") or Path(__file__).resolve().parent.parent / "lib")
VOICE, RATE, PITCH = "ko-KR-InJoonNeural", "+0%", "+0Hz"


def seed(tts, spoken, words):
    key = hashlib.sha1(f"{VOICE}|{RATE}|{PITCH}|{spoken}".encode()).hexdigest()[:12]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "4", "-q:a", "9",
                    str(tts / f"{key}.mp3")], check=True)
    (tts / f"{key}.json").write_text(json.dumps({"text": spoken, "voice": VOICE, "words": words}, ensure_ascii=False))


def run(lines, say_replace, **over):
    p = Path(tempfile.mkdtemp())
    tts = p / "build" / "tts"
    tts.mkdir(parents=True)
    for ln in lines:
        seed(tts, ln["_spoken"], ln["_words"])
    sp = {"voice": VOICE, "rate": RATE, "pitch": PITCH, "intro_s": 0.5, "lead_s": 0.3, "tail_s": 0.5, "say_replace": say_replace,
          "scenes": [{"name": "s"}], "lines": [{k: v for k, v in ln.items() if not k.startswith("_")} for ln in lines]}
    sp.update(over)
    sp = {k: v for k, v in sp.items() if v is not None}
    (p / "script.json").write_text(json.dumps(sp, ensure_ascii=False))
    r = subprocess.run([sys.executable, str(LIB / "timeline.py"), str(p)], capture_output=True, text=True)
    if r.returncode:
        return None, r.stdout + r.stderr
    tl = json.loads((p / "build" / "timeline.json").read_text())
    tl["_narration"] = json.loads((p / "build" / "narration.json").read_text())
    return tl, ""


W = lambda *tw: [{"text": a, "t": b, "d": 0.2} for a, b in tw]
fails = []

# 1) say 로 따로 읽기: 자막 "3.5톤" / 읽기 "삼 점 오 톤" → 둘째 조각은 "입니다" 시각(1.5 s)에 나와야
tl, err = run([{"scene": "s", "text": "기계는|3.5톤 입니다.", "say": "기계는 삼 점 오 톤 입니다.",
                "_spoken": "기계는 삼 점 오 톤 입니다.", "_words": W(("기계는", 0.1), ("삼", 0.8), ("점", 1.0), ("오", 1.2), ("톤", 1.35), ("입니다.", 1.5))}], {})
if tl is None:
    fails.append(f"1 실행 실패: {err}")
else:
    c = tl["captions"]
    ok = len(c) == 2 and c[1]["t"] - c[0]["t"] > 0.3
    print(f"1 say 다름   조각 시각 {[x['t'] for x in c]}  {'ok' if ok else 'FAIL'}")
    if not ok:
        fails.append("1 앞 조각이 안 보임")

# 2) say_replace: 자막 "5 mm까지" / 읽기 "오 밀리미터까지" → 둘째 조각은 "오" 시각(0.9 s) 정확히
tl, err = run([{"scene": "s", "text": "센서는|5 mm까지 다가갑니다.",
                "_spoken": "센서는 오 밀리미터까지 다가갑니다.", "_words": W(("센서는", 0.1), ("오", 0.9), ("밀리미터까지", 1.1), ("다가갑니다.", 1.8))}],
              {"5 mm": "오 밀리미터"})
if tl is None:
    fails.append(f"2 실행 실패: {err}")
else:
    c, L = tl["captions"], tl["lines"][0]
    want = round(L["speech_start"] - 0.1 + 0.9 - 0.15, 3)
    ok = len(c) == 2 and abs(c[1]["t"] - want) < 0.002
    print(f"2 say_replace 조각 시각 {c[1]['t'] if len(c) > 1 else None} 기대 {want}  {'ok' if ok else 'FAIL'}")
    if not ok:
        fails.append("2 조각 시각이 '오' 가 아님")

# 3) intro_s 없음: 첫 문장이 0 s 에 놓여 음성 파일 자리가 -0.1 s → narration adelay 음수로 rv make 가 죽음
tl, err = run([{"scene": "s", "text": "센서는 다가갑니다.", "_spoken": "센서는 다가갑니다.",
                "_words": W(("센서는", 0.1), ("다가갑니다.", 0.8))}], {}, intro_s=None, lead_s=0.5)
if tl is None:
    fails.append(f"3 실행 실패: {err}")
else:
    starts = [n["start_s"] for n in tl["_narration"]["lines"]]
    caps = [x["t"] for x in tl["captions"]]
    ok = min(starts) >= 0 and min(caps) >= 0
    print(f"3 intro_s 없음 음성 자리 {starts} 자막 {caps}  {'ok' if ok else 'FAIL'}")
    if not ok:
        fails.append("3 첫 문장이 0 s 앞에 놓임")

print("TIMELINE_CAPTIONS " + ("PASS" if not fails else "FAIL " + "; ".join(fails)))
sys.exit(1 if fails else 0)
