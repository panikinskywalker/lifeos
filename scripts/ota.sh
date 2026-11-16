#!/usr/bin/env bash
# Publish an OTA update from a clean copy of a commit, so other sessions'
# unfinished edits in this folder never ship.
#   scripts/ota.sh v0.0.95 "v0.0.95: what changed"
#   scripts/ota.sh v0.0.95 "..." --dry-run   (checks the fingerprint, publishes nothing)
# It refuses to publish when the clean copy's runtime fingerprint differs from
# this folder's (the one the phone's build has), since the phone would skip it.
set -euo pipefail

ref="${1:?usage: scripts/ota.sh <tag-or-commit> \"message\" [--dry-run]}"
msg="${2:?usage: scripts/ota.sh <tag-or-commit> \"message\" [--dry-run]}"
dry="${3:-}"

root="$(git rev-parse --show-toplevel)"
dir="$(mktemp -d)/ota"
cleanup() { git -C "$root" worktree remove --force "$dir" >/dev/null 2>&1 || true; git -C "$root" worktree prune; }
trap cleanup EXIT

fp() { (cd "$1" && npx expo-updates fingerprint:generate --platform android 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).hash))'); }

git -C "$root" worktree add -q --detach "$dir" "$ref"
# A real copy (an APFS clone, fast): a symlinked node_modules changes the fingerprint.
cp -cR "$root/node_modules" "$dir/node_modules"

want="$(fp "$root")"
got="$(fp "$dir")"
echo "fingerprint here:  $want"
echo "fingerprint clean: $got"
if [ "$want" != "$got" ]; then
  echo "The clean copy would build for another runtime; the phone would skip it. Not published." >&2
  exit 1
fi
[ "$dry" = "--dry-run" ] && { echo "Dry run: not published."; exit 0; }

(cd "$dir" && npx -y eas-cli@latest update --channel preview --environment preview --platform android --message "$msg" --non-interactive)
