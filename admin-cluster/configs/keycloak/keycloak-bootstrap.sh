#!/bin/sh
# Post-start bootstrap: apply master-realm settings that cannot be set via realm JSON.
# Runs as a separate keycloak-setup container after Keycloak is healthy.
# Safe to run repeatedly (idempotent).

KC_URL="http://keycloak:8080"
KCADM="/opt/keycloak/bin/kcadm.sh"

echo "[bootstrap] Waiting for Keycloak token endpoint to accept credentials..."
i=0
while [ $i -lt 60 ]; do
  result=$(curl -sf -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli&grant_type=password&username=admin&password=admin" \
    2>/dev/null | grep -o '"access_token"' || true)
  [ -n "$result" ] && echo "[bootstrap] Token endpoint ready." && break
  i=$((i+1))
  sleep 3
done

echo "[bootstrap] Authenticating via kcadm..."
$KCADM config credentials \
  --server "$KC_URL" --realm master \
  --user admin --password admin

echo "[bootstrap] Setting master realm login theme to nitte..."
$KCADM update realms/master -s loginTheme=nitte

echo "[bootstrap] Setting CONFIGURE_TOTP required action on admin user..."
ADMIN_ID=$($KCADM get users -r master -q username=admin --fields id \
  | grep '"id"' | head -1 | awk -F'"' '{print $4}')

if [ -n "$ADMIN_ID" ]; then
  $KCADM update users/"$ADMIN_ID" -r master \
    -s 'requiredActions=["CONFIGURE_TOTP"]'
  echo "[bootstrap] TOTP required action set on admin (id: $ADMIN_ID)."
else
  echo "[bootstrap] WARNING: admin user not found in master realm."
fi

echo "[bootstrap] Done."
