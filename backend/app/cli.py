"""Lệnh quản trị: python -m app.cli <lệnh>

  bootstrap                 Tạo cấu hình ban đầu và admin đầu tiên (từ biến môi trường)
  create-admin EMAIL TÊN    Tạo admin mới (hỏi mật khẩu)
  reset-2fa EMAIL           Gỡ xác thực 2 bước để admin thiết lập lại
  unlock EMAIL              Mở khóa tài khoản bị khóa tạm
  public-link               In đường dẫn công khai hiện tại
  seed-demo                 Nạp dữ liệu mẫu (chỉ khi cây trống)
"""

import asyncio
import getpass
import sys

from sqlalchemy import func, select

from app.config import get_settings
from app.db import SessionLocal
from app.models import Admin, SiteConfig
from app.security import hash_password, new_public_token, validate_password_strength


async def bootstrap() -> None:
    s = get_settings()
    async with SessionLocal() as db:
        cfg = await db.get(SiteConfig, 1)
        if cfg is None:
            db.add(SiteConfig(id=1, clan_name=s.clan_name, public_token=new_public_token(), kinship_overrides={}))
            print(f"[bootstrap] Đã tạo cấu hình dòng họ '{s.clan_name}'")
        count = (await db.execute(select(func.count(Admin.id)))).scalar_one()
        if count == 0 and s.initial_admin_email and s.initial_admin_password:
            if err := validate_password_strength(s.initial_admin_password):
                print(f"[bootstrap] INITIAL_ADMIN_PASSWORD không đạt yêu cầu: {err}", file=sys.stderr)
                sys.exit(1)
            db.add(
                Admin(
                    email=s.initial_admin_email.lower(),
                    full_name=s.initial_admin_name,
                    password_hash=hash_password(s.initial_admin_password),
                )
            )
            print(f"[bootstrap] Đã tạo admin đầu tiên: {s.initial_admin_email}")
        elif count == 0:
            print("[bootstrap] Chưa có admin. Chạy: docker compose exec backend python -m app.cli create-admin EMAIL 'Họ tên'")
        await db.commit()


async def create_admin(email: str, name: str) -> None:
    password = getpass.getpass("Mật khẩu: ")
    if err := validate_password_strength(password):
        sys.exit(err)
    if password != getpass.getpass("Nhập lại: "):
        sys.exit("Mật khẩu không khớp")
    async with SessionLocal() as db:
        db.add(Admin(email=email.lower(), full_name=name, password_hash=hash_password(password)))
        await db.commit()
    print("Đã tạo admin. Lần đăng nhập đầu sẽ yêu cầu thiết lập xác thực 2 bước.")


async def _update_admin(email: str, **values) -> None:
    async with SessionLocal() as db:
        a = (await db.execute(select(Admin).where(func.lower(Admin.email) == email.lower()))).scalar_one_or_none()
        if a is None:
            sys.exit("Không tìm thấy admin")
        for k, v in values.items():
            setattr(a, k, v)
        await db.commit()
    print("Đã cập nhật.")


async def public_link() -> None:
    async with SessionLocal() as db:
        cfg = await db.get(SiteConfig, 1)
        print(f"/t/{cfg.public_token}" if cfg else "Chưa khởi tạo")


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    cmd = args[0]
    if cmd == "bootstrap":
        asyncio.run(bootstrap())
    elif cmd == "create-admin" and len(args) == 3:
        asyncio.run(create_admin(args[1], args[2]))
    elif cmd == "reset-2fa" and len(args) == 2:
        asyncio.run(_update_admin(args[1], totp_enabled=False, totp_secret_enc=None, totp_last_counter=0))
    elif cmd == "unlock" and len(args) == 2:
        asyncio.run(_update_admin(args[1], locked_until=None, failed_attempts=0, is_active=True))
    elif cmd == "public-link":
        asyncio.run(public_link())
    elif cmd == "seed-demo":
        from app.seed import seed_demo

        asyncio.run(seed_demo())
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
