"""자막 조각마다 화면에 보이는 시간 검사: 0.4 s 보다 짧게(또는 한 번도) 안 보이는 조각이 있으면 FAIL.

    python3 lib/check_captions.py <프로젝트>/build/timeline.json [--min 0.4]
"""
import argparse
import json
import sys

ap = argparse.ArgumentParser()
ap.add_argument("timeline")
ap.add_argument("--min", type=float, default=0.4)
a = ap.parse_args()
tl = json.load(open(a.timeline, encoding="utf-8"))
caps = tl["captions"]
bad = []
for i, c in enumerate(caps):
    if not c["text"]:
        continue
    end = caps[i + 1]["t"] if i + 1 < len(caps) else tl["total_s"]
    if end - c["t"] < a.min:
        bad.append((c["t"], end - c["t"], c["text"]))
print(f"자막 조각 {sum(1 for c in caps if c['text'])} 개 · 가장 짧게 보이는 조각 "
      f"{min((caps[i + 1]['t'] if i + 1 < len(caps) else tl['total_s']) - c['t'] for i, c in enumerate(caps) if c['text']):.2f} s")
for t, d, txt in bad:
    print(f"  {t:7.2f} s 에 {d:.2f} s 만 보임: {txt}")
print("CAPTIONS_CHECK " + ("PASS" if not bad else "FAIL"))
sys.exit(1 if bad else 0)
