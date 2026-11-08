#!/usr/bin/env bash
# Builds a fresh-history rv repository from one commit of a working copy.
#   scripts/export.sh <source checkout> <rev> <dest repo dir> <version> [--public]
# Takes only the committed files of <rev> (git archive: nothing uncommitted, ignored or cached),
# never the working copy's history. Default (private, this PC): everything committed.
# --public: also drops PRIVATE_ONLY below and requires scripts/scan-public.sh to print 0 for the
# tree and the new history before it commits/tags; any finding stops it (exit 1), no commit made.
# Creates <dest> as a new git repo with one commit "rv <version>" and tag v<version>.
set -euo pipefail
USAGE="usage: export.sh <source checkout> <rev> <dest repo dir> <version> [--public]"
SRC="${1:?$USAGE}"; REV="${2:?$USAGE}"; DEST="${3:?$USAGE}"; VERSION="${4:?$USAGE}"; MODE="${5:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must be N.N.N: $VERSION" >&2; exit 2; }
mkdir -p "$DEST"
[[ -z "$(ls -A "$DEST")" ]] || { echo "dest not empty: $DEST" >&2; exit 2; }
SHA="$(git -C "$SRC" rev-parse --verify "$REV^{commit}")"
git -C "$SRC" archive "$SHA" | tar -x -C "$DEST"

PRIVATE_ONLY=(upstream-v3 HANDOVER.md tests/fixtures/robots_shutter.module.js)
if [[ "$MODE" == "--public" ]]; then
  ( cd "$DEST" && for p in "${PRIVATE_ONLY[@]}"; do rm -rf -- "$p"; done )
  # public docs replace the internal ones when the source carries them
  for f in README RELEASES; do [[ -f "$DEST/$f.public.md" ]] && mv "$DEST/$f.public.md" "$DEST/$f.md"; done
  bash "$HERE/scan-public.sh" "$DEST" || { echo "scan not 0: no commit, nothing to push" >&2; exit 1; }
elif [[ -n "$MODE" ]]; then echo "$USAGE" >&2; exit 2; fi

printf '%s\n' "$VERSION" > "$DEST/VERSION"
git -C "$DEST" init -q -b main
# repo-local identity: the new history carries no machine or personal name
git -C "$DEST" config user.name "${RV_AUTHOR_NAME:-rv maintainers}"
git -C "$DEST" config user.email "${RV_AUTHOR_EMAIL:-rv@users.noreply.github.com}"
git -C "$DEST" add -A
git -C "$DEST" commit -q -m "rv $VERSION"
git -C "$DEST" tag -a "v$VERSION" -m "rv $VERSION"
[[ "$MODE" == "--public" ]] && { bash "$HERE/scan-public.sh" "$DEST" --git || { echo "history scan not 0" >&2; exit 1; }; }
echo "exported $(git -C "$SRC" rev-parse --short=12 "$SHA") -> $DEST v$VERSION ($(git -C "$DEST" ls-files | wc -l) files, $(git -C "$DEST" rev-list --count HEAD) commit)"
