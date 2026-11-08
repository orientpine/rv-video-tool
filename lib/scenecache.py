"""바뀐 장면만 다시 렌더(7단계): 장면마다 입력 지문을 build/frames/.scenes.json 에 두고, 지문이 바뀐 장면의 프레임만 지운다.

    python3 lib/scenecache.py <프로젝트> [--fps 30] [--full] [--dry-run]
    · 장면 지문 = module.js + deps.json 의 스크립트·자원·자료 파일 내용 + 그 장면 시간표(시작·길이·낱말 시각) + handoff.json
    · 공용 지문 = kit/*.js·shell.html·vendor·script.json 의 look·전환·장면 순서 → 바뀌면 전체 다시
    · 지운 뒤 capture.py --skip-existing 가 빈 프레임만 찍는다(rv make 가 부름)
    · 새 길이(timeline total_s) 뒤 프레임은 늘 지운다(길이를 줄여 다시 make 하면 옛 판 뒤쪽 프레임이 남던 것)
    · --range A B: rv make --from A --to B 가 그 구간 프레임도 지우게 넘김(바뀐 장면은 구간 밖이어도 지움 — 밀린 장면이 옛 그림으로 남지 않게)
출력: SCENECACHE 다시 <장면…> 그대로 <장면…> · 지운 프레임 수 · 새 길이 뒤 지운 프레임 수. --dry-run 이면 지우지 않고 보고만.
"""
import argparse, hashlib, json, sys
from pathlib import Path

TOOL = Path(__file__).resolve().parent.parent


def h(*parts):
    m = hashlib.sha256()
    for p in parts:
        m.update(p if isinstance(p, bytes) else str(p).encode())
        m.update(b"\0")
    return m.hexdigest()[:16]


def files_of(d):
    deps = json.loads((d / "deps.json").read_text(encoding="utf-8")) if (d / "deps.json").exists() else {}
    fs = [d / "module.js", d / "deps.json", d / "handoff.json"]
    fs += [d / s for s in deps.get("scripts", [])] + [d / p for p in deps.get("assets", {}).values()] + [d / p for p in deps.get("data", {}).values()]
    return [f.resolve() for f in fs]


def fingerprints(P):
    tl = json.loads((P / "build" / "timeline.json").read_text(encoding="utf-8"))
    wt = json.loads((P / "build" / "word_times.json").read_text(encoding="utf-8")) if (P / "build" / "word_times.json").exists() else {"lines": []}
    sj = json.loads((P / "script.json").read_text(encoding="utf-8"))
    glob_parts = [f.read_bytes() for f in sorted((TOOL / "kit").glob("*")) if f.is_file()]
    glob_parts += [f.read_bytes() for f in sorted((TOOL / "vendor").rglob("*.js"))]
    glob_parts += [json.dumps([sj.get("look"), [s.get("transition") if isinstance(s, dict) else None for s in sj.get("scenes", [])], tl["order"],
                               tl.get("captions"), tl.get("steps"), tl.get("fade_in_s"), tl.get("fade_out_s"), tl.get("crossfade_s")], ensure_ascii=False, sort_keys=True)]
    src = P / "sources.json"
    glob_parts.append(src.read_bytes() if src.exists() else b"")
    G = h(*glob_parts)
    out, order = {}, tl["order"]
    for i, n in enumerate(order):
        d = P / "scenes" / n
        parts = [f.read_bytes() if f.exists() else b"-" for f in files_of(d)] if (d / "module.js").exists() else [b"placeholder"]
        m = tl["modules"][n]
        words = [ln for ln in wt["lines"] if ln.get("scene") == n]
        # 첫 장면은 0 부터, 끝 장면은 total_s 까지(장면 밖 앞뒤 구간 = 그 장면 프레임): 안 그러면 그 구간 옛 프레임이 안 지워져 남음
        # (측정 예: 끝 장면이 228.73 s 에 끝나고 total 239.93 s → 336 프레임이 이전 판 그대로)
        start = 0 if i == 0 else m["start"]
        end = tl["total_s"] if i == len(order) - 1 else m["start"] + m["duration"]
        gap = [start, end] if (start, end) != (m["start"], m["start"] + m["duration"]) else []   # 빈 구간 없는 프로젝트는 지문 그대로(전체 다시 찍기 없음)
        out[n] = {"hash": h(G, *parts, json.dumps([m.get("start"), m.get("duration"), words] + gap, ensure_ascii=False, sort_keys=True)),
                  "start": start, "end": end}
    return out, round(tl["total_s"] * 30)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project"); ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--full", action="store_true"); ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--range", nargs=2, type=float, metavar=("A", "B"))
    a = ap.parse_args()
    P = Path(a.project).resolve(); FR = P / "build" / "frames"; FR.mkdir(parents=True, exist_ok=True)
    cache = FR / ".scenes.json"
    old = json.loads(cache.read_text()) if cache.exists() and not a.full else {}
    new, count = fingerprints(P)
    count = round(count * a.fps / 30)
    redo = [n for n in new if a.full or old.get(n, {}).get("hash") != new[n]["hash"]]
    keep = [n for n in new if n not in redo]
    ks = set()
    for n in redo:
        f0, f1 = round(new[n]["start"] * a.fps), round(new[n]["end"] * a.fps)
        ks.update(range(max(0, f0 - 1), f1 + 1))           # 경계 프레임 하나씩 더(전환 dip 이 경계 앞뒤를 같이 칠함)
    if a.range:
        ks.update(range(max(0, round(a.range[0] * a.fps) - 1), round(a.range[1] * a.fps) + 2))
    beyond = [p for p in FR.glob("f_*.png") if p.stem[2:].isdigit() and int(p.stem[2:]) >= count]
    for p in beyond:
        if not a.dry_run:
            p.unlink()
    removed = 0
    for k in sorted(ks):
        p = FR / f"f_{k:05d}.png"
        if p.exists():
            if not a.dry_run:
                p.unlink()
            removed += 1
    if not a.dry_run:
        cache.write_text(json.dumps(new, ensure_ascii=False, indent=1))
    print(f"SCENECACHE 다시 {' '.join(redo) or '-'} · 그대로 {' '.join(keep) or '-'} · 지운 프레임 {removed} · 새 길이 뒤 지운 프레임 {len(beyond)}")


if __name__ == "__main__":
    sys.exit(main())
