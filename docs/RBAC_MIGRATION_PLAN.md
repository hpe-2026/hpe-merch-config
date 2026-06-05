# RBAC Migration Plan - 4 Phases

This document outlines the gradual migration to enterprise-grade RBAC using Keycloak.

---

## Phase 1: Fix Role Hierarchy ✅ IN PROGRESS

### Goals
- Create proper realm roles for user types
- Create client roles for service-level permissions
- Update backend to check both realm and client roles
- Add role mapping helpers

### Keycloak Configuration Needed

#### 1. Realm Roles (in nitte-realm)
```
platform-admin       - God mode, full access
merchant-admin       - Can manage their own merchant products/orders
merchant-staff       - Can view and update orders, read products
alumni-verified      - Can place orders, view products
alumni-pending       - Can login but cannot purchase (awaiting approval)
support-agent        - Read-only access for customer support
```

#### 2. Client Roles (in nitte-client)
```
Backend API Client Roles:
├── order:create
├── order:read-own
├── order:read-merchant-all
├── order:update-status
├── order:cancel-own
├── product:create
├── product:read
├── product:update-own
├── product:delete-own
├── user:read-own
├── user:update-own
└── admin:all
```

#### 3. Role Mappings (Keycloak Configuration)
```
platform-admin (realm)
  → inherits: admin:all (client)

merchant-admin (realm)
  → inherits: order:read-merchant-all, product:create, product:update-own, product:delete-own

merchant-staff (realm)
  → inherits: order:read-merchant-all, order:update-status, product:read

alumni-verified (realm)
  → inherits: order:create, order:read-own, order:cancel-own, product:read, user:read-own, user:update-own

alumni-pending (realm)
  → inherits: product:read, user:read-own (no order permissions)
```

### Backend Changes

1. **Update `extractUserInfo`** to capture both realm and client roles
2. **Add role checking middleware** that supports:
   - `requireRealmRoles(['alumni-verified'])`
   - `requireClientRoles(['order:create'])`
   - `requireAnyRole(['realm:admin', 'client:order:read-all'])`
3. **Update route handlers** to use new role checks

### Testing Phase 1
```bash
# Get token and check roles are present in JWT
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return:
{
  "roles": {
    "realm": ["alumni-verified"],
    "client": ["order:create", "product:read"]
  }
}
```

---

## Phase 2: Resource-Level Authorization

### Goals
- Add `userId` and `merchantId` to all database records
- Implement "user can only see THEIR data" checks
- Implement "merchant can only see THEIR products/orders" checks

### Database Schema Updates

#### Products Collection
```javascript
{
  _id: ObjectId,
  name: "Product Name",
  // ... existing fields ...
  ownerId: "user-uuid",           // NEW: Who created it
  merchantId: "merchant-uuid",      // NEW: Which merchant owns it
  createdBy: "user-uuid",          // NEW: Audit field
  updatedBy: "user-uuid",          // NEW: Audit field
  createdAt: Date,
  updatedAt: Date
}
```

#### Orders Collection
```javascript
{
  _id: ObjectId,
  // ... existing fields ...
  userId: "user-uuid",              // NEW: Who placed the order
  merchantId: "merchant-uuid",      // NEW: Which merchant fulfills it
  createdBy: "user-uuid",
  updatedBy: "user-uuid",
  createdAt: Date,
  updatedAt: Date
}
```

#### Users Collection (MongoDB)
```javascript
{
  _id: ObjectId,
  keycloakId: "user-uuid",
  email: "user@example.com",
  // ... existing fields ...
  merchantId: "merchant-uuid",      // NEW: If user belongs to merchant
  roles: ["alumni-verified"],       // DENORMALIZED: Cache of Keycloak roles
  lastRoleSync: Date                // When roles were last synced
}
```

### API Changes

Add middleware `requireResourceOwner()`:

```javascript
// User can only access their own orders
router.get('/orders/:orderId',
  keycloakAuthMiddleware,
  requireClientRoles(['order:read-own']),
  requireResourceOwner({ model: 'Order', ownerField: 'userId' }),
  getOrder
);

// Merchant admin can see all their merchant's orders
router.get('/orders',
  keycloakAuthMiddleware,
  requireAnyRole([
    { type: 'realm', role: 'platform-admin' },
    { type: 'client', role: 'order:read-merchant-all' }
  ]),
  getOrders
);
```

### Testing Phase 2
```bash
# As User A - create order
curl -X POST http://localhost:3000/api/orders ...
# Returns orderId: "order-123"

# As User A - read own order (should succeed)
curl http://localhost:3000/api/orders/order-123 \
  -H "Authorization: Bearer USER_A_TOKEN"

# As User B - try to read User A's order (should fail 403)
curl http://localhost:3000/api/orders/order-123 \
  -H "Authorization: Bearer USER_B_TOKEN"
```

---

## Phase 3: API Gateway Pattern

### Goals
- Move authentication to API Gateway (node-backend acts as gateway)
- Internal services trust headers from gateway
- Implement service-to-service auth with client credentials

### Architecture

```
┌─────────────┐     ┌─────────────────────────┐     ┌─────────────────┐
│   Client    │────▶│    API Gateway          │────▶│  Microservices  │
│  (Browser)  │     │    (node-backend)       │     │                 │
└─────────────┘     └─────────────────────────┘     └─────────────────┘
                              │                              │
                              ▼                              ▼
                        ┌──────────┐                  ┌──────────┐
                        │ Keycloak │                  │ Internal │
                        │          │                  │  Network │
                        └──────────┘                  └──────────┘
```

### Gateway Responsibilities
1. Validate JWT from Keycloak
2. Check roles/permissions
3. Add headers to downstream:
   - `X-User-ID`: user-uuid
   - `X-User-Email`: user@example.com
   - `X-Roles`: realm:alumni-verified,client:order:create
   - `X-Merchant-ID`: merchant-uuid (if applicable)
   - `X-Request-ID`: uuid for tracing

### Service-to-Service Auth
```javascript
// notification-service calling python-service
const token = await getServiceToken('notification-client', 'notification-secret');

await fetch('http://python-service/process', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Request-ID': requestId
  }
});
```

### Testing Phase 3
```bash
# Direct call to internal service (should fail without gateway headers)
curl http://localhost:8000/internal/process
# Expected: 401 Unauthorized

# Call through gateway (should succeed)
curl http://localhost:3000/api/process \
  -H "Authorization: Bearer USER_TOKEN"
```

---

## Phase 4: ABAC & Keycloak Groups

### Goals
- Add Keycloak Groups for organizations
- Implement Attribute-Based Access Control
- Fine-grained permissions based on user attributes

### Keycloak Groups
```
Merchants (group)
├── Amazon Partners (subgroup)
│   ├── merchantId: "amazon-001"
│   └── products: ["electronics", "home"]
├── Flipkart Partners (subgroup)
│   ├── merchantId: "flipkart-002"
│   └── products: ["fashion", "electronics"]
└── Local Stores (subgroup)
    └── merchantId: "local-003"

Class of 2022 (group)
├── graduationYear: 2022
├── alumniDiscount: true
└── earlyAccess: true

Alumni Chapter Bangalore (group)
├── chapter: "bangalore"
└── localEvents: true
```

### ABAC Policies
```javascript
// Can access early bird sale?
const canAccessEarlySale = (
  user.hasGroup('Class of 2022') ||
  user.attributes.earlyAccess === 'true' ||
  user.hasRealmRole('platform-admin')
);

// Can get alumni discount?
const canGetDiscount = (
  user.hasGroup('Class of 2022') &&
  user.attributes.alumniDiscount === 'true' &&
  user.attributes.graduationYear <= 2022
);
```

### JWT with Groups
```json
{
  "sub": "user-123",
  "realm_access": {
    "roles": ["alumni-verified"]
  },
  "groups": [
    "/Merchants/Amazon Partners",
    "/Class of 2022"
  ],
  "attributes": {
    "graduationYear": ["2022"],
    "merchantId": ["amazon-001"]
  }
}
```

### Testing Phase 4
```bash
# User with Class of 2022 group accessing early sale
curl http://localhost:3000/api/sales/early-bird \
  -H "Authorization: Bearer USER_2022_TOKEN"
# Should succeed

# User without group accessing early sale
curl http://localhost:3000/api/sales/early-bird \
  -H "Authorization: Bearer USER_OTHER_TOKEN"
# Should fail 403
```

---

## Migration Timeline

| Phase | Duration | Can Parallelize |
|-------|----------|-----------------|
| Phase 1 | 1-2 days | No (foundation) |
| Phase 2 | 2-3 days | After Phase 1 |
| Phase 3 | 3-4 days | After Phase 2 |
| Phase 4 | 2-3 days | After Phase 3 |

**Total: 1-2 weeks for complete migration**

---

## Rollback Strategy

Each phase is designed to be reversible:
- Phase 1: Old role checks still work alongside new ones
- Phase 2: Database changes are additive (new fields only)
- Phase 3: Internal services can accept both gateway and direct calls during transition
- Phase 4: Group checks are additive to role checks

---

## Testing Checklist

- [ ] Phase 1: JWT contains both realm and client roles
- [ ] Phase 1: API returns 403 for insufficient roles
- [ ] Phase 2: User A cannot see User B's orders
- [ ] Phase 2: Merchant admin sees only their orders
- [ ] Phase 3: Internal service rejects direct calls
- [ ] Phase 3: Gateway headers propagate correctly
- [ ] Phase 4: Group membership affects access
- [ ] Phase 4: Custom attributes work in policies
