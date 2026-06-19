# NITTE Alumni Merchandise Shop — Platform Architecture

A production-grade, self-hosted Kubernetes platform built on RKE2, with GitOps (ArgoCD), CI/CD (Jenkins + SonarQube + Nexus), service mesh (Istio), identity (Keycloak), event streaming (Kafka), object storage (MinIO), and a full observability stack (Prometheus, Grafana, Loki, Jaeger, GoAlert).

---

## 1. High-Level Overview

```
                          ┌─────────────────────┐
                          │      Internet        │
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │        WAF           │   ← blocks SQLi, XSS, etc.
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │   Istio Gateway      │   ← single ingress, TLS
                          └──────────┬──────────┘
                                     │
                          ┌──────────▼──────────┐
                          │   Keycloak (OIDC)    │   ← authN / authZ
                          └──────────┬──────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        ▼                            ▼                            ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│   Frontend    │          │ Admin / Merch │          │  Backend API  │
│  (Storefront) │          │   Dashboards  │          │  + Python Svc │
└───────────────┘          └───────────────┘          └───────┬───────┘
                                                               │
        ┌──────────────────────────────────────────────────────┼──────────┐
        ▼                  ▼                  ▼                  ▼          ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────┐
│   MongoDB    │  │    Kafka     │  │    MinIO     │  │ Notification │  │ Nexus  │
│  (Sharded)   │  │  (Streaming) │  │  (S3 Store)  │  │   Service    │  │(Registry)│
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └────────┘

   Every pod runs:  [ App Container ] + [ Envoy Sidecar ]  ← Istio mTLS mesh
```

---

## 2. Infrastructure Layer

### Host

- **Ubuntu Desktop** (`arcade-HP`) — physical/host machine
- SSH access: `ssh arcade@117.250.206.138`
- Runs **VirtualBox** hosting 3 Ubuntu Server VMs

### Virtual Machines

| VM | Role | RAM | Disk | Node Type |
|----|------|-----|------|-----------|
| `mastervm` | Control Plane | 6 GB | 100 GB | RKE2 Master |
| `dev-vm` | Workload | 8 GB | 150 GB | RKE2 Worker 1 |
| `prod-vm` | Workload | 8 GB | 150 GB | RKE2 Worker 2 |

**Total cluster capacity: 22 GB RAM, 400 GB disk**

### Cluster Topology

```
Ubuntu Desktop (arcade-HP)
└── VirtualBox
    ├── mastervm   → RKE2 Master Node (control-plane, etcd)
    ├── dev-vm     → RKE2 Worker Node 1
    └── prod-vm    → RKE2 Worker Node 2

RKE2 Kubernetes Cluster
├── Master Node (mastervm)
├── Worker Node 1 (dev-vm)
└── Worker Node 2 (prod-vm)
```

### Why RKE2?

- CNCF-certified, security-hardened Kubernetes (CIS benchmark compliant)
- Bundled containerd, no separate Docker needed
- Built-in etcd, easy single-master HA path
- Managed via **Rancher** UI for cluster operations

---

## 3. Source Control Strategy

**GitHub** is the single source of truth.

| Branch | Purpose |
|--------|---------|
| `development` | Active application development |
| `production` | Deployment-ready code + Kubernetes manifests |

```
Feature work → development branch → tested → merged → production branch → ArgoCD deploys
```

---

## 4. CI/CD Pipeline (Jenkins + SonarQube + Nexus)

```
Developer
    │  git push
    ▼
GitHub (development branch)
    │  webhook trigger
    ▼
Jenkins Pipeline
    ├── 1. Pull code
    ├── 2. Build application
    ├── 3. SonarQube analysis (code quality + security gate)
    ├── 4. Build container images
    └── 5. Push artifacts + images
              │
              ▼
       Sonatype Nexus (Docker registry + artifact repo)
```

### Pipeline Stages

1. **Checkout** — Jenkins pulls from `development` branch
2. **Build** — compile/bundle each microservice
3. **Code Quality** — SonarQube scans for bugs, vulnerabilities, code smells; pipeline fails if quality gate not met
4. **Containerize** — build Docker images for each service
5. **Publish** — push images to Nexus Docker registry, store build artifacts

---

## 5. GitOps Workflow (ArgoCD)

```
Developer
    │  update k8s manifests
    ▼
GitHub (production branch, k8s/ folder)
    │  ArgoCD polls / webhook
    ▼
ArgoCD (GitOps controller)
    ├── detects manifest drift
    ├── syncs desired state
    └── applies to cluster
              │
              ▼
       RKE2 Cluster (live state matches Git)
```

### ArgoCD Responsibilities

- Continuously watches the Git repo (`k8s/` path)
- Detects any difference between Git (desired) and cluster (actual)
- Auto-syncs — applies changes without manual `kubectl`
- Self-heals — reverts manual cluster changes back to Git state
- Provides a visual dashboard of application health and sync status

**Key principle:** Git is the source of truth. You never `kubectl apply` manually in production — you push to Git and ArgoCD deploys.

---

## 6. Security Layer

### Traffic Flow (Defense in Depth)

```
Internet
   │
   ▼
WAF                  ← Layer 7 filtering (OWASP rules, SQLi/XSS blocking)
   │
   ▼
Istio Gateway        ← TLS termination, routing
   │
   ▼
Keycloak             ← OIDC authentication, token validation
   │
   ▼
Microservices        ← mTLS enforced between all services
```

### Components

| Component | Role |
|-----------|------|
| **WAF** | Filters malicious external traffic before it enters the cluster (Coraza/ModSecurity OWASP CRS) |
| **Istio Gateway** | Single ingress point, TLS, request routing |
| **Istio mTLS** | All service-to-service traffic encrypted (STRICT mode) |
| **Istio AuthorizationPolicy** | Service-level access control (only backend → DB) |
| **Keycloak** | Authentication, authorization, IAM, OAuth2/OIDC |

---

## 7. Application Layer

Applications run as Kubernetes microservices. Each pod = **App Container + Envoy Sidecar** (injected by Istio).

| Service | Tech | Port | Purpose |
|---------|------|------|---------|
| `frontend` | React/Vite | 5173 | Alumni storefront |
| `admin-dashboard` | React/Vite | 5174 | User verification, DB management |
| `merchant-portal` | React/Vite | 5175 | Product/order management |
| `node-backend` | Express.js | 3000 | API gateway, JWT, Kafka producer |
| `python-service` | FastAPI | 8000 | Catalog/orders, tracing |
| `notification-service` | Node.js | 9100 | Kafka consumer → Email/Slack |

Service-to-service communication flows through the **Istio service mesh** via **Envoy sidecars** (mTLS, retries, circuit breaking).

---

## 8. Event Streaming (Kafka)

```
node-backend (producer) → Kafka topics → notification-service (consumer)
```

- **Asynchronous communication** between services
- **Event-driven** — user approvals, order events, security events
- **Decoupling** — services don't call each other directly for async work
- Topics: `user-events`, `order-events`, `keycloak-events`

---

## 9. Storage Layer

| Component | Provides |
|-----------|----------|
| **MinIO** | S3-compatible object storage — product images, user uploads, backups, artifacts |
| **Sonatype Nexus** | Docker image registry, build artifact repository, dependency proxy |
| **MongoDB (Sharded)** | Application database — config server + 2 shards + mongos router, geo-sharded by region |

---

## 10. Observability Stack

### Metrics

```
Cluster/Node/Pod/App metrics → Prometheus → Grafana (dashboards)
```

### Logging

```
Nodes/Containers/Pods → Promtail → Loki → Grafana (log queries)
```

### Tracing

```
Service requests → Jaeger (distributed traces, dependency graph)
```

### Alerting

```
Prometheus (alert rules) → Alertmanager → GoAlert (routing, on-call, escalation)
```

| Tool | Purpose |
|------|---------|
| **Prometheus** | Metrics collection (cluster, node, pod, app) |
| **Grafana** | Dashboards & visualization |
| **Loki** | Log aggregation & storage |
| **Promtail** | Log shipping from all nodes |
| **Jaeger** | Distributed tracing, request flow, dependency analysis |
| **GoAlert** | Alert routing, incident management, on-call notifications |
| **Kiali** | Istio service mesh topology visualization |

---

## 11. API Documentation

**Redocly** serves OpenAPI documentation:
- Interactive Swagger UI
- API portal for the backend REST API
- Sourced from the backend's OpenAPI/Swagger spec

---

## 12. Complete Component Inventory

| # | Component | Layer | Purpose |
|---|-----------|-------|---------|
| 1 | RKE2 | Infrastructure | Kubernetes distribution |
| 2 | Rancher | Infrastructure | Cluster management UI |
| 3 | kubectl | Infrastructure | CLI cluster control |
| 4 | Jenkins | CI/CD | Build pipelines |
| 5 | SonarQube | CI/CD | Code quality & security analysis |
| 6 | Sonatype Nexus | CI/CD + Storage | Image registry + artifacts |
| 7 | ArgoCD | GitOps | Continuous delivery controller |
| 8 | Istio | Service Mesh | mTLS, traffic mgmt, security |
| 9 | WAF | Security | Web application firewall |
| 10 | Keycloak | Security | Identity & access management |
| 11 | Kafka | Streaming | Event-driven messaging |
| 12 | MinIO | Storage | S3 object storage |
| 13 | MongoDB | Storage | Application database (sharded) |
| 14 | Prometheus | Observability | Metrics |
| 15 | Grafana | Observability | Dashboards |
| 16 | Loki | Observability | Log aggregation |
| 17 | Promtail | Observability | Log shipping |
| 18 | Jaeger | Observability | Distributed tracing |
| 19 | GoAlert | Observability | Alerting & on-call |
| 20 | Redocly | Documentation | API docs portal |

---

## 13. Dependencies Between Components

```
RKE2 (foundation)
 ├── Istio ──────────► requires RKE2
 │    └── all app pods get Envoy sidecars
 ├── ArgoCD ─────────► deploys everything from Git
 ├── Keycloak ───────► auth for: Grafana, Jenkins, Nexus, Prometheus, Jaeger, apps
 ├── MongoDB ────────► required by: node-backend, python-service
 ├── Kafka ──────────► required by: node-backend (producer), notification-service (consumer)
 ├── MinIO ──────────► required by: node-backend (uploads), mongo-backup
 ├── Nexus ──────────► stores images pulled by all app deployments
 ├── Prometheus ─────► scrapes all services; feeds Grafana + Alertmanager
 ├── Loki ───────────► receives from Promtail; queried by Grafana
 ├── Jaeger ─────────► receives traces from python-service, node-backend
 ├── GoAlert ────────► receives from Alertmanager
 └── WAF ────────────► fronts Istio Gateway
```

**Critical startup order:**
1. RKE2 cluster → Istio → Keycloak
2. MongoDB, Kafka, MinIO (data layer)
3. Backend services (depend on data layer + Keycloak)
4. Frontends (depend on backend)
5. Observability (can start anytime, parallel)

---

## 14. Single Points of Failure (SPOFs)

| SPOF | Risk | HA Mitigation |
|------|------|---------------|
| Single master node | Cluster control plane down if master fails | Add 2 more master nodes (etcd quorum of 3) |
| MongoDB config server (1 replica) | Metadata loss | 3-member config replica set |
| Each shard (1 replica) | Data loss on node failure | 3-member replica set per shard |
| Kafka (single broker) | Message loss | 3-broker cluster, replication factor 3 |
| Keycloak (1 replica) | Auth outage | 2+ replicas with shared DB (Postgres) |
| MinIO (single node) | Storage loss | Distributed MinIO (4+ nodes, erasure coding) |
| VirtualBox host | Entire platform down | Move to bare metal / multiple physical hosts |

---

## 15. Recommended HA Upgrades (Production-Grade)

1. **Control plane HA** — 3 master nodes for etcd quorum
2. **MongoDB** — convert each shard + config to 3-member replica sets
3. **Kafka** — 3 brokers, RF=3, min.insync.replicas=2
4. **Keycloak** — 2+ replicas backed by external PostgreSQL (not H2)
5. **MinIO** — distributed mode across nodes with erasure coding
6. **Stateful workloads** — use StatefulSets + PersistentVolumes (not Deployments + emptyDir)
7. **Ingress** — multiple Istio ingress gateway replicas behind a load balancer (MetalLB)
8. **Backups** — automated etcd snapshots + MongoDB backups to MinIO + offsite copy

---

## See Also

- [KUBERNETES_DEPLOYMENT.md](./KUBERNETES_DEPLOYMENT.md) — step-by-step server deployment
- [CICD_PIPELINE.md](./CICD_PIPELINE.md) — Jenkins + SonarQube + Nexus flow
- [GITOPS_ARGOCD.md](./GITOPS_ARGOCD.md) — ArgoCD GitOps setup
- [MICROSERVICES.md](./MICROSERVICES.md) — service-level reference
