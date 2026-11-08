#!/usr/bin/env bash
# Issue #17: exercise the real hook and scanner with a local bare remote.
# An optional hook path lets the same cases demonstrate the pre-fix failure.
set -euo pipefail
TOOL="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="${1:-$TOOL/scripts/pre-push}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
export GIT_AUTHOR_NAME="rv maintainers" GIT_COMMITTER_NAME="rv maintainers"
export GIT_AUTHOR_EMAIL="rv@users.noreply.github.com" GIT_COMMITTER_EMAIL="rv@users.noreply.github.com"
export RV_SCAN_PATTERNS="$T/patterns" RV_SCAN_EXTRA="" RV_SCAN_ALLOW_IDENTITIES=/dev/null
printf '%s\n' 'SyntheticForbiddenMarker' > "$RV_SCAN_PATTERNS"
g() { GIT_MASTER=1 git "$@"; }
g init -q --bare --initial-branch=main "$T/remote.git"
g init -q --initial-branch=main "$T/repo"
cd "$T/repo"
mkdir scripts
cp "$TOOL/scripts/scan-public.sh" scripts/
g add scripts
g commit -qm "Initial tree"
g remote add origin "$T/remote.git"
g push -q origin main
g switch -qc topic
echo clean > topic.txt
g add topic.txt
g commit -qm "Topic change"
g push -q origin topic
old_remote="$(g rev-parse HEAD)"
g switch -q main
echo upstream > upstream.txt
g add upstream.txt
GIT_COMMITTER_NAME=SyntheticForbiddenMarker g commit -qm "Upstream change"
g push -q origin main
g switch -q topic
g rebase origin/main > "$T/rebase.log" 2>&1
# This is a non-fast-forward update: the old topic tip is not an ancestor.
if g merge-base --is-ancestor "$old_remote" HEAD; then
  echo "FAIL fixture did not rewrite the topic commit"; exit 1
fi
clean_tip="$(g rev-parse HEAD)"
ZERO=0000000000000000000000000000000000000000
fail=0
check() {
  local name="$1" expected="$2" remote_sha="$3" code=0
  printf 'refs/heads/topic %s refs/heads/topic %s\n' "$(g rev-parse HEAD)" "$remote_sha" |
    bash "$HOOK" origin "$T/remote.git" > "$T/hook.log" 2>&1 || code=$?
  if [[ "$code" == "$expected" ]] &&
    { [[ "$expected" == 0 ]] || grep -q 'private-patterns(1).* [1-9]' "$T/hook.log"; }; then
    echo "PASS $name (exit $code)"
  else
    echo "FAIL $name (expected $expected, got $code)"
    cat "$T/hook.log"
    fail=1
  fi
}
check rebased-force-push 0 "$old_remote"
check new-branch-clean 0 "$ZERO"

# A leak earlier in the branch must be caught even when the tip is clean.
g switch -qc own-message "$clean_tip"
g commit -q --allow-empty -m "SyntheticForbiddenMarker"
g commit -q --allow-empty -m "Clean tip"
check own-message-force-push 1 "$old_remote"
check new-branch-own-message 1 "$ZERO"

g switch -qc own-patch "$clean_tip"
echo SyntheticForbiddenMarker > transient.txt
g add transient.txt
g commit -qm "Add transient text"
g rm -q transient.txt
g commit -qm "Remove transient text"
check own-removed-patch-force-push 1 "$old_remote"
check new-branch-own-removed-patch 1 "$ZERO"

g switch -qc own-identity "$clean_tip"
GIT_COMMITTER_NAME=SyntheticForbiddenMarker g commit -q --allow-empty -m "Own identity"
g commit -q --allow-empty -m "Clean tip"
check own-identity-force-push 1 "$old_remote"

[[ "$fail" == 0 ]] && echo "PRE_PUSH_TESTS PASS" || { echo "PRE_PUSH_TESTS FAIL"; exit 1; }
