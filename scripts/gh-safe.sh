#!/usr/bin/env bash
# Posts a pull request body, a comment or release notes only after scripts/scan-public.sh prints 0 for it.
#   scripts/gh-safe.sh pr-create     <file> [gh pr create args]       gh pr create --body-file
#   scripts/gh-safe.sh pr-edit       <file> <pr> [--title T] [-R o/r] gh api -X PATCH .../pulls/<pr> (gh pr edit
#                                                                     fails on the classic-projects GraphQL error)
#   scripts/gh-safe.sh pr-comment    <file> <pr> [args]               gh pr comment --body-file
#   scripts/gh-safe.sh issue-comment <file> <issue> [args]            gh issue comment --body-file
#   scripts/gh-safe.sh release-notes <file> <tag> [args]              gh release create --notes-file
#   scripts/gh-safe.sh release-edit  <file> <tag> [args]              gh release edit --notes-file
# The text file and every other argument (title, labels, ...) are scanned with the same private patterns
# as a pushed tree (~/.config/rv-video-tool/scan-patterns unless RV_SCAN_PATTERNS says otherwise).
# On any non-zero count, a missing pattern file or a scan failure nothing is posted, only the check
# names and line numbers are printed (never the matched text), and the exit code is 1.
# GitHub keeps every revision of a body or comment and the API cannot delete one, so scanning after
# posting is too late.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

usage() { echo "usage: gh-safe.sh pr-create|pr-edit|pr-comment|issue-comment|release-notes|release-edit <file> [gh args]" >&2; exit 2; }
[[ $# -ge 2 ]] || usage
cmd="$1"; file="$2"; shift 2
case "$cmd" in
  pr-create)     gh_cmd=(pr create);      flag=--body-file ;;
  pr-edit)       gh_cmd=(pr edit);        flag=--body-file ;;
  pr-comment)    gh_cmd=(pr comment);     flag=--body-file ;;
  issue-comment) gh_cmd=(issue comment);  flag=--body-file ;;
  release-notes) gh_cmd=(release create); flag=--notes-file ;;
  release-edit)  gh_cmd=(release edit);   flag=--notes-file ;;
  *) usage ;;
esac

# Text may only come from the scanned file: refuse every other way gh takes a body or notes.
for a in "$@"; do
  case "$a" in
    -b|-b?*|--body|--body=*|-F|-F?*|--body-file|--body-file=*|-n|-n?*|--notes|--notes=*|--notes-file|--notes-file=*|\
    --notes-start-tag|--notes-start-tag=*|--generate-notes|--notes-from-tag|-e|--editor|-w|--web|-T|-T?*|--template|--template=*|\
    -f|--fill|--fill-first|--fill-verbose|--edit-last|--create-if-none)
      echo "gh-safe: $a is not allowed; the text comes only from <file>; nothing posted" >&2; exit 1 ;;
  esac
done
if [[ ! -f "$file" || ! -r "$file" ]]; then echo "gh-safe: cannot read $file; nothing posted" >&2; exit 1; fi
if [[ ! -s "$file" ]]; then echo "gh-safe: $file is empty; nothing posted" >&2; exit 1; fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/scan"
# gh is given this copy, so the posted bytes are the scanned bytes even if <file> changes meanwhile.
cp "$file" "$work/scan/text.txt" || { echo "gh-safe: cannot copy $file; nothing posted" >&2; exit 1; }
printf '%s\n' "$@" > "$work/scan/args.txt"

code=0
bash "$ROOT/scripts/scan-public.sh" "$work/scan" > "$work/scan.out" 2>&1 || code=$?
if [[ $code != 0 ]]; then
  # scan output lists the matching text; print only where it is.
  awk '
    /^[^ ].* [0-9]+$/ { check = $1; n = $NF; next }
    /^    / && match($0, /(text|args)\.txt:[0-9]+/) {
      split(substr($0, RSTART, RLENGTH), p, ".txt:")
      where = (p[1] == "text" ? "text" : "argument") " line " p[2]
      if (!(check SUBSEP where in seen)) { seen[check, where] = 1; lines[check] = lines[check] (lines[check] == "" ? "" : ", ") where }
      next }
    END { for (c in lines) printf "gh-safe: %s: %s\n", c, lines[c] }
  ' "$work/scan.out" >&2
  awk '/^[^ ].* [0-9]+$/ && $NF != 0 { printf "gh-safe: %s count %s\n", $1, $NF }' "$work/scan.out" >&2
  if [[ $code == 2 ]]; then echo "gh-safe: private pattern file missing or unreadable; nothing posted" >&2
  else echo "gh-safe: leak scan exit $code; nothing posted" >&2; fi
  exit 1
fi
if [[ "$cmd" == pr-edit ]]; then
  pr="${1:-}"; shift || true
  [[ "$pr" =~ ^[0-9]+$ ]] || { echo "gh-safe: pr-edit needs a pull request number; nothing posted" >&2; exit 1; }
  repo='{owner}/{repo}'; api=(-F "body=@$work/scan/text.txt")
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -R|--repo) [[ $# -ge 2 ]] || usage; repo="$2"; shift 2 ;;
      -t|--title) [[ $# -ge 2 ]] || usage; api+=(-f "title=$2"); shift 2 ;;
      *) echo "gh-safe: pr-edit takes only --title and --repo; nothing posted" >&2; exit 1 ;;
    esac
  done
  gh api -X PATCH "repos/$repo/pulls/$pr" "${api[@]}" > /dev/null
  exit
fi
exec gh "${gh_cmd[@]}" "$flag" "$work/scan/text.txt" "$@"
