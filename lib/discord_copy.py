"""Share copy without re-encoding, when the original already fits.

  python3 lib/discord_copy.py <in.mp4> <out.mp4> [--limit-mib 20] [--min-kbps 1200] [--timeline build/timeline.json]

One file: the original itself (stream copy) when it is at most --limit-mib. Otherwise the original is cut at key
frames into the fewest parts that each fit, every cut at the key frame nearest a scene border close to an even
share, written as out_part1.mp4 ... and out_parts.json like lib/discord.sh. Every part must be at most the limit
and keep a picture bitrate of at least --min-kbps; if no split up to 8 parts does, it exits 1 and writes nothing,
and lib/discord.sh encodes as before. Copied parts are the original's own packets, so the picture is the same.
"""
import argparse
import json
import math
import os
import subprocess
import sys

MAX_PARTS = 8


def probe(path, *args):
    return subprocess.run(["ffprobe", "-v", "error", *args, path], check=True, capture_output=True, text=True).stdout


def duration(path):
    return float(probe(path, "-show_entries", "format=duration", "-of", "csv=p=0"))


def audio_kbps(path):
    rate = probe(path, "-select_streams", "a:0", "-show_entries", "stream=bit_rate", "-of", "csv=p=0").strip()
    return int(rate) / 1000 if rate.isdigit() else 0.0


def key_frames(path):
    out = probe(path, "-select_streams", "v:0", "-skip_frame", "nokey", "-show_entries", "frame=pts_time", "-of", "csv=p=0")
    return sorted(float(line.strip(",")) for line in out.split() if line.strip(","))


COPY = ["-map", "0:v:0", "-map", "0:a?", "-c", "copy"]


def copy(src, dst):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", src, *COPY, "-movflags", "+faststart", dst], check=True)


def copy_split(src, base, inner_cuts):
    # The segment muxer starts each part at the first key frame at or after its time, so the parts meet without a
    # repeated or missing frame (cutting with -ss/-to copies a few frames past the end into the next part).
    times = ",".join(f"{t - 0.001:.6f}" for t in inner_cuts)
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", src, *COPY, "-f", "segment", "-segment_times", times,
                    "-reset_timestamps", "1", "-segment_start_number", "1", "-segment_format", "mp4",
                    "-segment_format_options", "movflags=+faststart", f"{base}_part%d.mp4"], check=True)


def cuts_for(n, dur, keys, borders):
    cuts, prev = [0.0], 0.0
    for k in range(1, n):
        want = dur * k / n
        near = [b for b in borders if abs(b - want) <= 0.15 * dur / n and b > prev + 1]
        target = min(near, key=lambda b: abs(b - want)) if near else want
        later = [t for t in keys if t > prev + 1 and t < dur - 1]
        if not later:
            return None
        cut = min(later, key=lambda t: abs(t - target))
        cuts.append(cut)
        prev = cut
    return cuts + [dur]


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--limit-mib", type=float, default=20)
    ap.add_argument("--min-kbps", type=float, default=1200)
    ap.add_argument("--timeline")
    a = ap.parse_args()
    limit = a.limit_mib * 1048576
    size, dur = os.path.getsize(a.src), duration(a.src)
    base = a.out[:-4] if a.out.endswith(".mp4") else a.out
    if size <= limit:
        copy(a.src, a.out)
        print(f"DISCORD_COPY one file {os.path.getsize(a.out)} B (original fits {a.limit_mib:g} MiB, not re-encoded)")
        return 0
    keys, akbps = key_frames(a.src), audio_kbps(a.src)
    borders = []
    if a.timeline:
        borders = sorted(m["start"] for m in json.load(open(a.timeline))["modules"].values() if m["start"] > 0)
    for n in range(max(2, math.ceil(size / limit)), MAX_PARTS + 1):
        cuts = cuts_for(n, dur, keys, borders)
        if cuts is None:
            break
        parts, ok = [], True
        try:
            copy_split(a.src, base, cuts[1:-1])
        except subprocess.CalledProcessError:
            ok = False
        if not os.path.exists(f"{base}_part{n}.mp4") or os.path.exists(f"{base}_part{n + 1}.mp4"):
            ok = False
        for k in range(n if ok else 0):
            f = f"{base}_part{k + 1}.mp4"
            part_bytes, part_dur = os.path.getsize(f), duration(f)
            kbps = round(part_bytes * 8 / part_dur / 1000 - akbps)
            parts.append({"file": os.path.basename(f), "start": round(cuts[k], 4), "dur": round(part_dur, 4),
                          "bytes": part_bytes, "kbps": kbps})
            if part_bytes > limit or kbps < a.min_kbps:
                ok = False
                break
        if ok:
            if os.path.exists(a.out):
                os.remove(a.out)
            with open(f"{base}_parts.json", "w") as fh:
                fh.write("[\n" + ",\n".join("  " + json.dumps(p) for p in parts) + "\n]\n")
            for p in parts:
                print(f"DISCORD part {p['file']} {p['start']}~{p['start'] + p['dur']:.4f} s copy {p['kbps']}k → {p['bytes']} B (≤ {a.limit_mib:g} MiB)")
            print(f"DISCORD_COPY_SPLIT {n} 조각, 다시 인코딩 없음 → {base}_parts.json")
            return 0
        for p in range(1, MAX_PARTS + 2):
            f = f"{base}_part{p}.mp4"
            if os.path.exists(f):
                os.remove(f)
    print("DISCORD_COPY no copy split fits; encoding", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
