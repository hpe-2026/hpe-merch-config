// NITTE Alumni Shop — CI/CD pipeline
// Builds service images with Kaniko (no Docker daemon; cluster is containerd),
// pushes them to the Nexus registry, bumps the image tags in
// k8s/base/kustomization.yaml, and pushes to main so ArgoCD deploys nitte-dev.
//
// One-time prerequisites (see docs/CICD_PIPELINE.md):
//   - Secret  jenkins/kaniko-docker-config  (Nexus auth for Kaniko)
//   - Jenkins credential id 'github-token'   (username + PAT to push to GitHub)

pipeline {
  agent {
    kubernetes {
      defaultContainer 'kaniko'
      yaml '''
apiVersion: v1
kind: Pod
metadata:
  labels:
    app: nitte-ci
  annotations:
    sidecar.istio.io/inject: "false"
spec:
  nodeSelector:
    kubernetes.io/hostname: workervm1
  containers:
  - name: kaniko
    image: gcr.io/kaniko-project/executor:v1.20.0-debug
    command: ["/busybox/cat"]
    tty: true
    resources:
      requests: { memory: "512Mi", cpu: "250m" }
      limits:   { memory: "1536Mi", cpu: "1000m" }
    volumeMounts:
    - name: docker-config
      mountPath: /kaniko/.docker
  - name: tools
    image: alpine/git:latest
    command: ["cat"]
    tty: true
    resources:
      requests: { memory: "128Mi", cpu: "100m" }
      limits:   { memory: "256Mi", cpu: "500m" }
  volumes:
  - name: docker-config
    secret:
      secretName: kaniko-docker-config
      items:
      - key: config.json
        path: config.json
'''
    }
  }

  parameters {
    string(name: 'SERVICES', defaultValue: 'all',
           description: 'Space-separated services to build, or "all". ' +
                        'Valid: node-backend python-service frontend admin-dashboard merchant-portal notification-service loki-rbac-proxy')
  }

  environment {
    REGISTRY = '192.168.56.10:30082'
    TAG      = "1.1.${BUILD_NUMBER}"
    ALL_SVCS = 'node-backend python-service frontend admin-dashboard merchant-portal notification-service loki-rbac-proxy'
    KUSTOMIZATION = 'k8s/base/kustomization.yaml'
  }

  options {
    timeout(time: 40, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '15'))
  }

  stages {
    stage('Checkout') {
      steps {
        container('tools') {
          checkout scm
          sh 'git rev-parse --short HEAD > .gitsha && echo "Building tag $TAG from $(cat .gitsha)"'
        }
      }
    }

    stage('Build & Push (Kaniko)') {
      steps {
        container('kaniko') {
          sh '''
            set -e
            SVCS="$SERVICES"
            [ "$SVCS" = "all" ] && SVCS="$ALL_SVCS"
            for s in $SVCS; do
              if [ ! -f "$s/Dockerfile" ]; then
                echo "!! $s/Dockerfile not found — skipping"; continue
              fi
              echo "================ building $REGISTRY/$s:$TAG ================"
              /kaniko/executor \
                --context="dir://$(pwd)/$s" \
                --dockerfile="Dockerfile" \
                --destination="$REGISTRY/$s:$TAG" \
                --insecure --skip-tls-verify --insecure-pull \
                --cache=false --cleanup
            done
          '''
        }
      }
    }

    stage('Bump tags & deploy (GitOps)') {
      steps {
        container('tools') {
          withCredentials([usernamePassword(credentialsId: 'github-token',
                                             usernameVariable: 'GH_USER',
                                             passwordVariable: 'GH_TOKEN')]) {
            sh '''
              set -e
              apk add --no-cache wget >/dev/null 2>&1 || true
              wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/download/v4.44.3/yq_linux_amd64
              chmod +x /usr/local/bin/yq

              SVCS="$SERVICES"
              [ "$SVCS" = "all" ] && SVCS="$ALL_SVCS"
              for s in $SVCS; do
                yq -i "(.images[] | select(.name == \\"$s\\") | .newTag) = \\"$TAG\\"" "$KUSTOMIZATION"
                echo "set $s -> $TAG"
              done

              git config user.email "ci@nitte.local"
              git config user.name  "jenkins-ci"
              git add "$KUSTOMIZATION"
              if git diff --cached --quiet; then
                echo "No tag changes to commit."
              else
                git commit -m "ci: deploy [$SVCS] at $TAG (build $BUILD_NUMBER)"
                git push "https://${GH_USER}:${GH_TOKEN}@github.com/pall111/HPE-merchendise-latest.git" HEAD:main
                echo "Pushed tag bump — ArgoCD will sync nitte-dev."
              fi
            '''
          }
        }
      }
    }
  }

  post {
    success { echo "CI complete: images $TAG pushed to $REGISTRY; manifests updated. ArgoCD deploys nitte-dev." }
    failure { echo "CI failed — check the stage logs above." }
  }
}
