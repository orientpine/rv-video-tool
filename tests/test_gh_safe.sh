#!/usr/bin/env bash
# scripts/gh-safe.sh with a synthetic pattern and a fake gh: a leak posts nothing and never prints the word.
set -euo pipefail
TOOL="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export RV_SCAN_PATTERNS="$T/patterns" RV_SCAN_EXTRA="" RV_SCAN_ALLOW_IDENTITIES=/dev/null
printf '%s\n' 'SyntheticForbiddenMarker' > "$RV_SCAN_PATTERNS"
mkdir "$T/bin"
cat > "$T/bin/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_SAFE_TEST_LOG"
prev=""
for a; do
  [[ "$prev" == --body-file || "$prev" == --notes-file ]] && cp "$a" "$GH_SAFE_TEST_POSTED"
  [[ "$prev" == -F && "$a" == body=@* ]] && cp "${a#body=@}" "$GH_SAFE_TEST_POSTED"
  prev="$a"
done
exit "${GH_SAFE_TEST_EXIT:-0}"
EOF
chmod +x "$T/bin/gh"
export PATH="$T/bin:$PATH" GH_SAFE_TEST_LOG="$T/gh.log" GH_SAFE_TEST_POSTED="$T/posted"
printf 'Summary\nfixes the SyntheticForbiddenMarker scene\n' > "$T/leak.md"
printf 'Summary\nfixes the dark scene\n' > "$T/clean.md"
: > "$T/empty.md"

fail=0
# run <name> <expected exit> <text that must be in the output, or -> <gh-safe args...>
run() {
  local name="$1" expected="$2" want="$3" code=0; shift 3
  rm -f "$T/gh.log" "$T/posted"
  bash "$TOOL/scripts/gh-safe.sh" "$@" > "$T/out" 2>&1 || code=$?
  local why=""
  [[ "$code" == "$expected" ]] || why="exit $code, expected $expected"
  [[ "$want" == - ]] || grep -qF -- "$want" "$T/out" || why="$why; output lacks '$want'"
  ! grep -q SyntheticForbiddenMarker "$T/out" || why="$why; output shows the matched word"
  if [[ "$expected" == 1 || "$expected" == 2 ]]; then
    [[ ! -e "$T/gh.log" ]] || why="$why; gh was called"
  elif [[ ! -e "$T/gh.log" ]]; then why="$why; gh was not called"; fi
  if [[ -z "$why" ]]; then echo "PASS $name"; else echo "FAIL $name: $why"; cat "$T/out"; fail=1; fi
}

run leak-in-text 1 'private-patterns(1): text line 2' pr-create "$T/leak.md" --title "Fix the dark scene"
run leak-in-title 1 'private-patterns(1): argument 2' pr-create "$T/clean.md" --title "Fix SyntheticForbiddenMarker"
run leak-in-comment 1 'nothing posted' pr-comment "$T/leak.md" 41
run leak-in-release-notes 1 'nothing posted' release-notes "$T/leak.md" v9.9.9 --title v9.9.9
RV_SCAN_PATTERNS="$T/missing" run missing-pattern-file 1 'pattern file missing' pr-edit "$T/clean.md" 41
run body-flag-bypass 1 'is not allowed' pr-comment "$T/clean.md" 41 --body "other text"
run body-file-bypass 1 'is not allowed' pr-edit "$T/clean.md" 41 --body-file=/dev/null
run editor-bypass 1 'is not allowed' pr-create "$T/clean.md" --web
run empty-file 1 '<file> is empty' pr-comment "$T/empty.md" 41
run unknown-command 2 'usage' pr-merge "$T/clean.md" 41
run pr-edit-without-number 1 'positional arguments' pr-edit "$T/clean.md" --title x
run pr-edit-not-a-number 1 'needs a pull request number' pr-edit "$T/clean.md" main
run pr-edit-other-argument 1 'is not allowed' pr-edit "$T/clean.md" 41 --add-label x
run combined-short-body-flag 1 'argument 3 is not allowed' pr-create "$T/clean.md" -t ok -dF "$T/leak.md"
run combined-short-web-flag 1 'is not allowed' release-notes "$T/clean.md" v9.9.9 -dw
run recover-file 1 'is not allowed' pr-create "$T/clean.md" -t ok --recover "$T/leak.md"
run release-asset 1 'positional arguments' release-notes "$T/clean.md" v9.9.9 "$T/leak.md"
run refused-value-not-printed 1 'argument 2 is not allowed' pr-comment "$T/clean.md" 41 --body=SyntheticForbiddenMarker
run pr-create-without-title 1 'needs --title' pr-create "$T/clean.md" --base main
printf 'Summary\0\nfixes the SyntheticForbiddenMarker scene\n' > "$T/nul.md"
run nul-byte-body 1 'is not plain UTF-8 text' pr-comment "$T/nul.md" 41
printf '# only a comment\n' > "$T/comments-only"
RV_SCAN_PATTERNS="$T/comments-only" run pattern-file-without-patterns 1 'no private pattern was checked' pr-comment "$T/clean.md" 41
printf 'Unclosed(\n' > "$T/bad-pattern"
RV_SCAN_PATTERNS="$T/bad-pattern" run invalid-pattern-is-an-error 1 'scan-errors count' pr-comment "$T/clean.md" 41
mkdir "$T/fault-bin"
GH_SAFE_TEST_REAL_GREP="$(command -v grep)"; export GH_SAFE_TEST_REAL_GREP
cat > "$T/fault-bin/grep" <<'EOF'
#!/usr/bin/env bash
for a; do [[ "$a" == -rInP ]] && { echo "synthetic grep failure" >&2; exit 2; }; done
exec "$GH_SAFE_TEST_REAL_GREP" "$@"
EOF
chmod +x "$T/fault-bin/grep"
PATH="$T/fault-bin:$PATH" run grep-that-cannot-run 1 'scan-errors count' pr-create "$T/leak.md" --title ok
run repo-path-escape 1 'owner/name' pr-edit "$T/clean.md" 41 -R o/r/../../x
run repo-overridden-by-later-flag 1 'argument 4: --repo must be owner/name' pr-comment "$T/clean.md" 41 --repo o/r -R ghe.example.org/o/r
printf 'caf\xe9 SyntheticForbiddenMarker\n' > "$T/latin1.md"
run invalid-utf8-body 1 '<file> is not plain UTF-8 text' release-notes "$T/latin1.md" v9.9.9 --title v9.9.9
run invalid-utf8-title 1 'argument 2 is not plain UTF-8 text' pr-create "$T/clean.md" --title "$(printf 'SyntheticForbiddenMarker \xff')"
run refused-flag-name-not-printed 1 'argument 1 is not allowed' pr-comment "$T/clean.md" --SyntheticForbiddenMarker
run unread-file-path-not-printed 1 'cannot read <file>' pr-comment "$T/SyntheticForbiddenMarker-notes.md" 41
run leak-in-pr-edit-title 1 'argument 3' pr-edit "$T/clean.md" 41 --title "SyntheticForbiddenMarker"
GH_SAFE_TEST_EXIT=3 run gh-failure-passes-through 3 - pr-comment "$T/clean.md" 41

run clean-pr-create 0 - pr-create "$T/clean.md" --title "Fix the dark scene" --base main
if grep -qx -- "pr create --body-file .*text.txt --title Fix the dark scene --base main" "$T/gh.log" &&
  cmp -s "$T/clean.md" "$T/posted"; then
  echo "PASS clean-pr-create-posts-scanned-text"
else
  echo "FAIL clean-pr-create-posts-scanned-text"; cat "$T/gh.log" 2>/dev/null; fail=1
fi
run clean-pr-edit 0 - pr-edit "$T/clean.md" 41 -R o/r --title "Fix the dark scene"
if grep -qx -- "api -X PATCH repos/o/r/pulls/41 -F body=@.*text.txt -f title=Fix the dark scene" "$T/gh.log" &&
  cmp -s "$T/clean.md" "$T/posted"; then
  echo "PASS clean-pr-edit-posts-scanned-text"
else
  echo "FAIL clean-pr-edit-posts-scanned-text"; cat "$T/gh.log" 2>/dev/null; fail=1
fi
run clean-pr-edit-default-repo 0 - pr-edit "$T/clean.md" 41
if grep -qx -- "api -X PATCH repos/{owner}/{repo}/pulls/41 -F body=@.*text.txt" "$T/gh.log"; then
  echo "PASS clean-pr-edit-default-repo-path"
else
  echo "FAIL clean-pr-edit-default-repo-path"; cat "$T/gh.log" 2>/dev/null; fail=1
fi
run clean-release-notes 0 - release-notes "$T/clean.md" v9.9.9 --verify-tag
if grep -qx -- "release create --notes-file .*text.txt v9.9.9 --verify-tag" "$T/gh.log" &&
  cmp -s "$T/clean.md" "$T/posted"; then
  echo "PASS clean-release-notes-posts-scanned-text"
else
  echo "FAIL clean-release-notes-posts-scanned-text"; cat "$T/gh.log" 2>/dev/null; fail=1
fi

[[ "$fail" == 0 ]] && echo "GH_SAFE_TESTS PASS" || { echo "GH_SAFE_TESTS FAIL"; exit 1; }
