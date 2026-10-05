#!/usr/bin/env bash
# Start script for the Cassandra container. The official image has no
# environment variables for authentication or TLS, so this edits cassandra.yaml
# and then starts Cassandra as usual.
#
#   CASSANDRA_ENABLE_AUTH=true         password authentication and authorization
#   CASSANDRA_ENABLE_CLIENT_TLS=true   encrypt client connections (port 9042)
#     CASSANDRA_KEYSTORE=/certs/cassandra.p12 and CASSANDRA_KEYSTORE_PASSWORD
set -euo pipefail
yaml=/etc/cassandra/cassandra.yaml

if [ "${CASSANDRA_ENABLE_AUTH:-false}" = true ]; then
  sed -i -E 's/^authenticator:.*/authenticator: PasswordAuthenticator/; s/^authorizer:.*/authorizer: CassandraAuthorizer/' "$yaml"
  grep -qx 'authenticator: PasswordAuthenticator' "$yaml"
fi

if [ "${CASSANDRA_ENABLE_CLIENT_TLS:-false}" = true ]; then
  : "${CASSANDRA_KEYSTORE:?CASSANDRA_KEYSTORE is required for client TLS}"
  : "${CASSANDRA_KEYSTORE_PASSWORD:?CASSANDRA_KEYSTORE_PASSWORD is required for client TLS}"
  [ -r "$CASSANDRA_KEYSTORE" ] || { echo "cannot read $CASSANDRA_KEYSTORE (run scripts/gen-certs.sh)" >&2; exit 1; }
  # replace the client_encryption_options block (it ends at the next blank line)
  tmp="$(mktemp)"
  awk '/^client_encryption_options:/ { skip = 1; next } skip && /^[[:space:]]*$/ { skip = 0 } !skip { print }' "$yaml" > "$tmp"
  cat "$tmp" > "$yaml" && rm -f "$tmp"
  cat >> "$yaml" <<EOT

client_encryption_options:
  enabled: true
  optional: false
  keystore: ${CASSANDRA_KEYSTORE}
  keystore_password: ${CASSANDRA_KEYSTORE_PASSWORD}
  store_type: PKCS12
  accepted_protocols: [TLSv1.2, TLSv1.3]
  require_client_auth: false
EOT
  grep -qx '  enabled: true' "$yaml"
fi

exec docker-entrypoint.sh cassandra -f
