from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

Gender = Literal["M", "F"]
LivingStatus = Literal["alive", "deceased", "unknown"]
UnionKind = Literal["chinh_that", "ke_that", "thu_that", "chong"]
UnionStatus = Literal["married", "widowed", "divorced"]
LinkKind = Literal["biological", "adopted", "step"]


def _strip(v: str | None) -> str | None:
    if v is None:
        return None
    v = " ".join(v.split()) if "\n" not in v else v.strip()
    return v or None


class PersonFields(BaseModel):
    """Các trường hồ sơ (PRD mục 5). Tất cả tùy chọn để dùng chung cho tạo mới và cập nhật."""

    model_config = ConfigDict(extra="forbid")

    full_name: str | None = Field(None, max_length=200)
    gender: Gender | None = None
    ten_huy: str | None = Field(None, max_length=200)
    ten_tu: str | None = Field(None, max_length=200)
    ten_hieu: str | None = Field(None, max_length=200)
    thuy_hieu: str | None = Field(None, max_length=200)
    birth_order: int | None = Field(None, ge=1, le=99)
    branch_label: str | None = Field(None, max_length=100)

    birth_year: int | None = Field(None, ge=1, le=2200)
    birth_month: int | None = Field(None, ge=1, le=12)
    birth_day: int | None = Field(None, ge=1, le=31)
    birth_calendar: Literal["solar", "lunar"] | None = None
    birth_lunar_leap: bool | None = None
    birth_approx: bool | None = None
    birth_time: str | None = Field(None, max_length=50)

    living_status: LivingStatus | None = None
    death_year: int | None = Field(None, ge=1, le=2200)
    death_month: int | None = Field(None, ge=1, le=12)
    death_day: int | None = Field(None, ge=1, le=31)
    death_approx: bool | None = None
    death_lunar_year: int | None = Field(None, ge=1, le=2200)
    death_lunar_month: int | None = Field(None, ge=1, le=12)
    death_lunar_day: int | None = Field(None, ge=1, le=30)
    death_lunar_leap: bool | None = None
    gio_lunar_month: int | None = Field(None, ge=1, le=12)
    gio_lunar_day: int | None = Field(None, ge=1, le=30)

    burial_place: str | None = Field(None, max_length=2000)
    burial_lat: float | None = Field(None, ge=-90, le=90)
    burial_lng: float | None = Field(None, ge=-180, le=180)
    reburial_info: str | None = Field(None, max_length=2000)
    hometown: str | None = Field(None, max_length=300)
    residence: str | None = Field(None, max_length=300)
    occupation: str | None = Field(None, max_length=200)
    phone: str | None = Field(None, max_length=50)
    biography: str | None = Field(None, max_length=200_000)

    show_full_birth: bool | None = None
    show_residence: bool | None = None
    show_phone: bool | None = None
    hide_ten_huy: bool | None = None

    @field_validator(
        "full_name", "ten_huy", "ten_tu", "ten_hieu", "thuy_hieu", "branch_label", "birth_time",
        "hometown", "residence", "occupation", "phone", mode="before",
    )
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return _strip(v) if isinstance(v, str) else v


class PersonCreate(PersonFields):
    full_name: str = Field(..., min_length=1, max_length=200)
    gender: Gender


class PersonPatch(PersonFields):
    version: int
    confirm_warnings: bool = False


class AddChildIn(BaseModel):
    person: PersonCreate
    union_id: int | None = None
    link_kind: LinkKind = "biological"
    confirm_warnings: bool = False


class AddSpouseIn(BaseModel):
    person: PersonCreate | None = None
    existing_person_id: int | None = None
    kind: UnionKind | None = None
    order_index: int | None = Field(None, ge=1, le=20)
    status: UnionStatus = "married"

    @model_validator(mode="after")
    def _one(self) -> AddSpouseIn:
        if (self.person is None) == (self.existing_person_id is None):
            raise ValueError("Cần nhập người mới hoặc chọn một người có sẵn")
        return self


class AddSiblingIn(BaseModel):
    person: PersonCreate
    confirm_warnings: bool = False


class AddParentsIn(BaseModel):
    father: PersonCreate | None = None
    mother: PersonCreate | None = None

    @model_validator(mode="after")
    def _any(self) -> AddParentsIn:
        if self.father is None and self.mother is None:
            raise ValueError("Cần nhập ít nhất cha hoặc mẹ")
        if self.father and self.father.gender != "M":
            raise ValueError("Cha phải là nam")
        if self.mother and self.mother.gender != "F":
            raise ValueError("Mẹ phải là nữ")
        return self


class UnionPatch(BaseModel):
    version: int
    kind: UnionKind | None = None
    order_index: int | None = Field(None, ge=1, le=20)
    status: UnionStatus | None = None


class LinkPatch(BaseModel):
    version: int
    kind: LinkKind | None = None
    union_id: int | None = None


class ReorderIn(BaseModel):
    child_ids: list[int] = Field(..., min_length=1, max_length=200)


class DeleteIn(BaseModel):
    mode: Literal["single", "branch", "inlaw"]
    confirm_name: str | None = None


class SettingsPatch(BaseModel):
    version: int
    clan_name: str | None = Field(None, min_length=1, max_length=200)
    tagline: str | None = Field(None, max_length=300)
    contact_name: str | None = Field(None, max_length=200)
    contact_phone: str | None = Field(None, max_length=50)
    contact_zalo: str | None = Field(None, max_length=100)


class PhaKyIn(BaseModel):
    version: int
    html: str = Field("", max_length=1_000_000)


class KinshipIn(BaseModel):
    version: int
    overrides: dict[str, dict[str, str]]


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=200)


class TotpIn(BaseModel):
    challenge: str
    code: str = Field(..., min_length=6, max_length=10)


class AdminCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=10, max_length=200)


class AdminPatch(BaseModel):
    is_active: bool | None = None
    full_name: str | None = Field(None, min_length=1, max_length=200)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=10, max_length=200)


class VisitIn(BaseModel):
    with_me: bool = False
