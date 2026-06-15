# Kubernetes Deployment Guide — NITTE Alumni Merchandise Shop

## Server Architecture

```
Your System (Windows/Mac/Linux)
        │
        │  ssh arcade@117.250.206.138
        ▼
┌─────────────────────────────────────────────┐
│          Ubuntu Desktop (Host)              │
│          arcade-HP                          │
│                                             │
│   ┌───────────── VirtualBox ──────────────┐ │
│   │                                       │ │
│   │  ┌───────────┐ ┌──────────┐ ┌──────────┐ │
│   │  │ Master VM │ │Worker1 VM│ │Worker2 VM│ │
│   │  │192.168.56 │ │192.168.56│ │192.168.56│ │
│   │  │   .10     │ │   .11    │ │   .12    │ │
│   │  │  100GB    │ │  150GB   │ │  150GB   │ │
│   │  └───────────┘ └──────────┘ └──────────┘ │
│   │                                       │ │
│   │         RKE2 Kubernetes Cluster       │ │
│   │    Single Master + 2 Worker Nodes     │ │
│   └───────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## Prerequisites

- SSH access to `arcade@117.250.206.138` (password will be provided)
- VMs should be running (verify with `VBoxManage list running vms` on the host)
- RKE2 cluster already provisioned on the 3 VMs

## SSH Access Quick Reference

```bash
# Step 1: SSH into Ubuntu Desktop
ssh arcade@117.250.206.138

# Step 2: SSH into VMs (from inside Ubuntu Desktop)
ssh master@192.168.56.10    # Master node
ssh worker1@192.168.56.11   # Worker 1
ssh worker2@192.168.56.12   # Worker 2

# Logout: type 'logout' or Ctrl+D at each level
```

---

## Deployment Plan

### Phase 1: Cluster Verification & Setup

#### 1.1 Verify RKE2 Cluster is Healthy

```bash
# SSH into master node
ssh arcade@117.250.206.138
ssh master@192.168.56.10

# Check cluster nodes
sudo kubectl get nodes

# Expected output:
# NAME         STATUS   ROLES                       AGE   VERSION
# mastervm     Ready    control-plane,etcd,master   ...   v1.28.x+rke2r1
# workervm1    Ready    <none>                      ...   v1.28.x+rke2r1
# workervm2    Ready    <none>                      ...   v1.28.x+rke2r1

# Check system pods
sudo kubectl get pods -n kube-system
```

#### 1.2 Set Up kubectl Access

```bash
# On master node, make kubectl accessible without sudo
mkdir -p ~/.kube
sudo cp /etc/rancher/rke2/rke2.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
export KUBECONFIG=~/.kube/config

# Add to .bashrc for persistence
echo 'export KUBECONFIG=~/.kube/config' >> ~/.bashrc
```

#### 1.3 Create Namespace

```bash
kubectl create namespace nitte-merch
kubectl config set-context --current --namespace=nitte-merch
```

---

### Phase 2: Container Registry Setup

Since there's no external registry, we'll build images locally and use a lightweight registry inside the cluster.

#### 2.1 Deploy Local Docker Registry

```bash
# On master node
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

#### 2.2 Configure Nodes to Trust Local Registry

On each node (master, worker1, worker2):

```bash
# Add insecure registry to RKE2 containerd config
sudo mkdir -p /etc/rancher/rke2
sudo tee /etc/rancher/rke2/registries.yaml <<EOF
mirrors:
  "192.168.56.10:30500":
    endpoint:
      - "http://192.168.56.10:30500"
EOF

# Restart RKE2 (do one node at a time!)
# On master:
sudo systemctl restart rke2-server
# On workers:
sudo systemctl restart rke2-agent
```

#### 2.3 Clone Repo & Build Images

```bash
# On master node
cd ~
git clone https://github.com/radheshpai87/learning-devops.git
cd learning-devops

# Build and push each service image
REGISTRY="192.168.56.10:30500"

# Node Backend
docker build -t $REGISTRY/node-backend:1.0.0 ./node-backend
docker push $REGISTRY/node-backend:1.0.0

# Python Service
docker build -t $REGISTRY/python-service:1.0.0 ./python-service
docker push $REGISTRY/python-service:1.0.0

# Frontend
docker build -t $REGISTRY/frontend:1.0.0 ./frontend
docker push $REGISTRY/frontend:1.0.0

# Admin Dashboard
docker build -t $REGISTRY/admin-dashboard:1.0.0 ./admin-dashboard
docker push $REGISTRY/admin-dashboard:1.0.0

# Merchant Portal
docker build -t $REGISTRY/merchant-portal:1.0.0 ./merchant-portal
docker push $REGISTRY/merchant-portal:1.0.0

# Notification Service
docker build -t $REGISTRY/notification-service:1.0.0 ./notification-service
docker push $REGISTRY/notification-service:1.0.0

# Loki RBAC Proxy
docker build -t $REGISTRY/loki-rbac-proxy:1.0.0 ./loki-rbac-proxy
docker push $REGISTRY/loki-rbac-proxy:1.0.0
```

---

### Phase 3: Deploy Infrastructure Services

#### 3.1 MongoDB (Sharded Cluster)

```bash
# Create persistent volumes, config server, shards, mongos
kubectl apply -f k8s/mongodb/
```

Manifest structure needed:
- `mongodb-configserver-statefulset.yaml` — Config replica set
- `mongodb-shard1-statefulset.yaml` — Shard 1 (South/West)
- `mongodb-shard2-statefulset.yaml` — Shard 2 (North/East)
- `mongodb-mongos-deployment.yaml` — Router
- `mongodb-init-job.yaml` — Sharding initialization

#### 3.2 Kafka + Zookeeper

```bash
kubectl apply -f k8s/kafka/
```

- `zookeeper-statefulset.yaml`
- `kafka-statefulset.yaml`

#### 3.3 Keycloak (Identity Provider)

```bash
kubectl apply -f k8s/keycloak/
```

- `keycloak-deployment.yaml` — With realm import
- `keycloak-service.yaml` — ClusterIP + NodePort for external access

#### 3.4 MinIO (Object Storage)

```bash
kubectl apply -f k8s/minio/
```

- `minio-statefulset.yaml`
- `minio-init-job.yaml` — Bucket creation

---

### Phase 4: Deploy Application Services

#### 4.1 Node Backend API

```yaml
# k8s/node-backend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: node-backend
  namespace: nitte-merch
spec:
  replicas: 2
  selector:
    matchLabels:
      app: node-backend
  template:
    metadata:
      labels:
        app: node-backend
    spec:
      containers:
      - name: node-backend
        image: 192.168.56.10:30500/node-backend:1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: MONGODB_URL
          value: "mongodb://mongodb-mongos:27017/nitte_merch"
        - name: PYTHON_SERVICE_URL
          value: "http://python-service:8000"
        - name: KEYCLOAK_SERVER_URL
          value: "http://keycloak:8080"
        - name: KAFKA_BROKERS
          value: "kafka:9092"
        - name: S3_ENDPOINT
          value: "http://minio:9000"
        - name: S3_ACCESS_KEY
          valueFrom:
            secretKeyRef:
              name: minio-secret
              key: access-key
        - name: S3_SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: minio-secret
              key: secret-key
        resources:
          requests:
            memory: "256Mi"
            cpu: "200m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        readinessProbe:
          httpGet:
            path: /api/v1/health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /api/v1/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: node-backend
  namespace: nitte-merch
spec:
  ports:
  - port: 3000
    targetPort: 3000
  selector:
    app: node-backend
```

#### 4.2 Python Service

```yaml
# k8s/python-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: python-service
  namespace: nitte-merch
spec:
  replicas: 2
  selector:
    matchLabels:
      app: python-service
  template:
    metadata:
      labels:
        app: python-service
    spec:
      containers:
      - name: python-service
        image: 192.168.56.10:30500/python-service:1.0.0
        ports:
        - containerPort: 8000
        env:
        - name: MONGODB_URL
          value: "mongodb://mongodb-mongos:27017/nitte_merch"
        - name: JAEGER_AGENT_HOST
          value: "jaeger"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "300m"
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: python-service
  namespace: nitte-merch
spec:
  ports:
  - port: 8000
    targetPort: 8000
  selector:
    app: python-service
```

#### 4.3 Frontend Services (Storefront, Admin, Merchant Portal)

Each frontend is a simple nginx deployment:

```yaml
# Example: k8s/frontend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: nitte-merch
spec:
  replicas: 1
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: 192.168.56.10:30500/frontend:1.0.0
        ports:
        - containerPort: 5173
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
  name: frontend
  namespace: nitte-merch
spec:
  type: NodePort
  ports:
  - port: 5173
    targetPort: 5173
    nodePort: 30173
  selector:
    app: frontend
```

Repeat similarly for:
- `admin-dashboard` → NodePort 30174
- `merchant-portal` → NodePort 30175

---

### Phase 5: Deploy Observability Stack

#### 5.1 Prometheus + Grafana

```bash
kubectl apply -f k8s/monitoring/
```

- `prometheus-deployment.yaml` + ConfigMap for `prometheus.yml`
- `grafana-deployment.yaml` + provisioning ConfigMaps
- `alertmanager-deployment.yaml`

#### 5.2 Loki + Promtail

```bash
kubectl apply -f k8s/logging/
```

- `loki-statefulset.yaml`
- `promtail-daemonset.yaml` — Runs on every node to scrape container logs
- `loki-rbac-proxy-deployment.yaml`

#### 5.3 Jaeger (Tracing)

```bash
kubectl apply -f k8s/tracing/
```

- `jaeger-deployment.yaml` (all-in-one)

---

### Phase 6: Ingress / External Access

Since this is a VirtualBox setup with no cloud load balancer, use NodePort services to expose apps:

| Service | NodePort | Access URL |
|---------|----------|------------|
| Storefront | 30173 | `http://192.168.56.10:30173` |
| Admin Dashboard | 30174 | `http://192.168.56.10:30174` |
| Merchant Portal | 30175 | `http://192.168.56.10:30175` |
| Backend API | 30000 | `http://192.168.56.10:30000` |
| Keycloak | 30080 | `http://192.168.56.10:30080` |
| Grafana | 30001 | `http://192.168.56.10:30001` |
| Jenkins | 30081 | `http://192.168.56.10:30081` |

To access from your local machine, set up SSH port forwarding:

```bash
# From your Windows/Mac terminal — forward all ports through the arcade host
ssh -L 5173:192.168.56.10:30173 \
    -L 5174:192.168.56.10:30174 \
    -L 5175:192.168.56.10:30175 \
    -L 3000:192.168.56.10:30000 \
    -L 8080:192.168.56.10:30080 \
    -L 3001:192.168.56.10:30001 \
    arcade@117.250.206.138
```

Then open `http://localhost:5173` in your browser.

---

### Phase 7: Secrets Management

```bash
# Create secrets for sensitive values
kubectl create secret generic minio-secret \
  --from-literal=access-key=minioadmin \
  --from-literal=secret-key=minioadmin123 \
  -n nitte-merch

kubectl create secret generic keycloak-secret \
  --from-literal=admin-user=admin \
  --from-literal=admin-password=admin \
  -n nitte-merch

kubectl create secret generic jwt-secret \
  --from-literal=secret=super-secret-key-change-in-production \
  -n nitte-merch
```

---

### Phase 8: Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n nitte-merch

# Check services
kubectl get svc -n nitte-merch

# Check pod distribution across nodes
kubectl get pods -n nitte-merch -o wide

# Test backend health
curl http://192.168.56.10:30000/api/v1/health
```

---

## Node Distribution Strategy

| Node | Services |
|------|----------|
| **Master** (192.168.56.10, 100GB) | MongoDB Config, Keycloak, Prometheus, Grafana, Loki, Registry |
| **Worker 1** (192.168.56.11, 150GB) | MongoDB Shard 1, Node Backend, Python Service, Frontend, Kafka |
| **Worker 2** (192.168.56.12, 150GB) | MongoDB Shard 2, Node Backend (replica), Admin, Merchant, MinIO |

Use node affinity or taints/tolerations to control placement:

```yaml
# Example: pin MongoDB Shard 1 to Worker 1
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
      - matchExpressions:
        - key: kubernetes.io/hostname
          operator: In
          values:
          - workervm1
```

---

## Quick Deploy Script

```bash
#!/bin/bash
# deploy-all.sh — Run from master node after cloning the repo

set -e

echo "=== Creating namespace ==="
kubectl create namespace nitte-merch --dry-run=client -o yaml | kubectl apply -f -

echo "=== Creating secrets ==="
kubectl apply -f k8s/secrets/

echo "=== Deploying infrastructure ==="
kubectl apply -f k8s/mongodb/
kubectl apply -f k8s/kafka/
kubectl apply -f k8s/keycloak/
kubectl apply -f k8s/minio/

echo "=== Waiting for infrastructure (60s) ==="
sleep 60

echo "=== Deploying application services ==="
kubectl apply -f k8s/node-backend/
kubectl apply -f k8s/python-service/
kubectl apply -f k8s/frontend/
kubectl apply -f k8s/admin-dashboard/
kubectl apply -f k8s/merchant-portal/
kubectl apply -f k8s/notification-service/

echo "=== Deploying observability ==="
kubectl apply -f k8s/monitoring/
kubectl apply -f k8s/logging/
kubectl apply -f k8s/tracing/

echo "=== Deployment complete ==="
kubectl get pods -n nitte-merch
```

---

## Important Notes

1. **Don't power off VMs** — other people may be using the cluster
2. **Don't reboot without informing others** — coordinate on your group chat
3. **Don't edit Ubuntu Desktop system files** — only work inside VMs
4. **Logout when done** — 15 min idle will disconnect you anyway
5. **If `VBoxManage list running vms` returns empty** — contact the server admin
6. **Package lock errors on `apt`** — another user is running apt, wait and retry
