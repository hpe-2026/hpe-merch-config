# LLM Guide to This Repository

Purpose
-------
This document is written for other LLMs (and humans) to understand this repository: its architecture, components, how to run and test it, where to find configuration and secrets, how observability is wired, and recommended prompts and analysis strategies. Use this as the single-entry reference when building knowledge graphs, writing automation, or answering developer questions about the codebase.

High-level summary
------------------
- Project type: microservices demo/platform with observability, auth (Keycloak), CI/CD (Jenkins), and Kubernetes manifests.
- Languages and runtimes: Node.js (frontend, admin-dashboard, node-backend), Python (python-service), Java (Keycloak event listener), Docker containers for infra components.
- Orchestration: Docker Compose for local demos; Kubernetes manifests in `k8s/` for cluster deployment.

Top-level folders and important files
-----------------------------------
- `frontend/` — user-facing React-like front-end app. Key files: `src/App.jsx`, `package.json`, `vite.config.js`.
- `admin-dashboard/` — lightweight dashboard UI. Key files: `src/`, `index.html`, `Dockerfile`.
- `node-backend/` — Node.js backend service. Key files: `Dockerfile`, `src/`, `openapi/`, `features/`, `cucumber.js`.
- `python-service/` — Python microservice. Key files: `app/`, `requirements.txt`, `behave.ini` (BDD tests).
- `keycloak/` — Keycloak realm export and bootstrap scripts (e.g. `nitte-realm.json`, `keycloak-bootstrap.sh`).
- `keycloak-event-listener/` — Java app/listener to process Keycloak events; has `pom.xml` and `src/`.
- `k8s/` — Kubernetes manifests for all services (e.g., `frontend.yaml`, `node-backend.yaml`, `prometheus.yaml`).
- `docker-compose.yml` — local compose stack definition.
- `prometheus/`, `grafana/`, `alertmanager/`, `loki/`, `promtail/` — observability and logging configs.
- `jenkins/` and `Jenkinsfile` — CI pipeline and container for Jenkins.
- `docs/` — documentation and guides; contains `QUICK_START.md`, API docs, BDD explanation, etc.

Architecture and data flows
--------------------------
- Auth: Keycloak provides identity and RBAC; realms and clients are defined under `keycloak/`.
- API traffic: `frontend` and `admin-dashboard` call `node-backend` and `notification-service`.
- Messaging and events: Kafka may be present (see `k8s/kafka.yaml`) for pub/sub flows or event streaming between services.
- Persistence: MongoDB is used for app data (`database/` contains init scripts). Some services may use other persistence via PVCs defined in `k8s/pvcs.yaml`.
- Observability: Services expose Prometheus metrics; logs are shipped to Loki through Promtail; dashboards live in Grafana provisioning config.
- CI/CD: `Jenkinsfile` and `jenkins/` folder contain pipeline config to build images and deploy.

How to run locally (quick)
--------------------------
Prerequisites: Docker, docker-compose, (optional) Kubernetes or Minikube/kind.

Docker Compose (local demo)

1. Inspect `docker-compose.yml` for environment overrides and ports.
2. Run:

```bash
./docker-setup.sh    # helper (if included) to pull images or prepare env
docker-compose up --build
```

3. Visit expected ports (see `docker-compose.yml`): frontend, Grafana, Keycloak, etc.

Kubernetes (cluster)

1. Use the manifests under `k8s/`. They are mostly ready to apply but may require secret values.
2. Example:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/pvcs.yaml
kubectl apply -f k8s/ --recursive
```

3. Verify pods and services: `kubectl get pods,svc -n <namespace>`.

Building individual services
----------------------------
- `node-backend`: Dockerfile present at `node-backend/Dockerfile`; build locally with `docker build -t node-backend:local node-backend/` then run with env vars described later.
- `frontend` and `admin-dashboard`: typical Node/Vite apps; `npm install` then `npm run build`.
- `python-service`: build image with `docker build -t python-service:local python-service/`.
- `keycloak-event-listener`: build with Maven (`mvn package`) or use provided `build.sh`.

Environment variables and configuration
-------------------------------------
LLMs should parse environment variables in Dockerfiles, compose files, and k8s manifests to assemble a canonical config list. Key env groups:

- Keycloak: client IDs, realm, admin username/password (often provided as Kubernetes Secrets or in `keycloak/` scripts).
- MongoDB: `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`, DB names.
- Prometheus/Grafana: datasource URLs and provisioning files in `grafana/provisioning/`.
- Service-specific: check `node-backend/src/config/`, `frontend/src/config/`, `notification-service/`.

Look for these files to extract runtime config:

- `docker-compose.yml`
- `k8s/*.yaml`
- `*.env` files (if present)
- `*/config/*.js` or `*/src/config/`

Tests and BDD
-------------
- BDD features live under `docs/bdd/features` and service `features/` subfolders.
- Node-based tests and Cucumber config are in `node-backend/features` and `cucumber.js`.
- Python BDD tests use `behave` with configuration in `python-service/behave.ini`.

Observability and monitoring
----------------------------
- Prometheus: `prometheus/prometheus.yml` and `k8s/prometheus.yaml` define scraping targets.
- Alertmanager: `alertmanager/alertmanager.yml` and `k8s/alertmanager.yaml` configure alerting rules and receivers.
- Grafana: dashboards and datasources are in `grafana/provisioning/dashboards` and `datasources`.
- Logging: Loki config at `loki/loki-config.yml` and Promtail configs in `promtail/`.
- Tracing: Jaeger manifest `k8s/jaeger.yaml` — services may be instrumented with OpenTelemetry.

CI/CD and release notes
-----------------------
- Jenkins: `Jenkinsfile` contains pipeline stages; `jenkins/` holds container and plugin config.
- Image registry: check `docker-compose.yml` and `k8s/` manifests for image names and tag conventions.

Secrets and credential handling
------------------------------
- Secrets should not live in plaintext in the repo. Look for `secrets.yaml` in `k8s/` — this may be a placeholder.
- `keycloak-bootstrap.sh` and `database/mongo-init.js` may temporarily contain credentials for local setup — treat as dev/test only.

Where to find important entrypoints
----------------------------------
- Backend API routes: `node-backend/src/` — search for `express`, `app.listen()`, or route definitions.
- Frontend entry: `frontend/src/main.jsx` or `admin-dashboard/src/main.jsx`.
- Kubernetes entrypoints: `k8s/*.yaml` and `k8s/node-backend.yaml` for service/container args.

LLM analysis strategy (how to read this repo)
--------------------------------------------
1. Extract metadata: languages, runtimes, dockerfiles, compose, and k8s manifests.
2. Identify services and map inbound/outbound connections (which service talks to which).
3. Locate configuration sources and secrets; build a list of environment variables per service.
4. Find tests (unit/integration/BDD) and how to run them.
5. Determine observability hooks: metrics endpoints, log shippers, tracing initialization.
6. Identify CI steps in `Jenkinsfile` — build -> test -> push -> deploy.

Recommended parsing heuristics for LLMs
-------------------------------------
- Prefer static analysis of Dockerfiles, `package.json`, `requirements.txt`, and `pom.xml` for dependency lists.
- Parse YAML in `k8s/` and `docker-compose.yml` for runtime environment, ports, and volume mounts.
- Follow imports/requires in major services to find internal modules and responsibilities (e.g., `src/config`, `src/routes`).
- Search for keywords: `metrics`, `prometheus`, `otel`, `jaeger`, `loki`, `mongodb`, `kafka`, `keycloak`, `admin`.

Example prompts and tasks for LLMs
--------------------------------
- "List all runtime environment variables for `node-backend` and their default sources (compose/k8s/config files)."
- "Generate a dependency graph showing which services call which other services, based on static code analysis of imports and k8s manifests."
- "Produce a short README for contributors explaining how to run the entire stack locally with Docker Compose."
- "Identify potential secrets accidentally checked into the repo (search for `password`, `secret`, `KEYCLOAK`, `MONGO`)."

Troubleshooting checklist
-------------------------
- If pods fail to start: `kubectl describe pod <pod>` and `kubectl logs <pod>`.
- If services can't reach Keycloak: verify Keycloak URL and client credentials in service configs.
- If metrics aren't scraped: ensure services expose `/metrics` and Prometheus scrape configs include the target.

Contributing guidelines and next steps
-------------------------------------
- Authors should add/update `docs/QUICK_START.md` with any local-run changes.
- Add minimal reproducible examples for failing tests under `tests/` or service-level feature folders.
- Maintain secrets out of repo; prefer `k8s/` `Secret` manifests templated via a secure pipeline.

Appendix: quick file references
------------------------------
- Compose: `docker-compose.yml`
- Kubernetes: `k8s/`
- Backend: `node-backend/`
- Frontend: `frontend/` and `admin-dashboard/`
- Keycloak exports and bootstrap: `keycloak/`
- Observability configs: `prometheus/`, `grafana/`, `loki/`, `promtail/`
- CI: `Jenkinsfile`, `jenkins/`

If you are an LLM building an agent for this repository
------------------------------------------------------
- Start by loading this file and then build an index of: file paths, Dockerfiles, k8s manifests, env vars, and package manifests. Use the recommended heuristics above to create a knowledge graph. When in doubt, run the `search` flow: find `app.listen`/`main`/`start` patterns to discover service entrypoints.

Contact and follow-up
---------------------
If you'd like, I can also:
- generate a machine-readable manifest (JSON) listing services, ports, and env vars
- extract a full environment variable inventory per service into `docs/env-inventory.md`
- produce a visualization (DOT/GraphML) of service dependencies

End of guide.
