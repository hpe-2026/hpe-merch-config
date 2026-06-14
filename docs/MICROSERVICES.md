# NITTE Alumni Merchandise Shop — Microservices Reference

> Complete catalog of every containerized service in the NITTE stack.
> All services are orchestrated via `docker-compose.yml` and can be started with `./docker-setup.sh start`.

---

## Table of Contents

- [Application Services (6)](#application-services-6)
- [Data & Identity Services (4)](#data--identity-services-4)
- [Streaming Infrastructure (2)](#streaming-infrastructure-2)
- [Observability Stack (8)](#observability-stack-8)
- [DevOps / CI/CD (2)](#devops--cicd-2)
- [Auth Proxies (2)](#auth-proxies-2)
- [Network & Storage](#network--storage)
- [Quick Reference: Ports](#quick-reference-ports)

---

## Application Services (6)

These are the user-facing and business-logic services that power the alumni merchandise platform.

---

### 1. `frontend`

| Property | Value |
|---|---|
| **Container** | `nitte-frontend` |
| **Port** | `5173` |
| **Tech** | React (Vite) |
| **Build** | `frontend/Dockerfile` |

The **public storefront** — the alumni-facing React SPA where users browse merchandise, manage their cart, place orders, and handle payments via Razorpay. Communicates exclusively with `node-backend` (port 3000).

**Key features:**
- Alumni login via Keycloak OIDC
- Product catalog, cart, checkout
- Order history and tracking
- Razorpay payment integration

---

### 2. `admin-dashboard`

| Property | Value |
|---|---|
| **Container** | `nitte-admin` |
| **Port** | `5174` |
| **Tech** | React (Vite) |
| **Build** | `admin-dashboard/Dockerfile` |

The **internal admin console** — a separate React SPA for shop administrators to manage products, inventory, orders, and user approvals. Also communicates with `node-backend` (port 3000) but requires elevated roles (`admin-internal`).

**Key features:**
- Product CRUD with card-based grid layout
- Order management and status updates
- Alumni registration approval/rejection
- Sales analytics dashboard with charts

---

### 2b. `merchant-portal`

| Property | Value |
|---|---|
| **Container** | `nitte-merchant-portal` |
| **Port** | `5175` |
| **Tech** | React (Vite) + Recharts |
| **Build** | `merchant-portal/Dockerfile` |

The **merchant seller portal** — a dedicated React SPA where merchants manage their products, fulfill orders, and track revenue. Merchants only see their own data (filtered by `merchant_id`).

**Key features:**
- Revenue dashboard with 7-day charts and KPIs
- Product management (CRUD with MinIO image upload)
- Order fulfillment (status: pending → confirmed → shipped → delivered)
- Profile management with profile picture upload
- Low stock alerts and category breakdown

---

### 3. `node-backend`

| Property | Value |
|---|---|
| **Container** | `nitte-backend` |
| **Port** | `3000` |
| **Tech** | Node.js + Express |
| **Build** | `node-backend/Dockerfile` |

The **API gateway and main backend** — an Express.js monolith that serves as the central hub for all client requests. Handles authentication, business logic, and orchestrates calls to downstream services.

**Key responsibilities:**
- REST API for storefront (`/api/v1/products`, `/api/v1/orders`, `/api/v1/cart`)
- REST API for admin operations (`/api/v1/admin/*`)
- Keycloak OIDC integration (token validation, role extraction)
- JWT issuance and validation for session management
- MongoDB data access layer
- Kafka producer for async events (user approved/rejected)
- Payment processing via Razorpay
- CORS and request validation middleware
- Distributed tracing (Jaeger integration)

**Dependencies:** `mongodb`, `keycloak`, `python-service`

---

### 4. `python-service`

| Property | Value |
|---|---|
| **Container** | `nitte-python` |
| **Port** | `8000` |
| **Tech** | Python (Flask / FastAPI) |
| **Build** | `python-service/Dockerfile` |

The **catalog & order microservice** — a Python-based service that owns the product catalog and order domain logic. Called by `node-backend` via HTTP to keep the monolith focused on gateway concerns.

**Key responsibilities:**
- Product catalog management (search, filtering, categories)
- Order processing and status tracking
- Inventory management
- BDD testing suite (`behave` tests in `features/`)

**Dependencies:** `mongodb`

---

### 5. `notification-service`

| Property | Value |
|---|---|
| **Container** | `nitte-notifications` |
| **Port** | `9100` (metrics) |
| **Tech** | Node.js + Kafka consumer |
| **Build** | `notification-service/Dockerfile` |

The **notification router** — consumes Kafka messages and Keycloak events, then dispatches alerts across multiple channels (Slack, email, tickets).

**Key responsibilities:**
- Kafka consumer for `user-approved`, `user-rejected`, `unverified-users` topics
- `POST /api/v1/events` endpoint for direct Keycloak event ingestion
- **Slack alerts** — sends security event notifications to a configured webhook
- **Email alerts** — sends styled HTML security alert emails to admin addresses via SMTP/SendGrid/AWS SES
- **Ticket creation** — creates incident tickets (console fallback or REST endpoint) for high-severity events
- Event severity classification (`high` / `medium`)

**Configuration via `.env`:**
```bash
SLACK_WEBHOOK_URL=...
SMTP_USER=...
SMTP_PASS=...
KEYCLOAK_ADMIN_EMAILS=...
```

**Dependencies:** `kafka`

---

## Data & Identity Services (4)

---

### 6. `mongodb`

| Property | Value |
|---|---|
| **Container** | `nitte-mongodb` |
| **Port** | `27017` |
| **Image** | `mongo:5.0` |

The **primary application database** — stores all business data: products, orders, users, cart state, alumni registrations, and admin records.

**Key details:**
- Initialized with `database/mongo-init.js` (creates collections, indexes, initial app user)
- Authentication enabled (`app_writer` role for app connections)
- Persistent volume: `mongodb_data`

**Used by:** `node-backend`, `python-service`

---

### 7. `mongo-express`

| Property | Value |
|---|---|
| **Container** | `nitte-mongo-express` |
| **Port** | `8083` |
| **Image** | `mongo-express:1.0.0` |

The **web-based MongoDB admin interface** — a lightweight Express.js UI for browsing, querying, and managing MongoDB documents without needing external tools.

**Key features:**
- Browse collections and documents (table/JSON/tree view)
- Run ad-hoc queries with JSON syntax
- Insert, update, delete documents
- View collection statistics and indexes
- Basic authentication (`admin` / `${MONGO_UI_PASSWORD}`)

**Configuration:**
- Connects as `app_writer` user to `nitte_merch` database
- Credentials configured via `.env` `MONGO_UI_PASSWORD`

**Used by:** Developers, administrators (read-write access to MongoDB)

---

### 8. `minio`

| Property | Value |
|---|---|
| **Container** | `nitte-minio` |
| **Ports** | `9000` (S3 API), `9001` (Web Console) |
| **Image** | `minio/minio:latest` |

The **S3-compatible object storage** — self-hosted alternative to AWS S3 for storing product images, user uploads, documents, and backups.

**Key features:**
- S3 API compatible (use AWS SDK with endpoint `http://localhost:9000`)
- Web-based admin console on port 9001
- Pre-signed URL support for secure file access
- Bucket policies and access control
- Automatic bucket creation via `minio-init` container

**Buckets created:**
- `nitte-products` — Product images and thumbnails
- `nitte-users` — User profile photos and documents
- `nitte-backups` — Database dumps and system backups

**Credentials:** `minioadmin` / `${MINIO_ROOT_PASSWORD}`

**Used by:** Backend for image storage, Python service for image processing

---

### 9. `keycloak`

| Property | Value |
|---|---|
| **Container** | `nitte-keycloak` |
| **Port** | `8080` |
| **Image** | `quay.io/keycloak/keycloak:20.0.0` |

The **identity and access management (IAM) provider** — handles all authentication, authorization, SSO, and user management for the entire platform.

**Key features:**
- Custom `nitte-realm` with roles: `admin-internal`, `internal-user`, `keycloak-admin`
- Custom `nitte` dark theme for login/TOTP/admin console
- **Event Listener SPI** (`keycloak-event-listener/`) — Java plugin that captures `LOGIN_ERROR`, `UPDATE_PASSWORD`, `REGISTER`, admin events, etc., and forwards them to the notification service
- OIDC endpoints for SSO (Grafana, Jenkins, Nexus)
- Password grant for storefront login
- File logging to `/opt/keycloak/log/keycloak.log` (scraped by `promtail-keycloak`)

**Used by:** All application services, Grafana, Jenkins, Nexus, observability proxies

---

## Streaming Infrastructure (2)

---

### 8. `zookeeper`

| Property | Value |
|---|---|
| **Container** | `nitte-zookeeper` |
| **Port** | `2181` |
| **Image** | `confluentinc/cp-zookeeper:7.3.0` |

**Apache ZooKeeper** — provides coordination and cluster metadata management for Kafka. Required by Kafka for broker discovery, topic partition leader election, and consumer group coordination.

**Dependency of:** `kafka`

---
com
### 9. `kafka`

| Property | Value |
|---|---|
| **Container** | `nitte-kafka` |
| **Port** | `9092` |
| **Image** | `confluentinc/cp-kafka:7.3.0` |

The **event streaming backbone** — a single-node Kafka broker used for async communication between services.

**Topics:**
| Topic | Producer | Consumer | Purpose |
|---|---|---|---|
| `user-approved` | `node-backend` | `notification-service` | Send approval email to alumni |
| `user-rejected` | `node-backend` | `notification-service` | Send rejection email to alumni |
| `unverified-users` | `node-backend` | `notification-service` | Daily digest of pending approvals |
| `keycloak-events` | *(SPI direct HTTP)* | `notification-service` | Security/admin event alerts |

**Auto-creates topics** on first use.

---

## Observability Stack (8)

A complete **metrics, logs, traces, and alerting** pipeline.

---

### 10. `prometheus`

| Property | Value |
|---|---|
| **Container** | `nitte-prometheus` |
| **Port** | `9090` (via proxy) |
| **Image** | `prom/prometheus:v2.48.0` |

The **metrics collection server** — scrapes time-series metrics from all services and stores them in a local TSDB.

**Configuration:**
- `prometheus/prometheus.yml` — scrape targets, scrape intervals
- `prometheus/rules/` — recording and alerting rules (PromQL)
- Persistent volume: `prometheus_data`

**Access:** Protected behind `oauth2-proxy-prometheus` (requires Keycloak login with `@nitte.ac.in` domain).

---

### 11. `grafana`

| Property | Value |
|---|---|
| **Container** | `nitte-grafana` |
| **Port** | `3001` |
| **Image** | `grafana/grafana:10.2.2` |

The **observability dashboard** — unified visualization for metrics (Prometheus), logs (Loki), and traces (Jaeger).

**Key features:**
- **Keycloak SSO** — generic OAuth2 OIDC integration; role mapping to Grafana roles
- **Pre-provisioned dashboards** — NITTE All Logs, Keycloak Security & Audit, Login Error Events
- **Pre-provisioned datasources** — Prometheus, Loki (via RBAC proxy), Jaeger
- **Pre-provisioned alerting** — contact points (webhook to notification service), alert rules for login failures and brute force
- Unified alerting enabled (`GF_UNIFIED_ALERTING_ENABLED`)

**Role mapping:**
| Keycloak Role | Grafana Role |
|---|---|
| `admin-internal` / `keycloak-admin` | Admin |
| `internal-user` | Editor |
| Default | Viewer |

---

### 12. `loki`

| Property | Value |
|---|---|
| **Container** | `nitte-loki` |
| **Port** | `3100` |
| **Image** | `grafana/loki:2.9.4` |

The **log aggregation database** — stores logs from Promtail scrapers and serves log queries via LogQL.

**Key features:**
- **Multi-tenancy enabled** (`auth_enabled: true`) — supports `default` and `keycloak-admin` tenants
- Ingests from both `promtail` and `promtail-keycloak`
- Queries routed through `loki-rbac-proxy` for role-based access control
- Persistent volume: `loki_data`

---

### 13. `promtail`

| Property | Value |
|---|---|
| **Container** | `nitte-promtail` |
| **Image** | `grafana/promtail:2.9.4` |

The **general log scraper** — reads Docker container stdout/stderr logs from the host and pushes them to Loki's `default` tenant.

**Configuration:** `promtail/promtail-config.yml`
- Scrapes all Docker container logs via Docker socket
- Labels: `service`, `container_name`
- Pushes to `http://loki:3100/loki/api/v1/push`

---

### 14. `promtail-keycloak`

| Property | Value |
|---|---|
| **Container** | `nitte-promtail-keycloak` |
| **Image** | `grafana/promtail:2.9.4` |

The **Keycloak audit log scraper** — tails the Keycloak file log (`/opt/keycloak/log/keycloak.log`) and pushes it to Loki's `default` tenant with regex parsing for structured fields.

**Configuration:** `promtail/promtail-keycloak-config.yml`
- Scrapes file: `/var/log/keycloak/keycloak.log` (mounted from `keycloak_logs` volume)
- Extracts labels: `service`, `level`, `type`, `realmId`
- Pushes to `http://loki:3100/loki/api/v1/push` with `tenant_id: default`

---

### 15. `loki-rbac-proxy`

| Property | Value |
|---|---|
| **Container** | `nitte-loki-rbac-proxy` |
| **Port** | `3200` |
| **Tech** | Node.js (custom proxy) |
| **Build** | `loki-rbac-proxy/Dockerfile` |

The **Loki access control gateway** — sits between Grafana and Loki to enforce tenant-based log access using Keycloak JWT roles.

**How it works:**
1. Receives incoming Loki queries from Grafana
2. Extracts Bearer token from `Authorization` header
3. Verifies JWT against Keycloak JWKS
4. Maps roles to tenants:
   - `keycloak-admin` role → `keycloak-admin` tenant (can see audit logs)
   - Everyone else → `default` tenant (app logs only)
5. Proxies request to `loki:3100` with `X-Scope-OrgID` header set to the resolved tenant
6. Also handles Promtail push traffic with API key auth (`X-Promtail-Api-Key`)

**Environment:**
```bash
KEYCLOAK_JWKS_URL=http://keycloak:8080/realms/nitte-realm/protocol/openid-connect/certs
ADMIN_ROLE=keycloak-admin
DEFAULT_TENANT=default
ADMIN_TENANT=keycloak-admin
PROMTAIL_API_KEY=promtail-loki-secret
```

---

### 16. `jaeger`

| Property | Value |
|---|---|
| **Container** | `nitte-jaeger` |
| **Port** | `16686` (via proxy) |
| **Image** | `jaegertracing/all-in-one:1.52` |

The **distributed tracing backend** — collects, stores, and visualizes distributed traces from all services.

**Key features:**
- All-in-one deployment (collector + query + UI)
- Accepts spans via UDP (port `6831`) and HTTP (port `14268`)
- Zipkin compatibility enabled
- Node backend and Python service auto-instrumented for trace propagation

**Access:** Protected behind `oauth2-proxy-jaeger` (requires Keycloak login).

---

### 17. `alertmanager`

| Property | Value |
|---|---|
| **Container** | `nitte-alertmanager` |
| **Port** | `9093` |
| **Image** | `prom/alertmanager:v0.26.0` |

The **alert routing & notification manager** — receives alert notifications from Prometheus, deduplicates, groups, and routes them to configured receivers.

**Configuration:** `alertmanager/alertmanager.yml`
- Routes alerts to email, Slack, PagerDuty, or custom webhooks
- Supports silencing, inhibition, and grouping

---

## DevOps / CI/CD (2)

---

### 18. `jenkins`

| Property | Value |
|---|---|
| **Container** | `nitte-jenkins` |
| **Port** | `8081` |
| **Build** | `jenkins/Dockerfile` |

The **CI/CD automation server** — builds, tests, and deploys the application pipeline.

**Key features:**
- **Configuration-as-Code (CasC)** — provisioned via `jenkins/casc/jenkins.yaml`
- **Keycloak SSO** — OIDC login for Jenkins UI
- **Docker-in-Docker** — mounts host Docker socket for building images inside pipelines
- **Pipeline jobs** — reads `Jenkinsfile` from the repo
- Pre-configured admin user (`admin` / `admin123`)

**Persistent volume:** `jenkins_data`

---

### 19. `nexus`

| Property | Value |
|---|---|
| **Container** | `nitte-nexus` |
| **Port** | `8082` |
| **Image** | `sonatype/nexus3:latest` |

The **artifact repository manager** — stores Docker images, npm packages, Maven artifacts, and raw files.

**Key features:**
- Docker registry for internal image hosting
- npm / Maven proxy and hosted repositories
- **Keycloak SSO integration** — OIDC realm mapping for repository access
- Initial admin password: `nexus-admin-123`

**Persistent volume:** `nexus_data`

---

## Auth Proxies (2)

These are **OIDC sidecar proxies** that enforce Keycloak authentication before allowing access to Prometheus and Jaeger UIs.

---

### 20. `oauth2-proxy-prometheus`

| Property | Value |
|---|---|
| **Container** | `nitte-proxy-prometheus` |
| **Port** | `9090` |
| **Image** | `quay.io/oauth2-proxy/oauth2-proxy:v7.6.0` |

**OIDC proxy in front of Prometheus** — any request to `http://localhost:9090` is intercepted and redirected to Keycloak for login.

**Requirements:**
- Must login with an email matching `@nitte.ac.in`
- Uses `observability-proxy` Keycloak client
- Session maintained via cookie

**Upstream:** `http://nitte-prometheus:9090`

---

### 21. `oauth2-proxy-jaeger`

| Property | Value |
|---|---|
| **Container** | `nitte-proxy-jaeger` |
| **Port** | `16686` |
| **Image** | `quay.io/oauth2-proxy/oauth2-proxy:v7.6.0` |

**OIDC proxy in front of Jaeger** — same pattern as the Prometheus proxy, but for the Jaeger tracing UI.

**Requirements:**
- Must login with an email matching `@nitte.ac.in`
- Session maintained via separate cookie (`_oauth2_jaeger`)

**Upstream:** `http://nitte-jaeger:16686`

---

## Network & Storage

### `nitte-network`

A single Docker bridge network that all services share. Enables container-to-container DNS resolution by service name (e.g., `node-backend:3000`, `mongodb:27017`, `keycloak:8080`).

### Persistent Volumes

| Volume | Service | Purpose |
|---|---|---|
| `mongodb_data` | `mongodb` | Application database |
| `prometheus_data` | `prometheus` | Time-series metrics |
| `grafana_data` | `grafana` | Dashboards, users, datasources |
| `loki_data` | `loki` | Indexed log chunks |
| `keycloak_logs` | `keycloak` / `promtail-keycloak` | Keycloak file audit logs |
| `jenkins_data` | `jenkins` | Jobs, builds, plugins |
| `nexus_data` | `nexus` | Artifacts, blob stores |

---

## Quick Reference: Ports

| Service | Port | URL | Auth |
|---|---|---|---|
| Frontend (storefront) | `5173` | `http://localhost:5173` | Keycloak OIDC |
| Admin Dashboard | `5174` | `http://localhost:5174` | Keycloak OIDC + `admin-internal` |
| Merchant Portal | `5175` | `http://localhost:5175` | Keycloak OIDC + `merchant-*` |
| Node Backend API | `3000` | `http://localhost:3000` | JWT (Keycloak-derived) |
| Python Service | `8000` | `http://localhost:8000` | Internal only |
| Keycloak | `8080` | `http://localhost:8080` | Admin: `admin` / `admin` |
| Grafana | `3001` | `http://localhost:3001` | Keycloak SSO |
| Prometheus | `9090` | `http://localhost:9090` | Keycloak via proxy |
| Jaeger | `16686` | `http://localhost:16686` | Keycloak via proxy |
| Alertmanager | `9093` | `http://localhost:9093` | None |
| Jenkins | `8081` | `http://localhost:8081` | Keycloak SSO |
| Nexus | `8082` | `http://localhost:8082` | Keycloak SSO |
| MinIO Console | `9001` | `http://localhost:9001` | `minioadmin` / password |
| MinIO S3 API | `9000` | `localhost:9000` | S3-compatible |
| MongoDB | `27017` | `localhost:27017` | `app_writer` / `app_writer_pass` |
| MongoDB UI | `8083` | `http://localhost:8083` | Basic auth: `admin` / password |
| Kafka | `9092` | `localhost:9092` | PLAINTEXT |
| ZooKeeper | `2181` | `localhost:2181` | None |
| Loki | `3100` | `localhost:3100` | Internal only |
| Loki RBAC Proxy | `3200` | `localhost:3200` | Internal only |
| Notification Service | `9100` | `http://localhost:9100` | Internal only |

---

## Architecture Diagram (Logical)

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   frontend      │  │ admin-dashboard │  │ merchant-portal │
│   (port 5173)   │  │   (port 5174)   │  │   (port 5175)   │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │ HTTP / REST
                              ▼
                    ┌─────────────────────┐
                    │    node-backend     │
                    │     (port 3000)     │
                    │  API Gateway + Auth │
                    └─────────┬───────────┘
                  │
      ┌───────────┼───────────┐
      │           │           │
      ▼           ▼           ▼
┌──────────┐ ┌───────────┐ ┌────────┐ ┌─────────────┐
│ mongodb  │ │mongo-expr │ │ minio  │ │python-service│
│(27017)   │ │ess (8083) │ │(9000¹) │ │  (port 8000) │
└────┬─────┘ └───────────┘ └────┬───┘ └─────────────┘
     │                          │
     │                          ▼
     │                  ┌─────────────────────┐
     │                  │ notification-service│
     │                  │    (port 9100)      │
     │                  │  Slack · Email ·    │
     │                  │  Tickets            │
     │                  └─────────────────────┘
     │
     ▼
┌─────────────────────────────────────┐
│            keycloak                 │
│        (port 8080)                  │
│ Identity · SSO · Event Listener SPI │
└─────────────────────────────────────┘
                  │
                  │ Events
                  ▼
      ┌─────────────────────┐
      │  promtail-keycloak  │────► Loki (default tenant)
      │  (audit log scraper)│
      └─────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                    OBSERVABILITY STACK                   │
├──────────────────────────────────────────────────────────┤
│  prometheus ──► alertmanager ──► (email / slack / etc.)  │
│       │                                                  │
│       ▼                                                  │
│  grafana ◄── loki-rbac-proxy ◄── loki ◄── promtail       │
│  (port 3001)         (port 3200)      (port 3100)        │
│       │                                                  │
│       └──── jaeger (via oauth2-proxy-jaeger)             │
│            (port 16686)                                  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                    DEVOPS / CI/CD                        │
├──────────────────────────────────────────────────────────┤
│  jenkins (port 8081) ──► builds, tests, deploys          │
│  nexus   (port 8082) ──► artifact & docker registry      │
└──────────────────────────────────────────────────────────┘
```
