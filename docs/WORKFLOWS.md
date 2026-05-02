# User Workflows & Journeys

## Overview

This document describes the user workflows and journeys within the NITTE Merchandise Shop platform. These workflows define how different user types interact with the system.

---

## User Types & Roles

### 1. **Guest User**
- **Status**: Not authenticated
- **Permissions**: View-only access to products
- **Actions Allowed**:
  - View product catalog
  - View product details
  - Filter/search products
  - View pricing

- **Actions Denied**:
  - Add to cart
  - Checkout
  - View order history
  - Admin operations

### 2. **Authenticated User**
- **Status**: Logged in with valid JWT token
- **Permissions**: Full customer access
- **Actions Allowed**:
  - All guest actions
  - Create account / Login
  - Manage cart (add, remove, update quantity)
  - Checkout and create orders
  - View order history
  - View profile
  - Update profile settings

### 3. **Admin User**
- **Status**: Logged in with admin role
- **Permissions**: Full administrative access
- **Actions Allowed**:
  - All authenticated user actions
  - Create, read, update, delete products
  - Manage policies
  - View all orders
  - Manage users
  - Access admin dashboard

---

## Core Workflows

### Workflow 1: Guest Product Browsing

**Actors**: Guest User  
**Goal**: Discover and view available products  
**Preconditions**: User is not logged in; products exist in catalog

**Flow**:
1. User accesses application homepage
2. User is directed to product list (default view)
3. User sees list of **active products only**
4. User can filter by category/price
5. User can click product to view details
6. User sees full product description, images, price, stock status
7. *(Optional)* User tries to "Add to Cart" → **redirected to login**

**Postconditions**: User has browsed products; guest view enforces policy restrictions

**Policy Enforcement**:
- Only products with `status = 'active'` are visible
- Archived products hidden from guest view
- Stock information displayed (may show "Out of Stock")

---

### Workflow 2: User Authentication (Register/Login/Logout)

**Actors**: Guest User → Authenticated User  
**Goal**: Create account and authenticate to access user features

#### Sub-Workflow 2a: Registration

**Flow**:
1. Guest clicks "Sign Up" on login page
2. Guest enters email, password, name
3. **Validation**: 
   - Email format check 
   - Password minimum length (6 chars) 
   - Name not empty 
   - Email uniqueness check 
4. Guest submits form
5. Backend creates user in MongoDB
6. JWT tokens generated (access + refresh)
7. User auto-logged in
8. UI updates: Cart, navbar, order history now visible
9. User redirected to products page

**Error Cases**:
- Invalid email → Show validation error
- Weak password → Show password requirement message
- Email already exists → Show "User already registered" error

#### Sub-Workflow 2b: Login

**Flow**:
1. User accesses login page
2. User enters email + password
3. Backend verifies credentials against MongoDB
4. *(Success)*: JWT tokens generated, user object returned
5. Frontend stores tokens in localStorage
6. User redirected to products page
7. *(Failure)*: Error message shown → user remains on login

**Persistence**:
- On page refresh, `App.jsx` checks localStorage for token
- If valid token exists, user remains logged in
- If token expired or missing, user is logged out

#### Sub-Workflow 2c: Logout

**Flow**:
1. User clicks "Logout" button in navbar
2. Frontend clears localStorage (token, user data)
3. Zustand auth store reset to anonymous state
4. User redirected to login page
5. Cart cleared (or persisted, TBD)

---

### Workflow 3: Shopping Cart Management

**Actors**: Authenticated User  
**Goal**: Build cart and manage items before checkout

#### Sub-Workflow 3a: Add to Cart

**Flow**:
1. User is on products page and logged in
2. User clicks "Add to Cart" for a product
3. Frontend calls POST `/api/v1/cart/add` (or manages in Zustand store)
4. Validation:
   - Product exists
   - Product has stock > 0
   - User is authenticated 
5. Product added to cart with quantity 1
6. If product already in cart, quantity incremented
7. Cart count badge updates in navbar
8. Confirmation notification shown: "Added to cart"
9. Subtotal calculated

**Policy Enforcement**:
- Only authenticated users can add items
- Cannot exceed available stock
- Archived products cannot be added

#### Sub-Workflow 3b: Update Cart Quantity

**Flow**:
1. User on cart page sees item with quantity input
2. User changes quantity (e.g., 2 → 5)
3. Frontend validates new quantity against stock
4. *(If valid)* Cart updated, subtotal recalculated
5. *(If invalid)* Error shown: "Only X items in stock"
6. Quantity remains unchanged

#### Sub-Workflow 3c: Remove from Cart

**Flow**:
1. User clicks remove button next to item
2. Item deleted from cart
3. Cart count badge updates
4. Subtotal recalculated
5. *(If cart now empty)* "Your cart is empty" message shown

---

### Workflow 4: Checkout & Order Creation

**Actors**: Authenticated User  
**Goal**: Convert cart into order

**Flow**:
1. User has items in cart
2. User clicks "Proceed to Checkout"
3. Frontend displays order summary:
   - Items with quantities and prices
   - Subtotal
   - Total amount
4. User enters/confirms shipping address
5. User clicks "Place Order"
6. Frontend sends POST `/api/v1/orders` with:
   - `user_id`: from JWT token
   - `items`: cart contents
   - `shipping_address`: user input
   - `status`: "pending"
7. Backend creates order in MongoDB
8. Order assigned unique `order_id` (e.g., ORD-00001)
9. Cart cleared
10. User redirected to order confirmation page
11. Order confirmation email (future integration)

**Validations**:
- Authenticated 
- Cart not empty 
- Shipping address not empty 
- Stock available for all items 
- Prices match current catalog (prevent manipulation)

**Policy Enforcement**:
- RBAC: Only authenticated users can checkout
- Discount rules applied (if any policies defined)
- Stock validation respected

---

### Workflow 5: View Order History

**Actors**: Authenticated User  
**Goal**: Track past purchases and order status

**Flow**:
1. User clicks "Orders" in navbar
2. Frontend calls GET `/api/v1/orders`
3. Backend filters orders: `user_id = current_user_id`
4. Returns list of user's orders with status, total, date
5. Orders sorted by most recent first
6. User can click order to see details
7. Order details page shows:
   - Order ID
   - Items with quantities
   - Total amount
   - Shipping address
   - Order status (pending, shipped, delivered, etc.)
   - Order date

**Access Control**:
- Users see only their own orders
- Admin can see all orders
- Direct URL manipulation to view other user's orders → 403 Forbidden

---

### Workflow 6: Admin Product Management

**Actors**: Admin User  
**Goal**: Manage merchandise inventory

#### Sub-Workflow 6a: Create Product

**Flow**:
1. Admin clicks "Products" in admin dashboard
2. Admin clicks "Add New Product"
3. Admin fills form:
   - Name, description, category
   - Price, stock quantity
   - Image URL
4. Admin clicks "Create"
5. Validation:
   - All required fields present 
   - Price > 0 
   - Stock >= 0 
6. Backend creates product in MongoDB
7. Product immediately visible to guests (if `status = 'active'`)

#### Sub-Workflow 6b: Update Product

**Flow**:
1. Admin clicks product to edit
2. Admin changes price, stock, or status
3. Admin clicks "Save"
4. Changes persisted to MongoDB
5. Frontend reflects changes immediately

#### Sub-Workflow 6c: Archive Product

**Flow**:
1. Admin clicks product
2. Admin changes status from "active" to "archived"
3. Product immediately hidden from guest view (policy enforced)
4. Admin still sees it in admin dashboard

#### Sub-Workflow 6d: Manage Policies

**Flow**:
1. Admin clicks "Policies" in admin dashboard
2. Admin sees list of active policies with descriptions
3. Admin can enable/disable policies
4. Admin can edit policy rules (e.g., discount thresholds)
5. Changes take effect immediately or after cache invalidation

---

## Data Flow Diagram

```

                          GUEST USER                             

                                                                 
  Browse Products (View only, policy: status='active')          
          ↓                                                      
  Try to Add to Cart → Redirected to Login                      
                                                                 

                          ↓
                   [Login/Register]
                          ↓

                    AUTHENTICATED USER                           

                                                                 
  Browse Products (All active products)                         
          ↓                                                      
  Manage Cart (Add, Update, Remove)                             
          ↓                                                      
  Checkout (Address + Order creation)                           
          ↓                                                      
  View Order History                                             
          ↓                                                      
  [Logout] → Back to Guest Mode                                 
                                                                 

      (Optional Admin Role)
           ↓

                      ADMIN USER                                 

                                                                 
  Product Management (CRUD)                                     
  Policy Management (Create, Edit, Enable/Disable)             
  View All Orders                                               
  User Management                                               
  Metrics & Monitoring                                          
                                                                 

```

---

## API Endpoints by Workflow

### Workflow 1: Guest Browsing
- `GET /api/v1/products` - List all active products
- `GET /api/v1/products/:id` - Get product details

### Workflow 2: Authentication
- `POST /api/v1/auth/signup` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout (tracking)
- `POST /api/v1/auth/refresh` - Refresh access token
- `GET /api/v1/auth/me` - Get current user info

### Workflow 3: Cart Management
- `POST /api/v1/cart/add` - Add item to cart
- `DELETE /api/v1/cart/remove` - Remove item
- `GET /api/v1/cart` - Get cart contents
- `PUT /api/v1/cart/item/:id` - Update item quantity

### Workflow 4: Checkout
- `POST /api/v1/orders` - Create order
- `POST /api/v1/orders/:id/confirm` - Confirm order (future)

### Workflow 5: Order History
- `GET /api/v1/orders` - Get user's orders
- `GET /api/v1/orders/:id` - Get order details

### Workflow 6: Admin Management
- `POST /api/v1/admin/products` - Create product
- `PUT /api/v1/admin/products/:id` - Update product
- `DELETE /api/v1/admin/products/:id` - Delete product
- `GET /api/v1/admin/policies` - List policies
- `POST /api/v1/admin/policies` - Create policy
- `PUT /api/v1/admin/policies/:id` - Update policy

---

## State Transitions

### User State Machine:
```
    [Not Logged In]
         ↓    ↑
      (Login) (Logout)
         ↓    ↑
    [Authenticated]
         ↓ (Admin Role)
    [Admin User]
```

### Order State Machine:
```
    [Pending]
        ↓
    [Processing]
        ↓
    [Shipped]
        ↓
    [Delivered]
    
    OR
    
    [Cancelled]
```

---

## Error Handling

Each workflow includes error scenarios:

| Scenario | Error | Action |
|----------|-------|--------|
| Add to cart without login | User not authenticated | Redirect to login |
| Checkout with empty cart | Cart empty | Show warning; redirect to products |
| Checkout insufficient stock | Stock exhausted | Show stock error; clear affected items |
| Update password fails | Current password incorrect | Show error; prompt retry |
| Product not found | 404 error | Show 404 page |

---

## Future Enhancements

1. **Guest Checkout** - Allow guests to checkout without account (email-only)
2. **Wishlist** - Authenticated users can save items for later
3. **Payment Integration** - Process payments via Stripe/PayPal
4. **Order Notifications** - Email/SMS order status updates
5. **Inventory Alerts** - Admin alerts when stock low
6. **User Reviews** - Authenticated users can review products
7. **Recommendation Engine** - ML-based product suggestions
