from fastapi import FastAPI, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
from datetime import datetime
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CollectorRegistry
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import time
import os

# OpenTelemetry imports for Jaeger tracing
from opentelemetry import trace
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.trace import Status, StatusCode

from app.config import settings
from app.db.database import database
from app.api.routes import products, orders
from app.api.models import HealthResponse

# Configure logging
logging.basicConfig(
    level=settings.LOG_LEVEL.upper(),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== OpenTelemetry + Jaeger Configuration ====================

def init_opentelemetry_jaeger():
    """Initialize OpenTelemetry with Jaeger exporter for distributed tracing"""
    # Create resource with service name
    resource = Resource.create({
        "service.name": "nitte-python-service",
        "service.version": "1.0.0"
    })
    
    jaeger_exporter = JaegerExporter(
        agent_host_name=os.getenv('JAEGER_AGENT_HOST', 'nitte-jaeger'),
        agent_port=int(os.getenv('JAEGER_AGENT_PORT', 6831)),
    )
    
    trace_provider = TracerProvider(resource=resource)
    trace_provider.add_span_processor(BatchSpanProcessor(jaeger_exporter))
    trace.set_tracer_provider(trace_provider)
    
    logger.info(
        f" OpenTelemetry Jaeger initialized: "
        f"host={os.getenv('JAEGER_AGENT_HOST', 'nitte-jaeger')}, "
        f"port={os.getenv('JAEGER_AGENT_PORT', 6831)}"
    )

init_opentelemetry_jaeger()

# ==================== Prometheus metrics setup ====================

REGISTRY = CollectorRegistry()

http_request_duration = Histogram(
    'http_request_duration_seconds',
    'Duration of HTTP requests in seconds',
    ['method', 'endpoint', 'status_code'],
    buckets=[0.1, 0.5, 1, 2, 5],
    registry=REGISTRY
)

http_requests_total = Counter(
    'http_requests_total',
    'Total number of HTTP requests',
    ['method', 'endpoint', 'status_code'],
    registry=REGISTRY
)

active_connections = Gauge(
    'active_connections',
    'Number of active connections',
    registry=REGISTRY
)

orders_created = Counter(
    'orders_created_total',
    'Total number of orders created',
    registry=REGISTRY
)

products_viewed = Counter(
    'products_viewed_total',
    'Total number of product views',
    registry=REGISTRY
)

# ==================== Middleware ====================

class PrometheusMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start_time = time.time()
        active_connections.inc()
        
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as e:
            status_code = 500
            raise
        finally:
            duration = time.time() - start_time
            endpoint = request.url.path
            method = request.method
            
            http_request_duration.labels(
                method=method,
                endpoint=endpoint,
                status_code=status_code
            ).observe(duration)
            
            http_requests_total.labels(
                method=method,
                endpoint=endpoint,
                status_code=status_code
            ).inc()
            
            active_connections.dec()
        
        return response

class OTelMetadataMiddleware(BaseHTTPMiddleware):
    """Add metadata to OpenTelemetry spans"""
    async def dispatch(self, request, call_next):
        tracer = trace.get_tracer(__name__)
        
        with tracer.start_as_current_span(f"{request.method} {request.url.path}") as span:
            span.set_attribute("http.method", request.method)
            span.set_attribute("http.url", str(request.url))
            span.set_attribute("http.target", request.url.path)
            
            response = await call_next(request)
            
            span.set_attribute("http.status_code", response.status_code)
            if response.status_code >= 400:
                span.set_status(Status(StatusCode.ERROR))
            
            return response

# ==================== Lifespan context manager ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"Starting {settings.APP_NAME}")
    logger.info(" Initializing MongoDB with OpenTelemetry tracing...")
    await database.connect()
    logger.info(" MongoDB connected with tracing enabled")
    
    yield
    
    # Shutdown
    logger.info("Shutting down")
    await database.disconnect()
    logger.info(" MongoDB disconnected")

# ==================== FastAPI Application ====================

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add Prometheus middleware
app.add_middleware(PrometheusMiddleware)

# Add OpenTelemetry metadata middleware
app.add_middleware(OTelMetadataMiddleware)

# Auto-instrument FastAPI and HTTP calls with OpenTelemetry
try:
    FastAPIInstrumentor.instrument_app(app)
    HTTPXClientInstrumentor().instrument()
    logger.info(" OpenTelemetry auto-instrumentation enabled for FastAPI and HTTPx")
except Exception as e:
    logger.warning(f" FastAPI instrumentation failed (non-critical): {str(e)}")

# Include routers
app.include_router(products.router)
app.include_router(orders.router)

# ==================== Health & Status Endpoints ====================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Service health check endpoint
    Returns healthy status with timestamp
    """
    return HealthResponse(
        status="healthy",
        message="Python FastAPI service is running",
        timestamp=datetime.utcnow()
    )

@app.get("/ping")
async def ping():
    """
    Simple ping endpoint for connectivity tests
    """
    return {"status": "pong"}

@app.get("/metrics")
async def metrics():
    """
    Prometheus metrics endpoint - exposes all metrics for scraping
    """
    return Response(content=generate_latest(REGISTRY), media_type="text/plain")

@app.get("/")
async def root():
    """
    Root endpoint with service information
    """
    return {
        "success": True,
        "message": "NITTE Merchandise Shop - Python FastAPI Service",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "docs": "/docs",
        "tracing": {
            "provider": "OpenTelemetry + Jaeger",
            "mongodb_instrumented": True,
            "jaeger_ui": "http://localhost:16686"
        }
    }

# ==================== Error Handlers ====================

@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "success": False,
            "message": f"Route not found: {request.method} {request.url.path}"
        }
    )

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    logger.error(f"Internal server error: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error"
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development"
    )
