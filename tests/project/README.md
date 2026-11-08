# Synthetic workshop fixture

Original primitive geometry and English narration, with no external assets.
Run `python3 tests/prepare_project.py` to build it entirely offline with FFmpeg.
`narration.flac` contains only the original English lines in `script.json`,
spoken locally with FFmpeg flite's `slt` voice and mastered to -16 LUFS.
The recording avoids requiring a speech engine or a cloud service at test time.
Generated files live in the ignored `build/` directory.

The fixed 36-second timeline is deliberately a test contract: `need` is outdoor
at 0–8 seconds, `chamber` is indoor at 8–12, `hold` is relief at 12–24, and `map`
is cinema at 24–36. Each theme run meets the 12-second minimum. Probes sample
the moving chamber at 10.2 seconds and the theme boundary at 24 seconds.

`shutter_ring.module.js` temporarily replaces `chamber` for the shutter test.
Its fine luminous ring has a periodic intensity at half the frame rate, like
a ring lit by a pulsed lamp. Full-frame exposure integrates the pulses; a
half-frame shutter leaves visible alternating frames.
