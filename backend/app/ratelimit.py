"""Giới hạn tần suất gọi API (cửa sổ cố định, lưu trên Redis) chống cào dữ liệu."""

import logging
import time

import redis.asyncio as redis
from fastapi import HTTPException, Request

from app.config import get_settings

log = logging.getLogger(__name__)
_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(get_settings().redis_url, decode_responses=False)
    return _client


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def hit(bucket: str, key: str, limit: int, window: int = 60) -> bool:
    slot = int(time.time()) // window
    rkey = f"rl:{bucket}:{key}:{slot}"
    try:
        r = get_redis()
        pipe = r.pipeline()
        pipe.incr(rkey)
        pipe.expire(rkey, window + 5)
        count, _ = await pipe.execute()
        return int(count) <= limit
    except Exception:  # Redis hỏng thì không chặn người dùng
        log.warning("Rate limiter unavailable", exc_info=True)
        return True


def limiter(bucket: str, limit_attr: str):
    async def dependency(request: Request) -> None:
        limit = getattr(get_settings(), limit_attr)
        if not await hit(bucket, client_ip(request), limit):
            raise HTTPException(status_code=429, detail="Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.")

    return dependency


public_limit = limiter("public", "public_rate_limit_per_min")
auth_limit = limiter("auth", "auth_rate_limit_per_min")


async def cache_get(key: str) -> bytes | None:
    try:
        return await get_redis().get(key)
    except Exception:
        return None


async def cache_set(key: str, value: bytes, ttl: int = 3600) -> None:
    try:
        await get_redis().set(key, value, ex=ttl)
    except Exception:
        pass
