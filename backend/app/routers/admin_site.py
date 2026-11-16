"""Quản trị: cấu hình, phả ký, xưng hô, thùng rác, nhật ký, tài khoản, sao lưu, thống kê, xuất dữ liệu."""

import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_db
from app.deps import current_admin, get_config
from app.errors import AppError, bad_request, conflict, not_found
from app.models import Admin, AdminSession, AuditLog, ChangeBatch, SiteConfig, VisitStat
from app.routers.auth import admin_info
from app.schemas import AdminCreate, AdminPatch, KinshipIn, PasswordChange, PhaKyIn, SettingsPatch
from app.security import hash_password, new_public_token, validate_password_strength, verify_password
from app.services.audit import Recorder, changed_fields, revert_batch, snapshot
from app.services.export import export_xlsx
from app.services.graph import load_graph
from app.services.media import save_content_image
from app.services.trash import purge_batch, trash_cutoff
from app.services.tree import today_vn
from app.sanitize import clean_html

router = APIRouter(prefix="/api/admin", tags=["admin-site"])


def settings_out(cfg: SiteConfig) -> dict:
    return {
        "version": cfg.version,
        "clan_name": cfg.clan_name,
        "tagline": cfg.tagline,
        "contact_name": cfg.contact_name,
        "contact_phone": cfg.contact_phone,
        "contact_zalo": cfg.contact_zalo,
        "public_token": cfg.public_token,
        "root_person_id": cfg.root_person_id,
        "kinship_overrides": cfg.kinship_overrides or {},
        "has_pha_ky": bool(cfg.pha_ky_html),
    }


async def _locked_config(db: AsyncSession, version: int | None = None) -> SiteConfig:
    cfg = await db.get(SiteConfig, 1, with_for_update=True)
    assert cfg is not None
    if version is not None and cfg.version != version:
        raise conflict("Cấu hình đã bị admin khác thay đổi. Vui lòng tải lại.")
    return cfg


# ---- cấu hình -------------------------------------------------------------
@router.get("/settings")
async def get_settings_(admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    return settings_out(await get_config(db))


@router.patch("/settings")
async def patch_settings(body: SettingsPatch, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    cfg = await _locked_config(db, body.version)
    rec = Recorder(db, admin.id, "edit", "Sửa cấu hình dòng họ")
    before = snapshot(cfg)
    for key, value in body.model_dump(exclude_unset=True, exclude={"version"}).items():
        if isinstance(value, str):
            value = value.strip() or None
        if key == "clan_name" and not value:
            continue
        setattr(cfg, key, value)
    cfg.version += 1
    await rec.updated(cfg, before)
    await rec.finish()
    await db.commit()
    return settings_out(cfg)


@router.post("/settings/rotate-token")
async def rotate_token(admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    """Đổi chuỗi ngẫu nhiên của link công khai khi bị lộ."""
    cfg = await _locked_config(db)
    rec = Recorder(db, admin.id, "edit", "Đổi đường link công khai")
    before = snapshot(cfg)
    cfg.public_token = new_public_token()
    cfg.version += 1
    await rec.updated(cfg, before)
    await rec.finish(bump_tree=False)
    await db.commit()
    return settings_out(cfg)


@router.get("/pha-ky")
async def get_pha_ky(admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    cfg = await get_config(db)
    return {"html": cfg.pha_ky_html or "", "version": cfg.version, "clan_name": cfg.clan_name}


@router.put("/pha-ky")
async def put_pha_ky(body: PhaKyIn, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    cfg = await _locked_config(db, body.version)
    rec = Recorder(db, admin.id, "edit", "Sửa Phả ký")
    before = snapshot(cfg)
    cfg.pha_ky_html = clean_html(body.html)
    cfg.version += 1
    await rec.updated(cfg, before)
    await rec.finish(bump_tree=False)
    await db.commit()
    return {"html": cfg.pha_ky_html or "", "version": cfg.version}


@router.put("/kinship-rules")
async def put_kinship(body: KinshipIn, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    """Lưu các nhãn xưng hô admin sửa đè lên bộ mặc định (FR-57)."""
    cleaned: dict[str, dict[str, str]] = {}
    for key, entry in body.overrides.items():
        if not re.fullmatch(r"[a-z0-9_]{1,60}", key):
            raise bad_request(f"Khóa quy tắc không hợp lệ: {key}")
        values = {
            k: v.strip()[:60]
            for k, v in entry.items()
            if k in {"m", "f", "sm", "sf", "pm", "pf"} and isinstance(v, str) and v.strip()
        }
        if values:
            cleaned[key] = values
    cfg = await _locked_config(db, body.version)
    rec = Recorder(db, admin.id, "edit", "Sửa bảng quy tắc xưng hô")
    before = snapshot(cfg)
    cfg.kinship_overrides = cleaned
    cfg.version += 1
    await rec.updated(cfg, before)
    await rec.finish()
    await db.commit()
    return settings_out(cfg)


@router.post("/uploads")
async def upload_image(file: UploadFile = File(...), admin: Admin = Depends(current_admin)):
    return {"url": await save_content_image(file)}


# ---- xuất dữ liệu --------------------------------------------------------
@router.get("/export/persons.xlsx")
async def export_persons(admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    cfg = await get_config(db)
    data = await export_xlsx(db, cfg.clan_name)
    filename = f"gia-pha-{today_vn().isoformat()}.xlsx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---- thùng rác -----------------------------------------------------------
@router.get("/trash")
async def list_trash(admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    retention = timedelta(days=get_settings().trash_retention_days)
    batches = (
        await db.execute(
            select(ChangeBatch, Admin.full_name)
            .outerjoin(Admin, Admin.id == ChangeBatch.admin_id)
            .where(
                ChangeBatch.kind == "delete",
                ChangeBatch.undone_at.is_(None),
                ChangeBatch.purged_at.is_(None),
                ChangeBatch.created_at >= trash_cutoff(),
            )
            .order_by(ChangeBatch.created_at.desc())
        )
    ).all()
    out = []
    for batch, admin_name in batches:
        names = (
            await db.execute(
                select(AuditLog.label).where(
                    AuditLog.batch_id == batch.id, AuditLog.entity_type == "person", AuditLog.action == "delete"
                ).limit(50)
            )
        ).scalars().all()
        out.append(
            {
                "id": str(batch.id),
                "summary": batch.summary,
                "created_at": batch.created_at.isoformat(),
                "expires_at": (batch.created_at + retention).isoformat(),
                "admin_name": admin_name,
                "names": names,
            }
        )
    return out


@router.post("/trash/{batch_id}/restore")
async def restore(batch_id: uuid.UUID, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    batch = await db.get(ChangeBatch, batch_id, with_for_update=True)
    if batch is None or batch.kind != "delete":
        raise not_found("Không tìm thấy mục trong thùng rác")
    new = await revert_batch(db, batch, admin.id, strict=False, kind="restore", summary=f"Khôi phục: {batch.summary}")
    await db.commit()
    return {"batch_id": str(new.id)}


@router.delete("/trash/{batch_id}")
async def purge(batch_id: uuid.UUID, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    batch = await db.get(ChangeBatch, batch_id, with_for_update=True)
    if batch is None or batch.kind != "delete" or batch.undone_at or batch.purged_at:
        raise not_found("Không tìm thấy mục trong thùng rác")
    count = await purge_batch(db, batch)
    await db.commit()
    return {"purged": count}


# ---- nhật ký thay đổi (FR-47) --------------------------------------------
@router.get("/audit")
async def audit(
    page: int = Query(1, ge=1),
    entity_type: str | None = None,
    entity_id: int | None = None,
    admin: Admin = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    size = 50
    q = (
        select(AuditLog, ChangeBatch, Admin.full_name)
        .join(ChangeBatch, ChangeBatch.id == AuditLog.batch_id)
        .outerjoin(Admin, Admin.id == AuditLog.admin_id)
    )
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        q = q.where(AuditLog.entity_id == entity_id)
    rows = (await db.execute(q.order_by(AuditLog.id.desc()).offset((page - 1) * size).limit(size + 1))).all()
    items = [
        {
            "id": e.id,
            "created_at": e.created_at.isoformat(),
            "admin_name": name,
            "action": e.action,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "label": e.label,
            "batch_id": str(b.id),
            "batch_summary": b.summary,
            "batch_kind": b.kind,
            "undone": b.undone_at is not None,
            "changes": changed_fields(e.before, e.after),
        }
        for e, b, name in rows[:size]
    ]
    return {"items": items, "has_more": len(rows) > size, "page": page}


# ---- tài khoản admin -----------------------------------------------------
def _admin_row(a: Admin) -> dict:
    return {
        **admin_info(a),
        "is_active": a.is_active,
        "last_login_at": a.last_login_at.isoformat() if a.last_login_at else None,
        "locked": bool(a.locked_until and a.locked_until > datetime.now(timezone.utc)),
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


@router.get("/users")
async def list_users(admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    return [_admin_row(a) for a in (await db.execute(select(Admin).order_by(Admin.id))).scalars()]


@router.post("/users")
async def create_user(body: AdminCreate, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    if err := validate_password_strength(body.password):
        raise bad_request(err)
    email = body.email.lower()
    if (await db.execute(select(Admin.id).where(func.lower(Admin.email) == email))).scalar_one_or_none():
        raise bad_request("Email đã được sử dụng")
    a = Admin(email=email, full_name=body.full_name.strip(), password_hash=hash_password(body.password))
    db.add(a)
    await db.commit()
    return _admin_row(a)


@router.patch("/users/{uid}")
async def patch_user(uid: int, body: AdminPatch, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    a = await db.get(Admin, uid)
    if a is None:
        raise not_found()
    if body.is_active is False:
        if a.id == admin.id:
            raise bad_request("Không thể tự khóa tài khoản của mình")
        a.is_active = False
        await db.execute(delete(AdminSession).where(AdminSession.admin_id == a.id))
    elif body.is_active:
        a.is_active = True
        a.locked_until = None
        a.failed_attempts = 0
    if body.full_name:
        a.full_name = body.full_name.strip()
    await db.commit()
    return _admin_row(a)


@router.post("/users/{uid}/reset-2fa")
async def reset_2fa(uid: int, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    a = await db.get(Admin, uid)
    if a is None:
        raise not_found()
    a.totp_enabled = False
    a.totp_secret_enc = None
    a.totp_last_counter = 0
    await db.execute(delete(AdminSession).where(AdminSession.admin_id == a.id))
    await db.commit()
    return _admin_row(a)


@router.post("/me/password")
async def change_password(body: PasswordChange, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    if not verify_password(admin.password_hash, body.current_password):
        raise AppError(400, "invalid_password", "Mật khẩu hiện tại không đúng")
    if err := validate_password_strength(body.new_password):
        raise bad_request(err)
    admin.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"ok": True}


# ---- sao lưu -------------------------------------------------------------
_BACKUP_RE = re.compile(r"^giapha-\d{8}-\d{4,6}\.(dump|tar\.gz)$")


@router.get("/backups")
async def list_backups(admin: Admin = Depends(current_admin)):
    root = Path(get_settings().backup_dir)
    if not root.is_dir():
        return []
    files = sorted((f for f in root.iterdir() if _BACKUP_RE.match(f.name)), key=lambda f: f.name, reverse=True)
    return [
        {
            "name": f.name,
            "size": f.stat().st_size,
            "created_at": datetime.fromtimestamp(f.stat().st_mtime, timezone.utc).isoformat(),
        }
        for f in files
    ]


@router.get("/backups/{name}")
async def download_backup(name: str, admin: Admin = Depends(current_admin)):
    if not _BACKUP_RE.match(name):
        raise not_found()
    path = Path(get_settings().backup_dir) / name
    if not path.is_file():
        raise not_found()
    return FileResponse(path, filename=name, media_type="application/octet-stream")


# ---- thống kê (PRD mục 10) -----------------------------------------------
@router.get("/stats")
async def stats(admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    g = await load_graph(db)
    lineage = g.lineage()
    with_siblings = 0
    with_order = 0
    for pid in g.persons:
        union_id = g.primary_union(pid)
        if union_id is None:
            continue
        siblings = [c for c in g.children_of_union.get(union_id, []) if c != pid]
        if siblings:
            with_siblings += 1
            if g.persons[pid].birth_order:
                with_order += 1
    since = today_vn() - timedelta(days=30)
    visits = (
        await db.execute(
            select(func.coalesce(func.sum(VisitStat.visits), 0), func.coalesce(func.sum(VisitStat.visits_with_me), 0))
            .where(VisitStat.day >= since)
        )
    ).one()
    gens = g.generations()
    return {
        "persons": len(g.persons),
        "lineage": len(lineage),
        "inlaws": len(g.persons) - len(lineage),
        "generations": max(gens.values()) if gens else 0,
        "disconnected": len([p for p in g.persons if p not in gens]),
        "with_siblings": with_siblings,
        "with_order": with_order,
        "visits_30d": int(visits[0]),
        "visits_with_me_30d": int(visits[1]),
    }
