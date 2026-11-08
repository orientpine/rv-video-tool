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
g() { git "$@"; }
g init -q --bare --initial-branch=main "$T/remote.git"
g init -q --initial-branch=main "$T/repo"
cd "$T/repo"
mkdir scripts
cp "$TOOL/scripts/scan-public.sh" scripts/
g add scripts
g commit -qm "Initial tree"
g remote add origin "$T/remote.git"
g push -q origin main
initial_main="$(g rev-parse HEAD)"
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
  local diagnostic="${4:-private-patterns(1).* [1-9]}" remote_url="${5:-$T/remote.git}"
  printf 'refs/heads/topic %s refs/heads/topic %s\n' "$(g rev-parse HEAD)" "$remote_sha" |
    bash "$HOOK" origin "$remote_url" > "$T/hook.log" 2>&1 || code=$?
  if [[ "$code" == "$expected" ]] &&
    { [[ "$expected" == 0 ]] || grep -q "$diagnostic" "$T/hook.log"; }; then
    echo "PASS $name (exit $code)"
  else
    echo "FAIL $name (expected exit $expected with diagnostic, got $code)"
    cat "$T/hook.log"
    fail=1
  fi
}
check rebased-force-push 0 "$old_remote"
check new-branch-clean 0 "$ZERO"

# Fail real command boundaries without adding switches to the production hook.
RV_TEST_REAL_GIT="$(command -v git)"
RV_TEST_REAL_TAR="$(command -v tar)"
export RV_TEST_REAL_GIT RV_TEST_REAL_TAR
mkdir "$T/fault-bin"
cat > "$T/fault-bin/git" <<'EOF'
#!/usr/bin/env bash
for arg; do
  if [[ "$arg" == "${RV_TEST_FAIL_GIT:-}" ]]; then
    echo "synthetic git $arg failure" >&2
    exit 42
  fi
done
exec "$RV_TEST_REAL_GIT" "$@"
EOF
cat > "$T/fault-bin/tar" <<'EOF'
#!/usr/bin/env bash
if [[ "${RV_TEST_FAIL_TAR:-}" == 1 ]]; then
  echo "synthetic tar failure" >&2
  exit 42
fi
exec "$RV_TEST_REAL_TAR" "$@"
EOF
chmod +x "$T/fault-bin/git" "$T/fault-bin/tar"
PATH="$T/fault-bin:$PATH" RV_TEST_FAIL_GIT=log \
  check git-log-failure 1 "$old_remote" 'cannot read pushed commit history'
PATH="$T/fault-bin:$PATH" RV_TEST_FAIL_GIT=archive \
  check git-archive-failure 1 "$old_remote" 'cannot export pushed tree'
PATH="$T/fault-bin:$PATH" RV_TEST_FAIL_TAR=1 \
  check tar-failure 1 "$old_remote" 'cannot export pushed tree'

# Maintenance history diverges before main's newer commits.
g switch -qc release-x "$initial_main"
echo maintenance > release.txt
g add release.txt
GIT_COMMITTER_NAME=SyntheticForbiddenMarker g commit -qm "Maintenance change"
g push -q origin release-x
g switch -qc maintenance-topic
g commit -q --allow-empty -m "Maintenance clean change"
g commit -q --allow-empty -m "Maintenance clean tip"
check maintenance-branch-clean 0 "$ZERO"
g commit -q --allow-empty -m "SyntheticForbiddenMarker"
g commit -q --allow-empty -m "Clean tip"
check maintenance-branch-own-message 1 "$ZERO"
g switch -q topic

# A published tip has no new history, but its tree must still be scanned.
g switch -qc published-tree
echo SyntheticForbiddenMarker > published.txt
g add published.txt
g commit -qm "Published tree"
g push -q origin published-tree
check published-tree-leak 1 "$ZERO"
g --git-dir="$T/remote.git" update-ref -d refs/heads/published-tree
g switch -q topic

# Matching must not depend on the caller's locale: a byte that is not UTF-8 hides a line from a UTF-8
# grep, and . matches one byte, not one Korean character, in C.
printf '%s\n' '^.*SyntheticForbiddenMarker' '합.금지' > "$T/locale-patterns"
g switch -qc invalid-byte "$clean_tip"
printf 'caf\xe9 SyntheticForbiddenMarker\n' > invalid-byte.txt
g add invalid-byte.txt
g commit -qm "Invalid byte"
LC_ALL=C.UTF-8 RV_SCAN_PATTERNS="$T/locale-patterns" check invalid-byte-utf8-caller 1 "$ZERO" 'private-patterns(2).* [1-9]'
g switch -qc korean-dot "$clean_tip"
printf '%s\n' '합성금지 문구' > korean.txt
g add korean.txt
g commit -qm "Korean text"
LC_ALL=C RV_SCAN_PATTERNS="$T/locale-patterns" check korean-dot-c-caller 1 "$ZERO" 'private-patterns(2).* [1-9]'
g switch -q topic

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

# A commit removed from remote main must not be trusted via a stale tracking ref.
remote_main="$(g --git-dir="$T/remote.git" rev-parse refs/heads/main)"
g switch -qc tracking-ahead "$clean_tip"
g commit -q --allow-empty -m "SyntheticForbiddenMarker"
g update-ref refs/remotes/origin/main "$(g rev-parse HEAD)"
g commit -q --allow-empty -m "Branch built on stale tracking main"
check tracking-ahead-update 1 "$old_remote"

# A public decoy may be excluded, but its private descendant must be scanned.
g push -q origin HEAD^:refs/heads/a/refs/heads/main
first_ref="$(g ls-remote "$T/remote.git" refs/heads/main | awk 'NR == 1 { print $2 }')"
if [[ "$first_ref" != refs/heads/a/refs/heads/main ]]; then
  echo "FAIL fixture did not advertise the decoy first"; exit 1
fi
g commit -q --allow-empty -m "SyntheticForbiddenMarker"
g commit -q --allow-empty -m "Private descendant tip"
check decoy-remote-main 1 "$old_remote"
g --git-dir="$T/remote.git" update-ref -d refs/heads/a/refs/heads/main

g update-ref refs/remotes/origin/main "$remote_main"
g switch -q topic

# The remote advertises a commit that has never been fetched into this clone.
remote_only="$(printf 'Remote-only main\n' |
  g --git-dir="$T/remote.git" commit-tree "$remote_main^{tree}" -p "$remote_main")"
g --git-dir="$T/remote.git" update-ref refs/heads/main "$remote_only"
if g cat-file -e "$remote_only^{commit}" 2>/dev/null; then
  echo "FAIL fixture already has remote-only main"; exit 1
fi
check remote-main-not-fetched 1 "$old_remote" 'fetch origin main first'
g --git-dir="$T/remote.git" update-ref refs/heads/main "$remote_main"
g --git-dir="$T/remote.git" update-ref refs/heads/unfetched "$remote_only"
g switch -qc unfetched-private "$clean_tip"
g commit -q --allow-empty -m "SyntheticForbiddenMarker"
g commit -q --allow-empty -m "Clean tip"
check unfetched-remote-branch 1 "$old_remote"
g switch -q topic
g --git-dir="$T/remote.git" update-ref -d refs/heads/unfetched

check remote-main-unreadable 1 "$old_remote" 'fetch origin main first' "$T/missing.git"
g --git-dir="$T/remote.git" update-ref refs/heads/a/refs/heads/main "$remote_main"
g --git-dir="$T/remote.git" update-ref -d refs/heads/main
check remote-main-missing 1 "$old_remote" 'fetch origin main first'
g --git-dir="$T/remote.git" update-ref refs/heads/main "$remote_main"
g --git-dir="$T/remote.git" update-ref -d refs/heads/a/refs/heads/main

g checkout -q --orphan unrelated "$clean_tip"
g commit -qm "Unrelated root"
check unrelated-history 1 "$old_remote" 'branch is not based on remote main'

[[ "$fail" == 0 ]] && echo "PRE_PUSH_TESTS PASS" || { echo "PRE_PUSH_TESTS FAIL"; exit 1; }
