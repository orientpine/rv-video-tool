"""한두 프레임 튀었다 돌아오는 곳(깜빡임) 검사. check_cuts(화면 전체 밝기 급변)가 못 잡는 작은 자리 깜빡임까지.

    uv run --no-project --with numpy python lib/check_flicker.py out.mp4 [--from 0] [--to END] [--limit 6] [--grid 8]

프레임을 192x108 회색으로 줄여 8x8 칸으로 나누고, 칸마다 평균 절대 차이를 잰다(전체 평균이면 작은 자리가 묻힌다).
  1프레임 튐: 칸 하나라도 d(i, i-1) 와 d(i, i+1) 가 둘 다 limit 넘고, d(i-1, i+1) 는 그 1/3 아래 → 튀었다 돌아옴
  2프레임 튐: 프레임 i, i+1 둘이 앞뒤(i-1, i+2)와 다르고 i-1 과 i+2 는 서로 비슷
출력 끝줄 FLICKER_CHECK PASS|FAIL, 종료 코드 0/1. 걸린 곳마다 시각·칸·값.
"""
import argparse
import subprocess
import sys

import numpy as np

W, H = 192, 108


def frames(path, a, b):
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-ss", str(a)] + (["-to", str(b)] if b else []) + ["-i", path, "-vf", f"scale={W}:{H}",
                                                                                     "-f", "rawvideo", "-pix_fmt", "gray", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)


def tiles(d, g):
    h, w = H // g, W // g
    return d[:h * g, :w * g].reshape(g, h, g, w).mean(axis=(1, 3))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--from", dest="a", type=float, default=0.0)
    ap.add_argument("--to", dest="b", type=float, default=None)
    ap.add_argument("--fps", type=float, default=30.0)
    ap.add_argument("--limit", type=float, default=6.0)
    ap.add_argument("--grid", type=int, default=8)
    a = ap.parse_args()
    F = frames(a.video, a.a, a.b)
    D = lambda i, j: tiles(np.abs(F[i] - F[j]), a.grid)
    hits = []
    for i in range(1, len(F) - 1):
        p, n, s = D(i, i - 1), D(i, i + 1), D(i - 1, i + 1)
        m = np.minimum(p, n)
        bad = (m > a.limit) & (s < m / 3)
        if bad.any():
            k = np.unravel_index(np.argmax(np.where(bad, m, 0)), m.shape)
            hits.append((i, 1, k, float(m[k]), float(s[k])))
    for i in range(1, len(F) - 2):
        p, n, s, inner = D(i, i - 1), D(i + 1, i + 2), D(i - 1, i + 2), D(i, i + 1)
        m = np.minimum(p, n)
        bad = (m > a.limit) & (s < m / 3) & (inner < m / 2)
        if bad.any() and not any(h[0] in (i, i + 1) for h in hits):
            k = np.unravel_index(np.argmax(np.where(bad, m, 0)), m.shape)
            hits.append((i, 2, k, float(m[k]), float(s[k])))
    hits.sort()
    print(f"프레임 {len(F)} 장 ({a.a:.2f} s 부터) · 칸 {a.grid}x{a.grid} · 기준 {a.limit:g}")
    for i, n, (r, c), v, s in hits:
        t = a.a + i / a.fps
        print(f"  {t:7.3f} s (프레임 {round(t * a.fps)}) {n}프레임 튐 · 칸 행{r} 열{c} · 앞뒤 차이 {v:.1f} · 건너 차이 {s:.1f}")
    print(f"깜빡임 {len(hits)} 곳")
    print("FLICKER_CHECK " + ("PASS" if not hits else "FAIL"))
    sys.exit(0 if not hits else 1)


if __name__ == "__main__":
    main()
