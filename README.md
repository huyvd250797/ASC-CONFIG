# ASC-CONFIG v1.3.0

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

Vite cấu hình `base: './'` nên copy nguyên thư mục `dist/` lên bất kỳ web server nào
(IIS, nginx, thư mục con của site nội bộ) là chạy được, không cần chỉnh đường dẫn.

## Nguồn dữ liệu

`https://docs.google.com/spreadsheets/d/1Qd35CUqGEfqN0aCL6MVi6H5e7DKONnPwPwmHEK5BoTY`

Sheet đang dùng: `CONFIG`, `Các lưu ý` và `Data` (danh mục cho bộ lọc).
Google Sheet phải bật quyền **Anyone with the link can view**.

Đổi Spreadsheet ID hoặc tên tab: sửa `SPREADSHEET_ID` và mảng `SHEETS` trong `src/lib/sheets.ts`.

---

## Cách app đọc dữ liệu

Hai sheet dữ liệu có nhiều dòng tiêu đề gộp ô ở phía trên, nên app **không để GViz tự đoán
tiêu đề cột**. App gọi với `headers=0` (coi mọi dòng là dữ liệu) rồi dùng câu truy vấn GViz
lấy đúng cột theo vị trí và bỏ qua phần tiêu đề bằng `offset`:

| Sheet | Dòng dữ liệu đầu | Cột lấy về | Truy vấn |
|---|---|---|---|
| `CONFIG` | 6 | A: STT · B: Phân hệ · C: Mã Config · D: Module · E: Màn hình/Chức năng · F: Mô tả chức năng · G: Value | `select A,B,C,D,E,F,G offset 5` |
| `Các lưu ý` | 3 | A: STT · B: Module · C: Vấn đề/Màn hình · D: Chi tiết · E: Hướng xử lý | `select A,B,C,D,E offset 2` |
| `Data` | 1 | J: danh mục Phân hệ · M: danh mục Module | `select J,M` |

Dòng trống và dòng chỉ có mỗi số thứ tự sẽ bị bỏ qua.

Muốn đổi vị trí cột hoặc dòng bắt đầu: sửa `columns` / `firstDataRow` trong mảng `SHEETS`
và hằng `LOOKUP_SHEET` ở `src/lib/sheets.ts` — không cần đụng vào phần giao diện.

## Hai loại dữ liệu, hai giao diện riêng

Hai sheet có cấu trúc khác hẳn nhau (sheet Lưu ý không có Phân hệ, không có Mã Config lẫn
Value; Hướng xử lý thường là script SQL nhiều dòng), nên app **không ép chung một bảng**.
Mỗi loại có một lưới riêng, chuyển qua lại bằng thanh tab ở đầu trang:

- **Tab CONFIG** → `STT | Phân hệ | Mã Config | Module | Màn hình/Chức năng | Mô tả chức năng | Value`
- **Tab Các lưu ý** → `STT | Module | Vấn đề/Màn hình | Chi tiết | Hướng xử lý`
- **Tab Tất cả** → hai khu vực xếp chồng, mỗi khu vực dùng đúng lưới của nó, kèm nút
  *Xem tất cả N bản ghi*. Tìm kiếm và bộ lọc áp dụng cho cả hai.

Thanh tab đã phân biệt loại dữ liệu nên lưới không còn cột "Loại"; badge loại chỉ còn xuất
hiện trong popup chi tiết để giữ ngữ cảnh.

## Trình bày dữ liệu

- **Phân hệ** (CONFIG) và **Module** (Lưu ý) mỗi giá trị một màu riêng, tô ở chip và ở viền trái
  của dòng. Màu cấp theo thứ tự xuất hiện trong Sheet nên hai giá trị khác nhau chắc chắn khác màu
  (tới 16 giá trị mỗi nhóm) và một giá trị luôn giữ nguyên màu.
- **Mã Config** in đậm, font monospace, dùng tông sáng nhất trong dải màu của phân hệ đó nên nổi
  hơn hẳn các cột còn lại.
- **STT** hiển thị đúng **STT gốc** trong Sheet để đối chiếu ngược lại file nguồn.
- **Hướng xử lý** chứa script SQL được nhận diện tự động và render bằng khối code monospace,
  giữ nguyên xuống dòng và thụt lề. Trong popup chi tiết có nút **Chép script**.
- Ô trống hiển thị `—` thay vì để trắng.
- Header dính khi cuộn, sắp xếp được theo cột, phân trang 25/50/100/tất cả.
- Nút chuyển **Lưới ↔ Thẻ**; dạng thẻ tiện dùng trên điện thoại.
- Bấm một dòng để mở popup chi tiết: các trường chính được trình bày theo loại bản ghi, kèm
  mục *Toàn bộ cột từ Google Sheet* để xem đầy đủ dữ liệu gốc.
- Nút **Xuất CSV** xuất đúng phần đang lọc (ở tab Tất cả sẽ xuất hai file riêng cho hai loại).

## Bộ lọc

Danh mục của hai bộ lọc lấy từ sheet `Data` (Phân hệ ở cột J, Module ở cột M) và giữ đúng
thứ tự trong Sheet, kèm số bản ghi tương ứng. Giá trị nào xuất hiện trong dữ liệu nhưng thiếu
ở danh mục vẫn được đưa xuống cuối danh sách để không bản ghi nào bị lọt khỏi bộ lọc.

- **Phân hệ** — chỉ tồn tại ở sheet CONFIG, nên tự động vô hiệu hóa khi đang ở tab Các lưu ý.
  Ở tab Tất cả sẽ có dòng nhắc rằng bộ lọc này chỉ áp dụng cho CONFIG.
- **Module** — dùng chung cho cả hai sheet vì hai bên dùng chung từ vựng module.
  Danh sách Module lọc theo Phân hệ đang chọn.
- Nút **Xóa lọc** đưa mọi thứ về mặc định.

## Tìm kiếm gần đúng

Nhập nội dung rồi **nhấn Enter** hoặc bấm nút **Tìm kiếm** (không lọc theo từng ký tự gõ vào).
Thuật toán khớp theo các mức giảm dần:

1. Khớp chính xác cụm ký tự
2. Khớp ở đầu một từ
3. Khớp gần đúng theo khoảng cách Levenshtein — chịu được lỗi gõ và sai dấu
4. Quên khoảng trắng giữa hai từ (`cauhinh` → `cấu hình`)

Kết quả xếp theo độ liên quan, trọng số ưu tiên Mã Config / Vấn đề, rồi tới Module và Phân hệ.
Phần khớp được tô sáng. Bỏ dấu tiếng Việt vẫn tìm được dữ liệu có dấu.

Token từ 3 ký tự trở xuống bắt buộc khớp chính xác — tiếng Việt nhiều từ ngắn, nếu cho sai
1 ký tự thì `nho` sẽ khớp `cho`, `ban` khớp `bao`... khiến kết quả đầy nhiễu.

## Dữ liệu realtime

- Kiểm tra Google Sheet mỗi **15 giây**, và kiểm tra ngay khi bạn quay lại tab trình duyệt.
- Mỗi lần tải xong app so vân tay dữ liệu với lần trước.
  **Không có thay đổi thì không cập nhật gì cả** — không đụng state, không đổi mốc thời gian,
  không làm nháy màn hình.
- Khi Sheet có thêm/sửa/xóa: cập nhật ngay, ghi nhận mốc **Cập nhật cuối**, và hiện thông báo
  nói rõ bao nhiêu dòng mới, bao nhiêu dòng sửa, bao nhiêu dòng xóa.
- Thanh trên cùng hiển thị đèn trạng thái, giờ kiểm tra gần nhất, giờ cập nhật cuối,
  nút bật/tắt realtime và nút tải lại thủ công.
- Nếu một lần gọi bị lỗi mạng, app giữ nguyên dữ liệu đang hiển thị và chỉ báo lỗi,
  không xóa trắng bảng.

Đổi chu kỳ kiểm tra: sửa `POLL_INTERVAL_MS` trong `src/App.tsx`.

---

## Cấu trúc mã nguồn

```
src/
  App.tsx                     Màn hình chính: tab Loại, bộ lọc, tìm kiếm, vòng lặp realtime
  main.tsx                    Entry point
  styles.css                  Toàn bộ giao diện
  lib/sheets.ts               Đọc Google Sheet theo vị trí cột, đọc danh mục, so sánh thay đổi
  lib/text.ts                 Bỏ dấu, tokenize, thuật toán tìm gần đúng, tô sáng từ khóa
  lib/colors.ts               Cấp phát màu cho Phân hệ và Module
  components/ConfigGrid.tsx   Lưới sheet CONFIG
  components/NoteGrid.tsx     Lưới sheet Các lưu ý
  components/CardList.tsx     Chế độ xem thẻ cho cả hai loại
  components/DetailModal.tsx  Popup chi tiết
  components/Highlight.tsx    Tô sáng phần khớp từ khóa
  components/common.tsx       Badge Loại, header có sắp xếp
```

App gọi Google Sheet qua endpoint GViz bằng JSONP nên **không cần API key, không cần backend**.
