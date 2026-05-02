from fastapi import APIRouter, HTTPException, Depends, status, Query
from pymongo.errors import DuplicateKeyError
from bson import ObjectId
from datetime import datetime
import logging
from app.api.models import Order, OrderCreate, OrderUpdate
from app.db.database import get_database
from motor.motor_asyncio import AsyncIOMotorDatabase
from opentelemetry import trace

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/orders", tags=["orders"])
tracer = trace.get_tracer(__name__)

@router.get("/", response_model=list[Order])
async def get_orders(
    user_id: str = Query(None),
    status_filter: str = Query(None, alias="status"),
    skip: int = 0,
    limit: int = 50,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Get orders with optional filtering by user_id and status
    """
    try:
        with tracer.start_as_current_span("mongodb.find") as span:
            # OpenTelemetry database conventions
            span.set_attribute("db.system", "mongodb")
            span.set_attribute("db.name", "nitte_merchandise")
            span.set_attribute("db.operation", "find")
            span.set_attribute("db.mongodb.collection", "orders")
            span.set_attribute("mongodb.collection", "orders")
            span.set_attribute("mongodb.operation", "find")
            
            orders_collection = db["orders"]
            query = {}

            if user_id:
                query["user_id"] = user_id
                span.set_attribute("db.mongodb.query.user_id", user_id)
                span.set_attribute("mongodb.query.user_id", user_id)
            if status_filter:
                query["status"] = status_filter
                span.set_attribute("db.mongodb.query.status", status_filter)
                span.set_attribute("mongodb.query.status", status_filter)

            orders = await orders_collection.find(query).skip(skip).limit(limit).to_list(length=limit)
            span.set_attribute("db.mongodb.records_returned", len(orders))
            span.set_attribute("mongodb.result_count", len(orders))
            span.set_attribute("status.code", "OK")

        return [Order(**order) for order in orders]
    except Exception as e:
        logger.error(f"Error fetching orders: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch orders"
        )

@router.get("/{order_id}", response_model=Order)
async def get_order(
    order_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Get order by ID
    """
    try:
        with tracer.start_as_current_span("mongodb.find_one") as span:
            # OpenTelemetry database conventions
            span.set_attribute("db.system", "mongodb")
            span.set_attribute("db.name", "nitte_merchandise")
            span.set_attribute("db.operation", "find_one")
            span.set_attribute("db.mongodb.collection", "orders")
            span.set_attribute("mongodb.collection", "orders")
            span.set_attribute("mongodb.operation", "find_one")
            
            orders_collection = db["orders"]

            if not ObjectId.is_valid(order_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid order ID"
                )

            order = await orders_collection.find_one({"_id": ObjectId(order_id)})
            span.set_attribute("db.mongodb.query_id", order_id)
            span.set_attribute("db.mongodb.found", order is not None)
            span.set_attribute("status.code", "OK")

            if not order:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Order not found"
                )

        return Order(**order)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching order {order_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch order"
        )

@router.post("/", response_model=Order, status_code=status.HTTP_201_CREATED)
async def create_order(
    order: OrderCreate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Create a new order
    """
    try:
        with tracer.start_as_current_span("mongodb.insert") as span:
            # OpenTelemetry database conventions
            span.set_attribute("db.system", "mongodb")
            span.set_attribute("db.name", "nitte_merchandise")
            span.set_attribute("db.operation", "insert")
            span.set_attribute("db.mongodb.collection", "orders")
            span.set_attribute("mongodb.collection", "orders")
            span.set_attribute("mongodb.operation", "insert_one")
            
            orders_collection = db["orders"]

            order_dict = order.model_dump()
            
            # Generate order_id if not provided
            if "order_id" not in order_dict or not order_dict["order_id"]:
                # Generate a unique order_id
                count = await orders_collection.count_documents({})
                order_dict["order_id"] = f"ORD-{count + 1:05d}"
            
            order_dict["created_at"] = datetime.utcnow()
            order_dict["updated_at"] = datetime.utcnow()

            result = await orders_collection.insert_one(order_dict)
            span.set_attribute("db.mongodb.inserted_id", str(result.inserted_id))
            span.set_attribute("mongodb.inserted_id", str(result.inserted_id))
            span.set_attribute("status.code", "OK")

            created_order = await orders_collection.find_one({"_id": result.inserted_id})
        return Order(**created_order)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating order: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create order"
        )

@router.put("/{order_id}", response_model=Order)
async def update_order(
    order_id: str,
    order: OrderUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Update an order
    """
    try:
        orders_collection = db["orders"]

        if not ObjectId.is_valid(order_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid order ID"
            )

        update_data = order.model_dump(exclude_unset=True)
        update_data["updated_at"] = datetime.utcnow()

        result = await orders_collection.update_one(
            {"_id": ObjectId(order_id)},
            {"$set": update_data}
        )

        if result.matched_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Order not found"
            )

        updated_order = await orders_collection.find_one({"_id": ObjectId(order_id)})
        return Order(**updated_order)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating order {order_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update order"
        )
