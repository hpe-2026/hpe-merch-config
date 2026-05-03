from pydantic import BaseModel, Field, field_serializer, field_validator
from typing import List, Optional
from datetime import datetime
from bson import ObjectId

class Product(BaseModel):
    id: str = Field(alias="_id")
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1, max_length=100)
    price: float = Field(..., gt=0)
    stock: int = Field(..., ge=0)
    image_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "_id": "507f1f77bcf86cd799439011",
                "name": "NITTE T-Shirt",
                "description": "Official NITTE merchandise t-shirt",
                "category": "clothing",
                "price": 499.99,
                "stock": 100,
                "image_url": "https://example.com/tshirt.jpg",
                "created_at": "2024-01-01T00:00:00",
                "updated_at": "2024-01-01T00:00:00"
            }
        }

    @field_validator('id', mode='before')
    @classmethod
    def validate_id(cls, v):
        if isinstance(v, ObjectId):
            return str(v)
        return v

    @field_serializer('id')
    def serialize_id(self, value):
        if isinstance(value, ObjectId):
            return str(value)
        return value

class ProductBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1, max_length=100)
    price: float = Field(..., gt=0)
    stock: int = Field(..., ge=0)
    image_url: Optional[str] = None

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[int] = None
    image_url: Optional[str] = None

class OrderItem(BaseModel):
    product_id: str
    quantity: int = Field(..., ge=1)
    price: float = Field(..., gt=0)

class OrderCreate(BaseModel):
    user_id: str
    user_email: str
    items: List[OrderItem]
    shipping_address: str
    notes: Optional[str] = ""
    status: str = "pending"
    payment: Optional[PaymentInfo] = None

class OrderUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None

class PaymentInfo(BaseModel):
    provider: Optional[str] = None
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    razorpay_signature: Optional[str] = None
    status: Optional[str] = None

class Order(BaseModel):
    id: str = Field(alias="_id")
    order_id: str
    user_id: str
    user_email: str
    items: List[OrderItem]
    shipping_address: str
    notes: str
    status: str
    payment: Optional[PaymentInfo] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "_id": "507f1f77bcf86cd799439012",
                "order_id": "ORD-12345",
                "user_id": "507f1f77bcf86cd799439011",
                "user_email": "user@example.com",
                "items": [
                    {
                        "product_id": "507f1f77bcf86cd799439013",
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

    @field_validator('id', mode='before')
    @classmethod
    def validate_id(cls, v):
        if isinstance(v, ObjectId):
            return str(v)
        return v

    @field_serializer('id')
    def serialize_id(self, value):
        if isinstance(value, ObjectId):
            return str(value)
        return value

class HealthResponse(BaseModel):
    status: str
    message: str
    timestamp: datetime

class ErrorResponse(BaseModel):
    success: bool = False
    message: str
    details: Optional[dict] = None
