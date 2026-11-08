# AGENTS.md: making and fixing rv videos for a user

This file is for coding agents (Claude Code, Codex and similar) working in this repository. A user will usually give you a one- or two-line job, the way they would brief a colleague:

- "Make a 3-minute explainer video from this script and these notes. Keep going until rv check passes."
- "In this video, the part where the lid opens: the lid pops in. Fix it."
- "Make the checks faster, but don't lower the quality."

Your job is to finish it end to end with the tools in this repo, then hand the user a video they can watch. Reply to the user in the language they wrote in.

Read these when you need detail. This file tells you the order of work and the rules.

- [README.md](README.md): install, commands, the scene kit in short, what each check catches.
- [HOWTO.md](HOWTO.md) (Korean): the full project guide. Section 4 = KIT helpers, section 4-0 = camera rules, section 5 = reading `CHECKS.md` and how to fix each failure.
- `examples/hello/`: a small project that passes every check in strict mode. Copy its patterns.

## 0. Setup (once)

Run rv from this checkout: `./rv <command> <project>`. You don't need the install script. Check the requirements first:

```
uv --version && ffmpeg -version | head -1 && ffprobe -version | head -1 && python3 --version
uv run --no-project --with playwright playwright install chromium   # or set RV_CHROME to an existing Chromium
```

If `uv`, `ffmpeg` or a Chromium is missing and you can't install it yourself, tell the user exactly what to install. The narration (edge-tts) needs network the first time each line is spoken. After that it's cached.

## 1. Start a project from the example

Keep user projects in `projects/` (git-ignored), one folder each:

```
mkdir -p projects && cp -r examples/hello projects/<name>
```

Then edit `projects/<name>/script.json`:

- `"name"`: the output file name (`out/<name>.mp4`).
- `"voice"`: an edge-tts voice in the user's language, e.g. `en-US-AriaNeural`, `ko-KR-SunHiNeural`, `ko-KR-InJoonNeural`.
- Keep `"checks": "strict"`. Without it most checks only report and never fail, so a PASS would mean little.
- Set `"site"` (`lab`, `construction` or `office`) to where the story takes place. People in the video are dressed for it.
- `"scenes"`: one entry per scene folder, in order, with a `dip` transition between scenes like the example. `extra_s` adds seconds after the last line of a scene.
- `"lines"`: `{"scene", "text", "keywords"}`. `text` is narrated and shown as captions (`|` splits a caption). `say` overrides what is spoken. `keywords` must be words from that line. The scene highlights them on screen at the moment they're spoken.

Length: narration speed sets the length. About 2.5 English words or 6 to 7 Korean syllables per second, plus `extra_s` and transitions. For a 3-minute video, plan about 25 to 35 lines over 5 to 8 scenes. Run `./rv board` early and read the real length from `build/timeline.json` (`total_s`).

Numbers: a digit or spoken number with no source in `sources.json` stops the build (narration) or fails `check_numbers` (screen). Put numbers from the user's material into `sources.json` (HOWTO section 3, "Numbers and sources"), or leave them out.

Scenes: `scenes/<scene>/module.js` registers `SCENES.<scene> = {duration, init(renderer, THREE, overlay), render(t)}`. `deps.json` lists the shared files it loads. Share the 3D set in `shared/`. Copy `examples/hello/scenes/*/module.js`. The rules that keep checks green:

- Every pose is a pure function of `t`. Never keep state from the previous frame.
- Time motion to words: `KIT.wordT(NAME, "keyword")`, not hand-typed seconds. Set `window.HL` to the keyword while it's highlighted.
- Keep the camera still while captions, labels or cards change. Move it for an action, with `KIT.shot.action(...)` (one push-in or orbit, 3 s at most, after the transition). Keep it still during transitions and put it in place at scene `t = 0` (HOWTO 4-0).
- Fade or grow things in. Never switch them on in one frame: `KIT.fx.reveal(obj, KIT.win(t, a, b, 0.4))`, `label.place(..., KIT.win(t, a, b, 0.3))`. Otherwise `POP_IN` fails.
- If a line says something moves ("opens the lid", "turns the valve"), that part must really move then and be named, so `ACTION_MATCH` can find it: `KIT.process.*` (HOWTO 4-1). The part should sit near the frame centre (`SUBJECT_FRAME`).
- Draw people only with `KIT.fx.human`. Use `KIT.label(overlay, text, {target})` for name tags.
- No caption on screen when a transition starts. End each scene with a short line and a few seconds of `extra_s`.

## 2. The work loop (fast to slow)

| Step | Command | Time (3-min video) |
|---|---|---|
| Look at a few moments | `./rv still projects/<name> 12.5 40` (PNGs in `build/stills/`) | seconds |
| Storyboard per scene | `./rv board projects/<name>` (`out/board/`) | seconds per scene |
| Whole-flow draft | `./rv preview projects/<name>` (`out/<name>_preview.mp4`, no checks) | a few minutes |
| Final build + checks | `./rv make projects/<name>` | first run roughly 5 to 15 min, later only changed scenes are redrawn |
| Checks only, on the existing mp4 | `./rv check projects/<name>` | a few minutes |

Look at your stills and board images (open the PNG/JPG files) before a full build. Most failures are visible there. `rv make` and `rv check` exit 1 when the verdict is FAIL. That is a result to read, not a crash.

## 3. Reading `out/CHECKS.md`

- The last line is the verdict: `RV_CHECKS PASS` or `RV_CHECKS FAIL`.
- Sections whose heading starts with `## 변이` (Korean for "mutation") are self-tests. rv breaks a copy on purpose, so `FAIL` inside them is expected and `MUTATION_CAUGHT` means the checker works. Don't fix those.
- Real problems are `FAIL` lines in the other sections, plus `CHECK_ERROR`, `PAGE_ERROR` or `MUTATION_NOT_CAUGHT` anywhere. List them with:

```
awk '/^## /{h=$0} /MUTATION_NOT_CAUGHT|CHECK_ERROR|PAGE_ERROR/ || (/FAIL/ && h !~ /^## 변이/) {print h " :: " $0}' projects/<name>/out/CHECKS.md
```

- Each failing line gives the time (`t=`), the scene, the element and the rule. HOWTO section 5 "Common failures and fixes" explains every rule name (`POP_IN`, `TEXT_TRANSITION`, `CAMERA_UI`, `ACTION_MATCH`, `SUBJECT_FRAME`, `LAYOUT`, `THEME_FATIGUE`, ...).
- `CHECKS.timing.tsv` shows which check took the time.

## 4. Fixing failures

Order: build errors first (script, numbers, scene exceptions in the log), then `CHECK_ERROR` and `PAGE_ERROR` (a scene that throws makes checks measure nothing), then the real FAIL lines from the earliest time on. For each one:

1. Look at it: `./rv still projects/<name> <t>`, or `./rv scrub projects/<name> <A> <B>` around a transition.
2. Fix the scene or the script: timing, camera, a fade instead of a pop, a part name, a shorter caption, a longer `extra_s`.
3. Rerun the cheapest thing that shows the fix (a still), then `./rv make` (only changed scenes are redrawn) until the verdict is PASS.

Never do any of these to get a PASS:

- Remove `"checks": "strict"`, or edit thresholds, rules or mutations in `lib/`, `kit/` or `rv`.
- Skip a check, delete `CHECKS.md` lines, or report PASS from a run that didn't finish.
- Remove what the user asked for (a scene, a number, the music) just because it fails. Find another way to show it. If there really is none, ask (section 7).

If a failure isn't caused by your project (a checker traceback on a valid scene, `MUTATION_NOT_CAUGHT`, a build crash inside `lib/`), it's a tool bug. Stop and tell the user, with the `CHECKS.md` lines and `VERSION`, so they can file an issue. Don't patch the tool to get past it.

## 5. Making it faster without lowering quality

- Edit with `rv still`, `rv board` and `rv preview`. Run the full `rv make` when a draft looks right.
- `rv make` only redraws changed scenes. Don't pass `--full` unless shared code (`shared/`, transitions, look) changed and the old frames are wrong. `--from A --to B` also re-captures that time range.
- After changing only checks or the mp4, run `./rv check` instead of `make`.
- `RV_CHECK_JOBS` (default 6) is how many checkers run at once. `RV_CHECK_SHARDS` (default 4) is how many browsers share the long `check_clearance` and `check_layout` runs. `rv make --jobs N` (default 4) sets the capture workers. Raise them on a machine with more cores and memory. Lower them (for example `RV_CHECK_JOBS=2 RV_CHECK_SHARDS=1 ./rv make ... --jobs 2`) if Chromium crashes or the machine runs out of memory. The checks are the same either way.
- `RV_LOOK=off` turns off the cinematic look (depth of field, motion blur, bloom) for one build. That's fine for drafts, but the final build must run with the look the script asks for.

## 6. Done

You're done when all of these are true:

1. The last line of `projects/<name>/out/CHECKS.md` is `RV_CHECKS PASS`, from a full `./rv make` (or `./rv check` after it) on the final files, with `"checks": "strict"` in `script.json`.
2. You opened and looked at the board images and a few stills or `out/sheets/*.jpg` yourself, and they show what the user asked for.
3. You tell the user:
   - where the video is (`out/<name>.mp4`, plus `out/<name>.srt`, `out/<name>_thumb.jpg`)
   - its length
   - how long the build took
   - which FAILs you fixed and how
   - anything you chose for them (voice, scene split, wording you added)

   The user watches the video. Passing checks don't replace that.

## 7. When to ask the user, and when not to

Ask (briefly, with your recommended answer) only when:

- The material contradicts itself, or the user's wishes conflict (for example, length vs. content).
- A number or factual claim has no source you can put in `sources.json`.
- The requested content can't pass a check after a real attempt to show it another way (say what you tried).
- A tool bug blocks you (section 4).
- Something leaves this machine: publishing, uploading, sending, or outside music, images or models whose license you can't confirm.

Don't ask, decide and mention it in your report:

- Scene split, camera framing, colours, layout, label wording and timing.
- Voice, when the user's language makes it clear.
- The script, when you only got a topic. Write it yourself, keep claims general (no numbers without a source), and show it in your report.
- How to fix a FAIL, whether to rerun, and which speed settings to use.
- Short wording tweaks so captions fit or read in time. Keep the meaning, and list any meaning change in your report.

## 8. "Fix this part of this video"

1. Find the moment: the user's time, or the caption text. Search `script.json` lines and `build/timeline.json` for the scene and its start.
2. `./rv still projects/<name> <t>` to see it, then change only that scene or line.
3. Check with stills or `./rv scrub`, then `./rv make` (only the changed scene is redrawn) until `RV_CHECKS PASS`.
4. Report what changed and where, with the new video path.
