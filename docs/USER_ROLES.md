# User Roles & Credentials Guide

## Quick Overview

| Who | Role | What They Do | Main Service |
|-----|------|--------------|--------------|
| **Alumni/Customer** | alumni-verified | Buy merchandise | Storefront (5173) |
| **Shop Owner** | platform-admin | Manage entire platform | Admin Console (5174) |
| **Merchant** | merchant-admin | Sell their own products | Merchant Portal (5175) |
| **IT Boss** | internal-admin | Manage servers & tools | Jenkins/Grafana (8081/3001) |
| **IT Staff** | internal-user | Monitor servers (view only) | Observability tools |

---

## 1. Platform Admin (The Boss)

**Role:** `platform-admin`

**What they can do:**
- Everything - full control of the entire platform
- Manage all users, products, orders
- Access all admin tools

**Login:**
- **Email:** `admin@nitte.edu`
- **Password:** `admin@123`
- **Services:** Admin Console (5174), Storefront (5173)

---

## 2. Alumni/Customer (The Buyer)

**Role:** `alumni-verified`

**What they can do:**
- Browse products
- Create orders (buy stuff)
- View their own orders

**Login:**
- **Email:** `alumni@nitte.edu`
- **Password:** `alumni@123`
- **Service:** Storefront (5173)

**Guest (no login required):**
- Browse products only
- Cannot buy

---

## 3. Merchant (The Seller)

**Role:** `merchant-admin`

**What they can do:**
- Add/edit/delete their own products
- View/manage orders for their products
- Cannot see other merchants' data

**Logins:**

| Merchant | Email | Password |
|----------|-------|----------|
| NITTE Official | `merchant-admin@nitte.edu` | `MerchantAdmin@123` |
| Amazon Partner | `amazon-merchant@amazon.com` | `Amazon@123` |
| Flipkart Partner | `flipkart-merchant@flipkart.com` | `Flipkart@123` |

**Service:** Merchant Portal (5175)

---

## 4. Internal Admin (IT Department Head)

**Role:** `admin-internal`

**What they can do:**
- Manage CI/CD pipelines (Jenkins)
- Create monitoring dashboards (Grafana)
- Full access to all DevOps tools

**Login:**
- **Email:** `internal-admin@nitte.ac.in`
- **Password:** `InternalAdmin@123`
- **Services:** Jenkins (8081), Grafana (3001), Prometheus (9090), Jaeger (16686)

---

## 5. Internal User (IT Department Staff)

**Role:** `internal-user`

**What they can do:**
- View logs and metrics (read-only)
- Check system health
- Cannot change settings

**Login:**
- **Email:** `internal-user@nitte.ac.in`
- **Password:** `InternalUser@123`
- **Services:** Grafana (viewer), Prometheus, Jaeger (read-only)

---

## All Service URLs

| Service | URL | Who Uses It |
|---------|-----|-------------|
| Storefront | http://localhost:5173 | Alumni/Customers |
| Admin Console | http://localhost:5174 | Platform Admin |
| Merchant Portal | http://localhost:5175 | Merchants |
| Backend API | http://localhost:3000 | Developers |
| Keycloak | http://localhost:8080 | Admin (manage users) |
| Jenkins | http://localhost:8081 | Internal Admin/User |
| Nexus | http://localhost:8082 | Internal (admin/admin123) |
| MinIO | http://localhost:9001 | Internal (minioadmin/minioadmin123) |
| Grafana | http://localhost:3001 | Internal Admin/User |
| Prometheus | http://localhost:9090 | Internal |
| Jaeger | http://localhost:16686 | Internal |
| MongoDB UI | http://localhost:8083 | Admin (admin/admin123) |

---

## RBAC Features Implemented

### Phase 1: Role Hierarchy ✅
- Realm roles: platform-admin, merchant-admin, alumni-verified
- Client roles: order:create, product:create, etc.
- Backend checks both types of roles

### Phase 2: Resource Ownership ✅
- Users can only see THEIR data
- Merchants can only edit THEIR products
- Platform admin can see everything

### Phase 3: API Gateway ✅
- Backend adds headers to downstream requests:
  - `X-User-ID`: who made the request
  - `X-Roles`: what permissions they have
  - `X-Merchant-ID`: their merchant ID (if any)

### Phase 4: ABAC (Advanced) 🔄
- Can check Keycloak groups (e.g., "Class of 2022")
- Can check user attributes (e.g., graduationYear=2022)
- Features ready but need Keycloak configuration
