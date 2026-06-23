# Server Deployment Runbook

End-to-end record of how the NITTE platform was brought up on the bare-metal
RKE2 cluster, including every fix and the commands used. Follow top-to-bottom to
reproduce, or jump to a section to understand a specific decision.

> Registry/auth values shown here are for the private lab network
> (`192.168.56.0/24`). Rotate them for any real environment.

---

## 1. Cluster Topology

| VM | Hostname | Role | Internal IP | Purpose |
|----|----------|------|-------------|---------|
| mastervm | `mastervm` | RKE2 server (control-plane, etcd) | 192.168.56.10 | CI/CD: Nexus, Jenkins, ArgoCD, registry |
| workervm1 | `workervm1` | RKE2 agent (`node-role=dev`) | 192.168.56.11 | Dev environment (`nitte-dev`) |
| workervm2 | `workervm2` | RKE2 agent (`node-role=prod`) | 192.168.56.12 | Prod environment (`nitte-prod`) |

SSH from master to workers: `ssh worker1@192.168.56.11`, `ssh worker2@192.168.56.12`.

Pre-existing before this work: RKE2 cluster (3 nodes Ready), ArgoCD (`argocd` ns),
Jenkins (`jenkins` ns), local-path storage provisioner.

---

## 2. Infrastructure Fixes Applied During Bring-up

These were root-cause fixes discovered while deploying. They are essential — the
cluster does not work correctly without them.

### 2.1 Worker node IPs (kubelet logs/exec/top were broken)

Both workers advertised the VirtualBox NAT IP `10.0.2.15`, so the API server
could not reach their kubelets (`kubectl logs/exec/top` failed). Fixed by pinning
each worker's node IP to the routable host-only address.

On **workervm1**:
```bash
sudo tee -a /etc/rancher/rke2/config.yaml <<'EOF'
node-ip: 192.168.56.11
EOF
sudo systemctl restart rke2-agent
```
On **workervm2**: same with `node-ip: 192.168.56.12`, then `sudo systemctl restart rke2-agent`.

Verify:
```bash
kubectl get nodes -o wide   # INTERNAL-IP must show 192.168.56.11 / .12
```

### 2.2 Cross-node pod networking (Canal/Flannel on wrong NIC)

Flannel bound to the NAT interface, so pods on different nodes could not talk
(`EHOSTUNREACH`). Pinned Flannel to the host-only interface `enp0s8`.

On **mastervm**:
```bash
sudo tee /var/lib/rancher/rke2/server/manifests/rke2-canal-config.yaml <<'EOF'
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: rke2-canal
  namespace: kube-system
spec:
  valuesContent: |-
    flannel:
      iface: "enp0s8"
EOF
sudo systemctl restart rke2-server
kubectl delete pods -n kube-system -l k8s-app=canal   # restart canal to pick up NIC
```
Verify canal pods show `192.168.56.x` IPs:
```bash
kubectl get pods -n kube-system -l k8s-app=canal -o wide
```

---

## 3. Container Registry (Nexus)

Nexus runs on master and serves as the Docker registry at
`192.168.56.10:30082` (web UI on `30081`). Deployed with a **PVC** so images
survive pod restarts.

### 3.1 Deploy Nexus
```bash
kubectl create namespace nexus
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: nexus-data, namespace: nexus }
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: local-path
  resources: { requests: { storage: 10Gi } }
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: nexus, namespace: nexus }
spec:
  replicas: 1
  selector: { matchLabels: { app: nexus } }
  template:
    metadata: { labels: { app: nexus } }
    spec:
      nodeSelector: { kubernetes.io/hostname: mastervm }
      containers:
      - name: nexus
        image: sonatype/nexus3:latest
        ports: [ { containerPort: 8081 }, { containerPort: 8082 } ]
        env:
        - name: INSTALL4J_ADD_VM_PARAMS
          value: "-Xms1g -Xmx1g -XX:MaxDirectMemorySize=1g"
        volumeMounts: [ { name: nexus-data, mountPath: /nexus-data } ]
        resources:
          requests: { memory: "1.5Gi", cpu: "500m" }
          limits:   { memory: "2Gi",   cpu: "2000m" }
      volumes:
      - name: nexus-data
        persistentVolumeClaim: { claimName: nexus-data }
---
apiVersion: v1
kind: Service
metadata: { name: nexus, namespace: nexus }
spec:
  type: NodePort
  selector: { app: nexus }
  ports:
  - { name: web,    port: 8081, targetPort: 8081, nodePort: 30081 }
  - { name: docker, port: 8082, targetPort: 8082, nodePort: 30082 }
EOF
kubectl wait --for=condition=available deployment/nexus -n nexus --timeout=300s
```

### 3.2 Configure Nexus (EULA, password, docker repo, realms)
```bash
NEXUS=http://192.168.56.10:30081
OLD=$(kubectl exec -n nexus deploy/nexus -- cat /nexus-data/admin.password)
NEW=nexus-admin-123

# Accept EULA (must echo back the exact disclaimer text with accepted:true)
curl -s -u admin:$OLD "$NEXUS/service/rest/v1/system/eula" > /tmp/eula.json
sed -i 's/"accepted" : false/"accepted" : true/' /tmp/eula.json
curl -u admin:$OLD -X POST "$NEXUS/service/rest/v1/system/eula" -H "Content-Type: application/json" -d @/tmp/eula.json

# Change admin password
curl -u admin:$OLD -X PUT "$NEXUS/service/rest/v1/security/users/admin/change-password" -H "Content-Type: text/plain" -d "$NEW"

# Create Docker hosted repo on port 8082
curl -u admin:$NEW -X POST "$NEXUS/service/rest/v1/repositories/docker/hosted" \
  -H "Content-Type: application/json" \
  -d '{"name":"nitte-docker","online":true,"storage":{"blobStoreName":"default","strictContentTypeValidation":true,"writePolicy":"ALLOW"},"docker":{"v1Enabled":false,"forceBasicAuth":true,"httpPort":8082}}'

# Enable Docker Bearer token realm
curl -u admin:$NEW -X PUT "$NEXUS/service/rest/v1/security/realms/active" \
  -H "Content-Type: application/json" -d '["NexusAuthenticatingRealm","DockerToken"]'

# Verify
curl -s http://192.168.56.10:30082/v2/_catalog -u admin:$NEW   # => {"repositories":[]}
```

### 3.3 Trust the registry on every node
On **mastervm**, **workervm1**, **workervm2**:
```bash
sudo tee /etc/rancher/rke2/registries.yaml <<'EOF'
mirrors:
  "192.168.56.10:30082":
    endpoint:
      - "http://192.168.56.10:30082"
configs:
  "192.168.56.10:30082":
    auth:
      username: admin
      password: nexus-admin-123
EOF
# master: sudo systemctl restart rke2-server   | workers: sudo systemctl restart rke2-agent
```

---

## 4. Building & Pushing Images

RKE2 uses containerd (no Docker). We use `nerdctl` (build) + `crane` (push).

### 4.1 Tooling (on mastervm)
```bash
# nerdctl (full bundle includes buildkit)
cd /tmp
wget https://github.com/containerd/nerdctl/releases/download/v2.0.4/nerdctl-full-2.0.4-linux-amd64.tar.gz
sudo tar Cxzvf /usr/local nerdctl-full-2.0.4-linux-amd64.tar.gz

# crane (reliable push to Nexus basic-auth registry)
curl -sL "https://github.com/google/go-containerregistry/releases/download/v0.20.2/go-containerregistry_Linux_x86_64.tar.gz" \
  | sudo tar -xzf - -C /usr/local/bin crane
```
> nerdctl must talk to RKE2's containerd socket: always pass
> `--address /run/k3s/containerd/containerd.sock`.

### 4.2 Build + push all 7 images
```bash
cd ~/HPE-merchendise-latest
REGISTRY="192.168.56.10:30082"
crane auth login 192.168.56.10:30082 -u admin -p nexus-admin-123 --insecure

for svc in node-backend python-service frontend admin-dashboard merchant-portal notification-service loki-rbac-proxy; do
  sudo nerdctl --address /run/k3s/containerd/containerd.sock build -t $REGISTRY/$svc:1.0.0 ./$svc
  sudo nerdctl --address /run/k3s/containerd/containerd.sock save -o /tmp/$svc.tar $REGISTRY/$svc:1.0.0
  crane push /tmp/$svc.tar $REGISTRY/$svc:1.0.0 --insecure
  sudo rm -f /tmp/$svc.tar
done

curl -s http://192.168.56.10:30082/v2/_catalog -u admin:nexus-admin-123
```

> **Why crane and not `nerdctl push`?** `nerdctl push` hung against Nexus
> (Docker token auth handshake). `crane push` from a saved image tar works
> reliably with basic auth.

### 4.3 Keycloak event-listener SPI (build artifact)
The Keycloak SPI jar is built from source (needed for security-event → email):
```bash
cd ~/HPE-merchendise-latest/keycloak-event-listener
sudo nerdctl --address /run/k3s/containerd/containerd.sock run --rm \
  -v "$PWD:/src" -w /src maven:3.9-eclipse-temurin-17-alpine sh -c "mvn clean package -q"
# produces target/keycloak-event-listener-1.0.0.jar (~8.6 KB)
```

---

## 5. Image / Build Gotcha: buildkit nginx.conf layer collision

The three frontend images (`frontend`, `admin-dashboard`, `merchant-portal`)
are near-identical and differ only by the nginx `listen` port (5173/5174/5175).
buildkit kept reusing the **same** `COPY nginx.conf` layer across all three, so
all images served port 5173 regardless of `--no-cache` / cache prune.

**Resolution (clean, k8s-native):** stop baking nginx.conf into the image.
Instead mount the correct config per deployment from a ConfigMap. This is now
codified in the Kustomize base (`patch-*-nginx.yaml`).

Bootstrap the per-app nginx ConfigMaps in each namespace:
```bash
for NS in nitte-dev nitte-prod; do
  kubectl create configmap frontend-nginx-conf --from-file=default.conf=./frontend/nginx.conf -n $NS
  kubectl create configmap admin-nginx-conf    --from-file=default.conf=./admin-dashboard/nginx.conf -n $NS
  kubectl create configmap merchant-nginx-conf --from-file=default.conf=./merchant-portal/nginx.conf -n $NS
done
```

---

## 6. Bootstrap ConfigMaps & Secrets (out-of-band, per namespace)

These are NOT managed by ArgoCD (secrets shouldn't be in Git; some need build
artifacts). Create them once per `nitte-dev` and `nitte-prod`.

```bash
NS=nitte-dev   # repeat with NS=nitte-prod
cd ~/HPE-merchendise-latest

# Secret
kubectl create secret generic nitte-secrets -n $NS \
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
  --from-literal=MONGO_APP_PASSWORD=app_writer_pass

# ConfigMaps from repo files
kubectl create configmap keycloak-realm-config --from-file=nitte-realm.json=./keycloak/nitte-realm.json -n $NS
kubectl create configmap keycloak-spi-config --from-file=keycloak-event-listener-1.0.0.jar=./keycloak-event-listener/target/keycloak-event-listener-1.0.0.jar -n $NS
kubectl create configmap promtail-keycloak-config --from-file=promtail-keycloak-config.yml=./promtail/promtail-keycloak-config.yml -n $NS
kubectl create configmap mongo-sharding-init-config --from-file=sharding-init.js=./database/sharding-init.js -n $NS
kubectl create configmap alertmanager-config --from-file=alertmanager.yml=./alertmanager/alertmanager.yml -n $NS
kubectl create configmap grafana-datasources-config --from-file=./grafana/provisioning/datasources/ -n $NS
kubectl create configmap grafana-dashboards-config --from-file=./grafana/provisioning/dashboards/ -n $NS
kubectl create configmap loki-config --from-file=loki-config.yml=./loki/loki-config.yml -n $NS
kubectl create configmap prometheus-main-config --from-file=prometheus.yml=./prometheus/prometheus.yml -n $NS
kubectl create configmap prometheus-rules-config --from-file=./prometheus/rules/ -n $NS
# the three *-nginx-conf maps (see section 5)
```

---

## 7. Cluster-scoped RBAC (shared, applied once)

Promtail needs a ClusterRole. Cluster-scoped objects can't be owned by two
overlays, so they live outside ArgoCD and bind both env service accounts.

```bash
kubectl apply -f k8s/cluster/promtail-clusterrbac.yaml
```

---

## 8. Manifest Fixes Baked Into Git (Kustomize)

Repo layout (see `k8s/GITOPS.md`):
```
k8s/
├── base/                 # full stack: Deployments/Services/Jobs/PVCs
│   ├── kustomization.yaml   # images -> Nexus; nginx.conf mounted via configmap
│   └── patch-*-nginx.yaml
├── cluster/              # shared cluster-scoped RBAC (not in overlays)
└── overlays/
    ├── dev/   # namespace=nitte-dev,  nodeSelector=workervm1 (Deploy/Job/DaemonSet)
    └── prod/  # namespace=nitte-prod, nodeSelector=workervm2
```

Fixes captured in Git:
- **Images** rewritten to `192.168.56.10:30082/<svc>:1.0.0` (kustomize `images:`).
- **imagePullPolicy** `Never` → `IfNotPresent`.
- **mongo-init** memory limit `128Mi` → `512Mi` (was OOMKilled running mongosh).
- **sharding-init.js** index creation wrapped in try/catch (idempotent on retry —
  fixed `order_id_1` "index already exists" failure).
- **nginx.conf** mounted from ConfigMap per frontend (see section 5).
- **node pinning** via overlay patches for Deployment, Job, and DaemonSet.
- **promtail RBAC** split: namespaced SA in base, cluster RBAC in `k8s/cluster/`.
- Removed orphan PVCs `jenkins-pvc`, `nexus-pvc` (master-only) and `mongodb-pvc`
  (mongos is stateless) — they stayed `Pending` and kept ArgoCD "Progressing".

Validate overlays render:
```bash
kubectl kustomize k8s/overlays/dev
kubectl kustomize k8s/overlays/prod
```

---

## 9. Sharded MongoDB Init

`mongo-init` is a one-shot Job that initiates the config + shard replica sets,
adds shards, and runs `sharding-init.js`. It retries until the mongo pods are
reachable, then completes. If re-run is needed:
```bash
kubectl delete job mongo-init -n <ns>
kubectl apply -k k8s/overlays/<dev|prod>     # or let ArgoCD re-sync
kubectl logs -n <ns> -l job-name=mongo-init -f
# success ends with: "MongoDB sharded cluster initialization complete!"
```

---

## 10. GitOps with ArgoCD

Two Applications: dev auto-syncs, prod is a manual promotion gate. `prune: false`
protects the bootstrapped ConfigMaps/Secrets.

```bash
kubectl apply -f - <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata: { name: nitte-dev, namespace: argocd }
spec:
  project: default
  source:
    repoURL: https://github.com/pall111/HPE-merchendise-latest.git
    targetRevision: main
    path: k8s/overlays/dev
  destination: { server: https://kubernetes.default.svc, namespace: nitte-dev }
  syncPolicy:
    automated: { selfHeal: true, prune: false }
    syncOptions: [ CreateNamespace=true, ApplyOutOfSyncOnly=true ]
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata: { name: nitte-prod, namespace: argocd }
spec:
  project: default
  source:
    repoURL: https://github.com/pall111/HPE-merchendise-latest.git
    targetRevision: main
    path: k8s/overlays/prod
  destination: { server: https://kubernetes.default.svc, namespace: nitte-prod }
  syncPolicy:
    syncOptions: [ CreateNamespace=true ]
EOF
```

ArgoCD admin password:
```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo
```

Common operations:
```bash
# force ArgoCD to re-read latest commit (avoids stale repo cache)
kubectl patch application nitte-dev -n argocd --type merge \
  -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}'

# trigger a sync (this is how you PROMOTE to prod)
kubectl patch application nitte-prod -n argocd --type merge \
  -p '{"operation":{"sync":{"revision":"main"}}}'

kubectl get applications -n argocd
```

---

## 11. Verification

```bash
# Apps healthy
kubectl get applications -n argocd            # both Synced + Healthy

# Pods pinned to the right node
kubectl get pods -n nitte-dev  -o wide --no-headers | awk '$3=="Running" && $7!="workervm1"{print}'
kubectl get pods -n nitte-prod -o wide --no-headers | awk '$3=="Running" && $7!="workervm2"{print}'
# (no output = correctly pinned)

# No stuck PVCs
kubectl get pvc -n nitte-dev  | grep -v Bound
kubectl get pvc -n nitte-prod | grep -v Bound

# Resource usage
kubectl top nodes
```

---

## 12. Current State (as of this runbook)

- mastervm: Nexus (persistent), ArgoCD, Jenkins — CI/CD only.
- workervm1 / `nitte-dev`: full stack, ArgoCD auto-sync, Healthy.
- workervm2 / `nitte-prod`: full stack, ArgoCD manual sync, Healthy.
- Each env: mongodb (config + 2 shards + mongos), kafka, zookeeper, minio,
  keycloak (+SPI jar), node-backend, python-service, frontend, admin-dashboard,
  merchant-portal, notification-service, prometheus, grafana, loki, promtail,
  alertmanager, jaeger, loki-rbac-proxy.

### Not yet done / next steps
- **Istio service mesh** — not installed (`istio-system` absent). `k8s/istio/`
  manifests are unapplied. Adds an Envoy sidecar per pod (memory cost on 8GB workers).
- **Jenkins CI pipeline** — build on push → push to Nexus → bump image tag in Git.
- **SonarQube** quality gate.
- **Ingress / external access** to the dev & prod UIs (currently ClusterIP only).
- Optional: centralize observability instead of per-env duplication.

---

## 13. Key Credentials (lab only — rotate for real use)

| What | Value |
|------|-------|
| Nexus admin | `admin` / `nexus-admin-123` |
| Registry (in-cluster) | `192.168.56.10:30082` |
| ArgoCD admin | `admin` / (see command in section 10) |
| Keycloak admin | `admin` / `admin` |
| Grafana admin | `admin` / `admin123` |


---

## 14. Istio Service Mesh (dev + prod)

Istio was added after the GitOps setup. The control plane is installed once
(cluster-wide); the `nitte-dev` and `nitte-prod` namespaces are enrolled in the
mesh. The admin/CI-CD namespaces (argocd, jenkins, nexus) are left out.

### 14.1 Install control plane (mastervm)
```bash
cd /tmp
curl -L https://istio.io/downloadIstio | ISTIO_VERSION=1.20.3 sh -
sudo cp istio-1.20.3/bin/istioctl /usr/local/bin/
istioctl install --set profile=default -y     # istiod + istio-ingressgateway
kubectl get pods -n istio-system
```
The ingress gateway is a LoadBalancer with `EXTERNAL-IP <pending>` on bare metal;
reach it via its NodePort for port 80 (e.g. `32367`).

### 14.2 Enrol a namespace in the mesh
```bash
kubectl label namespace nitte-dev istio-injection=enabled
# recreate completed init Jobs so they come back without a sidecar, then:
kubectl rollout restart deployment -n nitte-dev
```

### 14.3 What is / isn't in the mesh (codified in Git)
- **Out of mesh** (`sidecar.istio.io/inject: "false"`):
  - init Jobs `mongo-init`, `minio-init` — a sidecar never exits, so a Job pod
    would never Complete.
  - `promtail` DaemonSet — needs host log access.
  - Data layer `mongo-config`, `mongo-shard1/2`, `mongodb` (mongos), `kafka`,
    `zookeeper` — raw binary protocols; Envoy interception breaks MongoDB
    replica-set host discovery (`Could not find host ... for set configRS`).
- **In the mesh** (2/2 with sidecar): all app + observability services.

### 14.4 Stateful deployment restarts
Single-replica deployments backed by a ReadWriteOnce local-path PVC use
`strategy: Recreate` (terminate old before new). RollingUpdate caused the new
pod to crash on the volume lock held by the old pod
(`prometheus: lock DB directory ... resource temporarily unavailable`,
`mongod exitCode 100`). Applies to mongo-config/shard1/shard2/mongos, prometheus,
grafana, loki, minio.

### 14.5 mongo-init re-run resilience
`mongo-init` uses `set +e` and ends with `exit 0`. After an Istio-driven
restart, a shard replica set may not have elected a primary yet, so `sh.addShard`
errors transiently. The steps are idempotent; the Job now always completes and
unblocks ArgoCD health.

### 14.6 Mesh policy per environment (`k8s/overlays/<env>/mesh.yaml`)
- `PeerAuthentication` default **STRICT** mTLS; PERMISSIVE for `loki` and
  `loki-rbac-proxy` (they receive plaintext from non-meshed promtail).
- `Gateway` + `VirtualService` host-routed:
  - dev → `dev.nitte.local`, prod → `prod.nitte.local` (shared ingress gateway)
  - `/` → frontend, `/admin` → admin-dashboard, `/merchant` → merchant-portal,
    `/api` → node-backend, `/auth` + `/realms` → keycloak, `/grafana` → grafana

### 14.7 Verify
```bash
istioctl proxy-status                      # all sidecars SYNCED
GW=32367                                    # ingress gateway HTTP NodePort
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: dev.nitte.local"  http://192.168.56.10:$GW/
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: dev.nitte.local"  http://192.168.56.10:$GW/api/health
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: prod.nitte.local" http://192.168.56.10:$GW/
```

### 14.8 Access from a laptop
SSH-tunnel the gateway NodePort, then add hostnames to `/etc/hosts` pointing at
the tunnel (127.0.0.1), so the `Host` header routes dev vs prod:
```
127.0.0.1 dev.nitte.local prod.nitte.local
```
