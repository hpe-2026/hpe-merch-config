from fastapi import APIRouter, HTTPException, Depends, status
from pymongo.errors import DuplicateKeyError
from bson import ObjectId
from datetime import datetime
import logging
from app.api.models import Product, ProductCreate, ProductUpdate
from app.db.database import get_database, database
from motor.motor_asyncio import AsyncIOMotorDatabase
from opentelemetry import trace

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/products", tags=["products"])
tracer = trace.get_tracer(__name__)

@router.get("/", response_model=list[Product])
async def get_products(
    category: str = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Get all products with optional filtering
    """
    try:
        with tracer.start_as_current_span("mongodb.find") as span:
            # OpenTelemetry database conventions
            span.set_attribute("db.system", "mongodb")
            span.set_attribute("db.name", "nitte_merchandise")
            span.set_attribute("db.operation", "find")
            span.set_attribute("db.mongodb.collection", "products")
            span.set_attribute("mongodb.collection", "products")
            span.set_attribute("mongodb.operation", "find")
            
            products_collection = db["products"]
            query = {}

            if category:
                query["category"] = category
                span.set_attribute("db.mongodb.query", f"category={category}")
                span.set_attribute("mongodb.query.filter", f"category={category}")

            products = await products_collection.find(query).skip(skip).limit(limit).to_list(length=limit)
            span.set_attribute("db.mongodb.records_returned", len(products))
            span.set_attribute("mongodb.result_count", len(products))
            span.set_attribute("status.code", "OK")

        return [Product(**product) for product in products]
    except Exception as e:
        logger.error(f"Error fetching products: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch products"
        )

@router.get("/{product_id}", response_model=Product)
async def get_product(
    product_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Get product by ID
    """
    try:
        with tracer.start_as_current_span("mongodb.find_one") as span:
            # OpenTelemetry database conventions
            span.set_attribute("db.system", "mongodb")
            span.set_attribute("db.name", "nitte_merchandise")
            span.set_attribute("db.operation", "find_one")
            span.set_attribute("db.mongodb.collection", "products")
            span.set_attribute("mongodb.collection", "products")
            span.set_attribute("mongodb.operation", "find_one")
            
            products_collection = db["products"]

            if not ObjectId.is_valid(product_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid product ID"
                )

            product = await products_collection.find_one({"_id": ObjectId(product_id)})
            span.set_attribute("db.mongodb.query_id", product_id)
            span.set_attribute("db.mongodb.found", product is not None)
            span.set_attribute("mongodb.found", product is not None)
            span.set_attribute("status.code", "OK")

            if not product:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Product not found"
                )

        return Product(**product)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching product {product_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch product"
        )

@router.post("/", response_model=Product, status_code=status.HTTP_201_CREATED)
async def create_product(
    product: ProductCreate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Create a new product
    """
    try:
        with tracer.start_as_current_span("mongodb.insert") as span:
            # OpenTelemetry database conventions
            span.set_attribute("db.system", "mongodb")
            span.set_attribute("db.name", "nitte_merchandise")
            span.set_attribute("db.operation", "insert")
            span.set_attribute("db.mongodb.collection", "products")
            span.set_attribute("mongodb.collection", "products")
            span.set_attribute("mongodb.operation", "insert_one")
            
            products_collection = db["products"]

            product_dict = product.model_dump()
            product_dict["created_at"] = datetime.utcnow()
            product_dict["updated_at"] = datetime.utcnow()

            result = await products_collection.insert_one(product_dict)
            span.set_attribute("db.mongodb.inserted_id", str(result.inserted_id))
            span.set_attribute("mongodb.inserted_id", str(result.inserted_id))
            span.set_attribute("status.code", "OK")

            created_product = await products_collection.find_one({"_id": result.inserted_id})
        return Product(**created_product)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Product already exists"
        )
    except Exception as e:
        logger.error(f"Error creating product: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create product"
        )

@router.put("/{product_id}", response_model=Product)
async def update_product(
    product_id: str,
    product: ProductUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Update a product
    """
    try:
        with tracer.start_as_current_span("mongodb.update") as span:
            # OpenTelemetry database conventions
            span.set_attribute("db.system", "mongodb")
            span.set_attribute("db.name", "nitte_merchandise")
            span.set_attribute("db.operation", "update")
            span.set_attribute("db.mongodb.collection", "products")
            span.set_attribute("mongodb.collection", "products")
            span.set_attribute("mongodb.operation", "update_one")
            
            products_collection = db["products"]

            if not ObjectId.is_valid(product_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid product ID"
                )

            update_data = product.model_dump(exclude_unset=True)
            update_data["updated_at"] = datetime.utcnow()
            span.set_attribute("db.mongodb.query_id", product_id)

            result = await products_collection.update_one(
                {"_id": ObjectId(product_id)},
                {"$set": update_data}
            )
            span.set_attribute("db.mongodb.matched_count", result.matched_count)
            span.set_attribute("db.mongodb.modified_count", result.modified_count)
            span.set_attribute("mongodb.matched_count", result.matched_count)
            span.set_attribute("mongodb.modified_count", result.modified_count)
            span.set_attribute("status.code", "OK")

            if result.matched_count == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Product not found"
                )

            updated_product = await products_collection.find_one({"_id": ObjectId(product_id)})
        return Product(**updated_product)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating product {product_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update product"
        )

@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Delete a product
    """
    try:
        products_collection = db["products"]

        if not ObjectId.is_valid(product_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid product ID"
            )

        result = await products_collection.delete_one({"_id": ObjectId(product_id)})

        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting product {product_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete product"
        )
