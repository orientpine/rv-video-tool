"""timeline.json 자막 → SRT. 자막 조각마다 한 큐, 끝 = 다음 조각 시각 또는 그 문장 slot_end.

    python lib/srt.py <프로젝트>/build/timeline.json --out x.srt
"""
import argparse, json
from pathlib import Path


def ts(x):
    ms = int(round(x * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


ap = argparse.ArgumentParser(); ap.add_argument("timeline"); ap.add_argument("--out", required=True); a = ap.parse_args()
tl = json.loads(Path(a.timeline).read_text(encoding="utf-8"))
caps = [c for c in tl["captions"]]
ends = sorted(l["slot_end"] for l in tl["lines"])
cues = []
for i, c in enumerate(caps):
    if not c["text"]:
        continue
    nxt = caps[i + 1]["t"] if i + 1 < len(caps) else tl["total_s"]
    slot = next((e for e in ends if e > c["t"]), tl["total_s"])
    end = min(nxt, slot)
    cues.append((max(0.0, c["t"]), end, c["text"].replace("\\n", "\n")))
Path(a.out).write_text("".join(f"{k + 1}\n{ts(s)} --> {ts(e)}\n{t}\n\n" for k, (s, e, t) in enumerate(cues)), encoding="utf-8")
print(f"SRT {len(cues)} 큐 → {a.out}")
