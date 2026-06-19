# NITTE Alumni Merchandise Shop

A full-stack alumni e-commerce platform with Istio service mesh, full observability, identity management, and event-driven architecture — runnable end-to-end with **one command**.

> **Docker setup:** `./docker-setup.sh` (Linux / macOS / Windows Git Bash)
> **Kubernetes + Istio:** `./k8s-setup.sh` (minikube + Istio service mesh)

For a step-by-step demo guide, see **[DEMO.md](./DEMO.md)**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Istio Service Mesh                           │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  ┌──────────────┐    │
│  │ Frontend │  │  Admin   │  │   Merchant    │  │   Keycloak   │    │
│  │  :5173   │  │  :5174   │  │    :5175      │  │    :8080     │    │
│  └────┬─────┘  └────┬─────┘  └──────┬────────┘  └──────────────┘    │
│       │              │               │                              │
│       └──────────────┼───────────────┘                              │
│                      ▼                                              │
│  ┌─────────────────────────────────┐  ┌────────────────────────┐    │
│  │     Node Backend API :3000      │──│   Python Service :8000 │    │
│  └──────────┬──────────────────────┘  └────────────────────────┘    │
│             │                                                       │
│  ┌──────────▼──────┐  ┌────────┐  ┌──────┐  ┌──────────────────┐    │
│  │ MongoDB Sharded │  │ Kafka  │  │MinIO │  │  Notification    │    │
│  │ (Config+2Shards)│  │        │  │  S3  │  │    Service       │    │
│  └─────────────────┘  └────────┘  └──────┘  └──────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Observability: Prometheus · Grafana · Loki · Jaeger · Kiali │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ DevOps: Jenkins · Nexus · AlertManager · OAuth2 Proxies     │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
        mTLS encrypted │ Circuit Breakers │ Rate Limiting
```

---

## What's Inside (26 services + Istio)

| Tier | Services |
| --- | --- |
| **App** | `frontend` (5173) · `admin-dashboard` (5174) · `merchant-portal` (5175) · `node-backend` (3000) · `python-service` (8000) · `notification-service` |
| **Data / Storage** | MongoDB Sharded Cluster (config + 2 shards + mongos router) · `minio` (9000/9001) |
| **Identity** | `keycloak` (8080) |
| **Streaming** | `zookeeper` · `kafka` (9092) |
| **Observability** | `prometheus` · `grafana` (3001) · `loki` (3100) · `promtail` · `loki-rbac-proxy` · `jaeger` · `alertmanager` (9093) · **Kiali** (20001) |
| **DevOps / CI/CD** | `jenkins` (8081) · `nexus` (8082) |
| **Auth Proxies** | `oauth2-proxy-prometheus` (9090) · `oauth2-proxy-jaeger` (16686) |
| **Service Mesh** | Istio (istiod + ingress gateway + sidecar proxies) |

---

## Deployment Options

### Option 1: Docker Compose (simpler, no Kubernetes needed)

```bash
chmod +x docker-setup.sh
./docker-setup.sh
```

- First run: ~8-12 minutes
- Requirements: Docker + 8GB RAM

### Option 2: Kubernetes + Istio (production-like, full mesh)

```bash
chmod +x k8s-setup.sh
./k8s-setup.sh start
```

- First run: ~30-40 minutes (includes Istio installation)
- Requirements: Docker + minikube + kubectl + 16GB+ RAM
- Adds: mTLS, circuit breakers, rate limiting, Kiali dashboard

#### Kubernetes flags

| Flag | Purpose |
|------|---------|
| `--no-istio` | Skip Istio for low-resource machines (<16GB RAM) |

```bash
./k8s-setup.sh start --no-istio   # lighter setup, no service mesh
```

---

## Istio Service Mesh Features

When running with `./k8s-setup.sh start` (with Istio):

| Feature | What it does |
|---------|-------------|
| **mTLS (STRICT)** | All service-to-service traffic automatically encrypted |
| **Circuit Breakers** | Auto-ejects failing services (e.g., 5 consecutive 5xx → ejected for 60s) |
| **Rate Limiting** | Backend API capped at 100 req/min per pod |
| **Authorization Policies** | Only backend can reach MongoDB/Kafka — frontend can't hit DB directly |
| **Traffic Routing** | Single Istio Gateway routes `/api`, `/shop`, `/admin`, `/merchant` |
| **Kiali Dashboard** | Visual service mesh topology at http://localhost:20001 |
| **Service Entries** | Outbound traffic allowed only to SMTP, Slack, Razorpay |

---

## Prerequisites

### Docker Compose
- Docker Desktop or Docker Engine + Compose v2
- ~8 GB free RAM, ~12 GB free disk

### Kubernetes + Istio
- Docker (running)
- minikube (`brew install minikube` / `choco install minikube`)
- kubectl (`brew install kubectl` / `choco install kubernetes-cli`)
- 16GB+ RAM (24GB+ recommended with Istio)
- ~30 GB free disk

### Windows (WSL2)
```bash
# Run from WSL2 terminal
wsl
cd /mnt/c/path/to/project
./k8s-setup.sh start
```

---

## Available Commands

### docker-setup.sh

| Command | What it does |
|---|---|
| `start` *(default)* | Pull → build → start → verify the full stack |
| `stop` | Stop all containers |
| `restart` | Stop, then start |
| `clean` | Stop and delete all volumes (⚠ DATA LOSS) |
| `status` | Show running containers |
| `logs` | Tail logs from all services |
| `demo` | Run API smoke test + generate sample traffic |

### k8s-setup.sh

| Command | What it does |
|---|---|
| `start` *(default)* | Install Istio → build images → deploy all → port-forward |
| `stop` | Stop port-forwards (pods keep running) |
| `restart` | Rolling restart + re-forward ports |
| `forward` | Re-establish port-forwards only |
| `clean` | Delete namespace + all data (⚠ DATA LOSS) |
| `status` | Show deployment health + Istio status |
| `logs <service>` | Tail logs for a service |
| `demo` | Quick self-test against running stack |

---

## Service URLs (after start)

| Service | URL | Notes |
|---|---|---|
| Storefront | http://localhost:5173 | Browse products, cart, orders |
| Admin Dashboard | http://localhost:5174 | User verification, metrics, DB management |
| Merchant Portal | http://localhost:5175 | Product/order management |
| API Gateway | http://localhost:3000 | REST API entry point |
| API Docs (Swagger) | http://localhost:3000/api/docs | Interactive API documentation |
| Keycloak | http://localhost:8080 | Identity & access management |
| Jenkins | http://localhost:8081 | CI/CD pipelines |
| Nexus | http://localhost:8082 | Artifact repository |
| MinIO Console | http://localhost:9001 | S3 object storage |
| Prometheus | http://localhost:9090 | Metrics (Keycloak SSO) |
| Grafana | http://localhost:3001 | Dashboards (Keycloak SSO or admin/admin123) |
| Alertmanager | http://localhost:9093 | Alert routing |
| Jaeger | http://localhost:16686 | Distributed tracing (Keycloak SSO) |
| Loki | http://localhost:3100 | Log aggregation |
| **Kiali** (K8s only) | http://localhost:20001 | Istio service mesh dashboard |

---

## Demo Credentials

### Storefront / Admin / Merchant
| Role | Username | Password | Portal |
|---|---|---|---|
| Platform Admin | `admin@nitte.edu` | `admin@123` | Admin (5174) |
| Verified Alumni | `alumni@nitte.edu` | `alumni@123` | Storefront (5173) |
| Non-Alumni Guest | `guest_user@alumni-shop.local` | `Guest@123` | Storefront (5173) |
| NITTE Merchant | `merchant-admin@nitte.edu` | `MerchantAdmin@123` | Merchant (5175) |
| Amazon Merchant | `amazon-merchant@amazon.com` | `Amazon@123` | Merchant (5175) |
| Flipkart Merchant | `flipkart-merchant@flipkart.com` | `Flipkart@123` | Merchant (5175) |

### Internal Users (DevOps — nitte.ac.in domain)
| Role | Username | Password | Access |
|---|---|---|---|
| Internal Admin | `internal-admin@nitte.ac.in` | `InternalAdmin@123` | Jenkins, Nexus, Grafana Admin, Prometheus, Jaeger — **2FA required** |
| Internal User | `internal-user@nitte.ac.in` | `InternalUser@123` | Jenkins (viewer), Grafana (editor), Jaeger, Loki |

### Infrastructure
| Service | Username | Password |
|---|---|---|
| Keycloak admin UI | `admin` | `admin` |
| Grafana (local) | `admin` | `admin123` |
| Jenkins (offline) | `local-admin` | `LocalAdmin@123` |
| Nexus | `admin` | `nexus-admin-123` |
| MinIO | `minioadmin` | `minioadmin123` |

---

## MongoDB Sharded Cluster

The Kubernetes setup deploys a production-like sharded MongoDB:

```
┌─────────────────┐     ┌─────────────────┐
│  mongo-shard1   │     │  mongo-shard2   │
│  (South/West)   │     │  (North/East)   │
│  Port 27018     │     │  Port 27019     │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │    mongos (router)    │
         │      Port 27017       │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │   mongo-config (RS)   │
         │    Cluster metadata   │
         └───────────────────────┘
```

- **Orders sharded by region**: south/west → Shard 1, north/east → Shard 2
- Zone-based routing for geo-distributed data
- Automatic backup via CronJob → MinIO (daily, 7-day retention)

---

## Keycloak Events & Audit Logs

- **Event Listener SPI** captures security events (LOGIN_ERROR, UPDATE_PASSWORD, REGISTER) → sends to Notification Service
- **Notification Service** routes events to Slack, email (SMTP), and ticketing
- **Loki Multi-Tenancy** with RBAC proxy — `keycloak-admin` role sees audit logs, others see app logs only
- **Grafana Dashboards** — pre-configured panels for all service logs, error logs, and Keycloak security events

---

## Authentication Architecture

- **Storefront / Admin login** → Keycloak OIDC password grant → JWT
- **Service-to-service** → Keycloak client_credentials flow
- **Jenkins / Grafana SSO** → Keycloak OIDC authorization code flow → role-mapped
- **Prometheus / Jaeger** → OAuth2 proxy → Keycloak login (@nitte.ac.in only)
- **Istio mTLS** → All inter-service traffic encrypted at transport layer (K8s only)

---

## Documentation

| File | Purpose |
| --- | --- |
| **[DEMO.md](./DEMO.md)** | Step-by-step demo runbook |
| **[docs/MICROSERVICES.md](./docs/MICROSERVICES.md)** | All services — architecture reference |
| **[docs/USER_ROLES.md](./docs/USER_ROLES.md)** | Roles, credentials, RBAC features |
| **[docs/KUBERNETES_DEPLOYMENT.md](./docs/KUBERNETES_DEPLOYMENT.md)** | K8s deployment guide |

---

## Troubleshooting

### Docker

```bash
./docker-setup.sh logs           # follow all logs
./docker-setup.sh status         # see container health
./docker-setup.sh clean          # reset everything
```

### Kubernetes

```bash
./k8s-setup.sh status                    # deployment health + Istio status
./k8s-setup.sh logs node-backend         # tail specific service
kubectl get pods -n nitte                 # raw pod status
kubectl describe pod -n nitte <pod>      # debug a failing pod
minikube dashboard                        # Kubernetes web UI
```

### Common Issues

| Problem | Fix |
|---------|-----|
| Docker daemon not running | `sudo systemctl start docker` or open Docker Desktop |
| Port already in use | `./docker-setup.sh stop` first |
| Minikube can't start | `minikube delete && ./k8s-setup.sh start` |
| Pods stuck in Pending | Check RAM: `kubectl top nodes` |
| Keycloak slow to start | Normal — takes 2-3 min for augmentation on first boot |

---

## License

MIT — see file headers.
