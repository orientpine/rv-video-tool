"""장면 경계 크로스페이드를 캡처한 PNG 프레임에서 한다(결정론: 페이지 상태·스냅숏 시각에 기대지 않음).

    python3 lib/xfade.py <frames 폴더> <timeline.json>

timeline.crossfade_s(script.json crossfade_s) > 0 이면, 장면 경계 b 마다 새 장면 처음 crossfade_s 초의 프레임을
앞 장면 마지막 프레임(b−1)과 섞는다: 결과 = 앞·(1−u) + 지금·u, u = (k+1)/(n+1).
다시 돌려도 같은 결과: 섞기 전 원본을 frames/xf_raw/ 에 두고, 원본보다 새로 찍힌 프레임(다시 찍기)만 원본을 바꾼다.
crossfade_s 가 0 이거나 없으면 아무것도 안 한다(예전 출력 그대로).
"""
import json
import os
import shutil
import sys
from pathlib import Path

from PIL import Image


def main():
    frames, tl = Path(sys.argv[1]), json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    xf, fps = float(tl.get("crossfade_s") or 0), tl.get("fps", 30)
    if xf <= 0:
        print("XFADE off (crossfade_s 0)")
        return
    raw = frames / "xf_raw"
    raw.mkdir(exist_ok=True)
    n = max(1, round(xf * fps))
    done = 0
    for name in tl["order"][1:]:
        b = round(tl["modules"][name]["start"] * fps)
        prev_path = frames / f"f_{b - 1:05d}.png"
        if not prev_path.exists():
            continue
        prev = Image.open(prev_path).convert("RGB")
        for k in range(n):
            f = frames / f"f_{b + k:05d}.png"
            if not f.exists():
                continue
            r = raw / f.name
            if not r.exists() or f.stat().st_mtime_ns > r.stat().st_mtime_ns:
                shutil.copy2(f, r)                     # 새로 찍힌 원본
            u = (k + 1) / (n + 1)
            out = Image.blend(prev, Image.open(r).convert("RGB"), u)
            tmp = f.with_suffix(".png.part")
            out.save(tmp, format="PNG")
            os.replace(tmp, f)
            st = r.stat()
            os.utime(f, ns=(st.st_atime_ns, st.st_mtime_ns))   # 원본과 같은 시각 → 다음에 '새로 찍힘'으로 안 봄
            done += 1
    print(f"XFADE {done} 프레임 섞음 · 경계 {len(tl['order']) - 1} · {xf:g} s ({n} 프레임)")


if __name__ == "__main__":
    main()
