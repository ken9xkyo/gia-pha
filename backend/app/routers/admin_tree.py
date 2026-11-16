"""API chỉnh sửa cây cho admin (FR-20..34, FR-27)."""

import uuid

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_admin, get_config
from app.errors import AppError, conflict, not_found
from app.models import Admin, ChangeBatch, Person
from app.routers.common import tree_response
from app.schemas import (
    AddChildIn,
    AddParentsIn,
    AddSiblingIn,
    AddSpouseIn,
    DeleteIn,
    LinkPatch,
    PersonCreate,
    PersonPatch,
    ReorderIn,
    UnionPatch,
)
from app.services import persons as ops
from app.services.audit import Recorder, is_undoable, revert_batch, snapshot
from app.services.media import save_portrait
from app.services.serialize import person_full
from app.services.tree import anniversaries, today_vn

router = APIRouter(prefix="/api/admin", tags=["admin-tree"])


@router.get("/tree")
async def get_tree(request: Request, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    cfg = await get_config(db)
    return await tree_response(request, db, cfg, admin=True)


@router.get("/anniversaries")
async def get_anniversaries(
    days: int = Query(60, ge=1, le=400), admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)
):
    return {"today": today_vn().isoformat(), "items": await anniversaries(db, days, admin=True)}


@router.get("/persons/{pid}")
async def get_person(pid: int, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    p = await db.get(Person, pid)
    if p is None or p.deleted_at is not None:
        raise not_found("Không tìm thấy thành viên")
    return person_full(p)


@router.post("/persons/root")
async def create_root(body: PersonCreate, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    return await ops.create_root(db, admin, body)


@router.post("/persons/{pid}/children")
async def add_child(pid: int, body: AddChildIn, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    return await ops.add_child(db, admin, pid, body)


@router.post("/persons/{pid}/spouses")
async def add_spouse(pid: int, body: AddSpouseIn, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    return await ops.add_spouse(db, admin, pid, body)


@router.post("/persons/{pid}/siblings")
async def add_sibling(pid: int, body: AddSiblingIn, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    return await ops.add_sibling(db, admin, pid, body)


@router.post("/persons/{pid}/parents")
async def add_parents(pid: int, body: AddParentsIn, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    return await ops.add_parents(db, admin, pid, body)


@router.patch("/persons/{pid}")
async def update_person(pid: int, body: PersonPatch, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    p, batch_id = await ops.update_person(db, admin, pid, body)
    return {"batch_id": batch_id, "person": person_full(p)}


@router.get("/persons/{pid}/delete-preview")
async def delete_preview(pid: int, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    return await ops.delete_preview(db, pid)


@router.post("/persons/{pid}/delete")
async def delete_person(pid: int, body: DeleteIn, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    return await ops.delete_person(db, admin, pid, body)


@router.post("/persons/{pid}/photo")
async def upload_photo(
    pid: int,
    version: int = Query(...),
    file: UploadFile = File(...),
    admin: Admin = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    p = await db.get(Person, pid, with_for_update=True)
    if p is None or p.deleted_at is not None:
        raise not_found("Không tìm thấy thành viên")
    if p.version != version:
        raise conflict()
    key = await save_portrait(file)
    rec = Recorder(db, admin.id, "edit", f"Cập nhật ảnh {p.full_name}")
    before = snapshot(p)
    p.photo = key
    p.version += 1
    await rec.updated(p, before)
    batch = await rec.finish()
    await db.commit()
    return {"batch_id": str(batch.id), "person": person_full(p)}


@router.delete("/persons/{pid}/photo")
async def delete_photo(
    pid: int, version: int = Query(...), admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)
):
    p = await db.get(Person, pid, with_for_update=True)
    if p is None or p.deleted_at is not None:
        raise not_found("Không tìm thấy thành viên")
    if p.version != version:
        raise conflict()
    rec = Recorder(db, admin.id, "edit", f"Gỡ ảnh {p.full_name}")
    before = snapshot(p)
    p.photo = None
    p.version += 1
    await rec.updated(p, before)
    batch = await rec.finish()
    await db.commit()
    return {"batch_id": str(batch.id), "person": person_full(p)}


@router.patch("/unions/{uid}")
async def update_union(uid: int, body: UnionPatch, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    return await ops.update_union(db, admin, uid, body)


@router.delete("/unions/{uid}")
async def delete_union(uid: int, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    return await ops.delete_union(db, admin, uid)


@router.patch("/links/{lid}")
async def update_link(lid: int, body: LinkPatch, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    return await ops.update_link(db, admin, lid, body)


@router.post("/reorder-siblings")
async def reorder(body: ReorderIn, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    return await ops.reorder_siblings(db, admin, body)


@router.post("/batches/{batch_id}/undo")
async def undo(batch_id: uuid.UUID, admin: Admin = Depends(current_admin), db: AsyncSession = Depends(get_db)):
    batch = await db.get(ChangeBatch, batch_id, with_for_update=True)
    if batch is None:
        raise not_found("Không tìm thấy thao tác")
    if not is_undoable(batch):
        raise AppError(409, "not_undoable", "Thao tác này không còn hoàn tác được.")
    new = await revert_batch(db, batch, admin.id, strict=True, kind="undo", summary=f"Hoàn tác: {batch.summary}")
    await db.commit()
    return {"batch_id": str(new.id)}

