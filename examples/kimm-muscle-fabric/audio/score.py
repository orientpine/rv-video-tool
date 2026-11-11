"""Original score and sound effects for the 근육옷감 film, synthesized from scratch (no samples).

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
    "intro": 0.0,
    "fail": word("kitchen", "올리기도") + 1.1,
    "bulky": start("bulky"),
    "heavy": word("bulky", "무겁고"),
    "thread": start("thread"),
    "coil": word("thread", "코일실"),
    "weave": word("thread", "짭니다"),
    "current": word("thread", "전기를"),
    "contract": word("thread", "줄어듭니다"),
    "lift": start("lift"),
    "raise": word("lift", "올립니다"),
    "home": start("home"),
    "place": word("home", "임상에서") + 2.7,
    "again": word("home", "다시"),
    "title": caps("home")[4] + 2.9,
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
    fail, bulky, heavy = EV["fail"], EV["bulky"], EV["heavy"]
    thread, coil, weave, current, contract = (EV[k] for k in ("thread", "coil", "weave", "current", "contract"))
    lift, raise_t, home, place_t, again, title = (EV[k] for k in ("lift", "raise", "home", "place", "again", "title"))
    # Warm D-major felt piano in the kitchen, stopping at the failed lift.
    kitchen = [["D3", "A3", "D4", "F#4"], ["G2", "D3", "G3", "B3"], ["A2", "E3", "A3", "C#4"]]
    t, i = .25, 0
    while t + 1.2 < fail:
        arp = kitchen[i % len(kitchen)]
        chord_arp(out, arp, t, bars=1, vel=.48)
        pad([arp[0], arp[2], arp[3]], t, min(fail, t + bar), out, gain=.36, attack=1.1, release=.8, cutoff=1500)
        t += bar
        i += 1
    place(out, piano(hz("D2"), 1.5, .48), fail)
    pad(["A2", "D3", "E3", "G3"], fail, bulky, out, gain=.38, attack=.25, release=.7, cutoff=850)
    # Bulky fabric becomes a cold low drone with no melodic material.
    pad(["D1", "A1", "D2"], bulky, thread, out, gain=.28, attack=1.0, release=1.0, cutoff=320, vib=.001)
    # Studio macro: glass bell at the coil, pulse at weaving, shimmer with current.
    place(out, bell(hz("F#5"), 3.4, .42), coil)
    place(out, bell(hz("A5"), 2.8, .27), coil + .45)
    pad(["D3", "A3", "E4"], thread, raise_t, out, gain=.22, attack=1.6, release=.8, cutoff=1200)
    pulse_end = min(lift, contract + 1.2)
    k = 0
    while weave + k * BEAT / 2 < pulse_end:
        note = ["D3", "A3", "D4", "F#4"][k % 4]
        place(out, piano(hz(note), .34, .28 if k % 2 else .36), weave + k * BEAT / 2)
        k += 1
    place(out, bell(hz("D5"), 1.8, .34), current)
    place(out, bell(hz("F#5"), 2.4, .3), current + .22)
    place(out, tom(105, .55), contract)
    # Lift: riser into a held breath, then a warm D-major chord when weight is up.
    dur_r = max(.1, raise_t - lift)
    tr = np.arange(int(dur_r * SR)) / SR
    ph = 2 * np.pi * np.cumsum(hz("A3") * (1 + .35 * (tr / dur_r) ** 2)) / SR
    place(out, (np.sin(ph) + .35 * np.sin(2 * ph)) * (tr / dur_r) ** 2 * .09, lift)
    pad(["D3", "A3", "E4"], lift, raise_t + 1.35, out, gain=.4, attack=.8, release=.4, cutoff=1700)
    pad(["D3", "A3", "D4", "F#4", "A4"], raise_t + 1.35, home, out, gain=.68, attack=.2, release=1.2, cutoff=2800)
    for j, note in enumerate(["D3", "A3", "D4", "F#4", "A4"]):
        place(out, piano(hz(note), 3.2, .6), raise_t + 1.35 + j * .025)
    # Return home: a restrained shelf-set resolution and final title chord.
    pad(["G3", "D4", "G4", "B4"], place_t, again + 1.2, out, gain=.35, attack=.12, release=.8, cutoff=2200)
    place(out, piano(hz("G3"), 2.4, .42), place_t)
    place(out, piano(hz("D4"), 2.4, .32), place_t + .03)
    for j, note in enumerate(["D4", "F#4", "A4", "D5"]):
        place(out, piano(hz(note), 2.0, .26), again + j * .5)
    fin = ["D3", "A3", "D4", "F#4", "A4", "D5"]
    pad(fin, title, TOTAL, out, gain=.72, attack=.18, release=2.0, cutoff=2700)
    for j, note in enumerate(fin):
        place(out, piano(hz(note), 4.0, .58), title + j * .025)
    place(out, bell(hz("A5"), 4.0, .36), title + .06)
    place(out, bell(hz("D6"), 4.0, .22), title + .32)
    return out


def ambience():
    n = N
    t = np.arange(n) / SR
    room_noise = shaped_noise(n, 180, 1600, tilt=-.35)
    kettle = shaped_noise(n, 2400, 8500)
    room = np.zeros(n)
    for a, b in ((0, EV["thread"]), (EV["home"], TOTAL)):
        i, j = int(a * SR), int(b * SR)
        k = j - i
        fade = np.clip(np.arange(k) / (SR * .8), 0, 1) * np.clip((k - np.arange(k)) / (SR * .8), 0, 1)
        room[i:j] = fade
    studio = np.ones(n)
    i, j = int(EV["thread"] * SR), int(EV["home"] * SR)
    studio[i:j] = .12
    return (room_noise * .018 + kettle * .006) * room + room_noise * .002 * studio


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
    title = EV["title"]
    # Ceramic cup tremble: several irregular, diminishing resonant taps.
    tb = t(1.4)
    tremble = np.zeros(len(tb))
    for at, amp, f in ((.04, .8, 2350), (.23, .55, 2900), (.51, .48, 2100), (.83, .3, 2650), (1.08, .22, 1800)):
        q = np.maximum(tb - at, 0)
        tremble += (tb >= at) * amp * (np.sin(2*np.pi*f*q) + .4*np.sin(2*np.pi*1.47*f*q)) * np.exp(-q*18)
    tremble += shaped_noise(len(tb), 700, 6500) * np.exp(-tb*9) * .08
    out["tremble"] = (tremble * .22, EV["fail"] - .85, -13)
    # Geared servo whine and a lightly creaking plastic housing.
    ts = t(1.6)
    freq = 220 + 170 * np.sin(np.pi * ts / 1.6) + 40 * ts
    servo = np.sin(2*np.pi*np.cumsum(freq)/SR) * .22 + np.sin(2*np.pi*np.cumsum(freq*2.01)/SR) * .09
    servo += shaped_noise(len(ts), 500, 2600) * (.2 + .8*np.abs(np.sin(2*np.pi*2.7*ts))) * .12
    out["servo"] = (servo * np.clip(ts/.06,0,1) * np.clip((1.6-ts)/.15,0,1), EV["heavy"], -12)
    # Repeating wooden-metal loom clack over three seconds.
    tl = t(3.0)
    loom = np.zeros(len(tl))
    for k in range(7):
        at = k * BEAT / 2
        q = np.maximum(tl-at,0)
        loom += (tl>=at) * (np.sin(2*np.pi*(310+22*k)*q)+.45*np.sin(2*np.pi*740*q))*np.exp(-q*34)*(.7 if k%2==0 else .48)
        loom += (tl>=at) * shaped_noise(len(tl),900,6000)*np.exp(-q*90)*.07
    out["loom"] = (loom * .2, EV["weave"], -14)
    tz = t(.9)
    zap = shaped_noise(len(tz), 1800, 10000) * np.exp(-tz*7)
    zap += np.sin(2*np.pi*np.cumsum(900+1700*tz/.9)/SR)*np.exp(-tz*5)*.28
    out["zap"] = (zap * .24, EV["current"], -15)
    tc = t(.8)
    contract = shaped_noise(len(tc), 300, 1800) * np.sin(np.pi*tc/.8)**1.5
    contract += np.sin(2*np.pi*(115+160*tc/.8)*tc)*np.sin(np.pi*tc/.8)*.2
    out["tighten"] = (contract * .3, EV["contract"], -14)
    tr = t(1.4)
    lift = np.zeros(len(tr))
    for at, f in ((.02, 880), (.15, 1240), (.27, 720), (.48, 980)):
        q = np.maximum(tr-at,0)
        lift += (tr>=at)*np.sin(2*np.pi*f*q)*np.exp(-q*19)*.24
    lift += shaped_noise(len(tr),250,1500)*np.clip(tr/.12,0,1)*.14
    lift += np.sin(2*np.pi*np.cumsum(95+35*tr)/SR)*.18
    out["lift"] = (lift * .3, EV["raise"], -11)
    tp = t(.5)
    place_sfx = (np.sin(2*np.pi*190*tp)+.35*np.sin(2*np.pi*430*tp))*np.exp(-tp*22)
    place_sfx += shaped_noise(len(tp),1000,6500)*np.exp(-tp*75)*.6
    out["place"] = (place_sfx * .28, EV["place"], -12)
    tw = t(1.2)
    whoosh = shaped_noise(len(tw),500,6500)*np.sin(np.pi*tw/1.2)**2
    out["whoosh"] = (whoosh * .18, title - .4, -18)
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
    for path in (P / "audio").glob("sfx_*.wav"):
        path.unlink()
    for name, (sig, at, gain) in sfx().items():
        write(P / f"audio/sfx_{name}.wav", sig / (np.max(np.abs(sig)) + 1e-9) * .8)
        cues.append({"t": round(at, 3), "file": f"audio/sfx_{name}.wav", "gain_lu": gain, "why": name})
    (P / "audio/cues.json").write_text(json.dumps({"events": EV, "cues": cues}, ensure_ascii=False, indent=1))
    print("SCORE_OK", round(len(m) / SR, 2), "s", {k: round(v, 2) for k, v in EV.items()}, "peak", round(float(np.max(np.abs(m))), 4), "RMS", round(float(np.sqrt(np.mean(m*m))), 4))


if __name__ == "__main__":
    main()
