# Third-party code

| Path | What | License |
|---|---|---|
| `vendor/three-0.147.0.min.js` | three.js r147 | MIT, Copyright 2010-2022 three.js authors |
| `vendor/GLTFLoader.js`, `vendor/OBJLoader.js` | three.js r147 `examples/js` loaders | MIT (same) |
| `vendor/post/*.js` | three.js r147 `examples/js` post-processing passes and shaders | MIT (same), text in `vendor/post/LICENSE-three.txt` |

Python packages are not vendored; `uv` fetches them at run time: playwright, pillow, numpy, edge-tts.
System tools: ffmpeg / ffprobe, a Chromium build (playwright's, or `RV_CHROME`).
