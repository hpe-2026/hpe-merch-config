# Barebones Server Setup — From Zero to Full Platform

This guide assumes **three fresh Ubuntu Server VMs** with nothing installed. It takes you from bare OS → full RKE2 platform with Istio, ArgoCD, CI/CD, observability, and all application services.

> **Legend**
> 🟦 `[ALL NODES]` — run on mastervm, dev-vm, AND prod-vm
> 🟩 `[MASTER]` — run only on mastervm
> 🟨 `[WORKERS]` — run on dev-vm AND prod-vm
> 🟧 `[HOST]` — run on the Ubuntu Desktop host (arcade-HP)

---

## Node Plan

| VM | Hostname | Role | IP (example) | RAM | Disk |
|----|----------|------|--------------|-----|------|
| mastervm | `mastervm` | RKE2 server (control plane) | 192.168.56.10 | 6 GB | 100 GB |
| dev-vm | `dev-vm` | RKE2 agent (worker) | 192.168.56.11 | 8 GB | 150 GB |
| prod-vm | `prod-vm` | RKE2 agent (worker) | 192.168.56.12 | 8 GB | 150 GB |

> Replace IPs with your actual VM IPs. Find them with `ip a` on each VM.

---

## STEP 0 🟧 [HOST] — Ensure VMs Are Running

```bash
ssh arcade@117.250.206.138

# List VMs
VBoxManage list vms
VBoxManage list runningvms

# Start any that aren't running (headless)
VBoxManage startvm mastervm --type headless
VBoxManage startvm dev-vm --type headless
VBoxManage startvm prod-vm --type headless
```

---

## STEP 1 🟦 [ALL NODES] — Base OS Preparation

SSH into each VM and run these on **all three**:

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install essential tools
sudo apt-get install -y curl wget git vim net-tools apt-transport-https ca-certificates gnupg lsb-release

# Set a unique hostname per node (run the matching one)
sudo hostnamectl set-hostname mastervm   # on mastervm
sudo hostnamectl set-hostname dev-vm      # on dev-vm
sudo hostnamectl set-hostname prod-vm     # on prod-vm

# Add all nodes to /etc/hosts (edit IPs to match yours)
sudo tee -a /etc/hosts <<EOF
192.168.56.10 mastervm
192.168.56.11 dev-vm
192.168.56.12 prod-vm
EOF

# Disable swap (Kubernetes requirement)
sudo swapoff -a
sudo sed -i '/ swap / s/^/#/' /etc/fstab

# Load required kernel modules
sudo tee /etc/modules-load.d/k8s.conf <<EOF
overlay
br_netfilter
EOF
sudo modprobe overlay
sudo modprobe br_netfilter

# Set sysctl params for Kubernetes networking
sudo tee /etc/sysctl.d/k8s.conf <<EOF
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
vm.max_map_count                    = 524288
EOF
sudo sysctl --system

# Open firewall (or disable ufw for lab simplicity)
sudo ufw disable
```

---

## STEP 2 🟩 [MASTER] — Install RKE2 Server

```bash
# Install RKE2 server
curl -sfL https://get.rke2.io | sudo INSTALL_RKE2_TYPE="server" sh -

# Configure RKE2 server
sudo mkdir -p /etc/rancher/rke2
sudo tee /etc/rancher/rke2/config.yaml <<EOF
write-kubeconfig-mode: "0644"
tls-san:
  - mastervm
  - 192.168.56.10
node-label:
  - "node-role=master"
EOF

# Enable and start
sudo systemctl enable rke2-server.service
sudo systemctl start rke2-server.service

# Wait ~2 minutes for it to come up, then verify
sudo systemctl status rke2-server
```

### Configure kubectl on master

```bash
# RKE2 installs kubectl at /var/lib/rancher/rke2/bin
export PATH=$PATH:/var/lib/rancher/rke2/bin
echo 'export PATH=$PATH:/var/lib/rancher/rke2/bin' >> ~/.bashrc

# Set up kubeconfig
mkdir -p ~/.kube
sudo cp /etc/rancher/rke2/rke2.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
export KUBECONFIG=~/.kube/config
echo 'export KUBECONFIG=~/.kube/config' >> ~/.bashrc

# Verify the master node is Ready
kubectl get nodes
```

### Get the node token (needed to join workers)

```bash
sudo cat /var/lib/rancher/rke2/server/node-token
# Copy this token — you'll need it on the worker nodes
```

---

## STEP 3 🟨 [WORKERS] — Install RKE2 Agent (dev-vm & prod-vm)

Run on **both** dev-vm and prod-vm:

```bash
# Install RKE2 agent
curl -sfL https://get.rke2.io | sudo INSTALL_RKE2_TYPE="agent" sh -

# Configure agent to join the master
sudo mkdir -p /etc/rancher/rke2
sudo tee /etc/rancher/rke2/config.yaml <<EOF
server: https://192.168.56.10:9345
token: <PASTE-NODE-TOKEN-FROM-MASTER>
node-label:
  - "node-role=worker"
EOF

# Enable and start
sudo systemctl enable rke2-agent.service
sudo systemctl start rke2-agent.service

# Check status
sudo systemctl status rke2-agent
```

### Verify all nodes joined 🟩 [MASTER]

```bash
kubectl get nodes
# Expected (after ~2 min):
# NAME       STATUS   ROLES                       AGE   VERSION
# mastervm   Ready    control-plane,etcd,master   ...   v1.2x.x+rke2
# dev-vm     Ready    <none>                      ...   v1.2x.x+rke2
# prod-vm    Ready    <none>                      ...   v1.2x.x+rke2
```

---

## STEP 4 🟩 [MASTER] — Install Helm & Tools

```bash
# Helm
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Git (if not present) and clone the repo
cd ~
git clone https://github.com/radheshpai87/learning-devops.git
cd learning-devops
```

---

## STEP 5 🟩 [MASTER] — Install Rancher (Cluster Management UI)

```bash
# Install cert-manager (Rancher dependency)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
kubectl wait --for=condition=available deployment --all -n cert-manager --timeout=300s

# Add Rancher Helm repo
helm repo add rancher-stable https://releases.rancher.com/server-charts/stable
helm repo update

# Install Rancher
kubectl create namespace cattle-system
helm install rancher rancher-stable/rancher \
  --namespace cattle-system \
  --set hostname=rancher.192.168.56.10.nip.io \
  --set bootstrapPassword=admin \
  --set replicas=1

# Access Rancher at https://rancher.192.168.56.10.nip.io
```

---

## STEP 6 🟩 [MASTER] — Install Istio Service Mesh

```bash
# Download istioctl
curl -L https://istio.io/downloadIstio | ISTIO_VERSION=1.20.0 sh -
cd istio-1.20.0
export PATH=$PWD/bin:$PATH
echo "export PATH=$PWD/bin:\$PATH" >> ~/.bashrc

# Install Istio (demo profile)
istioctl install --set profile=demo -y

# Create namespace and enable sidecar injection
kubectl create namespace nitte-merch
kubectl label namespace nitte-merch istio-injection=enabled

# Install Kiali + addons
kubectl apply -f samples/addons/kiali.yaml
kubectl apply -f samples/addons/jaeger.yaml

# Verify
kubectl get pods -n istio-system
cd ~/learning-devops
```

---

## STEP 7 🟩 [MASTER] — Install ArgoCD (GitOps)

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl wait --for=condition=available deployment --all -n argocd --timeout=300s

# Expose via NodePort
kubectl patch svc argocd-server -n argocd \
  -p '{"spec":{"type":"NodePort","ports":[{"port":443,"targetPort":8080,"nodePort":30443}]}}'

# Get admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d; echo
```

---

## STEP 8 🟩 [MASTER] — Local Container Registry

```bash
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
        - name: data
          mountPath: /var/lib/registry
      volumes:
      - name: data
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

### 🟦 [ALL NODES] — Trust the local registry

```bash
sudo mkdir -p /etc/rancher/rke2
sudo tee /etc/rancher/rke2/registries.yaml <<EOF
mirrors:
  "192.168.56.10:30500":
    endpoint:
      - "http://192.168.56.10:30500"
EOF

# Restart RKE2 — master: rke2-server, workers: rke2-agent
# On master:
sudo systemctl restart rke2-server
# On dev-vm and prod-vm:
sudo systemctl restart rke2-agent
```

---

## STEP 9 🟩 [MASTER] — Build & Push Images

RKE2 uses containerd, not Docker. Install `nerdctl` (or Docker) to build:

```bash
# Install nerdctl (containerd CLI with build support)
wget https://github.com/containerd/nerdctl/releases/download/v1.7.0/nerdctl-full-1.7.0-linux-amd64.tar.gz
sudo tar Cxzvf /usr/local nerdctl-full-1.7.0-linux-amd64.tar.gz

REGISTRY="192.168.56.10:30500"
cd ~/learning-devops

for svc in node-backend python-service frontend admin-dashboard merchant-portal notification-service loki-rbac-proxy; do
  sudo nerdctl build -t $REGISTRY/$svc:1.0.0 ./$svc
  sudo nerdctl push --insecure-registry $REGISTRY/$svc:1.0.0
done
```

> **Alternative:** Build on the Ubuntu Desktop host (if Docker is installed there) and push to `192.168.56.10:30500`.

---

## STEP 10 🟩 [MASTER] — Create Secrets

```bash
kubectl create secret generic nitte-secrets -n nitte-merch \
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
  --from-literal=GF_SECURITY_ADMIN_PASSWORD=admin123 \
  --from-literal=NEXUS_INITIAL_PASSWORD=nexus-admin-123 \
  --from-literal=PROMTAIL_API_KEY=promtail-loki-secret \
  --from-literal=MONGO_APP_USERNAME=app_writer \
  --from-literal=MONGO_APP_PASSWORD=app_writer_pass \
  --from-literal=MONGO_UI_PASSWORD=admin123
```

---

## STEP 11 🟩 [MASTER] — Deploy via ArgoCD (GitOps)

Point ArgoCD at the repo so it deploys and self-heals automatically:

```bash
# Install ArgoCD CLI
curl -sSL -o /tmp/argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
sudo install /tmp/argocd /usr/local/bin/argocd

# Login
argocd login 192.168.56.10:30443 --insecure --username admin --password <password-from-step-7>

# Register repo + create app
argocd repo add https://github.com/radheshpai87/learning-devops.git
argocd app create nitte-merch \
  --repo https://github.com/radheshpai87/learning-devops.git \
  --revision main \
  --path k8s \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace nitte-merch \
  --sync-policy automated --auto-prune --self-heal \
  --sync-option CreateNamespace=true

# Watch it deploy
argocd app get nitte-merch
```

> **Note:** Update the image references in `k8s/*.yaml` to point at `192.168.56.10:30500/<svc>:1.0.0` before syncing, since the manifests currently use local image names (`node-backend:1.0.0` with `imagePullPolicy: Never` for minikube).

### Manual alternative (without ArgoCD)

```bash
cd ~/learning-devops
kubectl apply -f k8s/mongodb.yaml
kubectl apply -f k8s/kafka.yaml
kubectl apply -f k8s/keycloak.yaml
kubectl apply -f k8s/minio.yaml -f k8s/minio-init.yaml
kubectl apply -f k8s/node-backend.yaml -f k8s/python-service.yaml
kubectl apply -f k8s/frontend.yaml -f k8s/admin-dashboard.yaml -f k8s/merchant-portal.yaml
kubectl apply -f k8s/notification-service.yaml
kubectl apply -f k8s/prometheus.yaml -f k8s/grafana.yaml -f k8s/alertmanager.yaml
kubectl apply -f k8s/loki.yaml -f k8s/promtail-rbac.yaml -f k8s/promtail.yaml -f k8s/loki-rbac-proxy.yaml
kubectl apply -f k8s/jaeger.yaml
kubectl apply -f k8s/jenkins.yaml -f k8s/nexus.yaml
kubectl apply -f k8s/istio/
```

---

## STEP 12 🟩 [MASTER] — Deploy Extra Tools (SonarQube, GoAlert, Redocly, WAF)

See [KUBERNETES_DEPLOYMENT.md](./KUBERNETES_DEPLOYMENT.md) Phases 5-7 for the full manifests. Quick reference:

```bash
# SonarQube (see CICD_PIPELINE.md)
kubectl apply -f k8s/sonarqube.yaml   # if you create it from the doc

# GoAlert + Postgres, Redocly, WAF — manifests in KUBERNETES_DEPLOYMENT.md Phases 5-7
```

---

## STEP 13 🟩 [MASTER] — Verify Everything

```bash
# All pods
kubectl get pods -n nitte-merch

# Pod distribution across nodes
kubectl get pods -n nitte-merch -o wide

# Services + NodePorts
kubectl get svc -n nitte-merch

# Istio mesh status
istioctl proxy-status

# ArgoCD app health
argocd app get nitte-merch
```

---

## STEP 14 🟧 [HOST / LAPTOP] — Access the Platform

From your laptop, SSH-tunnel through the host to reach NodePort services:

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
    arcade@117.250.206.138
```

Then open `http://localhost:5173` etc.

---

## Per-Node Summary (Quick Reference)

### mastervm (control plane)
1. Base OS prep (Step 1)
2. Install RKE2 **server** (Step 2)
3. Configure kubectl, get node token
4. Trust local registry + restart `rke2-server`
5. Install: Helm, Rancher, Istio, ArgoCD, registry
6. Build/push images, create secrets, deploy

### dev-vm (worker 1)
1. Base OS prep (Step 1)
2. Install RKE2 **agent**, join master (Step 3)
3. Trust local registry + restart `rke2-agent`
4. (Workloads scheduled here automatically by scheduler)

### prod-vm (worker 2)
1. Base OS prep (Step 1)
2. Install RKE2 **agent**, join master (Step 3)
3. Trust local registry + restart `rke2-agent`
4. (Workloads scheduled here automatically by scheduler)

> Workers only need RKE2 agent + registry trust. All deployment commands run from the master (or via ArgoCD). Kubernetes schedules pods onto workers automatically.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Worker won't join | Check token is correct, port 9345 reachable: `nc -zv 192.168.56.10 9345` |
| `kubectl` not found | `export PATH=$PATH:/var/lib/rancher/rke2/bin` |
| Pods `ImagePullBackOff` | Registry not trusted on that node — check `registries.yaml` + restart rke2 |
| Pods `Pending` | Not enough RAM — `kubectl describe pod` shows `Insufficient memory` |
| Istio sidecar missing | Namespace not labeled: `kubectl label ns nitte-merch istio-injection=enabled` |
| RKE2 won't start | Check `journalctl -u rke2-server -f` (or `rke2-agent`) |

---

## See Also

- [ARCHITECTURE.md](./ARCHITECTURE.md) — full platform architecture
- [KUBERNETES_DEPLOYMENT.md](./KUBERNETES_DEPLOYMENT.md) — detailed manifests for extra tools
- [CICD_PIPELINE.md](./CICD_PIPELINE.md) — Jenkins + SonarQube + Nexus
- [GITOPS_ARGOCD.md](./GITOPS_ARGOCD.md) — ArgoCD GitOps workflow
