#!/usr/bin/env bash
# Rebuilds the Word documents in doc/ from the CQL files in cql/:
#   MLW_Cassandra_Schema.docx  the database schema
#   MLW_REST_API.docx          the REST API
#
# Requires: node + npm, graphviz (dot), LibreOffice (soffice) and python3 with
# the uno module (used only to fill in the tables of contents).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
docs="$here/.."
build="$here/.build"

rm -rf "$build" && mkdir -p "$build/png"
[ -d "$here/node_modules/docx" ] || (cd "$here" && npm install --no-audit --no-fund)

# 1. diagrams
for f in "$here"/diagrams/*.dot; do
  dot -Tpng -Gdpi=150 "$f" -o "$build/png/$(basename "${f%.dot}").png"
done

# 2. documents (tables parsed from cql/*.cql, descriptions from gen.js)
node "$here/gen.js" "$build/schema.docx" "$build/png"
node "$here/gen_api.js" "$build/api.docx"

# 3. fill in the tables of contents and page numbers
python3 "$here/update_toc.py" "$build/schema.docx" "$docs/MLW_Cassandra_Schema.docx" "$build"
python3 "$here/update_toc.py" "$build/api.docx" "$docs/MLW_REST_API.docx" "$build"

rm -rf "$build"
echo "wrote $docs/MLW_Cassandra_Schema.docx and $docs/MLW_REST_API.docx"
