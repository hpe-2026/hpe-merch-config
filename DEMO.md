# NITTE Alumni Merchandise Shop — Demo Guide

Step-by-step walkthrough for running and demonstrating the system.
Works on **Linux**, **macOS**, and **Windows** (Docker Desktop + Git Bash).

---

## Prerequisites

- **Docker Desktop** installed and running
- **Git Bash** (Windows) or any terminal (Linux/macOS)
- ~6 GB free RAM, ~10 GB disk space

---

## Setup (one command)

```bash
chmod +x docker-setup.sh
./docker-setup.sh start
```

First run takes ~8–12 minutes (image downloads). After that, ~45 seconds.

Check status:
```bash
./docker-setup.sh status
```

You should see **24 services** running.

---

## Service URLs

| URL | Service |
|-----|---------|
| http://localhost:5173 | **Storefront** — alumni shopping |
| http://localhost:5174 | **Admin Console** — platform management |
| http://localhost:5175 | **Merchant Portal** — merchant dashboard & orders |
| http://localhost:3000/api/docs | **API Documentation** — Swagger UI |
| http://localhost:8080 | **Keycloak** — identity management |
| http://localhost:8081 | **Jenkins** — CI/CD pipelines |
| http://localhost:8082 | **Nexus** — artifact repository |
| http://localhost:9001 | **MinIO** — S3 object storage |
| http://localhost:3001 | **Grafana** — dashboards |
| http://localhost:9090 | **Prometheus** — metrics (Keycloak SSO) |
| http://localhost:16686 | **Jaeger** — distributed tracing (Keycloak SSO) |
| http://localhost:9093 | **Alertmanager** — alert routing |

---

## Demo Credentials

### Storefront (localhost:5173)
| Role | Email | Password |
|------|-------|----------|
| Platform Admin | admin@nitte.edu | admin@123 |
| Verified Alumni | alumni@nitte.edu | alumni@123 |

### Admin Console (localhost:5174)
| Role | Email | Password |
|------|-------|----------|
| Platform Admin | admin@nitte.edu | admin@123 |

### Merchant Portal (localhost:5175)
| Role | Email | Password |
|------|-------|----------|
| NITTE Merchant | merchant-admin@nitte.edu | MerchantAdmin@123 |

### Jenkins / Prometheus / Jaeger (Keycloak SSO)
| Role | Email | Password |
|------|-------|----------|
| Internal Admin (full access) | internal-admin@nitte.ac.in | InternalAdmin@123 |
| Internal User (read-only) | internal-user@nitte.ac.in | InternalUser@123 |

### Other Services
| Service | User | Password |
|---------|------|----------|
| Keycloak Admin | admin | admin |
| MinIO | minioadmin | minioadmin123 |
| Grafana (local) | admin | admin123 |

---

## Demo Script (~15 minutes)

### 1. Storefront — Shopping Flow (2 min)

1. Open http://localhost:5173
2. Sign in as `alumni@nitte.edu` / `alumni@123`
3. Browse products — images served from MinIO S3 storage
4. Add items to cart → place an order (Razorpay checkout)
5. View order in **Your Orders** — shows status badge

### 2. Admin Console — Management (2 min)

1. Open http://localhost:5174
2. Log in as `admin@nitte.edu` / `admin@123`
3. Walk through:
   - **Dashboard** — KPIs, revenue chart, order status breakdown
   - **Products** — card grid with images, category badges
   - **Orders** — status management with dropdown
   - **Users** — pending approvals queue

### 3. Merchant Portal — Seller Experience (3 min)

1. Open http://localhost:5175
2. Log in as `merchant-admin@nitte.edu` / `MerchantAdmin@123`
3. Show:
   - **Dashboard** — revenue, orders chart, low stock alerts
   - **Products** — same card design as storefront
   - **Orders** — change status (pending → confirmed → shipped)
   - **Profile** — upload profile picture (persists to MinIO)
4. Switch to storefront orders page — status updates reflect in real-time

### 4. User Approval + Kafka Notifications (2 min)

1. Open notification logs:
   ```bash
   docker compose logs -f notification-service
   ```
2. On storefront, create a new account (any email)
3. In admin console → **Users** → approve the pending user
4. Watch terminal — Kafka event triggers email notification log

### 5. Keycloak — Identity & RBAC (2 min)

1. Open http://localhost:8080 → log in as `admin` / `admin`
2. Switch to **nitte-realm**
3. Show: Realm roles, Users, Clients (`nitte-client`)
4. Highlight: roles auto-assigned on approval (`alumni`, `order:create`, etc.)

### 6. Observability (3 min)

**Metrics:**
- Admin console → Metrics tab (live API stats)
- Prometheus: http://localhost:9090 (SSO login with `internal-admin@nitte.ac.in`)

**Logs:**
- Grafana → Explore → Loki datasource
- Query: `{container="nitte-backend"}`

**Tracing:**
- Admin console → Traces tab
- Jaeger: http://localhost:16686 → pick `nitte-backend` service → view span tree

---

## Quick Commands

```bash
./docker-setup.sh start     # Start everything
./docker-setup.sh stop      # Stop (preserves data)
./docker-setup.sh restart   # Full restart
./docker-setup.sh status    # Show all service health
./docker-setup.sh logs      # Tail all logs
./docker-setup.sh demo      # Generate test traffic
./docker-setup.sh clean     # Wipe everything (DATA LOSS)
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Docker daemon not running | Start Docker Desktop |
| Port already in use | `lsof -i :PORT` (Linux) or `Get-NetTCPConnection -LocalPort PORT` (Windows) |
| Service won't start | `docker compose logs <service-name>` |
| Empty data after restart | `./docker-setup.sh clean && ./docker-setup.sh start` |
| Keycloak login loops | `docker compose restart keycloak` |
| Changes not visible | `docker compose up --build -d <service>` + hard refresh (Ctrl+Shift+R) |
