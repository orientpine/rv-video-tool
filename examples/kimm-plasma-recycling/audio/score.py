"""Original hydrogen-plasma recycling score, synthesized from night rain to dawn.

Runtime picture and word alignments drive every cue; no samples or external audio.
"""
# /// script
# dependencies = ["numpy"]
# ///
# Run: python3 audio/score.py <film-directory>
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
BPM = 70.0
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


try:
    stuck = word("yard", "막힙니다")
except KeyError:
    stuck = caps("yard")[1] + 1.2

EV = {
    "grab_drop": word("yard", "선별") + .4,
    "stuck": stuck,
    "low_hit": word("limits", "1%"),
    "furnace": word("limits", "열분해"),
    "few_molecules": word("limits", "20~30%"),
    "sweep": start("torch") + .6,
    "ignite": word("torch", "100%"),
    "fall": word("torch", "플라스틱"),
    "burst": word("torch", "0.01초"),
    "molecules": word("torch", "분해됩니다"),
    "yield": word("plant", "70~80%"),
    "ethylene": word("plant", "에틸렌"),
    "benzene": word("plant", "벤젠"),
    "purity": word("plant", "99%"),
    "pellets": word("plant", "원료"),
    "truck": start("future") + 1.0,
    "target": word("future", "목표"),
    "title": caps("future")[2] + .6,
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


def music() -> np.ndarray:
    """A D-minor question opens into D major, with a shared A-D-E motif."""
    out = buf()
    # Night: individual felt notes, never a busy arpeggio beneath the worker.
    pad(["D2", "A2", "E3", "F3"], start("yard"), EV["stuck"] - .3,
        out, gain=.32, attack=2, release=.3, cutoff=1050)
    motif = ["D4", "A3", "E4", "F4", "E4"]
    for k, note in enumerate(motif):
        at = start("yard") + .5 + k * BEAT * 2
        if at < EV["stuck"] - .2:
            place(out, piano(hz(note), 3.0, .32), at)
    # Cut the preceding piano tails so the stop is an audible held breath.
    stop = int(EV["stuck"] * SR)
    ramp = int(.08 * SR)
    out[stop-ramp:stop] *= np.linspace(1, 0, ramp)
    out[stop:] = 0
    place(out, piano(hz("D2"), 3.5, .5), EV["stuck"])
    pad(["D3", "G3", "A3", "E4"], EV["stuck"], start("limits"),
        out, gain=.24, attack=.35, release=.6, cutoff=1100)
    # Old processes: close, dark seconds; dry ticks suggest an exhausted machine.
    pad(["D2", "Eb3", "A3"], start("limits"), start("torch") - .6,
        out, gain=.29, attack=1.2, release=.6, cutoff=800)
    for at in np.arange(start("limits") + .4, start("torch") - .6, BEAT * 2):
        n = int(.13 * SR)
        tt = np.arange(n) / SR
        tick = shaped_noise(n, 400, 2300) * np.exp(-tt * 55)
        place(out, tick, at, .022)
    place(out, tom(260, .18), EV["low_hit"])
    place(out, bell(hz("A5"), 2.3, .22), EV["few_molecules"])
    # Torch: room tone alone for the reveal, then cool glass and open fifths.
    place(out, bell(hz("E5"), 3.0, .2), EV["sweep"] + .15)
    pad(["D3", "A3", "E4", "B4"], EV["ignite"], EV["burst"] - .35,
        out, gain=.26, attack=.9, release=.2, cutoff=2100)
    place(out, bell(hz("A5"), 2.6, .27), word("torch", "플라즈마"))
    breath = int((EV["burst"] - .22) * SR)
    end = int(EV["burst"] * SR)
    out[breath:end] *= np.linspace(1, .03, end - breath)
    # A major third arrives exactly with disintegration, then discrete molecules.
    pad(["D3", "A3", "D4", "F#4", "E5"], EV["burst"], start("plant"),
        out, gain=.35, attack=.06, release=.7, cutoff=2400)
    place(out, piano(hz("F#4"), 3.0, .46), EV["burst"])
    for k, note in enumerate(["D5", "E5", "A5", "F#5"]):
        place(out, bell(hz(note), 2.0, .24), EV["molecules"] + k * BEAT / 2)
    # Plant: the first continuous eighth-note pulse, steadily opening its filter.
    chords = [["D3", "A3", "F#4"], ["G3", "B3", "E4"], ["A3", "D4", "F#4"]]
    for k, at in enumerate(np.arange(start("plant"), start("future"), BEAT / 2)):
        u = (at - start("plant")) / (start("future") - start("plant"))
        chord = chords[int(k / 8) % len(chords)]
        n = int(.27 * SR)
        pulse = saw(hz(chord[k % 3]), n, cutoff=1000 + 1300 * u)
        place(out, pulse * env_adsr(n, .012, .08, .2, .1, .27), at, .018 + .022 * u)
    pad(["G3", "A3", "D4"], EV["yield"], EV["purity"], out,
        gain=.22, attack=.9, release=.6, cutoff=1700)
    for key, note in [("ethylene", "E5"), ("benzene", "A5")]:
        place(out, bell(hz(note), 2.6, .36), EV[key])
    pad(["D3", "A3", "D4", "F#4"], EV["purity"], start("future"),
        out, gain=.33, attack=.3, release=.9, cutoff=2200)
    for note in ["D4", "F#4", "A4"]:
        place(out, piano(hz(note), 3.0, .3), EV["pellets"])
    # Dawn: the opening motif returns, now answered by the major third.
    pad(["G3", "B3", "D4", "A4"], start("future"), EV["target"],
        out, gain=.31, attack=1.3, release=1.0, cutoff=1900)
    for k, note in enumerate(["D4", "A4", "E5", "F#5", "E5", "D5"]):
        at = start("future") + .5 + k * BEAT * 1.5
        if at < EV["title"] - .7:
            place(out, piano(hz(note), 2.8, .4), at)
    pad(["A3", "D4", "E4"], EV["target"], EV["title"], out,
        gain=.23, attack=.3, release=.5, cutoff=1800)
    final = ["D3", "A3", "D4", "F#4", "E5"]
    pad(final, EV["title"], TOTAL, out, gain=.32, attack=.25,
        release=1.2, cutoff=2100)
    for k, note in enumerate(final):
        place(out, piano(hz(note), TOTAL - EV["title"], .4), EV["title"] + k * .02)
    place(out, bell(hz("D5"), TOTAL - EV["title"], .4), EV["title"])
    return out


def ambience() -> np.ndarray:
    """Continuous rain/city, studio air, and dawn wind with 0.8 s crossfades."""
    t = np.arange(N) / SR
    into_room = np.clip((t - start("torch")) / .8, 0, 1)
    into_dawn = np.clip((t - start("future")) / .8, 0, 1)
    rain = shaped_noise(N, 450, 4800) * (.8 + .2 * np.sin(2 * np.pi * .19 * t))
    city = shaped_noise(N, 240, 1000)
    hum = np.sin(2 * np.pi * 300 * t) + .3 * np.sin(2 * np.pi * 600 * t)
    night = .018 * rain + .007 * city + .0015 * hum
    room = shaped_noise(N, 260, 1700) * .004
    dawn = shaped_noise(N, 300, 2100) * (.006 + .002 * np.sin(t * .7))
    for k, at in enumerate(np.arange(start("future") + .8, EV["title"], BEAT * 2.3)):
        n = int(.24 * SR)
        tt = np.arange(n) / SR
        freq = 1800 + 1100 * np.sin(np.pi * tt / .24) + 160 * np.sin(2 * np.pi * 25 * tt)
        chirp = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.sin(np.pi * tt / .24) ** 2
        place(dawn, chirp, at, .009 if k % 2 else .013)
        place(dawn, chirp * .65, at + .31, .009)
    return night * (1 - into_room) + room * into_room * (1 - into_dawn) + dawn * into_dawn


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


def sfx() -> dict[str, tuple[np.ndarray, float, int, str]]:
    """Distinct physical signatures, with audible midrange on phone speakers."""
    out = {}
    # Grab: metal modes first, then many irregular plastic contacts and rustle.
    d = 2.0
    t = np.arange(int(d * SR)) / SR
    metal = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * decay)
                for f, a, decay in [(310, .6, 9), (790, .45, 7), (1710, .25, 12)])
    impacts = np.zeros(len(t))
    for at in rng.uniform(.08, 1.6, 42):
        dt = np.maximum(t - at, 0)
        impacts += (t >= at) * np.sin(2 * np.pi * rng.uniform(650, 2700) * dt) * np.exp(-dt * 90) * .13
    rustle = shaped_noise(len(t), 500, 4500) * np.clip(t / .08, 0, 1) * np.exp(-t * 1.9)
    out["grab_drop"] = (metal + impacts + rustle * .65, EV["grab_drop"], -15,
                        "Overhead grab clanks; mixed plastic cascades onto the pile")
    d = 2.5
    t = np.arange(int(d * SR)) / SR
    furnace = .13 * np.sin(2 * np.pi * 115 * t) + .35 * shaped_noise(len(t), 260, 900)
    furnace += .7 * shaped_noise(len(t), 400, 3800) * (.7 + .3 * np.sin(2 * np.pi * 7 * t) ** 2)
    furnace *= np.clip(t / .18, 0, 1) * np.clip((d - t) / .7, 0, 1)
    out["furnace"] = (furnace, EV["furnace"], -19, "Dirty pyrolysis furnace: rumble and flame")
    d = 1.4
    t = np.arange(int(d * SR)) / SR
    sweep = shaped_noise(len(t), 800, 4800) * np.sin(np.pi * t / d) ** 2
    sweep += .15 * np.sin(2 * np.pi * np.cumsum(650 + 1600 * t / d) / SR) * np.sin(np.pi * t / d) ** 2
    out["sweep"] = (sweep, EV["sweep"], -21, "Cool shimmer follows the torch light sweep")
    d = 3.2
    t = np.arange(int(d * SR)) / SR
    thump = (.22 * np.sin(2 * np.pi * 110 * t) + .5 * np.sin(2 * np.pi * 330 * t)) * np.exp(-t * 16)
    hiss = shaped_noise(len(t), 500, 4700) * (.55 * np.exp(-t * 7) + .4 * np.exp(-t / 1.8))
    crackle = shaped_noise(len(t), 1200, 4900) * np.maximum(0, np.sin(t * 940) - .65) * np.exp(-t * 5)
    ignition = (thump + hiss + crackle) * np.clip(t / .004, 0, 1) * np.clip((d - t) / .5, 0, 1)
    out["ignite"] = (ignition, EV["ignite"], -13, "Hydrogen plasma ignition, crackle and decaying airy jet")
    d = EV["burst"] - EV["fall"]
    t = np.arange(int(d * SR)) / SR
    phase = 2 * np.pi * np.cumsum(450 + 1400 * (t / d) ** 2) / SR
    riser = (.25 * np.sin(phase) + shaped_noise(len(t), 650, 4300)) * (t / d) ** 2
    riser *= np.clip((d - t) / .025, 0, 1)
    out["fall"] = (riser, EV["fall"], -19, "Slow-motion flake descends: rising tension into disintegration")
    d = 1.05
    t = np.arange(int(d * SR)) / SR
    spark = shaped_noise(len(t), 850, 4900) * (.3 + .7 * np.sin(2 * np.pi * 67 * t) ** 12)
    spark *= np.exp(-t * 5) * np.clip(t / .003, 0, 1) * np.clip((d - t) / .15, 0, 1)
    for f in [1175, 1760, 2349]:
        spark += .11 * np.sin(2 * np.pi * f * t) * np.exp(-t * 7) * np.clip(t / .003, 0, 1)
    out["burst"] = (spark, EV["burst"], -12, "Sparkling crackle as plastic disintegrates in 0.01 seconds")
    d = 1.5
    t = np.arange(int(d * SR)) / SR
    pellets = shaped_noise(len(t), 750, 4700) * (.15 + .85 * np.sin(2 * np.pi * 43 * t + np.sin(t * 91)) ** 8)
    for at in rng.uniform(0, d - .08, 60):
        dt = np.maximum(t - at, 0)
        pellets += .12 * (t >= at) * np.sin(2 * np.pi * rng.uniform(1300, 4000) * dt) * np.exp(-dt * 170)
    pellets *= np.clip(t / .15, 0, 1) * np.clip((d - t) / .4, 0, 1)
    out["pellets"] = (pellets, EV["pellets"], -17, "Fine pellet pour marks purified products becoming new raw material")
    d = 4.0
    t = np.arange(int(d * SR)) / SR
    # Doppler-like pitch fall with engine harmonics, body resonance and tyre wash.
    phase = 2 * np.pi * np.cumsum(102 - 16 * t / d) / SR
    engine = sum(np.sin(k * phase) / k ** .65 for k in range(3, 15)) * .4
    truck = engine + .45 * shaped_noise(len(t), 300, 1600) + .3 * shaped_noise(len(t), 700, 4000)
    truck *= np.sin(np.pi * t / d) ** 1.6 * (.8 + .2 * np.sin(t * 18) ** 2)
    out["truck"] = (truck, EV["truck"], -20, "Dawn collection truck passes: engine harmonics and tyres")
    return out


def main() -> None:
    """Render a restrained narration bed and independently gain-staged effects."""
    m = level(music(), target_rms=.055)
    m *= min(1.0, .65 / (np.max(np.abs(m)) + 1e-9))
    m += ambience()
    m[:int(.6 * SR)] *= np.linspace(0, 1, int(.6 * SR))
    tail = min(int(2.2 * SR), int((TOTAL - EV["title"]) * SR))
    m[-tail:] *= np.linspace(1, 0, tail) ** 1.5
    m = limiter(m)
    write(P / "audio/score.wav", m)
    cues = []
    for name, (sig, at, gain, why) in sfx().items():
        normalized = sig / (np.max(np.abs(sig)) + 1e-9) * .8
        write(P / f"audio/sfx_{name}.wav", limiter(normalized))
        cues.append({"t": round(at, 3), "sfx": f"audio/sfx_{name}.wav", "gain_lu": gain, "why": why})
    cues.sort(key=lambda cue: cue["t"])
    (P / "audio/cues.json").write_text(json.dumps({"events": EV, "cues": cues}, ensure_ascii=False, indent=1))
    print("SCORE_OK", round(len(m) / SR, 2), "s", {k: round(v, 3) for k, v in EV.items()})


if __name__ == "__main__":
    main()
