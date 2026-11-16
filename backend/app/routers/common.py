from fastapi import Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SiteConfig
from app.services.tree import build_tree, tree_stamp


async def tree_response(request: Request, db: AsyncSession, cfg: SiteConfig, admin: bool) -> Response:
    """Trả cây kèm ETag theo phiên bản cây: không đổi thì trả 304, không tốn băng thông."""
    etag = f'W/"{"a" if admin else "p"}-{tree_stamp(cfg)}"'
    headers = {"ETag": etag, "Cache-Control": "private, no-cache"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    payload = await build_tree(db, cfg, admin)
    return Response(content=payload, media_type="application/json", headers=headers)
