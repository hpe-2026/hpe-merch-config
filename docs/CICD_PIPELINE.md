# CI/CD Pipeline — Jenkins + SonarQube + Nexus

This document describes the continuous integration pipeline that builds, tests, scans, and publishes the NITTE platform's microservices.

---

## Pipeline Overview

```
Developer
    │  git push (development branch)
    ▼
GitHub ──webhook──► Jenkins
                       │
                       ├── Stage 1: Checkout
                       ├── Stage 2: Build
                       ├── Stage 3: SonarQube Analysis ──► quality gate
                       ├── Stage 4: Build Docker Images
                       ├── Stage 5: Push to Nexus
                       └── Stage 6: Update manifests (optional → triggers ArgoCD)
```

CI (build/test/scan/publish) is handled by **Jenkins**. CD (deployment) is handled by **ArgoCD** (see [GITOPS_ARGOCD.md](./GITOPS_ARGOCD.md)). This separation is the standard GitOps pattern: Jenkins produces artifacts, ArgoCD deploys them.

---

## Tools

| Tool | Role | NodePort |
|------|------|----------|
| Jenkins | Pipeline orchestration | 30081 |
| SonarQube | Code quality + security scanning | 30900 |
| Nexus | Docker registry + artifact store | 30082 |

---

## Stage Breakdown

### Stage 1: Checkout

Jenkins pulls the latest code from the `development` branch via GitHub webhook trigger.

### Stage 2: Build

Each microservice is built:
- **Node services** (`node-backend`, `notification-service`, `loki-rbac-proxy`): `npm ci && npm run build`
- **Frontends** (`frontend`, `admin-dashboard`, `merchant-portal`): `npm ci && npm run build` (Vite production build)
- **Python service**: dependency install + lint

### Stage 3: SonarQube Analysis

SonarQube scans the codebase for:
- Bugs and code smells
- Security vulnerabilities and hotspots
- Code coverage
- Duplication

**Quality Gate**: the pipeline **fails** if the quality gate is not passed (e.g., new critical vulnerabilities, coverage below threshold). This blocks bad code from being containerized.

### Stage 4: Build Container Images

Docker images are built for each service and tagged with the build number + git SHA:
```
<nexus-registry>/node-backend:1.0.0-<build>
<nexus-registry>/frontend:1.0.0-<build>
...
```

### Stage 5: Push to Nexus

Images are pushed to the Nexus Docker registry. Build artifacts (if any) are stored in the Nexus raw/npm repositories.

### Stage 6: Update Manifests (GitOps trigger)

Optionally, Jenkins updates the image tag in the `k8s/` manifests and commits to the `production` branch. ArgoCD detects this change and deploys automatically.

---

## Installing the CI/CD Tools on the Cluster

### SonarQube

```bash
kubectl apply -n nitte-merch -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sonarqube
  namespace: nitte-merch
  labels:
    app: sonarqube
spec:
  replicas: 1
  selector:
    matchLabels:
      app: sonarqube
  template:
    metadata:
      labels:
        app: sonarqube
      annotations:
        sidecar.istio.io/inject: "false"
    spec:
      containers:
      - name: sonarqube
        image: sonarqube:10-community
        ports:
        - containerPort: 9000
        env:
        - name: SONAR_ES_BOOTSTRAP_CHECKS_DISABLE
          value: "true"
        resources:
          requests:
            memory: "1Gi"
            cpu: "300m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        volumeMounts:
        - name: sonar-data
          mountPath: /opt/sonarqube/data
      volumes:
      - name: sonar-data
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: sonarqube
  namespace: nitte-merch
spec:
  type: NodePort
  ports:
  - port: 9000
    targetPort: 9000
    nodePort: 30900
  selector:
    app: sonarqube
EOF
```

> **Note:** SonarQube requires `vm.max_map_count=524288` on the node. On each worker:
> ```bash
> sudo sysctl -w vm.max_map_count=524288
> echo "vm.max_map_count=524288" | sudo tee -a /etc/sysctl.conf
> ```

### Jenkins & Nexus

These already have manifests in the repo:
```bash
kubectl apply -f k8s/jenkins.yaml
kubectl apply -f k8s/nexus.yaml
```

---

## Jenkins Pipeline Definition

The repo includes a `Jenkinsfile` at the root. Example multi-stage structure:

```groovy
pipeline {
  agent any
  environment {
    REGISTRY = 'nexus.nitte-merch.svc:5000'  // or NodePort address
    SONAR_HOST = 'http://sonarqube:9000'
  }
  stages {
    stage('Checkout') {
      steps { checkout scm }
    }
    stage('Build') {
      steps {
        sh 'cd node-backend && npm ci'
        sh 'cd frontend && npm ci && npm run build'
        // ... other services
      }
    }
    stage('SonarQube Analysis') {
      steps {
        withSonarQubeEnv('sonarqube') {
          sh 'sonar-scanner -Dsonar.projectKey=nitte-merch'
        }
      }
    }
    stage('Quality Gate') {
      steps {
        timeout(time: 5, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }
    stage('Build Images') {
      steps {
        sh 'docker build -t $REGISTRY/node-backend:1.0.0-$BUILD_NUMBER ./node-backend'
        // ... other services
      }
    }
    stage('Push to Nexus') {
      steps {
        sh 'docker push $REGISTRY/node-backend:1.0.0-$BUILD_NUMBER'
        // ... other services
      }
    }
    stage('Update Manifests') {
      steps {
        sh '''
          sed -i "s|image: .*/node-backend:.*|image: $REGISTRY/node-backend:1.0.0-$BUILD_NUMBER|" k8s/node-backend.yaml
          git add k8s/ && git commit -m "ci: bump images to build $BUILD_NUMBER"
          git push origin production
        '''
      }
    }
  }
}
```

---

## Access

| Tool | URL (via SSH tunnel) | Credentials |
|------|---------------------|-------------|
| Jenkins | http://localhost:8081 | Keycloak SSO or `local-admin` / `LocalAdmin@123` |
| SonarQube | http://localhost:9009 | `admin` / `admin` (change on first login) |
| Nexus | http://localhost:8082 | `admin` / `nexus-admin-123` |

---

## See Also

- [GITOPS_ARGOCD.md](./GITOPS_ARGOCD.md) — how ArgoCD picks up the images Jenkins publishes
- [KUBERNETES_DEPLOYMENT.md](./KUBERNETES_DEPLOYMENT.md) — full server deployment
