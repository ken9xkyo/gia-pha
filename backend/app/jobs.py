"""Tác vụ nền: xóa vĩnh viễn mục quá 30 ngày trong Thùng rác, dọn phiên hết hạn."""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import delete

from app.config import get_settings
from app.db import SessionLocal
from app.models import AdminSession
from app.services.trash import purge_expired

logging.basicConfig(level=get_settings().log_level.upper(), format="%(asctime)s %(levelname)s jobs: %(message)s")
log = logging.getLogger("jobs")
INTERVAL = 3600


async def run_once() -> None:
    async with SessionLocal() as db:
        purged = await purge_expired(db)
        if purged:
            log.info("Đã xóa vĩnh viễn %s thành viên khỏi thùng rác", purged)
        await db.execute(delete(AdminSession).where(AdminSession.expires_at < datetime.now(timezone.utc)))
        await db.commit()


async def main() -> None:
    log.info("Worker khởi động")
    while True:
        try:
            await run_once()
        except Exception:
            log.exception("Tác vụ nền lỗi")
        await asyncio.sleep(INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
