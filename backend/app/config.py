from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "云财管家 API"
    ENV: str = "dev"
    API_PREFIX: str = "/api"
    CORS_ORIGINS: str = "http://localhost:5173"

    DATABASE_URL: str = "postgresql+asyncpg://finance:finance_dev_pwd@db:5432/finance_system"
    REDIS_URL: str = "redis://redis:6379/0"

    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "finance-attachments"
    MINIO_SECURE: bool = False

    JWT_SECRET: str = "change-me-in-production-please-32-chars-min"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720

    FIRST_ADMIN_USERNAME: str = "admin"
    FIRST_ADMIN_PASSWORD: str = "admin123456"
    FIRST_ADMIN_NAME: str = "张明"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
