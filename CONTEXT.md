# HPE Merchandise Config — Live Context

> **Last updated:** 2026-07-15
> **Working cluster:** `admin` (single-node RKE2 on `mastervm`)
> **Cluster IP:** `192.168.56.10` (admin hub in the hub-and-spoke plan)

---

## 🎯 Objective

Multi-cluster RKE2 hub-and-spoke architecture:
- **Admin cluster** (`192.168.56.10`) — GitOps engine, CI/CD, observability, identity
- **Dev cluster** (`192.168.56.11`) — application workloads, watched by ArgoCD from `dev` branch
- **Prod cluster** (`192.168.56.12`) — application workloads, watched by ArgoCD from `prod` branch

---

## 🔄 GitOps & CI/CD Architecture

### Branch-Based Deployment Model

```
                  ┌──────────────┐
                  │  GitHub Repo │
                  │  (hpe-merch- │
                  │   config)    │
                  └──┬───┬───┬──┘
                     │   │   │
              main ──┘   │   └── prod
              (admin)    │       (prod cluster)
                      dev ──
                      (dev cluster)
```

| Branch | ArgoCD Application | Target Cluster | Purpose |
|--------|-------------------|----------------|---------|
| `main` | `admin-cluster-apps` | `192.168.56.10` (admin) | Admin infrastructure (Jenkins, Nexus, Keycloak, observability) |
| `dev` | `downstream-dev` | `192.168.56.11` (dev) | App workloads — auto-synced on push |
| `prod` | `downstream-prod` | `192.168.56.12` (prod) | App workloads — only updated via merge from `dev` (promotion gate) |

### CI/CD Flow (Jenkins → ArgoCD)

```
Developer pushes code → PR to dev branch
  → Jenkins pipeline triggers (on admin cluster)
    → SonarQube analysis
    → Build container images
    → Push images to Nexus registry
    → Update image tags in downstream-clusters/base/kustomization.yaml
    → Commit tag bump to dev branch
  → ArgoCD detects change on dev branch → deploys to dev cluster

Promotion to production:
  → Merge dev → prod branch (manual PR review)
  → ArgoCD detects change on prod branch → deploys to prod cluster
  → Uses existing images already in Nexus (no rebuild)
```

### Jenkins Build Architecture

Jenkins runs as a **stock controller** (`jenkins/jenkins:lts-jdk17`) with the Kubernetes plugin.
Builds run in **ephemeral pod agents** — no tools are baked into the Jenkins image:

| Build Stage | Pod Agent Image | Purpose |
|------------|----------------|---------|
| Node.js | `node:20-alpine` | Frontend builds, npm test |
| Python | `python:3.11-slim` | Backend builds, pip install |
| Docker | `docker:24-dind` | Container image builds |
| kubectl | `bitnami/kubectl` | Manifest updates |

> **Status:** Pod agent templates need to be configured in `jenkins-casc-config.yaml`.

---

## 📁 Repo Structure

```
admin-cluster/
├── kustomization.yaml       # Kustomize entrypoint (ArgoCD reads this)
├── namespaces.yaml          # All namespaces
├── secrets.yaml             # Cluster-wide secrets (applied out-of-band)
├── pvcs.yaml                # PVCs for minio, jenkins, nexus, loki, prometheus, grafana
├── configs/                 # ConfigMaps (jenkins-casc, etc.)
├── storage-system/
│   ├── minio.yaml           # MinIO object store (minio/minio:RELEASE.2025-09-07T16-13-09Z)
│   ├── minio-init.yaml      # Bucket init job (minio/mc:RELEASE.2025-08-13T08-35-41Z)
│   └── minio-ingress.yaml
├── identity-core/
│   ├── postgres-keycloak.yaml
│   ├── keycloak.yaml
│   ├── keycloak-setup.yaml
│   └── keycloak-ingress.yaml
├── observability/
│   ├── prometheus.yaml
│   ├── thanos.yaml          # Receiver, store, compactor, query
│   ├── loki.yaml
│   ├── loki-rbac-proxy.yaml # Custom Node.js JWT→tenant proxy (loki-rbac-proxy:1.0.0)
│   ├── grafana.yaml
│   ├── alertmanager.yaml
│   ├── jaeger.yaml
│   ├── goalert.yaml         # goalert/goalert:v0.30.0
│   └── observability-ingress.yaml
├── gitops-system/
│   ├── argocd.yaml          # AppProjects + Applications (admin, dev, prod)
│   ├── argocd-repo-secret.yaml
│   ├── argocd-rbac-patch.yaml
│   └── GITOPS.md
├── network-system/
│   └── metallb-config.yaml  # L2 IPAddressPool 192.168.56.240-250
└── system/
    ├── jenkins.yaml          # jenkins/jenkins:lts-jdk17 (stock image)
    ├── jenkins-casc-config.yaml
    ├── nexus.yaml            # sonatype/nexus3:3.72.0 (stock image)
    ├── oauth2-proxies.yaml
    └── jenkins-nexus-ingress.yaml

downstream-clusters/          # Managed by ArgoCD from admin cluster
├── base/                     # Shared manifests (Kustomize base)
│   ├── kustomization.yaml    # Image tag overrides (Jenkins updates these)
│   ├── grafana.yaml
│   ├── minio.yaml            # minio/minio:RELEASE.2025-09-07T16-13-09Z
│   ├── minio-init.yaml       # minio/mc:RELEASE.2025-08-13T08-35-41Z
│   ├── redocly.yaml          # redocly/redoc:v2.1.5
│   ├── unleash.yaml          # unleashorg/unleash-server:v6.6
│   └── ...                   # MongoDB, Kafka, Node backend, Python, frontends
├── monitoring-agents/        # Promtail + Prometheus agents per cluster
└── overlays/
    ├── dev/                  # Dev-specific overrides
    └── prod/                 # Prod-specific overrides
```

---

## 🗺️ Bootstrap Order (one-time only — then Git takes over)

| # | Command | What it does | Status |
|---|---------|-------------|--------|
| 1 | `kubectl apply -f admin-cluster/namespaces.yaml` | Creates all namespaces | ✅ DONE |
| 2 | `kubectl apply -f admin-cluster/secrets.yaml` | Cluster-wide secrets (out-of-band, never GitOps) | ✅ DONE |
| 3 | Fill in `argocd-repo-secret.yaml` with your GitHub PAT/SSH key | Repo credentials | ⚠️ SKIPPED (Public Repo) |
| 4 | `kubectl apply -f admin-cluster/gitops-system/argocd-repo-secret.yaml` | Register repo in ArgoCD (out-of-band) | ⚠️ SKIPPED (Public Repo) |
| 5 | `kubectl apply -n gitops-system -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.10.0/manifests/install.yaml` | Install ArgoCD | ✅ DONE |
| 6 | Wait for ArgoCD pods: `kubectl get pods -n gitops-system` | All Running | ✅ DONE |
| 7 | `kubectl apply -f admin-cluster/gitops-system/argocd.yaml` | Apply AppProjects + Applications (ArgoCD takes over) | ✅ DONE |
| 7.5 | `kubectl apply -f admin-cluster/gitops-system/argocd-rbac-patch.yaml` | RBAC patch for ClusterRoleBinding namespaces | ✅ DONE |
| 7.6 | `kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.36/deploy/local-path-storage.yaml` | Install Local Path Storage Class | ✅ DONE |
| 8 | **ArgoCD auto-syncs `admin-cluster/` — all services deploy automatically** | ✨ GitOps active | 🔄 IN PROGRESS |

> **After step 7, you never manually `kubectl apply` admin-cluster manifests again.**
> Edit files → `git push` → ArgoCD applies within 3 minutes.

> **ArgoCD initial admin password:**
> ```bash
> kubectl get secret argocd-initial-admin-secret -n gitops-system \
>   -o jsonpath="{.data.password}" | base64 -d
> ```

---

## 🐳 Container Image Audit (completed 2026-07-05)

All images have been audited, pinned to specific versions, and custom images replaced:

| Image | Version | Notes |
|-------|---------|-------|
| `jenkins/jenkins` | `lts-jdk17` | ✅ Replaced custom `nitte-jenkins:1.0.0` |
| `sonatype/nexus3` | `3.72.0` | ✅ Replaced custom `nitte-nexus:1.0.0` |
| `minio/minio` | `RELEASE.2025-09-07T16-13-09Z` | ✅ Pinned (last official Docker Hub release) |
| `minio/mc` | `RELEASE.2025-08-13T08-35-41Z` | ✅ Pinned |
| `goalert/goalert` | `v0.30.0` | ✅ Pinned |
| `redocly/redoc` | `v2.1.5` | ✅ Pinned |
| `unleashorg/unleash-server` | `v6.6` | ✅ Pinned |
| `loki-rbac-proxy` | `1.0.0` | ⚠️ Custom — genuinely custom code, no stock replacement |

> **MinIO caveat:** MinIO discontinued publishing community Docker images in Oct 2025.
> The pinned release is the last available tag. For future upgrades, consider Chainguard images
> (`cgr.dev/chainguard/minio`) or building from source.

> **`imagePullPolicy: Never`** has been removed from all images except `loki-rbac-proxy:1.0.0`
> (custom image loaded via containerd). This will be migrated to Nexus registry pulls once the
> CI pipeline is fully operational.

---

## ✅ Success Criteria (before full operational status)

- [x] All namespaces present
- [x] ArgoCD UI accessible and syncing admin-cluster manifests
- [ ] MinIO pods Running + buckets created
- [ ] Keycloak UI accessible via `keycloak.192.168.56.10.nip.io`
- [ ] Jenkins Running with Kubernetes plugin + CasC configured
- [ ] Nexus Running with Docker registry accessible
- [ ] Grafana accessible and connected to Thanos + Loki datasources
- [ ] Dev cluster (`192.168.56.11`) registered in ArgoCD
- [ ] Prod cluster (`192.168.56.12`) registered in ArgoCD
- [ ] End-to-end CI/CD: code push → Jenkins build → Nexus push → ArgoCD deploy

---

## ⚠️ Known Ingress Hostnames (nip.io — no DNS needed)

All services use `<service>.192.168.56.10.nip.io` pattern with the rke2-ingress-nginx already running.

| Service | URL |
|---------|-----|
| ArgoCD | `argocd.192.168.56.10.nip.io` |
| Keycloak | `keycloak.192.168.56.10.nip.io` |
| Grafana | `grafana.192.168.56.10.nip.io` |
| Prometheus | `prometheus.192.168.56.10.nip.io` |
| MinIO Console | `minio.192.168.56.10.nip.io` |
| Alertmanager | `alertmanager.192.168.56.10.nip.io` |
| Jaeger | `jaeger.192.168.56.10.nip.io` |
| GoAlert | `goalert.192.168.56.10.nip.io` |
| Jenkins | `jenkins.192.168.56.10.nip.io` |
| Nexus | `nexus.192.168.56.10.nip.io` |

---

## 📋 Remaining Work

| Task | Priority | Status |
|------|----------|--------|
| Stabilize admin cluster pods (MinIO, Nexus, Keycloak) | 🔴 High | ✅ DONE |
| Configure Jenkins CasC with Kubernetes pod agent templates | 🔴 High | ✅ DONE |
| Provision Dev cluster on `192.168.56.11` | 🟡 Medium | ✅ DONE |
| Provision Prod cluster on `192.168.56.12` | 🟡 Medium | ✅ DONE |
| Register dev/prod clusters with ArgoCD | 🟡 Medium | ✅ DONE |
| Deploy Edge WAF (Coraza/Istio) to IngressGateway | 🔴 High | ✅ DONE |
| Wire Keycloak SSO into Jenkins, Grafana, Nexus | 🟡 Medium | Not Started |
| Wire observability stack (Thanos receiver, Promtail→Loki, Grafana datasources) | 🟡 Medium | Not Started |
| Configure Istio service mesh on downstream clusters | 🟢 Low | ✅ DONE |
| Expose Dev cluster publicly via NGINX Jump Box | 🟡 Medium | ✅ DONE |
| End-to-end CI/CD pipeline testing | 🟢 Low | Not Started |

---

## 📝 Change Log

| Date | Action | Result |
|------|--------|--------|
| 2026-07-12 | Dev Cluster Public Access | Configured NGINX on Jump Box (`117.250.206.138`) to proxy HTTP traffic to Istio IngressGateway, enabling public access without SOCKS proxy. Updated `node-backend` CORS and `mesh.yaml` to support `.138` hostnames. |
| 2026-07-12 | Jenkins Pod Agents & GitOps Fix | Centralized the `devops-agent` pod template in `jenkins-casc-config.yaml` with Trivy/Kaniko. Fixed the `Jenkinsfile` to push image updates to the new `main` branch instead of deprecated `dev` branch. |
| 2026-06-29 | Session started — cluster at clean kube-system state | RKE2 running, NGINX ingress up, no app namespaces |
| 2026-06-29 | GitOps setup added | `admin-cluster/kustomization.yaml` + `argocd-repo-secret.yaml` + `argocd.yaml` rewritten with self-managing `admin-cluster-apps` Application |
| 2026-06-29 | Standardized Secrets & RBAC Fixes | Standardized manifests to use `admin-secrets`, configured public GitHub URL, and added `argocd-rbac-patch.yaml` to fix podtemplates caching error. |
| 2026-06-29 | Installed Storage Class & Added PVCs | Installed local-path-provisioner storage class and created `admin-cluster/pvcs.yaml` for minio, jenkins, nexus, loki, prometheus, and grafana. |
| 2026-06-30 | Added MetalLB config | Created `admin-cluster/network-system/metallb-config.yaml` (L2 IPAddressPool `192.168.56.240-250` + L2Advertisement), added `metallb-system` namespace (privileged PSA), wired into kustomization. |
| 2026-07-05 | Decoupled dev/prod GitOps branches | Updated ArgoCD Applications: `downstream-dev` watches `dev` branch, `downstream-prod` watches `prod` branch. Creates promotion gate for production deployments. |
| 2026-07-05 | Replaced custom Jenkins image | Swapped `nitte-jenkins:1.0.0` → `jenkins/jenkins:lts-jdk17`. Jenkins is now a stock controller; builds will run in ephemeral K8s pod agents. |
| 2026-07-05 | Replaced custom Nexus image | Swapped `nitte-nexus:1.0.0` → `sonatype/nexus3:3.72.0`. Added `strategy: Recreate` to prevent PVC lock deadlocks. |
| 2026-07-05 | Full image audit + version pinning | Pinned all `:latest` tags across the repo (MinIO, mc, GoAlert, Redoc, Unleash). Zero `:latest` tags remaining. |
| 2026-07-05 | Deleted orphaned `downstream-clusters/apps/` | Legacy folder unused in current hub-and-spoke architecture. |
| 2026-07-05 | Fixed MinIO image tag | Changed to `RELEASE.2025-09-07T16-13-09Z` (confirmed available on Docker Hub). Added `strategy: Recreate` to prevent PVC deadlock. |
| 2026-07-12 | Full Istio Service Mesh Cutover | Deployed Istio to dev cluster, migrated all ingress traffic from nginx to Istio ingressgateway (MetalLB IP 192.168.56.201), enabled STRICT mTLS, added ArgoCD ignoreDifferences for StatefulSet drift. |
| 2026-07-15 | Coraza WAF Deployment | Integrated Coraza WAF as an Istio WasmPlugin on the IngressGateway. Fixed image tag (`0.6.0`), flattened ModSecurity syntax, removed memory limits, and corrected `directives_map` schema. WAF is in STRICT blocking mode. |
| 2026-07-17 | Fix Dev Cluster Kustomize Build Error | Removed a duplicate `AuthorizationPolicy` (`keycloak-to-notification`) in `prometheus-scrape-policies.yaml` which caused a kustomize accumulation error during ArgoCD synchronization of the dev downstream cluster. |
