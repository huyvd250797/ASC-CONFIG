import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpenText,
  ChevronRight,
  Download,
  FileCog,
  FilterX,
  LayoutGrid,
  Lightbulb,
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
  diffRecords,
  hasChange,
  loadLookup,
  loadSheet,
  type AppRecord,
  type ChangeSummary,
  type ConfigRecord,
  type NoteRecord,
  type LookupPayload,
  type RecordKind,
} from './lib/sheets';
import { scoreRecord, tokenize } from './lib/text';
import { registerTones } from './lib/colors';
import { ConfigGrid } from './components/ConfigGrid';
import { NoteGrid } from './components/NoteGrid';
import { CardList } from './components/CardList';
import { DetailModal } from './components/DetailModal';
import type { SortState } from './components/common';

/** Chu kỳ kiểm tra Google Sheet (ms). */
const POLL_INTERVAL_MS = 15000;
const PAGE_SIZES = [25, 50, 100, 0];
/** Số dòng tối đa của mỗi khu vực khi đang ở chế độ xem "Tất cả". */
const SECTION_PREVIEW = 12;
const ALL = '__all__';

type KindView = 'all' | RecordKind;
type SheetState = { records: AppRecord[]; signature: string; error: string | null };
type AppData = Record<RecordKind, SheetState>;

const emptyData: AppData = {
  config: { records: [], signature: '', error: null },
  note: { records: [], signature: '', error: null },
};

const emptyLookup: LookupPayload = { phanHe: [], module: [], signature: '' };

/**
 * Ghép danh mục gốc (sheet Data) với các giá trị thực tế đang có trong dữ liệu.
 * Danh mục gốc giữ đúng thứ tự trong Sheet; giá trị lạ xuất hiện trong dữ liệu
 * nhưng thiếu ở danh mục vẫn được đưa xuống cuối để không có bản ghi nào bị lọt.
 */
function buildOptions(master: string[], counts: Map<string, number>) {
  const options: Array<[string, number]> = [];
  const used = new Set<string>();

  for (const name of master) {
    const count = counts.get(name) || 0;
    used.add(name);
    if (count > 0) options.push([name, count]);
  }
  const extras: Array<[string, number]> = [];
  for (const [name, count] of counts) {
    if (!used.has(name)) extras.push([name, count]);
  }
  extras.sort((a, b) => b[1] - a[1] || compare(a[0], b[0]));
  return [...options, ...extras];
}

function formatClock(date: Date | null) {
  if (!date) return '—';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatFull(date: Date | null) {
  if (!date) return 'Chưa ghi nhận';
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

function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const escape = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const content = `\uFEFF${[header, ...rows].map((row) => row.map(escape).join(',')).join('\n')}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function compare(left: string, right: string) {
  return String(left || '').localeCompare(String(right || ''), 'vi', { numeric: true, sensitivity: 'base' });
}

export default function App() {
  const [data, setData] = useState<AppData>(emptyData);
  const [lookup, setLookup] = useState<LookupPayload>(emptyLookup);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [lastChangedAt, setLastChangedAt] = useState<Date | null>(null);
  const [realtime, setRealtime] = useState(true);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [kindView, setKindView] = useState<KindView>('config');
  const [phanHeFilter, setPhanHeFilter] = useState<string>(ALL);
  const [moduleFilter, setModuleFilter] = useState<string>(ALL);

  const [view, setView] = useState<'grid' | 'card'>('grid');
  const [configSort, setConfigSort] = useState<SortState>({ key: 'stt', direction: 'asc' });
  const [noteSort, setNoteSort] = useState<SortState>({ key: 'stt', direction: 'asc' });
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AppRecord | null>(null);

  const dataRef = useRef(data);
  const lookupRef = useRef(lookup);
  const busyRef = useRef(false);
  const firstLoadRef = useRef(true);
  dataRef.current = data;
  lookupRef.current = lookup;

  const refresh = useCallback(async (silent: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    if (!silent) setRefreshing(true);

    const [results, lookupResult] = await Promise.all([
      Promise.all(
        SHEETS.map(async (sheet) => {
          try {
            return { kind: sheet.kind, payload: await loadSheet(sheet), error: null as string | null };
          } catch (error) {
            return {
              kind: sheet.kind,
              payload: null,
              error: error instanceof Error ? error.message : 'Có lỗi khi tải dữ liệu.',
            };
          }
        }),
      ),
      // Danh mục cho bộ lọc: lỗi ở đây không chặn dữ liệu chính.
      loadLookup().catch(() => null),
    ]);

    if (lookupResult && lookupResult.signature !== lookupRef.current.signature) {
      setLookup(lookupResult);
    }

    const current = dataRef.current;
    const next: AppData = { ...current };
    const summary: ChangeSummary = { added: 0, removed: 0, updated: 0 };
    let dirty = false;

    for (const result of results) {
      const previous = current[result.kind];
      if (!result.payload) {
        // Lỗi mạng: giữ nguyên dữ liệu cũ, chỉ cập nhật trạng thái lỗi.
        if (previous.error !== result.error) {
          next[result.kind] = { ...previous, error: result.error };
          dirty = true;
        }
        continue;
      }

      if (previous.signature !== result.payload.signature) {
        const sheetDiff = diffRecords(previous.records, result.payload.records);
        summary.added += sheetDiff.added;
        summary.removed += sheetDiff.removed;
        summary.updated += sheetDiff.updated;
        next[result.kind] = { records: result.payload.records, signature: result.payload.signature, error: null };
        dirty = true;
      } else if (previous.error !== null) {
        next[result.kind] = { ...previous, error: null };
        dirty = true;
      }
    }

    setLastCheckedAt(new Date());

    // Không có thay đổi -> không đụng vào dữ liệu, không đổi mốc "cập nhật cuối".
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

  // Kiểm tra định kỳ + kiểm tra ngay khi người dùng quay lại tab.
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

  const configRecords = useMemo(() => {
    const records = data.config.records as ConfigRecord[];
    registerTones('phanHe', records.map((record) => record.phanHe));
    return records;
  }, [data.config.records]);

  const noteRecords = useMemo(() => {
    const records = data.note.records as NoteRecord[];
    registerTones('module', records.map((record) => record.module));
    return records;
  }, [data.note.records]);

  const errors = useMemo(
    () => [data.config.error, data.note.error].filter((value): value is string => Boolean(value)),
    [data.config.error, data.note.error],
  );

  /** Phân hệ: danh mục lấy từ Data!J, chỉ áp dụng cho sheet CONFIG. */
  const phanHeOptions = useMemo(() => {
    const counter = new Map<string, number>();
    for (const record of configRecords) {
      const key = record.phanHe || '(Không xác định)';
      counter.set(key, (counter.get(key) || 0) + 1);
    }
    return buildOptions(lookup.phanHe, counter);
  }, [configRecords, lookup.phanHe]);

  /** Module: danh mục lấy từ Data!M, dùng chung cho cả hai sheet. */
  const moduleOptions = useMemo(() => {
    const counter = new Map<string, number>();
    const collect = (name: string, kind: RecordKind) => {
      if (kindView !== 'all' && kindView !== kind) return;
      const key = name || '(Không có Module)';
      counter.set(key, (counter.get(key) || 0) + 1);
    };
    for (const record of configRecords) {
      if (phanHeFilter !== ALL && (record.phanHe || '(Không xác định)') !== phanHeFilter) continue;
      collect(record.module, 'config');
    }
    for (const record of noteRecords) collect(record.module, 'note');
    return buildOptions(lookup.module, counter);
  }, [configRecords, noteRecords, kindView, phanHeFilter, lookup.module]);

  useEffect(() => {
    if (moduleFilter === ALL) return;
    if (!moduleOptions.some(([name]) => name === moduleFilter)) setModuleFilter(ALL);
  }, [moduleOptions, moduleFilter]);

  const tokens = useMemo(() => tokenize(query), [query]);

  const filteredConfig = useMemo(() => {
    const scored: Array<{ record: ConfigRecord; score: number }> = [];
    for (const record of configRecords) {
      if (phanHeFilter !== ALL && (record.phanHe || '(Không xác định)') !== phanHeFilter) continue;
      if (moduleFilter !== ALL && (record.module || '(Không có Module)') !== moduleFilter) continue;
      const score = scoreRecord(tokens, record.search);
      if (score <= 0) continue;
      scored.push({ record, score });
    }

    const direction = configSort.direction === 'asc' ? 1 : -1;
    if (configSort.key === 'stt' && tokens.length) {
      // Có từ khóa và chưa chọn cột sắp xếp khác -> ưu tiên độ liên quan.
      scored.sort((a, b) => b.score - a.score || a.record.order - b.record.order);
    } else if (configSort.key === 'stt') {
      scored.sort((a, b) => compare(a.record.stt, b.record.stt) * direction || a.record.order - b.record.order);
    } else {
      const key = configSort.key as 'phanHe' | 'maConfig' | 'module' | 'manHinh';
      scored.sort((a, b) => compare(a.record[key], b.record[key]) * direction || a.record.order - b.record.order);
    }
    return scored.map((item) => item.record);
  }, [configRecords, phanHeFilter, moduleFilter, tokens, configSort]);

  const filteredNotes = useMemo(() => {
    const scored: Array<{ record: NoteRecord; score: number }> = [];
    for (const record of noteRecords) {
      if (moduleFilter !== ALL && (record.module || '(Không có Module)') !== moduleFilter) continue;
      const score = scoreRecord(tokens, record.search);
      if (score <= 0) continue;
      scored.push({ record, score });
    }

    const direction = noteSort.direction === 'asc' ? 1 : -1;
    if (noteSort.key === 'stt' && tokens.length) {
      scored.sort((a, b) => b.score - a.score || a.record.order - b.record.order);
    } else if (noteSort.key === 'stt') {
      scored.sort((a, b) => compare(a.record.stt, b.record.stt) * direction || a.record.order - b.record.order);
    } else {
      const key = noteSort.key as 'module' | 'vanDe';
      scored.sort((a, b) => compare(a.record[key], b.record[key]) * direction || a.record.order - b.record.order);
    }
    return scored.map((item) => item.record);
  }, [noteRecords, moduleFilter, tokens, noteSort]);

  useEffect(() => {
    setPage(1);
  }, [query, kindView, phanHeFilter, moduleFilter, pageSize, configSort, noteSort]);

  const activeList: AppRecord[] =
    kindView === 'config' ? filteredConfig : kindView === 'note' ? filteredNotes : [];
  const totalShown =
    kindView === 'all' ? filteredConfig.length + filteredNotes.length : activeList.length;

  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(activeList.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = pageSize === 0 ? 0 : (currentPage - 1) * pageSize;
  const pagedList = pageSize === 0 ? activeList : activeList.slice(startIndex, startIndex + pageSize);

  const submitSearch = (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    setQuery(queryInput.trim());
  };

  const clearFilters = () => {
    setQueryInput('');
    setQuery('');
    setPhanHeFilter(ALL);
    setModuleFilter(ALL);
    setConfigSort({ key: 'stt', direction: 'asc' });
    setNoteSort({ key: 'stt', direction: 'asc' });
  };

  const makeSortHandler = (kind: RecordKind) => (key: string) => {
    const setter = kind === 'config' ? setConfigSort : setNoteSort;
    setter((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  };

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');

  const exportCsv = () => {
    if (kindView !== 'note' && filteredConfig.length) {
      downloadCsv(
        `ASC-CONFIG-${stamp}.csv`,
        ['STT', 'Phân hệ', 'Mã Config', 'Module', 'Màn hình / Chức năng', 'Mô tả chức năng', 'Value'],
        filteredConfig.map((record) => [
          record.stt,
          record.phanHe,
          record.maConfig,
          record.module,
          record.manHinh,
          record.moTa,
          record.value,
        ]),
      );
    }
    if (kindView !== 'config' && filteredNotes.length) {
      downloadCsv(
        `ASC-LUUY-${stamp}.csv`,
        ['STT', 'Module', 'Vấn đề / Màn hình', 'Chi tiết', 'Hướng xử lý'],
        filteredNotes.map((record) => [
          record.stt,
          record.module,
          record.vanDe,
          record.chiTiet,
          record.huongXuLy,
        ]),
      );
    }
  };

  const filtersActive = Boolean(query) || phanHeFilter !== ALL || moduleFilter !== ALL;
  const phanHeDisabled = kindView === 'note';

  const KIND_TABS: Array<{ id: KindView; label: string; count: number; icon: typeof FileCog }> = [
    { id: 'config', label: 'CONFIG', count: filteredConfig.length, icon: FileCog },
    { id: 'note', label: 'Các lưu ý', count: filteredNotes.length, icon: Lightbulb },
    { id: 'all', label: 'Tất cả', count: filteredConfig.length + filteredNotes.length, icon: LayoutGrid },
  ];

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
          <button
            type="button"
            className="icon-toggle"
            onClick={() => void refresh(false)}
            disabled={refreshing}
            title="Tải lại ngay"
          >
            {refreshing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          </button>
        </div>
      </header>

      <section className="control-bar">
        <div className="control-top">
          <div className="kind-tabs" role="tablist" aria-label="Loại dữ liệu">
            {KIND_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={kindView === tab.id}
                  className={`kind-tab ${tab.id} ${kindView === tab.id ? 'active' : ''}`}
                  onClick={() => setKindView(tab.id)}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                  <b>{tab.count}</b>
                </button>
              );
            })}
          </div>

          <form className="search-box" onSubmit={submitSearch} role="search">
          <Search size={19} />
          <input
            value={queryInput}
            onChange={(event) => {
              setQueryInput(event.target.value);
              if (!event.target.value.trim()) setQuery('');
            }}
            placeholder="Nhập nội dung rồi nhấn Enter: mã config, module, màn hình, vấn đề, hướng xử lý..."
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
        </div>

        <div className="filter-row">
          <label className={`field ${phanHeDisabled ? 'disabled' : ''}`}>
            <span>Phân hệ {phanHeDisabled && '(chỉ có ở CONFIG)'}</span>
            <select
              value={phanHeFilter}
              disabled={phanHeDisabled}
              onChange={(event) => setPhanHeFilter(event.target.value)}
            >
              <option value={ALL}>Tất cả phân hệ</option>
              {phanHeOptions.map(([name]) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Module</span>
            <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
              <option value={ALL}>Tất cả module</option>
              {moduleOptions.map(([name]) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

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

          <button type="button" className="ghost-button" onClick={exportCsv} disabled={!totalShown}>
            <Download size={15} />
            Xuất CSV
          </button>
        </div>

        {phanHeFilter !== ALL && kindView === 'all' && (
          <p className="filter-hint">
            Bộ lọc <b>Phân hệ</b> chỉ áp dụng cho bản ghi CONFIG — sheet Các lưu ý không có cột này.
          </p>
        )}
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

      {initialLoading ? (
        <section className="results">
          <div className="empty-state">
            <Loader2 className="spin" size={28} />
            <h3>Đang đọc Google Sheet</h3>
            <p>App sẽ hiển thị dữ liệu ngay khi đọc xong hai sheet CONFIG và Các lưu ý.</p>
          </div>
        </section>
      ) : kindView === 'all' ? (
        <div className="sections-scroll">
          <SectionBlock
            title="CONFIG"
            description={SHEETS[0].description}
            total={filteredConfig.length}
            onSeeAll={() => setKindView('config')}
          >
            {filteredConfig.length === 0 ? (
              <EmptyResult />
            ) : view === 'grid' ? (
              <ConfigGrid
                records={filteredConfig.slice(0, SECTION_PREVIEW)}
                tokens={tokens}
                sort={configSort}
                onSort={makeSortHandler('config')}
                onSelect={setSelected}
              />
            ) : (
              <CardList records={filteredConfig.slice(0, SECTION_PREVIEW)} tokens={tokens} onSelect={setSelected} />
            )}
          </SectionBlock>

          <SectionBlock
            title="Các lưu ý"
            description={SHEETS[1].description}
            total={filteredNotes.length}
            onSeeAll={() => setKindView('note')}
          >
            {filteredNotes.length === 0 ? (
              <EmptyResult />
            ) : view === 'grid' ? (
              <NoteGrid
                records={filteredNotes.slice(0, SECTION_PREVIEW)}
                tokens={tokens}
                sort={noteSort}
                onSort={makeSortHandler('note')}
                onSelect={setSelected}
              />
            ) : (
              <CardList records={filteredNotes.slice(0, SECTION_PREVIEW)} tokens={tokens} onSelect={setSelected} />
            )}
          </SectionBlock>
        </div>
      ) : (
        <section className="results" aria-live="polite">
          <div className="results-head">
            <h2>
              {activeList.length} bản ghi
              {query && <em> cho từ khóa “{query}”</em>}
            </h2>
            {activeList.length > 0 && pageSize !== 0 && (
              <span className="result-caption">
                Đang xem {startIndex + 1}–{Math.min(startIndex + pageSize, activeList.length)}
              </span>
            )}
          </div>

          {activeList.length === 0 ? (
            <EmptyResult />
          ) : view === 'grid' ? (
            kindView === 'config' ? (
              <ConfigGrid
                records={pagedList as ConfigRecord[]}
                tokens={tokens}
                sort={configSort}
                onSort={makeSortHandler('config')}
                onSelect={setSelected}
              />
            ) : (
              <NoteGrid
                records={pagedList as NoteRecord[]}
                tokens={tokens}
                sort={noteSort}
                onSort={makeSortHandler('note')}
                onSelect={setSelected}
              />
            )
          ) : (
            <div className="card-list-wrap">
              <CardList records={pagedList} tokens={tokens} onSelect={setSelected} />
            </div>
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
        </section>
      )}

      <footer className="app-footer">
        <span>
          Nguồn dữ liệu:{' '}
          <a href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`} target="_blank" rel="noreferrer">
            Google Sheet ASC-CONFIG
          </a>
        </span>
        <span>
          {configRecords.length} config · {noteRecords.length} lưu ý · tự kiểm tra mỗi {POLL_INTERVAL_MS / 1000}s · v1.4.0
        </span>
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

      {selected && <DetailModal record={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

function SectionBlock({
  title,
  description,
  total,
  onSeeAll,
  children,
}: {
  title: string;
  description: string;
  total: number;
  onSeeAll: () => void;
  children: ReactNode;
}) {
  return (
    <section className="results">
      <div className="results-head">
        <div>
          <h2>
            {title} <b className="count-badge">{total}</b>
          </h2>
          <p className="section-desc">{description}</p>
        </div>
        {total > SECTION_PREVIEW && (
          <button type="button" className="ghost-button" onClick={onSeeAll}>
            Xem tất cả {total} bản ghi <ChevronRight size={15} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyResult() {
  return (
    <div className="empty-state">
      <BookOpenText size={28} />
      <h3>Không có bản ghi phù hợp</h3>
      <p>Thử rút gọn từ khóa, bỏ dấu tiếng Việt, hoặc bỏ bớt bộ lọc Phân hệ / Module.</p>
    </div>
  );
}
