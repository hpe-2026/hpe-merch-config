# Start Here

This project is Docker-only and uses a single setup script.

## Run

```bash
cd /home/languid/Downloads/HPE-stuff
./docker-setup.sh start
```

## Useful commands

```bash
./docker-setup.sh demo
./docker-setup.sh status
./docker-setup.sh logs
./docker-setup.sh stop
./docker-setup.sh clean
```

## Access URLs

- Frontend: <http://localhost:5173>
- Admin dashboard: <http://localhost:5174>
- API: <http://localhost:3000>
- Python service: <http://localhost:8000>
- Keycloak (admin auth only): <http://localhost:8080>

## Important

- Use only `docker-setup.sh` for setup and operations.
