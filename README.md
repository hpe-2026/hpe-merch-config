# NITTE Alumni Merchandise Shop — Infrastructure & Configuration

This repository contains the cluster orchestration manifests, external tool configuration files, database setup scripts, and host setup scripts for the NITTE Alumni Merchandise Shop platform. 

The custom application code (frontends, backends, and services) is located in the companion **[HPE-merchendise-code](file:///home/pskth/projects/HPE-merchendise-code)** repository.

---

## Repository Structure

```
├── alertmanager/          # Alert routing configuration (alertmanager.yml)
├── database/              # MongoDB sharding initialization script (sharding-init.js)
├── grafana/               # Provisioned datasources + dashboards JSON configs
├── jenkins/               # Jenkins custom Dockerfile & Configuration as Code (Casc)
├── k8s/                   # Kubernetes deployment manifests (25+ services)
│   └── istio/             # Istio Service Mesh routing and security configs
├── keycloak/              # Keycloak realm configs, bootstrap script & theme
├── loki/                  # Grafana Loki storage configuration
├── nexus/                 # Sonatype Nexus custom Dockerfile and SSO credentials
├── prometheus/            # Prometheus scrape targets and alerting rules
├── promtail/              # Promtail logging configuration
├── scripts/               # Admin/telemetry utilities (backup, seed data, alerts)
├── Admin Cluster Services Setup Guide.pdf  # Architectural setup guide
├── docker-compose.yml     # Complete local dev docker compose stack
├── docker-setup.sh        # Local Docker Compose setup runner
├── k8s-setup.sh           # Local Minikube + Istio K8s setup runner
├── Jenkinsfile            # Jenkins CI/CD pipeline definition
└── README.md              # This file
