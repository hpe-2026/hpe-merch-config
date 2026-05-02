import os
import requests
from urllib.parse import urljoin
import time

def before_all(context):
    """Initialize test context before all scenarios"""
    context.api_url = 'http://node-backend:3000/api/v1'  # Use Docker network hostname
    context.admin_email = 'admin@test.com'
    context.admin_password = 'Password123!'
    context.user_email = 'user@test.com'
    context.user_password = 'Password123!'
    
def before_scenario(context, scenario):
    """Initialize scenario-specific context"""
    context.api_url = 'http://node-backend:3000/api/v1'  # Ensure correct URL
    context.products = []
    context.current_product = None
    context.response = None
    context.auth_token = None
    context.refresh_token = None
    context.user = {
        'email': '',
        'password': '',
        'name': ''
    }
    context.cart = {'items': [], 'total': 0}
    context.cart_count = 0
    context.error_message = None
    context.confirmation_message = ''
    
    # Set up a test user for auth-required tests
    try:
        test_email = f"testuser-{int(time.time() * 1000)}@test.com"
        test_password = 'testPassword123'
        
        # Try to create a test user
        requests.post(
            f'{context.api_url}/auth/signup',
            json={'email': test_email, 'password': test_password, 'name': 'Test User'}
        )
        
        # Login to get token
        login_res = requests.post(
            f'{context.api_url}/auth/login',
            json={'email': test_email, 'password': test_password}
        )
        login_data = login_res.json()
        if login_data.get('tokens', {}).get('access_token'):
            context.auth_token = login_data['tokens']['access_token']
            context.test_email = test_email
            context.test_password = test_password
    except:
        # If setup fails, continue anyway
        pass
    
def after_scenario(context, scenario):
    """Cleanup after each scenario"""
    if scenario.status == 'failed':
        print(f"\n❌ Failed: {scenario.name}")
        if hasattr(context, 'error_message') and context.error_message:
            print(f"Error: {context.error_message}")
