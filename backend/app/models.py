"""Mô hình dữ liệu: đồ thị Thành viên – Hôn nhân – Quan hệ cha mẹ/con (PRD mục 5)."""

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Tracked(Timestamps):
    """Bản ghi có xóa mềm, khóa lạc quan và được ghi nhật ký."""

    version: Mapped[int] = mapped_column(Integer, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_batch: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)


class Person(Tracked, Base):
    __tablename__ = "persons"
    __table_args__ = (
        CheckConstraint("gender IN ('M','F')", name="ck_person_gender"),
        CheckConstraint("living_status IN ('alive','deceased','unknown')", name="ck_person_status"),
        CheckConstraint("birth_calendar IN ('solar','lunar')", name="ck_person_birth_cal"),
        Index("ix_persons_active", "id", postgresql_where=text("deleted_at IS NULL")),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    full_name: Mapped[str] = mapped_column(String(200))
    gender: Mapped[str] = mapped_column(String(1))

    ten_huy: Mapped[str | None] = mapped_column(String(200))
    ten_tu: Mapped[str | None] = mapped_column(String(200))
    ten_hieu: Mapped[str | None] = mapped_column(String(200))
    thuy_hieu: Mapped[str | None] = mapped_column(String(200))

    birth_order: Mapped[int | None] = mapped_column(SmallInteger)
    branch_label: Mapped[str | None] = mapped_column(String(100))

    birth_year: Mapped[int | None] = mapped_column(SmallInteger)
    birth_month: Mapped[int | None] = mapped_column(SmallInteger)
    birth_day: Mapped[int | None] = mapped_column(SmallInteger)
    birth_calendar: Mapped[str] = mapped_column(String(5), default="solar")
    birth_lunar_leap: Mapped[bool] = mapped_column(Boolean, default=False)
    birth_approx: Mapped[bool] = mapped_column(Boolean, default=False)
    birth_time: Mapped[str | None] = mapped_column(String(50))

    living_status: Mapped[str] = mapped_column(String(10), default="unknown")
    death_year: Mapped[int | None] = mapped_column(SmallInteger)
    death_month: Mapped[int | None] = mapped_column(SmallInteger)
    death_day: Mapped[int | None] = mapped_column(SmallInteger)
    death_approx: Mapped[bool] = mapped_column(Boolean, default=False)
    death_lunar_year: Mapped[int | None] = mapped_column(SmallInteger)
    death_lunar_month: Mapped[int | None] = mapped_column(SmallInteger)
    death_lunar_day: Mapped[int | None] = mapped_column(SmallInteger)
    death_lunar_leap: Mapped[bool] = mapped_column(Boolean, default=False)
    gio_lunar_month: Mapped[int | None] = mapped_column(SmallInteger)
    gio_lunar_day: Mapped[int | None] = mapped_column(SmallInteger)

    burial_place: Mapped[str | None] = mapped_column(Text)
    burial_lat: Mapped[float | None] = mapped_column(Float)
    burial_lng: Mapped[float | None] = mapped_column(Float)
    reburial_info: Mapped[str | None] = mapped_column(Text)

    hometown: Mapped[str | None] = mapped_column(String(300))
    residence: Mapped[str | None] = mapped_column(String(300))
    occupation: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(50))
    biography: Mapped[str | None] = mapped_column(Text)
    photo: Mapped[str | None] = mapped_column(String(100))

    # Quyền riêng tư: mặc định ẩn, admin chủ động mở từng trường (PRD mục 9)
    show_full_birth: Mapped[bool] = mapped_column(Boolean, default=False)
    show_residence: Mapped[bool] = mapped_column(Boolean, default=False)
    show_phone: Mapped[bool] = mapped_column(Boolean, default=False)
    hide_ten_huy: Mapped[bool] = mapped_column(Boolean, default=False)


class Marriage(Tracked, Base):
    """Hôn nhân (Union). Một trong hai người có thể để trống ("không rõ tên")."""

    __tablename__ = "unions"
    __table_args__ = (
        CheckConstraint("husband_id IS NOT NULL OR wife_id IS NOT NULL", name="ck_union_partner"),
        CheckConstraint("kind IN ('chinh_that','ke_that','thu_that','chong')", name="ck_union_kind"),
        CheckConstraint("status IN ('married','widowed','divorced')", name="ck_union_status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    husband_id: Mapped[int | None] = mapped_column(ForeignKey("persons.id", ondelete="RESTRICT"), index=True)
    wife_id: Mapped[int | None] = mapped_column(ForeignKey("persons.id", ondelete="RESTRICT"), index=True)
    kind: Mapped[str] = mapped_column(String(12), default="chinh_that")
    order_index: Mapped[int] = mapped_column(SmallInteger, default=1)
    status: Mapped[str] = mapped_column(String(10), default="married")


class ParentLink(Tracked, Base):
    """Quan hệ cha mẹ – con: con luôn gắn với một cuộc hôn nhân cụ thể."""

    __tablename__ = "parent_child"
    __table_args__ = (
        CheckConstraint("kind IN ('biological','adopted','step')", name="ck_link_kind"),
        Index(
            "uq_link_one_biological",
            "child_id",
            unique=True,
            postgresql_where=text("kind = 'biological' AND deleted_at IS NULL"),
        ),
        Index(
            "uq_link_child_union",
            "child_id",
            "union_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("persons.id", ondelete="RESTRICT"), index=True)
    union_id: Mapped[int] = mapped_column(ForeignKey("unions.id", ondelete="RESTRICT"), index=True)
    kind: Mapped[str] = mapped_column(String(10), default="biological")


class SiteConfig(Timestamps, Base):
    """Cấu hình dòng họ (một dòng duy nhất, id = 1)."""

    __tablename__ = "site_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    clan_name: Mapped[str] = mapped_column(String(200))
    tagline: Mapped[str | None] = mapped_column(String(300))
    pha_ky_html: Mapped[str | None] = mapped_column(Text)
    public_token: Mapped[str] = mapped_column(String(64))
    contact_name: Mapped[str | None] = mapped_column(String(200))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    contact_zalo: Mapped[str | None] = mapped_column(String(100))
    root_person_id: Mapped[int | None] = mapped_column(ForeignKey("persons.id", ondelete="SET NULL"))
    kinship_overrides: Mapped[dict] = mapped_column(JSONB, default=dict)
    tree_version: Mapped[int] = mapped_column(BigInteger, default=1)
    version: Mapped[int] = mapped_column(Integer, default=1)


class Admin(Timestamps, Base):
    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    full_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(255))
    totp_secret_enc: Mapped[str | None] = mapped_column(Text)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    totp_last_counter: Mapped[int] = mapped_column(BigInteger, default=0)
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AdminSession(Base):
    __tablename__ = "admin_sessions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))


class ChangeBatch(Base):
    """Một thao tác của admin (có thể gồm nhiều thay đổi) — đơn vị Hoàn tác / Thùng rác."""

    __tablename__ = "change_batches"
    __table_args__ = (Index("ix_batches_kind_created", "kind", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id: Mapped[int | None] = mapped_column(ForeignKey("admins.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(10))  # edit | delete | undo | restore | purge
    summary: Mapped[str] = mapped_column(Text)
    affected: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    undone_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_entity", "entity_type", "entity_id"),
        Index("ix_audit_created", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("change_batches.id", ondelete="CASCADE"), index=True)
    admin_id: Mapped[int | None] = mapped_column(ForeignKey("admins.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(20))  # create | update | delete | hard_delete
    entity_type: Mapped[str] = mapped_column(String(20))
    entity_id: Mapped[int] = mapped_column(BigInteger)
    label: Mapped[str | None] = mapped_column(String(300))
    before: Mapped[dict | None] = mapped_column(JSONB)
    after: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class VisitStat(Base):
    """Đếm lượt xem ẩn danh theo ngày (không lưu người được chọn)."""

    __tablename__ = "visit_stats"

    day: Mapped[date] = mapped_column(Date, primary_key=True)
    visits: Mapped[int] = mapped_column(Integer, default=0)
    visits_with_me: Mapped[int] = mapped_column(Integer, default=0)
