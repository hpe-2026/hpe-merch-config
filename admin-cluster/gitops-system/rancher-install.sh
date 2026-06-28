#!/usr/bin/env bash
###############################################################################
# Rancher Multi-Cluster Manager — Admin Cluster Install Script
# Deploys Rancher into the cattle-system namespace on the Admin RKE2 node.
# After install, import Dev (192.168.56.11) and Prod (192.168.56.12) clusters.
#
# Prerequisites:
#   - RKE2 running on Admin node (192.168.56.10)
#   - kubectl configured and pointing at admin cluster
#   - Helm 3 installed
#   - cert-manager installed (step 1 below)
#
# Usage:
#   chmod +x rancher-install.sh
#   ./rancher-install.sh
###############################################################################
set -euo pipefail

ADMIN_IP="192.168.56.10"
RANCHER_HOSTNAME="rancher.${ADMIN_IP}.nip.io"
RANCHER_VERSION="2.8.4"

echo "[1/5] Adding Helm repos..."
helm repo add rancher-stable https://releases.rancher.com/server-charts/stable
helm repo add jetstack https://charts.jetstack.io
helm repo update

echo "[2/5] Installing cert-manager (required by Rancher for TLS)..."
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.4/cert-manager.crds.yaml
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.14.4 \
  --wait

echo "[3/5] Creating cattle-system namespace..."
kubectl create namespace cattle-system --dry-run=client -o yaml | kubectl apply -f -

echo "[4/5] Installing Rancher ${RANCHER_VERSION}..."
helm upgrade --install rancher rancher-stable/rancher \
  --namespace cattle-system \
  --version "${RANCHER_VERSION}" \
  --set hostname="${RANCHER_HOSTNAME}" \
  --set bootstrapPassword=admin \
  --set ingress.tls.source=letsEncrypt \
  --set letsEncrypt.email=admin@nitte.ac.in \
  --set letsEncrypt.ingress.class=nginx \
  --set replicas=1 \
  --wait

echo "[5/5] Rancher installed. Access at: https://${RANCHER_HOSTNAME}"
echo ""
echo "Next steps:"
echo "  1. Open https://${RANCHER_HOSTNAME} and set admin password"
echo "  2. Import Dev cluster (192.168.56.11):"
echo "       - Cluster Management → Import Existing → Generic"
echo "       - Apply the registration manifest on the Dev node"
echo "  3. Import Prod cluster (192.168.56.12) the same way"
echo "  4. In Rancher → Keycloak integration: map SSO groups to RBAC policies"
echo ""
echo "Register Dev/Prod in ArgoCD (run on Admin node):"
echo "  argocd login argocd.${ADMIN_IP}.nip.io --username admin"
echo "  argocd cluster add <dev-kubeconfig-context>  --name dev"
echo "  argocd cluster add <prod-kubeconfig-context> --name prod"
