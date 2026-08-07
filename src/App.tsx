import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpenText,
  Download,
  FilterX,
  LayoutGrid,
  Loader2,
  Radio,
  RefreshCw,
  Rows3,
  Search,
  X,
} from 'lucide-react';
import {
  SHEETS,
  SPREADSHEET_ID,
  diffRows,
  hasChange,
  loadSheet,
  type ChangeSummary,
  type DataRow,
  type SheetId,
} from './lib/sheets';
import { scoreRecord, tokenize } from './lib/text';
import { registerTones, toneFor, toneVars } from './lib/colors';
import { DataGrid, type SortDirection, type SortKey } from './components/DataGrid';
import { CardList } from './components/CardList';
import { DetailModal } from './components/DetailModal';

/** Chu kỳ kiểm tra Google Sheet (ms). */
const POLL_INTERVAL_MS = 15000;
const PAGE_SIZES = [25, 50, 100, 0];
const ALL = '__all__';

type SheetState = { rows: DataRow[]; signature: string; error: string | null };
type AppData = Record<SheetId, SheetState>;

const emptyData: AppData = SHEETS.reduce((state, sheet) => {
  state[sheet.id] = { rows: [], signature: '', error: null };
  return state;
}, {} as AppData);

function formatClock(date: Date | null) {
  if (!date) return '—';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatFull(date: Date | null) {
  if (!date) return 'Chưa có thay đổi nào';
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function describeChange(summary: ChangeSummary) {
  const parts: string[] = [];
  if (summary.added) parts.push(`${summary.added} dòng mới`);
  if (summary.updated) parts.push(`${summary.updated} dòng sửa`);
  if (summary.removed) parts.push(`${summary.removed} dòng xóa`);
  return parts.join(' · ') || 'Dữ liệu đã thay đổi';
}

function toCsv(rows: DataRow[]) {
  const header = ['STT', 'Nhãn', 'Phân hệ', 'Mã Config', 'Module', 'Màn hình/Chức năng', 'Mô tả chức năng', 'Value'];
  const escape = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((row, index) =>
    [
      String(index + 1),
      row.sheetLabel,
      row.phanHe,
      row.maConfig,
      row.module,
      row.manHinh,
      row.moTa,
      row.value,
    ]
      .map(escape)
      .join(','),
  );
  return `\uFEFF${header.map(escape).join(',')}\n${lines.join('\n')}`;
}

export default function App() {
  const [data, setData] = useState<AppData>(emptyData);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [lastChangedAt, setLastChangedAt] = useState<Date | null>(null);
  const [realtime, setRealtime] = useState(true);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [labelFilter, setLabelFilter] = useState<SheetId | typeof ALL>(ALL);
  const [phanHeFilter, setPhanHeFilter] = useState<string>(ALL);
  const [moduleFilter, setModuleFilter] = useState<string>(ALL);

  const [view, setView] = useState<'grid' | 'card'>('grid');
  const [sortKey, setSortKey] = useState<SortKey>('stt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<DataRow | null>(null);

  const dataRef = useRef(data);
  const busyRef = useRef(false);
  const firstLoadRef = useRef(true);
  dataRef.current = data;

  const refresh = useCallback(async (silent: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    if (!silent) setRefreshing(true);

    const results = await Promise.all(
      SHEETS.map(async (sheet) => {
        try {
          const payload = await loadSheet(sheet);
          return { sheetId: sheet.id, payload, error: null as string | null };
        } catch (error) {
          return {
            sheetId: sheet.id,
            payload: null,
            error: error instanceof Error ? error.message : 'Có lỗi khi tải dữ liệu.',
          };
        }
      }),
    );

    const current = dataRef.current;
    const next: AppData = { ...current };
    const summary: ChangeSummary = { added: 0, removed: 0, updated: 0 };
    let dirty = false;

    for (const result of results) {
      const previous = current[result.sheetId];
      if (!result.payload) {
        // Giữ nguyên dữ liệu cũ, chỉ cập nhật trạng thái lỗi.
        if (previous.error !== result.error) {
          next[result.sheetId] = { ...previous, error: result.error };
          dirty = true;
        }
        continue;
      }

      const changed = previous.signature !== result.payload.signature;
      if (changed) {
        const sheetDiff = diffRows(previous.rows, result.payload.rows);
        summary.added += sheetDiff.added;
        summary.removed += sheetDiff.removed;
        summary.updated += sheetDiff.updated;
        next[result.sheetId] = { rows: result.payload.rows, signature: result.payload.signature, error: null };
        dirty = true;
      } else if (previous.error !== null) {
        next[result.sheetId] = { ...previous, error: null };
        dirty = true;
      }
    }

    setLastCheckedAt(new Date());

    // Không có thay đổi -> không đụng vào dữ liệu, không đổi mốc "cập nhật lần cuối".
    if (dirty) setData(next);
    if (hasChange(summary)) {
      const now = new Date();
      setLastChangedAt(now);
      // Lần tải đầu tiên không phải là "thay đổi" nên không bắn thông báo.
      if (!firstLoadRef.current) setToast({ id: now.getTime(), message: describeChange(summary) });
    }
    firstLoadRef.current = false;

    busyRef.current = false;
    setRefreshing(false);
    setInitialLoading(false);
  }, []);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  // Bơm dữ liệu định kỳ + kiểm tra ngay khi người dùng quay lại tab.
  useEffect(() => {
    if (!realtime) return;
    const timer = window.setInterval(() => void refresh(true), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [realtime, refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const allRows = useMemo(() => {
    const rows = SHEETS.flatMap((sheet) => data[sheet.id].rows);
    // Cấp màu theo đúng thứ tự phân hệ xuất hiện trong Sheet để màu luôn ổn định.
    registerTones(rows.map((row) => row.phanHe));
    return rows;
  }, [data]);
  const errors = useMemo(
    () => SHEETS.map((sheet) => data[sheet.id].error).filter((value): value is string => Boolean(value)),
    [data],
  );

  const phanHeOptions = useMemo(() => {
    const counter = new Map<string, number>();
    for (const row of allRows) {
      if (labelFilter !== ALL && row.sheetId !== labelFilter) continue;
      const key = row.phanHe || '(Không xác định)';
      counter.set(key, (counter.get(key) || 0) + 1);
    }
    return [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'));
  }, [allRows, labelFilter]);

  const moduleOptions = useMemo(() => {
    const counter = new Map<string, number>();
    for (const row of allRows) {
      if (labelFilter !== ALL && row.sheetId !== labelFilter) continue;
      if (phanHeFilter !== ALL && (row.phanHe || '(Không xác định)') !== phanHeFilter) continue;
      const key = row.module || '(Không có Module)';
      counter.set(key, (counter.get(key) || 0) + 1);
    }
    return [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'));
  }, [allRows, labelFilter, phanHeFilter]);

  // Nếu Phân hệ đổi làm Module hiện tại không còn hợp lệ -> reset Module.
  useEffect(() => {
    if (moduleFilter === ALL) return;
    if (!moduleOptions.some(([name]) => name === moduleFilter)) setModuleFilter(ALL);
  }, [moduleOptions, moduleFilter]);

  const tokens = useMemo(() => tokenize(query), [query]);

  const filteredRows = useMemo(() => {
    const scored: Array<{ row: DataRow; score: number; order: number }> = [];

    allRows.forEach((row, order) => {
      if (labelFilter !== ALL && row.sheetId !== labelFilter) return;
      if (phanHeFilter !== ALL && (row.phanHe || '(Không xác định)') !== phanHeFilter) return;
      if (moduleFilter !== ALL && (row.module || '(Không có Module)') !== moduleFilter) return;

      const score = scoreRecord(tokens, [
        { text: row.searchMa, weight: 2.2 },
        { text: row.searchManHinh, weight: 1.6 },
        { text: row.searchModule, weight: 1.3 },
        { text: row.searchPhanHe, weight: 1.2 },
        { text: row.searchValue, weight: 1.1 },
        { text: row.searchAll, weight: 1 },
      ]);
      if (score <= 0) return;
      scored.push({ row, score, order });
    });

    const direction = sortDirection === 'asc' ? 1 : -1;
    if (sortKey === 'stt') {
      // Có từ khóa -> ưu tiên độ liên quan; không có -> giữ thứ tự gốc của Sheet.
      scored.sort((a, b) => (tokens.length ? b.score - a.score || a.order - b.order : (a.order - b.order) * direction));
    } else {
      scored.sort((a, b) => {
        const left = String(a.row[sortKey] || '');
        const right = String(b.row[sortKey] || '');
        return left.localeCompare(right, 'vi', { numeric: true, sensitivity: 'base' }) * direction || a.order - b.order;
      });
    }

    return scored.map((item) => item.row);
  }, [allRows, labelFilter, phanHeFilter, moduleFilter, tokens, sortKey, sortDirection]);

  useEffect(() => {
    setPage(1);
  }, [query, labelFilter, phanHeFilter, moduleFilter, pageSize, sortKey, sortDirection]);

  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = pageSize === 0 ? 0 : (currentPage - 1) * pageSize;
  const pageRows = pageSize === 0 ? filteredRows : filteredRows.slice(startIndex, startIndex + pageSize);

  const submitSearch = (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    setQuery(queryInput.trim());
  };

  const clearFilters = () => {
    setQueryInput('');
    setQuery('');
    setLabelFilter(ALL);
    setPhanHeFilter(ALL);
    setModuleFilter(ALL);
    setSortKey('stt');
    setSortDirection('asc');
  };

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const exportCsv = () => {
    const blob = new Blob([toCsv(filteredRows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ASC-CONFIG-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filtersActive =
    Boolean(query) || labelFilter !== ALL || phanHeFilter !== ALL || moduleFilter !== ALL;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">ASC</span>
          <div>
            <h1>ASC-CONFIG</h1>
            <p>Tra cứu Config &amp; Lưu ý vận hành — dữ liệu trực tiếp từ Google Sheet</p>
          </div>
        </div>

        <div className="live-panel">
          <div className={`live-dot ${realtime ? 'on' : 'off'}`} aria-hidden />
          <div className="live-info">
            <strong>{realtime ? 'Realtime đang bật' : 'Realtime đã tắt'}</strong>
            <span>
              Kiểm tra: {formatClock(lastCheckedAt)} · Cập nhật cuối: {formatFull(lastChangedAt)}
            </span>
          </div>
          <button
            type="button"
            className={`icon-toggle ${realtime ? 'active' : ''}`}
            onClick={() => setRealtime((value) => !value)}
            title={realtime ? 'Tắt tự động cập nhật' : 'Bật tự động cập nhật'}
          >
            <Radio size={16} />
          </button>
          <button type="button" className="icon-toggle" onClick={() => void refresh(false)} disabled={refreshing} title="Tải lại ngay">
            {refreshing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          </button>
        </div>
      </header>

      <section className="stat-strip">
        <div className="stat-card">
          <span>Tổng bản ghi</span>
          <strong>{allRows.length}</strong>
        </div>
        {SHEETS.map((sheet) => (
          <div key={sheet.id} className={`stat-card ${sheet.id}`}>
            <span>{sheet.title}</span>
            <strong>{data[sheet.id].rows.length}</strong>
          </div>
        ))}
        <div className="stat-card">
          <span>Phân hệ</span>
          <strong>{phanHeOptions.length}</strong>
        </div>
        <div className="stat-card">
          <span>Đang hiển thị</span>
          <strong>{filteredRows.length}</strong>
        </div>
      </section>

      <section className="overview">
        <span className="overview-label">Tổng quan phân hệ</span>
        <div className="overview-chips">
          <button
            type="button"
            className={`overview-chip ${phanHeFilter === ALL ? 'active' : ''}`}
            onClick={() => setPhanHeFilter(ALL)}
          >
            Tất cả <b>{allRows.length}</b>
          </button>
          {phanHeOptions.map(([name, count]) => (
            <button
              key={name}
              type="button"
              style={toneVars(toneFor(name))}
              className={`overview-chip toned ${phanHeFilter === name ? 'active' : ''}`}
              onClick={() => setPhanHeFilter((current) => (current === name ? ALL : name))}
            >
              {name} <b>{count}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="toolbar">
        <form className="search-box" onSubmit={submitSearch} role="search">
          <Search size={19} />
          <input
            value={queryInput}
            onChange={(event) => {
              setQueryInput(event.target.value);
              if (!event.target.value.trim()) setQuery('');
            }}
            placeholder="Nhập nội dung rồi nhấn Enter: mã config, module, màn hình, mô tả, value..."
            aria-label="Từ khóa tìm kiếm"
          />
          {queryInput && (
            <button
              type="button"
              className="clear-button"
              onClick={() => {
                setQueryInput('');
                setQuery('');
              }}
              aria-label="Xóa từ khóa"
            >
              <X size={17} />
            </button>
          )}
          <button type="submit" className="search-submit">
            Tìm kiếm
          </button>
        </form>

        <div className="filter-row">
          <label className="field">
            <span>Nhãn</span>
            <select value={labelFilter} onChange={(event) => setLabelFilter(event.target.value as SheetId | typeof ALL)}>
              <option value={ALL}>Tất cả nhãn</option>
              {SHEETS.map((sheet) => (
                <option key={sheet.id} value={sheet.id}>
                  {sheet.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Phân hệ</span>
            <select value={phanHeFilter} onChange={(event) => setPhanHeFilter(event.target.value)}>
              <option value={ALL}>Tất cả phân hệ ({phanHeOptions.length})</option>
              {phanHeOptions.map(([name, count]) => (
                <option key={name} value={name}>
                  {name} ({count})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Module</span>
            <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
              <option value={ALL}>Tất cả module ({moduleOptions.length})</option>
              {moduleOptions.map(([name, count]) => (
                <option key={name} value={name}>
                  {name} ({count})
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="ghost-button" onClick={clearFilters} disabled={!filtersActive}>
            <FilterX size={15} />
            Xóa lọc
          </button>

          <div className="view-switch" role="group" aria-label="Kiểu hiển thị">
            <button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} title="Dạng lưới">
              <Rows3 size={15} />
            </button>
            <button type="button" className={view === 'card' ? 'active' : ''} onClick={() => setView('card')} title="Dạng thẻ">
              <LayoutGrid size={15} />
            </button>
          </div>

          <button type="button" className="ghost-button" onClick={exportCsv} disabled={!filteredRows.length}>
            <Download size={15} />
            Xuất CSV
          </button>
        </div>
      </section>

      {errors.length > 0 && (
        <section className="notice" role="alert">
          <AlertTriangle size={20} />
          <div>
            <strong>Chưa đọc được đầy đủ dữ liệu</strong>
            <p>{errors.join(' | ')}</p>
          </div>
        </section>
      )}

      <section className="results" aria-live="polite">
        <div className="results-head">
          <h2>
            {initialLoading ? 'Đang tải dữ liệu...' : `${filteredRows.length} bản ghi`}
            {query && !initialLoading && <em> cho từ khóa “{query}”</em>}
          </h2>
          <div className="results-tools">
            <label className="field compact">
              <span>Hiển thị</span>
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size === 0 ? 'Tất cả' : `${size} dòng`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {initialLoading && (
          <div className="empty-state">
            <Loader2 className="spin" size={28} />
            <h3>Đang đọc Google Sheet</h3>
            <p>App sẽ hiển thị dữ liệu ngay khi đọc xong hai sheet CONFIG và Các lưu ý.</p>
          </div>
        )}

        {!initialLoading && filteredRows.length === 0 && (
          <div className="empty-state">
            <BookOpenText size={30} />
            <h3>Không tìm thấy bản ghi phù hợp</h3>
            <p>Thử rút gọn từ khóa, bỏ dấu tiếng Việt, hoặc bỏ bớt bộ lọc Phân hệ / Module.</p>
          </div>
        )}

        {!initialLoading && filteredRows.length > 0 && (
          <>
            {view === 'grid' ? (
              <DataGrid
                rows={pageRows}
                tokens={tokens}
                startIndex={startIndex}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
                onSelect={setSelectedRow}
              />
            ) : (
              <CardList rows={pageRows} tokens={tokens} startIndex={startIndex} onSelect={setSelectedRow} />
            )}

            {totalPages > 1 && (
              <div className="pagination">
                <button type="button" onClick={() => setPage(1)} disabled={currentPage === 1}>
                  Đầu
                </button>
                <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>
                  Trước
                </button>
                <span>
                  Trang {currentPage}/{totalPages}
                </span>
                <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages}>
                  Sau
                </button>
                <button type="button" onClick={() => setPage(totalPages)} disabled={currentPage === totalPages}>
                  Cuối
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <footer className="app-footer">
        <span>
          Nguồn dữ liệu:{' '}
          <a href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`} target="_blank" rel="noreferrer">
            Google Sheet ASC-CONFIG
          </a>
        </span>
        <span>Tự động kiểm tra mỗi {POLL_INTERVAL_MS / 1000} giây · v1.1.0</span>
      </footer>

      {toast && (
        <div className="toast" role="status">
          <RefreshCw size={16} />
          <div>
            <strong>Google Sheet vừa thay đổi</strong>
            <span>{toast.message}</span>
          </div>
          <button type="button" onClick={() => setToast(null)} aria-label="Đóng thông báo">
            <X size={15} />
          </button>
        </div>
      )}

      {selectedRow && <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </main>
  );
}
