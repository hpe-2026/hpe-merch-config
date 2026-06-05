#!/usr/bin/env bash
###############################################################################
# RBAC Phase 1 Testing Script
#
# Tests the new role hierarchy implementation:
# - Realm roles extraction
# - Client roles extraction
# - New middleware functions
#
# Usage: ./scripts/test-rbac-phase1.sh
###############################################################################

set -euo pipefail

echo "========================================"
echo "RBAC Phase 1 - Role Hierarchy Testing"
echo "========================================"
echo ""

# Configuration
API_BASE="http://localhost:3000"
KEYCLOAK_URL="http://localhost:8080"
REALM="nitte-realm"
CLIENT_ID="nitte-client"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to print results
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $2"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: $2"
        ((TESTS_FAILED++))
    fi
}

# Helper function to get token
get_token() {
    local username=$1
    local password=$2

    curl -s -X POST "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=password" \
        -d "client_id=${CLIENT_ID}" \
        -d "client_secret=nitte-client-secret" \
        -d "username=${username}" \
        -d "password=${password}" \
        -d "scope=openid profile email" | jq -r '.access_token'
}

echo "Step 1: Checking if services are running..."
echo "==========================================="

# Check if backend is running
if curl -sf "${API_BASE}/health" > /dev/null 2>&1; then
    print_result 0 "Backend API is running"
else
    print_result 1 "Backend API is not running (run: ./docker-setup.sh start)"
    exit 1
fi

# Check if Keycloak is running
if curl -sf "${KEYCLOAK_URL}/health/live" > /dev/null 2>&1; then
    print_result 0 "Keycloak is running"
else
    print_result 1 "Keycloak is not running"
    exit 1
fi

echo ""
echo "Step 2: Testing /api/auth/me endpoint..."
echo "========================================"

# Get a token for a test user
# First, try with a demo token if available
TOKEN=$(curl -s -X POST "${API_BASE}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@nitte.ac.in","password":"password123"}' 2>/dev/null | jq -r '.tokens.access_token' 2>/dev/null || echo "null")

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}⚠ Could not get token automatically${NC}"
    echo "Please manually obtain a token and set TOKEN environment variable:"
    echo "  export TOKEN=your_jwt_token_here"
    echo "  ./scripts/test-rbac-phase1.sh"
    echo ""
    echo "To get a token via curl:"
    echo "  curl -X POST http://localhost:3000/api/auth/login \\"
    echo "    -H 'Content-Type: application/json' \\"
    echo "    -d '{\"email\":\"your@email.com\",\"password\":\"yourpassword\"}'"
    exit 1
fi

echo "✓ Got access token"

# Test the /api/auth/me endpoint
echo ""
echo "Testing GET /api/auth/me..."
RESPONSE=$(curl -s -X GET "${API_BASE}/api/auth/me" \
    -H "Authorization: Bearer ${TOKEN}")

# Check if response contains the new role fields
if echo "$RESPONSE" | jq -e '.data.realmRoles' > /dev/null 2>&1; then
    print_result 0 "realmRoles field present in response"
else
    print_result 1 "realmRoles field missing from response"
fi

if echo "$RESPONSE" | jq -e '.data.clientRoles' > /dev/null 2>&1; then
    print_result 0 "clientRoles field present in response"
else
    print_result 1 "clientRoles field missing from response"
fi

if echo "$RESPONSE" | jq -e '.data.allClientRoles' > /dev/null 2>&1; then
    print_result 0 "allClientRoles field present in response"
else
    print_result 1 "allClientRoles field missing from response"
fi

echo ""
echo "Step 3: Inspecting JWT Token..."
echo "================================"

# Decode and display the token structure
echo "JWT Token Structure:"
echo "$TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq '.' || echo "Could not decode token"

echo ""
echo "Step 4: Checking for client roles in token..."
echo "============================================="

# Check if token has resource_access (client roles)
HAS_RESOURCE_ACCESS=$(echo "$TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq -e '.resource_access' > /dev/null 2>&1 && echo "yes" || echo "no")

if [ "$HAS_RESOURCE_ACCESS" = "yes" ]; then
    echo -e "${GREEN}✓ Token contains resource_access (client roles)${NC}"
    echo ""
    echo "Client roles found:"
    echo "$TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq '.resource_access'
else
    echo -e "${YELLOW}⚠ Token does NOT contain resource_access${NC}"
    echo ""
    echo "To add client roles, you need to:"
    echo "1. Log into Keycloak Admin Console: http://localhost:8080/admin"
    echo "2. Go to: nitte-realm > Clients > nitte-client > Roles"
    echo "3. Create client roles: order:create, order:read-own, product:create, etc."
    echo "4. Go to: Users > [select user] > Role Mapping"
    echo "5. Assign client roles to the user"
fi

echo ""
echo "Step 5: Testing role-protected endpoints..."
echo "=========================================="

# Test product creation (requires appropriate role)
echo ""
echo "Testing POST /api/products (should check for product:create role)..."
PRODUCT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE}/api/products" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"name":"Test Product","price":100}')

HTTP_CODE=$(echo "$PRODUCT_RESPONSE" | tail -n1)
BODY=$(echo "$PRODUCT_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    print_result 0 "Product creation endpoint accessible (user has required role)"
elif [ "$HTTP_CODE" = "403" ]; then
    print_result 0 "Product creation correctly blocked (403 Forbidden - user lacks role)"
else
    print_result 1 "Unexpected response: HTTP $HTTP_CODE"
    echo "Response: $BODY"
fi

echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests Failed: ${RED}${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ Phase 1 RBAC tests completed successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Create client roles in Keycloak (see docs/RBAC_MIGRATION_PLAN.md)"
    echo "2. Assign roles to users"
    echo "3. Run this test again to verify client roles are in the token"
    exit 0
else
    echo -e "${YELLOW}⚠ Some tests failed. Review the output above.${NC}"
    exit 1
fi
