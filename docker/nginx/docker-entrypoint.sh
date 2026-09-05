#!/bin/sh
set -eu

CERT_DIR=/etc/nginx/certs
mkdir -p "$CERT_DIR"

if [ ! -s "$CERT_DIR/tls.crt" ] || [ ! -s "$CERT_DIR/tls.key" ]; then
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$CERT_DIR/tls.key" \
        -out "$CERT_DIR/tls.crt" \
        -subj "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost"
fi

exec nginx -g 'daemon off;'