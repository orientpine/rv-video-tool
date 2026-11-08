#!/usr/bin/env bash
# Installs one tagged rv release into a folder, replacing what is there (old copy kept beside it).
#   install.sh <repo (path or URL)> <tag> [prefix]     prefix default: ~/.local/share/rv-video-tool
# One line:  bash install.sh <repo> v0.1.0 ~/.local/share/rv-video-tool
# Content = exactly the files of <tag> (git archive) + VERSION; nothing else is written.
set -euo pipefail
REPO="${1:?usage: install.sh <repo> <tag> [prefix]}"; TAG="${2:?usage: install.sh <repo> <tag> [prefix]}"
PREFIX="${3:-$HOME/.local/share/rv-video-tool}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git clone -q --depth 1 --branch "$TAG" "$REPO" "$TMP/src" 2>/dev/null || git clone -q --branch "$TAG" "$REPO" "$TMP/src"
mkdir -p "$TMP/new"
git -C "$TMP/src" archive "$TAG" | tar -x -C "$TMP/new"
chmod 700 "$TMP/new"
mkdir -p "$(dirname "$PREFIX")"
if [[ -e "$PREFIX" ]]; then
  BAK="$PREFIX.bak-$(date -u +%Y%m%dT%H%M%SZ)"
  mv "$PREFIX" "$BAK"; echo "old copy kept: $BAK"
fi
mv "$TMP/new" "$PREFIX"
echo "installed rv $TAG ($(cat "$PREFIX/VERSION" 2>/dev/null || echo '?')) -> $PREFIX"
