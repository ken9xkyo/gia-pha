"""Thao tác chỉnh sửa trên cây (PRD mục 6.2, 6.3)."""

from __future__ import annotations

import unicodedata
from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError, bad_request, conflict, not_found
from app.lunar import lunar_to_solar, solar_to_lunar
from app.models import Admin, Marriage, ParentLink, Person, SiteConfig, utcnow
from app.sanitize import clean_html
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
from app.services.audit import Recorder, snapshot
from app.services.graph import Graph, plan_delete, load_graph

NOT_NULL = {
    "full_name", "gender", "birth_calendar", "living_status", "birth_lunar_leap", "birth_approx",
    "death_approx", "death_lunar_leap", "show_full_birth", "show_residence", "show_phone", "hide_ten_huy",
}
SOLAR_DEATH = {"death_year", "death_month", "death_day"}
LUNAR_DEATH = {"death_lunar_year", "death_lunar_month", "death_lunar_day", "death_lunar_leap"}
MIN_PARENT_AGE = 13


def normalize_name(s: str) -> str:
    s = unicodedata.normalize("NFD", s.replace("đ", "d").replace("Đ", "D"))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.lower().split())


# ---- áp dụng trường ------------------------------------------------------
def apply_fields(p: Person, data: dict[str, Any]) -> None:
    for key, value in data.items():
        if value is None and key in NOT_NULL:
            continue
        setattr(p, key, value)
    if "biography" in data:
        p.biography = clean_html(data["biography"])

    if p.birth_calendar == "solar" and p.birth_year and p.birth_month and p.birth_day:
        try:
            date(p.birth_year, p.birth_month, p.birth_day)
        except ValueError as exc:
            raise bad_request("Ngày sinh không hợp lệ") from exc

    solar_given = bool(SOLAR_DEATH & data.keys())
    lunar_given = bool(LUNAR_DEATH & data.keys())
    if solar_given and not lunar_given:
        if p.death_year and p.death_month and p.death_day:
            try:
                ld = solar_to_lunar(date(p.death_year, p.death_month, p.death_day))
            except ValueError as exc:
                raise bad_request("Ngày mất không hợp lệ") from exc
            p.death_lunar_year, p.death_lunar_month, p.death_lunar_day, p.death_lunar_leap = (
                ld.year, ld.month, ld.day, ld.leap,
            )
    elif lunar_given and not solar_given:
        if p.death_lunar_year and p.death_lunar_month and p.death_lunar_day:
            sd = lunar_to_solar(p.death_lunar_day, p.death_lunar_month, p.death_lunar_year, bool(p.death_lunar_leap))
            if sd is None:
                raise bad_request("Ngày mất âm lịch không tồn tại (kiểm tra tháng nhuận / ngày 30)")
            p.death_year, p.death_month, p.death_day = sd.year, sd.month, sd.day
    elif solar_given and lunar_given and p.death_year and p.death_month and p.death_day:
        try:
            date(p.death_year, p.death_month, p.death_day)
        except ValueError as exc:
            raise bad_request("Ngày mất không hợp lệ") from exc

    has_death = any((p.death_year, p.death_lunar_year, p.death_lunar_day))
    if has_death and p.living_status == "unknown":
        p.living_status = "deceased"


def _person_data(body: PersonCreate) -> dict[str, Any]:
    return body.model_dump(exclude_none=True)


async def _new_person(rec: Recorder, body: PersonCreate) -> Person:
    p = Person(full_name=body.full_name, gender=body.gender)
    apply_fields(p, _person_data(body))
    await rec.created(p)
    return p


async def _active(db: AsyncSession, model: type, oid: int, what: str = "Không tìm thấy dữ liệu"):
    obj = await db.get(model, oid, with_for_update=True)
    if obj is None or obj.deleted_at is not None:
        raise not_found(what)
    return obj


async def _config(db: AsyncSession) -> SiteConfig:
    cfg = await db.get(SiteConfig, 1, with_for_update=True)
    assert cfg is not None
    return cfg


# ---- kiểm tra hợp lệ (FR-26) ---------------------------------------------
def birth_warnings(g: Graph, child_name: str, child_birth: int | None, parent_ids: list[int]) -> list[str]:
    if not child_birth:
        return []
    out = []
    for pid in parent_ids:
        parent = g.persons.get(pid)
        if parent is None or not parent.birth_year:
            continue
        gap = child_birth - parent.birth_year
        if gap < 0:
            out.append(f"{child_name} (sinh {child_birth}) sinh trước cha/mẹ {parent.name} (sinh {parent.birth_year}).")
        elif gap < MIN_PARENT_AGE:
            out.append(f"{parent.name} mới {gap} tuổi khi sinh {child_name}.")
    return out


def _raise_warnings(warnings: list[str], confirmed: bool) -> None:
    if warnings and not confirmed:
        raise AppError(409, "warnings", "Dữ liệu có điểm bất thường, vui lòng xác nhận.", warnings=warnings)


def _next_order(g: Graph, union_id: int) -> int:
    siblings: set[int] = set()
    for partner in g.unions[union_id].partners():
        siblings.update(g.children(partner))
    siblings.update(g.children_of_union.get(union_id, []))
    orders = [g.persons[s].birth_order or 0 for s in siblings if s in g.persons]
    return max(orders + [len(orders)]) + 1


def _result(batch, **extra: Any) -> dict[str, Any]:
    return {"batch_id": str(batch.id), **extra}


# ---- tạo thủy tổ ---------------------------------------------------------
async def create_root(db: AsyncSession, admin: Admin, body: PersonCreate) -> dict[str, Any]:
    cfg = await _config(db)
    if cfg.root_person_id is not None:
        raise bad_request("Cây đã có thủy tổ. Dùng chức năng 'Thêm cha/mẹ' trên nút thủy tổ để lùi gốc.")
    rec = Recorder(db, admin.id, "edit", f"Tạo thủy tổ {body.full_name}")
    p = await _new_person(rec, body)
    before = snapshot(cfg)
    cfg.root_person_id = p.id
    cfg.version += 1
    await rec.updated(cfg, before)
    batch = await rec.finish()
    await db.commit()
    return _result(batch, person_id=p.id)


# ---- thêm con / anh chị em -----------------------------------------------
async def _add_child_to_union(
    db: AsyncSession, admin: Admin, g: Graph, union_id: int | None, parent_id: int,
    body: PersonCreate, link_kind: str, confirmed: bool, summary: str,
) -> dict[str, Any]:
    rec = Recorder(db, admin.id, "edit", summary)
    parent = g.persons[parent_id]
    partners = g.unions[union_id].partners() if union_id else [parent_id]
    _raise_warnings(birth_warnings(g, body.full_name, body.birth_year, partners), confirmed)

    if union_id is None:  # chưa có vợ/chồng → tạo hôn nhân với người "không rõ tên"
        union = Marriage(
            husband_id=parent_id if parent.gender == "M" else None,
            wife_id=parent_id if parent.gender == "F" else None,
            kind="chinh_that" if parent.gender == "M" else "chong",
            order_index=1,
        )
        await rec.created(union)
        union_id = union.id
        order = 1 + max([g.persons[c].birth_order or 0 for c in g.children(parent_id)] + [0])
    else:
        order = _next_order(g, union_id)

    if body.birth_order is None:
        body = body.model_copy(update={"birth_order": order})
    child = await _new_person(rec, body)
    await rec.created(ParentLink(child_id=child.id, union_id=union_id, kind=link_kind))
    batch = await rec.finish()
    await db.commit()
    return _result(batch, person_id=child.id, union_id=union_id)


async def add_child(db: AsyncSession, admin: Admin, parent_id: int, body: AddChildIn) -> dict[str, Any]:
    g = await load_graph(db)
    if parent_id not in g.persons:
        raise not_found("Không tìm thấy cha/mẹ")
    unions = g.unions_of.get(parent_id, [])
    union_id = body.union_id
    if union_id is not None:
        if union_id not in unions:
            raise bad_request("Cuộc hôn nhân không thuộc về người này")
    elif len(unions) == 1:
        union_id = unions[0]
    elif len(unions) > 1:
        raise AppError(400, "union_required", "Người này có nhiều vợ/chồng — hãy chọn con của cuộc hôn nhân nào.")
    return await _add_child_to_union(
        db, admin, g, union_id, parent_id, body.person, body.link_kind, body.confirm_warnings,
        f"Thêm con {body.person.full_name} cho {g.persons[parent_id].name}",
    )


async def add_sibling(db: AsyncSession, admin: Admin, pid: int, body: AddSiblingIn) -> dict[str, Any]:
    g = await load_graph(db)
    if pid not in g.persons:
        raise not_found()
    union_id = g.primary_union(pid)
    if union_id is None:
        raise bad_request("Người này chưa có cha mẹ trên cây. Hãy thêm cha/mẹ trước.")
    parent_id = g.unions[union_id].partners()[0]
    return await _add_child_to_union(
        db, admin, g, union_id, parent_id, body.person, "biological", body.confirm_warnings,
        f"Thêm anh/chị/em {body.person.full_name} của {g.persons[pid].name}",
    )


# ---- vợ/chồng ------------------------------------------------------------
async def add_spouse(db: AsyncSession, admin: Admin, pid: int, body: AddSpouseIn) -> dict[str, Any]:
    g = await load_graph(db)
    if pid not in g.persons:
        raise not_found()
    me = g.persons[pid]
    rec = Recorder(db, admin.id, "edit", "")

    if body.existing_person_id is not None:
        sid = body.existing_person_id
        if sid == pid or sid not in g.persons:
            raise bad_request("Người được chọn không hợp lệ")
        if g.persons[sid].gender == me.gender:
            raise bad_request("Vợ/chồng phải khác giới tính")
        if sid in g.ancestors(pid) or sid in g.descendants(pid):
            raise bad_request("Không thể kết hôn với tổ tiên hoặc hậu duệ trực hệ (sẽ tạo vòng lặp).")
        if sid in g.spouses(pid):
            raise bad_request("Hai người đã là vợ chồng trên cây")
        spouse_name = g.persons[sid].name
    else:
        assert body.person is not None
        if body.person.gender == me.gender:
            raise bad_request("Vợ/chồng phải khác giới tính")
        spouse_name = body.person.full_name
        sid = None

    rec.batch.summary = f"Thêm {'vợ' if me.gender == 'M' else 'chồng'} {spouse_name} cho {me.name}"
    if sid is None:
        sid = (await _new_person(rec, body.person)).id  # type: ignore[arg-type]

    # Nếu đang có cuộc hôn nhân "không rõ tên" thì điền vào đó để giữ liên kết con
    placeholder = next((uid for uid in g.unions_of.get(pid, []) if g.unions[uid].other(pid) is None), None)
    if placeholder is not None:
        union = await _active(db, Marriage, placeholder)
        before = snapshot(union)
        if me.gender == "M":
            union.wife_id = sid
        else:
            union.husband_id = sid
        if body.kind:
            union.kind = body.kind
        union.status = body.status
        union.version += 1
        await rec.updated(union, before)
    else:
        existing = len(g.unions_of.get(pid, []))
        default_kind = ("chinh_that" if existing == 0 else "ke_that") if me.gender == "M" else "chong"
        union = Marriage(
            husband_id=pid if me.gender == "M" else sid,
            wife_id=sid if me.gender == "M" else pid,
            kind=body.kind or default_kind,
            order_index=body.order_index or existing + 1,
            status=body.status,
        )
        await rec.created(union)
    batch = await rec.finish()
    await db.commit()
    return _result(batch, person_id=sid, union_id=union.id)


# ---- thêm cha/mẹ (thủy tổ: lùi gốc; dâu/rể và nhà thông gia: mở rộng mạng lưới) ----
def _check_existing_parent(g: Graph, pid: int, xid: int, gender: str) -> None:
    role = "cha" if gender == "M" else "mẹ"
    if xid not in g.persons:
        raise bad_request(f"Không tìm thấy người được chọn làm {role}")
    if xid == pid:
        raise bad_request("Không thể chọn chính người này làm cha/mẹ")
    if g.persons[xid].gender != gender:
        raise bad_request(f"Người được chọn làm {role} phải là {'nam' if gender == 'M' else 'nữ'}")
    if xid in g.spouses(pid):
        raise bad_request("Không thể chọn vợ/chồng của người này làm cha/mẹ")
    if xid in g.descendants(pid):
        raise bad_request("Thao tác này sẽ tạo vòng lặp (một người là tổ tiên của chính mình).")


def _find_union(g: Graph, husband: int | None, wife: int | None) -> int | None:
    """Cuộc hôn nhân có sẵn đúng cặp (hoặc ô "không rõ tên" của một người)."""
    owner = husband if husband is not None else wife
    for uid in g.unions_of.get(owner, []):  # type: ignore[arg-type]
        u = g.unions[uid]
        if u.husband == husband and u.wife == wife:
            return uid
    return None


async def add_parents(db: AsyncSession, admin: Admin, pid: int, body: AddParentsIn) -> dict[str, Any]:
    g = await load_graph(db)
    if pid not in g.persons:
        raise not_found()
    if g.links_of_child.get(pid):
        raise bad_request("Người này đã có cha mẹ trên cây")
    me = g.persons[pid]
    is_root = pid == g.root_id
    if is_root and any(x is not None for x in (body.union_id, body.father_id, body.mother_id)):
        raise bad_request("Thủy tổ chỉ thêm được cha/mẹ mới (để lùi gốc lên một đời).")

    union_id = body.union_id
    if union_id is not None:
        if union_id not in g.unions:
            raise not_found("Không tìm thấy cuộc hôn nhân")
        u = g.unions[union_id]
        for xid in u.partners():
            _check_existing_parent(g, pid, xid, g.persons[xid].gender)
        existing_parents = u.partners()
    else:
        if body.father_id is not None:
            _check_existing_parent(g, pid, body.father_id, "M")
        if body.mother_id is not None:
            _check_existing_parent(g, pid, body.mother_id, "F")
        existing_parents = [x for x in (body.father_id, body.mother_id) if x is not None]

    warnings = birth_warnings(g, me.name, me.birth_year, existing_parents)
    if me.birth_year:
        for parent in (body.father, body.mother):
            if parent and parent.birth_year:
                gap = me.birth_year - parent.birth_year
                if gap < 0:
                    warnings.append(f"{me.name} (sinh {me.birth_year}) sinh trước cha/mẹ {parent.full_name} (sinh {parent.birth_year}).")
                elif gap < MIN_PARENT_AGE:
                    warnings.append(f"{parent.full_name} sinh năm {parent.birth_year}, chỉ hơn {me.name} {gap} tuổi.")
    _raise_warnings(warnings, body.confirm_warnings)

    rec = Recorder(db, admin.id, "edit", f"Thêm cha/mẹ cho {'thủy tổ ' if is_root else ''}{me.name}")
    if union_id is None:
        fid = body.father_id
        mid = body.mother_id
        if body.father:
            fid = (await _new_person(rec, body.father)).id
        if body.mother:
            mid = (await _new_person(rec, body.mother)).id
        union_id = _find_union(g, fid, mid)
        if union_id is None:
            owner = fid if fid is not None else mid
            existing = len(g.unions_of.get(owner, [])) if owner in g.persons else 0
            union = Marriage(
                husband_id=fid,
                wife_id=mid,
                kind=("chinh_that" if existing == 0 else "ke_that") if fid is not None else "chong",
                order_index=existing + 1,
            )
            await rec.created(union)
            union_id = union.id
    await rec.created(ParentLink(child_id=pid, union_id=union_id, kind=body.link_kind))

    parents_union = await db.get(Marriage, union_id)
    assert parents_union is not None
    first_parent = parents_union.husband_id or parents_union.wife_id
    if is_root:
        cfg = await _config(db)
        before = snapshot(cfg)
        cfg.root_person_id = first_parent
        cfg.version += 1
        await rec.updated(cfg, before)
    batch = await rec.finish()
    await db.commit()
    return _result(batch, person_id=first_parent, union_id=union_id)


# ---- sửa ----------------------------------------------------------------
async def update_person(db: AsyncSession, admin: Admin, pid: int, patch: PersonPatch) -> tuple[Person, str]:
    p = await _active(db, Person, pid, "Không tìm thấy thành viên")
    if p.version != patch.version:
        raise conflict()
    data = patch.model_dump(exclude_unset=True, exclude={"version", "confirm_warnings"})
    if "full_name" in data and not data["full_name"]:
        raise bad_request("Họ tên không được để trống")

    g = await load_graph(db)
    if "gender" in data and data["gender"] and data["gender"] != p.gender and g.unions_of.get(pid):
        raise bad_request("Không thể đổi giới tính khi người này đã có vợ/chồng trên cây.")
    if "birth_year" in data and data["birth_year"]:
        father, mother = g.parents(pid)
        name = data.get("full_name") or p.full_name
        warnings = birth_warnings(g, name, data["birth_year"], [x for x in (father, mother) if x])
        for child in g.children(pid):
            c = g.persons.get(child)
            if c and c.birth_year:
                gap = c.birth_year - data["birth_year"]
                if gap < 0:
                    warnings.append(f"Con {c.name} (sinh {c.birth_year}) sinh trước {name}.")
                elif gap < MIN_PARENT_AGE:
                    warnings.append(f"{name} mới {gap} tuổi khi sinh {c.name}.")
        _raise_warnings(warnings, patch.confirm_warnings)

    rec = Recorder(db, admin.id, "edit", f"Sửa thông tin {data.get('full_name') or p.full_name}")
    before = snapshot(p)
    apply_fields(p, data)
    p.version += 1
    await rec.updated(p, before)
    batch = await rec.finish()
    await db.commit()
    return p, str(batch.id)


async def update_union(db: AsyncSession, admin: Admin, uid: int, patch: UnionPatch) -> dict[str, Any]:
    u = await _active(db, Marriage, uid, "Không tìm thấy cuộc hôn nhân")
    if u.version != patch.version:
        raise conflict()
    rec = Recorder(db, admin.id, "edit", "Sửa thông tin hôn nhân")
    before = snapshot(u)
    for key, value in patch.model_dump(exclude_unset=True, exclude={"version"}).items():
        if value is not None:
            setattr(u, key, value)
    u.version += 1
    await rec.updated(u, before)
    batch = await rec.finish()
    await db.commit()
    return _result(batch, version=u.version)


async def delete_union(db: AsyncSession, admin: Admin, uid: int) -> dict[str, Any]:
    g = await load_graph(db)
    if uid not in g.unions:
        raise not_found("Không tìm thấy cuộc hôn nhân")
    if g.children_of_union.get(uid):
        raise bad_request("Cuộc hôn nhân có con chung — hãy xóa người vợ/chồng thay vì gỡ quan hệ.")
    u = await _active(db, Marriage, uid)
    rec = Recorder(db, admin.id, "delete", "Gỡ quan hệ hôn nhân")
    before = snapshot(u)
    u.deleted_at, u.deleted_batch = utcnow(), rec.batch.id
    u.version += 1
    await rec.updated(u, before, action="delete")
    # Người dâu/rể không còn liên kết nào với cây thì xóa theo
    lineage = g.lineage()
    for partner in g.unions[uid].partners():
        if partner not in lineage and g.unions_of.get(partner) == [uid] and not g.links_of_child.get(partner):
            p = await _active(db, Person, partner)
            pb = snapshot(p)
            p.deleted_at, p.deleted_batch = utcnow(), rec.batch.id
            p.version += 1
            await rec.updated(p, pb, action="delete")
    batch = await rec.finish()
    await db.commit()
    return _result(batch)


async def update_link(db: AsyncSession, admin: Admin, lid: int, patch: LinkPatch) -> dict[str, Any]:
    link = await _active(db, ParentLink, lid, "Không tìm thấy quan hệ")
    if link.version != patch.version:
        raise conflict()
    g = await load_graph(db)
    rec = Recorder(db, admin.id, "edit", "Sửa quan hệ cha mẹ – con")
    before = snapshot(link)
    if patch.union_id is not None and patch.union_id != link.union_id:
        if patch.union_id not in g.unions:
            raise not_found("Không tìm thấy cuộc hôn nhân")
        old_partners = set(g.unions[link.union_id].partners())
        if not old_partners & set(g.unions[patch.union_id].partners()):
            raise bad_request("Chỉ chuyển con sang một cuộc hôn nhân khác của cùng cha hoặc mẹ.")
        if g.would_create_cycle(link.child_id, patch.union_id):
            raise bad_request("Thao tác này sẽ tạo vòng lặp (một người là tổ tiên của chính mình).")
        link.union_id = patch.union_id
    if patch.kind is not None and patch.kind != link.kind:
        if patch.kind == "biological":
            others = [lk for lk in g.links_of_child.get(link.child_id, []) if lk.id != lid and lk.kind == "biological"]
            if others:
                raise bad_request("Một người chỉ có tối đa một quan hệ con ruột.")
        link.kind = patch.kind
    link.version += 1
    await rec.updated(link, before)
    batch = await rec.finish()
    await db.commit()
    return _result(batch)


async def reorder_siblings(db: AsyncSession, admin: Admin, body: ReorderIn) -> dict[str, Any]:
    g = await load_graph(db)
    ids = body.child_ids
    if len(set(ids)) != len(ids) or any(i not in g.persons for i in ids):
        raise bad_request("Danh sách không hợp lệ")
    common = None
    for cid in ids:
        parents = set(g.all_parents(cid))
        common = parents if common is None else common & parents
    if not common:
        raise bad_request("Chỉ sắp xếp anh chị em có chung cha hoặc mẹ")
    rec = Recorder(db, admin.id, "edit", "Đổi thứ tự anh chị em")
    for idx, cid in enumerate(ids, start=1):
        p = await _active(db, Person, cid)
        if p.birth_order != idx:
            before = snapshot(p)
            p.birth_order = idx
            p.version += 1
            await rec.updated(p, before)
    batch = await rec.finish()
    await db.commit()
    return _result(batch)


# ---- xóa (FR-30..34) -----------------------------------------------------
async def delete_preview(db: AsyncSession, pid: int) -> dict[str, Any]:
    g = await load_graph(db)
    plan = plan_delete(g, pid)
    names = sorted((g.persons[i].name for i in plan.person_ids if i in g.persons), key=normalize_name)
    return {
        "mode": plan.mode,
        "count": plan.count,
        "reason": plan.reason,
        "names": names[:30],
        "keeps_children": bool(plan.union_slots_null),
        "person_name": g.persons[pid].name if pid in g.persons else None,
        "detached_count": len(plan.detached),
        "detached_names": sorted((g.persons[i].name for i in plan.detached), key=normalize_name)[:30],
    }


async def delete_person(db: AsyncSession, admin: Admin, pid: int, body: DeleteIn) -> dict[str, Any]:
    g = await load_graph(db)
    plan = plan_delete(g, pid)
    if plan.mode == "blocked":
        raise AppError(409, "delete_blocked", plan.reason or "Không thể xóa")
    if body.mode != plan.mode:
        raise AppError(409, "delete_mode", "Cây đã thay đổi, vui lòng mở lại hộp thoại xóa.")
    name = g.persons[pid].name
    if plan.mode == "branch" and normalize_name(body.confirm_name or "") != normalize_name(name):
        raise bad_request("Tên xác nhận không khớp", code="confirm_name")
    for uid, _slot in plan.union_slots_null:
        if g.unions[uid].other(pid) is None:
            raise AppError(409, "delete_blocked", "Không thể xóa: con chung sẽ không còn cha mẹ nào trên cây.")

    summary = (
        f"Xóa cả nhánh {name} ({plan.count} người)" if plan.mode == "branch" else f"Xóa {name}"
    )
    rec = Recorder(db, admin.id, "delete", summary)
    now = utcnow()

    async def soft(model: type, oid: int) -> None:
        obj = await _active(db, model, oid)
        before = snapshot(obj)
        obj.deleted_at, obj.deleted_batch = now, rec.batch.id
        obj.version += 1
        await rec.updated(obj, before, action="delete")

    for uid, slot in plan.union_slots_null:
        u = await _active(db, Marriage, uid)
        before = snapshot(u)
        setattr(u, slot, None)
        u.version += 1
        await rec.updated(u, before)
    for lid in sorted(plan.link_ids):
        await soft(ParentLink, lid)
    for uid in sorted(plan.union_ids):
        await soft(Marriage, uid)
    for person_id in sorted(plan.person_ids):
        await soft(Person, person_id)
    if plan.clears_root:
        cfg = await _config(db)
        before = snapshot(cfg)
        cfg.root_person_id = None
        cfg.version += 1
        await rec.updated(cfg, before)
    batch = await rec.finish()
    await db.commit()
    return _result(batch, count=plan.count)
