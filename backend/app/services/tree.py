"""Dữ liệu cây gọn nhẹ cho client: 5.000 người ≈ 400 KB JSON, ≈ 60 KB sau nén."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

import orjson
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import VN_TZ
from app.lunar import next_anniversary, solar_to_lunar
from app.models import Marriage, ParentLink, Person, SiteConfig
from app.ratelimit import cache_get, cache_set
from app.services.graph import load_graph

_PERSON_COLS = (
    Person.id, Person.full_name, Person.gender, Person.birth_year, Person.birth_month, Person.birth_day,
    Person.birth_calendar, Person.birth_approx, Person.death_year, Person.death_lunar_year,
    Person.living_status, Person.birth_order, Person.branch_label, Person.photo, Person.ten_huy,
    Person.hide_ten_huy, Person.show_full_birth, Person.version,
)


def tree_stamp(cfg: SiteConfig) -> str:
    """Định danh phiên bản cây: số phiên bản + thời điểm cập nhật (không trùng giữa các CSDL
    hay sau khi khôi phục sao lưu làm số phiên bản lùi lại)."""
    return f"{cfg.tree_version}.{int(cfg.updated_at.timestamp() * 1000) if cfg.updated_at else 0}"


async def build_tree(db: AsyncSession, cfg: SiteConfig, admin: bool) -> bytes:
    scope = "admin" if admin else "public"
    key = f"tree:{scope}:{tree_stamp(cfg)}"
    cached = await cache_get(key)
    if cached:
        return cached

    persons: list[dict[str, Any]] = []
    for r in (await db.execute(select(*_PERSON_COLS).where(Person.deleted_at.is_(None)))).all():
        item: dict[str, Any] = {"id": r.id, "n": r.full_name, "g": r.gender}
        if r.birth_year:
            item["by"] = r.birth_year
            if r.birth_approx:
                item["ba"] = 1
            if r.birth_calendar == "lunar":
                item["bl"] = 1
            if r.birth_month and (admin or r.show_full_birth or r.living_status == "deceased"):
                item["bm"] = r.birth_month
                if r.birth_day:
                    item["bd"] = r.birth_day
        dy = r.death_year or r.death_lunar_year
        if dy:
            item["dy"] = dy
        if r.living_status != "unknown":
            item["st"] = "a" if r.living_status == "alive" else "d"
        if r.birth_order:
            item["o"] = r.birth_order
        if r.branch_label:
            item["br"] = r.branch_label
        if r.photo:
            item["ph"] = r.photo
        if r.ten_huy and (admin or not r.hide_ten_huy):
            item["th"] = r.ten_huy
        if admin:
            item["v"] = r.version
        persons.append(item)

    unions = [
        {"id": r.id, "h": r.husband_id, "w": r.wife_id, "k": r.kind, "o": r.order_index, "s": r.status,
         **({"v": r.version} if admin else {})}
        for r in (
            await db.execute(
                select(Marriage.id, Marriage.husband_id, Marriage.wife_id, Marriage.kind, Marriage.order_index,
                       Marriage.status, Marriage.version).where(Marriage.deleted_at.is_(None))
            )
        ).all()
    ]
    links = [
        {"id": r.id, "c": r.child_id, "u": r.union_id, "k": r.kind, **({"v": r.version} if admin else {})}
        for r in (
            await db.execute(
                select(ParentLink.id, ParentLink.child_id, ParentLink.union_id, ParentLink.kind,
                       ParentLink.version).where(ParentLink.deleted_at.is_(None))
            )
        ).all()
    ]
    payload = orjson.dumps(
        {
            "version": cfg.tree_version,
            "root": cfg.root_person_id,
            "clan": cfg.clan_name,
            "kinship": cfg.kinship_overrides or {},
            "persons": persons,
            "unions": unions,
            "links": links,
        }
    )
    await cache_set(key, payload)
    return payload


def today_vn() -> date:
    return datetime.now(VN_TZ).date()


async def anniversaries(db: AsyncSession, days: int, admin: bool) -> list[dict[str, Any]]:
    """Ngày giỗ trong `days` ngày tới (FR-44)."""
    today = today_vn()
    g = await load_graph(db)
    gens = g.generations()
    rows = (
        await db.execute(
            select(
                Person.id, Person.full_name, Person.gender, Person.death_year, Person.death_lunar_year,
                Person.death_lunar_month, Person.death_lunar_day, Person.death_lunar_leap,
                Person.gio_lunar_month, Person.gio_lunar_day, Person.photo,
            ).where(Person.deleted_at.is_(None), Person.living_status == "deceased")
        )
    ).all()
    out = []
    for r in rows:
        override = bool(r.gio_lunar_month and r.gio_lunar_day)
        month = r.gio_lunar_month if override else r.death_lunar_month
        day = r.gio_lunar_day if override else r.death_lunar_day
        if not month or not day:
            continue
        solar = next_anniversary(month, day, today)
        left = (solar - today).days
        if left > days:
            continue
        ly = solar_to_lunar(solar)
        out.append(
            {
                "person_id": r.id,
                "name": r.full_name,
                "gender": r.gender,
                "generation": gens.get(r.id),
                "lunar_day": day,
                "lunar_month": month,
                "lunar_year": ly.year,
                "solar_date": solar.isoformat(),
                "days_left": left,
                "death_year": r.death_year or r.death_lunar_year,
                "death_leap": bool(r.death_lunar_leap) and not override,
                "is_override": override,
                "photo": r.photo,
            }
        )
    out.sort(key=lambda x: (x["days_left"], x["generation"] or 999, x["name"]))
    return out
