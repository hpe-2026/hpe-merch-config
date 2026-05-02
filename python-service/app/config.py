from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # Application
    APP_NAME: str = "NITTE Merchandise Shop - Python Service"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # Database
    MONGODB_URL: str = "mongodb://admin:password@mongodb:27017/nitte_merch_shop"
    DATABASE_NAME: str = "nitte_merch_shop"

    # Logging
    LOG_LEVEL: str = "info"

    # API Gateway
    API_GATEWAY_URL: Optional[str] = "http://node-backend:3000"

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
