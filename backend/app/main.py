import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.errors import AppError
from app.routers import admin_site, admin_tree, auth, lunar, public

logging.basicConfig(level=get_settings().log_level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(
    title="Gia phả API",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError):
    return JSONResponse(status_code=exc.status, content=exc.body())


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": f"http_{exc.status_code}", "message": str(exc.detail)},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    errors = exc.errors()
    first = errors[0] if errors else {}
    field = ".".join(str(x) for x in first.get("loc", [])[1:])
    msg = str(first.get("msg", "Dữ liệu không hợp lệ")).removeprefix("Value error, ")
    return JSONResponse(
        status_code=422,
        content={
            "code": "validation",
            "message": f"{msg}" + (f" ({field})" if field else ""),
            "errors": [{"loc": list(map(str, e.get("loc", []))), "msg": str(e.get("msg"))} for e in errors],
        },
    )


@app.get("/api/health")
async def health():
    return {"ok": True}


for r in (auth.router, public.router, admin_tree.router, admin_site.router, lunar.router):
    app.include_router(r)
