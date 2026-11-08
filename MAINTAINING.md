# Maintaining rv

## How a fix reaches an install
1. Branch, fix, and update tests and docs (README, HOWTO, RELEASES) in the same pull request.
2. Review: every change goes through a pull request with at least one review and a green `test` workflow before it is merged to `main`.
3. Tag: `vX.Y.Z` (Z for fixes, Y for features). Add a Korean and English note to [RELEASES.md](RELEASES.md) and the GitHub release page.
4. Install from the tag, never from a branch: `bash scripts/install.sh https://github.com/orientpine/rv-video-tool vX.Y.Z ~/.local/share/rv-video-tool`. The old copy stays beside it as `<folder>.bak-<time>`.
5. Verify: `bash scripts/verify.sh <install folder>` prints `RV_TREE <sha256> <files>`. Run the same command on the tag's files (`git archive vX.Y.Z | tar -x -C <dir>`); the two lines must match. On one machine `diff -r -x VERSION <install folder> <dir>` must print nothing.

## Tests
- `bash scripts/test.sh` runs every test and ends with `RV_TESTS PASS (n)` or `RV_TESTS FAIL <names>`. `bash scripts/test.sh <name ...>` runs only those.
- CI (`.github/workflows/test.yml`) runs the same script plus the regex part of the leak scan on every pull request.

## Leak scan and export
- `bash scripts/scan-public.sh <dir> [--git]`: gitleaks (when installed) plus private IPs, tokens, e-mail addresses, home paths, chat IDs, forbidden paths, and private patterns from a local file that is never committed (`~/.config/rv-video-tool/scan-patterns`). Any non-zero count exits 1; a missing pattern file exits 2.
- `bash scripts/export.sh <checkout> <rev> <dest> <version> --public` builds a one-commit repository from a commit, drops the paths in its `PRIVATE_ONLY` list, and refuses to commit or tag unless the scan prints 0 for the tree and the new history.
