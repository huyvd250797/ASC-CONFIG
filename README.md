# ASC-CONFIG

Web app tra cứu config và các lưu ý vận hành từ Google Sheet.

## Chạy local

```bash
npm install
npm run dev
```

## Build production

```bash
npm run build
```

## Data source

App đang đọc Google Sheet:

`https://docs.google.com/spreadsheets/d/1Qd35CUqGEfqN0aCL6MVi6H5e7DKONnPwPwmHEK5BoTY/edit?usp=sharing`

Các sheet đang dùng:

- `CONFIG`
- `Các lưu ý`

Google Sheet cần bật quyền `Anyone with the link can view` để web app đọc được dữ liệu.
