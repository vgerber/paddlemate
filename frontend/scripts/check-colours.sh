#!/usr/bin/env bash
# Colour guard for dark mode (doc/plans/dark-mode.md). Run: npm run check:colours
# Usage: check-colours.sh [src_dir]   (PAINT_FILES overrides scripts/paint-files.txt)
# Paths in the paint list are relative to the source dir.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
src="${1:-$here/../src}"
paint_list="${PAINT_FILES:-$here/paint-files.txt}"
fail=0

# Prints "file:line: rule N: text" for each match of a Perl regex in the files.
report() {
  local rule="$1" regex="$2"
  shift 2
  local out
  out="$(grep -nP -H -- "$regex" "$@" 2>/dev/null | grep -v '/\* mask \*/' || true)"
  if [ -n "$out" ]; then
    echo "$out" | sed "s|^$src/||; s|^\([^:]*:[0-9]*\):|\1: rule $rule:|"
    fail=1
  fi
}

mapfile -d '' all < <(find "$src" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) \
  ! -name '*.test.ts' ! -name '*.test.tsx' -print0)
not_theme=()
not_alpha=()
for f in "${all[@]}"; do
  case "$f" in
    */lib/theme.ts) ;;
    *) not_theme+=("$f") ;;
  esac
  case "$f" in
    */lib/alpha.ts) ;;
    *) not_alpha+=("$f") ;;
  esac
done

if [ "${#not_theme[@]}" -gt 0 ]; then
  report 1 '#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(\s*[0-9]' "${not_theme[@]}"
fi
if [ "${#all[@]}" -gt 0 ]; then
  report 2 '\}[0-9a-fA-F]{2}[`"]' "${all[@]}"
fi
if [ "${#not_alpha[@]}" -gt 0 ]; then
  report 2 '\balphas\.' "${not_alpha[@]}"
fi

paint=()
while IFS= read -r line; do
  [ -z "$line" ] && continue
  [ -f "$src/$line" ] && paint+=("$src/$line")
done < "$paint_list"
if [ "${#paint[@]}" -gt 0 ]; then
  report 3 '\btokens\.(?!(touch|radii|elevation|motion|phone|chrome|canvas)\b)\w' "${paint[@]}"
fi

if [ "${#all[@]}" -gt 0 ]; then
  report 4 "[\"'\`](white|black)[\"'\`]|#(fff|000)\\b" "${all[@]}"
fi

if [ "$fail" -ne 0 ]; then
  echo "check:colours failed" >&2
  exit 1
fi
