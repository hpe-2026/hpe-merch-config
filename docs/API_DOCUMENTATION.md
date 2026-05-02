# NITTE Merchandise Shop - API Documentation

## Base URLs

**Development**: `http://localhost:3000`
**Staging**: `https://staging-api.nitte-merch-shop.com`
**Production**: `https://api.nitte-merch-shop.com`

## Authentication

All API requests require an Authorization header with a JWT token:

```
Authorization: Bearer <access_token>
```

### Obtaining Tokens

#### Signup
```http
POST /api/v1/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  },
  "tokens": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  },
  "tokens": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

#### Refresh Token
```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "tokens": {
    "access_token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

## Products API

### Get All Products

```http
GET /api/v1/products?category=clothing&skip=0&limit=50
```

**Query Parameters**:
- `category` (optional): Filter by product category
- `skip` (optional): Number of records to skip (default: 0)
- `limit` (optional): Number of records to return (default: 50)

**Response** (200 OK):
```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "name": "NITTE Official T-Shirt",
    "description": "Official NITTE merchandise t-shirt",
    "category": "clothing",
    "price": 499.99,
    "stock": 100,
    "image_url": "https://example.com/tshirt.jpg",
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-01T00:00:00"
  }
]
```

### Get Product by ID

```http
GET /api/v1/products/:id
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "NITTE Official T-Shirt",
    "description": "Official NITTE merchandise t-shirt",
    "category": "clothing",
    "price": 499.99,
    "stock": 100,
    "image_url": "https://example.com/tshirt.jpg",
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-01T00:00:00"
  }
}
```

### Create Product (Admin Only)

```http
POST /api/v1/products
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "NITTE Official T-Shirt",
  "description": "Official NITTE merchandise t-shirt",
  "category": "clothing",
  "price": 499.99,
  "stock": 100,
  "image_url": "https://example.com/tshirt.jpg"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Product created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "NITTE Official T-Shirt",
    "description": "Official NITTE merchandise t-shirt",
    "category": "clothing",
    "price": 499.99,
    "stock": 100,
    "image_url": "https://example.com/tshirt.jpg",
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-01T00:00:00"
  }
}
```

### Update Product (Admin Only)

```http
PUT /api/v1/products/:id
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "price": 599.99,
  "stock": 150
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Product updated successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "NITTE Official T-Shirt",
    "description": "Official NITTE merchandise t-shirt",
    "category": "clothing",
    "price": 599.99,
    "stock": 150,
    "image_url": "https://example.com/tshirt.jpg",
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-01T00:00:00"
  }
}
```

### Delete Product (Admin Only)

```http
DELETE /api/v1/products/:id
Authorization: Bearer <admin_token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Product deleted successfully"
}
```

## Orders API

### Get User Orders

```http
GET /api/v1/orders
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "order_id": "ORD-f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "user_id": "507f1f77bcf86cd799439011",
      "user_email": "user@example.com",
      "items": [
        {
          "product_id": "507f1f77bcf86cd799439011",
          "quantity": 2,
          "price": 499.99
        }
      ],
      "shipping_address": "123 Main St, City, State 12345",
      "notes": "Please deliver in the morning",
      "status": "pending",
      "created_at": "2024-01-01T00:00:00",
      "updated_at": "2024-01-01T00:00:00"
    }
  ]
}
```

### Get Order by ID

```http
GET /api/v1/orders/:id
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "order_id": "ORD-f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "user_id": "507f1f77bcf86cd799439011",
    "user_email": "user@example.com",
    "items": [
      {
        "product_id": "507f1f77bcf86cd799439011",
        "quantity": 2,
        "price": 499.99
      }
    ],
    "shipping_address": "123 Main St, City, State 12345",
    "notes": "Please deliver in the morning",
    "status": "pending",
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-01T00:00:00"
  }
}
```

### Create Order

```http
POST /api/v1/orders
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "items": [
    {
      "product_id": "507f1f77bcf86cd799439011",
      "quantity": 2
    }
  ],
  "shipping_address": "123 Main St, City, State 12345",
  "notes": "Please deliver in the morning"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "order_id": "ORD-f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "user_id": "507f1f77bcf86cd799439011",
    "user_email": "user@example.com",
    "items": [
      {
        "product_id": "507f1f77bcf86cd799439011",
        "quantity": 2,
        "price": 499.99
      }
    ],
    "shipping_address": "123 Main St, City, State 12345",
    "notes": "Please deliver in the morning",
    "status": "pending",
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-01T00:00:00"
  }
}
```

### Update Order (Admin Only)

```http
PUT /api/v1/orders/:id
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "status": "shipped"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Order updated successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "order_id": "ORD-f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "shipped",
    "updated_at": "2024-01-02T00:00:00"
  }
}
```

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "path": "email",
      "msg": "Valid email is required"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Admin access required"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Product not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error"
}
```

## Rate Limiting

API requests are rate-limited to 100 requests per 15 minutes per IP address.

Response headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

## API Versioning

Current version: **v1**

API routes are versioned at `/api/v1/...`. Future versions will be available at `/api/v2/...`, `/api/v3/...`, etc.

## CORS Headers

The API includes CORS headers for requests from configured origins.

## Best Practices

1. **Always validate input** on the client side before sending requests
2. **Handle token expiry** and refresh tokens automatically
3. **Use appropriate HTTP methods** (GET for retrieval, POST for creation, PUT for updates, DELETE for deletion)
4. **Implement exponential backoff** for retries on 5xx errors
5. **Cache GET responses** when appropriate
6. **Use pagination** to handle large datasets
