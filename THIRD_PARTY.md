# Third-party code

| Path | What | License |
|---|---|---|
| `vendor/three-0.147.0.min.js` | three.js r147 | MIT, Copyright 2010-2022 three.js authors |
| `vendor/GLTFLoader.js`, `vendor/OBJLoader.js` | three.js r147 `examples/js` loaders | MIT (same) |
| `kit/human_body.js` | Body mesh of `KIT.fx.human`: the mannequin of the Quaternius Universal Animation Library (free version, https://quaternius.com/packs/universalanimationlibrary.html, mirrored at https://github.com/J-Ponzo/gltf-universal-animation-library commit e24c23c), re-posed and re-weighted by `scripts/human_body.py`; no animation clip is kept | CC0 1.0 (public domain dedication) |
| `vendor/post/*.js` | three.js r147 `examples/js` post-processing passes and shaders | MIT (same), text in `vendor/post/LICENSE-three.txt` |

Python packages are not vendored; `uv` fetches them at run time: playwright, pillow, numpy, edge-tts.
System tools: ffmpeg / ffprobe, a Chromium build (playwright's, or `RV_CHROME`).
