# rv releases

## How releases work

Every release is a git tag `vX.Y.Z` (Z for fixes, Y for features). Each tag gets a note here and on the GitHub release page, in Korean and English. Install a release with `scripts/install.sh` and check it with `scripts/verify.sh` (see [README.md](README.md) and [MAINTAINING.md](MAINTAINING.md)).

릴리스는 git 태그 `vX.Y.Z` 하나다(고침 = Z, 기능 = Y). 태그마다 이 파일과 GitHub 릴리스 페이지에 한국어·영어 노트를 쓴다. 설치는 `scripts/install.sh`, 확인은 `scripts/verify.sh`.

## Unreleased

### English

- Aspect: `"aspect": "2.35:1"` (or `"4:3"`, `"1:2"`) in `script.json` draws letterbox or pillarbox bars once above the scenes (under captions and step chips) and sets `window.PICTURE`. `check_layout` no longer reads a bar as an opaque card over the subject, and the flicker mutation lands inside the picture instead of in a bar, where it could not be caught. Without `aspect` nothing changes.

### 한국어

- 화면비: `script.json` 의 `"aspect": "2.35:1"`(또는 `"4:3"`, `"1:2"`)이면 위아래(좌우) 검은 막대를 장면 위(자막·단계 칩 아래)에 한 번 그리고 `window.PICTURE` 를 정한다. `check_layout` 이 막대를 대상 위 불투명 카드로 보지 않고, 깜빡임 변이는 막대가 아니라 그림 안에 넣어 잡힌다. `aspect` 가 없으면 바뀌는 것 없음.

## v0.2.1

### English

Fix: `check_cuts --theme --mp4` failed bright videos that fade through black between scenes.

- A non-white stretch shorter than 2 s between white pictures, or at the start or end of the video, is now a dip (`THEME_DIP` line) and not a white -> real -> white switch, when its luma changes no more than the existing per-frame limit (12/255). Before, each 1.6 s scene dip counted as two switches, and the fade in/out at the ends as short holds, so a calm bright video failed hold and switch rules. A dark block that cuts in hard is still a switch and fails as before. The white-picture definition and the 12 s / 2-per-60 s rules are unchanged.
- `THEME_FATIGUE` joins a fade in/out under 2 s at either end with the bright run next to it when that run is 2 s or longer (a shorter one stays a flash), as it already did for gaps inside the video.
- The fatigue mutation counts two planned blocks that are moved past the same white run to one spot once. Before, it put both on the same seconds (one block) and could report `MUTATION_CAUGHT` only because of an unrelated finding. With room for fewer than two blocks it prints `MUTATION_SKIP`, as documented.
- Same output as v0.2.0 on the two regression projects (real check, theme mutation and fatigue mutation lines).
- Docs: `AGENTS.md` (also read as `CLAUDE.md`) and a README section for handing rv work to a coding agent: how to lay out a project, which checks fail and how to read their lines.

### 한국어

고침: `check_cuts --theme --mp4` 가 장면 사이를 검정으로 페이드하는 밝은 영상을 FAIL 내던 것.

- 흰 화면 사이나 영상 앞뒤 끝의 2 s 보다 짧은 흰 화면이 아닌 구간은 밝기가 프레임마다 기존 한도(12/255) 안에서 바뀌면 dip(`THEME_DIP` 줄)이고 흰 -> 실사 -> 흰 전환이 아니다. 전에는 1.6 s 장면 dip 하나가 전환 두 번, 앞뒤 페이드가 짧은 유지로 세여 차분한 밝은 영상이 유지·전환 규칙에 걸렸다. 딱 끊기며 들어오는 어두운 블록은 여전히 전환이고 전처럼 걸린다. 흰 화면 정의와 12 s · 60 s 에 2번 규칙은 그대로다.
- `THEME_FATIGUE` 도 앞뒤 끝의 2 s 보다 짧은 페이드를 옆 밝은 구간이 2 s 이상이면 그 구간에 합친다(더 짧으면 그대로 번쩍임, 영상 안 끊김은 전부터 합쳤다).
- 피로 변이는 같은 흰 구간 뒤로 밀려 한 자리에 모인 블록 둘을 하나로 여긴다. 전에는 둘을 같은 초에 넣어(실제로 블록 하나) 상관없는 다른 걸림 덕에만 `MUTATION_CAUGHT` 가 나올 수 있었다. 블록 둘을 넣을 자리가 없으면 적힌 대로 `MUTATION_SKIP` 을 찍는다.
- 두 회귀 프로젝트에서 v0.2.0 과 출력이 같다(본 검사·테마 변이·피로 변이 줄).
- 문서: rv 일을 코딩 에이전트에게 맡길 때 쓰는 `AGENTS.md`(`CLAUDE.md` 로도 읽힘)와 README 절: 프로젝트 구성, 어떤 검사가 걸리고 그 줄을 어떻게 읽는지.

## v0.2.0

### English

`rv check` is about 4x faster on the two regression projects and catches at least as much as before; `rv make` encodes the picture once.

| project | video | v0.1.2 `rv check` | v0.2.0 `rv check` | mutations caught |
|---|---:|---:|---:|---|
| A | 177 s | 731 s | 153 s | 33 / 33 |
| B (machine fleet) | 224 s | 1312 s | 502 s | 23 / 25 |

- A mutation run (a checker's self-test on a deliberately broken copy) stops at the first frame that catches it; it only has to be caught once. Real checks still measure every frame.
- The long real `check_clearance --rules mesh` and `check_layout` runs share their frames over `RV_CHECK_SHARDS` browsers (default 4). A machine pair's first measured depth is decided in frame order whatever the split. Every page checks, at the frame where another page first saw a pair, that the two bodies have the same box and the same triangles; if not, the mesh check is measured again on one page and says so (`CLEARANCE_SHARDS`).
- `encode.sh` encodes the frames once and adds the sound to that picture (97 s -> 49 s on 900 frames at 1080p; same decoded frames and sound).
- New default: `script.json` `"badge": {"text", "scenes"}` draws one label above the scenes instead of a copy in every scene, so it stays still through transitions between those scenes. It is checked as chrome for the safe area and its numbers go through the number check.
- Fixed: on project B the occlude mutation was skipped, because a mutation run of `check_layout` printed `OCCLUSION_CHECK 실제 SKIP`. Only the real run prints it now, so that mutation runs and is caught (23 -> 25 caught lines).
- The real-check sections of `CHECKS.md` are the same as v0.1.2 on both projects (project B real mesh `FAIL (212 프레임)` both).

### 한국어

`rv check` 가 두 회귀 프로젝트에서 약 4배 빨라졌고 잡는 것은 그대로이거나 늘었다. `rv make` 는 그림을 한 번만 인코딩한다.

| 프로젝트 | 영상 | v0.1.2 `rv check` | v0.2.0 `rv check` | 잡힌 변이 |
|---|---:|---:|---:|---|
| A | 177 s | 731 s | 153 s | 33 / 33 |
| B (기계 여러 대) | 224 s | 1312 s | 502 s | 23 / 25 |

- 변이 실행(일부러 망가뜨린 사본으로 검사기를 시험하는 것)은 처음 잡힌 프레임에서 멈춘다. 한 번만 잡히면 되기 때문이다. 본 검사는 여전히 모든 프레임을 잰다.
- 오래 걸리는 본 `check_clearance --rules mesh`·`check_layout` 은 프레임을 브라우저 `RV_CHECK_SHARDS` 개(기본 4)에 나눠 잰다. 기계 짝의 처음 깊이는 어떻게 나눠도 프레임 순서로 정한다. 다른 페이지가 짝을 처음 본 프레임에서 모든 페이지가 두 몸체의 상자·삼각형 지문이 같은지 확인하고, 다르면 한 페이지로 다시 재고 그렇다고 적는다(`CLEARANCE_SHARDS`).
- `encode.sh` 는 프레임을 한 번만 인코딩하고 그 그림에 소리를 붙인다(1080p 900장 97 s -> 49 s, 풀어 본 그림·소리 같음).
- 새 기본값: `script.json` `"badge": {"text", "scenes"}` 는 장면마다 사본을 붙이는 대신 장면 위에 표지 하나를 그린다. 적힌 장면끼리의 전환에서 그대로 서 있고, 안전 영역은 공용 표시로 재며, 숫자는 숫자 검사를 거친다.
- 고침: 프로젝트 B 에서 가림 변이가 건너뛰어졌다. `check_layout` 변이 실행이 `OCCLUSION_CHECK 실제 SKIP` 을 찍었기 때문이다. 이제 본 실행만 그 줄을 찍어 그 변이가 돌고 잡힌다(잡힘 줄 23 -> 25).
- `CHECKS.md` 의 본 검사 절은 두 프로젝트 모두 v0.1.2 와 같다(프로젝트 B 본 충돌 `FAIL (212 프레임)` 그대로).

## v0.1.2

### English

- `check_motion` catches pop-in (`POP_IN`): an overlay card, label or 3D part whose on-screen weight (area share x opacity) jumps from at most 5% to at least 50% of its peak within two frames, with no fade, slide or camera reveal. Simultaneous pops are one line naming the elements; scene starts, transitions, declared cuts and camera cuts are listed as `EXEMPT`. Boxes, shapes, pictures and 3D parts count; bare text without a background (readouts, a line of text) is read like a caption and does not. Clip-path inset and overflow masks are respected. Mutation `popin` hides a steady box for 0.6 s and shows it again in one frame. Known limits: a part switched on inside a closed housing still counts (no occlusion test); SVG lines drawn with `stroke-dashoffset` and 3D lines grown with `setDrawRange` keep their box and can read as a pop.
- `check_motion` checks that the explained part comes to the centre (`SUBJECT_FRAME`): during each spoken action, the part `ACTION_MATCH` linked (else the declared action/follow subject) must have its screen centre inside the middle 30% of the frame (`|x-.5|, |y-.5| <= .15`) in at least half of the samples after a 0.5 s lead-in. Mutation `offcenter` turns the camera 25 degrees inside those spans.
- Swap verbs are read as actions: "바꿔 끼웁니다", "교체합니다", "갈아 끼우고" (a tool change used to get no action check at all).
- Defaults that avoid both: `KIT.fx.reveal(obj, KIT.win(t, a, b, 0.4))` grows a 3D element in; `KIT.process.exhaust` fades its flow in and out instead of showing every arrow in one frame; `KIT.shot.action` ends with the subject inside the same middle box.
- `check_layout` no longer judges contrast or overlap of text in the middle of a fade (`LAYOUT_FADE` line); it judges it on resting frames. A fading label failed contrast before, which pushed scenes to switch labels on in one frame. Clipping and the safe area are still checked on every sample. This applies to scene content only; rv's own step chips and captions open with a clip reveal and keep full contrast on every frame.
- A box cut by the screen edge when it appears is sliding in or revealed by the camera, not popping, unless it already covers at least 3% of the screen and is mostly visible (a card placed a few pixels past the edge that switches on in one frame still pops): small 3D parts crossing the edge in one or two frames made 78 of 81 `POP_IN` lines on one regression project; with this rule 3 remain, each a real one-frame appearance.
- Measured on two regression projects under the same conditions (`rv check`, old tree vs this one): project A 684 s -> 701 s, project B 1322 s -> 1339 s; verdicts unchanged and no mutation missed.

### 한국어

- `check_motion` 이 갑자기 등장(`POP_IN`)을 잡는다: 카드·이름표·부품의 화면 무게(넓이 비 × 불투명도)가 서서히 나타나기·밀려 들어오기·카메라가 비춰 드러내기 없이 두 프레임 안에 최대의 5% 이하에서 50% 이상으로 뛰면 FAIL. 같은 프레임에 튀는 것은 한 줄에 요소 이름과 함께, 장면 시작·전환·선언한 컷·카메라 컷은 `EXEMPT` 로 찍는다. 상자·그림·3D 부품만 세고, 배경 없는 맨 글자(읽음값·글 한 줄)는 자막처럼 세지 않는다. clip-path inset·overflow 가림은 보이는 부분만 잰다. 변이 `popin` 은 떠 있던 상자를 0.6 s 감췄다가 한 프레임에 켠다. 못 잡는/잘못 잡는 것: 닫힌 함 안에서 켜지는 부품도 센다(가림은 안 봄), `stroke-dashoffset` 으로 그리는 SVG 선·`setDrawRange` 3D 선은 상자 크기가 그대로라 등장으로 보일 수 있다.
- `check_motion` 이 설명 대상이 화면 가운데에 오는지 본다(`SUBJECT_FRAME`): 동작 말 구간마다 `ACTION_MATCH` 가 이은 부품(없으면 선언한 action/follow 샷 대상)의 화면 중심이 앞 0.5 s 를 뺀 표본 절반 이상에서 가운데 30%(`|x-.5|, |y-.5| <= .15`) 안에 있어야 한다. 변이 `offcenter` 는 그 구간에 카메라를 25° 돌린다.
- 교체 동사를 동작으로 읽는다: "바꿔 끼웁니다", "교체합니다", "갈아 끼우고"(툴 교체 말은 동작 검사가 아예 없었다).
- 처음부터 안 생기게 하는 기본값: `KIT.fx.reveal(obj, KIT.win(t, a, b, 0.4))` 로 3D 요소가 자라며 나타나고, `KIT.process.exhaust` 는 화살표를 한 프레임에 다 띄우지 않고 흐름을 서서히 켜고 끈다. `KIT.shot.action` 은 샷 끝에 대상이 같은 가운데 상자 안에 오게 구도를 고른다.
- `check_layout` 은 페이드 중인 글자의 대비·겹침을 그 순간에 재지 않고(`LAYOUT_FADE` 줄) 쉬는 프레임에서 잰다. 전에는 페이드 중 이름표가 대비 FAIL 이 나 장면들이 이름표를 한 프레임에 켜는 쪽으로 바뀌었다. 잘림·안전 영역은 표본마다 그대로 본다. 장면 내용에만 적용하고, rv 자체 단계 칩·자막은 clip 으로 열리므로 프레임마다 대비를 그대로 잰다.
- 나타나는 순간 화면 가장자리에 걸린 상자는 밀려 들어오거나 카메라가 비춰 드러내는 것이지 갑자기 등장이 아니다. 단 이미 화면의 3% 이상이고 절반 넘게 보이면(가장자리를 몇 px 넘긴 카드가 한 프레임에 켜짐) 등장으로 센다. 화면 끝을 한두 프레임에 넘는 작은 3D 부품이 회귀 프로젝트 하나의 `POP_IN` 81줄 중 78줄이었고, 이 규칙 뒤 남은 3줄은 모두 실제로 한 프레임에 나타난 것이다.
- 회귀 프로젝트 둘을 같은 조건으로 잼(`rv check`, 옛 트리 대비): 프로젝트 A 684 s -> 701 s, 프로젝트 B 1322 s -> 1339 s. 판정 그대로, 놓친 변이 0.

## v0.1.1

### English

- `check_clearance` decides whether a mesh is closed once per geometry instead of once per moving part and pose. A scene with many moving open meshes spent most of its machine-collision time recounting the same edges; one measured 4 s window went from 185 s to 167 s. The lines it reports are byte-identical.

### 한국어

- `check_clearance` 는 메시가 닫혔는지를 움직이는 부품·자세마다가 아니라 기하(geometry)마다 한 번만 판정한다. 움직이는 열린 메시가 많은 장면에서 기계 충돌 시간 대부분이 같은 변을 다시 세는 데 들었고, 잰 4 s 구간 하나가 185 s 에서 167 s 로 줄었다. 적는 줄은 바이트까지 같다.

## v0.1.0

First public release.

### English

What rv does
- One command (`rv make`) turns `script.json` plus per-scene three.js modules into `out/<name>.mp4` (1080p30 H.264 + AAC 48 kHz, narration at −16 LUFS / −1.5 dBTP), `.srt`, a thumbnail, an optional share copy of at most 20 MiB (split at scene borders when a single file would fall below 1.2 Mb/s) and `CHECKS.md`.
- Narration with word timings via edge-tts, cached so unchanged scripts build offline. Highlights and steps are tied to spoken words (`KIT.wordT`).
- Fast loop: `rv still`, `rv scrub`, `rv board` (storyboard), `rv preview` (15 fps, 960 px). `rv make` only re-captures frames of scenes that changed.
- Optional cinema look (contact shadows, depth of field that follows the subject, bloom, color grade, motion blur), per-scene looks `cinema | relief | clean` with theme grouping and 2 s blends, dip transitions.
- Optional sound bed and effects synthesized locally, levels relative to the narration, automatic cues from rig motion.
- Scene kit: camera paths and shots (including declared action shots and tracking), cutaway, explode, labels kept in the safe area, a parametric human with site outfits, attach and seat contracts, process steps (valve, gauge, hatch, move, exhaust), number cards fed only from `sources.json`.

Checks (exit code 1 on any FAIL)
- Always: black frames and jumpy cuts, keyword sync, flicker, caption duration, share copy size and bitrate, legacy clearance, SRT, contact sheets. A crashed checker counts as `CHECK_ERROR`, never as a pass.
- With `"checks": "strict"` (otherwise reported only, counted in `RV_CHECKS_REFERENCE_FAILS`): text layout, occlusion of explained objects, theme hold, real white screens and brightness fatigue, loudness and audible bed/effects, attachment, human and machine penetration, seat contacts, homemade humans and outfit site, teleports, action without motion, camera moves on text changes and during transitions, unsourced numbers, subject sharpness in the render and in the share copy.
- Every check runs against a planted defect (mutation) and must report `MUTATION_CAUGHT` itself.

Also in this release
- `ACTION_MATCH`: each spoken action is matched to the named part it talks about, and that part has to move the way the words say (open, close, raise, lower, turn, vent). Unnamed targets fail as `action_unlinked`, wrong or missing motion as `action_mismatch`. Name parts with `KIT.process.*({name})` or `KIT.process.part`.
- `HATCH_COVER`: a hatch or door built with `KIT.process.hatch({frame})` must cover at least 80% of its frame opening in the closed pose. Hatch angles are measured from the pose the hinge had when it was made.
- `TEXT_TRANSITION`: text may not be on screen when a transition starts, appear during one, or appear too close before one to be read. The timeline places each scene's first line after the incoming transition, and never before 0 s even without `intro_s`. Step chips open after the incoming transition (the first scene has none).
- `check_sharp` moves samples that land inside a transition to the nearest time outside it, and draws the subject mask to an off-screen render target so it is never read back empty.
- `check_clearance` reports a lost WebGL context or a scene that never drew as `PAGE_ERROR` instead of passing. Machine rules use a triangle grid index and run several times faster with the same results. `rv check` writes per-check times to `out/CHECKS.timing.tsv`.
- `rv check` runs its check groups in parallel, up to `RV_CHECK_JOBS` at once (default 6; 1 runs them one by one as before), and joins their output in the original order, so `CHECKS.md` is byte-identical to a one-by-one run.
- Machine collision lines name the nearest named ancestor of each body in `[ ]`, so unnamed groups can be told apart. Verdicts and timing are unchanged.
- Machine collision depth is measured only inside closed meshes. An open shell (a hand-built arm mesh with gaps) no longer counts nearby points as "inside" and inflates the depth; crossing faces of open shells fail as an intersection instead. Thin closed plates, such as a 0.08 m truck-bed side wall, now count as machine parts.
- A body that already overlaps an open shell from the first frame and then moves deeper is caught again: for an open mesh a point counts as inside only when rays along all six axis directions agree, so a shell with one face missing is still not "inside". Face-crossing comparisons look only at triangles that reach the other body's box and cache each pair, which keeps the check time close to the previous release.
- Action words used to describe a noun ("everything that turns", "the turning equipment") are no longer read as commands; "while it turns" and similar time phrases still are.
- The eye-fatigue mutation fits its bright blocks to videos shorter than 86 s and reports `MUTATION_SKIP` with a reason when there is no room, so short videos no longer fail `rv check` as `MUTATION_NOT_CAUGHT`.

Known limits: a small wobble on top of a large zoom is not caught; shape-only theme changes on an already bright live scene are only caught by the theme count rules; machine collision ignores bodies under 0.8 m (declare them with `KIT.fx.attach`).

### 한국어

rv 가 하는 일
- 명령 하나(`rv make`)로 `script.json` 과 장면마다의 three.js 모듈에서 `out/<name>.mp4`(1080p30 H.264 + AAC 48 kHz, 나레이션 −16 LUFS / −1.5 dBTP), `.srt`, 썸네일, 20 MiB 이하 공유판(한 파일이면 1.2 Mb/s 아래가 되는 긴 영상은 장면 경계에서 나눔), `CHECKS.md` 를 만든다.
- edge-tts 나레이션과 낱말 시각. 대본이 그대로면 캐시로 오프라인 빌드. 강조와 단계는 말한 낱말에 묶인다(`KIT.wordT`).
- 빠른 고치기: `rv still`, `rv scrub`, `rv board`(콘티), `rv preview`(15 fps, 960 px). `rv make` 는 바뀐 장면 프레임만 다시 찍는다.
- 고르는 실사 그림(접촉 그림자, 주인공을 따라가는 피사계 심도, 블룸, 색 보정, 모션 블러), 장면 구성 `cinema | relief | clean` 과 테마 묶기·2초 섞기, dip 전환.
- 로컬에서 합성하는 배경음·효과음. 크기는 나레이션 기준, 리그 동작에서 효과음 큐 자동 추출.
- 장면 부품: 카메라 경로와 샷(선언한 동작 샷·따라가기 포함), 투시, 분해, 안전 영역에 갇히는 이름표, 현장 복식이 있는 사람 모델, 부착·좌석 계약, 공정 단계(밸브·계기·뚜껑·옮기기·배기), `sources.json` 에서만 값을 받는 숫자 카드.

검사(하나라도 FAIL 이면 종료 코드 1)
- 항상: 검은 프레임·튀는 컷, 키워드 맞춤, 깜빡임, 자막 보이는 시간, 공유판 크기·비트레이트, 간극(legacy), SRT, 접촉 시트. 검사기가 죽으면 `CHECK_ERROR` 로 FAIL.
- `"checks": "strict"` 일 때 판정(아니면 참고로 적고 `RV_CHECKS_REFERENCE_FAILS` 로 셈): 글자 배치, 설명 대상 가림, 테마 유지, 실제 흰 화면과 밝기 피로, 음량과 배경음·효과음 크기, 부착, 사람·기계 관통, 좌석 접촉, 자작 사람과 복식 현장, 순간이동, 동작인데 정지한 화면, 글자 바뀜·전환 중 카메라 이동, 출처 없는 숫자, 그림과 공유판의 주인공 선명도.
- 검사마다 일부러 넣은 결함(변이)을 돌려 검사기가 스스로 `MUTATION_CAUGHT` 를 말해야 한다.

이번 릴리스에 더해진 것
- `ACTION_MATCH`: 동작 말마다 말하는 이름 붙은 부품을 찾아, 그 부품이 말대로(열기·닫기·올리기·내리기·돌리기·배기) 움직였는지 본다. 대상이 없으면 `action_unlinked`, 안 맞으면 `action_mismatch` FAIL. 이름은 `KIT.process.*({name})` 이나 `KIT.process.part` 로 붙인다.
- `HATCH_COVER`: `KIT.process.hatch({frame})` 로 만든 뚜껑·문은 닫힌 자세에서 틀 구멍의 80% 이상을 덮어야 한다. hatch 각도는 경첩을 만들 때의 자세에서 잰다.
- `TEXT_TRANSITION`: 전환이 시작될 때 글자가 보이거나, 전환 안에서 뜨거나, 읽을 시간 없이 전환 직전에 뜨면 FAIL. 타임라인은 장면 첫 문장을 들어오는 전환 뒤에 놓고, `intro_s` 가 없어도 0 s 앞에 놓지 않는다. 단계 칩은 들어오는 전환이 끝난 뒤 열린다(첫 장면은 전환 없음).
- `check_sharp` 는 전환 구간에 걸린 표본을 가장 가까운 밖 시각으로 옮기고, 주인공 마스크를 화면 밖 렌더 타깃에 그려 빈 그림으로 읽히지 않게 한다.
- `check_clearance` 는 WebGL 문맥이 끊기거나 장면이 안 그려지면 통과 대신 `PAGE_ERROR` 를 적는다. 기계 규칙은 삼각형 격자 색인으로 같은 결과를 몇 배 빨리 낸다. `rv check` 는 검사별 시간을 `out/CHECKS.timing.tsv` 에 적는다.
- `rv check` 는 검사 묶음을 `RV_CHECK_JOBS` 개까지 동시에 돌리고(기본 6, 1 이면 예전처럼 하나씩) 원래 순서로 이어 붙여, `CHECKS.md` 는 하나씩 돌 때와 바이트까지 같다.
- 기계 충돌 줄은 짝 물체마다 가장 가까운 이름 있는 조상을 `[ ]` 로 적어 이름 없는 묶음끼리도 구별된다. 판정·시간은 그대로.
- 기계 충돌 깊이는 닫힌 메시 안에서만 잰다. 틈이 있는 열린 껍데기(손으로 만든 팔 메시)가 근처 점을 '속'으로 세어 깊이를 부풀리던 것을 고쳤고, 열린 껍데기끼리 면이 교차하면 교차로 FAIL. 0.08 m 적재함 옆벽 같은 얇은 닫힌 판도 기계 부품으로 센다.
- 처음부터 열린 껍데기와 겹쳐 있던 몸체가 더 파고드는 것을 다시 잡는다: 열린 메시는 여섯 축 방향 광선이 모두 '속'이라 할 때만 '속'으로 세어, 면 하나가 빠진 껍데기 안 공기는 여전히 '속'이 아니다. 면 교차 비교는 상대 상자에 걸치는 삼각형만 보고 짝마다 결과를 저장해 검사 시간이 앞 판과 비슷하게 유지된다.
- 명사를 꾸미는 동작 말("회전하는 모든 것", "돌리는 장비")은 더 이상 동작 지시로 읽지 않는다. "회전하는 동안" 같은 시간 표현은 그대로 동작.
- 눈 피로 변이는 86 s 보다 짧은 영상에 맞춰 밝은 덩어리를 줄이고, 자리가 없으면 이유와 함께 `MUTATION_SKIP` 을 적어 짧은 영상이 `MUTATION_NOT_CAUGHT` 로 `rv check` 에 떨어지지 않는다.

못 잡는 것: 큰 줌 위의 작은 출렁임, 이미 밝은 실사 위의 모양만 바뀌는 테마 전환(횟수 규칙으로만 막음), 0.8 m 미만 물체끼리의 충돌(`KIT.fx.attach` 로 선언).
