import { useCallback, useEffect, useState } from 'react';
import { STATS_TOKEN, sharedBackendEnabled } from '../config';
import { jsonp } from './jsonp';

/**
 * Danh sách "Chức năng khác": các công cụ / trang khác của đội được gắn link ngay trong app.
 *
 * Nơi lưu:
 *  - Đã khai báo STATS_ENDPOINT  → lưu ở sheet ChucNang qua Apps Script, cả đội thấy chung.
 *  - Chưa khai báo               → lưu ở localStorage, chỉ có trên máy hiện tại.
 *
 * Dù ở chế độ nào, bản đọc được gần nhất luôn được cache vào localStorage để mở modal là
 * thấy danh sách ngay, kể cả khi mạng chậm hoặc đang mất kết nối.
 */

export type ToolLink = {
  id: string;
  name: string;
  desc: string;
  url: string;
  /** Mật khẩu tùy chọn; nếu có thì người dùng phải nhập đúng mới mở được link. */
  password: string;
  /** Chữ trên nút, ví dụ "Truy cập", "Thực hiện", "Mở form". */
  buttonLabel: string;
  /** Số nhỏ hiện trước; cùng số thì xếp theo tên. */
  order: number;
  updatedAt: number;
};

export type ToolDraft = {
  id?: string;
  name: string;
  desc: string;
  url: string;
  password: string;
  buttonLabel: string;
  order: number;
};

export const TOOL_LIMITS = { name: 120, desc: 400, url: 900, password: 120, buttonLabel: 24 };
export const DEFAULT_BUTTON_LABEL = 'Truy cập';

const CACHE_KEY = 'asc-config-tools-v1';

let snapshot: ToolLink[] = [];
let hydrated = false;
let loadedOnce = false;
let inFlight: Promise<ToolLink[]> | null = null;
const listeners = new Set<() => void>();

/* ------------------------------------------------------------------ *
 * Tiện ích
 * ------------------------------------------------------------------ */

/**
 * Chuẩn hóa link người dùng nhập.
 * Thiếu scheme thì tự thêm https://. Chỉ chấp nhận http/https để tránh javascript: và data:.
 */
export function normalizeUrl(raw: string) {
  const text = raw.trim();
  if (!text) throw new Error('Chưa nhập link.');

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Link không hợp lệ.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Chỉ nhận link http hoặc https.');
  }
  return parsed.toString();
}

/** Tên miền rút gọn để hiện dưới mô tả. */
export function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function sortTools(list: ToolLink[]) {
  return [...list].sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }),
  );
}

function toTool(raw: Partial<ToolLink> & { id?: unknown }): ToolLink | null {
  const id = String(raw.id || '').trim();
  const name = String(raw.name || '').trim();
  const url = String(raw.url || '').trim();
  if (!id || !name || !url) return null;
  return {
    id,
    name: name.slice(0, TOOL_LIMITS.name),
    desc: String(raw.desc || '').trim().slice(0, TOOL_LIMITS.desc),
    url,
    password: String(raw.password || '').slice(0, TOOL_LIMITS.password),
    buttonLabel: String(raw.buttonLabel || '').trim().slice(0, TOOL_LIMITS.buttonLabel) || DEFAULT_BUTTON_LABEL,
    order: Number(raw.order) || 0,
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

function parseList(input: unknown): ToolLink[] {
  if (!Array.isArray(input)) return [];
  const list: ToolLink[] = [];
  for (const item of input) {
    const tool = toTool(item as Partial<ToolLink>);
    if (tool) list.push(tool);
  }
  return sortTools(list);
}

/* ------------------------------------------------------------------ *
 * Cache cục bộ
 * ------------------------------------------------------------------ */

function hydrate() {
  if (hydrated) return snapshot;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    snapshot = raw ? parseList(JSON.parse(raw)) : [];
  } catch {
    snapshot = [];
  }
  return snapshot;
}

function commit(list: ToolLink[]) {
  hydrated = true;
  snapshot = sortTools(list);
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Hết dung lượng hoặc trình duyệt chặn: bỏ qua, lần sau đọc lại từ server.
  }
  for (const listener of listeners) listener();
  return snapshot;
}

export function getTools() {
  return hydrate();
}

function makeId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* ------------------------------------------------------------------ *
 * Đọc / ghi
 * ------------------------------------------------------------------ */

/** Tải danh sách. Chế độ cục bộ thì chỉ đọc cache. */
export async function loadTools(force = false) {
  hydrate();
  if (!sharedBackendEnabled()) {
    loadedOnce = true;
    return snapshot;
  }
  if (!force && loadedOnce && !inFlight) return snapshot;
  if (inFlight) return inFlight;

  inFlight = jsonp<{ ok?: boolean; error?: string; tools?: unknown }>({ action: 'tools' })
    .then((payload) => {
      loadedOnce = true;
      return commit(parseList(payload.tools));
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Thêm mới hoặc cập nhật. Truyền `id` là sửa, không có `id` là thêm. */
export async function saveTool(draft: ToolDraft) {
  const url = normalizeUrl(draft.url);
  const name = draft.name.trim().slice(0, TOOL_LIMITS.name);
  if (!name) throw new Error('Chưa nhập tên chức năng.');

  const tool: ToolLink = {
    id: draft.id || makeId(),
    name,
    desc: draft.desc.trim().slice(0, TOOL_LIMITS.desc),
    url,
    password: draft.password.slice(0, TOOL_LIMITS.password),
    buttonLabel: draft.buttonLabel.trim().slice(0, TOOL_LIMITS.buttonLabel) || DEFAULT_BUTTON_LABEL,
    order: Number(draft.order) || 0,
    updatedAt: Date.now(),
  };

  if (!sharedBackendEnabled()) {
    const rest = hydrate().filter((item) => item.id !== tool.id);
    return commit([...rest, tool]);
  }

  const payload = await jsonp<{ ok?: boolean; error?: string; tools?: unknown }>({
    action: 'toolSave',
    token: STATS_TOKEN,
    id: tool.id,
    name: tool.name,
    desc: tool.desc,
    url: tool.url,
    password: tool.password,
    label: tool.buttonLabel,
    order: String(tool.order),
  });
  loadedOnce = true;
  return commit(parseList(payload.tools));
}

export async function removeTool(id: string) {
  if (!sharedBackendEnabled()) {
    return commit(hydrate().filter((item) => item.id !== id));
  }
  const payload = await jsonp<{ ok?: boolean; error?: string; tools?: unknown }>({
    action: 'toolDelete',
    token: STATS_TOKEN,
    id,
  });
  loadedOnce = true;
  return commit(parseList(payload.tools));
}

/* ------------------------------------------------------------------ *
 * Hook
 * ------------------------------------------------------------------ */

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Theo dõi danh sách chức năng.
 * Lần gọi đầu tiên trong phiên sẽ tự tải từ server; các lần sau dùng lại dữ liệu đã có.
 */
export function useTools() {
  const [tools, setTools] = useState<ToolLink[]>(() => getTools());
  const [loading, setLoading] = useState(() => sharedBackendEnabled() && !loadedOnce);
  const [error, setError] = useState('');

  useEffect(() => subscribe(() => setTools(getTools())), []);

  const reload = useCallback(async (force = true) => {
    if (!sharedBackendEnabled()) return;
    setLoading(true);
    setError('');
    try {
      await loadTools(force);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đọc được danh sách chức năng.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadedOnce || !sharedBackendEnabled()) {
      setLoading(false);
      return;
    }
    void reload(false);
  }, [reload]);

  return { tools, loading, error, reload, setError };
}
