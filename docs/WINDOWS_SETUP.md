# Windows Setup Guide — Fresh Install

Complete instructions to run the NITTE Alumni Merchandise Shop on a fresh Windows system.

---

## Prerequisites

You need two things installed:
1. **Docker Desktop** (runs all 27 containers)
2. **Git for Windows** (includes Git Bash for running the setup script)

---

## Step 1: Install Docker Desktop

1. Download from: https://www.docker.com/products/docker-desktop/
2. Run the installer — accept all defaults
3. **Reboot** when prompted
4. After reboot, open **Docker Desktop** from the Start menu
5. Wait until the whale icon in the system tray stops animating (engine is ready)
6. If prompted to enable WSL 2, click **Yes** and follow the instructions

### Verify Docker is working

Open **PowerShell** (search "PowerShell" in Start menu) and run:

```powershell
docker --version
docker compose version
```

Both should print version numbers. If you get errors, Docker Desktop isn't running.

### Recommended: Increase Docker memory

Docker Desktop → Settings (gear icon) → Resources → Memory → set to **6 GB** minimum (8 GB ideal).

Click **Apply & Restart**.

---

## Step 2: Install Git for Windows

1. Download from: https://git-scm.com/download/win
2. Run the installer with these settings:
   - **Default editor**: Use whatever you prefer (VS Code recommended)
   - **PATH environment**: "Git from the command line and also from 3rd-party software"
   - **Line ending conversions**: "Checkout as-is, commit as-is" ← **IMPORTANT**
   - Everything else: accept defaults
3. After install, open **Git Bash** (search "Git Bash" in Start menu)

### Configure Git (one-time)

In Git Bash, run:

```bash
git config --global core.autocrlf input
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

The `autocrlf input` setting prevents line ending issues that break Docker containers.

---

## Step 3: Clone the Project

In Git Bash:

```bash
cd ~/Desktop
git clone https://github.com/radheshpai87/learning-devops.git
cd learning-devops
```

---

## Step 4: Create the .env file

The project needs a `.env` file for secrets. Create it:

```bash
cp .env.example .env
```

Then edit `.env` (open in Notepad or VS Code) and fill in values:

```
SLACK_WEBHOOK_URL=
SMTP_USER=
SMTP_PASS=
KEYCLOAK_ADMIN_EMAILS=your@email.com
MONGO_UI_PASSWORD=admin123
MINIO_ROOT_PASSWORD=minioadmin123
```

If you don't have Slack/SMTP credentials, leave them blank — notifications will log to console instead.

---

## Step 5: Start the System

In Git Bash (inside the project folder):

```bash
./docker-setup.sh start
```

**First run takes 8–15 minutes** (downloads Docker images, builds services).

You'll see progress output. When it finishes, you'll see a summary table with all service URLs and credentials.

### If it fails on "Keycloak Event Listener"

This step builds a Java plugin. If it fails, run:

```bash
MSYS_NO_PATHCONV=1 ./docker-setup.sh start
```

### If npm install fails

Docker might have DNS issues. Fix by adding DNS to Docker Desktop:

Docker Desktop → Settings → Docker Engine → add this to the JSON:
```json
"dns": ["8.8.8.8", "8.8.4.4"]
```
Click Apply & Restart, then try again.

---

## Step 6: Verify Everything Works

```bash
./docker-setup.sh status
```

You should see 27+ services with green "running" status.

Open these URLs in your browser:

| Service | URL | Login |
|---------|-----|-------|
| Storefront | http://localhost:5173 | alumni@nitte.edu / alumni@123 |
| Admin Console | http://localhost:5174 | admin@nitte.edu / admin@123 |
| Merchant Portal | http://localhost:5175 | merchant-admin@nitte.edu / MerchantAdmin@123 |
| Keycloak | http://localhost:8080 | admin / admin |
| Grafana | http://localhost:3001 | admin / admin123 |
| Jenkins | http://localhost:8081 | internal-admin@nitte.ac.in / InternalAdmin@123 |
| MinIO | http://localhost:9001 | minioadmin / minioadmin123 |

---

## Common Commands

Run these in Git Bash from the project folder:

```bash
./docker-setup.sh start      # Start everything
./docker-setup.sh stop       # Stop (keeps data)
./docker-setup.sh status     # Show all services
./docker-setup.sh logs       # Tail all logs
./docker-setup.sh restart    # Full restart
./docker-setup.sh clean      # Delete everything (DATA LOSS)
```

---

## Troubleshooting

### "Docker daemon is not running"
Open Docker Desktop and wait for it to fully start (whale icon stops animating).

### "Port already in use"
Something else is using a port. In PowerShell:
```powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
taskkill /PID <process_id> /F
```

### Services start slowly
Normal on Windows. Keycloak takes 30–60 seconds. Wait 2 minutes after `./docker-setup.sh start` before trying to log in.

### "Permission denied" on docker-setup.sh
```bash
chmod +x docker-setup.sh
```

### Keycloak login doesn't work
Wait 60 seconds after startup. If still broken:
```bash
docker compose restart keycloak
```

### Grafana shows no logs
```bash
docker compose restart promtail
```

### Products don't show images
The seed script may not have run yet. Check:
```bash
docker logs nitte-seed-products
```
If it shows errors, re-run:
```bash
docker compose rm -f seed-products
docker compose up -d seed-products
```

### Need a completely fresh start
```bash
./docker-setup.sh clean
./docker-setup.sh start
```
This wipes ALL data and re-creates everything from scratch.

---

## System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| RAM | 6 GB free | 8+ GB free |
| Disk | 10 GB | 15 GB |
| OS | Windows 10 (Build 19041+) | Windows 11 |
| Docker Desktop | 4.0+ | Latest |

---

## What's Running (27 containers)

| Category | Services |
|----------|----------|
| **App** | Storefront, Admin Dashboard, Merchant Portal, Node Backend, Python Service, Notification Service |
| **Database** | Mongo Router, Config Server, Shard 1, Shard 2, Backup Service |
| **Storage** | MinIO (S3-compatible) |
| **Identity** | Keycloak |
| **Streaming** | Zookeeper, Kafka |
| **Observability** | Prometheus, Grafana, Loki, Promtail (×2), Jaeger, Alertmanager |
| **DevOps** | Jenkins, Nexus |
| **Auth Proxies** | Prometheus Proxy, Jaeger Proxy, Loki RBAC Proxy |
