# Coraza WAF Implementation Plan
> **For AI Agents**: This document is a step-by-step implementation guide.  
> Follow each phase sequentially. Do NOT skip ahead. Verify each phase before proceeding.  
> All file paths are absolute and repo-relative. All commands are run from the jump box unless stated.

---

## Context & Goals

**What this plan adds:** A Coraza WAF layer deployed as an Istio `WasmPlugin` at the `istio-ingressgateway`. This is the first line of HTTP-level defence — filtering SQLi, XSS, RCE, path traversal, and protocol attacks via the OWASP Core Rule Set (CRS v4) — before requests reach any application service.

**Why Coraza (not Safeline CE):**
- Coraza runs as a `WasmPlugin` *inside* the existing Istio Envoy ingressgateway — zero extra network hops, no disruption to Kiali observability or mTLS chain.
- Safeline CE would require an additional reverse proxy hop outside Istio, break the clean traffic lineage in Kiali, and cannot be managed by ArgoCD.
- OWASP CRS is industry-standard, auditable, and community-maintained.

**Repos involved:**
- `hpe-merch-config` — GitOps config repo (ArgoCD source of truth)
- `merch-source-code` — Application source code (read-only for this plan)

**Cluster:**
- Dev cluster worker node: `workervm1` at `192.168.56.11`
- Istio IngressGateway LoadBalancer IP: `192.168.56.201`
- Jump box: `arcade@117.250.206.138`

**Current traffic flow (unchanged by this plan):**
```
Internet → Jump Box NGINX (117.250.206.138)
         → Istio IngressGateway (192.168.56.201)
         → Service Mesh → Apps (nitte-dev namespace)
```

**New traffic flow (after this plan):**
```
Internet → Jump Box NGINX (117.250.206.138)
         → Istio IngressGateway + [Coraza WasmPlugin intercepts here]
         → Service Mesh → Apps (nitte-dev namespace)
```

---

## Architecture Decision: WASM vs Operator

Use the **`WasmPlugin` CRD** approach (not the Coraza Kubernetes Operator). Reason:
- The Operator (`coraza-kubernetes-operator`) is in the OWASP networking incubator and not yet production-stable.
- `WasmPlugin` is a first-class Istio API, stable since Istio 1.12, fully GitOps-compatible.
- The pre-built OCI image `ghcr.io/corazawaf/coraza-proxy-wasm` contains the engine + OWASP CRS bundled.

---

## Phase 1 — Pre-flight Checks

> **Goal:** Confirm the cluster is ready to load a WasmPlugin before writing any YAML.

### 1.1 — Verify Istio Version

SSH into the dev cluster and confirm Istio supports WasmPlugin:

```bash
# From jump box:
ssh worker1@192.168.56.11

# On dev cluster:
kubectl -n istio-system get pods
kubectl -n istio-system exec -it deploy/istiod -- pilot-agent version
```

**Expected:** Istio >= 1.12. WasmPlugin is GA in 1.18+. Note the exact version for step 1.2.

### 1.2 — Check IngressGateway Pod is Healthy

```bash
kubectl -n istio-system get pods -l istio=ingressgateway
kubectl -n istio-system get svc istio-ingressgateway
```

**Expected:** 1/1 Running, EXTERNAL-IP = `192.168.56.201`.

### 1.3 — Verify Dev Cluster Can Pull from GHCR

The IngressGateway pod (on `workervm1`) must be able to pull the Coraza WASM OCI image. Test connectivity:

```bash
# On dev cluster node:
curl -I https://ghcr.io
```

**Expected:** HTTP 200 or 301. If the node has no internet access, see the "Air-Gapped Fallback" note at the end of this document.

### 1.4 — Confirm ArgoCD is Syncing Correctly

From the jump box, verify the `downstream-dev` ArgoCD app is Synced/Healthy before starting:

```bash
# Via SOCKS proxy or from jump box browser:
# ArgoCD UI: http://argocd.192.168.56.10.nip.io
# OR:
kubectl -n argocd get application downstream-dev -o jsonpath='{.status.sync.status}'
```

**Expected:** `Synced`

---

## Phase 2 — Create the WAF Manifest Directory

> **Repo:** `hpe-merch-config`  
> **Goal:** Add a clean, isolated directory for all Coraza WAF resources. Keep WAF config separate from the main app stack so it can be toggled independently.

### 2.1 — Create the Directory

```
hpe-merch-config/
└── downstream-clusters/
    └── waf/                          ← NEW directory (create this)
        ├── kustomization.yaml        ← NEW
        ├── coraza-wasm-plugin.yaml   ← NEW (the WasmPlugin CRD)
        └── coraza-rules-configmap.yaml  ← NEW (custom rule overrides)
```

Create the directory:

```bash
mkdir -p /home/pskth/projects/hpe-merch-config/downstream-clusters/waf
```

---

## Phase 3 — Write the WasmPlugin Manifest

> **File to create:** `downstream-clusters/waf/coraza-wasm-plugin.yaml`

### 3.1 — Understanding the WasmPlugin Fields

| Field | Value | Reason |
|-------|-------|--------|
| `namespace` | `istio-system` | Must be in istio-system to target the ingressgateway |
| `selector.matchLabels` | `istio: ingressgateway` | Targets only the gateway pod, not sidecars |
| `url` | `oci://ghcr.io/corazawaf/coraza-proxy-wasm:v0.7.0` | Pre-built OCI image with OWASP CRS bundled |
| `phase` | `AUTHN` | Runs before AuthN/AuthZ — WAF must see raw request first |
| `pluginConfig.rules` | (see below) | SecLang directives loaded into the engine |

### 3.2 — Phase Strategy (CRITICAL — Start in DetectionOnly)

> ⚠️ **DO NOT set `SecRuleEngine On` on day one.**  
> The OWASP CRS will generate false positives on your Keycloak OIDC flows, multipart form uploads (product images via MinIO), and the Unleash feature flag API calls.  
> Always start with `SecRuleEngine DetectionOnly`, observe logs, tune exclusions, then switch to `On`.

**Rollout phases:**
1. **Phase A (Day 1–3):** `SecRuleEngine DetectionOnly` — log-only, zero blocking. Monitor Kiali + logs.
2. **Phase B (Day 4–7):** Add exclusion rules for known false positives. Switch to `SecRuleEngine On`.
3. **Phase C (Ongoing):** Tune CRS paranoia level and add application-specific exclusions.

### 3.3 — The Manifest

Create the file `downstream-clusters/waf/coraza-wasm-plugin.yaml` with the following content:

```yaml
# ─────────────────────────────────────────────────────────────────────────────
# Coraza WAF — Istio WasmPlugin
# Deployed at the IngressGateway (istio-system) to inspect ALL inbound traffic
# before it reaches any VirtualService routing or AuthorizationPolicy.
#
# ROLLOUT PHASES:
#   Phase A (current): SecRuleEngine DetectionOnly — observe only, no blocking
#   Phase B: Add exclusions → switch SecRuleEngine to On
#   Phase C: Tune paranoia level (default PL1, increase to PL2 after tuning)
# ─────────────────────────────────────────────────────────────────────────────
apiVersion: extensions.istio.io/v1alpha1
kind: WasmPlugin
metadata:
  name: coraza-waf
  namespace: istio-system
  labels:
    app.kubernetes.io/name: coraza-waf
    app.kubernetes.io/component: security
    app.kubernetes.io/managed-by: argocd
spec:
  selector:
    matchLabels:
      istio: ingressgateway
  url: oci://ghcr.io/corazawaf/coraza-proxy-wasm:v0.7.0
  phase: AUTHN
  priority: 10
  pluginConfig:
    rules: |
      # ── Engine Mode ──────────────────────────────────────────────────────────
      # PHASE A: Detection only. Change to "On" after tuning exclusions.
      SecRuleEngine DetectionOnly

      # ── Request Body Inspection ───────────────────────────────────────────────
      SecRequestBodyAccess On
      SecRequestBodyLimit 13107200
      SecRequestBodyLimitAction ProcessPartial

      # ── Response Body Inspection ──────────────────────────────────────────────
      SecResponseBodyAccess On
      SecResponseBodyMimeType text/plain text/html text/xml application/json
      SecResponseBodyLimit 524288
      SecResponseBodyLimitAction ProcessPartial

      # ── OWASP CRS v4 — Core Rule Set ─────────────────────────────────────────
      # The OCI image bundles these at the paths below.
      Include @coraza.conf-recommended
      Include @crs-setup.conf.example
      Include @owasp_crs/*.conf

      # ── CRS Tuning: Paranoia Level ────────────────────────────────────────────
      # PL1 = permissive baseline (low false-positives, good starting point)
      # PL2 = adds stricter checks (tune to PL2 after Phase B is stable)
      SecAction \
        "id:900000, \
        phase:1, \
        nolog, \
        pass, \
        t:none, \
        setvar:tx.paranoia_level=1"

      # ── Application-Specific Exclusions ──────────────────────────────────────
      # These prevent false positives from known-good application traffic.

      # Keycloak: OIDC token endpoints send large base64 payloads — exclude body checks
      SecRule REQUEST_URI "@beginsWith /realms" \
        "id:1000,phase:1,pass,nolog,ctl:ruleRemoveTargetById=200001;REQUEST_BODY"

      # Keycloak admin console (internal only, but gateway still sees it)
      SecRule REQUEST_URI "@beginsWith /auth" \
        "id:1001,phase:1,pass,nolog,ctl:ruleRemoveTargetById=200001;REQUEST_BODY"

      # MinIO presigned URLs contain long query strings that trip scanner rules
      SecRule REQUEST_URI "@beginsWith /api/v1/images" \
        "id:1002,phase:1,pass,nolog,ctl:ruleRemoveById=920230"

      # Unleash feature flags API — sends JSON arrays that look like injections
      SecRule REQUEST_URI "@beginsWith /api/client" \
        "id:1003,phase:1,pass,nolog,ctl:ruleRemoveTargetById=942100;REQUEST_BODY"

      # ── Logging ───────────────────────────────────────────────────────────────
      # Log all detected violations (even in DetectionOnly mode)
      SecAuditEngine RelevantOnly
      SecAuditLogParts ABIJDEFHZ
      SecAuditLog /dev/stdout
```

> **Note on image tag:** Pin to a specific semver tag (e.g., `v0.7.0`), never use `latest` in production. Check https://github.com/corazawaf/coraza-proxy-wasm/releases for the latest stable release before writing the manifest.

---

## Phase 4 — Write the Custom Rules ConfigMap (Optional Override Layer)

> **File to create:** `downstream-clusters/waf/coraza-rules-configmap.yaml`  
> **Purpose:** Provides a place to add/modify rules without rebuilding the WasmPlugin image. Referenced in Phase B when you need rapid rule changes.

> ⚠️ **Note:** The current WASM architecture has limitations loading external files at runtime. This ConfigMap is prepared for the Coraza Kubernetes Operator (future) or for documentation purposes. For now, all rules go directly in the `pluginConfig.rules` field above.  
> **Skip creating this file for Phase A. Revisit in Phase B.**

---

## Phase 5 — Write the Kustomization

> **File to create:** `downstream-clusters/waf/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

# Namespace is istio-system — the WasmPlugin must live there to
# target the ingressgateway. This is intentionally NOT nitte-dev.
namespace: istio-system

resources:
  - coraza-wasm-plugin.yaml
```

---

## Phase 6 — Wire the WAF into the Existing ArgoCD Application

> **Goal:** The WAF resources should be managed by ArgoCD. Decide on the ArgoCD app strategy:

### Option A: Add to the existing `downstream-dev` ArgoCD Application (Recommended)

The existing `downstream-dev` app already manages `downstream-clusters/overlays/dev/`.  
Add the waf directory as an additional Kustomize resource from the dev overlay.

Edit `downstream-clusters/overlays/dev/kustomization.yaml`, adding a reference to the waf base:

```yaml
# In downstream-clusters/overlays/dev/kustomization.yaml
# ADD this to the resources list:
resources:
  - namespace.yaml
  - ../../base
  - mesh.yaml
  - ../../waf       # ← ADD THIS LINE
```

> ⚠️ **Namespace conflict check:** The `waf/kustomization.yaml` sets `namespace: istio-system`.  
> The dev overlay sets `namespace: nitte-dev` globally.  
> The waf kustomization's namespace declaration will override the overlay's namespace for its own resources only — this is correct Kustomize behaviour.  
> **Verify this works** by running `kubectl kustomize downstream-clusters/overlays/dev/ | grep -A2 "coraza-waf"` and confirming `namespace: istio-system` appears on the WasmPlugin.

### Option B: Create a Dedicated ArgoCD Application for WAF (Cleaner Separation)

If you want the WAF independently synced and toggleable, create a new ArgoCD `Application` manifest:

```yaml
# admin-cluster/gitops-system/argocd-waf-app.yaml (NEW)
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: waf-dev
  namespace: argocd
spec:
  project: default
  source:
    repoURL: <your-hpe-merch-config-git-url>
    targetRevision: HEAD
    path: downstream-clusters/waf
  destination:
    server: https://<dev-cluster-api-server>
    namespace: istio-system
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=false
```

**Recommendation for this project: Use Option A** (add to dev overlay) to keep the ArgoCD app count manageable. Use Option B only if you want WAF rollout/rollback independent of app deployments.

---

## Phase 7 — Git Commit and Push

```bash
cd /home/pskth/projects/hpe-merch-config

git add downstream-clusters/waf/
git add downstream-clusters/overlays/dev/kustomization.yaml  # if Option A

git status  # verify only expected files are staged

git commit -m "feat(security): add Coraza WAF WasmPlugin at Istio IngressGateway

- Deploy coraza-proxy-wasm v0.7.0 as Istio WasmPlugin in istio-system
- Targets istio=ingressgateway pods only (not sidecars)
- OWASP CRS v4 loaded with ParanoiaLevel=1
- Phase A: SecRuleEngine DetectionOnly (log-only, no blocking)
- Application-specific exclusions for Keycloak OIDC, MinIO, Unleash
- Wired into downstream-dev via overlays/dev/kustomization.yaml"

git push origin main
```

---

## Phase 8 — Verify ArgoCD Syncs the WasmPlugin

After pushing, monitor ArgoCD:

```bash
# Wait for sync (from jump box with SOCKS or directly):
kubectl -n argocd get application downstream-dev -w
```

**Expected:** App transitions to `Syncing` → `Synced` / `Healthy`.

If sync fails, check:
```bash
kubectl -n argocd describe application downstream-dev | tail -30
```

Common failure modes:
- `WasmPlugin` CRD not installed → Istio version too old (needs 1.18+)
- Image pull failure → Dev node has no internet access (see Air-Gapped Fallback)
- Namespace override not working → Run the `kubectl kustomize` dry-run in Phase 6

---

## Phase 9 — Verify the WasmPlugin is Loaded

### 9.1 — Confirm the WasmPlugin Object Exists

```bash
kubectl -n istio-system get wasmplugin
```

**Expected:**
```
NAME         AGE
coraza-waf   Xm
```

### 9.2 — Confirm the IngressGateway Loaded the Plugin

```bash
kubectl -n istio-system logs deploy/istio-ingressgateway | grep -i "wasm\|coraza" | tail -20
```

**Expected:** Lines like `wasm: loading module from...` or `[coraza]`. No error lines.

### 9.3 — Confirm Plugin is Active via Istio Proxy Status

```bash
kubectl -n istio-system exec -it deploy/istio-ingressgateway -- \
  pilot-agent request GET /config_dump | grep -i "coraza\|wasm" | head -10
```

**Expected:** The filter appears in the config dump.

---

## Phase 10 — Functional Testing (Phase A — Detection Mode)

### 10.1 — Send a Benign Request (Must Pass)

```bash
curl -s -o /dev/null -w "%{http_code}" \
  https://frontend.117.250.206.138.nip.io/
```
**Expected:** `200`

```bash
curl -s -o /dev/null -w "%{http_code}" \
  https://api.117.250.206.138.nip.io/api/v1/products
```
**Expected:** `200`

### 10.2 — Send an Attack Request (Must Be Logged, NOT Blocked in Phase A)

```bash
# Classic SQLi attempt — should be DETECTED but NOT blocked (DetectionOnly)
curl -s -o /dev/null -w "%{http_code}" \
  "https://api.117.250.206.138.nip.io/api/v1/products?id=1'+OR+'1'='1"
```
**Expected:** `200` (pass-through in DetectionOnly) — but logged.

```bash
# XSS attempt
curl -s -o /dev/null -w "%{http_code}" \
  "https://frontend.117.250.206.138.nip.io/?q=<script>alert(1)</script>"
```
**Expected:** `200` (DetectionOnly) — but logged.

### 10.3 — Check WAF Logs for Detections

```bash
kubectl -n istio-system logs deploy/istio-ingressgateway \
  --since=5m | grep -i "ModSecurity\|coraza\|OWASP\|audit" | tail -30
```

**Expected:** Log entries showing the rule that matched (rule ID, message, URI). Example:
```
[coraza] [WARN] Triggered rule 942100 (SQL Injection) on GET /api/v1/products?id=...
```

### 10.4 — Test Keycloak Login (Must Not Be Broken)

Manually visit `https://frontend.117.250.206.138.nip.io` in a browser.  
Log in with `alumni@nitte.edu` / `alumni@123`.  
**Expected:** Login completes successfully. No 403 or connection error.

Also test admin login at `https://admin.117.250.206.138.nip.io`.

If login fails, check logs for the Keycloak exclusion rules (IDs 1000, 1001) firing incorrectly.

### 10.5 — Test Product Image Upload (Must Not Be Broken)

Log in as a merchant (`merchant-admin@nitte.edu` / `MerchantAdmin@123`) and attempt to upload a product image.  
**Expected:** Upload succeeds. If it fails, check for rule ID 920230 (which was excluded for MinIO paths).

---

## Phase 11 — Observability Integration

### 11.1 — View WAF Telemetry in Kiali

Since Coraza runs inside the Envoy filter chain of the ingressgateway, all traffic it processes is already part of the Istio telemetry pipeline:

1. Open Kiali: `http://kiali.192.168.56.201.nip.io`
2. Navigate to **Traffic Graph** → select `istio-system` namespace
3. The IngressGateway node now shows the full request flow including WAF-processed requests
4. WAF-rejected requests (Phase B) will appear as `4xx` responses in the graph

### 11.2 — View WAF Logs in Grafana/Loki

WAF audit logs go to stdout of the ingressgateway pod, which Promtail already ships to Loki:

1. Open Grafana: `http://grafana.192.168.56.10.nip.io`
2. Navigate to **Explore** → select **Loki** datasource
3. Query: `{app="istio-ingressgateway"} |= "coraza"`
4. You should see the WAF detection events as structured log lines

---

## Phase 12 — Phase B: Enable Blocking Mode

> **Do this only after:**
> - [ ] Phase A has been running for 3–7 days
> - [ ] You have reviewed all WAF detection logs
> - [ ] You have identified and added exclusions for all false positives
> - [ ] All functional tests in Phase 10 pass cleanly

### 12.1 — Review False Positives

```bash
# Get all triggered rule IDs from the last 7 days
kubectl -n istio-system logs deploy/istio-ingressgateway \
  --since=168h | grep "coraza" | grep -oP 'id:\d+' | sort | uniq -c | sort -rn
```

For each frequently triggered rule ID, decide:
- Is this a genuine attack? → Keep the rule.
- Is this legitimate app traffic? → Add an exclusion to `pluginConfig.rules`.

### 12.2 — Enable Blocking

Edit `downstream-clusters/waf/coraza-wasm-plugin.yaml`:

```yaml
# Change this line:
      SecRuleEngine DetectionOnly
# To:
      SecRuleEngine On
```

Commit and push. ArgoCD will sync and the ingressgateway will restart the filter with blocking enabled.

### 12.3 — Verify Blocking is Active

```bash
# This request should now return 403 Forbidden
curl -s -o /dev/null -w "%{http_code}" \
  "https://api.117.250.206.138.nip.io/api/v1/products?id=1'+OR+'1'='1"
```
**Expected:** `403`

---

## Phase 13 — Phase C: Hardening (Post-Blocking Stability)

Once blocking is stable for 1+ week:

### 13.1 — Increase Paranoia Level to 2

In `pluginConfig.rules`, change:
```
setvar:tx.paranoia_level=1
```
to:
```
setvar:tx.paranoia_level=2
```

Re-run all functional tests. Expect more false positives — add exclusions as needed.

### 13.2 — Add Rate Limiting Complement

Coraza handles L7 content inspection. Add Istio-native rate limiting to complement it:

```yaml
# downstream-clusters/waf/rate-limit.yaml (NEW in Phase C)
# Uses Envoy's local rate limiting — no external rate limit service needed
apiVersion: networking.istio.io/v1alpha3
kind: EnvoyFilter
metadata:
  name: ratelimit-ingressgateway
  namespace: istio-system
spec:
  workloadSelector:
    labels:
      istio: ingressgateway
  configPatches:
    - applyTo: HTTP_FILTER
      match:
        context: GATEWAY
        listener:
          filterChain:
            filter:
              name: envoy.filters.network.http_connection_manager
      patch:
        operation: INSERT_BEFORE
        value:
          name: envoy.filters.http.local_ratelimit
          typed_config:
            "@type": type.googleapis.com/udpa.type.v1.TypedStruct
            type_url: type.googleapis.com/envoy.extensions.filters.http.local_ratelimit.v3.LocalRateLimit
            value:
              stat_prefix: local_rate_limiter
              token_bucket:
                max_tokens: 1000
                tokens_per_fill: 1000
                fill_interval: 60s
              filter_enabled:
                runtime_key: local_rate_limit_enabled
                default_value:
                  numerator: 100
                  denominator: HUNDRED
              filter_enforced:
                runtime_key: local_rate_limit_enforced
                default_value:
                  numerator: 100
                  denominator: HUNDRED
              response_headers_to_add:
                - append: false
                  header:
                    key: x-local-rate-limit
                    value: "true"
```

---

## File Summary — What to Create

| File | Action | Notes |
|------|--------|-------|
| `downstream-clusters/waf/coraza-wasm-plugin.yaml` | **CREATE** | The WasmPlugin CRD |
| `downstream-clusters/waf/kustomization.yaml` | **CREATE** | Kustomize entry for waf dir |
| `downstream-clusters/overlays/dev/kustomization.yaml` | **EDIT** | Add `../../waf` to resources |

---

## Rollback Procedure

If the WAF causes issues after sync, rollback is a single git revert:

```bash
cd /home/pskth/projects/hpe-merch-config
git revert HEAD --no-edit
git push origin main
```

ArgoCD will sync and the WasmPlugin will be deleted. The IngressGateway will return to its pre-WAF state within ~30 seconds.

---

## Air-Gapped Fallback (If Dev Node Cannot Reach GHCR)

If `curl -I https://ghcr.io` from `workervm1` fails:

1. Pull the image on a machine with internet access:
   ```bash
   docker pull ghcr.io/corazawaf/coraza-proxy-wasm:v0.7.0
   docker tag ghcr.io/corazawaf/coraza-proxy-wasm:v0.7.0 192.168.56.10:30082/coraza/coraza-proxy-wasm:v0.7.0
   docker push 192.168.56.10:30082/coraza/coraza-proxy-wasm:v0.7.0
   ```

2. Update the WasmPlugin URL:
   ```yaml
   url: oci://192.168.56.10:30082/coraza/coraza-proxy-wasm:v0.7.0
   ```

3. The Nexus registry at `192.168.56.10:30082` is already trusted by the dev cluster nodes.

---

## Reference Links

- Coraza proxy-wasm releases: https://github.com/corazawaf/coraza-proxy-wasm/releases
- OWASP CRS v4 documentation: https://coreruleset.org/docs/
- Istio WasmPlugin API: https://istio.io/latest/docs/reference/config/proxy_extensions/wasm-plugin/
- Coraza SecLang reference: https://coraza.io/docs/seclang/
- CVE tracker for Coraza: https://github.com/corazawaf/coraza/security/advisories

---

## Success Criteria Checklist

- [ ] `kubectl -n istio-system get wasmplugin coraza-waf` returns the resource
- [ ] IngressGateway logs show Coraza loading successfully (no WASM errors)
- [ ] Benign requests to all public URLs return 2xx (no regressions)
- [ ] SQLi test request is visible in Kiali/Loki logs as a detected event
- [ ] Keycloak login works end-to-end for all user roles
- [ ] Product image upload via merchant portal works
- [ ] ArgoCD shows `downstream-dev` as Synced/Healthy
