"""Original score and sound effects for the premium morphing-wheel film, synthesized from scratch (no samples).

Reads build/timeline.json and build/word_times.json so every musical event lands on the picture's events:
the stop at the step, the droplet impact, the wire pull/release, the contact and the arrival on top, the title.
Writes audio/score.wav (music bed incl. street ambience) and audio/sfx_*.wav, plus audio/cues.json for script.json.
"""
import json
import sys
from pathlib import Path

import numpy as np

SR = 48000
P = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent)
TL = json.loads((P / "build/timeline.json").read_text())
WT = json.loads((P / "build/word_times.json").read_text())
TOTAL = TL["total_s"]
N = int(round(TOTAL * SR))
rng = np.random.default_rng(20261108)
BPM = 76.0
BEAT = 60.0 / BPM


def start(scene):
    return TL["modules"][scene]["start"]


def word(scene, w):
    for line in WT["lines"]:
        if line["scene"] == scene:
            for e in line["words"]:
                if e["word"] == w:
                    return e["t"]
    raise KeyError((scene, w))


def caps(scene):
    m = TL["modules"][scene]
    return [c["t"] for c in TL["captions"] if m["start"] - .01 <= c["t"] < m["start"] + m["duration"]]


EV = {
    "hit": word("doorstep", "멈춥니다"),
    "drop": start("drop"),
    "impact": start("drop") + 1.55,
    "loose_drop": word("drop", "느슨하면"),
    "core": start("core"),
    "pull": word("core", "당기면"),
    "release": word("core", "풀어"),
    "rise": start("rise"),
    "contact": word("rise", "닿는 순간"),
    "top": word("rise", "오릅니다"),
    "horizon": start("horizon"),
    "title": caps("horizon")[2] + 2.25,
}


def hz(note):
    names = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8,
             "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
    name, octave = note[:-1], int(note[-1])
    return 440.0 * 2 ** ((names[name] + 12 * (octave + 1) - 69) / 12)


def buf():
    return np.zeros(N)


def place(out, sig, t0, gain=1.0):
    i = int(round(t0 * SR))
    if i >= N:
        return
    j = min(N, i + len(sig))
    if i < 0:
        sig, i = sig[-i:], 0
        j = min(N, len(sig))
    out[i:j] += gain * sig[: j - i]


def env_adsr(n, a, d, s, r, total):
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = np.clip((total - t) / max(r, 1e-4), 0, 1)
    return e * rel


def piano(f, dur=2.6, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, 10):
        fk = f * k * np.sqrt(1 + 0.0004 * k * k)
        if fk > 9000:
            break
        decay = 1.1 + f / 700 + k * 0.45
        out += (1 / k ** 1.25) * np.exp(-t * decay) * np.sin(2 * np.pi * fk * t + k)
    hammer = rng.standard_normal(n) * np.exp(-t * 180) * 0.05
    a = np.clip(t / 0.004, 0, 1) * np.clip((dur - t) / 0.25, 0, 1)
    return vel * (out + hammer) * a * 0.32


def bell(f, dur=4.0, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp, dec in ((1, 1, 1.2), (2.76, .5, 2.2), (5.4, .28, 3.6), (8.93, .14, 5.5)):
        out += amp * np.exp(-t * dec) * np.sin(2 * np.pi * f * ratio * t)
    return vel * out * np.clip(t / 0.002, 0, 1) * np.clip((dur - t) / .4, 0, 1) * .22


def saw(f, n, t0=0.0, detune=0.0, cutoff=3500, vib=0.0):
    t = np.arange(n) / SR + t0
    out = np.zeros(n)
    ff = f * 2 ** (detune / 1200)
    phase = 2 * np.pi * ff * t + (vib * np.sin(2 * np.pi * 5.1 * t) if vib else 0)
    k = 1
    while ff * k < min(cutoff * 2.2, 12000):
        roll = 1 / (1 + (ff * k / cutoff) ** 4)
        out += roll * np.sin(k * phase) / k
        k += 1
    return out


def pad(notes, t0, t1, out, gain=1.0, attack=1.4, release=1.8, cutoff=2200, vib=0.0):
    dur = t1 - t0 + release
    n = int(dur * SR)
    e = env_adsr(n, attack, 3.0, .85, release, dur)
    sig = np.zeros(n)
    for note in notes:
        f = hz(note)
        for d in (-7, 0, 6):
            sig += saw(f, n, detune=d, cutoff=cutoff, vib=vib) / 3
    place(out, sig * e * 0.11, t0, gain)


def shaped_noise(n, lo, hi, tilt=0.0):
    spec = np.fft.rfft(rng.standard_normal(n))
    fr = np.fft.rfftfreq(n, 1 / SR)
    band = (1 / (1 + (lo / np.maximum(fr, 1)) ** 4)) * (1 / (1 + (fr / hi) ** 4)) * (np.maximum(fr, 20) / 1000) ** tilt
    x = np.fft.irfft(spec * band, n)
    return x / (np.max(np.abs(x)) + 1e-9)


def tom(f=150, vel=1.0):
    n = int(.9 * SR)
    t = np.arange(n) / SR
    sweep = f * (0.62 + 0.38 * np.exp(-t * 14))
    ph = 2 * np.pi * np.cumsum(sweep) / SR
    body = np.sin(ph) + .45 * np.sin(2 * ph + .3) + .25 * np.sin(3.1 * ph)
    click = shaped_noise(n, 900, 5000) * np.exp(-t * 90) * .5
    return vel * (body * np.exp(-t * 5.5) + click) * .45


def swell_noise(dur, lo=2500, hi=12000):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return shaped_noise(n, lo, hi) * (t / dur) ** 2.2 * np.clip((dur - t) / .05, 0, 1) * .5


def chord_arp(out, notes, t0, bars=1.0, step=BEAT / 2, vel=.8):
    n_steps = int(round(bars * 8))
    pattern = [0, 1, 2, 3, 2, 1, 2, 3]
    for i in range(n_steps):
        note = notes[pattern[i % 8] % len(notes)]
        place(out, piano(hz(note), 2.4, vel * (1.0 if i % 4 == 0 else .72)), t0 + i * step)


def music():
    out = buf()
    bar = 4 * BEAT
    hit, drop, impact, core = EV["hit"], EV["drop"], EV["impact"], EV["core"]
    pull, release, rise, contact, top, hor, title = EV["pull"], EV["release"], EV["rise"], EV["contact"], EV["top"], EV["horizon"], EV["title"]
    # A: morning (0 .. hit): felt piano arpeggios over a warm pad
    prog = [(["B2", "F#3", "C#4", "D4"], ["B1", "F#2", "D3", "A3"]), (["G2", "D3", "A3", "B3"], ["G1", "D2", "B2", "F#3"]),
            (["F#2", "D3", "A3", "E4"], ["D2", "A2", "F#3", "C#4"]), (["A2", "E3", "B3", "D4"], ["A1", "E2", "C#3", "E3"])]
    t, i = 0.3, 0
    while t + bar * .5 < hit:
        arp, chord = prog[i % 4]
        chord_arp(out, arp, t, bars=1, vel=.62 + .06 * i)
        pad(chord[1:], t, t + bar, out, gain=.8, attack=1.2, release=1.5, cutoff=1600)
        t += bar; i += 1
    # the stop: piano lifts off, one low note, suspended pad holds the breath
    place(out, piano(hz("B1"), 4.5, .8), hit)
    place(out, piano(hz("F#3"), 4.5, .45), hit + .02)
    pad(["G2", "D3", "A3", "C#4"], hit, drop + .4, out, gain=.75, attack=.6, release=1.6, cutoff=1300)
    # B: the droplet: glass celesta, slow bells, cool pad
    pad(["E2", "B2", "D3", "F#3", "G3"], drop - .2, core - .2, out, gain=.85, attack=1.8, release=1.6, cutoff=1900, vib=.002)
    place(out, bell(hz("B5"), 4.5, 1.0), impact)
    place(out, bell(hz("F#5"), 4.0, .55), impact + .55)
    for k, note in enumerate(["D6", "A5", "F#5", "B5", "E6", "C#6", "A5", "F#6"]):
        place(out, bell(hz(note), 2.8, .38), impact + 1.6 + k * 1.05)
    place(out, bell(hz("G5"), 3.2, .6), EV["loose_drop"])
    pad(["C3", "G3", "B3", "E4"], EV["loose_drop"] - .3, core - .2, out, gain=.6, attack=1.0, release=1.5, cutoff=2100)
    # C: the mechanism: an 8th-note pulse and toms that build to the wire pull and release
    beat0 = core + .45
    prog2 = [["B2", "F#3", "D4"], ["G2", "D3", "B3"], ["D3", "A3", "F#4"], ["A2", "E3", "C#4"]]
    nb = int((rise - beat0) / (BEAT / 2))
    for k in range(nb):
        tt = beat0 + k * BEAT / 2
        ch = prog2[int((tt - beat0) / bar) % 4]
        build = .45 + .55 * (tt - beat0) / (rise - beat0)
        n = int(.32 * SR)
        e = env_adsr(n, .004, .07, .25, .08, .32)
        place(out, saw(hz(ch[0]) * 2, n, cutoff=900 + 1400 * build) * e * .16 * build, tt)
        place(out, saw(hz(ch[1]) * 2, n, cutoff=900 + 1400 * build) * e * .1 * build, tt)
        if k % 4 == 0:
            place(out, tom(120, .55 * build), tt)
        if k % 8 == 6:
            place(out, tom(170, .35 * build), tt)
    for b in range(int((rise - beat0) / bar) + 1):
        ch = prog2[b % 4]
        pad(ch, beat0 + b * bar, beat0 + (b + 1) * bar, out, gain=.75, attack=.5, release=.8, cutoff=2400, vib=.003)
    place(out, tom(95, 1.0), pull); place(out, piano(hz("D2"), 3.5, .9), pull); place(out, bell(hz("A5"), 3, .5), pull + .02)
    place(out, tom(95, .8), release); place(out, piano(hz("G1"), 3.5, .8), release); place(out, bell(hz("D6"), 3, .45), release + .02)
    # D: the climb: riser and roll into the contact, then a held breath in slow motion, then arrival
    dur_r = contact - rise
    riser_n = int(dur_r * SR)
    tr = np.arange(riser_n) / SR
    ph = 2 * np.pi * np.cumsum(hz("A3") * (1 + .5 * (tr / dur_r) ** 2)) / SR
    riser = (np.sin(ph) + .5 * np.sin(2 * ph) + .3 * np.sin(3 * ph)) * (tr / dur_r) ** 2 * .12
    place(out, riser + swell_noise(dur_r, 1800, 9000) * .35, rise)
    for k in range(int(dur_r / (BEAT / 4))):
        tt = rise + k * BEAT / 4
        place(out, tom(150, .15 + .55 * (tt - rise) / dur_r), tt)
    pad(["D3", "A3", "E4"], rise, contact, out, gain=.8, attack=1.2, release=.15, cutoff=2600)
    held = top - contact
    pad(["A4", "E5"], contact, top - .05, out, gain=.9, attack=.25, release=.3, cutoff=3200, vib=.004)
    for k in range(int(held / .78) + 1):
        place(out, tom(70, .55), contact + k * .78)
    place(out, piano(hz("A1"), 3.0, .7), contact)
    arr = ["D3", "A3", "D4", "F#4", "A4", "D5"]
    pad(arr, top, hor - .3, out, gain=1.25, attack=.15, release=2.0, cutoff=3400, vib=.004)
    for k, note in enumerate(arr):
        place(out, piano(hz(note), 4.0, .95), top + k * .012)
    place(out, tom(85, 1.1), top); place(out, swell_noise(1.6, 3000, 12000) * .4, top - 1.6)
    for k in range(int((hor - top) / BEAT)):
        place(out, piano(hz(["D4", "F#4", "A4", "E4"][k % 4]), 2.4, .5), top + BEAT * (k + 2))
    # E: horizon: warm resolution, a simple melody, final chord on the title, ring out
    prog3 = [["G2", "D3", "B3"], ["F#2", "D3", "A3"], ["E2", "B2", "G3"], ["A2", "E3", "C#4"]]
    t, b = hor + .2, 0
    while t < title - .5:
        ch = prog3[b % 4]
        pad(ch, t, t + bar, out, gain=.95, attack=1.0, release=1.6, cutoff=2200, vib=.003)
        chord_arp(out, [ch[0], ch[1], ch[2], ch[1].replace("3", "4")], t, bars=1, vel=.52)
        t += bar; b += 1
    for k, note in enumerate(["F#5", "E5", "D5", "A4", "B4", "D5", "E5", "F#5", "A5", "F#5"]):
        tt = hor + 1.2 + k * BEAT * 1.5
        if tt < title - .6:
            place(out, piano(hz(note), 2.6, .55), tt)
    fin = ["D2", "A2", "D3", "F#3", "A3", "E4", "F#4"]
    pad(fin[2:], title, TOTAL, out, gain=1.0, attack=.4, release=2.5, cutoff=2600)
    for k, note in enumerate(fin):
        place(out, piano(hz(note), 5.0, .85), title + k * .03)
    place(out, bell(hz("F#5"), 5.0, .6), title + .05); place(out, bell(hz("D6"), 5.0, .4), title + .4)
    return out


def ambience():
    n = N
    t = np.arange(n) / SR
    wind = shaped_noise(n, 250, 1400, tilt=-.6) * (.55 + .45 * np.sin(2 * np.pi * .07 * t + 1) * np.sin(2 * np.pi * .031 * t))
    city = shaped_noise(n, 300, 900) * .5
    street = np.zeros(n)
    for a, b in ((0, EV["drop"]), (EV["rise"], TOTAL)):
        i, j = int(a * SR), int(b * SR)
        k = j - i
        fade = np.clip(np.arange(k) / (SR * .8), 0, 1) * np.clip((k - np.arange(k)) / (SR * .8), 0, 1)
        street[i:j] = fade
    studio = 1 - street
    room = shaped_noise(n, 200, 600) * .25
    return (wind * .9 + city * .6) * street * .05 + room * studio * .03


def fftconv_same(x, k):
    n = len(x) + len(k) - 1
    m = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(k, m), m)[:n]
    off = (len(k) - 1) // 2
    return y[off:off + len(x)]


def limiter(x, ceiling=.89):
    win = int(.05 * SR)
    pk = np.maximum.reduce([np.abs(np.roll(x, k)) for k in range(-win, win + 1, win // 8)])
    g = np.minimum(1, ceiling / np.maximum(pk, 1e-9))
    kernel = np.hanning(win * 2 + 1); kernel /= kernel.sum()
    return x * np.minimum(fftconv_same(g, kernel), 1)


def level(x, target_rms=.07):
    w = int(.4 * SR)
    c = np.concatenate([[0], np.cumsum(x * x)])
    idx = np.clip(np.arange(len(x)) + w // 2, 0, len(x)), np.clip(np.arange(len(x)) - w // 2, 0, len(x))
    pw = (c[idx[0]] - c[idx[1]]) / w
    rms = np.sqrt(np.maximum(pw, 0) + 1e-12)
    g = (target_rms / np.maximum(rms, target_rms * .25)) ** .45
    k = np.hanning(int(1.2 * SR)); k /= k.sum()
    return x * fftconv_same(g, k)


def write(path, x):
    x = np.clip(x, -1, 1)
    data = (x * 32767).astype("<i2").tobytes()
    import wave
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data)


def sfx():
    t = lambda d: np.arange(int(d * SR)) / SR
    out = {}
    hit = EV["hit"]
    roll_d = hit - .2
    tr = t(roll_d)
    grit = shaped_noise(len(tr), 500, 3200) * (.6 + .4 * np.abs(np.sin(2 * np.pi * 2.3 * tr)))
    out["roll"] = (grit * np.clip(tr / .6, 0, 1) * np.clip((roll_d - tr) / .15, 0, 1) * .45, .2, -21)
    tb = t(1.2)
    knock = (np.sin(2 * np.pi * 210 * tb) + .6 * np.sin(2 * np.pi * 520 * tb) + .35 * np.sin(2 * np.pi * 1180 * tb)) * np.exp(-tb * 16)
    rattle = sum(np.sin(2 * np.pi * f * tb) * np.exp(-tb * d) for f, d in ((2300, 22), (3100, 30), (1720, 18))) * .18
    out["bump"] = ((knock + rattle + shaped_noise(len(tb), 400, 4000) * np.exp(-tb * 45) * .6) * .5, hit, -9)
    td = t(.9)
    f = 1500 * np.exp(-td * 9) + 520
    plip = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-td * 9) + .3 * shaped_noise(len(td), 2000, 9000) * np.exp(-td * 120)
    out["drip"] = (plip * .5, EV["impact"] - .01, -12)

    def chain(d, n_clicks, f0, f1, rising=True):
        x = np.zeros(int(d * SR))
        for k in range(n_clicks):
            u = k / max(1, n_clicks - 1)
            tt = d * (u ** 1.3 if rising else 1 - (1 - u) ** 1.3)
            fc = f0 + (f1 - f0) * u
            c = t(.03)
            s = (np.sin(2 * np.pi * fc * c) + .4 * np.sin(2 * np.pi * fc * 1.9 * c)) * np.exp(-c * 260)
            i = int(tt * SR); j = min(len(x), i + len(s)); x[i:j] += s[: j - i] * (.6 + .4 * u)
        return x
    tt = t(1.1)
    whine = np.sin(2 * np.pi * np.cumsum(480 + 420 * tt / 1.1) / SR) * np.clip(tt / .08, 0, 1) * np.clip((1.1 - tt) / .2, 0, 1) * .25
    out["tighten"] = ((chain(1.1, 32, 1400, 2600) + whine) * .5, EV["pull"], -12)
    out["loosen"] = ((chain(1.0, 24, 2200, 1100, rising=False) + whine[::-1][: int(1.0 * SR)] * .7) * .5, EV["release"], -13)
    held = EV["top"] - EV["contact"]
    tc = t(held + .4)
    squish = shaped_noise(len(tc), 300, 1800) * np.exp(-tc * 2.4) * .5
    out["wrap"] = ((chain(held + .4, 40, 900, 1900) * .7 + squish) * .5, EV["contact"], -11)
    tl = t(1.4)
    land = (np.sin(2 * np.pi * 180 * tl) + .5 * np.sin(2 * np.pi * 410 * tl)) * np.exp(-tl * 10) + chain(1.4, 6, 2400, 2100) * .5
    out["land"] = (land * .5, EV["top"], -10)
    tw = t(2.4)
    whoosh = shaped_noise(len(tw), 600, 5000) * np.sin(np.pi * tw / 2.4) ** 2 * .5
    out["door"] = (whoosh, EV["horizon"] + 1.2, -18)
    return out


def main():
    m = music()
    m = level(m)
    m = m / (np.max(np.abs(m)) + 1e-9) * .8
    m = m + ambience()
    tail = int(2.2 * SR)
    m[-tail:] *= np.linspace(1, 0, tail) ** 1.5
    m = limiter(m)
    write(P / "audio/score.wav", m)
    cues = []
    for name, (sig, at, gain) in sfx().items():
        write(P / f"audio/sfx_{name}.wav", sig / (np.max(np.abs(sig)) + 1e-9) * .8)
        cues.append({"t": round(at, 3), "sfx": f"audio/sfx_{name}.wav", "gain_lu": gain, "why": name})
    (P / "audio/cues.json").write_text(json.dumps({"events": EV, "cues": cues}, ensure_ascii=False, indent=1))
    print("SCORE_OK", round(len(m) / SR, 2), "s", {k: round(v, 2) for k, v in EV.items()})


if __name__ == "__main__":
    main()
