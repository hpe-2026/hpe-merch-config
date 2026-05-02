# OpenAPI v3.1 Specification Guide

## Overview

The NITTE Merchandise Shop API uses OpenAPI 3.1 specification to document all endpoints, with automatic Swagger UI integration for interactive API exploration.

## Accessing the API Documentation

### Swagger UI (Interactive)
- **URL:** `http://localhost:3000/api/docs`
- **Features:**
  - Try out API endpoints directly from the browser
  - Automatic JWT token injection (if logged in)
  - Response examples and schemas
  - Error response documentation
  - Parameter validation highlighting

### OpenAPI JSON Specification
- **URL:** `http://localhost:3000/api/v1/openapi.json`
- **Use Cases:**
  - Generate client code (OpenAPI Generator, Swagger Codegen)
  - Import into API testing tools (Postman, Insomnia)
  - Validate requests against spec
  - Documentation generation

## Project Structure

```
/node-backend/openapi/v1/
 openapi.yaml                 # Main specification (root file)
 schemas/
    schemas.yaml            # Entity definitions (User, Product, Cart, Order, Policy, etc.)
 paths/
    auth.yaml               # Authentication endpoints
    products.yaml           # Product management endpoints
    orders.yaml             # Order management endpoints
    admin.yaml              # Admin policy management endpoints
 responses/
     errors.yaml             # Standardized error response schemas
```

## Key Components

### 1. Schemas (schemas.yaml)

Defines all data models used across the API:

- **User:** User account information (id, email, name, role, timestamps)
- **Product:** Product catalog items (id, name, description, price, image, inventory, status)
- **CartItem:** Shopping cart line items (product_id, quantity, price snapshot)
- **Order:** Customer orders (id, items, total, status, shipping address, timestamps)
- **Policy:** RBAC policy definitions (conditions, effects, actions, rules)
- **AuthTokens:** JWT token response (accessToken, refreshToken, expiresIn)
- **ErrorResponse:** Standard error structure (success, message, errors, code, timestamp)

### 2. Path Definitions

#### Auth Endpoints (paths/auth.yaml)
```
POST   /auth/signup      - Register new user
POST   /auth/login       - Authenticate user (get tokens)
POST   /auth/refresh     - Refresh JWT token
POST   /auth/logout      - Invalidate session
GET    /auth/me          - Get current user profile
```

#### Product Endpoints (paths/products.yaml)
```
GET    /products         - List products (paginated, filterable)
GET    /products/:id     - Get single product details
POST   /products         - Create product (admin only)
PUT    /products/:id     - Update product (admin only)
DELETE /products/:id     - Delete product (admin only)
```

#### Order Endpoints (paths/orders.yaml)
```
GET    /orders           - List user orders (or all if admin)
GET    /orders/:id       - Get order details
POST   /orders           - Create order from cart (checkout)
```

#### Admin Endpoints (paths/admin.yaml)
```
GET    /admin/policies           - List all policies
POST   /admin/policies           - Create new policy
PUT    /admin/policies/:id       - Update policy
DELETE /admin/policies/:id       - Delete policy
```

### 3. Error Responses (responses/errors.yaml)

Standardized error schemas with HTTP status codes:

- **400 Bad Request:** Validation errors with field-level details
- **401 Unauthorized:** Missing/invalid authentication token
- **403 Forbidden:** Insufficient role/permissions (policy denied)
- **404 Not Found:** Resource doesn't exist
- **422 Unprocessable Entity:** Business logic validation failed
- **500 Internal Server Error:** Server error details
- **503 Service Unavailable:** Upstream service unavailable

## Authentication

### JWT Bearer Token

1. **Obtain Token:** Call `/auth/login` or `/auth/signup` with credentials
   ```bash
   curl -X POST http://localhost:3000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"password123"}'
   ```
   
   Response:
   ```json
   {
     "success": true,
     "data": {
       "accessToken": "eyJhbGciOiJIUzI1NiIs...",
       "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
       "expiresIn": 3600,
       "user": {
         "id": "507f1f77bcf86cd799439011",
         "email": "user@example.com",
         "role": "user"
       }
     }
   }
   ```

2. **Use Token:** Include in Authorization header
   ```bash
   curl http://localhost:3000/api/v1/orders \
     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
   ```

3. **Refresh Token:** When access token expires
   ```bash
   curl -X POST http://localhost:3000/api/v1/auth/refresh \
     -H "Content-Type: application/json" \
     -d '{"refreshToken":"eyJhbGciOiJIUzI1NiIs..."}'
   ```

## Guest vs Authenticated Access

### Public Endpoints (No Auth Required)
- `GET /products` - Returns only "active" products (policy-enforced)
- `GET /products/:id` - View product details
- `POST /auth/signup` - User registration
- `POST /auth/login` - User login

### Protected Endpoints (Auth Required)
- `GET /auth/me` - Current user profile
- `GET /cart` - View cart (future)
- `POST /orders` - Create order (checkout)
- `GET /orders` - User's order history
- All admin endpoints

### Error Responses for Unauth Access
- **401 Unauthorized:** Invalid/missing token
- **403 Forbidden:** Valid token but insufficient role/permissions

## Role-Based Access Control (RBAC)

### User Roles

- **guest:** Public user without authentication (browser session)
- **user:** Authenticated customer account
- **admin:** Administrative user with full API access

### Role Permissions

| Action | Guest | User | Admin |
|--------|-------|------|-------|
| View active products |  |  |  |
| View all products |  |  |  |
| Add to cart |  |  |  |
| Create order |  |  |  |
| View own orders |  |  |  |
| View all orders |  |  |  |
| Manage products |  |  |  |
| Manage policies |  |  |  |

## Using Swagger UI in Development

### 1. Start the API Gateway
```bash
cd node-backend
npm install --legacy-peer-deps  # If not done
npm run dev
```

### 2. Open Swagger UI
Navigate to: `http://localhost:3000/api/docs`

### 3. Try API Endpoints

#### Test Guest Access (No Auth)
1. Click "Try it out" on `GET /products`
2. Leave auth header empty
3. Click "Execute"
4. Response shows only active products

#### Test Authenticated Access
1. Click "Try it out" on `POST /auth/login`
2. Enter test credentials:
   ```json
   {
     "email": "admin@test.com",
     "password": "Password123!"
   }
   ```
3. Copy the `accessToken` from response
4. Click the "Authorize" button (lock icon at top)
5. Paste token as: `Bearer <token>`
6. Now protected endpoints will auto-inject the header

#### Example Workflow
1. **Sign Up** → `POST /auth/signup` with credentials
2. **Get Token** → Copy from response
3. **Authorize** → Click lock icon, paste token
4. **View Products** → `GET /products` shows filtered products per role
5. **Create Order** → `POST /orders` with cart items
6. **Check Orders** → `GET /orders` shows user's order history

## Generating Client Code

### Using OpenAPI Generator (Node.js Client)

```bash
# Install OpenAPI Generator
npm install -g @openapitools/openapi-generator-cli

# Generate JavaScript/TypeScript client
openapi-generator-cli generate \
  -i http://localhost:3000/api/v1/openapi.json \
  -g javascript \
  -o ./generated-client

# Or generate TypeScript with strict DTO models
openapi-generator-cli generate \
  -i http://localhost:3000/api/v1/openapi.json \
  -g typescript-fetch \
  -o ./generated-client-ts
```

### Using Swagger Codegen (Python, Java, Go, etc.)

```bash
# Generate Python client
PYTHON_POST_PROCESS_FILE=/usr/local/bin/black \
swagger-codegen generate \
  -i http://localhost:3000/api/v1/openapi.json \
  -l python \
  -o ./generated-client-py
```

## Importing into API Testing Tools

### Postman
1. Click "Import" in Postman
2. Select "Link" tab
3. Paste: `http://localhost:3000/api/v1/openapi.json`
4. Click "Continue"
5. All endpoints automatically imported with auth headers pre-configured

### Insomnia
1. Click "+" → "Import from URL"
2. Paste: `http://localhost:3000/api/v1/openapi.json`
3. Select workspace
4. Endpoints imported with schema validation

## Validation Against Spec

### Request Validation
- All request bodies validated against schemas
- Query parameters checked for type and required fields
- Missing required fields return 400 Bad Request with details

### Response Validation
- All responses conform to documented schemas
- Additional properties are rejected if spec sets `additionalProperties: false`
- Helps catch backwards-compatibility issues early

## Extending the OpenAPI Specification

### Adding New Endpoint
1. Create new path definition in `/openapi/v1/paths/` (e.g., `cart.yaml`)
2. Reference in main `openapi.yaml`:
   ```yaml
   /cart:
     $ref: './paths/cart.yaml#/~=/cart'
   ```
3. Restart server (or reload `/api/docs`)

### Adding New Schema
1. Add to `schemas/schemas.yaml`:
   ```yaml
   Coupon:
     type: object
     properties:
       code: { type: string }
       discount: { type: number }
   ```
2. Reference in paths: `$ref: '#/components/schemas/Coupon'`

### Adding New Error Response
1. Add to `responses/errors.yaml`
2. Reference in endpoint: `$ref: '#/components/responses/409_Conflict'`

## Troubleshooting

### Swagger UI Not Loading
- **Check:** Verify `/api/docs` is accessible
- **Logs:** Look for "Swagger UI mounted" in server startup logs
- **Fix:** Ensure OpenAPI spec is valid YAML

### JWT Token Not Auto-Injecting
- **Issue:** Swagger UI's client-side auth might be blocked by CORS
- **Workaround:** Copy token manually, paste in "Authorize" dialog
- **Alternative:** Use Postman/Insomnia for authenticated requests

### Spec Components Not Merging
- **Issue:** File references in openapi.yaml not resolving
- **Check:** Verify all referenced files exist in correct paths
- **Debug:** Check Node server logs for load errors

## Related Documentation

- [API_DOCUMENTATION.md](../API_DOCUMENTATION.md) - Detailed endpoint descriptions
- [ARCHITECTURE.md](../ARCHITECTURE.md) - System design and workflows
- [RBAC Policy System](./RBAC_POLICIES.md) - Role-based access control
