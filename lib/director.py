"""AI 감독(6단계): 장면마다 정지 화면을 뽑아 다른 계열 모델(codex, GPT)이 채점표(RUBRIC)로 점수와 고칠 점을 매긴다.

    python3 lib/director.py <프로젝트> --html build/video.html --rubric RUBRIC.md --out <폴더> [--before 옛.html] [--scenes a,b] [--model M]
    · 장면마다 3장(시작 +30 %, 가운데, 끝 −15 %)을 찍어 codex exec -s read-only 에 그림만 붙여 보낸다(도구 코드·대본 파일은 안 보냄)
    · --before 를 주면 같은 시각을 옛 html 로도 찍어 장면마다 A/B 를 섞는다(시드 고정). 모델은 어느 쪽이 새것인지 모른다(눈가림).
      답(섞은 순서)은 <out>/.key.json 에만 있고, 채점 뒤 맞춰 DIRECTOR.md 에 전→후로 적는다
    · 모델 답은 JSON {"A": {"picture":n,"info":n,"facts":n|null,"fix":"..."}, "B": {...}}
출력: <out>/DIRECTOR.md · director.json, 마지막 줄 DIRECTOR_DONE <장면 수>. codex 가 없거나 실패하면 그 장면은 ERROR 로 적고 종료 코드 1.
"""
import argparse, asyncio, json, random, re, shutil, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
PROMPT = """You are a strict video director scoring still frames of ONE scene of a Korean research-proposal explainer video.
The rubric (Korean) is below. Score axis 1 그림 (picture), axis 3 정보 (information design) and axis 5 사실 (facts: numbers carry a 출처 tag or a 목표/설계 marker; null if no numbers) from 1 to 5: the score is the highest level whose sentences ALL hold. Treat (자동) clauses as satisfied unless a violation is visible.
The attached images are version A frames first ({na} images), then version B frames ({nb} images). Versions may be identical in some respects. Judge each version on its own.
For each version give one concrete fix (Korean, one sentence) that would raise its lowest axis.
Reply with ONLY a JSON object: {{"A": {{"picture": n, "info": n, "facts": n_or_null, "fix": "..."}}, "B": {{...}}}}{single}

RUBRIC:
{rubric}
"""


async def shoot(html, times, out):
    from capture import CHROME, CHROME_ARGS
    from playwright.async_api import async_playwright
    out.mkdir(parents=True, exist_ok=True)
    paths = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
        p = await b.new_page(viewport={"width": 1920, "height": 1080})
        await p.goto(Path(html).resolve().as_uri(), wait_until="load")
        await p.evaluate("Promise.resolve(window.renderReady).then(() => 0)")
        for t in times:
            await p.evaluate("async t => { await window.renderAt(t); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }", t)
            f = out / f"t{t:07.2f}.png"; await p.screenshot(path=str(f)); paths.append(f)
        await b.close()
    return paths


def ask(images, prompt, model, workdir):
    last = workdir / "last.txt"
    cmd = ["codex", "exec", "-s", "read-only", "--skip-git-repo-check", "--ephemeral", "-C", str(workdir), "-o", str(last)]
    if model:
        cmd += ["-m", model]
    for im in images:
        cmd += ["-i", str(im)]
    r = subprocess.run(cmd + ["-"], input=prompt, capture_output=True, text=True, timeout=900)
    txt = last.read_text() if last.exists() else r.stdout
    m = re.search(r"\{.*\}", txt, re.S)
    if r.returncode != 0 or not m:
        raise RuntimeError(f"codex exit {r.returncode}: {(r.stderr or txt)[-400:]}")
    return json.loads(m.group(0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project"); ap.add_argument("--html", required=True); ap.add_argument("--rubric", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--before"); ap.add_argument("--scenes"); ap.add_argument("--model")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    P, O = Path(a.project).resolve(), Path(a.out).resolve(); O.mkdir(parents=True, exist_ok=True)
    tl = json.loads((P / "build" / "timeline.json").read_text(encoding="utf-8"))
    only = set(filter(None, (a.scenes or "").split(",")))
    rubric = Path(a.rubric).read_text(encoding="utf-8")
    rnd, key, res, fail = random.Random(a.seed), {}, {}, 0
    for n in tl["order"]:
        if only and n not in only:
            continue
        m = tl["modules"][n]; s, d = m["start"], m["duration"]
        times = [round(s + d * 0.3, 2), round(s + d * 0.5, 2), round(s + d * 0.85, 2)]
        new = asyncio.run(shoot(a.html, times, O / "frames" / n / "new"))
        old = asyncio.run(shoot(a.before, times, O / "frames" / n / "old")) if a.before else None
        swap = bool(old) and rnd.random() < 0.5
        A, B = (old, new) if swap else (new, old)
        key[n] = {"A": "old" if swap else "new", "B": ("new" if swap else "old") if old else None}
        work = Path(tempfile.mkdtemp(prefix="director_"))
        imgs = []
        for i, f in enumerate(A + (B or [])):          # 모델 작업 폴더엔 이름을 지운 그림만
            g = work / f"img{i + 1:02d}.png"; shutil.copy(f, g); imgs.append(g)
        prompt = PROMPT.format(na=len(A), nb=len(B or []), rubric=rubric,
                               single="" if B else ' (only version A is attached; return "B": null)')
        try:
            res[n] = ask(imgs, prompt, a.model, work)
            print(f"{n}: {json.dumps(res[n], ensure_ascii=False)[:160]}")
        except Exception as e:  # 실패는 숨기지 않고 표에 ERROR 로
            res[n] = {"error": str(e)}; fail = 1; print(f"{n}: ERROR {e}")
        shutil.rmtree(work, ignore_errors=True)
    (O / ".key.json").write_text(json.dumps(key, indent=1))
    rows = ["| 장면 | 판 | 그림 | 정보 | 사실 | 고칠 점 |", "|---|---|---|---|---|---|"]
    out = {}
    for n, r in res.items():
        if "error" in r:
            rows.append(f"| {n} | - | ERROR | | | {r['error'][:80]} |"); continue
        for side in ("A", "B"):
            v = r.get(side)
            if not v:
                continue
            who = key[n][side]
            out.setdefault(n, {})[who] = v
            rows.append(f"| {n} | {'후' if who == 'new' else '전'} | {v.get('picture')} | {v.get('info')} | {v.get('facts')} | {v.get('fix', '')} |")
    avg = {}
    for who in ("old", "new"):
        for ax in ("picture", "info"):
            xs = [out[n][who][ax] for n in out if who in out[n] and isinstance(out[n][who].get(ax), (int, float))]
            if xs:
                avg[f"{who}_{ax}"] = round(sum(xs) / len(xs), 2)
    (O / "director.json").write_text(json.dumps({"scores": out, "avg": avg}, ensure_ascii=False, indent=1))
    (O / "DIRECTOR.md").write_text("# AI 감독 채점 (codex, 눈가림 A/B)\n\n" + "\n".join(rows) + f"\n\n평균: {json.dumps(avg, ensure_ascii=False)}\n", encoding="utf-8")
    print(f"평균 {avg}")
    print(f"DIRECTOR_DONE {len(res)}")
    return fail


if __name__ == "__main__":
    sys.exit(main())
