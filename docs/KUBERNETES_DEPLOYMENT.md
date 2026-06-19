# Kubernetes Deployment Guide — NITTE Alumni Merchandise Shop

## Desired Architecture

```
Your System (Windows/Mac/Linux)
        │
        │  ssh arcade@117.250.206.138
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Ubuntu Desktop (Host)                              │
│                    arcade-HP                                          │
│                                                                      │
│   ┌──────────────── VirtualBox ─────────────────────────────────┐   │
│   │                                                             │   │
│   │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐      │   │
│   │  │  mastervm   │   │   dev-vm    │   │   prod-vm   │      │   │
│   │  │  (Master)   │   │ (Worker 1)  │   │ (Worker 2)  │      │   │
│   │  │  6GB/100GB  │   │  8GB/150GB  │   │  8GB/150GB  │      │   │
│   │  └─────────────┘   └─────────────┘   └─────────────┘      │   │
│   │                                                             │   │
│   │         RKE2 Kubernetes Cluster (Rancher)                   │   │
│   │    Single Master + 2 Worker Nodes  (22GB total RAM)         │   │
│   │                                                             │   │
│   │  ┌───────────────────────────────────────────────────────┐  │   │
│   │  │              Istio Service Mesh (mTLS)                │  │   │
│   │  │                                                       │  │   │
│   │  │  App: Frontend · Admin · Merchant · Backend · Python  │  │   │
│   │  │  Data: MongoDB Sharded · Kafka · MinIO                │  │   │
│   │  │  Auth: Keycloak · WAF                                 │  │   │
│   │  │  Obs: Prometheus · Grafana · Loki · Jaeger · GoAlert  │  │   │
│   │  │  CI/CD: Jenkins · SonarQube · Nexus · ArgoCD          │  │   │
│   │  │  Docs: Redocly (OpenAPI + SwaggerUI)                  │  │   │
│   │  │                                                       │  │   │
│   │  └───────────────────────────────────────────────────────┘  │   │
│   └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

> **VM Names (actual):** `mastervm`, `dev-vm`, `prod-vm`
> Verify with `VBoxManage list runningvms` on the host.
> **Total cluster RAM: 22GB** (6+8+8). Tight for the full stack — see resource notes below.

---

## Resource Planning (IMPORTANT — 22GB total)

The cluster has **22GB total RAM** (mastervm 6GB + dev-vm 8GB + prod-vm 8GB). The full stack with Istio is tight. Approximate memory budget:

| Group | Components | ~RAM |
|-------|-----------|------|
| Kubernetes + RKE2 system | etcd, control plane, CNI, kubelet | ~3 GB |
| Istio | istiod, ingress, sidecars (×~25 pods) | ~2 GB |
| Data layer | MongoDB (4 pods), Kafka, Zookeeper, MinIO | ~5 GB |
| Identity | Keycloak | ~1 GB |
| Apps | backend, python, 3 frontends, notification | ~2 GB |
| Observability | Prometheus, Grafana, Loki, Jaeger, promtail | ~3 GB |
| CI/CD | Jenkins, Nexus, SonarQube, ArgoCD | ~4 GB |
| New | GoAlert, Redocly, WAF | ~1 GB |
| **Total** | | **~21 GB** |

**This leaves almost no headroom.** Recommendations:
- **Phase the deployment** — bring up infra + apps first, verify, then add CI/CD and observability
- **SonarQube is heavy (~2GB)** — run it only during builds, scale to 0 otherwise: `kubectl scale deploy/sonarqube --replicas=0`
- **Nexus is heavy (~1.5GB)** — keep if you need the registry; otherwise use the lightweight local `registry:2`
- Consider running **Jenkins + SonarQube on dev-vm** and keeping **prod-vm** for runtime workloads
- If pods get `Evicted` or `OOMKilled`, scale down non-critical tools

---



| Category | Component | Purpose | Status |
|----------|-----------|---------|--------|
| **Cluster** | RKE2 | Kubernetes distribution (Rancher) | To provision |
| **Cluster** | Rancher UI | Cluster management dashboard | To install |
| **Service Mesh** | Istio | mTLS, circuit breakers, rate limiting | To install |
| **Service Mesh** | Kiali | Istio visualization dashboard | To install |
| **GitOps** | ArgoCD | Continuous delivery from Git | To install |
| **CI/CD** | Jenkins | Build pipelines | To deploy |
| **CI/CD** | SonarQube | Code quality & security scanning | To deploy |
| **Artifacts** | Sonatype Nexus | Docker/npm/Maven registry | To deploy |
| **Security** | Keycloak | Identity & access management (OIDC) | To deploy |
| **Security** | WAF | Web Application Firewall (ModSecurity/Coraza) | To deploy |
| **Security** | Istio AuthorizationPolicy | Service-to-service access control | To configure |
| **Storage** | MinIO | S3-compatible object storage | To deploy |
| **Database** | MongoDB Sharded | Config + 2 shards + mongos | To deploy |
| **Streaming** | Kafka + Zookeeper | Event-driven messaging | To deploy |
| **Monitoring** | Prometheus | Metrics collection | To deploy |
| **Monitoring** | Grafana | Dashboards & alerting | To deploy |
| **Monitoring** | GoAlert | On-call alerting & escalation | To deploy |
| **Logging** | Loki | Log aggregation | To deploy |
| **Logging** | Promtail | Log shipping | To deploy |
| **Tracing** | Jaeger | Distributed tracing | To deploy |
| **API Docs** | Redocly + SwaggerUI | OpenAPI documentation portal | To deploy |
| **App** | Frontend (Storefront) | Alumni shopping UI | To deploy |
| **App** | Admin Dashboard | User verification, DB mgmt | To deploy |
| **App** | Merchant Portal | Product/order management | To deploy |
| **App** | Node Backend | Express.js API gateway | To deploy |
| **App** | Python Service | FastAPI catalog/orders | To deploy |
| **App** | Notification Service | Kafka consumer → Email/Slack | To deploy |

---

## What Needs to Be Done on the Server

### Phase 0: Server Access & VM Verification

```bash
# SSH into Ubuntu Desktop host
ssh arcade@117.250.206.138

# Verify VMs are running
VBoxManage list runningvms

# SSH into master node
ssh master@192.168.56.10

# Verify RKE2 cluster health
sudo kubectl get nodes
# Expected: mastervm (Ready, control-plane), dev-vm (Ready), prod-vm (Ready)
```

---

### Phase 1: RKE2 Cluster Setup & kubectl Access

**What:** Configure kubectl, create namespace, set up kubeconfig.

```bash
# On master node
mkdir -p ~/.kube
sudo cp /etc/rancher/rke2/rke2.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
export KUBECONFIG=~/.kube/config
echo 'export KUBECONFIG=~/.kube/config' >> ~/.bashrc

# Create project namespace
kubectl create namespace nitte-merch
kubectl config set-context --current --namespace=nitte-merch
```

---

### Phase 2: Install Istio Service Mesh

**What:** Install Istio with demo profile for mTLS, traffic management, and observability.

```bash
# Download istioctl on master node
curl -L https://istio.io/downloadIstio | ISTIO_VERSION=1.20.0 sh -
cd istio-1.20.0
export PATH=$PWD/bin:$PATH
echo 'export PATH=~/istio-1.20.0/bin:$PATH' >> ~/.bashrc

# Install Istio (demo profile includes ingress gateway + kiali + prometheus)
istioctl install --set profile=demo -y

# Enable sidecar injection for our namespace
kubectl label namespace nitte-merch istio-injection=enabled

# Verify
kubectl get pods -n istio-system
# Expected: istiod, istio-ingressgateway, istio-egressgateway all Running

# Install Kiali (Istio dashboard)
kubectl apply -f istio-1.20.0/samples/addons/kiali.yaml
kubectl apply -f istio-1.20.0/samples/addons/prometheus.yaml
```

---

### Phase 3: Install ArgoCD (GitOps)

**What:** ArgoCD watches the Git repo and auto-deploys changes to the cluster.

```bash
# Create ArgoCD namespace
kubectl create namespace argocd

# Install ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for pods
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=argocd-server -n argocd --timeout=300s

# Expose ArgoCD UI via NodePort
kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "NodePort", "ports": [{"port": 443, "targetPort": 8080, "nodePort": 30443}]}}'

# Get initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
echo

# Access: https://192.168.56.10:30443
# Username: admin
# Password: (from above command)
```

**Configure ArgoCD to watch the repo:**
```bash
# Install ArgoCD CLI
curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x argocd
sudo mv argocd /usr/local/bin/

# Login
argocd login 192.168.56.10:30443 --insecure --username admin --password <password>

# Add the Git repo
argocd repo add https://github.com/radheshpai87/learning-devops.git

# Create the application (watches k8s/ folder)
argocd app create nitte-merch \
  --repo https://github.com/radheshpai87/learning-devops.git \
  --path k8s \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace nitte-merch \
  --sync-policy automated \
  --auto-prune \
  --self-heal
```

---

### Phase 4: Container Registry (Local)

**What:** Deploy a local Docker registry inside the cluster for custom images.

```bash
# Deploy registry
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: registry
  namespace: nitte-merch
spec:
  replicas: 1
  selector:
    matchLabels:
      app: registry
  template:
    metadata:
      labels:
        app: registry
      annotations:
        sidecar.istio.io/inject: "false"
    spec:
      containers:
      - name: registry
        image: registry:2
        ports:
        - containerPort: 5000
        volumeMounts:
        - name: registry-data
          mountPath: /var/lib/registry
      volumes:
      - name: registry-data
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: registry
  namespace: nitte-merch
spec:
  type: NodePort
  ports:
  - port: 5000
    targetPort: 5000
    nodePort: 30500
  selector:
    app: registry
EOF
```

**Configure all nodes to trust the local registry:**
```bash
# On EACH node (master, worker1, worker2):
sudo mkdir -p /etc/rancher/rke2
sudo tee /etc/rancher/rke2/registries.yaml <<EOF
mirrors:
  "192.168.56.10:30500":
    endpoint:
      - "http://192.168.56.10:30500"
EOF

# Restart RKE2 (one node at a time!)
# Master: sudo systemctl restart rke2-server
# Workers: sudo systemctl restart rke2-agent
```

**Build and push images:**
```bash
cd ~/learning-devops
REGISTRY="192.168.56.10:30500"

docker build -t $REGISTRY/node-backend:1.0.0 ./node-backend
docker build -t $REGISTRY/python-service:1.0.0 ./python-service
docker build -t $REGISTRY/frontend:1.0.0 ./frontend
docker build -t $REGISTRY/admin-dashboard:1.0.0 ./admin-dashboard
docker build -t $REGISTRY/merchant-portal:1.0.0 ./merchant-portal
docker build -t $REGISTRY/notification-service:1.0.0 ./notification-service
docker build -t $REGISTRY/loki-rbac-proxy:1.0.0 ./loki-rbac-proxy

for img in node-backend python-service frontend admin-dashboard merchant-portal notification-service loki-rbac-proxy; do
  docker push $REGISTRY/$img:1.0.0
done
```

---

### Phase 5: Deploy WAF (Web Application Firewall)

**What:** ModSecurity/Coraza WAF in front of the Istio ingress gateway to block SQL injection, XSS, etc.

```bash
# Option A: Use Istio's built-in WAF via EnvoyFilter with Coraza
kubectl apply -f - <<EOF
apiVersion: networking.istio.io/v1alpha3
kind: EnvoyFilter
metadata:
  name: waf-filter
  namespace: istio-system
spec:
  workloadSelector:
    labels:
      istio: ingressgateway
  configPatches:
  - applyTo: HTTP_FILTER
    match:
      context: GATEWAY
      listener:
        filterChain:
          filter:
            name: "envoy.filters.network.http_connection_manager"
            subFilter:
              name: "envoy.filters.http.router"
    patch:
      operation: INSERT_BEFORE
      value:
        name: envoy.filters.http.wasm
        typed_config:
          "@type": type.googleapis.com/udpa.type.v1.TypedStruct
          type_url: type.googleapis.com/envoy.extensions.filters.http.wasm.v3.Wasm
          value:
            config:
              name: "coraza-filter"
              root_id: ""
              vm_config:
                vm_id: "coraza-filter"
                runtime: "envoy.wasm.runtime.v8"
                code:
                  remote:
                    http_uri:
                      uri: "https://github.com/corazawaf/coraza-proxy-wasm/releases/download/v0.5.0/coraza-proxy-wasm.wasm"
                      timeout: 10s
              configuration:
                "@type": "type.googleapis.com/google.protobuf.StringValue"
                value: |
                  {
                    "directives_map": {
                      "default": [
                        "SecRuleEngine On",
                        "SecRule REQUEST_URI \"@rx /etc/passwd\" \"id:1,phase:1,deny,status:403,msg:'Path traversal attempt'\""
                      ]
                    },
                    "default_directives": "default"
                  }
EOF
```

**Option B (simpler): Deploy ModSecurity as a reverse proxy in front of ingress:**
```bash
# Deploy ModSecurity nginx as a WAF gateway
kubectl apply -f k8s/waf/modsecurity-deployment.yaml
```

---

### Phase 6: Deploy GoAlert (On-Call Alerting)

**What:** GoAlert handles alert escalation, on-call schedules, and notifications. Integrates with Prometheus Alertmanager.

```bash
# Deploy GoAlert
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: goalert
  namespace: nitte-merch
  labels:
    app: goalert
spec:
  replicas: 1
  selector:
    matchLabels:
      app: goalert
  template:
    metadata:
      labels:
        app: goalert
    spec:
      containers:
      - name: goalert
        image: goalert/goalert:latest
        ports:
        - containerPort: 8081
        env:
        - name: GOALERT_DB_URL
          value: "postgres://goalert:goalert@goalert-postgres:5432/goalert?sslmode=disable"
        - name: GOALERT_PUBLIC_URL
          value: "http://192.168.56.10:30084"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "300m"
---
apiVersion: v1
kind: Service
metadata:
  name: goalert
  namespace: nitte-merch
spec:
  type: NodePort
  ports:
  - port: 8081
    targetPort: 8081
    nodePort: 30084
  selector:
    app: goalert
EOF

# GoAlert needs PostgreSQL - deploy a small instance
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: goalert-postgres
  namespace: nitte-merch
spec:
  replicas: 1
  selector:
    matchLabels:
      app: goalert-postgres
  template:
    metadata:
      labels:
        app: goalert-postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        env:
        - name: POSTGRES_USER
          value: "goalert"
        - name: POSTGRES_PASSWORD
          value: "goalert"
        - name: POSTGRES_DB
          value: "goalert"
        ports:
        - containerPort: 5432
---
apiVersion: v1
kind: Service
metadata:
  name: goalert-postgres
  namespace: nitte-merch
spec:
  ports:
  - port: 5432
  selector:
    app: goalert-postgres
EOF
```

**Configure Alertmanager to send to GoAlert:**
```yaml
# In alertmanager.yml, add webhook receiver pointing to GoAlert
receivers:
  - name: goalert
    webhook_configs:
      - url: http://goalert:8081/api/v2/generic/incoming
```

---

### Phase 7: Deploy Redocly (OpenAPI + SwaggerUI)

**What:** Serve interactive API documentation from the OpenAPI spec.

```bash
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redocly
  namespace: nitte-merch
  labels:
    app: redocly
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redocly
  template:
    metadata:
      labels:
        app: redocly
    spec:
      containers:
      - name: redocly
        image: redocly/redoc:latest
        ports:
        - containerPort: 80
        env:
        - name: SPEC_URL
          value: "http://node-backend:3000/api/docs/swagger.json"
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "100m"
---
apiVersion: v1
kind: Service
metadata:
  name: redocly
  namespace: nitte-merch
spec:
  type: NodePort
  ports:
  - port: 80
    targetPort: 80
    nodePort: 30085
  selector:
    app: redocly
EOF
```

Access: `http://192.168.56.10:30085`

---

### Phase 8: Deploy Infrastructure Services

```bash
# MongoDB Sharded Cluster
kubectl apply -f k8s/mongodb.yaml

# Kafka + Zookeeper
kubectl apply -f k8s/kafka.yaml

# Keycloak
kubectl apply -f k8s/keycloak.yaml

# MinIO
kubectl apply -f k8s/minio.yaml
kubectl apply -f k8s/minio-init.yaml
```

---

### Phase 9: Deploy Application Services

```bash
# Backend APIs
kubectl apply -f k8s/node-backend.yaml
kubectl apply -f k8s/python-service.yaml

# Frontends
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/admin-dashboard.yaml
kubectl apply -f k8s/merchant-portal.yaml

# Notification service
kubectl apply -f k8s/notification-service.yaml
```

---

### Phase 10: Deploy Observability Stack

```bash
# Monitoring
kubectl apply -f k8s/prometheus.yaml
kubectl apply -f k8s/grafana.yaml
kubectl apply -f k8s/alertmanager.yaml

# Logging
kubectl apply -f k8s/loki.yaml
kubectl apply -f k8s/promtail.yaml
kubectl apply -f k8s/promtail-rbac.yaml
kubectl apply -f k8s/loki-rbac-proxy.yaml

# Tracing
kubectl apply -f k8s/jaeger.yaml
```

---

### Phase 11: Apply Istio Configuration

```bash
# Gateway, routing, mTLS, circuit breakers, rate limiting
kubectl apply -f k8s/istio/gateway.yaml
kubectl apply -f k8s/istio/virtual-services.yaml
kubectl apply -f k8s/istio/destination-rules.yaml
kubectl apply -f k8s/istio/peer-authentication.yaml
kubectl apply -f k8s/istio/authorization-policies.yaml
kubectl apply -f k8s/istio/rate-limiting.yaml
kubectl apply -f k8s/istio/service-entries.yaml
```

---

### Phase 12: Deploy DevOps Tools

```bash
# Jenkins CI/CD
kubectl apply -f k8s/jenkins.yaml

# Nexus Artifact Registry
kubectl apply -f k8s/nexus.yaml

# ArgoCD already installed in Phase 3
```

---

## Secrets Management

```bash
kubectl create secret generic nitte-secrets \
  --from-literal=MONGO_ROOT_USERNAME=admin \
  --from-literal=MONGO_ROOT_PASSWORD=password \
  --from-literal=JWT_SECRET=super-secret-key-change-in-production \
  --from-literal=RAZORPAY_KEY_ID=rzp_test_SkyURyeOfwXob0 \
  --from-literal=RAZORPAY_KEY_SECRET=5oyFiJoBoScZ3wFDq2wgm4lq \
  --from-literal=KEYCLOAK_CLIENT_SECRET=nitte-client-secret \
  --from-literal=KEYCLOAK_ADMIN=admin \
  --from-literal=KEYCLOAK_ADMIN_PASSWORD=admin \
  --from-literal=MINIO_ROOT_USER=minioadmin \
  --from-literal=MINIO_ROOT_PASSWORD=minioadmin123 \
  -n nitte-merch
```

---

## Node Distribution Strategy

| Node | Role | Services |
|------|------|----------|
| **mastervm** (Master, 6GB/100GB) | Control Plane | MongoDB Config, Keycloak, Prometheus, Grafana, Loki, Registry, ArgoCD |
| **dev-vm** (Worker 1, 8GB/150GB) | Workload | MongoDB Shard 1, Node Backend, Python Service, Frontend, Kafka, Jaeger, SonarQube |
| **prod-vm** (Worker 2, 8GB/150GB) | Workload | MongoDB Shard 2, Admin, Merchant, MinIO, Nexus, Jenkins, GoAlert, Redocly |

---

## External Access (NodePort + SSH Tunneling)

| Service | NodePort | Access URL (from host) |
|---------|----------|------------------------|
| Storefront | 30173 | `http://192.168.56.10:30173` |
| Admin Dashboard | 30174 | `http://192.168.56.10:30174` |
| Merchant Portal | 30175 | `http://192.168.56.10:30175` |
| Backend API | 30000 | `http://192.168.56.10:30000` |
| Keycloak | 30080 | `http://192.168.56.10:30080` |
| Grafana | 30001 | `http://192.168.56.10:30001` |
| Jenkins | 30081 | `http://192.168.56.10:30081` |
| ArgoCD | 30443 | `https://192.168.56.10:30443` |
| GoAlert | 30084 | `http://192.168.56.10:30084` |
| Redocly (API Docs) | 30085 | `http://192.168.56.10:30085` |
| Kiali (Istio) | 30086 | `http://192.168.56.10:30086` |
| Nexus | 30082 | `http://192.168.56.10:30082` |
| MinIO Console | 30901 | `http://192.168.56.10:30901` |

**SSH port-forwarding to access from your laptop:**
```bash
ssh -L 5173:192.168.56.10:30173 \
    -L 5174:192.168.56.10:30174 \
    -L 5175:192.168.56.10:30175 \
    -L 3000:192.168.56.10:30000 \
    -L 8080:192.168.56.10:30080 \
    -L 3001:192.168.56.10:30001 \
    -L 8081:192.168.56.10:30081 \
    -L 9443:192.168.56.10:30443 \
    -L 20001:192.168.56.10:30086 \
    -L 8084:192.168.56.10:30084 \
    -L 8085:192.168.56.10:30085 \
    arcade@117.250.206.138
```

Then open `http://localhost:5173` etc. in your browser.

---

## Summary of What's New (vs current k8s-setup.sh)

| Component | Current (minikube) | Server (RKE2) |
|-----------|-------------------|---------------|
| Cluster | minikube (single node) | RKE2 (1 master + 2 workers) |
| GitOps | Manual kubectl apply | **ArgoCD** (auto-sync from Git) |
| WAF | None | **Coraza WAF** on Istio ingress |
| Alerting | Alertmanager only | Alertmanager + **GoAlert** (on-call) |
| API Docs | SwaggerUI in backend | **Redocly** (standalone OpenAPI portal) |
| Registry | minikube internal | **Local registry** (NodePort 30500) |
| Access | Port-forwards | **NodePort + SSH tunneling** |
| Management | kubectl CLI | **Rancher UI** + ArgoCD dashboard |

---

## Order of Operations (Step-by-Step)

1. Verify RKE2 cluster is healthy (3 nodes Ready)
2. Install Istio service mesh
3. Install ArgoCD for GitOps
4. Deploy local container registry
5. Build and push all Docker images
6. Create namespace + secrets
7. Deploy infrastructure (MongoDB, Kafka, Keycloak, MinIO)
8. Deploy WAF (Coraza on Istio ingress)
9. Deploy application services
10. Deploy observability (Prometheus, Grafana, Loki, Jaeger, GoAlert)
11. Deploy DevOps tools (Jenkins, Nexus)
12. Deploy Redocly (API docs)
13. Apply Istio configs (mTLS, routing, circuit breakers)
14. Configure ArgoCD to auto-sync from Git
15. Verify all services via NodePort access
16. Set up SSH tunneling for external access

---

## Important Notes

1. **Don't power off VMs** — other people may be using the cluster
2. **Don't reboot without coordinating** — inform your group chat
3. **Don't edit Ubuntu Desktop system files** — only work inside VMs
4. **Logout when done** — 15 min idle will disconnect
5. **If VMs are not running** — run `VBoxManage startvm <vmname> --type headless` on the host
6. **Package lock errors** — another user is running apt, wait and retry
7. **ArgoCD auto-syncs** — push to Git and it deploys automatically (no manual kubectl needed after setup)
