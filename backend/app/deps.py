import hmac
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Admin, AdminSession, SiteConfig
from app.security import hash_token

SESSION_COOKIE = "gp_session"
CSRF_HEADER = "x-requested-with"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


async def get_config(db: AsyncSession) -> SiteConfig:
    cfg = await db.get(SiteConfig, 1)
    if cfg is None:
        raise HTTPException(503, "Hệ thống chưa được khởi tạo")
    return cfg


async def current_admin(request: Request, db: AsyncSession = Depends(get_db)) -> Admin:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(401, "Cần đăng nhập")
    # Chống CSRF: yêu cầu ghi phải kèm header tùy biến (trình duyệt không cho site khác gửi kèm)
    if request.method not in SAFE_METHODS and request.headers.get(CSRF_HEADER) != "giapha":
        raise HTTPException(403, "Thiếu header bảo vệ CSRF")
    row = (
        await db.execute(
            select(Admin)
            .join(AdminSession, AdminSession.admin_id == Admin.id)
            .where(
                AdminSession.token_hash == hash_token(token),
                AdminSession.expires_at > datetime.now(timezone.utc),
                Admin.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(401, "Phiên đăng nhập đã hết hạn")
    return row


async def public_config(token: str, db: AsyncSession = Depends(get_db)) -> SiteConfig:
    cfg = await get_config(db)
    if not hmac.compare_digest(cfg.public_token.encode(), token.encode()):
        raise HTTPException(404, "Đường dẫn không hợp lệ hoặc đã được đổi")
    return cfg
