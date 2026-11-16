"""Mật khẩu (Argon2), TOTP, mã hóa bí mật, token thử thách và phiên đăng nhập."""

import base64
import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta, timezone

import jwt
import pyotp
import segno
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

_hasher = PasswordHasher()
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing")
TOTP_ISSUER = "Gia Pha"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def validate_password_strength(password: str) -> str | None:
    if len(password) < 10:
        return "Mật khẩu cần tối thiểu 10 ký tự"
    classes = sum(
        [
            any(c.islower() for c in password),
            any(c.isupper() for c in password),
            any(c.isdigit() for c in password),
            any(not c.isalnum() for c in password),
        ]
    )
    if classes < 3:
        return "Mật khẩu cần có ít nhất 3 trong 4 loại: chữ thường, chữ hoa, chữ số, ký tự đặc biệt"
    return None


def _fernet() -> Fernet:
    key = hashlib.sha256(("totp:" + get_settings().secret_key).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str | None:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return None


def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, email: str, clan_name: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=f"{TOTP_ISSUER} {clan_name}".strip())


def qr_svg(data: str) -> str:
    return segno.make(data, error="m").svg_inline(scale=5, border=2, dark="#1f2937", light="#ffffff")


def verify_totp(secret: str, code: str, last_counter: int) -> int | None:
    """Trả về bộ đếm thời gian khớp (chống dùng lại mã), hoặc None."""
    code = "".join(ch for ch in code if ch.isdigit())
    if len(code) != 6:
        return None
    totp = pyotp.TOTP(secret)
    now_counter = int(time.time()) // totp.interval
    for counter in (now_counter - 1, now_counter, now_counter + 1):
        if counter <= last_counter:
            continue
        if hmac.compare_digest(totp.generate_otp(counter), code):
            return counter
    return None


def make_challenge(admin_id: int, purpose: str, minutes: int = 10) -> str:
    payload = {
        "sub": str(admin_id),
        "purpose": purpose,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes),
        "nonce": secrets.token_hex(8),
    }
    return jwt.encode(payload, get_settings().secret_key, algorithm="HS256")


def read_challenge(token: str, purpose: str) -> int | None:
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if payload.get("purpose") != purpose:
        return None
    return int(payload["sub"])


def new_session_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_public_token() -> str:
    return secrets.token_urlsafe(12)
