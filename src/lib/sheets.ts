/**
 * Đọc dữ liệu từ Google Sheet qua GViz JSONP.
 *
 * Hai sheet có cấu trúc KHÁC NHAU nên được mô hình hóa thành hai loại bản ghi riêng:
 *  - CONFIG : STT gốc | Phân hệ | Mã Config | MODULE | Màn hình/Chức năng | Mô tả Chức năng | Value
 *  - LƯU Ý  : STT | MODULE | Vấn đề/màn hình | Chi tiết | Hướng xử lý
 */
import { normalizeText, type FieldMatch } from './text';

export const SPREADSHEET_ID = '1Qd35CUqGEfqN0aCL6MVi6H5e7DKONnPwPwmHEK5BoTY';

/** Loại bản ghi — cũng chính là giá trị cột "Loại" trên lưới. */
export type RecordKind = 'config' | 'note';

export const SHEETS = [
  {
    kind: 'config',
    /** Tên tab trong Google Sheet */
    name: 'CONFIG',
    label: 'CONFIG',
    title: 'CONFIG',
    description: 'Cấu hình hệ thống theo từng phân hệ',
  },
  {
    kind: 'note',
    name: 'Các lưu ý',
    label: 'LƯU Ý',
    title: 'Các lưu ý',
    description: 'Case vận hành thường gặp và hướng xử lý',
  },
] as const satisfies ReadonlyArray<{
  kind: RecordKind;
  name: string;
  label: string;
  title: string;
  description: string;
}>;

export type SheetDefinition = (typeof SHEETS)[number];

type GoogleCell = { v?: unknown; f?: string };
type GoogleColumn = { id?: string; label?: string; type?: string };
type GoogleRow = { c?: Array<GoogleCell | null> };
type GoogleResponse = {
  status?: string;
  errors?: Array<{ detailed_message?: string; message?: string; reason?: string }>;
  table?: { cols?: GoogleColumn[]; rows?: GoogleRow[] };
};
type JsonpWindow = Window & Record<string, ((response: GoogleResponse) => void) | undefined>;

type BaseRecord = {
  id: string;
  kind: RecordKind;
  kindLabel: string;
  /** STT gốc lấy từ Sheet, giúp đối chiếu ngược lại file nguồn */
  stt: string;
  /** Thứ tự xuất hiện trong Sheet */
  order: number;
  /** Toàn bộ cột gốc, dùng cho popup chi tiết */
  raw: Record<string, string>;
  /** Khóa nhận dạng bản ghi, dùng khi so sánh thay đổi */
  key: string;
  /** Vân tay nội dung, dùng để phát hiện bản ghi bị sửa */
  fingerprint: string;
  /** Các trường đã bỏ dấu kèm trọng số, dùng cho tìm kiếm */
  search: FieldMatch[];
};

export type ConfigRecord = BaseRecord & {
  kind: 'config';
  phanHe: string;
  maConfig: string;
  module: string;
  manHinh: string;
  moTa: string;
  value: string;
};

export type NoteRecord = BaseRecord & {
  kind: 'note';
  module: string;
  vanDe: string;
  chiTiet: string;
  huongXuLy: string;
};

export type AppRecord = ConfigRecord | NoteRecord;

/* ------------------------------------------------------------------ *
 * Dò tiêu đề cột
 * ------------------------------------------------------------------ */

/** Chuẩn hóa tiêu đề: bỏ dấu và quy mọi ký tự phân cách về khoảng trắng. */
function normalizeHeader(header: string) {
  return normalizeText(header)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Từ khóa xếp từ đặc trưng nhất đến tổng quát nhất. */
const CONFIG_KEYWORDS = {
  stt: ['stt goc', 'stt', 'so tt', 'so thu tu'],
  phanHe: ['phan he', 'he thong', 'subsystem'],
  maConfig: ['ma config', 'ma cau hinh', 'config key', 'ma key', 'ma', 'config', 'key', 'code'],
  module: ['module', 'nhom chuc nang', 'nghiep vu', 'nhom'],
  manHinh: ['man hinh chuc nang', 'man hinh', 'chuc nang', 'screen', 'form', 'menu'],
  moTa: ['mo ta chuc nang', 'mo ta', 'dien giai', 'y nghia', 'muc dich', 'noi dung', 'ghi chu'],
  value: ['value', 'gia tri config', 'gia tri', 'gtri', 'thiet lap'],
} as const;

const NOTE_KEYWORDS = {
  stt: ['stt', 'so tt', 'so thu tu'],
  module: ['module', 'phan he', 'nhom chuc nang', 'nghiep vu', 'nhom'],
  vanDe: ['van de man hinh', 'van de', 'man hinh', 'hien tuong', 'tinh huong', 'loi', 'case', 'chuc nang'],
  chiTiet: ['chi tiet', 'mo ta chi tiet', 'mo ta', 'dien giai', 'noi dung'],
  huongXuLy: ['huong xu ly', 'cach xu ly', 'huong giai quyet', 'giai phap', 'khac phuc', 'xu ly', 'ghi chu'],
} as const;

function scoreHeader(header: string, keywords: readonly string[]) {
  const normalized = normalizeHeader(header);
  if (!normalized) return 0;
  const words = normalized.split(' ');
  let best = 0;

  keywords.forEach((keyword, index) => {
    // Từ khóa đứng trước trong danh sách là từ khóa đặc trưng hơn -> ưu tiên cao hơn.
    const priority = keywords.length - index;
    let score = 0;
    if (normalized === keyword) score = 1000;
    else if (normalized.startsWith(`${keyword} `)) score = 700;
    else if (normalized.endsWith(` ${keyword}`)) score = 600;
    else if (keyword.includes(' ') && normalized.includes(keyword)) score = 550;
    else if (words.includes(keyword)) score = 450;
    else if (normalized.includes(keyword) && keyword.length >= 4) score = 200;
    if (score > 0) score += priority;
    if (score > best) best = score;
  });
  return best;
}

/**
 * Gán tiêu đề cột thật của Sheet vào các trường chuẩn.
 * Thuật toán tham lam: cặp (trường, cột) điểm cao nhất được chốt trước.
 */
function mapHeaders<K extends string>(headers: string[], keywords: Record<K, readonly string[]>) {
  const fields = Object.keys(keywords) as K[];
  const candidates: Array<{ field: K; header: string; score: number }> = [];

  for (const field of fields) {
    for (const header of headers) {
      const score = scoreHeader(header, keywords[field]);
      if (score > 0) candidates.push({ field, header, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || fields.indexOf(a.field) - fields.indexOf(b.field));

  const mapping = {} as Record<K, string | undefined>;
  const used = new Set<string>();
  for (const candidate of candidates) {
    if (mapping[candidate.field] || used.has(candidate.header)) continue;
    mapping[candidate.field] = candidate.header;
    used.add(candidate.header);
  }
  return mapping;
}

export { mapHeaders, normalizeHeader, CONFIG_KEYWORDS, NOTE_KEYWORDS };

/* ------------------------------------------------------------------ *
 * Chuyển dòng thô thành bản ghi
 * ------------------------------------------------------------------ */

function cleanHeader(header: string | undefined, index: number) {
  const value = String(header || '').trim();
  return value || `Cột ${index + 1}`;
}

function cellToString(cell: GoogleCell | null | undefined) {
  if (!cell) return '';
  const value = cell.f ?? cell.v ?? '';
  if (value instanceof Date) return value.toLocaleDateString('vi-VN');
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value).replace(/\r\n/g, '\n').trim();
}

/** Chuỗi dài nhất trong các cột chưa được map — dùng làm nội dung dự phòng. */
function longestLeftover(values: Record<string, string>, used: Set<string>) {
  let best = '';
  let bestHeader = '';
  for (const [header, value] of Object.entries(values)) {
    if (used.has(header) || !value) continue;
    if (value.length > best.length) {
      best = value;
      bestHeader = header;
    }
  }
  if (bestHeader) used.add(bestHeader);
  return best;
}

function buildConfigRecord(values: Record<string, string>, mapping: Record<string, string | undefined>, order: number): ConfigRecord {
  const pick = (field: string) => {
    const header = mapping[field];
    return header ? values[header] || '' : '';
  };
  const used = new Set(Object.values(mapping).filter(Boolean) as string[]);

  const phanHe = pick('phanHe');
  const maConfig = pick('maConfig');
  const module = pick('module');
  const manHinh = pick('manHinh');
  const value = pick('value');
  let moTa = pick('moTa');
  if (!moTa) moTa = longestLeftover(values, used);

  const stt = pick('stt') || String(order + 1);

  return {
    id: `config-${order}`,
    kind: 'config',
    kindLabel: 'CONFIG',
    stt,
    order,
    phanHe,
    maConfig,
    module,
    manHinh,
    moTa,
    value,
    raw: values,
    key: `config|${normalizeText(maConfig) || `row-${stt}`}`,
    fingerprint: JSON.stringify(values),
    search: [
      { text: normalizeText(maConfig), weight: 2.4 },
      { text: normalizeText(manHinh), weight: 1.6 },
      { text: normalizeText(module), weight: 1.4 },
      { text: normalizeText(phanHe), weight: 1.2 },
      { text: normalizeText(value), weight: 1.1 },
      { text: normalizeText(['CONFIG', ...Object.values(values)].join(' ')), weight: 1 },
    ],
  };
}

function buildNoteRecord(values: Record<string, string>, mapping: Record<string, string | undefined>, order: number): NoteRecord {
  const pick = (field: string) => {
    const header = mapping[field];
    return header ? values[header] || '' : '';
  };
  const used = new Set(Object.values(mapping).filter(Boolean) as string[]);

  const module = pick('module');
  let vanDe = pick('vanDe');
  const chiTiet = pick('chiTiet');
  let huongXuLy = pick('huongXuLy');
  if (!huongXuLy) huongXuLy = longestLeftover(values, used);
  if (!vanDe) vanDe = longestLeftover(values, used);

  const stt = pick('stt') || String(order + 1);

  return {
    id: `note-${order}`,
    kind: 'note',
    kindLabel: 'LƯU Ý',
    stt,
    order,
    module,
    vanDe,
    chiTiet,
    huongXuLy,
    raw: values,
    key: `note|${normalizeText(vanDe) || `row-${stt}`}|${normalizeText(module)}`,
    fingerprint: JSON.stringify(values),
    search: [
      { text: normalizeText(vanDe), weight: 2.2 },
      { text: normalizeText(module), weight: 1.5 },
      { text: normalizeText(chiTiet), weight: 1.3 },
      { text: normalizeText(huongXuLy), weight: 1.2 },
      { text: normalizeText(['LUU Y', ...Object.values(values)].join(' ')), weight: 1 },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * Tải sheet
 * ------------------------------------------------------------------ */

export type SheetPayload = {
  records: AppRecord[];
  headers: string[];
  /** Vân tay toàn sheet, dùng để bỏ qua cập nhật khi không có thay đổi */
  signature: string;
};

export function parseSheet(sheet: SheetDefinition, response: GoogleResponse): SheetPayload {
  const cols = response.table?.cols || [];
  const headers = cols.map((col, index) => cleanHeader(col.label || col.id, index));
  const rawRows = response.table?.rows || [];

  const valueRows = rawRows
    .map((row) =>
      headers.reduce<Record<string, string>>((result, header, columnIndex) => {
        result[header] = cellToString(row.c?.[columnIndex]);
        return result;
      }, {}),
    )
    .filter((values) => Object.values(values).some(Boolean));

  const records: AppRecord[] =
    sheet.kind === 'config'
      ? (() => {
          const mapping = mapHeaders(headers, CONFIG_KEYWORDS);
          return valueRows.map((values, index) => buildConfigRecord(values, mapping, index));
        })()
      : (() => {
          const mapping = mapHeaders(headers, NOTE_KEYWORDS);
          return valueRows.map((values, index) => buildNoteRecord(values, mapping, index));
        })();

  return {
    records,
    headers,
    signature: records.map((record) => `${record.key}::${record.fingerprint}`).join('\n'),
  };
}

/** Tải một sheet qua JSONP — không cần API key, chỉ cần Sheet ở chế độ ai có link cũng xem được. */
export function loadSheet(sheet: SheetDefinition, timeoutMs = 20000): Promise<SheetPayload> {
  return new Promise((resolve, reject) => {
    const callbackName = `ascConfig_${sheet.kind}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    let timer = 0;

    const cleanup = () => {
      window.clearTimeout(timer);
      script.remove();
      delete (window as unknown as JsonpWindow)[callbackName];
    };

    (window as unknown as JsonpWindow)[callbackName] = (response) => {
      cleanup();
      if (response.status === 'error') {
        const detail =
          response.errors?.[0]?.detailed_message ||
          response.errors?.[0]?.message ||
          'Không đọc được dữ liệu.';
        reject(new Error(`${sheet.title}: ${detail.replace(/<[^>]*>/g, '')}`));
        return;
      }
      resolve(parseSheet(sheet, response));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error(`${sheet.title}: không tải được dữ liệu. Kiểm tra quyền chia sẻ hoặc kết nối mạng.`));
    };

    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`${sheet.title}: quá thời gian chờ phản hồi từ Google Sheet.`));
    }, timeoutMs);

    const params = new URLSearchParams({
      sheet: sheet.name,
      tqx: `out:json;responseHandler:${callbackName}`,
      // Chống cache của trình duyệt/CDN để dữ liệu luôn mới.
      _ts: String(Date.now()),
    });
    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?${params.toString()}`;
    document.body.appendChild(script);
  });
}

/* ------------------------------------------------------------------ *
 * So sánh thay đổi phục vụ realtime
 * ------------------------------------------------------------------ */

export type ChangeSummary = { added: number; removed: number; updated: number };

export function diffRecords(previous: AppRecord[], next: AppRecord[]): ChangeSummary {
  const before = new Map<string, string>();
  for (const record of previous) before.set(record.key, record.fingerprint);

  let added = 0;
  let updated = 0;
  const seen = new Set<string>();

  for (const record of next) {
    seen.add(record.key);
    const fingerprint = before.get(record.key);
    if (fingerprint === undefined) added += 1;
    else if (fingerprint !== record.fingerprint) updated += 1;
  }

  let removed = 0;
  for (const key of before.keys()) if (!seen.has(key)) removed += 1;

  return { added, removed, updated };
}

export function hasChange(summary: ChangeSummary) {
  return summary.added > 0 || summary.removed > 0 || summary.updated > 0;
}

/** Nhận diện nội dung dạng script/SQL để hiển thị bằng khối mã. */
export function looksLikeScript(text: string) {
  if (!text) return false;
  if (/^\s*--/m.test(text)) return true;
  return /\b(select|insert\s+into|update\s+\w+\s+set|delete\s+from|set\s+identity_insert|values\s*\(|from\s+dbo\.)\b/i.test(text);
}
