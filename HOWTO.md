# rv HOWTO: writing a project

rv 는 대본(JSON)과 장면 코드로 mp4 · 자막 · 썸네일 · 검사표를 한 번에 만든다. 설치와 명령 목록은 [README.ko.md](README.ko.md).
아래 예시는 시험용 합성 프로젝트 `tests/project` 의 장면 이름(`need`·`chamber`·`hold`·`map`)이나 중립적인 이름을 쓴다.

## 1. Project layout
```
my-project/
  script.json          # 대본: name, voice, "checks": "strict", "site": "construction"|"lab"|"office", scenes[], lines[{scene, text, keywords}]
  scenes/<장면>/module.js · deps.json
  shared/              # 장면들이 같이 쓰는 3D 세계(리그)
  sources.json         # 화면·말에 나오는 숫자의 출처표(없으면 숫자 관문이 꺼짐. 사실을 다루는 영상은 꼭 둘 것)
```

| 파일 | 할 일 |
|---|---|
| `script.json` | name · voice(edge-tts) · rate · scenes · lines[{scene, text("\|"=자막 조각), say?, keywords}] · say_replace · thumb_t |
| `scenes/<장면>/module.js` | `SCENES[이름] = {duration: DATA.timeline.modules[이름].duration, init, render(t), show}`. `window.HL` 에 지금 강조 중인 키워드를 적는다 |
| `scenes/<장면>/deps.json` | `{"scripts": ["../../shared/rig.js"], "assets": {}, "data": {}}` |
| `shared/` | 장면들이 같이 쓰는 모델(리그). 모든 자세는 t 의 순수 함수 |

작은 완성 예시: `tests/project` (장면 넷, 출처표, 공용 리그 `shared/workshop.js`).
새 프로젝트는 처음부터 `"checks": "strict"` 로 시작한다(5절).

### Rules for scene code
- `cam.lookAt()` 뒤에 `cam.updateMatrixWorld(true)`. 안 하면 이름표 `project()` 가 앞 프레임 카메라를 써서 자리가 틀리고 병렬 캡처 구간마다 달라진다.
- 관절 IK 는 그 관절 값을 0 으로 되돌린 뒤 역행렬을 잰다(앞 프레임 값에 기대지 않게).
- 강조 시각은 숫자로 적지 말고 `KIT.wordT(장면, 키워드)`.
- 화면 숫자는 모델에서 잰 값으로(예: 확대 상자의 간극은 풀린 자세의 끝점 − 축 표면).
- 정지 화면(`rv still`)을 보고 고친다. 테스트 통과만으로 끝내지 않는다.
- `KIT.label` 은 이름표를 안전 영역(위 130 / 아래 870 / 양옆 40 px) 안에 가둔다.

## 2. Edit loop (fastest first)
| 하고 싶은 것 | 명령 | 걸리는 시간(약 3분 영상) |
|---|---|---|
| 한 순간 정지 화면 | `rv still my-project 12.5 40.0` | 수 초 |
| 장면마다 콘티(시작·키워드·끝) | `rv board my-project [장면,장면]` → `out/board/board_<장면>.jpg` | 장면당 수 초 |
| 전환 훑기 | `rv scrub my-project 18.0 19.5` (0.2 s 간격 PNG) | 수 초 |
| 전체 흐름·말 맞춤 미리보기 | `rv preview my-project` → `out/<name>_preview.mp4` (실사 단계 끔, 15 fps, 960 px, 검사 없음) | 2~3 분 |
| 최종본 | `rv make my-project --discord` | 처음 약 10~15 분, 이후엔 바뀐 장면만 |
| 검사만 다시 | `rv check my-project` → `out/CHECKS.md` | 수 분 |
| 공유판만 다시 | `rv discord my-project [--min-kbps 1200]` (끝나면 검사까지) | 수 분 |

`rv make` 는 지난번과 달라진 장면의 프레임만 다시 찍는다(`build/frames/.scenes.json`). 공용 kit·look·전환을 바꾸면 전부 다시 찍는다. 처음부터 다시 하려면 `--full`.
`--from A --to B` 는 그 구간과 바뀐 장면(구간 밖 포함)의 프레임을 지우고, 찍기는 늘 전체 길이에서 빈 프레임만 한다. 새 길이 뒤 프레임은 늘 지운다.

### What rv make does
1. `lib/timeline.py`: edge-tts 문장 음성 + 낱말 시각 → `build/timeline.json`·`word_times.json`·`narration.json` (대본 그대로면 캐시라 오프라인)
2. `lib/build.py`: 장면 모듈 + `kit/scene_kit.js` + three r147 → `build/video.html` 한 파일
3. `lib/narration.py` → `lib/master.py` (loudnorm 2패스 −16 LUFS / −1.5 dBTP), `sound` 가 있으면 `lib/mix.py`
4. `lib/render.sh`: 헤드리스 Chromium 으로 `renderAt(t)` 프레임마다 찍기(기본 4 병렬, `--jobs N`) → H.264 → `check_flicker` → 걸린 프레임만 다시 찍기(최대 2번) → 다시 인코딩. GPU 가 드물게 덜 그린 프레임을 내는 경우가 있어 이 단계가 있다.
5. `lib/srt.py`, 썸네일(`thumb_t`, 기본 1.5 s), `--discord` 면 `lib/discord.sh`
6. 검사 → `out/CHECKS.md` (5절)

만들어지는 것: `out/<name>.mp4`(1080p30 H.264 High + AAC 48 kHz, 나레이션 −16 LUFS), `<name>.srt`, `<name>_thumb.jpg`, `<name>_discord.mp4`(≤ 20 MiB, 2패스), `CHECKS.md`, `sheets/`.

## 3. Looks, transitions and sound (script.json)
```json
"look": "cinema",
"scenes": [{"name": "chamber", "transition": {"type": "dip", "dur": 1.0, "depth": 0.85}}],
"sound": {"music": "synth:ambient", "auto_cues": true}
```
- `look`: 접촉 그림자(SAO) · 피사계 심도 · 블룸 · 색 보정(ACES·대비·채도·비네트·필름 결) · 모션 블러(셔터 안 시각 8개 평균). 렌더가 약 2배(프레임당 약 2.2배) 느려진다. 미리보기(`rv preview`)는 자동으로 끈다. 항목별 덮어쓰기: `{"preset": "cinema", "dof": {"k": 0.004}, "mb": {"samples": 8, "shutter": 1.0}, "msaa": 4}`. 이번 빌드만 끄려면 `RV_LOOK=off`.
- **초점은 주인공을 따라간다**: 장면이 `o.focus` 를 준 것 > `KIT.fx.focus(물체)` 로 고른 것(또는 `scene.userData.subject = 물체`) > 보이는 이름표 대상 > 화면 가운데를 덮는 가장 가까운 큰 물체(땅·바닥·방 같은 판과 `KIT.fx.prop` 은 빼고) > 카메라가 바라보는 점. 주인공 앞뒤 끝까지 1 px 안으로 또렷하게 조리개를 조인다. 헷갈리면 `KIT.fx.focus(물체)` 를 매 render 에서 부른다.
- 모션 블러: 벽이 있는 실내 장면은 셔터 1.0(돌아가는 고리 같은 주기 무늬가 카메라 이동에서 반짝이는 것을 막음), 바깥 장면(벽 없음, 또는 `"site": "construction"`)은 셔터 0.5 로 번짐 절반. `"site": "lab"|"office"` 는 실내로 본다.
- 공유판(`_discord`): 20 MiB 에 넣으면 영상 비트레이트가 1.2 Mb/s 아래가 되는 긴 영상(약 2분 넘게)은 `out/<name>_discord_part1.mp4` · `part2` … 로 장면 경계에서 나뉘고(조각마다 ≤ 20 MiB), 목록은 `out/<name>_discord_parts.json`. 올릴 때는 조각을 차례로. 바닥을 바꾸려면 `rv discord my-project --min-kbps 1500`. (한 파일 4분 = 0.6 Mb/s 이면 주인공 세부가 배경보다 먼저 뭉개진다.)
- 전환 `dip`: 장면 경계에서 어두워졌다 밝아짐. `cut` 이면 바로 넘어감.
- 소리: 배경음은 말 틈에서 말보다 15 LU 아래, 말할 때 6 dB 더 줄여(150/400 ms) 말보다 약 21 LU 아래. 크기는 말(나레이션 실측 LUFS) 기준이라 목소리가 바뀌어도 같은 느낌. 더 크게/작게는 `"music_lu": -12`(크게) · `-18`(작게), 말할 때 줄이는 깊이는 `"duck_db": 6`. 전체는 −16 LUFS · −1.5 dBTP, 줄기는 `build/stems/` 에 남아 검사가 읽는다.
- 효과음: `"auto_cues": true` (또는 `"cues": "auto"`) 면 장면 리그가 실제로 움직인 순간에 자동으로 나온다. 발이 땅에 닿을 때(footstep), 팔이 움직일 때(servo), 헤드를 잡거나 놓을 때(click), 도는 부품(드럼)이 보이는 동안(rotor, 장면 회전 속도대로), 숫자 카드가 나타날 때(tone). 뽑힌 큐는 `build/cues_auto.json`(큐마다 `why`). 손으로 더 넣으려면 `"cues": [{"t": 81.4, "sfx": "click", "gain_lu": -12}]`. `gain_lu` 는 말 대비 LU(예전 `gain_db`·`music_db` 절대값은 무시됨). 종류: click · footstep · servo · rotor · drone · tone · <wav>.
- 합성음은 모두 200 Hz~5 kHz 배음을 갖는다(이어폰·폰 스피커는 200 Hz 아래를 거의 못 냄). 배경·효과음은 로컬에서 합성하므로 라이선스 문제가 없다. 바깥 음악·효과음 파일을 쓰려면 라이선스(CC0 등)를 확인하고 프로젝트 출처표에 적은 뒤 `"music": "music/track.wav"`.

### Scene looks (scenes[].look = cinema | relief | clean), default cinema
`look` 을 안 적은 장면은 cinema 로 그려진다.
- **cinema (기본)**: 실제 현장에서 일어나는 것을 믿게 해야 하는 장면. 예: 로봇이 방에 걸어 들어옴, 부품을 5 mm 거리에서 붙잡음, 공구를 바꿔 끼움, 시설 전경.
- **relief (원리 설명 장면에만)**: 모양은 남기고 색·질감을 빼 주제만 도드라지게. 예: 측정 → 결과 → 다음 위치로 도는 루프 도식, 핵심 기술 목록, 두 방식 비교, 개념 지도. 사실 장면(기계가 실제로 하는 일)에는 쓰지 않는다.
- **clean**: relief 보다 더 빼서 방을 숨기고 바닥 그림자만. 부품 하나를 따로 보여 줄 때. 기본으로는 안 씀.
- 예시: `"scenes": [{"name": "need"}, {"name": "hold", "look": "relief"}, {"name": "map", "look": "relief"}]`. need 는 cinema, hold·map 은 부조.
- 고른 것은 `rv board` 콘티 칸마다 `[look=…]` 으로 보이니 렌더 전에 확인한다.
- 주제는 강조색 물체 + 장면이 `KIT.fx.focus(...)` 로 고른 것.
- **테마를 자주 바꾸지 않는다**: 같은 테마를 12초 이상 유지하고 어느 60초 구간에서도 전환은 2번 이하. 짧거나 몰린 relief/clean 구간은 빌드가 cinema 로 합치고 경고와 실제 계획을 출력한다. 관련 장면은 같은 `"theme_group"` 으로 묶는다. 테마는 그룹 경계에서 검은 화면 없이 2초간 섞인다(글자·카드도 같이). `rv board` 의 테마·유지 시간·`!MERGED` 와 `out/board/theme-plan.json` 을 확인.
- 한 화면에 읽을 것은 3덩어리 이하. 주제와 상관없는 장비·무늬는 부조·안개·심도로 흐리게.

### Numbers and sources (sources.json)
`numbers[]` 마다 `id` · `show` · `src` · `kind` (`fetched` | `design` | `label`) · `quote`. 나레이션에 표에 없는 숫자가 있으면 **빌드가 멈춘다**. 화면 숫자는 `KIT.info.numCard(ov, {id, i, caption, sub})` 로 표에서만 가져온다(출처 꼬리표 자동). 글자 4단은 `KIT.info.TYPE` (96 · 44 · 34 · 26).

## 4. KIT helpers (kit/scene_kit.js, kit/process.js)
| 하고 싶은 것 | 부품 |
|---|---|
| 카메라가 열쇠마다 멈추지 않고 흐르게 | `KIT.camSet(cam, KIT.camAt(K, t), {t, shake: 0.006})` (K = `[[t,[x,y,z],[lx,ly,lz],fov],…]`). 첫 열쇠는 장면 전환이 끝난 뒤(dip 절반·테마 섞기 2 s·크로스페이드)에. 그 전에는 카메라를 세움(4-0) |
| 말 박자에 맞춘 짧은 컷 | `SH = [{t: 0, K: K1}, {t: KIT.wordT(장면, "키워드") - 0.5, K: K2}]` → `KIT.shotAt(SH, t).state` |
| 전경 → 밀어 들어가기 → 돌아보기 | `KIT.shot.establish / pushIn / orbit / crane / lookback / follow / chain` |
| 벽을 걷어 안을 보이기(투시) | `cut = KIT.fx.cutaway(R, 벽 그룹)` → render 에서 `cut.set(1, [0,0,-1], 2.9)` |
| 부품을 벌려 보이기(분해) | `ex = KIT.fx.explode(헤드 그룹, [1,0,0])` → `ex.set(0.09 * KIT.win(t, a, b, 0.25))` |
| 크기 대비 사람(현장 복식) | `man = KIT.fx.human(scene, 1.75, 0xE4E8EA, {site: "lab"\|"construction"\|"office", suit: "cleanroom"})` → render 에서 `man.pose("stand"\|"walk"\|"point"\|"tablet"\|"sit", {t, target})`, `man.visible = true`. lab = 작업복·안전모·안전화·장갑, construction = 형광 조끼·안전모·작업화, office = 작업 점퍼. script.json `"site"` 가 기본값, 장면마다 현장이 다르면 `scenes[].site`. **사람은 반드시 KIT.fx.human 으로**: 구·원기둥·상자로 만든 사람 모양이나 이름이 operator·worker·person 같은 자작 물체는 check_human FAIL. 복식이 그 장면 현장과 다르거나 사람이 나오는데 현장이 어디에도 안 적혀 있어도 FAIL(5절). 앉힐 때는 `contacts.seat`(골반 아래끝)를 좌석 윗면에 맞추고 `KIT.fx.seat` 를 선언 |
| 이름표가 가리키는 설명 대상(가림 검사용) | `KIT.label(overlay, "Sensor", {target: sensorMesh})`. 생략하면 이름표 점에 있는 가장 작은 메시 |
| "이 부품은 저 지지대에 붙어 있다" | render 마다 `KIT.fx.attach(sensor, mount, {tol_mm: 2})` |
| (자동) 이름표가 가리키는 부품이 떠 있지 않게 | 선언 없이도 검사: 보이는 `KIT.label` 대상이 다른 실물 메시와 5 mm 안에 안 닿으면 FAIL(지지대나 로봇 손에 닿으면 통과). 개념 이름표가 엉뚱한 부품을 가리키면 `opts.target` 으로 실제 대상을 준다 |
| 앉은 운전자 | `KIT.fx.seat(person, {seat, floor, levers: [leftLever, rightLever]})` (Z-up 장면은 `up: [0,0,1]`) |
| 공정 단계 동작(밸브·계기 바늘·뚜껑·부품 옮기기·배기) | `KIT.process.valve/gauge/hatch/move/exhaust` + `KIT.process.steps(NAME, [...])` (4-1) |
| 주인공(초점) 지정 | `KIT.fx.focus(물체)` 또는 `scene.userData.subject = 물체` |
| 요소를 서서히 등장(기본 전환) | 3D: `KIT.fx.reveal(물체, KIT.win(t, a, b, 0.4))` (0 이면 숨김, 0→1 동안 원점에서 자람). 이름표·카드: `L.place(cam, p, dx, dy, KIT.win(t, a, b, 0.3))`, `el.style.opacity = KIT.win(t, a, b, 0.3)`. `obj.visible = t >= a`, `t >= a && t < b ? 1 : 0` 처럼 한 프레임에 켜면 `POP_IN` FAIL(5절). 페이드 중인 글자는 대비·격침 검사에서 빠지므로(`LAYOUT_FADE`) 페이드를 끄지 않는다 |
| 글자가 떠 있는 동안 빈 자리에서 대상이 움직이게(4-2) | 구도 `KIT.shot.free(NAME, {from, at: 대상, avoid: [카드]})` · 강조 `KIT.fx.pulse(대상, t, {on})` · 작동 `KIT.process.spin(부품, {turns})` · 흐름 `KIT.process.exhaust(부모, {path})` |
| 움직임으로 보이기 힘든 뜻(4-2) | 풍부한 정지 그림 `KIT.info.picture(ov, {src: "자산 이름", left, top, width, height})` → `show(KIT.win(t, a, b, 0.5))` |
| 앞을 스치는 기둥(깊이감) | `post = KIT.fx.prop(scene)` |
| 숫자 카드(값은 출처표에서만) | `KIT.info.numCard(ov, {id: "synthetic-size", i: 1, caption: "…"})` |

효과(fx)는 합성기가 장면마다 끄고 시작하므로 render 안에서 매번 켜야 한다(앞 장면 상태에 기대지 않음).
프로젝트가 자기 `shared/scene_kit.js` 에서 `window.KIT = {...}` 로 통째로 바꿔도 합쳐진다(같은 이름은 프로젝트 것, `KIT.fx` 등은 남음).

### 4-0. Camera: still for text, dynamic for actions
- 카메라는 대상·장소가 바뀔 때, 그리고 **동작 순간**(로봇팔이 닿음·부품이 빠짐·뚜껑이 열림)에 그 동작을 크게 보여 주려고 움직인다. 카드·이름표·자막이 나온다는 이유만으로 카메라를 밀거나 돌리지 않는다(check_motion 이 잡음).
- **동작 순간 줌·돌기(action 샷)**: 접촉 순간 이름표가 같이 떠도 되게 그 샷을 선언한다. `KIT.shot.declare(NAME, [{t: 0}, {t: KIT.wordT(NAME, "touches") - 0.5, end: KIT.wordT(NAME, "touches") + 0.5, kind: "action", subject: "probeA"}])` (움직이는 물체에 `probe.name = "probeA"`, 카메라는 그 구간에 `KIT.shot.pushIn(t0, t1, 접촉점)` 처럼 한 번 크게).
  - **부품으로(권장)**: `Z = KIT.shot.action(NAME, {t: KIT.wordT(NAME, "touches") - 0.5, dur: 1, from: {p, l, fov}, at: probe, keep: [probe, {at: probe, label: L.hand, dx: -40, dy: -150}], avoid: [[1380, 150, 1870, 710]]})` 를 init 에서(샷 끝 자세로 두고) 한 번, render 에서 `KIT.camSet(cam, Z.at(t, prevCam))`. 부품이 알아서 장면 전환(dip 절반·테마 섞기·크로스페이드)이 끝난 뒤 시작하고, 3 s 를 넘지 않고, 샷 앞뒤 카메라를 세우고, 줌 끝 뒤 0.6 s 안 자막 바뀜은 선언 끝을 늘려 덮고, `kind: "action"` 을 선언한다.
  - **구도**: keep(주인공·이름표 점·이름표 글자 상자)이 안전 영역(가로 40~1880, 세로 130~870 px) 안에 다 들어오고, 이름표 상자가 밀려나지 않고, avoid(카드·패널 화면 영역)와 안 겹치며, 주인공이 끝에 화면 가운데 절반 안에 남는 가장 가까운 거리로 다가가고 옆으로 맞춘다. 못 맞추면 다가가지 않고 `Z.fits = false`(콘솔 경고).
  - 따라가기는 `KIT.shot.track(NAME, {t, dur, subject: movingObject})` → `Z.at(t)` (kind follow 선언, 물체 가운데를 바라봄).
  - 통과 조건(하나라도 어기면 보통 글자마다 카메라처럼 FAIL): `end` 를 적고 샷 길이 ≤ 3 s · 이름 붙인 대상이 그 샷 동안 실제로 2 cm 넘게 움직임 · 대상 중심이 샷 내내 화면 안, 끝에 가운데 절반 안 · 카메라가 한 방향으로 크게(대상 화면 크기 1.25배 이상 줌인/아웃 또는 동작 점 둘레 15° 이상 돌기, 경로가 직선 거리의 1.5배를 넘는 왕복·출렁임은 안 됨) · 글자 ±0.6 s 창에서 샷 밖 카메라는 2 cm 안. 통과하면 `CAMERA_UI_EXEMPT kind=action` 줄에 대상 움직임·화면 위치·경로 비·줌·돌기 값이 찍힌다. 장면 전환 구간에서는 action 샷도 예외가 아니다.
  - 못 잡는 것: 큰 줌 위에 얹은 작은 출렁임.
- 자막·카드·이름표 변경 전후 0.6초에 카메라 위치나 시선점이 2 cm 넘게 움직이면 FAIL(크기·계속 흐름·박자 컷 상관없음). 일반 `KIT.shot.declare` 는 예외가 아니다. 실제로 움직이는 대상을 이름으로 적은 follow/explode 샷이 시선 오차 5 cm 안으로 추적할 때와 위 action 샷 조건을 다 지킬 때만 예외이고, 그 순간·건수는 `CAMERA_UI_EXEMPT` 로 따로 찍힌다. 글자가 바뀔 땐 카메라를 세우고 UI 만 띄운다.
- 장면 경계 컷과 장면 전환 구간(dip 앞뒤 절반·테마 섞기·크로스페이드)은 글자 규칙에서 세지 않고 같은 장면 안의 움직임만 센다. 뺀 글자 수와 구간은 `CAMERA_UI_TRANSITION` 으로 찍힌다. 주 카메라 = 화면 전체를 그리는 카메라. 작은 뷰포트·scissor 확대 창이나 렌더 타깃에 그리는 카메라는 빼고, 같은 장면에서 화면 전체 카메라가 바뀌면 `CAMERA_UI_SWITCH` 로 따로 찍는다(이동으로 안 셈).
- **전환 중에는 카메라를 세워 둔다**: dip 앞뒤 절반·테마 섞기(2 s)·크로스페이드 구간에서 그 장면 그림이 보이는 만큼(그림 무게 ≥ 0.2) 카메라 위치나 시선점이 2 cm 넘게 움직이면 글자와 상관없이 `transition_camera_motion` FAIL(`CAMERA_TRANSITION` 줄, 변이 `transglide`). 한 카메라 객체를 여러 장면이 같이 쓰면 새 장면 처음에 앞 장면 값에서 미끄러져 오기 쉽다. 장면 t = 0 에서 카메라를 제 자리에 바로 놓고, 움직임은 전환이 끝난 뒤 시작한다. 추적하는 follow/explode 샷만 예외다.
- 설명하는 동안 구도를 고정하고 그 부품을 작동·분해·강조한다: `KIT.fx.explode`, `KIT.process.*`, `KIT.fx.focus`.
- **설명하는 부품은 화면 가운데에**: 동작 말 구간(`ACTION_SPAN`)마다 그 말의 대상(`ACTION_MATCH` 가 찾은 부품, 없으면 그 구간의 action/follow 샷 subject)의 화면 중심이, 구간 앞 0.5 s(카메라가 가는 시간)를 뺀 표본의 절반 이상에서 가운데 30% 상자(|x−.5|, |y−.5| ≤ .15) 안에 있어야 `SUBJECT_FRAME` PASS. 고정 구도라면 그 구도에서 설명할 부품이 가운데 오게 잡고, 그렇지 않으면 `KIT.shot.action(NAME, {t, at: 부품, …})` 으로 동작 순간 그 부품으로 간다(부품이 샷 끝에 같은 가운데 상자 안에 오는 자리를 고름). 3분할 자리(x ≈ .33)는 가운데가 아니다.
- 카드만 바뀌는 구간은 `KIT.shot.declare(NAME, [{t: KIT.wordT(NAME, "structure"), kind: "ui-only", end: KIT.wordT(NAME, "next")}])` 로 선언하면 그 구간의 카메라 움직임은 아주 작아도 FAIL(검사 계약일 뿐, 카메라를 자동으로 고정하지는 않음).
- "말은 동작, 화면은 정지" 검사는 카메라 이동을 빼고 물체 자체의 움직임만 센다. 카메라를 움직여서는 통과할 수 없다.

### 4-1. Process steps tied to the script
카드에 "풀기·열기·옮기기·빼기" 같은 동작을 적었으면 실제 물체도 그 낱말에서 움직이게 한다. 문장 `keywords` 에 시작 구절을 넣는다.
```js
const valve = KIT.process.valve(scene, {turns: 1.5}), gauge = KIT.process.gauge(scene, {from: 0, to: 100, unit: "kPa"});
const open = KIT.process.hatch(lidPivot, {to: -Math.PI * .62}), close = KIT.process.hatch(lidPivot, {from: -Math.PI * .62, to: 0});
const transfer = KIT.process.move(part, [[0,.65,.5], [0,1.95,.5], [.9,1.95,.5], [.9,.65,.5]]), vent = KIT.process.exhaust(scene, {seed: 4390});
const steps = KIT.process.steps(NAME, [
  {word: "release the pressure", text: "1 Release", run: u => { valve.set(u); gauge.set(u); vent.set(u); }},
  {word: "open the lid", text: "2 Open and move", run: u => { open.set(KIT.clamp(u/.4, 0, 1)); transfer.set(KIT.clamp((u-.4)/.6, 0, 1)); }},
  {word: "pump it down", text: "3 Pump down", run: u => { close.set(KIT.clamp(u/.35, 0, 1)); const p = KIT.clamp((u-.35)/.65, 0, 1); valve.set(1-p); gauge.set(1-p); }}
], {overlay, left: 80, top: 260});
// render(t): steps.render(t);
```
단계는 그 낱말에서 시작해 다음 낱말까지 진행하고(마지막은 문장 끝까지), 카드는 같은 낱말 시각에 나타난다. 콜백에는 절대 자세를 넣는다(앞뒤로 탐색해도 같은 결과). 게이지 숫자는 동작 설명용이고, 실제 수치는 출처표와 맞춘다.

뚜껑·문은 **닫힌 자세로 만든다**: `KIT.process.hatch` 각도는 처음 hatch 를 만들 때 경첩이 가진 자세(lookAt 으로 돌린 것 포함)에서 경첩 자기 축으로 잰다. 0 = 만든 그대로 = 닫힘.

**말과 애니메이션 잇기**: 대본 동작 말의 대상 낱말이 부품 이름이어야 `ACTION_MATCH` 가 잴 수 있다. KIT.process 부품은 기본 이름(hatch 뚜껑·문·덮개·해치, valve 밸브·진공, exhaust 공기·가스·배기, gauge 게이지·압력, move 물체 name)이 있고 `{name: "챔버 문"}` 으로 더한다. 다른 물체는 `KIT.process.part(물체, {name: "조명", state: () => 0~1})` 로 등록한다(0 = 만든 그대로·닫힘·꺼짐, 1 = 열림·도착·켜짐). 문에는 **틀도 적는다**: `KIT.process.hatch(경첩, {axis: "y", to: 1.75, frame: 출입구테})`. 닫힌 자세에서 문이 그 틀 구멍의 80% 이상을 덮어야 `HATCH_COVER` PASS, frame 이 없으면 FAIL.

단계 칩(rv 화면 위 단계 줄)은 들어오는 전환이 끝난 뒤에 열린다. 첫 장면은 들어오는 전환이 없으니 첫 단계 0.4 s 전에 연다.

### 4-2. While text is on screen: keep the free part of the picture working
글자 카드·이름표·자막이 떠 있고 카메라가 서 있는 동안(4-0), 글자가 가리지 않은 화면에서 설명 대상이 뜻에 맞게 계속 움직여야 한다. 우선은 움직임이고, 움직임으로 보여 주기 힘든 뜻만 그 뜻을 풍부하게 그린 정지 그림으로 채운다. `check_motion` 의 `TEXT_MOTION`·`PICTURE` 가 잰다(5절).
```js
// init: 카드를 만든 뒤 — 카드에 안 가리고(되면 화면 가운데 30%) 대상을 두는 서 있는 구도 하나
const shot = KIT.shot.free(NAME, {from: {p: [-.6, 1.5, 2.1], l: [-.75, -.05, 0], fov: 40}, at: device, avoid: [cardA, cardB]});
const disc = KIT.process.spin(discMesh, {axis: "y", turns: 3, name: "디스크"});                    // 작동: 고르게 도는 부품
const flow = KIT.process.exhaust(discMesh, {path: [[.07, .03, 0], [.27, .03, 0]], name: "시료"});   // 흐름: 길을 따라 흐르는 화살표
const pic = KIT.info.picture(overlay, {src: "clinic", left: 1080, top: 170, width: 720, height: 480});  // deps.json "assets": {"clinic": "clinic.svg"}
// render(t):
KIT.camSet(cam, shot.at(t));                                   // 글자 구간 내내 같은 구도(카메라 고정)
disc.set(KIT.clamp((t - a) / (b - a), 0, 1));
flow.set(t >= a ? KIT.clamp((t - a) / (b - a), 0, 1) : 0);
KIT.fx.pulse(device, t, {on: KIT.win(t, a, b, 0.4)});          // 강조: KIT.fx.reveal 뒤에 부른다
pic.show(KIT.win(t, c, d, 0.5));                               // 정지 그림: 3 s 이상 다 보이게
```
- `KIT.shot.free(NAME, {from, at, avoid, keep})` → `{at(t), fits, centred}`: from 구도를 그대로 두거나 옆·위아래로만 옮겨(거리·화각 그대로) `at` 이 avoid(카드 요소, `{box}`, 또는 `[x0, y0, x1, y1]` px)에 안 가리고 안전 영역 안에 다 들어오는 자리를 고른다. 먼저 대상이 가운데 30% 상자 안(`SUBJECT_FRAME` 과 같은 상자)인 자리, 없으면 안 가리는 자리만. 둘 다 없으면 from 그대로 `fits = false`(콘솔 경고). 카드 크기는 처음 보이는 render 에서 재고 기억한다. `keep` 에는 움직이지 않는 대상만(옮겨 오는 부품은 처음 잰 순간 자리로 잠). `KIT.shot.action` 의 avoid 도 카드 요소를 받는다.
- `KIT.fx.pulse(obj, t, {on, period: 1.6, amount: .55, color})`: 부품 재질을 강조색으로 숨 쉬듯 밝힌다(모양·자세 그대로라 접촉 검사에 영향 없음). `on`(0~1, `KIT.win`)으로 서서히 켜고 끈다. render 마다, `KIT.fx.reveal` 뒤에 부른다.
- `KIT.process.spin(obj, {axis, turns, name})`: `set(u)` 가 만든 자세에서 자기 축으로 `u × turns` 바퀴를 고르게 돈다. 이름으로 `ACTION_MATCH` 가 잇는다(돌리기 = 10°).
- `KIT.process.exhaust(parent, {path})`: path(부모 좌표 꺾인 선)를 따라 흐르고 그 방향을 가리키는 화살표(시료가 우물로, 관 속 액체). path 가 없으면 예전처럼 위로 솟는 공기. path 가 있으면 기본 이름에 '흐름'.
- `KIT.info.picture(ov, {src, left, top, width, height, fit, caption})` → `{box, img, show(a)}`: 그림은 장면 `deps.json` 의 `"assets": {"이름": "파일.svg|png|jpg"}` 로 넣는다(영상 파일에 묶임). 글자(카드·자막)와 안 겹치는 자리에. rv 는 그림을 만들지 않는다: 장면 작성자가 그 뜻에 맞게 그리거나 출처·저작권이 분명한 그림을 넣는다.
- 판정(결과 보기 전에 정한 값): 글자 구간 = 한 장면에서 카드·이름표·자막이 떠 있고 카메라가 첫 프레임에서 2 cm 안에 서 있는 동안(장면 전환 구간 빼고, 글자 사이 0.5 s 이하 틈은 잇고, 2 s 이상만). 단계 칩·표지는 가리기만 하고 구간을 만들지 않는다. 구간마다 0.25 s 간격으로 3D 그림만(글자·카드 없이, 카메라 고정) 160×90 으로 찍고 그 구간에 뜬 모든 글자 상자(카드 바탕, 없으면 글자)를 가린다. 가려지지 않은 화소의 0.5% 이상이 마지막으로 움직인 표본보다 12/255 넘게 바뀌면 움직임. 움직임 없는 가장 긴 통이 2 s 이상이면 `TEXT_MOTION … FAIL`. 화면이 80% 넘게 가려지면 `EXEMPT covered`. 선언한 `ui-only` 구간(글자에 일부러 멈춤)과 풍부한 정지 그림이 떠 있는 표본은 멈춤으로 안 센다(구간 전체면 `EXEMPT declared_hold`·`EXEMPT picture`).
- 정지 그림 판정 `PICTURE`: 다 보이는(불투명도 ≥ .95) 시간 3 s 이상(너무 짧으면 어색함), 화면 8% 이상, 풍부함 = 그림의 30% 이상이 가장 많은 색과 다르고 색 칸(채널당 4 bit) 24개 이상이 각각 0.2% 이상(빈 판·글자만 있는 그림은 한 색이 거의 다고 칸이 적다). 하나라도 어기면 `FAIL short|small|poor`, 그런 그림은 글자 구간에서도 움직임 대신으로 안 센다.
- **글자와 물체가 같이 있을 때 가려진 느낌 없게**: 카드·패널이 설명 대상이나 움직이는 물체의 보이는 화소 10~90% 를 덮으면(가장자리에서 잘려 보임) `check_layout` 이 `cut` 으로 잡는다(5절). 카드는 `KIT.info.clear(카드, {from: 그 구간 카메라 {p, l, fov}, objects: [물체…]})` 를 init 에서(물체를 그 구간 자세로 놓고) 불러 물체들의 화면 상자(각 변 10% 넓힘)와 안 겹치는 자리(지금 자리 → 안전 영역 네 구석 → 위 가운데)로 옮기거나, 대상을 `KIT.shot.free` 로 카드 밖에 둔다. 돌거나 떠다니는 무리는 모두 objects 에 넣는다. 일부러 카드 뒤에 깔은 배경 장식은 `KIT.fx.decor(물체)` 로 선언하면 빠진다. 정지 그림 위에 카드가 2% 넘게 겹쳐도 `cut`.
- 보기: `examples/text-motion`(장면 하나. `scenes/device/mode.json` 이 `{"mode": "still"}` 이면 같은 장면을 부품 없이 — FAIL, `"kit"` 이면 위 부품으로 — PASS).
- 못 잡는 것: 움직임이 뜻과 맞는지(아무거나 돌려도 통과), 그림이 글의 뜻을 그렸는지. 화면 0.5% 넘게 바뀌면 작은 깜빡임도 움직임으로 센다 — 뜻은 사람이 본다.

## 5. Reading CHECKS.md
하나라도 FAIL 이면 `rv make`·`rv check` 종료 코드 1. 마지막 줄이 `RV_CHECKS PASS` 또는 `RV_CHECKS FAIL`.

### Always-on checks
- 규격(ffprobe), `check_cuts` 검은 프레임·튀는 컷(밝기 급변 ±12, 장면이 선언한 의도 컷은 뺌), `sync_check` 키워드마다 강조가 낱말 시각 ±0.5 s, `check_flicker` 한두 프레임 튀었다 돌아오기(8x8 칸, 원본·공유판 둘 다), 공유판 크기 ≤ 20 MiB(= 20971520 B, 조각마다)와 조각 비트레이트 바닥, `check_captions` 자막 조각마다 ≥ 0.4 s 보임, `check_clearance --rules legacy` 장면이 `window.CLEAR` 를 적을 때 매 프레임 끝점과 도는 부품 표면 사이 부호 있는 거리(< 0 파묻힘 FAIL, 붙잡는 구간 5.00 ± 0.1 mm), SRT 큐 수, 접촉 시트(키워드 +0.3 s, 장면 경계 −0.4~+0.4 s 0.2 s 간격).
- 검사기가 죽으면(Traceback·페이지 오류) 그 검사는 통과가 아니다: `CHECK_ERROR` 로 적고 strict 여부와 상관없이 판정 FAIL.

### Mutation lines
검사마다 일부러 결함을 넣은 판(변이)을 한 번 더 돌린다. 낱말 시각 +1.2 s, 가운데 프레임 검게, 작은 자리 깜빡임, 목표 간극 −5 mm, 이름표 겹치기, 글자색 = 바탕색, 설명 대상 위 불투명 카드, 흰 블록 네 번, 밝은 화면 피로, 테마 하드 컷, +12 dB, 배경음 −20 dB / +15 dB / 120 Hz 아래만, 효과음 −25 dB, 부품 20 mm 이상 이탈, 사람 100 mm 침하, 자작 사람, 복식 현장 바꾸기, 접촉점 삭제, 잘못된 인체 부위, 1 m 순간이동, 글 변경 때 카메라 이동, 전환 구간 카메라 0.3 m 미끄러짐, 동작 구간 3D 정지, 글자 구간 화면 멈춤, 출처 없는 숫자, 초점 빗나감(거리 3배), 0.3 Mb/s.
변이는 한 번이라도 잡히면 통과이므로, 프레임을 차례로 도는 변이(부품 이탈·사람 침하·이름표 겹치기·글자색·불투명 카드)는 처음 잡힌 프레임에서 멈춘다. 본 검사는 늘 모든 프레임을 잰다. 변이 줄 `MUTATION_CAUGHT` 은 검사기가 제대로 일한다는 뜻이다. 검사기 출력이 스스로 `MUTATION_CAUGHT` 를 말해야 하고, 종료 코드 1 만으로는 안 친다. `MUTATION_NOT_CAUGHT` 가 나오면 도구 버그이니 이슈로 알린다. 대상이 없는 변이는 `MUTATION_SKIP` 으로 넘어가고 실패로 세지 않는다(예: 효과음 큐 0개면 `SFX_MUTATION SKIP no cues`, 동작 부품을 `KIT.process.part`·`steps` 의 run 콜백으로만 움직여 거꾸로 돌릴 `KIT.process` 손잡이가 없거나 손잡이가 말에 이어진 부품에 없으면(배기는 거꾸로 돌려도 똑같아 세지 않는다) `ACTION_MUTATION SKIP`). 손잡이가 말에 이어져 있는데 못 잡으면 여전히 `MUTATION_NOT_CAUGHT` 다.
부품 이탈 변이는 attach 대상의 세계 좌표 경계 상자를 지지대 밖으로 가장 짧게 빼는 축 방향으로 옮겨, 지지대와 허용 간극보다 20 mm 더 떨어뜨린다. 소매처럼 지지대를 감싼 부품도 실제로 떨어진다. 자동 이름표 대상은 기존처럼 +Y 20 mm 이동 뒤 표면 접촉이 끊긴 대상만 쓴다. 이탈시킬 대상이 없고 본래 결함·페이지 오류도 없으면 이유 줄과 정확히 `MUTATION_SKIP` 한 줄을 출력하고 종료 0이다.

### strict mode
아래 새 검사들의 지적은 script.json `"checks": "strict"` 일 때 판정에 들어간다. 아니면 `참고: checks=strict 아님` 으로 적기만 하고 CHECKS.md 끝에 `RV_CHECKS_REFERENCE_FAILS n` 으로 건수를 모은다. **새 프로젝트는 처음부터 `"checks": "strict"`**. 아니면 사람·전환 카메라·테마 피로 지적이 있어도 `RV_CHECKS PASS` 가 나온다. 변이는 strict 와 상관없이 늘 잡혀야 한다.

### Common failures and fixes
- `check_layout` 글자 겹침·잘림·대비·안전 영역 → 표에 시각·글자·규칙이 나온다. 그 시각을 `rv still` 로 보고 고친다. 겹침 줄은 상대 요소를 id·태그·크기로 찍는다.
- `check_layout` 가림 → 이름표가 가리키는 대상이 다른 물체·불투명 카드에 가려 50% 아래만 보이면 FAIL. 카메라를 옮기거나 카드를 비킨다. 세부 규칙:
  - 설명 대상 = 이름표 대상 · `KIT.fx.focus` · 강조색 메시 · 초점 주인공.
  - 카드는 배경 알파×불투명도 ≥ 0.5 면 가림. 카드 하나가 대상의 보이는 화소 40% 이상을 덮어도 FAIL.
  - 자막 구간은 `--from A --to B --every 0.10` 으로 훑는다.
  - rv 자체 자막 상자·단계 칩·fade 덮개는 카드가 아니다. 이름 없는 카드는 태그·장면·크기·배경색으로 찍는다.
  - 이름표·초점 없는 강조색 부품은 장면이 절반 넘게 보여 줄 때만 설명 대상. 이름표 없는 강조색·`KIT.fx.focus` 자동 대상은 장면이 스스로 가리거나 화면 50 표본 화소 미만이면 뺀다(보이는 크기로 그려진 강조 대상을 카드가 덮으면 FAIL). 50 화소 바닥은 이름표 대상만 면제다.
- `check_numbers` 출처 없는 숫자 → `sources.json` 에 출처를 넣거나 숫자를 뺀다. 나레이션에 출처 없는 숫자가 있으면 빌드부터 멈춘다.
- `check_flicker` 한두 프레임 튐 → 같은 시각을 두 번 찍어 같으면 장면 문제, 다르면 GPU 우연(rv 가 자동으로 다시 찍음).
- `check_audio` 음량·찢어짐. `--stems` (sound 가 있을 때) 배경음·효과음이 들리는지 → 말 틈 배경음 −22~−9 LU, 말할 때 −30~−14 LU, 200 Hz 위에 에너지, 큐마다 −26~−3 LU. 너무 작으면 `music_lu`/`gain_lu` 를 올리고, 너무 크면 내린다. 효과음 큐가 0개(리그도 숫자 카드도 없는 장면만)면 큐 검사는 `SFX_CHECK 실제 SKIP`.
- `check_sharp` 주인공 선명도 → 결 충실도(1.5 px 가우스 뒤 라플라시안 상관)로 같은 파이프라인끼리 잰다.
  - 그림 단계: 심도·모션 블러만 끈 같은 그림과 주인공 결 충실도 ≥ 0.80. 걸리면 초점이 빗나간 것이다.
  - 공유판: 원본(crf 18) 대비 충실도 < 0.82 이면 FAIL. 또는 배경보다 0.10 넘게 먼저 뭉개지고 결 에너지도 배경보다 0.01 넘게 더 잃으면 FAIL. 도는 주인공처럼 매 프레임 바뀌는 대상은 결이 그대로여도 상관이 낮게 나오므로 에너지 손실 없이는 차를 안 센다. 주인공 마스크는 화면에 보이는 부품만(숨김·불투명도 0.5 미만인 `KIT.fx.focus` 부품은 안 셈).
  - 잴 시각이 전환 구간(dip 앞뒤 절반·테마 섞기·크로스페이드) 안에 걸리면 가장 가까운 전환 밖 시각으로 옮겨 잰다. 어두워지는 중간 화면을 흐림으로 세지 않는다.
  - 주인공 마스크는 화면 밖 렌더 타깃에 그려 읽는다. 기본 버퍼를 그림으로 읽으면 일부 GPU 에서 가끔 빈 그림이 나와 면적 0 으로 잘못 재기 때문.
  - 공유판이 걸리면 `rv discord my-project --min-kbps 1500` 처럼 바닥을 올려 더 나눈다. 주인공이 엉뚱한 물체면 `KIT.fx.focus` 로 지정.
  - 실내 장면의 빠른 카메라 이동은 모션 블러(셔터 1.0)로 주인공이 번져 FAIL 이 날 수 있다. 카메라를 늦추거나 컷으로. 초점은 보이는 이름표 대상(`KIT.label` 의 target 또는 이름표 점 아래 물체)을 먼저 따라간다.
- `check_clearance --rules mesh` → attach 로 선언한 부품이 뜨거나(틈 > tol) 파묻힘, 사람 몸이 기계에 10 mm 넘게 관통, 앉은 자세 엉덩이·발·손 접촉이 어긋나면 FAIL. 출력 `CLEARANCE_TARGETS attach=… seat=… auto=…` 가 찾은 대상 수.
  - WebGL 문맥이 끊기거나 장면이 한 번도 안 그려지면 아무것도 못 잰 것이다: `PAGE_ERROR` 로 적고 통과로 치지 않는다.
  - 기계 규칙은 삼각형 격자 색인으로 빠르게 잰다(결과는 전체 순회와 같음). 비교하려면 페이지에서 `window.__rvClearanceNoGrid = true` 로 옛 경로.
  - 기계끼리(버킷·붐 ↔ 트럭 적재함, 로봇 ↔ 로봇·받침): 장면 바로 아래 묶음 중 단단한 메시 3개 이상·가장 긴 변 0.8 m 이상·15 m 이하인 몸체끼리 처음 잰 깊이보다 20 mm 넘게 더 파고들면 `machine penetration` FAIL. 처음부터 꽂혀 있던 것(받침에 꽂힌 헤드)은 안 센다. 흙·짐(이름 soil·load·grain·dirt·흙·모래)은 몸체 부품에서 뺀다. 들고 다니는 0.8 m 미만 공구·헤드는 attach 로 선언해 부착 규칙이 본다. 기계를 서로 붙여 세울 때는 몸체 폭만큼 띄운다.
  - 사람 관통은 `KIT.fx.human` 뿐 아니라 계약 없는 사람 모양(이름 operator·driver·person·worker·운전자·사람, 또는 구 머리+캡슐·상자 몸)도 잰다. 머리는 온전한 구만 사람 머리로 보고, 흙·짐·더미 이름 묶음은 사람이 아니다.
- `check_human` → 사람 부품의 부위 이름·자세·접촉점 계약(검사기들이 읽는 것)이 깨지면 FAIL.
  - `HUMAN_HOMEMADE t=… scene=… object=… via=shape|name`: KIT.fx.human 이 아닌 사람. 둥근 머리 아래 몸·팔다리가 있는 0.3~2.5 m 모양 또는 사람 이름(operator·driver·person·human·worker·man·운전자·사람). 고치는 법: 그 물체를 지우고 `KIT.fx.human(scene, 1.75, {site})`.
  - `HUMAN_SITE … outfit=<입은 현장> expected=<장면 현장>` 또는 `undeclared`: 복식 현장이 `scenes[].site`(없으면 script.json `site`)와 다르거나 어디에도 안 적힘(안 적으면 KIT.fx.human 이 construction 을 입힘). `HUMAN_COUNT rvHuman=N homemade=M` 은 찾은 수. 변이 `homemade`·`site` 는 사람이 없는 프로젝트에서도 늘 돈다.
- `check_cuts --theme` → 테마 유지 시간(12 s)·전환 횟수(60 s 에 2번 이하)·전환 중 밝기 튐.
- `check_cuts --theme --mp4` → `cinema` 로 지정해도 실제 화면이 희게 보이면 전환으로 세어 같은 규칙을 적용한다. 흰 화면 = 96×54 로 줄여 min(RGB) > 170 이고 RGB 폭 < 30 인 화소가 25% 넘음(4 fps, 170~200 회백색 근접 화면도 흰 화면). 흰 화면 사이나 영상 앞뒤 끝의 2 s 보다 짧은 흰 화면이 아닌 구간이 프레임마다 밝기 튐 한도(12/255) 안에서 부드럽게 바뀌면 검정 dip·페이드로 보고 전환으로 세지 않는다(`THEME_DIP` 줄). 딱 끊기는 구간은 그대로 전환이다. 그래서 2 s 보다 짧은 부드러운 끊김이 잦은 영상은 `THEME_FATIGUE` 로만 막는다. 계획표 검사와 실제 영상 검사를 둘 다 통과해야 한다.
  - `THEME_FATIGUE`: 위 수치를 지켜도 눈이 피곤한 전환을 밝기로 잰다. 화면 평균 밝기 L = 0.5 + 200×(선형 휘도 평균) cd/m²(200 nit 화면 가정), 눈의 적응 = log L 을 따라가는 지연(밝아질 때 5 s, 어두워질 때 20 s). (a) 눈이 화면과 3배 넘게 어긋난 시간이 영상의 15% 초과, (b) 어느 60 s 에서든 25 s 초과, (c) 밝은 구간(L > 80 cd/m² 로 들어가 L < 64 에서 나옴, 2 s 보다 짧은 끊김과 앞뒤 끝의 2 s 보다 짧은 페이드(옆 밝은 구간이 2 s 이상일 때)는 합침, 연한 파랑 같은 밝은 유색 화면도 셈)이 12 s 유지·60 s 에 2번을 어기면 FAIL. 어두운 실사 사이에 흰 화면을 넣으면 (a) 가, 밝은 색 화면을 자주 넣으면 (c) 가 걸린다. 고치는 법: 밝은 구성은 한 덩어리로 묶고(`theme_group`) 어두운 장면 사이에 짧게 끼우지 않는다.
  - 못 잡는 것: 이미 밝은 실사(흰 화면과 밝기 비 약 2.3~2.6) 위의 모양만 바뀌는 전환은 밝기 부하가 아니라 이 판정에 안 걸린다. 테마 수치 규칙과 (c) 로만 막는다.
- `check_motion` 관통·순간이동.
- `check_motion` 동작어 구간(`ACTION_SPAN`) → 말·카드는 동작인데 3D 가 안 움직이거나, 같은 구도에서 카드만 바뀌는 2.5초 이하 반복 컷이면 FAIL. 4-1 처럼 묶는다.
- `check_motion` 말과 애니메이션 맞춤(`ACTION_MATCH`) → 동작 말 구간마다 그 말의 대상(낱말 또는 같은 절 앞 25자 안의 부품 이름)을 찾는다. 없으면 `action_unlinked` FAIL(부품에 이름을 붙인다). 찾으면 그 대상이 말대로 움직였는지 본다: 열기·풀기·켜기·옮기기·빼기·끼우기·꽂기·넣기 = 상태 0.05 이하에서 0.95 이상까지, 닫기·덮기·잠그기·끄기 = 0.2 넘게 내려 0.05 이하에서 멈춤, 올리기·내리기 = 높이 ±2 cm, 돌리기 = 10°, 공기 빼기 = 구간 안에 보임. 시작·끝은 말 구간 안에서 같은 방향으로 가장 크게 움직인 구간으로 잰다(한 문장 안에서 열었다 다시 닫아도 됨). 대상이 안 움직이면(다른 물체만 움직여도) `action_mismatch` FAIL. 변이 `actreverse`.
- `check_motion` 갑자기 등장(`POP_IN`) → 화면 요소(장면 overlay 의 카드·이름표·그림, 보이는 3D 메시)가 서서히 나타나기·밀려 들어오기·카메라가 비춰 드러내기 없이 두 프레임 안에(30 fps) 자기 최대 무게(화면 넓이 비 × 불투명도, 다음 0.5 s 최대)의 5% 이하에서 50% 이상으로 뛰면 FAIL. 같은 프레임에 튀는 요소는 한 줄(`element=` 가장 큰 것 `+n more`)이고 합이 화면의 0.2%(64×64 px) 이상일 때만 셈다. 장면 첫 프레임·장면 전환 구간·선언한 컷(`SHOTCUTS`)·카메라 컷(한 프레임에 0.25 m 또는 8° 넘게 뛴)은 `EXEMPT` 로 따로 찍힌다. 고침: 4절 표 '요소를 서서히 등장'. 배경 없는 맨 글자(숫자 읽음값·글 한 줄)는 자막처럼 세지 않는다(상자·그림·3D 만). clip-path inset·overflow 가림은 보이는 부분만 잰다. 변이 `popin`(떠 있던 상자 하나를 0.6 s 감췄다 한 프레임에 켬). 못 잡는 것: 가려진 곳(닫힌 함 안)에서 켜지는 부품도 잡힘(가림은 안 봄), SVG 선을 `stroke-dashoffset` 으로 그리기·3D 선 `setDrawRange` 는 상자 크기가 그대로라 한 프레임 등장으로 보일 수 있음. 가는 선·곡선은 상자(bbox) 넓이로 무게를 재서 실제보다 크게 잡힌다(선이 이미 보이는데 상자가 바뀌면 등장으로 셀 수 있음). 나타나는 순간 화면 가장자리에 걸린 상자는 작거나(화면 3% 미만) 절반 넘게 가려졌으면 밀려 들어오기로 보고 세지 않는다 — 크고 거의 다 보이는 카드를 가장자리에 걸쳐 한 프레임에 켜면 그대로 FAIL.
- `check_motion` 설명 대상 화면 가운데(`SUBJECT_FRAME`) → 4-0 '설명하는 부품은 화면 가운데에'. 줄에 대상·가운데 비율·평균 화면 위치(`mean_x`, `mean_y`, 0~1)가 나온다. 대상을 못 찾으면 `SKIP`(그때는 `ACTION_MATCH` 가 `action_unlinked` 로 잡음). 변이 `offcenter`(설명 구간에 카메라 25° 돌림). 동사 목록은 '바꿔 끼웁니다'·'교체합니다'·'갈아 끼우고' 도 읽는다(끼우기 = 상태 0→1).
- `check_layout` 카드에 잘림(`cut`) → 설명 대상(이름표 대상·`KIT.fx.focus`·강조색·초점 주인공)과 **움직이는 물체**(같은 페이지에서 0.5 s 앞과 비교해 자기 행렬이 바뀐 가장 바깥 물체, 장면 메시 절반 넘게 담은 세계 통째·`KIT.fx.decor` 는 빼고, 1/4 해상도 50 화소 이상)를 한 카드가 보이는 화소의 10~90% 덮으면 FAIL. 줄에 `card_coverage`·`card=`·`source=moving|focus|…`. 움직이는 물체끼리 3D 로 가리는 것은 괜찮다(움직이는 물체에는 옛 50%·40% 규칙을 안 줌). 고침: 4-2 '가려진 느낌 없게'.
- `check_layout` 페이드 중 글자(`LAYOUT_FADE`) → 재는 순간 불투명도가 1 보다 작고 0.2 s 앞이나 뒤와 0.05 넘게 다른 글자는 대비·격침을 그 순간에 재지 않고 쉬는 프레임에서 잰다(잘림·안전 영역은 그대로). 계속 반투명한 글자는 그대로 재고 잡는다.
- `check_motion` 글자 옆 움직임(`TEXT_MOTION`)·정지 그림(`PICTURE`) → 4-2. 줄의 `still=…s@a..b` 가 멈춘 때, `[x…,y…:'글자']` 가 가린 자리(화면 비 0~1), `moved_at` 이 움직인 자리, `subjects=[이름@x,y(covered)]` 가 대상의 화면 위치다(`(covered)` 면 글자에 가려짐). 고침: 그 구간에 대상을 빈 자리에 두고(`KIT.shot.free`) 강조·작동·흐름을 붙이거나, 움직임으로 보이기 힘든 뜻이면 풍부한 정지 그림(`KIT.info.picture`), 글자에 일부러 멈추는 구간이면 `ui-only` 선언. 변이 `textstill`(통과한 글자 구간 하나를 첫 순간으로 멈춤).
- `check_motion` 닫힘 자세 덮음(`HATCH_COVER`) → 만든 자세(닫힘)에서 문이 `frame` 구멍 약 200 점의 80% 이상을 덮는지(법선 ±0.5 m) 본다. 덜 덮거나 frame 이 없으면 FAIL. 장면 좌표 부호를 틀려 닫혀도 출입구 옆에 있는 문을 잡는다.
- 여러 장면에 늘 같은 표지(예: "개념도")를 달 때는 장면마다 따로 붙이지 말고 script.json `"badge": {"text": "…", "scenes": ["need", "hold"]}` 로 한 번만 적는다(`scenes` 를 빼면 모든 장면). rv 가 장면 위 공용 자리(오른쪽 위)에 하나만 그려서 적힌 장면끼리의 전환에서는 그대로 서 있고(`TEXT_TRANSITION` 에 안 잡힘), 안전 영역 대신 공용 표시로 잰다. 장면마다 붙인 같은 글자는 장면과 함께 사라졌다 다시 나타나므로 전환마다 잡힌다.
- `check_motion` 글자 중 전환(`TEXT_TRANSITION`) → 전환이 시작될 때 글자가 보이거나, 전환 안에서 새 글자가 뜨거나, 전환 직전 읽을 시간(1.5 s 이상, 글자 수 × 0.15 s + 0.25) 안에 글자가 뜨면 FAIL. 단계 칩도 센다. 장면 끝 글자는 전환 전에 내리고, 장면 첫 글자는 전환이 끝난 뒤에. `rv timeline` 이 장면 첫 문장을 들어오는 전환 끝 + lead 뒤로 자동으로 늦추고, 더 늦추려면 `scenes[].lead_s`. `intro_s` 가 없어도 첫 문장은 0 s 앞에 놓이지 않는다. 변이 `textcut`.
- `check_motion` 전환 구간(`CAMERA_TRANSITION`) → dip 앞뒤·테마 섞기·크로스페이드 동안 보이는 장면의 카메라가 2 cm 넘게 움직이면 `transition_camera_motion` FAIL(장면·구간·m 가 줄에 나옴). 장면 t = 0 에서 카메라를 제 자리에 놓고 움직임은 전환 뒤로(4-0).
- `check_motion` 글자마다 카메라(`CAMERA_UI`, `text_camera_motion`) → action 샷이면 `reason=... invalid action: ...` 에 무엇이 모자랐는지 나온다: `action shot needs subject and end` · `action shot 3.600s > 3.0s` · `camera moves …m outside the action shot` · `subject_motion`(≤ 0.02 m 면 대상이 안 움직임) · `frame_offset`(샷 내내 > 1.0 이면 대상이 화면 밖) · `frame_end`(샷 끝 > 0.5 면 가운데 절반 밖) · `path_ratio`(> 1.5 면 왕복·출렁임) · `zoom`/`orbit`(1.25배·15° 미만이면 작게 민 것). 통과는 `CAMERA_UI_EXEMPT kind=action`(4-0).

## 6. Optional: AI director scores
`python3 lib/director.py my-project --html build/video.html --rubric <rubric.md> --out out/director [--before old.html]` → 장면마다 3장을 외부 비전 모델(codex CLI 가 있어야 함)에 그림만 보내 채점표 점수와 고칠 점을 받는다. 도구 코드·대본 파일은 안 보낸다. `--before` 면 전후를 섞어 눈가림으로 비교한다.

## 7. Splitting work by scene
여럿이 장면을 나눠 만들 때: 한 사람이 `lib/timeline.py` 를 한 번 돌리고, 각자 `ONLY=<장면> VIDEO_HTML=<임시>/x.html python3 lib/build.py <프로젝트>` 로 자기 장면만 실은 html 을 만들어 `lib/still.py`·`lib/sync_check.py --scene` 으로 본다(sync_check 는 html 안 `window.DATA` 를 읽음).

## 8. When stuck
도구 고장(검사기 오류, 장면 탓이 아닌 빌드 실패, `MUTATION_NOT_CAUGHT`)이나 새 기능 요청은 GitHub 이슈로 남긴다. `CHECKS.md` 와 rv 버전(`VERSION`)을 같이 붙인다.
