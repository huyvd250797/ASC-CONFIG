import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Copy, Download, Eye, Loader2, RotateCcw, X } from 'lucide-react';
import { resetUsage, useUsage, type UsageEntry } from '../lib/stats';
import { fetchRemoteUsage, remoteStatsEnabled, resetRemoteUsage } from '../lib/remoteStats';
import { useToast } from '../lib/toast';
import { usePinGate } from '../lib/pin';

type SortKey = 'copies' | 'views' | 'lastAt' | 'label';

const COLUMNS: Array<{ key: SortKey; label: string; className: string }> = [
  { key: 'label', label: 'Mã Config / Vấn đề', className: 'stat-label' },
  { key: 'views', label: 'Lượt xem', className: 'stat-num' },
  { key: 'copies', label: 'Lượt chép', className: 'stat-num' },
  { key: 'lastAt', label: 'Gần nhất', className: 'stat-time' },
];

function formatTime(value: number) {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

type Scope = 'all' | 'mine';

export function StatsModal({ onClose }: { onClose: () => void }) {
  const localEntries = useUsage();
  const notify = useToast();
  const requirePin = usePinGate();
  const shared = remoteStatsEnabled();

  const [sortKey, setSortKey] = useState<SortKey>('copies');
  const [descending, setDescending] = useState(true);
  const [scope, setScope] = useState<Scope>(shared ? 'all' : 'mine');
  const [remoteEntries, setRemoteEntries] = useState<UsageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [remoteError, setRemoteError] = useState('');

  const loadRemote = useCallback(async () => {
    if (!shared) return;
    setLoading(true);
    setRemoteError('');
    try {
      setRemoteEntries(await fetchRemoteUsage());
    } catch (error) {
      setRemoteError(error instanceof Error ? error.message : 'Không đọc được số liệu dùng chung.');
    } finally {
      setLoading(false);
    }
  }, [shared]);

  useEffect(() => {
    void loadRemote();
  }, [loadRemote]);

  const entries = scope === 'all' && shared ? remoteEntries : localEntries;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Khi popup mở thì khoá cuộn của nền, chỉ cuộn được bên trong popup.
  useEffect(() => {
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, []);

  const totals = useMemo(
    () =>
      entries.reduce(
        (sum, entry) => ({ views: sum.views + entry.views, copies: sum.copies + entry.copies }),
        { views: 0, copies: 0 },
      ),
    [entries],
  );

  const sorted = useMemo(() => {
    const direction = descending ? -1 : 1;
    return [...entries].sort((a, b) => {
      if (sortKey === 'label') return a.label.localeCompare(b.label, 'vi') * direction;
      return ((a[sortKey] as number) - (b[sortKey] as number)) * direction || b.copies - a.copies;
    });
  }, [entries, sortKey, descending]);

  const changeSort = (key: SortKey) => {
    if (key === sortKey) setDescending((value) => !value);
    else {
      setSortKey(key);
      setDescending(key !== 'label');
    }
  };

  const exportCsv = async () => {
    const allowed = await requirePin('Xuất file thống kê', 'Thao tác này cần mã PIN quản trị.');
    if (!allowed) return;

    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = ['Loại', 'Mã Config / Vấn đề', 'Lượt xem', 'Lượt chép', 'Gần nhất'];
    const rows = sorted.map((entry: UsageEntry) => [
      entry.kind === 'config' ? 'CONFIG' : 'LƯU Ý',
      entry.label,
      String(entry.views),
      String(entry.copies),
      formatTime(entry.lastAt),
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

  const clearAll = async () => {
    const target = scope === 'all' && shared ? 'toàn hệ thống' : 'trên máy này';
    const allowed = await requirePin(
      `Xóa số liệu thống kê ${target}`,
      'Thao tác không thể hoàn tác, cần mã PIN quản trị.',
    );
    if (!allowed) return;

    if (scope === 'all' && shared) {
      try {
        await resetRemoteUsage();
        setRemoteEntries([]);
        notify({ kind: 'info', title: 'Đã xóa số liệu dùng chung của toàn hệ thống' });
      } catch (error) {
        notify({
          kind: 'error',
          title: 'Không xóa được số liệu dùng chung',
          detail: error instanceof Error ? error.message : undefined,
        });
      }
      return;
    }

    resetUsage();
    notify({ kind: 'info', title: 'Đã xóa số liệu thống kê trên máy này' });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="detail-modal stats-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header>
          <div className="detail-title">
            <h2>Thống kê sử dụng</h2>
            <p className="detail-sub">
              {entries.length} bản ghi đã tra cứu · {totals.views} lượt xem · {totals.copies} lượt chép
              {loading && scope === 'all' && (
                <>
                  {' · '}
                  <Loader2 size={12} className="spin" /> đang tải
                </>
              )}
            </p>

            {shared ? (
              <div className="scope-switch" role="group" aria-label="Phạm vi thống kê">
                <button
                  type="button"
                  className={scope === 'all' ? 'active' : ''}
                  onClick={() => setScope('all')}
                >
                  Toàn hệ thống
                </button>
                <button
                  type="button"
                  className={scope === 'mine' ? 'active' : ''}
                  onClick={() => setScope('mine')}
                >
                  Của tôi
                </button>
              </div>
            ) : null}
          </div>
          <div className="detail-actions">
            <button type="button" className="copy-button" onClick={() => void exportCsv()} disabled={!entries.length}>
              <Download size={14} />
              Xuất CSV
            </button>
            <button type="button" className="copy-button danger" onClick={() => void clearAll()} disabled={!entries.length}>
              <RotateCcw size={14} />
              Xóa
            </button>
            <button className="close-button" onClick={onClose} aria-label="Đóng thống kê">
              <X size={19} />
            </button>
          </div>
        </header>

        {remoteError && scope === 'all' && (
          <div className="stats-error" role="alert">
            <AlertTriangle size={16} />
            <span>{remoteError}</span>
            <button type="button" className="copy-button" onClick={() => void loadRemote()}>
              Thử lại
            </button>
          </div>
        )}

        {entries.length === 0 ? (
          <div className="empty-state">
            <Eye size={28} />
            <h3>Chưa có số liệu</h3>
            <p>Mở chi tiết một bản ghi hoặc bấm vào Mã Config để sao chép, số liệu sẽ được ghi nhận tại đây.</p>
          </div>
        ) : (
          <div className="grid-wrap stats-wrap">
            <table className="data-grid stats-grid">
              <thead>
                <tr>
                  <th className="stat-rank">#</th>
                  {COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      className={`${column.className} sortable${sortKey === column.key ? ' active' : ''}`}
                      onClick={() => changeSort(column.key)}
                    >
                      <span>
                        {column.label}
                        {sortKey === column.key && (descending ? <ArrowDown size={13} /> : <ArrowUp size={13} />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry, index) => (
                  <tr key={entry.key}>
                    <td className="stat-rank">{index + 1}</td>
                    <td className="stat-label">
                      {/* Badge và nhãn là hai cột riêng: mã config dài sẽ tự xuống dòng
                          trong cột của nó thay vì bị đẩy xuống dưới badge. */}
                      <div className="stat-label-inner">
                        <span className={`tag-loai ${entry.kind}`}>{entry.kind === 'config' ? 'CONFIG' : 'LƯU Ý'}</span>
                        <span className={entry.kind === 'config' ? 'stat-code' : 'stat-title'} title={entry.label}>
                          {entry.label}
                        </span>
                      </div>
                    </td>
                    <td className="stat-num">
                      <Eye size={13} /> {entry.views}
                    </td>
                    <td className="stat-num accent">
                      <Copy size={13} /> {entry.copies}
                    </td>
                    <td className="stat-time">{formatTime(entry.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="stats-foot">
          {shared
            ? scope === 'all'
              ? 'Số liệu tổng hợp từ mọi người dùng, lưu ở sheet ThongKe qua Apps Script.'
              : 'Số liệu riêng của máy này, lưu ở trình duyệt.'
            : 'Số liệu lưu trên trình duyệt của máy này. Khai báo STATS_ENDPOINT trong src/config.ts để dùng chung cho cả đội.'}
        </footer>
      </section>
    </div>
  );
}
