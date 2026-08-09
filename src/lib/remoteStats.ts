import { STATS_ENDPOINT, STATS_FLUSH_MS, STATS_TOKEN, remoteStatsEnabled } from '../config';
import type { UsageEntry } from './stats';
import type { RecordKind } from './sheets';

/**
 * Đồng bộ thống kê lên Google Apps Script để mọi người dùng chung một bảng số liệu.
 *
 * Nguyên tắc: không bao giờ chặn thao tác của người dùng. Sự kiện được gom vào hàng đợi
 * rồi gửi theo lô mỗi 10 giây (và khi rời trang). Gửi hỏng thì trả lại hàng đợi, không mất
 * số đếm và cũng không hiện lỗi làm phiền — thống kê không phải dữ liệu sống còn.
 */

type PendingEvent = {
  key: string;
  kind: RecordKind;
  label: string;
  views: number;
  copies: number;
};

const pending = new Map<string, PendingEvent>();
let flushTimer = 0;
let hooksInstalled = false;

export { remoteStatsEnabled };

function merge(event: PendingEvent) {
  const current = pending.get(event.key);
  if (current) {
    current.views += event.views;
    current.copies += event.copies;
    current.label = event.label || current.label;
  } else {
    pending.set(event.key, { ...event });
  }
}

/** Xếp một lượt xem / lượt chép vào hàng đợi gửi lên server. */
export function queueUsage(
  entry: { key: string; kind: RecordKind; label: string },
  field: 'views' | 'copies',
) {
  if (!remoteStatsEnabled()) return;
  merge({
    key: entry.key,
    kind: entry.kind,
    label: entry.label,
    views: field === 'views' ? 1 : 0,
    copies: field === 'copies' ? 1 : 0,
  });
  if (!flushTimer) {
    flushTimer = window.setTimeout(() => {
      flushTimer = 0;
      void flushUsage();
    }, STATS_FLUSH_MS);
  }
}

/** Gửi ngay toàn bộ hàng đợi. Trả về true nếu có gửi đi gói nào. */
export async function flushUsage() {
  if (!remoteStatsEnabled() || pending.size === 0) return false;

  const events = [...pending.values()];
  pending.clear();
  const body = JSON.stringify({ token: STATS_TOKEN, events });

  try {
    // sendBeacon sống sót được cả khi tab đang đóng, nên ưu tiên dùng.
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
      if (navigator.sendBeacon(STATS_ENDPOINT, blob)) return true;
    }
    await fetch(STATS_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
    });
    return true;
  } catch {
    // Trả lại hàng đợi để lần sau gửi tiếp.
    for (const event of events) merge(event);
    return false;
  }
}

/** Gửi nốt hàng đợi khi người dùng rời trang hoặc chuyển sang tab khác. */
export function installFlushHooks() {
  if (hooksInstalled || !remoteStatsEnabled()) return;
  hooksInstalled = true;

  const onLeave = () => void flushUsage();
  window.addEventListener('pagehide', onLeave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onLeave();
  });
}

/* ------------------------------------------------------------------ *
 * Đọc số liệu dùng chung (JSONP — Apps Script không đặt được header CORS)
 * ------------------------------------------------------------------ */

type RemoteResponse = { ok?: boolean; error?: string; entries?: UsageEntry[] };
type JsonpWindow = Window & Record<string, ((response: RemoteResponse) => void) | undefined>;

function jsonp(params: Record<string, string>, timeoutMs = 15000): Promise<UsageEntry[]> {
  return new Promise((resolve, reject) => {
    const callbackName = `ascStats_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    let timer = 0;

    const cleanup = () => {
      window.clearTimeout(timer);
      script.remove();
      delete (window as unknown as JsonpWindow)[callbackName];
    };

    (window as unknown as JsonpWindow)[callbackName] = (response) => {
      cleanup();
      if (response && response.ok) resolve(response.entries || []);
      else reject(new Error(response?.error || 'Máy chủ thống kê trả về lỗi.'));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Không kết nối được máy chủ thống kê. Kiểm tra lại URL Web App.'));
    };

    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Quá thời gian chờ máy chủ thống kê.'));
    }, timeoutMs);

    const query = new URLSearchParams({ ...params, callback: callbackName, _ts: String(Date.now()) });
    script.src = `${STATS_ENDPOINT}?${query.toString()}`;
    document.body.appendChild(script);
  });
}

/** Lấy bảng thống kê dùng chung của toàn bộ người dùng. */
export async function fetchRemoteUsage() {
  if (!remoteStatsEnabled()) return [];
  // Đẩy nốt hàng đợi trước để số liệu đọc về là mới nhất.
  await flushUsage();
  return jsonp({ action: 'list' });
}

/** Xóa toàn bộ số liệu dùng chung trên server. */
export async function resetRemoteUsage() {
  if (!remoteStatsEnabled()) return;
  pending.clear();
  await jsonp({ action: 'reset', token: STATS_TOKEN });
}
