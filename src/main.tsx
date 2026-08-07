import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  ChevronRight,
  DatabaseZap,
  FileCog,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import './styles.css';

const SPREADSHEET_ID = '1Qd35CUqGEfqN0aCL6MVi6H5e7DKONnPwPwmHEK5BoTY';

const SHEETS = [
  {
    id: 'config',
    name: 'CONFIG',
    title: 'CONFIG',
    description: 'Tra cứu cấu hình hỗ trợ các chức năng',
    icon: FileCog,
    color: 'blue',
  },
  {
    id: 'notes',
    name: 'Các lưu ý',
    title: 'Các lưu ý',
    description: 'Case thường gặp khi vận hành hệ thống',
    icon: AlertTriangle,
    color: 'amber',
  },
] as const;

type SheetDefinition = (typeof SHEETS)[number];
type GoogleCell = { v?: unknown; f?: string };
type GoogleColumn = { id?: string; label?: string; type?: string };
type GoogleRow = { c?: Array<GoogleCell | null> };
type GoogleResponse = {
  status?: string;
  errors?: Array<{ detailed_message?: string; message?: string; reason?: string }>;
  table?: {
    cols?: GoogleColumn[];
    rows?: GoogleRow[];
  };
};

type DataRow = {
  id: string;
  sheetId: SheetDefinition['id'];
  sheetName: string;
  values: Record<string, string>;
  searchable: string;
};

type SheetState = {
  loading: boolean;
  error: string | null;
  rows: DataRow[];
  updatedAt: Date | null;
};

type AppState = Record<SheetDefinition['id'], SheetState>;
type JsonpWindow = Window & Record<string, ((response: GoogleResponse) => void) | undefined>;

const initialState: AppState = SHEETS.reduce((state, sheet) => {
  state[sheet.id] = { loading: true, error: null, rows: [], updatedAt: null };
  return state;
}, {} as AppState);

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHeader(header: string | undefined, index: number) {
  const value = String(header || '').trim();
  return value || `Cột ${index + 1}`;
}

function cellToString(cell: GoogleCell | null | undefined) {
  if (!cell) return '';
  const value = cell.f ?? cell.v ?? '';
  if (value instanceof Date) return value.toLocaleDateString('vi-VN');
  return String(value).trim();
}

function loadGoogleSheet(sheet: SheetDefinition): Promise<DataRow[]> {
  return new Promise((resolve, reject) => {
    const callbackName = `ascConfig_${sheet.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const params = new URLSearchParams({
      sheet: sheet.name,
      tqx: `out:json;responseHandler:${callbackName}`,
    });

    const cleanup = () => {
      script.remove();
      delete (window as unknown as JsonpWindow)[callbackName];
    };

    (window as unknown as JsonpWindow)[callbackName] = (response) => {
      cleanup();

      if (response.status === 'error') {
        const message = response.errors?.[0]?.detailed_message || response.errors?.[0]?.message || 'Không đọc được dữ liệu Google Sheet.';
        reject(new Error(message));
        return;
      }

      const cols = response.table?.cols || [];
      const headers = cols.map((col, index) => cleanHeader(col.label || col.id, index));
      const rows = response.table?.rows || [];

      const parsedRows = rows
        .map((row, rowIndex) => {
          const values = headers.reduce<Record<string, string>>((result, header, columnIndex) => {
            result[header] = cellToString(row.c?.[columnIndex]);
            return result;
          }, {});
          const searchable = normalizeText(Object.values(values).join(' '));
          return {
            id: `${sheet.id}-${rowIndex}`,
            sheetId: sheet.id,
            sheetName: sheet.title,
            values,
            searchable,
          };
        })
        .filter((row) => Object.values(row.values).some(Boolean));

      resolve(parsedRows);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Không tải được Google Sheet. Hãy kiểm tra quyền chia sẻ hoặc kết nối mạng.'));
    };

    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?${params.toString()}`;
    document.body.appendChild(script);
  });
}

function getFirstValue(row: DataRow, keywords: string[]) {
  const entries = Object.entries(row.values);
  const exact = entries.find(([key, value]) => value && keywords.some((keyword) => normalizeText(key).includes(keyword)));
  if (exact) return exact[1];
  return entries.find(([, value]) => value)?.[1] || 'Chưa có tiêu đề';
}

function getSupportingValue(row: DataRow, exclude: string) {
  return (
    Object.values(row.values).find((value) => value && value !== exclude && value.length > 8) ||
    Object.values(row.values).find((value) => value && value !== exclude) ||
    ''
  );
}

function getImportantFields(row: DataRow) {
  const entries = Object.entries(row.values).filter(([, value]) => value);
  const priority = ['xu ly', 'cach', 'mo ta', 'noi dung', 'ghi chu', 'config', 'loi', 'case', 'chuc nang'];
  return entries
    .sort(([left], [right]) => {
      const leftScore = priority.findIndex((keyword) => normalizeText(left).includes(keyword));
      const rightScore = priority.findIndex((keyword) => normalizeText(right).includes(keyword));
      return (leftScore === -1 ? 99 : leftScore) - (rightScore === -1 ? 99 : rightScore);
    })
    .slice(0, 4);
}

function formatTime(date: Date | null) {
  if (!date) return 'Chưa cập nhật';
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function App() {
  const [activeSheet, setActiveSheet] = useState<SheetDefinition['id'] | 'all'>('all');
  const [query, setQuery] = useState('');
  const [state, setState] = useState<AppState>(initialState);
  const [selectedRow, setSelectedRow] = useState<DataRow | null>(null);

  const fetchAllSheets = async () => {
    setState((current) => {
      const next = { ...current };
      SHEETS.forEach((sheet) => {
        next[sheet.id] = { ...next[sheet.id], loading: true, error: null };
      });
      return next;
    });

    await Promise.all(
      SHEETS.map(async (sheet) => {
        try {
          const rows = await loadGoogleSheet(sheet);
          setState((current) => ({
            ...current,
            [sheet.id]: {
              loading: false,
              error: null,
              rows,
              updatedAt: new Date(),
            },
          }));
        } catch (error) {
          setState((current) => ({
            ...current,
            [sheet.id]: {
              ...current[sheet.id],
              loading: false,
              error: error instanceof Error ? error.message : 'Có lỗi khi tải dữ liệu.',
            },
          }));
        }
      }),
    );
  };

  useEffect(() => {
    void fetchAllSheets();
  }, []);

  const allRows = useMemo(() => SHEETS.flatMap((sheet) => state[sheet.id].rows), [state]);
  const normalizedQuery = normalizeText(query);
  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      const matchSheet = activeSheet === 'all' || row.sheetId === activeSheet;
      const matchQuery = !normalizedQuery || row.searchable.includes(normalizedQuery);
      return matchSheet && matchQuery;
    });
  }, [activeSheet, allRows, normalizedQuery]);

  const isLoading = SHEETS.some((sheet) => state[sheet.id].loading);
  const hasErrors = SHEETS.some((sheet) => state[sheet.id].error);

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <DatabaseZap size={16} />
            ASC-CONFIG
          </div>
          <h1>Tra cứu config và lỗi vận hành trong một màn hình.</h1>
          <p>
            Dữ liệu lấy trực tiếp từ Google Sheet, hỗ trợ tìm nhanh theo từ khóa, chức năng, lỗi, case và hướng xử lý.
          </p>
        </div>
        <div className="hero-panel">
          <div>
            <span className="panel-label">Tổng dữ liệu</span>
            <strong>{allRows.length}</strong>
          </div>
          <div>
            <span className="panel-label">Cập nhật</span>
            <strong>{formatTime(SHEETS.map((sheet) => state[sheet.id].updatedAt).find(Boolean) || null)}</strong>
          </div>
          <button className="ghost-button" onClick={fetchAllSheets} disabled={isLoading}>
            {isLoading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            Tải lại
          </button>
        </div>
      </section>

      <section className="search-zone" aria-label="Tra cứu dữ liệu">
        <div className="search-box">
          <Search size={20} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nhập từ khóa: tên chức năng, mã lỗi, case, config, hướng xử lý..."
            aria-label="Nhập từ khóa tra cứu"
          />
          {query && (
            <button className="clear-button" onClick={() => setQuery('')} aria-label="Xóa từ khóa">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="tabs" role="tablist" aria-label="Bộ lọc sheet">
          <button className={activeSheet === 'all' ? 'active' : ''} onClick={() => setActiveSheet('all')}>
            <Sparkles size={16} />
            Tất cả
            <span>{allRows.length}</span>
          </button>
          {SHEETS.map((sheet) => {
            const Icon = sheet.icon;
            return (
              <button
                key={sheet.id}
                className={activeSheet === sheet.id ? `active ${sheet.color}` : sheet.color}
                onClick={() => setActiveSheet(sheet.id)}
              >
                <Icon size={16} />
                {sheet.title}
                <span>{state[sheet.id].rows.length}</span>
              </button>
            );
          })}
        </div>
      </section>

      {hasErrors && (
        <section className="notice" role="alert">
          <AlertTriangle size={20} />
          <div>
            <strong>Chưa đọc được đầy đủ dữ liệu.</strong>
            <p>
              Hãy kiểm tra Google Sheet đã bật quyền xem bằng link. Chi tiết:{' '}
              {SHEETS.map((sheet) => state[sheet.id].error)
                .filter(Boolean)
                .join(' | ')}
            </p>
          </div>
        </section>
      )}

      <section className="content-grid">
        <aside className="summary">
          {SHEETS.map((sheet) => {
            const Icon = sheet.icon;
            const sheetState = state[sheet.id];
            return (
              <article key={sheet.id} className={`summary-card ${sheet.color}`}>
                <div className="summary-icon">
                  <Icon size={20} />
                </div>
                <div>
                  <h2>{sheet.title}</h2>
                  <p>{sheet.description}</p>
                  <strong>{sheetState.loading ? 'Đang tải...' : `${sheetState.rows.length} dòng dữ liệu`}</strong>
                </div>
              </article>
            );
          })}
          <div className="operator-tip">
            <Settings2 size={18} />
            <p>
              Gợi ý: nhập cả tiếng Việt không dấu vẫn tìm được dữ liệu có dấu trong Sheet.
            </p>
          </div>
        </aside>

        <section className="results" aria-live="polite">
          <div className="results-head">
            <div>
              <span>Kết quả</span>
              <h2>{isLoading ? 'Đang tải dữ liệu...' : `${filteredRows.length} mục phù hợp`}</h2>
            </div>
            {!isLoading && filteredRows.length > 0 && (
              <span className="result-caption">{query ? `Từ khóa: "${query}"` : 'Hiển thị dữ liệu mới nhất'}</span>
            )}
          </div>

          <div className="result-list">
            {isLoading && allRows.length === 0 && (
              <div className="empty-state">
                <Loader2 className="spin" size={28} />
                <h3>Đang tải dữ liệu từ Google Sheet</h3>
                <p>App sẽ tự hiển thị kết quả sau khi đọc xong hai sheet CONFIG và Các lưu ý.</p>
              </div>
            )}

            {!isLoading && filteredRows.length === 0 && (
              <div className="empty-state">
                <BookOpenText size={30} />
                <h3>Không tìm thấy kết quả</h3>
                <p>Thử rút gọn từ khóa, bỏ dấu tiếng Việt hoặc kiểm tra lại dữ liệu trong Sheet.</p>
              </div>
            )}

            {filteredRows.map((row) => {
              const title = getFirstValue(row, ['tieu de', 'chuc nang', 'config', 'loi', 'case', 'ten']);
              const supporting = getSupportingValue(row, title);
              return (
                <article className="result-card" key={row.id} onClick={() => setSelectedRow(row)}>
                  <div className={`sheet-pill ${row.sheetId}`}>{row.sheetName}</div>
                  <h3>{title}</h3>
                  {supporting && <p>{supporting}</p>}
                  <div className="field-preview">
                    {getImportantFields(row).map(([key, value]) => (
                      <span key={key}>
                        <b>{key}:</b> {value}
                      </span>
                    ))}
                  </div>
                  <button>
                    Xem chi tiết
                    <ChevronRight size={16} />
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </section>

      {selectedRow && (
        <div className="modal-backdrop" onClick={() => setSelectedRow(null)}>
          <section className="detail-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <header>
              <div>
                <span className={`sheet-pill ${selectedRow.sheetId}`}>{selectedRow.sheetName}</span>
                <h2>{getFirstValue(selectedRow, ['tieu de', 'chuc nang', 'config', 'loi', 'case', 'ten'])}</h2>
              </div>
              <button onClick={() => setSelectedRow(null)} aria-label="Đóng chi tiết">
                <X size={20} />
              </button>
            </header>
            <div className="detail-body">
              {Object.entries(selectedRow.values)
                .filter(([, value]) => value)
                .map(([key, value]) => (
                  <div className="detail-row" key={key}>
                    <span>{key}</span>
                    <p>{value}</p>
                  </div>
                ))}
            </div>
            <footer>
              <CheckCircle2 size={18} />
              Dữ liệu được lấy từ Google Sheet nguồn.
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
