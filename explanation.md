# NITTE Alumni Merchandise Shop — Complete Technical Guide

## What Is This Project?
This is a **full-stack e-commerce web application** built specifically for NITTE university alumni. Alumni register with their university credentials, wait for admin approval, then browse and purchase exclusive merchandise (apparel, stationery, collectibles). The entire stack is containerized with Docker Compose and includes enterprise-grade observability (metrics, logs, distributed tracing) and security (Keycloak identity management).

## Architecture Overview
The application runs as **16 Docker containers** on a private bridge network (`nitte-network`). Each container is a microservice with a single responsibility. Here is the complete service map:

| Service | Technology | Port | Responsibility |
|---------|-----------|------|---------------|
| **Frontend** | React 18 + Vite | 5173 | Alumni storefront — products, cart, checkout, profile |
| **Admin Dashboard** | React 18 + Vite | 5174 | Operations console — user approvals, product CRUD, orders, metrics, traces |
| **Node Backend** | Node.js + Express | 3000 | Central REST API — auth, business logic, DB access, Keycloak/Kafka integration |
| **Python Service** | Python (FastAPI/Flask) | 8000 | Auxiliary processing — analytics, reports, data crunching |
| **Notification Service** | Node.js | internal | Kafka consumer — sends email/SMS when users are approved/rejected |
| **MongoDB** | MongoDB 5.0 | 27017 | Primary document database — users, products, orders |
| **Keycloak** | Keycloak 20.0.0 | 8080 | Identity & Access Management (IAM) — passwords, JWT tokens, roles |
| **Kafka** | Apache Kafka 7.3.0 | 9092 | Event streaming bus — `user.registered`, `user.approved`, `user.rejected` |
| **Zookeeper** | Zookeeper 7.3.0 | 2181 | Kafka coordinator — manages broker metadata and leader election |
| **Prometheus** | Prometheus v2.48.0 | 9090 | Time-series metrics DB — scrapes `/metrics` endpoints every 15s |
| **Grafana** | Grafana 10.2.2 | 3001 | Visualization — dashboards from Prometheus metrics and Loki logs |
| **Jaeger** | Jaeger 1.52 | 16686 | Distributed tracing — tracks a single request across all services |
| **Loki** | Grafana Loki 2.9.4 | 3100 | Log aggregation DB — stores container logs queryably |
| **Promtail** | Grafana Promtail 2.9.4 | internal | Log shipper — reads Docker logs and pushes them into Loki |
| **Jenkins** | Jenkins LTS JDK17 | 8081 | CI/CD server — build pipelines, automated deployments |
| **Nexus** | Sonatype Nexus 3.68.1 | 8082 | Artifact repository — Docker images, npm packages, Maven artifacts |

## Deep Dive: Every Service Explained

### 1. Frontend (Alumni Storefront)
**Tech**: React 18, Vite, Tailwind CSS, Lucide React, Axios. This is the SPA alumni interact with. Pages: Landing (marketing + auth), Products (catalog grid), Cart (checkout), Orders (history), Profile (account details). Stores JWT in `localStorage` and sends `Authorization: Bearer <token>` on every API call. Has dark mode via Tailwind `dark:` classes.

### 2. Admin Dashboard (Operations Console)
**Tech**: React 18, Vite, Tailwind, Recharts, Lucide React. The back-office tool. Tabs: Dashboard (KPIs + recent orders), Users (verification queue — the heart of the app), Products (CRUD), Orders (all orders), Metrics (Recharts graphs with light/dark palettes), Traces (Jaeger integration). Only users with `admin` role in their JWT can access.

### 3. Node Backend (API Brain)
**Tech**: Node.js, Express, Mongoose, KafkaJS, jsonwebtoken, bcryptjs. The central REST API. It alone talks to MongoDB, Keycloak, and Kafka. Handles: auth (signup/login via Keycloak), user approval/rejection, product CRUD, order creation, metrics/traces endpoints, Kafka event publishing. Middleware: `requestLogger`, `authMiddleware` (tries local JWT then Keycloak RS256 verification), `adminMiddleware`, `alumniMiddleware`, `merchantMiddleware`, `errorHandler`.

### 4. Python Service
**Tech**: Python (FastAPI/Flask). Port 8000. Auxiliary microservice for tasks better suited to Python — analytics, reports, data processing. Node Backend calls it via HTTP when needed. Also connects directly to MongoDB.

### 5. Notification Service
**Tech**: Node.js, KafkaJS, email/SMS libraries. Port 9100 (metrics). A background Kafka consumer. No public API. Listens to `user.registered`, `user.approved`, `user.rejected` topics and sends emails/SMS to users. This is **event-driven architecture** — the backend publishes events and forgets; this service handles delivery asynchronously.

### 6. MongoDB
**Tech**: MongoDB 5.0 (NoSQL document DB). Port 27017. Stores JSON-like documents in collections:
- `userverifications` — signup records (pending/approved/rejected)
- `products` — merchandise (name, price, stock, category, image)
- `orders` — purchase records (user, items array, total, status)
The backend uses Mongoose (ODM) to map JS objects to MongoDB documents.

### 7. Keycloak (Identity & Access Management)
**Tech**: Keycloak 20.0.0. Port 8080. The security guard. Stores passwords securely (never in app DB). Issues signed JWT tokens on login. Manages roles (`admin`, `alumni`, `merchant`). Uses **RS256** (asymmetric crypto) — signs with a private key, publishes a public JWKS endpoint so the backend can verify tokens without knowing the secret.

Key concepts:
- **Realm (`nitte-realm`)**: A container for this app's users, roles, and clients.
- **Client (`nitte-client`)**: The backend app registered in the realm. Uses a **service account** (client ID + secret) to perform admin operations like creating/enabling users.
- **Demo users** (auto-seeded from `nitte-realm.json`):
  - `admin@nitte.edu` / `admin@123` → `admin`
  - `alumni@nitte.edu` / `alumni@123` → `alumni`
  - `merchant@nitte.edu` / `merchant@123` → `merchant`

### 8. Kafka + Zookeeper (Event Streaming)
**Tech**: Apache Kafka 7.3.0 + Zookeeper 7.3.0. Port 9092 (Kafka), 2181 (Zookeeper). Kafka is the message bus. The backend publishes events to topics. The Notification Service consumes them. This **decouples** services — if the notification service is down, Kafka holds messages until it recovers. Zookeeper manages Kafka broker metadata and leader election.

### 9. Prometheus (Metrics)
**Tech**: Prometheus v2.48.0. Port 9090. A time-series database. Scrapes `/metrics` from services every 15s. Stores request counts, latency, error rates, resource usage. Query language: PromQL.

### 10. Grafana (Visualization)
**Tech**: Grafana 10.2.2. Port 3001. Reads from Prometheus (metrics) and Loki (logs) and draws dashboards. Pre-configured with data sources. Lets admins see live system health in color-coded graphs.

### 11. Jaeger (Distributed Tracing)
**Tech**: Jaeger 1.52. Port 16686. Tracks a single request across multiple services. Example: "Place Order" touches Frontend → Backend → MongoDB → Kafka → Notification Service. Jaeger assigns a **trace ID** and records time spent in each **span**. The Admin Dashboard's Traces tab queries Jaeger's API to show these.

### 12. Loki + Promtail (Log Aggregation)
**Tech**: Grafana Loki 2.9.4 + Promtail 2.9.4. Port 3100 (Loki). **Promtail** reads Docker container logs from the host filesystem and pushes them to **Loki** with labels (service name, log level). **Grafana** queries Loki so you search all logs in one place instead of running `docker logs` per container.

---

## End-to-End Data Flow

### 1. Signup
1. Alumni fills signup form on Frontend.
2. Frontend sends `POST /api/v1/auth/signup` to Node Backend.
3. Backend: creates `pending` MongoDB record; creates disabled Keycloak user (`enabled: false`); publishes `user.registered` to Kafka.
4. Notification Service (listening) sends a welcome/pending email.

### 2. Admin Review
1. Admin logs into Admin Dashboard via Keycloak.
2. Goes to Users tab. Dashboard fetches pending users from `GET /api/v1/admin/users/unverified`.
3. Admin clicks "Approve."
4. Dashboard sends `POST /api/v1/admin/users/:id/approve`.
5. Backend: updates MongoDB to `approved`; enables Keycloak user and assigns `alumni` role; publishes `user.approved` to Kafka.
6. Notification Service sends an approval email.

### 3. Login & Shopping
1. Approved alumni logs in on Frontend.
2. Frontend sends `POST /api/v1/auth/login`.
3. Backend forwards credentials to Keycloak via Direct Grant flow.
4. Keycloak returns signed **access token** + **refresh token**.
5. Backend forwards tokens to Frontend.
6. Frontend stores access token in `localStorage`.
7. Alumni browses products, adds to cart, places order. Every request sends `Authorization: Bearer <token>`.
8. Backend's `authMiddleware` verifies the RS256 signature against Keycloak's public JWKS key. Extracts user ID and roles. Allows or denies the request.

---

## Security Deep Dive

### JWT Verification (RS256)
Keycloak signs tokens with a private key. The backend fetches the **public key** from Keycloak's JWKS endpoint at `http://keycloak:8080/realms/nitte-realm/protocol/openid-connect/certs`. It uses this public key to cryptographically verify the token was signed by Keycloak and was not tampered with. The backend never knows the private key.

### Role-Based Access Control (RBAC)
Roles live inside the JWT's `realm_access.roles` claim, split into **external** and **internal** user hierarchies:

**External Users (Alumni/Merchant Portal):**
- `admin` — full external access (user approvals, product CRUD, all orders, metrics/traces)
- `alumni` — standard user (browse, cart, checkout, own orders)
- `merchant` — inventory management and order viewing for their products
- `merchant-amazon` — third-party merchant (Amazon integration)
- `merchant-flipkart` — third-party merchant (Flipkart integration)

**Internal Users (nitte.ac.in domain - DevOps Access):**
- `admin-internal` — full DevOps access (Jenkins Admin, Nexus Admin, Keycloak Admin, 2FA required)
- `internal-user` — limited DevOps access (Jenkins viewer, Grafana read-only, Jaeger, Loki)
- `nexus-admin` — artifact repository administrator (can create repositories)
- `nexus-developer` — artifact repository developer (read/write)

Middleware extracts these roles and enforces per-endpoint rules. Non-admin users hitting admin routes get HTTP 403 Forbidden. Internal users cannot access external admin functions and vice versa.

### Token Storage
- **Access token** (short-lived, ~5-15 min) and **refresh token** stored in browser `localStorage`.
- Production tip: move to `httpOnly` cookies for XSS protection.

---

## Monitoring & Observability (The Three Pillars)

### Metrics (Prometheus + Grafana)
Prometheus scrapes `/metrics` from the Node Backend. Stores request counts, latencies, error rates. Grafana visualizes them as live dashboards.

### Logs (Loki + Promtail + Grafana)
Promtail reads Docker logs. Loki indexes them with labels. Grafana queries Loki. Example search: `{job="node-backend"} |= "error"` finds all backend error logs.

All logs include the **Keycloak Subject ID** (immutable identity) for correlation across services. See `keycloakSubjectId` field in structured logs.

### Traces (Jaeger)
Each HTTP request gets a trace ID. Spans capture DB queries, Keycloak calls, Kafka publishes. Jaeger UI shows waterfall diagrams of where time is spent per request.

Traces carry the **Keycloak Subject ID** as baggage, enabling persistent identity correlation across distributed services. Tags: `keycloak.subject_id`, `keycloak.user_email`, `keycloak.user_roles`.

---

## Key Backend API Endpoints

| Method | Endpoint | Auth | Role | Purpose |
|--------|----------|------|------|---------|
| `POST` | `/api/v1/auth/signup` | No | — | Alumni signup (pending) |
| `POST` | `/api/v1/auth/login` | No | — | Login via Keycloak Direct Grant |
| `GET` | `/api/v1/products` | Yes | alumni+ | List products |
| `POST` | `/api/v1/orders` | Yes | alumni+ | Place order |
| `GET` | `/api/v1/orders/my` | Yes | alumni+ | Own order history |
| `GET` | `/api/v1/admin/users/unverified` | Yes | admin | Pending users |
| `POST` | `/api/v1/admin/users/:id/approve` | Yes | admin | Approve user |
| `POST` | `/api/v1/admin/users/:id/reject` | Yes | admin | Reject user |
| `GET` | `/api/v1/admin/products` | Yes | admin | All products |
| `POST` | `/api/v1/admin/products` | Yes | admin | Create product |
| `PUT` | `/api/v1/admin/products/:id` | Yes | admin | Update product |
| `DELETE` | `/api/v1/admin/products/:id` | Yes | admin | Delete product |
| `GET` | `/api/v1/admin/orders` | Yes | admin | All orders |
| `GET` | `/api/v1/admin/metrics` | Yes | admin | Business metrics |
| `GET` | `/api/v1/admin/traces` | Yes | admin | Jaeger traces |
| `GET` | `/metrics` | No | — | Prometheus scrape endpoint |

---

## Internal vs External User Separation

The system enforces strict separation between **external users** (alumni, merchants) and **internal users** (NITTE staff):

### External User Flow
```
alumni@example.com → Keycloak → JWT (roles: alumni) → Frontend/Admin Portal
```
- Alumni register via public signup
- Admin approval required before access
- Access limited to storefront and own data

### Internal User Flow
```
internal-user@nitte.ac.in → Keycloak → JWT (roles: admin-internal) → Jenkins/Nexus/Keycloak Admin
                                       → JWT (roles: internal-user) → Jenkins (viewer), Grafana
```
- Internal users pre-provisioned by IT
- **2FA (TOTP) required** for `admin-internal` role
- Access controlled by email domain (`nitte.ac.in`)

### Persistent Identity Mapping
Every log entry and trace span includes the **Keycloak Subject ID** (`sub` claim) — an immutable UUID assigned at user creation. This enables:
- **Cross-service correlation**: Trace a user's journey across Frontend → Backend → Kafka → Notification Service
- **Audit trails**: Immutable identity for compliance
- **Session tracking**: Link multiple sessions to the same user

Example log structure:
```json
{
  "method": "POST",
  "path": "/api/v1/orders",
  "keycloakSubjectId": "aaa3d063-b03d-4f68-8929-ca6984c3abfb",
  "userEmail": "alumni@nitte.edu",
  "userRoles": ["alumni"],
  "correlationId": "12345-abcde"
}
```

---

## DevOps & CI/CD Integration

### Jenkins (Port 8081) — Keycloak SSO (wired)
Jenkins is configured via **Jenkins Configuration as Code (JCaC)** (`jenkins/casc/jenkins.yaml`) with the **OpenID Connect Authentication Plugin** (`oic-auth`). Login redirects to Keycloak, not a local Jenkins form.

**How the OAuth flow works:**
1. User clicks login → Jenkins redirects browser to `http://localhost:8080/realms/nitte-realm/protocol/openid-connect/auth`
2. User enters Keycloak credentials (+ TOTP for `admin-internal`)
3. Keycloak redirects back to Jenkins with an auth code
4. Jenkins exchanges the code for tokens at `http://keycloak:8080/...` (internal network)
5. User is logged in with their Keycloak identity

**Authorization matrix (configured in JCaC):**
- `internal-admin@nitte.ac.in` → `Overall/Administer` (full Jenkins access)
- All authenticated users → `Overall/Read`, `Job/Read`, `View/Read` (read-only)

**Escape hatch**: `local-admin / LocalAdmin@123` — local fallback if Keycloak is unreachable.

**Key configuration files:**
- `jenkins/Dockerfile` — extends `jenkins/jenkins:lts-jdk17`, pre-installs `oic-auth`, `configuration-as-code`, `matrix-auth` plugins
- `jenkins/casc/jenkins.yaml` — full JCaC config (security realm, auth strategy, system message)
- `keycloak/nitte-realm.json` — `jenkins-client` OIDC client with `redirect_uri: http://localhost:8081/*`

### Nexus Repository (Port 8082) — local credentials (not SSO)
Nexus OSS does not support OIDC natively (Pro edition only). Uses its own local user database.
- **Admin**: `admin / nexus-admin-123`
- Keycloak roles `nexus-admin` and `nexus-developer` are defined for future integration
- Supports Docker, npm, Maven, PyPI repositories

---

## Important Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Defines all 16 services, images, ports, env vars, volumes, network |
| `docker-setup.sh` / `.ps1` | Cross-platform wrapper scripts for Docker Compose commands |
| `keycloak/nitte-realm.json` | Pre-configured realm with users, roles, clients. Auto-imported on first Keycloak boot |
| `node-backend/src/routes/authSimple.js` | Signup + login logic (Keycloak Direct Grant, RS256 verification) |
| `node-backend/src/routes/adminUsers.js` | Approve/reject logic, Keycloak user enable/disable |
| `node-backend/src/config/keycloak.js` | Keycloak helpers: createUser, passwordGrant, verifyAccessToken, setUserEnabled |
| `node-backend/src/middleware/index.js` | Auth middleware: local JWT fallback + Keycloak RS256 JWKS verification, RBAC middleware, internal user middleware |
| `node-backend/src/tracing.js` | OpenTelemetry tracing with Keycloak Subject ID baggage |
| `jenkins/Dockerfile` | Custom Jenkins image with oic-auth, casc, matrix-auth plugins pre-installed |
| `jenkins/casc/jenkins.yaml` | JCaC config: Keycloak OIDC security realm + matrix authorization strategy |
| `admin-dashboard/src/components/Users.jsx` | Admin user verification queue UI |
| `frontend/src/components/` | Storefront pages: Landing, Products, Cart, Orders, Profile |

---

## Running the Application

```bash
# Linux / Mac
./docker-setup.sh start

# Windows PowerShell
.\docker-setup.ps1 start
```

**Access URLs:**
- Storefront: `http://localhost:5173`
- Admin Dashboard: `http://localhost:5174`
- API: `http://localhost:3000`
- Keycloak Admin Console: `http://localhost:8080` (login: `admin` / `admin`)
- Grafana: `http://localhost:3001` (login: `admin` / `admin123`)
- Jaeger UI: `http://localhost:16686`
- Prometheus: `http://localhost:9090`

---

## Important Notes

- **Keycloak realm import happens only on first boot.** If you edit `nitte-realm.json`, run `docker compose down -v` to wipe volumes, then start again to re-import.
- **New signups create a disabled Keycloak user.** The admin approval step is the only way to enable them and assign the `alumni` role.
- **In production**, Keycloak runs behind a branded custom domain (e.g., `login.yourapp.com`) with custom CSS theming. End users never see the Keycloak admin console.

