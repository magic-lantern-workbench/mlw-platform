#!/usr/bin/env bash
# Rebuilds the Word documents in doc/ from the CQL files in cql/:
#   MLW_Cassandra_Schema.docx  the database schema
#   MLW_REST_API.docx          the REST API
#   MLW_Keycloak.docx          the Keycloak and login user guide (screenshots in screenshots/)
#   mlw-platform-v1.0.0-Release-Notes.docx   the release notes
#   openapi.yaml               the REST API as an OpenAPI 3.0 specification
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
node "$here/gen_keycloak.js" "$build/keycloak.docx"
node "$here/gen_release_notes.js" "$build/release-notes.docx"
node "$here/gen_openapi.js" "$docs/openapi.yaml"

# 3. fill in the tables of contents and page numbers
python3 "$here/update_toc.py" "$build/schema.docx" "$docs/MLW_Cassandra_Schema.docx" "$build"
python3 "$here/update_toc.py" "$build/api.docx" "$docs/MLW_REST_API.docx" "$build"
python3 "$here/update_toc.py" "$build/keycloak.docx" "$docs/MLW_Keycloak.docx" "$build"
python3 "$here/update_toc.py" "$build/release-notes.docx" "$docs/mlw-platform-v1.0.0-Release-Notes.docx" "$build"

rm -rf "$build"
echo "wrote $docs/MLW_Cassandra_Schema.docx, $docs/MLW_REST_API.docx, $docs/MLW_Keycloak.docx, $docs/mlw-platform-v1.0.0-Release-Notes.docx and $docs/openapi.yaml"
