"""한두 프레임 튀었다 돌아오는 곳(깜빡임) 검사. check_cuts(화면 전체 밝기 급변)가 못 잡는 작은 자리 깜빡임까지.

    uv run --no-project --with numpy python lib/check_flicker.py out.mp4 [--from 0] [--to END] [--limit 6] [--grid 8]

프레임을 192x108 회색으로 줄여 8x8 칸으로 나누고, 칸마다 평균 절대 차이를 잰다(전체 평균이면 작은 자리가 묻힌다).
  1프레임 튐: 칸 하나라도 d(i, i-1) 와 d(i, i+1) 가 둘 다 limit 넘고, d(i-1, i+1) 는 그 1/3 아래 → 튀었다 돌아옴
  2프레임 튐: 프레임 i, i+1 둘이 앞뒤(i-1, i+2)와 다르고 i-1 과 i+2 는 서로 비슷
출력 끝줄 FLICKER_CHECK PASS|FAIL, 종료 코드 0/1. 걸린 곳마다 시각·칸·값.

    ... check_flicker.py out.mp4 --place N [--aspect 2.35:1]   변이(rv) 상자를 ffmpeg drawbox 값(x:y:w:h:color)으로 출력
자리: 그림 안 같은 상대 자리(왼쪽 1/8, 위에서 5/8, 크기 1/8). 그림 = script.json "aspect", 없으면 프레임 N 에서
가장자리부터 양 끝까지 검은 행(레터박스)·열(필러박스)을 뺀 나머지(장면이 막대를 직접 그린 영상). 막대가
없으면 옛 자리(x = iw/8, y = ih*5/8). 색: 검정, 그 자리 평균 밝기가 3*limit 아래면 흰색 — 검은 자리에 검정을
칠하면 바뀌는 게 없어 변이가 아니다(어두운 배경의 2.35:1 영상에서 MUTATION_NOT_CAUGHT, 2026-11-08).
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


def place(path, n, fps, aspect, limit):
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-ss", str(n / fps), "-i", path, "-frames:v", "1",
                          "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
    w, h = map(int, subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                    "-of", "csv=p=0", path], capture_output=True, text=True, check=True).stdout.split(",")[:2])
    f = np.frombuffer(raw, np.uint8).reshape(h, w)

    def run(lines):   # how many lines from the start are black from one end to the other (captions and badges stop short)
        black = (lines[:, :8] <= 8).all(axis=1) & (lines[:, -8:] <= 8).all(axis=1)
        return int(np.argmin(black)) if not black.all() else len(black)
    if aspect:   # same picture as kit/shell.html window.PICTURE
        aw, ah = map(float, aspect.split(":"))
        r = aw / ah
        pw, ph = (1, round(1920 / r) / 1080) if r > 16 / 9 else (round(1080 * r) / 1920, 1)
        x, y = (1 - pw) / 2, (1 - ph) / 2
    else:
        top, bottom = run(f), run(f[::-1])
        if top + bottom >= h:   # a black frame has no bars, only black
            top = bottom = 0
        inner = f[top:h - bottom].T   # columns between the letterbox bars, so their ends are picture, not bar
        left, right = run(inner), run(inner[::-1])
        if left + right >= w:
            left = right = 0
        x, y, pw, ph = left / w, top / h, (w - left - right) / w, (h - top - bottom) / h
    bx, by = round((x + pw / 8) * w), round((y + ph * 5 / 8) * h)
    box = f[by:by + max(1, round(ph * h / 8)), bx:bx + max(1, round(pw * w / 8))]
    color = "black" if box.mean() >= 3 * limit else "white"
    print(f"x={x:.4f}*iw+{pw:.4f}*iw/8:y={y:.4f}*ih+{ph:.4f}*ih*5/8:w={pw:.4f}*iw/8:h={ph:.4f}*ih/8:color={color}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--from", dest="a", type=float, default=0.0)
    ap.add_argument("--to", dest="b", type=float, default=None)
    ap.add_argument("--fps", type=float, default=30.0)
    ap.add_argument("--limit", type=float, default=6.0)
    ap.add_argument("--grid", type=int, default=8)
    ap.add_argument("--place", type=int, help="이 프레임 그림 안 변이 상자(drawbox x:y:w:h:color)만 출력")
    ap.add_argument("--aspect", default="", help='script.json "aspect" (없으면 프레임의 가장자리 검은 막대를 뺀 나머지)')
    a = ap.parse_args()
    if a.place is not None:
        return place(a.video, a.place, a.fps, a.aspect, a.limit)
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
