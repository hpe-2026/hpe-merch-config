# Quick Start - Docker Compose Only

This repository supports one runtime mode: Docker Compose.

## 1. Start the stack

```bash
cd /home/languid/Downloads/HPE-stuff
./docker-setup.sh start
```

## 2. Verify core services

```bash
./docker-setup.sh status
curl http://localhost:3000/api/v1/health
curl http://localhost:8000/health
```

## 3. Open applications

- Frontend: <http://localhost:5173>
- Admin dashboard: <http://localhost:5174>
- API gateway: <http://localhost:3000>
- Keycloak (admin only): <http://localhost:8080>

## 4. Logs and stop

```bash
./docker-setup.sh logs
./docker-setup.sh stop
```

## Notes

- Direct local runtime (non-container) is not supported by this quick start.
- Admin authentication uses Keycloak via `/api/v1/admin/auth/*`.
- Alumni/user authentication uses `/api/v1/auth/*`.
