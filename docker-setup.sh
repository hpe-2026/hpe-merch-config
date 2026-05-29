#!/usr/bin/env bash

###############################################################################
# NITTE Alumni Merchandise Shop - one-shot Docker setup (Linux / macOS / WSL)
#
# Usage:
#   ./docker-setup.sh [start|stop|restart|clean|status|logs|demo|help]
#
# Tested on:
#   - Linux (Fedora, Ubuntu, Debian, Arch)
#   - macOS (Docker Desktop or Colima)
#   - Windows Git Bash / WSL
###############################################################################

set -euo pipefail

# Move to script directory so paths are stable regardless of CWD
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------- Pretty printing -------------------------------------------------
if [[ -t 1 ]]; then
  RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
  BLUE=$'\033[0;34m'; CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; CYAN=''; BOLD=''; NC=''
fi

header() { printf '\n%s========================================%s\n%s%s%s\n%s========================================%s\n\n' "$CYAN" "$NC" "$BOLD$CYAN" "$1" "$NC" "$CYAN" "$NC"; }
ok()     { printf '%s[OK]%s    %s\n' "$GREEN" "$NC" "$1"; }
err()    { printf '%s[ERROR]%s %s\n' "$RED" "$NC" "$1" >&2; }
info()   { printf '%s[INFO]%s  %s\n' "$BLUE" "$NC" "$1"; }
step()   { printf '%s[STEP]%s  %s\n' "$YELLOW" "$NC" "$1"; }

trap 'echo; err "Interrupted."; exit 130' INT TERM

# ---------- Globals ---------------------------------------------------------
COMPOSE_CMD=""

# Base images that must be pulled before docker compose builds local images.
# We pull these sequentially to avoid registry timeouts on slow networks.
BASE_IMAGES=(
  "mongo:5.0"
  "confluentinc/cp-zookeeper:7.3.0"
  "confluentinc/cp-kafka:7.3.0"
  "quay.io/keycloak/keycloak:20.0.0"
  "jaegertracing/all-in-one:1.52"
  "prom/prometheus:v2.48.0"
  "prom/alertmanager:v0.26.0"
  "grafana/grafana:10.2.2"
  "grafana/loki:2.9.4"
  "grafana/promtail:2.9.4"
  "jenkins/jenkins:lts-jdk17"
  "sonatype/nexus3:latest"
  "quay.io/oauth2-proxy/oauth2-proxy:v7.6.0"
  "node:18-alpine"
  "python:3.11-slim"
)

# ---------- Prerequisites ---------------------------------------------------
check_prereqs() {
  header "Checking Prerequisites"

  if ! command -v docker &>/dev/null; then
    err "Docker is not installed."
    info "Install Docker Desktop or Docker Engine: https://docs.docker.com/get-docker/"
    exit 1
  fi
  ok "Docker installed: $(docker --version)"

  if ! docker info &>/dev/null; then
    err "Docker daemon is not running."
    info "Start Docker Desktop or run: sudo systemctl start docker"
    exit 1
  fi
  ok "Docker daemon is running"

  if command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker-compose"
  elif docker compose version &>/dev/null; then
    COMPOSE_CMD="docker compose"
  else
    err "Docker Compose is not installed."
    info "Install Compose v2: https://docs.docker.com/compose/install/"
    exit 1
  fi
  ok "Docker Compose detected ($COMPOSE_CMD)"

  if [[ ! -f docker-compose.yml ]]; then
    err "docker-compose.yml not found in $SCRIPT_DIR"
    exit 1
  fi
  ok "docker-compose.yml present"
}

# ---------- Image pre-pull --------------------------------------------------
# Pulls base images in parallel (default 4 at a time). Override with PULL_PARALLEL=N.
# Skip entirely with SKIP_PULL=1 (compose will lazily pull on `up`).
pull_base_images() {
  if [[ "${SKIP_PULL:-0}" == "1" ]]; then
    info "SKIP_PULL=1 set — skipping pre-pull (compose will fetch on demand)."
    return
  fi

  header "Pulling Base Images"
  local total=${#BASE_IMAGES[@]}
  local parallel="${PULL_PARALLEL:-4}"

  # Filter out images already cached so we don't waste a slot on them.
  local pending=()
  local idx=0
  for img in "${BASE_IMAGES[@]}"; do
    idx=$((idx+1))
    if docker image inspect "$img" &>/dev/null; then
      ok "[$idx/$total] cached: $img"
    else
      pending+=("$img")
    fi
  done

  if [[ ${#pending[@]} -eq 0 ]]; then
    ok "All base images already cached."
    return
  fi

  # On Windows/Git Bash, parallel pulls with `wait -n` can be flaky.
  # Fall back to sequential to avoid race conditions / Bash version issues.
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" || -n "${MSYSTEM:-}" ]]; then
    parallel=1
    info "Windows/Git Bash detected — pulling images sequentially."
  fi

  info "Pulling ${#pending[@]} image(s) (max $parallel concurrent)…"
  info "Tip: set SKIP_PULL=1 to skip, or PULL_PARALLEL=N to tune."

  local tmpdir
  tmpdir=$(mktemp -d)
  # Expand $tmpdir now so the trap doesn't reference a local var after return.
  trap "rm -rf '$tmpdir'" RETURN

  local running=0
  local failed=0
  for img in "${pending[@]}"; do
    # Throttle: wait until we have a free slot.
    while (( running >= parallel )); do
      if wait -n 2>/dev/null; then
        running=$((running-1))
      else
        # wait -n returned non-zero: job failed or no jobs available.
        # Give it a brief moment then try again (prevents tight loops on Windows).
        sleep 0.3
        running=$((running-1))
      fi
    done
    (
      if docker pull "$img" >"$tmpdir/$(echo "$img" | tr '/:' '__').log" 2>&1; then
        printf '%s[OK]%s    pulled: %s\n' "$GREEN" "$NC" "$img"
      else
        printf '%s[ERROR]%s failed: %s\n' "$RED" "$NC" "$img" >&2
        exit 1
      fi
    ) &
    running=$((running+1))
    step "queued: $img"
  done

  # Drain remaining jobs.
  while (( running > 0 )); do
    if wait -n 2>/dev/null; then
      running=$((running-1))
    else
      failed=1
      running=$((running-1))
    fi
  done

  if (( failed )); then
    err "One or more image pulls failed. See logs in $tmpdir"
    info "Check network / Docker Hub access. Re-run to resume (cached images are skipped)."
    exit 1
  fi
  ok "All base images present."
}

# ---------- Lifecycle -------------------------------------------------------
start_services() {
  check_prereqs
  pull_base_images

  header "Building Keycloak Event Listener SPI"
  if [[ ! -f "./keycloak-event-listener/target/keycloak-event-listener-1.0.0.jar" ]]; then
    step "Building Keycloak event listener plugin via Docker Maven…"
    if ! bash ./keycloak-event-listener/build.sh; then
      err "Failed to build Keycloak event listener SPI. Ensure Docker is running."
      exit 1
    fi
    ok "Keycloak event listener built"
  else
    ok "Keycloak event listener JAR already present"
  fi

  header "Building & Starting Services"
  step "Running: $COMPOSE_CMD up --build -d"
  if ! $COMPOSE_CMD up --build -d; then
    err "docker compose failed."
    info "Check logs with: $COMPOSE_CMD logs --tail=80"
    exit 1
  fi
  ok "Containers launched"

  # keycloak-setup is a one-shot bootstrap container — it exits on success.
  # Exclude it from the "must be running" count.
  local total oneshot="keycloak-setup"
  total=$($COMPOSE_CMD config --services | grep -v "^${oneshot}$" | wc -l | tr -d ' ')

  step "Waiting for $total persistent services to report running (up to 90s)…"
  local count=0 ready=0
  while [[ $count -lt 90 ]]; do
    ready=$($COMPOSE_CMD ps --services --filter "status=running" 2>/dev/null \
      | grep -v "^${oneshot}$" | wc -l | tr -d ' ')
    printf '\r  Running: %s/%s services…   ' "$ready" "$total"
    [[ "$ready" -ge "$total" ]] && break
    sleep 1
    count=$((count+1))
  done
  echo

  if [[ "$ready" -lt "$total" ]]; then
    err "Only $ready/$total services running."
    show_status
    info "Tip: run '$0 logs' to inspect failing containers."
    exit 1
  fi
  ok "All $total persistent services are running"

  step "Probing API gateway health (up to 60s)…"
  local api_ok=0
  for _ in $(seq 1 60); do
    if curl -fsS --max-time 2 http://localhost:3000/api/v1/health >/dev/null 2>&1; then
      api_ok=1; break
    fi
    sleep 1
  done

  if [[ $api_ok -ne 1 ]]; then
    err "API gateway not healthy at http://localhost:3000/api/v1/health"
    show_status
    info "Tip: run '$0 logs' to inspect the backend container."
    exit 1
  fi
  ok "API gateway is healthy"

  show_status
  print_summary
}

stop_services() {
  check_prereqs
  step "Stopping containers…"
  $COMPOSE_CMD down
  ok "Stopped"
}

restart_services() {
  stop_services
  start_services
}

clean_all() {
  check_prereqs
  printf "%s[!]%s This removes ALL containers AND volumes (data, MongoDB, Grafana, etc).\n" "$RED" "$NC"
  read -r -p "Type YES to confirm: " conf
  if [[ "$conf" != "YES" ]]; then
    info "Cancelled."
    return
  fi
  $COMPOSE_CMD down -v
  ok "Cleaned"
}

show_status() {
  check_prereqs

  # name | container | port
  local -a SERVICES=(
    "MongoDB|nitte-mongodb|27017"
    "Keycloak|nitte-keycloak|8080"
    "Zookeeper|nitte-zookeeper|2181"
    "Kafka|nitte-kafka|9092"
    "Backend API|nitte-backend|3000"
    "Storefront|nitte-frontend|5173"
    "Admin / Merchant UI|nitte-admin|5174"
    "Notifications|nitte-notifications|—"
    "Python Service|nitte-python|—"
    "Jenkins|nitte-jenkins|8081"
    "Nexus Repository|nitte-nexus|8082"
    "Prometheus|nitte-prometheus|—"
    "Alertmanager|nitte-alertmanager|9093"
    "Grafana|nitte-grafana|3001"
    "Jaeger|nitte-jaeger|—"
    "Prometheus Proxy|nitte-proxy-prometheus|9090"
    "Jaeger Proxy|nitte-proxy-jaeger|16686"
    "Loki|nitte-loki|3100"
    "Loki RBAC Proxy|nitte-loki-rbac-proxy|3200"
    "Promtail|nitte-promtail|—"
    "Promtail Keycloak|nitte-promtail-keycloak|—"
    "Keycloak Setup|nitte-keycloak-setup|—"
  )

  local SEP="  ${CYAN}$(printf '%.0s─' {1..70})${NC}"
  local total=${#SERVICES[@]}
  local running_count=0

  printf '\n'
  # Header row (no color codes in width fields so alignment is exact)
  printf '  %b%-22s %-24s %-16s %-10s %-8s%b\n' \
    "$BOLD" "SERVICE" "CONTAINER" "STATUS" "HEALTH" "PORT" "$NC"
  printf '%b\n' "$SEP"

  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r svc container port <<< "$entry"

    local state health_raw
    state=$(docker inspect --format '{{.State.Status}}' "$container" 2>/dev/null)
    health_raw=$(docker inspect --format \
      '{{if .State.Health}}{{.State.Health.Status}}{{end}}' \
      "$container" 2>/dev/null)

    [[ -z "$state" ]]      && state="absent"
    [[ -z "$health_raw" ]] && health_raw="—"

    # Status colour + icon
    local status_color status_icon
    # keycloak-setup exits on success — treat exited as OK for that container
    local oneshot_ok=0
    [[ "$container" == "nitte-keycloak-setup" && "$state" == "exited" ]] && oneshot_ok=1

    case "$state" in
      running)  status_color="$GREEN";  status_icon="● running"; running_count=$((running_count+1)) ;;
      exited)   if [[ $oneshot_ok -eq 1 ]]; then
                  status_color="$GREEN";  status_icon="✔ completed"
                  running_count=$((running_count+1))
                else
                  status_color="$RED";    status_icon="● exited"
                fi ;;
      dead)           status_color="$RED";    status_icon="● dead"      ;;
      restarting|paused) status_color="$YELLOW"; status_icon="◌ $state"  ;;
      absent)         status_color="$RED";    status_icon="○ absent"    ;;
      *)              status_color="$YELLOW"; status_icon="◌ $state"    ;;
    esac

    # Health colour
    local health_color
    case "$health_raw" in
      healthy)   health_color="$GREEN"  ;;
      unhealthy) health_color="$RED"    ;;
      starting)  health_color="$YELLOW" ;;
      *)         health_color=""        ;;
    esac

    local port_disp; [[ "$port" == "—" ]] && port_disp="—" || port_disp=":$port"

    # Pad visible text before wrapping in colour (colour codes have zero width)
    local p_status p_health p_port
    printf -v p_status  '%-16s' "$status_icon"
    printf -v p_health  '%-10s' "$health_raw"
    printf -v p_port    '%-8s'  "$port_disp"

    printf '  %-22s %-24s %b%s%b%b%s%b%s\n' \
      "$svc" "$container" \
      "$status_color" "$p_status" "$NC" \
      "$health_color" "$p_health" "$NC" \
      "$p_port"
  done

  printf '%b\n' "$SEP"

  if   [[ "$running_count" -eq "$total" ]]; then
    printf '%b  ✔  All %d/%d services running/completed%b\n\n' "$GREEN$BOLD" "$running_count" "$total" "$NC"
  elif [[ "$running_count" -gt 0 ]]; then
    printf '%b  ⚠  %d/%d services running%b\n\n'              "$YELLOW$BOLD" "$running_count" "$total" "$NC"
  else
    printf '%b  ✘  No services running — run: %s start%b\n\n' "$RED$BOLD" "$0" "$NC"
  fi
}

show_logs() {
  check_prereqs
  $COMPOSE_CMD logs -f --tail=50
}

run_demo() {
  check_prereqs
  header "Quick Demo Test"

  step "Hitting health endpoint…"
  if curl -fsS http://localhost:3000/api/v1/health; then
    echo
    ok "API healthy"
  else
    err "API not reachable. Run: $0 start"
    exit 1
  fi

  step "Generating a few requests so metrics populate…"
  for _ in $(seq 1 20); do
    curl -fsS http://localhost:3000/api/v1/products -o /dev/null || true
    curl -fsS http://localhost:3000/api/v1/health   -o /dev/null || true
  done
  ok "Test traffic sent"

  print_summary
}

print_summary() {
  local SEP="${CYAN}  $(printf '%.0s─' {1..62})${NC}"
  printf '\n'
  printf '%s╔══════════════════════════════════════════════════════════════╗%s\n' "$CYAN" "$NC"
  printf '%s║%s  %sNITTE Alumni Merchandise Shop%s — Secure Full-Stack Demo   %s║%s\n' "$CYAN" "$NC" "$BOLD" "$NC" "$CYAN" "$NC"
  printf '%s║%s  Keycloak RBAC · MongoDB · Kafka · Observability · DevOps  %s║%s\n' "$CYAN" "$NC" "$CYAN" "$NC"
  printf '%s╚══════════════════════════════════════════════════════════════╝%s\n' "$CYAN" "$NC"
  printf '\n'

  printf '%s  WHO ACCESSES WHAT%s\n' "$BOLD" "$NC"
  printf '%s\n' "$SEP"
  printf '  %-30s → %s\n'  "Alumni / Non-Alumni"          "Storefront           http://localhost:5173"
  printf '  %-30s → %s\n'  "Platform Admin"               "Admin Console        http://localhost:5174"
  printf '  %-30s → %s\n'  "Amazon / Flipkart Merchant"   "Merchant Portal      http://localhost:5174"
  printf '  %-30s → %s\n'  "Internal DevOps (full access)" "Jenkins             http://localhost:8081"
  printf '  %-30s → %s\n'  "Internal DevOps (read-only)"  "Nexus / Grafana / Jaeger"
  printf '\n'

  printf '%s  ALL SERVICE URLS%s\n' "$BOLD" "$NC"
  printf '%s\n' "$SEP"
  printf '  %-24s %-32s %s\n' "Storefront"         "http://localhost:5173" "Alumni merch shop (shopping)"
  printf '  %-24s %-32s %s\n' "Admin/Merchant UI"  "http://localhost:5174" "Role-based management console"
  printf '  %-24s %-32s %s\n' "Backend API"        "http://localhost:3000" "REST API + Kafka + JWT auth"
  printf '  %-24s %-32s %s\n' "Keycloak"           "http://localhost:8080" "Identity & access management"
  printf '  %-24s %-32s %s\n' "Jenkins"            "http://localhost:8081" "CI/CD pipelines (DevOps)"
  printf '  %-24s %-32s %s\n' "Nexus Repository"   "http://localhost:8082" "Artifact & package registry"
  printf '  %-24s %-32s %s\n' "Prometheus"         "http://localhost:9090" "Metrics (Keycloak SSO — @nitte.ac.in)"
  printf '  %-24s %-32s %s\n' "Alertmanager"       "http://localhost:9093" "Alert routing & silencing"
  printf '  %-24s %-32s %s\n' "Grafana"            "http://localhost:3001" "Dashboards (Keycloak SSO or admin/admin123)"
  printf '  %-24s %-32s %s\n' "Jaeger"             "http://localhost:16686" "Traces (Keycloak SSO — @nitte.ac.in)"
  printf '  %-24s %-32s %s\n' "Loki"               "http://localhost:3100"  "Log aggregation API"
  printf '  %-24s %-32s %s\n' "API Docs"           "http://localhost:3000/api/docs" "Swagger / OpenAPI UI"
  printf '\n'

  printf '%s  DEMO CREDENTIALS%s\n' "$BOLD" "$NC"
  printf '%s\n' "$SEP"

  printf '  %s[ Storefront → http://localhost:5173 ]%s\n' "$YELLOW" "$NC"
  printf '  %-18s %-38s %s\n' "Platform Admin"    "admin@nitte.edu"                  "admin@123"
  printf '  %-18s %-38s %s\n' "Verified Alumni"   "alumni@nitte.edu"                 "alumni@123"
  printf '  %-18s %-38s %s\n' "Non-Alumni Guest"  "guest_user@alumni-shop.local"     "Guest@123"
  printf '\n'

  printf '  %s[ Admin Console → http://localhost:5174 ]%s\n' "$YELLOW" "$NC"
  printf '  %-18s %-38s %s\n' "Platform Admin"    "admin@nitte.edu"                  "admin@123"
  printf '  %-18s %-38s %s\n' "Amazon Merchant"   "amazon-merchant@amazon.com"       "Amazon@123"
  printf '  %-18s %-38s %s\n' "Flipkart Merchant" "flipkart-merchant@flipkart.com"   "Flipkart@123"
  printf '\n'

  printf '  %s[ Jenkins → http://localhost:8081  (Keycloak SSO) ]%s\n' "$YELLOW" "$NC"
  printf '  %-18s %-38s %s\n' "Internal Admin"    "internal-admin@nitte.ac.in"       "InternalAdmin@123  ⚑ 2FA"
  printf '  %-18s %-38s %s\n' "Internal User"     "internal-user@nitte.ac.in"        "InternalUser@123   (read-only)"
  printf '  %-18s %-38s %s\n' "Escape Hatch"      "local-admin"                      "LocalAdmin@123     (offline fallback)"
  printf '\n'

  printf '  %s[ Nexus → http://localhost:8082 ]%s\n' "$YELLOW" "$NC"
  printf '  %-18s %-38s %s\n' "Nexus Admin"       "admin"                            "nexus-admin-123"
  printf '\n'

  printf '  %s[ Grafana \u2192 http://localhost:3001  (Keycloak SSO) ]%s\n' "$YELLOW" "$NC"
  printf '  %-18s %-38s %s\n' "Internal Admin"    "internal-admin@nitte.ac.in"       "InternalAdmin@123  \u2691 2FA  \u2192 Grafana Admin"
  printf '  %-18s %-38s %s\n' "Internal User"     "internal-user@nitte.ac.in"        "InternalUser@123   \u2192 Grafana Editor"
  printf '  %-18s %-38s %s\n' "Local Fallback"    "admin  (local)"                    "admin123"
  printf '\n'

  printf '  %s[ Prometheus \u2192 http://localhost:9090  (Keycloak SSO) ]%s\n' "$YELLOW" "$NC"
  printf '  %-18s %-38s %s\n' "Internal Admin"    "internal-admin@nitte.ac.in"       "InternalAdmin@123  \u2691 2FA"
  printf '  %-18s %-38s %s\n' "Internal User"     "internal-user@nitte.ac.in"        "InternalUser@123"
  printf '\n'

  printf '  %s[ Jaeger \u2192 http://localhost:16686  (Keycloak SSO) ]%s\n' "$YELLOW" "$NC"
  printf '  %-18s %-38s %s\n' "Internal Admin"    "internal-admin@nitte.ac.in"       "InternalAdmin@123  \u2691 2FA"
  printf '  %-18s %-38s %s\n' "Internal User"     "internal-user@nitte.ac.in"        "InternalUser@123"
  printf '\n'

  printf '  %s[ Keycloak → http://localhost:8080/admin ]%s\n' "$YELLOW" "$NC"
  printf '  %-18s %-38s %s\n' "Console Admin"     "admin"                            "admin"
  printf '\n'

  printf '%s  QUICK COMMANDS%s\n' "$BOLD" "$NC"
  printf '%s\n' "$SEP"
  printf '  %-14s %s\n' "$0 stop"    "Stop all services"
  printf '  %-14s %s\n' "$0 restart" "Restart the full stack"
  printf '  %-14s %s\n' "$0 logs"    "Tail logs from all containers"
  printf '  %-14s %s\n' "$0 status"  "Show container health"
  printf '  %-14s %s\n' "$0 clean"   "Destroy everything including volumes  ⚠ DATA LOSS"
  printf '\n'
}

usage() {
  cat <<EOF
NITTE Alumni Merchandise Shop - Docker setup

Usage: $0 [command]

Commands:
  start     Pull images, build and start the full stack (default)
  stop      Stop all containers
  restart   Stop then start
  clean     Stop + remove all containers and volumes (DATA LOSS)
  status    Show running services
  logs      Follow logs from all services
  demo      Run a quick self-test against the running stack
  help      Show this message

Examples:
  $0                # equivalent to: $0 start
  $0 start
  $0 logs
EOF
}

# ---------- Entry -----------------------------------------------------------
main() {
  local action="${1:-start}"
  case "$action" in
    start)   start_services ;;
    stop)    stop_services ;;
    restart) restart_services ;;
    clean)   clean_all ;;
    status)  show_status ;;
    logs)    show_logs ;;
    demo)    run_demo ;;
    help|-h|--help) usage ;;
    *)
      err "Unknown command: $action"
      usage
      exit 1
      ;;
  esac
}

main "$@"
