#!/usr/bin/env bash
# Fetch Angular reference material into angular-docs/ (gitignored).
#
#   ./tools/fetch-angular-docs.sh            # defaults to the version INPUT/ pins
#   ANGULAR_REF=19.2.x ./tools/fetch-angular-docs.sh
#
# Two sources, deliberately:
#
#   1. Package typings via `npm pack`. Authoritative, version-pinned, and the
#      real answer for API shape -- what parseTemplate returns, what input()
#      accepts. Prose docs paraphrase these and go stale; the .d.ts cannot.
#   2. Prose guides from the angular/angular repo, which explain *why* a
#      construct behaves as it does. The typings never say that.
#
# Neither is committed. They are a read-only reference for writing extractors,
# regenerable at any time, and vendoring another project's docs into this
# repository would be both large and a licensing question nobody asked for.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/angular-docs"

# Match the version under analysis unless told otherwise -- extractor behaviour
# is version-sensitive, and reading 20.x docs while parsing a 17.x repo is how
# you end up confidently wrong about @let or untagged template literals.
# Find whatever repo is under analysis rather than naming one -- INPUT/ holds a
# vendored corpus whose name is not part of the design.
LOCAL="$(dirname "$(dirname "$(find "$ROOT/INPUT" -maxdepth 4 -type d -path "*/node_modules/@angular/compiler" 2>/dev/null | head -1)")")"
DETECTED="$([ -n "$LOCAL" ] && node -p "require('$LOCAL/@angular/compiler/package.json').version" 2>/dev/null || echo "")"
VERSION="${ANGULAR_REF:-${DETECTED:-17.3.9}}"

echo "Angular reference -> $OUT   (version $VERSION)"
mkdir -p "$OUT/typings" "$OUT/guides"

# ---------------------------------------------------------------- 1. typings
# If INPUT/ already vendors node_modules, copy from there: it is the exact build
# the analyzed repo compiles against, which npm might not reproduce.
LOCAL="${LOCAL:+$LOCAL/@angular}"
if [ -n "$LOCAL" ] && [ -d "$LOCAL" ]; then
  echo
  echo "== typings from INPUT/node_modules (exact build under analysis) =="
  for pkg in compiler core forms router common; do
    if [ -d "$LOCAL/$pkg" ]; then
      mkdir -p "$OUT/typings/$pkg"
      # cd first: --parents copies the path as given, so an absolute source
      # would recreate the entire tree under typings/.
      ( cd "$LOCAL/$pkg" && find . -name "*.d.ts" -exec cp --parents {} "$OUT/typings/$pkg/" \; ) 2>/dev/null
      echo "  ok    @angular/$pkg  ($(find "$OUT/typings/$pkg" -name '*.d.ts' | wc -l) files)"
    else
      echo "  miss  @angular/$pkg  (not vendored)"
    fi
  done
else
  echo
  echo "== typings via npm pack =="
  TMP="$(mktemp -d)"
  for pkg in compiler core forms router common; do
    if (cd "$TMP" && npm pack "@angular/$pkg@$VERSION" >/dev/null 2>&1); then
      tar -xzf "$TMP"/angular-"$pkg"-*.tgz -C "$TMP" 2>/dev/null
      mkdir -p "$OUT/typings/$pkg"
      find "$TMP/package" -name "*.d.ts" -exec cp {} "$OUT/typings/$pkg/" \; 2>/dev/null
      echo "  ok    @angular/$pkg@$VERSION"
    else
      echo "  FAIL  @angular/$pkg@$VERSION  (not published, or npm offline)"
    fi
    rm -rf "$TMP/package"
  done
  rm -rf "$TMP"
fi

# ----------------------------------------------------------------- 2. guides
# Paths in angular/angular move between majors, so each is tried and reported
# rather than assumed. A miss means the path moved, not that the topic is gone --
# check https://github.com/angular/angular/tree/$TAG/adev/src/content and tell
# me the new path.
TAG="${ANGULAR_REF:-$VERSION}"
BASE="https://raw.githubusercontent.com/angular/angular/$TAG/adev/src/content"

FILES=(
  "guide/templates/control-flow.md"
  "guide/defer.md"
  "guide/templates/binding.md"
  "guide/signals/overview.md"
  "guide/components/lifecycle.md"
  "guide/components/inputs.md"
  "guide/components/outputs.md"
  "guide/di/dependency-injection.md"
  "guide/forms/reactive-forms.md"
  "best-practices/style-guide.md"
)

echo
echo "== prose guides from angular/angular@$TAG =="
okc=0; failc=0
for f in "${FILES[@]}"; do
  dest="$OUT/guides/$(echo "$f" | tr '/' '_')"
  if curl -fsSL --max-time 20 "$BASE/$f" -o "$dest" 2>/dev/null && [ -s "$dest" ]; then
    echo "  ok    $f"
    okc=$((okc+1))
  else
    rm -f "$dest"
    echo "  miss  $f"
    failc=$((failc+1))
  fi
done

# --------------------------------------------------------------------- report
cat > "$OUT/README.md" <<EOF
# Angular reference (not committed)

Regenerate with \`./tools/fetch-angular-docs.sh\`. Version: **$VERSION**.

- \`typings/\` — \`.d.ts\` from the Angular packages. Authoritative on API shape:
  what \`parseTemplate\` returns, what \`input()\` accepts. Prefer these over prose
  when the two disagree; prose paraphrases and goes stale.
- \`guides/\` — prose from \`angular/angular@$TAG\`, for *why* a construct behaves
  as it does, which typings never say.

Gitignored on purpose: regenerable, large, and someone else's licensed content.

Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) — $okc guide(s) fetched, $failc missed.
EOF

echo
echo "typings: $(find "$OUT/typings" -name '*.d.ts' 2>/dev/null | wc -l) file(s)"
echo "guides : $okc fetched, $failc missed"
echo "wrote  : $OUT/README.md"
[ "$failc" -gt 0 ] && echo "Misses usually mean the path moved between majors -- see the note in this script."
exit 0
