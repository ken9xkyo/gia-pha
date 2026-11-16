"""Đăng nhập admin: email + mật khẩu, bắt buộc TOTP, khóa tạm sau 5 lần sai, phiên 7 ngày."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import VN_TZ, get_settings
from app.db import get_db
from app.deps import SESSION_COOKIE, current_admin, get_config
from app.errors import AppError
from app.models import Admin, AdminSession
from app.ratelimit import auth_limit, client_ip
from app.schemas import LoginIn, TotpIn
from app.security import (
    decrypt_secret,
    encrypt_secret,
    hash_token,
    make_challenge,
    new_session_token,
    new_totp_secret,
    qr_svg,
    read_challenge,
    totp_uri,
    verify_password,
    verify_totp,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def admin_info(a: Admin) -> dict:
    return {"id": a.id, "email": a.email, "full_name": a.full_name, "totp_enabled": a.totp_enabled}


def _locked_error(a: Admin) -> AppError:
    until = a.locked_until.astimezone(VN_TZ).strftime("%H:%M") if a.locked_until else ""
    return AppError(423, "locked", f"Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau {until}.")


async def _register_failure(db: AsyncSession, a: Admin) -> None:
    s = get_settings()
    a.failed_attempts += 1
    if a.failed_attempts >= s.login_max_attempts:
        a.locked_until = datetime.now(timezone.utc) + timedelta(minutes=s.login_lock_minutes)
        a.failed_attempts = 0
    await db.commit()


def _is_locked(a: Admin) -> bool:
    return a.locked_until is not None and a.locked_until > datetime.now(timezone.utc)


@router.post("/login", dependencies=[Depends(auth_limit)])
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)):
    email = body.email.lower()
    admin = (await db.execute(select(Admin).where(func.lower(Admin.email) == email))).scalar_one_or_none()
    if admin and _is_locked(admin):
        raise _locked_error(admin)
    ok = verify_password(admin.password_hash if admin else None, body.password)
    if not admin or not admin.is_active or not ok:
        if admin:
            await _register_failure(db, admin)
            if _is_locked(admin):
                raise _locked_error(admin)
        raise AppError(401, "invalid_credentials", "Email hoặc mật khẩu không đúng.")

    if admin.totp_enabled and admin.totp_secret_enc:
        return {"step": "totp", "challenge": make_challenge(admin.id, "totp")}

    cfg = await get_config(db)
    secret = new_totp_secret()
    admin.totp_secret_enc = encrypt_secret(secret)
    await db.commit()
    uri = totp_uri(secret, admin.email, cfg.clan_name)
    return {
        "step": "totp_setup",
        "challenge": make_challenge(admin.id, "totp_setup"),
        "secret": secret,
        "otpauth_uri": uri,
        "qr_svg": qr_svg(uri),
    }


@router.post("/totp", dependencies=[Depends(auth_limit)])
async def verify_code(body: TotpIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    purpose = "totp"
    admin_id = read_challenge(body.challenge, "totp")
    if admin_id is None:
        admin_id = read_challenge(body.challenge, "totp_setup")
        purpose = "totp_setup"
    if admin_id is None:
        raise AppError(401, "challenge_expired", "Phiên xác thực đã hết hạn, vui lòng đăng nhập lại.")
    admin = await db.get(Admin, admin_id, with_for_update=True)
    if admin is None or not admin.is_active or not admin.totp_secret_enc:
        raise AppError(401, "invalid_credentials", "Không thể xác thực tài khoản.")
    if _is_locked(admin):
        raise _locked_error(admin)
    if purpose == "totp" and not admin.totp_enabled:
        raise AppError(401, "challenge_expired", "Phiên xác thực đã hết hạn, vui lòng đăng nhập lại.")

    secret = decrypt_secret(admin.totp_secret_enc)
    counter = verify_totp(secret, body.code, admin.totp_last_counter) if secret else None
    if counter is None:
        await _register_failure(db, admin)
        if _is_locked(admin):
            raise _locked_error(admin)
        raise AppError(401, "invalid_code", "Mã xác thực không đúng hoặc đã được dùng.")

    now = datetime.now(timezone.utc)
    admin.totp_last_counter = counter
    admin.totp_enabled = True
    admin.failed_attempts = 0
    admin.locked_until = None
    admin.last_login_at = now
    token, token_hash = new_session_token()
    days = get_settings().session_days
    db.add(
        AdminSession(
            admin_id=admin.id,
            token_hash=token_hash,
            expires_at=now + timedelta(days=days),
            ip=client_ip(request)[:64],
            user_agent=(request.headers.get("user-agent") or "")[:300],
        )
    )
    await db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=days * 86400,
        httponly=True,
        secure=get_settings().cookie_secure,
        samesite="lax",
        path="/api",
    )
    return admin_info(admin)


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await db.execute(delete(AdminSession).where(AdminSession.token_hash == hash_token(token)))
        await db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/api")
    return {"ok": True}


@router.get("/me")
async def me(admin: Admin = Depends(current_admin)):
    return admin_info(admin)
