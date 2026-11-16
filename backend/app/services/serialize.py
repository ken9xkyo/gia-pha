from typing import Any

from app.models import Person

PRIVATE_FLAGS = ("show_full_birth", "show_residence", "show_phone", "hide_ten_huy")
_EXCLUDE = {"deleted_at", "deleted_batch", "created_at", "updated_at"}


def photo_urls(key: str | None) -> dict[str, str | None]:
    if not key:
        return {"photo_url": None, "photo_thumb_url": None}
    return {"photo_url": f"/media/p/{key}.webp", "photo_thumb_url": f"/media/p/{key}_t.webp"}


def person_full(p: Person) -> dict[str, Any]:
    data = {c.key: getattr(p, c.key) for c in Person.__table__.columns if c.key not in _EXCLUDE}
    data.update(photo_urls(p.photo))
    data["updated_at"] = p.updated_at.isoformat() if p.updated_at else None
    return data


def person_public(p: Person) -> dict[str, Any]:
    """Ẩn các trường nhạy cảm với người xem (PRD mục 9)."""
    data = person_full(p)
    if p.hide_ten_huy:
        data["ten_huy"] = None
    if p.living_status != "deceased" and not p.show_full_birth:
        data["birth_month"] = None
        data["birth_day"] = None
        data["birth_time"] = None
    if not p.show_residence:
        data["residence"] = None
    if not p.show_phone:
        data["phone"] = None
    for key in (*PRIVATE_FLAGS, "version", "updated_at", "photo"):
        data.pop(key, None)
    return data
