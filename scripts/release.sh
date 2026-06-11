#!/usr/bin/env bash
# One-command release for Substrate: precheck → bump version → commit → tag → push
# → watch the release CI → publish the draft. Modeled on CodexBar's `mac-release`.
#
#   scripts/release.sh 0.3.1        (or `pnpm release 0.3.1`)
#
# Requires: a clean main checked out in sync with origin, and `gh` authenticated.
set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "usage: scripts/release.sh <version>   e.g. scripts/release.sh 0.3.1" >&2
  exit 1
fi
VERSION="${VERSION#v}" # tolerate a leading v
TAG="v$VERSION"

say() { printf '\033[1;36m▸ %s\033[0m\n' "$1"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ---- guards -----------------------------------------------------------------
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || die "release from main (you're on $(git rev-parse --abbrev-ref HEAD))"
[ -z "$(git status --porcelain)" ] || die "working tree is not clean — commit or stash first"
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "local main is not in sync with origin/main"
git rev-parse "$TAG" >/dev/null 2>&1 && die "tag $TAG already exists"
command -v gh >/dev/null || die "the GitHub CLI (gh) is required"

# ---- precheck ---------------------------------------------------------------
say "Precheck: typecheck + lint + build (the same prep the release CI runs)"
pnpm -r typecheck
pnpm lint
pnpm build:dist

# ---- bump version (top-level "version" only, formatting preserved) ----------
say "Bumping version → $VERSION"
for f in package.json apps/desktop/package.json apps/server/package.json apps/web/package.json \
         packages/contracts/package.json packages/shared/package.json; do
  [ -f "$f" ] || continue
  perl -i -0pe 's/("version":\s*")[^"]+/${1}'"$VERSION"'/' "$f"
done

git add -A
git commit -q -m "Release $TAG"
git tag "$TAG"

# ---- push + watch -----------------------------------------------------------
say "Pushing main + $TAG"
git push -q origin main
git push -q origin "$TAG"

say "Release CI is building installers (macOS / Windows / Linux)…"
RUN=""
for _ in $(seq 1 20); do
  RUN=$(gh run list --workflow=release.yml --event push --limit 1 --json databaseId,headBranch --jq '.[0].databaseId' 2>/dev/null || true)
  [ -n "$RUN" ] && break
  sleep 3
done
[ -n "$RUN" ] || die "couldn't find the release workflow run — check the Actions tab"
gh run watch "$RUN" --exit-status || die "release build failed — see: gh run view $RUN"

# ---- publish ----------------------------------------------------------------
say "Publishing the draft release"
gh release edit "$TAG" --draft=false --latest >/dev/null
URL=$(gh release view "$TAG" --json url --jq '.url')
printf '\033[1;32m✓ Released %s → %s\033[0m\n' "$TAG" "$URL"
