import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Copy, Download, Eye, Loader2, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { deleteUsage, resetUsage, useUsage, type UsageEntry } from '../lib/stats';
import { deleteRemoteUsage, fetchRemoteUsage, getCachedRemoteUsage, remoteStatsEnabled, resetRemoteUsage, type RemoteUsageResult } from '../lib/remoteStats';
import { useToast } from '../lib/toast';
import { usePinGate } from '../lib/pin';
import { toneFor, toneVars } from '../lib/colors';
import { useModalScrollLock } from '../lib/modalScrollLock';
import type { AppRecord } from '../lib/sheets';

type SortKey = 'copies' | 'views' | 'lastAt' | 'label' | 'phanHe' | 'module';

const COLUMNS: Array<{ key: SortKey; label: string; className: string }> = [
  { key: 'label', label: 'Mã Config / Vấn đề', className: 'stat-label' },
  { key: 'phanHe', label: 'Phân hệ', className: 'stat-phanhe' },
  { key: 'module', label: 'Module', className: 'stat-module' },
  { key: 'views', label: 'Lượt xem', className: 'stat-num' },
  { key: 'copies', label: 'Lượt chép', className: 'stat-num' },
  { key: 'lastAt', label: 'Gần nhất', className: 'stat-time' },
];

function formatTime(value: number) {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function compareText(left = '', right = '') {
  return left.localeCompare(right, 'vi', { numeric: true, sensitivity: 'base' });
}

type Scope = 'all' | 'mine';
type Props = { records: AppRecord[]; onClose: () => void };
const REMOTE_PAGE_LIMIT = 300;
const SEARCH_DEBOUNCE_MS = 260;

function blankRemoteResult(): RemoteUsageResult {
  return { entries: [], totalRows: 0, totalViews: 0, totalCopies: 0, partial: false };
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('vi');
}

function matchesQuery(entry: UsageEntry, query: string) {
  if (!query) return true;
  return normalizeSearch([entry.key, entry.label, entry.phanHe, entry.module, entry.kind].join(' ')).includes(query);
}

function resultFromEntries(entries: UsageEntry[]): RemoteUsageResult {
  const totals = entries.reduce(
    (sum, entry) => ({ views: sum.views + entry.views, copies: sum.copies + entry.copies }),
    { views: 0, copies: 0 },
  );
  return { entries, totalRows: entries.length, totalViews: totals.views, totalCopies: totals.copies, partial: false };
}

export function StatsModal({ records, onClose }: Props) {
  const localEntries = useUsage();
  const notify = useToast();
  const requirePin = usePinGate();
  const shared = remoteStatsEnabled();

  const [sortKey, setSortKey] = useState<SortKey>('copies');
  const [descending, setDescending] = useState(true);
  const [scope, setScope] = useState<Scope>(shared ? 'all' : 'mine');
  const [remoteResult, setRemoteResult] = useState<RemoteUsageResult>(() => getCachedRemoteUsage() || blankRemoteResult());
  const [loading, setLoading] = useState(false);
  const [remoteError, setRemoteError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const loadSeq = useRef(0);

  useModalScrollLock();

  const recordMeta = useMemo(() => {
    const map = new Map<string, { phanHe: string; module: string }>();
    for (const record of records) {
      map.set(record.key, { phanHe: record.kind === 'config' ? record.phanHe : '', module: record.module });
    }
    return map;
  }, [records]);

  const loadRemote = useCallback(async () => {
    if (!shared) return;
    const seq = loadSeq.current + 1;
    loadSeq.current = seq;
    setLoading(true);
    setRemoteError('');
    try {
      const result = await fetchRemoteUsage({
        query: searchQuery,
        sortKey,
        descending,
        limit: REMOTE_PAGE_LIMIT,
      });
      if (seq === loadSeq.current) setRemoteResult(result);
    } catch (error) {
      if (seq === loadSeq.current) setRemoteError(error instanceof Error ? error.message : 'Không đọc được số liệu dùng chung.');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [descending, searchQuery, shared, sortKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (scope === 'all') void loadRemote();
  }, [loadRemote, scope]);

  const rawEntries = scope === 'all' && shared ? remoteResult.entries : localEntries;
  const entries = useMemo(
    () => rawEntries.map((entry) => {
      const meta = recordMeta.get(entry.key);
      return { ...entry, phanHe: entry.phanHe || meta?.phanHe || '', module: entry.module || meta?.module || '' };
    }),
    [rawEntries, recordMeta],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const filteredEntries = useMemo(() => {
    const query = normalizeSearch(searchQuery);
    return entries.filter((entry) => matchesQuery(entry, query));
  }, [entries, searchQuery]);

  const localTotals = useMemo(() => filteredEntries.reduce(
    (sum, entry) => ({ views: sum.views + entry.views, copies: sum.copies + entry.copies }),
    { views: 0, copies: 0 },
  ), [filteredEntries]);

  const isRemoteScope = scope === 'all' && shared;
  const totals = isRemoteScope
    ? { views: remoteResult.totalViews, copies: remoteResult.totalCopies }
    : localTotals;
  const summaryCount = isRemoteScope ? remoteResult.totalRows : filteredEntries.length;

  const sorted = useMemo(() => {
    const direction = descending ? -1 : 1;
    return [...filteredEntries].sort((a, b) => {
      if (sortKey === 'label' || sortKey === 'phanHe' || sortKey === 'module') {
        return compareText(a[sortKey], b[sortKey]) * direction || b.copies - a.copies;
      }
      return ((a[sortKey] as number) - (b[sortKey] as number)) * direction || b.copies - a.copies;
    });
  }, [descending, filteredEntries, sortKey]);

  const changeSort = (key: SortKey) => {
    if (key === sortKey) setDescending((value) => !value);
    else { setSortKey(key); setDescending(key !== 'label' && key !== 'phanHe' && key !== 'module'); }
  };

  const exportCsv = async () => {
    const allowed = await requirePin('Xuất file thống kê', 'Thao tác này cần mã PIN quản trị.');
    if (!allowed) return;
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = ['Loại', 'Mã Config / Vấn đề', 'Phân hệ', 'Module', 'Lượt xem', 'Lượt chép', 'Gần nhất'];
    const rows = sorted.map((entry) => [
      entry.kind === 'config' ? 'CONFIG' : 'LƯU Ý', entry.label, entry.phanHe || '', entry.module || '',
      String(entry.views), String(entry.copies), formatTime(entry.lastAt),
    ]);
    const content = `\uFEFF${[header, ...rows].map((row) => row.map(escape).join(',')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `ASC-THONGKE-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify({ kind: 'success', title: 'Đã xuất file thống kê' });
  };

  const deleteOne = async (entry: UsageEntry) => {
    const allowed = await requirePin(
      `Xóa thống kê: ${entry.label}`,
      'Xóa riêng bản ghi này khỏi thống kê. Thao tác cần mã PIN quản trị.',
    );
    if (!allowed) return;

    if (scope === 'all' && shared) {
      try {
        const next = await deleteRemoteUsage(entry.key);
        setRemoteResult(resultFromEntries(next));
        notify({ kind: 'info', title: 'Đã xóa bản ghi khỏi thống kê toàn hệ thống', detail: entry.label });
      } catch (error) {
        notify({
          kind: 'error',
          title: 'Không xóa được bản ghi thống kê',
          detail: error instanceof Error ? error.message : undefined,
        });
      }
      return;
    }

    deleteUsage(entry.key);
    notify({ kind: 'info', title: 'Đã xóa bản ghi khỏi thống kê trên máy này', detail: entry.label });
  };

  const clearAll = async () => {
    const target = scope === 'all' && shared ? 'toàn hệ thống' : 'trên máy này';
    const allowed = await requirePin(`Xóa số liệu thống kê ${target}`, 'Thao tác không thể hoàn tác, cần mã PIN quản trị.');
    if (!allowed) return;
    if (scope === 'all' && shared) {
      try {
        await resetRemoteUsage(); setRemoteResult(blankRemoteResult());
        notify({ kind: 'info', title: 'Đã xóa số liệu dùng chung của toàn hệ thống' });
      } catch (error) {
        notify({ kind: 'error', title: 'Không xóa được số liệu dùng chung', detail: error instanceof Error ? error.message : undefined });
      }
      return;
    }
    resetUsage();
    notify({ kind: 'info', title: 'Đã xóa số liệu thống kê trên máy này' });
  };

  const showRemoteLoading = loading && isRemoteScope && remoteResult.entries.length === 0;
  const shownCount = sorted.length;
  const countLabel = isRemoteScope && summaryCount > shownCount ? `${shownCount}/${summaryCount}` : String(summaryCount);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="detail-modal stats-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header>
          <div className="detail-title">
            <h2>Thống kê sử dụng</h2>
            <p className="detail-sub">{countLabel} bản ghi đã tra cứu · {totals.views} lượt xem · {totals.copies} lượt chép</p>
            {shared ? (
              <div className="scope-switch" role="group" aria-label="Phạm vi thống kê">
                <button type="button" className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>Toàn hệ thống</button>
                <button type="button" className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>Của tôi</button>
              </div>
            ) : null}
          </div>
          <div className="detail-actions">
            <button type="button" className="copy-button" onClick={() => void exportCsv()} disabled={!sorted.length || showRemoteLoading}><Download size={14} />Xuất CSV</button>
            <button type="button" className="copy-button danger" onClick={() => void clearAll()} disabled={!summaryCount || showRemoteLoading}><RotateCcw size={14} />Xóa</button>
            <button className="close-button" onClick={onClose} aria-label="Đóng thống kê"><X size={19} /></button>
          </div>
        </header>

        <div className="stats-toolbar">
          <label className="stats-search">
            <Search size={16} />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Tìm mã config, phân hệ, module..."
            />
            {searchInput && (
              <button type="button" onClick={() => setSearchInput('')} aria-label="Xóa tìm kiếm">
                <X size={15} />
              </button>
            )}
          </label>
          {isRemoteScope && (
            <button type="button" className="copy-button" onClick={() => void loadRemote()} disabled={loading}>
              {loading ? <Loader2 size={14} className="spin" /> : null}
              {loading ? 'Đang tải' : 'Tải lại'}
            </button>
          )}
        </div>

        {remoteError && scope === 'all' && !showRemoteLoading && (
          <div className="stats-error" role="alert"><AlertTriangle size={16} /><span>{remoteError}</span><button type="button" className="copy-button" onClick={() => void loadRemote()}>Thử lại</button></div>
        )}

        {showRemoteLoading ? (
          <div className="stats-loading" role="status" aria-live="polite"><Loader2 className="spin" size={34} /><h3>Đang tải thống kê</h3><p>Đang lấy số liệu dùng chung từ hệ thống…</p></div>
        ) : sorted.length === 0 ? (
          <div className="empty-state stats-empty"><Eye size={28} /><h3>Chưa có số liệu</h3><p>Mở chi tiết một bản ghi hoặc bấm vào Mã Config để sao chép, số liệu sẽ được ghi nhận tại đây.</p></div>
        ) : (
          <div className="grid-wrap stats-wrap">
            <table className="data-grid stats-grid">
              <thead><tr><th className="stat-rank">#</th>{COLUMNS.map((column) => (
                <th key={column.key} className={`${column.className} sortable${sortKey === column.key ? ' active' : ''}`} onClick={() => changeSort(column.key)}>
                  <span>{column.label}{sortKey === column.key && (descending ? <ArrowDown size={13} /> : <ArrowUp size={13} />)}</span>
                </th>
              ))}<th className="stat-action" aria-label="Thao tác" /></tr></thead>
              <tbody>{sorted.map((entry, index) => (
                <tr
                  key={entry.key}
                  style={toneVars(toneFor(entry.kind === 'config' ? 'phanHe' : 'module', entry.kind === 'config' ? entry.phanHe || '' : entry.module || ''))}
                >
                  <td className="stat-rank">{index + 1}</td>
                  <td className="stat-label"><div className="stat-label-inner"><span className={`tag-loai ${entry.kind}`}>{entry.kind === 'config' ? 'CONFIG' : 'LƯU Ý'}</span><span className={entry.kind === 'config' ? 'stat-code' : 'stat-title'} title={entry.label}>{entry.label}</span></div></td>
                  <td className="stat-phanhe">{entry.phanHe ? <span className="chip-tone stat-phanhe-chip" style={toneVars(toneFor('phanHe', entry.phanHe))}>{entry.phanHe}</span> : <span className="stat-empty">—</span>}</td>
                  <td className="stat-module" title={entry.module || ''}>{entry.module || <span className="stat-empty">—</span>}</td>
                  <td className="stat-num"><Eye size={13} /> {entry.views}</td>
                  <td className="stat-num accent"><Copy size={13} /> {entry.copies}</td>
                  <td className="stat-time">{formatTime(entry.lastAt)}</td>
                  <td className="stat-action">
                    <button
                      type="button"
                      className="stat-delete-button"
                      aria-label={`Xóa thống kê ${entry.label}`}
                      title="Xóa bản ghi thống kê"
                      onClick={() => void deleteOne(entry)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        <footer className="stats-foot">{shared ? scope === 'all' ? `Số liệu tổng hợp từ mọi người dùng, tải theo trang ${REMOTE_PAGE_LIMIT} dòng để mở nhanh và tìm kiếm nhẹ hơn.` : 'Số liệu riêng của máy này, lưu ở trình duyệt.' : 'Số liệu lưu trên trình duyệt của máy này. Khai báo STATS_ENDPOINT trong src/config.ts để dùng chung cho cả đội.'}</footer>
      </section>
    </div>
  );
}
