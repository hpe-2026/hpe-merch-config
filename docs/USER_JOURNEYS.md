# User Journeys & Personas

## Overview

This document defines user personas and their journeys through the NITTE Merchandise Shop platform. User journeys map how real people interact with the system to achieve their goals.

---

## User Personas

### Persona 1: Sarah - The Casual Shopper
**Demographics**: 28-year-old professional, first-time visitor  
**Goal**: Browse cool NITTE merchandise and make a quick purchase  
**Tech Comfort**: Moderate

**Characteristics**:
- Discovers products via social media link
- Doesn't have an account yet
- Wants quick checkout experience
- May return to shop again

**Journey**:
```
1. Clicks link from Instagram → Lands on products page
2. Browses 3-4 products (guest view)
3. Finds "NITTE Hoodie" she likes
4. Clicks "Add to Cart" → Redirected to signup
5. Creates account (email + password)
6. Added back to products, "NITTE Hoodie" still in cart
7. Navigates to cart → Sees 1 item
8. Enters shipping address
9. Completes checkout
10. Sees order confirmation with order #ORD-00042
11. Receives confirmation email
```

**Pain Points**:
- Didn't want to sign up initially (extra friction)
- Password requirements unclear
- Wanted to skip confirmation page

**Success Metrics**:
-  Completed purchase
-  Cart persisted through login
-  Clear checkout flow

---

### Persona 2: Raj - The Repeat Customer
**Demographics**: 35-year-old, long-time fan, returning customer  
**Goal**: Buy more NITTE merchandise, track his growing collection  
**Tech Comfort**: High

**Characteristics**:
- Already has account
- Remembers cart from last visit
- Buys multiple items per transaction
- Interested in new products
- Checks order history regularly

**Journey**:
```
1. Visits shop, logs in automatically (token saved)
2. Sees "New Arrivals" section (future feature)
3. Adds 5 items to cart
4. Edits quantities (increases order quantity)
5. Reviews cart → Changes mind, removes 1 item
6. Proceeds to checkout
7. Shipping address auto-filled from last order
8. Completes purchase
9. Clicks "Orders" to see all past purchases
10. Views order confirmation for new order
11. Sees it alongside previous 8 orders
```

**Tech Behavior**:
- Uses keyboard shortcuts (future)
- Interested in wishlists
- Might check order tracking

**Success Metrics**:
-  Fast checkout (remembered address)
-  Able to manage multiple items
-  Easy access to past orders

---

### Persona 3: Priya - The Admin Manager
**Demographics**: 32-year-old, Operations Manager for NITTE  
**Goal**: Manage inventory, monitor sales, enforce business rules  
**Tech Comfort**: High

**Characteristics**:
- Needs to add/remove products regularly
- Wants to see all orders
- Manages inventory policies
- Monitors low-stock items
- Makes pricing decisions

**Journey**:
```
1. Logs in to admin dashboard (admin@nitte.com)
2. Views dashboard with KPIs (total orders, revenue, active users)
3. Navigates to "Products"
4. Sees all products (including archived ones)
5. Searches for "NITTE T-Shirt"
6. Updates price from 499.99 → 599.99 (special promotion)
7. Bulk updates stock for seasonal items (+50 units)
8. Archives old "NITTE V1" products
9. Navigates to "Policies"
10. Creates policy: "Hide archived products from guests"
11. Sees policy takes effect immediately
12. Views "Orders" → Filters by status "pending"
13. Exports orders for fulfillment
14. Monitors Prometheus metrics dashboard
```

**Admin Features Used**:
- Product CRUD
- Policy management
- Order filtering & export
- Metrics monitoring
- User management

**Success Metrics**:
-  Efficient inventory updates
-  Policies enforced without manual checks
-  Real-time visibility into sales

---

### Persona 4: Alex - The Mobile User
**Demographics**: 22-year-old student, mobile-first user  
**Goal**: Browse and shop primarily on smartphone  
**Tech Comfort**: Very High

**Characteristics**:
- Uses mobile 80% of the time
- Expects responsive design
- Quick check out on-the-go
- May start on mobile, finish on desktop (or vice versa)

**Journey**:
```
1. Opens app on mobile (responsive web)
2. Browses products while commuting
3. Adds "NITTE Cap" to cart
4. Continues later on desktop (same cart persists)
5. Adds 2 more items on desktop
6. Switches back to mobile for checkout
7. Enters shipping address (autocomplete from phone)
8. Completes payment on mobile
9. Views order confirmation on mobile
```

**Device Behavior**:
- Cart syncs across devices (localStorage + cloud sync)
- Checkout optimized for mobile (large buttons, minimal typing)
- One-hand navigation

**Success Metrics**:
-  Seamless cross-device experience
-  Cart persists across devices
-  Mobile checkout optimized

---

### Persona 5: Kumar - The Abandoned Cart User
**Demographics**: 45-year-old, cautious buyer  
**Goal**: Browse products but needs thinking time before buying  
**Tech Comfort**: Low-Moderate

**Characteristics**:
- Browses products
- Adds items to cart
- Leaves site without checking out
- May return days later
- Needs reassurance before purchase

**Journey**:
```
1. Visits shop, browses products (not logged in)
2. Clicks "Add to Cart" for expensive item → Redirected to login
3. Thinks "Too much friction" → Leaves
4. Returns next day via Google search
5. Doesn't remember what was in cart (cart lost for guests)
6. Browses again, remembers item from before
7. Logs in this time
8. Adds item again
9. Leaves cart for a few hours
10. Returns later, completes purchase
```

**Pain Points**:
- No guest checkout (had to create account)
- Lost cart on first visit (no account)
- Needed time to decide

**Improvement Needed**:
- Wishlist feature
- Email reminders for abandoned carts (future)
- Guest checkout option (future)

---

## User Journey Maps

### Journey Map 1: New Customer (First Purchase)

```
               Discovery    |    Browsing    |    Signup    |    Checkout    |    Confirmation
                    |             |              |              |                 |
Time            0 min         2 min          5 min          10 min             12 min
Actions         Click link    Browse products Sign up       Enter address     Complete
                                Click "Add to   Create      Review order
                                Cart"           password   Place order
Emotions        Curious       Interested      Hesitant     Confident       Happy
Pain Points              Friction with signup              Address entry
Tools Used      Social link   Website UI      Form         Form            Email conf
Touchpoints     Instagram     Products page   Login page   Checkout page   Confirmation
```

### Journey Map 2: Returning Customer (Repeat Purchase)

```
               Login         |    Browsing    |    Cart Mgmt    |    Checkout    |    Tracking
                    |             |              |                 |             |
Time            0 min         2 min          4 min              8 min        9 min (later)
Actions         Auto-login    Browse new      Check quantities  Auto-fill    View past
                              products        Update cart       address      orders
Emotions        Familiar      Pleased         Confident        Satisfied    Loyal
Pain Points            None          New products           None
Tools Used      Token storage Website UI      Cart UI         Address field Order history
Touchpoints     Login page    Products page   Cart page       Checkout     Orders page
```

---

## Conversion Funnel

```
100% - Visitors (browse products)
  ↓
75% - Add to Cart (click "Add to Cart")
  ↓
50% - Checkout Initiated (proceed to checkout)
  ↓
40% - Complete Order (finish checkout)
  ↓
35% - Confirmed (order confirmation received)
```

**Funnel Analysis**:
- **Drop-off 1** (100% → 75%): Guest users redirected to login (25% loss)
  - *Solution*: Guest checkout feature (future)
- **Drop-off 2** (75% → 50%): Cart abandonment (25% loss)
  - *Solution*: Email reminders (future)
- **Drop-off 3** (50% → 40%): Checkout friction (10% loss)
  - *Solution*: Streamlined checkout
- **Drop-off 4** (40% → 35%): Post-purchase hesitation (5% loss)
  - *Solution*: Clear confirmation

---

## Transaction Scenarios

### Scenario 1: Single Item Purchase
- **Time**: 3-5 minutes
- **Cart items**: 1
- **Typical customer**: Casual shopper
- **Success rate**: 80%

### Scenario 2: Multiple Items Purchase
- **Time**: 5-10 minutes
- **Cart items**: 3-5
- **Typical customer**: Returning customer
- **Success rate**: 75%

### Scenario 3: Large Order (10+ items)
- **Time**: 10-15 minutes
- **Cart items**: 10+
- **Typical customer**: Bulk buyer (future corporate feature)
- **Success rate**: 70%

---

## Pain Points & Solutions

| Pain Point | User Type | Severity | Solution |
|-----------|-----------|----------|----------|
| Forced signup before cart | New user | High | Guest checkout (future) |
| Cart not synced | Mobile user | Medium | Local + cloud sync |
| Broken checkout | All | Critical | Thoroughly test, error handling |
| Slow product load | Mobile user | Medium | Pagination, lazy loading |
| Policy not enforced | Admin | High | RBAC + middleware |
| No order tracking | Returning customer | Medium | Email notifications (future) |

---

## Success Metrics by Persona

### Sarah (Casual):
-  Signup completion rate
-  First-time buyer conversion
-  Time to purchase

### Raj (Repeat):
-  Repeat purchase rate
-  Average order value
-  Customer lifetime value

### Priya (Admin):
-  Inventory accuracy
-  Policy enforcement success
-  Operational efficiency

### Alex (Mobile):
-  Mobile conversion rate
-  Cross-device cart persistence
-  Mobile checkout speed

### Kumar (Abandoned):
-  Cart recovery (if implemented)
-  Time to convert
-  Purchase frequency

---

## Next Steps

1. **Implement guest checkout** - Reduce friction for new users
2. **Add wishlist** - Help users save for later
3. **Improve mobile UX** - Alex persona needs better mobile experience
4. **Email notifications** - Support abandoned cart recovery
5. **Analytics tracking** - Measure actual vs. expected user journeys
6. **A/B testing** - Test checkout variations (Scenario 1)
7. **User testing interviews** - Validate personas with real users
