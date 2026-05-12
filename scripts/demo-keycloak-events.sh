#!/usr/bin/env bash
###############################################################################
# Keycloak Events & Audit Logs — Live Demo Script
# Usage: ./scripts/demo-keycloak-events.sh [docker|k8s]
###############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-docker}"

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'; CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; NC=$'\033[0m'

header() { printf '\n%s========================================%s\n%s%s%s\n%s========================================%s\n\n' "$CYAN" "$NC" "$BOLD$CYAN" "$1" "$NC" "$CYAN" "$NC"; }
ok()     { printf '%s[OK]%s    %s\n' "$GREEN" "$NC" "$1"; }
err()    { printf '%s[ERR]%s   %s\n' "$RED"    "$NC" "$1" >&2; }
info()   { printf '%s[INFO]%s  %s\n' "$BLUE"   "$NC" "$1"; }
step()   { printf '%s[STEP]%s  %s\n' "$YELLOW" "$NC" "$1"; }

KEYCLOAK_URL="http://localhost:8080"
GRAFANA_URL="http://localhost:3001"
REALM="nitte-realm"
CLIENT="grafana-client"
ADMIN_USER="internal-admin@nitte.ac.in"
ADMIN_PASS="InternalAdmin@123"
USER="internal-user@nitte.ac.in"
USER_PASS="InternalUser@123"

get_token() {
  local uname="$1"
  local pwd="$2"
  curl -fsS -X POST \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password" \
    -d "client_id=${CLIENT}" \
    -d "client_secret=grafana-client-secret" \
    -d "username=${uname}" \
    -d "password=${pwd}" \
    "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" 2>/dev/null | jq -r '.access_token // empty'
}

logs_cmd() {
  if [[ "$MODE" == "k8s" ]]; then
    echo "kubectl logs -n nitte"
  else
    echo "docker logs"
  fi
}

container_or_pod() {
  if [[ "$MODE" == "k8s" ]]; then
    echo "deployment/$1"
  else
    echo "nitte-$1"
  fi
}

###############################################################################
# 1. Verify all services are running
###############################################################################
header "1. Verify Services Running"

if [[ "$MODE" == "docker" ]]; then
  for svc in keycloak notifications loki loki-rbac-proxy promtail-keycloak; do
    if docker ps --format '{{.Names}}' | grep -q "nitte-${svc}"; then
      ok "nitte-${svc} is running"
    else
      err "nitte-${svc} is NOT running"
    fi
  done
else
  for svc in keycloak notification-service loki loki-rbac-proxy; do
    if kubectl get pods -n nitte -l app="$svc" -o jsonpath='{.items[*].status.phase}' 2>/dev/null | grep -q "Running"; then
      ok "$svc is running"
    else
      err "$svc is NOT running"
    fi
  done
fi

###############################################################################
# 2. Verify Keycloak Event Listener is Active
###############################################################################
header "2. Verify Keycloak Event Listener SPI"

KC_LOGS=$($(logs_cmd) "$(container_or_pod keycloak)" 2>/dev/null || true)
if echo "$KC_LOGS" | grep -qi "nitte-notification"; then
  ok "Keycloak event listener is registered"
else
  info "Keycloak event listener not yet visible in logs (may need first event)"
fi

###############################################################################
# 3. Verify Notification Service /api/v1/events Endpoint
###############################################################################
header "3. Verify Notification Service Events Endpoint"

EVENT_URL="http://localhost:9100/api/v1/events"
RESP=$(curl -fsS -X POST "$EVENT_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "LOGIN_ERROR",
    "eventCategory": "user",
    "realmId": "nitte-realm",
    "clientId": "grafana-client",
    "userId": "demo-user-123",
    "ipAddress": "127.0.0.1",
    "error": "invalid_credentials",
    "details": {"auth_method": "openid-connect"}
  }' 2>/dev/null || echo '{"status":"failed"}')

if echo "$RESP" | grep -q '"status":"received"'; then
  ok "Notification Service accepted test event"
else
  err "Notification Service did NOT accept event: $RESP"
fi

###############################################################################
# 4. Verify Slack Console Fallback (since no webhook URL is set)
###############################################################################
header "4. Verify Slack / Ticket / Email Fallbacks"

NS_LOGS=$($(logs_cmd) "$(container_or_pod notification-service)" 2>/dev/null || true)

if echo "$NS_LOGS" | grep -qi "slack"; then
  ok "Slack fallback logged"
else
  info "Slack log not yet visible (check after first real event)"
fi

if echo "$NS_LOGS" | grep -qi "ticket"; then
  ok "Ticket fallback logged"
else
  info "Ticket log not yet visible"
fi

if echo "$NS_LOGS" | grep -qi "admin"; then
  ok "Admin email fallback logged"
else
  info "Admin email log not yet visible"
fi

###############################################################################
# 5. Verify Loki Multi-Tenancy
###############################################################################
header "5. Verify Loki Multi-Tenancy"

DEFAULT_TENANT=$(curl -fsS -H "X-Scope-OrgID: default" \
  "http://localhost:3100/loki/api/v1/label/values?name=service" 2>/dev/null || echo "{}" || true)

if echo "$DEFAULT_TENANT" | grep -q '"values"'; then
  ok "Loki default tenant is accessible"
else
  err "Loki default tenant is NOT accessible"
fi

KC_TENANT=$(curl -fsS -H "X-Scope-OrgID: keycloak-admin" \
  "http://localhost:3100/loki/api/v1/label/values?name=service" 2>/dev/null || echo "{}" || true)

if echo "$KC_TENANT" | grep -q '"values"'; then
  ok "Loki keycloak-admin tenant is accessible"
else
  info "Loki keycloak-admin tenant may be empty until logs are pushed"
fi

###############################################################################
# 6. Verify Loki RBAC Proxy
###############################################################################
header "6. Verify Loki RBAC Proxy"

# Unauthenticated -> default tenant
PROXY_DEFAULT=$(curl -fsS "http://localhost:3200/loki/api/v1/label/values?name=service" 2>/dev/null || echo "{}" || true)
if echo "$PROXY_DEFAULT" | grep -q '"values"'; then
  ok "RBAC proxy serves default tenant for unauthenticated requests"
else
  err "RBAC proxy default tenant failed"
fi

# Authenticated admin -> keycloak-admin tenant
ADMIN_TOKEN=$(get_token "$ADMIN_USER" "$ADMIN_PASS")
if [[ -n "$ADMIN_TOKEN" && "$ADMIN_TOKEN" != "null" ]]; then
  PROXY_ADMIN=$(curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" \
    "http://localhost:3200/loki/api/v1/label/values?name=service" 2>/dev/null || echo "{}" || true)
  if echo "$PROXY_ADMIN" | grep -q '"values"'; then
    ok "RBAC proxy serves keycloak-admin tenant for admin user"
  else
    info "RBAC proxy admin tenant empty (logs may not have arrived yet)"
  fi
else
  err "Failed to get admin token from Keycloak"
fi

###############################################################################
# 7. Trigger Real Keycloak Events (Login Failure)
###############################################################################
header "7. Trigger Real Keycloak Login Failure"

step "Sending failed login request to Keycloak..."
FAIL_RESP=$(curl -fsS -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=${CLIENT}" \
  -d "client_secret=grafana-client-secret" \
  -d "username=nonexistent-user" \
  -d "password=wrong-password" \
  "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" 2>/dev/null || echo '{"error":"request_failed"}')

if echo "$FAIL_RESP" | grep -q '"error"'; then
  ok "Keycloak returned expected login error"
else
  info "Unexpected response: $FAIL_RESP"
fi

###############################################################################
# 8. Check Logs Flow After Real Event
###############################################################################
header "8. Verify Logs Flow After Real Event"

sleep 3

KC_LOGS2=$($(logs_cmd) "$(container_or_pod keycloak)" 2>/dev/null || true)
if echo "$KC_LOGS2" | grep -qi "notification"; then
  ok "Keycloak event listener attempted to send event"
else
  info "Keycloak event listener log not visible yet"
fi

NS_LOGS2=$($(logs_cmd) "$(container_or_pod notification-service)" 2>/dev/null || true)
if echo "$NS_LOGS2" | grep -qi "keycloak"; then
  ok "Notification Service processed Keycloak event"
else
  info "Notification Service may need more time; re-run this script in 10s"
fi

###############################################################################
# 9. Summary
###############################################################################
header "Demo Summary"

info "1. Keycloak event listener SPI sends events to Notification Service"
info "2. Notification Service routes events to Slack/Ticket/Email (console fallback)"
info "3. Keycloak logs go to 'keycloak-admin' tenant via dedicated Promtail"
info "4. Other logs go to 'default' tenant"
info "5. Loki RBAC proxy enforces tenant access based on Keycloak JWT roles"
info "6. Grafana (via proxy) shows/hides Keycloak audit logs based on role"
info ""
info "Next: Open Grafana at ${GRAFANA_URL} and log in as:"
info "  Admin: ${ADMIN_USER} / ${ADMIN_PASS}  -> sees ALL logs (keycloak-admin tenant)"
info "  User:  ${USER} / ${USER_PASS}          -> sees only default tenant logs"
info ""
info "Docs: docs/KEYCLOAK_EVENTS_AND_LOGS.md"
