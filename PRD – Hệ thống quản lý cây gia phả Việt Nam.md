# PRD – Hệ thống quản lý cây gia phả Việt Nam

Nov 15, 2026 · @Nguyễn Như Quang

## 1. Tổng quan

Sản phẩm là một web app quản lý cây gia phả của một dòng họ. Admin thêm, sửa, xóa thành viên ngay trên sơ đồ cây. Ai có đường link cũng xem được, và có thể chọn "Tôi là ai" để thấy mình gọi từng người là gì theo cách xưng hô miền Bắc.

**Vấn đề cần giải quyết**

- Gia phả giấy khó cập nhật, dễ ố vàng, thất lạc, và mỗi chi giữ một bản khác nhau.
- Con cháu đời sau, nhất là người ở xa quê, không nắm được vai vế. Gặp họ hàng không biết gọi là bác, chú, cô, cậu hay dì.
- Các phần mềm phổ biến (MyHeritage, Gramps, GenoPro) theo mô hình phương Tây, không có đời, chi, ngày giỗ âm lịch hay cách xưng hô kiểu Việt.

**Mục tiêu**

1. Số hóa toàn bộ phả hệ của dòng họ thành một cây duy nhất, luôn là bản mới nhất.
2. Admin chỉnh sửa trực tiếp trên cây (thêm con, thêm vợ/chồng, sửa, xóa) mà không phải rời màn hình cây.
3. Mọi người xem đều tra được cách gọi giữa mình và bất kỳ ai trong cây trong vòng 2 thao tác.

**Các quyết định đã chốt**

| Hạng mục | Quyết định |
| --- | --- |
| Quy mô | Một dòng họ, một cây gia phả, triển khai riêng |
| Phạm vi cây | Cả nội lẫn ngoại: ghi vợ/chồng và mở rộng cả nhánh con gái (cháu ngoại) |
| Cách xưng hô | Chỉ một bộ quy tắc miền Bắc |
| Truy cập người xem | Công khai, ai có link đều xem được, không cần đăng nhập |
| Lưu "Tôi là ai" | Lưu trên trình duyệt của người xem (localStorage) |
| Vai trò | Hai vai trò: Admin (thêm/sửa/xóa) và Người xem (xem, chọn mình là ai) |

**Giả định** (chưa được xác nhận, xem mục Câu hỏi mở): web responsive chạy trên máy tính và điện thoại; giao diện tiếng Việt.

## 2. Bối cảnh: đặc thù gia phả Việt Nam

Gia phả Việt khác cây gia đình phương Tây ở ba điểm: tính theo đời từ thủy tổ, phân chi theo con trưởng/thứ, và gắn chặt với thờ cúng, ngày giỗ âm lịch. Bảng dưới đối chiếu từng đặc thù với yêu cầu nó đặt ra cho sản phẩm.

| Đặc thù | Hệ quả cho sản phẩm |
| --- | --- |
| Gia phả gồm phả ký (tổ quán, vị tổ, quá trình hình thành dòng họ) và phả hệ (thành viên theo thứ bậc từ tổ đến con cháu hiện tại) ([Đại biểu Nhân dân](https://daibieunhandan.vn/giao-duc-dong-ho-bang-gia-pha-10186276.html)) | Có trang Phả ký dạng văn bản bên cạnh cây; cây luôn có một gốc là thủy tổ |
| Mỗi người ghi tên húy, tên tự, tên hiệu, ngày sinh (cả giờ sinh), con ai, con thứ mấy; người mất ghi ngày mất, thụy hiệu, nơi chôn cất, cải táng, ảnh chân dung ([Luật Minh Khuê](https://luatminhkhue.vn/gia-pha-la-gi-y-nghia-cua-gia-pha.aspx)) | Hồ sơ thành viên có nhiều loại tên và nhóm trường riêng cho người đã mất |
| Phả cũ ghi đủ chính thất, thứ thất, kế thất và mỗi bà sinh mấy con ([Luật Minh Khuê](https://luatminhkhue.vn/gia-pha-la-gi-y-nghia-cua-gia-pha.aspx)) | Một người có thể có nhiều cuộc hôn nhân; con gắn với một cuộc hôn nhân cụ thể |
| Con trưởng giữ quyền thờ cúng, các con sau là hàng thứ; đến đời thứ 5 thì phân ra chi khác ([Tạp chí VJOL](https://vjol.info.vn/otn/article/download/107049/90018)) | Lưu thứ tự anh chị em (trưởng, thứ hai…) và nhãn chi/phái; đời được tính tự động từ thủy tổ |
| Gia phả Việt có ghi cả phụ nữ và nhà ngoại: cha vợ, con rể, cháu ngoại ([Báo Pháp luật](https://baophapluat.vn/giu-gin-van-hoa-viet-goc-nhin-tu-gia-pha-post547927.html)) | Phù hợp quyết định ghi cả nội lẫn ngoại; cần đánh dấu ai là huyết thống, ai là dâu/rể |
| Gia phả được đọc cho con cháu vào mỗi dịp giỗ chạp ([Đại biểu Nhân dân](https://daibieunhandan.vn/van-hoa/Giao-duc-dong-ho-bang-gia-pha-i171829)) | Ngày giỗ nhập theo âm lịch, quy đổi sang dương lịch hằng năm |
| Miền Bắc gọi đời thứ 4 tính từ mình là Cụ, đời thứ 5 là Kỵ; miền Nam dùng cố, sơ ([Điện máy Chợ Lớn](https://dienmaycholon.com/kinh-nghiem-mua-sam/so-do-cach-xung-ho-trong-ho-hang)) | Bộ xưng hô miền Bắc dùng Ông/Bà, Cụ, Kỵ cho các đời trên |
| Miền Bắc thường chỉ gọi theo vai vế ("chú"), miền Nam thêm thứ tự ("chú Ba") ([VOH](https://voh.com.vn/thuong-thuc/so-do-cach-xung-ho-trong-ho-hang-575769.html)) | Không cần ghép số thứ tự vào danh xưng; hiển thị "Chú + tên" |

**Sản phẩm tham khảo:** [BeFam](https://phamhungptithcm.github.io/gia-pha/en/01-product/product-overview) (nền tảng gia phả mobile-first cho dòng họ Việt), [Gia phả Việt](https://apps.apple.com/id/app/id1635719475) (tự tổng hợp ngày giỗ, lễ, sinh nhật), [Việt Nam Gia Phả Offline Editor](https://www.sourceforge.net/p/vngp) (soạn Phả ký, Phả đồ, Thủy tổ, tìm người trên cây). Khác biệt của sản phẩm này là chỉnh sửa trực tiếp trên cây và tra cách xưng hô theo góc nhìn của người xem.

## 3. Vai trò và phân quyền

Hệ thống chỉ có hai vai trò. Người xem không cần tài khoản; Admin phải đăng nhập mới thấy các nút chỉnh sửa.

| Vai trò | Mô tả | Cách truy cập |
| --- | --- | --- |
| Người xem | Thành viên dòng họ hoặc bất kỳ ai được chia sẻ link | Mở link công khai, không đăng nhập |
| Admin | Người được dòng họ giao giữ gia phả (VD: tộc trưởng, người biên soạn) | Đăng nhập bằng email + mật khẩu tại đường dẫn quản trị |

**Ma trận quyền**

| Chức năng | Người xem | Admin |
| --- | --- | --- |
| Xem cây, phóng to/thu nhỏ, thu gọn nhánh | Có | Có |
| Xem hồ sơ chi tiết một thành viên | Có (trừ trường ẩn) | Có, kể cả trường ẩn |
| Tìm kiếm theo tên | Có | Có |
| Chọn "Tôi là ai" và xem cách xưng hô | Có | Có |
| Xem Phả ký, lịch ngày giỗ | Có | Có |
| Thêm thành viên (con, vợ/chồng, cha mẹ) | Không | Có |
| Sửa thông tin thành viên | Không | Có |
| Xóa thành viên / quan hệ | Không | Có |
| Sửa Phả ký, cấu hình dòng họ | Không | Có |
| Xem nhật ký thay đổi, khôi phục bản xóa | Không | Có |
| Xuất/nhập dữ liệu (Excel, GEDCOM) | Không | Có |
| Quản lý tài khoản admin khác | Không | Có |

Người xem muốn báo sai sót chỉ có thể liên hệ admin ngoài hệ thống (số điện thoại/Zalo hiển thị ở chân trang), vì không có vai trò đóng góp.

## 4. Phạm vi phiên bản 1

Phiên bản 1 tập trung vào ba thứ: cây chỉnh sửa được, hồ sơ thành viên, và tra cách xưng hô.

**Trong phạm vi**

- Sơ đồ cây gia phả tương tác, thêm/sửa/xóa ngay trên cây (mục 6).
- Hồ sơ thành viên theo chuẩn gia phả Việt: tên húy/tự/hiệu, đời, chi, thứ tự anh chị em, ngày sinh, ngày mất âm lịch, mộ phần, ảnh.
- Nhiều cuộc hôn nhân cho một người; con gắn đúng cha mẹ.
- Cả nội lẫn ngoại: mở rộng nhánh con gái.
- "Tôi là ai" + hiển thị cách gọi trên mọi nút, bộ quy tắc miền Bắc (mục 7, 8).
- Tìm kiếm theo tên, nhảy đến nút trên cây.
- Trang Phả ký và danh sách ngày giỗ sắp tới.
- Nhật ký thay đổi, xóa mềm có khôi phục, xuất Excel/PDF.

**Ngoài phạm vi (có thể làm sau)**

- Nhiều dòng họ trên một hệ thống.
- Bộ xưng hô miền Trung, miền Nam.
- Vai trò "đóng góp" cho người xem gửi đề xuất sửa.
- Thông báo ngày giỗ qua email/Zalo/push.
- Quản lý quỹ họ, sự kiện họp họ, bài viết tin tức.
- Ứng dụng di động native.

## 5. Mô hình dữ liệu

Cây được lưu dưới dạng đồ thị ba bảng chính: Thành viên, Hôn nhân, và Quan hệ cha mẹ – con. Con luôn gắn vào một cuộc hôn nhân, nhờ đó biết rõ con của bà chính thất hay bà kế thất.

**Thành viên (Person)**

| Trường | Bắt buộc | Ghi chú |
| --- | --- | --- |
| Họ tên thường gọi | Có | Hiển thị trên nút cây |
| Giới tính (Nam/Nữ) | Có | Cần cho thuật toán xưng hô |
| Tên húy, tên tự, tên hiệu, thụy hiệu | Không | Tên húy có thể ẩn với người xem |
| Thứ tự trong anh chị em (1 = trưởng) | Có khi có anh chị em | Quyết định bác/chú, anh/em họ; tự gợi ý theo ngày sinh, admin sửa được |
| Đời | Tự tính | Thủy tổ = đời 1; con = đời cha mẹ + 1; dâu/rể = đời của vợ/chồng |
| Chi / phái | Không | Nhãn admin gán cho một người, con cháu kế thừa |
| Ngày sinh | Không | Cho phép chỉ năm, hoặc "khoảng"; dương hoặc âm lịch; giờ sinh tuỳ chọn |
| Còn sống / đã mất | Có | Mặc định "không rõ" cho người đời cũ |
| Ngày mất (âm lịch) | Không | Dùng tính ngày giỗ hằng năm; xử lý tháng nhuận |
| Nơi an táng, cải táng | Không | Văn bản + toạ độ tuỳ chọn |
| Quê quán, nơi ở, nghề nghiệp, tiểu sử | Không | Tiểu sử dạng văn bản có định dạng |
| Ảnh chân dung | Không | 1 ảnh, tự cắt vuông |
| Cờ ẩn thông tin | Không | Ẩn ngày sinh, nơi ở, điện thoại với người xem |

**Hôn nhân (Union)**

| Trường | Ghi chú |
| --- | --- |
| Người A, Người B | Một trong hai có thể để trống ("vợ không rõ tên") |
| Loại | Chính thất, kế thất, thứ thất; hoặc chồng |
| Thứ tự | Vợ cả, vợ hai… hiển thị theo thứ tự trên cây |
| Tình trạng | Chung sống, góa, ly hôn |

**Quan hệ cha mẹ – con (ParentChild)**

| Trường | Ghi chú |
| --- | --- |
| Con | Một người có tối đa một quan hệ "ruột" |
| Hôn nhân cha mẹ | Trỏ tới Union |
| Loại | Ruột, nuôi, con riêng của vợ/chồng |

**Quy tắc toàn vẹn dữ liệu**

- Cây có đúng một thủy tổ (gốc); mọi người huyết thống phải nối được về gốc.
- Không tạo vòng lặp: một người không thể là tổ tiên của chính mình.
- Người ngoài huyết thống (dâu, rể) chỉ vào cây qua một cuộc hôn nhân.
- Hệ thống tự đánh dấu "dòng ngoại" cho hậu duệ mà đường về thủy tổ đi qua một người con gái.

## 6. Yêu cầu chức năng

Mọi thao tác của admin diễn ra trên màn hình cây: bấm vào một nút để mở menu thao tác, form sửa mở dạng ngăn kéo bên phải, cây vẫn hiển thị phía sau. Ưu tiên: P0 = bắt buộc cho bản ra mắt, P1 = nên có, P2 = có thể lùi.

### 6.1 Hiển thị cây

| ID | Yêu cầu | Ưu tiên |
| --- | --- | --- |
| FR-01 | Cây vẽ từ thủy tổ ở trên xuống, mỗi hàng ngang là một đời, nhãn "Đời 1, Đời 2…" cố định bên trái | P0 |
| FR-02 | Nút hiển thị: ảnh, tên thường gọi, năm sinh–năm mất; màu viền theo giới tính; biểu tượng riêng cho người đã mất | P0 |
| FR-03 | Vợ/chồng đứng cạnh nhau, nối bằng đường ngang; con nối từ đúng cuộc hôn nhân; nhiều vợ xếp theo thứ tự | P0 |
| FR-04 | Anh chị em xếp trái → phải theo thứ tự (trưởng ở trái) | P0 |
| FR-05 | Phân biệt trực quan: huyết thống (nền đậm), dâu/rể (nền nhạt), dòng ngoại (viền nét đứt) | P0 |
| FR-06 | Phóng to/thu nhỏ, kéo thả không gian, nút "vừa màn hình"; trên điện thoại dùng pinch-zoom | P0 |
| FR-07 | Thu gọn / mở rộng một nhánh; hiển thị số hậu duệ ẩn trong nhánh thu gọn | P0 |
| FR-08 | Lọc theo chi/phái; chế độ "chỉ xem nội tộc" ẩn các nhánh dòng ngoại | P1 |
| FR-09 | Bản đồ thu nhỏ (minimap) ở góc để định vị trên cây lớn | P1 |
| FR-10 | Chế độ xem thay thế: danh sách thụt lề theo đời (dễ dùng trên điện thoại) | P1 |
| FR-11 | Mỗi thành viên có URL riêng (mở link là cây tự cuộn tới nút đó) | P1 |

### 6.2 Thêm và sửa trên cây (Admin)

| ID | Yêu cầu | Ưu tiên |
| --- | --- | --- |
| FR-20 | Bấm nút → menu: Thêm con, Thêm vợ/chồng, Thêm anh/chị/em, Sửa, Xóa. Nút thủy tổ có thêm "Thêm cha/mẹ" để lùi gốc lên một đời | P0 |
| FR-21 | Thêm con: hỏi con của cuộc hôn nhân nào (khi có nhiều vợ/chồng), giới tính, tên, thứ tự; nút mới xuất hiện ngay vị trí đúng | P0 |
| FR-22 | Form thêm nhanh chỉ cần tên + giới tính; nút "Lưu và thêm tiếp" để nhập nhiều con liên tiếp | P0 |
| FR-23 | Sửa: ngăn kéo bên phải chứa đủ trường mục 5; nhấp đúp vào tên trên nút để sửa nhanh tên | P0 |
| FR-24 | Kéo thả để đổi thứ tự anh chị em trong cùng cha mẹ | P1 |
| FR-25 | Liên kết người đã có: khi thêm vợ/chồng, cho chọn một người sẵn trong cây (hôn nhân nội tộc xa, hoặc nhập trùng) | P1 |
| FR-26 | Kiểm tra hợp lệ khi lưu: chặn vòng lặp; cảnh báo con sinh trước cha mẹ, hoặc cha mẹ dưới 13 tuổi khi sinh con | P0 |
| FR-27 | Hoàn tác: mọi thao tác hiện thông báo "Đã lưu · Hoàn tác" trong 10 giây | P1 |
| FR-28 | Hai admin sửa cùng lúc: ghi đè bị chặn nếu bản ghi đã đổi kể từ lúc mở form; hiện thông báo tải lại | P1 |

### 6.3 Xóa (Admin)

| ID | Yêu cầu | Ưu tiên |
| --- | --- | --- |
| FR-30 | Xóa người không có con: xác nhận một bước; các hôn nhân của họ bị gỡ theo | P0 |
| FR-31 | Xóa người có hậu duệ: phải chọn "Xóa cả nhánh (N người)" và gõ lại tên để xác nhận; không cho để lại nhánh mồ côi | P0 |
| FR-32 | Xóa vợ/chồng có con chung: chuyển thành "không rõ tên" thay vì xóa hẳn để giữ liên kết con | P0 |
| FR-33 | Xóa là xóa mềm: vào Thùng rác 30 ngày, admin khôi phục nguyên nhánh | P0 |
| FR-34 | Không cho xóa thủy tổ khi cây còn người khác | P0 |

### 6.4 Tìm kiếm, hồ sơ, phả ký, ngày giỗ

| ID | Yêu cầu | Ưu tiên |
| --- | --- | --- |
| FR-40 | Tìm theo tên thường gọi/tên húy, không phân biệt dấu ("nguyen van an" tìm ra "Nguyễn Văn An"); kết quả hiện đời + tên cha để phân biệt người trùng tên | P0 |
| FR-41 | Chọn kết quả → cây cuộn tới và làm nổi nút | P0 |
| FR-42 | Trang hồ sơ: đủ thông tin, danh sách cha mẹ, vợ/chồng, con, anh chị em có link; trường bị ẩn không hiện với người xem | P0 |
| FR-43 | Trang Phả ký: văn bản có định dạng về tổ quán, thủy tổ, lịch sử dòng họ, tộc ước; có ảnh | P1 |
| FR-44 | Danh sách ngày giỗ sắp tới trong 60 ngày: ngày âm, ngày dương tương ứng năm nay, tên, đời | P1 |
| FR-45 | Xuất cây ra PDF/ảnh để in; xuất danh sách Excel | P1 |
| FR-46 | Nhập từ Excel theo mẫu và từ GEDCOM (định dạng chuẩn của MyHeritage, Gramps) | P2 |
| FR-47 | Nhật ký thay đổi: ai, lúc nào, sửa trường gì, giá trị cũ → mới | P0 |

## 7. Tính năng "Tôi là ai" và cách xưng hô

Người xem chọn một nút làm "tôi"; từ đó mỗi nút trên cây hiện thêm một nhãn cho biết tôi gọi người đó là gì, và tôi xưng là gì. Vì hệ thống công khai, lựa chọn này không được xác minh và chỉ lưu trên trình duyệt của người đó.

**Luồng sử dụng**

1. Lần đầu mở link: thanh thông báo "Bạn là ai trong dòng họ?" kèm ô tìm tên. Có thể bỏ qua để xem cây bình thường.
2. Gõ tên → chọn đúng người (kết quả hiện đời, tên cha mẹ để phân biệt người trùng tên). Hoặc bấm thẳng vào nút trên cây → "Đây là tôi".
3. Cây cuộn tới nút "tôi", làm nổi nút và đường huyết thống từ tôi lên thủy tổ.
4. Mọi nút hiện huy hiệu cách gọi phía trên tên, VD: **Bác** · Nguyễn Văn Hùng.
5. Bấm một nút → thẻ chi tiết: "Bạn gọi: Bác Hùng · Bạn xưng: cháu · Quan hệ: anh trai của bố bạn".
6. Thanh trên cùng luôn có chip "Bạn: Nguyễn Văn An · Đổi · Bỏ chọn".

**Yêu cầu**

| ID | Yêu cầu | Ưu tiên |
| --- | --- | --- |
| FR-50 | Chọn "tôi" bằng tìm kiếm hoặc bấm nút; lưu vào localStorage, giữ qua các lần mở lại | P0 |
| FR-51 | Huy hiệu cách gọi trên mọi nút đang hiển thị; tắt/bật được | P0 |
| FR-52 | Thẻ chi tiết hiện 3 thông tin: gọi, xưng, mô tả quan hệ bằng lời ("em gái của ông nội bạn") | P0 |
| FR-53 | Chuyển góc nhìn "Người này gọi tôi là gì" | P1 |
| FR-54 | Chế độ "So sánh 2 người": chọn A và B bất kỳ để xem A gọi B là gì, không cần đổi "tôi" | P1 |
| FR-55 | Làm nổi đường nối từ tôi đến người được chọn qua tổ tiên chung | P1 |
| FR-56 | Khi thiếu dữ liệu (thiếu giới tính, thiếu thứ tự anh chị em) thì hiện nhãn dự phòng, VD "Bác hoặc Chú", kèm ghi chú "chưa rõ thứ bậc" | P0 |
| FR-57 | Nhãn do một bảng quy tắc dữ liệu sinh ra (mục 8); admin sửa được nhãn theo tập quán riêng của họ mà không cần sửa code | P1 |
| FR-58 | Tính xưng hô chạy trên trình duyệt, dưới 200 ms cho cây 5.000 người | P0 |

## 8. Quy tắc xưng hô miền Bắc và thuật toán

Cách gọi được suy ra từ bốn yếu tố: chênh lệch đời, bên nội hay ngoại, ngành trên hay ngành dưới, và giới tính. Ở miền Bắc, vế trên/dưới giữa họ hàng xét theo ngành (con nhà bác là anh chị dù ít tuổi hơn), không theo tuổi thật.

### 8.1 Thuật toán

Ký hiệu: E = tôi, T = người được xem.

1. **Tìm đường nối.** Duyệt đồ thị tìm tổ tiên chung gần nhất A của E và T. Nếu không có (T là dâu/rể, hoặc E là dâu/rể), đi qua tối đa một bước hôn nhân ở mỗi đầu (bước 6).
2. **Tính chênh lệch đời.** dᴇ = số đời từ A xuống E, dᴛ = số đời từ A xuống T, g = dᴇ − dᴛ (g > 0: T ở vế trên).
3. **Xác định bên.** Bước đầu tiên đi lên từ E qua bố → bên nội; qua mẹ → bên ngoại.
4. **Xác định ngành.** Giữa hai người con của A nằm trên đường tới E và tới T, ai có thứ tự nhỏ hơn thì nhánh đó là ngành trên. Thiếu thứ tự → so ngày sinh → vẫn thiếu thì dùng nhãn dự phòng (FR-56).
5. **Tra bảng 8.2** theo (g, trực hệ hay bàng hệ, bên, ngành, giới tính T). Thêm hậu tố "họ" khi dᴇ và dᴛ đều ≥ 2 và người đó không phải anh chị em ruột của bố/mẹ (VD: "anh họ", "chú họ").
6. **Qua hôn nhân.** Nếu T là vợ/chồng của một người huyết thống R: lấy nhãn của R rồi đổi theo bảng 8.3. Nếu E là dâu/rể: E gọi theo vợ/chồng mình (vợ/chồng gọi gì thì E gọi nấy), riêng cha mẹ vợ/chồng gọi là Bố/Mẹ, anh chị em của vợ/chồng hiện mô tả "anh chồng", "em vợ"… Hai bước hôn nhân trở lên (VD: chồng của em gái vợ tôi) → nhãn chung "Họ hàng bên vợ/chồng".
7. **Xưng.** Từ tôi xưng với T = nhãn ngắn khi chạy lại thuật toán theo chiều T → E (T gọi tôi là "cháu" thì tôi xưng "cháu").

### 8.2 Bảng nhãn theo huyết thống

| g | Quan hệ | T là nam | T là nữ |
| --- | --- | --- | --- |
| +4 | Tổ tiên đời thứ 5 tính từ tôi (trực hệ hoặc bàng hệ) | Kỵ ông | Kỵ bà |
| +3 | Cha mẹ của ông bà, và anh chị em của họ | Cụ ông | Cụ bà |
| +2 | Ông bà trực hệ | Ông nội / Ông ngoại | Bà nội / Bà ngoại |
| +2 | Anh chị em của ông bà (và họ hàng cùng vế) | Ông (ông bác / ông chú) | Bà (bà bác / bà cô / bà dì) |
| +1 | Cha mẹ | Bố | Mẹ |
| +1 | Bên nội, ngành trên bố | Bác | Bác |
| +1 | Bên nội, ngành dưới bố | Chú | Cô |
| +1 | Bên ngoại, ngành trên mẹ | Bác | Bác |
| +1 | Bên ngoại, ngành dưới mẹ | Cậu | Dì |
| 0 | Anh chị em ruột, ngành trên (sinh trước tôi) | Anh | Chị |
| 0 | Anh chị em ruột, ngành dưới | Em trai | Em gái |
| 0 | Anh chị em họ, ngành trên | Anh họ | Chị họ |
| 0 | Anh chị em họ, ngành dưới | Em họ | Em họ |
| −1 | Con | Con trai | Con gái |
| −1 | Con của anh chị em (ruột hoặc họ) | Cháu | Cháu |
| −2 | Cháu (trực hệ hoặc bàng hệ) | Cháu nội / ngoại | Cháu nội / ngoại |
| −3 | Đời dưới cháu | Chắt | Chắt |
| −4 | Đời dưới chắt | Chút | Chút |
| −5 | Đời dưới chút | Chít | Chít |

Với |g| ≥ 5 về phía trên, hiển thị "Tổ (cách N đời)". Với cháu dòng ngoại (con của con gái), nhãn g = −2 là "Cháu ngoại".

### 8.3 Bảng đổi nhãn cho vợ/chồng của người huyết thống

| Nhãn của R | Vợ của R gọi là | Chồng của R gọi là |
| --- | --- | --- |
| Bác | Bác (bác gái) | Bác (bác trai) |
| Chú | Thím | — |
| Cô | — | Chú (chồng cô) |
| Cậu | Mợ | — |
| Dì | — | Chú (chồng dì) |
| Anh / Anh họ | Chị (chị dâu) | — |
| Chị / Chị họ | — | Anh (anh rể) |
| Em trai / Em họ (nam) | Em (em dâu) | — |
| Em gái / Em họ (nữ) | — | Em (em rể) |
| Con trai / Con gái | Con dâu | Con rể |
| Cháu | Cháu dâu | Cháu rể |
| Ông, Bà, Cụ, Kỵ | Theo giới tính cùng vế | Theo giới tính cùng vế |

**Ví dụ kiểm thử** (dùng làm test case nghiệm thu)

| Tôi | Người được xem | Kết quả mong đợi |
| --- | --- | --- |
| An (con thứ hai của ông Bình) | Hùng, em trai ông Bình | Gọi Chú, xưng cháu |
| An | Vợ của Hùng | Gọi Thím, xưng cháu |
| An | Lan, con của anh trai ông Bình, kém An 5 tuổi | Gọi Chị họ, xưng em (ngành trên thắng tuổi) |
| An | Em gái của mẹ An | Gọi Dì, xưng cháu |
| An | Bố của ông nội An | Gọi Cụ ông, xưng chắt |
| Vợ của An | Hùng | Gọi Chú (theo chồng), xưng cháu |

Tập quán trong miền Bắc vẫn khác nhau giữa các gia đình (VD: anh trai mẹ gọi "bác" hay "cậu", chồng của dì gọi "chú" hay "dượng"). Vì vậy các bảng 8.2 và 8.3 là dữ liệu cấu hình mà admin sửa được (FR-57).

## 9. Yêu cầu phi chức năng

Rủi ro lớn nhất của mô hình công khai là lộ thông tin cá nhân của người còn sống, nên mặc định là ẩn và admin chủ động mở. [Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15](https://thitruongtaichinhtiente.vn/nhung-diem-chinh-can-luu-y-tai-luat-bao-ve-du-lieu-ca-nhan-chinh-thuc-co-hieu-luc-tu-ngay-1-1-2026-75881.html) có hiệu lực từ 1/1/2026 và trao cho công dân quyền được biết, đồng ý, chỉnh sửa và yêu cầu xóa dữ liệu. Dòng họ nên hỏi ý kiến luật sư trước khi công khai thông tin người còn sống.

| Nhóm | Yêu cầu |
| --- | --- |
| Quyền riêng tư | Người còn sống: mặc định ẩn ngày sinh đầy đủ (chỉ hiện năm), nơi ở, số điện thoại; admin bật từng trường |
| Quyền riêng tư | Thẻ `noindex` mặc định để công cụ tìm kiếm không lập chỉ mục; link công khai có chuỗi ngẫu nhiên, admin đổi được khi bị lộ |
| Quyền riêng tư | Không thu thập dữ liệu người xem; "Tôi là ai" chỉ nằm trên máy họ, không gửi về máy chủ |
| Quyền riêng tư | Quy trình xử lý yêu cầu ẩn/xóa thông tin của một thành viên (qua liên hệ admin) |
| Bảo mật admin | Đăng nhập email + mật khẩu, bắt buộc xác thực 2 bước (TOTP); khóa tạm sau 5 lần sai; phiên hết hạn sau 7 ngày |
| Bảo mật | HTTPS; API ghi chỉ nhận token admin; giới hạn tần suất gọi API công khai chống cào dữ liệu |
| Hiệu năng | Cây 5.000 người tải lần đầu < 3 giây trên 4G; thu phóng, kéo mượt 60 khung hình/giây (vẽ bằng canvas hoặc chỉ vẽ nút trong khung nhìn) |
| Hiệu năng | Thêm/sửa một nút hiển thị kết quả trên cây < 1 giây |
| Thiết bị | Web responsive: Chrome, Safari, Edge, Firefox 2 phiên bản gần nhất; màn hình từ 360 px; admin sửa được trên điện thoại |
| Khả năng dùng | Cỡ chữ mặc định tối thiểu 16 px, tương phản cao; người lớn tuổi là người dùng chính |
| Dữ liệu | Sao lưu tự động hằng ngày, giữ 30 bản; khôi phục toàn bộ cây về một ngày bất kỳ |
| Dữ liệu | Lịch âm tính theo múi giờ Việt Nam (UTC+7), xử lý tháng nhuận |
| Địa phương hóa | Tiếng Việt đầy đủ dấu; sắp xếp và tìm kiếm theo bảng chữ cái tiếng Việt |

## 10. Chỉ số thành công và lộ trình

Sản phẩm thành công khi dữ liệu đủ để xưng hô đúng và con cháu thật sự dùng "Tôi là ai". Các mục tiêu dưới đây là đề xuất, cần dòng họ chốt lại.

| Chỉ số | Mục tiêu đề xuất | Cách đo |
| --- | --- | --- |
| Độ đủ dữ liệu: thành viên có giới tính và thứ tự anh chị em | ≥ 95% | Thống kê trong trang admin |
| Độ chính xác xưng hô | 100% bộ test case mục 8; 0 lỗi sai được báo trong 3 tháng đầu | Kiểm thử tự động; admin ghi nhận phản hồi |
| Tỷ lệ lượt truy cập có chọn "Tôi là ai" | ≥ 40% | Đếm ẩn danh, không lưu người được chọn |
| Thời gian admin thêm một người | < 30 giây | Thử nghiệm với admin thật |

&#91;embedded content: lộ trình · 3 giai đoạn, 2 cổng\]

Giai đoạn 1 gồm toàn bộ yêu cầu P0; giai đoạn 2 là P1; giai đoạn 3 là P2 và các mục đang nằm ngoài phạm vi.

## 11. Câu hỏi mở cần chốt

Các câu dưới đây ảnh hưởng trực tiếp tới thiết kế; trong ngoặc là giả định đang dùng trong tài liệu này.

- [ ] Chỉ cần web responsive, hay cần app di động riêng? (Web responsive)
- [ ] Cây dự kiến bao nhiêu người và bao nhiêu đời? Quyết định cách vẽ cây. (Tối đa 5.000 người)
- [ ] Dữ liệu hiện có ở dạng nào: sổ giấy, Excel hay phần mềm khác? Nếu đã có file, nhập dữ liệu nên lên giai đoạn 1. (Nhập tay)
- [ ] Bên ngoại: anh trai của mẹ gọi "bác" hay "cậu"; chồng của cô/dì gọi "chú" hay "dượng"? (Bác; chú)
- [ ] Con nuôi và con riêng của vợ/chồng có được xưng hô như con ruột không? (Có)
- [ ] Ngày giỗ tính theo ngày mất âm lịch, hay admin nhập riêng ngày giỗ (VD: giỗ họ, giỗ tổ chung)? (Theo ngày mất, cho phép nhập đè)
- [ ] Người xem chưa có trong cây (VD: dâu mới) thì chọn "Tôi là ai" thế nào? (Chọn vợ/chồng mình rồi đánh dấu "tôi là vợ/chồng của…")
- [ ] Có nhiều admin không, và ai cấp tài khoản admin đầu tiên? (Nhiều admin ngang quyền)
- [ ] Dòng họ đã đồng ý công khai thông tin người còn sống chưa? Nếu chưa, có nên thêm mật khẩu chung cho link? (Công khai, ẩn trường nhạy cảm)
- [ ] Cần trường tên chữ Hán Nôm cho các đời cũ không? (Không)
- [ ] Hosting, tên miền và ngân sách vận hành hằng tháng? (Chưa xác định)
