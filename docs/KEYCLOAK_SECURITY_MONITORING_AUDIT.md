# Keycloak Security Monitoring and Notification Audit

This document audits the current repository state for the requested setup:

- Keycloak Events -> Notification Service
- Keycloak Audit Logs -> Loki
- RBAC-restricted access to security logs in Grafana/Loki

It first verifies what already exists, then identifies gaps, then gives a step-by-step implementation plan tailored to this repository.

## Executive Summary

The repository already contains most of the requested architecture.

- The Keycloak event listener SPI exists and can POST events to the notification service.
- The notification service already exposes `POST /api/v1/events` and routes Keycloak events to Slack, email, and ticketing fallbacks.
- Loki is already configured as a multi-tenant log backend.
- Promtail already separates general container logs from Keycloak audit logs.
- Grafana already uses Keycloak OIDC and points its Loki datasource at an RBAC proxy.
- A dedicated Loki RBAC proxy already exists and maps `keycloak-admin` to the audit tenant.

What is still missing or only partially production-ready:

- The custom Keycloak SPI is mounted and built, but the realm export still lists only `jboss-logging` in `eventsListeners`, so the custom listener is not guaranteed to be enabled by the exported realm alone.
- The event forwarding path is best-effort and async, but there is no durable queue, retry policy, or dead-letter handling.
- The Keycloak event payload validation is minimal.
- The current event filtering is broad and string-based, which can forward more events than intended.
- The security/logging setup is functional, but some controls are demo-oriented and should be hardened before production use.

## 1. Text Architecture Diagram

```text
Keycloak realm events / admin events
        |
        | SPI plugin (EventListenerProvider)
        v
Notification Service  <---- existing Kafka pipeline (for other notification flows)
        |
        | Slack / Email / Ticket fallbacks
        v
Operators / Admins

Keycloak file logs (audit trail)
        |
        | Promtail sidecar / promtail-keycloak
        v
Loki (auth_enabled: true, multi-tenant)
        |
        | loki-rbac-proxy validates Keycloak JWT and maps roles to tenant IDs
        v
Grafana Loki datasource
        |
        | Keycloak OIDC login + role mapping
        v
Admin users see audit logs; non-admin users see only default tenant logs
```

## 2. Project Audit

### A. Keycloak Event Integration

#### What exists

- [keycloak-event-listener/src/main/java/edu/nitte/keycloak/NotificationEventListenerProvider.java](../keycloak-event-listener/src/main/java/edu/nitte/keycloak/NotificationEventListenerProvider.java)
  - Implements Keycloak `EventListenerProvider`.
  - Sends both user events and admin events to the notification service using `java.net.http.HttpClient`.
  - Uses asynchronous HTTP delivery with logging on failure.
- [keycloak-event-listener/src/main/java/edu/nitte/keycloak/NotificationEventListenerProviderFactory.java](../keycloak-event-listener/src/main/java/edu/nitte/keycloak/NotificationEventListenerProviderFactory.java)
  - Reads `NOTIFICATION_SERVICE_URL` and `NOTIFICATION_TIMEOUT_SECONDS`.
  - Exposes provider ID `nitte-notification-event-listener`.
- [keycloak-event-listener/src/main/resources/META-INF/services/org.keycloak.events.EventListenerProviderFactory](../keycloak-event-listener/src/main/resources/META-INF/services/org.keycloak.events.EventListenerProviderFactory)
  - Registers the SPI with Keycloak.
- [notification-service/src/metricsServer.js](../notification-service/src/metricsServer.js)
  - Exposes `POST /api/v1/events`.
  - Validates the incoming payload has `eventType`.
  - Tracks metrics for received Keycloak events.
- [notification-service/src/services/keycloakEventHandler.js](../notification-service/src/services/keycloakEventHandler.js)
  - Routes Keycloak security/admin events.
  - Sends Slack, creates tickets, and emails admins.
- [notification-service/src/services/slackService.js](../notification-service/src/services/slackService.js)
  - Provides Slack webhook delivery with console fallback.
- [notification-service/src/services/ticketService.js](../notification-service/src/services/ticketService.js)
  - Provides console or REST ticket creation.
- [keycloak/nitte-realm.json](../keycloak/nitte-realm.json)
  - Enables Keycloak events and admin events.
  - Includes the `keycloak-admin` realm role.
- [docker-compose.yml](../docker-compose.yml)
  - Mounts the SPI JAR into Keycloak.
  - Sets `NOTIFICATION_SERVICE_URL` and `NOTIFICATION_TIMEOUT_SECONDS`.
- [k8s/keycloak.yaml](../k8s/keycloak.yaml)
  - Mounts the SPI JAR and sets notification env vars.

#### What it does

- Forwarding path: Keycloak event -> SPI -> notification service -> Slack/email/ticket fallback.
- Events covered in code include login errors, password updates, registrations, admin changes, realm changes, user/role/client/group changes, and some identity provider/token related events.

#### What is missing or partial

- The exported realm still has `eventsListeners: ["jboss-logging"]`, so the custom SPI is not explicitly listed there.
- No durable queue or retry backoff exists in the SPI.
- No authentication is enforced on `POST /api/v1/events`.
- No schema validator or signature check exists for the incoming event payload.
- No Kafka/RabbitMQ path is wired specifically for Keycloak events, even though Kafka exists elsewhere in the repo.

#### Production readiness

- Functional for a demo or internal environment.
- Not yet production-grade for reliability or tamper resistance.

### B. Loki / Logging Setup

#### What exists

- [loki/loki-config.yml](../loki/loki-config.yml)
  - `auth_enabled: true` is already set.
  - Loki is configured for multi-tenancy.
- [promtail/promtail-config.yml](../promtail/promtail-config.yml)
  - Scrapes Docker container stdout/stderr for general application logs.
  - Sends logs to the `default` tenant.
  - Drops keycloak containers so they do not enter the default tenant.
- [promtail/promtail-keycloak-config.yml](../promtail/promtail-keycloak-config.yml)
  - Scrapes Keycloak file logs from `/var/log/keycloak/*.log`.
  - Sends them to the `keycloak-admin` tenant.
  - Extracts structured fields such as `realm`, `eventType`, and `severity`.
- [k8s/promtail.yaml](../k8s/promtail.yaml)
  - DaemonSet for Kubernetes pod logs.
  - Uses `tenant_id: default`.
  - Drops pods labeled `app=keycloak`.
- [k8s/keycloak.yaml](../k8s/keycloak.yaml)
  - Enables file logging in Keycloak.
  - Mounts a `promtail` sidecar to tail Keycloak logs.
- [k8s/loki-rbac-proxy.yaml](../k8s/loki-rbac-proxy.yaml)
  - Provides tenant-aware access to Loki.
- [loki-rbac-proxy/src/index.js](../loki-rbac-proxy/src/index.js)
  - Validates JWTs against Keycloak JWKS.
  - Maps `keycloak-admin` to the audit tenant.
  - Allows unauthenticated default-tenant access for non-audit views.
- [grafana/provisioning/datasources/prometheus.yml](../grafana/provisioning/datasources/prometheus.yml)
  - Grafana Loki datasource points to the RBAC proxy.

#### What it does

- General app logs stay in the `default` Loki tenant.
- Keycloak logs go to the `keycloak-admin` tenant.
- Grafana queries are routed through the proxy, which decides tenant access from Keycloak JWT roles.

#### What is missing or partial

- Keycloak logs are file-based and text-formatted, not clearly JSON-structured end-to-end.
- The current proxy allows unauthenticated requests to default tenant data. That is acceptable for a demo, but should be tightened for production.
- No explicit retention policy or tenant-specific retention is configured in the repo beyond the global Loki retention.
- No separate alerting pipeline for audit log patterns is defined in Loki rules yet.

#### Production readiness

- Good functional baseline.
- Needs hardening around log structure, tenant access policy, and alerting.

### C. RBAC / Security

#### What exists

- [keycloak/nitte-realm.json](../keycloak/nitte-realm.json)
  - Contains `keycloak-admin`, `admin-internal`, and `internal-user` realm roles.
  - Enables events and admin events.
  - Includes OIDC clients for Grafana, Jenkins, and observability proxies.
- [k8s/grafana.yaml](../k8s/grafana.yaml)
  - Configures Grafana Generic OAuth against Keycloak.
  - Maps realm roles to Grafana roles.
  - Points Loki datasource at `http://loki-rbac-proxy:3200`.
- [docker-compose.yml](../docker-compose.yml)
  - Mirrors the same Grafana OIDC role mapping.
  - Uses `GF_AUTH_GENERIC_OAUTH_ROLE_ATTRIBUTE_PATH` to map roles.
- [k8s/oauth2-proxies.yaml](../k8s/oauth2-proxies.yaml)
  - Protects Prometheus and Jaeger with Keycloak OIDC.
- [k8s/loki-rbac-proxy.yaml](../k8s/loki-rbac-proxy.yaml)
  - Restricts access to audit logs by Keycloak role.

#### What it does

- Grafana login is already wired to Keycloak.
- Roles are mapped into Grafana Admin/Editor/Viewer.
- Loki access is tenant-based, with `keycloak-admin` seeing the audit tenant.

#### What is missing or partial

- Grafana datasource-level permissions are not additionally constrained beyond the proxy and org/role mapping.
- The default tenant is still queryable, so if misconfigured dashboards point to the wrong datasource or tenant, leakage is possible.
- There is no second independent authorization layer on the Loki query API besides the proxy.

#### Production readiness

- Strong demo-level RBAC.
- Needs stricter tenant-default access rules and explicit operational controls before production.

## 3. Gap Analysis Table

| Existing Component | Status | Current Implementation | Required Changes |
| --- | --- | --- | --- |
| Keycloak Event Listener SPI | Present | Java SPI exists, packaged as a JAR, mounted into Keycloak, POSTs to notification service | Explicitly enable the custom listener in realm config, add robust retries, event filtering, and payload validation |
| Notification ingestion API | Present | `POST /api/v1/events` on notification service | Add auth or network restriction, schema validation, idempotency, and rate limiting |
| Slack/email/ticket fan-out | Present | Slack webhook + email + ticket fallbacks | Add proper alert severity mapping, retry policy, and error queue handling |
| Kafka for Keycloak events | Missing | Kafka exists in the repo for other flows, but not for Keycloak event delivery | Optional: add a durable queue path for Keycloak events or publish to Kafka from notification service |
| Keycloak event logging | Present | Keycloak file logging is enabled in K8s and Promtail sidecar tails the file | Switch to structured JSON logs or structured field extraction, ensure rotation and retention are appropriate |
| Promtail general logs | Present | Docker and Kubernetes scraping paths exist | Tighten labeling and exclude sensitive logs from default tenant if needed |
| Loki multi-tenancy | Present | `auth_enabled: true` with `keycloak-admin` tenant separation | Add tenant-specific retention and operational alerting rules |
| Grafana Keycloak SSO | Present | Generic OAuth configured in Docker Compose and K8s | Add explicit grafana.ini-style hardening if desired and review role mapping policy |
| Loki RBAC proxy | Present | Node.js JWT-aware proxy maps roles to tenants | Require authenticated query access for admin paths, consider denying default-tenant fallback for sensitive routes |
| Security log isolation | Partial | Keycloak logs isolated to `keycloak-admin` tenant | Make audit access policy explicit, test it, and document it as a control |

## 4. Security, Scalability, Maintainability, and Production Concerns

### Security concerns

- `POST /api/v1/events` currently has no auth. Anyone who can reach the service could inject fake events.
- The SPI currently forwards events asynchronously without message signing or replay protection.
- The Loki RBAC proxy falls back to the default tenant on unauthenticated queries. That is fine for general logs, but should be reviewed before production.
- Secrets in `k8s/secrets.yaml` and sample compose files are demo values, not production secrets.
- Keycloak log files may contain sensitive details if audit detail logging is enabled.

### Scalability concerns

- The SPI uses direct HTTP calls rather than a durable queue or broker.
- Notification delivery has no backpressure strategy if the notification service is slow.
- Loki runs with a filesystem backend and single-replica assumptions.
- Promtail keycloak scraping is file-based and sidecar-based, which is fine for this project but not ideal for larger clusters without rotation and volume management.

### Maintainability concerns

- Event filtering is string-based rather than enum-explicit.
- There is no shared event schema definition between Keycloak, the notification service, and any future Kafka consumers.
- The project already has multiple docs covering the same integration; the operational source of truth should be kept in one place.

### Production readiness issues

- No durable delivery guarantees for security events.
- No authentication/authorization on the incoming notification REST endpoint.
- No formal alert severity taxonomy or notification deduplication.
- No documented audit-log retention policy per tenant.

## 5. Implementation Guide Tailored to This Repository

The recommended approach is to keep the current architecture and harden it, not replace it.

### Phase 1: Make the existing SPI officially active

#### Files to update

- [keycloak/nitte-realm.json](../keycloak/nitte-realm.json)
- [docker-compose.yml](../docker-compose.yml)
- [k8s/keycloak.yaml](../k8s/keycloak.yaml)

#### What to change

1. Enable the custom listener in Keycloak realm events.
   - Add `nitte-notification-event-listener` to `eventsListeners` alongside `jboss-logging`.
   - Keep `eventsEnabled`, `adminEventsEnabled`, and `adminEventsDetailsEnabled` enabled.

2. Keep the SPI JAR mounted in Keycloak.
   - Compose already mounts `./keycloak-event-listener/target/keycloak-event-listener-1.0.0.jar`.
   - K8s already mounts the ConfigMap-provided JAR into `/opt/keycloak/providers/`.

3. Keep the notification endpoint env vars in place.
   - `NOTIFICATION_SERVICE_URL=http://notification-service:9100/api/v1/events`
   - `NOTIFICATION_TIMEOUT_SECONDS=5`

#### Why this is needed

- The SPI exists, but Keycloak must be told to use it.
- The realm export currently only guarantees `jboss-logging` is active.

#### Commands

```bash
./keycloak-event-listener/build.sh
./docker-setup.sh start
```

For Kubernetes:

```bash
./k8s-setup.sh start
```

### Phase 2: Harden Keycloak -> Notification Service delivery

#### Files to update

- [keycloak-event-listener/src/main/java/edu/nitte/keycloak/NotificationEventListenerProvider.java](../keycloak-event-listener/src/main/java/edu/nitte/keycloak/NotificationEventListenerProvider.java)
- [notification-service/src/metricsServer.js](../notification-service/src/metricsServer.js)
- [notification-service/src/services/keycloakEventHandler.js](../notification-service/src/services/keycloakEventHandler.js)

#### What to change

1. Replace broad string matching with explicit event allowlists.
   - Forward only the event types you truly care about.
   - Recommended user events: `LOGIN_ERROR`, `UPDATE_PASSWORD`, `REGISTER`, `REMOVE_TOTP`, `REMOVE_CREDENTIAL`, `DELETE_ACCOUNT`, brute-force-related failures.
   - Recommended admin events: `CREATE`, `UPDATE`, `DELETE` for `USER`, `ROLE`, `CLIENT`, `REALM`, `GROUP`, `AUTHENTICATION_FLOW`.

2. Add retry policy with exponential backoff.
   - Current async HTTP send is best-effort only.
   - Add a bounded retry loop or delegate to a queue/worker.

3. Add payload validation on the notification service.
   - Validate the category, event type, realm, and resource fields.
   - Reject malformed or oversized payloads.

4. Add idempotency support.
   - Use event ID or a hash of the event payload if the source event has no stable ID.
   - Prevent duplicate notifications on retries.

5. Add auth/network controls to the notification endpoint.
   - Restrict traffic at the network layer or require a shared secret header.
   - In Kubernetes, keep it ClusterIP-only and limit namespace access.

#### Optional code improvement

If you want stronger typed JSON handling in the SPI, add Jackson.

Suggested dependency for `keycloak-event-listener/pom.xml`:

```xml
<dependency>
  <groupId>com.fasterxml.jackson.core</groupId>
  <artifactId>jackson-databind</artifactId>
  <version>2.17.2</version>
</dependency>
```

Why:

- Safer JSON serialization than manual string concatenation.
- Easier payload evolution.

### Phase 3: Lock down Keycloak audit logging to Loki

#### Files to update

- [k8s/keycloak.yaml](../k8s/keycloak.yaml)
- [docker-compose.yml](../docker-compose.yml)
- [promtail/promtail-keycloak-config.yml](../promtail/promtail-keycloak-config.yml)
- [k8s/promtail.yaml](../k8s/promtail.yaml)
- [loki/loki-config.yml](../loki/loki-config.yml)

#### What to change

1. Keep Keycloak file logging enabled.
   - Current K8s env already sets `QUARKUS_LOG_FILE_ENABLE=true` and `QUARKUS_LOG_FILE_PATH=/opt/keycloak/log/keycloak.log`.
   - Compose does the same for the container-based deployment.

2. Prefer structured log lines.
   - Current file format is plain text.
   - If you keep plain text, ensure the promtail pipeline extracts enough labels.
   - If you upgrade Keycloak logging format, switch to a JSON-friendly format and keep the promtail JSON stages.

3. Keep the dedicated Keycloak log scraper.
   - `promtail-keycloak` for Docker.
   - `promtail` sidecar in the K8s Keycloak pod.

4. Maintain tenant separation.
   - Keycloak logs must go only to `keycloak-admin`.
   - Application logs stay in `default`.

5. Add LogQL queries for security operations.
   - Failed logins.
   - Role changes.
   - User creation.
   - Realm changes.

#### Example LogQL queries

Failed logins:

```logql
{service="keycloak", tenant="keycloak-admin"} |= "LOGIN_ERROR"
```

Role changes:

```logql
{service="keycloak", tenant="keycloak-admin"} |= "ROLE" |= "UPDATE"
```

User creation:

```logql
{service="keycloak", tenant="keycloak-admin"} |= "CREATE" |= "USER"
```

Realm modifications:

```logql
{service="keycloak", tenant="keycloak-admin"} |= "REALM" |= "UPDATE"
```

Security incidents:

```logql
{service="keycloak", tenant="keycloak-admin"} |= "error" or |= "LOGIN_ERROR" or |= "brute force"
```

### Phase 4: Tighten RBAC for log access

#### Files to update

- [k8s/grafana.yaml](../k8s/grafana.yaml)
- [docker-compose.yml](../docker-compose.yml)
- [k8s/loki-rbac-proxy.yaml](../k8s/loki-rbac-proxy.yaml)
- [loki-rbac-proxy/src/index.js](../loki-rbac-proxy/src/index.js)
- [keycloak/nitte-realm.json](../keycloak/nitte-realm.json)

#### What to change

1. Keep Grafana OIDC with Keycloak.
   - This is already present and should remain the source of authentication.

2. Keep the role mapping explicit.
   - `keycloak-admin` and `admin-internal` should map to Grafana Admin.
   - `internal-user` should map to Editor.
   - Everyone else should remain Viewer.

3. Ensure Loki access is tenant-based.
   - Admins can query `keycloak-admin` tenant.
   - Non-admins must not see the audit tenant.

4. Consider denying unauthenticated default-tenant Loki reads in production.
   - For demo use, the default tenant fallback is convenient.
   - For production, require JWTs for all Loki query traffic or keep the proxy internal-only.

5. Consider Grafana folder permissions.
   - Put audit dashboards in a folder visible only to admin roles.
   - Keep general application dashboards separate.

#### Why this is needed

- RBAC is currently based on Keycloak role -> Grafana role -> Loki tenant mapping.
- That is the correct design for this repo, but it needs stricter operational boundaries for sensitive logs.

### Phase 5: Decide whether to add a queue

The repository already has Kafka. There are two reasonable patterns:

1. Keep the SPI -> REST -> Notification Service flow.
2. Add queueing inside the notification service or route Keycloak events into Kafka first.

#### Recommended choice for this repository

Keep the SPI -> REST path for now, then add Kafka only if throughput or durability become a real problem.

Reason:

- This repo already has a working notification ingestion API.
- The notification service already includes Kafka infrastructure for other flows.
- The smallest safe step is to harden what exists rather than invent a new path.

#### Queue-based option if you need it later

- SPI POSTs to notification service.
- Notification service enqueues events to Kafka topic `keycloak-events`.
- Dedicated workers consume the topic and fan out to Slack/email/tickets.
- This gives buffering, retry, and decoupling.

## 6. Exact Files to Create or Update

### Update these existing files

- [keycloak/nitte-realm.json](../keycloak/nitte-realm.json)
- [keycloak-event-listener/src/main/java/edu/nitte/keycloak/NotificationEventListenerProvider.java](../keycloak-event-listener/src/main/java/edu/nitte/keycloak/NotificationEventListenerProvider.java)
- [keycloak-event-listener/src/main/java/edu/nitte/keycloak/NotificationEventListenerProviderFactory.java](../keycloak-event-listener/src/main/java/edu/nitte/keycloak/NotificationEventListenerProviderFactory.java)
- [notification-service/src/metricsServer.js](../notification-service/src/metricsServer.js)
- [notification-service/src/services/keycloakEventHandler.js](../notification-service/src/services/keycloakEventHandler.js)
- [notification-service/src/services/slackService.js](../notification-service/src/services/slackService.js)
- [notification-service/src/services/ticketService.js](../notification-service/src/services/ticketService.js)
- [loki/loki-config.yml](../loki/loki-config.yml)
- [promtail/promtail-config.yml](../promtail/promtail-config.yml)
- [promtail/promtail-keycloak-config.yml](../promtail/promtail-keycloak-config.yml)
- [loki-rbac-proxy/src/index.js](../loki-rbac-proxy/src/index.js)
- [grafana/provisioning/datasources/prometheus.yml](../grafana/provisioning/datasources/prometheus.yml)
- [docker-compose.yml](../docker-compose.yml)
- [k8s/keycloak.yaml](../k8s/keycloak.yaml)
- [k8s/grafana.yaml](../k8s/grafana.yaml)
- [k8s/promtail.yaml](../k8s/promtail.yaml)
- [k8s/loki-rbac-proxy.yaml](../k8s/loki-rbac-proxy.yaml)
- [k8s/notification-service.yaml](../k8s/notification-service.yaml)
- [k8s/secrets.yaml](../k8s/secrets.yaml)

### Create if you want production hardening later

- `notification-service/src/middleware/auth.js` for request authentication on `/api/v1/events`
- `notification-service/src/queue/` for durable event buffering
- `docs/logql-queries.md` for reusable Loki queries
- `docs/env-inventory.md` for service-by-service environment variables

## 7. Exact Dependencies to Add

Only add dependencies if you are implementing the hardening steps below.

### Keycloak SPI

Current dependencies are enough for the basic SPI.

Optional addition if you want safer JSON serialization:

- `com.fasterxml.jackson.core:jackson-databind`

### Notification service

Current dependencies already cover Express, KafkaJS, Prometheus metrics, dotenv, nodemailer, and Winston.

Optional additions for production hardening:

- `zod` or `ajv` for payload validation
- A queue library or Kafka producer if you add durable buffering

## 8. Commands to Run

### Docker Compose flow

```bash
./keycloak-event-listener/build.sh
./docker-setup.sh start
./scripts/demo-keycloak-events.sh docker
```

### Kubernetes flow

```bash
./keycloak-event-listener/build.sh
./k8s-setup.sh start
./scripts/demo-keycloak-events.sh k8s
```

### Focused validation commands

Check Keycloak listener registration:

```bash
docker logs nitte-keycloak | grep -i "nitte-notification-event-listener"
```

Check notification service event ingestion:

```bash
curl -s -X POST http://localhost:9100/api/v1/events \
  -H 'Content-Type: application/json' \
  -d '{"eventType":"LOGIN_ERROR","eventCategory":"user","realmId":"nitte-realm"}'
```

Check Loki proxy behavior:

```bash
curl -s http://localhost:3200/loki/api/v1/label/values?name=service
```

Check Grafana OIDC login:

```text
Open http://localhost:3001 and sign in with Keycloak
```

## 9. Step-by-Step Verification Plan

1. Build the Keycloak SPI JAR.
2. Start the stack with Docker Compose or Kubernetes.
3. Verify the Keycloak container loads the SPI.
4. Enable the custom listener in the realm export.
5. Trigger a failed login and an admin event.
6. Confirm the notification service receives `POST /api/v1/events`.
7. Confirm Slack/email/ticket fallbacks are invoked.
8. Confirm Keycloak logs appear in the `keycloak-admin` tenant.
9. Log into Grafana as `internal-admin` and verify audit logs are visible.
10. Log into Grafana as `internal-user` and verify audit logs are not visible.

## 10. Troubleshooting

### SPI does not fire

- Check that the JAR exists at `keycloak-event-listener/target/keycloak-event-listener-1.0.0.jar`.
- Check that Keycloak mounts the provider into `/opt/keycloak/providers/`.
- Check that the realm actually lists the custom listener in `eventsListeners`.

### Notification service receives nothing

- Check `NOTIFICATION_SERVICE_URL`.
- Check the notification service health and logs.
- Check that Keycloak can reach the notification service on the container network or Kubernetes service name.

### Loki audit logs are empty

- Check that Keycloak file logging is enabled.
- Check that the promtail sidecar or daemonset is running.
- Check that the log path matches the mounted volume.

### Grafana can see too much or too little

- Check Keycloak role mapping in the realm.
- Check the Grafana `GF_AUTH_GENERIC_OAUTH_ROLE_ATTRIBUTE_PATH` expression.
- Check that Grafana points to the RBAC proxy, not directly to Loki.

## 11. Recommended Production Architecture

Best fit for this repository:

- Keep the custom Keycloak SPI.
- Keep the notification service as the initial event sink.
- Add validation, auth, and retries.
- Keep Loki multi-tenancy and the RBAC proxy.
- Keep Grafana OIDC through Keycloak.
- Move to a queue only when you need stronger durability or higher event volume.

## 12. Tradeoff Comparison

| Option | Pros | Cons | Fit for this repo |
| --- | --- | --- | --- |
| SPI Plugin | Lowest latency, direct Keycloak integration, simple to reason about | Needs hardening for retries and auth, can block if misused | Best current fit |
| Sidecar | Good for file-log collection and local isolation | Not enough for direct event delivery, more moving parts | Good for audit logs, not for event forwarding |
| External Collector | Decouples Keycloak from downstream services | Requires extra infrastructure and schema handling | Good future option |
| Promtail | Already works for log collection and multi-tenancy | Not an event transport mechanism | Best for audit logs only |

## 13. Final Verification Checklist

- [ ] SPI JAR builds successfully.
- [ ] Keycloak mounts and loads the SPI.
- [ ] Realm `eventsListeners` includes the custom listener.
- [ ] Notification service accepts valid events.
- [ ] Invalid payloads are rejected.
- [ ] Slack/email/ticket fallback works.
- [ ] Keycloak audit logs are written to file.
- [ ] Promtail routes Keycloak logs to `keycloak-admin` tenant.
- [ ] Non-admin users cannot query the audit tenant.
- [ ] Grafana login uses Keycloak OIDC.
- [ ] Grafana role mapping matches Keycloak roles.
- [ ] Loki datasource points to the RBAC proxy.
- [ ] Security-related LogQL queries return the expected records.

## 14. Bottom Line

This repository is not missing the whole feature set. It already has the core design. The work now is mostly to make the setup explicit, tighten security, and add durability.

The highest-value next edits are:

1. Enable the custom Keycloak event listener in the realm export.
2. Harden the notification ingestion endpoint.
3. Tighten Loki/Grafana access policy for audit logs.
4. Decide whether to add a queue for Keycloak events later.
