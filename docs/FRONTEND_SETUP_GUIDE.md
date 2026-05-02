#  NITTE Merchandise Shop - Frontend Setup Guide

Complete guide to run **User Frontend** and **Admin Dashboard** with the backend services.

---

##  Prerequisites

- Docker & Docker Compose installed
- Node.js 18+ (for local development)
- All backend services running (Node, Python, MongoDB)
- Prometheus & Jaeger running (for admin dashboard monitoring)

---

##  QUICK START (3 Steps)

### Step 1: Install Dependencies

```bash
# User Frontend
cd frontend
npm install

# Admin Dashboard
cd ../admin-dashboard
npm install
```

### Step 2: Start Both Frontends

```bash
# Terminal 1 - User Frontend (port 5173)
cd frontend
npm run dev

# Terminal 2 - Admin Dashboard (port 5174)
cd ../admin-dashboard
npm run dev
```

### Step 3: Open in Browser

- **User Frontend** -> http://localhost:5173
- **Admin Dashboard** -> http://localhost:5174

---

##  USER FRONTEND (http://localhost:5173)

A beautiful e-commerce interface where customers can:

### Features:
 **Browse Products** - View all merchandise with real-time stock levels  
 **Shopping Cart** - Add/remove items, update quantities  
 **Checkout** - Place orders with automatic backend integration  
 **Order Tracking** - View order history and status  
 **API Status** - Real-time connection indicator  

### What Happens Behind the Scenes:
1. User clicks "Add to Cart" -> React state updated
2. User clicks "Place Order" -> HTTP POST to Node.js Gateway (port 3000)
3. Node.js validates & routes to Python Service (port 8000)
4. Python Service saves to MongoDB (port 27017)
5. Order confirmation displayed in React UI

### Key Components:
- `ProductList.jsx` - Fetches from `/api/products`
- `Cart.jsx` - Manages shopping cart state
- `Orders.jsx` - Displays order history from `/api/orders`
- `Navbar.jsx` - Navigation & API status indicator

---

##  ADMIN DASHBOARD (http://localhost:5174)

Powerful administration interface with:

### 6 Main Sections:

#### 1. **Dashboard** (Overview)
- Total Products, Orders, Revenue, Active Users
- System Health (CPU, Memory, Service Uptime)
- 24-hour Request Volume Chart
- Performance Metrics

#### 2. **Prometheus Metrics** (http://localhost:9090)
- HTTP Request Metrics
- Response Time Analysis
- Error Rates & Trends
- Database Query Performance
- Direct link to Prometheus UI
- Top metrics table with live data

#### 3. **Jaeger Traces** (http://localhost:16686)
- Distributed Request Tracing
- Service Dependencies Map
- Latency Analysis
- Error Tracking Across Services
- Recent Traces with Span Details
- Direct link to Jaeger UI

#### 4. **Jenkins Pipeline** (http://localhost:8080)
- Build Status for All Branches
- Stage-by-stage Pipeline Visualization
- Successful/Failed Build Count
- Average Build Time
- Success Rate Metrics
- Direct link to Jenkins UI

#### 5. **Product Management**
- List all products from database
- Create new products (with form)
- Edit existing products
- Delete products
- Real-time stock visibility

#### 6. **Order Management**
- View all customer orders
- Update order status (pending -> shipped -> delivered)
- See customer details & items
- Order summary statistics
- Filter by status

### What Admin Can Do:
```
Monitor System Health
    
View API Metrics & Traces
    
Manage Products & Inventory
    
Track Orders & Update Status
    
Monitor CI/CD Deployments
```

---

##  Complete System Workflow

### User Places an Order:
```
User Frontend (React)
    
1. User browses products
   GET http://localhost:3000/api/products
    
2. User adds to cart
   (State in React)
    
3. User clicks "Place Order"
   POST http://localhost:3000/api/orders
    
Node.js API Gateway (port 3000)
    
1. Validates request
2. Authenticates user
3. Forwards to Python Service
    
Python FastAPI (port 8000)
    
1. Business logic processing
2. Validates inventory
3. Creates order record
    
MongoDB (port 27017)
    
Order saved! 
    
Response back through chain
    
User sees confirmation
Order appears in Orders page
```

### Admin Monitors Everything:
```
Admin Dashboard (React)
    
Fetches from multiple sources:
     API Endpoints (port 3000)
       /api/products, /api/orders
     Prometheus (port 9090)
       Metrics API queries
     Jaeger (port 16686)
       Trace data
     Jenkins (port 8080)
        Pipeline status
    
Displays real-time dashboards
Shows metrics, traces, status updates
```

---

##  Using Docker (Optional)

### Build Images:
```bash
# User Frontend
docker build -t nitte-user-frontend frontend/

# Admin Dashboard
docker build -t nitte-admin-dashboard admin-dashboard/
```

### Run with Docker:
```bash
docker run -p 5173:5173 nitte-user-frontend
docker run -p 5174:5174 nitte-admin-dashboard
```

### Docker Compose (Complete Stack):
```bash
# Create a docker-compose file that includes frontend apps
docker compose up -d

# This will run:
# - Node.js API Gateway (3000)
# - Python Service (8000)
# - MongoDB (27017)
# - User Frontend (5173)
# - Admin Dashboard (5174)
# - Prometheus (9090)
# - Grafana (3001)
# - Jaeger (16686)
# - Jenkins (8080)
```

---

##  API Endpoints Used

### User Frontend Endpoints:
```
GET  /api/health              -> Check API status
GET  /api/products            -> List all products
POST /api/products            -> Create product
GET  /api/products/:id        -> Get product details
PUT  /api/products/:id        -> Update product
DELETE /api/products/:id      -> Delete product

GET  /api/orders              -> List all orders
POST /api/orders              -> Create new order
GET  /api/orders/:id          -> Get order details
PUT  /api/orders/:id          -> Update order status
DELETE /api/orders/:id        -> Cancel order
```

### Admin Dashboard Endpoints:
```
Same as above +

Prometheus:
GET /api/v1/query?query=       -> Query metrics
GET /api/v1/query_range?query= -> Range queries

Jaeger:
GET /api/traces?service=       -> Get traces
GET /api/traces/:traceId       -> Trace details

Jenkins:
GET /api/json                  -> Pipeline status
```

---

##  Demo Scenarios with Frontends

### Scenario 1: Complete E-Commerce Flow
1. **User Frontend**: Browse products, add to cart, place order
2. **User Frontend**: View order in Orders page
3. **Admin Dashboard**: See new order appear in real-time
4. **Admin Dashboard**: Update order status to "shipped"
5. **User Frontend**: Refresh - see updated status

### Scenario 2: Monitoring Performance
1. **User Frontend**: Generate traffic by placing multiple orders
2. **Admin Dashboard -> Metrics**: View request volume increasing
3. **Admin Dashboard -> Metrics**: See response times
4. **Admin Dashboard -> Prometheus**: Query specific metrics
5. **Admin Dashboard -> Jaeger**: See distributed traces
6. **Admin Dashboard -> Jenkins**: Show deployment pipeline

### Scenario 3: System Management
1. **Admin Dashboard -> Products**: Add new merchandise
2. **User Frontend**: See new product appear after refresh
3. **Admin Dashboard -> Orders**: Bulk update order statuses
4. **Admin Dashboard -> Dashboard**: View statistics and health
5. **Admin Dashboard -> Jenkins**: Show CI/CD automation

---

##  Frontend Architecture

### User Frontend (React + Vite)
```
frontend/
 src/
    App.jsx                 # Main app component
    components/
       Navbar.jsx          # Navigation header
       ProductList.jsx     # Product grid
       Cart.jsx            # Shopping cart
       Orders.jsx          # Order history
    index.css               # Tailwind styling
 vite.config.js              # Vite configuration
 package.json                # Dependencies
 Dockerfile                  # Container setup
```

### Admin Dashboard (React + Vite)
```
admin-dashboard/
 src/
    App.jsx                 # Main app component
    components/
       AdminNavbar.jsx     # Navigation
       Dashboard.jsx       # Overview & stats
       Metrics.jsx         # Prometheus visualization
       Traces.jsx          # Jaeger traces
       JenkinsPipeline.jsx # CI/CD status
       Products.jsx        # Product management
       Orders.jsx          # Order management
    index.css               # Tailwind styling
 vite.config.js              # Vite configuration
 package.json                # Dependencies
 Dockerfile                  # Container setup
```

---

##  Styling & UI

Both frontends use:
- **React 18** - UI framework
- **Vite** - Fast build tool
- **Tailwind CSS** - Utility-first styling
- **Lucide React** - Beautiful icons
- **Recharts** - Data visualization (Admin)
- **Axios** - HTTP client

---

##  Data Flow Diagram

```

                    USER ACTIONS                              

                           
                           
           
              User Frontend (React)       
              http://localhost:5173       
                                          
            • ProductList (API calls)     
            • Cart (State mgmt)           
            • Orders (Live updates)       
           
                           
           
                                       
                                       
             
     Node.js               Admin Dashboard  
     Gateway               http://localhost 
     :3000                 :5174            
                               
                            • Dashboard      
                            • Metrics        
              • Traces         
     Python                • Jenkins        
     Service               • Management     
     :8000                
                   
                   
                                
                
                        Monitoring & Observability  
         DB                                         
                       • Prometheus :9090           
                 • Grafana :3001              
                         • Jaeger :16686              
                         • Jenkins :8080              
                    
```

---

##  Troubleshooting

### Problem: Frontend shows "API offline"
**Solution:**
```bash
# Check backend services
docker ps
# Expected: nitte-node-backend, nitte-python-service, nitte-mongodb all running

# If not running:
docker compose up -d
```

### Problem: Products/Orders not showing
**Solution:**
```bash
# Clear browser cache
# Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)

# Or check API directly:
curl http://localhost:3000/api/products
```

### Problem: Admin dashboard Prometheus/Jaeger showing "Not available"
**Solution:**
```bash
# Start monitoring stack:
docker compose -f monitoring/docker-compose-monitoring.yml up -d

# Wait 30 seconds for services to start
# Then refresh dashboard
```

### Problem: Vite dev server not found
**Solution:**
```bash
# Install dependencies again
cd frontend
npm install

# Or use npm rebuild
npm rebuild
```

---

##  File Structure (Complete)

```
/home/languid/Downloads/HPE-task-2/
 frontend/                          # User-facing e-commerce app
    src/
       components/
          Navbar.jsx
          ProductList.jsx
          Cart.jsx
          Orders.jsx
       App.jsx
       App.css
       index.css
       main.jsx
    index.html
    vite.config.js
    tailwind.config.js
    postcss.config.js
    package.json
    Dockerfile
    .gitignore

 admin-dashboard/                   # Admin management & monitoring
    src/
       components/
          AdminNavbar.jsx
          Dashboard.jsx
          Metrics.jsx
          Traces.jsx
          JenkinsPipeline.jsx
          Products.jsx
          Orders.jsx
       App.jsx
       index.css
       main.jsx
    index.html
    vite.config.js
    tailwind.config.js
    postcss.config.js
    package.json
    Dockerfile
    .gitignore

 node-backend/                      # Express API Gateway
 python-service/                    # FastAPI Business Logic
 docker/                            # Docker Compose setup
 monitoring/                        # Prometheus, Grafana, Jaeger
 ... (other files)
```

---

##  Demo Checklist

Before demoing, verify:
- [ ] All backend services running (`docker ps`)
- [ ] User Frontend loads (`http://localhost:5173`)
- [ ] Admin Dashboard loads (`http://localhost:5174`)
- [ ] Can browse products in User Frontend
- [ ] Can place an order and see it in Admin Dashboard
- [ ] Prometheus metrics loading in Admin Dashboard
- [ ] Jaeger showing traces in Admin Dashboard
- [ ] Jenkins pipeline visible in Admin Dashboard

---

##  Performance & Optimization

Both frontends are optimized for:
- **Fast load times** - Vite builds in ~500ms
- **Lazy loading** - React components load on demand
- **Efficient API calls** - Axios with request caching
- **Responsive design** - Mobile-first Tailwind CSS
- **Real-time updates** - Auto-refresh on data changes

---

##  Security Notes

-  CORS properly configured
-  API calls go through Express middleware
-  Form validation on frontend & backend
-  No sensitive data in localStorage
-  SQL injection prevention (using MongoDB)

---

##  Support

For issues, check:
1. `DEMO_GUIDE.md` - Demo instructions
2. `docs/API_DOCUMENTATION.md` - API endpoints
3. Logs: `docker logs nitte-node-backend`

---

**Ready to demonstrate the complete NITTE Merchandise Shop system!** 
