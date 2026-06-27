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
Each SPA is served at the **root of its own hostname** (host-based routing) to
avoid SPA base-path issues — path-based routing (`/admin`, `/merchant`) gave
blank pages because the apps' HTML references assets at absolute `/assets/...`
with no path prefix, which fell through to the storefront.

SSH-tunnel the gateway NodePort, then map the hostnames to the tunnel:
```bash
# laptop terminal 1 — open the tunnel (laptop:8080 -> mastervm gateway NodePort)
ssh -L 8080:192.168.56.10:32367 arcade@117.250.206.138

# laptop terminal 2 — map all env hostnames to the tunnel
echo "127.0.0.1 dev.nitte.local admin.dev.nitte.local merchant.dev.nitte.local prod.nitte.local admin.prod.nitte.local merchant.prod.nitte.local" | sudo tee -a /etc/hosts
```

Open in the browser:
| URL | App |
|-----|-----|
| http://dev.nitte.local:8080/ | Dev storefront |
| http://admin.dev.nitte.local:8080/ | Dev admin dashboard |
| http://merchant.dev.nitte.local:8080/ | Dev merchant portal |
| http://prod.nitte.local:8080/ | Prod storefront |
| http://admin.prod.nitte.local:8080/ | Prod admin dashboard |
| http://merchant.prod.nitte.local:8080/ | Prod merchant portal |

The `Host` header is what routes you to the right environment + app; everything
goes through the one tunnel.

> **Firefox note:** if a host won't resolve but `curl -H "Host: ..." http://localhost:8080/`
> works, disable DNS-over-HTTPS (Settings → Privacy & Security → DNS over HTTPS → Off);
> DoH bypasses `/etc/hosts`.

> Each VirtualService also routes `/api` → node-backend and `/auth` + `/realms`
> → keycloak on the same host, so the SPA's API/auth calls work without a
> separate tunnel.



---

## 15. Post-Istio Troubleshooting & Data Bring-up

After enabling Istio, login/products were failing. Root causes and fixes below.

### 15.1 Empty database — sharded cluster had no shards

**Symptom:** login returned "User found: false", signup returned "Registration
failed", `nitte_merch` database didn't exist (`listDatabases` showed only
`admin`/`config`), `sh.status()` showed `shards[]` empty.

**Why:** In a **sharded** MongoDB cluster, *every* write through `mongos` lands on
a shard — even non-sharded collections (`users`, `products`) live on a primary
shard. With **zero shards registered**, mongos can't store anything, so the DB,
collections, and seeded admin user were never created.

The shards weren't registered because `sh.addShard` ran before the shard replica
sets had elected primaries, and the `set +e` change (section 5/9) silently
swallowed the failures so the Job still "succeeded".

**Deeper cause:** the shard replica sets went into **REMOVED** state after the
Istio-driven pod restart. The shards run as **Deployments** (not StatefulSets),
so a restarted pod can fail to recognise itself in the replica-set config if DNS
/ endpoints aren't ready at startup. This is a fragile design — see 15.5.

### 15.2 Recovery — wipe & re-initiate the shards (no app data existed)

```bash
# stop ArgoCD auto-sync so it doesn't fight the manual recovery
kubectl patch application nitte-dev -n argocd --type merge \
  -p '{"spec":{"syncPolicy":{"automated":null}}}'

# scale shards to 0, let the RWO PVCs release & delete, then recreate fresh
kubectl scale deployment mongo-shard1 mongo-shard2 -n nitte-dev --replicas=0
# (wait until shard pods gone and shard PVCs deleted)
kubectl patch application nitte-dev -n argocd --type merge \
  -p '{"operation":{"sync":{"revision":"main"}}}'      # recreate empty PVCs + pods

# initiate replica sets and confirm PRIMARY (myState == 1)
kubectl exec -n nitte-dev deploy/mongo-shard1 -- mongosh --quiet --port 27018 \
  --eval 'rs.initiate({_id:"shard1",members:[{_id:0,host:"mongo-shard1:27018"}]})'
kubectl exec -n nitte-dev deploy/mongo-shard2 -- mongosh --quiet --port 27019 \
  --eval 'rs.initiate({_id:"shard2",members:[{_id:0,host:"mongo-shard2:27019"}]})'

# register shards with mongos
kubectl exec -n nitte-dev deploy/mongodb -c mongos -- mongosh --quiet --port 27017 --eval '
  sh.addShard("shard1/mongo-shard1:27018"); sh.addShard("shard2/mongo-shard2:27019");'

# run the sharding init (creates nitte_merch + seeds admin)
kubectl exec -i -n nitte-dev deploy/mongodb -c mongos -- mongosh --quiet --port 27017 \
  < ~/HPE-merchendise-latest/database/sharding-init.js

# re-enable ArgoCD auto-sync
kubectl patch application nitte-dev -n argocd --type merge \
  -p '{"spec":{"syncPolicy":{"automated":{"selfHeal":true,"prune":false}}}}'
```
Verify: `sh.status()` lists `shard1`/`shard2`; `nitte_merch` exists.

### 15.3 Keycloak users → MongoDB sync

The realm's predefined users (admin/merchant/internal) are synced into Mongo by
node-backend on startup (`syncKeycloakUsers.js`). It had failed earlier (broken
DB). After the DB was fixed, restart the backend to re-run the sync:
```bash
kubectl rollout restart deployment node-backend -n nitte-dev
```
Demo credentials (from `keycloak/nitte-realm.json`):
| Account | Password |
|---------|----------|
| merchant-admin@nitte.edu | MerchantAdmin@123 |
| amazon-merchant@amazon.com | Amazon@123 |
| flipkart-merchant@flipkart.com | Flipkart@123 |
| internal-admin@nitte.ac.in | (see realm) |

### 15.4 Product seeding (catalog + MinIO images)

`seed-products` wasn't part of the overlays, so the catalog was empty. The
images (1.2 MB) exceed the ConfigMap limit, so run the seed inside a backend pod
via `kubectl cp` (the pod already has Mongo/MinIO env + SDKs):
```bash
BE=$(kubectl get pod -n nitte-dev -l app=node-backend -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n nitte-dev $BE -c node-backend -- mkdir -p /app/scripts
kubectl cp scripts/seed-products.mjs nitte-dev/$BE:/app/scripts/seed-products.mjs -c node-backend
kubectl cp product-images nitte-dev/$BE:/app/ -c node-backend
kubectl exec -n nitte-dev $BE -c node-backend -- node scripts/seed-products.mjs
```

### 15.5 Frontend "hardcoded URL" fixes (browser access via gateway)

Two SPA/back-end issues broke browser use behind the Istio host-based gateway:

1. **Product images blank** — `node-backend` `transformImageUrl` prefixed
   `config.api_base_url` (`http://node-backend:3000`, an internal name the
   browser can't resolve). Fixed to emit a **relative** `/api/v1/upload/images/...`
   path (served same-origin through the gateway). Rebuilt `node-backend:1.0.1`.

2. **Merchant login CORS/`localhost:3000`** — `merchant-portal` hard-coded its
   API base to `http://localhost:3000`. Fixed to use **same-origin** detection
   (like frontend/admin-dashboard already did). Rebuilt `merchant-portal:1.0.1`.

> `frontend` and `admin-dashboard` already used same-origin detection
> (`getAPIBase()`), which is why the storefront worked from the start.

**Image-tag workflow** (mutable `:1.0.0` + `imagePullPolicy: IfNotPresent` won't
re-pull): bump the tag in `k8s/base/kustomization.yaml` `images:` (e.g. `1.0.1`),
rebuild + push to Nexus, then ArgoCD sync pulls the new tag.
```bash
REGISTRY=192.168.56.10:30082
sudo nerdctl --address /run/k3s/containerd/containerd.sock build -t $REGISTRY/<svc>:1.0.1 ./<svc>
sudo nerdctl --address /run/k3s/containerd/containerd.sock save -o /tmp/x.tar $REGISTRY/<svc>:1.0.1
crane push /tmp/x.tar $REGISTRY/<svc>:1.0.1 --insecure
```

### 15.6 Known fragility / TODO
- **MongoDB shards on Deployments** can lose replica-set identity on pod
  restart (REMOVED state). Durable fix: convert `mongo-config`/`mongo-shard1`/
  `mongo-shard2` to **StatefulSets** with stable per-pod DNS. Until then, a shard
  restart may require the 15.2 recovery.
- Manual data bring-up (shards init, seed) is **not** in Git; only the workload
  manifests are GitOps-managed. Re-running on a fresh namespace needs these steps.

---

## 16. Observability / IAM exposure + Kiali

### 16.1 Gateway hosts for the UIs
Each UI is exposed on its own host through the Istio ingress gateway (NodePort
**32367**), defined in `k8s/overlays/<env>/mesh.yaml` (Gateway `hosts:` + a
`VirtualService` per host). Dev hosts use the `*.dev.nitte.local` suffix, prod
uses `*.prod.nitte.local`:

```
keycloak.<env>.nitte.local    -> keycloak:8080
grafana.<env>.nitte.local     -> grafana:3000
prometheus.<env>.nitte.local  -> prometheus:9090
jaeger.<env>.nitte.local      -> jaeger:16686
minio.<env>.nitte.local       -> minio:9001
```

Quick routing test from mastervm:
```bash
for h in dev admin.dev merchant.dev keycloak.dev grafana.dev prometheus.dev jaeger.dev minio.dev; do
  curl -s -o /dev/null -w "$h: %{http_code}\n" -H "Host: $h.nitte.local" http://192.168.56.10:32367/
done
```
200 (or 302 for grafana/prometheus login redirects) means routing is good.

### 16.2 Laptop access
Add to laptop `/etc/hosts` (the SSH tunnel forwards `localhost:8080` -> gateway):
```
127.0.0.1 kiali.nitte.local
127.0.0.1 keycloak.dev.nitte.local grafana.dev.nitte.local prometheus.dev.nitte.local jaeger.dev.nitte.local minio.dev.nitte.local
127.0.0.1 keycloak.prod.nitte.local grafana.prod.nitte.local prometheus.prod.nitte.local jaeger.prod.nitte.local minio.prod.nitte.local
```

### 16.3 Keycloak admin console fix
The admin console hung on "Loading the admin console" because the OIDC issuer/
auth-server-url resolved to `localhost:8080`. Fixed with a strategic-merge patch
in **both** overlays' `kustomization.yaml` (single `patches:` block — duplicate
`patches:` keys silently override each other):
```yaml
env:
  - name: KC_HOSTNAME_URL
    value: "http://keycloak.<env>.nitte.local:8080"
  - name: KC_PROXY
    value: "edge"
```

### 16.4 Kiali (Istio mesh console, the ":20001" portal)
Kiali is cluster-wide and lives in `istio-system` (outside ArgoCD's namespaces),
so it is installed out-of-band like Istio itself. Only its gateway route is in
Git (`k8s/overlays/dev/mesh.yaml`, host `kiali.nitte.local`, routed cross-ns to
`kiali.istio-system.svc.cluster.local:20001`).

```bash
# install addon (matches istio 1.20)
kubectl apply -f /tmp/istio-1.20.3/samples/addons/kiali.yaml   # or the release-1.20 raw URL
# point Kiali at THIS cluster's prometheus/grafana/jaeger (they live in nitte-dev)
kubectl apply -f k8s/kiali-config.yaml
kubectl rollout restart deployment/kiali -n istio-system
```
Reachable at `http://kiali.nitte.local:8080/kiali` via the tunnel.

**Gotcha:** `k8s/kiali-config.yaml` *replaces* the whole `kiali` ConfigMap, so it
must restate `server.web_root: /kiali`. The addon's liveness/readiness probes hit
`/kiali/healthz`; if web_root defaults to `/`, the probes 404 and the pod
restart-loops (`0/1 Running`, "HTTP probe failed with statuscode: 404").

**Note:** the `istiod /debug/syncz` 502 warnings in Kiali logs are the same
kubelet-at-:10250 proxy quirk; non-fatal. Mesh graph traffic rates require
Prometheus to scrape the Envoy sidecars.

---

## 17. Cluster recovery: rogue `rke2-server` on the agents (etcd split-brain)

### 17.1 Symptom
Both workers showed `NotReady` ("Kubelet stopped posting node status"); the
ingress gateway and all worker-hosted services returned `000`. `kubectl` on
mastervm kept working.

### 17.2 Root cause
mastervm is the **single server** (control-plane+etcd); workervm1/2 originally
joined as **rke2-agents**. At some point `rke2-server` was enabled+started on
both workers. With no `server:`/`token:` in their `config.yaml`, each
`rke2-server` **cluster-init'd its own standalone single-node cluster**, hijacking
the kubelet to point at `127.0.0.1:6443` (its rogue apiserver). Tell-tale:
`sudo kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml get nodes` on the worker
shows only itself as `control-plane,etcd`, age ~= time since the freeze.

### 17.3 Recovery (per worker)
```bash
sudo systemctl disable --now rke2-server
sudo /usr/local/bin/rke2-killall.sh
sudo rm -rf /var/lib/rancher/rke2/server
sudo rm -rf /var/lib/rancher/rke2/agent/etcd /var/lib/rancher/rke2/agent/pod-manifests
sudo rm -f /var/lib/rancher/rke2/agent/*.crt /var/lib/rancher/rke2/agent/*.key /var/lib/rancher/rke2/agent/*.kubeconfig
# write the agent join config (token from: sudo cat /var/lib/rancher/rke2/server/node-token on mastervm)
sudo tee /etc/rancher/rke2/config.yaml <<'EOF'
write-kubeconfig-mode: "0644"
node-ip: "192.168.56.11"          # .12 on workervm2
server: https://192.168.56.10:9345
token: <mastervm node-token>
EOF
sudo systemctl enable --now rke2-agent
```

### 17.4 Node-password rejection
Agent log loops on: *"Node password rejected, duplicate hostname ... node-passwd
entry"*. mastervm still holds the old node-password secret. Delete it so the
agent re-registers:
```bash
kubectl delete secret <node>.node-password.rke2 -n kube-system
```

### 17.5 Restore the registry trust (lost in the rebuild)
Recreate `/etc/rancher/rke2/registries.yaml` on each worker (section 3.3) and
`sudo systemctl restart rke2-agent`. Without it, Nexus pulls fail with
`http: server gave HTTP response to HTTPS client` (ImagePullBackOff on all
`192.168.56.10:30082/*` images; public docker.io images are unaffected).

### 17.6 Bring workloads back
Once nodes are `Ready`, the istio injector webhook needs `istiod` up or pod
creation fails cluster-wide with `no endpoints available for service "istiod"`
(failurePolicy: Fail blocks even inject=false pods). With istiod healthy:
```bash
kubectl rollout restart deploy -n nitte-dev
kubectl rollout restart deploy -n nitte-prod
```
Delete any `OutOfmemory` surge duplicates left by the restart.

### 17.7 Prevent recurrence
Ensure `rke2-server` stays disabled on the workers:
```bash
systemctl is-enabled rke2-server rke2-agent   # expect: disabled / enabled
```

---

## 18. etcd quorum loss from workers running `rke2-server` (major outage)

### 18.1 What happened
The worker VMs were rebooting/reverting into a state with **`rke2-server` enabled**
and a **bare `config.yaml`** (no `server:`/`token:`). Two distinct failure modes
resulted:
- With a join config present, `rke2-server` on a worker **joined mastervm as an
  extra etcd/control-plane member**. The cluster had effectively become 3 etcd
  members (mastervm + both workers — note the stale `control-plane,etcd` role
  labels on the worker node objects).
- When the workers were later rebuilt as agents, their etcd members vanished and
  presented **untrusted certs**, so mastervm's etcd was left as **1 of 3 members
  → no quorum**. Symptoms: `kubectl` hangs/times out, `rke2-server` on mastervm
  crash-loops with `failed to reconcile with local datastore: context deadline
  exceeded`, and the etcd container logs:
  `prober detected unhealthy status ... x509: certificate signed by unknown
  authority` + `failed to publish local member to cluster through raft`.

### 18.2 Recovery — reset etcd to a single member (data preserved)
```bash
sudo systemctl stop rke2-server
sudo /usr/local/bin/rke2-killall.sh        # clears stale etcd/apiserver containers
sudo rke2 server --cluster-reset           # rewrites membership to THIS node only
# wait for: "Managed etcd cluster membership has been reset, restart without
#            --cluster-reset flag now" — it then exits on its own
sudo systemctl start rke2-server
kubectl get nodes                          # mastervm Ready; data intact
```
`--cluster-reset` keeps all etcd data (whole cluster state) — it only drops the
dead peers so the survivor regains quorum.

### 18.3 Make the workers stay agents (stop the recurrence)
On **each worker** — the key addition is **masking** `rke2-server` so it can never
take over again:
```bash
sudo systemctl disable --now rke2-server
sudo systemctl mask rke2-server
sudo rm -rf /var/lib/rancher/rke2/server
sudo tee /etc/rancher/rke2/config.yaml <<'EOF'
write-kubeconfig-mode: "0644"
node-ip: "192.168.56.11"          # .12 on workervm2
server: https://192.168.56.10:9345
token: <mastervm node-token>
EOF
sudo systemctl enable --now rke2-agent
# on mastervm, if "Node password rejected": kubectl delete secret <node>.node-password.rke2 -n kube-system
```
> The stale `control-plane,etcd` labels on the worker node objects are cosmetic;
> strip with `kubectl label node <n> node-role.kubernetes.io/etcd-` etc. if desired.
> **Root cause (resolved):** the arcade **host was restarted**, rebooting all VMs; the
> workers came up with `rke2-server` enabled (from initial provisioning) and cluster-
> init'd rogue clusters. `systemctl mask rke2-server` on both workers makes this
> impossible to recur — `rke2-server` cannot start on boot, so only `rke2-agent` runs
> and rejoins mastervm. (No cloud-init/scripts re-enable it; cloud-init is disabled.)

---

## 19. MongoDB recovery after a full restart (config server + shards)

Every pod restart re-breaks the sharded cluster because `mongo-config`/`mongo-shard*`
are **Deployments** whose replica-set member host is the **Service name** (a
ClusterIP) — mongod can't match that to its own pod IP at startup, so it ends up
"not a member" with no primary. Recovery (preserves data; fix the **config server
first** — shards block on it and crash-loop via their liveness probe until it's up):

```bash
# 1) config server (replSet configRS, configsvr, port 27017) -> PRIMARY on its pod IP
kubectl exec -n nitte-dev deploy/mongo-config -- sh -c \
  'IP=$(hostname -i); mongosh --quiet --port 27017 --eval "rs.reconfig({_id:\"configRS\",configsvr:true,members:[{_id:0,host:\"$IP:27017\"}]},{force:true})"'
# (use rs.initiate(... configsvr:true ...) instead if it says "no replset config")

# 2) shards -> PRIMARY on their pod IPs (they start listening once configRS is up)
kubectl exec -n nitte-dev deploy/mongo-shard1 -- sh -c \
  'IP=$(hostname -i); mongosh --quiet --port 27018 --eval "rs.reconfig({_id:\"shard1\",members:[{_id:0,host:\"$IP:27018\"}]},{force:true})"'
kubectl exec -n nitte-dev deploy/mongo-shard2 -- sh -c \
  'IP=$(hostname -i); mongosh --quiet --port 27019 --eval "rs.reconfig({_id:\"shard2\",members:[{_id:0,host:\"$IP:27019\"}]},{force:true})"'

# 3) re-register shards with mongos (config metadata is empty after the break, so
#    addShard re-imports the existing databases). shard1 holds nitte_merch
#    (products/users); shard2's empty nitte_merch must be dropped to avoid conflict.
S1=$(kubectl exec -n nitte-dev deploy/mongo-shard1 -- hostname -i)
S2=$(kubectl exec -n nitte-dev deploy/mongo-shard2 -- hostname -i)
kubectl exec -n nitte-dev deploy/mongodb -c mongos -- mongosh --quiet --port 27017 \
  --eval "sh.addShard(\"shard1/$S1:27018\")"
kubectl exec -n nitte-dev deploy/mongo-shard2 -- mongosh --quiet --port 27019 \
  --eval 'db.getSiblingDB("nitte_merch").dropDatabase()'
kubectl exec -n nitte-dev deploy/mongodb -c mongos -- mongosh --quiet --port 27017 \
  --eval "sh.addShard(\"shard2/$S2:27019\")"

# 4) verify + reconnect the app
kubectl exec -n nitte-dev deploy/mongodb -c mongos -- mongosh --quiet --port 27017 \
  --eval 'print("products="+db.getSiblingDB("nitte_merch").products.countDocuments())'
kubectl rollout restart deployment node-backend -n nitte-dev
```

Sharding by location on `orders` is lost when the config metadata resets (the
collection comes back unsharded on the primary shard); re-run
`sh.shardCollection("nitte_merch.orders", { <locationKey>: 1 })` to restore it.

### 19.1 Durable fix (IMPLEMENTED) — StatefulSets with FQDN members
`mongo-config`/`mongo-shard1`/`mongo-shard2` are now **StatefulSets** behind headless
Services (`publishNotReadyAddresses: true`). Key points that make restarts self-heal:

- **Replica-set members use the pod FQDN** (`<pod>-0.<svc>.<ns>.svc.cluster.local`),
  which Kubernetes writes into the pod's own `/etc/hosts`. So mongod's one-shot
  `isSelf` check resolves itself from a **local file — no DNS, no race**. (Using the
  short Service name failed: at startup the headless record may not be published yet,
  mongod gets `HostNotFound`, marks itself `REMOVED`, and a single-member set never
  retries.) The init Job builds the FQDN at runtime from the pod namespace
  (`/var/run/secrets/kubernetes.io/serviceaccount/namespace`).
- **WiredTiger cache capped** `--wiredTigerCacheSizeGB 0.25` + limit `512Mi`. Without
  the cap, mongod sizes its cache off the host's RAM (ignores the container limit) and
  gets **OOMKilled**; an OOMKill of the config server corrupts/empties its metadata.
- A `wait-for-self-dns` init container (defence-in-depth) blocks mongod until its name
  resolves.
- The StatefulSets are pinned to the env node via a `kind: StatefulSet` nodeSelector
  patch in each overlay (the Deployment/Job/DaemonSet patches didn't cover them).
- The `mongo-init` Job carries `argocd.argoproj.io/sync-options: Replace=true` — Job
  pod templates are immutable, so ArgoCD must delete+recreate it on changes rather than
  patch (otherwise the whole sync fails with "field is immutable").

**Conversion gotchas (one-time):** changing Deployment→StatefulSet needs the old
Deployments deleted manually (overlays use `prune: false`); local-path PVCs are pinned
to the node they were first provisioned on, so after adding the nodeSelector you must
delete mismatched `*-data-*-0` PVCs so they re-provision on the right node; and the
mongos (`mongodb`) Deployment must be restarted after a config-server rebuild so it
reconnects to the fresh `configRS`.

Verified: deleting a shard pod, it returns and rejoins its replica set as PRIMARY
automatically (FQDN via /etc/hosts), data intact on its StatefulSet PVC.

---

## 20. CI/CD pipeline — Jenkins + Kaniko + ArgoCD

Jenkins is the **Helm chart** install (`jenkins-0` StatefulSet in the `jenkins`
namespace) — not the stale `k8s/jenkins.yaml` Deployment in the repo. The Kubernetes
plugin is installed and the `jenkins` SA has `jenkins-schedule-agents` RBAC, so builds
run in ephemeral agent pods. The cluster is **containerd (no Docker daemon)**, so images
are built with **Kaniko**, not `docker build`.

Flow (`Jenkinsfile` at repo root):
```
git push main → Jenkins nitte-ci → Kaniko build each service → push to Nexus
   → yq bumps newTag in k8s/base/kustomization.yaml → git push main → ArgoCD deploys nitte-dev
```

### 20.1 One-time setup
- Expose Jenkins via the gateway: host `jenkins.nitte.local` → `jenkins.jenkins.svc:8080`
  (VirtualService in `k8s/overlays/dev/mesh.yaml`); add `127.0.0.1 jenkins.nitte.local`
  to the laptop `/etc/hosts`. Admin creds:
  `kubectl get secret jenkins -n jenkins -o jsonpath='{.data.jenkins-admin-password}' | base64 -d`.
- **Kaniko → Nexus auth secret** (namespace `jenkins`):
  ```bash
  AUTH=$(printf 'admin:nexus-admin-123' | base64 | tr -d '\n')
  kubectl create secret generic kaniko-docker-config -n jenkins \
    --from-literal=config.json="{\"auths\":{\"192.168.56.10:30082\":{\"auth\":\"$AUTH\"}}}"
  ```
- **GitHub push token**: Jenkins → Manage Credentials → Username with password,
  id `github-token`, username = GitHub user, password = a classic PAT with `repo` scope.
- **Job**: New Item `nitte-ci` → Pipeline → "Pipeline script from SCM" → Git repo →
  branch `*/main` → Script Path `Jenkinsfile`.

### 20.2 Running
`Build with Parameters` → `SERVICES` = `all` (all 7) or a space-separated subset
(e.g. `node-backend`). Images are tagged `1.1.<BUILD_NUMBER>` (unique tag per build, so
`imagePullPolicy: IfNotPresent` always pulls the new one). Kaniko pushes with
`--insecure --skip-tls-verify --insecure-pull` (Nexus is plain HTTP).

### 20.3 Gotchas hit during bring-up
- **Agent unschedulable**: don't pin the CI pod to `workervm1` (it's memory-saturated
  with the dev stack). The podTemplate has no nodeSelector so it lands on any node with
  room (typically workervm2).
- **`fatal: detected dubious ownership`**: the agent containers run as a different UID
  than owns the workspace — every git-using `sh` step runs `git config --global --add
  safe.directory "*"` first.
- The CI commit lands on `main`, so **`git pull --rebase` on the laptop** before the next
  manual edit/push to avoid divergence.

---

## 21. Extra components + email enablement + Kafka crash-loop fix

### 21.1 Email / notification-service (SMTP via Gmail)
notification-service consumes Kafka events (`order-events`, `product-events`,
`user-activity`, `user-approved`, `user-rejected`) and sends mail/Slack. Config split:
- ConfigMap `notification-service-config` (non-secret): `SMTP_HOST=smtp.gmail.com`,
  `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_FROM`, `EMAIL_ENABLED=true`, `SLACK_ENABLED=true`.
- Secret `notification-service-secrets` (per namespace, **out-of-band**): `SMTP_USER`,
  `SMTP_PASS`, `SLACK_WEBHOOK_URL`, `KEYCLOAK_ADMIN_EMAILS`, `ADMIN_NOTIFICATION_EMAILS`.

It was never sending because `SMTP_USER`/`SMTP_PASS` were **empty** (bootstrapped from a
blank `.env`). Fix — patch the secret in dev **and** prod, then restart:
```bash
kubectl patch secret notification-service-secrets -n nitte-dev --type merge \
  -p '{"stringData":{"SMTP_USER":"<gmail>","SMTP_PASS":"<gmail-app-password>","SLACK_WEBHOOK_URL":"<webhook>"}}'
# repeat for -n nitte-prod
kubectl rollout restart deployment notification-service -n nitte-dev -n nitte-prod
```
`SMTP_PASS` must be a Gmail **App Password** (2FA required), not the account password.
Keep these out of Git (like `passwords.txt`); rotate if they ever leak.

### 21.2 Kafka crash-loop: stale Zookeeper broker znode
**Symptom:** Kafka `CrashLoopBackOff` (exit 1, ~16 restarts), notification-service consumer
spammed `ECONNRESET` / "no leader for this topic-partition" and never consumed.
**Root cause (kafka --previous logs):**
```
Exiting Kafka due to fatal exception during startup.
KeeperException$NodeExistsException ... KafkaZkClient.registerBroker
```
After an unclean restart, the previous broker's **ephemeral znode `/brokers/ids/1`** was
still in Zookeeper (session not yet expired), so the new broker couldn't register → exit →
restart → race forever. (cp-zookeeper here has **no PVC**, so don't restart ZK — it'd drop
topic metadata.) **Fix — delete the stale znode, bounce Kafka:**
```bash
kubectl exec -n nitte-dev deploy/zookeeper -- zookeeper-shell localhost:2181 delete /brokers/ids/1
kubectl delete pod -n nitte-dev -l app=kafka
```
Kafka then registers cleanly (`[KafkaServer id=1] started`) and the consumer joins with its
topic assignments. **Durable fix (TODO):** Kafka as a StatefulSet + larger
`zookeeper.session.timeout.ms` so a restart can't lose the znode race (same data-layer
fragility class as the mongo/etcd issues).

### 21.3 Extra components deployed
- **Redocly** (`k8s/base/redocly.yaml`): API docs portal; gateway host `redoc.dev.nitte.local`
  with `/api` proxied to node-backend so the spec loads same-origin. (Dev-only access; a pod
  also runs in prod but isn't routed there — keep prod lean.)
- **GoAlert** (`k8s/goalert.yaml`, out-of-band, namespace `goalert`, pinned workervm2):
  central on-call/alerting + small Postgres; gateway host `goalert.nitte.local`
  (admin/admin123). Alertmanager→GoAlert webhook wiring is a follow-up.
- **WAF / SonarQube**: planned (WAF = Coraza WASM on the ingress gateway, no extra pods;
  SonarQube = CI-plane, heavy, workervm2). **Rancher intentionally skipped** — management UI
  doesn't belong on a prod-app node; kubectl/ArgoCD/Kiali already cover operations.
