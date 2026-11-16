from typing import Any


class AppError(Exception):
    """Lỗi nghiệp vụ trả về client dưới dạng {code, message, ...}."""

    def __init__(self, status: int, code: str, message: str, **extra: Any) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra

    def body(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, **self.extra}


def not_found(what: str = "Không tìm thấy dữ liệu") -> AppError:
    return AppError(404, "not_found", what)


def conflict(message: str = "Bản ghi đã bị người khác thay đổi. Vui lòng tải lại.") -> AppError:
    return AppError(409, "version_conflict", message)


def bad_request(message: str, code: str = "invalid") -> AppError:
    return AppError(400, code, message)
