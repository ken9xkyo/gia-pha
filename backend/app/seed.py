"""Dữ liệu mẫu để dùng thử (chỉ nạp khi cây đang trống)."""

from sqlalchemy import update

from app.db import SessionLocal
from app.lunar import lunar_to_solar
from app.models import Marriage, ParentLink, Person, SiteConfig

PHA_KY = """
<h2>Tổ quán</h2>
<p>Dòng họ Nguyễn gốc ở làng Đông Ngạc, huyện Từ Liêm, trấn Sơn Tây (nay thuộc Hà Nội). Đây là dữ liệu mẫu để dùng thử hệ thống.</p>
<h2>Thủy tổ</h2>
<p>Cụ <strong>Nguyễn Văn Tổ</strong> sinh năm Canh Thìn (1880), làm nghề dạy chữ, lập ấp và mở mang ruộng đất cho con cháu.</p>
<h2>Tộc ước</h2>
<ul><li>Con cháu giữ gìn nề nếp gia phong, kính trên nhường dưới.</li><li>Hằng năm họp họ vào ngày giỗ thủy tổ (12 tháng 3 âm lịch).</li></ul>
"""


async def seed_demo() -> None:
    async with SessionLocal() as db:
        cfg = await db.get(SiteConfig, 1)
        if cfg is None:
            raise SystemExit("Chạy bootstrap trước")
        if cfg.root_person_id is not None:
            raise SystemExit("Cây đã có dữ liệu, bỏ qua.")

        async def person(name: str, gender: str, by: int | None = None, order: int | None = None, **kw) -> Person:
            death = kw.pop("death", None)
            p = Person(full_name=name, gender=gender, birth_year=by, birth_order=order, **kw)
            if death:
                ld, lm, ly = death
                p.living_status = "deceased"
                p.death_lunar_day, p.death_lunar_month, p.death_lunar_year = ld, lm, ly
                sd = lunar_to_solar(ld, lm, ly)
                if sd:
                    p.death_year, p.death_month, p.death_day = sd.year, sd.month, sd.day
            elif by and by > 1940:
                p.living_status = "alive"
            db.add(p)
            await db.flush()
            return p

        async def marry(h: Person | None, w: Person | None, kind: str = "chinh_that", order: int = 1) -> Marriage:
            u = Marriage(husband_id=h.id if h else None, wife_id=w.id if w else None, kind=kind, order_index=order)
            db.add(u)
            await db.flush()
            return u

        async def child(u: Marriage, p: Person, kind: str = "biological") -> None:
            db.add(ParentLink(child_id=p.id, union_id=u.id, kind=kind))
            await db.flush()

        to = await person("Nguyễn Văn Tổ", "M", 1880, ten_huy="Nguyễn Hữu Tổ", thuy_hieu="Phúc Hậu", death=(12, 3, 1950),
                          burial_place="Nghĩa trang làng Đông Ngạc", hometown="Đông Ngạc, Từ Liêm, Hà Nội")
        lanh = await person("Phạm Thị Lành", "F", 1885, death=(5, 9, 1940))
        man = await person("Vũ Thị Mận", "F", 1895, death=(20, 11, 1970))
        u_to1 = await marry(to, lanh)
        u_to2 = await marry(to, man, "ke_that", 2)

        duc = await person("Nguyễn Văn Đức", "M", 1905, 1, death=(15, 7, 1980))
        thuc = await person("Nguyễn Thị Thục", "F", 1910, 2, death=(2, 1, 1990))
        nghia = await person("Nguyễn Văn Nghĩa", "M", 1920, 3, death=(8, 8, 2001))
        await child(u_to1, duc)
        await child(u_to1, thuc)
        await child(u_to2, nghia)

        net = await person("Hoàng Thị Nết", "F", 1908, death=(29, 12, 1985))
        luc = await person("Trần Văn Lực", "M", 1906, death=(10, 10, 1975))
        u_duc = await marry(duc, net)
        u_thuc = await marry(luc, thuc, "chong")
        u_nghia = await marry(nghia, None)

        bao = await person("Nguyễn Văn Bảo", "M", 1935, 1, death=(3, 4, 2015))
        binh = await person("Nguyễn Văn Bình", "M", 1938, 2, death=(18, 6, 2020))
        hung = await person("Nguyễn Văn Hùng", "M", 1942, 3, occupation="Giáo viên")
        hang = await person("Nguyễn Thị Hằng", "F", 1945, 4)
        for c in (bao, binh, hung, hang):
            await child(u_duc, c)
        tung = await person("Trần Văn Tùng", "M", 1932, 1)
        cuc = await person("Trần Thị Cúc", "F", 1936, 2)
        await child(u_thuc, tung)
        await child(u_thuc, cuc)
        lam = await person("Nguyễn Văn Lâm", "M", 1950, 1)
        await child(u_nghia, lam)

        gam = await person("Lý Thị Gấm", "F", 1938)
        mai = await person("Đặng Thị Mai", "F", 1940)
        thu = await person("Đỗ Thị Thu", "F", 1946)
        khai = await person("Phan Văn Khải", "M", 1943)
        u_bao = await marry(bao, gam)
        u_binh = await marry(binh, mai)
        await marry(hung, thu)
        u_hang = await marry(khai, hang, "chong")

        lan = await person("Nguyễn Thị Lan", "F", 1970, 1)
        await child(u_bao, lan)
        quang = await person("Nguyễn Văn Quang", "M", 1962, 1)
        an = await person("Nguyễn Văn An", "M", 1965, 2, occupation="Kỹ sư", hometown="Đông Ngạc, Từ Liêm, Hà Nội")
        await child(u_binh, quang)
        await child(u_binh, an)
        yen = await person("Phan Thị Yến", "F", 1972, 1)
        await child(u_hang, yen)

        ngoc = await person("Vũ Thị Ngọc", "F", 1968)
        u_an = await marry(an, ngoc)
        khoi = await person("Nguyễn Minh Khôi", "M", 1995, 1)
        ha = await person("Nguyễn Thị Hà", "F", 1998, 2)
        await child(u_an, khoi)
        await child(u_an, ha)

        cfg.root_person_id = to.id
        cfg.pha_ky_html = PHA_KY.strip()
        await db.flush()
        await db.execute(update(SiteConfig).where(SiteConfig.id == 1).values(tree_version=SiteConfig.tree_version + 1))
        await db.commit()
        print("Đã nạp dữ liệu mẫu.")
