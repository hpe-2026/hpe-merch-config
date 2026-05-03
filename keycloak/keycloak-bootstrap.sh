#!/usr/bin/env bash
# Post-start bootstrap: apply master-realm settings that cannot be set via realm JSON.
# Runs inside the Keycloak container. Safe to run repeatedly (idempotent).

set -euo pipefail

KC_URL="http://localhost:8080"
KCADM="/opt/keycloak/bin/kcadm.sh"

echo "[bootstrap] Waiting for Keycloak..."
for i in $(seq 1 60); do
  curl -sf "${KC_URL}/realms/master" -o /dev/null && break
  sleep 2
done

echo "[bootstrap] Authenticating as admin..."
$KCADM config credentials \
  --server "$KC_URL" --realm master \
  --user admin --password admin

echo "[bootstrap] Setting master realm login theme to nitte..."
$KCADM update realms/master -s loginTheme=nitte

echo "[bootstrap] Done."
