"""Thùng rác: giữ 30 ngày, khôi phục nguyên nhánh, xóa vĩnh viễn (FR-33)."""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AuditLog, ChangeBatch, Marriage, ParentLink, Person, utcnow
from app.services.media import remove_portrait

log = logging.getLogger(__name__)


def trash_cutoff():
    return utcnow() - timedelta(days=get_settings().trash_retention_days)


async def purge_batch(db: AsyncSession, batch: ChangeBatch) -> int:
    photos = (
        await db.execute(
            select(Person.photo).where(Person.deleted_batch == batch.id, Person.deleted_at.is_not(None))
        )
    ).scalars().all()
    person_ids = (
        await db.execute(select(Person.id).where(Person.deleted_batch == batch.id, Person.deleted_at.is_not(None)))
    ).scalars().all()
    await db.execute(delete(ParentLink).where(ParentLink.deleted_batch == batch.id, ParentLink.deleted_at.is_not(None)))
    await db.execute(delete(Marriage).where(Marriage.deleted_batch == batch.id, Marriage.deleted_at.is_not(None)))
    await db.execute(delete(Person).where(Person.deleted_batch == batch.id, Person.deleted_at.is_not(None)))
    if person_ids:
        # Quyền được xóa dữ liệu (Luật BVDLCN): xóa cả ảnh chụp trong nhật ký
        await db.execute(
            update(AuditLog)
            .where(AuditLog.entity_type == "person", AuditLog.entity_id.in_(person_ids))
            .values(before=None, after=None, label="(đã xóa vĩnh viễn)")
        )
    batch.purged_at = utcnow()
    await db.flush()
    for key in photos:
        remove_portrait(key)
    return len(person_ids)


async def purge_expired(db: AsyncSession) -> int:
    batches = (
        await db.execute(
            select(ChangeBatch)
            .where(
                ChangeBatch.kind == "delete",
                ChangeBatch.undone_at.is_(None),
                ChangeBatch.purged_at.is_(None),
                ChangeBatch.created_at < trash_cutoff(),
            )
            .order_by(ChangeBatch.created_at)
        )
    ).scalars().all()
    total = 0
    for batch in batches:
        try:
            async with db.begin_nested():
                total += await purge_batch(db, batch)
        except IntegrityError:
            log.warning("Không thể xóa vĩnh viễn batch %s do còn tham chiếu", batch.id)
    await db.commit()
    return total
