"""인코딩된 mp4 에서 접촉 시트(X 글 6단계 "박자마다 정지 화면"): 키워드 시각 +0.3 s 와 장면 경계 앞뒤 0.2 s 훑기.

    python lib/sheet.py out.mp4 --build <프로젝트>/build --out <폴더>
출력: beats_N.jpg (키워드마다 한 칸, 칸마다 t= · 장면 · 키워드), cuts_N.jpg (장면 경계 −0.4 ~ +0.4 s, 0.2 s 간격)
"""
import argparse, json, subprocess, io
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT = next((f for f in ["/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
                         "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"] if Path(f).exists()), None)


def grab(video, t, w):
    png = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-ss", f"{max(t, 0):.3f}", "-i", video, "-frames:v", "1", "-vf", f"scale={w}:-1",
                          "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True, check=True).stdout
    return Image.open(io.BytesIO(png)).convert("RGB")


def tile(video, items, out, cols=4, w=480):
    ims = [(grab(video, t, w), lab) for t, lab in items]
    if not ims:
        return []
    h = ims[0][0].height
    f = ImageFont.truetype(FONT, 20) if FONT else ImageFont.load_default()
    paths, per = [], cols * 4
    for k in range(0, len(ims), per):
        chunk = ims[k:k + per]
        rows = (len(chunk) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * w, rows * (h + 30)), "white")
        d = ImageDraw.Draw(sheet)
        for i, (im, lab) in enumerate(chunk):
            x, y = (i % cols) * w, (i // cols) * (h + 30)
            sheet.paste(im, (x, y + 30)); d.text((x + 6, y + 3), lab, fill="black", font=f)
        p = out.with_name(f"{out.stem}_{k // per + 1}.jpg"); sheet.save(p, quality=88); paths.append(p)
    return paths


ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("--build", required=True); ap.add_argument("--out", required=True)
a = ap.parse_args()
B, O = Path(a.build), Path(a.out); O.mkdir(parents=True, exist_ok=True)
tl = json.loads((B / "timeline.json").read_text()); wt = json.loads((B / "word_times.json").read_text())
beats = [(0.0, "t=0.00 첫 프레임(썸네일 후보)")]
for ln in wt["lines"]:
    for w in ln["words"]:
        beats.append((w["t"] + 0.3, f"t={w['t'] + 0.3:.2f} {ln['scene']} · {w['word']}"))
cuts = []
for n in tl["order"][1:]:
    s = tl["modules"][n]["start"]
    for d in (-0.4, -0.2, 0.0, 0.2, 0.4):
        cuts.append((s + d, f"t={s + d:.2f} → {n} {d:+.1f}"))
for p in tile(a.video, beats, O / "beats") + tile(a.video, cuts, O / "cuts", cols=5, w=384):
    print(p)
