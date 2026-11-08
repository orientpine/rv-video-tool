#!/usr/bin/env bash
# Prints one fingerprint of an rv folder so two machines/accounts can compare without sharing files.
#   verify.sh <folder>          -> "RV_TREE <sha256> <file count>"
# Covers every file's path + content (sha256), sorted; skips VERSION, .git, caches.
# Same fingerprint on an install and on `git archive <tag>` = the install is exactly that tag.
set -euo pipefail
DIR="$(cd "${1:?usage: verify.sh <folder>}" && pwd)"
cd "$DIR"
list="$(find . -type f ! -path './.git/*' ! -path '*/__pycache__/*' ! -path './.ruff_cache/*' ! -name VERSION ! -name '*.pyc' -print0 \
  | LC_ALL=C sort -z | xargs -0 sha256sum)"
printf 'RV_TREE %s %s\n' "$(printf '%s\n' "$list" | sha256sum | cut -c1-64)" "$(printf '%s\n' "$list" | grep -c .)"
