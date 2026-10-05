#!/usr/bin/env bash
# Creates a private CA and the certificates for the application (HTTPS) and for
# Cassandra (client TLS) in ./certs, for local development and testing.
#
#   scripts/gen-certs.sh [extra-name-or-ip ...]
#
# Extra names or IP addresses are added to both server certificates, for example
# the host name of the server you deploy to. For production use certificates
# from your own CA or a public one instead.
#
# Environment: CERT_DIR (default ./certs), CASSANDRA_KEYSTORE_PASSWORD (default changeit),
# CERT_DAYS (default 825).
set -euo pipefail

dir="${CERT_DIR:-certs}"
days="${CERT_DAYS:-825}"
pw="${CASSANDRA_KEYSTORE_PASSWORD:-changeit}"
mkdir -p "$dir"
cd "$dir"

san() { # san <default names...> -> subjectAltName value
  local out="" n
  for n in "$@" "${EXTRA[@]}"; do
    [ -z "$n" ] && continue
    if [[ "$n" =~ ^[0-9.]+$ || "$n" == *:* ]]; then out+="IP:$n,"; else out+="DNS:$n,"; fi
  done
  echo "${out%,}"
}
EXTRA=("$@")

if [ ! -f ca.pem ]; then
  openssl req -x509 -newkey rsa:4096 -nodes -keyout ca.key -out ca.pem -days 3650 \
    -subj "/CN=MLW development CA" -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
  echo "created CA ca.pem"
fi

issue() { # issue <name> <subjectAltName>
  local name="$1" alt="$2"
  openssl req -newkey rsa:2048 -nodes -keyout "$name.key" -out "$name.csr" -subj "/CN=$name" 2>/dev/null
  printf 'subjectAltName=%s\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth,clientAuth\n' "$alt" > "$name.ext"
  openssl x509 -req -in "$name.csr" -CA ca.pem -CAkey ca.key -CAcreateserial -out "$name.pem" \
    -days "$days" -extfile "$name.ext" 2>/dev/null
  rm -f "$name.csr" "$name.ext"
  echo "created $name.pem ($alt)"
}

issue app "$(san localhost 127.0.0.1 ::1 app)"
issue cassandra "$(san localhost 127.0.0.1 cassandra)"

# Cassandra reads its key and certificate from a PKCS12 keystore
openssl pkcs12 -export -in cassandra.pem -inkey cassandra.key -certfile ca.pem \
  -name cassandra -out cassandra.p12 -passout "pass:$pw"
echo "created cassandra.p12"

# The containers run as other users, so the files must be readable. These are
# development keys: do not use them outside local testing.
chmod 644 ./*.pem ./*.key ./*.p12
echo
echo "Files are in $dir. Trust ca.pem to verify them, for example:"
echo "  curl --cacert $dir/ca.pem https://localhost:8090/api/v1/health"
