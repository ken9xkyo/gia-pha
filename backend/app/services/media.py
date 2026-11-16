"""Ảnh chân dung (tự cắt vuông) và ảnh chèn trong văn bản, lưu dạng WebP."""

from __future__ import annotations

import io
import uuid
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import get_settings
from app.errors import bad_request

Image.MAX_IMAGE_PIXELS = 60_000_000
ALLOWED = {"JPEG", "PNG", "WEBP", "GIF", "MPO", "HEIF", "BMP"}


def media_root() -> Path:
    root = Path(get_settings().media_dir)
    (root / "p").mkdir(parents=True, exist_ok=True)
    (root / "u").mkdir(parents=True, exist_ok=True)
    return root


async def _read_image(file: UploadFile) -> Image.Image:
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise bad_request(f"Ảnh quá lớn (tối đa {get_settings().max_upload_mb} MB)")
    try:
        img = Image.open(io.BytesIO(data))
        if img.format not in ALLOWED:
            raise bad_request("Định dạng ảnh không được hỗ trợ")
        img = ImageOps.exif_transpose(img)
        img.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise bad_request("Tệp tải lên không phải ảnh hợp lệ") from exc
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
    return img


async def save_portrait(file: UploadFile) -> str:
    img = await _read_image(file)
    side = min(img.size)
    left = (img.width - side) // 2
    top = max(0, (img.height - side) // 3)  # ưu tiên phần trên (khuôn mặt)
    square = img.crop((left, top, left + side, top + side))
    key = uuid.uuid4().hex
    root = media_root() / "p"
    square.resize((512, 512), Image.Resampling.LANCZOS).save(root / f"{key}.webp", "WEBP", quality=84, method=6)
    square.resize((128, 128), Image.Resampling.LANCZOS).save(root / f"{key}_t.webp", "WEBP", quality=80, method=6)
    return key


async def save_content_image(file: UploadFile) -> str:
    img = await _read_image(file)
    if img.width > 1600:
        img = img.resize((1600, round(img.height * 1600 / img.width)), Image.Resampling.LANCZOS)
    key = uuid.uuid4().hex
    img.save(media_root() / "u" / f"{key}.webp", "WEBP", quality=84, method=6)
    return f"/media/u/{key}.webp"


def remove_portrait(key: str | None) -> None:
    if not key:
        return
    for name in (f"{key}.webp", f"{key}_t.webp"):
        (media_root() / "p" / name).unlink(missing_ok=True)
