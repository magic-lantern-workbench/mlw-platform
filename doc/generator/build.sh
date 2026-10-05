#!/usr/bin/env bash
# Rebuilds doc/MLW_Cassandra_Schema.docx from the CQL files in cql/.
#
# Requires: node + npm, graphviz (dot), LibreOffice (soffice) and python3 with
# the uno module (used only to fill in the table of contents).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../MLW_Cassandra_Schema.docx"
build="$here/.build"

rm -rf "$build" && mkdir -p "$build/png"
[ -d "$here/node_modules/docx" ] || (cd "$here" && npm install --no-audit --no-fund)

# 1. diagrams
for f in "$here"/diagrams/*.dot; do
  dot -Tpng -Gdpi=150 "$f" -o "$build/png/$(basename "${f%.dot}").png"
done

# 2. document (tables parsed from cql/*.cql, descriptions from gen.js)
node "$here/gen.js" "$build/raw.docx" "$build/png"

# 3. fill in the table of contents and page numbers
python3 "$here/update_toc.py" "$build/raw.docx" "$out" "$build"

rm -rf "$build"
echo "wrote $out"
