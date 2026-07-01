# MetalLB — What Was Added and Why

> Added: 2026-06-30
> Cluster: admin (192.168.56.10, single-node RKE2)
> Mode: Layer 2 (L2)

---

## What is MetalLB?

Kubernetes has a `Service` type called `LoadBalancer`. In a cloud environment (AWS, GCP, Azure),
requesting a LoadBalancer service causes the cloud provider to automatically provision an external
IP and route traffic to your pod. On a bare-metal or VM-based cluster like this one, there is no
cloud provider, so requesting a LoadBalancer service gets you a service that stays in `<pending>`
forever — nothing ever assigns it an external IP.

MetalLB fills that gap. It runs inside the cluster and watches for LoadBalancer services. When it
sees one, it picks an IP from a configured pool and announces it to the network, so external
traffic reaches the right node and port.

---

## Why was it added here?

The admin cluster runs on `192.168.56.10` using RKE2. It already has NGINX Ingress for HTTP/HTTPS
routing. MetalLB is added to handle any services that need a dedicated external IP at the TCP/UDP
level — not behind the Ingress controller. Examples in this stack:

- Services that can't go through HTTP Ingress (non-HTTP protocols)
- Future downstream cluster agents connecting via stable IPs
- Any component that issues a `type: LoadBalancer` service (some Helm charts do this by default)

Without MetalLB those services would sit pending forever on a bare-metal cluster.

---

## What was added to the repo

### 1. `admin-cluster/network-system/metallb-config.yaml`

Two Kubernetes custom resources (CRs) that configure MetalLB's behaviour:

**IPAddressPool — `admin-pool`**

```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: admin-pool
  namespace: metallb-system
spec:
  addresses:
    - 192.168.56.240-192.168.56.250
  autoAssign: true
  avoidBuggyIPs: true
```

This tells MetalLB it has 11 IPs to hand out: `.240` through `.250` on the `192.168.56.0/24`
network. The node IPs (`.10`, `.11`, `.12`) are well clear of this range.

- `autoAssign: true` — MetalLB picks the next free IP automatically when a LoadBalancer service
  appears. You can also pin a specific IP by annotating the service.
- `avoidBuggyIPs: true` — skips `.0` and `.255` (broadcast addresses). Not needed here since the
  range starts at `.240`, but it's a safe default.

**L2Advertisement — `admin-l2`**

```yaml
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: admin-l2
  namespace: metallb-system
spec:
  ipAddressPools:
    - admin-pool
```

This tells MetalLB to advertise IPs from `admin-pool` using Layer 2 (ARP/NDP). In L2 mode,
MetalLB's speaker pod responds to ARP requests on the LAN for the assigned IPs, so the router or
host OS knows to send traffic to this node. No BGP router is required — this works on a plain
VirtualBox host-only network.

### 2. `admin-cluster/namespaces.yaml` — `metallb-system` namespace added

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: metallb-system
  labels:
    pod-security.kubernetes.io/enforce: privileged
    pod-security.kubernetes.io/audit: privileged
    pod-security.kubernetes.io/warn: privileged
```

MetalLB's **speaker** pod needs to use host networking and raw sockets to send ARP packets.
Kubernetes Pod Security Admission (PSA) blocks that by default. The `privileged` label on the
namespace allows it. This is standard and expected for MetalLB — their own install docs require it.

### 3. `admin-cluster/kustomization.yaml` — wired in

```yaml
# --- Networking (MetalLB config — operator installed out-of-band) ---
- network-system/metallb-config.yaml
```

ArgoCD watches `admin-cluster/kustomization.yaml` and assembles everything listed there via
Kustomize. Adding this line means ArgoCD will apply the `IPAddressPool` and `L2Advertisement`
CRs automatically on its next sync.

---

## What was NOT added (and must be done manually first)

The two CRs above are *configuration*. They depend on MetalLB's own controllers and CRDs being
installed in the cluster first. Like ArgoCD and the local-path-provisioner in this repo, the
MetalLB operator is installed **out-of-band** (once, manually) before ArgoCD takes over:

```bash
# Install MetalLB operator and CRDs (run once before ArgoCD syncs)
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.8/config/manifests/metallb-native.yaml

# Wait for the controller and speaker to be ready
kubectl wait -n metallb-system \
  --for=condition=ready pod \
  --selector=app=metallb \
  --timeout=120s
```

If ArgoCD syncs the config CRs before this step, it will error with "no matches for kind
IPAddressPool" — the CRDs simply don't exist yet. Running the install above first prevents that.

---

## How the full picture fits together

```
LAN (192.168.56.0/24)
        │
        │  ARP for 192.168.56.240-250
        ▼
  MetalLB speaker (DaemonSet, metallb-system)
        │  assigns IP from admin-pool
        ▼
  Kubernetes Service (type: LoadBalancer)
        │
        ▼
  Your pod / container
```

NGINX Ingress still handles all HTTP/HTTPS routing on port 80/443 via the `*.192.168.56.10.nip.io`
pattern. MetalLB sits alongside it and only activates when something explicitly requests a
`LoadBalancer` service — the two do not conflict.

---

## IP range note

The pool `192.168.56.240-192.168.56.250` was chosen to avoid the node IPs:

| IP | Role |
|----|------|
| 192.168.56.10 | Admin cluster node |
| 192.168.56.11 | Dev cluster node (planned) |
| 192.168.56.12 | Prod cluster node (planned) |
| 192.168.56.240-250 | **MetalLB pool (this config)** |

If any of these addresses are already claimed by other devices on your VirtualBox host-only
network, adjust the range in `admin-cluster/network-system/metallb-config.yaml` before applying.
