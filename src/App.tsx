import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BookOpenText,
  Boxes,
  Download,
  FileCog,
  FilterX,
  LayoutGrid,
  Lightbulb,
  Loader2,
  BarChart3,
  RefreshCw,
  Moon,
  Rows3,
  Sun,
  Search,
  TextQuote,
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
import { scorePhrase, scoreRecord, toPhrase, tokenize } from './lib/text';
import { registerTones } from './lib/colors';
import { ConfigGrid } from './components/ConfigGrid';
import { NoteGrid } from './components/NoteGrid';
import { CardList } from './components/CardList';
import { DetailModal } from './components/DetailModal';
import { SearchableSelect, ALL_VALUE } from './components/SearchableSelect';
import { ScrollTopButton } from './components/ScrollTopButton';
import { StatsModal } from './components/StatsModal';
import { ToolsModal } from './components/ToolsModal';
import { useToast } from './lib/toast';
import { useTheme } from './lib/theme';
import { usePinGate } from './lib/pin';
import { useTools } from './lib/tools';
import { installFlushHooks } from './lib/remoteStats';
import type { SortState } from './components/common';

/** Chu kỳ kiểm tra Google Sheet (ms). */
const POLL_INTERVAL_MS = 15000;
const APP_VERSION = '2.3.1';
/** Màn hình hẹp thì lưới nhiều cột rất khó đọc, nên mặc định dùng dạng thẻ. */
function isNarrowScreen() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 960px)').matches;
}

function defaultView(): 'grid' | 'card' {
  return isNarrowScreen() ? 'card' : 'grid';
}

/** Hiện trạng ban đầu của app — dùng khi bấm vào logo để làm mới. */
const DEFAULTS = {
  kindView: 'config' as RecordKind,
  sort: { key: 'stt', direction: 'asc' } as SortState,
};
const ALL = ALL_VALUE;

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
  const [startupSplashVisible, setStartupSplashVisible] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [lastChangedAt, setLastChangedAt] = useState<Date | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const { tools } = useTools();
  const [mobileCompactHeader, setMobileCompactHeader] = useState(false);
  const [compactSearchOpen, setCompactSearchOpen] = useState(false);
  const notify = useToast();
  const { theme, toggle: toggleTheme } = useTheme();
  const requirePin = usePinGate();
  const resultsRef = useRef<HTMLElement>(null);
  const compactSearchInputRef = useRef<HTMLInputElement>(null);
  // Giữ header compact trong lúc Safari/iOS đóng bàn phím sau khi submit.
  // Khi keyboard biến mất, Safari có thể phát sinh một scroll/resize tạm thời làm scrollY
  // tụt xuống dưới ngưỡng 72px và khiến header mở rộng/biến khỏi vị trí người dùng đang xem.
  const compactHeaderPinUntilRef = useRef(0);
  // Khi header đã co trên mobile, giữ trạng thái compact ổn định. Chỉ mở lại header đầy đủ
  // khi người dùng thực sự quay về sát đầu trang và không còn tìm kiếm đang áp dụng.
  const compactHeaderLatchedRef = useRef(false);

  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  /** Bật: coi cả ô nhập là một cụm liền, thay vì khớp rời từng từ. */
  const [phraseMode, setPhraseMode] = useState(false);
  const [kindView, setKindView] = useState<RecordKind>(DEFAULTS.kindView);
  const [phanHeFilter, setPhanHeFilter] = useState<string>(ALL);
  const [moduleFilter, setModuleFilter] = useState<string>(ALL);

  const [view, setView] = useState<'grid' | 'card'>(defaultView);
  const [configSort, setConfigSort] = useState<SortState>(DEFAULTS.sort);
  const [noteSort, setNoteSort] = useState<SortState>(DEFAULTS.sort);
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
      if (!firstLoadRef.current) {
        notify({ kind: 'info', title: 'Google Sheet vừa thay đổi', detail: describeChange(summary) });
      }
    }
    firstLoadRef.current = false;

    busyRef.current = false;
    setRefreshing(false);
    setInitialLoading(false);
  }, [notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => setStartupSplashVisible(false), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  // Gửi nốt thống kê đang chờ khi người dùng đóng tab hoặc chuyển đi.
  useEffect(() => {
    installFlushHooks();
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 960px)');
    const update = () => {
      if (!media.matches) {
        compactHeaderLatchedRef.current = false;
        setMobileCompactHeader(false);
        setCompactSearchOpen(false);
        return;
      }

      const y = window.scrollY;
      const compactPinned = Date.now() < compactHeaderPinUntilRef.current;

      if (y > 72) compactHeaderLatchedRef.current = true;

      // Chỉ nhả compact khi người dùng đã về sát đầu trang VÀ không còn search.
      // Khi kết quả tìm kiếm làm chiều cao trang thay đổi/scrollY bị Safari điều chỉnh,
      // query hoặc latch vẫn giữ header một dòng, vì vậy header không thể biến mất.
      if (y <= 4 && !query && !compactSearchOpen && !compactPinned) {
        compactHeaderLatchedRef.current = false;
      }

      const compact =
        compactHeaderLatchedRef.current ||
        compactPinned ||
        compactSearchOpen ||
        Boolean(query);

      setMobileCompactHeader(compact);
      if (!compact) setCompactSearchOpen(false);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    media.addEventListener('change', update);
    return () => {
      window.removeEventListener('scroll', update);
      media.removeEventListener('change', update);
    };
  }, [query, compactSearchOpen]);

  useEffect(() => {
    if (!compactSearchOpen) return;
    const frame = window.requestAnimationFrame(() => compactSearchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [compactSearchOpen]);

  useEffect(() => {
    const blockManualCopy = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-allow-native-copy="true"]')) return;
      event.preventDefault();
    };
    document.addEventListener('copy', blockManualCopy, true);
    return () => document.removeEventListener('copy', blockManualCopy, true);
  }, []);

  // Kiểm tra định kỳ + kiểm tra ngay khi người dùng quay lại tab.
  useEffect(() => {
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
  }, [refresh]);

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
      if (kindView !== kind) return;
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
  const phrase = useMemo(() => toPhrase(query), [query]);

  /** Cả hai chế độ dùng chung một hàm chấm điểm, chỉ khác cách hiểu ô nhập. */
  const matches = useCallback(
    (fields: Parameters<typeof scoreRecord>[1]) =>
      phraseMode ? scorePhrase(phrase, fields) : scoreRecord(tokens, fields),
    [phraseMode, phrase, tokens],
  );

  /** Phần được tô sáng: cả cụm khi bật chế độ nguyên cụm, từng từ khi tắt. */
  const highlightTokens = useMemo(
    () => (phraseMode ? (phrase ? [phrase] : []) : tokens),
    [phraseMode, phrase, tokens],
  );

  const filteredConfig = useMemo(() => {
    const scored: Array<{ record: ConfigRecord; score: number }> = [];
    for (const record of configRecords) {
      if (phanHeFilter !== ALL && (record.phanHe || '(Không xác định)') !== phanHeFilter) continue;
      if (moduleFilter !== ALL && (record.module || '(Không có Module)') !== moduleFilter) continue;
      const score = matches(record.search);
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
  }, [configRecords, phanHeFilter, moduleFilter, matches, tokens, configSort]);

  const filteredNotes = useMemo(() => {
    const scored: Array<{ record: NoteRecord; score: number }> = [];
    for (const record of noteRecords) {
      if (moduleFilter !== ALL && (record.module || '(Không có Module)') !== moduleFilter) continue;
      const score = matches(record.search);
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
  }, [noteRecords, moduleFilter, matches, tokens, noteSort]);

  const activeList: AppRecord[] = kindView === 'config' ? filteredConfig : filteredNotes;


  const submitSearch = (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    setQuery(queryInput.trim());
  };

  /**
   * Tìm kiếm từ header compact trên mobile.
   * Blur input trước khi đóng để iOS thu bàn phím/viewport ổn định, sau đó giữ header
   * compact trong khoảng chuyển tiếp ngắn. Textbox luôn đóng sau submit; chấm xanh trên
   * icon tìm kiếm được điều khiển bởi `query` nên vẫn còn khi đang lọc dữ liệu.
   */
  const submitCompactSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuery = queryInput.trim();

    compactHeaderLatchedRef.current = true;
    compactHeaderPinUntilRef.current = Date.now() + 1200;
    compactSearchInputRef.current?.blur();
    setQuery(nextQuery);
    setCompactSearchOpen(false);
    setMobileCompactHeader(true);

    // Safari có thể điều chỉnh scroll khi bàn phím đóng. Nếu vị trí tạm rơi dưới ngưỡng
    // compact, đưa nhẹ về đúng ngưỡng để header vẫn là một dòng như trước khi tìm kiếm.
    window.setTimeout(() => {
      if (!window.matchMedia('(max-width: 960px)').matches) return;
      if (window.scrollY <= 72) {
        window.scrollTo({ top: 73, left: 0, behavior: 'auto' });
      }
      setMobileCompactHeader(true);
    }, 120);
  };

  const clearFilters = () => {
    notify({ kind: 'info', title: 'Đã bỏ toàn bộ bộ lọc', duration: 2000 });
    setQueryInput('');
    setQuery('');
    setPhraseMode(false);
    setPhanHeFilter(ALL);
    setModuleFilter(ALL);
    setConfigSort(DEFAULTS.sort);
    setNoteSort(DEFAULTS.sort);
  };

  /** Đưa toàn bộ app về hiện trạng ban đầu, cuộn lên đầu bảng rồi tải lại dữ liệu. */
  const resetApp = () => {
    setQueryInput('');
    setQuery('');
    setPhraseMode(false);
    setPhanHeFilter(ALL);
    setModuleFilter(ALL);
    setKindView(DEFAULTS.kindView);
    setView(defaultView());
    setConfigSort(DEFAULTS.sort);
    setNoteSort(DEFAULTS.sort);
    setSelected(null);
    setStatsOpen(false);
    setCompactSearchOpen(false);
    compactHeaderLatchedRef.current = false;
    compactHeaderPinUntilRef.current = 0;
    setMobileCompactHeader(false);
    void refresh(false);

    // Đưa thanh cuộn của bảng về đầu; chờ React vẽ lại xong mới cuộn.
    requestAnimationFrame(() => {
      const scroller = resultsRef.current?.querySelector('.grid-wrap, .card-list-wrap');
      scroller?.scrollTo({ top: 0, left: 0 });
    });

    notify({ kind: 'success', title: 'Đã làm mới', detail: 'Bộ lọc, sắp xếp, phân trang đã trở về mặc định.' });
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

  /** Mở Google Sheet nguồn — cần mã PIN vì đây là nơi sửa được dữ liệu gốc. */
  const openSource = async () => {
    const allowed = await requirePin('Mở Google Sheet nguồn', 'Thao tác này cần mã PIN quản trị.');
    if (!allowed) return;
    window.open(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`, '_blank', 'noopener,noreferrer');
  };

  // --- 4. Xuất CSV cũng cần mã PIN ---
  const exportCsv = async () => {
    const allowed = await requirePin('Xuất dữ liệu ra CSV', 'Thao tác này cần mã PIN quản trị.');
    if (!allowed) return;

    const files: string[] = [];
    if (kindView === 'config' && filteredConfig.length) files.push(`CONFIG (${filteredConfig.length} dòng)`);
    if (kindView === 'note' && filteredNotes.length) files.push(`Lưu ý (${filteredNotes.length} dòng)`);

    if (kindView === 'config' && filteredConfig.length) {
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
    if (kindView === 'note' && filteredNotes.length) {
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

    if (files.length) notify({ kind: 'success', title: 'Đã xuất CSV', detail: files.join(' · ') });
    else notify({ kind: 'error', title: 'Không có dữ liệu để xuất' });
  };

  const filtersActive = Boolean(query) || phraseMode || phanHeFilter !== ALL || moduleFilter !== ALL;

  const phanHeDisabled = kindView === 'note';

  const KIND_TABS: Array<{ id: RecordKind; label: string; count: number; icon: typeof FileCog }> = [
    { id: 'config', label: 'CONFIG', count: filteredConfig.length, icon: FileCog },
    { id: 'note', label: 'Các lưu ý', count: filteredNotes.length, icon: Lightbulb },
  ];

  return (
    <>
      {startupSplashVisible && (
        <div className="startup-splash" role="status" aria-live="polite" aria-label="Đang khởi động ASC-CONFIG">
          <div className="startup-splash-card">
            <div className="startup-splash-logo" aria-hidden>ASC</div>
            <h1>ASC-CONFIG</h1>
            <p>Tra cứu Config &amp; Lưu ý vận hành</p>
            <div className="startup-progress" aria-hidden>
              <span />
            </div>
          </div>
        </div>
      )}

      <main className={`app-shell ${mobileCompactHeader ? 'mobile-header-pinned' : ''}`}>
      <header className={`topbar ${mobileCompactHeader ? 'mobile-compact' : ''}`}>
        <button
          type="button"
          className="brand"
          onClick={resetApp}
          title="Bấm để tải lại toàn bộ và đưa mọi thứ về mặc định"
        >
          <span className="brand-mark">ASC</span>
          <span className="brand-text">
            <strong>ASC-CONFIG<span className="compact-version"> V{APP_VERSION}</span></strong>
            <span>Tra cứu Config &amp; Lưu ý vận hành — dữ liệu trực tiếp từ Google Sheet</span>
          </span>
        </button>

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
                <Icon size={15} />
                <span>{tab.label}</span>
                <b>{tab.count}</b>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className={`kind-tab tool-chip ${toolsOpen ? 'active' : ''}`}
          onClick={() => setToolsOpen(true)}
          title="Các chức năng khác của đội — bấm để xem và mở"
          aria-label="Chức năng khác"
          aria-haspopup="dialog"
        >
          <Boxes size={15} />
          <span>Chức năng khác</span>
          {tools.length > 0 && <b>{tools.length}</b>}
        </button>

        {mobileCompactHeader && (
          <button
            type="button"
            className={`compact-search-toggle ${compactSearchOpen ? 'active' : ''} ${query ? 'has-query' : ''}`}
            onClick={() => {
              if (compactSearchOpen) {
                compactHeaderPinUntilRef.current = 0;
                compactSearchInputRef.current?.blur();
                setCompactSearchOpen(false);
                return;
              }
              // Giữ header compact khi iOS mở bàn phím và thay đổi visual viewport.
              compactHeaderLatchedRef.current = true;
              compactHeaderPinUntilRef.current = Date.now() + 1800;
              setMobileCompactHeader(true);
              setCompactSearchOpen(true);
            }}
            title={compactSearchOpen ? 'Đóng tìm kiếm' : 'Tìm kiếm'}
            aria-label={compactSearchOpen ? 'Đóng tìm kiếm' : 'Mở tìm kiếm'}
            aria-expanded={compactSearchOpen}
          >
            {compactSearchOpen ? <X size={17} /> : <Search size={17} />}
          </button>
        )}

        <div className="topbar-actions">
          <button
            type="button"
            className="icon-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}
            aria-label="Đổi chế độ hiển thị"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            type="button"
            className="icon-toggle"
            onClick={() => setStatsOpen(true)}
            title="Thống kê lượt xem và sao chép"
          >
            <BarChart3 size={16} />
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

        {mobileCompactHeader && compactSearchOpen && (
          <form
            className="compact-mobile-search"
            role="search"
            onSubmit={submitCompactSearch}
          >
            <Search size={17} aria-hidden />
            <input
              ref={compactSearchInputRef}
              value={queryInput}
              onChange={(event) => {
                setQueryInput(event.target.value);
                if (!event.target.value.trim()) setQuery('');
              }}
              placeholder="Tìm mã config, module, vấn đề..."
              aria-label="Từ khóa tìm kiếm trên mobile"
            />
            {queryInput && (
              <button
                type="button"
                className="compact-search-clear"
                onClick={() => {
                  setQueryInput('');
                  setQuery('');
                  compactSearchInputRef.current?.focus();
                }}
                aria-label="Xóa từ khóa"
              >
                <X size={15} />
              </button>
            )}
            <button type="submit" className="compact-search-submit" aria-label="Tìm kiếm">
              <Search size={16} />
            </button>
          </form>
        )}
      </header>

      <section className="control-bar">
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
          <button
            type="button"
            className={`phrase-toggle ${phraseMode ? 'active' : ''}`}
            aria-pressed={phraseMode}
            onClick={() => setPhraseMode((value) => !value)}
            title={
              phraseMode
                ? 'Đang tìm nguyên cụm: chỉ ra bản ghi chứa đúng cả cụm bạn gõ. Bấm để quay lại tìm rời từng từ.'
                : 'Đang tìm rời từng từ. Bấm để chỉ lấy bản ghi chứa đúng nguyên cụm bạn gõ.'
            }
          >
            <TextQuote size={15} />
            <span>Nguyên cụm</span>
          </button>

          <button type="submit" className="search-submit">
            <span>Tìm kiếm</span>
            {query && <span className="search-submit-count">{activeList.length} kết quả</span>}
          </button>
        </form>

        <div className="filter-row">
          <SearchableSelect
            label="Phân hệ"
            allLabel="Tất cả phân hệ"
            value={phanHeFilter}
            options={phanHeOptions.map(([name]) => name)}
            onChange={setPhanHeFilter}
            disabled={phanHeDisabled}
            hint={phanHeDisabled ? 'Sheet Các lưu ý không có cột Phân hệ' : undefined}
          />

          <SearchableSelect
            label="Module"
            allLabel="Tất cả module"
            value={moduleFilter}
            options={moduleOptions.map(([name]) => name)}
            onChange={setModuleFilter}
          />

          <div className="action-group">
            <button
              type="button"
              className="icon-action"
              onClick={clearFilters}
              disabled={!filtersActive}
              title="Xóa bộ lọc và từ khóa"
              aria-label="Xóa bộ lọc"
            >
              <FilterX size={15} />
            </button>

            <div className="view-switch" role="group" aria-label="Kiểu hiển thị">
              <button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} title="Dạng lưới">
                <Rows3 size={15} />
              </button>
              <button type="button" className={view === 'card' ? 'active' : ''} onClick={() => setView('card')} title="Dạng thẻ">
                <LayoutGrid size={15} />
              </button>
            </div>

            <button
              type="button"
              className="icon-action"
              onClick={() => void exportCsv()}
              disabled={!activeList.length}
              title="Xuất CSV phần dữ liệu đang lọc"
              aria-label="Xuất CSV"
            >
              <Download size={15} />
            </button>
          </div>
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

      {initialLoading ? (
        <section className="results">
          <div className="empty-state">
            <Loader2 className="spin" size={28} />
            <h3>Đang đọc Google Sheet</h3>
            <p>App sẽ hiển thị dữ liệu ngay khi đọc xong hai sheet CONFIG và Các lưu ý.</p>
          </div>
        </section>
      ) : (
        <section className="results" aria-live="polite" ref={resultsRef}>
          {activeList.length === 0 ? (
            <EmptyResult />
          ) : view === 'grid' ? (
            kindView === 'config' ? (
              <ConfigGrid
                records={activeList as ConfigRecord[]}
                tokens={highlightTokens}
                sort={configSort}
                onSort={makeSortHandler('config')}
                onSelect={setSelected}
              />
            ) : (
              <NoteGrid
                records={activeList as NoteRecord[]}
                tokens={highlightTokens}
                sort={noteSort}
                onSort={makeSortHandler('note')}
                onSelect={setSelected}
              />
            )
          ) : (
            <div className="card-list-wrap">
              <CardList records={activeList} tokens={highlightTokens} onSelect={setSelected} />
            </div>
          )}

        </section>
      )}

      <footer className="app-footer" title={`Tự kiểm tra mỗi ${POLL_INTERVAL_MS / 1000} giây · lần kiểm tra gần nhất ${formatClock(lastCheckedAt)}`}>
        <div className="footer-left">
          <span className="live-dot on" aria-hidden />
          <span className="footer-source-label">Nguồn dữ liệu:</span>
          <button type="button" className="link-button footer-link" onClick={() => void openSource()}>Google Sheet ASC-CONFIG</button>
          <span className="footer-sync">· Cập nhật lần cuối: {formatFull(lastChangedAt)}</span>
        </div>
        <div className="footer-right">
          <span>{configRecords.length} config</span>
          <span>· {noteRecords.length} lưu ý</span>
          <span>· v{APP_VERSION}</span>
        </div>
      </footer>

      <ScrollTopButton containerRef={resultsRef} />

      {selected && <DetailModal record={selected} onClose={() => setSelected(null)} />}
      {statsOpen && <StatsModal records={[...configRecords, ...noteRecords]} onClose={() => setStatsOpen(false)} />}
      {toolsOpen && <ToolsModal onClose={() => setToolsOpen(false)} />}
      </main>
    </>
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
