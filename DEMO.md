# NITTE Alumni Merchandise Shop — Full Demo Guide

Plain-English, step-by-step walkthrough for running and demonstrating the
entire system. Works on **Windows** and **Linux/macOS**.

> Read this top-to-bottom once before your first demo. Every command is
> copy-pasteable. Wherever Windows differs from Linux, both options are shown.

---

## Table of contents

1. [What you'll be demonstrating](#1-what-youll-be-demonstrating)
2. [Prerequisites](#2-prerequisites)
3. [First-time setup](#3-first-time-setup)
4. [Verify everything is running](#4-verify-everything-is-running)
5. [The demo script (10–15 min)](#5-the-demo-script-1015-min)
6. [Showing each tool individually](#6-showing-each-tool-individually)
7. [Stopping & cleaning up](#7-stopping--cleaning-up)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. What you'll be demonstrating

A real, working **alumni merchandise e-commerce platform** built with a
microservice architecture. The audience will see:

- Two web apps: a **storefront** (for alumni) and an **admin console** (for staff)
- A REST API backend in **Node.js** that talks to MongoDB and a **Python (FastAPI)** service
- An **event-driven notification service** (Kafka consumer) that "sends" emails when admins approve users
- **Identity & SSO via Keycloak** with realm roles, service accounts, and JWTs
- A complete **observability stack**:
  - **Prometheus** for metrics (protected by Keycloak SSO)
  - **Grafana** for dashboards (Keycloak SSO)
  - **Loki + Promtail** for log aggregation across all containers
  - **Jaeger** for distributed tracing (protected by Keycloak SSO)
  - **oauth2-proxy** gates Prometheus and Jaeger — only `@nitte.ac.in` users can access

Everything runs in Docker. **Nothing else needs to be installed.**

---

## 2. Prerequisites

You need **Docker** running on your machine and a way to run shell scripts.

### 2.1 Hardware

- ~6 GB free RAM
- ~10 GB free disk space
- A working internet connection (only needed during the very first setup, to
  download Docker images)

### 2.2 On Windows

1. **Install Docker Desktop**
   - Download: <https://www.docker.com/products/docker-desktop/>
   - Run the installer, accept defaults
   - Reboot if prompted
   - Open **Docker Desktop** and wait until the whale icon in the system tray
     stops animating — that means the engine is running

2. **Open PowerShell** (search "PowerShell" in the Start menu and click it)

3. **Allow scripts to run** (one-time, only if you've never run a `.ps1` before)
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```
   Press **Y** when prompted.

4. *(Optional)* If you prefer a Linux-like terminal, install **Git for Windows**
   (<https://git-scm.com/download/win>) and use **Git Bash** — then you can run
   the `.sh` script instead.

### 2.3 On Linux / macOS

1. **Install Docker**
   - **Linux**: follow <https://docs.docker.com/engine/install/> for your distro.
     Make sure your user is in the `docker` group:
     ```bash
     sudo usermod -aG docker $USER
     newgrp docker
     ```
   - **macOS**: install **Docker Desktop** from
     <https://www.docker.com/products/docker-desktop/>

2. Confirm Docker is running:
   ```bash
   docker info
   ```
   If you see a long list of details, you're good. If you see an error, start
   Docker (Linux: `sudo systemctl start docker`; macOS: open Docker Desktop).

### 2.4 Get the project

You need this repository on your machine. Either clone it with Git or copy the
folder over:

```bash
git clone <repo-url>
cd HPE-stuff
```

You should now be inside a folder containing `docker-setup.sh`,
`docker-setup.ps1`, `docker-compose.yml`, and a `README.md`.

---

## 3. First-time setup

### 3.1 Linux / macOS / WSL / Git Bash on Windows

Open a terminal in the project folder and run:

```bash
chmod +x docker-setup.sh
./docker-setup.sh
```

### 3.2 Windows PowerShell

Open PowerShell in the project folder (Shift + right-click in File Explorer → "Open in Terminal" / "Open PowerShell window here") and run:

```powershell
.\docker-setup.ps1
```

### 3.3 What the script is doing (so you can narrate during a demo)

1. **Checking prerequisites** — confirms Docker is installed and the daemon is running
2. **Pulling 11 base images sequentially** — MongoDB, Kafka, Keycloak, Jaeger,
   Prometheus, Grafana, Loki, Promtail, Node, Python. Sequential pulls are
   gentler on slow networks.
3. **Building & starting** — runs `docker compose up --build -d`, which:
   - Builds three custom images (`node-backend`, `python-service`,
     `notification-service`, `frontend`, `admin-dashboard`) from local
     Dockerfiles
   - Starts all 16 containers in the background
4. **Waiting for readiness** — polls until every container is reporting
   "running" (90 s max) and the API gateway returns a healthy response
   (60 s more)
5. **Printing the summary** — every URL and credential you'll need

**First time:** ~8–12 minutes. **After that:** ~45 seconds.

---

## 4. Verify everything is running

After the script finishes, check the status:

```bash
./docker-setup.sh status        # Linux / macOS / WSL
.\docker-setup.ps1 status       # Windows
```

You should see **19 containers** all in **Up** state, with names like
`nitte-backend`, `nitte-frontend`, `nitte-admin`, `nitte-mongodb`,
`nitte-keycloak`, `nitte-jenkins`, `nitte-nexus`, `nitte-proxy-prometheus`,
`nitte-proxy-jaeger`, etc.

Open these URLs in your browser to sanity-check:

| URL | What you should see |
|---|---|
| <http://localhost:5173> | Alumni storefront, products listed with images |
| <http://localhost:5174> | Admin console login screen |
| <http://localhost:8080> | Keycloak admin login |
| <http://localhost:8081> | Jenkins CI/CD dashboard |
| <http://localhost:8082> | Nexus repository manager |
| <http://localhost:3001> | Grafana login |
| <http://localhost:9090> | Prometheus — redirects to Keycloak login (use `internal-admin` or `internal-user`) |
| <http://localhost:16686> | Jaeger — redirects to Keycloak login (use `internal-admin` or `internal-user`) |

---

## 5. The demo script (10–15 min)

This is the order I recommend running through if you have ~15 minutes in front
of an audience or mentor.

### Step 1 — Show the storefront (2 min)

1. Open <http://localhost:5173>
2. Click **Sign in** → use `alumni@nitte.edu` / `alumni@123`
3. Browse the product list — point out:
   - Real product images (loaded from Unsplash CDN)
   - Stock counts updating live from the database
4. Add an item to the cart, go to **Cart**, place an order
5. Open **Orders** to see the order you just made

### Step 2 — Show the admin side (2 min)

1. Open <http://localhost:5174> in a new tab
2. Log in as `admin@nitte.edu` / `admin@123`
3. Click through the tabs:
   - **Dashboard** — KPIs (users, orders, revenue)
   - **Users** — pending approvals, approved/rejected sections
   - **Products** — manage catalog
   - **Orders** — see the order you just placed in step 1

### Step 2b — Internal User Access Control (2 min)

1. **Internal Admin Flow**:
   - Open <http://localhost:8081> (Jenkins)
   - Log in as `internal-admin@nitte.ac.in` / `InternalAdmin@123`
   - Note: On first login, Keycloak requires 2FA setup (TOTP)
   - Demonstrate full Jenkins access (create jobs, manage pipelines)

2. **Internal User Flow** (limited access):
   - Open <http://localhost:8081> (Jenkins)
   - Log in as `internal-user@nitte.ac.in` / `InternalUser@123`
   - Show read-only access (can view builds but cannot create jobs)
   - Open Grafana <http://localhost:3001> with same credentials
   - Show observability dashboard access (read-only)

3. **RBAC Enforcement**:
   - Attempt to access Jenkins admin functions as internal-user
   - Show permission denied messages

### Step 3 — Demo notifications (Kafka in action — 2 min)

This proves the event-driven architecture is wired end-to-end.

1. **Open a separate terminal** and tail the notification logs:

   **Linux / macOS / Git Bash**
   ```bash
   docker compose logs -f notification-service
   ```

   **Windows PowerShell**
   ```powershell
   docker compose logs -f notification-service
   ```

   Leave this visible — it will be the punchline.

2. In the storefront, sign up a new alumni:
   - Click **Create account**
   - Fill in any name, email, alumni ID, etc.
   - Submit → you'll see "pending admin approval"

3. Switch to the admin console → **Users → Pending review** → click the green
   tick to approve them.

4. **Watch the terminal**. Within ~1 second you'll see lines like:
   ```
   [info]: Processing user approval notification { user_id: '…', email: '…' }
   [info]: Email sent (console mode) - To: …  Subject: Your account is approved
   ```

   What just happened: the backend published a Kafka message to the
   `user-approved` topic; the notification-service consumed it and sent the
   "email" (console mode for the demo).

### Step 4 — Show Keycloak (3 min)

1. Open <http://localhost:8080> — note the **custom dark `nitte` theme** on the login page
2. Log in as `admin` / (your admin password)
3. In the top-left dropdown, switch to the **nitte-realm**
4. Walk through:
   - **Realm settings** — realm enabled, brute-force protection on
   - **Clients → nitte-client** — confidential, standard flow + service accounts
     enabled, redirect URIs `*`
   - **Clients → nitte-client → Service accounts roles** — `mongo_writer` is
     assigned (proves spec item 9)
   - **Realm roles** — admin, alumni, non_alumni, merchant, mongo_writer, admin-internal, internal-user
   - **Users** — all spec users present
   - **Clients** — `nitte-client`, `jenkins-client`, `grafana-client`, `observability-proxy`
5. Prove the JWT contains the right claims (paste in a terminal):

   ```bash
   curl -s -X POST \
     'http://localhost:8080/realms/nitte-realm/protocol/openid-connect/token' \
     -d 'grant_type=password&client_id=nitte-client&client_secret=nitte-client-secret&username=alumni_user&password=Alumni@123' \
     | python3 -c "import sys,json,base64;t=json.load(sys.stdin)['access_token'];print(json.dumps(json.loads(base64.urlsafe_b64decode(t.split('.')[1]+'==')),indent=2))"
   ```

   On Windows PowerShell use Python or `jq` similarly — full version is in
   `keycloak/KEYCLOAK_DEMO.md`.

### Step 5 — Show observability (3–4 min)

#### Metrics (Prometheus + Grafana)

1. Open the admin console → **Metrics** tab — shows live API request rates,
   latency, errors, and a green status card for every microservice
2. Open <http://localhost:9090> → you'll be redirected to Keycloak login
   - Log in as `internal-admin@nitte.ac.in` / `InternalAdmin@123` (+ TOTP code)
   - After auth, you land on Prometheus with `up` query showing all jobs = 1
3. Open <http://localhost:3001> (Grafana) → click **Sign in with Keycloak**
   - Log in as `internal-admin@nitte.ac.in` → lands as **Grafana Admin**
   - Or `internal-user@nitte.ac.in` → lands as **Grafana Editor**
   - **Explore** → datasource **Prometheus** → query
     `rate(http_requests_total[1m])` to see the live API traffic graph

#### Logs (Loki)

In Grafana → **Explore** → switch datasource to **Loki**:

```logql
{container="nitte-backend"}
{container="nitte-notifications"} |= "approval"
```

Both queries return live log lines. You're showing logs from **all 19
containers** unified into one query language.

#### Tracing (Jaeger)

1. Open <http://localhost:16686> → redirected to Keycloak login
   - Log in as any `@nitte.ac.in` user → lands on Jaeger UI
2. Open the admin console → **Traces** tab
3. Pick the **nitte-backend** service → recent traces show every API call
4. Click a trace → opens Jaeger UI showing the full span tree (HTTP request →
   MongoDB query → response)

### Step 6 — Run the smoke test (30 s)

```bash
./docker-setup.sh demo          # Linux
.\docker-setup.ps1 demo         # Windows
```

It hits the health endpoint and generates 20 requests so the metric/trace
graphs visibly tick up while the audience is watching.

---

## 6. Showing each tool individually

A cheat sheet you can refer to mid-demo:

| Tool | Open | What to highlight |
|---|---|---|
| Storefront | <http://localhost:5173> | Real product imagery, cart, orders, sign-up |
| Admin Console | <http://localhost:5174> | Users → approve → Kafka event |
| Keycloak | <http://localhost:8080> (custom dark theme) | Realms, clients, roles, JWT, TOTP |
| Prometheus | <http://localhost:9090> (Keycloak SSO — `@nitte.ac.in`) | `up`, `rate(http_requests_total[1m])` |
| Grafana | <http://localhost:3001> (Keycloak SSO or admin/admin123) | Loki queries + Prometheus datasource |
| Jaeger | <http://localhost:16686> (Keycloak SSO — `@nitte.ac.in`) | Find traces → span timeline |

---

## 7. Stopping & cleaning up

### Stop the stack (preserves data)

```bash
./docker-setup.sh stop          # Linux
.\docker-setup.ps1 stop         # Windows
```

### Restart from a stopped state

```bash
./docker-setup.sh start         # Linux
.\docker-setup.ps1 start        # Windows
```

### Wipe everything (removes ALL volumes — DATA LOSS)

```bash
./docker-setup.sh clean         # Linux
.\docker-setup.ps1 clean        # Windows
```

You'll be asked to type `YES` to confirm.

---

## 8. Troubleshooting

### "Docker daemon is not running"
- **Windows / macOS**: open **Docker Desktop**, wait for the whale icon
- **Linux**: `sudo systemctl start docker`

### "Port already in use"
Something else is using one of the ports (3000, 3001, 3100, 5173, 5174, 8000,
8080, 9090, 9092, 16686, 27017). Find and stop it:

**Linux / macOS**
```bash
sudo lsof -i :3000
```

**Windows PowerShell**
```powershell
Get-NetTCPConnection -LocalPort 3000
```

### "A service won't come up"

Check its logs:

```bash
docker compose logs <service-name>           # one service
./docker-setup.sh logs                       # everything (Linux)
.\docker-setup.ps1 logs                      # everything (Windows)
```

Common services to inspect: `node-backend`, `keycloak`, `kafka`.

### "Pages load but show errors / empty data"

The MongoDB seed script only runs when the database is first created. If you
need a fresh seed:

```bash
./docker-setup.sh clean        # wipes data
./docker-setup.sh start        # re-seeds
```

### "Notification page shows the service as offline"

The notification-service connects to Kafka — Kafka itself takes ~30–45 seconds
to be fully ready on first boot. Wait a minute and refresh the admin Metrics
page; the green check should appear.

### "Keycloak login redirects in a loop"

Restart Keycloak:

```bash
docker compose restart keycloak
```

Wait ~15 s for it to reload the realm.

### "I changed source code but my changes aren't visible"

Force a rebuild:

```bash
docker compose up --build -d <service-name>
```

For frontend / admin-dashboard, also do a hard browser refresh (`Ctrl + Shift + R`).

---

## Final tips for live demos

1. **Pre-warm the system** 5 minutes before — first-time pulls are slow, but
   subsequent runs are fast. Run `./docker-setup.sh demo` once so metrics and
   traces have data to show.
2. **Have two browser windows side by side** — storefront on the left, admin
   console on the right. Lets you show the cause-and-effect (sign up here,
   approve there).
3. **Have a terminal open with notification logs streaming** — it's a great
   "wow" moment when an approval click triggers a log line in real time.
4. **Use `./docker-setup.sh status` early** to prove all 19 services are up.
   Visual confirmation goes a long way.

Good luck with your demo. If anything breaks, the troubleshooting section
above covers the 95% case — and worst case, `./docker-setup.sh clean &&
./docker-setup.sh start` always gets you back to a working state.
