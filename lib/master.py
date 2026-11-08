"""나레이션 wav 음량 맞춤(ffmpeg loudnorm 2패스): 기본 −16 LUFS, 참 피크 −1.5 dBTP. X 글은 −14(음악) — 말이 주인이라 −16.

    python lib/master.py in.wav out.wav [--lufs -16] [--tp -1.5]
"""
import argparse, json, re, subprocess
ap = argparse.ArgumentParser(); ap.add_argument("inp"); ap.add_argument("out")
ap.add_argument("--lufs", type=float, default=-16); ap.add_argument("--tp", type=float, default=-1.5); a = ap.parse_args()
f = f"loudnorm=I={a.lufs}:TP={a.tp}:LRA=11"
err = subprocess.run(["ffmpeg", "-hide_banner", "-i", a.inp, "-af", f + ":print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
m = json.loads(re.findall(r"\{[^{}]*\}", err)[-1])
f2 = (f + f":measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}"
      f":offset={m['target_offset']}:linear=true")
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", a.inp, "-af", f2, "-ar", "48000", "-c:a", "pcm_s16le", a.out], check=True)
err = subprocess.run(["ffmpeg", "-hide_banner", "-i", a.out, "-af", f + ":print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
o = json.loads(re.findall(r"\{[^{}]*\}", err)[-1])
print(f"MASTER 입력 {m['input_i']} LUFS / {m['input_tp']} dBTP → 결과 {o['input_i']} LUFS / {o['input_tp']} dBTP")
