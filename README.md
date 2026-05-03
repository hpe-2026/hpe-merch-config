# NITTE Alumni Merchandise Shop

A full-stack alumni e-commerce platform with full observability, identity, and
event-driven architecture — runnable end-to-end with **one command**.

> **Custom Keycloak theme** — all login pages (including TOTP setup, OTP verify, and the Keycloak admin console) use the branded `nitte` dark theme.

> **One-command setup:** `./docker-setup.sh` (Linux/macOS) or `.\docker-setup.ps1` (Windows)

For a step-by-step demo guide (Windows + Linux), see **[DEMO.md](./DEMO.md)**.

---

## What's inside (19 services)

| Tier | Services |
|---|---|
| **App** | `frontend` (storefront, port 5173) · `admin-dashboard` (admin console, 5174) · `node-backend` (API gateway, 3000) · `python-service` (catalog/orders, 8000) · `notification-service` (Kafka consumer) |
| **Data / Identity** | `mongodb` (27017) · `keycloak` (8080) |
| **Streaming** | `zookeeper` (2181) · `kafka` (9092) |
| **Observability** | `prometheus` · `grafana` (3001) · `loki` (3100) · `promtail` · `jaeger` · `alertmanager` (9093) |
| **DevOps / CI/CD** | `jenkins` (8081) · `nexus` (8082) |
| **Auth Proxies** | `oauth2-proxy-prometheus` (9090) · `oauth2-proxy-jaeger` (16686) |

---

## Prerequisites

- **Docker Desktop** (Windows / macOS) **or** Docker Engine + Compose v2 (Linux)
  with the daemon running
- ~8 GB free RAM (~6 GB minimum), ~12 GB free disk
- Open ports: 3000-3002, 5173-5174, 8000, 8080-8082, 9090, 9092-9093, 16686, 27017

That's it — every other dependency runs in containers.

---

## Quick start

### Linux / macOS / WSL / Git Bash

```bash
chmod +x docker-setup.sh
./docker-setup.sh
```

### Windows PowerShell

```powershell
.\docker-setup.ps1
```

The script will:
1. Verify Docker is installed and running
2. Pull base images sequentially (slow-network friendly)
3. Build and start all 19 services
4. Wait for every container to be running and probe the API health endpoint
5. Print all access URLs and demo credentials

First run takes ~5–10 minutes. Subsequent runs (cached layers): ~30 seconds.

---

## Available commands

| Command | What it does |
|---|---|
| `start` *(default)* | Pull → build → start → verify the full stack |
| `stop` | Stop all containers |
| `restart` | Stop, then start |
| `clean` | Stop **and** delete all volumes (⚠ DATA LOSS, asks confirmation) |
| `status` | Show running containers |
| `logs` | Tail logs from all services |
| `demo` | Run a quick API smoke test + generate sample traffic |
| `help` | Show usage |

```bash
./docker-setup.sh status        # Linux / macOS / WSL
.\docker-setup.ps1 status       # Windows
```

---

## Service URLs (after `start`)

| Service | URL | Notes |
|---|---|---|
| Storefront (alumni) | <http://localhost:5173> | Browse products, cart, orders |
| Admin Console | <http://localhost:5174> | User mgmt, metrics, traces |
| API Gateway | <http://localhost:3000> | REST API entry point |
| Python Service | <http://localhost:8000> | Catalog & order microservice |
| Keycloak | <http://localhost:8080> | Identity provider |
| Jenkins | <http://localhost:8081> | CI/CD server (admin / admin123) |
| Nexus | <http://localhost:8082> | Artifact repository (admin / nexus-admin-123) |
| Prometheus | <http://localhost:9090> | Metrics — **Keycloak SSO required** (`@nitte.ac.in`) |
| Grafana | <http://localhost:3001> | Dashboards — Keycloak SSO or `admin / admin123` |
| Alertmanager | <http://localhost:9093> | Alert routing UI |
| Loki | <http://localhost:3100> | Log aggregation API |
| Jaeger | <http://localhost:16686> | Tracing — **Keycloak SSO required** (`@nitte.ac.in`) |

---

## Demo credentials

### External Users (Alumni/Admin Portal)
| Role | Username | Password |
|---|---|---|
| Site Admin | `admin@nitte.edu` | `admin@123` — **2FA (TOTP) required** |
| Alumni | `alumni@nitte.edu` | `alumni@123` |
| Merchant | `merchant@nitte.edu` | `merchant@123` — **2FA (TOTP) required** |
| Amazon Merchant | `amazon-merchant@amazon.com` | `Amazon@123` — **2FA (TOTP) required** |
| Flipkart Merchant | `flipkart-merchant@flipkart.com` | `Flipkart@123` — **2FA (TOTP) required** |

### Internal Users (nitte.ac.in Domain)
| Role | Username | Password | Access |
|---|---|---|---|
| Internal Admin | `internal-admin@nitte.ac.in` | `InternalAdmin@123` | Jenkins, Nexus Admin, Keycloak Admin, Prometheus, Jaeger — **2FA (TOTP) required** |
| Internal User | `internal-user@nitte.ac.in` | `InternalUser@123` | Jenkins (viewer), Grafana (editor), Jaeger, Loki |

### Infrastructure
| Service | Username | Password |
|---|---|---|
| Keycloak admin UI | `admin` | `admin` |
| Grafana | `admin` | `admin123` |
| Jenkins | `admin` | `admin123` |
| Nexus | `admin` | `nexus-admin-123` |

Additional spec users exist for Keycloak demos — see [keycloak/KEYCLOAK_DEMO.md](./keycloak/KEYCLOAK_DEMO.md).

---

## Authentication architecture

- **Storefront / Admin login** → backend `/api/v1/auth/*` → Keycloak OIDC password grant → JWT
- **Service-to-service** → Keycloak `client_credentials` flow → JWT with `mongo_writer` role
- **Jenkins / Grafana SSO** → Keycloak OIDC authorization code flow → role-mapped access
- **Prometheus / Jaeger** → `oauth2-proxy` (OIDC) → Keycloak login required → `@nitte.ac.in` only
- All JWTs include `sub`, `preferred_username`, `realm_access.roles`
- **Custom theme**: all Keycloak login pages use the `nitte` dark theme (login, TOTP setup, OTP verify, admin console)

See **[keycloak/KEYCLOAK_DEMO.md](./keycloak/KEYCLOAK_DEMO.md)** for the full
realm structure, role map, and copy-pastable token tests.

---

## Documentation

| File | Purpose |
|---|---|
| **[DEMO.md](./DEMO.md)** | Step-by-step demo runbook (Windows + Linux) |
| **[keycloak/KEYCLOAK_DEMO.md](./keycloak/KEYCLOAK_DEMO.md)** | Keycloak realm, roles, JWT samples |
| [docs/QUICK_START.md](./docs/QUICK_START.md) | Original quick-start (legacy) |
| [docs/API_DOCUMENTATION.md](./docs/API_DOCUMENTATION.md) | REST API reference |
| [docs/RBAC_POLICY_GUIDE.md](./docs/RBAC_POLICY_GUIDE.md) | Role-based access patterns |
| [docs/WORKFLOWS.md](./docs/WORKFLOWS.md) | End-to-end user flows |

---

## Troubleshooting

**Docker daemon not running**
```
sudo systemctl start docker     # Linux
# or open Docker Desktop         # Windows / macOS
```

**Port already in use**
```bash
sudo lsof -i :3000               # find what owns the port
./docker-setup.sh stop           # stop the stack first
```

**Service stuck or crashing**
```bash
./docker-setup.sh logs           # follow all logs
docker compose logs <service>    # single service
docker compose ps                # see status
```

**Reset everything (clean slate)**
```bash
./docker-setup.sh clean          # removes ALL volumes — type YES to confirm
./docker-setup.sh start
```

---

## License

MIT — see file headers.
