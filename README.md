# NITTE Alumni Merchandise Shop

A full-stack alumni e-commerce platform with Istio service mesh, MongoDB sharding, full observability stack, Keycloak RBAC, event-driven notifications, and CI/CD — runnable end-to-end with **one command**.

> **Docker Compose:** `./docker-setup.sh start`
> **Kubernetes + Istio:** `./k8s-setup.sh start`

For a step-by-step demo guide, see **[DEMO.md](./DEMO.md)**.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Istio Service Mesh (mTLS STRICT)                     │
│                                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │ Frontend │  │    Admin     │  │   Merchant    │  │   Keycloak   │  │
│  │  :5173   │  │  Dashboard   │  │    Portal     │  │    :8080     │  │
│  │          │  │    :5174     │  │    :5175      │  │              │  │
│  └────┬─────┘  └──────┬──────┘  └──────┬────────┘  └──────────────┘  │
│       │                │                │                              │
│       └────────────────┼────────────────┘                              │
│                        ▼                                               │
│  ┌──────────────────────────────────────┐  ┌────────────────────────┐  │
│  │     Node.js Backend API :3000        │──│  Python Service :8000  │  │
│  │  (Express + Kafka + JWT + S3)        │  │  (FastAPI + Jaeger)    │  │
│  └───────┬──────────┬──────────┬────────┘  └────────────────────────┘  │
│          │          │          │                                        │
│  ┌───────▼───┐  ┌───▼────┐  ┌─▼─────┐  ┌──────────────────────────┐  │
│  │  MongoDB  │  │ Kafka  │  │ MinIO │  │   Notification Service   │  │
│  │  Sharded  │  │        │  │  (S3) │  │ (Kafka → Email/Slack)    │  │
│  │ 2 Shards  │  │        │  │       │  │                          │  │
│  └───────────┘  └────────┘  └───────┘  └──────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Observability: Prometheus · Grafana · Loki · Jaeger · Kiali     │  │
│  │                 Alertmanager · Promtail · Loki-RBAC-Proxy        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  DevOps: Jenkins (CI/CD) · Nexus (Artifacts) · OAuth2 Proxies    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Services

### Docker Compose (30 containers)

| Tier | Services |
| --- | --- |
| **Application** | `frontend` (5173) · `admin-dashboard` (5174) · `merchant-portal` (5175) · `node-backend` (3000) · `python-service` (8000) · `notification-service` |
| **Database** | MongoDB Sharded: `mongo-config` · `mongo-shard1` · `mongo-shard2` · `mongodb` (router, 27017) · `mongo-init` · `mongo-backup` |
| **Storage** | `minio` (9000/9001) · `minio-init` |
| **Identity** | `keycloak` (8080) · `keycloak-setup` |
| **Streaming** | `zookeeper` (2181) · `kafka` (9092) |
| **Observability** | `prometheus` · `grafana` (3001) · `loki` (3100) · `promtail` · `promtail-keycloak` · `loki-rbac-proxy` (3200) · `jaeger` · `alertmanager` (9093) |
| **DevOps** | `jenkins` (8081) · `nexus` (8082) |
| **Auth Proxies** | `oauth2-proxy-prometheus` (9090) · `oauth2-proxy-jaeger` (16686) |
| **Seeding** | `seed-products` |

### Kubernetes + Istio (25 deployments + DaemonSets + Istio control plane)

All Docker Compose services plus:
- **Istio**: `istiod` · `istio-ingressgateway` · `kiali` (20001)
- **Sidecar proxies** injected into every pod (mTLS encryption)
- Istio configs: Gateway, VirtualServices, DestinationRules, PeerAuthentication, AuthorizationPolicies, EnvoyFilter (rate limiting), ServiceEntries

---

## Istio Service Mesh (K8s only)

| Feature | Configuration | Effect |
|---------|--------------|--------|
| **mTLS** | `PeerAuthentication: STRICT` | All HTTP service traffic encrypted; MongoDB/Kafka use PERMISSIVE (raw TCP) |
| **Circuit Breakers** | `DestinationRule` outlier detection | 5 consecutive 5xx errors → pod ejected for 60s |
| **Rate Limiting** | `EnvoyFilter` on node-backend | 100 requests/minute per pod |
| **Authorization** | `AuthorizationPolicy` | Only backend can reach MongoDB/Kafka; frontend cannot hit DB directly |
| **Traffic Routing** | `VirtualService` + `Gateway` | Single ingress routes `/api`, `/shop`, `/admin`, `/merchant`, `/auth`, `/grafana` |
| **Service Entries** | External allowlist | Outbound only to: smtp.gmail.com, hooks.slack.com, api.razorpay.com |
| **Kiali** | Service mesh dashboard | Visual topology of all traffic at http://localhost:20001 |

---

## Prerequisites

### Docker Compose

- Docker Desktop or Docker Engine + Compose v2
- ~8 GB free RAM, ~12 GB free disk
- Ports: 3000-3001, 5173-5175, 8000, 8080-8083, 9000-9001, 9090, 9092-9093, 16686, 27017

### Kubernetes + Istio

- Docker (running)
- minikube
- kubectl
- 16GB+ system RAM (script auto-allocates 12GB to minikube)
- 24GB+ recommended for smooth operation with Istio
- ~30 GB free disk

### Windows Users

Run from WSL2:
```bash
wsl
cd /mnt/c/path/to/project
./k8s-setup.sh start
```

---

## Quick Start

### Docker Compose (recommended for development)

```bash
chmod +x docker-setup.sh
./docker-setup.sh start
```

First run: ~8-12 minutes. Subsequent runs: ~45 seconds.

### Kubernetes + Istio (production-like)

```bash
chmod +x k8s-setup.sh
./k8s-setup.sh start
```

First run: ~30-40 minutes. Subsequent runs: ~5-10 minutes.

### Kubernetes without Istio (16GB machines)

```bash
./k8s-setup.sh start --no-istio
```

---

## Commands

### docker-setup.sh

| Command | What it does |
|---|---|
| `start` | Pull → build → start → verify |
| `stop` | Stop all containers |
| `restart` | Stop then start |
| `clean` | Delete all containers + volumes (⚠ DATA LOSS) |
| `status` | Show container health |
| `logs` | Tail all service logs |
| `demo` | Smoke test + generate traffic |

### k8s-setup.sh

| Command | What it does |
|---|---|
| `start` | Install Istio → build → deploy → port-forward |
| `start --no-istio` | Same but without Istio (lighter) |
| `stop` | Stop port-forwards (pods stay running) |
| `forward` | Re-establish port-forwards |
| `restart` | Rolling restart all deployments |
| `clean` | Delete namespace + all data (⚠ DATA LOSS) |
| `status` | Deployment health + Istio status |
| `logs <service>` | Tail logs for a service |
| `demo` | Quick API self-test |

---

## Service URLs

| Service | URL | Notes |
|---|---|---|
| Storefront | http://localhost:5173 | Alumni merch shop |
| Admin Dashboard | http://localhost:5174 | User verification, DB management, metrics |
| Merchant Portal | http://localhost:5175 | Product/order management |
| Backend API | http://localhost:3000 | REST API |
| API Docs | http://localhost:3000/api/docs | Swagger/OpenAPI |
| Keycloak | http://localhost:8080 | Identity & access management |
| Jenkins | http://localhost:8081 | CI/CD pipelines (Keycloak SSO) |
| Nexus | http://localhost:8082 | Artifact repository |
| MinIO Console | http://localhost:9001 | Object storage UI |
| Prometheus | http://localhost:9090 | Metrics (Keycloak SSO, @nitte.ac.in) |
| Grafana | http://localhost:3001 | Dashboards (Keycloak SSO or admin/admin123) |
| Alertmanager | http://localhost:9093 | Alert routing |
| Jaeger | http://localhost:16686 | Distributed tracing (Keycloak SSO) |
| Loki | http://localhost:3100 | Log aggregation API |
| MongoDB | http://localhost:8083 | MongoDB web UI (Docker only) |
| **Kiali** | http://localhost:20001 | Istio mesh dashboard (K8s only) |

---

## Demo Credentials

### Storefront (http://localhost:5173)

| Role | Username | Password |
|---|---|---|
| Platform Admin | `admin@nitte.edu` | `admin@123` |
| Verified Alumni | `alumni@nitte.edu` | `alumni@123` |
| Non-Alumni Guest | `guest_user@alumni-shop.local` | `Guest@123` |

### Admin Console (http://localhost:5174)

| Role | Username | Password |
|---|---|---|
| Platform Admin | `admin@nitte.edu` | `admin@123` |

### Merchant Portal (http://localhost:5175)

| Role | Username | Password |
|---|---|---|
| NITTE Merchant | `merchant-admin@nitte.edu` | `MerchantAdmin@123` |
| Amazon Merchant | `amazon-merchant@amazon.com` | `Amazon@123` |
| Flipkart Merchant | `flipkart-merchant@flipkart.com` | `Flipkart@123` |

### Internal DevOps (Jenkins, Grafana, Prometheus, Jaeger)

| Role | Username | Password | Notes |
|---|---|---|---|
| Internal Admin | `internal-admin@nitte.ac.in` | `InternalAdmin@123` | Full access, 2FA required |
| Internal User | `internal-user@nitte.ac.in` | `InternalUser@123` | Read-only |
| Jenkins Fallback | `local-admin` | `LocalAdmin@123` | Offline fallback |

### Infrastructure

| Service | Username | Password |
|---|---|---|
| Keycloak Admin | `admin` | `admin` |
| Grafana (local) | `admin` | `admin123` |
| Nexus | `admin` | `nexus-admin-123` |
| MinIO | `minioadmin` | `minioadmin123` |

---

## MongoDB Sharded Cluster

Production-like geo-sharded setup:

- **Config Server**: Stores cluster metadata (replica set: `configRS`)
- **Shard 1** (port 27018): South/West India orders
- **Shard 2** (port 27019): North/East India orders
- **Mongos Router** (port 27017): Application connection point
- **Shard Key**: `orders.region` — zone-based routing
- **Backup**: Daily CronJob → compressed archive → MinIO (7-day retention)

---

## Keycloak Integration

### Authentication Flows

- **Storefront/Admin/Merchant** → OIDC password grant → JWT with roles
- **Jenkins/Grafana** → OIDC authorization code flow → SSO
- **Prometheus/Jaeger** → OAuth2 proxy → Keycloak login (@nitte.ac.in only)
- **Inter-service** (K8s) → Istio mTLS at transport layer

### Event Listener SPI

Custom Java plugin (`keycloak-event-listener/`) captures:
- Security events: `LOGIN_ERROR`, `UPDATE_PASSWORD`, `REGISTER`, `REMOVE_TOTP`
- Admin events: `CREATE`, `UPDATE`, `DELETE` on users/roles/clients

Events are forwarded to the Notification Service which routes to Slack/Email/Tickets.

### Audit Log Separation

- Loki multi-tenancy (`auth_enabled: true`)
- RBAC proxy validates JWT and maps:
  - `keycloak-admin` role → sees all logs (audit + app)
  - Other roles → app logs only
- Grafana dashboards pre-configured for all services

---

## Observability Stack

| Tool | Purpose | Access |
|------|---------|--------|
| Prometheus | Metrics collection | Keycloak SSO (9090) |
| Grafana | Dashboards + alerting | Keycloak SSO or local admin (3001) |
| Loki | Log aggregation | Via Grafana datasource |
| Promtail | Log shipping (pods → Loki) | DaemonSet |
| Jaeger | Distributed tracing | Keycloak SSO (16686) |
| Alertmanager | Alert routing (Slack/email) | Direct (9093) |
| Kiali | Istio service mesh topology | Direct (20001, K8s only) |

---

## CI/CD

- **Jenkinsfile** at project root — multi-stage pipeline
- **Jenkins** with Keycloak SSO + local fallback auth
- **Nexus** for artifact/package registry
- **GitHub Actions** (`.github/workflows/ci-cd.yml`)

---

## BDD Specifications

Located in `docs/bdd/features/`:

1. `01_user_signup_and_login.feature`
2. `02_product_browsing.feature`
3. `03_order_management.feature`
4. `04_alumni_registration.feature`
5. `05_admin_approval_workflow.feature`

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/seed-products.mjs` | Seed product catalog + upload images to MinIO |
| `scripts/seed-orders.mjs` | Generate sample orders |
| `scripts/demo-keycloak-events.sh` | Verify Keycloak event flow end-to-end |
| `scripts/simulate-alerts.sh` | Trigger Prometheus alerts for demo |
| `scripts/backup-mongodb.sh` | Manual MongoDB backup to MinIO |

---

## Documentation

| File | Purpose |
|------|---------|
| [DEMO.md](./DEMO.md) | Step-by-step demo runbook |
| [docs/MICROSERVICES.md](./docs/MICROSERVICES.md) | All services — architecture reference |
| [docs/USER_ROLES.md](./docs/USER_ROLES.md) | Roles, credentials, RBAC matrix |
| [docs/KUBERNETES_DEPLOYMENT.md](./docs/KUBERNETES_DEPLOYMENT.md) | K8s deployment guide |
| [keycloak/KEYCLOAK_DEMO.md](./keycloak/KEYCLOAK_DEMO.md) | Keycloak realm structure + token tests |

---

## Project Structure

```
├── admin-dashboard/       # React admin UI (Vite + Tailwind)
├── frontend/              # React storefront (Vite + Tailwind)
├── merchant-portal/       # React merchant UI (Vite + Tailwind)
├── node-backend/          # Express.js API gateway
├── python-service/        # FastAPI catalog/orders service
├── notification-service/  # Kafka consumer → Slack/Email/Tickets
├── keycloak-event-listener/  # Java SPI for Keycloak events
├── loki-rbac-proxy/       # Node.js Loki auth proxy
├── k8s/                   # Kubernetes manifests (25 deployments)
│   └── istio/             # Istio service mesh configs (7 files)
├── keycloak/              # Realm JSON + bootstrap script + theme
├── jenkins/               # Jenkins Docker build + CASC config
├── nexus/                 # Nexus Docker build
├── prometheus/            # Prometheus config + alert rules
├── grafana/               # Provisioned datasources + dashboards
├── alertmanager/          # Alert routing config
├── loki/                  # Loki config
├── promtail/              # Promtail configs
├── database/              # MongoDB sharding init script
├── product-images/        # Seed product images
├── scripts/               # Utility and demo scripts
├── docs/                  # Architecture docs + BDD features
├── .github/workflows/     # GitHub Actions CI/CD
├── docker-compose.yml     # Full Docker Compose stack
├── docker-setup.sh        # One-command Docker setup
├── k8s-setup.sh           # One-command K8s + Istio setup
├── Jenkinsfile            # CI/CD pipeline definition
└── README.md
```

---

## Troubleshooting

### Docker

```bash
./docker-setup.sh status         # container health
./docker-setup.sh logs           # all logs
docker compose logs <service>    # single service
./docker-setup.sh clean          # reset everything
```

### Kubernetes

```bash
./k8s-setup.sh status                    # deployment + Istio health
./k8s-setup.sh logs node-backend         # tail a service
kubectl get pods -n nitte                 # raw pod status
kubectl describe pod -n nitte <pod>      # debug failures
kubectl logs -n nitte <pod> -c <container>  # container logs
minikube dashboard                        # K8s web UI
```

### Common Issues

| Problem | Fix |
|---------|-----|
| Docker daemon not running | `sudo systemctl start docker` or open Docker Desktop |
| Port already in use | `./docker-setup.sh stop` or `lsof -i :<port>` |
| Minikube won't start | `minikube delete --all --purge && ./k8s-setup.sh start` |
| Pods stuck Pending | Insufficient RAM — try `--no-istio` or close other apps |
| Keycloak slow to start | Normal — augmentation takes 2-3 min on first boot |
| Grafana shows "No data" | Wait 60s for promtail to push logs; check `./k8s-setup.sh status` |
| Services show 0/1 Ready | Check init containers: `kubectl describe pod -n nitte <pod>` |

---

## License

MIT
