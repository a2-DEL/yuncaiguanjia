from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.accounts import router as accounts_router
from app.api.auth import router as auth_router
from app.api.vouchers import router as vouchers_router
from app.config import settings
from app.core.seed import seed_if_empty
from app.database import Base, engine, AsyncSessionLocal


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 建表（阶段 0 先直接 create_all；后续切 alembic）
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # 种子
    async with AsyncSessionLocal() as session:
        await seed_if_empty(session)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["健康检查"])
async def health():
    return {"status": "ok", "app": settings.APP_NAME}


app.include_router(auth_router, prefix=settings.API_PREFIX)
app.include_router(accounts_router, prefix=settings.API_PREFIX)
app.include_router(vouchers_router, prefix=settings.API_PREFIX)
