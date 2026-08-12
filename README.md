# ASC-CONFIG v2.1.0

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
- Header dính khi cuộn, sắp xếp được theo cột, luôn hiển thị toàn bộ dòng (không phân trang).
- Nội dung các ô căn giữa theo chiều dọc, nên khi cột Mô tả dài thì Mã Config và các cột khác
  vẫn nằm ngang tầm chứ không bị dạt lên đầu dòng.
- Nút chuyển **Lưới ↔ Thẻ**. Màn hình từ 960px trở xuống mặc định dùng dạng thẻ vì lưới nhiều
  cột rất khó đọc trên điện thoại.
- Cuộn xuống sẽ hiện nút **lên đầu danh sách** ở góc dưới bên phải: hiện lên trong 0,5s, ngừng
  cuộn 2 giây thì mờ dần đi trong 1s. Nút hoạt động với cả vùng cuộn của bảng (máy tính) lẫn
  cuộn trang (điện thoại).
- Bấm một dòng để mở popup chi tiết, trình bày các trường chính theo loại bản ghi.
- Nút **Xuất CSV** xuất đúng phần đang lọc (ở tab Tất cả sẽ xuất hai file riêng cho hai loại).

## Bố cục màn hình

Toàn bộ phần điều khiển được ghim cố định trong **hai hàng**; **chỉ vùng dữ liệu là cuộn được**,
nên không còn cảnh vừa cuộn trang vừa cuộn lưới:

- Hàng 1: thương hiệu (bên trái) · tab Loại và nhóm nút đổi giao diện / thống kê / tải lại
  (dồn về bên phải)
- Hàng 2: ô tìm kiếm · Phân hệ · Module · nhóm nút hành động

Phía trên lưới không còn dòng đếm bản ghi — số lượng đã hiển thị ngay trên hai chip CONFIG và
Các lưu ý, nên bỏ đi để nhường thêm diện tích cho dữ liệu.

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

Dưới 960px bố cục tự trả về kiểu cuộn trang thông thường cho hợp với điện thoại: thương hiệu,
tab Loại và bảng trạng thái mỗi thứ một hàng; ô tìm kiếm và từng bộ lọc chiếm trọn bề ngang với
nhãn nằm phía trên; nhóm nút hành động dàn đều. `body` đặt `overflow-x: hidden` và `.app-shell`
dùng bề rộng 100% với padding riêng.

Điểm dễ sai khi chỉnh CSS về sau: phần tử flex/grid mặc định có `min-width: auto`, nghĩa là nó
sẽ phình theo nội dung dài nhất bên trong (mã config dài, giá trị không có khoảng trắng) và đẩy
tràn ra ngoài màn hình hẹp. Vì vậy các khung chứa đều đặt `min-width: 0`, lưới thẻ dùng
`minmax(min(340px, 100%), 1fr)` để cột co theo khung khi khung hẹp hơn 340px, và các khối chữ
đặt `overflow-wrap: anywhere`.

Bố cục đã được đo bằng trình duyệt thật ở các bề rộng 360 / 390 / 430 / 768 / 1024 / 1440px,
gồm cả lúc mở popup chi tiết, popup thống kê và bảng gợi ý của bộ lọc — không phần tử nào
vượt ra ngoài khung nhìn.

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

Các thao tác sau yêu cầu nhập mã PIN 6 số:

- Mở Google Sheet nguồn (link ở chân trang) — vì đây là nơi sửa được dữ liệu gốc
- Xuất CSV dữ liệu tra cứu
- Xuất CSV thống kê và xóa số liệu thống kê
- Thêm, sửa, xóa mục trong **Chức năng khác**

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

## Chức năng khác

Chip **Chức năng khác** nằm cạnh hai tab CONFIG / Các lưu ý trên thanh tiêu đề, kèm số lượng
mục đang có. Bấm vào mở danh sách các công cụ, biểu mẫu, trang nội bộ khác của đội — mỗi mục
gồm tên, mô tả ngắn, tên miền và một nút mở link ở bên phải.

Chữ trên nút do người thêm tự đặt (`Truy cập`, `Mở công cụ`, `Gửi phiếu`, `Thực hiện`…) để người
xem nhìn là biết bấm vào sẽ sang đâu và làm gì. Link luôn mở ở tab mới với `rel="noopener noreferrer"`.

Thêm / sửa / xóa đều đi qua cổng mã PIN quản trị. Ô **Thứ tự** quyết định vị trí hiển thị: số nhỏ
lên trước, cùng số thì xếp theo tên.

Link nhập thiếu `https://` sẽ được tự thêm vào. App chỉ nhận `http` và `https` — dán `javascript:`
hay `data:` sẽ bị từ chối ngay tại biểu mẫu.

### Lưu ở đâu

| Tình huống | Nơi lưu | Ai thấy |
| --- | --- | --- |
| Đã khai báo `STATS_ENDPOINT` | Sheet `ChucNang` qua Apps Script | Cả đội |
| Chưa khai báo | `localStorage` của trình duyệt | Riêng máy đang dùng |

Danh sách đọc được gần nhất luôn được cache lại ở `localStorage`, nên mở modal là thấy ngay kể cả
khi mạng chậm; app tải bản mới ở nền và có nút **Tải lại** để lấy thủ công.

Nếu bạn đã deploy Apps Script từ phiên bản trước thì cần **deploy lại** để có ba action mới
(`tools`, `toolSave`, `toolDelete`). Sheet `ChucNang` tự được tạo ở lần gọi đầu tiên.

## Bộ lọc

Danh mục của hai bộ lọc lấy từ sheet `Data` (Phân hệ ở cột J, Module ở cột M) và giữ đúng
thứ tự trong Sheet. Giá trị nào xuất hiện trong dữ liệu nhưng thiếu
ở danh mục vẫn được đưa xuống cuối danh sách để không bản ghi nào bị lọt khỏi bộ lọc.

Cả hai bộ lọc là **ô chọn có tìm kiếm**: bấm vào rồi gõ vài ký tự là danh sách lọc ngay, không
phải cuộn tìm bằng mắt. Ô tìm trong danh sách dùng chung thuật toán gần đúng với ô tìm kiếm
chính nên gõ không dấu, gõ dính liền, gõ tắt hay gõ sai vài ký tự đều ra đúng (`hoc vu`,
`nhaphoc`, `chamcong`, `tracng` → Trắc Nghiệm). Điều hướng được bằng phím mũi tên, Enter để chọn, Esc để đóng, và có nút ✕ để bỏ
lọc nhanh.

- **Phân hệ** — chỉ tồn tại ở sheet CONFIG, nên tự động vô hiệu hóa khi đang ở tab Các lưu ý.
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
- Xuất CSV, xóa từng bản ghi (có PIN) hoặc xóa toàn bộ số liệu

### Thống kê riêng máy hay dùng chung cả đội

Mặc định số liệu lưu ở `localStorage` (khóa `asc-config-usage-v1`) nên mỗi máy một con số riêng.

Khai báo `STATS_ENDPOINT` trong `src/config.ts` để bật chế độ **dùng chung**: mọi người dùng
cùng ghi vào sheet `ThongKe` thông qua một Google Apps Script Web App. Popup thống kê khi đó có
thêm công tắc **Toàn hệ thống / Của tôi**.

Hướng dẫn triển khai đầy đủ: [`apps-script/HUONG-DAN.md`](apps-script/HUONG-DAN.md)

Vài điểm về thiết kế:

- Sự kiện được gom vào hàng đợi rồi gửi theo lô mỗi 10 giây, cộng thêm một lần đẩy nốt bằng
  `sendBeacon` khi người dùng đóng tab. Không gửi từng cú click nên không làm chậm thao tác và
  tiết kiệm hạn mức Apps Script.
- Gửi hỏng thì hàng đợi được trả lại, không mất số đếm và cũng không hiện lỗi làm phiền.
- Xóa từng bản ghi ở phạm vi **Toàn hệ thống** dùng `?action=delete&key=...`, vì vậy sau khi cập nhật source cần deploy lại `apps-script/Code.gs`.
- Phía Apps Script bắt buộc dùng `LockService` bao quanh đoạn đọc-cộng-ghi, nếu không thì nhiều
  người bấm cùng lúc sẽ ghi đè lẫn nhau và mất số đếm.
- App vẫn ghi song song vào `localStorage`, nên mất mạng vẫn dùng được và số liệu hiện lên
  tức thì không phải chờ server.
- Bỏ trống `STATS_ENDPOINT` thì mọi thứ quay về như cũ, app không gọi mạng gì thêm.

## Thông báo thao tác

Mọi thao tác đều có toast phản hồi ở **góc phải phía trên** — ngay trong tầm mắt và không lẫn
với nút cuộn lên đầu ở góc dưới. Toast phân biệt theo màu: xanh lá khi thành công (sao chép,
xuất CSV), đỏ khi thất bại (trình duyệt chặn clipboard, không có dữ liệu để xuất), xanh dương
cho thông tin (Google Sheet vừa thay đổi, đã bỏ bộ lọc). Mỗi toast rộng tới 420px, có viền màu
dày bên trái, nền chuyển sắc nhẹ theo loại và đổ bóng nổi khối. Toast tự đóng và xếp chồng tối
đa 4 cái để không che mất dữ liệu.

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

### Chế độ "Nguyên cụm"

Nút **Nguyên cụm** nằm ngay trong ô tìm kiếm, **mặc định tắt**. Bật lên là kết quả lọc lại ngay
mà không cần bấm Tìm kiếm lần nữa.

| | Mặc định (tắt) | Nguyên cụm (bật) |
|---|---|---|
| Cách hiểu ô nhập | mỗi từ là một điều kiện riêng, khớp ở đâu trong bản ghi cũng được | cả ô nhập là **một cụm liền** |
| Gõ `tuyen sinh` | ra mọi bản ghi có cả `tuyển` lẫn `sinh`, kể cả khi hai từ nằm cách xa nhau (vd: *"quản lý **tuyển** dụng nhân **sinh** viên"*) | chỉ ra bản ghi chứa đúng cụm `tuyển sinh` |
| `Cấu hình tuyển sinh đầu vào` | ✅ | ✅ |
| `Quản lý tuyển dụng nhân sự` | ✅ | ❌ loại |
| `Danh sách sinh viên tốt nghiệp` | ❌ (thiếu *tuyển*) | ❌ loại |

Chế độ nguyên cụm vẫn "gần đúng" ở những mặt sau: bỏ dấu tiếng Việt, gõ dính liền
(`tuyensinh` ↔ `tuyển sinh`), thừa/thiếu khoảng trắng giữa các từ.

Riêng lỗi gõ sai ký tự thì chỉ được tha khi cụm đủ dài (từ 13 ký tự trở lên). Lý do: tiếng Việt
có quá nhiều từ chỉ khác nhau một ký tự — nếu tha cho cụm ngắn thì `sinh tuyen` sẽ khớp nhầm
`hinh tuyen`, đúng loại nhiễu mà chế độ này sinh ra để tránh.

Về kỹ thuật, phần khớp gần đúng dùng thuật toán Sellers (tìm đoạn con có khoảng cách chỉnh sửa
nhỏ nhất) và chỉ cho phép đoạn khớp bắt đầu tại đầu một từ, để cụm tìm kiếm không dính vào khúc
giữa của một từ khác. Quét 2000 bản ghi mất khoảng 6ms.

## Dữ liệu realtime

- Kiểm tra Google Sheet mỗi **15 giây**, và kiểm tra ngay khi bạn quay lại tab trình duyệt.
- Mỗi lần tải xong app so vân tay dữ liệu với lần trước.
  **Không có thay đổi thì không cập nhật gì cả** — không đụng state, không đổi mốc thời gian,
  không làm nháy màn hình.
- Khi Sheet có thêm/sửa/xóa: cập nhật ngay, ghi nhận mốc **Cập nhật cuối**, và hiện thông báo
  nói rõ bao nhiêu dòng mới, bao nhiêu dòng sửa, bao nhiêu dòng xóa.
- Realtime luôn bật, không có nút tắt. Chân trang hiển thị một dòng nhỏ: đèn trạng thái,
  nguồn dữ liệu và **Cập nhật lần cuối**; rê chuột vào đó xem được chu kỳ kiểm tra và giờ
  kiểm tra gần nhất. Nút tải lại thủ công nằm ở nhóm icon trên thanh tiêu đề.
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
  lib/remoteStats.ts          Đồng bộ thống kê lên Apps Script (hàng đợi, gửi lô, đọc JSONP)
  lib/jsonp.ts                Gọi Apps Script bằng JSONP, dùng chung cho thống kê và Chức năng khác
  lib/tools.ts                Danh sách Chức năng khác: đọc/ghi Apps Script, cache localStorage
  config.ts                   Khai báo endpoint và token dùng chung

apps-script/
  Code.gs                     Web App: thống kê (sheet ThongKe) và Chức năng khác (sheet ChucNang)
  HUONG-DAN.md                Hướng dẫn deploy từng bước
  components/ConfigGrid.tsx   Lưới sheet CONFIG
  components/NoteGrid.tsx     Lưới sheet Các lưu ý
  components/CardList.tsx     Chế độ xem thẻ cho cả hai loại
  components/DetailModal.tsx  Popup chi tiết
  components/StatsModal.tsx   Popup thống kê sử dụng
  components/ToolsModal.tsx   Popup Chức năng khác: danh sách, thêm/sửa/xóa qua cổng PIN
  components/SearchableSelect.tsx  Ô chọn có tìm kiếm cho Phân hệ / Module
  components/ScrollTopButton.tsx   Nút lên đầu danh sách
  components/Highlight.tsx    Tô sáng phần khớp từ khóa
  components/common.tsx       Badge Loại, header có sắp xếp
```

App gọi Google Sheet qua endpoint GViz bằng JSONP nên **không cần API key, không cần backend**.
