import { STATS_ENDPOINT } from '../config';

/**
 * Gọi Apps Script Web App bằng JSONP.
 *
 * Apps Script không đặt được header CORS cho fetch thông thường, nên mọi lời gọi cần đọc
 * kết quả trả về đều đi qua thẻ <script>. Cả phần thống kê lẫn danh sách "Chức năng khác"
 * dùng chung một endpoint nên gom helper này ra riêng để hai nơi khỏi viết lại.
 *
 * Lưu ý: dữ liệu gửi lên nằm trong query string, vì vậy chỉ dùng cho gói nhỏ (vài KB).
 */

export type JsonpResponse = { ok?: boolean; error?: string };

type JsonpWindow = Window & Record<string, ((response: unknown) => void) | undefined>;

let counter = 0;

export function jsonp<T extends JsonpResponse>(
  params: Record<string, string>,
  timeoutMs = 15000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!STATS_ENDPOINT.trim()) {
      reject(new Error('Chưa khai báo STATS_ENDPOINT trong src/config.ts.'));
      return;
    }

    counter += 1;
    const callbackName = `ascJsonp_${Date.now()}_${counter}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    let timer = 0;

    const cleanup = () => {
      window.clearTimeout(timer);
      script.remove();
      delete (window as unknown as JsonpWindow)[callbackName];
    };

    (window as unknown as JsonpWindow)[callbackName] = (response) => {
      cleanup();
      const payload = (response || {}) as T;
      if (payload.ok) resolve(payload);
      else reject(new Error(payload.error || 'Máy chủ trả về lỗi.'));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Không kết nối được máy chủ. Kiểm tra lại URL Web App trong src/config.ts.'));
    };

    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Quá thời gian chờ máy chủ.'));
    }, timeoutMs);

    const query = new URLSearchParams({ ...params, callback: callbackName, _ts: String(Date.now()) });
    script.src = `${STATS_ENDPOINT}?${query.toString()}`;
    document.body.appendChild(script);
  });
}
