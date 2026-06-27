# Migration Plan — Single Cluster → Three RKE2 Clusters (Admin / Dev / Prod)

> Status: **PLAN (not yet executed).** This documents how to re-architect the current
> single RKE2 cluster (1 server + 2 agents) into the **three independent single-node
> RKE2 clusters** shown in the architecture diagram. It is a destructive, multi-session
> rebuild — read the Risks section before starting.

---

## 1. Target topology (per the architecture diagram)

Each VM is its **own independent RKE2 cluster** (its own control-plane + etcd + workloads):

| VM | Cluster | Runs |
|----|---------|------|
| **mastervm** (192.168.56.10) | **ADMIN** | Jenkins, Nexus (registry), ArgoCD, MinIO (artifact/object), **Grafana**, **Loki**, **GoAlert** |
| **workervm1** (192.168.56.11) | **DEVELOPMENT** | WAF (Coraza) + Istio gateway, Keycloak, microservices (frontend/admin/merchant/node-backend/python), Kafka+Zookeeper, MongoDB (sharded), Prometheus, Promtail, Jaeger |
| **workervm2** (192.168.56.12) | **PRODUCTION** | Istio gateway (+WAF), Keycloak, microservices, Kafka+Zookeeper, MongoDB, Prometheus, Promtail, Jaeger, Redocly |

Key differences from today's setup:
- **Three control planes** (each VM `rke2-server`, single-node), not one cluster with agents.
- **Observability split**: Dev/Prod run their own Prometheus/Jaeger/Promtail; **Grafana + Loki live in Admin** and aggregate (Promtail in Dev/Prod ships logs to Admin's Loki; Grafana adds Dev/Prod Prometheus as datasources).
- **GitOps is multi-cluster**: ArgoCD in Admin registers Dev + Prod as **external clusters** and deploys to them remotely.
- **Nexus (Admin)** is the shared registry; Dev/Prod nodes trust it via `registries.yaml`.

---

## 2. Current state (what we have now)

- ONE RKE2 cluster: mastervm = server (control-plane+etcd), workervm1/2 = **agents**.
- Dev/Prod are **namespaces** (`nitte-dev`, `nitte-prod`) pinned to workervm1/2 via nodeSelector.
- Tooling (ArgoCD, Nexus, Jenkins, Kiali) + Grafana/Loki/GoAlert all run in this one cluster.
- `rke2-server` is **masked** on workervm1/2 (must be unmasked to make them their own clusters).

This functionally works but does **not** match the 3-cluster diagram.

---

## 3. Why this is a real rebuild (read before starting)

- Splitting 1 cluster → 3 destroys and recreates all Dev/Prod workloads (apps, Mongo, Kafka).
  **Data is wiped → re-seed** (products via `scripts/seed-products.mjs`, users via Keycloak sync).
- Every data-layer issue already solved **recurs per cluster** (Mongo replica-set FQDN/`/etc/hosts`,
  cache cap; Kafka Zookeeper znode race; Istio STRICT mTLS exclusions; Nexus HTTP `registries.yaml`;
  memory limits). They're codified in Git now, so redeploy is mostly `kubectl apply`, but expect debugging.
- **Estimated effort: ~1 focused day across 2–3 sessions.** Do it in a clean session, not rushed.
- App is **down per cluster** during its rebuild (incremental order below keeps the others serving).

---

## 4. Phased migration (incremental, lowest-risk order)

### Phase 0 — Prep (no outage)
- Confirm all workload manifests are in Git (`k8s/base`, overlays) — they are.
- Note the demo data is re-seedable; no irreplaceable data.
- Decide hostnames/tunnels per cluster (each cluster gets its own Istio gateway NodePort + SSH tunnel).
- Back up Admin-cluster ArgoCD app definitions and any bootstrapped Secrets/ConfigMaps lists.

### Phase 1 — Development cluster (workervm1)
1. On workervm1: `sudo systemctl unmask rke2-server`; remove the agent join config; wipe agent state:
   ```bash
   sudo systemctl disable --now rke2-agent
   sudo /usr/local/bin/rke2-killall.sh
   sudo rm -rf /etc/rancher/rke2/config.yaml /var/lib/rancher/rke2/server /var/lib/rancher/rke2/agent
   ```
2. Write a **server** `config.yaml` (single-node, its own cluster):
   ```yaml
   write-kubeconfig-mode: "0644"
   node-ip: "192.168.56.11"
   tls-san: ["192.168.56.11"]
   # no server:/token: -> this node cluster-inits its OWN cluster
   ```
   `sudo systemctl enable --now rke2-server`
3. Re-create `registries.yaml` (trust Nexus at `192.168.56.10:30082`) + restart rke2-server (section 3.3 of the runbook).
4. Install Istio (gateway + istiod), apply the Dev workloads (the `k8s/base` stack, dev values),
   the WAF WasmPlugin, mesh policies. Re-run the Mongo/Kafka init. Re-seed.
5. Verify Dev cluster standalone (gateway, app, mongo, kafka, observability). Set up its tunnel.
   - *(Prod still runs on the old cluster on workervm2 during this phase.)*

### Phase 2 — Production cluster (workervm2)
Repeat Phase 1 on workervm2 with `node-ip: 192.168.56.12`, the Prod values, + Redocly.
After this, workervm2 is independent; the old single cluster is now just mastervm.

### Phase 3 — Admin cluster (mastervm)
1. mastervm is already an RKE2 server. Remove the now-empty `nitte-dev`/`nitte-prod` namespaces
   and the worker node objects (`kubectl delete node workervm1 workervm2`).
2. Keep: ArgoCD, Nexus, Jenkins, MinIO. **Add: Grafana, Loki, GoAlert** (move them here).
3. **ArgoCD multi-cluster**: register Dev + Prod clusters:
   ```bash
   argocd cluster add <dev-context>   # uses each cluster's kubeconfig
   argocd cluster add <prod-context>
   ```
   Point the `nitte-dev` Application at the Dev cluster, `nitte-prod` at the Prod cluster
   (Application `spec.destination.server` = the remote cluster API).
4. **Loki aggregation**: Promtail in Dev/Prod → push to Admin Loki
   (`clients: [ url: http://<admin-ip>:<loki-nodeport>/loki/api/v1/push ]`). Grafana (Admin) adds
   Dev/Prod Prometheus as datasources (via NodePort or tunnel).

### Phase 4 — Cross-cluster wiring & verification
- Nexus image pulls work from Dev/Prod (registries.yaml present on each).
- ArgoCD deploys to Dev/Prod remotely; syncs green.
- Jenkins CI (Admin) builds → pushes to Nexus → bumps tags → ArgoCD deploys to Dev/Prod.
- Per-cluster SSH tunnels for the gateways; `/etc/hosts` updated.
- GoAlert (Admin) receives Alertmanager alerts from Dev/Prod (cross-cluster webhook to Admin GoAlert NodePort).

---

## 5. Risks & mitigations
- **Total Dev/Prod outage during their rebuild** → incremental order (Phase 1 then 2) keeps one serving.
- **Data loss** (Mongo/GoAlert) → re-seed scripts; nothing irreplaceable.
- **Recurring data-layer bugs** → all fixes are in Git (Mongo StatefulSet FQDN, Kafka znode delete,
  registries.yaml, mTLS PERMISSIVE for loki/prometheus/jaeger, WAF tooling-host exclusion).
- **Memory** → each VM now runs only ONE cluster's stack (lighter than a slice of the big cluster),
  but Dev/Prod each need full Istio+Kafka+Mongo+observability; watch limits, cap JVM/WiredTiger.
- **Cross-cluster networking** → clusters talk over the 192.168.56.0/24 host-only net via NodePorts;
  ensure firewall/NodePort ranges open between VMs.

## 6. Rollback
If a phase fails, the node can rejoin the (still-running) Admin cluster as an agent (reverse of
Phase 1 step 2: write the agent `server:`+`token:` config, `enable --now rke2-agent`). Because the
single-cluster manifests remain in Git, the previous working topology is reproducible.

---

## 7. Decision record
- The single-cluster build was a valid **recovery** from the etcd-quorum outage (workers were left as
  agents), but the **target architecture is three independent clusters** (this doc).
- Proceed only if the 3-cluster topology is a confirmed requirement; the single cluster already
  demonstrates every capability (env separation, GitOps, mesh, WAF, observability, CI/CD, email, alerting).
