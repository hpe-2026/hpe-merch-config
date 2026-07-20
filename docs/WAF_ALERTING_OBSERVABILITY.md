# Coraza WAF — Attack Alerting & Grafana Visualisation

> **Status:** Actionable implementation guide  
> **Prereqs:** Coraza WAF deployed (✅ Done — `SecRuleEngine On`, v0.6.0)  
> **Stack:** WAF logs → stdout → Promtail → Loki → Grafana (dashboards) + Prometheus (alert rules) → Alertmanager → GoAlert (on-call)

---

## How the Log Pipeline Already Works

```
Coraza WasmPlugin
  │  SecAuditLog /dev/stdout
  ▼
istio-ingressgateway pod stdout
  │
  ▼  (already scraped by promtail DaemonSet in nitte-dev namespace)
Promtail (downstream-clusters/monitoring-agents/promtail.yaml)
  │  scrapes /var/log/pods/istio-system_istio-ingressgateway-*
  ▼
Loki (on admin cluster, port 30200)
  │
  ├──► Grafana Explore / Dashboards  ← visualisation
  └──► Loki-based Prometheus ruler   ← alerting rules (LogQL → Prometheus)
         │
         ▼
       Alertmanager → GoAlert webhook
```

> **Key insight:** Coraza writes `SecAuditLog /dev/stdout`. The ingressgateway runs in  
> `istio-system`. Promtail currently only scrapes `/var/log/pods/nitte-dev_*`.  
> **Step 1 below fixes this gap.**

---

## Step 1 — Fix Promtail to Scrape `istio-system` Logs

### Why this is needed

The existing `promtail.yaml` only watches:
```
__path__: /var/log/pods/nitte-dev_*/*/*.log
```
WAF logs live in `istio-system`. Without this fix, Loki never receives them.

### File to edit: `downstream-clusters/monitoring-agents/promtail.yaml`

Add a second `scrape_config` job alongside the existing `pod-logs` job:

```yaml
# ADD this block inside the scrape_configs list (after the existing pod-logs job)
      - job_name: waf-logs
        static_configs:
          - targets:
              - localhost
            labels:
              job: coraza-waf
              cluster: dev
              __path__: /var/log/pods/istio-system_istio-ingressgateway-*/*/*.log
        pipeline_stages:
          - cri: {}
          - match:
              selector: '{job="coraza-waf"}'
              stages:
                - regex:
                    # Coraza log line format:
                    # [coraza] [WARN] Triggered rule 942100 (SQL Injection) on GET /api/v1/...
                    expression: '.*\[coraza\]\s+\[(?P<waf_level>[A-Z]+)\].*rule\s+(?P<rule_id>\d+).*\((?P<attack_type>[^)]+)\).*(?P<method>GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(?P<uri>\S+)'
                - labels:
                    waf_level:
                    rule_id:
                    attack_type:
                    method:
                    uri:
          - labeldrop:
              - filename
```

**After editing, commit and push.** ArgoCD will restart Promtail with the new config.

### Verify in Loki (after ~5 minutes)

Go to Grafana → Explore → Loki datasource and run:
```logql
{job="coraza-waf"} |= "coraza"
```
You should see ingressgateway log lines. If empty, trigger a test attack:
```bash
curl "http://api.117.250.206.138.nip.io/api/v1/products?id=1'+OR+'1'='1"
```

---

## Step 2 — Add Prometheus Alerting Rules for WAF Attacks

Loki supports a **Prometheus-compatible ruler** that can evaluate LogQL expressions and expose them as Prometheus metrics/alerts. However, since your Loki setup is basic (single-binary), the simpler and more reliable approach is to use **Loki-derived metrics via Promtail's `metrics` pipeline stage**, then alert on those in Prometheus.

### 2a — Add Metrics Pipeline Stage to Promtail

This turns log events into Prometheus counters scraped by the Prometheus agent.

Edit `downstream-clusters/monitoring-agents/promtail.yaml` — in the `waf-logs` scrape job, add a `metrics` stage after the `labels` stage:

```yaml
                - metrics:
                    waf_attacks_total:
                      type: Counter
                      description: "Total WAF attack detections by rule and type"
                      source: rule_id
                      config:
                        action: inc
```

Then expose Promtail's metrics port. In the DaemonSet container section, add:
```yaml
        ports:
        - containerPort: 9080    # existing
          name: http-metrics
```

And add a ServiceMonitor or static scrape target so Prometheus scrapes it. Add to `downstream-clusters/monitoring-agents/` a new file `promtail-service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: promtail
  namespace: nitte-dev
  labels:
    app: promtail
spec:
  selector:
    app: promtail
  ports:
  - name: http-metrics
    port: 9080
    targetPort: 9080
```

And add a scrape job to `prometheus-agent.yaml`:
```yaml
    - job_name: promtail-waf
      static_configs:
        - targets: ['promtail.nitte-dev.svc.cluster.local:9080']
          labels:
            cluster: dev
```

### 2b — Add WAF Alert Rules to Prometheus

**File to edit:** `admin-cluster/observability/prometheus-rules-config.yaml`

Add a new rule group at the end (before the closing `|` of the `alerts.yml` block):

```yaml
      - name: coraza-waf-attacks
        interval: 30s
        rules:

          # ── Burst of WAF Detections (any attack type) ─────────────────────────
          - alert: WAFAttackBurst
            expr: |
              sum(rate(waf_attacks_total[5m])) > 5
            for: 1m
            labels:
              severity: warning
              team: security
            annotations:
              summary: "WAF attack burst detected"
              description: "Coraza WAF is detecting more than 5 attacks/min. Possible active scan or attack in progress."

          # ── High Volume Attack (sustained, escalate to critical) ───────────────
          - alert: WAFHighVolumeAttack
            expr: |
              sum(rate(waf_attacks_total[5m])) > 20
            for: 2m
            labels:
              severity: critical
              team: security
            annotations:
              summary: "WAF high-volume attack — possible automated attack"
              description: "Coraza WAF detecting >20 attacks/min sustained for 2+ minutes. Potential DDoS or scanner."

          # ── SQL Injection Specifically (rule IDs 942xxx) ──────────────────────
          - alert: WAFSQLInjectionDetected
            expr: |
              sum(rate(waf_attacks_total{rule_id=~"942.*"}[5m])) > 0
            for: 30s
            labels:
              severity: critical
              team: security
            annotations:
              summary: "SQL Injection attack detected by WAF"
              description: "Coraza WAF has detected SQL injection attempts (OWASP CRS rule 942xxx). Immediate review required."

          # ── XSS Attacks (rule IDs 941xxx) ────────────────────────────────────
          - alert: WAFXSSDetected
            expr: |
              sum(rate(waf_attacks_total{rule_id=~"941.*"}[5m])) > 2
            for: 1m
            labels:
              severity: warning
              team: security
            annotations:
              summary: "XSS attacks detected by WAF"
              description: "Cross-site scripting attempts detected. Rule 941xxx triggered multiple times in 5 minutes."

          # ── RCE / Path Traversal (rule IDs 930xxx, 932xxx) ───────────────────
          - alert: WAFRCEOrPathTraversalDetected
            expr: |
              sum(rate(waf_attacks_total{rule_id=~"93[02].*"}[5m])) > 0
            for: 30s
            labels:
              severity: critical
              team: security
            annotations:
              summary: "RCE or Path Traversal detected by WAF"
              description: "High-severity attack: remote code execution or path traversal attempt detected by Coraza WAF."
```

---

## Step 3 — Verify Alertmanager Routes to GoAlert

Your `alertmanager-config.yaml` already routes all alerts to GoAlert via webhook. No changes needed — the WAF rules above will automatically flow through.

**Current routing (already correct):**
```
WAF Prometheus Alert → Alertmanager → GoAlert webhook (from /etc/alertmanager/secrets/goalert-webhook-url)
```

### Confirm GoAlert integration key exists

The `goalert-webhook-url` Secret must exist in the `observability` namespace. If not yet created:

1. Log into GoAlert at `http://goalert.192.168.56.10.nip.io`
2. Create a **Service** named `coraza-waf-security`
3. Add an **Integration** → type: **Prometheus Alertmanager**
4. Copy the webhook URL shown
5. Create the Kubernetes secret (apply out-of-band, never commit to Git):
   ```bash
   kubectl create secret generic alertmanager-goalert-secret \
     -n observability \
     --from-literal=goalert-webhook-url='http://goalert.goalert.svc.cluster.local:8081/api/v2/incoming/prometheus/YOUR-KEY-HERE'
   ```

### Add severity escalation in GoAlert

In GoAlert UI:
- Service `coraza-waf-security`
- **Escalation Policy:** 
  - Step 1 (0 min): Notify on-call via email
  - Step 2 (5 min): Escalate to team lead if unacknowledged
- **Alert filters:** GoAlert receives all alerts tagged `team: security`

---

## Step 4 — Grafana WAF Security Dashboard

### 4a — Add Dashboard ConfigMap

**File to create:** `admin-cluster/observability/grafana-waf-dashboard-config.yaml`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-waf-dashboard
  namespace: observability
  labels:
    grafana_dashboard: "1"
data:
  waf-security.json: |
    {
      "title": "Coraza WAF — Security Events",
      "uid": "coraza-waf-security",
      "tags": ["security", "waf", "coraza"],
      "refresh": "30s",
      "time": { "from": "now-1h", "to": "now" },
      "panels": [
        {
          "id": 1,
          "title": "Attack Rate (per minute)",
          "type": "timeseries",
          "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
          "datasource": { "uid": "thanos-ds" },
          "targets": [{
            "expr": "sum(rate(waf_attacks_total[1m])) * 60",
            "legendFormat": "Attacks/min"
          }],
          "fieldConfig": {
            "defaults": {
              "color": { "mode": "fixed", "fixedColor": "red" },
              "thresholds": {
                "steps": [
                  { "color": "green", "value": null },
                  { "color": "yellow", "value": 5 },
                  { "color": "red", "value": 20 }
                ]
              }
            }
          }
        },
        {
          "id": 2,
          "title": "Attacks by Type (last 1h)",
          "type": "piechart",
          "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
          "datasource": { "uid": "thanos-ds" },
          "targets": [{
            "expr": "sum by (attack_type) (increase(waf_attacks_total[1h]))",
            "legendFormat": "{{ attack_type }}"
          }]
        },
        {
          "id": 3,
          "title": "Total Attacks (24h)",
          "type": "stat",
          "gridPos": { "h": 4, "w": 6, "x": 0, "y": 8 },
          "datasource": { "uid": "thanos-ds" },
          "targets": [{
            "expr": "sum(increase(waf_attacks_total[24h]))",
            "legendFormat": ""
          }],
          "fieldConfig": {
            "defaults": { "color": { "mode": "thresholds" }, "unit": "short" }
          }
        },
        {
          "id": 4,
          "title": "WAF Blocked Requests (403s from IngressGW)",
          "type": "timeseries",
          "gridPos": { "h": 8, "w": 24, "x": 0, "y": 12 },
          "datasource": { "uid": "thanos-ds" },
          "targets": [{
            "expr": "sum(rate(istio_requests_total{reporter=\"source\", response_code=\"403\", destination_service=~\".*\"}[5m])) by (destination_service_name)",
            "legendFormat": "{{ destination_service_name }}"
          }]
        },
        {
          "id": 5,
          "title": "WAF Raw Logs (Loki)",
          "type": "logs",
          "gridPos": { "h": 10, "w": 24, "x": 0, "y": 20 },
          "datasource": { "uid": "loki-ds" },
          "targets": [{
            "expr": "{job=\"coraza-waf\"} |= \"coraza\" | line_format \"{{.message}}\"",
            "legendFormat": ""
          }],
          "options": {
            "showLabels": true,
            "showTime": true,
            "sortOrder": "Descending"
          }
        },
        {
          "id": 6,
          "title": "Top Attacked URIs (last 1h)",
          "type": "table",
          "gridPos": { "h": 8, "w": 12, "x": 0, "y": 30 },
          "datasource": { "uid": "thanos-ds" },
          "targets": [{
            "expr": "topk(10, sum by (uri) (increase(waf_attacks_total[1h])))",
            "legendFormat": "{{ uri }}",
            "instant": true,
            "format": "table"
          }]
        },
        {
          "id": 7,
          "title": "Top Triggered Rule IDs (last 1h)",
          "type": "table",
          "gridPos": { "h": 8, "w": 12, "x": 12, "y": 30 },
          "datasource": { "uid": "thanos-ds" },
          "targets": [{
            "expr": "topk(10, sum by (rule_id) (increase(waf_attacks_total[1h])))",
            "legendFormat": "{{ rule_id }}",
            "instant": true,
            "format": "table"
          }]
        }
      ],
      "schemaVersion": 38,
      "version": 1
    }
```

### 4b — Mount the dashboard in Grafana

**File to edit:** `admin-cluster/observability/grafana.yaml`

In the Grafana Deployment, find the `volumeMounts` section and add:
```yaml
        - name: waf-dashboard
          mountPath: /var/lib/grafana/dashboards/waf-security.json
          subPath: waf-security.json
          readOnly: true
```

In the `volumes` section add:
```yaml
      - name: waf-dashboard
        configMap:
          name: grafana-waf-dashboard
```

Also ensure Grafana's dashboard provider is configured. In the existing dashboard providers ConfigMap (or add one), ensure:
```yaml
providers:
  - name: default
    folder: ''
    type: file
    options:
      path: /var/lib/grafana/dashboards
```

### 4c — Wire into kustomization

**File to edit:** `admin-cluster/kustomization.yaml`

Add the new file to the resources list:
```yaml
  - observability/grafana-waf-dashboard-config.yaml
```

---

## Step 5 — Loki Query Recipes (for Grafana Explore)

Use these in Grafana → Explore → Loki for ad-hoc investigation:

| Use Case | LogQL Query |
|---|---|
| All WAF events | `{job="coraza-waf"} \|= "coraza"` |
| Only detections (WARN) | `{job="coraza-waf"} \|= "[WARN]" \|= "coraza"` |
| Only blocks (ERROR) | `{job="coraza-waf"} \|= "[ERROR]" \|= "coraza"` |
| SQL Injection only | `{job="coraza-waf"} \|= "942"` |
| XSS only | `{job="coraza-waf"} \|= "941"` |
| Attacks in last 5 min | `{job="coraza-waf"} \|= "coraza" [5m]` |
| Count by attack type | `sum by (attack_type) (count_over_time({job="coraza-waf"} \|= "coraza" \| regexp "\\((?P<attack_type>[^)]+)\\)" [5m]))` |

---

## Step 6 — Git Commit & ArgoCD Sync

```bash
cd /home/pskth/projects/hpe-merch-config

# Stage all modified/new files
git add downstream-clusters/monitoring-agents/promtail.yaml
git add downstream-clusters/monitoring-agents/promtail-service.yaml   # NEW
git add admin-cluster/observability/prometheus-rules-config.yaml
git add admin-cluster/observability/grafana-waf-dashboard-config.yaml # NEW
git add admin-cluster/observability/grafana.yaml
git add admin-cluster/kustomization.yaml

git status  # verify only expected files are staged

git commit -m "feat(security): WAF attack alerting and Grafana visualisation

- Promtail: add istio-system scrape job for Coraza WAF logs
- Promtail: extract rule_id, attack_type, method, uri as Loki labels
- Promtail: emit waf_attacks_total counter metric
- Prometheus: add coraza-waf-attacks rule group with 5 alert rules
  - WAFAttackBurst (warning: >5/min for 1m)
  - WAFHighVolumeAttack (critical: >20/min for 2m)
  - WAFSQLInjectionDetected (critical: any rule 942xxx)
  - WAFXSSDetected (warning: rule 941xxx >2/min)
  - WAFRCEOrPathTraversalDetected (critical: rule 930/932xxx)
- Grafana: add WAF Security dashboard (attack rate, pie by type,
  raw logs panel, top URIs, top rule IDs)
- All alerts route via existing Alertmanager → GoAlert webhook"

# Do NOT push yet — review git diff first
git diff HEAD~1
```

---

## Step 7 — End-to-End Verification Checklist

After ArgoCD syncs (wait ~3 minutes after push):

### 7.1 — Verify Promtail Picks Up WAF Logs
```bash
# Trigger a test attack from jump box
curl "http://api.117.250.206.138.nip.io/api/v1/products?id=1'+OR+'1'='1"

# Check Loki in Grafana Explore with:
# {job="coraza-waf"} |= "coraza"
# Should see a log line within 30 seconds
```

### 7.2 — Verify Prometheus Sees the Metric
```bash
# In Prometheus UI (prometheus.192.168.56.10.nip.io):
# Query: waf_attacks_total
# Should show counter with labels: rule_id, attack_type, method, uri
```

### 7.3 — Verify Alertmanager Fires
```bash
# Trigger sustained attacks (10 requests rapidly):
for i in {1..15}; do
  curl -s -o /dev/null "http://api.117.250.206.138.nip.io/api/v1/products?id=1'+OR+'1'='1"
done

# Check Alertmanager UI (alertmanager.192.168.56.10.nip.io)
# Should see WAFAttackBurst or WAFSQLInjectionDetected firing
```

### 7.4 — Verify GoAlert Receives the Alert
1. Open GoAlert at `http://goalert.192.168.56.10.nip.io`
2. Go to **Alerts** page
3. Should see a new alert for the WAF service
4. Acknowledge it to confirm the integration is bidirectional

### 7.5 — Verify Grafana Dashboard
1. Open Grafana at `http://grafana.192.168.56.10.nip.io`
2. Go to **Dashboards** → search "Coraza WAF"
3. The dashboard should show attack rate, pie chart, and log panel

---

## File Change Summary

| File | Action | What Changes |
|---|---|---|
| `downstream-clusters/monitoring-agents/promtail.yaml` | EDIT | Add `waf-logs` scrape job for istio-system + label extraction + metrics stage |
| `downstream-clusters/monitoring-agents/promtail-service.yaml` | CREATE | Expose Promtail metrics port for Prometheus scrape |
| `admin-cluster/observability/prometheus-rules-config.yaml` | EDIT | Add `coraza-waf-attacks` rule group with 5 alert rules |
| `admin-cluster/observability/grafana-waf-dashboard-config.yaml` | CREATE | WAF security dashboard JSON (7 panels) |
| `admin-cluster/observability/grafana.yaml` | EDIT | Mount new dashboard ConfigMap |
| `admin-cluster/kustomization.yaml` | EDIT | Add new dashboard ConfigMap to resources |

> **No changes needed** to: `alertmanager-config.yaml` (already routes all alerts → GoAlert), `goalert.yaml` (already deployed), Loki config (already receiving from Promtail).

---

## OWASP CRS Rule ID Reference

| Rule ID Range | Attack Category | Alert |
|---|---|---|
| 941xxx | XSS (Cross-Site Scripting) | `WAFXSSDetected` |
| 942xxx | SQL Injection | `WAFSQLInjectionDetected` |
| 930xxx | LFI / Path Traversal | `WAFRCEOrPathTraversalDetected` |
| 932xxx | RCE / OS Command Injection | `WAFRCEOrPathTraversalDetected` |
| 913xxx | Scanner / Crawler Detection | `WAFAttackBurst` |
| 920xxx | Protocol Enforcement | `WAFAttackBurst` |

---

*Last updated: 2026-07-20 — Coraza WAF v0.6.0, `SecRuleEngine On`*

