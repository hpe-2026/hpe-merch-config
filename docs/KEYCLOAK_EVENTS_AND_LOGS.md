# Keycloak Events & Audit Logs Integration

## Overview

This document describes the integration of Keycloak security/admin events with the existing Notification Service and the export of Keycloak audit logs to Loki with RBAC enforcement in Grafana.

## Architecture

```
┌─────────────────┐     HTTP POST      ┌────────────────────────────┐
│   Keycloak      │ ────────────────> │  Notification Service      │
│  (Event SPI)    │                   │  - /api/v1/events          │
└─────────────────┘                   │  - Slack alerts            │
         │                            │  - Email to admins         │
         │                            │  - Ticket creation         │
         │ JSON logs                  └────────────────────────────┘
         v
┌─────────────────┐     file tail      ┌────────────────────────────┐
│ Keycloak log    │ ────────────────> │  Promtail (keycloak-only)  │
│ /opt/keycloak/  │                   │  tenant_id: keycloak-admin │
│    log/*.log    │                   └────────────────────────────┘
└─────────────────┘                            │
                                              v
┌─────────────────┐     file tail      ┌────────────────────────────┐
│ All other pods  │ ────────────────> │  Promtail (default)        │
│ /var/log/pods/* │                   │  tenant_id: default        │
└─────────────────┘                   └────────────────────────────┘
                                              │
                                              v
                                       ┌────────────────────────────┐
                                       │  Loki (multi-tenant)       │
                                       │  auth_enabled: true        │
                                       └────────────────────────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              v                               v
                    ┌─────────────────┐             ┌─────────────────┐
                    │ default tenant  │             │ keycloak-admin  │
                    │ (general logs)  │             │ (audit logs)    │
                    └─────────────────┘             └─────────────────┘
                              │                               │
                              v                               v
                    ┌─────────────────┐             ┌─────────────────┐
                    │ Grafana (all    │             │ Grafana Admin   │
                    │ users)          │             │ (via proxy JWT) │
                    └─────────────────┘             └─────────────────┘
```

## Components

### A) Keycloak Events → Notification Service

#### Keycloak Event Listener SPI
- **File**: `keycloak-event-listener/target/keycloak-event-listener-1.0.0.jar`
- **Source**: `keycloak-event-listener/`
- **Installation**: Mounted into `/opt/keycloak/providers/` and auto-built on startup
- **Events captured**: Security events (`LOGIN_ERROR`, `UPDATE_PASSWORD`, `REGISTER`), admin events (`CREATE`, `UPDATE`, `DELETE` on users/roles/clients)
- **Delivery**: Async HTTP POST to Notification Service with retry and non-blocking behavior
- **Configuration**: Via env vars `NOTIFICATION_SERVICE_URL` and `NOTIFICATION_TIMEOUT_SECONDS`

#### Notification Service Extensions
- **REST Endpoint**: `POST /api/v1/events`
- **Slack Service**: `notification-service/src/services/slackService.js`
- **Ticket Service**: `notification-service/src/services/ticketService.js`
- **Keycloak Handler**: `notification-service/src/services/keycloakEventHandler.js`
- **Behavior**:
  - Security/admin events → Slack alert + admin email + ticket
  - User events → Console logging (when Slack/Email disabled)
  - All modes have graceful fallback to console logging

### B) Keycloak Audit Logs → Loki

#### Log Separation
- **General application logs** → `default` tenant in Loki
- **Keycloak audit logs** → `keycloak-admin` tenant in Loki

#### Promtail Configuration
- **Docker**:
  - `promtail`: Scrapes Docker stdout for all containers EXCEPT keycloak, sends to `default`
  - `promtail-keycloak`: Tails `/var/log/keycloak/*.log` from shared volume, sends to `keycloak-admin`
- **Kubernetes**:
  - DaemonSet `promtail`: Uses `kubernetes_sd_configs`, drops pods with `app=keycloak` label
  - Keycloak pod sidecar: Tails shared `emptyDir` log volume, sends to `keycloak-admin`

#### Structured Labels
- `service=keycloak`
- `type=audit`
- `realm=<realm-name>`
- `eventType=<event-type>`
- `severity=<level>`

### C) RBAC for Keycloak Logs in Grafana/Loki

#### Loki RBAC Proxy
- **Service**: `loki-rbac-proxy` (Node.js/Express, port 3200)
- **Behavior**:
  - Promtail push requests: Validates `X-Promtail-Api-Key`, passes through `X-Scope-OrgID`
  - Grafana query requests without Authorization: Routes to `default` tenant
  - Authenticated requests with Bearer JWT: Validates against Keycloak JWKS, maps `keycloak-admin` role to `keycloak-admin` tenant
- **Grafana Datasource**: Points to `http://loki-rbac-proxy:3200`

#### Role Mapping
- `keycloak-admin` Keycloak role → Grafana `Admin`
- `admin-internal` Keycloak role → Grafana `Admin`
- `internal-user` Keycloak role → Grafana `Editor`
- Default → Grafana `Viewer`

## Environment Variables

### Keycloak
| Variable | Default | Description |
|----------|---------|-------------|
| `NOTIFICATION_SERVICE_URL` | `http://notification-service:9100/api/v1/events` | Notification REST endpoint |
| `NOTIFICATION_TIMEOUT_SECONDS` | `5` | HTTP timeout for event delivery |
| `QUARKUS_LOG_FILE_ENABLE` | `true` | Enable file logging for audit trail |
| `QUARKUS_LOG_FILE_PATH` | `/opt/keycloak/log/keycloak.log` | Audit log file path |

### Notification Service
| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_ENABLED` | `true` | Enable Slack notifications |
| `SLACK_WEBHOOK_URL` | `""` | Slack webhook URL (empty = console fallback) |
| `TICKET_ENABLED` | `true` | Enable ticket creation |
| `TICKET_PROVIDER` | `console` | Ticket backend: `console` or `rest` |
| `TICKET_ENDPOINT` | `""` | REST endpoint for ticket creation |
| `KEYCLOAK_ADMIN_EMAILS` | `internal-admin@nitte.ac.in` | Comma-separated admin emails |

### Loki RBAC Proxy
| Variable | Default | Description |
|----------|---------|-------------|
| `LOKI_URL` | `http://loki:3100` | Upstream Loki URL |
| `ADMIN_ROLE` | `keycloak-admin` | Role that grants access to audit tenant |
| `DEFAULT_TENANT` | `default` | Tenant for non-admin users |
| `ADMIN_TENANT` | `keycloak-admin` | Tenant for admin users |
| `PROMTAIL_API_KEY` | `promtail-loki-secret` | Shared secret for Promtail push |

## Example Payloads

### Keycloak User Event
```json
{
  "eventType": "LOGIN_ERROR",
  "eventCategory": "user",
  "realmId": "nitte-realm",
  "clientId": "nitte-client",
  "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "ipAddress": "192.168.1.100",
  "error": "invalid_user_credentials",
  "details": {
    "auth_method": "openid-connect",
    "redirect_uri": "http://localhost:5173"
  }
}
```

### Keycloak Admin Event
```json
{
  "eventType": "CREATE",
  "eventCategory": "admin",
  "realmId": "nitte-realm",
  "clientId": "grafana-client",
  "userId": "admin-a1b2-c3d4-e5f6-7890abcd",
  "ipAddress": "10.0.0.5",
  "resourceType": "USER",
  "resourcePath": "users/new-user-123",
  "representation": "{\"username\":\"new-user\",\"email\":\"new@nitte.edu\"}",
  "error": ""
}
```

## Validation Steps

### 1. Verify Keycloak Event Listener is Active
```bash
# Docker
docker logs nitte-keycloak | grep -i "nitte-notification-event-listener"

# Kubernetes
kubectl logs -n nitte deployment/keycloak | grep -i "nitte-notification-event-listener"
```

### 2. Trigger a Test Event
```bash
# Attempt a failed login at http://localhost:8080
# Or create a user in the Keycloak admin console
```

### 3. Verify Notification Service Received Event
```bash
# Docker
docker logs nitte-notifications | grep -i "keycloak"

# Kubernetes
kubectl logs -n nitte deployment/notification-service | grep -i "keycloak"
```

### 4. Verify Audit Logs in Loki
```bash
# Query default tenant (general logs)
curl -s "http://localhost:3100/loki/api/v1/query_range?query=%7Bjob%3D%22kubernetes%22%7D"

# Query keycloak-admin tenant (requires proxy or direct with header)
curl -H "X-Scope-OrgID: keycloak-admin" \
  -s "http://localhost:3100/loki/api/v1/query_range?query=%7Bservice%3D%22keycloak%22%7D"
```

### 5. Verify RBAC Proxy
```bash
# Unauthenticated request -> default tenant
curl -s http://localhost:3200/loki/api/v1/label/values?name=service

# Authenticated request with admin token -> keycloak-admin tenant
curl -H "Authorization: Bearer <keycloak-admin-token>" \
  -s http://localhost:3200/loki/api/v1/label/values?name=service
```

### 6. Verify Grafana Integration
- Log into Grafana at `http://localhost:3001` via Keycloak SSO
- As `internal-admin@nitte.ac.in` (keycloak-admin role): Can query keycloak audit logs via proxy
- As `internal-user@nitte.ac.in` (internal-user role): Only sees default tenant logs

## Files Changed

- `keycloak/nitte-realm.json` — Added `keycloak-admin` role, enabled events/admin events
- `keycloak-event-listener/` — New Maven project for Keycloak Event Listener SPI
- `notification-service/src/config.js` — Added Slack, Ticket, keycloakEvents topic config
- `notification-service/src/metricsServer.js` — Added `/api/v1/events` POST endpoint
- `notification-service/src/services/slackService.js` — New Slack webhook service
- `notification-service/src/services/ticketService.js` — New ticket/escalation service
- `notification-service/src/services/keycloakEventHandler.js` — New Keycloak event router
- `notification-service/src/index.js` — Initialize keycloak event handler
- `notification-service/.env.example` — Added new env vars
- `loki/loki-config.yml` — Enabled `auth_enabled: true`
- `promtail/promtail-config.yml` — Added `tenant_id`, API key header, keycloak drop
- `promtail/promtail-keycloak-config.yml` — New dedicated keycloak log scraper
- `loki-rbac-proxy/` — New Node.js JWT-aware proxy for Loki multi-tenancy
- `grafana/provisioning/datasources/prometheus.yml` — Point Loki to RBAC proxy
- `docker-compose.yml` — Added new services, volumes, env vars
- `k8s/keycloak.yaml` — Added SPI volume, sidecar Promtail, logging env
- `k8s/notification-service.yaml` — Added new env vars
- `k8s/promtail.yaml` — Updated ConfigMap with `kubernetes_sd_configs`, tenant_id
- `k8s/loki-rbac-proxy.yaml` — New deployment/service manifest
- `k8s/secrets.yaml` — Added `PROMTAIL_API_KEY`
- `k8s-setup.sh` / `docker-setup.sh` — Build SPI, create ConfigMaps, deploy new services

## Rollback

To disable Keycloak event forwarding:
1. Remove the SPI JAR volume mount from Keycloak
2. Unset `NOTIFICATION_SERVICE_URL` env var
3. Restart Keycloak

To disable log separation:
1. Set `auth_enabled: false` in `loki/loki-config.yml`
2. Remove `loki-rbac-proxy` service
3. Point Grafana Loki datasource back to `http://loki:3100`
4. Remove Promtail `tenant_id` and API key configurations

## Security Notes

- The `PROMTAIL_API_KEY` is shared between all Promtail instances and the proxy. Rotate it in production.
- The Loki RBAC proxy validates JWTs against Keycloak's JWKS endpoint. Ensure network reachability between proxy and Keycloak.
- Keycloak file logs may contain sensitive data. Ensure the shared log volume has appropriate permissions (`emptyDir` in K8s is pod-local; Docker volume is host-scoped).
