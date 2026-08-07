/**
 * Đọc dữ liệu từ Google Sheet qua GViz JSONP, tự nhận diện cột
 * và so sánh thay đổi giữa 2 lần tải để phục vụ cơ chế realtime.
 */
import { normalizeText } from './text';

export const SPREADSHEET_ID = '1Qd35CUqGEfqN0aCL6MVi6H5e7DKONnPwPwmHEK5BoTY';

export const SHEETS = [
  {
    id: 'config',
    /** Tên tab trong Google Sheet */
    name: 'CONFIG',
    /** Nhãn hiển thị ở cột "Nhãn" */
    label: 'CONFIG',
    title: 'CONFIG',
    description: 'Cấu hình hỗ trợ vận hành các chức năng',
  },
  {
    id: 'notes',
    name: 'Các lưu ý',
    label: 'LƯU Ý',
    title: 'Các lưu ý',
    description: 'Case thường gặp khi vận hành hệ thống',
  },
] as const;

export type SheetDefinition = (typeof SHEETS)[number];
export type SheetId = SheetDefinition['id'];

type GoogleCell = { v?: unknown; f?: string };
type GoogleColumn = { id?: string; label?: string; type?: string };
type GoogleRow = { c?: Array<GoogleCell | null> };
type GoogleResponse = {
  status?: string;
  errors?: Array<{ detailed_message?: string; message?: string; reason?: string }>;
  table?: { cols?: GoogleColumn[]; rows?: GoogleRow[] };
};
type JsonpWindow = Window & Record<string, ((response: GoogleResponse) => void) | undefined>;

/** Các trường chuẩn hóa mà lưới dữ liệu sử dụng. */
export type CanonicalField = 'phanHe' | 'maConfig' | 'module' | 'manHinh' | 'moTa' | 'value';

export type DataRow = {
  id: string;
  sheetId: SheetId;
  sheetLabel: string;
  sheetTitle: string;
  phanHe: string;
  maConfig: string;
  module: string;
  manHinh: string;
  moTa: string;
  value: string;
  /** Toàn bộ cột gốc của dòng, dùng cho popup chi tiết */
  raw: Record<string, string>;
  /** Bản đã bỏ dấu, chuẩn hóa sẵn để tìm kiếm nhanh */
  searchPhanHe: string;
  searchMa: string;
  searchModule: string;
  searchManHinh: string;
  searchValue: string;
  searchAll: string;
  /** Khóa nhận dạng dòng, dùng để so sánh thay đổi */
  key: string;
  /** Vân tay nội dung, dùng để phát hiện dòng bị sửa */
  fingerprint: string;
};

/** Từ khóa nhận diện tiêu đề cột (đã bỏ dấu). */
const FIELD_KEYWORDS: Record<CanonicalField, string[]> = {
  phanHe: ['phan he', 'phanhe', 'he thong', 'hethong', 'nhom he thong', 'subsystem', 'phan mem'],
  maConfig: ['ma config', 'maconfig', 'ma cau hinh', 'config key', 'ma key', 'ma luu y', 'ma', 'code', 'key', 'config'],
  module: ['module', 'phan mun', 'nghiep vu', 'nhom chuc nang', 'nhom'],
  manHinh: ['man hinh chuc nang', 'man hinh/chuc nang', 'man hinh', 'manhinh', 'chuc nang', 'screen', 'form', 'menu'],
  moTa: ['mo ta chuc nang', 'mo ta', 'dien giai', 'noi dung', 'y nghia', 'muc dich', 'ghi chu', 'huong xu ly', 'cach xu ly', 'luu y'],
  value: ['value', 'gia tri', 'giatri', 'gtri', 'gia tri config', 'ket qua', 'thiet lap'],
};

const FIELD_ORDER: CanonicalField[] = ['phanHe', 'maConfig', 'module', 'manHinh', 'value', 'moTa'];

function cleanHeader(header: string | undefined, index: number) {
  const value = String(header || '').trim();
  return value || `Cột ${index + 1}`;
}

function cellToString(cell: GoogleCell | null | undefined) {
  if (!cell) return '';
  const value = cell.f ?? cell.v ?? '';
  if (value instanceof Date) return value.toLocaleDateString('vi-VN');
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value).trim();
}

/** Chấm điểm mức độ khớp giữa tiêu đề cột và bộ từ khóa của một trường. */
function scoreHeader(header: string, keywords: string[]) {
  const normalized = normalizeText(header);
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
 * Gán tiêu đề cột thực tế của Sheet vào các trường chuẩn.
 * Dùng thuật toán tham lam: cặp (trường, cột) điểm cao nhất được chốt trước.
 */
export function mapHeaders(headers: string[]) {
  type Candidate = { field: CanonicalField; header: string; score: number };
  const candidates: Candidate[] = [];

  for (const field of FIELD_ORDER) {
    for (const header of headers) {
      const score = scoreHeader(header, FIELD_KEYWORDS[field]);
      if (score > 0) candidates.push({ field, header, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field));

  const mapping = {} as Record<CanonicalField, string | undefined>;
  const usedHeaders = new Set<string>();
  for (const candidate of candidates) {
    if (mapping[candidate.field] || usedHeaders.has(candidate.header)) continue;
    mapping[candidate.field] = candidate.header;
    usedHeaders.add(candidate.header);
  }
  return mapping;
}

/** Chuỗi dài nhất trong các cột chưa được map — dùng làm mô tả dự phòng. */
function longestLeftover(values: Record<string, string>, used: Set<string>) {
  let best = '';
  for (const [header, value] of Object.entries(values)) {
    if (used.has(header) || !value) continue;
    if (value.length > best.length) best = value;
  }
  return best;
}

function buildRow(
  sheet: SheetDefinition,
  values: Record<string, string>,
  mapping: Record<CanonicalField, string | undefined>,
  index: number,
): DataRow {
  const pick = (field: CanonicalField) => {
    const header = mapping[field];
    return header ? values[header] || '' : '';
  };

  const used = new Set(Object.values(mapping).filter(Boolean) as string[]);
  let phanHe = pick('phanHe');
  const maConfig = pick('maConfig');
  const module = pick('module');
  let manHinh = pick('manHinh');
  let moTa = pick('moTa');
  const value = pick('value');

  // Dự phòng cho các sheet không có đủ cột chuẩn (vd: sheet "Các lưu ý").
  if (!manHinh && !moTa) {
    const first = Object.entries(values).find(([header, text]) => !used.has(header) && text);
    if (first) {
      manHinh = first[1];
      used.add(first[0]);
    }
  }
  if (!moTa) moTa = longestLeftover(values, used);
  if (!phanHe) phanHe = sheet.title;

  const key = [sheet.id, maConfig, phanHe, module, manHinh].map((part) => normalizeText(part || '')).join('|');
  const fingerprint = JSON.stringify(values);

  return {
    id: `${sheet.id}-${index}`,
    sheetId: sheet.id,
    sheetLabel: sheet.label,
    sheetTitle: sheet.title,
    phanHe,
    maConfig,
    module,
    manHinh,
    moTa,
    value,
    raw: values,
    searchPhanHe: normalizeText(phanHe),
    searchMa: normalizeText(maConfig),
    searchModule: normalizeText(module),
    searchManHinh: normalizeText(manHinh),
    searchValue: normalizeText(value),
    searchAll: normalizeText([sheet.label, ...Object.values(values)].join(' ')),
    key: key.replace(/\|+$/, '') || `${sheet.id}-${index}`,
    fingerprint,
  };
}

export type SheetPayload = {
  rows: DataRow[];
  headers: string[];
  /** Vân tay của toàn bộ sheet, dùng để bỏ qua cập nhật khi không có thay đổi */
  signature: string;
};

/** Tải một sheet qua JSONP (không cần API key, chỉ cần sheet ở chế độ ai có link cũng xem được). */
export function loadSheet(sheet: SheetDefinition, timeoutMs = 20000): Promise<SheetPayload> {
  return new Promise((resolve, reject) => {
    const callbackName = `ascConfig_${sheet.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
          'Không đọc được dữ liệu Google Sheet.';
        reject(new Error(`${sheet.title}: ${detail.replace(/<[^>]*>/g, '')}`));
        return;
      }

      const cols = response.table?.cols || [];
      const headers = cols.map((col, index) => cleanHeader(col.label || col.id, index));
      const mapping = mapHeaders(headers);
      const rawRows = response.table?.rows || [];

      const rows = rawRows
        .map((row) =>
          headers.reduce<Record<string, string>>((result, header, columnIndex) => {
            result[header] = cellToString(row.c?.[columnIndex]);
            return result;
          }, {}),
        )
        .filter((values) => Object.values(values).some(Boolean))
        .map((values, index) => buildRow(sheet, values, mapping, index));

      resolve({
        rows,
        headers,
        signature: rows.map((row) => `${row.key}::${row.fingerprint}`).join('\n'),
      });
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
      // Tránh cache của trình duyệt/CDN để dữ liệu luôn mới.
      _ts: String(Date.now()),
    });
    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?${params.toString()}`;
    document.body.appendChild(script);
  });
}

export type ChangeSummary = { added: number; removed: number; updated: number };

/** So sánh 2 lần tải để biết chính xác có bao nhiêu dòng thêm / sửa / xóa. */
export function diffRows(previous: DataRow[], next: DataRow[]): ChangeSummary {
  const before = new Map<string, string>();
  for (const row of previous) before.set(row.key, row.fingerprint);

  let added = 0;
  let updated = 0;
  const seen = new Set<string>();

  for (const row of next) {
    seen.add(row.key);
    const fingerprint = before.get(row.key);
    if (fingerprint === undefined) added += 1;
    else if (fingerprint !== row.fingerprint) updated += 1;
  }

  let removed = 0;
  for (const key of before.keys()) if (!seen.has(key)) removed += 1;

  return { added, removed, updated };
}

export function hasChange(summary: ChangeSummary) {
  return summary.added > 0 || summary.removed > 0 || summary.updated > 0;
}
