#!/usr/bin/env bash
# Posts a pull request body, a comment or release notes only after scripts/scan-public.sh prints 0 for it.
#   scripts/gh-safe.sh pr-create     <file> --title T [-B base] [-H head] [-R o/r] [-d] [-l -a -r -m ...]
#   scripts/gh-safe.sh pr-edit       <file> <pr> [--title T] [-R o/r]   (gh api PATCH: gh pr edit fails here
#                                                                        on the classic-projects GraphQL error)
#   scripts/gh-safe.sh pr-comment    <file> [<pr>] [-R o/r]
#   scripts/gh-safe.sh issue-comment <file> [<issue>] [-R o/r]
#   scripts/gh-safe.sh release-notes <file> <tag> [--title T] [--target ref] [--verify-tag] [-d] [-p] [-R o/r]
#   scripts/gh-safe.sh release-edit  <file> <tag> [--title T] [--tag new] [--draft=false] [-R o/r]
# The text file and every argument are scanned with the same private patterns as a pushed tree
# (~/.config/rv-video-tool/scan-patterns unless RV_SCAN_PATTERNS says otherwise). Only the arguments above
# are accepted, so no other text (a second body file, an editor, a template, an asset) reaches gh unscanned.
# On a hit, a missing or empty pattern file, a non-text file or a scan failure nothing is posted, only the
# check names and argument/line numbers are printed (never the matched text), and the exit code is 1.
# GitHub keeps every revision of a body or comment and the API cannot delete one, so scanning after
# posting is too late.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

usage() { echo "usage: gh-safe.sh pr-create|pr-edit|pr-comment|issue-comment|release-notes|release-edit <file> [args]" >&2; exit 2; }
refuse() { echo "gh-safe: $1; nothing posted" >&2; exit 1; }
[[ $# -ge 2 ]] || usage
cmd="$1"; file="$2"; shift 2
args=("$@")
# value flags | boolean flags | min max positional arguments
case "$cmd" in
  pr-create)     spec=("-t --title -B --base -H --head -R --repo -l --label -a --assignee -r --reviewer -m --milestone" "-d --draft --no-maintainer-edit" 0 0) ;;
  pr-edit)       spec=("-t --title -R --repo" "" 1 1) ;;
  pr-comment|issue-comment) spec=("-R --repo" "" 0 1) ;;
  release-notes) spec=("-t --title --target -R --repo --discussion-category" "-d --draft -p --prerelease --verify-tag --latest" 1 1) ;;
  release-edit)  spec=("-t --title --tag --target -R --repo --discussion-category" "--draft --prerelease --verify-tag --latest" 1 1) ;;
  *) usage ;;
esac

# Allow-list, not deny-list: gh also reads combined short flags such as -dF <file>.
declare -A val=()
positional=()
i=0
while [[ $i -lt ${#args[@]} ]]; do
  a="${args[$i]}"; i=$((i + 1))
  if [[ "$a" != -* ]]; then positional+=("$a"); continue; fi
  name="$a"; [[ "$a" == --*=* ]] && name="${a%%=*}"
  shown="argument $i"; [[ "$name" =~ ^--?[A-Za-z][A-Za-z-]*$ ]] && shown="argument $i ($name)"
  if [[ " ${spec[0]} " == *" $name "* ]]; then
    if [[ "$a" == --*=* ]]; then v="${a#*=}"
    else [[ $i -lt ${#args[@]} ]] || refuse "$shown needs a value"; v="${args[$i]}"; i=$((i + 1)); fi
    val[$name]="$v"
  elif [[ " ${spec[1]} " != *" $name "* ]]; then
    refuse "$shown is not allowed for $cmd; the text comes only from <file>"
  fi
done
if [[ ${#positional[@]} -lt ${spec[2]} || ${#positional[@]} -gt ${spec[3]} ]]; then
  refuse "$cmd takes ${spec[2]} to ${spec[3]} positional arguments, got ${#positional[@]}"
fi
repo="${val[--repo]:-${val[-R]:-}}"
if [[ -n "$repo" && ( ! "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ || "$repo" == *..* ) ]]; then refuse "--repo must be owner/name"; fi
if [[ "$cmd" == pr-create && -z "${val[--title]:-${val[-t]:-}}" ]]; then refuse "pr-create needs --title (gh would ask for one and post it unscanned)"; fi
if [[ "$cmd" == pr-edit && ! "${positional[0]}" =~ ^[0-9]+$ ]]; then refuse "pr-edit needs a pull request number"; fi

if [[ ! -f "$file" || ! -r "$file" ]]; then refuse "cannot read $file"; fi
if [[ ! -s "$file" ]]; then refuse "$file is empty"; fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/scan"
# gh is given this copy, so the posted bytes are the scanned bytes even if <file> changes meanwhile.
cp "$file" "$work/scan/text.txt" || refuse "cannot copy $file"
# scan-public.sh greps with -I, which skips a file it takes for binary (a NUL byte): refuse those instead.
if ! tr -d '\000' < "$work/scan/text.txt" | cmp -s - "$work/scan/text.txt" || ! grep -qI '' "$work/scan/text.txt"; then
  refuse "$file is not plain text"
fi
for ((n = 1; n <= ${#args[@]}; n++)); do printf '%s\n' "${args[$((n - 1))]}" > "$work/scan/arg-$n.txt"; done

code=0
bash "$ROOT/scripts/scan-public.sh" "$work/scan" > "$work/scan.out" 2>&1 || code=$?
if [[ $code != 0 ]]; then
  # scan output lists the matching text; print only where it is.
  awk '
    /^[^ ].* [0-9]+$/ { check = $1; next }
    /^    / && match($0, /(text|arg-[0-9]+)\.txt:[0-9]+/) {
      split(substr($0, RSTART, RLENGTH), p, ".txt:")
      where = (p[1] == "text" ? "text line " p[2] : "argument " substr(p[1], 5))
      if (!((check, where) in seen)) { seen[check, where] = 1; lines[check] = lines[check] (lines[check] == "" ? "" : ", ") where }
      next }
    END { for (c in lines) printf "gh-safe: %s: %s\n", c, lines[c] }
  ' "$work/scan.out" >&2
  awk '/^[^ ].* [0-9]+$/ && $NF != 0 { printf "gh-safe: %s count %s\n", $1, $NF }' "$work/scan.out" >&2
  [[ $code == 2 ]] && refuse "private pattern file missing or unreadable"
  refuse "leak scan exit $code"
fi
grep -qE '^private-patterns\([1-9][0-9]*\) ' "$work/scan.out" || refuse "no private pattern was checked (pattern file has no patterns)"

if [[ "$cmd" == pr-edit ]]; then
  api=(-F "body=@$work/scan/text.txt")
  title="${val[--title]:-${val[-t]:-}}"
  [[ -n "$title" ]] && api+=(-f "title=$title")
  gh api -X PATCH "repos/${repo:-{owner\}/{repo\}}/pulls/${positional[0]}" "${api[@]}" > /dev/null
  exit
fi
case "$cmd" in
  pr-create)     gh pr create --body-file "$work/scan/text.txt" "$@" ;;
  pr-comment)    gh pr comment --body-file "$work/scan/text.txt" "$@" ;;
  issue-comment) gh issue comment --body-file "$work/scan/text.txt" "$@" ;;
  release-notes) gh release create --notes-file "$work/scan/text.txt" "$@" ;;
  release-edit)  gh release edit --notes-file "$work/scan/text.txt" "$@" ;;
esac
