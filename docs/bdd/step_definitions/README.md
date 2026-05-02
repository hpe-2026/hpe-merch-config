# BDD Step Definitions Guide

## Overview

This directory contains step definitions for Cucumber.js. Each step definition maps a Gherkin step (from `.feature` files) to executable JavaScript code.

## File Structure

- `common.steps.js` - Common steps used across all features (Given, When, Then)
- `auth.steps.js` - Authentication-specific step implementations (login, signup, logout)
- `products.steps.js` - Product-related step implementations
- `cart.steps.js` - Shopping cart step implementations
- `checkout.steps.js` - Order and checkout step implementations

## How to Add New Steps

### 1. Identify the step pattern
Extract the regular expression pattern from your Gherkin step:

**Feature:**
```gherkin
When I click the "Add to Cart" button for "NITTE T-Shirt"
```

**Step Definition:**
```javascript
import { When } from '@cucumber/cucumber';

When('I click the {string} button for {string}', function(button, product) {
  // Implementation
});
```

### 2. Handle DataTables

For complex data scenarios:

**Feature:**
```gherkin
Given the following products in my cart:
  | name           | quantity |
  | NITTE T-Shirt  | 2        |
  | NITTE Hoodie   | 1        |
```

**Step Definition:**
```javascript
Given('the following products in my cart:', function(dataTable) {
  const products = dataTable.hashes(); // Returns array of objects
  // Process products
});
```

## Key Concepts

### Context Object
A shared context object passes data between steps within a scenario:

```javascript
const context = {
  currentUser: null,
  cart: [],
  products: [],
  apiBaseUrl: 'http://localhost:3000/api/v1'
};
```

### Variables in Patterns

- `{string}` - Matches quoted strings: "Login" → matches "Login"
- `{int}` - Matches integers: 5 → matches 5
- `{float}` - Matches decimals: 49.99 → matches 49.99
- `{word}` - Matches single words: hello → matches hello

### Assertions

Always throw errors for failed assertions:

```javascript
Then('my cart should contain {int} items', function(expected) {
  if (context.cart.length !== expected) {
    throw new Error(`Expected ${expected} items, found ${context.cart.length}`);
  }
});
```

## Running BDD Tests

```bash
# Run all features
npm run test:bdd

# Run specific feature
npm run test:bdd -- --require-module @babel/register docs/bdd/features/02_authentication.feature

# Run with specific tags
npm run test:bdd -- --tags @critical

# Generate HTML report
npm run test:bdd -- --format html:test-results/cucumber-report.html
```

## Async Steps

Steps can be async for API calls:

```javascript
Given('a user exists with email {string}', async function(email) {
  const response = await axios.post(`${context.apiBaseUrl}/auth/signup`, {
    email,
    password: 'test123',
    name: 'Test User'
  });
  context.currentUser = response.data.data;
});
```

## Best Practices

1. **Keep steps focused** - One step = one action
2. **Reuse common steps** - Build a library of reusable Given/When/Then
3. **Use context judiciously** - Share data between steps via context object
4. **Test against real API** - Use actual backend for integration tests
5. **Handle errors clearly** - Throw descriptive error messages for debugging
6. **Mock external services** - Use axios-mock-adapter for irrelevant services

## Example: Complete Scenario Implementation

**Feature:**
```gherkin
Scenario: User can add product to cart
  Given I am logged in as a user
  And a product "NITTE T-Shirt" with price 499.99 is available
  When I add "NITTE T-Shirt" to cart
  Then my cart should contain 1 items
  And the cart count badge should show "1"
```

**Step Implementations:**
```javascript
Given('I am logged in as a user', function() {
  context.currentUser = { email: 'user@test.com', userId: 'user-123' };
});

Given('a product {string} with price {float} is available', function(name, price) {
  context.products.push({ name, price, _id: 'product-id' });
});

When('I add {string} to cart', function(productName) {
  const product = context.products.find(p => p.name === productName);
  context.cart.push({ ...product, quantity: 1 });
});

Then('my cart should contain {int} items', function(expected) {
  if (context.cart.length !== expected) {
    throw new Error(`Expected ${expected} items, found ${context.cart.length}`);
  }
});
```

## Debugging

### Print context during execution:
```javascript
When('I add to cart', function() {
  console.log('Current context:', context);
  // Rest of implementation
});
```

### View step execution order:
```bash
npm run test:bdd -- --dry-run
```

### Capture API responses:
```javascript
const response = await axios.get(url);
console.log('API Response:', response.data);
context.lastResponse = response.data;
```
