import { useEffect, useState } from 'react';
import type { AppRecord, RecordKind } from './sheets';
import { queueUsage } from './remoteStats';

/**
 * Thống kê mức độ sử dụng từng bản ghi.
 *
 * Ghi ở hai nơi:
 *  - localStorage của máy hiện tại: hiện ngay lập tức, dùng được cả khi mất mạng.
 *  - Máy chủ Apps Script (nếu đã cấu hình STATS_ENDPOINT): số liệu dùng chung của cả đội.
 */

const STORAGE_KEY = 'asc-config-usage-v1';

export type UsageEntry = {
  key: string;
  kind: RecordKind;
  /** Mã Config hoặc tiêu đề vấn đề, hiển thị trong bảng thống kê */
  label: string;
  /** Số lần mở xem chi tiết */
  views: number;
  /** Số lần sao chép mã */
  copies: number;
  /** Thời điểm thao tác gần nhất (epoch ms) */
  lastAt: number;
};

type UsageMap = Record<string, UsageEntry>;

let cache: UsageMap | null = null;
let snapshot: UsageEntry[] = [];
const listeners = new Set<() => void>();

function read(): UsageMap {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as UsageMap) : {};
  } catch {
    cache = {};
  }
  snapshot = Object.values(cache);
  return cache;
}

function commit(map: UsageMap) {
  cache = map;
  snapshot = Object.values(map);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Hết dung lượng hoặc trình duyệt chặn: bỏ qua, thống kê không phải dữ liệu sống còn.
  }
  for (const listener of listeners) listener();
}

function labelOf(record: AppRecord) {
  return record.kind === 'config' ? record.maConfig || `STT ${record.stt}` : record.vanDe || `STT ${record.stt}`;
}

function bump(record: AppRecord, field: 'views' | 'copies') {
  const map = { ...read() };
  const current = map[record.key] || {
    key: record.key,
    kind: record.kind,
    label: labelOf(record),
    views: 0,
    copies: 0,
    lastAt: 0,
  };
  map[record.key] = {
    ...current,
    label: labelOf(record),
    kind: record.kind,
    [field]: current[field] + 1,
    lastAt: Date.now(),
  };
  commit(map);
  queueUsage({ key: record.key, kind: record.kind, label: labelOf(record) }, field);
}

/** Ghi nhận một lần mở xem chi tiết bản ghi. */
export function trackView(record: AppRecord) {
  bump(record, 'views');
}

/** Ghi nhận một lần sao chép mã của bản ghi. */
export function trackCopy(record: AppRecord) {
  bump(record, 'copies');
}

export function getUsage() {
  read();
  return snapshot;
}

export function getUsageFor(key: string): UsageEntry | undefined {
  return read()[key];
}

export function resetUsage() {
  commit({});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Theo dõi bảng thống kê, tự cập nhật khi có thao tác mới. */
export function useUsage() {
  const [entries, setEntries] = useState<UsageEntry[]>(() => getUsage());
  useEffect(() => subscribe(() => setEntries(getUsage())), []);
  return entries;
}
