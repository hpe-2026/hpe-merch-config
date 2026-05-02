import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.api.models import ProductCreate, OrderCreate, OrderItem

client = TestClient(app)

class TestProductEndpoints:
    """Test product CRUD operations"""

    def test_get_products(self):
        """Test retrieving all products"""
        response = client.get("/api/v1/products")
        assert response.status_code == 200

    def test_get_products_with_category_filter(self):
        """Test filtering products by category"""
        response = client.get("/api/v1/products?category=clothing")
        assert response.status_code == 200

    def test_get_products_with_pagination(self):
        """Test product pagination"""
        response = client.get("/api/v1/products?skip=0&limit=10")
        assert response.status_code == 200

    def test_create_product_valid(self):
        """Test creating a product with valid data"""
        product_data = {
            "name": "Test Product",
            "description": "A test product",
            "category": "test",
            "price": 99.99,
            "stock": 10,
            "image_url": "https://example.com/image.jpg"
        }
        response = client.post("/api/v1/products", json=product_data)
        assert response.status_code == 201
        assert response.json()["name"] == "Test Product"

    def test_create_product_invalid_price(self):
        """Test creating product with invalid price"""
        product_data = {
            "name": "Test Product",
            "description": "A test product",
            "category": "test",
            "price": -10,  # Invalid negative price
            "stock": 10
        }
        response = client.post("/api/v1/products", json=product_data)
        assert response.status_code == 422  # Unprocessable Entity

    def test_create_product_missing_required_field(self):
        """Test creating product without required fields"""
        product_data = {
            "name": "Test Product",
            # Missing description
            "category": "test",
            "price": 99.99,
            "stock": 10
        }
        response = client.post("/api/v1/products", json=product_data)
        assert response.status_code == 422


class TestOrderEndpoints:
    """Test order operations"""

    def test_create_order_valid(self):
        """Test creating a valid order"""
        order_data = {
            "user_id": "user123",
            "user_email": "user@example.com",
            "items": [
                {
                    "product_id": "product123",
                    "quantity": 2,
                    "price": 99.99
                }
            ],
            "shipping_address": "123 Main St, City, State 12345",
            "order_id": "ORD-12345"
        }
        response = client.post("/api/v1/orders", json=order_data)
        assert response.status_code == 201
        assert response.json()["order_id"] == "ORD-12345"

    def test_create_order_invalid_quantity(self):
        """Test creating order with invalid quantity"""
        order_data = {
            "user_id": "user123",
            "user_email": "user@example.com",
            "items": [
                {
                    "product_id": "product123",
                    "quantity": 0,  # Invalid: must be >= 1
                    "price": 99.99
                }
            ],
            "shipping_address": "123 Main St",
            "order_id": "ORD-12345"
        }
        response = client.post("/api/v1/orders", json=order_data)
        assert response.status_code == 422

    def test_get_orders(self):
        """Test retrieving orders"""
        response = client.get("/api/v1/orders?user_id=user123")
        assert response.status_code == 200


class TestHealthEndpoints:
    """Test health check endpoints"""

    def test_health_check(self):
        """Test service health endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_ping(self):
        """Test ping endpoint"""
        response = client.get("/ping")
        assert response.status_code == 200
        assert response.json()["status"] == "pong"

    def test_root_endpoint(self):
        """Test root endpoint"""
        response = client.get("/")
        assert response.status_code == 200
        assert response.json()["success"] is True


class TestDataValidation:
    """Test Pydantic data validation"""

    def test_product_create_validation(self):
        """Test ProductCreate model validation"""
        valid_data = {
            "name": "Test",
            "description": "Test desc",
            "category": "test",
            "price": 99.99,
            "stock": 10
        }
        product = ProductCreate(**valid_data)
        assert product.name == "Test"
        assert product.price == 99.99

    def test_order_item_validation(self):
        """Test OrderItem model validation"""
        valid_data = {
            "product_id": "123",
            "quantity": 2,
            "price": 99.99
        }
        item = OrderItem(**valid_data)
        assert item.quantity == 2
        assert item.price == 99.99


@pytest.fixture
def mock_database(mocker):
    """Mock database for testing"""
    return mocker.patch('app.db.database.database')


def test_database_connection(mock_database):
    """Test database connection mock"""
    assert mock_database is not None
