#!/usr/bin/env bash
###############################################################################
# NITTE Alumni Merchandise Shop — one-shot Kubernetes setup (minikube)
#
# Usage:
#   ./k8s-setup.sh [start|stop|restart|clean|status|logs|demo|help]
#
# Requirements:
#   - Docker (running)
#   - minikube   (https://minikube.sigs.k8s.io/docs/start/)
#   - kubectl    (https://kubernetes.io/docs/tasks/tools/)
#
# Tip: Install on Linux/Mac:
#   curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
#   sudo install minikube-linux-amd64 /usr/local/bin/minikube
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

NS="nitte"
PF_PIDS_FILE="$SCRIPT_DIR/.k8s-pf.pids"
K8S_DIR="$SCRIPT_DIR/k8s"

# ---------- Pretty printing ---------------------------------------------------
if [[ -t 1 ]]; then
  RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
  BLUE=$'\033[0;34m'; CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; CYAN=''; BOLD=''; NC=''
fi

header() { printf '\n%s========================================%s\n%s%s%s\n%s========================================%s\n\n' "$CYAN" "$NC" "$BOLD$CYAN" "$1" "$NC" "$CYAN" "$NC"; }
ok()     { printf '%s[OK]%s    %s\n' "$GREEN"  "$NC" "$1"; }
err()    { printf '%s[ERROR]%s %s\n' "$RED"    "$NC" "$1" >&2; }
info()   { printf '%s[INFO]%s  %s\n' "$BLUE"   "$NC" "$1"; }
step()   { printf '%s[STEP]%s  %s\n' "$YELLOW" "$NC" "$1"; }

trap 'echo; err "Interrupted."; exit 130' INT TERM

# ---------- Prerequisites ----------------------------------------------------
check_prereqs() {
  header "Checking Prerequisites"

  if ! command -v docker &>/dev/null; then
    err "Docker is not installed. Install from https://docs.docker.com/get-docker/"
    exit 1
  fi
  ok "Docker: $(docker --version | head -1)"

  if ! docker info &>/dev/null; then
    err "Docker daemon is not running. Start Docker Desktop or: sudo systemctl start docker"
    exit 1
  fi
  ok "Docker daemon is running"

  if ! command -v minikube &>/dev/null; then
    err "minikube is not installed."
    info "Install: https://minikube.sigs.k8s.io/docs/start/"
    info "  Linux:   curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64 && sudo install minikube-linux-amd64 /usr/local/bin/minikube"
    info "  macOS:   brew install minikube"
    info "  Windows: choco install minikube  OR  winget install minikube"
    exit 1
  fi
  ok "minikube: $(minikube version --short)"

  if ! command -v kubectl &>/dev/null; then
    err "kubectl is not installed."
    info "Install: https://kubernetes.io/docs/tasks/tools/"
    info "  Linux:   curl -LO 'https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl' && sudo install kubectl /usr/local/bin/"
    info "  macOS:   brew install kubectl"
    exit 1
  fi
  ok "kubectl: $(kubectl version --client --short 2>/dev/null || kubectl version --client | head -1)"

  if [[ ! -d "$K8S_DIR" ]]; then
    err "k8s/ manifest directory not found in $SCRIPT_DIR"
    exit 1
  fi
  ok "k8s/ manifests directory present"
}

# ---------- Minikube startup -------------------------------------------------
ensure_minikube() {
  header "Starting Minikube"

  local status
  status=$(minikube status --format='{{.Host}}' 2>/dev/null || echo "Stopped")

  if [[ "$status" == "Running" ]]; then
    ok "Minikube already running"
  else
    step "Starting minikube (8GB RAM, 4 CPUs) — this may take a few minutes on first run…"
    minikube start \
      --memory=8192 \
      --cpus=4 \
      --disk-size=20g \
      --driver=docker
    ok "Minikube started"
  fi

  # Point our shell's docker to minikube's daemon so built images are visible to k8s
  step "Configuring Docker to build into minikube's daemon…"
  eval "$(minikube docker-env)"
  ok "Docker pointed at minikube"
}

# ---------- Build custom images ----------------------------------------------
build_images() {
  header "Building Custom Images"

  local images=(
    "node-backend:1.0.0|./node-backend"
    "frontend:1.0.0|./frontend"
    "admin-dashboard:1.0.0|./admin-dashboard"
    "notification-service:1.0.0|./notification-service"
    "python-service:1.0.0|./python-service"
    "nitte-jenkins:1.0.0|./jenkins"
    "nitte-nexus:1.0.0|./nexus"
  )

  local total=${#images[@]}
  local idx=0
  for entry in "${images[@]}"; do
    idx=$((idx+1))
    local tag="${entry%%|*}"
    local ctx="${entry##*|}"
    if docker image inspect "$tag" &>/dev/null; then
      ok "[$idx/$total] cached: $tag"
    else
      step "[$idx/$total] building $tag from $ctx…"
      docker build -t "$tag" "$ctx"
      ok "[$idx/$total] built: $tag"
    fi
  done

  ok "All custom images ready"
}

# ---------- Create ConfigMaps from host files --------------------------------
create_configmaps() {
  header "Creating ConfigMaps"

  # Helper: idempotent create-or-update configmap
  cm_from_file() {
    local name="$1"; shift
    kubectl create configmap "$name" "$@" -n "$NS" \
      --dry-run=client -o yaml | kubectl apply -f - >/dev/null
    ok "ConfigMap: $name"
  }

  cm_from_file mongo-init-config \
    --from-file=mongo-init.js=./database/mongo-init.js

  cm_from_file keycloak-realm-config \
    --from-file=nitte-realm.json=./keycloak/nitte-realm.json

  cm_from_file keycloak-bootstrap-config \
    --from-file=keycloak-bootstrap.sh=./keycloak/keycloak-bootstrap.sh

  cm_from_file prometheus-main-config \
    --from-file=prometheus.yml=./prometheus/prometheus.yml

  cm_from_file prometheus-rules-config \
    --from-file=./prometheus/rules/

  cm_from_file alertmanager-config \
    --from-file=alertmanager.yml=./alertmanager/alertmanager.yml

  cm_from_file loki-config \
    --from-file=loki-config.yml=./loki/loki-config.yml

  cm_from_file grafana-datasources-config \
    --from-file=./grafana/provisioning/datasources/

  cm_from_file grafana-dashboards-config \
    --from-file=./grafana/provisioning/dashboards/

  cm_from_file jenkins-casc-config \
    --from-file=jenkins.yaml=./jenkins/casc/jenkins.yaml

  ok "All ConfigMaps created/updated"
}

# ---------- Apply manifests in dependency order ------------------------------
deploy_manifests() {
  header "Deploying Kubernetes Manifests"

  local manifests=(
    "namespace.yaml"
    "secrets.yaml"
    "pvcs.yaml"
    "mongodb.yaml"
    "keycloak.yaml"
    "keycloak-setup.yaml"
    "kafka.yaml"
    "python-service.yaml"
    "node-backend.yaml"
    "frontend.yaml"
    "admin-dashboard.yaml"
    "notification-service.yaml"
    "jaeger.yaml"
    "alertmanager.yaml"
    "loki.yaml"
    "promtail.yaml"
    "prometheus.yaml"
    "grafana.yaml"
    "oauth2-proxies.yaml"
    "jenkins.yaml"
    "nexus.yaml"
  )

  for manifest in "${manifests[@]}"; do
    step "Applying $manifest…"
    kubectl apply -f "$K8S_DIR/$manifest" >/dev/null
    ok "Applied: $manifest"
  done
}

# ---------- Wait for deployments to be ready ---------------------------------
wait_ready() {
  header "Waiting for All Pods to be Ready"

  local deployments=(
    "mongodb"
    "keycloak"
    "zookeeper"
    "kafka"
    "python-service"
    "node-backend"
    "frontend"
    "admin-dashboard"
    "notification-service"
    "jaeger"
    "alertmanager"
    "loki"
    "prometheus"
    "grafana"
    "oauth2-proxy-prometheus"
    "oauth2-proxy-jaeger"
    "jenkins"
    "nexus"
  )

  for deploy in "${deployments[@]}"; do
    step "Waiting for $deploy…"
    if kubectl rollout status deployment/"$deploy" -n "$NS" --timeout=300s >/dev/null 2>&1; then
      ok "$deploy is ready"
    else
      err "$deploy did not become ready in 5 minutes"
      info "Check with: kubectl describe pod -n $NS -l app=$deploy"
      info "Logs:       kubectl logs -n $NS -l app=$deploy --tail=50"
    fi
  done
}

# ---------- Port-forward all services to localhost ---------------------------
# Maps the same ports as docker-compose so all URLs remain identical
start_port_forwards() {
  header "Starting Port-Forwards"

  # Kill any stale forwards first
  stop_port_forwards_quiet

  rm -f "$PF_PIDS_FILE"
  touch "$PF_PIDS_FILE"

  pf_bg() {
    local label="$1" svc="$2" ports="$3"
    ( while true; do
        kubectl port-forward -n "$NS" "svc/$svc" $ports >/dev/null 2>&1
        sleep 1
      done ) &
    echo $! >> "$PF_PIDS_FILE"
    ok "Port-forward: $label  ($ports)"
  }

  pf_bg "Keycloak"             "keycloak"              "8080:8080"
  pf_bg "Backend API"          "node-backend"          "3000:3000"
  pf_bg "Storefront"           "frontend"              "5173:5173"
  pf_bg "Admin Dashboard"      "admin-dashboard"       "5174:5174"
  pf_bg "Python Service"       "python-service"        "8000:8000"
  pf_bg "Prometheus (proxied)" "oauth2-proxy-prometheus" "9090:4180"
  pf_bg "Jaeger (proxied)"     "oauth2-proxy-jaeger"   "16686:4181"
  pf_bg "Alertmanager"         "alertmanager"          "9093:9093"
  pf_bg "Grafana"              "grafana"               "3001:3000"
  pf_bg "Loki"                 "loki"                  "3100:3100"
  pf_bg "Jenkins"              "jenkins"               "8081:8080"
  pf_bg "Nexus"                "nexus"                 "8082:8081"
  pf_bg "MongoDB"              "mongodb"               "27017:27017"

  info "Port-forward PIDs saved to .k8s-pf.pids"
  info "Run './k8s-setup.sh stop' to clean up all port-forwards"
}

stop_port_forwards_quiet() {
  if [[ -f "$PF_PIDS_FILE" ]]; then
    while IFS= read -r pid; do
      kill "$pid" 2>/dev/null || true
    done < "$PF_PIDS_FILE"
    rm -f "$PF_PIDS_FILE"
  fi
  pkill -f "kubectl port-forward" 2>/dev/null || true
}

# ---------- Mount repo into minikube for Jenkins ----------------------------
mount_repo_for_jenkins() {
  step "Making repo available to Jenkins at /workspace/repo inside minikube…"
  # Run in background; minikube mount blocks while active
  minikube mount "$SCRIPT_DIR:/workspace/repo" >/dev/null 2>&1 &
  echo $! >> "$PF_PIDS_FILE"
  ok "Repo mounted at /workspace/repo (minikube mount running in background)"
}

# ---------- Probe API health -------------------------------------------------
probe_api() {
  step "Probing API gateway health (up to 90s)…"
  local ok_flag=0
  for _ in $(seq 1 90); do
    if curl -fsS --max-time 2 http://localhost:3000/api/v1/health >/dev/null 2>&1; then
      ok_flag=1; break
    fi
    sleep 1
  done
  if [[ $ok_flag -eq 1 ]]; then
    ok "API gateway is healthy"
  else
    err "API gateway not responding at http://localhost:3000/api/v1/health"
    info "Check: kubectl logs -n $NS -l app=node-backend --tail=50"
  fi
}

# ---------- Start all --------------------------------------------------------
start_services() {
  check_prereqs
  ensure_minikube
  build_images
  create_configmaps
  deploy_manifests
  wait_ready
  start_port_forwards
  mount_repo_for_jenkins
  probe_api
  show_status
  print_summary
}

# ---------- Stop all ---------------------------------------------------------
stop_services() {
  header "Stopping Services"
  stop_port_forwards_quiet
  ok "Port-forwards stopped"
  # Stop minikube mounts too
  pkill -f "minikube mount" 2>/dev/null || true
  info "Kubernetes pods remain running. Use 'kubectl delete ns $NS' to remove pods."
  info "Or run: ./k8s-setup.sh clean"
}

# ---------- Restart ----------------------------------------------------------
restart_services() {
  header "Restarting Deployments"
  stop_port_forwards_quiet
  step "Rolling restart of all deployments…"
  kubectl rollout restart deployment -n "$NS"
  wait_ready
  start_port_forwards
  mount_repo_for_jenkins
  probe_api
  print_summary
}

# ---------- Clean everything -------------------------------------------------
clean_all() {
  printf '%s[!]%s This removes the entire %s namespace, ALL pods and PVCs (DATA LOSS).\n' "$RED" "$NC" "$NS"
  read -r -p "Type YES to confirm: " conf
  if [[ "$conf" != "YES" ]]; then info "Cancelled."; return; fi
  stop_port_forwards_quiet
  pkill -f "minikube mount" 2>/dev/null || true
  step "Deleting namespace $NS…"
  kubectl delete namespace "$NS" --ignore-not-found=true
  ok "Namespace $NS deleted (all pods, services, PVCs removed)"
  info "Minikube cluster itself is still running. Use 'minikube delete' to remove it entirely."
}

# ---------- Status -----------------------------------------------------------
show_status() {
  header "Kubernetes Status — namespace: $NS"

  local SEP="  ${CYAN}$(printf '%.0s─' {1..80})${NC}"

  printf '  %b%-24s %-36s %-10s %-8s%b\n' \
    "$BOLD" "DEPLOYMENT" "PODS" "READY" "PORT" "$NC"
  printf '%b\n' "$SEP"

  local -a SERVICES=(
    "mongodb|27017"
    "keycloak|8080"
    "zookeeper|—"
    "kafka|—"
    "python-service|8000"
    "node-backend|3000"
    "frontend|5173"
    "admin-dashboard|5174"
    "notification-service|—"
    "jaeger|—"
    "prometheus|—"
    "alertmanager|9093"
    "loki|3100"
    "grafana|3001"
    "oauth2-proxy-prometheus|9090"
    "oauth2-proxy-jaeger|16686"
    "jenkins|8081"
    "nexus|8082"
  )

  local running=0 total=${#SERVICES[@]}
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name port <<< "$entry"
    local ready desired status_color
    ready=$(kubectl get deployment "$name" -n "$NS" \
      -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    desired=$(kubectl get deployment "$name" -n "$NS" \
      -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")
    local pod_info
    pod_info=$(kubectl get pods -n "$NS" -l "app=$name" \
      --no-headers -o custom-columns=':metadata.name,:status.phase' 2>/dev/null | head -1 || echo "")

    [[ -z "$ready" ]] && ready="0"
    if [[ "$ready" -ge "${desired:-1}" ]] 2>/dev/null; then
      status_color="$GREEN"; running=$((running+1))
    else
      status_color="$RED"
    fi
    local port_disp; [[ "$port" == "—" ]] && port_disp="—" || port_disp=":$port"

    printf '  %-24s %b%-36s%b %-10s %-8s\n' \
      "$name" "$status_color" "${pod_info:-not deployed}" "$NC" \
      "${ready}/${desired:-1}" "$port_disp"
  done

  printf '%b\n' "$SEP"
  if [[ "$running" -eq "$total" ]]; then
    printf '%b  ✔  All %d/%d deployments ready%b\n\n' "$GREEN$BOLD" "$running" "$total" "$NC"
  else
    printf '%b  ⚠  %d/%d deployments ready%b\n\n' "$YELLOW$BOLD" "$running" "$total" "$NC"
  fi

  # Show port-forward status
  local pf_count=0
  if [[ -f "$PF_PIDS_FILE" ]]; then
    pf_count=$(wc -l < "$PF_PIDS_FILE" | tr -d ' ')
  fi
  if [[ "$pf_count" -gt 0 ]]; then
    ok "Port-forwards active ($pf_count background processes)"
  else
    info "No port-forwards running — run './k8s-setup.sh start' or add port-forwards manually"
  fi
}

# ---------- Logs (interactive) -----------------------------------------------
show_logs() {
  local target="${2:-node-backend}"
  info "Streaming logs for: $target (Ctrl+C to stop)"
  kubectl logs -n "$NS" -l "app=$target" -f --tail=50
}

# ---------- Quick demo -------------------------------------------------------
run_demo() {
  header "Quick Demo Test"
  step "Hitting health endpoint…"
  if curl -fsS http://localhost:3000/api/v1/health; then
    echo; ok "API healthy"
  else
    err "API not reachable. Run: ./k8s-setup.sh start"
    exit 1
  fi
  step "Generating test traffic…"
  for _ in $(seq 1 10); do
    curl -fsS http://localhost:3000/api/v1/products -o /dev/null || true
    curl -fsS http://localhost:3000/api/v1/health   -o /dev/null || true
  done
  ok "Test traffic sent"
  print_summary
}

# ---------- Summary ----------------------------------------------------------
print_summary() {
  local SEP="${CYAN}  $(printf '%.0s─' {1..62})${NC}"
  printf '\n'
  printf '%s╔══════════════════════════════════════════════════════════════╗%s\n' "$CYAN" "$NC"
  printf '%s║%s  %sNITTE Alumni Shop — Kubernetes (minikube) Edition%s         %s║%s\n' "$CYAN" "$NC" "$BOLD" "$NC" "$CYAN" "$NC"
  printf '%s║%s  Keycloak RBAC · MongoDB · Kafka · Observability · DevOps  %s║%s\n' "$CYAN" "$NC" "$CYAN" "$NC"
  printf '%s╚══════════════════════════════════════════════════════════════╝%s\n' "$CYAN" "$NC"
  printf '\n'

  printf '%s  ALL SERVICE URLS  (same as docker-compose)%s\n' "$BOLD" "$NC"
  printf '%s\n' "$SEP"
  printf '  %-24s %-32s %s\n' "Storefront"          "http://localhost:5173"  "Alumni merch shop"
  printf '  %-24s %-32s %s\n' "Admin / Merchant UI" "http://localhost:5174"  "Role-based management"
  printf '  %-24s %-32s %s\n' "Backend API"         "http://localhost:3000"  "REST API + JWT auth"
  printf '  %-24s %-32s %s\n' "Keycloak"            "http://localhost:8080"  "Identity & access"
  printf '  %-24s %-32s %s\n' "Jenkins"             "http://localhost:8081"  "CI/CD pipelines"
  printf '  %-24s %-32s %s\n' "Nexus Repository"    "http://localhost:8082"  "Artifact registry"
  printf '  %-24s %-32s %s\n' "Prometheus"          "http://localhost:9090"  "Metrics (Keycloak SSO)"
  printf '  %-24s %-32s %s\n' "Alertmanager"        "http://localhost:9093"  "Alert routing"
  printf '  %-24s %-32s %s\n' "Grafana"             "http://localhost:3001"  "Dashboards"
  printf '  %-24s %-32s %s\n' "Jaeger"              "http://localhost:16686" "Traces (Keycloak SSO)"
  printf '  %-24s %-32s %s\n' "Loki"                "http://localhost:3100"  "Log aggregation"
  printf '\n'

  printf '%s  DEMO CREDENTIALS%s\n' "$BOLD" "$NC"
  printf '%s\n' "$SEP"
  printf '  %-18s %-36s %s\n' "Platform Admin"    "admin@nitte.edu"               "admin@123"
  printf '  %-18s %-36s %s\n' "Amazon Merchant"   "amazon-merchant@amazon.com"    "Amazon@123"
  printf '  %-18s %-36s %s\n' "Flipkart Merchant" "flipkart-merchant@flipkart.com" "Flipkart@123"
  printf '  %-18s %-36s %s\n' "Jenkins (local)"   "local-admin"                   "LocalAdmin@123"
  printf '  %-18s %-36s %s\n' "Nexus"             "admin"                         "nexus-admin-123"
  printf '  %-18s %-36s %s\n' "Grafana (local)"   "admin"                         "admin123"
  printf '\n'

  printf '%s  QUICK COMMANDS%s\n' "$BOLD" "$NC"
  printf '%s\n' "$SEP"
  printf '  %-30s %s\n' "./k8s-setup.sh stop"      "Stop port-forwards"
  printf '  %-30s %s\n' "./k8s-setup.sh restart"   "Rolling restart + re-forward ports"
  printf '  %-30s %s\n' "./k8s-setup.sh status"    "Show pod health"
  printf '  %-30s %s\n' "./k8s-setup.sh logs node-backend" "Tail logs for a service"
  printf '  %-30s %s\n' "./k8s-setup.sh clean"     "Delete all k8s resources (DATA LOSS)"
  printf '  %-30s %s\n' "minikube dashboard"        "Open Kubernetes web UI"
  printf '  %-30s %s\n' "kubectl get pods -n nitte" "Raw pod status"
  printf '\n'
}

usage() {
  cat <<EOF
NITTE Alumni Merchandise Shop — Kubernetes setup

Usage: $0 [command] [args]

Commands:
  start           Pull/build images, deploy all services, start port-forwards (default)
  stop            Stop port-forwards (pods keep running)
  restart         Rolling restart of all deployments + re-start port-forwards
  clean           Delete namespace + all data volumes (DATA LOSS)
  status          Show deployment health
  logs <service>  Tail logs for a service (default: node-backend)
  demo            Quick self-test against running stack
  help            Show this message

Examples:
  $0                     # start everything
  $0 logs python-service # tail python-service logs
  $0 status
EOF
}

# ---------- Entry point ------------------------------------------------------
main() {
  local action="${1:-start}"
  case "$action" in
    start)   start_services ;;
    stop)    stop_services ;;
    restart) restart_services ;;
    clean)   clean_all ;;
    status)  show_status ;;
    logs)    show_logs "$@" ;;
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
