# ASC-CONFIG v1.8.1

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
| `CONFIG` | 6 | A: STT · B: Phân hệ · C: Mã Config · D: Module · E: Màn hình/Chức năng · F: Mô tả chức năng · G: Value | `select A,B,C,D,E,F,G` |
| `Các lưu ý` | 3 | A: STT · B: Module · C: Vấn đề/Màn hình · D: Chi tiết · E: Hướng xử lý | `select A,B,C,D,E` |
| `Data` | 1 | J: danh mục Phân hệ · M: danh mục Module | `select J,M` |

Dòng trống và dòng chỉ có mỗi số thứ tự sẽ bị bỏ qua.

**Về việc cắt phần tiêu đề.** Đếm số dòng là cách kém tin cậy: phần đầu sheet có dòng gộp ô,
dòng trống, và có thể bị thêm/bớt về sau; GViz thì dù đã yêu cầu `headers=0` vẫn có thể tự tách
vài dòng đầu ra làm tiêu đề và không đưa vào `rows`. Hai chuyện đó cộng lại từng làm mất dòng
dữ liệu đầu tiên.

App vì vậy **neo vào dòng tiêu đề thật**:

1. Đọc `table.parsedNumHeaders` để bù lại đúng số dòng GViz đã tách (dòng tiêu đề đầu vẫn còn
   nguyên nội dung trong nhãn cột nên khôi phục được).
2. Quét 40 dòng đầu, tìm dòng tiêu đề bằng nội dung: phải khớp ít nhất 3 từ khóa tiêu đề khác
   nhau *và* ít nhất 70% số ô có nội dung của dòng đó là nhãn tiêu đề. Điều kiện thứ hai để một
   dòng dữ liệu tình cờ chứa vài từ khóa không bị nhận nhầm.
3. Dữ liệu bắt đầu ngay sau dòng tiêu đề khớp cuối cùng (xử lý được tiêu đề nhiều tầng).

`firstDataRow` chỉ còn là phương án dự phòng khi không nhận ra dòng tiêu đề nào. Nhờ cách này,
thêm hay bớt dòng ở đầu sheet đều không làm lệch dữ liệu và không mất dòng nào.

Muốn đổi vị trí cột hoặc dòng bắt đầu: sửa `columns` / `firstDataRow` trong mảng `SHEETS`
và hằng `LOOKUP_SHEET` ở `src/lib/sheets.ts` — không cần đụng vào phần giao diện.

## Hai loại dữ liệu, hai giao diện riêng

Hai sheet có cấu trúc khác hẳn nhau (sheet Lưu ý không có Phân hệ, không có Mã Config lẫn
Value; Hướng xử lý thường là script SQL nhiều dòng), nên app **không ép chung một bảng**.
Mỗi loại có một lưới riêng, chuyển qua lại bằng thanh tab ở đầu trang:

- **Tab CONFIG** → `STT | Phân hệ | Mã Config | Module | Màn hình/Chức năng | Mô tả chức năng | Value`
- **Tab Các lưu ý** → `STT | Module | Vấn đề/Màn hình | Chi tiết | Hướng xử lý`

Mỗi tab hiển thị số bản ghi đang khớp với từ khóa và bộ lọc hiện tại.

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
- Header dính khi cuộn, sắp xếp được theo cột, phân trang. Mặc định hiển thị **tất cả dòng**;
  có thể đổi sang 25/50/100 dòng mỗi trang nếu máy yếu.
- Nút chuyển **Lưới ↔ Thẻ**; dạng thẻ tiện dùng trên điện thoại.
- Bấm một dòng để mở popup chi tiết, trình bày các trường chính theo loại bản ghi.
- Nút **Xuất CSV** xuất đúng phần đang lọc (ở tab Tất cả sẽ xuất hai file riêng cho hai loại).

## Bố cục màn hình

Toàn bộ phần điều khiển được ghim cố định trong **hai hàng**; **chỉ vùng dữ liệu là cuộn được**,
nên không còn cảnh vừa cuộn trang vừa cuộn lưới:

- Hàng 1: thương hiệu · tab Loại · bảng trạng thái realtime (làm mới, thống kê, bật/tắt
  realtime, tải lại)
- Hàng 2: ô tìm kiếm · Phân hệ · Module · Hiển thị · nhóm nút hành động

Ba nút hành động (xóa bộ lọc, đổi kiểu xem, xuất CSV) rút về dạng biểu tượng và dồn về mép
phải để cả hàng luôn nằm gọn trên một dòng, không bị rớt xuống dòng thứ hai. Mỗi nút đều có
tooltip mô tả đầy đủ chức năng.

Thanh cuộn được tùy biến mảnh và bo tròn (Firefox dùng `scrollbar-width`/`scrollbar-color`,
Chromium/Safari dùng `::-webkit-scrollbar`) cho hợp với nền tối.

Nhãn bộ lọc nằm cùng hàng với ô chọn, các ô co giãn theo bề rộng màn hình để luôn vừa một màn
hình và nhường tối đa diện tích cho lưới dữ liệu.

Chuỗi chiều cao `html → body → #root → .app-shell → .results → .grid-wrap` đều phải liền mạch
thì vùng lưới mới cuộn được. Nếu sau này chỉnh CSS, đừng bỏ `height: 100%` của `#root` —
thiếu nó thì `.app-shell` không nhận được chiều cao, `body` sẽ cắt cụt nội dung và lưới mất
khả năng cuộn.

Khi popup mở ra, nền bị khoá cuộn hoàn toàn — chỉ cuộn được bên trong popup.
Các vùng cuộn đều đặt `overscroll-behavior: contain` để cuộn hết nội dung không bị lan ra ngoài.

Dưới 960px bố cục tự trả về kiểu cuộn trang thông thường cho hợp với điện thoại.

## Nền tối / nền sáng

Bấm biểu tượng mặt trời/mặt trăng trên thanh tiêu đề để đổi giữa hai chế độ. **Mặc định là nền
tối**; lựa chọn được nhớ ở `localStorage` nên mở lại trang vẫn giữ nguyên.

Toàn bộ màu sắc đi qua một bộ biến CSS, `data-theme` trên thẻ `<html>` quyết định dùng bảng nào,
nên không có màu nào bị "cứng" ở một chế độ.

Màu của Phân hệ và Module chỉ được cấp **hue**; độ sáng thì tính riêng cho từng hue ở
`src/lib/colors.ts` bằng cách dò tới khi đạt ngưỡng tương phản WCAG AA trên nền tương ứng.
Lý do: cùng một độ sáng HSL nhưng mắt người thấy vàng sáng hơn xanh dương rất nhiều — để chung
một con số thì chip vàng và xanh lá sẽ chìm hẳn trên nền trắng. Cả 16 màu hiện đạt tỉ lệ tương
phản tối thiểu 4.8 ở nền tối và 4.8 ở nền sáng.

## Làm mới

**Bấm vào logo hoặc tên app** ở góc trên bên trái để đưa toàn bộ app về hiện trạng ban đầu:
xóa từ khóa, bỏ bộ lọc Phân hệ và Module, quay về tab CONFIG, kiểu xem lưới, sắp xếp theo STT
tăng dần, hiển thị tất cả dòng, về trang đầu, đóng popup, bật lại realtime, **đưa thanh cuộn
của bảng về trên cùng**, rồi tải lại dữ liệu từ Google Sheet.

Phân biệt với hai nút còn lại: nút mũi tên tròn trên thanh tiêu đề chỉ **tải lại dữ liệu** mà
giữ nguyên bộ lọc, còn nút biểu tượng phễu ở thanh lọc chỉ **xóa bộ lọc và từ khóa** mà không
đụng tới kiểu xem hay phân trang.

## Mã PIN quản trị

Ba thao tác sau yêu cầu nhập mã PIN 6 số:

- Mở Google Sheet nguồn (link ở chân trang) — vì đây là nơi sửa được dữ liệu gốc
- Xuất CSV dữ liệu tra cứu
- Xuất CSV thống kê và xóa số liệu thống kê

Mã PIN **không nằm trong source dưới dạng chữ rõ**. `src/lib/pin.tsx` chỉ chứa bản băm SHA-256
của (salt + mã PIN); nhập vào bao nhiêu cũng chỉ được so bằng giá trị băm. Hàm băm tự viết ở
`src/lib/sha256.ts` thay vì dùng `crypto.subtle`, vì API đó chỉ có trong ngữ cảnh bảo mật
(https/localhost) — bản build mở bằng `file://` hoặc http nội bộ sẽ không dùng được.

Đổi mã PIN: tính `SHA-256("asc-config-pin::v1" + mã_mới)` rồi thay vào hằng `PIN_HASH`.
Ví dụ trên Linux/macOS:

```bash
printf 'asc-config-pin::v1123456' | shasum -a 256
```

> **Về mức độ bảo vệ.** App chạy hoàn toàn phía trình duyệt nên mọi thứ đều nằm trong tay người
> dùng. Cổng PIN này đủ để chặn thao tác nhầm và người dùng thông thường, nhưng **không phải là
> biện pháp bảo mật thật**: người biết kỹ thuật vẫn có thể dò một mã PIN 6 số bằng cách thử hết
> 10⁶ khả năng trên bản băm, hoặc chỉnh sửa mã nguồn phía client. Muốn bảo vệ thật sự thì việc
> kiểm tra phải diễn ra ở phía máy chủ.

## Bộ lọc

Danh mục của hai bộ lọc lấy từ sheet `Data` (Phân hệ ở cột J, Module ở cột M) và giữ đúng
thứ tự trong Sheet. Giá trị nào xuất hiện trong dữ liệu nhưng thiếu
ở danh mục vẫn được đưa xuống cuối danh sách để không bản ghi nào bị lọt khỏi bộ lọc.

- **Phân hệ** — chỉ tồn tại ở sheet CONFIG, nên tự động vô hiệu hóa khi đang ở tab Các lưu ý.
  Ở tab Tất cả sẽ có dòng nhắc rằng bộ lọc này chỉ áp dụng cho CONFIG.
- **Module** — dùng chung cho cả hai sheet vì hai bên dùng chung từ vựng module.
  Danh sách Module lọc theo Phân hệ đang chọn.
- Nút **Xóa lọc** đưa mọi thứ về mặc định.

## Sao chép nhanh và thống kê sử dụng

**Bấm thẳng vào Mã Config** trong lưới (hoặc trong thẻ) là sao chép ngay mã đó, không cần mở
chi tiết. Phần khớp từ khóa vẫn được tô sáng mà mã config giữ nguyên mạch chữ — nút bấm dùng
`inline-block` chứ không dùng flex, vì với flex mỗi đoạn `<mark>` sẽ thành một flex item riêng
và mã config bị vỡ thành nhiều ô rời rạc. Popup chi tiết có thêm nút chép mã, chép Value và chép script.

Chức năng sao chép có đường lui bằng `execCommand` khi Clipboard API không dùng được — trường
hợp mở bản build qua `file://` hoặc http nội bộ.

Mỗi lần mở chi tiết một bản ghi được tính là **một lượt xem**, mỗi lần sao chép mã được tính là
**một lượt chép**. Bấm biểu tượng biểu đồ trên thanh tiêu đề để mở bảng **Thống kê sử dụng**:

- Xếp hạng bản ghi theo lượt chép, lượt xem, thời điểm gần nhất hoặc theo tên
  (badge loại và nhãn nằm ở hai cột riêng nên mã config dài bao nhiêu cũng xuống dòng gọn
  trong cột của nó, không đẩy layout)
- Tổng số bản ghi đã tra cứu, tổng lượt xem, tổng lượt chép
- Xuất CSV hoặc xóa toàn bộ số liệu

Số liệu lưu ở `localStorage` của trình duyệt (khóa `asc-config-usage-v1`) nên là thống kê riêng
của từng máy, không đồng bộ giữa người dùng. Muốn thống kê chung toàn công ty thì cần một
backend ghi nhận sự kiện — hiện app chạy hoàn toàn phía client, không có server.

## Thông báo thao tác

Mọi thao tác đều có toast phản hồi ở góc dưới bên phải, phân biệt theo màu: xanh lá khi thành
công (sao chép, xuất CSV), đỏ khi thất bại (trình duyệt chặn clipboard, không có dữ liệu để
xuất), xanh dương cho thông tin (Google Sheet vừa thay đổi, đã bỏ bộ lọc). Toast tự đóng và
xếp chồng tối đa 4 cái để không che mất dữ liệu.

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
  lib/colors.ts               Cấp hue cho Phân hệ / Module và tính độ sáng đạt tương phản
  lib/clipboard.ts            Sao chép có đường lui khi không có Clipboard API
  lib/stats.ts                Thống kê lượt xem / lượt chép, lưu ở localStorage
  lib/theme.ts                Chuyển nền tối / nền sáng, nhớ lựa chọn
  lib/pin.tsx                 Cổng xác thực mã PIN cho thao tác nhạy cảm
  lib/sha256.ts               SHA-256 tự viết, chạy được cả ngoài ngữ cảnh bảo mật
  lib/toast.tsx               Hệ thống thông báo dùng chung
  components/ConfigGrid.tsx   Lưới sheet CONFIG
  components/NoteGrid.tsx     Lưới sheet Các lưu ý
  components/CardList.tsx     Chế độ xem thẻ cho cả hai loại
  components/DetailModal.tsx  Popup chi tiết
  components/StatsModal.tsx   Popup thống kê sử dụng
  components/Highlight.tsx    Tô sáng phần khớp từ khóa
  components/common.tsx       Badge Loại, header có sắp xếp
```

App gọi Google Sheet qua endpoint GViz bằng JSONP nên **không cần API key, không cần backend**.
