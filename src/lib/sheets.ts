/**
 * Đọc dữ liệu từ Google Sheet qua GViz JSONP.
 *
 * Hai sheet dữ liệu có nhiều dòng tiêu đề ở phía trên nên KHÔNG thể để GViz tự đoán
 * tiêu đề cột. App gọi với `headers=0` (coi mọi dòng là dữ liệu) rồi dùng câu truy vấn
 * GViz để lấy đúng cột theo vị trí và bỏ qua các dòng tiêu đề bằng `offset`.
 *
 *  - CONFIG     : dữ liệu từ dòng 6  — A: STT, B: Phân hệ, C: Mã Config, D: Module,
 *                 E: Màn hình/Chức năng, F: Mô tả chức năng, G: Value
 *  - Các lưu ý  : dữ liệu từ dòng 3  — A: STT, B: Module, C: Vấn đề/Màn hình,
 *                 D: Chi tiết, E: Hướng xử lý
 *  - Data       : danh mục cho bộ lọc — J: Phân hệ, M: Module
 */
import { normalizeText, type FieldMatch } from './text';

export const SPREADSHEET_ID = '1Qd35CUqGEfqN0aCL6MVi6H5e7DKONnPwPwmHEK5BoTY';

/** Loại bản ghi, tương ứng với từng sheet dữ liệu. */
export type RecordKind = 'config' | 'note';

export type SheetDefinition = {
  kind: RecordKind;
  /** Tên tab trong Google Sheet */
  name: string;
  label: string;
  title: string;
  description: string;
  /** Các cột lấy về, theo đúng thứ tự dùng khi dựng bản ghi */
  columns: string[];
  /** Nhãn hiển thị của từng cột trong popup chi tiết */
  columnLabels: string[];
  /** Dòng đầu tiên chứa dữ liệu thật (1-based) */
  firstDataRow: number;
};

export const SHEETS: SheetDefinition[] = [
  {
    kind: 'config',
    name: 'CONFIG',
    label: 'CONFIG',
    title: 'CONFIG',
    description: 'Cấu hình hệ thống theo từng phân hệ',
    columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    columnLabels: ['STT', 'Phân hệ', 'Mã Config', 'Module', 'Màn hình / Chức năng', 'Mô tả chức năng', 'Value'],
    firstDataRow: 6,
  },
  {
    kind: 'note',
    name: 'Các lưu ý',
    label: 'LƯU Ý',
    title: 'Các lưu ý',
    description: 'Case vận hành thường gặp và hướng xử lý',
    columns: ['A', 'B', 'C', 'D', 'E'],
    columnLabels: ['STT', 'Module', 'Vấn đề / Màn hình', 'Chi tiết', 'Hướng xử lý'],
    firstDataRow: 3,
  },
];

/** Sheet danh mục dùng cho hai bộ lọc. */
export const LOOKUP_SHEET = {
  name: 'Data',
  /** J = Phân hệ, M = Module */
  columns: ['J', 'M'],
  firstDataRow: 1,
};

type GoogleCell = { v?: unknown; f?: string };
type GoogleRow = { c?: Array<GoogleCell | null> };
type GoogleResponse = {
  status?: string;
  errors?: Array<{ detailed_message?: string; message?: string; reason?: string }>;
  table?: { cols?: Array<{ id?: string; label?: string }>; rows?: GoogleRow[] };
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
  /** Toàn bộ cột đã lấy về, dùng cho popup chi tiết */
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
 * Đọc ô
 * ------------------------------------------------------------------ */

function cellToString(cell: GoogleCell | null | undefined) {
  if (!cell) return '';
  const value = cell.f ?? cell.v ?? '';
  if (value instanceof Date) return value.toLocaleDateString('vi-VN');
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value).replace(/\r\n/g, '\n').trim();
}

function rowToValues(row: GoogleRow, size: number) {
  const values: string[] = [];
  for (let i = 0; i < size; i += 1) values.push(cellToString(row.c?.[i]));
  return values;
}

function buildRaw(labels: string[], values: string[]) {
  return labels.reduce<Record<string, string>>((result, label, index) => {
    result[label] = values[index] || '';
    return result;
  }, {});
}

/* ------------------------------------------------------------------ *
 * Dựng bản ghi
 * ------------------------------------------------------------------ */

function buildConfigRecord(sheet: SheetDefinition, values: string[], order: number): ConfigRecord {
  const [sttRaw, phanHe, maConfig, module, manHinh, moTa, value] = values;
  const stt = sttRaw || String(order + 1);
  const raw = buildRaw(sheet.columnLabels, values);

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
    raw,
    key: `config|${normalizeText(maConfig) || `row-${stt}`}`,
    fingerprint: values.join('\u0001'),
    search: [
      { text: normalizeText(maConfig), weight: 2.4 },
      { text: normalizeText(manHinh), weight: 1.6 },
      { text: normalizeText(module), weight: 1.4 },
      { text: normalizeText(phanHe), weight: 1.2 },
      { text: normalizeText(value), weight: 1.1 },
      { text: normalizeText(values.join(' ')), weight: 1 },
    ],
  };
}

function buildNoteRecord(sheet: SheetDefinition, values: string[], order: number): NoteRecord {
  const [sttRaw, module, vanDe, chiTiet, huongXuLy] = values;
  const stt = sttRaw || String(order + 1);
  const raw = buildRaw(sheet.columnLabels, values);

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
    raw,
    key: `note|${normalizeText(vanDe) || `row-${stt}`}|${normalizeText(module)}`,
    fingerprint: values.join('\u0001'),
    search: [
      { text: normalizeText(vanDe), weight: 2.2 },
      { text: normalizeText(module), weight: 1.5 },
      { text: normalizeText(chiTiet), weight: 1.3 },
      { text: normalizeText(huongXuLy), weight: 1.2 },
      { text: normalizeText(values.join(' ')), weight: 1 },
    ],
  };
}

export type SheetPayload = {
  records: AppRecord[];
  /** Vân tay toàn sheet, dùng để bỏ qua cập nhật khi không có thay đổi */
  signature: string;
};

export function parseSheet(sheet: SheetDefinition, response: GoogleResponse): SheetPayload {
  const rows = response.table?.rows || [];
  const size = sheet.columns.length;

  const records: AppRecord[] = [];
  for (const row of rows) {
    const values = rowToValues(row, size);
    // Bỏ dòng trống hoàn toàn và dòng chỉ có mỗi số thứ tự.
    if (!values.slice(1).some(Boolean)) continue;
    records.push(
      sheet.kind === 'config'
        ? buildConfigRecord(sheet, values, records.length)
        : buildNoteRecord(sheet, values, records.length),
    );
  }

  return {
    records,
    signature: records.map((record) => `${record.key}::${record.fingerprint}`).join('\n'),
  };
}

/* ------------------------------------------------------------------ *
 * Gọi GViz
 * ------------------------------------------------------------------ */

function requestGviz(
  label: string,
  sheetName: string,
  query: string,
  timeoutMs: number,
): Promise<GoogleResponse> {
  return new Promise((resolve, reject) => {
    const callbackName = `ascConfig_${Math.random().toString(36).slice(2)}_${Date.now()}`;
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
        reject(new Error(`${label}: ${detail.replace(/<[^>]*>/g, '')}`));
        return;
      }
      resolve(response);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error(`${label}: không tải được dữ liệu. Kiểm tra quyền chia sẻ hoặc kết nối mạng.`));
    };

    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`${label}: quá thời gian chờ phản hồi từ Google Sheet.`));
    }, timeoutMs);

    const params = new URLSearchParams({
      sheet: sheetName,
      // Không để GViz tự đoán dòng tiêu đề — sheet có nhiều dòng tiêu đề gộp ô.
      headers: '0',
      tq: query,
      tqx: `out:json;responseHandler:${callbackName}`,
      // Chống cache của trình duyệt/CDN để dữ liệu luôn mới.
      _ts: String(Date.now()),
    });
    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?${params.toString()}`;
    document.body.appendChild(script);
  });
}

/** Tải một sheet dữ liệu, chỉ lấy đúng các cột cần và bỏ qua phần tiêu đề. */
export async function loadSheet(sheet: SheetDefinition, timeoutMs = 20000): Promise<SheetPayload> {
  const offset = Math.max(0, sheet.firstDataRow - 1);
  const query = `select ${sheet.columns.join(',')}${offset ? ` offset ${offset}` : ''}`;
  const response = await requestGviz(sheet.title, sheet.name, query, timeoutMs);
  return parseSheet(sheet, response);
}

export type LookupPayload = {
  phanHe: string[];
  module: string[];
  signature: string;
};

/** Các giá trị là tiêu đề cột chứ không phải dữ liệu — bỏ qua nếu lọt vào danh mục. */
const LOOKUP_HEADER_WORDS = new Set(['phan he', 'module', 'loai', 'stt', 'ten', 'danh muc']);

function cleanLookupColumn(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text) continue;
    const normalized = normalizeText(text);
    if (LOOKUP_HEADER_WORDS.has(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(text);
  }
  return result;
}

/** Tải danh mục Phân hệ (Data!J) và Module (Data!M) cho hai bộ lọc. */
export async function loadLookup(timeoutMs = 20000): Promise<LookupPayload> {
  const query = `select ${LOOKUP_SHEET.columns.join(',')}`;
  const response = await requestGviz('Danh mục', LOOKUP_SHEET.name, query, timeoutMs);
  const rows = response.table?.rows || [];

  const phanHe = cleanLookupColumn(rows.map((row) => cellToString(row.c?.[0])));
  const module = cleanLookupColumn(rows.map((row) => cellToString(row.c?.[1])));

  return { phanHe, module, signature: `${phanHe.join('|')}\n${module.join('|')}` };
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
