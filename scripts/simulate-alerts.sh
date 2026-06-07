#!/usr/bin/env bash
###############################################################################
# NITTE Alert Simulation — fires every defined alert for demo purposes
#
# Usage:
#   ./simulate-alerts.sh fire      # post synthetic alerts + generate traffic
#   ./simulate-alerts.sh resolve   # resolve all synthetic alerts
#   ./simulate-alerts.sh traffic   # only generate auth-failure traffic
###############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -t 1 ]]; then
  RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
  CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; NC=''
fi

AM="http://localhost:9093"
API="http://localhost:3000"
PROM="http://localhost:9090"

ok()   { printf '%s[OK]%s    %s\n'   "$GREEN"  "$NC" "$1"; }
info() { printf '%s[INFO]%s  %s\n'   "$CYAN"   "$NC" "$1"; }
step() { printf '%s[STEP]%s  %s\n'   "$YELLOW" "$NC" "$1"; }
err()  { printf '%s[ERROR]%s %s\n'   "$RED"    "$NC" "$1" >&2; }

# ---------- helpers -----------------------------------------------------------
now_iso()    { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
future_iso() {
  # GNU date (Linux/Git Bash MSYS2)
  date -u -d "+${1:-15} minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null && return
  # macOS BSD date
  date -u -v+${1:-15}M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null && return
  # Fallback: just use current time (alerts will expire immediately but still fire)
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

check_deps() {
  command -v curl &>/dev/null || { err "Required: curl"; exit 1; }
  curl -fsS "$AM/-/healthy" &>/dev/null || { err "Alertmanager not reachable at $AM"; exit 1; }
}

# ---------- post synthetic alerts to Alertmanager ----------------------------
post_alerts() {
  local STARTS; STARTS=$(now_iso)
  local ENDS;   ENDS=$(future_iso 15)

  step "Posting synthetic alerts to Alertmanager ($AM)…"

  # Build JSON payload in pure Bash (no jq needed)
  local JSON
  JSON=$(printf '[
  {"labels":{"alertname":"BackendDown","severity":"critical","job":"node-backend","instance":"node-backend:3000","source":"simulation"},"annotations":{"summary":"Backend API is down","description":"[SIMULATION] node-backend unreachable for > 1 minute."},"startsAt":"%s","endsAt":"%s"},
  {"labels":{"alertname":"HighErrorRate","severity":"critical","source":"simulation"},"annotations":{"summary":"High HTTP 5xx error rate","description":"[SIMULATION] 5xx error rate is 12%% over the last 5 minutes."},"startsAt":"%s","endsAt":"%s"},
  {"labels":{"alertname":"HighLatencyP95","severity":"critical","source":"simulation"},"annotations":{"summary":"p95 latency above 2s","description":"[SIMULATION] 95th percentile response time is 3.2s."},"startsAt":"%s","endsAt":"%s"},
  {"labels":{"alertname":"HighAuthFailureRate","severity":"warning","source":"simulation"},"annotations":{"summary":"High authentication failure rate","description":"[SIMULATION] 45%% of auth attempts are failing — possible brute force."},"startsAt":"%s","endsAt":"%s"},
  {"labels":{"alertname":"NoOrdersRecently","severity":"warning","source":"simulation"},"annotations":{"summary":"No orders placed in 30 minutes","description":"[SIMULATION] Zero orders created in the last 30 minutes."},"startsAt":"%s","endsAt":"%s"}
]' "$STARTS" "$ENDS" "$STARTS" "$ENDS" "$STARTS" "$ENDS" "$STARTS" "$ENDS" "$STARTS" "$ENDS")

  curl -s -X POST "$AM/api/v2/alerts" \
    -H "Content-Type: application/json" \
    -d "$JSON" > /dev/null

  ok "5 synthetic alerts posted — active for 15 minutes"
  info "View at: $AM/#/alerts"
}

# ---------- resolve synthetic alerts -----------------------------------------
resolve_alerts() {
  step "Resolving all synthetic alerts…"

  local PAST
  PAST=$(date -u -d "-1 minute" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u -v-1M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
    || date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Build resolve payload in pure Bash (no jq needed)
  local JSON
  JSON=$(printf '[
  {"labels":{"alertname":"BackendDown","source":"simulation"},"endsAt":"%s","startsAt":"%s"},
  {"labels":{"alertname":"HighErrorRate","source":"simulation"},"endsAt":"%s","startsAt":"%s"},
  {"labels":{"alertname":"HighLatencyP95","source":"simulation"},"endsAt":"%s","startsAt":"%s"},
  {"labels":{"alertname":"HighAuthFailureRate","source":"simulation"},"endsAt":"%s","startsAt":"%s"},
  {"labels":{"alertname":"NoOrdersRecently","source":"simulation"},"endsAt":"%s","startsAt":"%s"}
]' "$PAST" "$PAST" "$PAST" "$PAST" "$PAST" "$PAST" "$PAST" "$PAST" "$PAST" "$PAST")

  curl -s -X POST "$AM/api/v2/alerts" \
    -H "Content-Type: application/json" \
    -d "$JSON" > /dev/null

  ok "Synthetic alerts resolved"
}

# ---------- generate real traffic to trigger Prometheus metrics ---------------
generate_traffic() {
  local FAILURES="${1:-80}"
  step "Generating $FAILURES failed login attempts (auth failure metric)…"

  local count=0
  while (( count < FAILURES )); do
    curl -s -X POST "$API/api/v1/admin/auth/login" \
      -H "Content-Type: application/json" \
      -d '{"email":"simulate-brute@test.invalid","password":"wrongpass123"}' \
      -o /dev/null &
    count=$((count + 1))
    # Throttle: 10 at a time
    (( count % 10 == 0 )) && wait && printf '  sent %d/%d\r' "$count" "$FAILURES"
  done
  wait
  echo

  # 10 successful-ish requests for the ratio to register clearly
  step "Sending 10 valid health requests (denominator)…"
  for _ in $(seq 1 10); do
    curl -s "$API/api/health" -o /dev/null &
  done
  wait

  ok "Traffic sent — auth_attempts_total{success=\"false\"} incremented by ~$FAILURES"
  info "HighAuthFailureRate will go Pending in Prometheus within the next scrape cycle"
  info "It fires after the 'for: 5m' window — watch: $PROM/alerts"
}

# ---------- reload Prometheus rules ------------------------------------------
reload_prometheus() {
  step "Reloading Prometheus config…"
  if curl -s -X POST "$PROM/-/reload" -o /dev/null; then
    ok "Prometheus reloaded"
  else
    info "Prometheus reload skipped (--web.enable-lifecycle may need restart)"
  fi
}

# ---------- show current alert status ----------------------------------------
show_alert_status() {
  printf '\n%s%s Alertmanager — current firing alerts %s%s\n' "$BOLD$CYAN" "═══" "═══" "$NC"
  local resp
  resp=$(curl -s "$AM/api/v2/alerts?active=true" 2>/dev/null || echo "[]")
  # Simple grep-based count instead of jq
  local count; count=$(echo "$resp" | grep -o '"alertname"' | wc -l | tr -d ' ')
  if [[ "$count" -eq 0 ]]; then
    info "No active alerts"
  else
    # Simple sed/awk extraction instead of jq
    echo "$resp" | grep -o '"alertname":"[^"]*"' | sed 's/"alertname":"//g;s/"//g' | while read -r name; do
      printf '  %s\n' "$name"
    done
  fi

  printf '\n%s%s Prometheus — alert states %s%s\n' "$BOLD$CYAN" "═══" "═══" "$NC"
  local prom_resp
  prom_resp=$(curl -s "$PROM/api/v1/alerts" 2>/dev/null || echo '')
  if [[ -n "$prom_resp" ]]; then
    # Extract alert names with grep instead of jq
    echo "$prom_resp" | grep -o '"alertname":"[^"]*"' | sed 's/"alertname":"//g;s/"//g' | while read -r name; do
      printf '  %s\n' "$name"
    done
  else
    info "Could not reach Prometheus"
  fi
  echo
}

# ---------- main --------------------------------------------------------------
CMD="${1:-fire}"

check_deps

case "$CMD" in
  fire)
    printf '\n%s═══ NITTE Alert Simulation ═══%s\n\n' "$BOLD$CYAN" "$NC"
    post_alerts
    echo
    generate_traffic 80
    echo
    reload_prometheus
    echo
    show_alert_status
    printf '\n%s[NEXT]%s  Open %s to see firing alerts\n' "$GREEN" "$NC" "$AM/#/alerts"
    printf '%s[NEXT]%s  Open %s to see Pending/Firing rules\n' "$GREEN" "$NC" "$PROM/alerts"
    printf '%s[NEXT]%s  Run  ./simulate-alerts.sh resolve  to clear synthetic alerts\n\n' "$GREEN" "$NC"
    ;;

  resolve)
    resolve_alerts
    show_alert_status
    ;;

  traffic)
    generate_traffic "${2:-80}"
    show_alert_status
    ;;

  status)
    show_alert_status
    ;;

  *)
    printf 'Usage: %s [fire|resolve|traffic|status]\n' "$0"
    exit 1
    ;;
esac
