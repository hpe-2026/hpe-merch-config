from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
import logging
from app.config import settings
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)

class MongoDatabase:
    client: AsyncIOMotorClient = None
    db: AsyncIOMotorDatabase = None

    async def connect(self):
        """Connect to MongoDB with OpenTelemetry tracing"""
        with tracer.start_as_current_span("mongodb.connect") as span:
            span.set_attribute("mongodb.url", settings.MONGODB_URL)
            try:
                self.client = AsyncIOMotorClient(settings.MONGODB_URL)
                self.db = self.client[settings.DATABASE_NAME]

                # Verify connection
                await self.db.command('ping')
                span.set_attribute("connection.status", "connected")
                logger.info(f"Connected to MongoDB at {settings.MONGODB_URL}")

                # Create collections and indexes
                await self._create_indexes()
            except Exception as e:
                span.set_status(Status(StatusCode.ERROR))
                span.record_exception(e)
                logger.error(f"Failed to connect to MongoDB: {str(e)}")
                raise

    async def disconnect(self):
        """Disconnect from MongoDB"""
        with tracer.start_as_current_span("mongodb.disconnect"):
            try:
                if self.client:
                    self.client.close()
                    logger.info("Disconnected from MongoDB")
            except Exception as e:
                logger.error(f"Failed to disconnect from MongoDB: {str(e)}")

    async def _create_indexes(self):
        """Create collections and indexes with tracing"""
        with tracer.start_as_current_span("mongodb.create_indexes") as span:
            try:
                # Products collection
                products_collection = self.db["products"]
                span.add_event("creating_index", {"collection": "products", "field": "name"})
                await products_collection.create_index("name")
                await products_collection.create_index("category")
                await products_collection.create_index("price")

                # Orders collection
                orders_collection = self.db["orders"]
                span.add_event("creating_index", {"collection": "orders", "field": "user_id"})
                await orders_collection.create_index("user_id")
                await orders_collection.create_index("order_id", unique=True)
                await orders_collection.create_index("status")
                await orders_collection.create_index("created_at")

                # Users collection
                users_collection = self.db["users"]
                span.add_event("creating_index", {"collection": "users", "field": "email"})
                await users_collection.create_index("email", unique=True)

                span.set_attribute("indexes.created", True)
                logger.info("Database indexes created successfully")
            except Exception as e:
                span.set_status(Status(StatusCode.ERROR))
                span.record_exception(e)
                logger.error(f"Failed to create indexes: {str(e)}")

    def get_db(self) -> AsyncIOMotorDatabase:
        """Get database instance"""
        return self.db
    
    async def trace_operation(self, operation_name: str, collection_name: str, query: dict = None):
        """Helper method to trace database operations"""
        with tracer.start_as_current_span(f"mongodb.{operation_name}") as span:
            span.set_attribute("mongodb.collection", collection_name)
            span.set_attribute("mongodb.operation", operation_name)
            if query:
                span.set_attribute("mongodb.query", str(query)[:100])  # Limit length
            return span

# Global database instance
database = MongoDatabase()

async def get_database() -> AsyncIOMotorDatabase:
    """Dependency for getting database"""
    return database.get_db()
