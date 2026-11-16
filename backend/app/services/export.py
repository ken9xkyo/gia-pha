"""Xuất danh sách thành viên ra Excel (FR-45)."""

from __future__ import annotations

import io
import re

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Marriage, Person
from app.services.graph import load_graph

GENDER = {"M": "Nam", "F": "Nữ"}
STATUS = {"alive": "Còn sống", "deceased": "Đã mất", "unknown": "Không rõ"}
CATEGORY = {"lineage": "Huyết thống", "inlaw": "Dâu/Rể", "extended": "Nhà thông gia", "orphan": "Chưa nối vào cây"}
UNION_KIND = {"chinh_that": "Chính thất", "ke_that": "Kế thất", "thu_that": "Thứ thất", "chong": "Chồng"}
UNION_STATUS = {"married": "Chung sống", "widowed": "Góa", "divorced": "Ly hôn"}
LINK_KIND = {"biological": "Ruột", "adopted": "Nuôi", "step": "Con riêng"}


def _date(y: int | None, m: int | None, d: int | None, approx: bool = False, lunar: bool = False, leap: bool = False) -> str:
    if not y and not m:
        return ""
    parts = []
    if d:
        parts.append(f"{d:02d}")
    if m:
        parts.append(f"{m:02d}{' nhuận' if leap else ''}")
    if y:
        parts.append(str(y))
    text = "/".join(parts)
    if approx:
        text = "khoảng " + text
    if lunar:
        text += " (ÂL)"
    return text


def _plain(html: str | None) -> str:
    if not html:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()


async def export_xlsx(db: AsyncSession, clan_name: str) -> bytes:
    g = await load_graph(db)
    gens = g.generations()
    cats = g.categories()
    persons = (
        await db.execute(select(Person).where(Person.deleted_at.is_(None)).order_by(Person.id))
    ).scalars().all()
    by_id = {p.id: p for p in persons}

    wb = Workbook()
    ws = wb.active
    ws.title = "Thành viên"
    headers = [
        "Mã", "Họ tên", "Giới tính", "Đời", "Chi/phái", "Thứ tự", "Phân loại", "Tên húy", "Tên tự", "Tên hiệu",
        "Thụy hiệu", "Ngày sinh", "Giờ sinh", "Tình trạng", "Ngày mất (DL)", "Ngày mất (ÂL)", "Giỗ (nhập riêng)",
        "Nơi an táng", "Cải táng", "Quê quán", "Nơi ở", "Nghề nghiệp", "Điện thoại", "Cha", "Mẹ", "Vợ/Chồng", "Tiểu sử",
    ]
    ws.append(headers)
    head_fill = PatternFill("solid", fgColor="7F1D1D")
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = head_fill
        cell.alignment = Alignment(vertical="center", wrap_text=True)

    def name_of(pid: int | None) -> str:
        return by_id[pid].full_name if pid in by_id else ""

    ordered = sorted(persons, key=lambda p: (gens.get(p.id, 999), p.birth_order or 99, p.id))
    for p in ordered:
        father, mother = g.parents(p.id)
        spouses = ", ".join(name_of(s) for s in g.spouses(p.id))
        ws.append([
            p.id, p.full_name, GENDER[p.gender], gens.get(p.id), p.branch_label or "", p.birth_order,
            CATEGORY[cats.get(p.id, "orphan")], p.ten_huy or "", p.ten_tu or "", p.ten_hieu or "",
            p.thuy_hieu or "",
            _date(p.birth_year, p.birth_month, p.birth_day, p.birth_approx, p.birth_calendar == "lunar", p.birth_lunar_leap),
            p.birth_time or "", STATUS[p.living_status],
            _date(p.death_year, p.death_month, p.death_day, p.death_approx),
            _date(p.death_lunar_year, p.death_lunar_month, p.death_lunar_day, lunar=False, leap=p.death_lunar_leap),
            _date(None, p.gio_lunar_month, p.gio_lunar_day),
            p.burial_place or "", p.reburial_info or "", p.hometown or "", p.residence or "", p.occupation or "",
            p.phone or "", name_of(father), name_of(mother), spouses, _plain(p.biography)[:2000],
        ])
    widths = [7, 26, 9, 6, 14, 7, 12, 18, 14, 14, 14, 16, 10, 11, 14, 14, 12, 28, 20, 22, 22, 18, 14, 24, 24, 30, 50]
    for idx, w in enumerate(widths, start=1):
        ws.column_dimensions[ws.cell(1, idx).column_letter].width = w
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = ws.dimensions

    ws2 = wb.create_sheet("Hôn nhân")
    ws2.append(["Mã", "Chồng", "Vợ", "Loại", "Thứ tự", "Tình trạng", "Số con"])
    for cell in ws2[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = head_fill
    unions = (await db.execute(select(Marriage).where(Marriage.deleted_at.is_(None)).order_by(Marriage.id))).scalars()
    for u in unions:
        ws2.append([
            u.id, name_of(u.husband_id) or "(không rõ tên)", name_of(u.wife_id) or "(không rõ tên)",
            UNION_KIND.get(u.kind, u.kind), u.order_index, UNION_STATUS.get(u.status, u.status),
            len(g.children_of_union.get(u.id, [])),
        ])
    for col, w in zip("ABCDEFG", (7, 26, 26, 12, 8, 12, 8)):
        ws2.column_dimensions[col].width = w

    ws.oddHeader.center.text = f"Gia phả {clan_name}"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
