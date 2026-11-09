"""Build scene timing and captions from cached speech boundaries."""

import asyncio
import hashlib
import json
import math
from pathlib import Path
import re
from shutil import which
import subprocess
import sys

import edge_tts


PROJECT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
BUILD = PROJECT / "build"
BUILD.mkdir(exist_ok=True)
ENCODER_PATH = which(cmd="ffmpeg")


def save_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=1), encoding="utf-8")


def omit_asides(text):
    return re.sub(r"\s*\([^)]*\)", "", text)


def substitute(text, replacements):
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def frame_end(seconds):
    return math.ceil(round(seconds * 30, 6)) / 30


def incoming_s(script, scene_index):
    previous, current = script["scenes"][scene_index - 1:scene_index + 1]
    allowance = float(script.get("crossfade_s") or 0)
    if previous.get("look", "cinema") != current.get("look", "cinema"):
        return max(allowance, 2.0)
    transition = current.get("transition")
    if transition is None or transition == "cut":
        return allowance
    duration = transition.get("dur", 0.6) if isinstance(transition, dict) else 0.6
    return max(allowance, duration / 2)


async def load_utterance(line, script, replacements, cache):
    if "say" in line:
        spoken = line["say"]
    else:
        spoken = line["text"].replace("|", " ").replace("\n", " ")
        spoken = " ".join(omit_asides(spoken).split())
        spoken = substitute(spoken, replacements)
    voice = line.get("voice", script["voice"])
    rate = line.get("rate", script.get("rate", "+0%"))
    pitch = line.get("pitch", script.get("pitch", "+0Hz"))
    key = hashlib.sha1("|".join((voice, rate, pitch, spoken)).encode()).hexdigest()[:12]
    mp3 = cache / (key + ".mp3")
    metadata = cache / (key + ".json")
    wav = cache / (key + ".wav")
    if not (mp3.exists() and metadata.exists()):
        chunks = []
        boundaries = []
        speech = edge_tts.Communicate(
            spoken, voice, rate=rate, pitch=pitch, boundary="WordBoundary"
        )
        async for event in speech.stream():
            if event["type"] == "audio":
                chunks.append(event["data"])
            elif event["type"] == "WordBoundary":
                boundaries.append({
                    "text": event["text"],
                    "t": event["offset"] / 10_000_000,
                    "d": event["duration"] / 10_000_000,
                })
        if not boundaries:
            sys.exit(f"낱말 시각이 오지 않았습니다(인터넷·목소리 이름 확인): {spoken}")
        pending = mp3.with_suffix(".part")
        pending.write_bytes(b"".join(chunks))
        pending.replace(mp3)
        save_json(metadata, {"text": spoken, "voice": voice, "words": boundaries})
    boundaries = json.loads(metadata.read_text(encoding="utf-8"))["words"]
    onset = boundaries[0]["t"]
    endpoint = boundaries[-1]["t"] + boundaries[-1]["d"]
    if not wav.exists():
        subprocess.run([
            ENCODER_PATH, "-nostdin", "-v", "error", "-y", "-i", str(mp3),
            "-af", f"atrim=0:{endpoint + 0.25:.3f}",
            "-ar", "48000", "-ac", "1", str(wav),
        ], check=True)
    return {
        "spoken": spoken,
        "boundaries": boundaries,
        "onset": onset,
        "length": endpoint - onset,
        "audio": "tts/" + wav.name,
    }


def character_spans(spoken, boundaries):
    cursor = 0
    spans = []
    for word in boundaries:
        position = spoken.find(word["text"], cursor)
        if position < 0:
            position = cursor
        cursor = position + len(word["text"])
        spans.append((position, cursor, word))
    return spans


def locate_phrase(spoken, spans, phrase, cursor):
    position = spoken.find(phrase, cursor)
    if position < 0:
        return None, cursor
    for start, end, word in spans:
        if start <= position < end or start > position:
            return word, position + len(phrase)
    return spans[-1][2], position + len(phrase)


async def generate():
    script = json.loads((PROJECT / "script.json").read_text(encoding="utf-8"))
    replacements = {}
    replacements.update(script.get("say_replace", {}))
    cache = BUILD / "tts"
    cache.mkdir(exist_ok=True)
    names = [scene["name"] for scene in script["scenes"]]
    labels = {int(key): value for key, value in script.get("steps", {}).items()}
    lead, tail = script["lead_s"], script["tail_s"]
    utterances = []
    for line in script["lines"]:
        if line["scene"] not in names:
            sys.exit(f"문장의 scene '{line['scene']}' 이 scenes 목록에 없습니다")
        utterances.append(await load_utterance(line, script, replacements, cache))

    modules = {}
    scheduled = []
    clock = 0.0
    for scene_index, scene in enumerate(script["scenes"]):
        name = scene["name"]
        cursor = clock
        scene_rows = []
        for index, line in enumerate(script["lines"]):
            if line["scene"] != name:
                continue
            if not scene_rows:
                if scene_index == 0:
                    cursor += max(script.get("intro_s", 0.0), utterances[index]["onset"] + 0.15)
                else:
                    cursor += max(scene.get("lead_s", lead), incoming_s(script, scene_index) + lead)
            end = cursor + utterances[index]["length"]
            scene_rows.append({
                "i": index,
                "scene": name,
                "speech_start": round(cursor, 3),
                "speech_end": round(end, 3),
            })
            cursor = end + tail + lead
        region = scene_rows[-1]["speech_end"] + tail - clock if scene_rows else 0.0
        extra_from = frame_end(region)
        duration = frame_end(extra_from + scene.get("extra_s", 0.0))
        if duration <= 0:
            sys.exit(f"장면 '{name}'에 재생할 시간이 없습니다. 문장을 넣거나 extra_s 를 늘려 주세요.")
        modules[name] = {
            "start": round(clock, 4),
            "duration": round(duration, 4),
            "extra_from": round(extra_from, 4),
        }
        scheduled.extend(scene_rows)
        clock += duration

    chips = []
    chipless = []
    for row in scheduled:
        row["slot_start"] = round(max(
            modules[row["scene"]]["start"], row["speech_start"] - lead
        ), 3)
        row["slot_end"] = round(row["speech_end"] + tail, 3)
        step = script["lines"][row["i"]].get("step")
        if step:
            chips.append({
                "n": step,
                "label": labels.get(step, str(step)),
                "start": row["slot_start"],
                "end": row["slot_end"],
            })
        else:
            chipless.append((row["slot_start"], row["slot_end"]))
    for earlier, later in zip(chips, chips[1:]):
        if earlier["end"] < later["start"] and not any(
            earlier["end"] < start < later["start"] for start, _ in chipless
        ):
            earlier["end"] = later["start"]

    captions = []
    word_rows = []
    narration_rows = []
    for row in scheduled:
        index = row["i"]
        line = script["lines"][index]
        utterance = utterances[index]
        spoken = utterance["spoken"]
        spans = character_spans(spoken, utterance["boundaries"])
        placement = row["speech_start"] - utterance["onset"]
        consumed = 0
        for piece_index, piece in enumerate(line["text"].split("|")):
            if piece_index == 0:
                time = row["speech_start"] - 0.15
            else:
                cleaned = omit_asides(piece).replace("\n", " ")
                tokens = substitute(cleaned, replacements).split()
                candidates = [" ".join(tokens[:3]), *tokens, *cleaned.split()]
                for candidate in candidates:
                    word, _ = locate_phrase(spoken, spans, candidate, consumed)
                    if word is not None:
                        break
                else:
                    sys.exit(
                        f"#{index} 자막 조각 '{piece}' 의 낱말을 읽을 글에서 찾지 못했습니다: {spoken}"
                    )
                time = placement + word["t"] - 0.15
            captions.append({"t": round(time, 3), "text": piece.strip()})
            consumed += len(omit_asides(piece.replace("\n", " ")))

        words = []
        phrase_cursor = 0
        for keyword in line.get("keywords", []):
            query = substitute(keyword, replacements)
            word, phrase_cursor = locate_phrase(spoken, spans, query, phrase_cursor)
            if word is None:
                sys.exit(f"#{index} 읽을 글에 키워드 '{keyword}' 가 없습니다: {spoken}")
            time = round(placement + word["t"], 2)
            words.append({
                "word": keyword,
                "t": time,
                "t_scene": round(time - modules[row["scene"]]["start"], 2),
            })
        display = line["text"].replace("|", " ")
        word_rows.append({
            "line": index,
            "scene": row["scene"],
            "step": line.get("step"),
            "speech_start": row["speech_start"],
            "speech_end": row["speech_end"],
            "text": display,
            "words": words,
        })
        narration_rows.append({
            "start_s": round(placement, 3),
            "end_s": row["slot_end"],
            "audio": utterance["audio"],
            "text": display,
        })

    for scene in script["scenes"]:
        if scene.get("extra_s", 0.0) > 0:
            module = modules[scene["name"]]
            captions.append({
                "t": round(module["start"] + module["extra_from"], 3),
                "text": "",
            })
    captions.sort(key=lambda event: event["t"])
    total = round(clock, 4)
    timeline = {
        "note": "timeline.py 가 script.json 으로 만든다. 손으로 고치지 말 것. 시각은 전역 초.",
        "fps": 30,
        "total_s": total,
        "order": names,
        "modules": modules,
        "steps": chips,
        "fade_in_s": script.get("fade_in_s", 0.6),
        "fade_out_s": script.get("fade_out_s", 0.8),
        "fade_color": script.get("fade_color", "#0E1A22"),
        "crossfade_s": script.get("crossfade_s", 0.0),
        "captions": captions,
        "lines": scheduled,
    }
    save_json(BUILD / "timeline.json", timeline)
    save_json(BUILD / "word_times.json", {
        "note": "t = 전역 초, t_scene = 장면 시작 기준 초 (그 낱말이 들리기 시작하는 시각).",
        "modules": modules,
        "lines": word_rows,
    })
    save_json(BUILD / "narration.json", {
        "note": "timeline.py 가 만든다. 원본은 script.json.",
        "duration_s": total,
        "lines": narration_rows,
    })
    print(f"음성 {script['voice']} · 전체 {total:.2f} s")
    for name in names:
        module = modules[name]
        start, duration = module["start"], module["duration"]
        print(f"  {name:<10} {start:6.2f} ~ {start + duration:6.2f}  ({duration:.2f} s)")
    for row in scheduled:
        print(
            f"  #{row['i']} {row['scene']:<10} 말 "
            f"{row['speech_start']:6.2f} → {row['speech_end']:6.2f}"
        )


if __name__ == "__main__":
    asyncio.run(generate())
