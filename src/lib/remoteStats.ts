import { STATS_ENDPOINT, STATS_FLUSH_MS, STATS_TOKEN, remoteStatsEnabled } from '../config';
import type { UsageEntry } from './stats';
import type { RecordKind } from './sheets';
import { jsonp } from './jsonp';

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
  phanHe?: string;
  module?: string;
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
    current.phanHe = event.phanHe || current.phanHe;
    current.module = event.module || current.module;
  } else {
    pending.set(event.key, { ...event });
  }
}

/** Xếp một lượt xem / lượt chép vào hàng đợi gửi lên server. */
export function queueUsage(
  entry: { key: string; kind: RecordKind; label: string; phanHe?: string; module?: string },
  field: 'views' | 'copies',
) {
  if (!remoteStatsEnabled()) return;
  merge({
    key: entry.key,
    kind: entry.kind,
    label: entry.label,
    phanHe: entry.phanHe,
    module: entry.module,
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
export type RemoteUsageResult = {
  entries: UsageEntry[];
  totalRows: number;
  totalViews: number;
  totalCopies: number;
  partial: boolean;
};
export type RemoteUsageOptions = {
  query?: string;
  sortKey?: string;
  descending?: boolean;
  limit?: number;
  offset?: number;
};

type RemoteListResponse = RemoteResponse & {
  totalRows?: number;
  totalViews?: number;
  totalCopies?: number;
  partial?: boolean;
};

let lastRemoteResult: RemoteUsageResult | null = null;

function normalizeResult(response: RemoteListResponse): RemoteUsageResult {
  const entries = response.entries || [];
  const fallbackTotals = entries.reduce(
    (sum, entry) => ({ views: sum.views + entry.views, copies: sum.copies + entry.copies }),
    { views: 0, copies: 0 },
  );
  return {
    entries,
    totalRows: Number(response.totalRows) || entries.length,
    totalViews: Number(response.totalViews) || fallbackTotals.views,
    totalCopies: Number(response.totalCopies) || fallbackTotals.copies,
    partial: Boolean(response.partial),
  };
}

async function requestRemote(params: Record<string, string>) {
  const response = await jsonp<RemoteResponse>(params);
  const result = normalizeResult(response);
  if (params.action === 'list') lastRemoteResult = result;
  return result;
}

/** Lấy bảng thống kê dùng chung của toàn bộ người dùng. */
export function getCachedRemoteUsage() {
  return lastRemoteResult;
}

export async function fetchRemoteUsage(options: RemoteUsageOptions = {}) {
  if (!remoteStatsEnabled()) return normalizeResult({});
  // Đẩy nốt hàng đợi trước để số liệu đọc về là mới nhất.
  void flushUsage();
  const params: Record<string, string> = { action: 'list' };
  const query = (options.query || '').trim();
  if (query) params.q = query;
  if (options.sortKey) params.sort = options.sortKey;
  if (options.descending !== undefined) params.dir = options.descending ? 'desc' : 'asc';
  if (options.limit) params.limit = String(options.limit);
  if (options.offset) params.offset = String(options.offset);
  return requestRemote(params);
}

/** Xóa một bản ghi thống kê dùng chung trên server. */
export async function deleteRemoteUsage(key: string) {
  if (!remoteStatsEnabled()) return [];
  pending.delete(key);
  const result = await requestRemote({ action: 'delete', token: STATS_TOKEN, key });
  return result.entries;
}

/** Xóa toàn bộ số liệu dùng chung trên server. */
export async function resetRemoteUsage() {
  if (!remoteStatsEnabled()) return;
  pending.clear();
  await requestRemote({ action: 'reset', token: STATS_TOKEN });
}
