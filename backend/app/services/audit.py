"""Nhật ký thay đổi dạng ảnh chụp trước/sau — nền tảng cho Hoàn tác (FR-27),
Thùng rác (FR-33) và nhật ký (FR-47)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import DateTime, select, update
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import AuditLog, ChangeBatch, Marriage, ParentLink, Person, SiteConfig, utcnow

MODELS: dict[str, type] = {"person": Person, "union": Marriage, "link": ParentLink, "config": SiteConfig}
TYPE_OF: dict[type, str] = {v: k for k, v in MODELS.items()}
SKIP_FIELDS = {"created_at", "updated_at", "tree_version"}
UNDO_WINDOW = timedelta(minutes=30)


def _json(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def snapshot(obj: Any) -> dict[str, Any]:
    return {
        col.key: _json(getattr(obj, col.key))
        for col in obj.__table__.columns
        if col.key not in SKIP_FIELDS
    }


def _parse(model: type, key: str, value: Any) -> Any:
    if value is None:
        return None
    col = model.__table__.columns[key]
    if isinstance(col.type, DateTime):
        return datetime.fromisoformat(value)
    if isinstance(col.type, PGUUID):
        return uuid.UUID(value)
    return value


def entity_label(obj: Any) -> str:
    if isinstance(obj, Person):
        return obj.full_name
    if isinstance(obj, Marriage):
        return f"Hôn nhân #{obj.id}"
    if isinstance(obj, ParentLink):
        return f"Quan hệ cha mẹ – con #{obj.id}"
    return "Cấu hình dòng họ"


class Recorder:
    """Gom các thay đổi của một thao tác thành một ChangeBatch."""

    def __init__(self, db: AsyncSession, admin_id: int | None, kind: str, summary: str) -> None:
        self.db = db
        self.admin_id = admin_id
        self.batch = ChangeBatch(id=uuid.uuid4(), admin_id=admin_id, kind=kind, summary=summary)
        self.count = 0
        self._started = False

    async def _start(self) -> None:
        if not self._started:
            self.db.add(self.batch)
            await self.db.flush()
            self._started = True

    async def created(self, obj: Any) -> None:
        await self._start()
        self.db.add(obj)
        await self.db.flush()
        self._log("create", obj, None, snapshot(obj))

    async def updated(self, obj: Any, before: dict[str, Any], action: str = "update") -> None:
        await self._start()
        await self.db.flush()
        after = snapshot(obj)
        if after != before:
            self._log(action, obj, before, after)

    async def hard_deleted(self, obj: Any) -> None:
        await self._start()
        before = snapshot(obj)
        self._log("hard_delete", obj, before, None)
        await self.db.delete(obj)
        await self.db.flush()

    def _log(self, action: str, obj: Any, before: dict | None, after: dict | None) -> None:
        self.count += 1
        self.db.add(
            AuditLog(
                batch_id=self.batch.id,
                admin_id=self.admin_id,
                action=action,
                entity_type=TYPE_OF[type(obj)],
                entity_id=obj.id,
                label=entity_label(obj)[:300],
                before=before,
                after=after,
            )
        )

    async def finish(self, bump_tree: bool = True) -> ChangeBatch:
        await self._start()
        self.batch.affected = self.count
        if bump_tree:
            await self.db.execute(
                update(SiteConfig).where(SiteConfig.id == 1).values(tree_version=SiteConfig.tree_version + 1)
            )
        await self.db.flush()
        return self.batch


async def revert_batch(
    db: AsyncSession, batch: ChangeBatch, admin_id: int | None, *, strict: bool, kind: str, summary: str
) -> ChangeBatch:
    """Đảo ngược một batch.

    strict=True (Hoàn tác): mọi bản ghi phải chưa bị đổi kể từ thao tác.
    strict=False (Khôi phục từ Thùng rác): chỉ hoàn lại những trường vẫn giữ giá trị lúc xóa.
    """
    if batch.undone_at is not None:
        raise AppError(409, "already_undone", "Thao tác này đã được hoàn tác/khôi phục trước đó.")
    if batch.purged_at is not None:
        raise AppError(409, "purged", "Dữ liệu đã bị xóa vĩnh viễn, không thể khôi phục.")

    entries = (
        await db.execute(select(AuditLog).where(AuditLog.batch_id == batch.id).order_by(AuditLog.id.desc()))
    ).scalars().all()
    rec = Recorder(db, admin_id, kind, summary)

    try:
        for e in entries:
            model = MODELS[e.entity_type]
            obj = await db.get(model, e.entity_id, with_for_update=True)
            if e.before is None:  # bản ghi được tạo ra → xóa hẳn
                if obj is None:
                    continue
                if strict and obj.version != e.after.get("version"):
                    raise AppError(409, "undo_conflict", f"'{e.label}' đã bị sửa sau thao tác này, không thể hoàn tác.")
                await rec.hard_deleted(obj)
                continue
            if obj is None:
                raise AppError(409, "undo_conflict", f"'{e.label}' không còn tồn tại.")
            if strict and "version" in (e.after or {}) and obj.version != e.after.get("version"):
                raise AppError(409, "undo_conflict", f"'{e.label}' đã bị sửa sau thao tác này, không thể hoàn tác.")
            current = snapshot(obj)
            after = e.after or {}
            changed = [k for k, v in e.before.items() if k != "version" and after.get(k) != v]
            for key in changed:
                if not strict and current.get(key) != after.get(key):
                    continue  # đã bị sửa tiếp sau đó: giữ giá trị mới
                setattr(obj, key, _parse(model, key, e.before[key]))
            if hasattr(obj, "version"):
                obj.version = (obj.version or 0) + 1
            await rec.updated(obj, current)
        batch.undone_at = utcnow()
        await _check_integrity(db)
        return await rec.finish()
    except IntegrityError as exc:
        raise AppError(
            409, "undo_conflict", "Không thể hoàn tác vì đã có thay đổi khác phụ thuộc vào thao tác này."
        ) from exc


async def _check_integrity(db: AsyncSession) -> None:
    await db.flush()
    bad_link = (
        await db.execute(
            select(ParentLink.id)
            .join(Marriage, Marriage.id == ParentLink.union_id)
            .join(Person, Person.id == ParentLink.child_id)
            .where(
                ParentLink.deleted_at.is_(None),
                (Marriage.deleted_at.is_not(None)) | (Person.deleted_at.is_not(None)),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if bad_link is not None:
        raise AppError(
            409, "restore_parent_missing", "Cha mẹ của nhánh này đã bị xóa. Hãy khôi phục nhánh cha mẹ trước."
        )
    for col in (Marriage.husband_id, Marriage.wife_id):
        bad_union = (
            await db.execute(
                select(Marriage.id)
                .join(Person, Person.id == col)
                .where(Marriage.deleted_at.is_(None), Person.deleted_at.is_not(None))
                .limit(1)
            )
        ).scalar_one_or_none()
        if bad_union is not None:
            raise AppError(
                409, "restore_parent_missing", "Một người trong cuộc hôn nhân này đã bị xóa. Hãy khôi phục người đó trước."
            )


def changed_fields(before: dict | None, after: dict | None) -> dict[str, list[Any]]:
    before = before or {}
    after = after or {}
    keys = (set(before) | set(after)) - {"version", "id"}
    return {k: [before.get(k), after.get(k)] for k in sorted(keys) if before.get(k) != after.get(k)}


def is_undoable(batch: ChangeBatch) -> bool:
    return (
        batch.undone_at is None
        and batch.kind in ("edit", "delete")
        and batch.created_at >= datetime.now(timezone.utc) - UNDO_WINDOW
    )
