# rv releases

## How releases work

Every release is a git tag `vX.Y.Z` (Z for fixes, Y for features). Each tag gets a note here and on the GitHub release page, in Korean and English. Install a release with `scripts/install.sh` and check it with `scripts/verify.sh` (see [README.md](README.md) and [MAINTAINING.md](MAINTAINING.md)).

릴리스는 git 태그 `vX.Y.Z` 하나다(고침 = Z, 기능 = Y). 태그마다 이 파일과 GitHub 릴리스 페이지에 한국어·영어 노트를 쓴다. 설치는 `scripts/install.sh`, 확인은 `scripts/verify.sh`.

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
