"""Measure EBU R128 integrated loudness/true peak and decoded sample integrity.

python lib/check_audio.py <mp4|wav> [--mutate gain]
python lib/check_audio.py <mp4> --stems build/stems [--mutate bed-quiet|bed-loud|bed-subbass|sfx-quiet]
--stems: audibility of the bed and SFX against the narration, from mix.py's mastered stems
(EBU R128 momentary loudness, 400 ms, every 100 ms; LU = stem minus integrated voice):
  bed in speech gaps -22..-9 LU, bed under speech -30..-14 LU, ducking >= 3 dB,
  bed and SFX lose <= 6 dB when everything below 200 Hz is removed (earbuds),
  every cue's momentary peak -26..-3 LU, and the stems sum to the media's loudness (+-1 LU).
  No cues (e.g. no rig and no number card): the cue rules print SFX_CHECK 실제 SKIP and
  --mutate sfx-quiet prints SFX_MUTATION SKIP no cues (nothing to make quieter) instead of a verdict.
Silence is <= -50 dBFS in all channels; only gaps between the first and last
non-silent samples count (leading/trailing padding is not a speech gap).
Gain mutation is applied before measurement, in float PCM, never hard-limited.
"""
import argparse
import array
import math
import os
import re
import subprocess
import sys
import time


def run(cmd):
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)


GAP_LU, SPEECH_LU, MIN_DUCK_DB, MAX_BAND_LOSS_DB, CUE_LU, SUM_TOL_LU = (-22, -9), (-30, -14), 3, 6, (-26, -3), 1
MUTATIONS = {"bed-quiet": ("music", "volume=-20dB", "bed_gap"), "bed-loud": ("music", "volume=15dB", "bed_speech"),
             "bed-subbass": ("music", "lowpass=f=120:poles=2,lowpass=f=120:poles=2,volume=12dB", "bed_band"),
             "sfx-quiet": ("sfx", "volume=-25dB", "cue")}


def integrated(path, af=None):
    err = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", (af + "," if af else "") + "ebur128",
               "-f", "null", "-"]).stderr.decode(errors="replace").rsplit("Summary:", 1)[-1]
    return float(re.search(r"\bI:\s*([-\w.]+)\s*LUFS", err)[1])


def momentary(path, af=None):
    err = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", (af + "," if af else "") + "ebur128",
               "-f", "null", "-"]).stderr.decode(errors="replace").replace("-inf", "-120")
    return [(float(t), float(m)) for t, m in re.findall(r"t:\s*([\d.]+)\s+TARGET:[^M]*M:\s*([-\d.]+)", err)]


def median(xs):
    xs = sorted(xs)
    return (xs[(len(xs) - 1) // 2] + xs[len(xs) // 2]) / 2 if xs else None


def stems_main(a):
    from pathlib import Path
    import json
    start = time.monotonic()
    d = Path(a.stems)
    meta = json.loads((d / "stems.json").read_text())
    kind, extra, expect = MUTATIONS.get(a.mutate, (None, None, None))
    af = {"music": extra if kind == "music" else None, "sfx": extra if kind == "sfx" else None}
    voice = integrated(d / "voice.wav")
    music = momentary(d / "music.wav", af["music"])
    speech = meta["speech"]
    def overlaps(a0, b0, pad):
        return any(a0 < e + pad and b0 > s - pad for s, e in speech)
    # A momentary value at t covers t-0.4..t. Gap frames must clear the 400 ms release after speech.
    gap = [m for t, m in music if not overlaps(t - .4, t, .45)]
    talk = [m for t, m in music if any(s + .3 <= t - .2 <= e - .1 for s, e in speech)]
    failures, rows = [], []
    gap_lu = median(gap) - voice if gap else None
    talk_lu = median(talk) - voice if talk else None
    if meta.get("music"):
        if gap_lu is None or not GAP_LU[0] <= gap_lu <= GAP_LU[1]:
            failures.append(("bed_gap", f"{gap_lu if gap_lu is None else round(gap_lu, 2)} LU over {len(gap)} gap windows; required {GAP_LU[0]}..{GAP_LU[1]}"))
        if talk_lu is None or not SPEECH_LU[0] <= talk_lu <= SPEECH_LU[1]:
            failures.append(("bed_speech", f"{talk_lu if talk_lu is None else round(talk_lu, 2)} LU over {len(talk)} speech windows; required {SPEECH_LU[0]}..{SPEECH_LU[1]}"))
        if gap_lu is not None and talk_lu is not None and gap_lu - talk_lu < MIN_DUCK_DB:
            failures.append(("bed_duck", f"{gap_lu - talk_lu:.2f} dB; required >= {MIN_DUCK_DB}"))
        full = integrated(d / "music.wav", af["music"])
        hp = integrated(d / "music.wav", (af["music"] + "," if af["music"] else "") + "highpass=f=200:poles=2,highpass=f=200:poles=2")
        rows.append(f"bed_band_loss_db={full - hp:.2f}")
        if full - hp > MAX_BAND_LOSS_DB:
            failures.append(("bed_band", f"{full - hp:.2f} dB lost above 200 Hz high-pass; required <= {MAX_BAND_LOSS_DB}"))
    cues = meta.get("cues", [])
    if cues:
        sfx = momentary(d / "sfx.wav", af["sfx"])
        full = integrated(d / "sfx.wav", af["sfx"])
        hp = integrated(d / "sfx.wav", (af["sfx"] + "," if af["sfx"] else "") + "highpass=f=200:poles=2,highpass=f=200:poles=2")
        rows.append(f"sfx_band_loss_db={full - hp:.2f}")
        if full - hp > MAX_BAND_LOSS_DB:
            failures.append(("sfx_band", f"{full - hp:.2f} dB lost above 200 Hz high-pass; required <= {MAX_BAND_LOSS_DB}"))
        worst = []
        for c in cues:
            win = [m for t, m in sfx if c["t"] + .05 <= t <= c["t"] + min(c["duration"], 2) + .45]
            peak = (max(win) if win else -120) - voice
            worst.append(peak)
            if not CUE_LU[0] <= peak <= CUE_LU[1]:
                failures.append(("cue", f"{c['sfx']} at {c['t']:.2f}s peak {peak:.2f} LU; required {CUE_LU[0]}..{CUE_LU[1]}"))
        rows.append(f"cues={len(cues)} cue_peak_lu_min={min(worst):.2f} max={max(worst):.2f}")
    else:
        rows.append("cues=0")
    tmp = d / f".sum.{os.getpid()}.wav"
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(d / "voice.wav"), "-i", str(d / "music.wav"), "-i",
         str(d / "sfx.wav"), "-filter_complex", "amix=inputs=3:normalize=0", str(tmp)])
    total, media = integrated(tmp), integrated(a.media)
    tmp.unlink()
    if abs(total - media) > SUM_TOL_LU:
        failures.append(("stems_stale", f"stems sum {total:.2f} LUFS vs media {media:.2f} LUFS; required within {SUM_TOL_LU}"))
    print(f"voice_lufs={voice:.2f} bed_gap_lu={gap_lu if gap_lu is None else round(gap_lu, 2)} "
          f"bed_speech_lu={talk_lu if talk_lu is None else round(talk_lu, 2)} stems_sum_lufs={total:.2f} media_lufs={media:.2f}")
    print(" ".join(rows))
    if not cues:
        print("SFX_CHECK 실제 SKIP (효과음 큐 0개)")
    print("| rule | values |")
    print("|---|---|")
    for rule, value in failures:
        print(f"| {rule} | {value} |")
    if a.mutate:
        print(f"mutation={a.mutate} {kind} {extra}")
        if expect == "cue" and not cues:
            print("SFX_MUTATION SKIP no cues")
            print("MUTATION_SKIP")
        else:
            print("MUTATION_CAUGHT" if any(rule == expect for rule, _ in failures) else "MUTATION_NOT_CAUGHT")
    print(f"runtime_s={time.monotonic()-start:.3f}")
    print("AUDIO_CHECK " + ("FAIL" if failures else "PASS"))
    return int(bool(failures))


def main(a):
    if a.stems:
        return stems_main(a)
    start = time.monotonic()
    filters = ["volume=12dB"] if a.mutate else []
    measurement = run(["ffmpeg", "-hide_banner", "-nostats", "-i", a.media, "-vn",
                       "-af", ",".join(filters + ["ebur128=peak=true"]), "-f", "null", "-"])
    summary = measurement.stderr.decode(errors="replace").rsplit("Summary:", 1)[-1]
    integrated = re.search(r"\bI:\s*([-\w.]+)\s*LUFS", summary)
    peak = re.search(r"\bPeak:\s*([-\w.]+)\s*dBFS", summary)
    if not integrated or not peak:
        raise RuntimeError("ffmpeg ebur128 did not return integrated loudness and true peak")
    lufs, tp = float(integrated[1]), float(peak[1])
    # Preserve input channel count; decoding to float avoids integer conversion
    # clipping before the >= .999 sample test.
    probe = run(["ffprobe", "-v", "error", "-select_streams", "a:0",
                 "-show_entries", "stream=sample_rate,channels", "-of", "csv=p=0", a.media])
    rate, channels = map(int, probe.stdout.decode().strip().split(",")[:2])
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-i", a.media, "-map", "0:a:0", "-vn"]
    if filters:
        cmd += ["-af", ",".join(filters)]
    pcm = run(cmd + ["-c:a", "pcm_f32le", "-f", "f32le", "-"])
    samples = array.array("f")
    samples.frombytes(pcm.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    clipped = sum(abs(x) >= .999 for x in samples)
    invalid = sum(not math.isfinite(x) for x in samples)
    limit = 10 ** (-50 / 20)
    gaps, first, last, silence_start = [], None, None, None
    for frame in range(len(samples) // channels):
        active = any(abs(samples[frame * channels + c]) > limit for c in range(channels))
        if active:
            if first is None:
                first = frame
            if silence_start is not None and (frame - silence_start) / rate > 2.5:
                gaps.append((silence_start / rate, frame / rate))
            last, silence_start = frame, None
        elif first is not None and silence_start is None:
            silence_start = frame
    failures = []
    if not math.isfinite(lufs) or abs(lufs + 16) > 1:
        failures.append(("integrated", f"{lufs:.2f} LUFS; required -17..-15"))
    if not math.isfinite(tp) or tp > -1:
        failures.append(("true_peak", f"{tp:.2f} dBTP; required <= -1"))
    if clipped:
        failures.append(("clipping", f"{clipped} samples with |x| >= .999"))
    if invalid:
        failures.append(("invalid_pcm", f"{invalid} non-finite samples"))
    if first is None:
        failures.append(("speech", "no samples above -50 dBFS"))
    for s, e in gaps:
        failures.append(("silence", f"{s:.3f}..{e:.3f}s ({e-s:.3f}s) inside speech region"))
    print(f"integrated_lufs={lufs:.2f} true_peak_dbtp={tp:.2f} clipped_samples={clipped} "
          f"sample_rate={rate} channels={channels}")
    print(f"speech_region_s={None if first is None else round(first/rate, 3)}.."
          f"{None if last is None else round(last/rate, 3)} silence_threshold_dbfs=-50")
    print("| rule | values |")
    print("|---|---|")
    for rule, value in failures:
        print(f"| {rule} | {value} |")
    if a.mutate:
        caught = any(rule in ("integrated", "true_peak", "clipping") for rule, _ in failures)
        print("MUTATION_CAUGHT" if caught else "MUTATION_NOT_CAUGHT")
    print(f"runtime_s={time.monotonic()-start:.3f}")
    print("AUDIO_CHECK " + ("FAIL" if failures else "PASS"))
    return int(bool(failures))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("media")
    ap.add_argument("--mutate", choices=["gain", *MUTATIONS])
    ap.add_argument("--stems")
    a = ap.parse_args()
    if (a.mutate in MUTATIONS) != bool(a.stems and a.mutate):
        ap.error("--mutate gain is for the plain check; bed-*/sfx-* need --stems")
    try:
        sys.exit(main(a))
    except (subprocess.CalledProcessError, RuntimeError, ValueError) as e:
        detail = e.stderr.decode(errors="replace") if isinstance(e, subprocess.CalledProcessError) else str(e)
        print(f"AUDIO_ERROR {detail}")
        print("AUDIO_CHECK FAIL")
        sys.exit(1)
