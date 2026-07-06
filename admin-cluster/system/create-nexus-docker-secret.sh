#!/bin/bash
# =============================================================================
# create-nexus-docker-secret.sh
#
# Run this script ONCE on the master VM (192.168.56.10) after Nexus is up
# and you have created the 'merch-docker' Docker hosted repository.
#
# This secret is mounted into every Kaniko container at /kaniko/.docker/
# so that Kaniko can authenticate when pushing images to the Nexus registry.
#
# Usage:
#   ssh master@192.168.56.10
#   bash create-nexus-docker-secret.sh
# =============================================================================

set -e

NEXUS_REGISTRY="192.168.56.10:30082"
NEXUS_USER="admin"
NAMESPACE="system"

# ── 1. Prompt for Nexus password ──────────────────────────────────────────────
echo "Enter Nexus admin password (check admin-secrets in the cluster):"
read -rs NEXUS_PASS
echo ""

# ── 2. Build Docker config.json ───────────────────────────────────────────────
AUTH_B64=$(echo -n "${NEXUS_USER}:${NEXUS_PASS}" | base64 -w0)

cat > /tmp/nexus-docker-config.json << EOF
{
  "auths": {
    "${NEXUS_REGISTRY}": {
      "auth": "${AUTH_B64}"
    }
  }
}
EOF

echo "✔ Generated /tmp/nexus-docker-config.json"

# ── 3. Delete old secret if it exists ────────────────────────────────────────
export KUBECONFIG=/etc/rancher/rke2/rke2.yaml
kubectl delete secret nexus-docker-config -n "${NAMESPACE}" --ignore-not-found
echo "✔ Cleared old secret (if any)"

# ── 4. Create the secret ──────────────────────────────────────────────────────
kubectl create secret generic nexus-docker-config \
    --from-file=config.json=/tmp/nexus-docker-config.json \
    -n "${NAMESPACE}"
echo "✔ Secret 'nexus-docker-config' created in namespace '${NAMESPACE}'"

# ── 5. Verify ─────────────────────────────────────────────────────────────────
kubectl get secret nexus-docker-config -n "${NAMESPACE}"
echo ""
echo "Done. The Jenkins pod template will mount this secret at /kaniko/.docker/"

# ── 6. Cleanup ────────────────────────────────────────────────────────────────
rm -f /tmp/nexus-docker-config.json
echo "✔ Cleaned up temp file"
