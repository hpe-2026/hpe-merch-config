# RBAC Policy System Documentation

## Overview

The NITTE Merchandise Shop implements a sophisticated Role-Based Access Control (RBAC) system using dynamic policies stored in MongoDB. This allows administrators to define and modify access control rules without code changes.

## Key Concepts

### Roles

The system recognizes three primary roles:

- **guest** - Unauthenticated users (browser visitors)
- **user** - Authenticated customers
- **admin** - System administrators with full access

### Actions

Actions represent specific operations that can be controlled:

- **Product Management:** `list_products`, `view_product`, `create_product`, `update_product`, `delete_product`, `search_products`
- **Cart Operations:** `add_to_cart`, `remove_from_cart`, `view_cart`, `clear_cart`
- **Orders:** `create_order`, `view_order`, `view_orders`, `manage_orders`
- **Policy Management:** `list_policies`, `view_policy`, `create_policy`, `update_policy`, `delete_policy`, `enable_policy`, `disable_policy`
- **Authentication:** `login`, `signup`, `forgot_password`, `view_profile`, `update_profile`

### Policies

A policy defines what actions can be performed by specific roles, optionally with conditions:

```json
{
  "name": "User - Add to Cart",
  "description": "Allow authenticated users to add items to cart",
  "actions": ["add_to_cart", "remove_from_cart"],
  "roles": ["user"],
  "effect": "allow",
  "conditions": [
    {
      "field": "resource.status",
      "operator": "equals",
      "value": "active"
    }
  ],
  "enabled": true,
  "priority": 100,
  "tags": ["cart", "user"]
}
```

### Policy Properties

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique policy identifier |
| `description` | string | Human-readable description |
| `actions` | array | Actions this policy applies to |
| `roles` | array | Roles this policy applies to (empty = all) |
| `effect` | string | `"allow"` or `"deny"` |
| `conditions` | array | Optional conditions that must be met |
| `enabled` | boolean | Whether policy is active |
| `priority` | number | Evaluation order (higher = first) |
| `tags` | array | Organizational tags for filtering |

## Operators in Conditions

Conditions are evaluated within policies to apply nuanced access control:

- `equals` / `eq` - Exact match
- `notEquals` / `ne` - Not equal
- `in` - Value in array
- `notIn` - Value not in array
- `contains` - String contains substring
- `startsWith` - String starts with value
- `endsWith` - String ends with value
- `greaterThan` / `gt` - Numeric greater than
- `greaterThanOrEqual` / `gte` - Numeric greater than or equal
- `lessThan` / `lt` - Numeric less than
- `lessThanOrEqual` / `lte` - Numeric less than or equal
- `exists` - Field exists/doesn't exist
- `regex` - Regex pattern match

## Default Policies

The system comes with pre-defined default policies covering:

### Product Access

```
Guest → View only active products
User → View active + limited products
Admin → View and manage all products
```

### Cart & Checkout

```
Guest → Cannot add to cart (DENIED)
User → Can add/remove items from active products
Admin → Can view all carts and orders
```

### Policy Management

```
Admin → Full CRUD on policies
User/Guest → Cannot manage policies (DENIED)
```

## Admin API Endpoints

### 1. List Policies

```bash
GET /api/v1/admin/policies
```

**Query Parameters:**
- `tags[]` - Filter by tags
- `roles[]` - Filter by roles
- `actions[]` - Filter by actions
- `enabled` - Only enabled/disabled (true/false)

**Response:**
```json
{
  "success": true,
  "data": {
    "policies": [...],
    "count": 25,
    "filters": {...}
  }
}
```

### 2. Get Specific Policy

```bash
GET /api/v1/admin/policies/:id

Response:
{
  "success": true,
  "data": {
    "policy": {...}
  }
}
```

### 3. Create Policy

```bash
POST /api/v1/admin/policies

Request Body:
{
  "name": "Custom Policy Name",
  "description": "What this policy does",
  "actions": ["action1", "action2"],
  "roles": ["user", "admin"],
  "effect": "allow",
  "conditions": [
    {
      "field": "user.email",
      "operator": "endsWith",
      "value": "@company.com"
    }
  ],
  "enabled": true,
  "priority": 100,
  "tags": ["custom", "experimental"]
}

Response: 201 Created
{
  "success": true,
  "data": {
    "policy": {...}
  }
}
```

### 4. Update Policy

```bash
PUT /api/v1/admin/policies/:id

Request Body: Partial update fields
{
  "description": "Updated description",
  "enabled": false
}

Response: 200 OK
```

### 5. Delete Policy

```bash
DELETE /api/v1/admin/policies/:id

Response: 204 No Content
```

### 6. Enable/Disable Policy

```bash
POST /api/v1/admin/policies/:id/enable
POST /api/v1/admin/policies/:id/disable

Response: 200 OK
{
  "success": true,
  "data": {
    "policy": {...}
  }
}
```

## Policy Evaluation Logic

Policies are evaluated in this order:

1. **Deny Policies First** (highest priority) - If any deny policy matches, access is denied immediately
2. **Conditional Policies** - Policies with conditions are evaluated next
3. **Allow Policies** - If any allow policy matches, access is granted
4. **Default Deny** - If no allow policy matches, access is denied (fail secure)

### Evaluation Context

When evaluating a policy, the engine has access to:

```javascript
{
  userId: "user-id",
  role: "admin",           // guest, user, or admin
  action: "add_to_cart",   // The requested action
  resource: {
    type: "product",
    id: "product-id",
    status: "active"       // Product status
  },
  method: "POST",          // HTTP method
  path: "/api/v1/orders",  // Request path
  ip: "192.168.1.1"        // Client IP
}
```

## Usage Examples

### Example 1: Basic Guest vs User Separation

Guest users can view products but cannot add to cart:

```javascript
// Policies created in admin API
1. {
   "name": "Guest - View Active Products",
   "actions": ["view_product"],
   "roles": ["guest"],
   "effect": "allow",
   "priority": 100
}

2. {
   "name": "Guest - Cannot Add to Cart",
   "actions": ["add_to_cart"],
   "roles": ["guest"],
   "effect": "deny",
   "priority": 200  // Evaluated before allow
}
```

### Example 2: Time-Limited Access

Allow early-access members to see limited products:

```javascript
{
  "name": "Early Access - Limited Products",
  "actions": ["view_product"],
  "roles": [],  // Applies to all roles
  "conditions": [
    {
      "field": "resource.status",
      "operator": "equals",
      "value": "limited"
    },
    {
      "field": "user.tags",
      "operator": "in",
      "value": ["early_access"]
    }
  ],
  "effect": "allow",
  "priority": 150
}
```

### Example 3: Location-Based Access

Allow users from specific IP ranges:

```javascript
{
  "name": "Internal Network Only",
  "actions": ["admin_dashboard"],
  "roles": ["admin"],
  "conditions": [
    {
      "field": "ip",
      "operator": "startsWith",
      "value": "192.168."
    }
  ],
  "effect": "allow",
  "priority": 200
}
```

## Caching

The policy engine caches policy evaluations for 5 minutes by default to reduce database queries:

```javascript
// Manually clear cache when policies change
policyEngine.clearActionCache(['add_to_cart', 'remove_from_cart']);
policyEngine.clearAllCache();  // Clear all
```

Cache is automatically cleared when policies are created, updated, or deleted via admin API.

## Monitoring & Auditing

All policy decisions are logged:

```
info: Policy allowed for action: list_products, user: [user-id]
warn: Policy denied - Action(s): add_to_cart, Role: guest, User: [anonymous]
info: Admin created policy: Custom Policy (ID: [policy-id])
info: Admin deleted policy: Legacy Policy
```

## Best Practices

1. **Use Tags** - Organize policies with meaningful tags for easier management
2. **Set Priorities** - Important deny policies should have higher priority
3. **Document Conditions** - Use descriptive names and conditions
4. **Test Policies** - Create policies in disabled state first, then enable
5. **Audit Changes** - Policies track `createdBy` and `lastModifiedBy`
6. **Cache Awareness** - Changes take effect within 5 minutes

## Troubleshooting

### Policies Not Taking Effect

1. Check if policy is enabled: `GET /api/v1/admin/policies/:id`
2. Verify roles match: `roles: ["user"]` vs actual user role
3. Check conditions: Evaluate against actual request context
4. Clear cache: Changes should auto-clear cache, but can be manual too
5. Check logs for policy denial reasons

### Performance Issues

If you have many policies:
1. Use higher priority for commonly evaluated policies
2. Add specific conditions to limit evaluation
3. Use tags to organize and scale policies
4. Consider disabling unused policies rather than deleting

### Access Denied Unexpectedly

1. Check user role: `GET /api/v1/auth/me`
2. List applicable policies: `GET /api/v1/admin/policies?actions=action_name`
3. Verify conditions: Do they match the request context?
4. Check for deny policies: Higher priority deny policies block immediately
5. Review logs: Search for `DENY` messages

## Integration with Routes

Policies can be enforced on routes using middleware:

```javascript
import { createPolicyMiddleware, requireAdmin } from './middleware/policyMiddleware.js';

// Require specific action
router.post('/products', 
  authMiddleware,
  policyMiddleware('create_product'),
  productController.create
);

// Require admin role
router.get('/admin/dashboard',
  authMiddleware,
  requireAdmin(),
  adminController.dashboard
);
```

## Related Documentation

- [OPENAPI_GUIDE.md](./OPENAPI_GUIDE.md) - API endpoint documentation
- [WORKFLOWS.md](./WORKFLOWS.md) - User workflows with RBAC considerations
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - Detailed endpoint descriptions
