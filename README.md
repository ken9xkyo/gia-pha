# Gia phả dòng họ

Web app quản lý cây gia phả của một dòng họ Việt Nam, theo file PRD trong thư mục này. Admin thêm, sửa, xóa thành viên ngay trên sơ đồ cây. Ai có đường link đều xem được cây, và có thể chọn "Tôi là ai" để biết mình gọi từng người là gì theo cách xưng hô miền Bắc.

## Kiến trúc

```
Trình duyệt ──HTTPS──▶ Caddy (web) ──▶ /api/*   → FastAPI (backend, 2 worker uvicorn)
                          │                         ├─ PostgreSQL 17 (db)
                          │                         └─ Redis (giới hạn tần suất, cache cây)
                          ├──▶ /media/* → ảnh WebP (volume media)
                          └──▶ /*       → SPA React (build tĩnh)
worker  : dọn Thùng rác quá 30 ngày, dọn phiên hết hạn
backup  : pg_dump + nén ảnh lúc 02:00 hằng ngày, giữ 30 bản
migrate : alembic upgrade + tạo cấu hình / admin đầu tiên (chạy một lần rồi thoát)
```

| Thành phần | Công nghệ | Lý do chọn |
| --- | --- | --- |
| API | FastAPI, SQLAlchemy 2 async + asyncpg, Pydantic v2, Alembic | Nhanh, có kiểu rõ ràng, migration có phiên bản |
| CSDL | PostgreSQL 17 | Partial unique index (một quan hệ "con ruột"), JSONB cho nhật ký |
| Bảo mật | Argon2id, TOTP bắt buộc (pyotp), session token lưu dạng băm trong cookie `HttpOnly; Secure; SameSite=Lax`, header chống CSRF, nh3 làm sạch HTML | PRD mục 9 |
| Giao diện | React 19 + TypeScript + Vite, Tailwind 4, TanStack Query, Zustand | Trang tĩnh, Caddy phục vụ trực tiếp |
| Vẽ cây | Canvas 2D tự viết, layout kiểu Reingold–Tilford tự viết | Chỉ vẽ nút trong khung nhìn và giảm chi tiết khi thu nhỏ → 60 fps với 5.000 người |
| Xưng hô | Thuật toán chạy trên trình duyệt, nhãn lấy từ bảng quy tắc admin sửa được | < 200 ms cho 5.000 người (có test) |
| Âm lịch | Thuật toán Hồ Ngọc Đức, múi giờ UTC+7 | Xử lý tháng nhuận; khớp lịch Việt Nam (VD: Tết 1985 là 21/1, khác lịch Trung Quốc) |
| Reverse proxy | Caddy 2 | Tự cấp HTTPS, nén zstd/gzip, HTTP/3 |

## Chạy nhanh

Yêu cầu: Docker 24+ với Docker Compose v2, `make`, `openssl`.

```bash
make init        # tạo .env, sinh SECRET_KEY / mật khẩu DB / mật khẩu admin đầu tiên
nano .env        # đặt DOMAIN, CLAN_NAME, INITIAL_ADMIN_EMAIL
make up          # build và chạy; cuối cùng in ra link công khai và link quản trị
make seed        # (tùy chọn) nạp dữ liệu mẫu để dùng thử
```

- Người xem mở `https://<DOMAIN>/t/<chuỗi-ngẫu-nhiên>` (lệnh `make link` in ra link này).
- Admin mở `https://<DOMAIN>/admin`. Lần đăng nhập đầu tiên phải quét mã QR để bật xác thực 2 bước.
- Khi chạy trên máy với `DOMAIN=localhost`, Caddy dùng chứng chỉ nội bộ nên trình duyệt sẽ cảnh báo. Bấm "Tiếp tục" để vào.

### Triển khai thật

1. Trỏ bản ghi DNS A/AAAA của tên miền về máy chủ, mở cổng 80 và 443 (TCP và UDP).
2. Trong `.env`: đặt `DOMAIN=giapha.ten-mien.vn` và `ACME_EMAIL=email-that@...`.
3. Chạy `make up`. Caddy tự lấy và gia hạn chứng chỉ Let's Encrypt.
4. Sao lưu thư mục volume `giapha_backups` ra ngoài máy chủ (rsync hoặc rclone) để phòng hỏng ổ đĩa.

## Lệnh vận hành

| Lệnh | Việc |
| --- | --- |
| `make link` | In link công khai và link quản trị |
| `make admin EMAIL=a@b.vn NAME="Họ tên"` | Tạo thêm admin (cũng làm được trong trang Tài khoản) |
| `docker compose exec backend python -m app.cli reset-2fa EMAIL` | Admin mất điện thoại: gỡ 2 bước để thiết lập lại |
| `docker compose exec backend python -m app.cli unlock EMAIL` | Mở khóa tài khoản bị khóa tạm |
| `make backup` | Sao lưu ngay |
| `make restore FILE=giapha-YYYYMMDD-HHMMSS.dump` | Khôi phục toàn bộ cây và ảnh về một bản sao lưu (tự sao lưu trạng thái hiện tại trước khi khôi phục) |
| `make logs` / `make ps` | Xem log / trạng thái |
| `make test` | Chạy toàn bộ kiểm thử |
| `make dev` | Môi trường phát triển (backend tự nạp lại code, Vite tại http://localhost:5173) |

## Đối chiếu với PRD

Đã làm toàn bộ yêu cầu **P0 và P1**. Riêng FR-46 (nhập Excel/GEDCOM) là P2, chưa làm.

| Nhóm | Yêu cầu | Nằm ở đâu |
| --- | --- | --- |
| Hiển thị cây | FR-01..11: hàng theo đời, vợ/chồng đứng cạnh nhau, con nối từ đúng cuộc hôn nhân, trưởng đứng bên trái, phân biệt huyết thống / dâu rể / dòng ngoại, phóng to và chụm ngón, thu gọn nhánh kèm số người ẩn, lọc theo chi và nội tộc, minimap, chế độ danh sách, URL riêng cho từng người | `frontend/src/lib/layout.ts`, `src/tree/*`, `src/pages/TreePage.tsx`, `ListPage.tsx` |
| Sửa trên cây | FR-20..28: menu trên nút, thêm nhanh và "Lưu và thêm tiếp", tự điền họ, sửa nhanh tên bằng nhấp đúp, kéo thả thứ tự, liên kết người có sẵn, cảnh báo năm sinh bất thường, chặn vòng lặp, Hoàn tác trong 10 giây, khóa lạc quan | `backend/app/services/persons.py`, `frontend/src/components/*` |
| Xóa | FR-30..34: một bước / cả nhánh (phải gõ lại tên) / dâu rể chuyển thành "không rõ tên", Thùng rác 30 ngày, không cho xóa thủy tổ | `services/graph.py#plan_delete`, `services/trash.py` |
| Tìm kiếm, hồ sơ | FR-40..47: tìm không dấu, hồ sơ có ẩn trường riêng tư, Phả ký có định dạng, ngày giỗ 60 ngày tới, xuất PDF/PNG/SVG/Excel, nhật ký trường cũ → mới | `routers/public.py`, `services/tree.py`, `services/export.py`, `tree/exportTree.ts` |
| Tôi là ai | FR-50..58: lưu localStorage, huy hiệu trên mọi nút, thẻ "gọi / xưng / mô tả", chiều "người này gọi tôi", so sánh 2 người, làm nổi đường nối, nhãn dự phòng "Bác hoặc Chú", bảng quy tắc sửa được, < 200 ms | `frontend/src/lib/kinship.ts`, `kinshipRules.ts` |
| Phi chức năng | noindex, link ngẫu nhiên đổi được, TOTP bắt buộc, khóa tạm sau 5 lần sai, phiên 7 ngày, giới hạn tần suất API, ẩn mặc định trường nhạy cảm của người còn sống, sao lưu 30 bản, âm lịch UTC+7, đếm lượt xem ẩn danh | `caddy/Caddyfile`, `routers/auth.py`, `ratelimit.py`, `backup/backup.sh` |

### Các giả định đã áp dụng (PRD mục 11)

- Web responsive, không làm app di động riêng. Cây tối đa khoảng 5.000 người.
- Anh trai của mẹ gọi **Bác**, chồng của cô/dì gọi **Chú**. Admin đổi được trong trang *Quy tắc xưng hô* (VD: thành "Cậu", "Dượng").
- Con nuôi và con riêng được xưng hô như con ruột.
- Ngày giỗ lấy theo ngày mất âm lịch, admin nhập đè được. Người mất vào tháng nhuận thì giỗ vào tháng thường cùng số; mất ngày 30 mà năm đó tháng thiếu thì giỗ ngày 29.
- Người chưa có tên trên cây (VD: dâu mới) chọn "tôi là vợ/chồng của…".
- Nhiều admin ngang quyền. Admin đầu tiên được tạo từ `.env`.
- Link công khai không có mật khẩu chung. Các trường nhạy cảm của người còn sống mặc định bị ẩn.
- Không có trường chữ Hán Nôm.

### Một số quyết định trong thuật toán xưng hô (cần dòng họ xác nhận)

- Vợ của An gọi **thím** (vợ của chú chồng) theo chồng, vì đây là người vai trên bên nhà chồng. Với người cùng vế hoặc vai dưới cách hai bước hôn nhân (VD: chồng của em gái vợ), hệ thống hiện nhãn chung "Họ hàng bên vợ/chồng" như PRD mô tả.
- Cháu của anh chị em (bàng hệ, g = −2) hiện "Cháu" thay vì "Cháu nội/ngoại". "Cháu nội/ngoại" chỉ dùng cho cháu trực hệ.
- Vợ khác của bố (không phải mẹ mình) hiện **Dì**, chồng khác của mẹ hiện **Bố dượng**. Cả hai đều sửa được trong bảng quy tắc.

## Kiểm thử

- `frontend`: 43 test (Vitest). Gồm đủ 6 ví dụ nghiệm thu ở PRD mục 8, các bảng 8.2 và 8.3, nhãn dự phòng, dâu chưa có trên cây, quy tắc tùy biến, hiệu năng xưng hô 5.000 người dưới 200 ms, layout không chồng lấn và bố trí 5.000 người dưới 500 ms.
- `backend`: 22 test (pytest). Gồm lịch âm (Tết, tháng nhuận, quy đổi hai chiều trong 80 năm, ngày 30), kế hoạch xóa, và kiểm thử tích hợp API trên PostgreSQL thật: đăng nhập + TOTP, khóa tạm, CSRF, ETag, ẩn trường riêng tư, cảnh báo, Hoàn tác, xóa nhánh, khôi phục, dâu rể, lùi gốc, xuất Excel.

```bash
make test
```

## Cấu trúc thư mục

```
backend/          FastAPI: app/{routers,services}, alembic/, tests/
frontend/         React: src/{lib (đồ thị, xưng hô, layout), tree (canvas), components, pages}
caddy/Caddyfile   reverse proxy + HTTPS + header bảo mật
backup/backup.sh  sao lưu hằng ngày
scripts/restore.sh khôi phục
```
