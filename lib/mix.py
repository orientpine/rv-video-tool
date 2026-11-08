"""Local deterministic sound bed, cues and two-pass -16 LUFS mastering.

python3 lib/mix.py PROJECT --narration build/narration.wav --out build/mix.wav
Optional: --music WAV|synth:ambient --sfx cues.json --duck-db 6 --music-lu -15
Only Python's standard library and ffmpeg are required.

Levels are relative to the measured narration loudness (LU), not absolute dBFS:
the bed sits at music_lu below speech in pauses and duck_db lower under speech;
each cue's momentary peak sits at its kind's default LU (or cue "gain_lu").
All synthesized sounds put their energy in 200 Hz-5 kHz (harmonics), because
earbuds and phone speakers barely reproduce the sub-200 Hz range (ITU-T P.340).
The mastered stems (voice, music bed, sfx) and stems.json are written next to
the mix for check_audio.py --stems.
"""
import argparse
from array import array
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile

SR = 24000
BLOCK = 240
# 말 틈 배경음 = 말 −15 LU, 말할 때 6 dB 더 줄임 → 말 −21 LU
# (W3C: 배경은 말보다 20 dB 아래면 말이 또렷함 — https://www.w3.org/WAI/WCAG21/Understanding/low-or-no-background-audio).
MUSIC_LU = -15.0
DUCK_DB = 6.0
# 효과음 종류별 기본 크기(400 ms 순간 음량 최댓값, 말 대비 LU). 짧은 소리는 400 ms 창 평균이라 실제 귀 크기보다 낮게 잡힌다.
SFX_LU = {"click": -12, "footstep": -16, "servo": -17, "rotor": -22, "drone": -22, "tone": -12}
SYNTH = tuple(SFX_LU)
DEFAULT_DUR = {"click": .12, "footstep": .16, "tone": .45, "servo": 1.2, "rotor": 4, "drone": 4}


def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True)


def decode(path):
    return array("f", run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(path),
                           "-ar", str(SR), "-ac", "1", "-f", "f32le", "-"]).stdout)


class Noise:
    """Deterministic LCG white noise in [-1, 1] (no random module, same every run)."""
    def __init__(self, seed):
        self.s = seed & 0xFFFFFFFF

    def __call__(self):
        self.s = (1664525 * self.s + 1013904223) & 0xFFFFFFFF
        return self.s / 2147483648.0 - 1.0


def tone(f, t, harmonics=4, tilt=1.3):
    return sum(math.sin(2 * math.pi * f * h * t) / h ** tilt for h in range(1, harmonics + 1))


# 배경음: Am-F-C-G 패드(배음 4개) + 0.5 s 마다 화음 음 하나를 튕기는 아르페지오. 16 s 한 바퀴를 이어 붙임.
CHORDS = [(220.0, 261.63, 329.63), (174.61, 220.0, 261.63), (196.0, 261.63, 329.63), (196.0, 246.94, 293.66)]
BASS = [110.0, 87.31, 130.81, 98.0]


def ambient_loop():
    n, out, chord_s = 16 * SR, array("f"), 4.0
    for i in range(n):
        t = i / SR
        k = int(t // chord_s) % 4
        u = (t % chord_s) / chord_s
        # Chords overlap by 0.6 s with raised-cosine fades: no click at the change.
        v = 0.0
        for kk, w in ((k, min(1.0, u / .15) if t >= chord_s else 1.0), ((k - 1) % 4, max(0.0, 1 - u / .15))):
            if w <= 0:
                continue
            w = .5 - .5 * math.cos(math.pi * w)
            v += w * (sum(tone(f, t, 4) for f in CHORDS[kk]) * .16 + tone(BASS[kk], t, 6) * .14)
        v *= .85 + .15 * math.sin(2 * math.pi * .125 * t)
        step = int(t / .5)
        local = t - step * .5
        f = CHORDS[k][(0, 1, 2, 1)[step % 4]] * 2
        v += .22 * math.exp(-5 * local) * min(1.0, local / .004) * tone(f, local, 3, 1.6)
        out.append(v)
    return out


def synth(kind, duration, rotation_hz=2.0):
    """Original analytic waveforms: no recordings, samples or random state."""
    if kind == "ambient":
        loop = ambient_loop()
        n = round(duration * SR)
        return (loop * math.ceil(n / len(loop)))[:n]
    n = round(duration * SR)
    out = array("f")
    noise = Noise(len(kind) * 7919)
    phase, lp = 0.0, 0.0
    for i in range(n):
        t = i / SR
        if kind == "drone":
            v = .3 * tone(96, t, 8, 1.0) * (.8 + .2 * math.sin(2 * math.pi * .5 * t))
        elif kind == "rotor":
            # "웅": hum whose pitch rises with rotation speed, harmonics up to ~1 kHz,
            # blade-pass wobble at 4 x rotation.
            f0 = 90 + 60 * rotation_hz
            v = .3 * tone(f0, t, 7, 1.1) * (1 + .3 * math.sin(2 * math.pi * 4 * rotation_hz * t))
        elif kind == "servo":
            # Motor whine sweeping 520 -> 880 Hz with a 45 Hz gear buzz.
            u = t / max(duration, 1e-3)
            phase += 2 * math.pi * (520 + 360 * math.sin(math.pi * u / 2)) / SR
            w = sum(math.sin(h * phase) / h for h in (1, 2, 3))
            v = .3 * w * (.75 + .25 * math.sin(2 * math.pi * 45 * t)) * min(1.0, t / .06, (duration - t) / .1)
        elif kind == "click":
            # "딸깍": two transients 35 ms apart (latch then seat), 2.4 kHz ring + 700 Hz body.
            v = 0.0
            for t0, a in ((0.0, 1.0), (.035, .7)):
                x = t - t0
                if x >= 0:
                    v += a * (.5 * math.exp(-90 * x) * math.sin(2 * math.pi * 2400 * x)
                              + .35 * math.exp(-60 * x) * math.sin(2 * math.pi * 700 * x)
                              + .4 * math.exp(-400 * x) * noise())
        elif kind == "footstep":
            # Metal foot: 110 Hz thump + 420 Hz knock + short high scuff.
            lp += .3 * (noise() - lp)
            v = (.55 * math.exp(-35 * t) * math.sin(2 * math.pi * 110 * t)
                 + .45 * math.exp(-45 * t) * math.sin(2 * math.pi * 420 * t)
                 + .3 * math.exp(-80 * t) * math.sin(2 * math.pi * 1650 * t)
                 + .25 * math.exp(-120 * t) * lp)
        elif kind == "tone":
            # Number card: short C6 bell.
            v = .5 * math.exp(-9 * t) * (math.sin(2 * math.pi * 1046.5 * t) + .3 * math.sin(2 * math.pi * 2093 * t)
                                         + .15 * math.sin(2 * math.pi * 3139.5 * t))
        else:
            raise ValueError(f"Unknown synthesized SFX: {kind}")
        fade_in = .004 if kind in ("click", "footstep", "tone") else .2 if kind in ("rotor", "drone") else .02
        fade_out = .3 if kind in ("rotor", "drone") else .03
        fade = min(1.0, t / fade_in, (duration - t) / fade_out)
        out.append(v * max(0, fade))
    return out


def measure(path):
    result = run(["ffmpeg", "-hide_banner", "-i", str(path), "-af",
                  "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"])
    return json.loads(re.findall(rb"\{[^{}]*\}", result.stderr)[-1])


def momentary(path, af=None):
    """EBU R128 momentary loudness (400 ms window) every 100 ms: [(t_end_s, LUFS)]."""
    chain = (af + "," if af else "") + "ebur128"
    err = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", chain, "-f", "null", "-"]).stderr
    return [(float(t), float(m)) for t, m in
            re.findall(rb"t:\s*([\d.]+)\s+TARGET:[^M]*M:\s*([-\d.]+|-inf)", err.replace(b"-inf", b"-120"))]


def wav(samples, path):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR),
                    "-ac", "1", "-i", "-", "-ar", "48000", "-ac", "2", str(path)],
                   input=samples.tobytes(), check=True)


def scaled(samples, gain):
    return array("f", (x * gain for x in samples))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("project", type=Path)
    ap.add_argument("--narration", default="build/narration.wav")
    ap.add_argument("--out", default="build/mix.wav")
    ap.add_argument("--music")
    ap.add_argument("--sfx", type=Path)
    ap.add_argument("--duck-db", type=float)
    ap.add_argument("--music-lu", type=float)
    ap.add_argument("--stems", default="build/stems", help="mastered voice/music/sfx stems + stems.json")
    a = ap.parse_args()
    project = a.project.resolve()
    spec = json.loads((project / "script.json").read_text()).get("sound", {})
    resolve = lambda p: project / p
    narration = decode(resolve(a.narration))
    n = len(narration)
    duration = n / SR
    music_lu = a.music_lu if a.music_lu is not None else float(spec.get("music_lu", MUSIC_LU))
    duck_db = a.duck_db if a.duck_db is not None else float(spec.get("duck_db", DUCK_DB))
    music_name = a.music or spec.get("music")
    music = synth("ambient", duration) if music_name == "synth:ambient" else (
        decode(resolve(music_name)) if music_name else array("f", [0]) * n)
    if not music:
        raise ValueError("Music file contains no samples")
    if len(music) < n:
        music = (music * math.ceil(n / len(music)))[:n]
    music = music[:n]
    with tempfile.TemporaryDirectory(prefix="rv-mix-") as tmp:
        tmp = Path(tmp)
        speech_lufs = float(measure(resolve(a.narration))["input_i"])
        music_gain = 0.0
        if music_name:
            wav(music, tmp / "music_raw.wav")
            music_lufs = float(measure(tmp / "music_raw.wav")["input_i"])
            music_gain = 10 ** ((speech_lufs + music_lu - music_lufs) / 20)
        active = [False] * math.ceil(n / BLOCK)
        speech = []
        timing = project / "build/word_times.json"
        if timing.exists():
            for line in json.loads(timing.read_text())["lines"]:
                speech.append([line["speech_start"], line["speech_end"]])
                for k in range(max(0, int(line["speech_start"] * 100)),
                               min(len(active), math.ceil(line["speech_end"] * 100))):
                    active[k] = True
        else:
            for k in range(len(active)):
                chunk = narration[k * BLOCK:(k + 1) * BLOCK]
                active[k] = sum(x * x for x in chunk) / len(chunk) > 10 ** (-42 / 10)
            for k, yes in enumerate(active):
                if yes and (not speech or speech[-1][1] < k / 100 - .3):
                    speech.append([k / 100, (k + 1) / 100])
                elif yes:
                    speech[-1][1] = (k + 1) / 100
        # Look-ahead attack: reach full attenuation at speech onset, release
        # over 400 ms after speech. Adjacent words therefore never pump the bed.
        amount = [float(x) for x in active]
        for k, yes in enumerate(active):
            if yes:
                for j in range(max(0, k - 15), k):
                    amount[j] = max(amount[j], 1 - (k - j) / 15)
                for j in range(k + 1, min(len(active), k + 42)):
                    amount[j] = max(amount[j], 1 - (j - k - 1) / 40)
        bed = array("f", bytes(4 * n))
        for i in range(n):
            k = i // BLOCK
            fraction = (i % BLOCK) / BLOCK
            next_amount = amount[min(k + 1, len(amount) - 1)]
            # Do not release inside the final speech block.
            depth = amount[k] if active[k] else amount[k] + (next_amount - amount[k]) * fraction
            bed[i] = music[i] * music_gain * 10 ** (-duck_db * depth / 20)
        cues = spec.get("cues", [])
        if cues == "auto":
            cues = []
        if spec.get("auto_cues") or spec.get("cues") == "auto":
            auto = project / "build/cues_auto.json"
            if not auto.exists():
                raise FileNotFoundError(f"auto cues requested but {auto} is missing (lib/cues.py)")
            cues = list(cues) + json.loads(auto.read_text())["cues"]
        if a.sfx:
            cues = json.loads(resolve(a.sfx).read_text())["cues"]
        sfx = array("f", bytes(4 * n))
        cal, placed, legacy = {}, [], 0
        for cue in sorted(cues, key=lambda c: float(c["t"])):
            kind = cue["sfx"]
            dur = float(cue.get("duration", DEFAULT_DUR.get(kind, 2)))
            rot = float(cue.get("rotation_hz", 2))
            samples = synth(kind, dur, rot) if kind in SYNTH else decode(resolve(kind))
            key = (kind, round(dur, 2), round(rot, 2))
            if key not in cal:
                # Calibrate each distinct sound once: its momentary (400 ms) peak loudness.
                p = tmp / f"cal{len(cal)}.wav"
                wav(array("f", bytes(4 * round(.5 * SR))) + samples + array("f", bytes(4 * round(.5 * SR))), p)
                cal[key] = max(m for _, m in momentary(p))
            if "gain_db" in cue and "gain_lu" not in cue:
                legacy += 1   # 예전 절대 dB 값: 말 기준 LU 로 바뀌어 무시(README "소리")
            target = float(cue.get("gain_lu", SFX_LU.get(kind, -14)))
            gain = 10 ** ((speech_lufs + target - cal[key]) / 20)
            start = round(float(cue["t"]) * SR)
            for j, value in enumerate(samples):
                if 0 <= start + j < n:
                    sfx[start + j] += value * gain
            placed.append({"t": round(float(cue["t"]), 3), "sfx": kind, "duration": round(len(samples) / SR, 3),
                           "gain_lu": target, **({"why": cue["why"]} if "why" in cue else {})})
        mixed = array("f", (v + b + s for v, b, s in zip(narration, bed, sfx)))
        out = resolve(a.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        raw_path = tmp / "raw.wav"
        wav(mixed, raw_path)
        m = measure(raw_path)
        filt = ("loudnorm=I=-16:TP=-1.6:LRA=11:"
                f"measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
                f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:"
                f"offset={m['target_offset']}:linear=true")
        run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(raw_path), "-af", filt,
             "-ar", "48000", "-c:a", "pcm_s24le", str(out)])
        result = measure(out)
        master_db = float(result["input_i"]) - float(m["input_i"])
        g = 10 ** (master_db / 20)
        stems = resolve(a.stems)
        stems.mkdir(parents=True, exist_ok=True)
        for name, part in (("voice", narration), ("music", bed), ("sfx", sfx)):
            wav(scaled(part, g), stems / f"{name}.wav")
        (stems / "stems.json").write_text(json.dumps({
            "mix": str(out), "master_gain_db": master_db, "speech_lufs_before_master": speech_lufs,
            "music_lu": music_lu if music_name else None, "duck_db": duck_db, "music": music_name,
            "speech": speech, "cues": placed}, ensure_ascii=False, indent=1))
    def db(value):
        return 10 * math.log10(value) if value > 0 else None
    sums = [[0.0, 0], [0.0, 0]]
    for i in range(n):
        e = sums[int(active[i // BLOCK])]
        e[0] += bed[i] * bed[i]
        e[1] += 1
    levels = [db(e[0] / e[1]) if e[1] else None for e in sums]
    duck = levels[0] - levels[1] if None not in levels else None
    stats = {"integrated_lufs": float(result["input_i"]),
             "true_peak_dbtp": float(result["input_tp"]),
             "speech_lufs": speech_lufs, "music_lu": music_lu if music_name else None, "duck_db": duck_db,
             "music_gap_dbfs": levels[0], "music_speech_dbfs": levels[1],
             "music_level_reference": "music stem before common mix mastering",
             "duck_measured_db": duck,
             "duck_pass": duck >= duck_db - 2 if duck is not None else None,
             "cues": len(placed), "legacy_gain_db_ignored": legacy,
             "activity_source": "word_times" if timing.exists() else "envelope",
             "attack_ms": 150, "release_ms": 400, "out": str(out), "stems": str(stems)}
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
