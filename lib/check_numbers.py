"""출처 없는 숫자 막기(4단계 "정보"): 나레이션·화면 글자의 숫자가 모두 <프로젝트>/sources.json 에 있어야 한다.

    python lib/check_numbers.py <프로젝트> [--html build/video.html] [--every 0.5] [--mutate say|screen]
    · 나레이션: script.json lines[].text 의 숫자 토큰(예 "1.27 mm", "8일", "4천분의 1")이 sources.json numbers[].show 에 있어야 함
    · 화면(--html): 0.5 s 마다 보이는 글자의 숫자 토큰이 표에 있어야 하고, kind="fetched" 숫자가 보이면 같은 장면 층에 "출처:" 꼬리표,
      kind="design" 이면 "목표"/"설계" 표시가 같이 보여야 함. kind="label" = 순번·차례 표시(사실 주장 아님, 꼬리표 불필요)
    · build.py 도 나레이션 검사를 먼저 돌려, 표에 없는 숫자가 있으면 빌드를 멈춘다(못 들어감)
출력 NUMBERS_CHECK PASS|FAIL, FAIL 이면 종료 코드 1.
"""
import argparse, asyncio, json, re, sys
from pathlib import Path

# 숫자 한 덩어리: 쉼표 자리(4,096) · 소수(2.5) · 만/억/조(17만) · 범위(0.63 ~ 13.33) + 단위(긴 것 먼저: mm 가 m 보다, 영문 단위 뒤에 영문 글자 없음).
# 예전 식은 "4,096대" → "4" + "096대", "17만 명" → "17", "10 cm" → "10" 으로 쪼갬.
NUM = r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?"
MAG = r"(?:\s?[만억조])?"
UNIT = (r"(?:(?:mTorr|mm|cm|km|kg|kW|MW|kV|kHz|MHz|Hz|dB|rpm|m/s|μm|m|°C|℃)(?![A-Za-z])|°|%|"
        r"개월|시간|가지|가구|도|일|번|회|대|층|개|명|년|월|초|분|배|원|달러|건|곳|족|톤)")
TOKEN = re.compile(rf"\d+천분의\s*\d+|\d+/\d+|(?:{NUM}){MAG}(?:\s*~\s*(?:{NUM}){MAG})?(?:\s*{UNIT})?")


def norm(s):
    return re.sub(r"\s+", "", s)


def table(project):
    f = Path(project) / "sources.json"
    if not f.exists():
        return None
    nums = json.loads(f.read_text(encoding="utf-8"))["numbers"]
    allowed = {}
    for n in nums:
        for s in n["show"]:
            allowed[norm(s)] = n
    return allowed


def tokens(text):
    return [m.group(0).strip() for m in TOKEN.finditer(text) if re.search(r"\d", m.group(0))]


def lookup(tok, allowed):
    t = norm(tok)
    if t in allowed:
        return allowed[t]
    if not re.search(r"[.a-zA-Z°~]|[가-힣]", t):   # 단위·소수점 없는 맨 숫자는 표에 그대로 있어야 함("1" 이 "1.27 mm" 에 숨지 않게)
        return None
    for k, n in allowed.items():           # "0.63 ~ 13.33 mm" 안의 "13.33 mm" 처럼 표 문구의 일부면 같은 출처
        if t in k:
            return n
    return None


def check_say(project, allowed, extra=None):
    sj = json.loads((Path(project) / "script.json").read_text(encoding="utf-8"))
    bad = []
    for i, ln in enumerate(sj.get("lines", []) + (extra or [])):
        for tok in tokens(ln["text"].replace("|", " ")):
            if not lookup(tok, allowed):
                bad.append((i, ln.get("scene"), tok, ln["text"][:60]))
    return bad


SCREEN_JS = """async ([t, mut]) => { await window.renderAt(t);
  if (mut) { const o = [...document.querySelectorAll('.overlay')].find(e => e.style.display === 'block');
    if (o && !o.querySelector('#__mut')) { const d = document.createElement('div'); d.id = '__mut'; d.textContent = '효율 37 % 향상';
      d.style.cssText = 'position:absolute;left:600px;top:500px;font:700 40px sans-serif;color:#fff'; o.append(d); } }
  const vis = e => { for (let x = e; x && x !== document.body; x = x.parentElement) { const s = getComputedStyle(x);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return false; } return true; };
  const out = [];
  for (const o of document.querySelectorAll('.overlay')) { if (o.style.display !== 'block') continue;
    // 글자 덩어리 = 가장 가까운 div 의 글(숫자와 단위가 다른 span 에 있어도 "688" + "회" 를 이어 읽음). "출처:" 꼬리표 안 글자(연도 등)는 숫자 검사에서 뺀다
    const texts = [], seenB = new Set(); let tag = false; const w = document.createTreeWalker(o, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) { const s0 = n.textContent.trim(); if (!s0 || !vis(n.parentElement)) continue;
      const blk = n.parentElement.closest('div') || n.parentElement; if (seenB.has(blk)) continue; seenB.add(blk);
      const s = blk.textContent.replace(/\\s+/g, ' ').trim();
      if (/^출처/.test(s)) { tag = true; continue; }
      if (/출처:/.test(s)) tag = true;
      texts.push(s.replace(/출처:.*$/, '')); }
    if (tag) texts.push('출처');
    // 장면 위 공용 표지(script.json badge, #badge)도 그 장면 화면 글자다: 숫자·"목표" 표시를 같이 읽는다
    const badge = document.getElementById('badge');
    if (badge && vis(badge) && badge.textContent.trim()) texts.push(badge.textContent.replace(/\\s+/g, ' ').trim());
    out.push({scene: o.dataset.scene, texts}); }
  return out; }"""


async def check_screen(html, allowed, every, mut):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from capture import CHROME, CHROME_ARGS
    from playwright.async_api import async_playwright
    bad, seen = [], set()
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
        p = await b.new_page(viewport={"width": 1920, "height": 1080})
        await p.goto(Path(html).resolve().as_uri(), wait_until="load")
        total = await p.evaluate("Promise.resolve(window.renderReady).then(() => window.VIDEO_TOTAL_S)")
        t = 0.0
        while t < total:
            for o in await p.evaluate(SCREEN_JS, [t, mut]):
                joined = " ".join(o["texts"])
                for tok in tokens(joined):
                    n = lookup(tok, allowed)
                    key = (o["scene"], tok, "unsourced" if not n else "tag")
                    ctx = next((x for x in o["texts"] if tok.replace(" ", "") in x.replace(" ", "")), "")[:40]
                    if not n:
                        if key not in seen: bad.append((round(t, 2), o["scene"], tok, f"표에 없는 숫자 «{ctx}»")); seen.add(key)
                    elif n["kind"] == "fetched" and "출처" not in joined:
                        if key not in seen: bad.append((round(t, 2), o["scene"], tok, f"출처 꼬리표 없음({n['src']})")); seen.add(key)
                    elif n["kind"] == "design" and not re.search(r"목표|설계", joined):
                        if key not in seen: bad.append((round(t, 2), o["scene"], tok, "설계값인데 목표·설계 표시 없음")); seen.add(key)
            t += every
        await b.close()
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project"); ap.add_argument("--html"); ap.add_argument("--every", type=float, default=0.5)
    ap.add_argument("--mutate", choices=["say", "screen"])
    a = ap.parse_args()
    allowed = table(a.project)
    if allowed is None:
        print("sources.json 없음 → NUMBERS_CHECK 실제 SKIP"); return 0
    extra = [{"scene": "mut", "text": "출력은 12 kW 입니다."}] if a.mutate == "say" else None
    bad = [("say",) + x for x in check_say(a.project, allowed, extra)]
    if a.html:
        bad += [("screen",) + x for x in asyncio.run(check_screen(a.html, allowed, a.every, a.mutate == "screen"))]
    for x in bad:
        print(" | ".join(map(str, x)))
    print(f"숫자 표 {len(allowed)} 문구 · 걸린 곳 {len(bad)}")
    if a.mutate:   # 넣은 숫자(12 kW · 37 %)를 그 자체로 잡았는지
        hit = any(("12 kW" in str(x) or "37 %" in str(x)) for x in bad)
        print("MUTATION_CAUGHT" if hit else "MUTATION_NOT_CAUGHT")
    print("NUMBERS_CHECK " + ("FAIL" if bad else "PASS"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
