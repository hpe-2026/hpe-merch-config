# GitOps Workflow — ArgoCD

ArgoCD is the continuous delivery (CD) controller. It keeps the RKE2 cluster's state in sync with the Kubernetes manifests stored in Git. You never run `kubectl apply` manually in production — you push to Git, ArgoCD deploys.

---

## Workflow

```
Developer
    │  update k8s manifests
    ▼
GitHub (production branch, k8s/ folder)
    │
    ▼
ArgoCD ──watches──► detects drift ──syncs──► RKE2 Cluster
    │
    └── self-heals: reverts manual cluster changes back to Git state
```

---

## Why GitOps?

| Benefit | Description |
|---------|-------------|
| **Single source of truth** | Git holds the desired state; the cluster matches it |
| **Auditability** | Every change is a Git commit — full history, who/what/when |
| **Rollback** | `git revert` → ArgoCD rolls back the cluster |
| **Self-healing** | Manual `kubectl` changes are auto-reverted to match Git |
| **No cluster credentials needed** | Developers push to Git, not to the cluster |

---

## Installation

```bash
# Create namespace
kubectl create namespace argocd

# Install ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for it to be ready
kubectl wait --for=condition=available deployment --all -n argocd --timeout=300s

# Expose the UI via NodePort
kubectl patch svc argocd-server -n argocd -p '{"spec":{"type":"NodePort","ports":[{"port":443,"targetPort":8080,"nodePort":30443}]}}'

# Get the initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d; echo
```

Access: `https://192.168.56.10:30443` (or via SSH tunnel `https://localhost:9443`)
Username: `admin` · Password: from the command above.

---

## CLI Setup

```bash
# Install ArgoCD CLI
curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x argocd && sudo mv argocd /usr/local/bin/

# Login
argocd login 192.168.56.10:30443 --insecure \
  --username admin --password <password-from-above>
```

---

## Registering the Application

```bash
# Add the Git repo
argocd repo add https://github.com/radheshpai87/learning-devops.git

# Create the ArgoCD application
argocd app create nitte-merch \
  --repo https://github.com/radheshpai87/learning-devops.git \
  --revision production \
  --path k8s \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace nitte-merch \
  --sync-policy automated \
  --auto-prune \
  --self-heal \
  --sync-option CreateNamespace=true
```

### Declarative alternative (recommended — store in Git)

Create `k8s/argocd/application.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nitte-merch
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/radheshpai87/learning-devops.git
    targetRevision: production
    path: k8s
    directory:
      recurse: true
      exclude: 'argocd/*'
  destination:
    server: https://kubernetes.default.svc
    namespace: nitte-merch
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

Apply once:
```bash
kubectl apply -f k8s/argocd/application.yaml
```

After this, all changes go through Git — ArgoCD handles the rest.

---

## App-of-Apps Pattern (for many components)

For a large platform, use the "app of apps" pattern — one parent ArgoCD app that manages child apps (infrastructure, monitoring, application). Structure:

```
k8s/argocd/
├── root-app.yaml          # parent app pointing to apps/
└── apps/
    ├── infrastructure.yaml  # mongodb, kafka, keycloak, minio
    ├── applications.yaml    # frontend, backend, etc.
    ├── observability.yaml   # prometheus, grafana, loki, jaeger
    └── istio-config.yaml    # gateway, mTLS, policies
```

This lets ArgoCD manage logical groups independently with their own sync waves.

---

## Sync Waves (Ordering)

ArgoCD deploys resources in waves so dependencies come up first. Annotate manifests:

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "0"   # infra (mongodb, kafka) first
    # "1" = keycloak, minio
    # "2" = backend services
    # "3" = frontends
    # "4" = observability
```

---

## Day-to-Day Workflow

```bash
# 1. Make a change to a manifest
vim k8s/node-backend.yaml

# 2. Commit and push to production branch
git add k8s/node-backend.yaml
git commit -m "feat: scale node-backend to 3 replicas"
git push origin production

# 3. ArgoCD detects the change within ~3 minutes (or instantly via webhook)
#    and applies it. Watch in the UI or CLI:
argocd app get nitte-merch
argocd app sync nitte-merch   # force immediate sync if needed
```

---

## Integration with Jenkins

```
Jenkins builds image → pushes to Nexus → updates image tag in k8s/ manifest
   → commits to production branch → ArgoCD detects → deploys new image
```

This closes the loop: code push → CI build → GitOps deploy, fully automated.

---

## Monitoring ArgoCD

```bash
# App health and sync status
argocd app list
argocd app get nitte-merch

# View sync history
argocd app history nitte-merch

# Rollback to a previous revision
argocd app rollback nitte-merch <revision-id>
```

---

## See Also

- [CICD_PIPELINE.md](./CICD_PIPELINE.md) — Jenkins produces the images ArgoCD deploys
- [KUBERNETES_DEPLOYMENT.md](./KUBERNETES_DEPLOYMENT.md) — full server setup
- [ARCHITECTURE.md](./ARCHITECTURE.md) — platform overview
