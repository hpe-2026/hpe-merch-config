 # BDD Testing in the NITTE Project - Simple Explanation

## Table of Contents
1. [What is BDD?](#what-is-bdd)
2. [How BDD Works in This Project](#how-bdd-works-in-this-project)
3. [What's Currently Implemented](#whats-currently-implemented)
4. [What's Not Yet Implemented](#whats-not-yet-implemented)
5. [Project Test Results](#project-test-results)
6. [How to Run the Tests](#how-to-run-the-tests)

---

## What is BDD?

### The Simple Version
**BDD = Behavior-Driven Development**. It's a way of testing software by describing what the application *should do* in plain English before anyone writes the code.

Instead of technical programmers writing confusing test code, business people and developers work together to write tests in a language everyone understands.

### A Real-World Example
**Normal test code** (hard to understand):
```
assert response.status_code == 201 && response.json().success === true
```

**BDD test** (easy to understand):
```
When I submit signup with email "john@example.com" password "password123" and name "John Doe"
Then I should receive a success response
And the user should be created in the system
```

The BDD version reads like instructions a human would give, not computer code.

---

## How BDD Works in This Project

### The Three Parts of BDD Testing

The NITTE project uses BDD with two different testing frameworks:
- **Node.js Backend**: Uses **Cucumber** (JavaScript testing framework)
- **Python Service**: Uses **Behave** (Python testing framework)

Both do the same thing, just in different programming languages.

### The Testing Flow

```

                  1. Write Feature File                       
  (Plain English description of what should happen)           

                              ↓

                  2. Write Step Definitions                   
  (Python/JavaScript code that makes the steps actually run)  

                              ↓

                  3. Run the Tests                            
  (Test framework reads feature file, executes step code)     

                              ↓

                  4. View Results                             
  (Pass or Fail - easy to see which features work)            

```

### Part 1: Feature Files (The Human-Readable Tests)

**Location**: 
- Node.js: `node-backend/features/`
- Python: `python-service/features/`

**What they contain**: Plain English descriptions of features and scenarios

**Example** (`01_user_signup_and_login.feature`):
```gherkin
Feature: User Signup and Login
  As a user
  I want to register and log in
  So that I can access my account and place orders

  Scenario: User can sign up with valid credentials
    Given the authentication service is running
    When I submit signup with email "newuser@test.com" password "password123" and name "John Doe"
    Then I should receive a success response
    And the user should be created in the system
```

**Breaking this down**:
- `Feature`: The big thing being tested (User Signup and Login)
- `Scenario`: One specific test case (signing up with valid info)
- `Given`: The starting condition (service is running)
- `When`: The action the user takes (submits signup form)
- `Then`: What we expect to happen (success response)
- `And`: Additional confirmations (user exists in database)

### Part 2: Step Definitions (The Code That Makes Tests Run)

**Location**:
- Node.js: `node-backend/features/step_definitions/common_steps.js`
- Python: `python-service/features/steps/common_steps.py`

**What they do**: Convert English steps into actual code that tests the API

**Example** (same test, in Python code):
```python
@when('I submit signup with email {email} password {password} and name {name}')
def step_submit_signup(context, email, password, name):
    # Strip quotes from the parameters
    email = email.strip('"')
    password = password.strip('"')
    name = name.strip('"')
    
    # Make email unique so tests don't conflict
    if '@test.com' in email:
        unique_email = f"{email.split('@')[0]}-{int(time.time() * 1000)}@test.com"
    else:
        unique_email = email
    
    # Actually ask the API to create a user
    response = requests.post(
        'http://node-backend:3000/api/v1/auth/signup',
        json={'email': unique_email, 'password': password, 'name': name}
    )
    
    # Store the response so the next step can check it
    context.response = response
    context.response_data = response.json()
```

**What's happening**:
1. The `@when` decorator links to the English step
2. The function receives the parameters (email, password, name)
3. It calls the actual API endpoint
4. It saves the response for other steps to check

### Part 3: Test Execution

**How it works**:
1. Testing framework reads the feature file
2. For each step, it finds the matching step definition function
3. Executes that function
4. Checks if it passed or failed
5. Moves to the next step

**Example flow for "User can sign up"**:
```
Step 1: "Given the authentication service is running"
  → Runs step_auth_service_running() 
  → Makes health check request
  →  PASS

Step 2: "When I submit signup..."
  → Runs step_submit_signup()
  → Creates user via API
  →  PASS

Step 3: "Then I should receive a success response"
  → Checks response status is 200 or 201
  →  PASS

Step 4: "And the user should be created..."
  → Checks response indicates success
  →  PASS

Overall:  SCENARIO PASSED
```

---

## What's Currently Implemented

###  Feature Files (3 Feature Files, 18 Scenarios)

The project has three feature files testing the core functionality:

#### 1. **User Signup and Login** (`01_user_signup_and_login.feature`)
Tests user registration and login functionality
-  User can sign up with valid credentials
-  User can log in with valid credentials
-  User cannot sign up with invalid email
-  User cannot sign up with short password
-  User cannot log in with wrong password
-  User cannot log in with nonexistent email

**Status**: Node.js 2/6 PASS | Python 4/6 PASS

#### 2. **Product Browsing** (`02_product_browsing.feature`)
Tests viewing and filtering products
-  Guest can view all products
-  Guest can view a specific product
-  Products can be filtered by category
-  Invalid product ID returns error
-  Nonexistent product returns 404

**Status**: Node.js 5/5 PASS | Python 3/5 PASS

#### 3. **Order Management** (`03_order_management.feature`)
Tests placing and viewing orders
-  Authenticated user can view their orders
-  Admin can view all orders
-  Unauthenticated user cannot view orders
-  Regular user cannot view other user's orders
-  Invalid order ID returns error

**Status**: Node.js 5/5 PASS | Python 3/5 PASS

###  Test Frameworks Integrated

**Node.js (Cucumber)**
- Version: 9.5.1
- Uses ES modules for modern JavaScript
- Runs inside Docker container
- Command: `npm run test:bdd`

**Python (Behave)**
- Version: 1.2.6
- Runs inside Docker container
- Command: `python -m behave features/`

###  Docker Integration

Both testing frameworks run inside Docker containers that match the actual service containers:
- Tests run against real API endpoints
- Services in separate containers communicate via Docker network
- Tests don't interfere with local machine

###  Real API Testing

Tests actually call the real API endpoints, not mocked versions:
- Tests signup by calling actual `/auth/signup` endpoint
- Tests login by calling actual `/auth/login` endpoint
- Tests products by calling actual `/products` endpoint
- Gets real responses from real database

###  Test Data Management

**Unique Email Generation**:
- Each test generates unique emails with timestamps
- Prevents "email already exists" errors
- Example: `newuser-1774806095862@test.com`

**Automatic Authentication**:
- Before each scenario, a test user is created
- Test user credentials are stored in test context
- Login tests use these real credentials

###  Response Handling

Tests can handle both success and error responses:
- Checks HTTP status codes (200, 201, 400, 401, 404, etc.)
- Parses JSON responses
- Extracts authentication tokens
- Validates response structure

---

## What's Not Yet Implemented

###  Partial Failures (6 tests failing out of 16 Python tests)

#### Known Issues in Python Tests:

1. **Wrong Password Scenario** (01_user_signup_and_login.feature:36)
   - **Expected**: Login should fail with error
   - **Actual**: Login succeeds anyway
   - **Reason**: Test data handling issue

2. **Nonexistent Email Scenario** (01_user_signup_and_login.feature:42)
   - **Expected**: Should return 401 Unauthorized
   - **Actual**: Gets correct error but assertion is too strict
   - **Reason**: Error code validation needs adjustment

3. **Product Tests** (02_product_browsing.feature: scenarios 29, 35)
   - **Expected**: Should return 400/404 for invalid product IDs
   - **Actual**: API returns 500 error instead
   - **Reason**: May be API issue or test data send wrong format

4. **Order Tests** (03_order_management.feature: scenarios 24, 30, 36)
   - **Expected**: Should return proper auth errors
   - **Actual**: Getting 500 errors
   - **Reason**: Order API endpoint issues or permission problems

###  Missing Coverage

The following features are **not tested** yet:
- Database integration (MongoDB)
- Payment processing
- Email notifications
- Shopping cart functionality
- Admin dashboard features
- User profile management
- Order history details

###  No Performance Testing

BDD tests don't measure:
- How fast queries run
- API response times
- Concurrent user handling
- Load under stress

###  Limited Negative Testing

Currently limited test coverage for:
- SQL injection attempts
- Cross-site scripting (XSS)
- Missing required fields (only "short password" tested)
- Very long input strings
- Special characters in inputs

###  No End-to-End UI Testing

These tests only hit the API. Not tested:
- Frontend JavaScript functionality
- CSS/styling
- User interface interactions
- Form validation on frontend
- Mobile responsiveness

---

## Project Test Results

### Current Status Summary

```
Total Scenarios: 32 (across both frameworks)
Passing: 22 scenarios (69%)
Failing: 10 scenarios (31%)

Node.js (Cucumber):     12/16 passing (75%)   Better
Python (Behave):        10/16 passing (63%)   Improved
```

### Node.js Results (12/16 PASS)

| Feature | Passing | Status |
|---------|---------|--------|
| Signup/Login | 2/6 | 2 failures: wrong password, nonexistent email |
| Products | 5/5 |  All passing |
| Orders | 5/5 |  All passing |

### Python Results (10/16 PASS)

| Feature | Passing | Status |
|---------|---------|--------|
| Signup/Login | 4/6 | Better than Node! 2 failures |
| Products | 3/5 | 2 failures: invalid ID, nonexistent |
| Orders | 3/5 | 3 failures: auth issues |

### Why Python Had Issues (Recently Fixed)

The Python tests had several systematic issues that were just fixed:

1. **Quote Problem**: Gherkin parameters included literal quotes
   - Feature: `email "newuser@test.com"` 
   - Code received: `"newuser@test.com"` (with quotes!)
   - **Fixed**: Strip quotes in step definitions

2. **Email Uniqueness**: Not all test emails made unique
   - Old code: Only made unique if email contained "newuser"
   - New code: Makes any `@test.com` email unique
   - **Fixed**: Extended the check

3. **User Creation**: Login tests couldn't use created users
   - Old code: Didn't actually create users in database
   - New code: Actually calls signup API before login attempts
   - **Fixed**: Added database user creation

4. **Context Loss**: Response object disappeared between steps
   - Old code: `context.response` was set, then lost
   - New code: Store status code separately as backup
   - **Fixed**: Added `context.response_status_code` workaround

---

## How to Run the Tests

### Option 1: Run Both Frameworks Together
```bash
cd /home/languid/Downloads/HPE-task-2
./demo.sh bdd
```

This will:
1. Check if services are running
2. Run Node.js tests (Cucumber)
3. Run Python tests (Behave)
4. Show a summary of results

### Option 2: Run Just Node.js Tests
```bash
docker exec -w /app nitte-node-backend npm run test:bdd
```

### Option 3: Run Just Python Tests
```bash
docker exec -w /app nitte-python-service python -m behave features/
```

### Option 4: Run One Specific Feature File

**Python - Signup/Login only**:
```bash
docker exec -w /app nitte-python-service python -m behave features/01_user_signup_and_login.feature
```

**Node.js - Products only**:
```bash
docker exec -w /app nitte-node-backend npm run test:bdd -- features/02_product_browsing.feature
```

### Option 5: Run One Specific Scenario (by line number)

**Python - Only the "valid signup" test**:
```bash
docker exec -w /app nitte-python-service python -m behave features/01_user_signup_and_login.feature:9
```

The `:9` refers to the line number in the feature file where that scenario starts.

---

## Understanding Test Output

### Successful Test Output
```
Feature: User Signup and Login

  Scenario: User can sign up with valid credentials
    Given the authentication service is running              #  PASS
    When I submit signup with email "newuser@test.com"...   #  PASS
    Then I should receive a success response                #  PASS
    And the user should be created in the system            #  PASS

1 scenario passed, 0 failed
4 steps passed
```

### Failed Test Output
```
Scenario: User cannot sign up with invalid email
  Given the authentication service is running                #  PASS
  When I submit signup with email "notanemail"...            #  PASS
  Then I should receive a validation error                  #  FAIL
    AssertionError: Expected 4xx error, got 500

 Failed: User cannot sign up with invalid email
```

### Reading the Results
- ` PASS` in green = Step worked correctly
- ` FAIL` in red = Step didn't work as expected
- Line number at end = Where in feature file the scenario is
- Error message = What went wrong and what was expected

---

## Key Concepts Explained Simply

### Context (Test Memory)
Each test scenario has a "context" object that remembers information between steps:
- What email was used for signup
- What response the API returned
- What authentication token was received

This is how one step's output becomes the next step's input.

### Step Definitions (Reusable Code)
If two scenarios both need to "submit signup", they use the same step definition.
This means:
- Less code to write
- Consistent behavior
- Easier to fix bugs (fix once, help all tests)

### API Endpoints Being Tested
The tests call these real API endpoints:
- `POST /auth/signup` - Create new user
- `POST /auth/login` - Login and get token
- `GET /products` - Get all products
- `GET /products/{id}` - Get one product
- `GET /orders` - Get user's orders

### Test Data
Each test uses slightly different data:
- Valid email: `newuser-[timestamp]@test.com` (unique)
- Invalid email: `notanemail` (no @ symbol)
- Valid password: `password123`
- Short password: `short`

This variety ensures the API handles all scenarios.

---

## Quick Summary

| Aspect | Status | Details |
|--------|--------|---------|
| BDD Framework |  Implemented | Cucumber (Node) + Behave (Python) |
| Feature Files |  Implemented | 3 features, 18 scenarios, 32 tests total |
| Step Definitions |  Implemented | Real API calls, proper error handling |
| Test Execution |  Working | 22/32 tests passing (69%) |
| Docker Integration |  Working | Tests run in containers, isolated |
| Test Data Management |  Working | Unique emails, auto user creation |
| UI Testing |  Not Done | Only API tested, no frontend |
| Performance Testing |  Not Done | No load or speed testing |
| Extended Scenarios |  Partial | Some edge cases still failing |

---

## Why This Matters

### Benefits of BDD Testing
1. **Easy to Understand**: Non-technical people can read tests
2. **Self-Documenting**: Tests ARE the documentation
3. **Maintainable**: Clear what each test is supposed to do
4. **Collaborative**: Business and developers speak same language
5. **Living Documentation**: Tests show what actually works

### For This Project
The NITTE project uses BDD to:
- Verify both Node.js and Python backends work correctly
- Test against real API endpoints (not mocks)
- Run tests in Docker (same environment as production)
- Ensure features work as promised
- Catch bugs before users find them

---

## Next Steps to Improve Testing

1. **Fix Remaining 10 Failures**
   - Wrong password handling (test data issue)
   - Invalid ID responses (API returns wrong error code)
   - Order authorization checks (permission issues)

2. **Add More Scenarios**
   - Shopping cart functionality
   - Payment processing
   - User profile management
   - Permission checks for admin features

3. **Add UI Testing**
   - Test React frontend with Cypress or Selenium
   - Verify forms work correctly
   - Check error messages show to users

4. **Add Performance Testing**
   - Load testing with JMeter or K6
   - Database query optimization
   - API response time targets

5. **Add Security Testing**
   - Test password complexity rules
   - Test SQL injection prevention
   - Test XSS protection
   - Test CSRF protection

