# GitOps Folder Structure — Three-Cluster Architecture

> **Purpose:** Explain how to restructure this single Git repo to fully manage three
> independent RKE2 clusters (Admin, Dev, Prod) with one ArgoCD instance on Admin
> acting as the hub.
>
> **Status:** Proposal — read through, then confirm to implement.

---

## 1. The Architecture (Physical)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          VirtualBox Host-Only Network                        │
│                              192.168.56.0/24                                 │
└─────────────────────────────────────────────────────────────────────────────┘
         │                          │                          │
   ┌─────┴─────┐            ┌──────┴──────┐           ┌──────┴──────┐
   │   ADMIN   │            │     DEV     │           │    PROD     │
   │ .56.10    │            │   .56.11    │           │   .56.12    │
   │           │            │             │           │             │
   │ ArgoCD    │───deploys──▶ App stack   │           │ App stack   │
   │ Jenkins   │            │ Istio+WAF   │           │ Istio+WAF   │
   │ Nexus     │            │ Kafka       │           │ Kafka       │
   │ Grafana   │◀──metrics──│ Prometheus  │           │ Prometheus  │
   │ Loki      │◀──logs─────│ Promtail    │           │ Promtail    │
   │ GoAlert   │            │ Jaeger      │           │ Jaeger      │
   │ MinIO     │            │ Keycloak    │           │ Keycloak    │
   │ MetalLB   │            │ MongoDB     │           │ MongoDB     │
   │ Thanos    │            │ MetalLB     │           │ MetalLB     │
   └───────────┘            └─────────────┘           └─────────────┘
```

Each VM is its **own standalone RKE2 cluster** (single-node: control-plane + etcd + workloads).
ArgoCD on Admin reaches into Dev and Prod via their API servers (`https://192.168.56.11:6443`,
`https://192.168.56.12:6443`) and applies manifests remotely.

---

## 2. The GitOps Model — One Repo, Three Cluster Folders

One Git repo (`hpe-merch-config`) remains the single source of truth. Each cluster gets its own
top-level folder with its own `kustomization.yaml`. ArgoCD has one Application per cluster folder.

```
hpe-merch-config/                          ← this repo (GitHub)
│
├── admin-cluster/                         ← ArgoCD Application: admin-cluster-apps
│   ├── kustomization.yaml                    destination: https://kubernetes.default.svc (in-cluster)
│   ├── namespaces.yaml
│   ├── pvcs.yaml
│   ├── secrets.yaml                       ← applied out-of-band, never synced
│   ├── gitops-system/
│   │   ├── argocd.yaml                    ← AppProjects + Applications for ALL clusters
│   │   ├── argocd-rbac-patch.yaml
│   │   └── argocd-repo-secret.yaml
│   ├── identity-core/
│   │   ├── keycloak.yaml
│   │   └── ...
│   ├── observability/
│   │   ├── prometheus.yaml
│   │   ├── thanos.yaml
│   │   ├── loki.yaml
│   │   ├── grafana.yaml
│   │   └── ...
│   ├── storage-system/
│   │   └── minio.yaml, minio-init.yaml
│   ├── network-system/
│   │   └── metallb-config.yaml            ← pool: 192.168.56.240-250
│   └── system/
│       ├── jenkins.yaml
│       ├── nexus.yaml
│       └── oauth2-proxies.yaml
│
├── dev-cluster/                           ← ArgoCD Application: dev-cluster-apps
│   ├── kustomization.yaml                    destination: https://192.168.56.11:6443
│   ├── namespaces.yaml
│   ├── pvcs.yaml
│   ├── apps/
│   │   ├── mongodb.yaml
│   │   ├── kafka.yaml
│   │   ├── keycloak.yaml
│   │   ├── node-backend.yaml
│   │   ├── python-service.yaml
│   │   ├── frontend.yaml
│   │   ├── admin-dashboard.yaml
│   │   ├── merchant-portal.yaml
│   │   ├── notification-service.yaml
│   │   └── unleash.yaml                   ← feature flags (Unleash server + Postgres)
│   ├── network-system/
│   │   ├── metallb-config.yaml            ← pool: 192.168.56.110-120
│   │   └── istio/
│   │       ├── gateway.yaml
│   │       ├── virtual-services.yaml
│   │       ├── authorization-policies.yaml
│   │       ├── destination-rules.yaml
│   │       ├── peer-authentication.yaml
│   │       └── rate-limiting.yaml
│   ├── security/
│   │   └── waf-coraza.yaml
│   ├── observability/
│   │   ├── prometheus-agent.yaml          ← scrapes locally, remote-writes to admin Thanos
│   │   ├── promtail.yaml                  ← ships logs to admin Loki
│   │   └── jaeger.yaml
│   └── configs/
│       ├── nginx-patches/                 ← nginx.conf for frontend containers
│       └── keycloak-env.yaml              ← KC_HOSTNAME_URL for dev
│
├── prod-cluster/                          ← ArgoCD Application: prod-cluster-apps
│   ├── kustomization.yaml                    destination: https://192.168.56.12:6443
│   ├── namespaces.yaml
│   ├── pvcs.yaml
│   ├── apps/
│   │   ├── (same as dev, plus:)
│   │   ├── unleash.yaml                   ← feature flags (same as dev)
│   │   └── redocly.yaml
│   ├── network-system/
│   │   ├── metallb-config.yaml            ← pool: 192.168.56.120-130
│   │   └── istio/
│   │       └── (same structure as dev)
│   ├── security/
│   │   └── waf-coraza.yaml
│   ├── observability/
│   │   ├── prometheus-agent.yaml
│   │   ├── promtail.yaml
│   │   └── jaeger.yaml
│   └── configs/
│       ├── nginx-patches/
│       └── keycloak-env.yaml              ← KC_HOSTNAME_URL for prod
│
├── docs/                                  ← documentation (not deployed)
├── scripts/                               ← helper scripts
└── configs/                               ← raw config files (Docker-era, reference only)
```

---

## 3. How ArgoCD Ties It Together

ArgoCD runs on Admin. It has three Applications defined in
`admin-cluster/gitops-system/argocd.yaml`:

| Application | Source Path | Destination | Sync |
|---|---|---|---|
| `admin-cluster-apps` | `admin-cluster/` | `https://kubernetes.default.svc` (in-cluster) | auto prune + selfHeal |
| `dev-cluster-apps` | `dev-cluster/` | `https://192.168.56.11:6443` | auto prune + selfHeal |
| `prod-cluster-apps` | `prod-cluster/` | `https://192.168.56.12:6443` | auto selfHeal, **manual prune** (safety) |

The flow:

```
Developer edits dev-cluster/apps/node-backend.yaml
    │
    ▼
git push → main branch on GitHub
    │
    ▼
ArgoCD (admin) polls repo every 3 min
    │  detects change in dev-cluster/
    ▼
ArgoCD renders dev-cluster/kustomization.yaml via Kustomize
    │
    ▼
ArgoCD applies rendered manifests to https://192.168.56.11:6443
    │
    ▼
Dev cluster picks up the change — pods roll
```

---

## 4. Why Three Folders Instead of Base + Overlays?

**The current `downstream-clusters/base + overlays/` pattern** works when:
- Dev and Prod run nearly identical stacks
- Differences are small: image tags, replica counts, node selectors

**The problem with that for this project:**
- Dev has `nitte-dev` namespace; Prod has `nitte-prod` — different namespaces
- Dev pins to `workervm1`; Prod to `workervm2` — but after the three-cluster migration,
  each is its own single-node cluster and nodeSelectors become irrelevant
- Each cluster has its own MetalLB pool, its own Istio gateway with different hosts,
  its own Keycloak environment URLs
- Prod has Redocly; Dev doesn't
- Per-cluster monitoring agents push to Admin Loki/Thanos at different IPs
- The overlay patches become as big as the base itself, defeating the purpose

**Three independent folders** mean:
- Each cluster is self-contained and readable on its own
- A broken change to prod never accidentally touches dev
- No mental overhead of "what does the base provide vs the overlay?"
- ArgoCD treats each folder as a complete unit — simpler Application definitions
- Adding a new service to only one cluster = add the file, no overlay surgery

**The cost:**
- Some manifest duplication (e.g., `mongodb.yaml` appears in both `dev-cluster/` and `prod-cluster/`)
- A version bump needs two edits instead of one

**This is an acceptable tradeoff** for a 3-cluster architecture where clusters are meaningfully
different. The Kubernetes community calls this the "repo-per-cluster" or "folder-per-cluster"
pattern. FluxCD, ArgoCD, and Anthos Config Management all document it as the recommended approach
for heterogeneous multi-cluster setups.

---

## 5. What Happens to the Old Folders

| Current Folder | After Restructure |
|---|---|
| `admin-cluster/` | **Kept as-is** — already correct, ArgoCD is syncing it |
| `downstream-clusters/base/` | Content moves into `dev-cluster/apps/` and `prod-cluster/apps/` |
| `downstream-clusters/overlays/dev/` | Patches absorbed into `dev-cluster/` manifests directly |
| `downstream-clusters/overlays/prod/` | Patches absorbed into `prod-cluster/` manifests directly |
| `downstream-clusters/overlays/istio/` | Moves to `dev-cluster/network-system/istio/` and `prod-cluster/network-system/istio/` |
| `downstream-clusters/monitoring-agents/` | Moves to `dev-cluster/observability/` and `prod-cluster/observability/` |
| `downstream-clusters/apps/` | Reference only — older Docker-era manifests, can be archived or deleted |
| `unleash/` | Manifest moves into `dev-cluster/apps/unleash.yaml` and `prod-cluster/apps/unleash.yaml` (namespace rewritten by Kustomize) |
| Root-level folders (`alertmanager/`, `grafana/`, `jenkins/`, etc.) | Docker-era configs — keep in `configs/` for reference or delete |

---

## 6. MetalLB Per Cluster

Each cluster needs its own MetalLB operator install (out-of-band, same as admin) and its own
config CRs in Git:

| Cluster | MetalLB Pool | Config Path |
|---|---|---|
| Admin (.10) | `192.168.56.240-250` | `admin-cluster/network-system/metallb-config.yaml` |
| Dev (.11) | `192.168.56.110-120` | `dev-cluster/network-system/metallb-config.yaml` |
| Prod (.12) | `192.168.56.120-130` | `prod-cluster/network-system/metallb-config.yaml` |

All three use L2 mode. The speaker on each node responds to ARP only for its own pool's IPs.

---

## 7. ArgoCD Application Definitions (After Restructure)

These replace the current `downstream-dev` and `downstream-prod` Applications:

```yaml
# admin-cluster/gitops-system/argocd.yaml (updated section)

---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: dev-cluster-apps
  namespace: gitops-system
spec:
  project: downstream
  source:
    repoURL: https://github.com/hpe-2026/hpe-merch-config.git
    targetRevision: main
    path: dev-cluster
  destination:
    server: https://192.168.56.11:6443
    namespace: nitte-dev
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true

---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: prod-cluster-apps
  namespace: gitops-system
spec:
  project: downstream
  source:
    repoURL: https://github.com/hpe-2026/hpe-merch-config.git
    targetRevision: main
    path: prod-cluster
  destination:
    server: https://192.168.56.12:6443
    namespace: nitte-prod
  syncPolicy:
    automated:
      prune: false       # production safety — manual prune
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

No more separate `monitoring-agents-dev` / `monitoring-agents-prod` Applications — monitoring
manifests live inside each cluster folder and get deployed as part of the same sync.

---

## 8. Per-Cluster Kustomization Examples

### `dev-cluster/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: nitte-dev

resources:
  # Foundation
  - namespaces.yaml
  - pvcs.yaml

  # Networking
  - network-system/metallb-config.yaml
  - network-system/istio/gateway.yaml
  - network-system/istio/virtual-services.yaml
  - network-system/istio/authorization-policies.yaml
  - network-system/istio/destination-rules.yaml
  - network-system/istio/peer-authentication.yaml
  - network-system/istio/rate-limiting.yaml

  # Security
  - security/waf-coraza.yaml

  # Data Layer
  - apps/mongodb.yaml
  - apps/kafka.yaml

  # Identity
  - apps/keycloak.yaml

  # Application Services
  - apps/node-backend.yaml
  - apps/python-service.yaml
  - apps/frontend.yaml
  - apps/admin-dashboard.yaml
  - apps/merchant-portal.yaml
  - apps/notification-service.yaml
  - apps/unleash.yaml

  # Observability (agents — ship to admin)
  - observability/prometheus-agent.yaml
  - observability/promtail.yaml
  - observability/jaeger.yaml

images:
  - name: node-backend
    newName: 192.168.56.10:30082/node-backend
    newTag: "1.1.4"
  - name: python-service
    newName: 192.168.56.10:30082/python-service
  - name: frontend
    newName: 192.168.56.10:30082/frontend
    newTag: "1.0.1"
  - name: admin-dashboard
    newName: 192.168.56.10:30082/admin-dashboard
    newTag: "1.0.2"
  - name: merchant-portal
    newName: 192.168.56.10:30082/merchant-portal
    newTag: "1.0.1"
  - name: notification-service
    newName: 192.168.56.10:30082/notification-service
```

### `prod-cluster/kustomization.yaml`

Same structure, with:
- `namespace: nitte-prod`
- Different image tags (production versions)
- Adds `apps/redocly.yaml`
- `network-system/metallb-config.yaml` uses the `.120-.130` pool
- Keycloak env points to `keycloak.prod.nitte.local`

---

## 9. Implementation Steps (What I'll Do If You Say Yes)

| # | Action | Destructive? |
|---|---|---|
| 1 | Create `dev-cluster/` folder structure, move manifests from `downstream-clusters/` | No |
| 2 | Create `prod-cluster/` folder structure, same | No |
| 3 | Write each cluster's `kustomization.yaml`, `namespaces.yaml`, `pvcs.yaml` | No |
| 4 | Add MetalLB config per cluster (pools at `.110-.120` and `.120-.130`) | No |
| 5 | Inline the overlay patches (nodeSelector removed — not needed on single-node clusters) | No |
| 6 | Update `admin-cluster/gitops-system/argocd.yaml` — new Application defs | **Yes** (changes ArgoCD sync targets) |
| 7 | Move root-level Docker-era folders into `configs/` for reference | No |
| 8 | Delete `downstream-clusters/` | **Yes** (ArgoCD will try to prune old resources) |
| 9 | Validate all three `kustomization.yaml` files with `kubectl kustomize` | No |

**Important:** Steps 6 and 8 mean ArgoCD will stop deploying from `downstream-clusters/` and
start deploying from `dev-cluster/` and `prod-cluster/`. This is safe only AFTER the dev and prod
RKE2 clusters actually exist and are registered in ArgoCD. If they don't exist yet, I'll write
the folder structure now but leave the ArgoCD Application definitions commented out until you
bootstrap those clusters.

---

## 10. Prerequisites (Before This Works End-to-End)

- [ ] Dev cluster bootstrapped: RKE2 server on `192.168.56.11`, MetalLB + Istio installed
- [ ] Prod cluster bootstrapped: RKE2 server on `192.168.56.12`, MetalLB + Istio installed
- [ ] Both clusters registered in ArgoCD:
      `argocd cluster add <dev-context> --name dev`
      `argocd cluster add <prod-context> --name prod`
- [ ] Nexus registry trusted on both clusters (`/etc/rancher/rke2/registries.yaml`)
- [ ] Network connectivity: Admin `.10` can reach Dev `.11:6443` and Prod `.12:6443`

---

## Summary

This restructure gives you:
- **One folder per cluster** — self-contained, independently readable and deployable
- **One ArgoCD Application per cluster** — simple mapping, no confusion about what syncs where
- **No shared base to break** — a change to prod can never accidentally affect dev
- **MetalLB per cluster** — each cluster advertises its own IP pool
- **Clean separation of concerns** — admin handles tooling/observability, dev/prod handle apps
- **Git as the single source of truth** — push to `main`, ArgoCD applies within 3 minutes
