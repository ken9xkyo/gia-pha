"""Kiểm thử tích hợp API trên PostgreSQL thật (đặt TEST_DATABASE_URL)."""

import pyotp
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

pytestmark = [pytest.mark.integration, pytest.mark.asyncio(loop_scope="session")]

H = {"X-Requested-With": "giapha"}
EMAIL = "admin@example.com"
PASSWORD = "Mat-khau-2026!"


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def app_ctx():
    from sqlalchemy import text

    from app.db import SessionLocal, engine
    from app.main import app
    from app.models import Admin, Base, SiteConfig
    from app.security import hash_password

    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        db.add(SiteConfig(id=1, clan_name="Họ Nguyễn", public_token="tok123", kinship_overrides={}))
        db.add(Admin(email=EMAIL, full_name="Admin", password_hash=hash_password(PASSWORD)))
        db.add(Admin(email="lock@example.com", full_name="Lock", password_hash=hash_password(PASSWORD)))
        await db.commit()
    yield app
    await engine.dispose()


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def admin(app_ctx):
    client = AsyncClient(transport=ASGITransport(app=app_ctx), base_url="http://test")
    r = await client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["step"] == "totp_setup"
    assert "<svg" in data["qr_svg"]
    r = await client.post("/api/auth/totp", json={"challenge": data["challenge"], "code": "000000"})
    assert r.status_code == 401
    code = pyotp.TOTP(data["secret"]).now()
    r = await client.post("/api/auth/totp", json={"challenge": data["challenge"], "code": code})
    assert r.status_code == 200, r.text
    assert "gp_session" in client.cookies
    yield client
    await client.aclose()


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def public(app_ctx):
    client = AsyncClient(transport=ASGITransport(app=app_ctx), base_url="http://test")
    yield client
    await client.aclose()


async def tree(client, admin_mode=True):
    url = "/api/admin/tree" if admin_mode else "/api/public/tok123/tree"
    r = await client.get(url)
    assert r.status_code == 200, r.text
    return r.json()


def by_name(t, name):
    return next(p for p in t["persons"] if p["n"] == name)


async def test_requires_auth_and_csrf(public, admin):
    assert (await public.get("/api/admin/tree")).status_code == 401
    r = await admin.post("/api/admin/persons/root", json={"full_name": "X", "gender": "M"})
    assert r.status_code == 403


async def test_build_tree_flow(admin, public):
    r = await admin.post("/api/admin/persons/root", json={"full_name": "Nguyễn Văn Tổ", "gender": "M", "birth_year": 1900}, headers=H)
    assert r.status_code == 200, r.text
    root = r.json()["person_id"]
    r = await admin.post(f"/api/admin/persons/{root}/spouses", json={"person": {"full_name": "Lê Thị Bà", "gender": "F"}}, headers=H)
    assert r.status_code == 200, r.text
    r = await admin.post(f"/api/admin/persons/{root}/children", json={"person": {"full_name": "Nguyễn Văn Cả", "gender": "M", "birth_year": 1925}}, headers=H)
    assert r.status_code == 200, r.text
    ca = r.json()["person_id"]
    r = await admin.post(f"/api/admin/persons/{ca}/siblings", json={"person": {"full_name": "Nguyễn Thị Hai", "gender": "F", "birth_year": 1928}}, headers=H)
    assert r.status_code == 200, r.text

    t = await tree(public, admin_mode=False)
    assert t["root"] == root
    assert {p["n"] for p in t["persons"]} == {"Nguyễn Văn Tổ", "Lê Thị Bà", "Nguyễn Văn Cả", "Nguyễn Thị Hai"}
    assert by_name(t, "Nguyễn Văn Cả")["o"] == 1
    assert by_name(t, "Nguyễn Thị Hai")["o"] == 2

    r = await public.get("/api/public/tok123/tree")
    etag = r.headers["etag"]
    r = await public.get("/api/public/tok123/tree", headers={"If-None-Match": etag})
    assert r.status_code == 304
    assert (await public.get("/api/public/wrong/tree")).status_code == 404


async def test_birth_warnings(admin):
    t = await tree(admin)
    ca = by_name(t, "Nguyễn Văn Cả")["id"]
    body = {"person": {"full_name": "Con Lạ", "gender": "M", "birth_year": 1930}}
    r = await admin.post(f"/api/admin/persons/{ca}/children", json=body, headers=H)
    assert r.status_code == 409
    assert r.json()["code"] == "warnings"
    r = await admin.post(f"/api/admin/persons/{ca}/children", json={**body, "confirm_warnings": True}, headers=H)
    assert r.status_code == 200
    # Hoàn tác ngay
    r = await admin.post(f"/api/admin/batches/{r.json()['batch_id']}/undo", headers=H)
    assert r.status_code == 200, r.text
    t = await tree(admin)
    assert all(p["n"] != "Con Lạ" for p in t["persons"])


async def test_optimistic_lock_and_privacy(admin, public):
    t = await tree(admin)
    ca = by_name(t, "Nguyễn Văn Cả")
    r = await admin.patch(f"/api/admin/persons/{ca['id']}", json={
        "version": ca["v"], "residence": "Hà Nội", "phone": "0900000000", "living_status": "alive",
        "birth_month": 5, "birth_day": 12,
    }, headers=H)
    assert r.status_code == 200, r.text
    r = await admin.patch(f"/api/admin/persons/{ca['id']}", json={"version": ca["v"], "occupation": "Nông"}, headers=H)
    assert r.status_code == 409
    assert r.json()["code"] == "version_conflict"

    pub = (await public.get(f"/api/public/tok123/persons/{ca['id']}")).json()
    assert pub["residence"] is None and pub["phone"] is None and pub["birth_day"] is None
    assert pub["birth_year"] == 1925
    full = (await admin.get(f"/api/admin/persons/{ca['id']}")).json()
    assert full["residence"] == "Hà Nội"


async def test_death_date_converts_lunar(admin, public):
    t = await tree(admin)
    to = by_name(t, "Nguyễn Văn Tổ")
    r = await admin.patch(f"/api/admin/persons/{to['id']}", json={
        "version": to["v"], "death_lunar_year": 1980, "death_lunar_month": 3, "death_lunar_day": 12,
    }, headers=H)
    assert r.status_code == 200, r.text
    p = r.json()["person"]
    assert p["living_status"] == "deceased"
    assert (p["death_year"], p["death_month"], p["death_day"]) == (1980, 4, 26)
    r = await public.get("/api/public/tok123/anniversaries?days=400")
    items = r.json()["items"]
    assert any(i["person_id"] == to["id"] and i["lunar_month"] == 3 for i in items)


async def test_delete_flows(admin):
    t = await tree(admin)
    root = by_name(t, "Nguyễn Văn Tổ")["id"]
    ca = by_name(t, "Nguyễn Văn Cả")["id"]
    # Thêm vợ và con cho Cả
    await admin.post(f"/api/admin/persons/{ca}/spouses", json={"person": {"full_name": "Trần Thị Dâu", "gender": "F"}}, headers=H)
    r = await admin.post(f"/api/admin/persons/{ca}/children", json={"person": {"full_name": "Nguyễn Văn Cháu", "gender": "M"}}, headers=H)
    assert r.status_code == 200, r.text

    r = await admin.get(f"/api/admin/persons/{root}/delete-preview")
    assert r.json()["mode"] == "blocked"

    r = await admin.get(f"/api/admin/persons/{ca}/delete-preview")
    preview = r.json()
    assert preview["mode"] == "branch" and preview["count"] == 3
    r = await admin.post(f"/api/admin/persons/{ca}/delete", json={"mode": "branch", "confirm_name": "sai"}, headers=H)
    assert r.status_code == 400
    r = await admin.post(f"/api/admin/persons/{ca}/delete", json={"mode": "branch", "confirm_name": "nguyen van ca"}, headers=H)
    assert r.status_code == 200, r.text
    names = {p["n"] for p in (await tree(admin))["persons"]}
    assert "Nguyễn Văn Cháu" not in names and "Trần Thị Dâu" not in names

    trash = (await admin.get("/api/admin/trash")).json()
    assert trash and "Nguyễn Văn Cả" in trash[0]["names"]
    r = await admin.post(f"/api/admin/trash/{trash[0]['id']}/restore", headers=H)
    assert r.status_code == 200, r.text
    names = {p["n"] for p in (await tree(admin))["persons"]}
    assert {"Nguyễn Văn Cả", "Nguyễn Văn Cháu", "Trần Thị Dâu"} <= names

    # Xóa dâu có con chung → chuyển thành "không rõ tên", giữ con
    t = await tree(admin)
    dau = by_name(t, "Trần Thị Dâu")["id"]
    preview = (await admin.get(f"/api/admin/persons/{dau}/delete-preview")).json()
    assert preview["mode"] == "inlaw" and preview["keeps_children"]
    r = await admin.post(f"/api/admin/persons/{dau}/delete", json={"mode": "inlaw"}, headers=H)
    assert r.status_code == 200, r.text
    t = await tree(admin)
    chau = by_name(t, "Nguyễn Văn Cháu")
    link = next(lk for lk in t["links"] if lk["c"] == chau["id"])
    union = next(u for u in t["unions"] if u["id"] == link["u"])
    assert union["w"] is None and union["h"] == ca


async def test_add_parents_moves_root(admin):
    t = await tree(admin)
    old_root = t["root"]
    r = await admin.post(f"/api/admin/persons/{old_root}/parents", json={"father": {"full_name": "Nguyễn Văn Cụ", "gender": "M"}}, headers=H)
    assert r.status_code == 200, r.text
    t = await tree(admin)
    assert t["root"] != old_root
    assert by_name(t, "Nguyễn Văn Cụ")["id"] == t["root"]


async def test_audit_and_export(admin):
    r = await admin.get("/api/admin/audit")
    assert r.status_code == 200
    assert r.json()["items"]
    r = await admin.get("/api/admin/export/persons.xlsx")
    assert r.status_code == 200 and r.content[:2] == b"PK"
    r = await admin.get("/api/admin/stats")
    assert r.json()["persons"] >= 5


async def test_lockout(public):
    for _ in range(5):
        r = await public.post("/api/auth/login", json={"email": "lock@example.com", "password": "sai-mat-khau"})
    assert r.status_code == 423
    r = await public.post("/api/auth/login", json={"email": "lock@example.com", "password": PASSWORD})
    assert r.status_code == 423


async def test_lunar_api(public):
    r = await public.get("/api/lunar/to-lunar?y=2025&m=1&d=29")
    assert r.json()["day"] == 1 and r.json()["can_chi"] == "Ất Tỵ"
    r = await public.get("/api/lunar/to-solar?y=2023&m=2&d=1&leap=true")
    assert r.json() == {"day": 22, "month": 3, "year": 2023}
