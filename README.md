# ASC-CONFIG v1.1.0

Web app tra cứu **Config** và **Các lưu ý** vận hành, đọc dữ liệu trực tiếp từ Google Sheet.

## Chạy local

```bash
npm install
npm run dev
```

## Build production

```bash
npm run build      # kết quả nằm trong thư mục dist/
npm run preview
```

Vite được cấu hình `base: './'` nên có thể copy nguyên thư mục `dist/` lên bất kỳ web server
(IIS, nginx, hoặc thư mục con của site nội bộ) mà không cần chỉnh đường dẫn.

## Nguồn dữ liệu

`https://docs.google.com/spreadsheets/d/1Qd35CUqGEfqN0aCL6MVi6H5e7DKONnPwPwmHEK5BoTY`

Sheet đang dùng: `CONFIG` và `Các lưu ý`.
Google Sheet phải bật quyền **Anyone with the link can view** thì app mới đọc được.

Đổi Spreadsheet ID hoặc thêm sheet: sửa hằng `SPREADSHEET_ID` và mảng `SHEETS` trong
`src/lib/sheets.ts`.

---

## Có gì mới ở v1.1.0

### 1. Giao diện lưới theo từng record

Bảng dữ liệu gồm 8 cột: `STT | Nhãn | Phân hệ | Mã Config | Module | Màn hình/Chức năng | Mô tả chức năng | Value`

- **Nhãn** phân biệt bản ghi đến từ sheet `CONFIG` hay `Các lưu ý` bằng badge màu riêng.
- **Phân hệ** mỗi giá trị được cấp một màu riêng, tô ở chip, viền trái của dòng và nền khi hover.
  Màu được cấp theo thứ tự phân hệ xuất hiện trong Sheet nên hai phân hệ khác nhau chắc chắn
  khác màu (tới 16 phân hệ) và một phân hệ luôn giữ nguyên màu.
- **Mã Config** in đậm, font monospace, dùng tông sáng nhất trong dải màu của phân hệ đó nên
  nổi hơn hẳn các cột còn lại.
- Header dính khi cuộn, sort được theo STT / Nhãn / Phân hệ / Mã Config / Module / Màn hình,
  phân trang 25–50–100 hoặc xem tất cả.
- Nút chuyển **Lưới ↔ Thẻ**; dạng thẻ tiện xem trên màn hình nhỏ.
- Bấm vào một dòng để mở popup chi tiết hiển thị **đầy đủ mọi cột gốc** của Sheet, kèm nút chép
  nhanh giá trị Value.
- Dải thống kê tổng quan và hàng chip đếm bản ghi theo từng phân hệ — bấm chip để lọc nhanh.
- Nút **Xuất CSV** cho đúng phần dữ liệu đang được lọc (có BOM, mở bằng Excel không lỗi font).

> App tự dò tiêu đề cột thật của Sheet để map vào 8 cột trên, nên đổi tên cột trong Sheet
> (ví dụ `Mô tả` ↔ `Mô tả chức năng`, `Value` ↔ `Giá trị`) vẫn nhận đúng.

### 2. Bộ lọc

Ba bộ lọc: **Nhãn**, **Phân hệ**, **Module**. Mỗi lựa chọn kèm số lượng bản ghi.
Danh sách Module lọc theo Phân hệ đang chọn; nếu đổi Phân hệ làm Module hiện tại không còn
hợp lệ thì Module tự reset. Nút **Xóa lọc** đưa mọi thứ về mặc định.

### 3. Tìm kiếm gần đúng

Nhập nội dung rồi **nhấn Enter** hoặc bấm nút **Tìm kiếm** (gõ tới đâu lọc tới đó đã bị bỏ,
đúng theo yêu cầu). Thuật toán khớp theo 4 mức giảm dần:

1. Khớp chính xác cụm ký tự
2. Khớp ở đầu một từ
3. Khớp gần đúng theo khoảng cách Levenshtein (chịu được lỗi gõ, sai dấu, thiếu ký tự)
4. Khớp dãy con theo thứ tự (`cauhinh` → `cấu hình`)

Kết quả xếp theo độ liên quan, có trọng số ưu tiên Mã Config và Màn hình/Chức năng.
Phần khớp được tô sáng trong bảng. Bỏ dấu tiếng Việt vẫn tìm được dữ liệu có dấu.

Ví dụ: `gưi mai` → ra `gửi mail`; `tai sam` → ra `tài sản`.

### 4. Dữ liệu realtime

- App kiểm tra Google Sheet mỗi **15 giây**, và kiểm tra ngay khi bạn quay lại tab trình duyệt.
- Mỗi lần tải xong, app so vân tay dữ liệu với lần trước.
  **Không có thay đổi thì không cập nhật gì cả** — không đụng vào state, không đổi mốc thời gian,
  không làm nháy màn hình.
- Khi Sheet có thêm/sửa/xóa, app cập nhật ngay, ghi nhận mốc **Cập nhật cuối**, và hiện thông báo
  nói rõ *bao nhiêu dòng mới, bao nhiêu dòng sửa, bao nhiêu dòng xóa*.
- Thanh trên cùng hiển thị đèn trạng thái realtime, giờ kiểm tra gần nhất, giờ cập nhật cuối,
  nút bật/tắt realtime và nút tải lại thủ công.
- Nếu một lần gọi bị lỗi mạng, app giữ nguyên dữ liệu cũ đang hiển thị và chỉ báo lỗi,
  không xóa trắng bảng.

Đổi chu kỳ kiểm tra: sửa `POLL_INTERVAL_MS` trong `src/App.tsx`.

---

## Cấu trúc mã nguồn

```
src/
  App.tsx                     Màn hình chính: state, bộ lọc, tìm kiếm, vòng lặp realtime
  main.tsx                    Entry point
  styles.css                  Toàn bộ giao diện
  lib/text.ts                 Bỏ dấu, tokenize, thuật toán tìm gần đúng, tô sáng từ khóa
  lib/sheets.ts               Đọc Google Sheet (JSONP), dò tiêu đề cột, so sánh thay đổi
  lib/colors.ts               Cấp phát màu cho từng phân hệ
  components/DataGrid.tsx     Bảng dữ liệu
  components/CardList.tsx     Chế độ xem thẻ
  components/DetailModal.tsx  Popup chi tiết bản ghi
  components/Highlight.tsx    Tô sáng phần khớp từ khóa
```

App gọi Google Sheet qua endpoint GViz bằng JSONP nên **không cần API key, không cần backend**,
chỉ cần Sheet ở chế độ ai có link cũng xem được.
