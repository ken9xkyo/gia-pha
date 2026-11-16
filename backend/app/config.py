from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://giapha:giapha@db:5432/giapha"
    redis_url: str = "redis://redis:6379/0"
    secret_key: str = "change-me-please-change-me-please"

    cookie_secure: bool = True
    session_days: int = 7
    login_max_attempts: int = 5
    login_lock_minutes: int = 15

    media_dir: str = "/data/media"
    backup_dir: str = "/backups"
    max_upload_mb: int = 10

    public_rate_limit_per_min: int = 240
    auth_rate_limit_per_min: int = 20

    trash_retention_days: int = 30

    initial_admin_email: str | None = None
    initial_admin_password: str | None = None
    initial_admin_name: str = "Quản trị viên"
    clan_name: str = "Dòng họ"

    log_level: str = "info"


@lru_cache
def get_settings() -> Settings:
    return Settings()
