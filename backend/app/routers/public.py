"""API công khai cho người xem có đường link (không cần đăng nhập)."""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import public_config
from app.errors import not_found
from app.models import Person, SiteConfig, VisitStat
from app.ratelimit import public_limit
from app.routers.common import tree_response
from app.schemas import VisitIn
from app.services.serialize import person_public
from app.services.tree import anniversaries, today_vn

router = APIRouter(prefix="/api/public/{token}", tags=["public"], dependencies=[Depends(public_limit)])


def config_public(cfg: SiteConfig) -> dict:
    return {
        "clan_name": cfg.clan_name,
        "tagline": cfg.tagline,
        "contact_name": cfg.contact_name,
        "contact_phone": cfg.contact_phone,
        "contact_zalo": cfg.contact_zalo,
        "has_pha_ky": bool(cfg.pha_ky_html),
    }


@router.get("/config")
async def get_public_config(cfg: SiteConfig = Depends(public_config)):
    return config_public(cfg)


@router.get("/tree")
async def get_tree(request: Request, cfg: SiteConfig = Depends(public_config), db: AsyncSession = Depends(get_db)):
    return await tree_response(request, db, cfg, admin=False)


@router.get("/persons/{pid}")
async def get_person(pid: int, cfg: SiteConfig = Depends(public_config), db: AsyncSession = Depends(get_db)):
    p = await db.get(Person, pid)
    if p is None or p.deleted_at is not None:
        raise not_found("Không tìm thấy thành viên")
    return person_public(p)


@router.get("/pha-ky")
async def get_pha_ky(cfg: SiteConfig = Depends(public_config)):
    return {"html": cfg.pha_ky_html or "", "clan_name": cfg.clan_name}


@router.get("/anniversaries")
async def get_anniversaries(
    days: int = Query(60, ge=1, le=400),
    cfg: SiteConfig = Depends(public_config),
    db: AsyncSession = Depends(get_db),
):
    return {"today": today_vn().isoformat(), "items": await anniversaries(db, days, admin=False)}


@router.post("/visit", status_code=204)
async def record_visit(body: VisitIn, cfg: SiteConfig = Depends(public_config), db: AsyncSession = Depends(get_db)):
    """Đếm ẩn danh: chỉ biết có chọn 'Tôi là ai' hay không, không biết chọn ai."""
    stmt = insert(VisitStat).values(day=today_vn(), visits=1, visits_with_me=int(body.with_me))
    stmt = stmt.on_conflict_do_update(
        index_elements=[VisitStat.day],
        set_={
            "visits": VisitStat.visits + 1,
            "visits_with_me": VisitStat.visits_with_me + int(body.with_me),
        },
    )
    await db.execute(stmt)
    await db.commit()
