from datetime import date

from fastapi import APIRouter, Depends, Query

from app.errors import bad_request
from app.lunar import can_chi_year, lunar_to_solar, solar_to_lunar
from app.ratelimit import public_limit

router = APIRouter(prefix="/api/lunar", tags=["lunar"], dependencies=[Depends(public_limit)])


@router.get("/to-lunar")
async def to_lunar(y: int = Query(..., ge=1, le=2199), m: int = Query(..., ge=1, le=12), d: int = Query(..., ge=1, le=31)):
    try:
        ld = solar_to_lunar(date(y, m, d))
    except ValueError as exc:
        raise bad_request("Ngày dương lịch không hợp lệ") from exc
    return {"day": ld.day, "month": ld.month, "year": ld.year, "leap": ld.leap, "can_chi": can_chi_year(ld.year)}


@router.get("/to-solar")
async def to_solar(
    y: int = Query(..., ge=1, le=2199),
    m: int = Query(..., ge=1, le=12),
    d: int = Query(..., ge=1, le=30),
    leap: bool = False,
):
    sd = lunar_to_solar(d, m, y, leap)
    if sd is None:
        raise bad_request("Ngày âm lịch không tồn tại (kiểm tra tháng nhuận / ngày 30)")
    return {"day": sd.day, "month": sd.month, "year": sd.year}
