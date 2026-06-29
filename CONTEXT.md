# HPE Merchandise Config — Live Context

> **Last updated:** 2026-06-29
> **Working cluster:** `prod` (currently called `prod`, will be renamed to `admin` after successful setup)
> **Cluster node:** `workervm2` (single-node RKE2)
> **Cluster IP:** `192.168.56.10` (admin hub in the hub-and-spoke plan)

---

## 🎯 Objective

Bootstrap this RKE2 node as the **Admin cluster** by applying all manifests under `admin-cluster/`.

On success → rename the cluster context from `prod` → `admin`.

Future clusters:
- `dev`  → `192.168.56.11`
- `prod` → `192.168.56.12`

---

## 🖥️ Current Cluster State (as of 2026-06-29)

```
NAMESPACE     NAME                                                    READY   STATUS
kube-system   cloud-controller-manager-workervm2                      1/1     Running
kube-system   etcd-workervm2                                          1/1     Running
kube-system   kube-apiserver-workervm2                                1/1     Running
kube-system   kube-controller-manager-workervm2                       1/1     Running
kube-system   kube-proxy-workervm2                                    1/1     Running
kube-system   kube-scheduler-workervm2                                1/1     Running
kube-system   rke2-canal-5kbm2                                        2/2     Running
kube-system   rke2-coredns-...                                        1/1     Running
kube-system   rke2-ingress-nginx-controller-ssg6l                     1/1     Running
kube-system   rke2-metrics-server-...                                 1/1     Running
kube-system   rke2-snapshot-controller-...                            1/1     Running
```

**NGINX Ingress** ✅ already running (rke2-ingress-nginx)
**CoreDNS** ✅ already running
**No application namespaces yet** — clean slate

---

## 📁 Repo Structure

```
admin-cluster/
├── namespaces.yaml          # Step 1 — create all namespaces
├── secrets.yaml             # Step 2 — cluster-wide secrets
├── storage-system/
│   ├── minio.yaml           # MinIO object store (Thanos + Loki backend)
│   ├── minio-init.yaml      # MinIO bucket init job
│   └── minio-ingress.yaml   # Ingress for MinIO console
├── identity-core/
│   ├── postgres-keycloak.yaml  # Postgres DB for Keycloak
│   ├── keycloak.yaml           # Keycloak deployment
│   ├── keycloak-setup.yaml     # Realm bootstrap job
│   └── keycloak-ingress.yaml   # Ingress for Keycloak
├── observability/
│   ├── prometheus.yaml         # Prometheus (central)
│   ├── thanos.yaml             # Thanos (receiver, store, compactor, query)
│   ├── loki.yaml               # Loki log aggregator
│   ├── loki-rbac-proxy.yaml    # Loki RBAC proxy
│   ├── grafana.yaml            # Grafana dashboards
│   ├── alertmanager.yaml       # Alertmanager
│   ├── jaeger.yaml             # Jaeger tracing
│   ├── goalert.yaml            # GoAlert on-call scheduler
│   └── observability-ingress.yaml
├── gitops-system/
│   ├── argocd.yaml             # ArgoCD (hub GitOps engine)
│   ├── rancher-install.sh      # Rancher install (optional)
│   └── GITOPS.md
└── system/
    ├── jenkins.yaml            # Jenkins CI/CD
    ├── nexus.yaml              # Nexus artifact registry
    ├── oauth2-proxies.yaml     # OAuth2 proxy sidecars
    └── jenkins-nexus-ingress.yaml

downstream-clusters/          # Managed by ArgoCD from admin cluster
├── apps/                     # App manifests pushed to dev/prod
├── base/
├── monitoring-agents/        # Promtail + Prometheus agents on each cluster
└── overlays/
```

---

## 🗺️ Planned Deployment Order (Admin Cluster Bootstrap)

Apply in this exact order — each step depends on the previous.

## 🔄 GitOps Flow (New — ArgoCD self-manages the admin cluster)

Once ArgoCD is bootstrapped, **Git is the source of truth**. Any push to `admin-cluster/` is automatically applied by ArgoCD — no more manual `kubectl apply`.

```
Git push → GitHub → ArgoCD polls every 3 min → kubectl apply (via Kustomize)
                                               ↓
                                    admin-cluster/kustomization.yaml
                                    (assembles all manifests in order)
```

**New files added:**
- `admin-cluster/kustomization.yaml` — Kustomize entrypoint for the whole admin cluster
- `admin-cluster/gitops-system/argocd-repo-secret.yaml` — Git credentials (fill in, apply out-of-band)
- `admin-cluster/gitops-system/argocd.yaml` — updated with `AppProject` + self-managing `admin-cluster-apps` Application
- `admin-cluster/gitops-system/argocd-rbac-patch.yaml` — RBAC patch for ClusterRoleBinding namespaces

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
| 7.5 | `kubectl apply -f admin-cluster/gitops-system/argocd-rbac-patch.yaml` | Apply RBAC patch for ClusterRoleBinding namespaces | ✅ DONE |
| 7.6 | `kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.36/deploy/local-path-storage.yaml` | Install Local Path Storage Class | ✅ DONE |
| 8 | **ArgoCD auto-syncs `admin-cluster/` — all services deploy automatically** | ✨ GitOps active | ⬜ IN PROGRESS |

> **After step 7, you never manually `kubectl apply` admin-cluster manifests again.**
> Edit files → `git push` → ArgoCD applies within 3 minutes.

> **ArgoCD initial admin password:**
> ```bash
> kubectl get secret argocd-initial-admin-secret -n gitops-system \
>   -o jsonpath="{.data.password}" | base64 -d
> ```

---

## ✅ Success Criteria (before renaming to "admin")

- [ ] All namespaces present: `kubectl get ns`
- [ ] MinIO pods Running + buckets created
- [ ] Keycloak UI accessible via `keycloak.192.168.56.10.nip.io`
- [ ] Grafana accessible and connected to Thanos + Loki datasources
- [ ] ArgoCD UI accessible via `argocd.192.168.56.10.nip.io`
- [ ] ArgoCD can connect to downstream cluster contexts

---

## 🔄 Rename Cluster Context

Once all checks pass:
```bash
# Rename kubeconfig context from prod → admin
kubectl config rename-context prod admin

# Verify
kubectl config get-contexts
```

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

## 📝 Change Log

| Date | Action | Result |
|------|--------|--------|
| 2026-06-29 | Session started — cluster at clean kube-system state | RKE2 running, NGINX ingress up, no app namespaces |
| 2026-06-29 | GitOps setup added | `admin-cluster/kustomization.yaml` + `argocd-repo-secret.yaml` + `argocd.yaml` rewritten with self-managing `admin-cluster-apps` Application |
| 2026-06-29 | Standardized Secrets & RBAC Fixes | Standardized manifests to use `admin-secrets`, configured public GitHub URL, and added `argocd-rbac-patch.yaml` to fix podtemplates caching error. |
| 2026-06-29 | Installed Storage Class & Added PVCs | Installed local-path-provisioner storage class and created `admin-cluster/pvcs.yaml` for minio, jenkins, nexus, loki, prometheus, and grafana. |

