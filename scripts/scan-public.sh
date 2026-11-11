#!/usr/bin/env bash
# Leak check for a tree that is about to be (or already is) public.
#   scripts/scan-public.sh <dir> [--git]
# gitleaks (dir mode, or git-history mode with --git) plus a regex sweep over every text file:
# private IPs, keys/tokens, e-mail addresses, home paths, chat snowflake IDs, forbidden paths,
# and host/people/project patterns read from local files that are never committed:
#   ${RV_SCAN_PATTERNS:-~/.config/rv-video-tool/scan-patterns} and any extra files in
#   ${RV_SCAN_EXTRA:-} (colon separated), one PCRE per line.
# Prints one count per check and exits 1 if any count is not 0 (2 if no pattern file).
set -uo pipefail
# The scan runs in C whatever the caller's locale (grep -P refuses to run in a multibyte locale that is not
# UTF-8); gp() below also runs each pattern in C.UTF-8.
export LC_ALL=C

DIR="${1:?usage: scan-public.sh <dir> [--git]}"
MODE="${2:-}"
DIR="$(cd "$DIR" && pwd)"
PATTERNS="${RV_SCAN_PATTERNS:-$HOME/.config/rv-video-tool/scan-patterns}"
# --git: every author/committer line must equal the project identity or one exact line of this local file
ALLOW="${RV_SCAN_ALLOW_IDENTITIES:-$HOME/.config/rv-video-tool/scan-allow-identities}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail=0
: > "$TMP/errors"

count() {
  local n
  n=$(grep -c . "$2" 2>/dev/null || true)
  printf '%-26s %s\n' "$1" "${n:-0}"
  if [[ "${n:-0}" != 0 ]]; then sed 's/^/    /' "$2" | cut -c1-200 | head -20; fail=1; fi
}

if command -v gitleaks >/dev/null; then
  if [[ "$MODE" == "--git" ]]; then
    gitleaks git "$DIR" --no-banner --redact --report-format json --report-path "$TMP/gl.json" >/dev/null 2>&1
  else
    gitleaks dir "$DIR" --no-banner --redact --report-format json --report-path "$TMP/gl.json" >/dev/null 2>&1
  fi
  # an unreadable report is a finding, never a silent 0
  python3 -I -c 'import json,sys
try: j=json.load(open(sys.argv[1]))
except Exception as e: print("gitleaks report unreadable: %s" % e); j=[]
for f in j or []: print("%s:%s %s" % (f["File"], f["StartLine"], f["RuleID"]))' "$TMP/gl.json" > "$TMP/gitleaks"
  count gitleaks "$TMP/gitleaks"
else
  echo "gitleaks not installed: regex checks only"
fi

# Every pattern runs twice and either hit counts: bytewise in C (a byte that is not UTF-8 never hides a line
# and . matches it) and in C.UTF-8 (. matches one Korean character). The C.UTF-8 run reads exactly the files
# C takes for text (no NUL byte) with -a, so a stray byte elsewhere on a line cannot hide a UTF-8 match.
# A grep that could not run (bad pattern) is a finding, never a silent 0.
gp() {  # gp <files list (NUL separated)> <grep args and pattern...>
  local list="$1" s; shift
  local files=(); mapfile -d '' files < "$list"
  : > "$TMP/gp"
  [[ ${#files[@]} -gt 0 ]] || return 0
  LC_ALL=C grep -HnP "$@" -- "${files[@]}" >> "$TMP/gp"; s=$?
  [[ $s -lt 2 ]] || echo "grep failed (exit $s)" >> "$TMP/errors"
  LC_ALL=C.UTF-8 grep -aHnP "$@" -- "${files[@]}" >> "$TMP/gp"; s=$?
  [[ $s -lt 2 ]] || echo "grep failed (exit $s)" >> "$TMP/errors"
  sort -u "$TMP/gp"
}
grep -rIlZ --exclude-dir=.git '' "$DIR" > "$TMP/tree-files" || [[ $? == 1 ]] || echo "grep failed (file list)" >> "$TMP/errors"
g() { gp "$TMP/tree-files" "$@" | sed "s|^$DIR/||"; }
if [[ "$MODE" == "--git" ]]; then
  git -C "$DIR" log --all -p --format='%x1ecommit %H%x1e%n%an <%ae>%n%cn <%ce>%n%B' > "$TMP/raw" || { echo "history read failed: git log" >&2; exit 2; }
  # allowed identity lines are blanked only in the two header lines of a commit, never elsewhere
  awk -v allowf="$ALLOW" -v identf="$TMP/ident" '
    BEGIN { ok["rv maintainers <rv@users.noreply.github.com>"] = 1
            while ((getline l < allowf) > 0) if (l != "" && substr(l, 1, 1) != "#") ok[l] = 1 }
    /^\036commit [0-9a-f]+\036$/ && length($0) == 49 { i = 0; print; next }
    { i++ }
    i == 1 || i == 2 { if ($0 in ok) { print ""; next } print "git-log-identity:" NR ":" $0 > identf }
    { print }' "$TMP/raw" > "$TMP/log" || { echo "history read failed: identity filter" >&2; exit 2; }
fi
[[ -f "$TMP/log" ]] && printf '%s\0' "$TMP/log" > "$TMP/log-files"
gl() { [[ -f "$TMP/log" ]] || return 0; gp "$TMP/log-files" "$@" | sed "s|^$TMP/log:|git-log:|"; }
IP='\b(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\.\d{1,3}\.\d{1,3}(?:\.\d{1,3})?\b'
{ g "$IP"; gl "$IP"; } | grep -vP '\b\d+\.\d+\.\d+\.\d+\.\d+' > "$TMP/ips"
KEY='gh[pousr]_[A-Za-z0-9]{20,}|github_pa[t]_|\bsk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[abposr]-|-----BEGIN [A-Z ]*PRIVATE KEY|(?:discord|bot)[_-]?token\s*[:=]\s*\S{20,}'
{ g "$KEY"; gl "$KEY"; } > "$TMP/keys"
MAIL='[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}'
{ g "$MAIL"; gl "$MAIL"; } | grep -vP 'git@github\.com|noreply\.github\.com|@example\.(?:com|org)|@users\.noreply' > "$TMP/emails"
# /home/<user> anywhere but inside a relative path: a folder named home after a path character (scenes/home/,
# also in a patch header a/.../home/...) is not a home folder; after a quote, =, : or / (file:///home/...) it is
HOME_RE='(?<![\w.-])/home/[a-z_][a-z0-9_-]*|/Users/[A-Za-z]|~/(?:\.d[o]ri|inbox|outbox)\b'
{ g "$HOME_RE"; gl "$HOME_RE"; } > "$TMP/home"
SNOW='(?<![\w.])\d{17,20}(?![\w.])'
{ g "$SNOW"; gl "$SNOW"; } > "$TMP/snow"

: > "$TMP/private"; npat=0
files=("$PATTERNS"); IFS=: read -r -a extra <<< "${RV_SCAN_EXTRA:-}"; files+=("${extra[@]}")
for pf in "${files[@]}"; do
  [[ -n "$pf" && -s "$pf" ]] || continue
  while IFS= read -r p; do
    [[ -n "$p" && "$p" != \#* ]] || continue
    npat=$((npat+1)); g -e "$p" >> "$TMP/private"; gl -e "$p" >> "$TMP/private"
  done < "$pf"
done
if [[ ! -s "$PATTERNS" ]]; then echo "no $PATTERNS: names, hosts and projects are NOT checked" >&2; fail=2; fi
count private-ips "$TMP/ips"
count keys-tokens "$TMP/keys"
count emails "$TMP/emails"
count home-paths "$TMP/home"
count chat-ids "$TMP/snow"
count "private-patterns($npat)" "$TMP/private"
count scan-errors "$TMP/errors"
[[ "$MODE" == "--git" ]] && count identities "$TMP/ident"

( cd "$DIR" && find . -path ./.git -prune -o \( -name 'REPORT*.md' -o -name 'HANDOVER*.md' -o -name 'brief*.md' -o -name '.omo' -o -name 'upstream-v3' -o -name 'private' -o -name 'evidence' -o -name '*.mp4' -o -name '*.webm' -o -name '*.mov' -o -name '*.wav' -o -name '*.glb' -o -name '*.stl' -o -name '*.urdf' -o -name 'scan-patterns' -o -name 'scan-allow-identities' -o -name 'robots_shutter*' -o -name '__pycache__' -o -name '.ruff_cache' \) -print ) > "$TMP/paths"
count forbidden-paths "$TMP/paths"

[[ $fail == 2 ]] && exit 2
exit $fail
