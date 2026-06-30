# Unleash — Feature Flag Configuration

This folder contains the Kubernetes deployment for [Unleash](https://www.getunleash.io/) (open-source feature flag service), used to control role-based UI visibility across the NITTE Merchandise Shop.

## Why Unleash here

Keycloak handles **authentication** — it tells us *who* the user is and what realm role they hold (`merchant-admin`, `alumni-verified`, `admin-internal`, etc.).

Unleash handles **authorization-driven UI rendering** — it tells the frontend/backend *what to show* based on that role, without hardcoding role checks across the codebase.

## Files

- `unleash-deployment.yaml` — Unleash server + dedicated Postgres backend (Deployment, Service, Secret, PVC), namespace `nitte`.

## Feature flags

After deploying, the following 6 flags need to be created in the Unleash UI (or via API), each using a **Standard strategy** with a constraint on the custom context field `role`:

| Flag name | Allowed roles |
|---|---|
| `show-supplier-pages` | `merchant-admin`, `merchant-staff`, `merchant-amazon`, `merchant-flipkart` |
| `show-supplier-nav` | `merchant-admin`, `merchant-staff`, `merchant-amazon`, `merchant-flipkart` |
| `show-shop-pages` | `alumni-verified`, `alumni` |
| `show-add-to-cart` | `alumni-verified`, `alumni` |
| `show-orders-page` | `alumni-verified`, `alumni` |
| `show-admin-pages` | `platform-admin`, `admin-internal` |

The backend (`node-backend/src/services/unleashService.js`) reads the authenticated user's role from their Keycloak JWT and evaluates these flags per-request, exposing them at `GET /api/v1/flags`.

## Notes

- DB credentials are currently inline in the Secret manifest for simplicity (team decision, 30/06/2026) — can be moved to a proper secrets manager later.
- Tested locally end-to-end: merchant and alumni roles confirmed returning correct flag sets via Keycloak JWT → backend → Unleash evaluation chain.