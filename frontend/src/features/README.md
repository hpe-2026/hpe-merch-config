# Frontend Architecture with Zustand

## Overview

The frontend has been refactored to use a feature-based folder structure with Zustand for state management, replacing prop drilling and uncontrolled component state.

## Folder Structure

```
src/
├── features/                  # Feature modules (encapsulate domain logic)
│   ├── auth/                  # Authentication feature
│   │   ├── store/
│   │   │   └── authStore.js   # Zustand auth state
│   │   └── components/
│   │       ├── LoginForm.jsx  # Login component
│   │       ├── SignupForm.jsx # Signup component
│   │       ├── Profile.jsx    # User profile
│   │       └── ProtectedRoute.jsx
│   │
│   ├── products/              # Products feature
│   │   ├── store/
│   │   │   └── productStore.js
│   │   └── components/
│   │       ├── ProductList.jsx
│   │       └── ProductCard.jsx
│   │
│   ├── cart/                  # Shopping cart feature
│   │   ├── store/
│   │   │   └── cartStore.js
│   │   └── components/
│   │       ├── Cart.jsx
│   │       ├── CartItem.jsx
│   │       └── CartSummary.jsx
│   │
│   └── orders/                # Order history feature
│       ├── store/
│       │   └── orderStore.js
│       └── components/
│           ├── OrderList.jsx
│           └── OrderDetail.jsx
│
├── shared/                    # Shared utilities
│   ├── components/            # Reusable components
│   │   ├── Navbar.jsx
│   │   └── Layout.jsx
│   ├── hooks/                 # Custom React hooks
│   │   ├── useAuth.js
│   │   └── useCart.js
│   ├── services/              # API services
│   │   └── api.js
│   └── middleware/            # Middleware functions
│       └── withAuth.js
│
├── App.jsx                    # Root component
├── main.jsx                   # Entry point
└── index.css                  # Global styles
```

## State Management with Zustand

### 1. AuthStore (`authStore.js`)

**Responsibilities**: User authentication, login/signup, token management

**State**:
```javascript
{
  user: { userId, email, name, role },
  token: 'jwt_token',
  refreshToken: 'refresh_token',
  isAuthenticated: boolean,
  isLoading: boolean,
  error: string | null
}
```

**Actions**:
- `signup(email, password, name)` - Register new user
- `login(email, password)` - Authenticate user
- `logout()` - Clear auth state
- `refreshAccessToken()` - Refresh JWT
- `restoreSession()` - Restore from localStorage

**Usage**:
```javascript
import { useAuthStore } from '../features/auth/store/authStore'

function LoginForm() {
  const { login, isLoading, error } = useAuthStore()
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    await login(email, password)
  }
}
```

### 2. ProductStore (`productStore.js`)

**Responsibilities**: Product data fetching, filtering, searching

**State**:
```javascript
{
  products: [],
  isLoading: boolean,
  error: string | null,
  filter: {
    category: null,
    search: '',
    priceRange: { min, max }
  }
}
```

**Actions**:
- `fetchProducts()` - Get all products
- `getProductById(id)` - Get single product
- `filterByCategory(category)` - Filter by category
- `filterByPrice(min, max)` - Filter by price range
- `searchProducts(query)` - Search products
- `getFilteredProducts()` - Get filtered list

**Usage**:
```javascript
function ProductList() {
  const { products, fetchProducts } = useProductStore()
  
  useEffect(() => {
    fetchProducts()
  }, [])
  
  return products.map(p => <ProductCard key={p._id} product={p} />)
}
```

### 3. CartStore (`cartStore.js`)

**Responsibilities**: Shopping cart operations, item management, totals

**State**:
```javascript
{
  items: [
    { _id, name, price, quantity }
  ],
  total: number,
  itemCount: number
}
```

**Actions**:
- `addItem(product, quantity)` - Add to cart
- `removeItem(productId)` - Remove from cart
- `updateQuantity(productId, quantity)` - Update quantity
- `clearCart()` - Clear cart
- `getCartSummary()` - Get total/subtotal

**Persistence**: Automatically persisted to localStorage using middleware

**Usage**:
```javascript
function ProductCard({ product }) {
  const { addItem } = useCartStore()
  
  return (
    <button onClick={() => addItem(product)}>
      Add to Cart
    </button>
  )
}
```

### 4. OrderStore (`orderStore.js`)

**Responsibilities**: Order creation, order history, order details

**State**:
```javascript
{
  orders: [],
  currentOrder: {},
  isLoading: boolean,
  error: string | null
}
```

**Actions**:
- `fetchOrders(token)` - Get user's orders
- `fetchOrderById(orderId, token)` - Get order details
- `createOrder(orderData, token)` - Create new order
- `getOrdersByStatus(status)` - Filter orders by status

**Usage**:
```javascript
function OrderHistory() {
  const { orders, fetchOrders } = useOrderStore()
  const { token } = useAuthStore()
  
  useEffect(() => {
    fetchOrders(token)
  }, [token])
}
```

## Custom Hooks

### `useAuth()`
Returns full auth store state and actions.

```javascript
const { user, isAuthenticated, login, logout } = useAuth()
```

### `useIsAuthenticated()`
Returns boolean indicating if user is logged in.

```javascript
const isAuth = useIsAuthenticated()
```

### `useCart()`
Returns full cart store state and actions.

```javascript
const { items, total, addItem, clearCart } = useCart()
```

### `useCartItemCount()`
Returns total item count in cart (sum of quantities).

```javascript
const count = useCartItemCount() // e.g., 5 items
```

## Protected Routes

The `ProtectedRoute` component enforces authentication before rendering.

```javascript
<ProtectedRoute>
  <CheckoutPage />
</ProtectedRoute>

// With role check
<ProtectedRoute requiredRole="admin">
  <AdminDashboard />
</ProtectedRoute>
```

**Behavior**:
- If not authenticated → Show login prompt
- If wrong role → Show "Access Denied" message
- If authenticated + correct role → Render children

## API Service

The `api.js` service wraps Axios with:
- Automatic token injection in headers
- 401 error handling (redirect to login on expired token)
- Centralized base URL

```javascript
import apiClient from '../services/api'

// Token automatically added
apiClient.get('/products')
apiClient.post('/orders', orderData)
```

## Migration from Old Structure

### Before (Props drilling):
```javascript
function App() {
  const [user, setUser] = useState(null)
  const [cart, setCart] = useState([])
  
  // Pass down via props through multiple levels
  return <Navbar user={user} cart={cart} setCart={setCart} />
}
```

### After (Zustand):
```javascript
function App() {
  const { isAuthenticated } = useAuthStore()
  
  useEffect(() => {
    if (isAuthenticated) {
      // Load user data
    }
  }, [isAuthenticated])
  
  return <Navbar /> // Access data from stores directly
}

function Navbar() {
  const { user, logout } = useAuthStore()
  const { items } = useCartStore()
  
  return (
    <>
      <span>{user?.name}</span>
      <span>Cart: {items.length}</span>
      <button onClick={logout}>Logout</button>
    </>
  )
}
```

## Best Practices

1. **Keep stores focused** - Each store handles one domain (auth, products, cart, orders)
2. **Use hooks** - Always access stores via custom hooks (`useAuth()`, `useCart()`)
3. **Avoid coupling** - Don't import one store from another
4. **Persist wisely** - Only persist `authStore` and `cartStore` to localStorage
5. **Error handling** - All async actions include error states
6. **Loading states** - Provide `isLoading` during API calls

## Performance Tips

### Selector hooks prevent unnecessary re-renders:
```javascript
// Renders only if `isAuthenticated` changes
const isAuth = useAuthStore(state => state.isAuthenticated)

// Renders only if `items` array changes
const items = useCartStore(state => state.items)
```

### Memoize expensive computations:
```javascript
// In component
const filteredProducts = useMemo(
  () => getFilteredProducts(filter),
  [filter]
)
```

## Testing Stores

```javascript
// Reset store state before each test
beforeEach(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false })
  useCartStore.setState({ items: [], total: 0 })
})

// Test logout
test('logout clears auth state', () => {
  const { logout } = useAuthStore.getState()
  logout()
  expect(useAuthStore.getState().isAuthenticated).toBe(false)
})
```

## Future Enhancements

1. **Persistence middleware** - Persist entire state or selective parts
2. **Async middleware** - Handle async operations more elegantly
3. **Dev tools** - Zustand devtools for debugging
4. **Immer middleware** - Immutable state updates
5. **Time-travel debugging** - Undo/redo functionality
