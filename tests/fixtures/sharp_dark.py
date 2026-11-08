"""test_sharp.sh fixture: a dark, low-detail still video (a grid of flat dark tiles with soft 2 px outlines).

    python sharp_dark.py <out.mp4> <seconds>

Synthetic only. Like a dark render scene, 0.3 Mb/s and half resolution barely touch it (frame fidelity ~0.92 / ~0.84 at
6 s) while 1/4 resolution does (~0.50); every region has edges, so the subject mask always lands on some.
"""
import subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

rng = np.random.default_rng(7)
W, H = 1920, 1080
im = Image.new("RGB", (W, H), (34, 37, 40))
d = ImageDraw.Draw(im)
for y in range(0, H, 180):
    for x in range(0, W, 240):
        v = int(rng.integers(38, 70))
        d.rectangle([x + 6, y + 6, x + 234, y + 174], fill=(v, v + 3, v + 6), outline=(v + 16, v + 18, v + 20), width=2)
raw = im.filter(ImageFilter.GaussianBlur(0.8)).tobytes()
p = subprocess.Popen(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", "30",
                      "-i", "-", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", sys.argv[1]], stdin=subprocess.PIPE)
for _ in range(int(float(sys.argv[2]) * 30)):
    p.stdin.write(raw)
p.stdin.close()
sys.exit(p.wait())
