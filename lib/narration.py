"""Schedule speech recordings and mix a fixed-duration narration track."""

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

FFMPEG, FFPROBE = (shutil.which(binary) for binary in ("ffmpeg", "ffprobe"))


def dur(path):
    result = subprocess.run(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("json")
    parser.add_argument("--out", default=Path(__file__).resolve().parent / "out/narration.wav")
    parser.add_argument("--duration", type=float, default=60.0)
    parser.add_argument("--gap", type=float, default=0.15)
    args = parser.parse_args()
    source = Path(args.json).resolve()
    data = json.loads(source.read_text(encoding="utf-8"))
    if isinstance(data, list):
        data = {"lines": data}
    total = float(data.get("duration_s", args.duration))
    lines = sorted(data["lines"], key=lambda line: float(line["start_s"]))
    output = Path(args.out).resolve()
    parts = output.parent / "narration_parts"
    Path.mkdir(parts, exist_ok=True, parents=True)
    rows, warnings, errors, inputs = [], [], [], []
    for index, line in enumerate(lines):
        start = float(line["start_s"])
        text = line.get("say", line["text"]).strip()
        voice = line.get("voice", data.get("voice", "Yuna"))
        rate = line.get("rate", data.get("rate"))
        digest = hashlib.sha1(f"{voice}|{rate}|{text}".encode("utf-8")).hexdigest()[:10]
        recording = parts / f"{index:02d}_{digest}.aiff"
        if "audio" in line:
            recording = (source.parent / line["audio"]).resolve()
            if not recording.exists():
                print(f"#{index} 지정한 녹음을 찾지 못했습니다: {recording}", file=sys.stderr)
                return 1
            voice, rate = recording.name, None
        elif not recording.exists() or recording.stat().st_size == 0:
            temporary = recording.with_suffix(".part.aiff")
            command = ["say", "-v", str(voice), "-o", str(temporary)]
            if rate:
                command.extend(["-r", str(rate)])
            subprocess.run(command + [text], check=True)
            temporary.replace(recording)
        length = dur(recording)
        end = start + length
        boundary = float(lines[index + 1]["start_s"]) if index + 1 < len(lines) else total
        limit = float(line.get("end_s", boundary))
        mark = "!" if end > limit else " "
        rows.append(f"{index:2d} {start:6.2f} {length:5.2f} {end:6.2f} {limit:6.2f}{mark} "
                    f"{voice}/{rate or '-'}  {text[:40]}")
        if end > limit:
            warnings.append(f"장면 경고 #{index}: 경계 {limit:.2f}s, 초과 {end - limit:.2f}s"
                            " — 발화 속도나 문장을 조정하세요")
        if index + 1 < len(lines) and end + args.gap > boundary:
            errors.append(f"간격 오류 #{index}: 녹음 끝 {end:.2f}s, 다음 시작 {boundary:.2f}s,"
                          f" 필요한 여유 {args.gap}s")
        if end > total:
            errors.append(f"길이 오류 #{index}: 녹음 끝 {end:.2f}s, 트랙 길이 {total:.2f}s")
        inputs.extend(["-i", str(recording)])
    print("번호   시작초  녹음초  종료초  경계초  화자/속도  발화")
    for row in rows:
        print(row)
    for warning in warnings:
        print(warning)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    filters = [
        f"[{i}:a]aresample=48000,aformat=channel_layouts=mono,"
        f"adelay={int(round(float(line['start_s']) * 1000))}:all=1[a{i}]"
        for i, line in enumerate(lines)
    ]
    filters.append("".join(f"[a{i}]" for i in range(len(lines))) +
                   f"amix=inputs={len(lines)}:normalize=0:dropout_transition=0,"
                   f"apad=whole_dur={total},atrim=0:{total},aformat=channel_layouts=stereo[mix]")
    subprocess.run(
        [FFMPEG, "-y", "-v", "error", *inputs, "-filter_complex", ";".join(filters),
         "-map", "[mix]", "-ar", "48000", "-c:a", "pcm_s16le", str(output)],
        check=True,
    )
    print(f"녹음 저장: {output}  ({dur(output):.2f} s, {len(lines)}개 발화)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
