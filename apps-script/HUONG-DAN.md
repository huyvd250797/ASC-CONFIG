# Bật thống kê dùng chung cho cả đội

Mặc định thống kê lưu ở `localStorage` nên mỗi máy một con số riêng. Làm theo các bước dưới
đây để mọi người dùng cùng ghi vào một bảng chung nằm ngay trong spreadsheet ASC-CONFIG.

Toàn bộ chỉ mất khoảng 5 phút, không tốn phí, không cần thêm dịch vụ nào ngoài Google.

---

## Bước 1 — Tạo Apps Script

1. Mở Google Sheet **ASC-CONFIG**.
2. Menu **Tiện ích mở rộng → Apps Script** (Extensions → Apps Script).
3. Xóa hết nội dung file `Code.gs` đang có, dán toàn bộ nội dung file `apps-script/Code.gs`
   trong gói này vào.
4. Sửa dòng đầu cho an toàn:

   ```js
   var TOKEN = 'chuoi-bi-mat-cua-rieng-ban';
   ```

5. Bấm biểu tượng đĩa mềm để lưu.

Không cần tự tạo sheet `ThongKe` — script tự tạo kèm dòng tiêu đề ở lần ghi đầu tiên.

## Bước 2 — Deploy thành Web App

1. Góc phải trên bấm **Triển khai → Tùy chọn triển khai mới** (Deploy → New deployment).
2. Bấm bánh răng cạnh "Chọn loại", chọn **Ứng dụng web** (Web app).
3. Điền:
   - **Thực thi với tư cách** (Execute as): **Tôi** (Me)
   - **Ai có quyền truy cập** (Who has access): **Bất kỳ ai** (Anyone)
4. Bấm **Triển khai**, rồi **Cấp quyền** và chọn tài khoản của bạn.
5. Màn hình cảnh báo "Google chưa xác minh ứng dụng này" là bình thường với script tự viết:
   bấm **Nâng cao → Chuyển đến ... (không an toàn)** rồi **Cho phép**.
6. Sao chép **URL ứng dụng web**, dạng:

   ```
   https://script.google.com/macros/s/AKfycb..................../exec
   ```

> Chọn "Bất kỳ ai" là bắt buộc: trình duyệt của người dùng gọi thẳng vào URL này mà không
> đăng nhập Google. Bù lại, mọi thao tác ghi và xóa đều phải kèm `TOKEN` mới được chấp nhận.

## Bước 3 — Khai báo trong app

Mở `src/config.ts`, điền hai giá trị:

```ts
export const STATS_ENDPOINT = 'https://script.google.com/macros/s/AKfycb..../exec';
export const STATS_TOKEN = 'chuoi-bi-mat-cua-rieng-ban';   // trùng với TOKEN trong Code.gs
```

Build lại và deploy:

```bash
npm run build
```

Xong. Mở popup **Thống kê** sẽ thấy công tắc **Toàn hệ thống / Của tôi**.

---

## Cách hoạt động

```
Trình duyệt A ─┐
Trình duyệt B ─┼─→ Apps Script Web App ──→ Sheet "ThongKe"
Trình duyệt C ─┘      (LockService)
```

**Ghi.** App không gửi từng cú click. Sự kiện được gom vào hàng đợi trong bộ nhớ rồi đẩy đi
mỗi 10 giây, và đẩy nốt khi người dùng đóng tab hoặc chuyển sang tab khác (`sendBeacon`).
Cách này giảm mạnh số lượt gọi và không làm chậm thao tác. Gửi hỏng thì hàng đợi được trả lại
để lần sau gửi tiếp, không mất số đếm.

**Đọc.** Dùng JSONP, đúng kỹ thuật app đang dùng để đọc Google Sheet, vì Apps Script không đặt
được header CORS cho `fetch` thông thường.

**Chống mất số đếm.** Nhiều người bấm cùng lúc sẽ chạy nhiều bản `doPost` song song. Nếu
không khóa, các lần đọc-cộng-ghi sẽ đè lên nhau. `LockService.getScriptLock()` buộc chúng chạy
tuần tự — đây là phần bắt buộc, đừng bỏ khi chỉnh sửa script.

**Bảng `ThongKe`** có 6 cột: `Key`, `Loại`, `Nhãn`, `Lượt xem`, `Lượt chép`, `Lần cuối`.
Bạn có thể mở sheet này xem trực tiếp, hoặc dựng biểu đồ ngay trong Google Sheet.

## Những điểm cần biết trước khi dùng

**Hạn mức.** Tài khoản Google thường cho khoảng 20.000 lượt gọi Apps Script mỗi ngày. Vì app
gom nhóm 10 giây một lần nên một người dùng tích cực chỉ tốn vài chục lượt mỗi ngày — thoải mái
cho quy mô nội bộ.

**Mức độ bảo vệ.** Endpoint mở công khai, `TOKEN` nằm trong mã nguồn phía client nên người biết
kỹ thuật vẫn đọc được và có thể bơm số liệu giả hoặc xóa sạch. Giống mã PIN, đây là rào cản
chống nghịch phá chứ không phải bảo mật thật. Nếu cần chặt chẽ, phải chuyển sang backend có
xác thực thật (Supabase, hoặc một API nội bộ sau VPN công ty).

**Quyền riêng tư.** Hệ thống chỉ đếm ẩn danh: bản ghi nào được xem/chép bao nhiêu lần, không
ghi ai đã thao tác. Nếu sau này bạn muốn biết *ai* tra cứu cái gì thì phải thêm đăng nhập, và
nên nói rõ với anh em trong đội là hệ thống có ghi nhận.

**Sao lưu.** Sheet `ThongKe` là dữ liệu thật, nút Xóa trong popup thống kê sẽ xóa sạch và
không hoàn tác được. Nếu số liệu quan trọng, nên xuất CSV định kỳ.

## Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Popup báo "Không kết nối được máy chủ thống kê" | URL sai, hoặc chưa deploy lại sau khi sửa `Code.gs` |
| Đọc được nhưng số không tăng | `TOKEN` trong `config.ts` khác với trong `Code.gs` |
| Vẫn thấy số cũ | Số liệu gửi theo lô 10 giây — đợi chút hoặc bấm "Thử lại" |
| Sau khi sửa `Code.gs` không thấy đổi | Phải **Triển khai → Quản lý triển khai → sửa → Phiên bản mới**, không chỉ lưu file |

Muốn kiểm tra nhanh script có chạy không: trong trình soạn Apps Script chọn hàm `kiemTraNhanh`
rồi bấm **Chạy**, sau đó xem sheet `ThongKe` có dòng `TEST_KEY` chưa.
