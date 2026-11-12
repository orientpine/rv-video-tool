# rv releases

## How releases work

Every release is a git tag `vX.Y.Z` (Z for fixes, Y for features). Each tag gets a note here and on the GitHub release page, in Korean and English. Install a release with `scripts/install.sh` and check it with `scripts/verify.sh` (see [README.md](README.md) and [MAINTAINING.md](MAINTAINING.md)).

릴리스는 git 태그 `vX.Y.Z` 하나다(고침 = Z, 기능 = Y). 태그마다 이 파일과 GitHub 릴리스 페이지에 한국어·영어 노트를 쓴다. 설치는 `scripts/install.sh`, 확인은 `scripts/verify.sh`.

## Unreleased

### English

- `KIT.fx.human` act(): a cup or bottle gripped with the defaults (no `at`, `normal` or `fingers`) is held the way a person holds it: the palm on its side across the reach, the fingers running on from the forearm and round it, the thumb up, the hand leaning with the arm. The wrist stays nearly straight, at most 35 degrees in every frame of the muscle-fabric kitchen, bulky and shelf scenes, where the old default bent it 85 to 133 degrees and put the whole roll of the hand into the wrist (#62: the wrist joint's whole turn, 135 to 177 degrees in those grips, is now 42 to 50; setting a mug on a high shelf still turns the hand about 150 degrees in the wrist, the arm has no forearm twist yet). Every finger closes on the cup whichever way its handle faces: a finger that would cross the cup and end clear now stops on it, the thumb picks the opposed pose that reaches the cup, and the palm moves round the cup when the handle is in the way. A carried mug waits in front of the waist with the elbow bent, and the empty hand goes back to hang at the side after letting go.
- Setting a mug on a shelf above the shoulder with `place` defaults: the person stands at an arm's reach beside the board instead of under it or with their back to the camera, lifts the mug in front of the board's edge with a near-level hand, slides it over the top and lets go, and draws the open hand out past the edge before lowering it. Nothing goes into the board or the head; the wrist stays under 35 degrees.
- New option `fingers: [x, y, z]` on `grip` and `place`: the way the fingers point. `at`, `normal` and `trunk` keep their meaning (no lean, no new palm side when the scene gives them).
- Fix (v0.5.0 regression): a mug gripped at a point the scene gives (`at`/`normal`) rolls round it as far as in v0.4.5 again; since v0.5.0 its index finger closed over nothing, 11 to 13 mm off the cup. A carried mug keeps v0.5.0's roll, and a thin bottle carried moves exactly as in v0.5.0.
- The automatic step to a spot (a shelf where the body has no room) turns the person at most as far as needed and never to a spot where their body stands between the scene's view and the hand (it used to turn them up to 195 degrees, back to the camera, in front of the cup).
- A grip or place with `reposition: false` whose goal is more than 10 cm past the arm's reach now stops with an error that says so (the hand used to stop short in the air); with reposition on, the body still steps up to it.
- Faster hand scenes: the finger and roll solves measured every triangle of the held thing for each hand point; runs of triangles that cannot be the nearest are now passed by (same nearest triangle, same result). A default mug grip costs about 200 ms per frame instead of 400 to 800, which every check that samples the hand frames repeats.

- Fix: see-through triangles on the back of a `KIT.fx.human` hand. When a gripping hand turned far from its forearm (a cup gripped with the trunk bent, about 175 degrees at the wrist), the skin where hand and forearm meet folded inside out and showed small triangular holes up close. Those wrist seam vertices now follow the blended rotation of their joints (dual quaternion) once the joints turn more than 50 degrees apart, fully from 80; every other vertex, and the wrist seam below 50 degrees, follows the same blend of matrices as before. Where a grip measures the hand skin itself (the fingers round a handle), the arm can settle a little differently for it. `tests/test_human_skin.py` looks at every folded hand triangle from outside in each frame of two grip scenes and fails on a hole.

### 한국어

- `KIT.fx.human` act(): 기본값(`at`·`normal`·`fingers` 없음)으로 쥐는 컵·병을 사람처럼 쥔다. 손바닥은 뻗는 방향을 가로지르는 옆면에, 손가락은 아래팔에서 이어져 감싸고, 엄지는 위, 손은 팔을 따라 기운다. 손목이 거의 곧다: 근육옷감 부엌·짐·선반 장면의 모든 프레임에서 35도 이하(옛 기본값은 85~133도였고 손 굴림을 손목이 다 받았다. #62: 그 쥐기들에서 손목 관절 전체 회전 135~177도가 42~50도로. 높은 선반에 놓을 때는 아직 손목에서 약 150도 돈다, 팔뚝 비틀기가 아직 없다). 손잡이가 어느 쪽을 보든 손가락이 다 컵에 닿는다: 컵을 지나쳐 허공에서 끝나던 손가락은 컵에서 멈추고, 엄지는 컵에 닿는 맞섬 자세를 고르고, 손잡이가 막으면 손바닥이 컵 둘레로 비킨다. 들고 가는 머그는 팔꿈치를 굽혀 허리 앞에서 기다리고, 놓은 뒤 빈손은 옆으로 내려와 늘어진다.
- 어깨 위 선반에 `place` 기본값으로 머그 놓기: 판 밑이나 카메라에 등을 돌린 자리 대신 판 옆 팔 길이 자리에 서서, 판 앞끝 앞에서 손을 거의 수평으로 들어 올리고, 판 위로 밀어 놓은 뒤, 편 손을 판 끝 밖으로 뺀 다음 내린다. 판·머리에 들어가는 곳이 없고 손목은 35도 아래.
- `grip`·`place` 새 옵션 `fingers: [x, y, z]`(손가락이 향할 방향). `at`·`normal`·`trunk` 는 뜻 그대로(장면이 주면 기울이지도 손바닥 면을 바꾸지도 않음).
- 고침(v0.5.0 회귀): 장면이 준 점(`at`/`normal`)에서 쥐는 머그는 v0.4.5 만큼 다시 굴린다. v0.5.0 부터 검지가 허공을 쥐어 컵에서 11~13 mm 떠 있었다. 들고 가는 머그는 v0.5.0 굴림 그대로, 들고 가는 가는 병은 v0.5.0 과 똑같이 움직인다.
- 자리가 없어 스스로 옮겨 서는 자리(선반)는 필요한 만큼만 돌고, 장면이 보는 쪽과 손 사이에 몸이 서는 자리는 고르지 않는다(예전엔 195도까지 돌아 카메라에 등을 보이고 컵을 가렸다).
- `reposition: false` 인 grip·place 의 목표가 팔이 닿는 거리보다 10 cm 넘게 멀면 그렇다고 말하는 오류로 멈춘다(손이 허공에서 모자란 채 멈추던 것). reposition 을 켜 두면 예전처럼 몸이 다가간다.
- 손 장면이 빨라짐: 손가락·굴림 풀이가 손 점마다 쥔 물체의 모든 삼각형을 재던 것을, 가장 가까울 수 없는 삼각형 묶음은 건너뛴다(가장 가까운 삼각형·결과는 같음). 기본값 머그 쥐기 한 프레임이 400~800 ms 에서 약 200 ms 로, 손 프레임을 재는 검사마다 그만큼 준다.

- 고침: `KIT.fx.human` 손등에 비쳐 보이던 삼각 구멍. 쥔 손이 팔뚝에서 크게 돌면(몸을 숙여 컵을 쥘 때 손목에서 약 175도) 손과 팔뚝이 만나는 피부가 뒤집혀 가까이서 작은 삼각 구멍으로 보였다. 이제 그 손목 이음 정점은 관절들이 50도 넘게 벌어지면 관절 회전을 섞은 회전(듀얼 쿼터니언)을 따르기 시작해 80도부터 완전히 따른다. 다른 정점과 50도 아래의 손목 이음은 예전과 같은 행렬 혼합을 따른다. 쥐기가 손 피부를 직접 재는 경우(손잡이를 감싸는 손가락)에는 그 때문에 팔이 조금 다르게 앉을 수 있다. `tests/test_human_skin.py` 가 쥐기 장면 두 개의 모든 프레임에서 뒤집힌 손 삼각면을 바깥에서 보고 구멍이 보이면 실패한다.

## v0.5.0

### English

- New `script.json` option `"caption": {"size", "bottom", "width"}` (px at 1080p, each optional; default 44 / 56 / 1560; size 32 to 72, bottom 24 to 400, width 600 to 1800, anything else stops the build): the caption text size, the box's distance from the bottom edge and its widest line. Raise `bottom` to lift captions off a subject low in the frame. The text area for cards and tags (`KIT.info.captionTop()`) ends above the tallest caption box of the video, and default number cards, `KIT.label`, `KIT.info.clear`, `KIT.shot` framing and the `check_layout` safe area keep above it. Without `"caption"` nothing changes. AGENTS.md, HOWTO.md.
- Number cards and name tags are readable and next to the subject by default. `KIT.info.numCard` is 80/36/24 px (number/caption/source, was 64/28/20), at most 520 px wide, on a more opaque panel, and a web-address source shows only its site. A card without `left`/`top`/`right` is placed every frame beside the subject, in the free space: right of it first, then left, above and below (a fixed order, so a swaying subject does not flip the card), 48 px from the subject, 96 px from the picture's sides and 48 px from its top and bottom, clear of tags, pictures, people and other cards, in the same place whatever frame ran before. `KIT.label` is 40 px (was 36) and its `place()` offsets are optional (just above the point). `KIT.info.clear` tries spots beside the objects before the four corners. A card with explicit `left`/`top`/`right`, or a tag with an explicit `size`, keeps them, so remove those to get the new defaults.
- `check_quality`: new `QUALITY_TEXT_EDGE` flags a text panel in a picture corner (within 10% of a side and within 15% of the top or bottom) whose reading size is under 32 px. `QUALITY_CARD` now measures the cover as the per-pixel union of the card boxes. The old 8 px grid rounded every box outwards, about +25% for a 40 px tag. The 6% limit is unchanged, and the hint now says to show fewer panels at once, not smaller text.
- `KIT.fx.human` act(): a scene can now give the trunk pose in the same call as `grip` or `place`: `man.act(t, {trunk: {bend, side, twist}, grip: {...}})` (radians; a number is `bend`, bend > 0 leans the chest forward). act used to write its own small lean onto the spine every frame, so a scene's back bend (a body sagging under a weight) was lost as soon as the hand gripped. The given pose now replaces that lean exactly; shoulders, arms and head ride on it, the hand grips from there with the same finger contact and penetration limits, and the automatic step toward a far goal measures reach from the bent shoulder. Without `trunk` nothing changes. HOWTO, "hand grip" row.
- Fix: `place` onto a high shelf (a board above the shoulder, like the muscle-fabric kitchen's 1.645 m shelf). The automatic step aimed at a point on the floor (it took `place.at`'s y = 0), so the body walked 0.48 m in under the board and its head went 22 mm into it; it now aims at the board top and, when the trunk, head or a shoulder would end up under or against the board, picks the nearest spot round the goal that keeps clear of it. The carried object now goes up on a planned way that keeps the hand, the object and the arm off the board (it used to pass through the board's front edge), the palm holds the face whose arm clears the board at the drop, and the hand sets the object down without the forearm in the board.
- Fix: the fingers round a carried mug (wider than 8 cm). They used to close into a fist next to it (26 to 37 mm off); they now wrap it the way `grip` does, the mug stays where the hand holds it, and they open once it is set down. A mug's handle no longer pushes the palm off its side. `grip` of a mug-sized object rolls the palm round it instead of resting the finger roots on it (pinky 57 deg before, about 80 now), and a rolled palm no longer sinks through a mug's wall into it.

### 한국어

- 새 `script.json` 옵션 `"caption": {"size", "bottom", "width"}`(1080p px, 각각 생략 가능, 기본 44 / 56 / 1560, 글자 32~72, 아래 여백 24~400, 최대 너비 600~1800, 벗어나면 빌드가 멈춤): 자막 글자 크기, 상자와 아래 가장자리 사이, 가장 긴 줄 너비. 주인공이 화면 아래에 있으면 `bottom` 을 올린다. 카드·이름표가 쓰는 글자 영역(`KIT.info.captionTop()`)은 그 영상에서 가장 높은 자막 상자 위에서 끝나고, 기본 숫자 카드·`KIT.label`·`KIT.info.clear`·`KIT.shot` 구도·`check_layout` 안전 영역이 그 위에 머문다. `"caption"` 이 없으면 바뀌는 것 없음. AGENTS.md, HOWTO.md.
- 숫자 카드·이름표의 기본값이 읽히는 크기에, 주인공 옆 빈 자리로 바뀌었다. `KIT.info.numCard` 는 80/36/24 px(숫자/설명/출처, 예전 64/28/20), 최대 너비 520 px, 더 불투명한 판이고, 웹 주소 출처는 사이트 이름만 보인다. `left`/`top`/`right` 가 없는 카드는 매 프레임 주인공 옆 빈 자리에 놓인다: 오른쪽을 먼저, 그다음 왼쪽·위·아래(순서가 정해져 있어 주인공이 흔들려도 카드가 뒤집히지 않음), 주인공에서 48 px, 그림 좌우 가장자리에서 96 px, 위아래에서 48 px 떨어지고, 이름표·그림·사람·다른 카드를 비키며, 앞에 어떤 프레임을 그렸든 같은 자리다. `KIT.label` 은 40 px(예전 36), `place()` 의 오프셋은 생략할 수 있다(점 바로 위). `KIT.info.clear` 는 네 구석보다 물체 옆 자리를 먼저 본다. `left`/`top`/`right` 를 직접 준 카드와 `size` 를 직접 준 이름표는 그 값을 그대로 쓴다. 새 기본값을 쓰려면 그 값을 지운다.
- `check_quality`: 새 `QUALITY_TEXT_EDGE` 는 그림 구석(좌우 10% 안이면서 위아래 15% 안)에 있는 읽는 크기 32 px 미만 글자 판을 짚는다. `QUALITY_CARD` 는 덮인 넓이를 카드 상자들의 화소 단위 합집합으로 잰다. 예전 8 px 격자는 상자마다 바깥으로 올려 잡아 40 px 이름표에서 약 25% 크게 셌다. 한도 6% 는 그대로이고, 안내 문구는 글자를 줄이라는 대신 한 번에 보이는 판을 줄이라고 말한다.
- `KIT.fx.human` act(): 장면이 몸통 자세를 `grip`·`place` 와 같은 호출에서 줄 수 있다: `man.act(t, {trunk: {bend, side, twist}, grip: {...}})`(라디안, 숫자 하나면 `bend`, bend > 0 이 가슴 앞으로 굽힘). 예전에는 act 가 매 프레임 척추에 제 숙임을 써서, 장면이 정한 등 굽힘(무게에 짓눌린 자세)이 손으로 쥐는 순간 사라졌다. 이제 준 값이 그 숙임 대신 그대로 들어가고, 어깨·팔·머리가 그 위에 실리며, 손은 거기서 같은 손가락 접촉·뚫림 기준으로 쥔다. 먼 대상으로 몸이 스스로 옮길 때도 굽은 어깨 자리로 거리를 잰다. `trunk` 가 없으면 예전과 같다. HOWTO 「손으로 잡기·놓기」 줄.
- 고침: 높은 선반(어깨보다 높은 판, 근육옷감 부엌의 1.645 m 선반)에 `place`. 자동 자리 잡기가 바닥의 한 점을 목표로 잡아(`place.at` 의 y = 0 을 그대로 씀) 몸이 선반 밑으로 0.48 m 걸어 들어가 머리가 판에 22 mm 박혔다. 이제 판 윗면을 목표로 잡고, 몸통·머리·어깨가 판 밑이나 판에 붙게 되면 목표 둘레에서 판을 비키는 가장 가까운 자리를 고른다. 든 물건은 손·물건·팔이 판에 닿지 않는 계획한 길로 올라가고(예전에는 판 앞 모서리를 뚫고 지났다), 손바닥은 놓는 순간 팔이 판을 비키는 면을 쥐며, 팔뚝이 판에 들어가지 않고 내려놓는다.
- 고침: 들고 가는 머그(폭 8 cm 넘음)를 감싸는 손가락. 예전에는 컵 옆에서 주먹으로 닫혔다(26~37 mm 떠 있음). 이제 `grip` 처럼 감싸고, 머그는 손이 쥐 자리에 머물며, 내려놓으면 펴진다. 머그 손잡이 때문에 손바닥이 머그 옆면에서 떠 있던 것도 고쳤다. 머그 크기 물건의 `grip` 은 손가락 뿌리를 대는 대신 손바닥을 굴려 감싸고(새끼 굽힘 57도에서 약 80도), 굴린 손바닥이 머그 벽을 뚫고 안으로 들어가지 않는다.

## v0.4.5

### English

- Examples: three KIMM research videos, `examples/kimm-morphing-wheel` (66.1 s), `examples/kimm-muscle-fabric` (68.2 s) and `examples/kimm-plasma-recycling` (66.3 s). Every number and claim has its public source in `sources.json`, and `audio/score.py` writes the music and sound effects. README "Examples" shows how to copy and build one: `rv tts`, `audio/score.py`, `rv still`, `rv make`.
- The finished videos and their subtitles (one mp4 and one srt per example, 1920x1080 h264 with aac 48 kHz) are attached to this release. They are not kept in git. sha256: `kimm_morphing_wheel_premium.mp4` e26afa2ca1f8500c67438215671e958b4d5b57a2168f2f2b841ce64b5a881221, `.srt` 89162fb2847361088b374c148c14939cecbf993135e4222f395a4ca05302f031; `kimm_muscle_fabric_premium.mp4` aca9a6ae362d9527976e99a9ba6973233fd6942a52fe4e3bdbbe54c26f09d52e, `.srt` 3788f257aac6bd291ec8a0716210aa26ce915d1e7ed921a2db77cc4e9acaa412; `kimm_plasma_recycling_premium.mp4` 18646a747150e7c06b11b670656b4bf5a359c47bcbb442eba1664c5cc6ded083, `.srt` 0d33d7940abe4b5636fcb677a678525aef516e4e87cc7a77a0651174d6bb0e1c.

### 한국어

- 예제: 한국기계연구원 연구 영상 셋, `examples/kimm-morphing-wheel`(66.1초), `examples/kimm-muscle-fabric`(68.2초), `examples/kimm-plasma-recycling`(66.3초). 숫자와 주장마다 공개 출처를 `sources.json` 에 적었고, `audio/score.py` 가 배경음·효과음을 만든다. 복사해서 빌드하는 법(`rv tts`, `audio/score.py`, `rv still`, `rv make`)은 README 의 「예제」에 있다.
- 완성 영상과 자막(예제마다 mp4·srt 하나씩, 1920x1080 h264 + aac 48 kHz)은 이 릴리스에 붙였고 git 에는 넣지 않는다. sha256 은 위 English 와 같다.

## v0.4.4

### English

- Fix: the public leak scan (keys-tokens) refused kit/human_body.js, whose base64 mesh data spelled an AWS access key id by chance (AKIA and 16 capitals). scripts/human_body.py now cuts such a field into a list of pieces inside every AKIA, and the kit joins them before decoding. The decoded mesh is byte for byte the same; the scan pattern is unchanged.
- Fix: the leak scan's home-paths check no longer takes a folder named home inside a relative path (scenes/home/deps.json, also in the a/... b/... header of a pushed patch) for a home folder. /home/<user> at the start of a line or after a space, quote, =, : or / is still caught.

### 한국어

- 고침: 공개 유출 검사(keys-tokens)가 kit/human_body.js 를 막았다. base64 메시 데이터가 우연히 AWS 액세스 키 모양(AKIA 와 대문자·숫자 16자)이 됐기 때문이다. 이제 scripts/human_body.py 가 그런 칸을 AKIA 가운데에서 끊어 조각 목록으로 쓰고, 킷이 이어 붙여 디코드한다. 디코드한 메시는 바이트까지 같고, 검사 패턴은 그대로다.
- 고침: 유출 검사의 home-paths 가 상대 경로 안의 home 폴더(scenes/home/deps.json, push 하는 패치의 a/... b/... 머리줄 포함)를 홈 폴더로 보지 않는다. 줄 처음이나 공백·따옴표·=·:·/ 뒤의 /home/<사용자>는 그대로 잡는다.

## v0.4.3

### English

- Same changes as v0.4.2. The v0.4.2 tag still said 0.4.1 in `VERSION`; v0.4.3 fixes that.

### 한국어

- v0.4.2 와 같은 변경이다. v0.4.2 태그의 `VERSION` 이 0.4.1 로 남아 있어 v0.4.3 이 고쳤다.

## v0.4.2

### English

- People have finger bones: three joints for each finger and thumb, taken from the same Quaternius mannequin rig (`scripts/human_body.py` regenerates `kit/human_body.js`; the finger skin keeps the part name `hand_l`/`hand_r`, `userData.rvPivot` names its joint). A `grip` closes the fingers joint by joint until each one touches the object (no finger goes in), and opens them on release. `place` wraps the carried object too. Small objects (a cup, a bottle, a bar; longest side 0.3 m or less) are held on their side halfway up, thumb along their long side, the hand rolled until the finger roots touch. A bar with 25 mm or more behind it (a door pull) is held by the finger roots, square to the door. `man.userData.reach.<hand>.fingers` reports each finger's bend and tip gap.
- A standing `grip` or `place` the arm cannot reach well (out of reach, across the chest, behind the back, inside the body) moves and turns the body toward the object for the whole act (`man.userData.autoPlace`). `reposition: false` keeps the scene's spot. Walking and seated acts are never moved.
- Measured (done check `verify.py`): on a cup, a bottle and a door pull every fingertip is 1.0 to 1.5 mm off the surface, the hand goes at most 1.1 mm into it, fingers bend 70 to 130 degrees. Forcing the fingers straight or shut is caught. HUMAN_REACH, HUMAN_ACT, HUMAN_SEAT and test_human.sh pass unchanged.
- Fix: `check_clearance` never measured `KIT.place` scenes. `KIT.fx`'s per-scene render hook hid `Scene.prototype.onBeforeRender`, which the check patches, so the kitchen and lab scenes passed with nothing measured (a person 28 mm into a shelf passed). The hook now passes the call on. People are measured against the scene's own objects, not the merged `KIT.place` background ("set"), whose depth means nothing.
- New check rule `human crowding`: a standing person's trunk, pelvis, head or legs within 40 mm of a shelf, table or other object FAILs, even without going in. Seated people and small things in the hand (under 0.4 m) are left out.
- Natural placement: a standing grip too close to the object (arm folded, or standing in the shelf) steps the body straight back, keeping its facing. The trunk keeps 60 mm from nearby furniture while the arm still reaches. A small object in a group (a cup on a tray with jars and a lip) treats its neighbours as obstacles for the arm, comes at it from above and holds it a little higher. The kitchen cup scene went from torso 28 mm, forearm 25 mm and hand 12 mm in the shelf to no finding.

### 한국어

- 사람에게 손가락 뼈가 생겼다: 손가락·엄지마다 마디 3개, 같은 Quaternius 마네킹 리그에서 가져왔다(`scripts/human_body.py` 가 `kit/human_body.js` 를 다시 만든다. 손가락 겉면 부위 이름은 `hand_l`/`hand_r` 그대로이고, `userData.rvPivot` 이 마디 이름이다). `grip` 은 손가락을 마디마다 굽혀 대상에 닿으면 멈추고(뚫지 않음), 놓을 때 편다. `place` 도 든 물건을 감싼다. 작은 물체(컵·병·막대, 가장 긴 변 0.3 m 이하)는 옆면 가운데를 잡고 엄지를 긴 축 쪽으로 세우며, 손가락 뿌리가 닿을 때까지 손을 굴린다. 뒤에 25 mm 이상 틈이 있는 막대(문손잡이)는 문 정면에서 손가락 뿌리로 건다. `man.userData.reach.<손>.fingers` 에 손가락별 굽힘·끝 간격이 나온다.
- 서서 하는 `grip`·`place` 를 팔이 제대로 못 하면(안 닿음, 가슴을 가로지름, 등 뒤, 몸속) 몸이 act 내내 물건 쪽으로 옮기고 돈다(`man.userData.autoPlace`). 장면 자리 그대로 두려면 `reposition: false`. 걷기·앉기 동작은 옮기지 않는다.
- 측정(완료 검사 `verify.py`): 컵·병·문손잡이에서 손가락 끝이 겉면에서 1.0~1.5 mm, 손이 들어간 깊이 최대 1.1 mm, 손가락 굽힘 70~130도. 손가락을 억지로 펴거나 오므리면 잡힌다. HUMAN_REACH·HUMAN_ACT·HUMAN_SEAT·test_human.sh 는 기준 그대로 통과.
- 고침: `check_clearance` 가 `KIT.place` 장면을 전혀 재지 않았다. `KIT.fx` 의 장면별 렌더 훅이 검사가 가로채는 `Scene.prototype.onBeforeRender` 를 가려, 부엌·실험실 장면은 아무것도 안 재고 통과했다(선반에 몸이 28 mm 박힌 사람도 통과). 이제 훅이 호출을 넘겨 준다. 사람은 장면이 만든 물체와만 재고, 한 덩어리로 합친 `KIT.place` 배경("set")은 깊이가 뜻이 없어 뺀다.
- 새 검사 규칙 `human crowding`: 서 있는 사람의 몸통·골반·머리·다리가 선반·책상 등에 40 mm 안쪽으로 붙으면 뚫지 않아도 FAIL. 앉은 사람과 손에 든 작은 물건(0.4 m 미만)은 뺀다.
- 자연스러운 자리: 서서 잡을 때 물건에 너무 가까우면(팔이 접히거나 선반 안에 섬) 방향 그대로 뒤로 물러서고, 몸통은 둘레 가구에서 60 mm 떨어지게 팔이 닿는 만큼 자리를 잡는다. 묶음 안의 작은 물건(단지·턱이 있는 쟁반 위 컵)은 이웃을 팔의 장애물로 보고, 위에서 들어가 조금 높이 쥔다. 부엌 컵 장면: 몸통 28·아래팔 25·손 12 mm 박힘 → 검사 발견 없음.

## v0.4.1

### English

- Worker counts follow the machine: `rv make`, `rv preview` and `rv check` size their browser counts from CPU cores and free memory instead of the fixed 4/6/4 (capture capped at 8 after measurement, at most 12 check browsers). Explicit `--jobs`, `RV_CHECK_JOBS` and `RV_CHECK_SHARDS` still win, `RV_CORES` / `RV_MEM_GIB` override detection, and `python3 lib/workers.py explain` prints the reasoning. The render's `dori heavy --mem` follows the worker count.
- Capture is 1.30x faster on a 3-minute 5493-frame project (225.5 s with the old `--jobs 4` to 172.9 s with the automatic default, measured back to back on a 20-core GB10), and 1.24x on the rotor fixture. The 1.8x goal is not reached yet; the screenshot bottleneck continues in follow-up work.
- Two nondeterminism bugs the old tool also had are fixed: a worker that began mid-scene painted earlier-faded labels with different anti-aliasing, and a scene's first frame could carry stale geometry from the previous scene. Workers now draw from their scene's start up to their first frame and start every scene on a fresh page, so frames no longer depend on `--jobs` or on which range is re-captured.
- Share copies avoid re-encoding when the original fits: video is copied as-is, and each part's audio is encoded for exactly that part's interval so no audible content is lost at the cuts (copied AAC packets were being trimmed by each new file's edit list).

- Fix: `check_motion` `ACTION_SPAN` measures a span by the part its line names. When `ACTION_MATCH` links a `KIT.process` part, the span reads that part's own state (its meshes) and the pixels of the screen box it covers during the span (`part=`, `region=` on the line), with the same thresholds. A small cup lifted in a wide kitchen changed 0.0002 of the frame and failed as `action_static` although `ACTION_MATCH` saw it rise; it now reads 0.107 of its own box and passes. A cup that holds while a big box beside it slides is no longer passed by the box. Spans with no linked part measure the whole frame as before.
- `scripts/scan-public.sh` (also behind the pre-push hook): a grep that could not run, such as an invalid pattern line or `grep -P` in a multibyte locale that is not UTF-8 (EUC-KR), was read as 0 and let the scan pass; it is now counted as `scan-errors`. Each pattern runs in `C` and in `C.UTF-8` whatever the caller's locale and a hit in either counts: in a UTF-8 locale a line with a byte that is not UTF-8 hid its match, and in C `.` matched one byte of a Korean character.
- Maintenance: `scripts/gh-safe.sh pr-create|pr-edit|pr-comment|issue-create|issue-comment|release-notes|release-edit <file> [gh args]` posts a pull request body, a comment or release notes only after `scripts/scan-public.sh` prints 0 for the text and every other argument (the title too). GitHub keeps every revision of a body or comment and its API cannot delete one, so a scan after posting came too late twice. On a hit nothing is posted, and only the check name and line numbers are printed, never the matched text (exit 1); only the arguments in its header are accepted (no `--body`, `-dF <file>`, `--web`, `--recover` or release assets), and a missing or empty pattern file or a non-text body is refused too. `tests/test_gh_safe.sh` runs it with a synthetic pattern and a fake `gh`.

- Test (self-occlusion): a focused device whose closed lid hides its inner parts, in a room with bright particles behind the back wall, reads 1.000 visible; its own parts hiding each other are the device, not cover. Another object over most of it still fails. Under 0.3.0 the same scene failed because of the particles (fixed by #37).

### 한국어

- 고침: `check_motion` `ACTION_SPAN` 이 구간을 그 말이 가리키는 부품으로 잰다. `ACTION_MATCH` 가 `KIT.process` 부품을 찾으면 그 부품(및 그 아래 메시)의 상태와, 구간 동안 그 부품이 지난 화면 상자 안의 화소로 재고(줄의 `part=`, `region=`), 문턱은 그대로다. 넓은 부엌에서 작은 컵을 올리면 화면의 0.0002 만 바뀌어 `ACTION_MATCH` 는 올라감을 보고도 `action_static` FAIL 이었는데, 이제 컵 상자의 0.107 이 바뀌어 PASS. 컵은 가만히 있고 옆 큰 상자만 미끄러지면 더는 동작으로 치지 않는다. 찾은 부품이 없는 구간은 전처럼 화면 전체.
- `scripts/scan-public.sh` (pre-push 훅도): 돌지 못한 grep(잘못된 패턴 줄, UTF-8 아닌 멀티바이트 로케일(EUC-KR)의 `grep -P`)이 0으로 읽혀 검사가 통과했다. 이제 `scan-errors` 로 센다. 패턴마다 부르는 쪽 로케일과 상관없이 `C` 와 `C.UTF-8` 에서 둘 다 돌리고 어느 쪽이든 걸리면 센다: UTF-8 로케일에선 UTF-8 아닌 바이트가 든 줄이 걸린 것을 숨겼고, C 에선 `.` 이 한글 한 글자가 아니라 한 바이트였다.
- 관리: `scripts/gh-safe.sh pr-create|pr-edit|pr-comment|issue-create|issue-comment|release-notes|release-edit <파일> [gh 인자]` 는 PR 본문·댓글·릴리스 노트를 그 글과 나머지 인자(제목 포함)에 `scripts/scan-public.sh` 가 0을 낸 뒤에만 올린다. GitHub는 본문·댓글의 모든 판을 남기고 API로 지울 수 없어, 올린 뒤 검사는 두 번 늦었다. 걸리면 아무것도 안 올리고 검사 이름과 줄 번호만 찍으며 걸린 낱말은 찍지 않는다(exit 1). 머리말에 적힌 인자만 받고(`--body`·`-dF <파일>`·`--web`·`--recover`·릴리스 첨부 파일 없음), 패턴 파일이 없거나 비었거나 본문이 글이 아니어도 거절. `tests/test_gh_safe.sh` 가 합성 패턴과 가짜 `gh` 로 돌린다.

- 시험(자기 가림): 닫힌 뚜껑이 속 부품을 가린 초점 기기(뒷벽 뒤에 밝은 입자가 있는 방)는 1.000 보임: 자기 부품끼리 가린 것은 기기 자신이지 가림이 아니다. 다른 물체가 대부분을 막으면 여전히 FAIL. 0.3.0 에서는 같은 장면이 입자 때문에 FAIL 했다(#37 고침).

- 일꾼 수를 기계에 맞춰 정한다: `rv make`, `rv preview`, `rv check`가 브라우저 수를 고정 4/6/4 대신 코어 수와 남은 메모리로 정한다(측정해 찍기는 최대 8, 검사 브라우저는 12 이하). `--jobs`, `RV_CHECK_JOBS`, `RV_CHECK_SHARDS`로 주면 그 값이 우선하고, `RV_CORES`·`RV_MEM_GIB`로 감지 값을 바꿀 수 있다. `python3 lib/workers.py explain`이 근거를 보여 주고, 렌더의 `dori heavy --mem`도 일꾼 수에 맞춘다.
- 3분 5493프레임 프로젝트 찍기가 1.30배 빨라졌다(20코어 GB10에서 옛 `--jobs 4` 225.5초 → 자동 기본값 172.9초, 나란히 측정). rotor 고정물은 1.24배. 1.8배 목표는 아직 미달이며, screenshot 병목은 후속 작업에서 계속 다룬다.
- 옛 판에도 있던 결정성 결함 둘을 고쳤다: 일꾼이 장면 중간에서 시작하면 앞서 페이드인한 라벨 글자를 다른 안티에일리어싱으로 칠했고, 장면 첫 프레임에 앞 장면의 낡은 모양이 남을 수 있었다. 이제 일꾼은 장면 시작부터 그리기만 하고 이어 찍고, 장멧마다 새 페이지를 열어 `--jobs`나 다시 찍는 구간에 따라 프레임이 달라지지 않는다.
- 공유용 영상은 원본이 들어가면 다시 인코딩하지 않는다: 영상은 그대로 복사하고, 음성은 조각마다 그 구간만 인코딩해 넣어 조각 사이에서 소리가 잘리지 않게 했다(복사한 AAC 패킷이 새 파일의 edit list에 잘려 소리가 빠지던 문제).

## v0.4.0

### English

A one- or two-line request now gets a full video by default: a real place, people, a story from problem to result, and small cards. `rv check` reports when a video is thin.

- Places: `KIT.place(NAME, scene)` builds a sidewalk, factory hall, recycling yard, clinic, kitchen or lab around the subject, with foreground, middle and background layers, sky or room light, haze, dust or steam, and things moving in the background (`P.update(t)`). All procedural, no outside assets. `KIT.place.mat(kind)` gives textured materials (concrete, asphalt, painted metal, plastic, wood, tile, fabric, glass). `KIT.place.site(kind)` tells `KIT.fx.human` how to dress people there.
- Story frame: `script.json` scenes take `"beat"` (`problem`, `inside`, `result`, `after`) and `"place"`. `examples/story` is the new starting project; `AGENTS.md` tells agents to follow the user's guidance first and these defaults otherwise, and to look up facts on the web into `sources.json`.
- Cards: `KIT.info.numCard` is small (64 px number, at most 440 px wide) and sits top right by default; `size: "l"` gives the old big card, `left`/`top`/`right` place it. `KIT.process.steps` cards follow the same default.
- New check `check_quality` (strict): per scene, the share of flat 48 px tiles (`QUALITY_EMPTY`, over 45%), distinct things on screen (`QUALITY_SPARSE`, under 10), people (`QUALITY_NO_PEOPLE`), card cover (`QUALITY_CARD`, over 6% of the frame), beats (`QUALITY_STORY`) and place (`QUALITY_PLACE`). The verdict counts them when `script.json` has `"quality": "strict"` (`examples/story`, `examples/hello` and projects copied from them); older projects get them as reference lines and keep their verdict. Exceptions go in `quality_ok` with a reason of at least 15 characters and are printed as `QUALITY_EXEMPT`. Three mutations (a 900x500 card, every mesh hidden, people hidden) check the checker.
- 3D text and effects: `QUALITY_TEXT_HIDDEN` measures with depth rays whether a 3D text plate is at least 15% behind another solid (a pipe in front of a tank name plate); `KIT.sign` is a name plate always drawn on top. `QUALITY_FAKE_FX` catches smoke drawn as a flat plate and cutaways faked with a see-through panel; `KIT.fx.smoke`, `steam`, `flame` and `section` (a cut with filled faces) replace them.
- The cinema look's render targets now carry a stencil buffer, so `KIT.fx.section` fills the cut faces under depth of field, bloom and grading (before, a cut object looked hollow).
- An example's own `quality_ok` reasons (marked `(examples/hello only)`) do not count when copied into another project.
- Narration and mixing call ffmpeg with `-nostdin`, so an `rv tts` or `rv make` run in the background no longer stops waiting for terminal input.
- `rv tts <project>` fetches only the narration voices and writes the timeline, so a machine with network can prepare a project that renders and checks offline elsewhere.

### 한국어

한두 줄 요청에도 기본으로 제대로 된 영상이 나온다: 실제 장소, 사람, 문제에서 결과까지의 이야기, 작은 카드. 앙상한 영상은 `rv check` 가 알린다.

- 장소: `KIT.place(NAME, scene)` 가 주인공 둘레에 도시 보도·공장 홀·재활용장·진료실·부엌·연구실을 짓는다. 앞·중·뒤 층, 하늘·실내 빛, 안개·먼지·증기, 배경에서 움직이는 것(`P.update(t)`)까지. 모두 절차 생성이라 바깥 에셋이 없다. `KIT.place.mat(kind)` 는 결이 있는 재질(콘크리트·아스팔트·도장 금속·플라스틱·나무·타일·천·유리), `KIT.place.site(kind)` 는 그곳 사람 복식.
- 이야기 틀: `script.json` 장면에 `"beat"`(`problem`·`inside`·`result`·`after`)와 `"place"`. 새 시작 프로젝트는 `examples/story`. `AGENTS.md` 는 사용자 지침을 먼저 따르고 없으면 이 기본값으로, 모르는 사실은 웹에서 찾아 `sources.json` 에 적게 한다.
- 카드: `KIT.info.numCard` 기본은 작게(숫자 64 px, 너비 440 px 이하) 오른쪽 위. `size: "l"` 은 예전 큰 카드, `left`·`top`·`right` 로 자리. `KIT.process.steps` 카드도 같은 기본값.
- 새 검사 `check_quality`(strict): 장면마다 결 없는 48 px 칸 비율(`QUALITY_EMPTY`, 45% 초과), 화면의 따로인 물체 수(`QUALITY_SPARSE`, 10 미만), 사람(`QUALITY_NO_PEOPLE`), 카드 면적(`QUALITY_CARD`, 화면 6% 초과), 박자(`QUALITY_STORY`), 장소(`QUALITY_PLACE`). 판정에는 `script.json` 에 `"quality": "strict"` 가 있을 때 들어간다(`examples/story`·`examples/hello` 와 거기서 복사한 프로젝트). 예전 프로젝트는 참고 줄로만 보고 판정은 그대로. 예외는 `quality_ok` 에 15자 이상 이유로 적고 `QUALITY_EXEMPT` 로 찍힌다. 변이 셋(900x500 카드, 모든 물체 숨김, 사람 숨김)이 검사기를 확인한다.
- 3D 글자와 효과: `QUALITY_TEXT_HIDDEN` 은 3D 글자 판이 다른 실물 뒤에 15% 넘게 가리는지 깊이 광선으로 잰다(탱크 이름판 앞을 지나는 배관). `KIT.sign` 은 늘 위에 그리는 이름판. `QUALITY_FAKE_FX` 는 납작한 판 연기와 반투명 판으로 흉내 낸 단면을 잡고, `KIT.fx.smoke`·`steam`·`flame`·`section`(단면을 채워 자르기)이 대신한다.
- 시네마 룩의 렌더 타깃에 스텐실 버퍼가 붙어, `KIT.fx.section` 이 피사계 심도·번짐·색 보정 아래에서도 자른 면을 채운다(전에는 잘린 물체가 속이 빈 채로 보였다).
- 예제 자신의 `quality_ok` 이유(`(examples/hello only)` 표시)는 다른 프로젝트로 복사하면 안 친다.
- 나레이션·소리 섞기의 ffmpeg 가 `-nostdin` 으로 돌아, 뒤에서 돌린 `rv tts`·`rv make` 가 터미널 입력을 기다리며 멈추지 않는다.
- `rv tts <project>` 는 나레이션 음성과 시간표만 만든다. 네트워크 되는 PC 에서 먼저 돌리면 렌더·검사는 네트워크 없는 PC 에서 오프라인으로 돈다.


## v0.3.1

### English

rv 0.3.1: seated people sit on their seat instead of sinking into it, people's hands can grip and set things down in one line, and four checks stop failing good videos.

**People: seated fit and hand goals (#40, fixes #36)**

- The seated-operator penetration in v0.3.0's known issue (663 mm new body, 477 mm old figure) was a measuring error: `check_clearance` counted a body point as inside an open cab panel when one ray crossed it an odd number of times. On an open mesh a point is now inside only where six more rays agree (as the machine rule already did); a limb pushed through one open panel is measured on the panel's shallower side. With this rule the same scene reads 86.3 mm for the old figure and 41.4 mm now.
- `pose("sit")` puts the soles 0.39 m below the seat contact and the palms where the old figure's were (seats and levers in existing scenes were built for it); the seat contact is under the pelvis centre. `KIT.fx.seat(person, {seat, floor, back})` also fits a seated person: out of the seat back, seat contact on the seat top, knees raised or lowered until the soles reach the floor. A wheelchair rider declared this way has no penetration.
- `act(t, {grip, place, sit})`: `grip` puts the palm on a target's nearest surface, `place` carries a held object onto a shelf top and lets go, `sit` makes the act seated (wheelchair push rims). The way there is lifted over `avoid` boxes and the elbow swings away from them. Palm error in the tests: 1.4 mm (bottle), 0.3 mm (handle), 0.9 mm (push rims).
- `check_human`'s seated contract is a range (knees 45..150°, thighs -15..45° from level).

**Fixes**

- `check_human` no longer counts ball-and-stick molecule models as home-made people (#32).
- `check_sharp --mutate bitrate` steps resolution down until the picture really degrades, so dark flat scenes no longer print `MUTATION_NOT_CAUGHT` (#32).
- `check_motion` reads action words as stems with one conjugation rule, so formal and past endings ("올립니다", "올렸습니다") are actions (#32).
- `check_motion`: the part a line explains is never counted as background motion (#35).
- `check_layout`: rain, mist and lamp halos around a target are not its cover (#37).

**Check time** (same machine, old v0.3.0 / new, seconds): project A `rv check` 179 -> 186; project B `rv check` 509 -> 547; project C `check_motion` 23.6 -> 22.4; G3 `check_human` 9.0 -> 8.5; G3 `check_clearance` 56.6 -> 83.5. These are wall-clock measurements from one combined regression, not controlled benchmarks.

**Known issues**

- The more robust open-mesh human-penetration check takes longer on the seated-operator G3 scene (56.6 -> 83.5 s, +48%).
- `check_motion` `text_still` is not deterministic across runs (#43).

### 한국어

rv 0.3.1: 앉은 사람이 좌석에 박히지 않고 제자리에 앉으며, 사람 손이 한 줄로 잡고 내려놓고, 좋은 영상을 걸던 검사 넷을 고쳤다.

**사람: 앉은 자세 맞춤과 손 목표 (#40, #36 고침)**

- v0.3.0 알려진 문제의 앉은 운전자 관통(새 몸 663 mm, 옛 사람 477 mm)은 재기 착오였다. `check_clearance` 가 몸의 점에서 광선 하나가 열린 운전실 판넬을 홀수 번 지나면 안으로 셌다. 이제 열린 메시에서는 여섯 광선이 더 '안'이라고 할 때만 안으로 본다(기계 규칙과 같음). 열린 판 한 장을 뚫은 팔다리는 판 양쪽 중 얕은 쪽 깊이로 잰다. 같은 장면이 이 규칙으로 옛 사람 86.3 mm, 지금 41.4 mm.
- `pose("sit")` 은 발바닥을 좌석 접촉점 0.39 m 아래, 손바닥을 예전 사람 자리에 둔다(예전 장면의 좌석·레버가 거기 맞춰져 있음). 좌석 접촉점은 골반 가운데 아래. `KIT.fx.seat(person, {seat, floor, back})` 는 앉은 사람을 맞춘다: 등받이 밖으로, 접촉점을 좌석 윗면에, 발바닥이 바닥에 닿게 무릎을 올리고 내림. 이렇게 선언한 휠체어 탄 사람은 관통 0.
- `act(t, {grip, place, sit})`: `grip` 은 손바닥을 대상의 가장 가까운 겉면에, `place` 는 손에 든 물체를 선반 윗면에 내려놓고 손을 빼며, `sit` 이면 앉은 채로(휠체어 푸시림). 가는 길은 `avoid` 상자 위로 들리고 팔꿈치는 장애물을 비켜 돈다. 시험의 손바닥 오차 1.4 mm(병), 0.3 mm(손잡이), 0.9 mm(푸시림).
- `check_human` 앉은 계약은 범위(무릎 45~150°, 허벅지 수평에서 -15~45°).

**고침**

- `check_human` 이 공·막대 분자 모델을 자작 사람으로 세지 않는다(#32).
- `check_sharp --mutate bitrate` 가 화면이 정말 상할 때까지 해상도를 낮춰 눌러, 어둡고 평평한 장면에서 `MUTATION_NOT_CAUGHT` 가 안 난다(#32).
- `check_motion` 이 동작어를 어간과 활용 규칙 하나로 읽어 높임·과거 끝말("올립니다", "올렸습니다")도 동작이다(#32).
- `check_motion`: 줄이 설명하는 부품은 배경 움직임으로 세지 않는다(#35).
- `check_layout`: 대상 둘레의 비·물안개·가로등 빛무리는 대상을 가린 것이 아니다(#37).

**검사 시간** (같은 기계, 옛 v0.3.0 / 새, 초): 프로젝트 A `rv check` 179 -> 186; 프로젝트 B `rv check` 509 -> 547; 프로젝트 C `check_motion` 23.6 -> 22.4; G3 `check_human` 9.0 -> 8.5; G3 `check_clearance` 56.6 -> 83.5. 한 번의 합친 회귀에서 잰 wall-clock 값으로, 통제된 벤치마크는 아니다.

**알려진 문제**

- 열린 메시의 사람 관통을 더 정확히 재는 대신 앉은 운전자 G3 장면 검사가 56.6 -> 83.5 초(+48%)로 늘었다.
- `check_motion` `text_still` 결과가 실행 사이에 달라질 수 있다(#43).

## v0.3.0

### English

rv 0.3.0: while text is on screen the picture beside it keeps meaningful motion, rich still pictures stand in where motion cannot show the meaning, and a card must not cut a subject; script.json can ask for a letterbox or pillarbox frame; people get a smooth body that walks and presses naturally; contact shadows no longer blacken see-through things.

**Motion beside text, still pictures, no card cutting a subject (#19)**

While text is on screen, rv now asks for meaningful motion in the part of the picture the text leaves free, accepts a rich still picture where motion cannot show the meaning, and catches a card that makes a subject look covered.

- New check `TEXT_MOTION` (`check_motion`): a text window is a stretch of one scene with a card, label or caption up and the camera held (within 2 cm), outside transitions, at least 2 s long. Every 0.25 s the 3D picture is drawn without the DOM and with the text boxes masked; if the uncovered picture stands still (under 0.5% of its pixels changing) for 2 s or more, the line names the scene, the seconds, the text boxes and where the subjects are on screen. A declared `ui-only` hold or a rich still picture counts as intended; text covering more than 80% of the frame is exempt. Mutation `textstill` (rv `motion8`) freezes one passing window.
- New check `PICTURE` (`check_motion`): a `KIT.info.picture` must be fully shown for 3 s or more, cover 8% of the frame or more, and be rich (30% or more of it differs from its dominant colour, 24 or more colour bins); an empty panel, a text-only image or a flash of a picture fails.
- `check_layout` OCCLUSION `cut`: one card covering 10-90% of an explained or a moving object (an object whose own transform changed since the previous sample) fails, and so does a card over a still picture. `KIT.fx.decor(obj)` declares background decoration that may sit behind a card.
- New kit parts: `KIT.shot.free` (a still framing that keeps the subject clear of given cards, in the centre when it can), `KIT.fx.pulse` (accent glow that breathes), `KIT.process.spin` (steady turning, linked to the script like other process parts), `KIT.process.exhaust({path})` (flow along a path), `KIT.info.picture`, `KIT.info.clear` (moves a card to a spot clear of given objects), `KIT.fx.decor`. `KIT.shot.action` `avoid` now takes card elements. HOWTO 4-2.
- New example `examples/text-motion`: one scene in two modes, `still` (fails `TEXT_MOTION`) and `kit` (passes).
- All thresholds were set before measuring.
- Regression (v0.2.1 vs this change alone): project A `rv check` 186 s -> 220 s, mutations caught 33 -> 35; project B 539 s -> 484 s (load), 25 -> 27; none missed, verdicts unchanged. The new lines there are real stills and cuts, checked frame by frame. (Combined with the other v0.3.0 changes: see Fixes.)

**People: CC0 body and act() (#23)**

- `KIT.fx.human` has a new body: the Quaternius Universal Animation Library mannequin (CC0 1.0), re-posed and re-weighted to the kit's joints by `scripts/human_body.py` into `kit/human_body.js`. The kit deforms it on the CPU at every pose, so the figure is still ordinary meshes in the 15 body parts and `check_human` / `check_clearance` measure the posed surface. Outfits: hard hat, gloves and boots (lab), hard hat and a hi-vis vest that moves with the chest (construction), no hat (office), white suit and hood (cleanroom).
- New `man.act(t, {walk, look, press})`: footsteps planned from the path so planted feet do not slide, speed eases in and out, the head looks at the target first, and a fingertip reaches the target, presses and returns. On a 2.6 m walk + button press: planted-foot slide 39 mm (old `pose("walk")` with the group moved by the scene: 3013 mm), largest joint change 18.3 deg/frame (old pose switch: 72.5), fingertip to button 0.5 mm (old `point`: 88 mm).
- Unchanged for existing scenes: the call, pose names, `children[0..5]`, contacts and site rules. A seated figure's contact points moved to the new body's surface.
- Check time before/after: per scene, old -> new, same load, seconds: check_human 15.9 -> 16.3 / 3.3 -> 3.3 / 7.1 -> 7.3; check_motion 54.5 -> 57.0 / 19.2 -> 19.1 / 54.1 -> 57.4; check_clearance 814 -> 648 / 41.1 -> 41.2 / 123.7 -> 172.6 (seated operator, standing worker, office tablet scenes; verdicts unchanged).

**Letterbox and pillarbox frames (#31, #33)**

- New `"aspect"` in script.json: `"2.35:1"` draws letterbox bars, `"4:3"` or `"1:2"` pillarbox bars, once above the scenes and below captions and step chips; scenes still render the whole 16:9 frame and `window.PICTURE` holds the picture area.
- Checks and mutations look at the picture only: `check_layout` does not read the bars as a card over a subject, and the flicker mutation is placed inside the picture. Without `aspect` nothing changes. HOWTO 3.
- Letterbox drawn by the scenes themselves (no `aspect`): `check_layout` treats an opaque black strip on one frame edge (full width and at most a quarter of the height, or full height and at most a quarter of the width), with a strip of the same thickness on the opposite edge, that is at the same place in every sample as a frame bar (`LAYOUT_PICTURE bars=`). What lies under it counts as outside the picture, not as covered; with `aspect`, everything outside `window.PICTURE` does. A strip missing from some sample is still a card. The flicker mutation box goes to the same relative spot inside the picture left by the frame's black bars (lines at least 90% black from both edges, as thick on each side, leaving at least a quarter of the frame as picture; a caption or logo inside a bar does not break it), and is white instead of black when that spot is dark (CHECKS.md names it on a `FLICKER_MUTATION_BOX` line) (a black box on black changed nothing: `MUTATION_NOT_CAUGHT` on a 2.35:1 video). `check_clearance --mutate detach` prints `MUTATION_SKIP` whenever nothing could be detached, also when the scene already fails the real run for another reason. (#33)

**Contact shadows behind see-through things (#34)**

Fix: the `cinema` look's contact shadows (SAO) drew black boxes and dots behind see-through things.

- The SAO depth and normal passes drew every object as an opaque surface. A turned glass pane went black (81 % of its box in the synthetic test scene), sprites became dark squares, `Points` particles dark dots, and additive light beams dark streaks. These passes now leave out see-through objects: materials under 0.5 opacity, with `transmission`, with `depthWrite: false` or additive blending, and all `Points` and sprites. The 0.5 limit is the same one `look.js` and KIT fades already use, so a part that fades in gets its contact shadow halfway through the fade and not as a jump on the last frame.
- Lens-flare ghosts at strength 0 (additive sprites with `depthTest: false`) no longer print a row of black squares. Relief and clean scenes keep the fix: their clay copies stay off too.
- Opaque objects keep their contact and corner shadows unchanged (same numbers before and after in the test scene). On a project with see-through ground overlays, contact shadows under a bucket and tracks now reach the ground.
- `tests/test_sao_numbers.sh` checks a glass pane, an almost invisible pane, particles and a beam in front of a wall, and a copy with the fix undone must fail it.

**Fixes**

- `check_motion`: an `actreverse` mutation with nothing to reverse is `MUTATION_SKIP`, not `MUTATION_NOT_CAUGHT`; a caught one is always caught; an exhaust is not a reversible target; a teleport row under another mutation no longer raises (#22).
- `check_motion`: a caught `textstill` mutation also exits 1, so `rv` counts it as caught (it printed `MUTATION_CAUGHT` but exited 0 and showed as `MUTATION_NOT_CAUGHT` on a real project) (#27).
- `scripts/pre-push`: scans a branch from its merge-base with the remote main, so a rebased branch no longer trips on commits already on main (#24); it also leaves out history already published on any remote branch and refuses to pass when a tree or history read fails (#29).
- `check_clearance`: sleeve detach mutations now open a real gap (#26); enclosing attachments are detached before they are tested, and skipped detach trials say why (#28).
- `examples/hello`: the Plate and Probe labels fade in and out (#28). MAINTAINING: install the tag into a `dori heavy` helper's rv bundle too (#28).
- Combined regression on the release main (503f02e) against v0.2.1, `rv check` on the two regression projects: mutations caught 33 -> 35 (project A) and 25 -> 27 (project B), none missed, both PASS, and the same new `TEXT_MOTION` and `cut` lines as the #19 run. Check time A 227 -> 288 s, B 905 -> 508 s; other jobs shared the machine during these runs, so the times are rough.

**Known issue**

- A seated figure on the new body can sit deeper in a seat than the old one (worst human penetration 663 mm vs 477 mm in a seated-operator scene, `check_clearance --rules mesh`). To be fixed in v0.3.1 (#36).

### 한국어

rv 0.3.0: 글자가 떠 있는 동안 그 옆 화면에 의미 있는 움직임이 이어지고, 움직임으로 보이기 힘든 뜻은 풍부한 정지 그림이 채우며, 카드가 대상을 자르지 않게 한다. script.json 으로 레터박스·필러박스 화면을 고를 수 있다. 사람은 매끈한 몸으로 자연스럽게 걷고 누르며, 접촉 그림자가 비치는 것 뒤를 검게 칠하지 않는다.

**글자 옆 움직임·정지 그림·카드에 잘림 없음 (#19)**

글자가 떠 있는 동안 rv 는 글자가 가리지 않은 화면에서 의미 있는 움직임을 요구하고, 움직임으로 보이기 힘든 뜻은 풍부한 정지 그림으로 채우는 것을 인정하며, 카드가 대상을 가린 것처럼 보이면 잡는다.

- 새 검사 `TEXT_MOTION`(`check_motion`): 글자 구간 = 한 장면에서 카드·이름표·자막이 떠 있고 카메라가 2 cm 안에 서 있는 동안(전환 구간 빼고, 2 s 이상). 0.25 s 마다 글자 없이 3D 그림만 찍고 글자 상자를 가린 뒤, 가려지지 않은 그림이 2 s 이상 멈춰 있으면(화소 0.5% 미만 변화) 장면·초·글자 상자·대상 화면 위치를 줄에 적어 FAIL. 선언한 `ui-only` 멈춤과 풍부한 정지 그림은 의도로 보고, 화면 80% 넘게 가린 구간은 뺀다. 변이 `textstill`(rv `motion8`)은 통과한 구간 하나를 멈춘다.
- 새 검사 `PICTURE`(`check_motion`): `KIT.info.picture` 는 3 s 이상 다 보이고, 화면 8% 이상이고, 풍부해야 한다(30% 이상이 가장 많은 색과 다르고 색 칸 24개 이상). 빈 판·글자만 있는 그림·잠깐 스치는 그림은 FAIL.
- `check_layout` 가림 `cut`: 카드 하나가 설명 대상이나 움직이는 물체(앞 표본보다 자기 자세가 바뀐 물체)의 10~90% 를 덮으면 FAIL, 정지 그림 위 카드도 FAIL. 카드 뒤 배경 장식은 `KIT.fx.decor(물체)` 로 선언.
- 새 부품: `KIT.shot.free`(카드에 안 가리고 되면 가운데인 서 있는 구도), `KIT.fx.pulse`(숨 쉬는 강조), `KIT.process.spin`(고르게 도는 작동, 대본과 이어짐), `KIT.process.exhaust({path})`(길 따라 흐름), `KIT.info.picture`, `KIT.info.clear`(카드를 물체와 안 겹치는 자리로), `KIT.fx.decor`. `KIT.shot.action` 의 `avoid` 가 카드 요소도 받는다. HOWTO 4-2.
- 새 예시 `examples/text-motion`: 장면 하나를 `still`(TEXT_MOTION FAIL)·`kit`(PASS) 두 가지로.
- 문턱값은 모두 재기 전에 정했다.
- 회귀(v0.2.1 대 이 변경만): 프로젝트 A `rv check` 186 s -> 220 s, 잡힌 변이 33 -> 35; 프로젝트 B 539 s -> 484 s(부하 차이), 25 -> 27; 놓친 변이 0, 판정 그대로. 거기서 나온 새 줄은 프레임으로 본 실제 정지·잘림. (v0.3.0 다른 변경과 합친 수치는 고침 절.)

**사람: CC0 몸과 act() (#23)**

- `KIT.fx.human` 의 몸이 바뀌었다: Quaternius Universal Animation Library 마네킹(CC0 1.0)을 `scripts/human_body.py` 가 킷 관절에 맞게 다시 세우고 가중치를 옮겨 `kit/human_body.js` 로 만든다. 킷이 자세마다 CPU 에서 휘게 하므로 사람은 그대로 15 부위의 보통 메시이고 `check_human`·`check_clearance` 가 자세 그대로의 표면을 잰다. 복식: lab 안전모·장갑·작업화, construction 안전모·가슴과 같이 움직이는 형광 조끼, office 모자 없음, cleanroom 흰 방진복·후드.
- 새 `man.act(t, {walk, look, press})`: 경로에서 발자국을 정해 디딘 발이 미끄러지지 않고, 속도는 서서히 출발·정지, 고개가 먼저 목표를 보고, 손끝이 목표에 닿아 누르고 돌아온다. 2.6 m 걷기 + 버튼 누르기에서 디딘 발 미끄러짐 39 mm(예전 `pose("walk")` + 장면이 위치 이동: 3013 mm), 관절 변화 최대 18.3 도/프레임(예전 자세 바꿈: 72.5), 손끝-버튼 0.5 mm(예전 `point`: 88 mm).
- 예전 장면은 그대로: 부르는 법, 자세 이름, `children[0..5]`, 접촉점, 현장 규칙. 앉은 사람의 접촉점은 새 몸 표면으로 옮겨졌다.
- 검사 시간 전·후: 장면별 옛 -> 새, 같은 부하, 초: check_human 15.9 -> 16.3 / 3.3 -> 3.3 / 7.1 -> 7.3, check_motion 54.5 -> 57.0 / 19.2 -> 19.1 / 54.1 -> 57.4, check_clearance 814 -> 648 / 41.1 -> 41.2 / 123.7 -> 172.6 (앉은 운전자·선 작업자·사무실 태블릿 장면, 판정은 같음).

**레터박스·필러박스 화면 (#31, #33)**

- script.json 에 `"aspect"`: `"2.35:1"` 은 위아래 띠(레터박스), `"4:3"`·`"1:2"` 는 양옆 띠(필러박스)를 장면 위·자막과 단계 표시 아래에 한 번 그린다. 장면은 그대로 16:9 전체를 그리고, `window.PICTURE` 에 그림 영역이 담긴다.
- 검사·변이는 그림 영역만 본다: `check_layout` 은 띠를 대상을 가린 카드로 보지 않고, 깜빡임 변이는 그림 안에 둔다. `aspect` 가 없으면 동작은 그대로. HOWTO 3.
- 장면이 직접 그린 레터박스(`aspect` 없음): `check_layout` 은 화면 한 가장자리에 붙은 불투명 검은 띠(전폭이면 높이 1/4 이하, 전고면 폭 1/4 이하)가 맞은편에 같은 두께의 짝과 함께 모든 샘플에서 같은 자리에 있으면 막대로 본다(`LAYOUT_PICTURE bars=`). 그 밑은 가린 것이 아니라 그림 밖으로 센다. `aspect` 가 있으면 `window.PICTURE` 밖 전부가 그렇다. 어느 샘플에서 없는 띠는 그대로 카드. 깜빡임 변이 상자는 그 프레임의 검은 막대(가장자리부터 90% 넘게 검은 행·열, 양쪽 같은 두께, 사이 그림 1/4 이상)를 뺀 그림 안 같은 비율 자리에 넣고, 그 자리가 어두우면 검정 대신 흰색(CHECKS.md 변이 칸에 `FLICKER_MUTATION_BOX` 줄)(검은 자리에 검정은 바뀌는 게 없어 2.35:1 영상에서 `MUTATION_NOT_CAUGHT`). `check_clearance --mutate detach` 는 떼어 볼 부품이 하나도 없으면, 장면이 다른 이유로 실제 검사에서 FAIL 이어도 `MUTATION_SKIP`. (#33)

**비치는 것 뒤 접촉 그림자 (#34)**

고침: `cinema` look 의 접촉 그림자(SAO)가 비치는 것 뒤에 검은 네모·점을 그리던 것.

- SAO 깊이·법선 패스가 모든 물체를 불투명 면으로 그렸다. 돌려 놓은 유리판이 검게(합성 시험 장면에서 판 상자의 81 %), 스프라이트는 검은 네모, `Points` 입자는 검은 점, additive 빛줄기는 검은 줄이 돼다. 이제 이 패스는 비치는 것을 뺀다: 불투명도 0.5 미만, `transmission`, `depthWrite: false`, additive 재질과 모든 `Points`·스프라이트. 0.5 는 `look.js` 와 KIT 페이드가 이미 쓰는 경계라, 나타나는 부품의 접촉 그림자가 페이드 마지막 프레임에 톡 생기지 않고 반쯤 보일 때 들어온다.
- 세기 0 렌즈 플레어 고스트(가산 스프라이트, `depthTest: false`)가 검은 네모 줄을 찍지 않는다. relief·clean 장면도 클레이 사본까지 꺼져 같다.
- 불투명 물체의 접촉·모서리 그늘은 그대로다(시험 장면에서 전후 수치 같음). 비치는 바닥 덮개가 있는 프로젝트에선 버킷·트랙 밑 접촉 그림자가 이제 바닥에 닿는다.
- `tests/test_sao_numbers.sh` 가 벽 앞 유리판·거의 투명한 판·입자·빛줄기를 재고, 고침을 되돌린 사본은 걸려야 한다.

**고침**

- `check_motion`: 거꾸로 돌릴 핸들이 없는 `actreverse` 변이는 `MUTATION_NOT_CAUGHT` 대신 `MUTATION_SKIP`, 잡힌 것은 늘 잡힘, 배기는 거꾸로 돌릴 대상이 아님, 다른 변이 아래 순간이동 줄이 오류를 내지 않음(#22).
- `check_motion`: 잡힌 `textstill` 변이도 종료 1 을 내 `rv` 가 잡힘으로 센다(실제 프로젝트에서 `MUTATION_CAUGHT` 를 찍고도 종료 0 이라 `MUTATION_NOT_CAUGHT` 로 보였음)(#27).
- `scripts/pre-push`: 원격 main 과의 merge-base 부터 스캔해, rebase 한 브랜치가 이미 main 에 있는 커밋에 걸리지 않음(#24). 어느 원격 브랜치에든 이미 올라간 기록은 빼고, 트리·기록 읽기가 실패하면 통과시키지 않음(#29).
- `check_clearance`: 소매 떼기 변이가 실제 틈을 만든다(#26). 감싼 부착물은 떼어 본 뒤 시험하고, 건너뛴 떼기 시험은 이유를 적는다(#28).
- `examples/hello`: Plate·Probe 이름표가 부드럽게 들어오고 나간다(#28). MAINTAINING: 태그를 `dori heavy` 도우미의 rv 묶음에도 설치(#28).
- 출시 main(503f02e) 대 v0.2.1 합친 회귀(두 회귀 프로젝트 `rv check`): 잡힌 변이 33 -> 35(프로젝트 A), 25 -> 27(프로젝트 B), 놓침 0, 둘 다 PASS, 새 `TEXT_MOTION`·`cut` 줄은 #19 때와 같다. 검사 시간 A 227 -> 288 s, B 905 -> 508 s. 돌릴 때 다른 일이 기계를 같이 써서 시간은 대략이다.

**알려진 문제**

- 새 몸으로 앉힌 사람이 옛 몸보다 좌석에 더 깊이 박힐 수 있다(앉은 운전자 장면에서 사람 관통 최대 663 mm, 옛 477 mm, `check_clearance --rules mesh`). v0.3.1 에서 고침(#36).

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
