# GitOps Layout

This directory uses **Kustomize** so ArgoCD can deploy the same application
stack to two isolated environments.

```
k8s/
├── base/                 # one full stack (Deployments/Services/Jobs/PVCs)
│   ├── kustomization.yaml   # lists resources, rewrites images -> Nexus,
│   │                         # mounts per-app nginx.conf
│   └── *.yaml
├── overlays/
│   ├── dev/              # namespace=nitte-dev, nodeSelector=workervm1
│   └── prod/             # namespace=nitte-prod, nodeSelector=workervm2
```

## What is managed here
- Deployments, Services, Jobs, PVCs (the things that change per release)
- Image references (rewritten to the Nexus registry `192.168.56.10:30082`)
- Per-environment namespace + node pinning

## What is bootstrapped out-of-band (NOT in Git)
- Secrets (`nitte-secrets`)
- ConfigMaps generated from build artifacts / large config files
  (keycloak realm + SPI jar, prometheus, grafana, loki, alertmanager,
  promtail, sharding-init, and the three `*-nginx-conf` maps)

These are created once per namespace during bootstrap. ArgoCD does not prune
them because they are not part of the tracked source.

## Render locally
```bash
kubectl kustomize k8s/overlays/dev
kubectl kustomize k8s/overlays/prod
```

## ArgoCD applications
- `nitte-dev`  -> path `k8s/overlays/dev`,  auto-sync
- `nitte-prod` -> path `k8s/overlays/prod`, manual sync (promotion gate)
